# 本地开发与数据位置

这里统一维护日常启动、换电脑接续和数据保留规则。分支与验证见[开发工作流](development-workflow.md)，公网环境见[公网预览](vercel-supabase-preview.md)。历史候选端口不作为当前入口。

## 当前评审环境

运行入口核对：2026-09-29。此表只描述本机评审，不代表共享开发或公网账号站已同步。

| 用途 | 当前来源 |
| --- | --- |
| 工作区 | `C:/Users/Ho/.codex/worktrees/cc38/0707-experiment`，实际分支以 Git 为准 |
| 前端 / API | [5182 /app](http://localhost:5182/app) → `127.0.0.1:5183`；独立画布入口为 `/index.html` |
| 数据库 | 既有 Docker `reelay-library-check-20260915`，数据库 `reelay_library_preview_20260915`；端口读取容器实际 loopback 绑定 |
| 原媒体 | 当前工作区 `.reelay-data/library-preview/objects`，保留用户已有内容 |
| 本机记录 | `.reelay-data/library-preview/processes.json` 与同目录日志；PID 只作历史记录，使用前重查 |
| 标准恢复入口 | 入库的 `scripts/start-local-preview.mjs`，从忽略的 `.env.local-preview` 读取端口和既有数据位置 |

```powershell
git status --short --branch
npm run worktrees
Get-NetTCPConnection -State Listen -LocalPort 5182,5183 -ErrorAction SilentlyContinue |
  Select-Object LocalAddress,LocalPort,OwningProcess
```

正确服务已运行就复用，不结束其他 Node 进程，不换端口替代用户正在看的页面。现有进程最初由忽略目录的临时 launcher 启动；本机配置已安全转存为 `.env.local-preview` 并纯检查与旧启动计划一致，后续确需恢复时使用下述标准入口。API 新契约是否已重启载入以交接的实际结果为准。

### 恢复当前前后端

从[本机配置样例](examples/local-preview.env.example) 建立 `.env.local-preview`，私下填写现有本机数据库凭据，保留库名与 ObjectStore 位置。样例不是凭据；不得输出连接串、将文件提交 Git，或为满足配置重新创建库 / 素材目录。已有环境由其持有者补齐这份配置。

确认对应端口空闲后，在当前工作区的两个终端分别执行：

```powershell
npm run dev:preview -- server
npm run dev:preview -- frontend
```

可用 `--config <本机配置文件>` 明确选择配置。启动器只启动现有 API / Vite，清除继承的云端、迁移和 seed 变量；API 仅接受 loopback PostgreSQL、既有目录和 filesystem 模式。可查询已存在容器的绑定端口，但不创建 / 启动容器、不迁移、不 seed、不复制业务数据。前端进程不接收数据库或 Storage 凭据。缺配置或目录时失败，不降级到空库。

前端 HMR 不更新常驻 API；后端变化需要在完成当前操作后单独重启。后台运行使用 `Start-Process -WindowStyle Hidden` 并指定工作区与日志。恢复后检查 5183 及 5182 的 `/api/health`，再核对原项目、素材与控制台；health 成功不等于数据归属正确。源码 URL 不加手工 `?v=`，正式产物用内容哈希。

## 首次安装与换电脑

1. 安装 Git、Node.js `24.x`，clone 并检出实际交接分支，运行 `npm ci`。不复制 `node_modules`，不以网盘同步 `.git`。
2. 先选择需要哪种数据环境：仅产品评审使用[静态体验构建](vercel-supabase-preview.md#3-体验站构建边界)；接续当前本机项目需要另行授权、配套转移数据库与原媒体，Git 不携带它们。没有这份数据时不能称已复现本机创作环境。
3. 接入既有共享开发需先核实该库迁移是否支持当前分支；独立实验迁移没有自动应用到 Reelay_Dev。确认兼容后，按[共享配置样例](examples/shared-development.env.example) 创建 `.env.shared-development.local`，私下填写同一 Reelay_Dev 的连接与私有桶配置，然后运行 `npm run dev:server:shared`（API 5175）；前端用 `npm run dev:shell -- --host 127.0.0.1 --port 5174 --strictPort`。这是另一环境，不替代当前 5182 评审。
4. 登录并验证既有项目、画布、主体、素材顺序及原文件；经明确保存与另一台重新打开后才算两机接续验收。家里电脑尚无已完成的验收证据。

离开前等待保存，按已授权范围提交 / 推送；另一台检查脏文件后 `git pull --ff-only`，不 force/reset。共享库不是实时协同，避免两台同时编辑同一画布。Git 只同步代码，Cookie 不迁移，同主机不同端口可能共享 Cookie。恢复、拉取与换机都不自动初始化、迁移或 seed。

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

### 备份与恢复核验

2026-09-14 已完成一次**本机仓库样本的隔离恢复演练**。命令 `npm run check:backup:drill` 使用已安装并运行的本机 Docker 与本地 `postgres:18.4` 镜像；不自动下载镜像，不启动保留源 Compose 服务，不读取 `.env` 或接受数据库目标参数。它创建独立临时容器、自动分配仅本机可访问的端口，在新库应用现有迁移并加入公开图片 / 视频 / 音频样本，导出 PostgreSQL custom archive 与 ObjectStore，再恢复到另一新库 / 新目录。

上述日期的演练验证了 13 个迁移、17 张表的行数和内容哈希、可见字段顺序、约束、索引、RLS 与有效表权限；3 个原素材的字节数、类型和 SHA-256 全部一致。这些是历史演练计数，不是当前仓库 schema。临时容器在核对本次名称和所有权标签后移除；样本 archive、对象副本与 `report.json` 保留在忽略目录 `.reelay-data/backup-drills/<run-id>/`，没有真实业务数据。该检查接在 CI 的 PostgreSQL 任务后，本地仅在持久化、备份工具或相关阶段验收运行，不加入日常视觉检查；远端是否执行以相应源 SHA 的 CI 为准。当时本机为 PostgreSQL 18.4、Dev / Test 为 17.6，不能用这次演练证明跨版本云恢复已通过，也不代表本轮重查了云端版本。

**真实云备份仍需落实。** 当天只读查询确认 Dev / Test 均健康、`reelay-assets` 桶均为私有；仓库可确认的真实备份仍是上节迁移快照，没有据此证明当前云端持续备份、保留期限或异地副本。按[Supabase 官方备份说明](https://supabase.com/docs/guides/platform/backups)，Free 项目应自行定期导出；数据库备份只含 Storage 元数据，不包含原文件。

真实备份实施时遵循以下边界；这些是下一阶段要求，不是已启用的任务：

- Dev 与 Test 分别选择经过授权的私有备份位置，配置最小必要读取权限，禁止输出连接串或密钥。建议每日一次及 schema / 批量数据改动前额外备份，保留最近 7 日和 4 个周版本；确认容量和存储成本后才启用调度。
- 同一备份批次保存应用数据库（含迁移 ledger）、媒体对象清单、对应原文件和 SHA-256。记录源项目、导出时间、schema 版本及每个对象的字节数；生成期间暂停相关写入或建立一致快照，不能分别复制后假定引用一致。派生缩略图可由原文件重建。
- 真实备份含账号散列和创作数据，存放到加密、限制访问且独立于项目主存储的私有位置，不入 Git。失败或漏跑需能被发现；只有成功写出报告和完成完整性核验才算该次备份成功。
- 首次真实恢复只面向明确新建的隔离环境，验证项目 / 画布 revision、媒体引用、权限及原文件，再通过应用打开、保存和播放确认；不将旧备份导回仍在使用的 Dev / Test。迁移时保存的旧 sessions 不恢复为可用登录态。

完成真实业务数据的配套备份、隔离恢复与重复执行后，才能将本节状态更新为“云备份已验收”。

## 独立本机测试与夹具

Docker 仅用于 PostgreSQL 集成验证和隔离实验；`TEST_DATABASE_ADMIN_URL` 不指向 Reelay_Dev、Reelay_Test 或保留源。测试创建自身临时数据库。

`npm run db:setup` 只用于明确隔离的新本机演示环境，依次运行 db:up、migration 和幂等 seed；不能当成预览修复。其目标检查优先使用 `MIGRATION_DATABASE_URL`，未设置才看 `DATABASE_URL`，执行前必须确保两者与 API / ObjectStore 属于同一隔离环境。

仓库 v4 夹具为幽影 5 张、白汐 3 张、玄翎 4 张。历史 v1–v3 文件与指纹仍参与幂等校准，用户改过的记录会拒绝覆盖，底层历史 blob 不硬删。不能因界面不展示而删除旧素材；公网个人库夹具入口另见公网说明。

可重建的依赖、产物和日志与用户数据分开处理；删除前核对真实路径、junction 和运行进程。`.env*`、`.vercel/`、旧 worktree 及其忽略内容不因分支已合入而自动获得删除授权。
