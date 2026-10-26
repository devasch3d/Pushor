-- =============================================================================
-- 0006_multi_file.sql
-- Pushor · 一次提交支持多个附件
--
-- 变更：
--   1. submissions 增加 image_urls text[] 列（一条提交挂 1..10 个附件）
--   2. image_url 放宽为可空（新版提交只写 image_urls；老列保留兼容旧记录）
--   3. 老记录回填：image_urls = array[image_url]
--   4. 重建成员提交策略：每个附件路径都必须在上传者自己的目录下
--   5. 重建 submissions_review_guard：把 image_urls / event 也纳入不可改列
--
-- 幂等：可重复执行。
-- =============================================================================

alter table submissions add column if not exists image_urls text[];

alter table submissions alter column image_url drop not null;

comment on column submissions.image_urls is
  '附件路径数组（Storage object path 或 data: 内联），一条提交 1..10 个。老记录由 image_url 回填。';

-- 回填老记录（幂等：只碰 image_urls 还是空的行）。
-- 回填是「数据迁移」而不是「审核」，会被 0001 的 submissions_review_guard
-- 触发器当成非 admin 改行拦下来，所以先临时禁用触发器再更新。
alter table submissions disable trigger submissions_review_guard_trigger;

update submissions
   set image_urls = array[image_url]
 where image_urls is null
   and image_url is not null;

alter table submissions enable trigger submissions_review_guard_trigger;

-- -----------------------------------------------------------------------------
-- 重建审核守卫：只有 status / admin_note 可改，其余列（含新增的 image_urls
-- 和此前遗漏的 event）原封不动。
-- -----------------------------------------------------------------------------
create or replace function submissions_review_guard ()
  returns trigger
  language plpgsql
as $$
begin
  if not is_admin () then
    raise exception 'forbidden: only admin can update submissions';
  end if;

  if old.status <> 'pending' then
    raise exception 'submission % is already reviewed (%)', old.id, old.status;
  end if;

  if new.status not in ('approved', 'rejected') then
    raise exception 'invalid review target status: %', new.status;
  end if;

  if new.status = 'rejected' and coalesce(btrim(new.admin_note), '') = '' then
    raise exception 'admin_note is required when rejecting a submission';
  end if;

  if new.image_url   is distinct from old.image_url
     or new.image_urls  is distinct from old.image_urls
     or new.event       is distinct from old.event
     or new.member_id   is distinct from old.member_id
     or new.task_id     is distinct from old.task_id
     or new.note        is distinct from old.note
     or new.replaces_id is distinct from old.replaces_id
     or new.created_at  is distinct from old.created_at then
    raise exception 'only status and admin_note may be changed on a submission';
  end if;

  new.reviewed_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 重建成员提交策略
-- -----------------------------------------------------------------------------
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
      -- 新格式：image_urls 挂 1..10 个附件，每个都非空
      (
        image_urls is not null
        and cardinality(image_urls) between 1 and 10
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
