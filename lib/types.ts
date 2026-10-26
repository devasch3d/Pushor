/**
 * 领域类型与常量。
 *
 * 全项目统一使用 admin / member 两种角色命名。
 * 这里没有任何金额、账本、日结、余额、转账、支付相关的类型或字段。
 */

export const ROLES = ["admin", "member"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  admin: "管理员",
  member: "成员",
};

export const TASK_CATEGORIES = ["study", "review", "exercise"] as const;
export type TaskCategory = (typeof TASK_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<TaskCategory, string> = {
  study: "自学",
  review: "复习",
  exercise: "运动",
};

export const TASK_STATUSES = ["active", "archived"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  active: "进行中",
  archived: "已归档",
};

export const SUBMISSION_STATUSES = ["pending", "approved", "rejected"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const SUBMISSION_STATUS_LABEL: Record<SubmissionStatus, string> = {
  pending: "待审",
  approved: "通过",
  rejected: "驳回",
};

/** 审核动作：admin 只能把 pending 改成这两种结果之一 */
export const REVIEW_DECISIONS = ["approved", "rejected"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export interface Profile {
  id: string;
  role: Role;
  display_name: string | null;
  created_at: string;
}

export interface Task {
  id: string;
  member_id: string;
  title: string;
  category: TaskCategory;
  due_date: string | null;
  status: TaskStatus;
  created_at: string;
}

export interface Submission {
  id: string;
  task_id: string;
  member_id: string;
  /** Storage object path，形如 `<member-uuid>/<file-uuid>.png`；不是公开链接 */
  image_url: string;
  note: string | null;
  status: SubmissionStatus;
  admin_note: string | null;
  reviewed_at: string | null;
  /** 重新提交时指向被驳回的那条旧记录 */
  replaces_id: string | null;
  created_at: string;
}

/** submission 联表 task / profiles 之后的形状 */
export interface SubmissionWithRelations extends Submission {
  task: Pick<Task, "title" | "category" | "due_date"> | null;
  member: Pick<Profile, "display_name"> | null;
}

/** 再加上临时签名后的可显示 URL */
export interface SignedSubmission extends SubmissionWithRelations {
  signed_url: string | null;
}

/** 任务联表成员，admin 任务管理列表用 */
export interface TaskWithMember extends Task {
  member: Pick<Profile, "display_name"> | null;
}

// ── Storage 约定 ─────────────────────────────────────────────────────────────

export const STORAGE_BUCKET = "screenshots";

/** 上传大小上限，10 MB。与 bucket 策略保持同一口径 */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

export const IMAGE_ACCEPT = ALLOWED_IMAGE_TYPES.join(",");

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * 生成 Storage object path：`<member-uuid>/<随机>.<ext>`
 * 第一段必须是上传者自己的 uuid，这是 screenshots bucket 上传策略的硬性要求。
 */
export function buildScreenshotPath(memberId: string, file: File): string {
  const ext = EXT_BY_MIME[file.type] ?? "bin";
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${memberId}/${random}.${ext}`;
}

export function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    return `不支持的文件类型：${file.type || "未知"}，只接受 PNG / JPEG / WebP / GIF`;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return `文件过大：${(file.size / 1024 / 1024).toFixed(1)} MB，上限 ${MAX_IMAGE_BYTES / 1024 / 1024} MB`;
  }
  return null;
}
