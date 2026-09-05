# Reelay 工程护栏

本文是进入下一阶段开发前的轻量工程约束。它不固化产品方案，只防止原型继续无边界膨胀。本文记录的是可被证据推翻的当前约束，不是历史实现的辩护书；如果运行验证、数据一致性或产品主链路表明旧约束不合理，应在改代码的同时修正文档。

## 1. 当前基线

- 当前项目是 React 应用壳、Fastify/PostgreSQL 本地服务与 legacy canvas 并存的高保真原型，不是生产应用。
- 开始工作前以仓库实际分支、工作区状态和 `docs/agent-handoff.md` 的最新交接为准，不依赖本文中的静态分支名或提交号。
- 当前阶段采用渐进式迁移：保留已验证的画布交互，把新的数据边界、任务和页面逐步移出原型单体。
- 阶段基线必须是已验证且可回退的提交；标签只用于标记这样的基线。

## 2. 不可继续扩大的位置

- 不要继续把新页面、工作台、资产中心、任务中心写进 `app.js`。
- 不要把新的大型页面样式继续堆进 `styles/app.css`。
- 不要把模型目录、参数能力、计费规则散落在 UI 事件函数里。
- 不要把未实现页面写进 `current-product-spec.md`，规划内容只写进 `product-expansion-plan.md`。
- 不要为了遵守旧文档而保留已经被验证为错误的数据归属、计费或可访问性行为。

## 3. 新增功能放置规则

| 改动类型 | 应放位置 |
| --- | --- |
| 模型条目、参数能力、可替换的演示用量模板 | `data/model-catalog.js`；React 通过 `src/features/models` 类型化读取 |
| 静态原型配置、模拟素材、布局常量 | `src/config/prototype-config.js` |
| 已实现画布行为 | `docs/current-product-spec.md` |
| 新页面/工作台规划 | `docs/product-expansion-plan.md` |
| Agent/画布交接约束 | `docs/agent-handoff.md` |
| 工程边界变更 | `docs/engineering-guardrails.md` |

新产品页面必须进入现有 React 路由、独立页面模块和 application / infrastructure 边界；不要用新的浮层、静态入口或隐藏容器假装完成页面结构。legacy canvas 只通过显式 host / bridge 逐步接入，不继续承担账号、项目库或 repository 逻辑。

服务端 route 只依赖完成该端点所需的 capability 组合；授权相关 repository / use-case 必须显式接收 actor scope，并在存储边界原子校验。不能把 route 的前置查询当作唯一授权，也不能让新 Asset、Generation 或 Credit 入口重新依赖完整 composition-root store。

Phase 0B 的 runtime、Workspace 路由和 legacy canvas 迁移边界记录在 `docs/adr/0001-application-runtime-and-migration.md`，单组织与项目访问控制记录在 `docs/adr/0002-organization-project-access.md`。不得把 React 组件结构误当成领域模型，也不得用前端标签、`accessKind` 或组织 Membership 代替服务端 ProjectMembership 权限检查。

## 4. 原型代码清理规则

每次替换一个交互或面板时，必须同步删除：

- 被替代的 DOM 节点。
- 被替代的 CSS class。
- 旧事件监听器。
- 旧文档描述。
- 不再使用的 querySelector / id。

允许保留 mock 数据，但 mock 数据必须满足：

- 用于当前可见交互。
- 能被真实数据源替换。
- 不混入产品不可见的供应商、账号或调试信息。

## 5. 阶段结束检查

迭代中的检查按 `docs/development-workflow.md` 选择，避免无关改动反复执行整套人工回归。每个代码阶段结束前至少执行：

- `npm run check`
- `git diff --check`

改到可见 UI 时再执行浅色/深色、相关响应式状态和浏览器控制台检查。以下领域检查同样只在改动可能影响对应边界时执行：

