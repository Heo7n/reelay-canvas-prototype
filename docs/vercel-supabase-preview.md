# Vercel + Supabase 公网预览

当前公网预览使用 Vercel Hobby 承载同源 Fastify 应用，使用 Supabase Free
PostgreSQL 保存会话、组织、项目、联系资料和画布文档。

公开地址：<https://reelay-canvas-prototype.vercel.app>

2026-09-07 公网 Supabase 项目 `yacgzkkttwtyxkfxiwyn` 已从 `0009` 补迁移至 `0013`，私有桶 `reelay-assets`、Production Storage 环境变量与三主体 12 图的数据迁移已完成。本次部署已 promote 到正式主域名，CLI 核验指向 `dpl_6qMnyrE8Wihk4eryUySZvL6idE6X` 且 Ready；切换后的主域 HTTP 与浏览器复验均已通过，Hoo 可在既有项目的个人主体页看到玄翎、幽影、白汐。

本次用户已要求推送、合并、同步公网版本，并让公网个人库能看到本机三主体与 12 张原图；此前“只同步代码、暂不部署”的限制不再代表本次范围。私有 Supabase ObjectStore、Vercel 资产 / 主体 API 接线和后续标准夹具入口已具备代码实现。迁移、存储、数据写入与部署结果分别记录，不能由代码提交推断公网页面已可使用。

## 部署边界

2026-09-05 只读核验：该 Vercel 项目尚未关联 Git 仓库，当前生产部署来源为 CLI；GitHub 工作流只执行检查与构建。因此当前推送代码不会自动发布公网。若后续连接 Git 或添加部署工作流，这个结论必须重新核验，不能把“推送”和“部署”长期视为天然分离。

- Vercel rewrite 的 `apiPath` 内部参数在 API 入口统一移除；同时兼容保留原请求路径和只提供 `/api` 目标路径的运行时，业务查询仍执行原有严格校验。
- `api/index.ts` 是 Vercel 的无状态 API 入口；`src/server/start.ts`
  只服务本地常驻进程。两者复用同一个 `buildServer` 和 PostgreSQL store。
- `npm run build` 生成 React 应用壳并复制迁移期旧画布到 `dist/shell`。
- Vercel CDN 直接提供 `dist/shell` 静态产物，`/api/*` 交给同一个 Fastify
  Function；前端与 API 仍然同源，不增加第二套鉴权。
- 浏览器中不包含数据库连接串、Supabase service key 或 demo seed 开关。
- migration 与 demo seed 是一次性人工初始化步骤，不在构建、冷启动或请求中执行。
- 本地开发服务的 filesystem ObjectStore 仅用于本地常驻进程；Vercel Function 的文件系统不是资产持久层，不能复用该 adapter。

## 资产文件边界

`api/index.ts` 已接入 `PostgresAssetStore`、`PostgresEntityStore` 与 `SupabaseObjectStore`，复用现有 `WorkspaceMediaAsset + personal placement + ProjectAssetReference + ObjectStore` 链路。浏览器仍通过同源 API 和 HttpOnly 会话访问，服务端校验项目成员与素材可见性后读取私有对象；不把 service key 或公开桶地址交给浏览器。本地 `src/server/start.ts` 继续使用 filesystem ObjectStore。

适配器只连接预先创建的私有 bucket，不会在运行时创建桶或把桶改为公开。配置缺失、桶不存在或桶为公开时失败关闭，不回退到临时文件系统。对象按受控键写入，保留 checksum、字节数、内容类型与不可覆盖的幂等校验；读取支持受控字节范围和完整性验证。私有桶与对象存储直连、候选部署的三主体目录及 12 图内容读取均已通过验证；本次没有在公网创建测试新素材或修改既有画布，未将新素材上传和项目挂载列为已实测。

Vercel Function 的请求与响应受 `4.5 MB` 负载限制，公网单文件上传在 `api/index.ts` 限制为 `4 * 1024 * 1024` 字节；超过时在申请 upload intent 阶段返回 `413 / asset_too_large`，中文提示为“当前环境单个素材最大支持 4 MB。”，不会等发送完整文件后才失败。本地上限仍为 `64 MiB`。当前内容读取也经同一个 Function，定向导入的演示原图必须核对大小，不能借导入绕过公网可读取边界。

### 服务端配置

