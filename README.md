# Reelay 产品预演版

Reelay 产品预演版是一套可执行的产品行为蓝本：已确认规则可运行，前端交互真实，后端服务可模拟。当前已有账户密码演示登录、个人 / 协作项目、项目权限、画布保存与个人素材 / 主体管理；未确认规则和后续规划见 `docs/product-expansion-plan.md`，已实现边界见 `docs/current-product-spec.md`。

当前没有真实生成接口、正式账号生命周期或积分账本。十个固定 `.test` 演示账号、会话、组织、项目和画布文档，以及个人 Media / Entity 元数据已保存到 PostgreSQL；本地媒体二进制由 filesystem ObjectStore 保留，尚不构成完整云端素材服务。登录、主页和项目库使用 React 路由，`index.html` 为迁移期画布 iframe。

本地 `main` 是已验证的集成基线，主工作目录可以检出当前活动的 `codex/<具体任务>` 分支。开始前运行 `npm run worktrees`，确认实际分支、目录和相对主线进度；新切片从已验证基线建立分支，同一切片的连续调整复用活动分支。`codex/archive/*` 仅用于历史与未定稿草稿取回，不整体覆盖主线。保留的旧 worktree 可能含 Git 未跟踪的本机媒体，不能因为代码已合入就删除目录。本地集成、远端 `origin/main` 和公网部署分别核验，不能从其中一个推断其他状态。

## 文件结构

```text
.
├─ index.html                       迁移期画布 iframe 页面结构
├─ styles.css                       样式入口
├─ styles/
│  └─ app.css                       画布视觉样式与主题
├─ app.js                           画布、节点、素材、Agent 交互逻辑
├─ app-shell.html                   React 应用壳入口
├─ vite.shell.config.ts             隔离应用壳开发与构建配置
├─ tsconfig.shell.json              新应用壳严格类型检查
├─ package.json                     原型检查与应用壳开发入口
├─ compose.yaml                     本地 PostgreSQL 18.4
├─ scripts/                         语法、配置、CSS、HTML 契约检查
├─ tests/                           模型配置与原型契约测试
├─ AGENTS.md                        Agent 接力开发约束
├─ data/
│  └─ model-catalog.js              图片、视频生成模型目录
├─ src/
│  ├─ config/
│  │  └─ prototype-config.js        画布原型配置
│  ├─ app/                          React 应用壳、受保护路由与 route data
│  ├─ application/                  repository / gateway ports
│  ├─ domain/                       与 UI、HTTP、存储无关的领域类型
│  ├─ infrastructure/               浏览器 HTTP gateway / repository adapters
│  ├─ legacy-canvas/                旧画布宿主、控制器、内容事务与桥接协议
│  ├─ pages/                        登录、主页、项目库与画布宿主页
│  ├─ shared/                       品牌、账户栏、项目卡与主题等共享 UI
│  └─ server/                       最小共享服务、演示会话与项目 API
└─ docs/
   ├─ local-development.md          首次初始化、日常启动与本机数据位置
   ├─ development-workflow.md       按任务范围选读文档与运行检查
   ├─ current-product-spec.md       当前产品与实现说明
   ├─ product-expansion-plan.md     其他页面与产品架构规划
   ├─ agent-handoff.md              工程交接与分支边界
   ├─ engineering-guardrails.md     工程护栏
   └─ model-catalog-notes.md        模型命名与来源判断
```

## 本地运行当前主链路

启动步骤、本机 API / ObjectStore 的实际位置统一见 [本地开发说明](docs/local-development.md)。

- **首次初始化或换电脑**：准备 Node.js 24 和 Docker Desktop，按说明安装锁定依赖并执行本地初始化。当前 seed 包含十个演示账号、示例项目、9 张图片、2 条本地 MP3，以及“雾森信使 / 曜石勘探体”两个主体；文件随仓库同步，元数据和对象内容仍需在本机建立。
- **继续既有环境**：先核对活动分支、已运行服务和既有 ObjectStore 路径，再复用或启动所需服务。`db:setup` 是初始化入口，不是每天启动或每次拉取后默认执行的命令；有 schema 或夹具变化时，按本地开发说明选择对应步骤。

完整路由预览为 `http://127.0.0.1:5173/app/login`，主演示账号为 `creator@reelay.test / reelay-demo`。演示会话通过 HttpOnly Cookie 维持；固定账号不代表正式账号系统。公网初始化与资产限制另见 [公网预览说明](docs/vercel-supabase-preview.md)。

`index.html` 由 React 画布宿主在同源 iframe 中加载，不再作为独立登录或主页入口使用。

## 变更验证

准备好锁定依赖后，代码里程碑执行：

```powershell
npm run check
git diff --check
```

