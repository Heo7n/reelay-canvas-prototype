# 本地开发与数据位置

本文统一记录完整路由预览的启动方式与本机数据位置。分支与检查规则见 [开发工作流](development-workflow.md)，产品边界见 [当前交接](agent-handoff.md)。本地预览、Git 远端同步和公网部署分别处理。

两台 Windows 长期接续的配置、数据迁移证据与日常约定见 [跨电脑开发](cross-device-development.md)。当前机器已完成 `Reelay_Dev` 数据迁移并切换共享 API；家里电脑尚待安装和验收。日常预览在本机运行前端与 API，业务数据写入独立云开发库。

## 1. 继续当前机器的开发

先检查实际分支与服务；已经运行且目录正确的服务直接复用：

```powershell
Set-Location -LiteralPath 'D:\Software\codePro\0707'
git status --short --branch
npm run worktrees
Get-NetTCPConnection -State Listen -LocalPort 5173,5175 -ErrorAction SilentlyContinue |
  Select-Object LocalAddress,LocalPort,OwningProcess
```

2026-09-07 切换后的运行位置如下。这是当前机器的记录，换电脑或重启服务时要重新核验并更新，不把目录名或静态 PID 当成永远正确的运行状态。

| 用途 | 当前位置 | 说明 |
| --- | --- | --- |
| 前端 `5173` | `D:\Software\codePro\0707` | 读取当前检出的活动开发分支；`main` 是集成基线 |
| API `5175` | `D:\Software\codePro\0707` | `npm run dev:server:shared`，读取专用忽略配置；后端代码修改后重启 |
| 业务 PostgreSQL | Supabase `Ho_Org / Reelay_Dev`，`oocagsuhijyvmzwotyxn`，新加坡 | 当前项目、画布、账号、资产引用与主体的权威数据；常驻本机 API 使用 Session pooler `5432` |
| API 的 ObjectStore | 同一 `Reelay_Dev` 私有桶 `reelay-assets` | 原文件均已迁入并验证；桶与本地 Supabase API 单素材上限 `50 MiB` |
| 保留源数据库 `54329` | Docker Compose `reelay-local` / `postgres`，容器 `reelay-local-postgres-1` | 原 PostgreSQL 18.4 迁移源保留，不再用于日常业务写入 |
| 保留源素材目录 | `D:\Software\codePro\0707-wt-canvas-integration\.reelay-data\object-store` | 已验证并迁移其中 30 个对象；保留原目录 |
| 保留历史素材目录 | `D:\Software\codePro\0707-wt-canvas-shell-redesign\.reelay-data\object-store` | 已验证并迁移其余 12 个对象；保留原目录 |

旧 API 进程 PID `36992` 已停止，共享入口后台父进程在本次启动时为 PID `57800`；以后操作前必须重新查端口和命令行，不直接沿用这个 PID。当前 `5173` 与 `5175` 已通过健康检查，HTTP 已验证登录、两个原项目画布、主体 / 素材列表及封面读取与鉴权，详见跨电脑开发记录。

端口占用时查看对应 `OwningProcess` 的命令行和启动来源，不能直接结束所有 Node 进程。日常共享预览不需要 Docker，也不运行 `db:setup`、`db:seed` 或数据恢复。保留源不会接收云端后续编辑，不能用它覆盖当前共享数据。

### 只恢复前端

确认 `5173` 没有现有服务后，在根目录执行：

```powershell
npm run dev:shell -- --host 127.0.0.1 --port 5173 --strictPort
```

入口为 <http://127.0.0.1:5173/app/login>；现有会话可直接回到原项目 URL。主演示账号为 `creator@reelay.test / reelay-demo`，完整账号列表见 [当前交接](agent-handoff.md)。`--strictPort` 防止地址悄悄切换。Vite 把 `/api` 代理到 `127.0.0.1:5175`，只启动前端不能替代 API 和数据库。

### 只恢复当前 API

确认 `5175` 没有现有服务、主目录 `.env.shared-development.local` 已配置 `Reelay_Dev` 后，在另一个 PowerShell 终端执行：

```powershell
Set-Location -LiteralPath 'D:\Software\codePro\0707'
npm run dev:server:shared
```

专用入口清除继承的旧数据库、ObjectStore、部署与 seed 环境，只从忽略配置文件读取共享连接信息；固定使用 `development + postgresql + supabase`，监听 `127.0.0.1:5175`。缺配置会失败，不会回退本机空素材库。`npm run start:server` / `dev:server` 的兼容默认值仍可能连接本机数据库和 filesystem，不能代替当前日常共享入口。

### 生命周期与恢复检查

前台命令需要保持两个终端运行；关闭终端、重启系统或停止进程都会中断预览。Codex 启动需要跨任务保留的预览时，应使用 `Start-Process -WindowStyle Hidden`，明确工作目录、专用启动入口及 stdout / stderr 日志；不依赖一次工具调用中的临时进程，也不另建重复服务。当前前端日志在根目录 `.git/dev-preview.stdout.log`、`.git/dev-preview.stderr.log`，共享 API 日志在 `.git/dev-shared-api.stdout.log`、`.git/dev-shared-api.stderr.log`，不进入 Git。

