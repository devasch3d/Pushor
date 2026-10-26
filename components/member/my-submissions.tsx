import { ResubmitDialog } from "@/components/member/resubmit-dialog";
import { ScreenshotThumb } from "@/components/terminal/screenshot-view";
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

/** 「我的提交」列表：事件、状态、驳回原因、以及被驳回记录的「重新提交」入口 */
export function MySubmissions({ memberId, submissions, onChanged }: MySubmissionsProps) {
  if (submissions.length === 0) {
    return <EmptyLine>--</EmptyLine>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {submissions.map((submission) => {
        const rejected = submission.status === "rejected";

        return (
          <li key={submission.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start">
            <ScreenshotThumb
              src={submission.signed_url}
              alt={`${submission.event ?? "提交"} 的附件`}
              size={80}
            />

            <div className="min-w-0 flex-1">
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

              <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                id={submission.id.slice(0, 8)} · {formatShort(submission.created_at)} (
                {fromNow(submission.created_at)})
                {submission.reviewed_at ? ` · 审于 ${formatShort(submission.reviewed_at)}` : ""}
              </p>

              {submission.note ? (
                <p className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">
                  <span className="text-term-dim">描述&gt; </span>
                  {submission.note}
                </p>
              ) : null}

              {rejected ? (
                <p className="mt-2 border-l-2 border-destructive/60 bg-destructive/8 px-2 py-1 font-mono text-[11px] text-destructive">
                  <span aria-hidden>驳回原因&gt; </span>
                  {submission.admin_note?.trim() || "（管理员没写原因）"}
                </p>
              ) : null}

              {submission.status === "approved" ? (
                <p className="mt-2 font-mono text-[11px] text-primary">
                  <span aria-hidden>[ok] </span>
                  已通过
                  {submission.admin_note?.trim() ? ` · ${submission.admin_note.trim()}` : ""}
                </p>
              ) : null}
            </div>

            {rejected ? (
              <div className="shrink-0 sm:pt-1">
                <ResubmitDialog
                  memberId={memberId}
                  submission={submission}
                  onChanged={onChanged}
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
