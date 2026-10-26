-- =============================================================================
-- 0005_purge_log.sql
-- Pushor · 附件定时清理的台账表
--
-- purge_log 记录「哪条提交的附件文件已经被清理 Worker 删掉」。
--   - 删除动作由 Cloudflare Worker（pushor-purge）用 service_role 执行
--   - 应用端读到 purge_log 就把图片位置显示成占位块，不去生成签名 URL
--   - submissions 记录本身永远保留（状态 / 原因 / 时间都在）
--
-- RLS：只开 select 给登录用户。insert 不给策略 ——
--       只有 service_role 会写它，而 service_role 天然绕过 RLS。
--
-- 幂等：可重复执行。
-- =============================================================================

create table if not exists purge_log (
  submission_id uuid primary key references submissions (id) on delete cascade,
  purged_at     timestamptz not null default now()
);

alter table purge_log enable row level security;

drop policy if exists "purge_log_read_authenticated" on purge_log;
create policy "purge_log_read_authenticated" on purge_log
  for select to authenticated
  using (true);
