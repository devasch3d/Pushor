-- =============================================================================
-- Pushor · 一次性初始化脚本
--
-- 用法：把本文件【全部内容】复制进 Supabase 控制台 → SQL Editor → Run。
--       只需要跑这一次。整个脚本是幂等的，重复跑也不会出错或产生重复对象。
--
-- 内容 = migrations/0001..0006 六份合并，
--        单份文件仍保留在 supabase/migrations/ 下，供 supabase CLI 使用。
--
-- 预期结果：Success。可能会看到几条 NOTICE，那是脚本在报告
--          「storage 权限是否可用」，属于正常输出，不是错误。
-- =============================================================================


-- #####################################################################
-- #####  来自 migrations/0001_schema.sql
-- #####################################################################

-- =============================================================================
-- 0001_schema.sql
-- Pushor · 表结构 / 索引 / 数据库层守卫
--
-- 幂等：可重复执行。
-- 命名约定：全部使用非限定表名（不加 public. 前缀），
--           这样同一份 SQL 既能跑在你自己的 Supabase 项目里，
--           也能跑在 QW Pages 的 Page-owned tenant schema 里。
--
-- 本系统只做「截图提交 + 人工审核」。
-- 没有任何金额 / 账本 / 日结 / 余额 / 转账 / 支付相关的表或字段。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- profiles：角色与显示名。role 只有 admin / member 两种。
-- -----------------------------------------------------------------------------
create table if not exists profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  role         text not null default 'member' check (role in ('admin', 'member')),
  display_name text,
  created_at   timestamptz not null default now()
);

comment on table profiles is
  '应用角色表。role=admin 由管理员在数据库里手动指定，普通用户首次登录只能自建 role=member。';

-- -----------------------------------------------------------------------------
-- tasks：成员要打卡的活动。category 只有 study / review / exercise。
-- -----------------------------------------------------------------------------
create table if not exists tasks (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references profiles (id) on delete cascade,
  title      text not null,
  category   text not null check (category in ('study', 'review', 'exercise')),
  due_date   date null,
  status     text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now()
);

comment on table tasks is
  '打卡任务。不做任何日历同步，任务由管理员手动创建。';

-- -----------------------------------------------------------------------------
-- submissions：截图提交记录 + 审核结果。
-- image_url 存的是 Storage object path（例如 <member-uuid>/<file-uuid>.png），
-- 因为 screenshots bucket 是私有的，前端读取时再换成临时签名 URL。
-- -----------------------------------------------------------------------------
create table if not exists submissions (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references tasks (id) on delete cascade,
  member_id   uuid not null references profiles (id) on delete cascade,
  image_url   text not null,
  note        text,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note  text,
  reviewed_at timestamptz,
  -- 驳回后重新提交时，新记录用 replaces_id 指向那条被驳回的旧记录。
  -- 旧记录保持 rejected 不动，形成可追溯的链条。
  replaces_id uuid null references submissions (id) on delete set null,
  created_at  timestamptz not null default now()
);

comment on table submissions is
  '截图提交与人工审核结果。status: pending=待审 / approved=通过 / rejected=驳回。';

-- -----------------------------------------------------------------------------
-- 索引
--   前三条是需求指定的；后面几条是外键列索引，
--   缺了它们在做 on delete cascade 时会对父表加长时间锁，属于必要的常规索引。
-- -----------------------------------------------------------------------------
create index if not exists submissions_status_idx      on submissions (status);
create index if not exists submissions_reviewed_at_idx on submissions (reviewed_at);
create index if not exists submissions_member_id_idx   on submissions (member_id);

create index if not exists submissions_task_id_idx     on submissions (task_id);
create index if not exists submissions_replaces_id_idx on submissions (replaces_id);
-- admin 待审队列固定按 (status='pending', created_at asc) 查，这条复合索引直接命中
create index if not exists submissions_pending_created_at_idx
  on submissions (created_at asc) where status = 'pending';

create index if not exists tasks_member_id_idx on tasks (member_id);
create index if not exists tasks_status_idx   on tasks (status);

