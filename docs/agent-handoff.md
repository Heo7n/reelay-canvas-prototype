# Reelay 当前交接

本文只保留下一位开发者真正需要的当前状态。产品细节、规划和工程规则分别以 `current-product-spec.md`、`product-expansion-plan.md`、`engineering-guardrails.md` 与 ADR 为准；阅读路径见 `development-workflow.md`。

## 当前定位

- 当前工作区位于 `D:\Software\codePro\0707`；分支名、worktree 和未提交改动必须在接手时用 `git branch --show-current`、`git status --short` 与 `npm run worktrees` 重新确认，本交接不把静态分支名当成事实。此前改崩的用量看板实验 worktree 与本地分支已经清理，不再作为可恢复或可合并来源。
- 当前本地主链路是 `/app/login` → `/app/w/:workspaceId` → `/app/w/:workspaceId/projects` → 受保护的 legacy canvas host。登录、主页和项目库只保留 React 正式路由；旧静态双轨已经删除，`index.html` 仅作为迁移期画布 iframe。
- 公网原型已部署到 `https://reelay-canvas-prototype.vercel.app`。Vercel Hobby
  提供同源静态页面和 Fastify API，Supabase Free PostgreSQL 保存服务端状态；
  具体部署边界、初始化和验收项见 `docs/vercel-supabase-preview.md`。
