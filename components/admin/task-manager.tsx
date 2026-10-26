"use client";

import * as React from "react";
import { Archive, ArchiveRestore, Loader2, Plus } from "lucide-react";

import { setTaskStatus } from "@/lib/api";
import { NewTaskForm } from "@/components/admin/new-task-form";
import { Button } from "@/components/ui/button";
import { ErrorLine } from "@/components/terminal/shell";
import { CategoryTag, TaskStatusBadge } from "@/components/terminal/status-badge";
import type { Profile, TaskWithMember } from "@/lib/types";

interface TaskManagerProps {
  tasks: TaskWithMember[];
  profiles: Pick<Profile, "id" | "role" | "display_name">[];
  /** 数据变化后让外层重新拉取 */
  onChanged?: () => void;
}

/** 任务管理：列表 + 归档 / 取消归档 + 手动新建 */
export function TaskManager({ tasks, profiles, onChanged }: TaskManagerProps) {
  const [showForm, setShowForm] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function toggleArchive(task: TaskWithMember) {
    if (busyId) return;
    setBusyId(task.id);
    setError(null);

    const result = await setTaskStatus(
      task.id,
      task.status === "active" ? "archived" : "active",
    );

    setBusyId(null);
    if (!result.ok) {
      setError(result.error ?? "操作失败");
      return;
    }
    onChanged?.();
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <ErrorLine>{error}</ErrorLine> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={showForm ? "secondary" : "default"}
          onClick={() => setShowForm((value) => !value)}
        >
          <Plus className="h-3 w-3" />
          {showForm ? "收起表单" : "新建任务"}
        </Button>
        <span className="font-mono text-[11px] text-term-dim">
          active={tasks.filter((task) => task.status === "active").length} · archived=
          {tasks.filter((task) => task.status === "archived").length}
        </span>
      </div>

      <NewTaskForm
        profiles={profiles}
        open={showForm}
        onOpenChange={setShowForm}
        onChanged={onChanged}
      />

      {tasks.length === 0 ? (
        <p className="px-1 py-6 text-center font-mono text-xs text-muted-foreground">
          <span className="text-term-dim"># </span>
          还没有任务。点上面的「新建任务」给成员派一个。
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse font-mono text-xs">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.16em] text-term-dim">
                <th className="px-2 py-1.5 font-normal">title</th>
                <th className="px-2 py-1.5 font-normal">member</th>
                <th className="px-2 py-1.5 font-normal">category</th>
                <th className="px-2 py-1.5 font-normal">due</th>
                <th className="px-2 py-1.5 font-normal">status</th>
                <th className="px-2 py-1.5 text-right font-normal">action</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => {
                const busy = busyId === task.id;
                const archived = task.status === "archived";
                return (
                  <tr
                    key={task.id}
                    className="border-b border-border/60 last:border-b-0 hover:bg-secondary/30"
                  >
                    <td className="max-w-[18rem] truncate px-2 py-2 text-foreground">
                      {task.title}
                    </td>
                    <td className="px-2 py-2 text-muted-foreground">
                      {task.member?.display_name ?? task.member_id.slice(0, 8)}
                    </td>
                    <td className="px-2 py-2">
                      <CategoryTag category={task.category} />
                    </td>
                    <td className="px-2 py-2 text-muted-foreground">{task.due_date ?? "--"}</td>
                    <td className="px-2 py-2">
                      <TaskStatusBadge status={task.status} />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant={archived ? "outline" : "ghost"}
                        disabled={busy}
                        onClick={() => toggleArchive(task)}
                        title={archived ? "取消归档，恢复为进行中" : "归档，成员端不能再对它提交"}
                      >
                        {busy ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : archived ? (
                          <ArchiveRestore className="h-3 w-3" />
                        ) : (
                          <Archive className="h-3 w-3" />
                        )}
                        {archived ? "恢复" : "归档"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
