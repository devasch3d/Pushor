/**
 * 验收测试：直接打 Supabase REST API，逐条验证 RLS 是否真的在数据库层生效。
 *
 * 为什么不用 UI 验：验收标准里最关键的一条是
 *   「成员无法通过直接调 Supabase API 把自己的 submission 改成 approved」
 * 这条只能在 API 层验 —— UI 上点不出来，前端校验也拦不住故意构造的请求。
 * 所以这个脚本刻意绕过应用层，用最原始的 HTTP 请求去撞策略。
 *
 * 两个 PostgREST 语义陷阱（踩过的坑，别再犯）：
 *   1. 部分更新必须用 PATCH。PUT 是「整行替换」，没传的列会被重置成 NULL/默认值，
 *      撞 NOT NULL 约束直接 400，而且会掩盖真正想验的 RLS 行为。
 *   2. 更新命中 0 行时返回 204 空 body（不是 []）。判断「没改到任何行」要同时接受这两种。
 *
 * 用法：
 *   node scripts/acceptance-test.mjs
 *
 * 依赖：项目根目录的 .env.local（Supabase URL + anon key）和 .qa.env（两个测试账号）。
 *       测试账号的 profiles 需要先存在，且 admin 那个的 role 已经是 'admin'。
 *
 * 断言尽量按 id 而不是按行数，这样重复跑、或者库里留有上次跑剩的数据也不会误判。
 *
 * 退出码：全部通过 0，有任何一条失败 1。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv(file) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) {
    throw new Error(`缺少 ${file}，请先按 README 配置`);
  }
  const out = {};
  for (const line of fs.readFileSync(full, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx > 0) out[trimmed.slice(0, idx)] = trimmed.slice(idx + 1).trim();
  }
  return out;
}

const env = { ...loadEnv(".env.local"), ...loadEnv(".qa.env") };
const BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// 1x1 透明 PNG，够 Storage 和签名 URL 用
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const PNG = Buffer.from(PNG_B64, "base64");

let passed = 0;
let failed = 0;
const failures = [];

function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  \x1b[32mPASS\x1b[0m  ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  \x1b[31mFAIL\x1b[0m  ${name}${detail ? `  → ${detail}` : ""}`);
  }
}

function section(title) {
  console.log(`\n\x1b[36m── ${title}\x1b[0m`);
}

/** 更新命中 0 行的两种表现：204 空 body，或 200 + [] */
function affectedZero(res) {
  return res.status === 204 || (Array.isArray(res.body) && res.body.length === 0);
}

function firstRow(res) {
  return Array.isArray(res.body) ? res.body[0] ?? null : null;
}

