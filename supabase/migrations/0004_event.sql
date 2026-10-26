-- =============================================================================
-- 0004_event.sql
-- Pushor · 成员自填「事件」+「描述」，不再依赖管理员布置的 tasks
--
-- 变更：
--   1. submissions 增加 event 列（成员键入的事件名）
--   2. task_id 放宽为可空（新版提交不再挂任务；老记录保持原值）
--   3. 老记录用其任务标题回填 event，避免列表空白
--   4. 重建成员提交策略：事件必填；task_id 为空或属于本人都放行
--
-- 幂等：可重复执行。tasks 表保留不删（老记录还指着它），只是新流程不再使用。
-- =============================================================================

alter table submissions add column if not exists event text;

alter table submissions alter column task_id drop not null;

update submissions s
   set event = t.title
  from tasks t
 where s.task_id = t.id
   and coalesce(btrim(s.event), '') = '';

drop policy if exists "submissions_member_insert_pending" on submissions;

do $do$
declare
  core_check text;
begin
  core_check := $chk$
    member_id = auth.uid ()
    and status = 'pending'
    and admin_note is null
    and reviewed_at is null
    and coalesce(btrim(event), '') <> ''
    and (
      task_id is null
      or exists (
        select 1 from tasks t
        where t.id = submissions.task_id
          and t.member_id = auth.uid ()
      )
    )
    and (
      replaces_id is null
      or exists (
        select 1 from submissions s
        where s.id = submissions.replaces_id
          and s.member_id = auth.uid ()
          and s.status = 'rejected'
      )
    )
  $chk$;

  begin
    -- 首选：带 Storage 路径校验
    execute format(
      'create policy "submissions_member_insert_pending" on submissions
         for insert to authenticated
         with check (%s and (storage.foldername(image_url))[1] = auth.uid ()::text)',
      core_check
    );
    raise notice 'submissions_member_insert_pending: 已启用（含 storage 路径校验）';
  exception when others then
    execute format(
      'create policy "submissions_member_insert_pending" on submissions
         for insert to authenticated
         with check (%s)',
      core_check
    );
    raise notice 'submissions_member_insert_pending: 已启用（storage schema 不可用，跳过路径校验：%）', SQLERRM;
  end;
end
$do$;