恢复后检查 API 与浏览器：

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:5175/api/health'
Invoke-RestMethod -Uri 'http://127.0.0.1:5173/api/health'
```

然后打开原项目画布，确认节点、资产预览和控制台正常。健康接口只说明服务可访问，不能证明素材和页面内容正确。若恢复失败，先对照端口、前端 / API 日志和 `Reelay_Dev` 配置定位原因，不重跑 seed。

### 登录与主页的历史独立评审预览

以下保留该设计切片的独立预览记录，不表示它现在仍在运行。切片目录为 `C:\Users\Ho\.codex\worktrees\ead8\0707`，当时活动分支 `codex/home-login-development`，起始基线为 `c6dd68a`。使用该目录自己的 `node_modules`，隐藏后台运行 `npm.cmd run dev:shell -- --host 127.0.0.1 --port 5176 --strictPort`；重启前仍须重新核对 worktree、端口与进程，不根据静态 PID 结束进程。

访客入口为 `http://localhost:5176/app`，登录弹窗为 `http://localhost:5176/app/login`。使用 `localhost` 可与其他任务的 `127.0.0.1` Cookie 主机隔离；相同主机不同端口仍可能共享会话。`127.0.0.1:5176` 也可访问，但已有共享会话时会直接进入主页。API 继续代理到 `127.0.0.1:5175`，数据仍与其他前端预览共享，此切片不执行 migration、seed 或数据库 / ObjectStore 重置。

当时隐藏进程启动脚本、环境记录和日志保存在本 worktree 的 Git 元数据目录 `D:\Software\codePro\0707\.git\worktrees\07071`：`home-login-preview.ps1`、`home-login-preview.json`、`home-login-preview.stdout.log` 与 `home-login-preview.stderr.log`。这些文件不进入 Git。当前日常 `5173` / `5175` 的代码与云端数据归属以本页第 1 节为准。

## 2. 家里电脑首次接入

家里电脑尚未安装和验收。按 [跨电脑开发的首次安装](cross-device-development.md#每台电脑的首次安装) 安装 Git、Node `24.x` 与锁定依赖，检出已推送的同一代码分支，并在该电脑的 `.env.shared-development.local` 填写同一个 `Reelay_Dev` 配置；不复制聊天、Cookie 或 `node_modules`。

通过 `npm run dev:server:shared` 和 `npm run dev:shell -- --host 127.0.0.1 --port 5173 --strictPort` 启动，重新登录后检查既有项目、画布、3 个主体及素材顺序、个人素材和预览，再进行两机接续验收。现有共享数据已迁移完成，换电脑不运行 migration、seed、`db:setup` 或旧库导入。

## 3. 独立本机测试环境

Docker 仍用于 PostgreSQL 集成测试或不兼容的 schema 实验。测试管理员连接必须指向独立本机环境，不能指向 `Reelay_Dev`；测试创建自己的临时数据库，不把保留源库当作可重置夹具。

`db:setup` 只适用于明确选择的新建独立本机演示环境，不用于当前保留迁移源或两机共享开发。它会启动 PostgreSQL、执行 migration、幂等写入演示账号 / 项目 / 素材与主体；不会恢复另一环境的用户内容。仓库 v4 夹具是 12 张原图组成的幽影（5 张）、白汐（3 张）、玄翎（4 张），详见 [夹具边界](agent-handoff.md#开始与验证)。实际使用前应明确分离数据库与 ObjectStore，并让 API、migration 和 seed 指向同一测试环境；没有这个隔离条件时不执行初始化。

## 4. 数据与可重建文件的区别

| 内容 | Git 是否保存 | 处理原则 |
| --- | --- | --- |
| 源代码、`assets/` 中预置素材、migration 与 seed 定义 | 是 | 跟随版本；历史素材可能参与旧 fixture 识别，不能只看当前界面是否显示 |
| `Reelay_Dev` PostgreSQL + 私有 ObjectStore | 否 | 两台电脑共用同一权威数据；仍需配套备份和验证，Git 不保存业务状态 |
| 保留的本机数据库 + 两处 ObjectStore | 否 | 已迁移的历史源，保留且不再日常写入；不能反向覆盖云端新数据 |
| `.env*`、`.vercel/` | 除 `.env.example` 外不保存 | 本机配置，不能覆盖或提交凭据 |
| `node_modules/`、`dist/`、日志 | 否 | 通常可重建；先核对 junction、运行进程与实际目录 |

保留的两个旧 worktree 有 Git 之外的数据，本次已将其中数据库关联的全部 42 个原始对象迁入云开发库；迁移和代码合入都不等同于授权清理源目录，本轮保留这些目录及数据库。
