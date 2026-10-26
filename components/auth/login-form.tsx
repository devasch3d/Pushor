"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, Terminal, User } from "lucide-react";

import { signIn } from "@/lib/api";
import { getSupabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorLine } from "@/components/terminal/shell";

const ERROR_HINTS: Record<string, string> = {
  no_profile:
    "登录成功了，但没能建立 profiles 记录。请联系管理员在数据库里为你插入一行 profiles（见 README「手动把用户设为 admin」）。",
};

interface LoginFormProps {
  errorCode?: string;
}

/** 登录表单。注册入口已按需求移除，账号由管理员在 Supabase 后台创建 */
export function LoginForm({ errorCode }: LoginFormProps) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);

  const guardError = errorCode ? ERROR_HINTS[errorCode] : undefined;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    setPending(true);
    setError(null);

    try {
      const result = await signIn(email, password);
      if (!result.ok) {
        setError(result.error ?? "登录失败，请重试");
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
      setError(thrown instanceof Error ? thrown.message : "登录失败，请重试");
    } finally {
      setPending(false);
      formRef.current?.querySelector<HTMLInputElement>("input[type=password]")?.blur();
    }
  }

  return (
    <div className="term-panel w-full max-w-md">
      <header className="term-panel-header">
        <Terminal className="h-3.5 w-3.5 text-primary" aria-hidden />
        <span className="term-title">auth --login</span>
      </header>

      <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-3 p-4" noValidate>
        {guardError ? <ErrorLine>{guardError}</ErrorLine> : null}
        {error ? <ErrorLine>{error}</ErrorLine> : null}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">
            <User className="mr-1 inline h-3 w-3" aria-hidden />
            用户
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
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
            autoComplete="current-password"
          />
        </div>

        <Button type="submit" disabled={pending} className="mt-1 w-full">
          {pending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              执行中…
            </>
          ) : (
            "login"
          )}
        </Button>
      </form>
    </div>
  );
}
