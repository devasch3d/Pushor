-- =============================================================================
-- 0001_schema.sql
-- 成员截图验收终端 · 表结构 / 索引 / 数据库层守卫
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
