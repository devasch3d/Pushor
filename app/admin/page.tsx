"use client";

import * as React from "react";

import { PendingQueue } from "@/components/admin/pending-queue";
import { TaskManager } from "@/components/admin/task-manager";
import { TodayReviewed } from "@/components/admin/today-reviewed";
import { BootScreen } from "@/components/terminal/boot-screen";
import { ErrorLine, Panel } from "@/components/terminal/shell";
import { TerminalShell } from "@/components/terminal/terminal-shell";
import {
  fetchAllProfiles,
  fetchAllTasks,
  fetchPendingQueue,
  fetchTodayReviewed,
} from "@/lib/queries";
import { getSupabase } from "@/lib/supabase/client";
import { useRequireRole } from "@/lib/hooks";
import { APP_TIME_ZONE, todayRange } from "@/lib/time";
import type { Profile, SignedSubmission, TaskWithMember } from "@/lib/types";

export default function AdminPage() {
  const { profile, loading } = useRequireRole("admin");

  const [pending, setPending] = React.useState<SignedSubmission[]>([]);
  const [todayReviewed, setTodayReviewed] = React.useState<SignedSubmission[]>([]);
  const [tasks, setTasks] = React.useState<TaskWithMember[]>([]);
  const [profiles, setProfiles] = React.useState<Profile[]>([]);
  const [dataError, setDataError] = React.useState<string | null>(null);
  const [fetching, setFetching] = React.useState(true);

  const load = React.useCallback(async () => {
    if (!profile) return;
    setFetching(true);
    setDataError(null);
    try {
      const supabase = getSupabase();
      const [pendingRows, reviewedRows, taskRows, profileRows] = await Promise.all([
        fetchPendingQueue(supabase),
        fetchTodayReviewed(supabase),
        fetchAllTasks(supabase),
        fetchAllProfiles(supabase),
      ]);
      setPending(pendingRows);
      setTodayReviewed(reviewedRows);
      setTasks(taskRows);
      setProfiles(profileRows as Profile[]);
    } catch (thrown) {
      setDataError(thrown instanceof Error ? thrown.message : "读取数据失败");
    } finally {
      setFetching(false);
    }
  }, [profile]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (loading || !profile) return <BootScreen text="admin review --init…" />;

  const { day } = todayRange();
  const approvedToday = todayReviewed.filter((item) => item.status === "approved").length;
  const rejectedToday = todayReviewed.filter((item) => item.status === "rejected").length;

  return (
    <TerminalShell
      profile={profile}
      command="admin review --queue --today --tasks"
      bootNote={`review console · tz=${APP_TIME_ZONE} · day=${day} · 人工审核，不做任何自动汇总`}
    >
      {dataError ? <ErrorLine>{dataError}</ErrorLine> : null}

      <Panel
        title="待审队列"
        hint={fetching ? "读取中…" : `pending=${pending.length} · 按提交时间升序，先到先得`}
      >
        <PendingQueue submissions={pending} onReviewed={() => void load()} />
      </Panel>

      <Panel
        title="今日已审"
        hint={`${day} · approved=${approvedToday} · rejected=${rejectedToday}`}
      >
        <TodayReviewed submissions={todayReviewed} day={day} />
      </Panel>

      <Panel title="任务管理" hint={`total=${tasks.length} · 归档是软下线，不删数据`}>
        <TaskManager tasks={tasks} profiles={profiles} onChanged={() => void load()} />
      </Panel>
    </TerminalShell>
  );
}