| 环境变量 | 用途与边界 |
| --- | --- |
| `SUPABASE_URL` | 同一目标项目的 HTTPS origin，例如 `https://<project-ref>.supabase.co`；不填写 Storage 子路径。 |
| `SUPABASE_SERVICE_ROLE_KEY` | 服务端专用 secret key；适配器接受 `sb_secret_...` 或旧 `service_role` JWT，拒绝 anon / publishable key。禁止 `VITE_` 等客户端前缀，不写入仓库、浏览器、构建静态文件或日志。 |
| `REELAY_SUPABASE_STORAGE_BUCKET` | 已存在且 `public=false` 的 bucket ID；运行时只验证并使用，不自动创建。 |

在需要发布的 Vercel 环境分别配置这三项与 `DATABASE_URL`。定向导入进程使用同一 Supabase 项目的迁移连接与 Storage 配置，运行完释放临时进程环境；真实值不写入 `.env.example`。不能把本机数据库配到公网 Storage，或把公网数据库配到本机 ObjectStore。

## 数据库连接

Vercel 的 `DATABASE_URL` 使用 Supavisor transaction mode（端口 `6543`）。
迁移和 seed 使用单独的 `MIGRATION_DATABASE_URL`，优先 direct connection；网络不支持
IPv6 时使用 Supavisor session mode（端口 `5432`）。

运行时连接池默认每个 Function 实例最多两个连接，并通过 `attachDatabasePool`
在 Fluid Compute 挂起前释放空闲连接。服务端使用仓库内固定的 Supabase 官方
Root 2021 CA 校验 TLS，不在运行时关闭证书验证。

## 新环境初始化

1. 在空 Supabase 项目执行 `src/server/db/migrations` 中的迁移，当前仓库要求至 `0013`。`0010`–`0012` 建立资产、个人 placement、项目引用与 Entity；`0013` 建立个人主体到个人素材 placement 的数据库绑定约束。保留表上的 RLS 与对 `anon / authenticated` 的拒绝，不为接入 Storage 开放数据库直读。
2. 临时设置 `REELAY_DEPLOYMENT_MODE=preview` 与 `ALLOW_DEMO_SEED=true`。
3. 仅对首次初始化的空环境运行 `npm run db:seed` 建立固定账号与项目，随后删除 seed 开关。该命令在 preview 模式仍跳过媒体，不能用它代替下述个人素材定向导入，也不要为更新素材重跑账号 / 项目 seed。
4. 创建并验证私有 bucket，按上表配置 Vercel 的目标环境；数据库与 Storage 必须属于同一目标项目。
5. 如需 v4 三主体案例，执行下述个人库定向导入，再部署验收。初始化、迁移和导入都不会在构建、服务启动或请求中自动执行。

## 2026-09-07 首次公网迁移记录

- 数据库：先验证既有 migration ledger，再一次补执行 `0010`–`0013`，目标为 `yacgzkkttwtyxkfxiwyn`。未重新初始化账号或项目。Security Advisors 只有既有且符合服务端独占访问设计的 INFO：启用 RLS、未向客户端配置策略；没有 warning / error。
- 存储与配置：已创建 `reelay-assets`，核验 `public=false`，桶文件上限为 `4 MiB`；Vercel Production 的三个 Storage 环境变量已配置。此记录不代表 Preview 环境也已配置。
- 对象：从本机既有 ObjectStore 读取 12 张真实素材的二进制并上传私有桶，逐张验证全量 SHA-256 和字节范围读取，全部通过。没有重新编码或替换原图。
- 目录：本次没有运行 `db:seed:preview-assets`。Vercel 中现有敏感数据库凭据无法拉取，因此将本机真实的三条 Entity、12 条 Media、个人 placement、Entity 有序素材引用、个人绑定与已完成 upload intent 精确导出；在临时 PostgreSQL 上通过五项冲突 / 幂等验证后，经 MCP 单事务导入。导入保留原 ID、微秒时间戳、封面、顺序和版本（玄翎 `v2`、幽影 `v4`、白汐 `v4`），没有用标准夹具重置用户已编辑的主体。
- 保护边界：账号、会话、项目、画布及项目引用等保护表的哈希在操作前后保持一致；数据库目录与 Storage 对象已就绪，随后候选部署的 HTTP 验收结果见下文。

这是一次按已确认范围迁移本机真实记录的操作，区别于下一节的标准仓库夹具入口。后续再次迁移真实用户数据需要重新核对范围与冲突，不能直接把标准 seed 当作数据库同步工具。

## 后续环境的标准夹具入口

