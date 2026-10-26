"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Subscription, User } from "@supabase/supabase-js";

import { getSupabase } from "@/lib/supabase/client";
import type { Profile, Role } from "@/lib/types";

/** 当前登录用户 + 加载态。监听 auth 变化，登录/登出会自动更新 */
export function useSession(): { user: User | null; loading: boolean } {
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    let subscription: Subscription | null = null;
    const supabase = getSupabase();

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    // 这个版本的 onAuthStateChange 同步返回 { data: { subscription } }
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      setUser(session?.user ?? null);
      setLoading(false);
    });
    subscription = data.subscription;

    return () => {
      alive = false;
      subscription?.unsubscribe();
    };
  }, []);

  return { user, loading };
}

/**
 * 当前用户的 profile。没有就自动补一条 role='member'。
 *
 * 补默认 member 让新注册用户立刻能用成员端；admin 身份只能由管理员在数据库里改 ——
 * RLS 的 profiles_insert_self_as_member 只允许 role='member'，
 * profiles_update_self_or_admin 的 with check 也只允许本人保持 'member'，
 * 所以自助提权在数据库层就被堵死了。
 */
export function useProfile(): { user: User | null; profile: Profile | null; loading: boolean } {
  const { user, loading: sessionLoading } = useSession();
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    if (sessionLoading) return;

    if (!user) {
      setProfile(null);
      setReady(true);
      return;
    }

    const supabase = getSupabase();
    const select = () =>
      supabase
        .from("profiles")
        .select("id, role, display_name, created_at")
        .eq("id", user.id)
        .maybeSingle();

    (async () => {
      let { data } = await select();

      if (!data) {
        const display = (user.email ?? "").split("@")[0]?.slice(0, 40) || "member";
        await supabase.from("profiles").insert({
          id: user.id,
          role: "member",
          display_name: display,
        });
        ({ data } = await select());
      }

      if (!alive) return;
      setProfile((data as Profile) ?? null);
      setReady(true);
    })();

    return () => {
      alive = false;
    };
  }, [user, sessionLoading]);

  return { user, profile, loading: sessionLoading || !ready };
}

/**
 * 页面级守卫：未登录去 /login，角色不符去各自主页。
 * 静态导出没有 middleware，守卫只能在浏览器里做 ——
 * 但请注意这只是 UX，真正的数据边界是 RLS，越权请求在数据库层就拿不到数据。
 */
export function useRequireRole(expected: Role) {
  const { user, profile, loading } = useProfile();
  const router = useRouter();

  React.useEffect(() => {
    if (loading) return;
    if (!user || !profile) {
      router.replace("/login");
      return;
    }
    if (profile.role !== expected) {
      router.replace(profile.role === "admin" ? "/admin" : "/member");
    }
  }, [loading, user, profile, expected, router]);

  return { user, profile, loading };
}
