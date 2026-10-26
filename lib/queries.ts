import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";
import {
  STORAGE_BUCKET,
  type SignedSubmission,
  type SubmissionWithRelations,
} from "@/lib/types";
import { isInlineImageRef } from "@/lib/storage";
import { todayRange } from "@/lib/time";

type Client = SupabaseClient<Database>;

/** 联表查询用的 select 片段：把提交人名字和清理记录一次取回来 */
const SUBMISSION_SELECT = `
  id, task_id, member_id, event, image_url, note, status, admin_note,
  reviewed_at, replaces_id, created_at,
  member:profiles ( display_name ),
  purge:purge_log ( purged_at )
`;

/** 签名 URL 的有效期：10 分钟。够看完图并做审核决定，又不会长期外泄 */
const SIGNED_URL_TTL_SECONDS = 60 * 10;

type RawSubmission = SubmissionWithRelations & {
  task: unknown;
  member: unknown;
};

/**
 * 批量把 Storage object path 换成临时签名 URL。
 *
 * screenshots bucket 是私有的，image_url 里存的是对象路径而不是公开链接，
 * 所以每次渲染都要换一次。createSignedUrls 一次请求搞定一整页，避免 N+1。
 *
 * 两种例外：
 *   - image_url 本身就是 `data:` 内联图片（Storage 不可用环境下的降级存储）：原样返回
 *   - 签名调用整体失败（例如该环境没有 Storage）：补 null，前端渲染成占位块，
 *     不要让一个存储问题把整个列表页打挂
 */
export async function withSignedUrls(
  supabase: Client,
  rows: RawSubmission[],
): Promise<SignedSubmission[]> {
  const urlByRef = new Map<string, string | null>();
  const storagePaths = new Set<string>();

  for (const row of rows) {
    // 已被定时清理删掉的文件：不签名，直接给 null，前端显示占位块
    if (row.purge) {
      urlByRef.set(row.image_url, null);
      continue;
    }
    if (isInlineImageRef(row.image_url)) {
      urlByRef.set(row.image_url, row.image_url);
    } else {
      storagePaths.add(row.image_url);
    }
  }

  const paths = Array.from(storagePaths);
  if (paths.length > 0) {
    try {
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

      if (error) {
        console.warn(`[storage] 生成签名 URL 失败：${error.message}`);
      } else {
        // createSignedUrls 的返回顺序与入参一致，用下标对齐回 path
        (data ?? []).forEach((entry, index) => {
          urlByRef.set(paths[index], entry.signedUrl ?? null);
        });
      }
    } catch (thrown) {
      console.warn(
        `[storage] 生成签名 URL 异常：${thrown instanceof Error ? thrown.message : String(thrown)}`,
      );
    }

    for (const path of paths) {
      if (!urlByRef.has(path)) urlByRef.set(path, null);
    }
  }

  return rows.map((row) => ({
    ...row,
    member: (row.member ?? null) as SignedSubmission["member"],
    signed_url: urlByRef.get(row.image_url) ?? null,
  }));
}

/** admin：待审队列，按提交时间升序（先到先得） */
export async function fetchPendingQueue(supabase: Client): Promise<SignedSubmission[]> {
  const { data, error } = await supabase
    .from("submissions")
    .select(SUBMISSION_SELECT)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) throw new Error(`读取待审队列失败：${error.message}`);
  return withSignedUrls(supabase, (data ?? []) as unknown as RawSubmission[]);
}

/** admin：今日已审，按审核时间倒序 */
export async function fetchTodayReviewed(supabase: Client): Promise<SignedSubmission[]> {
  const { start, end } = todayRange();
  const { data, error } = await supabase
    .from("submissions")
    .select(SUBMISSION_SELECT)
    .in("status", ["approved", "rejected"])
    .gte("reviewed_at", start.toISOString())
    .lt("reviewed_at", end.toISOString())
    .order("reviewed_at", { ascending: false });

  if (error) throw new Error(`读取今日已审失败：${error.message}`);
  return withSignedUrls(supabase, (data ?? []) as unknown as RawSubmission[]);
}

/** member：我的提交记录，最新在前 */
export async function fetchMySubmissions(
  supabase: Client,
  memberId: string,
): Promise<SignedSubmission[]> {
  const { data, error } = await supabase
    .from("submissions")
    .select(SUBMISSION_SELECT)
    .eq("member_id", memberId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`读取我的提交失败：${error.message}`);
  return withSignedUrls(supabase, (data ?? []) as unknown as RawSubmission[]);
}

/** admin：成员列表（保留：管理端展示提交人名字靠 submissions 联表，这里暂不使用） */
export async function fetchAllProfiles(supabase: Client) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, display_name, created_at")
    .order("created_at", { ascending: true });

  if (error) throw new Error(`读取成员列表失败：${error.message}`);
  return data ?? [];
}
