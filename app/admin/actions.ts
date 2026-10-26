"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/session";
import { TASK_CATEGORIES, type ReviewDecision, type TaskCategory } from "@/lib/types";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * 审核一条截图：pending → approved / rejected。
 *
 * 这里做的是「友好校验」，真正的硬约束在数据库：
 *   - RLS submissions_admin_review：只有 admin、只有 status='pending' 的行可改，
 *     目标 status 只能是 approved/rejected，驳回时 admin_note 不能为空
 *   - trigger submissions_review_guard：只允许改 status 和 admin_note 两列，
 *     并自动把 reviewed_at 打成 now()
 * 所以即便有人绕过这个 action 直接调 Supabase API，也改不动别人的、已审的记录。
 */
export async function reviewSubmission(input: {
  submissionId: string;
  decision: ReviewDecision;
  adminNote?: string;
}): Promise<ActionResult> {
  const { supabase } = await requireAdmin();

  const note = (input.adminNote ?? "").trim().slice(0, 1000);

  if (input.decision !== "approved" && input.decision !== "rejected") {
    return { ok: false, error: "审核结论只能是 approved 或 rejected" };
  }
  if (input.decision === "rejected" && !note) {
    return { ok: false, error: "驳回必须写原因，成员要靠这句话知道怎么改" };
  }

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
    .update({
      status: input.decision,
      admin_note: note || null,
    })
    .eq("id", input.submissionId)
    .eq("status", "pending")
    .select("id, status, reviewed_at");

  if (error) return { ok: false, error: `审核失败：${error.message}` };
  if (!updated || updated.length === 0) {
    return { ok: false, error: "这条已经被审过了，刷新一下队列" };
  }

  revalidatePath("/admin");
  revalidatePath("/member");
  return { ok: true };
}

/** 归档任务：软下线，不删数据，成员端不再能对它提交 */
export async function archiveTask(taskId: string): Promise<ActionResult> {
  return setTaskStatus(taskId, "archived");
}

/** 取消归档。归档是软状态，误操作应该能在页面上撤回来，不用去数据库改 */
export async function restoreTask(taskId: string): Promise<ActionResult> {
  return setTaskStatus(taskId, "active");
}

async function setTaskStatus(
  taskId: string,
  status: "active" | "archived",
): Promise<ActionResult> {
  const { supabase } = await requireAdmin();
  if (!taskId) return { ok: false, error: "缺少任务 id" };

  const { error } = await supabase.from("tasks").update({ status }).eq("id", taskId);
  if (error) return { ok: false, error: `更新任务失败：${error.message}` };

  revalidatePath("/admin");
  revalidatePath("/member");
  return { ok: true };
}

/**
 * 新建任务。
 *
 * 需求里写了「不做日历同步，当前手动创建或选择 task」——这里就是那个「手动创建」。
 * 只有 admin 能建（tasks 表的 insert/update policy 都是 is_admin()），
 * 成员不能自己造任务给自己打卡。
 */
export async function createTask(formData: FormData): Promise<ActionResult> {
  const { supabase } = await requireAdmin();

  const memberId = String(formData.get("member_id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim().slice(0, 120);
  const category = String(formData.get("category") ?? "").trim();
  const dueDate = String(formData.get("due_date") ?? "").trim();

  if (!memberId) return { ok: false, error: "请选择成员" };
  if (!title) return { ok: false, error: "任务标题不能为空" };
  if (!TASK_CATEGORIES.includes(category as TaskCategory)) {
    return { ok: false, error: "分类只能是 study / review / exercise" };
  }
  if (dueDate && Number.isNaN(Date.parse(dueDate))) {
    return { ok: false, error: "截止日期格式不对" };
  }

  const { error } = await supabase.from("tasks").insert({
    member_id: memberId,
    title,
    category: category as TaskCategory,
    due_date: dueDate || null,
    status: "active",
  });

  if (error) return { ok: false, error: `创建任务失败：${error.message}` };

  revalidatePath("/admin");
  revalidatePath("/member");
  return { ok: true };
}
