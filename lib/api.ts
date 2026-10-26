"use client";

/**
 * 浏览器端的全部写操作。
 *
 * 这里做的都是「友好校验 + 给出人话错误」，真正的硬约束在数据库：
 *   - submissions 的 insert 策略把 status 钉死为 pending
 *   - submissions 的 update 策略只允许 admin、只允许 pending → approved/rejected、
 *     驳回必须带 admin_note
 *   - trigger 补齐列级限制（只有 status / admin_note 可变）并自动打 reviewed_at
 * 所以即便有人绕过这个文件直接调 Supabase API，也改不动不该改的东西。
 */

import { getSupabase } from "@/lib/supabase/client";
import { isInlineImageRef, validateInlineImageRef } from "@/lib/storage";
import { TASK_CATEGORIES, type ReviewDecision, type TaskCategory } from "@/lib/types";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function humanizeAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) return "邮箱或密码不对";
  if (lower.includes("email not confirmed")) return "邮箱还没确认，请先去邮箱点确认链接";
  if (lower.includes("user already registered")) return "这个邮箱已经注册过了，直接登录吧";
  if (lower.includes("password should be at least")) return "密码太短，至少要 6 位";
  if (lower.includes("valid email")) return "邮箱格式不对";
  if (lower.includes("rate limit") || lower.includes("too many requests"))
    return "请求太频繁了，稍等一分钟再试";
  return message;
}

async function ensureOwnProfile(userId: string, email: string | undefined) {
  const supabase = getSupabase();
  const { data } = await supabase.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (data) return;
  const display = (email ?? "").split("@")[0]?.slice(0, 40) || "member";
  await supabase.from("profiles").insert({ id: userId, role: "member", display_name: display });
}

/** 邮箱密码登录 */
export async function signIn(emailRaw: string, password: string): Promise<ActionResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!email || !password) return { ok: false, error: "邮箱和密码都要填" };

  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: humanizeAuthError(error.message) };
  if (!data.user) return { ok: false, error: "登录没成功，请重试" };

  await ensureOwnProfile(data.user.id, data.user.email ?? email);
  return { ok: true };
}

/** 登出 */
export async function signOutUser(): Promise<void> {
  await getSupabase().auth.signOut();
}

/**
 * 成员提交打卡截图。
 * imageRef 有两种合法形态：Storage 对象路径（主路径），
 * 或 data: 内联图片（仅在没有 Storage 的环境才会出现）。
 */
export async function submitScreenshot(input: {
  taskId: string;
  imageRef: string;
  note: string;
  replacesId?: string | null;
}): Promise<ActionResult> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "登录态失效了，请重新登录" };

  const { taskId, imageRef, replacesId } = input;
  if (!taskId) return { ok: false, error: "请选择要提交的任务" };
  if (!imageRef) return { ok: false, error: "请先上传截图" };

  if (isInlineImageRef(imageRef)) {
    const problem = validateInlineImageRef(imageRef);
    if (problem) return { ok: false, error: problem };
  } else if (!imageRef.startsWith(`${user.id}/`)) {
    return { ok: false, error: "截图路径不合法，请重新上传" };
  }

  const note = input.note.trim() ? input.note.trim().slice(0, 500) : null;

  const { data: task } = await supabase
    .from("tasks")
    .select("id, status")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return { ok: false, error: "任务不存在，或不属于你" };
  if (task.status !== "active") return { ok: false, error: "任务已归档，不能再提交" };

  if (replacesId) {
    const { data: previous } = await supabase
      .from("submissions")
      .select("id, status, task_id")
      .eq("id", replacesId)
      .maybeSingle();
    if (!previous) return { ok: false, error: "找不到要替换的那条提交记录" };
    if (previous.status !== "rejected") return { ok: false, error: "只有被驳回的记录才能重新提交" };
    if (previous.task_id !== taskId) return { ok: false, error: "重新提交必须挂在同一个任务下" };
  }

  const { error } = await supabase.from("submissions").insert({
    task_id: taskId,
    member_id: user.id,
    image_url: imageRef,
    note,
    status: "pending",
    replaces_id: replacesId || null,
    admin_note: null,
    reviewed_at: null,
  });

  if (error) return { ok: false, error: `提交失败：${error.message}` };
  return { ok: true };
}

/** 管理员审核：pending → approved / rejected */
export async function reviewSubmission(input: {
  submissionId: string;
  decision: ReviewDecision;
  adminNote?: string;
}): Promise<ActionResult> {
  const note = (input.adminNote ?? "").trim().slice(0, 1000);

  if (input.decision !== "approved" && input.decision !== "rejected") {
    return { ok: false, error: "审核结论只能是 approved 或 rejected" };
  }
  if (input.decision === "rejected" && !note) {
    return { ok: false, error: "驳回必须写原因，成员要靠这句话知道怎么改" };
  }

  const supabase = getSupabase();

  const { data: current } = await supabase
    .from("submissions")
    .select("id, status")
    .eq("id", input.submissionId)
    .maybeSingle();
  if (!current) return { ok: false, error: "找不到这条提交记录" };
  if (current.status !== "pending") {
    return { ok: false, error: `这条已经是 ${current.status} 了，刷新一下队列` };
  }

  // .eq("status","pending") 是并发保险：两个管理员同时审同一条时，
  // 后到的那次 update 命中 0 行，不会把已审结果覆盖掉。
  const { data: updated, error } = await supabase
    .from("submissions")
    .update({ status: input.decision, admin_note: note || null })
    .eq("id", input.submissionId)
    .eq("status", "pending")
    .select("id");

  if (error) return { ok: false, error: `审核失败：${error.message}` };
  if (!updated || updated.length === 0) {
    return { ok: false, error: "这条已经被审过了，刷新一下队列" };
  }
  return { ok: true };
}

/** 归档 / 取消归档任务 */
export async function setTaskStatus(
  taskId: string,
  status: "active" | "archived",
): Promise<ActionResult> {
  if (!taskId) return { ok: false, error: "缺少任务 id" };
  const { error } = await getSupabase().from("tasks").update({ status }).eq("id", taskId);
  if (error) return { ok: false, error: `更新任务失败：${error.message}` };
  return { ok: true };
}

/** 管理员手动建任务 */
export async function createTask(input: {
  memberId: string;
  title: string;
  category: string;
  dueDate: string;
}): Promise<ActionResult> {
  const title = input.title.trim().slice(0, 120);
  if (!input.memberId) return { ok: false, error: "请选择成员" };
  if (!title) return { ok: false, error: "任务标题不能为空" };
  if (!TASK_CATEGORIES.includes(input.category as TaskCategory)) {
    return { ok: false, error: "分类只能是 study / review / exercise" };
  }
  if (input.dueDate && Number.isNaN(Date.parse(input.dueDate))) {
    return { ok: false, error: "截止日期格式不对" };
  }

  const { error } = await getSupabase().from("tasks").insert({
    member_id: input.memberId,
    title,
    category: input.category as TaskCategory,
    due_date: input.dueDate || null,
    status: "active",
  });

  if (error) return { ok: false, error: `创建任务失败：${error.message}` };
  return { ok: true };
}
