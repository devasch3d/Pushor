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

/**
 * 历史遗留：tasks 表仍在数据库里（老记录可能还指着它），
 * 但新版流程不再由管理员布置任务，成员自己填「事件」+「描述」。
 */
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
  /** 历史字段：新版提交为 null */
  task_id: string | null;
  member_id: string;
  /** 成员键入的「事件」，新版提交必填 */
  event: string | null;
  /** Storage object path，或 data: 内联图片；不是公开链接 */
  image_url: string;
  /** 成员键入的「描述」 */
  note: string | null;
  status: SubmissionStatus;
  admin_note: string | null;
  reviewed_at: string | null;
  /** 重新提交时指向被驳回的那条旧记录 */
  replaces_id: string | null;
  created_at: string;
}

/** submission 联表提交人 / 清理记录之后的形状 */
export interface SubmissionWithRelations extends Submission {
  member: Pick<Profile, "display_name"> | null;
  /** 非 null 表示附件文件已被定时清理删除 */
  purge: { purged_at: string } | null;
}

/** 再加上临时签名后的可显示 URL */
export interface SignedSubmission extends SubmissionWithRelations {
  signed_url: string | null;
}

// ── Storage 约定 ─────────────────────────────────────────────────────────────

export const STORAGE_BUCKET = "screenshots";

/** 上传大小上限，10 MB。格式不限 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** 能在页面上当图片预览的扩展名；其余按「附件」展示 */
export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "avif", "bmp", "svg"] as const;

export function refExtension(ref: string): string {
  // data: 内联图片从 mime 里取
  if (ref.startsWith("data:")) {
    const mime = ref.slice("data:".length).split(";")[0] ?? "";
    return mime.split("/")[1]?.split("+")[0]?.toLowerCase() ?? "";
  }
  const name = ref.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function isPreviewableImage(ref: string): boolean {
  return (IMAGE_EXTENSIONS as readonly string[]).includes(refExtension(ref));
}

/** 上传校验：只限大小，不限格式 */
export function validateUploadFile(file: File): string | null {
  if (file.size > MAX_UPLOAD_BYTES) {
    return `文件过大：${(file.size / 1024 / 1024).toFixed(1)} MB，上限 ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`;
  }
  if (file.size === 0) {
    return "文件是空的";
  }
  return null;
}

/**
 * 生成 Storage object path：`<member-uuid>/<随机>.<ext>`
 * 第一段必须是上传者自己的 uuid，这是 screenshots bucket 上传策略的硬性要求。
 */
export function buildScreenshotPath(memberId: string, file: File): string {
  const fromName = file.name.includes(".")
    ? (file.name.split(".").pop() ?? "").toLowerCase().slice(0, 12)
    : "";
  const ext = fromName || "bin";
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${memberId}/${random}.${ext}`;
}
