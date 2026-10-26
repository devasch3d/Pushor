"use client";

import * as React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TerminalSquare } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // 生产环境请接到你自己的日志服务；这里只打到浏览器控制台，不外发
    console.error(error);
  }, [error]);

  const message = error.message || "";
  // 环境变量缺失是最常见的启动问题，直接给出可操作的提示
  const missingEnv = message.includes("NEXT_PUBLIC_SUPABASE_URL");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
      <div className="flex items-center gap-2 text-destructive">
        <AlertTriangle className="h-4 w-4" aria-hidden />
        <h1 className="font-mono text-xs uppercase tracking-[0.24em]">runtime error</h1>
      </div>

      <div className="term-panel w-full max-w-lg">
        <header className="term-panel-header">
          <TerminalSquare className="h-3.5 w-3.5 text-primary" aria-hidden />
          <span className="term-title">stderr</span>
        </header>
        <div className="flex flex-col gap-3 p-3">
          <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-destructive">
            {message || "未知错误"}
            {error.digest ? `\n\ndigest: ${error.digest}` : ""}
          </pre>

          {missingEnv ? (
            <p className="border border-accent/40 bg-accent/10 p-2 font-mono text-[11px] leading-relaxed text-accent">
              缺少 Supabase 连接信息。复制仓库根目录的 .env.example 为 .env.local，
              填入 NEXT_PUBLIC_SUPABASE_URL 和 NEXT_PUBLIC_SUPABASE_ANON_KEY，
              然后重启 dev server。
            </p>
          ) : null}

          <div className="flex items-center gap-2">
            <Button type="button" onClick={reset}>
              <RefreshCw className="h-3.5 w-3.5" />
              重试
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
