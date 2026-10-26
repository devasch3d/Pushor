import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { TerminalSquare } from "lucide-react";

import { getProfile, getSession, homePathFor } from "@/lib/session";

export const dynamic = "force-dynamic";

interface LoginPageProps {
  searchParams?: { error?: string };
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const errorCode = searchParams?.error;

  // 已登录就别停在登录页。no_profile 是例外：那条错误本身就是要显示给用户看的，
  // 再跳转会和根页面的守卫形成死循环。
  if (errorCode !== "no_profile") {
    const { user } = await getSession();
    if (user) {
      const profile = await getProfile();
      redirect(homePathFor(profile?.role ?? "member"));
    }
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