async function api(token, method, pathname, body, extraHeaders = {}) {
  const headers = { apikey: KEY, ...extraHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined && !(body instanceof Buffer)) headers["Content-Type"] = "application/json";

  const res = await fetch(BASE + pathname, {
    method,
    headers,
    body: body instanceof Buffer ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

async function login(email, password) {
  const r = await api(null, "POST", "/auth/v1/token?grant_type=password", { email, password });
  if (r.status !== 200 || !r.body?.access_token) {
    throw new Error(`登录失败 ${email}: http ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  }
  return r.body.access_token;
}

/** Asia/Shanghai 固定 +08:00，无夏令时，直接偏移即可 */
function todayStartIso() {
  const shifted = new Date(Date.now() + 8 * 3600e3);
  const day = shifted.toISOString().slice(0, 10);
  return new Date(Date.parse(`${day}T00:00:00Z`) - 8 * 3600e3).toISOString();
}

const run = async () => {
  console.log(`目标项目: ${BASE}`);

  section("0. 登录两个验收账号");
  const member = await login(env.QA_MEMBER_EMAIL, env.QA_MEMBER_PASSWORD);
  const admin = await login(env.QA_ADMIN_EMAIL, env.QA_ADMIN_PASSWORD);
  check("member / admin 均登录成功", Boolean(member && admin));

  const memberProfile = firstRow(await api(member, "GET", "/rest/v1/profiles?select=id,role,display_name"));
  const adminProfile = firstRow(await api(admin, "GET", "/rest/v1/profiles?select=id,role,display_name"));
  check("member 的 role = member", memberProfile?.role === "member", JSON.stringify(memberProfile));
  check("admin 的 role = admin", adminProfile?.role === "admin", JSON.stringify(adminProfile));
  const memberId = memberProfile?.id;
  const adminId = adminProfile?.id;

  section("1. 任务：成员不能自建，管理员能建");
  const badTask = await api(member, "POST", "/rest/v1/tasks?select=id", {
    member_id: memberId,
    title: "成员偷建的任务",
    category: "study",
  });
  check("成员 INSERT tasks 被 RLS 拒绝 (403)", badTask.status === 403, `http ${badTask.status}`);

  const taskRes = await api(
    admin,
    "POST",
    "/rest/v1/tasks?select=id,title,category,status",
    { member_id: memberId, title: `验收任务 ${new Date().toISOString().slice(11, 19)}`, category: "study" },
    { Prefer: "return=representation" },
  );
  const task = firstRow(taskRes);
  check("管理员 INSERT tasks 成功 (201)", taskRes.status === 201, `http ${taskRes.status}`);
  const taskId = task?.id;

  const memberTasks = await api(member, "GET", `/rest/v1/tasks?select=id&member_id=eq.${memberId}`);
  check(
    "成员能 SELECT 到自己的任务，且看不到别人的",
    memberTasks.status === 200 &&
      Array.isArray(memberTasks.body) &&
      memberTasks.body.some((t) => t.id === taskId),
  );

  section("2. Storage：成员只能写自己的目录");
  const ownPath = `${memberId}/acceptance-${Date.now()}.png`;
  const uploadOwn = await api(member, "POST", `/storage/v1/object/screenshots/${ownPath}`, PNG, {
    "Content-Type": "image/png",
    "x-upsert": "false",
  });
  check(
    "成员上传到自己目录成功",
    uploadOwn.status === 200,
    `http ${uploadOwn.status} ${JSON.stringify(uploadOwn.body).slice(0, 120)}`,
  );

  const uploadForeign = await api(member, "POST", `/storage/v1/object/screenshots/${adminId}/stolen.png`, PNG, {
    "Content-Type": "image/png",
  });
  check(
    "成员上传到别人目录被拒 (4xx)",
    uploadForeign.status >= 400,
    `http ${uploadForeign.status} ${JSON.stringify(uploadForeign.body).slice(0, 120)}`,
  );

  section("3. 提交：status 被钉死为 pending");
  const insertPending = await api(
    member,
    "POST",
    "/rest/v1/submissions?select=id,status",
    { task_id: taskId, member_id: memberId, image_url: ownPath, note: "验收提交 #1" },
    { Prefer: "return=representation" },
  );
  const sub1 = firstRow(insertPending);
  check(
    "成员提交成功且 status=pending",
    insertPending.status === 201 && sub1?.status === "pending",
    `http ${insertPending.status}`,
  );

  const insertApproved = await api(member, "POST", "/rest/v1/submissions?select=id", {
    task_id: taskId,
    member_id: memberId,
    image_url: ownPath,
    status: "approved",
  });
  check("成员直接插一条 approved 被拒 (403)", insertApproved.status === 403, `http ${insertApproved.status}`);

  const selfApprove = await api(
    member,
    "PATCH",
    `/rest/v1/submissions?id=eq.${sub1?.id}&select=id,status`,
    { status: "approved" },
    { Prefer: "return=representation" },
  );
  const afterSelfApprove = firstRow(
    await api(member, "GET", `/rest/v1/submissions?id=eq.${sub1?.id}&select=status`),
  );
  check(
    "成员 PATCH 自己的 status→approved 无效（0 行且仍是 pending）",
    affectedZero(selfApprove) && afterSelfApprove?.status === "pending",
    `http ${selfApprove.status} status=${afterSelfApprove?.status}`,
  );

  section("4. 审核：驳回必须写原因，且只能审一次");
  const rejectNoNote = await api(admin, "PATCH", `/rest/v1/submissions?id=eq.${sub1?.id}`, {
    status: "rejected",
  });
  const stillPending = firstRow(
    await api(admin, "GET", `/rest/v1/submissions?id=eq.${sub1?.id}&select=status`),
  );
  check(
    "管理员驳回但不写原因被拒，且报错明确提到 admin_note",
    rejectNoNote.status >= 400 &&
      JSON.stringify(rejectNoNote.body).includes("admin_note") &&
      stillPending?.status === "pending",
    `http ${rejectNoNote.status} ${JSON.stringify(rejectNoNote.body).slice(0, 140)}`,
  );

  const rejectWithNote = await api(
    admin,
    "PATCH",
    `/rest/v1/submissions?id=eq.${sub1?.id}&select=id,status,reviewed_at,admin_note`,
    { status: "rejected", admin_note: "截图里没有日期，看不出是今天完成的" },
    { Prefer: "return=representation" },
  );
  const rejected = firstRow(rejectWithNote);
  check(
    "管理员写原因后驳回成功，reviewed_at 自动打上",
    rejectWithNote.status === 200 && rejected?.status === "rejected" && Boolean(rejected?.reviewed_at),
    `http ${rejectWithNote.status} ${JSON.stringify(rejectWithNote.body).slice(0, 140)}`,
  );

  const reviewAgain = await api(
    admin,
    "PATCH",
    `/rest/v1/submissions?id=eq.${sub1?.id}&select=id`,
    { status: "approved", admin_note: "翻案" },
    { Prefer: "return=representation" },
  );
  const afterAgain = firstRow(
    await api(admin, "GET", `/rest/v1/submissions?id=eq.${sub1?.id}&select=status`),
  );
  check(
    "已审记录不能被二次审核（0 行且仍是 rejected）",
    affectedZero(reviewAgain) && afterAgain?.status === "rejected",
    `http ${reviewAgain.status} status=${afterAgain?.status}`,
  );

  section("5. 重新提交：replaces_id 只能指向自己被驳回的记录");
  const resubmit = await api(
    member,
    "POST",
    "/rest/v1/submissions?select=id,status,replaces_id",
    { task_id: taskId, member_id: memberId, image_url: ownPath, note: "补了日期，重交", replaces_id: sub1?.id },
    { Prefer: "return=representation" },
  );
  const sub2 = firstRow(resubmit);
  check(
    "重新提交成功：新记录 pending 且 replaces_id 指向旧记录",
    resubmit.status === 201 && sub2?.status === "pending" && sub2?.replaces_id === sub1?.id,
    `http ${resubmit.status} ${JSON.stringify(resubmit.body).slice(0, 140)}`,
  );

  const oldStillRejected = firstRow(
    await api(member, "GET", `/rest/v1/submissions?id=eq.${sub1?.id}&select=status`),
  );
  check("旧的被驳回记录保持 rejected 不变", oldStillRejected?.status === "rejected");

  const pendingTarget = firstRow(
    await api(member, "GET", `/rest/v1/submissions?id=eq.${sub2?.id}&select=id,status`),
  );
  const badReplace = await api(member, "POST", "/rest/v1/submissions?select=id", {
    task_id: taskId,
    member_id: memberId,
    image_url: ownPath,
    replaces_id: pendingTarget?.id, // 指向一条 pending，不是 rejected
  });
  check("replaces_id 指向非 rejected 记录被拒 (403)", badReplace.status === 403, `http ${badReplace.status}`);

  section("6. 通过 + 今日已审");
  const approve = await api(
    admin,
    "PATCH",
    `/rest/v1/submissions?id=eq.${sub2?.id}&select=id,status,reviewed_at`,
    { status: "approved", admin_note: "这次可以" },
    { Prefer: "return=representation" },
  );
  const approved = firstRow(approve);
  check(
    "管理员通过成功，reviewed_at 自动打上",
    approve.status === 200 && approved?.status === "approved" && Boolean(approved?.reviewed_at),
    `http ${approve.status}`,
  );

  const today = await api(
    admin,
    "GET",
    `/rest/v1/submissions?reviewed_at=gte.${todayStartIso()}&status=in.(approved,rejected)&select=id,status`,
  );
  const todayIds = new Set((today.body ?? []).map((row) => row.id));
  check(
    "今日已审能同时查到这条驳回和这条通过",
    today.status === 200 && todayIds.has(sub1?.id) && todayIds.has(sub2?.id),
    `命中 ${todayIds.size} 条`,
  );

  section("7. 可见性：成员只看得到自己的");
  const memberSees = await api(member, "GET", "/rest/v1/submissions?select=id,member_id,admin_note");
  const allMine = Array.isArray(memberSees.body) && memberSees.body.every((row) => row.member_id === memberId);
  const rejectedRow = (memberSees.body ?? []).find((row) => row.id === sub1?.id);
  check("成员查到的每一行都是自己的", allMine);
  check(
    "被驳回那条对成员可见且带驳回原因",
    Boolean(rejectedRow?.admin_note?.includes("日期")),
  );

  section("8. 其他越权尝试");
  const selfPromote = await api(member, "PATCH", `/rest/v1/profiles?id=eq.${memberId}`, { role: "admin" });
  const profileAfter = firstRow(await api(member, "GET", "/rest/v1/profiles?select=role"));
  check(
    "成员改自己 role=admin 被拒",
    selfPromote.status >= 400 && profileAfter?.role === "member",
    `http ${selfPromote.status}`,
  );

  const memberArchive = await api(
    member,
    "PATCH",
    `/rest/v1/tasks?id=eq.${taskId}&select=id`,
    { status: "archived" },
    { Prefer: "return=representation" },
  );
  check("成员归档任务无效（0 行）", affectedZero(memberArchive), `http ${memberArchive.status}`);

  const adminArchive = await api(
    admin,
    "PATCH",
    `/rest/v1/tasks?id=eq.${taskId}&select=id,status`,
    { status: "archived" },
    { Prefer: "return=representation" },
  );
  check("管理员归档任务成功", adminArchive.status === 200 && firstRow(adminArchive)?.status === "archived");

  section("9. 签名 URL：本人和 admin 可读，bucket 是私有的");
  const signAsMember = await api(member, "POST", `/storage/v1/object/sign/screenshots/${ownPath}`, {
    expiresIn: 60,
  });
  check("成员能给自己对象生成签名 URL", signAsMember.status === 200, `http ${signAsMember.status}`);

  const signAsAdmin = await api(admin, "POST", `/storage/v1/object/sign/screenshots/${ownPath}`, {
    expiresIn: 60,
  });
  check("admin 能给成员对象生成签名 URL", signAsAdmin.status === 200, `http ${signAsAdmin.status}`);

  const publicRead = await fetch(`${BASE}/storage/v1/object/public/screenshots/${ownPath}`);
  check("bucket 不是公开的（匿名直读 400/404）", publicRead.status >= 400, `http ${publicRead.status}`);

  section("汇总");
  console.log(`  通过 ${passed} / 失败 ${failed}`);
  if (failed > 0) {
    console.log(`  失败项:\n${failures.map((f) => `    - ${f}`).join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log("  \x1b[32m全部验收标准通过。\x1b[0m");
  }
};

run().catch((error) => {
  console.error(`\n\x1b[31m脚本异常中断：\x1b[0m${error?.stack ?? error}`);
  process.exitCode = 1;
});
