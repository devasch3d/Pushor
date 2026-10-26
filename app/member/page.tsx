"use client";

import * as React from "react";

import type { SubmittableTask } from "@/components/member/screenshot-upload-form";
import { ScreenshotUploadForm } from "@/components/member/screenshot-upload-form";
import { MySubmissions } from "@/components/member/my-submissions";
import { BootScreen } from "@/components/terminal/boot-screen";
import { ErrorLine, Panel } from "@/components/terminal/shell";
import { TerminalShell } from "@/components/terminal/terminal-shell";
import { CategoryTag, TaskStatusBadge } from "@/components/terminal/status-badge";
import { fetchMySubmissions, fetchMyTasks } from "@/lib/queries";
import { getSupabase } from "@/lib/supabase/client";
import { useRequireRole } from "@/lib/hooks";
import { localDayString } from "@/lib/time";
import type { SignedSubmission, Task } from "@/lib/types";

export default function MemberPage() {
  const { profile, loading } = useRequireRole("member");

  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [submissions, setSubmissions] = React.useState<SignedSubmission[]>([]);
  const [dataError, setDataError] = React.useState<string | null>(null);
  const [fetching, setFetching] = React.useState(true);

  const load = React.useCallback(async () => {
    if (!profile) return;
    setFetching(true);
    setDataError(null);
    try {
      const supabase = getSupabase();
      const [taskRows, submissionRows] = await Promise.all([
        fetchMyTasks(supabase, profile.id),
        fetchMySubmissions(supabase, profile.id),
      ]);
      setTasks(taskRows as Task[]);
      setSubmissions(submissionRows);
    } catch (thrown) {
      setDataError(thrown instanceof Error ? thrown.message : "读取数据失败");
    } finally {
      setFetching(false);
    }
  }, [profile]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (loading || !profile) return <BootScreen text="member checkin --init…" />;

  // 只有进行中的任务能提交；已归档的在列表里展示但不能选
  const submittable: SubmittableTask[] = tasks
    .filter((task) => task.status === "active")
    .map((task) => ({
      id: task.id,
      title: task.title,
      category: task.category,
      due_date: task.due_date,
    }));

  const counts = submissions.reduce(
    (acc, item) => {
      acc[item.status] += 1;
      return acc;
    },
    { pending: 0, approved: 0, rejected: 0 } as Record<string, number>,
  );

  return (
    <TerminalShell
      profile={profile}
      command="member checkin --list --submit"
      bootNote={`session ready · role=${profile.role} · 今日 ${localDayString(new Date())}`}
    >
      {dataError ? <ErrorLine>{dataError}</ErrorLine> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <Panel
          title="任务列表"
          hint={fetching ? "读取中…" : `${submittable.length}/${tasks.length} 可提交`}
          className="order-2 lg:order-1"
        >
          <TaskList tasks={tasks} />
        </Panel>

        <Panel title="提交截图" hint="status → pending" className="order-1 lg:order-2">
          <ScreenshotUploadForm
            memberId={profile.id}
            tasks={submittable}
            onSuccess={() => void load()}
          />
        </Panel>
      </div>

      <Panel
        title="我的提交"
        hint={`pending ${counts.pending} · approved ${counts.approved} · rejected ${counts.rejected}`}
      >
        <MySubmissions
          memberId={profile.id}
          submissions={submissions}
          tasks={submittable}
          onChanged={() => void load()}
        />
      </Panel>
    </TerminalShell>
  );
}

function TaskList({ tasks }: { tasks: Task[] }) {
  if (tasks.length === 0) {
    return (
      <p className="px-1 py-6 text-center font-mono text-xs text-muted-foreground">
        <span className="text-term-dim"># </span>
        还没有分配给你的任务。任务由管理员创建，可以催一下。
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse font-mono text-xs">
        <thead>
          <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.16em] text-term-dim">
            <th className="px-2 py-1.5 font-normal">title</th>
            <th className="px-2 py-1.5 font-normal">category</th>
            <th className="px-2 py-1.5 font-normal">due</th>
            <th className="px-2 py-1.5 font-normal">status</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id} className="border-b border-border/60 last:border-b-0">
              <td className="max-w-[16rem] truncate px-2 py-2 text-foreground">{task.title}</td>
              <td className="px-2 py-2">
                <CategoryTag category={task.category} />
              </td>
              <td className="px-2 py-2 text-muted-foreground">{task.due_date ?? "--"}</td>
              <td className="px-2 py-2">
                <TaskStatusBadge status={task.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