- 在尚未建立 `CreditLedger` 的原型阶段，刷新后积分仍回到 `3000 / 0`；接入积分持久化后，这条检查必须替换为“刷新前后余额与账本一致且扣费 / 退款幂等”，不能继续重置真实积分。
- 浏览器只使用 HttpOnly 会话 Cookie，不得把原始会话 token 写进 localStorage、页面状态或日志；固定 `.test` 账号和 demo 密码不得被描述为生产鉴权。
- 项目库位于 `/app/w/:workspaceId/projects`；旧静态主页和 hash 项目库已经删除，不得重新引入第二套路由状态。
- 个人项目只对创建者可见；协作项目只对显式 ProjectMembership 成员可见。列表、详情与修改都必须在服务端按 actor 过滤，`view` 不得写入。
- 个人项目由创建者删除；协作项目只有项目级 `admin` 可以删除，组织 `owner/admin` 不自动获得该项目的删除权。当前删除必须是可恢复的软删除。软删除后列表、详情、画布读取和画布保存都必须拒绝访问，但不得级联清除 ProjectMembership 或 CanvasDocument。
- 登录标识与联系邮箱 / 手机号是不同字段。可选联系资料不得被当作已验证身份，也不得因为填写就自动开启用量报表订阅。
- 路由画布按 `projectId + canvasId` 保存 CanvasDocument，并用 revision 防止多窗口静默覆盖；尚无文档的画布加载只能建立内存同步基线，不能因纯浏览创建空记录，首次真实修改才写入 revision 1；legacy bundle 不得混入账号、积分、撤销栈、运行任务或素材 Blob。
- iframe 保存状态只能由无 DOM 的持久化协调器独占；宿主与 iframe 必须同时校验 origin、source、协议版本、iframe instance 与 route scope。重复 ready、陈旧 requestId 和旧 scope 的异步保存完成不得重新 hydrate、推进 revision 或写入当前画布。同 route 出现新 iframe instance 时，必须隔离新旧 epoch 的 dirty / saving / navigation 计数，并等待旧同 scope 保存结算后再 hydrate 最新 revision；旧保存失败需要先重新读取服务端权威文档。
- 每个内部 CanvasRecord 是节点、组、连接、视口、层级和撤销栈的唯一 runtime 权威；根 `state` 只能通过 runtime store 门面访问活动画布，`render()` 和画布切换不得用复制字段维持第二份工作集。增删、复制内部画布和后台写回即使不渲染当前画布，也必须显式触发文档保存。
- CanvasCommand 必须先在 touched collection 的副本上完成 before conflict、归一化和 transition validation，再一次性替换 CanvasRecord 内容；失败不得写内容、撤销或保存 effect，effect 失败也不得把已经提交的内容伪报为命令失败。连接 renderer 只消费已归一化内容。节点字段命令建立前，executor 的应用适配器必须拒绝 nodes / groups 变更，不能用整节点快照把 `mode / mediaKind`、任务态和临时 UI 状态带进撤销。
- 当前只开发桌面端；保留必要的窄屏防御规则，但不新增移动端页面、手势或独立状态分支。
- 扫描旧入口、旧文案和不存在的 DOM id。
- 跨画布生成任务不会停滞或写入错误画布。
- 节点生成 / 提示词优化的运行记录与 timer 只由 `canvas-node-task-runner.js` 持有，输入使用独立快照。启动前验证活动画布内的实际节点对象；完成或取消同时验证项目、画布、节点、任务记录与节点对象身份，旧回调不得写入同 ID 的替代节点或清除新任务。普通切画布保留后台任务；删除节点（含撤销创建）、删除画布、hydrate、宿主上下文替换与访问失效必须取消对应任务。节点 / 画布复制和删除撤销均不恢复忙碌态。
- 生成节点的 `mediaKind` 在创建时必须非空且不可变；UI、同类型模型过滤、参数归一化、任务启动 / 完成、复制、序列化恢复和撤销都以它为准。结果生命周期不得改变或清空 `mediaKind`，旧 `mode / lockedMode` 仅允许在版本化迁移适配器中出现。
- 撤销历史不会跨画布或跨项目恢复内容。
- 项目资产不会泄漏到新项目；工作区资产通过显式引用复用。
- 模型不支持的隐藏参数不会参与计费。

如果阶段改动涉及画布交互，还必须验证：

- 中键和空格平移。
- 空白框选。
- 多选移动。
- 功能区滚轮不带动画布。
- 生成节点未填写提示词时生成按钮不可用。
- 旧画布应用内的 `Ctrl/Cmd + 滚轮` 不得泄漏为浏览器页面缩放；功能区保留自身普通滚动，画布区域才执行画布缩放。

## 6. 提交与分支规则

- 每个阶段保留一个可运行提交。
- 阶段性提交后再打标签，不给未验证状态打标签。
- 新 Agent 开分支时，从最近的阶段标签或明确交接提交开始。
- 不要把“清理旧代码”和“新增大功能”混在同一个提交里，除非清理是该功能完成的必要结果。
