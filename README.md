# 小白同学工作站

一个本地使用的拍摄、剪辑、发布和项目库管理工具。

## 怎么打开

直接双击 `index.html`，或用浏览器打开这个文件。

如果浏览器因为本地文件限制导致功能异常，可以用本地服务打开：

```bash
python -m http.server 4173
```

然后访问：

```text
http://127.0.0.1:4173/
```

## 主要功能

- 今日安排
- 项目库
- 日历视图
- 拍摄、剪辑、发布排期
- 项目库归档项目
- 三个平台点赞记录
- 自动判断小爆款 / 大爆款
- 下拉选项可新增

## 数据保存在哪里

当前版本会优先保存到 Supabase 云端数据库。

同时也会保留一份浏览器本地存储作为备用。

- 网络正常时：新增、编辑、拖动日历、修改点赞等操作会自动保存到 Supabase
- 网络异常时：数据会先保存在当前浏览器本地
- 顶部状态会显示“云端已保存”“云端已同步”或“云端保存失败，本机已保存”
- 云端版不会自动生成示例项目，避免手机第一次打开时把示例同步到云端

GitHub Pages 只负责打开网页；Supabase 负责保存数据。

## 常见云端状态

- `云端已同步`：已经从 Supabase 读取到数据
- `云端已保存`：当前修改已经保存到 Supabase
- `云端读取失败：404`：通常是 Supabase 表名没建对
- `云端读取失败：401` 或 `403`：通常是 API key 或表权限需要检查
- `云端保存失败，本机已保存`：当前浏览器本地已保存，但没有写入 Supabase

如果不同设备之间不同步，优先检查页面顶部的云端状态。如果没有出现云端状态，通常是 GitHub Pages 还在加载旧文件，等待 1-2 分钟后刷新，或在网址后加 `?v=2` 再打开。

如果出现 `401` 或 `403`，需要在 Supabase 的 SQL Editor 里开启这张表的公开读写策略：

```sql
alter table workstation_data enable row level security;

create policy "allow read workstation data"
on workstation_data
for select
to anon
using (id = 'main');

create policy "allow insert workstation data"
on workstation_data
for insert
to anon
with check (id = 'main');

create policy "allow update workstation data"
on workstation_data
for update
to anon
using (id = 'main')
with check (id = 'main');
```

## Supabase 表结构

需要先在 Supabase SQL Editor 里创建表：

```sql
create table if not exists workstation_data (
  id text primary key,
  projects jsonb not null default '[]'::jsonb,
  options jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into workstation_data (id, projects, options)
values ('main', '[]'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
```

## GitHub 上传说明

上传到 GitHub 时，把本文件夹里的所有文件上传到仓库根目录即可。

需要上传的主要文件：

- `index.html`
- `styles.css`
- `app.js`
- `project-core.js`
- `test.html`
- `project-core.test.js`
- `README.md`

## 测试

浏览器测试页：

```text
test.html
```

打开后如果标题显示“核心逻辑测试：全部通过”，说明核心规则正常。
