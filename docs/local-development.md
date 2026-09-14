# 本地开发与数据位置

这里统一维护日常启动、换电脑接续和数据保留规则。分支与验证见[开发工作流](development-workflow.md)，公网环境见[公网预览](vercel-supabase-preview.md)。历史候选端口不作为当前入口。

## 当前机器

最近核验：2026-09-14。以下是运行快照；重启前重新查端口与进程命令行，不依赖旧 PID。

| 用途 | 当前来源 |
| --- | --- |
| 前端 5174 | `C:/Users/Ho/.codex/worktrees/f859/0707`，`vite.shell.config.ts` |
| API 5175 | 同一 f859 工作区的 `src/server/start.ts`，由共享开发环境校验后启动 |
| API 专用配置 | `D:/Software/codePro/0707/.env.shared-development.local`，保持忽略，不复制进当前 worktree |
| 启动记录与日志 | `D:/Software/codePro/0707/.git/worktrees/0707/` 内的 `generation-preview.json`、`generation-preview.*.log`、`generation-api.*.log` |
| API 本机 launcher | 上述 Git 元数据目录内 `generation-shared-api.mjs`，读取当前工作目录代码与专用配置 |

```powershell
git status --short --branch
npm run worktrees
Get-NetTCPConnection -State Listen -LocalPort 5174,5175 -ErrorAction SilentlyContinue |
  Select-Object LocalAddress,LocalPort,OwningProcess
```

已运行且来源正确则复用；端口占用时先查对应进程，不能结束所有 Node 进程或悄悄换到另一端口。当前入口为 <http://127.0.0.1:5174/app>；原项目路由可直接复用。

### 恢复前端

确认端口空闲后，在当前工作区执行：

```powershell
npm run dev:shell -- --host 127.0.0.1 --port 5174 --strictPort
```

Vite 默认把同源 `/api` 代理到 `127.0.0.1:5175`。独立并行任务确需其它 API 时，显式设置 `REELAY_DEV_API_PORT`，记录前后端来源；端口只接受有效数字，代理主机固定本机。前端 HMR 不会更新常驻 API。

源码入口不加手工 `?v=`：Vite 会将它作为版本化资源缓存，导致预览留在旧代码。正式构建由构建脚本产生内容哈希。

### 恢复当前 API

确认 5175 空闲后，从当前 f859 工作区运行现有本机 launcher：

```powershell
node 'D:/Software/codePro/0707/.git/worktrees/0707/generation-shared-api.mjs'
```

它调用当前代码的 `createSharedServerEnvironment`，在进程内读取已保留的专用配置，再启动当前工作区的 API。换电脑时不复制该绝对路径 launcher，使用下节标准入口。

共享入口只读取专用配置，清除继承的旧数据库、ObjectStore、部署与 seed 环境，固定 `development + postgresql + supabase`。缺配置或数据项目不匹配即失败，不回退空素材库。`dev:server` / `start:server` 是通用入口，可能使用独立本机默认数据，不能替代共享入口。