-- -----------------------------------------------------------------------------
-- is_admin()：当前请求者是不是管理员。
--
-- 为什么用 security definer：RLS policy 里如果直接写
--   exists (select 1 from profiles where id = auth.uid() and role = 'admin')
-- 这个子查询本身又会触发 profiles 的 RLS policy，而那条 policy 又调用同一个判断，
-- 造成递归。security definer 让函数以属主身份执行、绕过 RLS，从而终止递归。
--
-- 注意：这里故意不 pin search_path，因为本项目要求 SQL 不出现 public. 前缀，
-- 以便同一份 migration 能在 QW Pages 的 tenant schema 里正确解析到 profiles。
-- -----------------------------------------------------------------------------
create or replace function is_admin ()
  returns boolean
  language sql
  stable
  security definer
as $$
  select exists (
    select 1
    from profiles
    where id = auth.uid ()
      and role = 'admin'
  );
$$;

-- -----------------------------------------------------------------------------
-- profiles_role_guard：防止普通成员把自己的 role 改成 admin（提权）。
-- RLS 里已经用 with check (role = 'member') 挡了一次，这里是数据库层的第二道锁，
-- 因为 RLS 的 UPDATE policy 无法表达「只有某一列不许改」。
-- -----------------------------------------------------------------------------
create or replace function profiles_role_guard ()
  returns trigger
  language plpgsql
as $$
begin
  if not is_admin () then
    if new.role is distinct from old.role then
      raise exception 'forbidden: only admin can change profiles.role';
    end if;
    if new.id <> auth.uid () then
      raise exception 'forbidden: cannot update another member profile';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_role_guard_trigger on profiles;
create trigger profiles_role_guard_trigger
  before update on profiles
  for each row
  execute function profiles_role_guard ();

-- -----------------------------------------------------------------------------
-- submissions_review_guard：把「审核」这件事的完整规则压到数据库层。
--
-- RLS policy 能表达：谁能改、status 只能从 pending 变成 approved/rejected、
--                     驳回必须填 admin_note。
-- RLS policy 表达不了：只有 status 和 admin_note 这两列可以改
--                     （image_url / member_id / task_id / note 必须原封不动）。
-- 所以用 BEFORE UPDATE trigger 补齐，并顺手把 reviewed_at 打成 now()。
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

drop trigger if exists submissions_review_guard_trigger on submissions;
create trigger submissions_review_guard_trigger
  before update on submissions
  for each row
  execute function submissions_review_guard ();

-- #####################################################################
-- #####  来自 migrations/0002_rls.sql
-- #####################################################################

-- =============================================================================
-- 0002_rls.sql
-- 行级安全策略。所有权限规则都在数据库层表达，前端判断只是 UX，不是安全边界。
--
-- 依赖：先执行 0001_schema.sql（提供 profiles / tasks / submissions / is_admin()）。
-- 幂等：每个 policy 先 drop if exists 再 create，可重复执行。
--
-- 关于 submissions 插入策略里那条 Storage 路径校验：
--   (storage.foldername(image_url))[1] = auth.uid()::text
-- 它的作用是防止成员把别人目录下的对象路径填进来冒充自己的截图。
-- 但某些托管环境不开放 storage schema 的 USAGE 权限，引用它会直接报
--   42501: permission denied for schema storage
-- 所以这里用 DO 块做「能加就加，加不上就降级」：
--   - 你自己的 Supabase 项目：权限齐全，会带上这条校验（更安全）
--   - 无 storage 权限的托管环境：自动退化为不带路径校验的版本，其余规则完全一致
-- 降级只影响「image_url 必须在自己目录下」这一条附加约束，
-- status 强制 pending、只能挂自己的 task、replaces_id 只能指向自己被驳回的记录
-- 这三条核心约束在两种环境下都生效。
-- =============================================================================

alter table profiles    enable row level security;
alter table tasks       enable row level security;
alter table submissions enable row level security;

-- =============================================================================
-- profiles
-- =============================================================================

-- 读：本人读自己；admin 读所有人（admin 队列里要显示提交人名字）
drop policy if exists "profiles_select_own_or_admin" on profiles;
create policy "profiles_select_own_or_admin" on profiles
  for select to authenticated
  using (id = auth.uid () or is_admin ());

