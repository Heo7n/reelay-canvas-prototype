# Reelay Canvas Prototype

Reelay 是一个 AIGC 创作平台原型。当前已形成一条本地可运行的前后端演示链路：账户密码登录、单组织下的个人 / 协作项目、主页、全部项目和受保护的旧画布入口；画布继续用于验证生成节点、媒体素材和 Agent 辅助的核心创作体验。

这仍不是生产系统：没有真实生成接口、正式账号生命周期、素材持久化或积分账本。当前后端只接受十个固定的 `.test` 演示账号；会话、组织、项目元数据、项目成员关系与路由画布文档已保存到 PostgreSQL。登录、主页和项目库只保留 React 正式路由，`index.html` 继续作为迁移期画布 iframe。Vercel + Supabase 公网预览只用于原型评审，不构成生产可用承诺。

## 文件结构

```text
.
├─ index.html                       迁移期画布 iframe 页面结构
├─ styles.css                       样式入口
├─ styles/
│  └─ app.css                       画布视觉样式与主题
├─ app.js                           画布、节点、素材、Agent 交互逻辑
├─ app-shell.html                   Phase 0B 应用壳入口
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
│  ├─ legacy-canvas/                旧画布宿主与版本化桥接协议
│  ├─ pages/                        登录、主页、项目库与画布宿主页
│  ├─ shared/                       品牌、账户栏、项目卡与主题等共享 UI
│  └─ server/                       最小共享服务、演示会话与项目 API
└─ docs/
   ├─ development-workflow.md       按任务范围选读文档与运行检查
   ├─ current-product-spec.md       当前产品与实现说明
   ├─ product-expansion-plan.md     其他页面与产品架构规划
   ├─ agent-handoff.md              工程交接与分支边界
   ├─ engineering-guardrails.md     工程护栏
   └─ model-catalog-notes.md        模型命名与来源判断
```

## 本地运行当前主链路

安装 Node.js 24 及 Docker Desktop，然后安装锁定依赖：

```powershell
npm ci
```

首次运行或数据库 schema 更新后，启动 PostgreSQL 并执行迁移：

```powershell
npm run db:up
npm run db:migrate
```

空库需要显式写入十个本地演示账号和示例项目；生产环境会强制拒绝这个 seed：

```powershell
$env:ALLOW_DEMO_SEED='true'
npm run db:seed
Remove-Item Env:ALLOW_DEMO_SEED
```

默认连接为 `postgresql://reelay:reelay-local-only@127.0.0.1:54329/reelay`，只用于本机开发；需要改端口或凭据时参考 `.env.example`，并同步设置服务端的 `DATABASE_URL`。

随后在两个终端分别启动本地共享服务和 React 应用：

```powershell
npm run dev:server
npm run dev:shell
```

访问 `http://127.0.0.1:5173/app/login`。十个演示账号都属于 `星海视觉工作室`；组织角色为一名主账户、两名管理员和七名成员，个人项目彼此隔离，协作项目另按 `admin/edit/view` 预置项目成员：

```text
creator@reelay.test / reelay-demo
linjing@reelay.test      / reelay-demo
liran@reelay.test        / reelay-demo
chenxi@reelay.test       / reelay-demo
zhouyu@reelay.test       / reelay-demo
suhe@reelay.test         / reelay-demo
wangyin@reelay.test      / reelay-demo
xuzhe@reelay.test        / reelay-demo
yelan@reelay.test        / reelay-demo
shenan@reelay.test       / reelay-demo
```

开发壳会把 `/api` 请求转发到 `http://127.0.0.1:5175`。账号使用 HttpOnly 服务端会话，浏览器 token 在数据库中只保存 SHA-256 摘要并具有过期时间。演示密码散列与固定账号仍只是本地夹具，不是正式账号系统。

`index.html` 由 React 画布宿主在同源 iframe 中加载，不再作为独立登录或主页入口使用。

## 变更验证

安装 Node.js 24，并先安装锁定依赖：

```powershell
npm ci
npm run check
```

