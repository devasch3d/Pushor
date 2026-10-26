"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requireMember } from "@/lib/session";
import { isInlineImageRef, validateInlineImageRef } from "@/lib/storage";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * 成员提交打卡截图。
 *
 * 分工：图片文件由浏览器直接上传到 Supabase Storage（走 Storage 的 RLS），
 * 这个 action 只负责写 submissions 那一行（走 submissions 的 RLS）。
 * 这样既能避开 Server Action 的请求体大小限制，
 * 又保证两条写操作都在数据库/存储的策略下执行，而不是靠前端自觉。
 *
 * status 一律写死 'pending'。成员无法在这里、也无法直接调 Supabase API
 * 把自己的提交改成 approved —— RLS 的 with check 会在数据库层拒绝。
 */
export async function submitScreenshot(formData: FormData): Promise<ActionResult> {
  const { supabase, profile } = await requireMember();

  const taskId = String(formData.get("task_id") ?? "").trim();
  const imageRef = String(formData.get("image_path") ?? "").trim();
  const noteRaw = String(formData.get("note") ?? "").trim();
  const replacesId = String(formData.get("replaces_id") ?? "").trim();

  if (!taskId) return { ok: false, error: "请选择要提交的任务" };
  if (!imageRef) return { ok: false, error: "请先上传截图" };

  // image_url 有两种合法形态：
  //   - Storage object path，第一段必须是自己的 uuid（和上传策略同口径）
  //   - data: 内联图片，仅在 Storage 不可用的环境下才会出现（见 lib/storage.ts）
  if (isInlineImageRef(imageRef)) {
    const problem = validateInlineImageRef(imageRef);
    if (problem) return { ok: false, error: problem };
  } else if (!imageRef.startsWith(`${profile.id}/`)) {
    return { ok: false, error: "截图路径不合法，请重新上传" };
  }

  const note = noteRaw ? noteRaw.slice(0, 500) : null;

  const { data: task } = await supabase
    .from("tasks")
    .select("id, status, member_id")
    .eq("id", taskId)
    .maybeSingle();

  if (!task) return { ok: false, error: "任务不存在，或不属于你" };
  if (task.status !== "active") return { ok: false, error: "任务已归档，不能再提交" };

  // 重新提交：replaces_id 必须指向自己被驳回的那条旧记录。
  // 旧记录保持 rejected 不动，形成 驳回 → 重交 的可追溯链条。
  if (replacesId) {
    const { data: previous } = await supabase
      .from("submissions")
      .select("id, status, task_id")
      .eq("id", replacesId)
      .maybeSingle();

    if (!previous) return { ok: false, error: "找不到要替换的那条提交记录" };
    if (previous.status !== "rejected") {
      return { ok: false, error: "只有被驳回的记录才能重新提交" };
    }
    if (previous.task_id !== taskId) {
      return { ok: false, error: "重新提交必须挂在同一个任务下" };
    }
  }

  const { error } = await supabase.from("submissions").insert({
    task_id: taskId,
    member_id: profile.id,
    image_url: imageRef,
    note,
    status: "pending",
    replaces_id: replacesId || null,
    admin_note: null,
    reviewed_at: null,
  });

  if (error) return { ok: false, error: `提交失败：${error.message}` };

  revalidatePath("/member");
  revalidatePath("/admin");
  return { ok: true };
}
