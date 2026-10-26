"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TerminalSquare } from "lucide-react";

import { LoginForm } from "@/components/auth/login-form";
import { BootScreen } from "@/components/terminal/boot-screen";
import { useProfile } from "@/lib/hooks";

/**
 * 登录页。
 * useSearchParams 在静态导出下必须包在 Suspense 里，所以拆成内层组件。
 */
export default function LoginPage() {
  return (
    <React.Suspense fallback={<BootScreen text="loading login…" />}>
      <LoginInner />
    </React.Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorCode = searchParams.get("error") ?? undefined;
  const { user, profile, loading } = useProfile();

  // 已登录就别停在登录页。no_profile 是例外：那条提示本身要显示给用户看，
  // 再跳转会和根页面的守卫形成死循环。
  React.useEffect(() => {
    if (loading || errorCode === "no_profile") return;
    if (user) router.replace(profile?.role === "admin" ? "/admin" : "/member");
  }, [loading, user, profile, errorCode, router]);

  if (loading && errorCode !== "no_profile") {
    return <BootScreen text="checking session…" />;
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 px-4 py-10">
      <div className="flex items-center gap-2 text-primary term-glow">
        <TerminalSquare className="h-4 w-4" aria-hidden />
        <h1 className="font-mono text-xs uppercase tracking-[0.28em] sm:text-sm">
          成员截图验收终端
        </h1>
      </div>

      <LoginForm errorCode={errorCode} />

      <p className="max-w-md text-center font-mono text-[11px] leading-relaxed text-term-dim">
        <span aria-hidden># </span>
        本系统只负责截图的提交与人工审核。
        <br />
        不计算金额、不记账、不转账、不发通知。
      </p>
    </main>
  );
}
