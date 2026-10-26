"use client";

import * as React from "react";
import { RotateCcw } from "lucide-react";

import {
  ScreenshotUploadForm,
  type SubmittableTask,
} from "@/components/member/screenshot-upload-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface ResubmitDialogProps {
  memberId: string;
  tasks: SubmittableTask[];
  /** 被驳回的那条旧记录 */
  submissionId: string;
  taskId: string;
  adminNote: string | null;
  /** 重新提交成功后让外层重新拉数据 */
  onChanged?: () => void;
}

/**
 * 「重新提交」入口。
 *
 * 语义：不改旧记录（它必须保持 rejected 作为审核痕迹），
 * 而是新建一条 status='pending' 的 submission，并用 replaces_id 指向旧记录。
 */
export function ResubmitDialog({
  memberId,
  tasks,
  submissionId,
  taskId,
  adminNote,
  onChanged,
}: ResubmitDialogProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="accent" size="sm">
          <RotateCcw className="h-3 w-3" />
          重新提交
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>resubmit --replaces {submissionId.slice(0, 8)}</DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-col gap-2">
              <span>
                这条记录被驳回了。重新提交会生成一条新的待审记录，
                旧的驳回记录和原因会原样保留。
              </span>
              {adminNote ? (
                <span className="border-l-2 border-destructive/60 pl-2 text-destructive">
                  驳回原因：{adminNote}
                </span>
              ) : null}
            </div>
          </DialogDescription>
        </DialogHeader>
        <div className="p-3">
          <ScreenshotUploadForm
            memberId={memberId}
            tasks={tasks}
            lockedTaskId={taskId}
            replacesId={submissionId}
            submitLabel="resubmit"
            onSuccess={() => {
              setOpen(false);
              onChanged?.();
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
