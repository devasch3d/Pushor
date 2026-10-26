/**
 * 服务端读取 Supabase 连接信息。
 *
 * 为什么要做回退：
 *  - 你自己的 Supabase 项目 / Vercel：用 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY，
 *    构建时会被内联进客户端 bundle。
 *  - QW Pages 托管运行时：注入的是 SUPABASE_URL / SUPABASE_ANON_KEY（不带 NEXT_PUBLIC_ 前缀），
 *    构建时拿不到，所以浏览器端改走 /api/config 在运行时取（见 lib/supabase/client.ts）。
 *
 * 全程只使用 anon key。绝不引入 service_role key —— 权限边界完全由 RLS 负责。
 */

export interface SupabaseEnv {
  url: string;
  anonKey: string;
  /** PostgREST 暴露的 schema 名，默认 public */
  schema: string;
}

/**
 * 解析 PostgREST 要用的 schema 名。
 *
 * 优先级：
 *   1. 显式的 SUPABASE_SCHEMA / NEXT_PUBLIC_SUPABASE_SCHEMA
 *   2. 由 SUPABASE_INSTANCE_ID 推导出的 Page-owned tenant schema
 *      （QW Pages 托管运行时的表不在 public 下，而是 tenant_<instanceId>_schema；
 *        supabase-js 默认会发 Accept-Profile: public，那样会直接 406，所以必须显式指定）
 *   3. public（你自己的 Supabase 项目 / Vercel 部署）
 */
function resolveSchema(): string {
  const explicit =
    process.env.NEXT_PUBLIC_SUPABASE_SCHEMA?.trim() ||
    process.env.SUPABASE_SCHEMA?.trim() ||
    "";
  if (explicit) return explicit;

  const instanceId =
    process.env.NEXT_PUBLIC_SUPABASE_INSTANCE_ID?.trim() ||
    process.env.SUPABASE_INSTANCE_ID?.trim() ||
    "";
  if (instanceId) return `tenant_${instanceId}_schema`;

  return "public";
}

export function getSupabaseEnv(): SupabaseEnv {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    "";
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    "";

  if (!url || !anonKey) {
    throw new Error(
      [
        "缺少 Supabase 连接信息。请在 .env.local 里填写：",
        "  NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co",
        "  NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key>",
        "（可参考仓库根目录的 .env.example）",
      ].join("\n"),
    );
  }

  return { url, anonKey, schema: resolveSchema() };
}

/** 连接信息是否可用；用于 middleware 等在构建期也可能被执行的场景做 fail-open 判断 */
export function hasSupabaseEnv(): boolean {
  try {
    getSupabaseEnv();
    return true;
  } catch {
    return false;
  }
}
