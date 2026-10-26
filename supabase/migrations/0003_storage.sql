-- =============================================================================
-- 0003_storage.sql
-- Storage bucket「screenshots」及其读写策略。
--
-- 依赖：0001_schema.sql（提供 is_admin()）。
-- 幂等：可重复执行。
--
-- bucket 是私有的（public = false）：
--   写入 = 成员把截图上传到 <自己的 uuid>/ 目录下
--   读取 = 本人读自己目录下的对象，或 admin 读所有对象
--   前端拿到的是 createSignedUrl 生成的短时效链接，不是永久公开链接。
--
-- 整体包在 DO 块里做「能建就建，建不上就跳过」：
-- 部分托管环境不给 migration 角色开放 storage schema 的权限，
-- 这时会打印一条 notice 并跳过，而不是让整个 migration 失败。
-- 应用侧检测到 Storage 不可用时会自动改用内联图片（见 lib/storage.ts）。
-- 在你自己的 Supabase 项目里权限齐全，下面这些会正常创建。
-- =============================================================================

do $do$
begin
  insert into storage.buckets (id, name, public)
  values ('screenshots', 'screenshots', false)
  on conflict (id) do update
    set public = excluded.public;

  -- ---------------------------------------------------------------------------
  -- 上传：只有登录用户，且对象路径的第一段必须是自己的 uuid。
  -- 这样 A 成员没法把文件写进 B 成员的目录，也没法写到 bucket 根目录。
  -- ---------------------------------------------------------------------------
  drop policy if exists "screenshots_member_upload_own_folder" on storage.objects;
  create policy "screenshots_member_upload_own_folder" on storage.objects
    for insert to authenticated
    with check (
      bucket_id = 'screenshots'
      and (storage.foldername(name))[1] = auth.uid ()::text
    );

  -- ---------------------------------------------------------------------------
  -- 读取：本人读自己目录，或 admin 读整个 bucket。
  -- is_admin() 是 security definer，绕过 profiles 的 RLS，避免递归。
  -- ---------------------------------------------------------------------------
  drop policy if exists "screenshots_owner_or_admin_read" on storage.objects;
  create policy "screenshots_owner_or_admin_read" on storage.objects
    for select to authenticated
    using (
      bucket_id = 'screenshots'
      and (
        (storage.foldername(name))[1] = auth.uid ()::text
        or is_admin ()
      )
    );

  -- ---------------------------------------------------------------------------
  -- 覆盖 / 删除：故意不给任何 policy。
  -- 截图是审核证据，提交后不可被覆盖或删除；重新提交走「新建一条 submission」。
  -- 管理员如需清理，请用 SQL 编辑器 / service role 在数据库层操作。
  -- ---------------------------------------------------------------------------

  raise notice 'screenshots bucket 与读写策略已就绪';
exception when others then
  raise notice 'storage schema 不可用，已跳过 screenshots bucket（%）。应用会自动回退到内联图片存储。', SQLERRM;
end
$do$;
