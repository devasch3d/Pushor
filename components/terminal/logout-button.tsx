"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { signOutUser } from "@/lib/api";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function onClick() {
    if (pending) return;
    setPending(true);
    await signOutUser();
    router.replace("/login");
    router.refresh();
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => void onClick()}
      aria-label="登出"
    >
      <LogOut className="h-3 w-3" />
      {pending ? "登出中" : "登出"}
    </Button>
  );
}
