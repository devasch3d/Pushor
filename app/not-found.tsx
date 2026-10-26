import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
      <pre
        aria-hidden
        className="select-none font-mono text-xs leading-tight text-primary/70"
      >
        {["╔╦╗╔═╗╔╦╗╔═╗╔╦╗", "║║║║ ║ ║║║╣ ║║║", "╩ ╩╚═╝═╩╝╚═╝╩ ╩"].join("\n")}
      </pre>
      <p className="font-mono text-xs text-muted-foreground">
        <span className="text-term-dim"># </span>
        这个路径没有对应的命令。
      </p>
      <div className="flex items-center gap-2">
        <Link
          href="/"
          className="border border-primary/60 bg-primary/15 px-4 py-2 font-mono text-xs uppercase tracking-[0.14em] text-primary hover:bg-primary/25"
        >
          $ 回到主控台
        </Link>
        <Link
          href="/login"
          className="border border-border px-4 py-2 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground hover:border-primary/50 hover:text-primary"
        >
          $ 去登录
        </Link>
      </div>
    </main>
  );
}
