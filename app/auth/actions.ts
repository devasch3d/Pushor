"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { homePathFor } from "@/lib/session";
import type { Role } from "@/lib/types";

export interface AuthActionResult {
  error?: string;
  /** 注册后需要去邮箱点确认链接时给出提示 */
  notice?: string;
}

/** 把 Supabase 的英文报错翻成人话。不猜测，只映射确实会出现的几种 */
function humanizeAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) return "邮箱或密码不对";
  if (lower.includes("email not confirmed")) return "邮箱还没确认，请先去邮箱点确认链接";
  if (lower.includes("user already registered")) return "这个邮箱已经注册过了，直接登录吧";
  if (lower.includes("password should be at least")) return "密码太短，至少要 6 位";
  if (lower.includes("valid email")) return "邮箱格式不对";
  if (lower.includes("rate limit") || lower.includes("too many requests"))
    return "请求太频繁了，稍等一分钟再试";
  return message;
}

function readCredentials(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  return { email, password };
}

async function resolveRole(userId: string): Promise<Role> {
  const supabase = createClient();
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  return data?.role === "admin" ? "admin" : "member";
}

/** 邮箱密码登录，成功后按 role 跳转 */
export async function signInWithPassword(formData: FormData): Promise<AuthActionResult> {
  const { email, password } = readCredentials(formData);
  if (!email || !password) return { error: "邮箱和密码都要填" };

  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: humanizeAuthError(error.message) };
  if (!data.user) return { error: "登录没成功，请重试" };

  // 新用户首次登录时补一条 role='member' 的 profile。
  // RLS 只允许本人插入 role='member'，所以这里不可能被用来提权。
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!existing) {
    const display = (data.user.email ?? "").split("@")[0]?.slice(0, 40) || "member";
    await supabase.from("profiles").insert({
      id: data.user.id,
      role: "member",
      display_name: display,
    });
  }

  const role = await resolveRole(data.user.id);

  revalidatePath("/", "layout");
  redirect(homePathFor(role));
}

/** 注册。注册完只是 member，admin 身份要由管理员在数据库里手动指定 */
export async function signUpWithPassword(formData: FormData): Promise<AuthActionResult> {
  const { email, password } = readCredentials(formData);
  const displayName = String(formData.get("display_name") ?? "").trim().slice(0, 40);

  if (!email || !password) return { error: "邮箱和密码都要填" };
  if (password.length < 6) return { error: "密码至少要 6 位" };

  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName || undefined } },
  });

  if (error) return { error: humanizeAuthError(error.message) };

  // 项目开了邮箱确认时，session 为 null，需要用户先去邮箱点链接
  if (!data.session) {
    return {
      notice: "注册成功。请去邮箱点确认链接，然后回来登录。默认角色是 member，管理员会在数据库里按需把你改成 admin。",
    };
  }

  const userId = data.user?.id;
  if (!userId) return { error: "注册没成功，请重试" };

  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (!existing) {
    await supabase.from("profiles").insert({
      id: userId,
      role: "member",
      display_name: displayName || (email.split("@")[0]?.slice(0, 40) ?? "member"),
    });
  }

  const role = await resolveRole(userId);
  revalidatePath("/", "layout");
  redirect(homePathFor(role));
}

/** 登出 */
export async function signOut(): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