- React 页面通过 `src/infrastructure/http` adapters 消费共享 API；Zod 在传输边界校验 DTO，页面不直接依赖 server-memory store。
- HTTP adapter 已把 401 / 403 / 404 / 409 和网络失败映射为 application error，route data 与 `CanvasHost` 不再依赖 HTTP 错误类型；登录、主页、项目库、画布与组织中心按 route 延迟加载，loader / action 契约不变。
- 服务端 route 已改为只依赖 Session / Account / Workspace / Project / CanvasDocument 的最小 capability 组合；`CollaborationStore` 只作为 composition root。项目创建与画布读取 / 保存会在内存和 PostgreSQL adapter 内再次按 actor scope 原子授权，不能依赖 route 前置检查作为唯一安全边界。
- 个人与组织用量共用 `src/features/usage` 的分析函数和确定性 fixture，不再从账号 feature 反向依赖组织页面。`data/model-catalog.js` 同时提供 legacy `REELAY_MODEL_CATALOG` 与共享 `REELAY_MODEL_DIRECTORY`，React 只通过类型化 adapter 读取，模型元数据和 demo 成本不再散落在用量页面。
- migration checksum 会先把 CRLF / CR 归一为 LF，SQL 也由 `.gitattributes` 固定为 LF；本地 PostgreSQL 已验证现有 0001–0008 checksum 未被篡改并成功应用 0009。
- 十个固定演示账号使用 HttpOnly 服务端会话并属于唯一的 `星海视觉工作室`，角色为一名主账户、两名管理员和七名成员。个人 / 协作是 Project 的 `accessKind`，不是两类 Workspace；项目读取和修改由服务端 ProjectMembership 的 `admin/edit/view` 过滤。Session、Workspace、Membership、Project 与 ProjectMembership 已切换到 PostgreSQL，migration / seed 可重复；固定 demo seed 会精确校准固定账号与固定项目之间的预置关系，但不会触碰用户创建项目或非 demo 成员。集成测试覆盖该边界和跨服务重启持久化。浏览器 token 只以摘要存库并具有过期 / 撤销状态，但固定账号与 demo 密码散列仍不是生产鉴权。
- 个人项目由当前创建者从卡片菜单二次确认后删除；协作项目仅项目级 `admin` 可删除，组织角色不越权。删除立即撤销相关列表、详情和画布访问，已打开画布保存收到 404 后会停止 iframe。项目、成员关系和 CanvasDocument 仍保留；回收站列表、恢复与永久删除尚未实现。
- 账号设置是 React 弹出面板，只包含个人主页与“我的积分”；组织用量仍由组织中心承接。可选联系邮箱与手机号通过 PostgreSQL 持久化，但它们不是登录标识、未做验证，也不会自动订阅报表。“我的积分”以确定性前端演示数据展示当前账号余额、本月获得 / 消耗、统一的获得 / 消耗流水及个人用量分析；流水按时间、类型、项目、任务类型、模型、生成规格和积分变化呈现，类型与日期合并为一个即时生效的极简筛选面板，日期只通过整块按钮唤起系统日期选择器，不提供年月日键盘录入。该页面仍不是真实 `CreditLedger`，不能把演示余额或流水当成持久账本。
- 头像菜单中的组织入口已改为独立 Workspace 路由。`/app/w/:workspaceId/organization` 把精简组织信息与真实只读成员列表放在同一页；`/organization/credits` 展示组织余额、成员额度以及入账 / 分配 / 消耗明细；`/organization/usage` 仅对主账户与管理员展示确定性前端演示看板。用量页已重构为“概览—用量分析—消耗来源”：概览并列展示可用积分、预计可用、今日消耗与近 30 天日均；用量分析默认近 7 天，可切换近 30 天和确认后才生效的自定义日期范围；近 7 天使用每日横向条形图，近 30 天使用默认可见最近约 15 天的每日堆叠柱形图与总消耗折线；消耗类型统一展示视频生成、图片生成和媒体处理。消耗来源可按项目、模型、成员切换并保留搜索和聚合详情抽屉，完整来源项在表格区域滚动，不静默截断。Agent 与增强处理当前只在展示层归入媒体处理。任务级流水继续由积分管理承接，组织用量演示数据后续必须由 `GenerationTask`、计费快照和不可变 `CreditLedger` 替换。
- 当前组织中心作为 `w/:workspaceId` 的子路由复用工作台已经加载的 `WorkspaceContext`，首次进入只额外读取组织成员。主账户与管理员可访问组织信息、积分管理和用量看板，普通成员只显示只读“组织信息”；直接访问积分管理或用量看板会返回组织信息。三个分区切换不重复请求工作区和项目数据，内容区保留隐藏的语义标题。用量看板布局按笔记本与宽屏自适应；30 天图按视口计算柱宽以稳定展示约 15 根柱，来源表独立滚动。
- Vercel / Supabase 公网演示链已经合入并从 `codex/integration-organization-canvas` 部署；后续公网更新应从该集成链验证并发布，不要从仍在开发的功能 worktree 直接覆盖生产预览。
- `LegacyCanvasHost` 已受路由权限保护；旧 `index.html` 消费版本化账号 / 组织 / 项目上下文和 CanvasDocument 消息，按 `projectId + canvasId` 加载 / 自动保存。PostgreSQL 使用 revision 乐观并发，`admin/edit` 可写、`view` 只读，非成员不可见；只读画布保留选择、浏览、缩放和下载，但会禁用拖动、删除、生成、重命名与参数修改。
- legacy 画布壳层已重排为四个独立浮动区域：左上返回主页 / 项目名 / 项目选择，左侧中部常显内部画布 / 资产 / 分享 / 个人，左下小地图 / 适应视图 / 禁用的整理占位 / 缩放滑条，右上只保留 Agent。积分已从右上常驻徽标迁入个人菜单，并通过严格 `canvas:open-account` 的 `profile | credits` bridge 打开 React 对应分栏；旧无 `section` 消息兼容为 `profile`。个人入口只在 hover 时显示文字提示，点击才展开菜单；菜单与左侧胶囊外框底边对齐，前两项为“我的积分 / 组织中心”，退出账号使用中性色，帮助中心与快捷键分别向右侧分层展开而不改变主菜单高度。快捷键三级卡片使用 `246px` 紧凑单列布局，不重复标题，按“画布操作 / 节点操作”分组，并以实际画布绑定为唯一文案来源；其中移动视图明确展示中键或空格配合拖动。项目名编辑态只使用 hover 同款浅色底框，不额外显示描边、下划线或阴影。项目选择器由 React host 传入当前账号授权项目投影，支持搜索、缩略图、当前项勾选和固定的新建项目入口；打开其他项目与新建项目意图都会先等待当前画布保存，再由宿主路由或现有 workspace action 执行，iframe 不持有 repository 或伪造项目。资产面板头部复用同一项目导航并保留内部画布入口。该切片的壳层覆盖集中在 `styles/canvas-chrome.css`，不要把它与 `styles/app.css` 中的组框 / 临时选择面规则重新耦合。
- 账号分栏 bridge 使用显式能力协商：新宿主在 `host:init` 提供 `accountSections`，新 iframe 只有看到该能力才为积分入口附加 `section`；缺少 capability 的旧宿主继续收到原始 v1 消息并降级打开默认个人页。旧 iframe 发来的无 `section` 消息则由新宿主默认解释为 `profile`，不能在 v1 strict schema 上无协商扩字段。
- 画布壳层 disclosure 已补齐键盘闭环：项目 / 画布 / 更多操作 / 个人入口同步 expanded 状态，键盘打开后进入首个可用项，Escape 分层关闭并回焦，画布改名结束回到对应行。资产面板和 Agent 同开时至少保留 `280px` 画布走廊，`1000px` 以下改为互斥；后续调整面板最小宽度时要一起更新联合约束和行为测试。
- 开发服务器必须让 `/app/*` 回退到 `app-shell.html`，同时保留 `/index.html` 给旧画布 iframe；不要重新引入会吞掉 Vite 内部脚本或旧画布入口的宽泛回退。
- 当前生成节点在创建时即确定不可变的 `mediaKind`（`image / video`）；模型、任务快照与结果必须保持同类型。CanvasDocument v1 读取器仍兼容旧 `mode / lockedMode / generatedAsset.type`，但恢复后会归一为单一运行时类型，新快照不再写 `lockedMode`。入口使用统一模型选择图标，选择器内部仍保留具体模型图标。

## 下一开发切片

