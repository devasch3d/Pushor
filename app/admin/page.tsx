import { PendingQueue } from "@/components/admin/pending-queue";
import { TaskManager } from "@/components/admin/task-manager";
import { TodayReviewed } from "@/components/admin/today-reviewed";
import { Panel } from "@/components/terminal/shell";
import { TerminalShell } from "@/components/terminal/terminal-shell";
import {
  fetchAllProfiles,
  fetchAllTasks,
  fetchPendingQueue,
  fetchTodayReviewed,
} from "@/lib/queries";
import { requireAdmin } from "@/lib/session";
import { APP_TIME_ZONE, todayRange } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { supabase, profile } = await requireAdmin();

  const [pending, todayReviewed, tasks, profiles] = await Promise.all([
    fetchPendingQueue(supabase),
    fetchTodayReviewed(supabase),
    fetchAllTasks(supabase),
    fetchAllProfiles(supabase),
  ]);

  const { day } = todayRange();
  const approvedToday = todayReviewed.filter((item) => item.status === "approved").length;
  const rejectedToday = todayReviewed.filter((item) => item.status === "rejected").length;

  return (
    <TerminalShell
      profile={profile}
      command="admin review --queue --today --tasks"
      bootNote={`review console · tz=${APP_TIME_ZONE} · day=${day} · 人工审核，不做任何金额计算`}
    >
      <Panel
        title="待审队列"
        hint={`pending=${pending.length} · 按提交时间升序，先到先得`}
      >
        <PendingQueue submissions={pending} />
      </Panel>

      <Panel
        title="今日已审"
        hint={`${day} · approved=${approvedToday} · rejected=${rejectedToday}`}
      >
        <TodayReviewed submissions={todayReviewed} day={day} />
      </Panel>

      <Panel title="任务管理" hint={`total=${tasks.length} · 归档是软下线，不删数据`}>
        <TaskManager tasks={tasks} profiles={profiles} />
      </Panel>
    </TerminalShell>
  );
}
