/**
 * 把 `next build` 的 standalone 产物整理成 QW Pages 的 dynamic runtime 目录。
 *
 * 产出结构（默认 ./.page-runtime）：
 *   package.json          QW Pages 要求的清单，start = node server.js
 *   server.js             入口包装器：读 process.env.PORT / process.env.HOST，再拉起 Next
 *   standalone/           .next/standalone 的全部内容（含被 trace 出来的最小 node_modules）
 *   standalone/.next/static   静态资源（standalone 不会自动带）
 *   standalone/public/    public 目录（standalone 不会自动带）
 *
 * 用法：npm run build:page
 *
 * 注意：这里不写任何密钥。Supabase 的 URL / anon key 由 QW Pages 运行时注入
 * （SUPABASE_URL / SUPABASE_ANON_KEY），应用侧通过 lib/supabase/env.ts 读取，
 * 浏览器侧通过 /api/config 在运行时取回，因此构建期不需要它们存在。
 */

import { cp, mkdir, rm, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standaloneDir = path.join(projectRoot, ".next", "standalone");
const staticDir = path.join(projectRoot, ".next", "static");
const publicDir = path.join(projectRoot, "public");
const outputDir = path.join(projectRoot, ".page-runtime");

const DEFAULT_PORT = 8081;

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(standaloneDir))) {
    throw new Error(
      "找不到 .next/standalone。请先跑 `npm run build`（next.config.mjs 里已开启 output: 'standalone'）。",
    );
  }

  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  await cp(standaloneDir, path.join(outputDir, "standalone"), { recursive: true });

  if (await exists(staticDir)) {
    await cp(staticDir, path.join(outputDir, "standalone", ".next", "static"), {
      recursive: true,
    });
  }

  if (await exists(publicDir)) {
    await cp(publicDir, path.join(outputDir, "standalone", "public"), { recursive: true });
  }

  await writeFile(
    path.join(outputDir, "package.json"),
    `${JSON.stringify(
      {
        name: "screenshot-review-terminal-runtime",
        version: "0.1.0",
        private: true,
        description:
          "QW Pages dynamic runtime for 成员截图验收终端 (screenshot submission & manual review only).",
        scripts: { start: "node server.js" },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  await writeFile(path.join(outputDir, "server.js"), SERVER_ENTRY, "utf8");

  process.stdout.write(`[ok] runtime ready at ${path.relative(projectRoot, outputDir)}\n`);
  process.stdout.write(`[ok] entrypoint: server.js · default port: ${DEFAULT_PORT}\n`);
}

const SERVER_ENTRY = `/**
 * QW Pages dynamic runtime 入口。
 *
 * 职责只有两件：
 *   1. 把平台注入的 PORT / HOST 翻译成 Next standalone 认识的 PORT / HOSTNAME
 *   2. 把平台注入的 SUPABASE_URL / SUPABASE_ANON_KEY 映射成应用侧读取的变量名
 * 然后拉起 .next/standalone 里的 Next 服务器。
 */

"use strict";

const path = require("node:path");

const port = Number(process.env.PORT) || ${DEFAULT_PORT};
const host = process.env.HOST || process.env.HOSTNAME || "0.0.0.0";

process.env.PORT = String(port);
process.env.HOSTNAME = host;
process.env.NODE_ENV = process.env.NODE_ENV || "production";

// 平台注入的是不带 NEXT_PUBLIC_ 前缀的名字；应用侧的 lib/supabase/env.ts 两者都读，
// 这里做一次对齐，保证服务端渲染和 /api/config 拿到的是同一套值。
if (process.env.SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_URL;
}
if (process.env.SUPABASE_ANON_KEY && !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
}

process.stdout.write(
  "[boot] screenshot-review-terminal listening on " + host + ":" + port + "\\n",
);

require(path.join(__dirname, "standalone", "server.js"));
`;

main().catch((error) => {
  process.stderr.write(`[error] ${error?.stack ?? error}\n`);
  process.exitCode = 1;
});