需要长期后台预览时，使用 `Start-Process -WindowStyle Hidden`，明确工作目录和日志；前台启动则保持终端运行。恢复后验证：

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:5175/api/health'
Invoke-RestMethod -Uri 'http://127.0.0.1:5174/api/health'
```

再打开原项目确认节点、素材和控制台。health 成功只证明服务可访问，不能证明数据归属正确。失败先看端口、日志和配置，不运行 seed。

## 首次安装与换电脑

1. 安装 Git、Node.js `24.x`，clone 仓库并检出实际交接的开发分支；运行 `npm ci`。各电脑安装自己的依赖，不复制 `node_modules`，不以网盘同步 `.git`。
2. 以 [配置样例](examples/shared-development.env.example) 创建该电脑的 `.env.shared-development.local`，填写同一个 Reelay_Dev 的 Session pooler（5432）、服务端密钥与桶名。数据库与 Storage 必须属于同一项目；凭据不放聊天、源码或 `VITE_` 环境变量。
3. 在配置所在的仓库运行 `npm run dev:server:shared`；另一终端按上节启动前端。标准入口固定 API 5175，不启动 Docker，不初始化或 seed。
4. 本机浏览器重新登录，验证既有项目、画布、主体及素材顺序、原图 / 缩略图，再完成一次明确的保存与另一台重新打开的接续验收。家里电脑仍待此项验证，不能据单机结果称两机完成。

离开前等待画布保存、提交并按已授权范围推送开发分支；另一台先检查脏文件再 `git pull --ff-only`。分叉时处理来源，不用 force/reset 覆盖。Git 同步代码，云库保存内容，聊天与 Cookie 不迁移。同主机不同端口可能共享 Cookie；`localhost` 与 `127.0.0.1` 可隔离浏览器登录，但不会隔离数据库。

共享库不是实时协同画布：避免两台同时编辑同一画布，revision 冲突不自动合并。schema 变更由一个任务执行，另一台同步代码；不兼容实验用独立本机数据库。

## 演示账号

主账号：`creator@reelay.test`（Hoo）；管理员入口 `/app/login?demo=admin` 预填 `linjing@reelay.test`。固定演示密码为 `reelay-demo`，完整十个账号与角色来源见 [demo-fixtures.ts](../src/server/demo-fixtures.ts)。这不代表正式账号注册或密码生命周期。

## 数据归属与保留

| 数据 | 权威位置与边界 |
| --- | --- |
| 共享开发内容 | Reelay_Dev，`oocagsuhijyvmzwotyxn`；PostgreSQL + 同项目私有桶 `reelay-assets`，本机常驻 API 使用 Session pooler 5432 |
| 公网账号演示 | 独立 Reelay_Test，`yacgzkkttwtyxkfxiwyn`；不与 Dev 自动互相复制 |
| 免注册体验 | 独立静态构建的公开夹具与浏览器内存；刷新重置 |
| 保留源数据库 | Docker `reelay-local / postgres`，本机 54329，原迁移源，不再日常写入 |
| 保留素材源 | `D:/Software/codePro/0707-wt-canvas-integration/.reelay-data/object-store` |
| 保留历史素材 | `D:/Software/codePro/0707-wt-canvas-shell-redesign/.reelay-data/object-store` |

共享开发 API / 私有桶单素材上限为 50 MiB；独立 filesystem 模式为 64 MiB。公网同源代理与签名直传的上限不同，按公网说明核对。

### 已完成迁移的必要证据

2026-09-07 已将 15 项目（含 2 个软删除）、6 画布、3 主体和 42 个 Media 迁入 Reelay_Dev，保留 ID、revision、名称、封面、顺序、账号散列及关联；65 条旧 sessions 未导入。42 原文件共 85,123,200 字节，全部回读 SHA-256 一致。当时个人素材列表为 20 项，另 22 个历史 Media 仍保留，这些是迁移时计数，不是当前 UI 必须固定的数量。

迁移证据位于主目录 `D:/Software/codePro/0707/.reelay-data/shared-development/`：

- `source-backup-2026-09-07T11-55-08-749Z/cloud-import-result.json`：最终快照的事务导入与类型化精确比对。
- 同目录 `canvas-url-normalization.json`：仅 18 处画布本机绝对媒体地址改为同源相对地址，原始快照保留。
- `source-backup-2026-09-07T11-43-38-793Z/cloud-object-verification.json`：42 个原对象的全量回读证据；最终快照已核对相同 object key 与 hash。

这是已完成的迁移记录，普通换机不要重跑。旧库与旧素材不会接收云端新编辑，不得用它们反向覆盖当前内容。数据库与原文件需配套备份；Git 不保存这些业务状态。

## 独立本机测试与夹具

Docker 仅用于 PostgreSQL 集成验证和隔离实验；`TEST_DATABASE_ADMIN_URL` 不指向 Reelay_Dev、Reelay_Test 或保留源。测试创建自身临时数据库。

`npm run db:setup` 只用于明确隔离的新本机演示环境，依次运行 db:up、migration 和幂等 seed；不能当成预览修复。其目标检查优先使用 `MIGRATION_DATABASE_URL`，未设置才看 `DATABASE_URL`，执行前必须确保两者与 API / ObjectStore 属于同一隔离环境。

仓库 v4 夹具为幽影 5 张、白汐 3 张、玄翎 4 张。历史 v1–v3 文件与指纹仍参与幂等校准，用户改过的记录会拒绝覆盖，底层历史 blob 不硬删。不能因界面不展示而删除旧素材；公网个人库夹具入口另见公网说明。

可重建的依赖、产物和日志与用户数据分开处理；删除前核对真实路径、junction 和运行进程。`.env*`、`.vercel/`、旧 worktree 及其忽略内容不因分支已合入而自动获得删除授权。