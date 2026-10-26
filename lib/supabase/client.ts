"use client";

/**
 * 浏览器端 Supabase 客户端。
 *
 * 返回 Promise 是有意为之：当 NEXT_PUBLIC_* 变量在构建期不存在时
 * （例如 QW Pages 托管运行时只在服务端注入 SUPABASE_URL / SUPABASE_ANON_KEY），
 * 我们从 /api/config 在运行时取回连接信息，再创建客户端。
 * 在你自己的 Supabase 项目 / Vercel 上，NEXT_PUBLIC_* 存在，直接走快路径，不发请求。
 *
 * anon key 本身就是可公开的，真正的权限边界是数据库 RLS 与 Storage policy。
 */

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";

type Client = SupabaseClient<Database>;

let cached: Client | null = null;
let pending: Promise<Client> | null = null;

async function resolveEnv(): Promise<{
  url: string;
  anonKey: string;
  schema: string;
}> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (url && anonKey) {
    return {
      url,
      anonKey,
      schema: process.env.NEXT_PUBLIC_SUPABASE_SCHEMA || "public",
    };
  }

  const res = await fetch("/api/config", { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`无法读取 Supabase 运行时配置（/api/config → ${res.status}）`);
  }
  return (await res.json()) as { url: string; anonKey: string; schema: string };
}

async function create(): Promise<Client> {
  const { url, anonKey, schema } = await resolveEnv();
  // 和 lib/supabase/server.ts 同样的处理：db.schema 会打乱 supabase-js 的泛型推断，
  // 所以创建时不带 Database 泛型，再断言回 SupabaseClient<Database>。
  const client = createBrowserClient(url, anonKey, { db: { schema } });
  return client as unknown as Client;
}

export function getSupabaseBrowserClient(): Promise<Client> {
  if (cached) return Promise.resolve(cached);
  if (pending) return pending;

  const promise = create().then(
    (client) => {
      cached = client;
      pending = null;
      return client;
    },
    (error: unknown) => {
      pending = null;
      throw error;
    },
  );

  pending = promise;
  return promise;
}
