"use client";

import * as React from "react";
import { Check, Loader2, X } from "lucide-react";

import { reviewSubmission } from "@/lib/api";
import { AttachmentList } from "@/components/terminal/attachment";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ErrorLine, OkLine } from "@/components/terminal/shell";
import { SubmissionStatusBadge } from "@/components/terminal/status-badge";
import { formatFull, fromNow } from "@/lib/time";
import type { ReviewDecision, SignedSubmission } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ReviewDialogProps {
  submission: SignedSubmission;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 审核完成后让外层重新拉队列 */
  onReviewed?: () => void;
}

type Stage = "view" | "rejecting" | "busy";

/**
 * 审核弹层：大图在上，下面「通过」「驳回」两个按钮。
 * 点「驳回」就地展开一个必填原因输入框 —— 原因留空提交会被前端拦住，
 * 数据库层的 RLS with check 和 trigger 也会再拦一次。
 */
export function ReviewPanel({ submission, open, onOpenChange, onReviewed }: ReviewDialogProps) {
  const [stage, setStage] = React.useState<Stage>("view");
  const [reason, setReason] = React.useState("");
  const [approveNote, setApproveNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setStage("view");
      setReason("");
      setApproveNote("");
      setError(null);
      setDone(null);
    }
  }, [open, submission.id]);

  async function decide(decision: ReviewDecision, note: string) {
    if (stage === "busy") return;
    if (decision === "rejected" && !note.trim()) {
      setError("驳回必须写原因");
      setStage("rejecting");
      return;
    }

    setStage("busy");
    setError(null);

    const result = await reviewSubmission({
      submissionId: submission.id,
      decision,
      adminNote: note,
    });

    if (!result.ok) {
      setError(result.error ?? "审核失败");
      setStage(decision === "rejected" ? "rejecting" : "view");
      onReviewed?.();
      return;
    }

    setDone(decision === "approved" ? "已通过" : "已驳回，原因已回传给成员");
    onReviewed?.();
    // 让成功提示闪一下再关掉，管理员能确认这次点击生效了
    window.setTimeout(() => onOpenChange(false), 450);
  }

  const busy = stage === "busy";

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted-foreground">
        <span className="text-foreground">{submission.event ?? "（无事件名）"}</span>
        <SubmissionStatusBadge status={submission.status} />
        <span className="text-term-dim">·</span>
        <span>提交人 {submission.member?.display_name ?? submission.member_id.slice(0, 8)}</span>
        <span className="text-term-dim">·</span>
        <span title={formatFull(submission.created_at)}>
          {formatFull(submission.created_at)} ({fromNow(submission.created_at)})
        </span>
        <span className="text-term-dim">·</span>
        <span>id={submission.id.slice(0, 8)}</span>
        {submission.replaces_id ? (
          <span className="text-accent" title={`替换了 ${submission.replaces_id}`}>
            ↻ 重交自 {submission.replaces_id.slice(0, 8)}
          </span>
        ) : null}
      </div>

      <AttachmentList large submission={submission} />

      {submission.note ? (
        <p className="whitespace-pre-wrap break-words border-l-2 border-border pl-2 font-mono text-xs text-muted-foreground">
          <span className="text-term-dim">成员描述&gt; </span>
          {submission.note}
        </p>
      ) : null}

      {error ? <ErrorLine>{error}</ErrorLine> : null}
      {done ? <OkLine>{done}</OkLine> : null}

      {stage === "rejecting" ? (
        <div className="flex flex-col gap-2 border border-destructive/40 bg-destructive/8 p-2">
          <label
            htmlFor={`reject-reason-${submission.id}`}
            className="font-mono text-[11px] uppercase tracking-[0.16em] text-destructive"
          >
            驳回原因（必填）
          </label>
          <Textarea
            id={`reject-reason-${submission.id}`}
            rows={3}
            maxLength={1000}
            autoFocus
            value={reason}
            disabled={busy}
            onChange={(event) => {
              setReason(event.target.value);
              if (error) setError(null);
            }}
            aria-label="驳回原因（必填）"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={busy || !reason.trim()}
              onClick={() => decide("rejected", reason)}
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
              确认驳回
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                setStage("view");
                setError(null);
              }}
            >
              取消
            </Button>
            <span className="font-mono text-[10px] text-term-dim">
              {reason.trim().length}/1000 · 留空无法提交
            </span>
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          "flex flex-col gap-2",
          stage === "rejecting" && "opacity-50",
        )}
      >
        {stage === "view" ? (
          <div className="flex flex-col gap-2">
            <label
              htmlFor={`approve-note-${submission.id}`}
              className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground"
            >
              通过附言（选填）
            </label>
            <Textarea
              id={`approve-note-${submission.id}`}
              rows={2}
              maxLength={1000}
              value={approveNote}
              disabled={busy}
              onChange={(event) => setApproveNote(event.target.value)}
              aria-label="通过附言（选填）"
            />
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="default"
            disabled={busy || stage === "rejecting"}
            onClick={() => decide("approved", approveNote)}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            通过
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy || stage === "rejecting"}
            onClick={() => {
              setError(null);
              setStage("rejecting");
            }}
          >
            <X className="h-3.5 w-3.5" />
            驳回
          </Button>
        </div>
      </div>
    </div>
  );
}

export type { ReviewDialogProps };