-- 写：首次登录时自建 profile，但 role 只能是 'member'。
--     admin 身份必须由管理员在数据库里手动指定（SQL 编辑器 / service role 走的是
--     postgres 角色，天然绕过 RLS）。
drop policy if exists "profiles_insert_self_as_member" on profiles;
create policy "profiles_insert_self_as_member" on profiles
  for insert to authenticated
  with check (id = auth.uid () and role = 'member');

-- 改：本人只能改自己、且 role 必须仍然是 'member'（堵死自助提权）；
--     admin 可以改任何人，包括把 role 提升为 admin。
drop policy if exists "profiles_update_self_or_admin" on profiles;
create policy "profiles_update_self_or_admin" on profiles
  for update to authenticated
  using (id = auth.uid () or is_admin ())
  with check (is_admin () or (id = auth.uid () and role = 'member'));

-- 删：不给任何 policy，任何人都不能通过 API 删 profile。

-- =============================================================================
-- tasks
-- =============================================================================

-- 读：成员只能看自己的任务；admin 看全部
drop policy if exists "tasks_select_own_or_admin" on tasks;
create policy "tasks_select_own_or_admin" on tasks
  for select to authenticated
  using (member_id = auth.uid () or is_admin ());

-- 建 / 改：只有 admin。成员不能自己造任务，也不能自己归档任务。
drop policy if exists "tasks_admin_insert" on tasks;
create policy "tasks_admin_insert" on tasks
  for insert to authenticated
  with check (is_admin ());

drop policy if exists "tasks_admin_update" on tasks;
create policy "tasks_admin_update" on tasks
  for update to authenticated
  using (is_admin ())
  with check (is_admin ());

-- 删：不给 policy。归档（status='archived'）是唯一的下线方式。

-- =============================================================================
-- submissions
-- =============================================================================

-- 读：成员只能看自己提交的；admin 看全部
drop policy if exists "submissions_select_own_or_admin" on submissions;
create policy "submissions_select_own_or_admin" on submissions
  for select to authenticated
  using (member_id = auth.uid () or is_admin ());

-- 写（成员提交截图）：
--   1. 只能写自己的记录            member_id = auth.uid()
--   2. status 被强制钉死为 pending —— 这是「成员无法直接调 API 把自己改成 approved」的关键
--   3. 不能自己填审核结论字段       admin_note / reviewed_at 必须为空
--   4. 只能挂在属于自己的 task 上
--   5. replaces_id 只能指向自己被驳回的旧记录
--   6. （可选，见文件头说明）image_url 必须落在自己的 Storage 目录下
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
    and exists (
      select 1 from tasks t
      where t.id = submissions.task_id
        and t.member_id = auth.uid ()
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
    -- 降级：storage schema 不可用，去掉那一条，其余规则不变
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

-- 改（admin 审核）：
--   using      —— 只允许碰 status 还是 'pending' 的行（已审的不能翻案）
--   with check —— 只能改成 approved / rejected；改成 rejected 时 admin_note 不能为空
--   列级限制（只有 status 和 admin_note 可变）由 submissions_review_guard 触发器补齐。
drop policy if exists "submissions_admin_review" on submissions;
create policy "submissions_admin_review" on submissions
  for update to authenticated
  using (is_admin () and status = 'pending')
  with check (
    is_admin ()
    and status in ('approved', 'rejected')
    and (status <> 'rejected' or coalesce(btrim(admin_note), '') <> '')
  );

-- 成员改自己的 submission：没有任何 for update policy 允许，
-- 因为 submissions_admin_review 的 using 里带了 is_admin()。
-- 驳回后的正确做法是 INSERT 一条新记录并用 replaces_id 指向旧记录。

-- 删：不给 policy。历史记录一律保留。

-- #####################################################################
-- #####  来自 migrations/0003_storage.sql
-- #####################################################################

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

-- #####################################################################
-- #####  来自 migrations/0004_event.sql
-- #####################################################################

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

-- #####################################################################
-- #####  来自 migrations/0005_purge_log.sql
-- #####################################################################

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

-- #####################################################################
-- #####  来自 migrations/0006_multi_file.sql
-- #####################################################################

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
