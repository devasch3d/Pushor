import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * 终端外壳：顶部一条状态栏（当前身份 / 角色 / 登出），下面一条命令提示，然后是内容。
 * 纯 Web 视觉，不依赖任何真实终端。
 */

export function Blink({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-[1.05em] w-[0.55em] translate-y-[0.18em] bg-primary animate-caret-blink",
        className,
      )}
    />
  );
}

export function Prompt({
  command,
  className,
}: {
  command: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1 font-mono text-xs text-muted-foreground", className)}>
      <span className="text-primary">admin@review</span>
      <span className="text-term-dim">:</span>
      <span className="text-foreground">~</span>
      <span className="text-primary term-prompt" aria-hidden />
      <span className="text-foreground">{command}</span>
      <Blink />
    </div>
  );
}

interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  hint?: React.ReactNode;
  actions?: React.ReactNode;
}

/** 命令行式边框面板：`┌─[ 标题 ]──── hint ────┐` */
export function Panel({ title, hint, actions, className, children, ...props }: PanelProps) {
  return (
    <section className={cn("term-panel flex flex-col", className)} {...props}>
      <header className="term-panel-header">
        <span className="text-term-dim" aria-hidden>
          ┌─[
        </span>
        <h2 className="term-title">{title}</h2>
        <span className="text-term-dim" aria-hidden>
          ]
        </span>
        {hint ? (
          <span className="ml-1 text-[11px] normal-case tracking-normal text-muted-foreground">
            {hint}
          </span>
        ) : null}
        {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
      </header>
      <div className="min-w-0 flex-1 p-3">{children}</div>
    </section>
  );
}

export function EmptyLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-1 py-6 text-center font-mono text-xs text-muted-foreground">
      <span className="text-term-dim"># </span>
      {children}
    </p>
  );
}

export function ErrorLine({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="border border-destructive/45 bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive"
    >
      <span aria-hidden>[error] </span>
      {children}
    </p>
  );
}

export function OkLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="border border-primary/45 bg-primary/10 px-3 py-2 font-mono text-xs text-primary">
      <span aria-hidden>[ok] </span>
      {children}
    </p>
  );
}
