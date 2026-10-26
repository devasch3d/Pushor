import { NextResponse } from "next/server";

import { getSupabaseEnv } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

/**
 * 把 Supabase 连接信息在运行时暴露给浏览器端。
 *
 * 存在的原因：NEXT_PUBLIC_* 变量是在构建期内联进客户端 bundle 的。
 * 在 QW Pages 托管运行时里，注入的是服务端的 SUPABASE_URL / SUPABASE_ANON_KEY，
 * 构建期并不存在，浏览器端就拿不到。有了这个端点，
 * lib/supabase/client.ts 可以在运行时把配置取回来再建客户端。
 *
 * 安全性：anon key 按 Supabase 的设计就是可公开的，
 * 所有权限控制都在 RLS 与 Storage policy 里，这里不涉及任何机密。
 * 本端点绝不返回 service_role key（本项目根本不使用它）。
 */
export async function GET() {
  try {
    const { url, anonKey, schema } = getSupabaseEnv();
    return NextResponse.json(
      { url, anonKey, schema },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
