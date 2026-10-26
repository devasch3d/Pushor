import { LogoutButton } from "@/components/terminal/logout-button";
import { PushorLogo } from "@/components/terminal/logo";
import { RoleBadge } from "@/components/terminal/status-badge";
import type { Profile } from "@/lib/types";
import { cn } from "@/lib/utils";

interface TerminalShellProps {
  profile: Profile;
  /** 顶部命令行提示里显示的命令，例如 `member submit --watch` */
  command: string;
  /** 启动横幅下面那行 boot log */
  bootNote?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * 页面级终端外壳：ASCII 横幅 + 身份状态栏 + 内容区 + 页脚。
 * 所有页面（/member、/admin、/login）共用这一层视觉。
 */
export function TerminalShell({
  profile,
  command,
  bootNote,
  children,
  className,
}: TerminalShellProps) {
  const who = profile.display_name || profile.id.slice(0, 8);

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-4 px-3 py-5 sm:px-5">
      <header className="term-panel">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
          <span className="flex items-center gap-2">
            <PushorLogo size={22} />
            <span className="font-semibold uppercase tracking-[0.24em] text-xs text-primary term-glow sm:text-sm">
              Pushor
            </span>
          </span>

          <div className="ml-auto flex items-center gap-3">
            <span className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
              <span className="text-term-dim">user=</span>
              <span className="text-foreground">{who}</span>
              <RoleBadge role={profile.role} />
            </span>
            <LogoutButton />
          </div>
        </div>

        <div className="flex items-center gap-1 border-t border-border px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
          <span className="text-primary">{profile.role}@review</span>
          <span className="text-term-dim">:</span>
          <span className="text-foreground">~</span>
          <span className="text-primary" aria-hidden>
            $&nbsp;
          </span>
          <span className="text-foreground">{command}</span>
          <span
            aria-hidden
            className="inline-block h-[1em] w-[0.5em] translate-y-[0.15em] animate-caret-blink bg-primary"
          />
        </div>
      </header>

      {bootNote ? (
        <p className="px-1 font-mono text-[11px] text-term-dim">
          <span aria-hidden># </span>
          {bootNote}
        </p>
      ) : null}

      <main className={cn("flex flex-1 flex-col gap-4", className)}>{children}</main>
    </div>
  );
}
