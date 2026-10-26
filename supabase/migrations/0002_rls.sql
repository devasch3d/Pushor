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
