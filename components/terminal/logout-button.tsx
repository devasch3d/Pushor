"use client";

import * as React from "react";
import { LogOut } from "lucide-react";

import { signOut } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const [pending, startTransition] = React.useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(() => void signOut())}
      aria-label="登出"
    >
      <LogOut className="h-3 w-3" />
      {pending ? "登出中" : "登出"}
    </Button>
  );
}
