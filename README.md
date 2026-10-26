# 成员截图验收终端 (screenshot-review-terminal)

成员在自学、复习、运动等活动结束后上传打卡截图；管理员在一个终端风格的 Web 后台里
查看待审截图，给出 **通过** 或 **驳回（必须写原因）**。

> **这个系统只做截图的提交与人工审核。**
> 不计算金额、不记账、不做日结、没有余额、不能转账、不接任何支付。
> 数据模型里也只有三张表，没有 `ledger` / `settlement` / `balance` 之类的东西。

---

## 技术栈

| 层 | 选型 |
| --- | --- |
| 框架 | Next.js 14 App Router + TypeScript |
| 样式 | Tailwind CSS + shadcn/ui（组件源码在 `components/ui/`，非黑盒依赖） |
| 后端 | Supabase：Postgres + Auth（邮箱密码）+ Storage |
| 权限 | Postgres RLS + 触发器，**不靠前端判断** |
| 部署 | Vercel（也可作为 QW Pages dynamic runtime 发布，见文末） |

依赖里没有任何支付 / 账本 / 日历同步相关的包。

---

## 目录结构

```
.
├── app/
│   ├── login/page.tsx            邮箱密码登录 / 注册，成功后按 role 跳转
│   ├── member/page.tsx           成员端：任务列表 + 提交截图 + 我的提交
│   ├── admin/page.tsx            管理端：待审队列 + 今日已审 + 任务管理
│   ├── api/config/route.ts       运行时把 Supabase 连接信息给到浏览器端
│   ├── auth/actions.ts           signIn / signUp / signOut（Server Action）
│   ├── member/actions.ts         submitScreenshot
│   ├── admin/actions.ts          reviewSubmission / archiveTask / restoreTask / createTask
│   ├── error.tsx · not-found.tsx · globals.css · layout.tsx · page.tsx
├── components/
│   ├── ui/                       shadcn/ui 基础组件（button/input/dialog/...）
│   ├── terminal/                 终端皮肤：外壳、面板、状态标签、截图预览
│   ├── member/                   提交表单、我的提交、重新提交弹窗
│   └── admin/                    待审队列、审核面板、今日已审、任务管理
├── lib/
│   ├── supabase/{env,client,server,middleware}.ts
│   ├── session.ts                requireMember / requireAdmin 守卫
│   ├── queries.ts                所有读查询 + 批量签名 URL
│   ├── storage.ts                截图上传（Storage 主路径 + 内联降级）
│   ├── time.ts                   业务时区下的「今日」计算
│   ├── types.ts · types/database.ts
│   └── utils.ts
├── supabase/migrations/
│   ├── 0001_schema.sql           三张表、索引、守卫函数与触发器
│   ├── 0002_rls.sql              RLS 策略（权限规则的正身）
│   └── 0003_storage.sql          screenshots bucket 与读写策略
├── scripts/build-page-runtime.mjs 打包 QW Pages dynamic runtime
├── scripts/acceptance-test.mjs     27 条 RLS / 流程验收用例，直接打 Supabase API
├── middleware.ts                 会话续期 + 未登录重定向
└── .env.example
```

---

## 验收测试

```bash
node scripts/acceptance-test.mjs
```

它**绕过应用层、直接打 Supabase REST API**，因为最关键的验收标准
（成员无法通过直接调 API 把自己的 submission 改成 approved）只能在 API 层验。
27 条用例覆盖：角色可见性、成员不能建任务、Storage 目录隔离、status 强制 pending、
驳回必须写原因、已审不能翻案、`replaces_id` 只能指向自己被驳回的记录、
今日已审的时间边界、签名 URL 与 bucket 私有性。

前置条件：

1. `.env.local` 已配好（见上文）
2. 在项目根建一个 `.qa.env`（已被 .gitignore 忽略），写明两个测试账号：
   ```bash
   QA_MEMBER_EMAIL=qa-member@example.com
   QA_MEMBER_PASSWORD=...
   QA_ADMIN_EMAIL=qa-admin@example.com
   QA_ADMIN_PASSWORD=...
   ```
