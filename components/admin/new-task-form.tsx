"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";

import { createTask } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ErrorLine, OkLine } from "@/components/terminal/shell";
import { TASK_CATEGORIES, CATEGORY_LABEL, type Profile } from "@/lib/types";

interface NewTaskFormProps {
  profiles: Pick<Profile, "id" | "role" | "display_name">[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * 管理员手动建任务。
 * 需求明确不做日历同步，所以任务就在这里手动创建；
 * 成员端不能自己造任务（tasks 的 insert policy 只允许 admin）。
 */
export function NewTaskForm({ profiles, open, onOpenChange }: NewTaskFormProps) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);

  const members = profiles.filter((profile) => profile.role === "member");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const form = event.currentTarget;
    setPending(true);
    setError(null);
    setOk(null);

    const result = await createTask(new FormData(form));

    setPending(false);
    if (!result.ok) {
      setError(result.error ?? "创建失败");
      return;
    }

    setOk("任务已创建，成员端刷新就能看到。");
    form.reset();
    router.refresh();
  }

  if (!open) return null;

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className="flex flex-col gap-3 border border-border bg-background/50 p-3"
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-primary">
        <span className="text-term-dim" aria-hidden>
          $&nbsp;
        </span>
        task create
      </p>

      {error ? <ErrorLine>{error}</ErrorLine> : null}
      {ok ? <OkLine>{ok}</OkLine> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-task-member">
            <span className="text-term-dim" aria-hidden>
              --member=&nbsp;
            </span>
            成员
          </Label>
          <Select id="new-task-member" name="member_id" required disabled={pending} defaultValue="">
            <option value="" disabled>
              {members.length === 0 ? "还没有 member 角色的用户" : "── 选择成员 ──"}
            </option>
            {members.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.display_name || profile.id.slice(0, 8)}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-task-category">
            <span className="text-term-dim" aria-hidden>
              --category=&nbsp;
            </span>
            分类
          </Label>
          <Select id="new-task-category" name="category" required disabled={pending}>
            {TASK_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category} · {CATEGORY_LABEL[category]}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="new-task-title">
            <span className="text-term-dim" aria-hidden>
              --title=&nbsp;
            </span>
            标题
          </Label>
          <Input
            id="new-task-title"
            name="title"
            required
            maxLength={120}
            disabled={pending}
            placeholder="例如：每天 30 分钟英语听力"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-task-due">
            <span className="text-term-dim" aria-hidden>
              --due=&nbsp;
            </span>
            截止日期（选填）
          </Label>
          <Input
            id="new-task-due"
            name="due_date"
            type="date"
            className="no-spin"
            disabled={pending}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending || members.length === 0}>
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          创建
        </Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>
          收起
        </Button>
      </div>
    </form>
  );
}
