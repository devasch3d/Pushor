# Pushor

成员在自学、复习、运动等活动结束后上传打卡截图；管理员在一个终端风格的 Web 后台里
查看待审截图，给出 **通过** 或 **驳回（必须写原因）**。

> **这个系统只做截图的提交与人工审核。**
> 不计算金额、不记账、不做日结、没有余额、不能转账、不接任何支付。
> 数据模型里也只有三张表，没有 `ledger` / `settlement` / `balance` 之类的东西。

---

## 架构（重要：这是纯静态站点）

应用是 **Next.js 14 App Router 的静态导出**（`output: "export"`）：
`next build` 产出纯 HTML/JS/CSS 到 `out/`，**不需要任何 Node 服务器**。
因此可以托管在 Cloudflare Pages、或任何静态托管 / OSS+CDN 上。

所有 Supabase 交互（登录、查询、上传、审核）都在**浏览器端**完成。
这不是「前端裸奔」：安全边界完全在数据库层 ——

- 每条 SQL 都带着当前登录用户的会话，Postgres 的 **RLS 策略**决定他能看到/改动什么；
- 成员把自己的 submission 改成 approved？RLS 的 `with check` 在数据库层直接拒绝；
- 成员读别人的提交？RLS 的 `using` 让他一行都看不见；
- 页面里的角色判断（member 看不到 /admin）**只是 UX**，真正的边界永远是 RLS。

截图存在私有 bucket `screenshots` 里，页面渲染时换成 10 分钟有效的签名 URL。

---

## 技术栈

| 层 | 选型 |
| --- | --- |
| 框架 | Next.js 14 App Router + TypeScript，静态导出 |
| 样式 | Tailwind CSS + shadcn/ui（组件源码在 `components/ui/`，非黑盒依赖） |
| 后端 | Supabase：Postgres（RLS）+ Auth（邮箱密码）+ Storage（私有 bucket） |
| 托管 | Cloudflare Pages（任何静态托管都行） |
| 域名 | Cloudflare DNS |

依赖里没有任何支付 / 账本 / 日历同步相关的包。

---

## 目录结构

```
.
├── app/
│   ├── login/page.tsx            邮箱密码登录，成功后按 role 跳转（无注册入口）
│   ├── member/page.tsx           成员端：任务列表 + 提交截图 + 我的提交
│   ├── admin/page.tsx            管理端：待审队列 + 今日已审 + 任务管理
│   ├── error.tsx · not-found.tsx · globals.css · layout.tsx · page.tsx
├── components/
│   ├── ui/                       shadcn/ui 基础组件（button/input/dialog/...）
│   ├── terminal/                 终端皮肤：外壳、面板、状态标签、截图预览、加载占位
│   ├── member/                   提交表单、我的提交、重新提交弹窗
│   ├── admin/                    待审队列、审核面板、今日已审、任务管理
│   └── auth/login-form.tsx
├── lib/
│   ├── supabase/client.ts        浏览器端 Supabase 单例（NEXT_PUBLIC_* 构建期内联）
│   ├── api.ts                    所有写操作：登录/提交/审核/归档/建任务
│   ├── hooks.tsx                 useSession / useProfile / useRequireRole 守卫
│   ├── queries.ts                所有读查询 + 批量签名 URL
│   ├── storage.ts                截图上传（Storage 主路径 + 无 Storage 环境内联降级）
│   ├── time.ts                   业务时区下的「今日」计算
│   ├── types.ts · types/database.ts
│   └── utils.ts
├── supabase/
│   ├── migrations/000{1,2,3}_*.sql   表+索引+触发器 / RLS / Storage
│   └── setup_all_in_one.sql          三份合并版，供控制台一次性粘贴
├── scripts/acceptance-test.mjs   27 条 RLS / 流程验收用例，直接打 Supabase API
└── .env.example
```

---

## 本地启动

### 1. 建 Supabase 项目

