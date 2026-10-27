"use client";

import * as React from "react";
import { FolderOpen, Loader2, Upload, X } from "lucide-react";

import { submitScreenshot } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ErrorLine, OkLine } from "@/components/terminal/shell";
import { getSupabase } from "@/lib/supabase/client";
import { uploadScreenshots } from "@/lib/storage";
import {
  MAX_TOTAL_UPLOAD_BYTES,
  MAX_UPLOAD_FILES,
  validateUploadFiles,
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface ScreenshotUploadFormProps {
  memberId: string;
  /** 重新提交时指向被驳回的旧记录 */
  replacesId?: string;
  /** 重新提交时预填旧记录的事件 / 描述 */
  initialEvent?: string;
  initialNote?: string;
  submitLabel?: string;
  onSuccess?: () => void;
}

type Phase = "idle" | "uploading" | "saving" | "done";

function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function formatMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * 提交表单。
 * 事件由成员自己键入（必填）；附件与描述选填，附件最多 10 个文件、
 * 总大小 ≤ 50 MB、格式不限。
 * 流程：校验数量与总大小 → 逐个直传 Storage 的 <memberId>/ 目录 →
 *       写一条 submissions（image_urls 数组，status 固定 pending）。
 */
export function ScreenshotUploadForm({
  memberId,
  replacesId,
  initialEvent,
  initialNote,
  submitLabel,
  onSuccess,
}: ScreenshotUploadFormProps) {
  const [files, setFiles] = React.useState<File[]>([]);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const busy = phase === "uploading" || phase === "saving";
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const nearLimit = totalBytes > MAX_TOTAL_UPLOAD_BYTES * 0.9;

  function onFilesPicked(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    // 清掉 input 的值，这样同一个文件撤销后还能再选
    event.target.value = "";
    setError(null);
    setOk(null);
    if (picked.length === 0) return;

    setFiles((current) => {
      const seen = new Set(current.map(fileKey));
      const merged = [...current];
      for (const file of picked) {
        const key = fileKey(file);
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(file);
      }
      const problem = validateUploadFiles(merged);
      if (problem) {
        setError(problem);
        return current;
      }
      return merged;
    });
  }

  function removeFile(index: number) {
    setError(null);
    setFiles((current) => current.filter((_, i) => i !== index));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setError(null);
    setOk(null);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const eventText = String(formData.get("event") ?? "").trim();
    const note = String(formData.get("note") ?? "").trim();

    if (!eventText) {
      setError("请填写事件");
      return;
    }
    const problem = validateUploadFiles(files);
    if (problem) {
      setError(problem);
      return;
    }

    try {
      let imageRefs: string[] = [];
      if (files.length > 0) {
        setPhase("uploading");
        setProgress({ done: 0, total: files.length });
        const supabase = getSupabase();
        // 主路径直传私有 bucket；托管环境没有 Storage 时自动降级为内联存储（见 lib/storage.ts）
        const uploaded = await uploadScreenshots(supabase, memberId, files, (done, total) =>
          setProgress({ done, total }),
        );
        imageRefs = uploaded.map((item) => item.imageRef);
      }

      setPhase("saving");
      setProgress(null);
      const result = await submitScreenshot({
        event: eventText,
        imageRefs,
        note,
        replacesId,
      });

      if (!result.ok) {
        setError(result.error ?? "提交失败");
        setPhase("idle");
        return;
      }

      setPhase("done");
      setOk(
        replacesId
          ? "已重新提交，状态回到待审。旧的驳回记录保留在下面，方便对照。"
          : imageRefs.length > 0
            ? `已提交 ${imageRefs.length} 个附件，状态为待审，等管理员审核。`
            : "已提交，状态为待审，等管理员审核。",
      );
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      form.reset();
      onSuccess?.();
      setPhase("idle");
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "提交失败，请重试");
      setPhase("idle");
      setProgress(null);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      {error ? <ErrorLine>{error}</ErrorLine> : null}
      {ok ? <OkLine>{ok}</OkLine> : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="event">
          <span className="text-term-dim" aria-hidden>
            --event=&nbsp;
          </span>
          事件
        </Label>
        <Input
          id="event"
          name="event"
          required
          maxLength={120}
          disabled={busy}
          defaultValue={initialEvent ?? ""}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="attachment">
          <Upload className="mr-1 inline h-3 w-3" aria-hidden />
          附件
        </Label>

        {/* 原生 input 藏起来，用终端风格按钮触发，和登出按钮同一套视觉反馈 */}
        <input
          id="attachment"
          ref={fileInputRef}
          name="attachment"
          type="file"
          multiple
          disabled={busy}
          onChange={onFilesPicked}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={files.length === 0 ? "default" : "outline"}
            size="sm"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
            className="transition-all duration-150 hover:-translate-y-px active:translate-y-0 active:scale-[0.97]"
          >
            {busy && phase === "uploading" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <FolderOpen className="h-3 w-3" />
            )}
            {busy && phase === "uploading" && progress
              ? `上传中 ${progress.done}/${progress.total}`
              : files.length === 0
                ? "choose file"
                : "+ 继续添加"}
          </Button>
          <span
            className={cn(
              "font-mono text-[11px]",
              nearLimit ? "text-accent" : "text-term-dim",
            )}
          >
            {files.length}/{MAX_UPLOAD_FILES} 个 · {formatMb(totalBytes)}/
            {MAX_TOTAL_UPLOAD_BYTES / 1024 / 1024} MB
          </span>
        </div>

        <p className="font-mono text-[11px] text-term-dim">
          格式不限，可多选；总大小不超过 {MAX_TOTAL_UPLOAD_BYTES / 1024 / 1024} MB。
        </p>
      </div>

      {files.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border/60 border border-border bg-background/60">
          {files.map((file, index) => (
            <li key={fileKey(file)} className="flex items-center gap-2 px-2 py-1.5">
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">
                {file.name}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-term-dim">
                {file.size >= 1024 * 1024
                  ? formatMb(file.size)
                  : `${(file.size / 1024).toFixed(0)} KB`}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => removeFile(index)}
                aria-label={`移除 ${file.name}`}
                className="h-6 px-1.5 text-term-dim hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="note">
          <span className="text-term-dim" aria-hidden>
            --note=&nbsp;
          </span>
          描述
        </Label>
        <Textarea
          id="note"
          name="note"
          rows={2}
          maxLength={500}
          disabled={busy}
          defaultValue={initialNote ?? ""}
        />
      </div>

      <Button
        type="submit"
        disabled={busy}
        className="transition-all duration-150 active:scale-[0.98]"
      >
        {busy ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {phase === "uploading"
              ? progress
                ? `上传中 ${progress.done}/${progress.total}…`
                : "上传中…"
              : "写入中…"}
          </>
        ) : (
          submitLabel ?? (replacesId ? "resubmit" : "submit")
        )}
      </Button>
    </form>
  );
}
