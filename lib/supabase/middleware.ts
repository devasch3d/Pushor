import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseEnv, hasSupabaseEnv } from "@/lib/supabase/env";
import type { Database } from "@/lib/types/database";

type CookieList = { name: string; value: string; options: CookieOptions }[];

const PROTECTED_PREFIXES = ["/member", "/admin"];

/**
 * middleware 只负责两件事：
 *   1. 刷新 Supabase 会话 cookie（access token 过期时用 refresh token 续期）
 *   2. 未登录时把 /member、/admin 重定向到 /login
 *
 * 真正的权限判断不在这里做：角色与数据可见性完全由 RLS + 页面里的 requireProfile 决定。
 * middleware 跑在 Edge runtime，读不到数据库也不应该读。
 */
export async function middleware(request: NextRequest) {
  // 构建期或环境变量缺失时 fail-open，不要让 middleware 把整站打挂
  if (!hasSupabaseEnv()) {
    return NextResponse.next();
  }

  const { url, anonKey, schema } = getSupabaseEnv();
  const { pathname } = request.nextUrl;

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    db: { schema },
    cookies: {
      getAll(): { name: string; value: string }[] {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieList) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  }) as unknown as SupabaseClient<Database>;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (!user && isProtected) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * 除静态资源外的所有路径。
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
