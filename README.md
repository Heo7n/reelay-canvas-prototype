# Reelay Canvas Prototype

Reelay 是一个 AIGC 创作平台前端原型。当前由账户密码登录样机、登录后创作主页与无限画布组成，专注验证从登录、项目选择和创作意图进入画布，再到生成节点、媒体素材和 Agent 辅助的核心链路。

当前用户可见产品仍是静态前端原型，没有后端、真实生成接口或真实账号系统。Phase 0B 已加入隔离的 React + TypeScript + Vite 应用壳、browser route contract 和构建检查，但登录、主页与画布尚未迁入正式路由，也没有部署链路。

## 文件结构

```text
.
├─ login.html                       账户密码登录流程样机
├─ home.html                        登录后创作主页与项目库页面状态
├─ index.html                       画布页面结构
├─ styles.css                       样式入口
├─ styles/
│  ├─ app.css                       画布视觉样式与主题
│  ├─ home.css                      主页视觉、项目库页面与响应式
│  └─ login.css                     登录页视觉、表单与响应式
├─ app.js                           画布、节点、素材、Agent 交互逻辑
├─ vendor/
│  └─ lucide-1.25.0.min.js         本地固定版本图标运行时
├─ app-shell.html                   Phase 0B 应用壳入口
├─ vite.shell.config.ts             隔离应用壳开发与构建配置
├─ tsconfig.shell.json              新应用壳严格类型检查
├─ package.json                     原型检查与应用壳开发入口
├─ scripts/                         语法、配置、CSS、HTML 契约检查
├─ tests/                           模型配置与原型契约测试
├─ AGENTS.md                        Agent 接力开发约束
├─ data/
│  └─ model-catalog.js              图片、视频生成模型目录
├─ src/
│  ├─ config/
│  │  ├─ prototype-config.js        画布静态原型配置
│  │  └─ home-prototype-config.js   主页轮播、能力与项目 mock
│  ├─ home/
│  │  └─ index.js                   主页与项目库交互
│  ├─ login/
│  │  └─ index.js                   登录流程样机交互
│  ├─ app/                          React 应用壳、路由与入口
│  ├─ application/                  repository / gateway ports
│  ├─ domain/                       与 UI、HTTP、存储无关的领域类型
│  ├─ legacy-canvas/                旧画布宿主与版本化桥接协议
│  ├─ pages/                        渐进迁移中的路由页面
│  └─ server/                       最小共享服务、演示会话与项目 API
└─ docs/
   ├─ development-workflow.md       按任务范围选读文档与运行检查
   ├─ current-product-spec.md       当前产品与实现说明
   ├─ product-expansion-plan.md     其他页面与产品架构规划
   ├─ agent-handoff.md              工程交接与分支边界
   ├─ engineering-guardrails.md     工程护栏
   └─ model-catalog-notes.md        模型命名与来源判断
```

## 本地预览

可以直接打开 `index.html`，也可以在当前目录启动静态服务：

```powershell
python -m http.server 5174 --bind 127.0.0.1
```

然后访问：

```text
http://127.0.0.1:5174/login.html 登录流程样机
http://127.0.0.1:5174/home.html  登录后主页
http://127.0.0.1:5174/           无限画布
```

预览尚未接管产品页面的 React 应用壳：

```powershell
npm ci
npm run dev:shell
```

另开一个终端启动本地共享服务：

```powershell
npm run dev:server
```

开发壳会把 `/api` 请求转发到 `http://127.0.0.1:5175`。当前服务使用进程内存储，只用于验证两个浏览器的独立会话和同一组织项目共享；服务重启后数据重置，不是持久化。

## 变更验证

安装 Node.js 20 或更高版本，并先安装锁定依赖：

```powershell
npm ci
npm run check
```

它会检查旧原型的 JavaScript、配置、CSS、HTML 与基础契约，以及应用壳的 TypeScript 和 Vitest。开发中的定向检查见 [docs/development-workflow.md](docs/development-workflow.md)；浏览器手势、主题与跨画布任务只在相关改动影响对应边界时运行验证。

## 当前能力

- 登录流程：默认填充虚构演示账号并短暂提示，可直接进入主页；忘记密码、Google 登录、协议和注册入口仅用于验证版式，点击会明确提示尚未接入，不提供真实鉴权。
- 登录后主页：三卡创作主题、创作意图输入、能力快捷入口、按近期混排的最近项目、即时切换的全部项目页面状态、本地搜索、“个人 / 协作项目”筛选，以及与画布的双向入口；两个项目分类都固定以“新建项目”作为首张卡，协作项目以多人图标标识，现有项目卡提供统一三点菜单原型。
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

- 模块拆分：将画布、生成节点、媒体节点、Agent、主题和历史状态拆成独立模块。
- 工程工具链：旧静态原型继续保留 JavaScript、配置、结构和 Node 契约测试；Phase 0B 新代码使用 TypeScript、Vite 与 Vitest，并通过 `npm run check` 一起验证。格式化、lint 和浏览器端到端测试在出现对应代码量与稳定主链路后再引入。
- 数据层：补齐项目保存、素材持久化、完整命令历史、会话记录和真实生成任务状态。
- 依赖治理：Lucide 图标运行时已固定为本地版本；正式工程壳落地后再改由包管理器和构建产物统一管理。
- 版本管理：已建立 Git 基线和 Agent 接力约束，后续功能应通过独立分支和小范围提交推进。

详细产品说明见 [docs/current-product-spec.md](docs/current-product-spec.md)。
