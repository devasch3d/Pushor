// Supabase Edge Function: purge-screenshots
//
// 由数据库里的 pg_cron 每天定时呼叫（请求头带 x-cron-secret 校验）。
// 删除规则（产品决定）：
//   - 已审核（approved / rejected）：下一次呼叫时立即删除文件
//   - 未审核（pending）：上传满 7 天后，在下一次呼叫时删除文件
//
// 只删 Storage 对象；数据库记录保留（状态、原因、时间都在），
// image_url 改写为 `purged:<submission-id>` 作为墓碑，
// 前端遇到取不到签名 URL 会显示占位块，不会报错。
//
// 依赖的密钥：CRON_SECRET（用 `supabase secrets set` 配置）。
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 由 Edge Function 运行时自动注入。

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RETENTION_PENDING_DAYS = 7;
const CHUNK = 50;
const SCAN_LIMIT = 1000;

Deno.serve(async (req: Request) => {
  const secret = Deno.env.get("CRON_SECRET");
  const provided = req.headers.get("x-cron-secret");
  if (!secret || provided !== secret) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return new Response(JSON.stringify({ error: "missing runtime env" }), { status: 500 });
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const cutoff = new Date(Date.now() - RETENTION_PENDING_DAYS * 86400_000).toISOString();

  // 已审核的全部命中；pending 只命中上传满 7 天的
  const { data: rows, error } = await admin
    .from("submissions")
    .select("id, status, image_url, created_at")
    .or(`status.neq.pending,and(status.eq.pending,created_at.lt.${cutoff})`)
    .not("image_url", "like", "data:%")
    .not("image_url", "like", "purged:%")
    .limit(SCAN_LIMIT);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const targets = (rows ?? []).filter(
    (row) =>
      typeof row.image_url === "string" &&
      !row.image_url.startsWith("data:") &&
      !row.image_url.startsWith("purged:"),
  );

  let removed = 0;
  let marked = 0;
  let failed = 0;

  for (let i = 0; i < targets.length; i += CHUNK) {
    const chunk = targets.slice(i, i + CHUNK);
    const paths = chunk.map((row) => row.image_url as string);

    const { error: removeError } = await admin.storage.from("screenshots").remove(paths);
    if (removeError) {
      failed += chunk.length;
      continue;
    }
    removed += chunk.length;

    for (const row of chunk) {
      const { error: updateError } = await admin
        .from("submissions")
        .update({ image_url: `purged:${row.id}` })
        .eq("id", row.id);
      if (!updateError) marked += 1;
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      cutoff,
      scanned: targets.length,
      removed,
      marked,
      failed,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
});
