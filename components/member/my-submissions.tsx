import { ResubmitDialog } from "@/components/member/resubmit-dialog";
import { AttachmentRow } from "@/components/terminal/attachment";
import { EmptyLine } from "@/components/terminal/shell";
import { SubmissionStatusBadge } from "@/components/terminal/status-badge";
import { formatShort, fromNow } from "@/lib/time";
import type { SignedSubmission } from "@/lib/types";

interface MySubmissionsProps {
  memberId: string;
  submissions: SignedSubmission[];
  /** 数据变化后让外层重新拉取 */
  onChanged?: () => void;
}

/** 「我的提交」列表：事件、状态、附件下载入口、驳回原因、重新提交 */
export function MySubmissions({ memberId, submissions, onChanged }: MySubmissionsProps) {
  if (submissions.length === 0) {
    return <EmptyLine>--</EmptyLine>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {submissions.map((submission) => {
        const rejected = submission.status === "rejected";

        return (
          <li key={submission.id} className="flex flex-col gap-2 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-mono text-sm text-foreground">
                {submission.event ?? "（无事件名）"}
              </span>
              <SubmissionStatusBadge status={submission.status} />
              {submission.replaces_id ? (
                <span
                  className="font-mono text-[10px] text-term-dim"
                  title={`这条是重新提交，替换了 ${submission.replaces_id}`}
                >
                  ↻ replaces {submission.replaces_id.slice(0, 8)}
                </span>
              ) : null}
            </div>

            <AttachmentRow src={submission.signed_url} label="附件" />

            <p className="font-mono text-[11px] text-muted-foreground">
              id={submission.id.slice(0, 8)} · {formatShort(submission.created_at)} (
              {fromNow(submission.created_at)})
              {submission.reviewed_at ? ` · 审于 ${formatShort(submission.reviewed_at)}` : ""}
            </p>

            {submission.note ? (
              <p className="whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">
                <span className="text-term-dim">描述&gt; </span>
                {submission.note}
              </p>
            ) : null}

            {rejected ? (
              <p className="border-l-2 border-destructive/60 bg-destructive/8 px-2 py-1 font-mono text-[11px] text-destructive">
                <span aria-hidden>驳回原因&gt; </span>
                {submission.admin_note?.trim() || "（管理员没写原因）"}
              </p>
            ) : null}

            {submission.status === "approved" ? (
              <p className="font-mono text-[11px] text-primary">
                <span aria-hidden>[ok] </span>
                已通过
                {submission.admin_note?.trim() ? ` · ${submission.admin_note.trim()}` : ""}
              </p>
            ) : null}

            {rejected ? (
              <div className="flex justify-end">
                <ResubmitDialog memberId={memberId} submission={submission} onChanged={onChanged} />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
