import { ScreenshotThumb } from "@/components/terminal/screenshot-view";
import { EmptyLine } from "@/components/terminal/shell";
import { SubmissionStatusBadge } from "@/components/terminal/status-badge";
import { formatShort } from "@/lib/time";
import type { SignedSubmission, SubmissionStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

interface TodayReviewedProps {
  submissions: SignedSubmission[];
  day: string;
}

/**
 * 今日已审：按 approved / rejected 分两组展示。
 *
 * 只显示条数，不做任何汇总统计以外的东西 ——
 * 这里没有金额、没有日结、没有余额，只有「今天审了几张、结论是什么」。
 */
export function TodayReviewed({ submissions, day }: TodayReviewedProps) {
  const approved = submissions.filter((item) => item.status === "approved");
  const rejected = submissions.filter((item) => item.status === "rejected");

  if (submissions.length === 0) {
    return <EmptyLine>{day} 还没有审核过任何提交。</EmptyLine>;
  }

  return (
    <div className="flex flex-col gap-3">
      <ReviewedGroup label="approved" tone="green" items={approved} />
      <ReviewedGroup label="rejected" tone="red" items={rejected} />
    </div>
  );
}

function ReviewedGroup({
  label,
  tone,
  items,
}: {
  label: SubmissionStatus;
  tone: "green" | "red";
  items: SignedSubmission[];
}) {
  return (
    <div className="border border-border">
      <div
        className={cn(
          "flex items-center gap-2 border-b border-border px-2 py-1 font-mono text-[11px] uppercase tracking-[0.16em]",
          tone === "green" ? "text-primary" : "text-destructive",
        )}
      >
        <span aria-hidden>{tone === "green" ? "[+]" : "[-]"}</span>
        <span>{label}</span>
        <span className="text-muted-foreground">count={items.length}</span>
      </div>

      {items.length === 0 ? (
        <p className="px-2 py-3 font-mono text-[11px] text-term-dim">-- none --</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {items.map((submission) => (
            <li key={submission.id} className="flex items-start gap-2 p-2">
              <ScreenshotThumb
                src={submission.signed_url}
                alt={`${submission.event ?? "提交"} 的附件`}
                size={56}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-mono text-xs text-foreground">
                    {submission.event ?? "（无事件名）"}
                  </span>
                  <SubmissionStatusBadge status={submission.status} />
                </div>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {submission.member?.display_name ?? submission.member_id.slice(0, 8)} · 审于{" "}
                  {formatShort(submission.reviewed_at)}
                </p>
                {submission.admin_note?.trim() ? (
                  <p
                    className={cn(
                      "mt-1 break-words font-mono text-[10px]",
                      tone === "green" ? "text-primary/80" : "text-destructive/90",
                    )}
                  >
                    <span className="text-term-dim">admin_note&gt; </span>
                    {submission.admin_note.trim()}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
