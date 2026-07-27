# Reelay 当前交接

本文只保留下一位开发者真正需要的当前状态。产品细节、规划和工程规则分别以 `current-product-spec.md`、`product-expansion-plan.md`、`engineering-guardrails.md` 与 ADR 为准；阅读路径见 `development-workflow.md`。

## 当前定位

- 当前本地主链路是 `/app/login` → `/app/w/:workspaceId` → `/app/w/:workspaceId/projects` → 受保护的 legacy canvas host。登录、主页和项目库只保留 React 正式路由；旧静态双轨已经删除，`index.html` 仅作为迁移期画布 iframe。
- 公网原型已部署到 `https://reelay-canvas-prototype.vercel.app`。Vercel Hobby
  提供同源静态页面和 Fastify API，Supabase Free PostgreSQL 保存服务端状态；
  具体部署边界、初始化和验收项见 `docs/vercel-supabase-preview.md`。
- React 页面通过 `src/infrastructure/http` adapters 消费共享 API；Zod 在传输边界校验 DTO，页面不直接依赖 server-memory store。
- 五个固定演示账号使用 HttpOnly 服务端会话并属于唯一的 `星海视觉工作室`。个人 / 协作是 Project 的 `accessKind`，不是两类 Workspace；项目读取和修改由服务端 ProjectMembership 的 `admin/edit/view` 过滤。Session、Workspace、Membership、Project 与 ProjectMembership 已切换到 PostgreSQL，migration / seed 可重复；固定 demo seed 会精确校准固定账号与固定项目之间的预置关系，但不会触碰用户创建项目或非 demo 成员。集成测试覆盖该边界和跨服务重启持久化。浏览器 token 只以摘要存库并具有过期 / 撤销状态，但固定账号与 demo 密码散列仍不是生产鉴权。
- 个人项目由当前创建者从卡片菜单二次确认后删除；协作项目仅项目级 `admin` 可删除，组织角色不越权。删除立即撤销相关列表、详情和画布访问，已打开画布保存收到 404 后会停止 iframe。项目、成员关系和 CanvasDocument 仍保留；回收站列表、恢复与永久删除尚未实现。
- 账号设置是 React 弹出面板，只包含个人主页与积分记录；组织用量统一进入组织中心。可选联系邮箱与手机号通过 PostgreSQL 持久化，但它们不是登录标识、未做验证，也不会自动订阅报表。个人积分记录目前保持明确空状态，不可把 `3000 / 0` 扩写成真实账本。
- 头像菜单中的组织入口已改为独立 Workspace 路由。`/app/w/:workspaceId/organization` 把精简组织信息与真实只读成员列表放在同一页，组织资料和角色列支持明确标注的本页预览交互；`/organization/credits` 展示“累计入账 − 已分配 = 未分配”的积分演示口径与详情抽屉；`/organization/usage` 仅对主账户与管理员展示确定性前端演示看板，包含概览、趋势、构成、排行、365 天热力图、筛选流水和导出，页面必须保留“演示数据”标识。组织用量数据位于独立数据层，后续应以 `GenerationTask`、计费快照和不可变 `CreditLedger` 替换，不能把当前演示记录当成真实账本。组织资料、角色、凭证和会话操作目前都不会写入共享组织、账号或 Membership；成员现有密码永远不进入页面或 API。
- Vercel / Supabase 公网演示链当前保留在 `codex/vercel-latency-optimization` 工作树。组织中心完成本地视觉收口后，需要把路由与组件合入该链并保留其 `WorkspaceContextGateway` 和延迟优化；不要直接从当前组织中心分支覆盖或部署公网版本。
- `LegacyCanvasHost` 已受路由权限保护；旧 `index.html` 消费版本化账号 / 组织 / 项目上下文和 CanvasDocument 消息，按 `projectId + canvasId` 加载 / 自动保存。PostgreSQL 使用 revision 乐观并发，`admin/edit` 可写、`view` 只读，非成员不可见；只读画布保留选择、浏览、缩放和下载，但会禁用拖动、删除、生成、重命名与参数修改。
- 开发服务器必须让 `/app/*` 回退到 `app-shell.html`，同时保留 `/index.html` 给旧画布 iframe；不要重新引入会吞掉 Vite 内部脚本或旧画布入口的宽泛回退。
- 当前画布已实现生成节点首次成功后的图片 / 视频类型锁；入口使用统一模型选择图标，选择器内部仍保留具体模型图标。

## 下一开发切片

迁移桥的三个收尾项已经完成：后台画布生成会显式触发保存，dirty / 导航会先刷新保存；`view` 的修改交互和加载失败画布已封锁并提供重试；CanvasDocument 使用真实字段 allow-list 和序列化 / 恢复行为测试；旧静态登录 / 主页双轨已经删除，画布导航统一回到 React 路由。

下一开发切片应立即回到用户可见前端，以一个可演示的完整故事为单位推进。优先顺序建议为：

1. 资产中心的项目内入口、空状态和素材卡流程，并明确哪些只是原型数据。
2. 节点内生成历史的可见交互，先使用前端模拟任务，不建立积分账本。
3. 从主页创建意图 → 画布生成 → 结果进入项目资产的跨页演示闭环。

积分前端模拟需另开切片。开始前至少确认组织月度额度与结转规则、一次生成的预占 / 扣减 / 失败退款、成员与项目统计维度、管理员可见范围，以及演示月份和异常场景；没有这些口径前，不把当前 `3000 / 0` mock 扩成伪账本。

CanvasDocument 当前仍是迁移桥：一个路由 `main` 文档内保存旧画布的多画布 bundle，严格 allow-list 只包含节点、组、视口和模型参数。后续生成历史与 AssetReference 应建立独立实体，不继续向该 bundle 塞运行态。

暂不加入邀请、外部分享、实时光标、复杂权限和真实密码生命周期。当前公网地址
只用于原型评审，不应扩写为生产可用承诺。

固定演示账号统一使用密码 `reelay-demo`：

- `creator@reelay.test`（Hoo，主账户）
- `linjing@reelay.test`（林静，管理员）
- `chenxi@reelay.test`（陈曦，成员）
- `zhouyu@reelay.test`（周予，成员）
- `suhe@reelay.test`（苏禾，成员）

这些稳定账号可用于后续组织积分月度模拟，但当前还没有 `CreditLedger`，不要把账户面板的 `3000 / 0` 当成持久余额。

## 开始与验证

```powershell
git branch --show-current
git status --short
npm ci
npm run db:up
npm run db:migrate
npm run check
```

空库首次需要显式设置 `ALLOW_DEMO_SEED=true` 后运行 `npm run db:seed`；服务启动不会自动 migration 或 seed，也不会在 PostgreSQL 故障时回退到内存。

- 已安装依赖时不必重复执行 `npm ci`。
- 开发中的定向检查与文档选读按 `docs/development-workflow.md` 执行。
- 用户可见行为变化才更新 `current-product-spec.md`；未实现规划不要写成完成状态。

## 关键边界

- 不再向 `app.js` 增加新页面或账户 / repository 逻辑。
- 模型条目和参数能力只进入 `data/model-catalog.js`。
- React、HTTP DTO、数据库 schema 和领域对象是不同边界，不应互相直接替代。
- `LegacyCanvasHost` 只承载上下文、导航和迁移桥接，不复制权限、计费或 repository。
- 清理旧代码与新增大功能分开提交；每个提交保持可运行、可回退。
