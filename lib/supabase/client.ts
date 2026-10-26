"use client";

/**
 * 浏览器端 Supabase 客户端（单例）。
 *
 * 静态导出模式下 NEXT_PUBLIC_* 变量在构建时被内联进 bundle，
 * 所以在 Cloudflare Pages 的构建设置里填一次即可，运行时不需要任何服务端配置。
 *
 * 会话存在 cookie 里（@supabase/ssr 的 createBrowserClient），
 * 刷新页面不丢登录态。anon key 按 Supabase 的设计就是可公开的，
 * 真正的权限边界是 RLS 与 Storage policy。
 */

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";

type Client = SupabaseClient<Database>;

let cached: Client | null = null;

export function getSupabase(): Client {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "缺少 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY。" +
        "本地开发请填 .env.local；Cloudflare Pages 请在构建设置里填这两个变量后重新构建。",
    );
  }

  // 不写显式泛型 + 一次断言：createBrowserClient 的返回类型和
  // SupabaseClient<Database> 的默认泛型实例化对不齐（schema 那个参数会被推断成
  // 整个 schema 对象），硬写泛型反而让所有表类型失效。断言只发生在这一行，
  // 业务代码拿到的仍然是完整的 SupabaseClient<Database>。
  cached = createBrowserClient(url, anonKey) as unknown as Client;
  return cached;
}