1. 核对目标、现有 migration ledger、备份与当前账号 / 会话 / 项目 / 画布状态，只补执行实际缺失的迁移至 `0013`，不重建库或重跑账号 seed。当前公网已到 `0013`，无需重复本次补迁移。
2. 在同一 Supabase 项目预先创建私有桶，配置三项 Storage 环境变量。服务端 secret key 只进入 Vercel 与本次受控导入进程，不需要用户在产品页面输入。
3. 在受控终端临时设置 `REELAY_DEPLOYMENT_MODE=preview`、`ALLOW_DEMO_ASSET_SEED=true`、目标项目的 `MIGRATION_DATABASE_URL` 和上述三个 Storage 变量，再运行 `npm run db:seed:preview-assets`。迁移连接使用 direct 或 session pooler，不能使用端口 `6543` 的 transaction pooler。入口 `src/server/db/seed-preview-assets-command.ts` 调用 `seedDemoAssetLibrary(dependencies, { personalOnly: true })`，只为 Hoo 的个人库建立幂等 Media、personal placement 和三条 Entity；不自动执行 migration，不调用账号 / 会话 seed，不修改项目、画布或 ProjectAssetReference，也不清退旧的项目引用。历史主体仅在完整 fixture 指纹匹配时校准；用户编辑过的旧主体会拒绝覆盖。完成后移除临时写入开关及本次终端凭据。
4. 导入前后对比账号 / 会话 / 项目 / 画布与项目引用，核验新增的“幽影”5 张、“白汐”3 张、“玄翎”4 张及其封面、顺序、名称与 checksum；重复执行应返回同一批记录，不追加副本。导入使用仓库原图，不拷贝本机任意用户数据。
5. 从已验收的集成代码部署，再按下一节验收公网。Git 推送、PR 合并、Vercel 部署、数据库迁移和对象写入是不同结果，需要逐项确认。

这个入口是一次明确指定目标的夹具写入，不是本地与公网的双向同步。Git 只携带代码和仓库原图，后续本机或公网新建的主体、上传素材、项目与画布不会自动复制到另一环境。

## 2026-09-07 部署与验收

正式部署为 `dpl_6qMnyrE8Wihk4eryUySZvL6idE6X`，构建源代码 `28580275b042890bcb4c634adde46fb718259643`，部署专属地址为 <https://reelay-canvas-prototype-dyfzxyrf9-heos-projects-560eccff.vercel.app>。`apiPath` 内部 query 参数误入业务严格校验的问题已修复。对应代码的 `npm run check` 共 716 项通过，CI `quality / postgres` 通过。

[PR #15](https://github.com/Heo7n/reelay-canvas-prototype/pull/15) 已合并为 `df5839a`；修复 [PR #16](https://github.com/Heo7n/reelay-canvas-prototype/pull/16) 已合入 `main`，合并提交为 `5ee4efc237b1f50eb789ac0dc231177b25d944b6`。构建源 `2858027` 与主线合并提交分别记录，不将 merge SHA 当作构建源 SHA。`vercel promote dpl_6qMnyrE8Wihk4eryUySZvL6idE6X` 已成功，CLI inspect 正式主域名 <https://reelay-canvas-prototype.vercel.app> 解析到同一部署，状态为 Ready；切换后的 HTTP / UI 复验通过。

- 正式主域 HTTP 已在 `2026-09-07T08:35:57.883Z` 通过：`/api/health`、三主体精确 ID / version / cover / 媒体顺序、12 条媒体逐张内容 SHA-256、字节范围 `206`、匿名访问 `401`，以及超过 `4 MiB` 的 upload intent `413`。候选地址也已通过同一组验证。
- 候选地址的浏览器已通过：真实登录 Hoo、进入既有项目，资产库显示 12 素材与封面正确的三主体；打开幽影可见 5 张图、正确描述和顺序，主视觉原图清晰。刷新后 12 素材与三主体仍可读取。
- 正式主域的 Chrome 已重新登录 Hoo，进入“香水品牌 TVC”的既有画布，在资产库个人主体页真实显示玄翎、幽影、白汐及三张正确封面，并完成截图验收。此项与候选地址上打开幽影、刷新列表的验证分别记录。
- 本次只定向同步既有三主体 12 图，未在公网制造测试新素材或改变既有画布；新素材上传、项目挂载与视频播放不属于本次已完成的公网实测。
- 私有桶保持 `public=false`。这批对象已在正式主域的新部署中读取验证；数据库、Storage、代码合并、promotion 与主域复验均有各自的完成证据。

固定演示账号与密码见 `docs/agent-handoff.md`。免费层可能在长期无活动后暂停，
因此该地址只作为前端原型评审环境，不承诺正式生产可用性。
