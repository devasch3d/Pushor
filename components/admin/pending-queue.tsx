"use client";

import * as React from "react";

import { ReviewPanel } from "@/components/admin/review-panel";
import { ScreenshotThumb } from "@/components/terminal/screenshot-view";
import { EmptyLine } from "@/components/terminal/shell";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatShort, fromNow } from "@/lib/time";
import type { SignedSubmission } from "@/lib/types";

/**
 * 待审队列。
 *
 * 数据由服务端按 created_at 升序取好（先到先得），
 * 这里只负责渲染和「点开大图 → 通过 / 驳回」的交互。
 * 队列是客户端组件，因为要维护当前打开的是哪一条。
 */
export function PendingQueue({
  submissions,
  onReviewed,
}: {
  submissions: SignedSubmission[];
  onReviewed?: () => void;
}) {
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const active = submissions.find((item) => item.id === activeId) ?? null;

  if (submissions.length === 0) {
    return <EmptyLine>队列是空的，所有提交都审完了。</EmptyLine>;
  }

  return (
    <>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {submissions.map((submission, index) => (
          <li key={submission.id}>
            <button
              type="button"
              onClick={() => setActiveId(submission.id)}
              className="flex w-full items-start gap-2 border border-border bg-background/50 p-2 text-left transition-colors hover:border-accent/60 hover:bg-accent/5 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              aria-label={`审核 ${submission.event ?? submission.id} 的提交`}
            >
              <span className="mt-0.5 w-7 shrink-0 font-mono text-[10px] text-term-dim">
                {String(index + 1).padStart(2, "0")}
              </span>
              <ScreenshotThumb
                src={submission.signed_url}
                alt={`${submission.event ?? "提交"} 的附件缩略图`}
                size={72}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-xs text-foreground">
                  {submission.event ?? "（无事件名）"}
                </span>
                <span className="mt-1 block truncate font-mono text-[10px] text-muted-foreground">
                  {submission.member?.display_name ?? submission.member_id.slice(0, 8)}
                </span>
                <span className="mt-0.5 block font-mono text-[10px] text-accent">
                  {formatShort(submission.created_at)} · {fromNow(submission.created_at)}
                </span>
                {submission.replaces_id ? (
                  <span className="mt-0.5 block font-mono text-[10px] text-term-dim">
                    ↻ 重交 {submission.replaces_id.slice(0, 8)}
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <Dialog open={active !== null} onOpenChange={(open) => !open && setActiveId(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>review --id {active?.id.slice(0, 8) ?? "--------"}</DialogTitle>
            <DialogDescription>
              通过后状态变 approved；驳回必须写原因，原因会显示在成员端。
            </DialogDescription>
          </DialogHeader>
          {active ? (
            <ReviewPanel
              submission={active}
              open={active !== null}
              onOpenChange={(open) => !open && setActiveId(null)}
              onReviewed={onReviewed}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
