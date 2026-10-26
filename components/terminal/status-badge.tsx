import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  CATEGORY_LABEL,
  ROLE_LABEL,
  SUBMISSION_STATUS_LABEL,
  TASK_STATUS_LABEL,
  type Role,
  type SubmissionStatus,
  type TaskCategory,
  type TaskStatus,
} from "@/lib/types";

/**
 * 状态标签：绿 = 通过 / 进行中，琥珀 = 待审，红 = 驳回，灰 = 已归档。
 * 需求写的是「绿色/琥珀色状态标签」，驳回额外用红色区分，
 * 否则 pending 和 rejected 会同色，管理员一眼分不清。
 */

const SUBMISSION_VARIANT: Record<SubmissionStatus, "warning" | "success" | "destructive"> = {
  pending: "warning",
  approved: "success",
  rejected: "destructive",
};

export function SubmissionStatusBadge({
  status,
  className,
}: {
  status: SubmissionStatus;
  className?: string;
}) {
  return (
    <Badge variant={SUBMISSION_VARIANT[status]} className={className}>
      {SUBMISSION_STATUS_LABEL[status]}
    </Badge>
  );
}

const TASK_VARIANT: Record<TaskStatus, "success" | "muted"> = {
  active: "success",
  archived: "muted",
};

export function TaskStatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  return (
    <Badge variant={TASK_VARIANT[status]} className={className}>
      {TASK_STATUS_LABEL[status]}
    </Badge>
  );
}

export function CategoryTag({ category, className }: { category: TaskCategory; className?: string }) {
  return (
    <Badge variant="outline" className={cn("text-[10px]", className)}>
      {CATEGORY_LABEL[category]}
    </Badge>
  );
}

export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  return (
    <Badge variant={role === "admin" ? "warning" : "success"} className={className}>
      {ROLE_LABEL[role]}
    </Badge>
  );
}