它会检查旧原型的 JavaScript、配置、CSS、HTML 与基础契约，以及应用壳和服务端的 TypeScript 与 Vitest。PostgreSQL schema / adapter 改动还要在本地数据库健康时执行 `npm run check:server:postgres`；开发中的定向检查见 [docs/development-workflow.md](docs/development-workflow.md)。

## 当前能力

- 登录流程：固定演示账号由服务端校验并建立 HttpOnly 会话；未登录深链会返回登录页，成功后恢复被授权的目标路由。忘记密码、Google 登录、协议和注册仍只做明确的未接入提示。
- 登录后主页：React 路由直接读取工作空间和项目 API；最近项目在同一组织内跨个人 / 协作项目按时间混排，首张卡为新建项目，并保留三卡创作主题、创作意图输入和能力快捷入口。
- 全部项目：个人 / 协作项目是同一组织下的项目访问类型，支持本地搜索、PostgreSQL 持久化的新建与重命名、协作标识、快捷改名笔和统一三点菜单。个人项目由创建者、协作项目由项目级 `admin` 二次确认后软删除并立即撤销访问；修改封面和转换归属仍是未接入提示，回收站恢复与永久删除尚未实现。
- 多账号组织演示：十个固定账号可用于同一组织的权限场景，两个隔离浏览器会话可同时读取和重命名同一协作项目，各自的个人项目不可互见。
- 路由画布宿主：进入画布前校验会话、工作空间和项目；旧画布通过 iframe 隔离运行，并以版本化桥协议按 `projectId + canvasId` 加载、自动保存 `CanvasDocument`。`admin/edit` 可写，`view` 只读，revision 冲突会停止自动覆盖并要求重新进入项目。
- 无限画布：缩放、平移、动态网格、空状态提示、小地图、适应视图和比例工具；快捷键说明位于左侧个人菜单的帮助子层。
- 画布入口：左侧中部放置画布切换、资产库、分享和个人入口，积分进入个人菜单；右上角保留 Agent。分享授权与申请闭环尚未实现。
- 生成节点：按[模型目录](data/model-catalog.js)生成模型选项及比例 / 分辨率 / 画质 / 时长 / 数量参数，支持积分展示、缩放自适应提示词输入、资产引用和真实媒体模拟生成；目录说明见[模型能力说明](docs/model-catalog-notes.md)。
- 媒体与主体资产：支持图片、视频、音频节点及 `个人 / 组织 / 平台`、`素材 / 主体库` 两级资产面板；个人 Media 与当前项目引用可持久化，个人根目录 Entity 支持新建、字段与有序素材编辑、封面、四类主体内筛选、版本化更新和刷新恢复。主体使用已可逐 Media 展开为独立输入或画布素材节点，不建立随主体更新的绑定；正式 Node 级稳定引用、Folder、组织发布与 Entity 删除恢复尚未完成。
- 多选操作：框选、多节点移动、可拉伸可进出的可视化组框、组级移动 / 解组 / 执行和既有局部布局；删除、移动、建组 / 解组、局部布局、Alt 复制、参数与命名可撤销。普通新建撤销和整画布整理仍未补齐。
- Agent 对话栏：可收起/展开、历史会话下拉、对话输入框、模型偏好菜单。
- 账号菜单：左侧个人入口展开可用积分及组织 / 账号 / 外观 / 帮助 / 退出操作；积分项打开 React 账号设置中的“我的积分”。
- 主题：浅色、深色。

## 工程状态

当前代码是可持续迭代的产品行为预演版，尚不属于生产工程。已建立的工程边界与剩余范围如下：

- 模块拆分：登录、主页、项目库和 HTTP adapter 已离开 `app.js`；旧画布已提取 runtime store、保存协调器、节点 task runner、主体使用控制器和内容事务模块。离散节点参数、命名、组关系与既有局部布局已完成本批治理，其余内容入口仍按产品功能逐步迁移。
- 工程工具链：迁移期旧画布继续保留 JavaScript、配置、结构检查与真实序列化 / 只读行为测试；React 壳使用 TypeScript、Vite 与 Vitest，主要页面按 route 拆包，并通过 `npm run check` 一起验证。格式化、lint 和浏览器端到端测试在出现对应代码量与稳定主链路后再引入。
- 数据层：会话、Workspace、Membership、Project、CanvasDocument 及个人 Media / Entity 元数据已通过 PostgreSQL 持久化，本地媒体二进制由 filesystem ObjectStore 持久保存。CanvasDocument 仍是迁移快照；撤销历史、生成任务、生成历史和积分账本未持久化，公网私有对象存储尚未接入。
- 依赖治理：React 壳通过包管理器使用 Lucide；旧静态画布使用仓库内的最小图标路径子集，不依赖外部 CDN 或完整 vendor 包。
- 版本管理：已建立 Git 基线和 Agent 接力约束，后续功能应通过独立分支和小范围提交推进。

详细产品说明见 [docs/current-product-spec.md](docs/current-product-spec.md)。
