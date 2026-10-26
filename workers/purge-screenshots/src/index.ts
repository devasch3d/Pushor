/**
 * Cloudflare Worker：pushor-purge
 *
 * 定时清理 Storage 里的附件。规则（产品决定）：
 *   - 已审核（approved / rejected）：下一次运行时立即删除文件
 *   - 未审核（pending）：上传满 7 天后，在下一次运行时删除文件
 *
 * 只删 Storage 对象；submissions 记录保留（状态 / 原因 / 时间都在）。
 * 删成功后往 purge_log 表插一行，应用端读到 purge_log 就把图片位置显示成占位块。
 *
 * 触发方式：
 *   - 自动：wrangler.toml 里的 cron（每天 UTC 20:00 = 北京 04:00）
 *   - 手动：GET/POST 本 Worker 地址，带请求头 x-cron-secret；加 ?dry=1 只报告不删除
 *
 * 密钥（wrangler secret，不在代码里）：
 *   SUPABASE_SERVICE_ROLE_KEY —— 删 Storage 对象必须用它（RLS 之外唯一有这权限的身份）
 *   CRON_SECRET               —— 手动触发的校验头
 */

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  CRON_SECRET: string;
}

const RETENTION_PENDING_DAYS = 7;
const SCAN_LIMIT = 1000;

interface SubmissionRow {
  id: string;
  status: string;
  image_url: string | null;
  image_urls: string[] | null;
  created_at: string;
}

/** 一条提交要清理的全部 Storage 路径（新列 image_urls + 兼容老列 image_url，排除内联） */
function purgeRefs(row: SubmissionRow): string[] {
  const refs = Array.isArray(row.image_urls) ? [...row.image_urls] : [];
  if (row.image_url && !refs.includes(row.image_url)) refs.push(row.image_url);
  return refs.filter(
    (ref) => typeof ref === "string" && ref.length > 0 && !ref.startsWith("data:"),
  );
}

interface PurgeSummary {
  dryRun: boolean;
  cutoff: string;
  scanned: number;
  removed: number;
  logged: number;
  failed: number;
  targets?: string[];
}

async function fetchJson<T>(url: string, key: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok && res.status !== 404 && res.status !== 409) {
    throw new Error(`${init?.method ?? "GET"} ${url} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return (await res.json().catch(() => null)) as T;
}

async function purge(env: Env, dryRun: boolean): Promise<PurgeSummary> {
  const base = env.SUPABASE_URL.replace(/\/+$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const cutoff = new Date(Date.now() - RETENTION_PENDING_DAYS * 86400_000).toISOString();

  // 已审核的全部命中；pending 只命中上传满 7 天的。
  // 不在 URL 上过滤 data: 内联 —— 新版记录 image_url 为 null，
  // not.like 对 null 判 UNKNOWN 会把整行排掉，统一放到代码里过滤。
  const rows = await fetchJson<SubmissionRow[]>(
    `${base}/rest/v1/submissions?select=id,status,image_url,image_urls,created_at` +
      `&or=(status.neq.pending,and(status.eq.pending,created_at.lt.${encodeURIComponent(cutoff)}))` +
      `&limit=${SCAN_LIMIT}`,
    key,
  );

  // 已经清过的不再碰
  const logged = await fetchJson<{ submission_id: string }[]>(
    `${base}/rest/v1/purge_log?select=submission_id&limit=5000`,
    key,
  ).catch(() => [] as { submission_id: string }[]);
  const loggedIds = new Set((logged ?? []).map((row) => row.submission_id));

  const targets = (rows ?? [])
    .map((row) => ({ row, refs: purgeRefs(row) }))
    .filter(({ row, refs }) => refs.length > 0 && !loggedIds.has(row.id));

  const summary: PurgeSummary = {
    dryRun,
    cutoff,
    scanned: targets.length,
    removed: 0,
    logged: 0,
    failed: 0,
  };

  if (dryRun) {
    summary.targets = targets.map(({ row, refs }) => `${row.status} ${refs.join(" ")}`);
    return summary;
  }

  for (const { row, refs } of targets) {
    let rowFailed = false;
    for (const ref of refs) {
      try {
        const del = await fetch(`${base}/storage/v1/object/screenshots/${ref}`, {
          method: "DELETE",
          headers: { apikey: key, Authorization: `Bearer ${key}` },
        });
        // 404 = 对象已经不在了，视作成功，继续记日志避免每天重试
        if (!del.ok && del.status !== 404) {
          rowFailed = true;
        } else {
          summary.removed += 1;
        }
      } catch (error) {
        rowFailed = true;
        console.error(`purge ${row.id} ${ref} failed:`, error);
      }
    }

    // 有文件没删干净就不记台账，下次运行重试整条
    if (rowFailed) {
      summary.failed += 1;
      continue;
    }

    try {
      await fetchJson(
        `${base}/rest/v1/purge_log`,
        key,
        { method: "POST", body: JSON.stringify({ submission_id: row.id }), headers: { Prefer: "return=minimal" } },
      );
      summary.logged += 1;
    } catch (error) {
      summary.failed += 1;
      console.error(`purge_log ${row.id} failed:`, error);
    }
  }

  return summary;
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      purge(env, false)
        .then((summary) => console.log("purge done:", JSON.stringify(summary)))
        .catch((error) => console.error("purge error:", error)),
    );
  },

  async fetch(req: Request, env: Env) {
    const provided = req.headers.get("x-cron-secret");
    if (!env.CRON_SECRET || provided !== env.CRON_SECRET) {
      return new Response("forbidden", { status: 403 });
    }
    const url = new URL(req.url);
    const dryRun = url.searchParams.has("dry") || req.headers.get("x-dry-run") === "1";
    try {
      return Response.json(await purge(env, dryRun));
    } catch (error) {
      return Response.json({ error: String(error) }, { status: 500 });
    }
  },
};
