# Vercel + Supabase 双站发布

本文是当前部署与数据操作手册。最新构建源、PR、部署 ID、候选验收和主域确认统一记在 [交接](agent-handoff.md) 及对应发布 PR；旧来源 SHA 或本地检查通过不代表线上当前版本。

## 1. 目标与数据归属

| 环境 | 入口 / 项目 | 数据边界 |
| --- | --- | --- |
| 公网账号站 | [账号站](https://reelay-canvas-prototype.vercel.app/app)，Vercel `reelay-canvas-prototype` | Supabase `Reelay_Test`（`yacgzkkttwtyxkfxiwyn`）PostgreSQL + 私有 `reelay-assets` |
| 公网体验站 | [免注册体验](https://reelay-experience.vercel.app/app)，Vercel `reelay-experience` | 独立静态产物，业务数据只在当前标签页内存，刷新重置，无 API / 数据库 |
| 日常开发 | 本机前端与 API，配置见 [本地开发](local-development.md) | 独立 `Reelay_Dev`（`oocagsuhijyvmzwotyxn`）PostgreSQL + 私有 `reelay-assets` |

Dev、Test 和体验站之间没有自动数据同步。Git 携带代码及明确发布的仓库素材，不携带账号状态、项目、画布、数据库、对象库或环境文件。原型评审使用 Vercel Hobby / Supabase Free，不作生产可用性承诺。

账号站的 [管理员入口](https://reelay-canvas-prototype.vercel.app/app/login?demo=admin) 只预填林静账号，仍需点击登录，不切换已有会话。固定演示账号见[本地开发](local-development.md#演示账号)；同一账号被多人使用时共享该账号的持久操作。账号站为炭黑 Favicon，体验站为紫色 Favicon。

## 2. 账号站运行边界

- 根目录 `vercel.json` 使用 `npm run build` 输出 `dist/shell`；公开静态页面由 CDN 交付，`/app/*` 回到 React 壳，`/api/*` 进入同源 Fastify Function。
- `api/index.ts` 创建无状态入口，复用共享 `buildServer` 和 PostgreSQL stores；本机常驻进程使用 `src/server/start.ts`。Vercel rewrite 的内部 `apiPath` 在入口移除，业务查询继续严格校验。
- 旧画布经典脚本和样式在生产构建中按依赖顺序合并为带内容哈希的文件；只对公开静态资源使用 immutable 缓存，不缓存鉴权 API 或私有媒体为公共内容。
- 浏览器通过同源 API 与 HttpOnly 会话访问。项目、素材和主体由服务端按 actor scope 授权；PostgreSQL 表保持 RLS 与对 `anon / authenticated` 的拒绝，浏览器不直读数据库。
- `PostgresAssetStore`、`PostgresEntityStore` 与 `SupabaseObjectStore` 共同提供持久资产链路。桶必须预建且为私有；配置缺失、桶不存在或公开时失败关闭，不创建桶、不降级到 Function 临时文件系统。
- migration / seed 不在安装、构建、冷启动或请求中执行。代码发布、数据库迁移与对象写入分别记录。

### 服务端配置

| 环境变量 | 用途 |
| --- | --- |
| `DATABASE_URL` | 目标 Supabase 的 transaction pooler（`6543`），用于 Vercel 运行时 |
| `MIGRATION_DATABASE_URL` | 受控迁移 / seed 进程使用 direct，或 IPv6 不可用时使用 session pooler（`5432`），不使用 `6543` |
| `SUPABASE_URL` | 同目标项目的 HTTPS origin，不带 Storage 子路径 |
| `SUPABASE_SERVICE_ROLE_KEY` | 服务端 secret key；支持 `sb_secret_...` 或旧 `service_role` JWT，拒绝 anon / publishable key |
| `REELAY_SUPABASE_STORAGE_BUCKET` | 已存在且 `public=false` 的 bucket ID |

在实际发布所用的 Vercel 环境配置运行时变量，不能假定 Production 与 Preview 自动相同。数据库与 Storage 必须属于同一目标项目；密钥不使用 `VITE_` 等客户端前缀，不写入仓库、静态产物、聊天或日志。Vercel 每实例默认连接池 `max=2 / min=0`，使用 `attachDatabasePool`；TLS 由仓库的 Supabase CA 校验，不关闭证书验证。

### 上传、读取与图片预览

| 路径 | 当前代码限额 / 行为 |
| --- | --- |
| Vercel 同源代理 PUT | 单文件最多 `4 MiB`，为 Function 负载预留空间 |
| Vercel 私有签名上传 | 大于 `4 MiB`、不超过 `50 MiB` 的 intent 返回签名 PUT；finalize 校验真实字节后入库 |
| 本机 Supabase API | 单文件最多 `50 MiB` |
| 独立本机 filesystem API | 单文件最多 `64 MiB` |
| 体验站临时导入 | 单文件 `4 MiB`，累计 `128 MiB`，仅浏览器内存 |

限额来源为 `api/index.ts`、`src/server/http/asset-routes.ts`、`src/server/server-dependencies.ts` 与 `src/infrastructure/experience/ExperienceAssetStore.ts`。Supabase 全局及桶上限须同时覆盖应用接受的 `50 MiB`，并保留媒体 MIME 白名单；实际发布前核验配置，不能仅凭源码推断桶设置。

签名上传先经会话与权限校验，finalize 核验 SHA-256、长度和媒体元数据，完成前不进入素材库；重复 finalize 不新增资产。对象键受控、内容不可覆盖，保存 checksum 与字节数。音视频及超过 `4 MiB` 的原图，在同源 API 鉴权后返回 `private, no-store` 的 300 秒签名重定向，文件和 Range 由私有 Storage 交付，服务端密钥不进入客户端。

图片列表使用同内容接口的 `?preview=library` 获取最长边 512px、质量 76 的 WebP；原图与数据库记录保持原身份。派生键包含原 key、checksum 和转换版本，写入同私有桶；输入最多 64MP，每实例最多同时生成两张。原图和预览的 304 也先验证当前权限，失败不缓存。首次派生需要读取原图；纯项目导航不应预读整库原图，下载与画布实际消费再按需读取。

## 3. 体验站构建边界

`npm run build:experience` 输出 `dist/experience`，构建期选择内存 services。当前个人示例集为三主体 12 图及 3 视频 / 1 音频，来源分别是 `entity-demo-fixtures.ts` 与 `media-demo-fixtures.ts`；构建按 SHA-256 白名单复制并生成图片预览，不从内部账号实时读取，也不随内部新增素材扩大公开集。

产物自带静态 `vercel.json`；部署工作目录必须为 `dist/experience`，显式使用该配置，不能继承根目录的 API functions 或账号站 `.vercel/project.json`。不配置数据库、Storage、账号凭据，不执行 migration / seed。构建会检查内部登录代码与服务器目录没有进入产物。

`npm run preview:experience` 在 `127.0.0.1:5177` 启动静态预览：`/app/*` 返回壳，`/api/*` 为 404。项目、画布和临时素材在 SPA 导航中保留，刷新 / 退出重置，标签页彼此隔离；二进制只保留为内存及 Blob URL，不写浏览器持久业务存储。

## 4. 发布步骤

1. 按 [开发工作流](development-workflow.md) 核对实际 worktree、提交、未提交改动与目标环境。先确认本次是否包含代码发布、迁移或数据同步；它们不是同一动作。检查 Vercel 当前 Git 连接与部署工作流，不能沿用历史“未连接 Git”的结论。
2. 完成受影响界面验收、`npm run check`、`git diff --check` 和所需构建。双站发布同时运行 `npm run build` 与 `npm run build:experience`；记录同一构建源 SHA，体验构建设置 `REELAY_RELEASE_COMMIT` 写入 `experience-release.json`。相同代码已通过的检查不因补写 PR 反复执行。
3. 账号站从准确的已验收源码目录进入账号项目，使用根配置；核对上传范围不含 `.env*`、`.reelay-data`、本机 ObjectStore、日志或其他工作区草稿。体验站仅从上述静态输出进入独立项目，显式使用输出配置。部署前确认 CLI 所选项目、环境和目标别名。
4. 为两个目标分别建立候选，验证与目标一致的环境配置和实际候选 URL。记录 source SHA、deployment ID、构建状态和检查结果；需要验证的候选先不覆盖主域。
5. 候选通过后提升同一部署，不无故重建。分别核对账号主域与体验主域解析到预期部署，再复验实际主域。PR 合并、构建成功、候选可用、主域切换各自保留结果。
6. 将本次发布证据更新到交接与对应 PR；后续修整是否进入下一轮按实际影响判断，不在本手册追加逐轮日志。

### 验收范围

- 账号站：health、正常登录及管理员预填、既有项目 / 画布、个人素材与主体、原图 / 预览、匿名与失权拒绝；可见变化检查深浅主题与控制台。
- 资产链路改动：额外验证小文件代理、大文件真实签名上传、finalize 幂等与内容校验、超限拒绝、音视频 Range / 播放及当前目录归属。只读目录检查不能替代上传与项目挂载验收；写入测试使用明确隔离范围，不改既有创作数据。
- 体验站：匿名进入、三主体和当前公开音视频、SPA 保留 / 刷新重置、项目深链回退、标签页隔离、`/api/health` 为 404；`experience-release.json` 的 runtime、素材数和 source SHA 与候选一致。
- 双站：壳与旧画布入口资源均可读、Favicon 正确、哈希静态资源与实际部署一致。数据同步另比 ID / 引用、数量、字节与 SHA-256，不能只看页面出现缩略图。

## 5. 初始化与定向数据操作

### 新建空账号环境

1. 明确空目标及数据库 / Storage 配套关系，执行仓库 `src/server/db/migrations` 的实际迁移；当前 schema 至 `0013`。已存在目标先比对 ledger 和 checksum，只补缺失迁移，不重建数据库。
2. 仅首次建立演示账号 / 项目时，临时设置 `REELAY_DEPLOYMENT_MODE=preview`、`ALLOW_DEMO_SEED=true` 并运行 `npm run db:seed`，完成移除开关。preview 模式跳过媒体，不为更新素材重跑账号 / 项目 seed。
3. 预建私有桶、核验 MIME 与大小限制，配置服务端变量；需要标准主体案例时使用下一节的独立入口，再部署验收。

日常 Dev / Test 已有数据，不属于空环境。拉代码、换电脑或恢复服务都不执行初始化；共享开发配置与迁移源保留规则见 [本地开发](local-development.md)。

### 标准夹具与真实数据迁移

`npm run db:seed:preview-assets` 只用于明确指定的 preview 环境。临时设置 `REELAY_DEPLOYMENT_MODE=preview`、`ALLOW_DEMO_ASSET_SEED=true`、同目标 `MIGRATION_DATABASE_URL` 与三个 Storage 变量；完成后移除开关及临时凭据。

入口调用 `seedDemoAssetLibrary(..., { personalOnly: true })`，幂等写入 Hoo 的个人 Media、placement 与三条 Entity；不自动迁移、不运行账号 / 会话 seed、不改项目、画布或 ProjectAssetReference，也不清退旧项目引用。历史 fixture 仅在完整指纹匹配时校准，用户编辑过的主体拒绝覆盖。前后核对受保护数据、幽影 5 图 / 白汐 3 图 / 玄翎 4 图的封面、顺序、名字与 checksum，重复执行不得追加副本。

真实用户记录迁移另行核对源、目标、备份、冲突、ID / 版本 / 引用与原文件哈希，不能用标准 seed 替代同步。保留的必要历史边界：

- Test 首次资产迁移从旧 `0009` 补至 `0013`，精确导入真实三主体和 12 原图，保留用户编辑后的 ID、版本和顺序；账号、会话、项目、画布及项目引用未被 seed 重置。该操作已完成，不是后续发布步骤。
- Test 管理员示例是主账号内容的一次独立副本，保留管理员原有项目 / 权限，不覆盖主账号，不写入 Dev，也不建立持续同步。源快照、映射、事务及验证证据保存在原执行机器的 Git 忽略目录 `.reelay-data/admin-demo/`；其中历史无效 `deployment-smoke` 文档不能计为可用画布。
- Dev 的共享迁移证据与保留源路径统一见本地开发文档，不把旧快照恢复到现有云库覆盖新编辑。后续 Test 的定向补媒体 / 封面也只对应相应发布范围，不能推导为整库双向同步。