迁移桥的三个收尾项已经完成：后台画布生成会显式触发保存，dirty / 导航会先刷新保存；尚无文档的画布先建立内存同步基线，只有主页意图或真实用户修改才首写 revision 1，不会因纯浏览生成空记录；`view` 的修改交互和加载失败画布已封锁并提供重试；CanvasDocument 使用真实字段 allow-list 和序列化 / 恢复行为测试；旧静态登录 / 主页双轨已经删除，画布导航统一回到 React 路由。

iframe 侧文档保存已经从 `app.js` 提取为无 DOM 的持久化协调器，独占 baseline、dirty、debounce、单一 in-flight、revision、续写、重试与错误降级；行为测试覆盖空文档不首写、保存中继续修改、陈旧响应和非法消息。宿主用 iframe instance id 和 route scope 拒绝重复 ready 与旧 scope 保存回调；同 route 新 iframe 会等待旧同 scope 保存结算后再 hydrate 最新 revision，旧 epoch 的 dirty / saving / navigation 不会污染新实例，旧保存失败则先重新读取服务端权威文档。

多画布内容已经由 `canvas-runtime-store.js` 统一持有：每个 CanvasRecord 是节点、组、连接、视口、层级和撤销栈的唯一权威，根 `state` 只保留供现有 renderer / 手势 adapter 使用的活动画布访问门面。`render()`、缩放和画布切换不再执行 CanvasRecord 与根状态之间的镜像复制；后台任务按 canvas id 直接定位目标记录，删除非活动画布也会显式触发保存。

无 DOM 的 `canvas-command-executor.js` 已建立 touched collection draft、before conflict、normalizer scope、transition validator、逆命令、每画布隔离和 50 条混合 undo 上限。连接单条创建、批量创建和删除已统一通过原子命令提交，批量连接只写一条 undo；连接归一化已从 renderer 移到提交 / hydrate 边界。提交后保存 effect 抛错会作为 `effectError` 报告，不会把已经提交的内容伪报为失败。当前 app adapter 明确拒绝 nodes / groups 命令，防止在字段级契约建立前把整节点任务态或 UI 态带入撤销。

下一刀不要重写手势、视觉或整体 React 化画布，优先顺序为：

1. 在现有 CanvasCommand 上建立字段级 Node patch 与 Group membership invariant，先迁移媒体命名和离散参数，再迁移解组；不能使用整节点快照，不能修改运行时创建类型或恢复生成 / 提示词任务态。高频 pointer preview 仍保留在 session/adapter 层，pointerup 后续只提交最终字段事务。
2. 把生成与提示词优化的异步 timer 提取为不依赖 DOM 的 task runner，完成事件只通过带 project / canvas / node / task scope 的命令写入。
3. 资产功能从 Workspace Asset、ProjectAssetReference 与 ObjectStore 的最小纵向故事开始：上传 → 加入项目 → 刷新 / 服务重启后仍存在。GenerationResult 只有显式保存后才幂等晋升为 Asset。

积分前端模拟需另开切片。开始前至少确认组织月度额度与结转规则、一次生成的预占 / 扣减 / 失败退款、成员与项目统计维度、管理员可见范围，以及演示月份和异常场景；没有这些口径前，不把当前 `3000 / 0` mock 扩成伪账本。

CanvasDocument 当前仍是迁移桥：一个路由 `main` 文档内保存旧画布的多画布 bundle，严格 allow-list 只包含节点、组、视口、节点 `mediaKind` 和模型参数。后续 GenerationTask、GenerationResult、AssetReference 与 CreditLedger 应建立独立实体，不继续向该 bundle 塞运行态；Asset 二进制也不属于 CanvasDocument。

暂不加入邀请、外部分享、实时光标、复杂权限和真实密码生命周期。当前公网地址
只用于原型评审，不应扩写为生产可用承诺。

固定演示账号统一使用密码 `reelay-demo`：

- `creator@reelay.test`（Hoo，主账户）
- `linjing@reelay.test`（林静，管理员）
- `liran@reelay.test`（李然，管理员）
- `chenxi@reelay.test`（陈曦，成员）
- `zhouyu@reelay.test`（周予，成员）
- `suhe@reelay.test`（苏禾，成员）
- `wangyin@reelay.test`（王茵，成员）
- `xuzhe@reelay.test`（许哲，成员）
- `yelan@reelay.test`（叶澜，成员）
- `shenan@reelay.test`（沈岸，成员）

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
- 演示用量模板可以随模型目录进入 `data/model-catalog.js`，页面和 fixture 只能通过类型化目录读取，不能复制模型 ID、名称或成本表。
- 服务端新增 Asset / Generation / Credit 入口时只注入所需 capability，并把 actor scope 放进 repository / use-case 方法；不能重新依赖完整 `CollaborationStore` 或只在 route 校验权限。
- React、HTTP DTO、数据库 schema 和领域对象是不同边界，不应互相直接替代。
- `LegacyCanvasHost` 只承载上下文、导航和迁移桥接，不复制权限、计费或 repository。
- 清理旧代码与新增大功能分开提交；每个提交保持可运行、可回退。
