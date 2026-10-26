"use client";

import * as React from "react";
import { Loader2, Upload } from "lucide-react";

import { submitScreenshot } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ErrorLine, OkLine } from "@/components/terminal/shell";
import { getSupabase } from "@/lib/supabase/client";
import { uploadScreenshot } from "@/lib/storage";
import { MAX_UPLOAD_BYTES, validateUploadFile } from "@/lib/types";

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

/**
 * 提交附件表单。
 * 事件 / 描述由成员自己键入；文件不限格式、单个 ≤ 10 MB。
 * 流程：校验大小 → 直传 Storage 的 <memberId>/ 目录 → 写 submissions（status 固定 pending）。
 */
export function ScreenshotUploadForm({
  memberId,
  replacesId,
  initialEvent,
  initialNote,
  submitLabel,
  onSuccess,
}: ScreenshotUploadFormProps) {
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const busy = phase === "uploading" || phase === "saving";

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

    const problem = validateUploadFile(picked);
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
    const eventText = String(formData.get("event") ?? "").trim();
    const note = String(formData.get("note") ?? "").trim();

    if (!eventText) {
      setError("请填写事件");
      return;
    }
    if (!file) {
      setError("请选择一个文件");
      return;
    }

    try {
      setPhase("uploading");
      const supabase = getSupabase();
      // 主路径直传私有 bucket；托管环境没有 Storage 时自动降级为内联存储（见 lib/storage.ts）
      const uploaded = await uploadScreenshot(supabase, memberId, file);

      setPhase("saving");
      const result = await submitScreenshot({
        event: eventText,
        imageRef: uploaded.imageRef,
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
          : "已提交，状态为待审，等管理员审核。",
      );
      setFile(null);
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
        <Input
          id="attachment"
          ref={fileInputRef}
          name="attachment"
          type="file"
          required
          disabled={busy}
          onChange={onFileChange}
        />
        <p className="font-mono text-[11px] text-term-dim">
          格式不限，单个文件不超过 {MAX_UPLOAD_BYTES / 1024 / 1024} MB。
        </p>
      </div>

      {file ? (
        <div className="flex items-center gap-2 border border-border bg-background/60 px-2 py-1.5">
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">
            {file.name}
          </span>
          <span className="shrink-0 font-mono text-[10px] text-term-dim">
            {(file.size / 1024).toFixed(0)} KB
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              if (preview) URL.revokeObjectURL(preview);
              setPreview(null);
              setFile(null);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
          >
            撤销
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="note">
          <span className="text-term-dim" aria-hidden>
            --note=&nbsp;
          </span>
          描述（选填）
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

      <Button type="submit" disabled={busy}>
        {busy ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {phase === "uploading" ? "上传中…" : "写入中…"}
          </>
        ) : (
          submitLabel ?? (replacesId ? "resubmit" : "submit")
        )}
      </Button>
    </form>
  );
}
