"use client";

import * as React from "react";

/** 终端风格的加载占位：一行命令 + 闪烁光标 */
export function BootScreen({ text }: { text: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="font-mono text-xs text-muted-foreground">
        <span className="text-primary" aria-hidden>
          $&nbsp;
        </span>
        {text}
        <span
          aria-hidden
          className="ml-1 inline-block h-[1em] w-[0.5em] translate-y-[0.15em] animate-caret-blink bg-primary"
        />
      </p>
    </main>
  );
}
