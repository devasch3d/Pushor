import { redirect } from "next/navigation";

import { requireProfile, homePathFor } from "@/lib/session";

export const dynamic = "force-dynamic";

/** 根路径：按 role 分流到 /admin 或 /member；未登录会被 requireProfile 送去 /login */
export default async function RootPage() {
  const { profile } = await requireProfile();
  redirect(homePathFor(profile.role));
}