3. 这两个账号的 `profiles` 已存在，且 admin 那个的 `role` 已经是 `'admin'`
4. Authentication 里 **Confirm email 已关闭**（否则登录拿不到会话）

断言按 id 而不是按行数写，所以重复跑、或库里留有上次跑剩的数据都不会误判。
全部通过时退出码为 0，可直接挂进 CI。

---

## 本地启动

### 1. 建 Supabase 项目

去 [database.new](https://database.new) 建一个项目，然后在 **Project Settings → API**
拿到 `Project URL` 和 `anon public` key。

> 本项目**不需要** `service_role` key。全程只用 anon key，权限由 RLS 负责。
> 请不要把 service_role key 写进任何环境变量。

### 2. 配置环境变量

```bash
cp .env.example .env.local
```

编辑 `.env.local`：

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
# 可选：业务时区，默认 Asia/Shanghai，影响「今日已审」的日期边界
# APP_TIME_ZONE=Asia/Shanghai
```

### 3. 跑 migration

打开 Supabase 控制台 **SQL Editor**，按顺序把这三个文件的内容各跑一遍：

```
supabase/migrations/0001_schema.sql   -- 表 / 索引 / 守卫触发器
supabase/migrations/0002_rls.sql      -- RLS 策略
supabase/migrations/0003_storage.sql  -- screenshots bucket 与存储策略
```

三个文件都是**幂等**的（`create table if not exists` + `drop policy if exists`），
重跑不会出问题。也可以用 CLI：

```bash
supabase db push    # 或 supabase migration up
```

### 4. 打开邮箱密码登录

**Authentication → Sign In / Up → Email**：确认 `Enable Email provider` 是开的。

- 本地调试建议**关掉** `Confirm email`，注册完直接能登录，省得配 SMTP。
- 生产环境建议开着，注册后需要用户去邮箱点确认链接（前端会给出提示）。

### 5. 起服务

```bash
npm install
npm run dev
```

打开 <http://localhost:3000>，未登录会被送到 `/login`。

### 常用命令

```bash
npm run dev         # 本地开发
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
npm run build       # 生产构建（output: standalone）
npm run start       # 跑生产构建
npm run build:page  # 打包 QW Pages dynamic runtime 到 .page-runtime/
```

---

## 手动把用户设为 admin

角色只存在 `profiles.role` 里，**页面上没有提权入口**，也不做邀请流程。

### 步骤

1. 先让这个人用邮箱在 `/login` 注册一次。
   首次登录/注册时应用会自动往 `profiles` 插一行 `role = 'member'`
   （RLS 的 `profiles_insert_self_as_member` 策略只允许 `role='member'`，
   所以这一步不可能被用来自己提权）。

2. 在 Supabase 控制台 **SQL Editor** 里执行：

   ```sql
   -- 查一下有哪些人
   select p.id, u.email, p.role, p.display_name, p.created_at
   from profiles p
   join auth.users u on u.id = p.id
   order by p.created_at;

   -- 把指定邮箱的人提升为 admin
   update profiles
   set role = 'admin'
   where id = (select id from auth.users where email = 'you@example.com');
   ```

3. 让这个人**退出再登录**（角色是登录时读出来的）。之后他会落到 `/admin`。

> SQL 编辑器用的是 `postgres` 角色，天然绕过 RLS，所以管理员改 role 不会被策略拦住。

### 如果这个人在 profiles 里还没有记录

比如你是直接在 Supabase **Authentication → Users** 里手建的用户，那就手动插一行：

```sql
insert into profiles (id, role, display_name)
select id, 'admin', '管理员'
from auth.users
where email = 'you@example.com'
on conflict (id) do update set role = 'admin';
```

### 降级 / 回收权限

```sql
update profiles set role = 'member'
where id = (select id from auth.users where email = 'someone@example.com');
```

---

## 创建 task

有两种方式。

### 方式 A：在 `/admin` 页面上建（推荐）

管理员登录后，`/admin` 页面最下面的 **任务管理** 面板 → 点 `新建任务` →
选成员、选分类（`study` / `review` / `exercise`）、填标题、可选截止日期 → 创建。

任务创建后，对应成员在 `/member` 的「任务列表」里就能看到，也能在提交表单里选中它。

### 方式 B：SQL 里建

```sql
insert into tasks (member_id, title, category, due_date)
values (
  (select id from profiles where display_name = '阿明'),  -- 或用 auth.users 的邮箱反查
  '每天 30 分钟英语听力',
  'study',                                                -- study | review | exercise
  current_date + interval '7 day'                         -- 不需要截止日期就写 null
);
```

批量派同一个任务给所有成员：

```sql
insert into tasks (member_id, title, category, due_date)
select p.id, '每周三次 3 公里', 'exercise', current_date + interval '14 day'
from profiles p
where p.role = 'member';
```

### 归档任务

`/admin` → 任务管理 → 对应行的 `归档` 按钮。归档是**软下线**：
数据不删，成员端不再能对它提交新截图，历史提交记录仍然可查。
误操作可以点 `恢复` 撤回。

---

## 数据模型

只有三张表：

```
profiles     id(uuid, →auth.users) · role(admin|member) · display_name · created_at
tasks        id · member_id(→profiles) · title · category(study|review|exercise)
             · due_date · status(active|archived) · created_at
submissions  id · task_id(→tasks) · member_id(→profiles) · image_url · note
             · status(pending|approved|rejected) · admin_note · reviewed_at
             · replaces_id(→submissions) · created_at
```

两个实现细节：

- **`image_url` 存的是 Storage object path**（形如 `<member-uuid>/<file-uuid>.png`），
  不是公开链接。因为 `screenshots` bucket 是私有的，
  页面渲染时用 `createSignedUrls` 批量换成 10 分钟有效的签名 URL。
- **`replaces_id`** 用于「驳回后重新提交」：旧记录保持 `rejected` 原封不动，
  新建一条 `pending` 记录并把 `replaces_id` 指向旧的，形成可追溯链条。

索引：`submissions(status)`、`submissions(reviewed_at)`、`submissions(member_id)`
（需求指定的三条），另外补了 `submissions(task_id)`、`submissions(replaces_id)`、
`tasks(member_id)` 这些外键列索引，以及一条 `status='pending'` 的部分索引给待审队列用。

---

## 权限模型（RLS 是唯一的真边界）

前端判断只是 UX。真正拦住越权的是数据库。

| 操作 | member | admin |
| --- | --- | --- |
| 看 submissions | 只有自己的 | 全部 |
| 看 tasks | 只有自己的 | 全部 |
| 建 submission | ✅ 但 `status` 被钉死为 `pending` | ❌（管理员不代提交） |
| 改 submission 的 `status` / `admin_note` | ❌ **完全没有 update 策略** | ✅ 仅当原 `status='pending'` |
| 改 submission 的其他列 | ❌ | ❌（触发器拦） |
| 建 / 改 / 归档 task | ❌ | ✅ |
| 删任何记录 | ❌ | ❌（没给 delete 策略） |
| 改自己的 `profiles.role` | ❌ | ✅ |

关键策略（`supabase/migrations/0002_rls.sql`）：

```sql
-- 成员提交：status 只能是 pending，审核字段必须为空，图片路径必须在自己目录下
create policy "submissions_member_insert_pending" on submissions
  for insert to authenticated
  with check (
    member_id = auth.uid() and status = 'pending'
    and admin_note is null and reviewed_at is null
    and (storage.foldername(image_url))[1] = auth.uid()::text
    and exists (select 1 from tasks t where t.id = submissions.task_id and t.member_id = auth.uid())
    and (replaces_id is null or exists (
      select 1 from submissions s where s.id = submissions.replaces_id
        and s.member_id = auth.uid() and s.status = 'rejected'))
  );

-- 管理员审核：只能碰 pending 的行，只能改成 approved/rejected，驳回必须写原因
create policy "submissions_admin_review" on submissions
  for update to authenticated
  using (is_admin() and status = 'pending')
  with check (
    is_admin() and status in ('approved','rejected')
    and (status <> 'rejected' or coalesce(btrim(admin_note),'') <> '')
  );
```

RLS 表达不了「只有某几列可以改」，所以额外有一个 `BEFORE UPDATE` 触发器
`submissions_review_guard`（在 `0001_schema.sql`）：非 admin 直接 raise、
非 pending 直接 raise、改了 `image_url` / `member_id` / `task_id` / `note` /
`replaces_id` / `created_at` 直接 raise，并自动把 `reviewed_at` 打成 `now()`。

同理 `profiles_role_guard` 触发器阻止非 admin 修改 `role`，堵住自助提权。

### 自测「成员改不动自己的 status」

用成员账号登录后，在浏览器控制台里直接打 Supabase API（**应该失败**）：

```js
const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
const sb = createClient("<URL>", "<ANON KEY>");
await sb.auth.getSession(); // 复用当前会话

const res = await sb
  .from("submissions")
  .update({ status: "approved" })
  .eq("id", "<你自己的 submission id>")
  .select();

console.log(res); // { data: [], error: {...} } —— 命中 0 行，或直接报 RLS 违规
```

预期结果：`data` 是空数组（RLS 的 `using` 里带了 `is_admin()`，成员一行都碰不到），
数据库里那条记录的 `status` 仍然是 `pending`。

再试一次「成员自己插一条 approved」：

```js
await sb.from("submissions").insert({
  task_id: "<你的 task id>",
  member_id: "<你的 uuid>",
  image_url: "<你的 uuid>/fake.png",
  status: "approved",          // ← 会被 with check 拒绝
}).select();
// error: new row violates row-level security policy for table "submissions"
```

---

## 部署到 Vercel

1. 把仓库推到 GitHub / GitLab，在 Vercel 里 Import。
2. Framework 自动识别为 Next.js，构建命令 `npm run build`，输出目录默认。
3. **Settings → Environment Variables** 加两条（Production / Preview / Development 都加）：

   ```
   NEXT_PUBLIC_SUPABASE_URL      = https://<your-project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY = <anon public key>
   APP_TIME_ZONE                 = Asia/Shanghai   # 可选
   ```

4. Deploy。改完环境变量记得 Redeploy 一次
   （`NEXT_PUBLIC_*` 是构建期内联的，不重新构建不生效）。
5. 在 Supabase **Authentication → URL Configuration** 里把
   `Site URL` 和 `Redirect URLs` 加上你的 Vercel 域名，否则邮箱确认链接会跳回 localhost。

> 不要把 `service_role` key 放进 Vercel 环境变量。这个项目不需要它。

---

## 作为 QW Pages dynamic runtime 发布（可选）

同一份代码可以打包成自包含的 Node 运行时发布，适合快速给别人一个能点开的线上版本：

```bash
npm run build          # 产出 .next/standalone
npm run build:page     # 整理成 .page-runtime/（package.json + server.js + standalone/）
```

`.page-runtime/server.js` 会读 `process.env.PORT` 和 `process.env.HOST`
（默认 `0.0.0.0:8081`），把平台注入的 `SUPABASE_URL` / `SUPABASE_ANON_KEY`
对齐到应用侧变量名，然后拉起 Next。

托管运行时注入的变量名不带 `NEXT_PUBLIC_` 前缀，是构建期拿不到的，
所以浏览器端不从 bundle 里读死值，而是运行时向 `/api/config` 取一次
（`lib/supabase/client.ts`）。在你自己的 Supabase + Vercel 场景下，
`NEXT_PUBLIC_*` 存在，走的是不发请求的快路径。

### 托管环境的两处差异（都已自动适配，不需要你改代码）

**1. schema 不叫 `public`。**
QW Pages 把表放在 Page-owned tenant schema 下，实测形如
`tenant_<SUPABASE_INSTANCE_ID>_schema`。而 supabase-js 默认会发
`Accept-Profile: public`，那样会直接被 PostgREST 拒掉。
`lib/supabase/env.ts` 的 `resolveSchema()` 会按这个优先级取值：

```
显式 SUPABASE_SCHEMA / NEXT_PUBLIC_SUPABASE_SCHEMA
  → 由 SUPABASE_INSTANCE_ID 推导的 tenant_<id>_schema
  → public
```

所以自建 Supabase 项目走 `public`，托管运行时自动走 tenant schema，两边都不用配。

**2. Storage 可能不可用。**
托管实例没给 migration 角色开放 `storage` schema 的权限
（`42501: permission denied for schema storage`），bucket 和存储策略建不出来。
为这件事做了两层适配：

- **SQL 层**：`0002_rls.sql` 里 `submissions_member_insert_pending` 策略用 DO 块
  「能加就加、加不上就降级」——带 `(storage.foldername(image_url))[1] = auth.uid()::text`
  的完整版失败时，自动创建去掉这一条的版本。`0003_storage.sql` 整体包在 DO 块里，
  权限不足时打印一条 notice 跳过，而不是让整个 migration 失败。
  **status 强制 pending、只能挂自己的 task、replaces_id 只能指向自己被驳回的记录**
  这三条核心约束在两种环境下都完整生效。
- **应用层**：`lib/storage.ts` 的 `uploadScreenshot()` 先试私有 bucket，
  遇到「bucket 不存在 / 权限不足 / schema 不可用」这类错误时，
  自动把图片转成 `data:image/...;base64,...` 存进 `image_url`（它本来就是 text）。
  内联模式的大小上限收紧到 3 MB。读取侧 `withSignedUrls()` 认出 `data:` 前缀就原样返回，
  签名调用整体失败也只渲染占位块，不会把列表页打挂。

两种模式是自洽的：完整版 RLS 那条路径校验会拒绝 data URL，
而降级版策略里没有它，所以刚好放行 —— 不需要任何开关或环境变量。

> 在你自己的 Supabase 项目上权限齐全，走的一定是 **Storage 主路径**，
> 内联降级不会触发。它只是为了让没有 Storage 的托管环境也能跑通全流程。

### 托管版本的账号引导

角色只能由管理员在数据库里指定，而一个全新的托管实例里**还没有任何管理员**。
注册进去的用户都是 `member`，`/admin` 对他们不可见 —— 这是设计如此，不是 bug。
要验收管理端流程，需要先给某个账号提权（见上面「手动把用户设为 admin」）。

---

## 明确不做的东西

| 不做 | 说明 |
| --- | --- |
| 金额 / 账本 / 日结 / 余额 / 转账 / 支付 | 数据模型里没有对应字段，依赖里没有对应包，「今日已审」只显示条数 |
| Outlook / Microsoft Graph 日历同步 | 后续再加；当前任务是手动创建或选择 |
| 通知 / 邮件 / 短信 | 驳回原因只在成员端页面上展示 |
| 多级审批 / 批量审核 / 导出报表 | 一次一条，人工看完再点 |
| 成员自审 / 管理员代提交 | RLS 层面就不允许：成员没有 submissions 的 update 策略，admin 没有 insert 策略 |
| 邀请流程 / 自助提权 | 角色由管理员在数据库里指定 |

`.eslintrc.json` 里还挂了一条 `no-restricted-syntax` 规则，
一旦有人写出 `amount` / `balance` / `ledger` / `student` / `parent` / `teacher`
这类标识符，`npm run lint` 会直接报错。

---

## 已知边界

- **签名 URL 有效期 10 分钟**。页面开太久再去点大图可能失效，刷新即可。
- **并发审核**：两个管理员同时审同一条，后到的那次 `update` 命中 0 行
  （action 里带了 `.eq("status","pending")`），前端会提示「这条已经被审过了」。
- **上传大小上限 10 MB**，格式 PNG / JPEG / WebP / GIF，在浏览器侧校验；
  Storage bucket 上没有再设 `file_size_limit`，为的是让 migration 在不同
  Supabase 版本上都能跑通。如果要收紧，在控制台给 `screenshots` bucket 加上限制即可。
- **不提供删除**。截图是审核证据，Storage 上没有 update/delete 策略，
  数据库也没有 delete 策略。真要清理请走 SQL 编辑器。
