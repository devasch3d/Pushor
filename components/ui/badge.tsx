import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 border px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors",
  {
    variants: {
      variant: {
        default: "border-border bg-secondary text-secondary-foreground",
        // 绿：通过 / 在线 / 进行中
        success: "border-term-green/50 bg-term-green/12 text-term-green term-glow",
        // 琥珀：待审 / 需要注意
        warning: "border-term-amber/50 bg-term-amber/12 text-term-amber term-glow-amber",
        // 红：驳回 / 错误
        destructive: "border-destructive/50 bg-destructive/12 text-destructive",
        outline: "border-border bg-transparent text-muted-foreground",
        muted: "border-border/60 bg-transparent text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
