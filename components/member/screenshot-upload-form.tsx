"use client";

import * as React from "react";
import { Loader2, Upload } from "lucide-react";

import { submitScreenshot } from "@/app/member/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ErrorLine, OkLine } from "@/components/terminal/shell";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { uploadScreenshot } from "@/lib/storage";
import {
  CATEGORY_LABEL,
  IMAGE_ACCEPT,
  MAX_IMAGE_BYTES,
  validateImageFile,
  type TaskCategory,
} from "@/lib/types";

export interface SubmittableTask {
  id: string;
  title: string;
  category: TaskCategory;
  due_date: string | null;
}

interface ScreenshotUploadFormProps {
  memberId: string;
  tasks: SubmittableTask[];
  /** 重新提交时锁定任务，不让改成别的任务 */
  lockedTaskId?: string;
  /** 重新提交时指向被驳回的旧记录 */
  replacesId?: string;
  submitLabel?: string;
  onSuccess?: () => void;
}

type Phase = "idle" | "uploading" | "saving" | "done";

/**
 * 提交截图表单。
 * 流程：选文件 → 校验类型/大小 → 直传 Storage 的 <memberId>/ 目录 →
 *       调 server action 写 submissions（status 固定 pending）。
 */
export function ScreenshotUploadForm({
  memberId,
  tasks,
  lockedTaskId,
  replacesId,
  submitLabel,
  onSuccess,
}: ScreenshotUploadFormProps) {
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [note, setNote] = React.useState("");
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const busy = phase === "uploading" || phase === "saving";
  const lockedTask = tasks.find((task) => task.id === lockedTaskId);

  React.useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0] ?? null;
    setError(null);
    setOk(null);

    if (preview) URL.revokeObjectURL(preview);

    if (!picked) {
      setFile(null);
      setPreview(null);
      return;
    }

    const problem = validateImageFile(picked);
    if (problem) {
      setFile(null);
      setPreview(null);
      setError(problem);
      event.target.value = "";
      return;
    }

    setFile(picked);
    setPreview(URL.createObjectURL(picked));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setError(null);
    setOk(null);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const taskId = lockedTaskId ?? String(formData.get("task_id") ?? "");

    if (!taskId) {
      setError("请选择要提交的任务");
      return;
    }
    if (!file) {
      setError("请选择一张截图");
      return;
    }

    try {
      setPhase("uploading");
      const supabase = await getSupabaseBrowserClient();
      // 主路径直传私有 bucket；托管环境没有 Storage 时自动降级为内联存储（见 lib/storage.ts）
      const uploaded = await uploadScreenshot(supabase, memberId, file);

      setPhase("saving");
      const result = await submitScreenshot(
        buildPayload({ taskId, imagePath: uploaded.imageRef, note, replacesId }),
      );

      if (!result.ok) {
        setError(result.error ?? "提交失败");
        setPhase("idle");
        return;
      }

      setPhase("done");
      setOk(
        replacesId
          ? "已重新提交，状态回到待审。旧的驳回记录保留在下面，方便对照。"
          : "已提交，状态为待审，等管理员审核。",
      );
      setFile(null);
      setNote("");
      if (preview) URL.revokeObjectURL(preview);
      setPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      form.reset();
      onSuccess?.();
      setPhase("idle");
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "提交失败，请重试");
      setPhase("idle");
    }
  }

  const noTasks = tasks.length === 0;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      {error ? <ErrorLine>{error}</ErrorLine> : null}
      {ok ? <OkLine>{ok}</OkLine> : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="task_id">
          <span className="text-term-dim" aria-hidden>
            --task=&nbsp;
          </span>
          任务
        </Label>
        {lockedTaskId ? (
          <div className="term-input flex h-9 items-center gap-2 px-3 text-sm">
            <span className="text-primary">{lockedTask?.title ?? lockedTaskId.slice(0, 8)}</span>
            {lockedTask ? (
              <span className="text-[11px] text-muted-foreground">
                [{CATEGORY_LABEL[lockedTask.category]}]
              </span>
            ) : null}
            <span className="ml-auto text-[11px] text-term-dim">locked</span>
          </div>
        ) : (
          <Select id="task_id" name="task_id" required disabled={noTasks || busy} defaultValue="">
            <option value="" disabled>
              {noTasks ? "还没有可提交的任务，请联系管理员创建" : "── 选择任务 ──"}
            </option>
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                [{CATEGORY_LABEL[task.category]}] {task.title}
                {task.due_date ? ` · 截止 ${task.due_date}` : ""}
              </option>
            ))}
          </Select>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="screenshot">
          <Upload className="mr-1 inline h-3 w-3" aria-hidden />
          截图
        </Label>
        <Input
          id="screenshot"
          ref={fileInputRef}
          name="screenshot"
          type="file"
          accept={IMAGE_ACCEPT}
          required={!lockedTaskId ? true : undefined}
          disabled={busy}
          onChange={onFileChange}
        />
        <p className="font-mono text-[11px] text-term-dim">
          PNG / JPEG / WebP / GIF，单个文件不超过 {MAX_IMAGE_BYTES / 1024 / 1024} MB。
          上传到私有 bucket，只有你和管理员能看到。
        </p>
      </div>

      {preview ? (
        <div className="flex items-start gap-3 border border-border bg-background/60 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- 本地预览用 object URL，不走优化器 */}
          <img
            src={preview}
            alt="待提交截图预览"
            className="h-24 w-24 shrink-0 border border-border object-cover"
          />
          <div className="min-w-0 flex-1 font-mono text-[11px] text-muted-foreground">
            <p className="truncate text-foreground">{file?.name}</p>
            <p>
              size=
              {file ? `${(file.size / 1024).toFixed(0)} KB` : "--"} · type={file?.type || "--"}
            </p>
            <p className="text-term-dim">ref=&lt;member-uuid&gt;/&lt;random&gt;.* · private</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-1"
              disabled={busy}
              onClick={() => {
                if (preview) URL.revokeObjectURL(preview);
                setPreview(null);
                setFile(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            >
              撤销选择
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="note">
          <span className="text-term-dim" aria-hidden>
            --note=&nbsp;
          </span>
          备注（选填）
        </Label>
        <Textarea
          id="note"
          name="note"
          rows={2}
          maxLength={500}
          disabled={busy}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="给管理员看的一句话说明，例如：第 3 章练习题全做完，最后一题不会"
        />
      </div>

      <Button type="submit" disabled={busy || noTasks && !lockedTaskId}>
        {busy ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {phase === "uploading" ? "上传中…" : "写入中…"}
          </>
        ) : (
          <>
            <span aria-hidden>$ </span>
            {submitLabel ?? (replacesId ? "resubmit" : "submit")}
          </>
        )}
      </Button>
    </form>
  );
}

function buildPayload(input: {
  taskId: string;
  imagePath: string;
  note: string;
  replacesId?: string;
}): FormData {
  const formData = new FormData();
  formData.set("task_id", input.taskId);
  formData.set("image_path", input.imagePath);
  formData.set("note", input.note);
  if (input.replacesId) formData.set("replaces_id", input.replacesId);
  return formData;
}
