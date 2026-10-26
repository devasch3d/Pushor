import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";
import { STORAGE_BUCKET, buildScreenshotPath } from "@/lib/types";

/**
 * 截图存储层。
 *
 * 主路径：上传到私有 bucket `screenshots` 的 `<member-uuid>/` 目录下，
 *         submissions.image_url 存对象路径，读取时换签名 URL。
 *
 * 降级路径：某些托管环境不给应用开放 Storage（bucket 建不出来、
 *         或者 storage schema 没有 USAGE 权限）。这时改成把图片以
 *         `data:image/...;base64,...` 的形式直接存进 image_url（它本来就是 text）。
 *         仅在这种环境下可用 —— 因为完整版 RLS 里有一条
 *         `(storage.foldername(image_url))[1] = auth.uid()::text`，
 *         data URL 会被它拒绝；而降级版的策略里没有这一条，所以刚好放行。
 *         两边是自洽的，不需要额外开关。
 */

/** 内联降级的大小上限。base64 会让体积涨约 1/3，所以卡得比 Storage 严 */
export const INLINE_FALLBACK_MAX_BYTES = 3 * 1024 * 1024;

export type StorageMode = "storage" | "inline";

export interface UploadedScreenshot {
  /** 直接写进 submissions.image_url 的值 */
  imageRef: string;
  mode: StorageMode;
}

export function isInlineImageRef(ref: string): boolean {
  return ref.startsWith("data:");
}

/** 校验一条内联 image ref 是不是有实际数据（格式不限） */
export function validateInlineImageRef(ref: string): string | null {
  if (!isInlineImageRef(ref)) return "不是内联图片";
  if (!ref.includes(",") || ref.split(",")[1]?.length === 0) {
    return "内联图片数据为空";
  }
  return null;
}

function looksLikeStorageUnavailable(error: {
  message?: string;
  status?: number;
} | null): boolean {
  if (!error) return false;
  const text = `${error.message ?? ""}`.toLowerCase();
  return (
    text.includes("bucket not found") ||
    text.includes("permission denied") ||
    text.includes("does not exist") ||
    text.includes("schema") ||
    text.includes("42501") ||
    text.includes("42p01") ||
    error.status === 400 ||
    error.status === 403 ||
    error.status === 404
  );
}

async function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("读取文件失败"));
    reader.readAsDataURL(file);
  });
}

/**
 * 上传一张截图，返回可以写进 submissions.image_url 的引用。
 * 在浏览器端调用（用的是当前登录成员的会话，因此 Storage 的 RLS 一样生效）。
 */
export async function uploadScreenshot(
  supabase: SupabaseClient<Database>,
  memberId: string,
  file: File,
): Promise<UploadedScreenshot> {
  const path = buildScreenshotPath(memberId, file);

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (!error) return { imageRef: path, mode: "storage" };

  if (!looksLikeStorageUnavailable(error)) {
    throw new Error(`上传截图失败：${error.message}`);
  }

  // Storage 在这个环境里用不了，降级为内联存储
  console.warn(
    `[storage] Supabase Storage 不可用（${error.message}），回退为内联图片存储`,
  );

  if (file.size > INLINE_FALLBACK_MAX_BYTES) {
    throw new Error(
      `当前环境的 Storage 不可用，只能用内联方式存图，` +
        `而这张图 ${(file.size / 1024 / 1024).toFixed(1)} MB 超过内联上限 ` +
        `${INLINE_FALLBACK_MAX_BYTES / 1024 / 1024} MB。换张小一点的图，或给项目接上 Storage。`,
    );
  }

  return { imageRef: await toDataUrl(file), mode: "inline" };
}

/**
 * 批量上传，逐个来（避免浏览器并发连接数把进度搞乱）。
 * onProgress 在每传完一个后回调，参数是已完成数。
 */
export async function uploadScreenshots(
  supabase: SupabaseClient<Database>,
  memberId: string,
  files: File[],
  onProgress?: (done: number, total: number) => void,
): Promise<UploadedScreenshot[]> {
  const results: UploadedScreenshot[] = [];
  for (let index = 0; index < files.length; index += 1) {
    results.push(await uploadScreenshot(supabase, memberId, files[index]));
    onProgress?.(index + 1, files.length);
  }
  return results;
}
