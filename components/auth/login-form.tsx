"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, Mail, Terminal, UserPlus } from "lucide-react";

import { signIn, signUp } from "@/lib/api";
import { getSupabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorLine, OkLine } from "@/components/terminal/shell";
import { cn } from "@/lib/utils";

type Mode = "signin" | "signup";

const BANNER = [
  "╔═╗╔═╗╔═╗╔╦╗╔═╗ ╦╔═╗",
  "╚═╗║  ║╣ ║║║╠╣ ╠═╣║  ",
  "╚═╝╚═╝╚═╝╩ ╩╚  ╩ ╩╚═╝",
].join("\n");

const ERROR_HINTS: Record<string, string> = {
  no_profile:
    "登录成功了，但没能建立 profiles 记录。请联系管理员在数据库里手动为你插入一行 profiles（见 README「手动把用户设为 admin」）。",
};

interface LoginFormProps {
  errorCode?: string;
}

export function LoginForm({ errorCode }: LoginFormProps) {
  const router = useRouter();
  const [mode, setMode] = React.useState<Mode>("signin");
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);

  const guardError = errorCode ? ERROR_HINTS[errorCode] : undefined;

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const displayName = String(formData.get("display_name") ?? "");

    setPending(true);
    setError(null);
    setNotice(null);

    try {
      const result =
        mode === "signin"
          ? await signIn(email, password)
          : await signUp(email, password, displayName);

      if (!result.ok) {
        setError(result.error ?? "请求失败，请重试");
        return;
      }

      if (result.needsConfirm) {
        setNotice(
          "注册成功。请去邮箱点确认链接，然后回来登录。默认角色是 member，管理员会在数据库里按需把你改成 admin。",
        );
        return;
      }

      // 登录成功：读一次 role 决定去哪
      const {
        data: { user },
      } = await getSupabase().auth.getUser();
      const { data: profile } = user
        ? await getSupabase().from("profiles").select("role").eq("id", user.id).maybeSingle()
        : { data: null };
      router.replace(profile?.role === "admin" ? "/admin" : "/member");
      router.refresh();
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : "请求失败，请重试");
    } finally {
      setPending(false);
      formRef.current?.querySelector<HTMLInputElement>("input[type=password]")?.blur();
    }
  }

  const isSignIn = mode === "signin";

  return (
    <div className="term-panel w-full max-w-md">
      <header className="term-panel-header">
        <Terminal className="h-3.5 w-3.5 text-primary" aria-hidden />
        <span className="term-title">{isSignIn ? "auth --login" : "auth --register"}</span>
        <span className="ml-auto text-[11px] normal-case tracking-normal text-term-dim">
          supabase · email+password
        </span>
      </header>

      <pre
        aria-hidden
        className="select-none overflow-hidden border-b border-border px-3 py-2 text-[9px] leading-[1.15] text-primary/70 sm:text-[10px]"
      >
        {BANNER}
      </pre>

      <div className="flex border-b border-border">
        {(
          [
            ["signin", "登录", KeyRound],
            ["signup", "注册", UserPlus],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            onClick={() => switchMode(value)}
            aria-pressed={mode === value}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 border-r border-border px-3 py-2",
              "font-mono text-xs uppercase tracking-[0.16em] transition-colors last:border-r-0",
              mode === value
                ? "bg-primary/12 text-primary term-glow"
                : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
            )}
          >
            <Icon className="h-3 w-3" />
            {label}
          </button>
        ))}
      </div>

      <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-3 p-4" noValidate>
        {guardError ? <ErrorLine>{guardError}</ErrorLine> : null}
        {error ? <ErrorLine>{error}</ErrorLine> : null}
        {notice ? <OkLine>{notice}</OkLine> : null}

        {!isSignIn ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="display_name">
              <span className="text-term-dim" aria-hidden>
                --name=&nbsp;
              </span>
              显示名
            </Label>
            <Input
              id="display_name"
              name="display_name"
              autoComplete="nickname"
              maxLength={40}
              placeholder="例如：阿明"
            />
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">
            <Mail className="mr-1 inline h-3 w-3" aria-hidden />
            邮箱
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">
            <KeyRound className="mr-1 inline h-3 w-3" aria-hidden />
            密码
          </Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={6}
            autoComplete={isSignIn ? "current-password" : "new-password"}
            placeholder="至少 6 位"
          />
        </div>

        <Button type="submit" disabled={pending} className="mt-1 w-full">
          {pending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              执行中…
            </>
          ) : (
            <>
              <span aria-hidden>$ </span>
              {isSignIn ? "login" : "register"}
            </>
          )}
        </Button>

        <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
          <span className="text-term-dim"># </span>
          注册后默认角色是 <span className="text-primary">member</span>。
          <span className="text-accent">admin</span> 身份由管理员在数据库里手动指定，
          页面上不提供自助提权入口（RLS 也在数据库层拦住了）。
        </p>
      </form>
    </div>
  );
}
