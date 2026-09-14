# Reelay 工程护栏

本文只记录跨功能必须成立的代码、状态与数据边界。开始工作、分支、检查和发布按 [开发工作流](development-workflow.md)；视觉准则见 [设计规范](design-system.md)，功能行为见 [当前产品规范](current-product-spec.md)。发现规则与运行证据冲突时修正错误规则与实现，不用补丁维持已失效的假设。

## 1. 当前基线

- 当前项目是 React 应用壳、Fastify 服务、PostgreSQL / ObjectStore 与 legacy canvas 并存的产品预演版，不是生产应用；服务可在本机运行，数据位置由环境决定，不据此假定业务数据在本机。
- 当前阶段采用渐进式迁移：保留已验证的画布交互，把新的数据边界、任务和页面逐步移出原型单体。

## 2. 不可继续扩大的位置

新增页面与模块归属按[工作流的目录约定](development-workflow.md#目录与代码约定)；新大型页面样式也不得继续堆进 `styles/app.css`。以下只补充跨模块契约。

## 3. 新增功能放置规则

| 改动类型 | 应放位置 |
| --- | --- |
| 模型条目、参数能力、可替换的演示用量模板 | `data/model-catalog.js`；React 通过 `src/features/models` 类型化读取 |
| 静态原型配置、模拟素材、布局常量 | `src/config/prototype-config.js` |

不要用新的浮层、静态入口或隐藏容器假装完成页面结构；legacy canvas 通过显式 host / bridge 逐步接入。

服务端 route 只依赖完成该端点所需的 capability 组合；授权相关 repository / use-case 必须显式接收 actor scope，并在存储边界原子校验。不能把 route 的前置查询当作唯一授权，也不能让新 Asset、Generation 或 Credit 入口重新依赖完整 composition-root store。

Phase 0B 的 runtime、Workspace 路由和 legacy canvas 迁移边界记录在 `docs/adr/0001-application-runtime-and-migration.md`，单组织与项目访问控制记录在 `docs/adr/0002-organization-project-access.md`。不得把 React 组件结构误当成领域模型，也不得用前端标签、`accessKind` 或组织 Membership 代替服务端 ProjectMembership 权限检查。

## 4. 原型代码清理规则

旧路径、动态使用和兼容数据的清理按[工作流第 5 节](development-workflow.md#5-清理与文档维护)。

允许保留 mock 数据，但 mock 数据必须满足：

- 用于当前可见交互。
- 能被真实数据源替换。
- 不混入产品不可见的供应商、账号或调试信息。

## 5. 状态与数据不变量

以下边界始终成立，验证按本次影响面选择；具体命令与代码里程碑要求统一见开发工作流，不将局部修改升级成全站人工回归。

- 在尚未建立 `CreditLedger` 的原型阶段，刷新后积分仍回到 `3000 / 0`；接入积分持久化后，这条检查必须替换为“刷新前后余额与账本一致且扣费 / 退款幂等”，不能继续重置真实积分。
- 浏览器只使用 HttpOnly 会话 Cookie，不得把原始会话 token 写进 localStorage、页面状态或日志；固定 `.test` 账号和 demo 密码不得被描述为生产鉴权。
- 项目库位于 `/app/w/:workspaceId/projects`；旧静态主页和 hash 项目库已经删除，不得重新引入第二套路由状态。
- 个人项目只对创建者可见；协作项目只对显式 ProjectMembership 成员可见。列表、详情与修改都必须在服务端按 actor 过滤，`view` 不得写入。
- 个人项目由创建者删除；协作项目只有项目级 `admin` 可以删除，组织 `owner/admin` 不自动获得该项目的删除权。当前删除必须是可恢复的软删除。软删除后列表、详情、画布读取和画布保存都必须拒绝访问，但不得级联清除 ProjectMembership 或 CanvasDocument。
- 登录标识与联系邮箱 / 手机号是不同字段。可选联系资料不得被当作已验证身份，也不得因为填写就自动开启用量报表订阅。
- 路由画布按 `projectId + canvasId` 保存 CanvasDocument，并用 revision 防止多窗口静默覆盖；尚无文档的画布加载只能建立内存同步基线，不能因纯浏览创建空记录，首次真实修改才写入 revision 1；持久化文档不得混入账号、积分、撤销栈、运行任务或素材 Blob。这是数据边界，不是禁止画布代码包含相关 UI / 模拟功能。
- iframe 保存状态只能由无 DOM 的持久化协调器独占；宿主与 iframe 必须同时校验 origin、source、协议版本、iframe instance 与 route scope。重复 ready、陈旧 requestId 和旧 scope 的异步保存完成不得重新 hydrate、推进 revision 或写入当前画布。同 route 出现新 iframe instance 时，必须隔离新旧 epoch 的 dirty / saving / navigation 计数，并等待旧同 scope 保存结算后再 hydrate 最新 revision；旧保存失败需要先重新读取服务端权威文档。
- 每个内部 CanvasRecord 是节点、组、连接、视口、层级和撤销栈的唯一 runtime 权威；根 `state` 只能通过 runtime store 门面访问活动画布，`render()` 和画布切换不得用复制字段维持第二份工作集。增删、复制内部画布和后台写回即使不渲染当前画布，也必须显式触发文档保存。
- CanvasCommand 必须先在 touched collection 的副本上完成 before conflict、归一化和 transition validation，再同步提交；字段提交只修改声明的字段，保留 live node / group 和未修改对象的身份。失败不得写内容、撤销或保存 effect，effect 失败也不得把已经提交的内容伪报为命令失败。节点命令仅接受 `canvas-content-commands.js` 的字段白名单；组只在创建 / 删除时使用 canonical record，更新使用字段事务。不能用整节点快照把 `mode / mediaKind`、任务态、素材对象或临时 UI 状态带进撤销。点击置顶的层级变化不作为局部布局撤销的冲突条件。
- 组的 `nodeIds` 与节点 `groupId` 必须在同一内容事务中成立；兼容修复只在 hydrate 边界执行，render / bounds 读取不得修复成员或回写组框。高频 pointer preview 仍由手势 session 持有，取消恢复起始状态，完成一次手势只记录一次撤销。字段历史的对象身份检查只可在受控删除撤销恢复后显式衔接，不能在任意同 ID 替换或 hydrate 时重绑定。
- 当前只开发桌面端；保留必要的窄屏防御规则，但不新增移动端页面、手势或独立状态分支。
- 节点生成的运行记录与 timer 由 `canvas-node-task-runner.js` 持有，输入使用独立快照。启动前验证活动画布内的实际节点对象；完成或取消同时验证项目、画布、节点、任务记录与节点对象身份，旧回调不得写入同 ID 的替代节点或清除新任务。普通切画布保留后台生成；删除节点（含撤销创建）、删除画布、hydrate、宿主上下文替换与访问失效必须取消对应任务。节点 / 画布复制和删除撤销均不恢复忙碌态。
- 提示词优化的建议与 timer 归 `prompt-optimization-service.js`，由专属 controller / view 连接 UI，不进入节点生成 runner，完成也不自动写输入。手动填入由 adapter 提交：节点是一条可撤销字段变更，会话只更新所属草稿。节点对象 / 会话草稿轮次隔离结果、晚到回调与撤销，详细保留规则见 [提示词优化说明](prompt-optimization-development.md)。
- 对话生成任务归 `generation-task-service.js`，结果放置通过画布内容适配执行；不能把“当前打开的画布”当作发起任务的归属。新异步流程先明确 owner、输入快照、取消 / 失效条件及唯一结算位置，timer 清理不能替代完成时的所有权验证。
- 生成节点的图片 / 视频类型在创建时确定且不可变，CanvasDocument 与任务快照统一用 `mediaKind` 表达；UI、模型过滤、参数归一化、任务、复制和撤销必须保持同一类型。迁移期 legacy runtime 暂用内部 `mode` 适配该类型，不能形成另一套独立可变的类型状态；旧文档的 `mode / lockedMode` 由版本化读取器兼容，新文档不写这些旧字段。后续正式 Node 迁移完成后再移除 runtime 适配，不把当前护栏误读为已经完成字段迁移。
- 撤销历史不会跨画布或跨项目恢复内容。
- 项目资产不会泄漏到新项目；工作区资产通过显式引用复用。元数据与原文件分别归 AssetStore / ObjectStore，Git 同步不是数据同步；保留数据位置和环境操作见 [本地开发](local-development.md)，不通过重新 seed 掩盖素材缺失。
- 模型不支持的隐藏参数不会参与计费。

## 6. 交互与完成边界

涉及画布交互时保持以下语义，并按影响范围复验：

- 中键和空格平移。
- 空白框选。
- 多选移动。
- 菜单、侧栏、素材架、工具条、按钮、滑杆和独立输入控件的普通滚轮不带动画布；生成节点编辑器不能作为整块功能区无条件拦截滚轮。其空白区域、未聚焦正文和无溢出的聚焦短文本应允许画布平移；仅已聚焦且内容溢出的提示词保留内部滚动，到达顶部或底部也不链出到画布。嵌套菜单与控件的本地策略优先于编辑器背景规则。
- 生成节点未填写提示词时生成按钮不可用。
- 旧画布应用内的 `Ctrl/Cmd + 滚轮` 不得泄漏为浏览器页面缩放；画布及生成节点编辑器的正文、空白区域执行画布缩放，菜单、侧栏、素材架和具体控件继续拦截。实际执行画布滚轮平移或缩放时退出当前提示词焦点，但不收起节点或修改内容。提示词 Escape 仅退出编辑，输入法组合期间不抢占该按键；键盘聚焦、选区、文字输入和文本撤销应继续有效，不能用禁用指针或只读属性代替未聚焦状态。
