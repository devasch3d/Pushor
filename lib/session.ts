import { cache } from "react";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/types/database";
import type { Profile, Role } from "@/lib/types";

type Client = SupabaseClient<Database>;

export interface SessionContext {
  supabase: Client;
  user: User;
  profile: Profile;
}

/**
 * 每个请求内去重地拿一次 supabase client + user。
 * Server Component、layout、page、server action 都会调用，用 React cache() 避免重复请求。
 */
export const getSession = cache(async (): Promise<{ supabase: Client; user: User | null }> => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
});

/**
 * 取当前用户的 profile；不存在时自动补一条 role='member'。
 *
 * 为什么这么做：需求里说「注册后由管理员在数据库里指定角色」。
 * 补默认 member 让新注册用户立刻能用成员端，而 admin 身份只能由管理员在数据库里改
 * —— RLS 的 profiles_insert_self_as_member 策略只允许 role='member'，
 * profiles_update_self_or_admin 的 with check 也只允许本人保持 'member'，
 * 所以自助提权在数据库层就被堵死了。
 */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const { supabase, user } = await getSession();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, role, display_name, created_at")
    .eq("id", user.id)
    .maybeSingle();

  if (data) return data as Profile;

  const emailPrefix = (user.email ?? "").split("@")[0]?.slice(0, 40);
  await supabase.from("profiles").insert({
    id: user.id,
    role: "member",
    display_name: emailPrefix || "member",
  });

  const { data: created } = await supabase
    .from("profiles")
    .select("id, role, display_name, created_at")
    .eq("id", user.id)
    .maybeSingle();

  return (created as Profile) ?? null;
});

/** 页面级守卫：未登录 → /login；角色不符 → 各自的主页 */
export async function requireProfile(expected?: Role): Promise<SessionContext> {
  const { supabase, user } = await getSession();
  if (!user) redirect("/login");

  const profile = await getProfile();
  if (!profile) redirect("/login?error=no_profile");

  if (expected && profile.role !== expected) {
    redirect(profile.role === "admin" ? "/admin" : "/member");
  }

  return { supabase, user, profile };
}

export const requireAdmin = () => requireProfile("admin");
export const requireMember = () => requireProfile("member");

/** 登录成功后按角色决定去哪 */
export function homePathFor(role: Role): string {
  return role === "admin" ? "/admin" : "/member";
}
