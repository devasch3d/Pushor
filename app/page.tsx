"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { BootScreen } from "@/components/terminal/boot-screen";
import { useProfile } from "@/lib/hooks";

/** 根路径：按 role 分流到 /admin 或 /member；未登录去 /login */
export default function RootPage() {
  const router = useRouter();
  const { user, profile, loading } = useProfile();

  React.useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    router.replace(profile?.role === "admin" ? "/admin" : "/member");
  }, [loading, user, profile, router]);

  return <BootScreen text="booting session…" />;
}
