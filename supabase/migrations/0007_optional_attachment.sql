-- =============================================================================
-- 0007_optional_attachment.sql
-- Pushor · 附件改为选填：一次提交可以不带任何附件（0..10 个）
--
-- 变更：重建成员提交策略，把附件数量下限从 1 放宽到 0。
--       其余规则（事件必填、路径归属、数量上限 10、replaces_id 等）不变。
--
-- 幂等：可重复执行。
-- =============================================================================

drop policy if exists "submissions_member_insert_pending" on submissions;

do $do$
declare
  core_check text;
begin
  core_check := $chk$
    member_id = auth.uid ()
    and status = 'pending'
    and admin_note is null and reviewed_at is null
    and coalesce(btrim(event), '') <> ''
    and (
      -- 新格式：image_urls 挂 0..10 个附件（选填），每个都非空
      (
        image_urls is not null
        and cardinality(image_urls) <= 10
        and not exists (
          select 1 from unnest(image_urls) as u (ref)
          where coalesce(btrim(u.ref), '') = ''
        )
      )
      -- 旧格式：单附件 image_url（兼容老客户端 / 验收脚本）
      or (image_urls is null and image_url is not null)
    )
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
    -- 首选：带 Storage 路径校验（两列的每个路径都必须在自己目录下）
    execute format(
      'create policy "submissions_member_insert_pending" on submissions
         for insert to authenticated
         with check (%s
           and (image_url is null
                or (storage.foldername(image_url))[1] = auth.uid ()::text)
           and (image_urls is null
                or not exists (
                  select 1 from unnest(image_urls) as u (ref)
                  where (storage.foldername(u.ref))[1] is distinct from auth.uid ()::text
                )))',
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
