import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseEnv } from "@/lib/supabase/env";
import type { Database } from "@/lib/types/database";

type CookieList = { name: string; value: string; options: CookieOptions }[];

/**
 * 服务端（RSC / Server Action / Route Handler）使用的 Supabase 客户端，
 * 基于请求 cookie 里的会话，因此查询天然带上调用者身份，RLS 才能生效。
 *
 * 关于那个 `as unknown as`：supabase-js 的 SupabaseClient 泛型里带 schema 名，
 * 一旦把运行时的 schema 字符串塞进 options，推断结果就和 Database 对不上。
 * 这里显式标注 cookie 回调的参数类型，再对结果做一次断言，
 * 业务代码拿到的仍然是完整的 SupabaseClient<Database>。
 */
export function createClient(): SupabaseClient<Database> {
  const { url, anonKey, schema } = getSupabaseEnv();
  const cookieStore = cookies();

  const client = createServerClient(url, anonKey, {
    db: { schema },
    cookies: {
      getAll(): { name: string; value: string }[] {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieList) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // 在 Server Component 里 cookies() 是只读的，写入会抛错。
          // 会话续期由 middleware.ts 负责，这里静默忽略即可。
        }
      },
    },
  });

  return client as unknown as SupabaseClient<Database>;
}