去 [database.new](https://database.new) 建项目，在 **Project Settings → API**
拿到 `Project URL` 和 `anon public` key。

> 本项目**不需要** `service_role` key。全程只用 anon key，权限由 RLS 负责。

### 2. 配置环境变量

```bash
cp .env.example .env.local
```

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
# 可选：业务时区，默认 Asia/Shanghai，影响「今日已审」的日期边界
# APP_TIME_ZONE=Asia/Shanghai
```

静态导出下这两个变量是**构建期内联**进 bundle 的，改完必须重新 `npm run build`。

### 3. 跑 migration

Supabase 控制台 **SQL Editor** → 新建查询 → 把
`supabase/setup_all_in_one.sql` 的**全部内容**复制进去 → Run。
（它是 `0001/0002/0003` 三份的合并，幂等，重复跑没事。
用 supabase CLI 的话改跑 `supabase db push`。）

跑的时候 Supabase 可能弹「Potential issue detected」警告，
那是因为脚本里有 `drop policy if exists` / `alter table ... enable row level security`。
在全新库上这些 drop 都是空操作，可以放心 Run。

### 4. 创建账号（页面没有注册入口）

账号统一由管理员在 Supabase 后台建：

**Authentication → Users → Add user** → 填邮箱和密码 →
勾选 **Auto Confirm User**（跳过邮件确认）→ Create。

成员和你自己都这么建。建完让他去 `pushor.pages.dev` 登录即可，
首次登录时应用会自动插一行 `role='member'` 的 profiles。

### 5. 起服务

```bash
npm install
npm run dev          # 开发
npm run build        # 静态导出到 out/
npx serve out        # 或任何静态服务器，本地预览产物
```

### 常用命令

```bash
npm run dev          # 本地开发
npm run typecheck    # tsc --noEmit
npm run lint         # next lint
npm run build        # 静态导出
node scripts/acceptance-test.mjs   # 27 条 RLS 验收
```

---

## 手动把用户设为 admin

角色只存在 `profiles.role` 里，**页面上没有提权入口**，也不做邀请流程。

1. 先按上面「创建账号」给他建好账号，并让他登录一次
   （首次登录会自动插一行 `role='member'`；RLS 的 insert 策略只允许
   `role='member'`，所以不可能自助提权）。
2. SQL Editor 里执行：

   ```sql
   -- 看看现在有哪些人
   select p.id, u.email, p.role, p.display_name
   from profiles p join auth.users u on u.id = p.id
   order by p.created_at;

   -- 把指定邮箱的人设为 admin
   update profiles
   set role = 'admin'
   where id = (select id from auth.users where email = 'you@example.com');
   ```

3. 让他退出重登，就会落到 `/admin`。

> SQL Editor 用的是 `postgres` 角色，天然绕过 RLS，所以管理员改 role 不会被策略拦。

如果这个人在 `profiles` 里还没有记录（比如你是在 Authentication 里手建的用户）：

```sql
insert into profiles (id, role, display_name)
select id, 'admin', '管理员'
from auth.users where email = 'you@example.com'
on conflict (id) do update set role = 'admin';
```

---

## 创建 task

**方式 A：页面上建（推荐）** —— `/admin` → 任务管理 → 新建任务 →
选成员、选分类（study / review / exercise）、填标题、可选截止日期。

**方式 B：SQL**

```sql
insert into tasks (member_id, title, category, due_date)
values (
  (select id from profiles where display_name = '阿明'),
  '每天 30 分钟英语听力',
  'study',
  current_date + interval '7 day'   -- 不需要截止日期就写 null
);
```

归档：`/admin` → 任务管理 → 归档。归档是**软下线**，数据不删，
成员端不能再对它提交新截图（应用层拦截），历史记录仍可查。误操作可点「恢复」。

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

- **`image_url` 存 Storage 对象路径**（`<member-uuid>/<file>.png`），不是公开链接；
  渲染时批量换 10 分钟签名 URL。
- **`replaces_id`** 用于「驳回后重新提交」：旧记录保持 `rejected` 不动，
  新建一条 `pending` 并指向旧的，形成可追溯链条。

索引：`submissions(status)`、`submissions(reviewed_at)`、`submissions(member_id)`
（需求指定），另补 `submissions(task_id)`、`submissions(replaces_id)`、
`tasks(member_id)` 等外键索引，以及一条 `status='pending'` 的部分索引给待审队列。

---

## 权限模型（RLS 是唯一的真边界）

| 操作 | member | admin |
| --- | --- | --- |
| 看 submissions / tasks | 只有自己的 | 全部 |
| 建 submission | ✅ 但 `status` 被钉死为 `pending` | ❌（管理员不代提交） |
| 改 submission 的 `status` / `admin_note` | ❌ 完全没有 update 策略 | ✅ 仅当原 `status='pending'` |
| 改 submission 的其他列 | ❌ | ❌（触发器拦） |
| 建 / 改 / 归档 task | ❌ | ✅ |
| 删任何记录 | ❌ | ❌（没给 delete 策略） |
| 改自己的 `profiles.role` | ❌ | ✅ |

关键策略（`supabase/migrations/0002_rls.sql`）：

```sql
-- 成员提交：status 只能 pending，审核字段必须为空，图片路径必须在自己目录下
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

RLS 表达不了「只有某几列可以改」，所以 `0001_schema.sql` 里还有
`BEFORE UPDATE` 触发器 `submissions_review_guard`：非 admin 直接 raise、
非 pending 直接 raise、改了 `image_url`/`member_id`/`task_id`/`note`/
`replaces_id`/`created_at` 直接 raise，并自动把 `reviewed_at` 打成 `now()`。
同理 `profiles_role_guard` 阻止非 admin 改 `role`。

### 自测「成员改不动自己的 status」

浏览器控制台（用成员账号登录后）：

```js
const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
const sb = createClient("<URL>", "<ANON KEY>");   // 或直接复用页面里的会话

const res = await sb.from("submissions")
  .update({ status: "approved" })
  .eq("id", "<你自己的 submission id>")
  .select();

console.log(res);   // data: [] —— 命中 0 行，数据库里那条仍是 pending
```

或者直接用仓库里的验收脚本，27 条用例一次跑完：

```bash
node scripts/acceptance-test.mjs
```

它绕过应用层直接打 REST API，覆盖：角色可见性、成员不能建任务、Storage 目录隔离、
status 强制 pending、驳回必须写原因、已审不能翻案、`replaces_id` 约束、
今日已审时间边界、签名 URL 与 bucket 私有性。全部通过退出码为 0，可挂 CI。

前置：`.env.local` + 一个 `.qa.env`（两个测试账号的邮箱密码，已被 gitignore）+
这两个账号的 profiles 已存在且 admin 那个 role 已是 admin；
账号需可直接登录（建账号时勾了 Auto Confirm，或 Confirm email 处于关闭）。

---

## 部署到 Cloudflare Pages

1. **Workers & Pages → Create → Pages → Connect to Git**，选你的 GitHub 仓库
2. 构建设置：
   - Build command：`npm run build`
   - Build output directory：`out`
3. **Environment variables** 加两条（构建期内联，改完要重新构建）：
   ```
   NEXT_PUBLIC_SUPABASE_URL      = https://<your-project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY = <anon public key>
   ```
   可选 `APP_TIME_ZONE = Asia/Shanghai`
4. Deploy。得到 `xxx.pages.dev`
5. 挂自定义域名：Pages 项目 → **Custom domains** → 填你的域名 →
   Cloudflare 会自动写好 DNS 记录（同一个账号下不用手动加 CNAME）
6. 回 Supabase → **Authentication → URL Configuration**：
   Site URL 填 `https://你的域名`，Redirect URLs 加上它。
   账号走后台 Add user + Auto Confirm，不依赖邮件确认流程。

> 不需要 ICP 备案：服务器不在中国大陆境内。
> 也不需要 Vercel / 任何 Node 服务器：产物是纯静态文件。

---

## 明确不做的东西

| 不做 | 说明 |
| --- | --- |
| 金额 / 账本 / 日结 / 余额 / 转账 / 支付 | 数据模型没有对应字段，依赖没有对应包，「今日已审」只显示条数 |
| Outlook / Microsoft Graph 日历同步 | 后续再加；当前任务手动创建或选择 |
| 通知 / 邮件 / 短信 | 驳回原因只在成员端页面上展示 |
| 多级审批 / 批量审核 / 导出报表 | 一次一条，人工看完再点 |
| 成员自审 / 管理员代提交 | RLS 层面就不允许 |
| 邀请流程 / 自助提权 | 角色由管理员在数据库里指定 |

`.eslintrc.json` 里挂了一条 `no-restricted-syntax` 规则：
谁写出 `amount` / `balance` / `ledger` / `student` / `parent` / `teacher`
这类标识符，`npm run lint` 直接报错。

---

## 已知边界

- **签名 URL 有效期 10 分钟**。页面开太久再点大图可能失效，刷新即可。
- **并发审核**：两个管理员同时审同一条，后到的那次 update 命中 0 行
  （`lib/api.ts` 里带了 `.eq("status","pending")`），前端提示「这条已经被审过了」。
- **静态导出没有 middleware**：未登录访问 /member、/admin 时，
  是浏览器端守卫先跳走 + RLS 保证就算不跳也拿不到数据。
  直接打开 URL 会先闪一下加载页再跳转，这是静态站点的正常表现。
- **上传大小上限 10 MB**，格式 PNG / JPEG / WebP / GIF，浏览器侧校验。
  如需更严，在控制台给 `screenshots` bucket 加 `file_size_limit`。
- **不提供删除**。截图是审核证据：Storage 没有 update/delete 策略，
  数据库没有 delete 策略，Supabase 也禁止用 SQL 直接删 storage.objects。
  真要清理走控制台 Storage 浏览器 + SQL 删 auth.users（级联带走业务表）。
- **归档任务仍能被绕过应用层的原始 API 提交**（RLS 的 insert 策略没检查
  `tasks.status`，应用层拦了）。如需数据库层也拦，把
  `submissions_member_insert_pending` 里那段 `exists (select 1 from tasks t ...)`
  加上 `and t.status = 'active'` 重建策略即可。
