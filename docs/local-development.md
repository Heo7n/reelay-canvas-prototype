# 本地开发与数据位置

本文统一记录完整路由预览的启动方式与本机数据位置。分支与检查规则见 [开发工作流](development-workflow.md)，产品边界见 [当前交接](agent-handoff.md)。本地预览、Git 远端同步和公网部署分别处理。

## 1. 继续当前机器的开发

先检查实际分支与服务；已经运行且目录正确的服务直接复用：

```powershell
Set-Location -LiteralPath 'D:\Software\codePro\0707'
git status --short --branch
npm run worktrees
Get-NetTCPConnection -State Listen -LocalPort 5173,5175,54329 -ErrorAction SilentlyContinue |
  Select-Object LocalAddress,LocalPort,OwningProcess
npm run db:status
```

2026-09-05 核验的运行位置如下。这是当前机器的记录，换电脑或迁移服务时要重新核验并更新，不把目录名当成永远正确的代码版本。

| 用途 | 当前位置 | 说明 |
| --- | --- | --- |
| 前端 `5173` | `D:\Software\codePro\0707` | 读取当前检出的活动开发分支；`main` 是集成基线 |
| API `5175` | `D:\Software\codePro\0707-wt-canvas-integration` | 核验时服务端入口、传递依赖与根目录一致；前端后续更新不意味着 API 也自动更新 |
| API 的 ObjectStore | `D:\Software\codePro\0707-wt-canvas-integration\.reelay-data\object-store` | 当前媒体二进制与对象元数据，启动时显式指定 |
| 另一批保留素材 | `D:\Software\codePro\0707-wt-canvas-shell-redesign\.reelay-data\object-store` | 不用于当前 API，尚未完成数据库引用归属审计，保留 |
| PostgreSQL `54329` | Docker Compose `reelay-local` / `postgres` | 项目、画布、账号、资产引用与主体等持久数据；使用命名 volume |

端口占用时查看对应 `OwningProcess` 的命令行和启动来源，不能直接结束所有 Node 进程。数据库未运行时，启动 Docker Desktop 后在根目录执行 `npm run db:up`，复用现有 volume。日常恢复预览不运行 `db:setup`、`db:seed` 或数据重置。

### 只恢复前端

确认 `5173` 没有现有服务后，在根目录执行：

```powershell
npm run dev:shell -- --host 127.0.0.1 --port 5173 --strictPort
```

入口为 <http://127.0.0.1:5173/app/login>；现有会话可直接回到原项目 URL。主演示账号为 `creator@reelay.test / reelay-demo`，完整账号列表见 [当前交接](agent-handoff.md)。`--strictPort` 防止地址悄悄切换。Vite 把 `/api` 代理到 `127.0.0.1:5175`，只启动前端不能替代 API 和数据库。

### 只恢复当前 API

确认 `5175` 没有现有服务、数据库健康且下列 ObjectStore 存在后，在另一个 PowerShell 终端执行：

```powershell
Set-Location -LiteralPath 'D:\Software\codePro\0707-wt-canvas-integration'
$env:NODE_ENV = 'development'
$env:REELAY_STORAGE = 'postgresql'
$env:DATABASE_URL = 'postgresql://reelay:reelay-local-only@127.0.0.1:54329/reelay'
$env:PORT = '5175'
$env:REELAY_SERVER_HOST = '127.0.0.1'
$env:REELAY_OBJECT_STORE_ROOT = 'D:\Software\codePro\0707-wt-canvas-integration\.reelay-data\object-store'
if (-not (Test-Path -LiteralPath $env:REELAY_OBJECT_STORE_ROOT -PathType Container)) {
  throw '既有 ObjectStore 不存在；先核对数据位置。'
}
npm run start:server
```

上述数据库 URL 是仓库已有的本机演示默认值。后续修改 API 时，应先核对代码差异，再让新进程读取同一已验证数据库和 ObjectStore，并复验既有媒体可读；不能通过从新目录启动空存储或重新 seed 来替代数据迁移。

### 生命周期与恢复检查

前台命令需要保持两个终端运行；关闭终端、重启系统或停止进程都会中断预览。Codex 启动需要跨任务保留的预览时，应使用 `Start-Process -WindowStyle Hidden`，明确工作目录、上述环境变量及 stdout / stderr 日志；不依赖一次工具调用中的临时进程，也不另建重复服务。当前隐藏进程的日志在根目录 `.git/dev-preview.stdout.log`、`.git/dev-preview.stderr.log`、`.git/dev-api.stdout.log`、`.git/dev-api.stderr.log`，不进入 Git。

恢复后检查 API 与浏览器：

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:5175/api/health'
Invoke-RestMethod -Uri 'http://127.0.0.1:5173/api/health'
```

然后打开原项目画布，确认节点、资产预览和控制台正常。健康接口只说明服务可访问，不能证明媒体目录和页面内容正确。若恢复失败，先对照端口、前端 / API 日志及对象目录定位原因。

## 2. 新机器首次初始化

本节只用于尚无项目数据的本地环境。需要 Node `24.x`、npm 和正在运行的 Docker Desktop；在自己的仓库根目录使用独立的本地开发终端，确认数据库目标为本机，未继承公网部署环境。

```powershell
npm ci
$env:NODE_ENV = 'development'
$env:DATABASE_URL = 'postgresql://reelay:reelay-local-only@127.0.0.1:54329/reelay'
$env:MIGRATION_DATABASE_URL = $env:DATABASE_URL
$env:REELAY_OBJECT_STORE_ROOT = Join-Path (Get-Location).Path '.reelay-data/object-store'
npm run db:setup
```

`db:setup` 会启动并等待 PostgreSQL 健康、执行 migration、幂等写入演示账号 / 项目 / 个人素材与主体。它只在 seed 子进程中打开 `ALLOW_DEMO_SEED`，不清空业务数据，失败时返回非零退出码。仓库的本地媒体夹具为 9 张图片与 2 条 MP3，详见 [交接中的夹具边界](agent-handoff.md#开始与验证)。已有环境拉取代码后不必重复初始化；schema 或 fixture 有变化时再按本次变更执行相应命令。

在该终端执行 `npm run dev:server`，让 API 与 seed 使用同一数据库 / ObjectStore；在另一个位于同一仓库根目录的终端执行 `npm run dev:shell -- --host 127.0.0.1 --port 5173 --strictPort`。默认 API 端口为 `5175`。当前服务端启动脚本读取进程环境，不自动加载 `.env.local`；不能把 Vite 或公网环境文件的加载方式套用到 API。

## 3. 数据与可重建文件的区别

| 内容 | Git 是否保存 | 处理原则 |
| --- | --- | --- |
| 源代码、`assets/` 中预置素材、migration 与 seed 定义 | 是 | 跟随版本；历史素材可能参与旧 fixture 识别，不能只看当前界面是否显示 |
| PostgreSQL 数据 + ObjectStore | 否 | 配套备份和验证；初始化只能重建演示夹具，不能找回另一台电脑的用户内容 |
| `.env*`、`.vercel/` | 除 `.env.example` 外不保存 | 本机配置，不能覆盖或提交凭据 |
| `node_modules/`、`dist/`、日志 | 否 | 通常可重建；先核对 junction、运行进程与实际目录 |

保留的两个旧 worktree 有 Git 之外的数据。代码已经合入或文件字节相同，都不能证明数据库引用可以删除；本轮不合并或清理这些数据目录。