它会检查旧原型的 JavaScript、配置、CSS、HTML 与基础契约，以及应用壳和服务端的 TypeScript 与 Vitest。PostgreSQL schema / adapter 改动还要在本地数据库健康时执行 `npm run check:server:postgres`；开发中的定向检查见 [docs/development-workflow.md](docs/development-workflow.md)。

## 当前能力

- 登录流程：固定演示账号由服务端校验并建立 HttpOnly 会话；未登录深链会返回登录页，成功后恢复被授权的目标路由。忘记密码、Google 登录、协议和注册仍只做明确的未接入提示。
- 登录后主页：React 路由直接读取工作空间和项目 API；最近项目跨个人与协作空间按时间混排，首张卡为新建项目，并保留三卡创作主题、创作意图输入和能力快捷入口。
- 全部项目：个人 / 协作项目是同一组织下的项目访问类型，支持本地搜索、PostgreSQL 持久化的新建与重命名、协作标识、快捷改名笔和统一三点菜单。个人项目由创建者、协作项目由项目级 `admin` 二次确认后软删除并立即撤销访问；修改封面和转换归属仍是未接入提示，回收站恢复与永久删除尚未实现。
- 多账号组织演示：十个固定账号可用于同一组织的权限场景，两个隔离浏览器会话可同时读取和重命名同一协作项目，各自的个人项目不可互见。
- 路由画布宿主：进入画布前校验会话、工作空间和项目；旧画布通过 iframe 隔离运行，并以版本化桥协议按 `projectId + canvasId` 加载、自动保存 `CanvasDocument`。`admin/edit` 可写，`view` 只读，revision 冲突会停止自动覆盖并要求重新进入项目。
- 无限画布：缩放、平移、动态网格、空状态提示、小地图、适应视图和比例工具；快捷键说明位于右上角个人菜单的帮助子层。
- 顶部协作：右上角分享与账户积分入口，Agent 对话栏展开或调宽时自动避让。
- 生成节点：13 个精选图片/视频模型、按模型能力动态生成的比例/分辨率/画质/时长/数量参数、积分、缩放自适应提示词输入、资产引用、真实媒体模拟生成。
- 媒体素材节点：支持从本地拖入图片、视频、音频，按原始比例展示；宽侧栏资产库按项目素材、画布文件、个人、官方公用库、组织空间分层；单选媒体提供可定制编辑工具栏。
- 多选操作：框选、多节点移动、可拉伸可进出的可视化组框、组级移动/解组/执行、三种布局；删除、移动、参数修改和重命名支持撤销。
- Agent 对话栏：可收起/展开、历史会话下拉、对话输入框、模型偏好菜单。
- 账号菜单：头像下方积分徽标、可用积分、动态累计消耗、组织/账号/外观/帮助/退出入口。
- 主题：浅色、深色。

## 工程状态

当前代码适合作为高保真前端原型继续迭代，还不属于生产工程。本轮已开始把样式入口、模型目录和静态原型配置从主逻辑中分离，但生产化前仍需要补齐：

- 模块拆分：登录、主页、项目库和 HTTP adapter 已离开 `app.js`；旧画布、生成节点、媒体节点、Agent 和历史状态仍需继续按数据所有权拆分。
- 工程工具链：迁移期旧画布继续保留 JavaScript、配置、结构检查与真实序列化 / 只读行为测试；React 壳使用 TypeScript、Vite 与 Vitest，主要页面按 route 拆包，并通过 `npm run check` 一起验证。格式化、lint 和浏览器端到端测试在出现对应代码量与稳定主链路后再引入。
- 数据层：会话、Workspace、Membership、Project 和 CanvasDocument 已使用 PostgreSQL repository、带 checksum 的顺序迁移与幂等 demo seed；当前 CanvasDocument 只承载版本化的 legacy 画布迁移快照，素材二进制、撤销命令、生成任务、生成历史和积分账本仍未持久化。
- 依赖治理：React 壳通过包管理器使用 Lucide；旧静态画布使用仓库内的最小图标路径子集，不依赖外部 CDN 或完整 vendor 包。
- 版本管理：已建立 Git 基线和 Agent 接力约束，后续功能应通过独立分支和小范围提交推进。

详细产品说明见 [docs/current-product-spec.md](docs/current-product-spec.md)。
