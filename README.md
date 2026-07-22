# Reelay Canvas Prototype

Reelay 是一个 AIGC 创作平台原型。当前已形成一条本地可运行的前后端演示链路：账户密码登录、个人 / 组织工作空间、主页、全部项目和受保护的旧画布入口；画布继续用于验证生成节点、媒体素材和 Agent 辅助的核心创作体验。

这仍不是生产系统：没有真实生成接口、持久数据库、正式账号生命周期或部署链路。当前后端只接受两个固定的 `.test` 演示账号，项目保存在服务端进程内；重启服务后数据重置。旧静态登录页和主页暂时保留作视觉回归参考，不再承接新功能。

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

安装 Node.js 20 或更高版本，并安装锁定依赖：

```powershell
npm ci
```

在两个终端分别启动本地共享服务和 React 应用：

```powershell
npm run dev:server
npm run dev:shell
```

访问 `http://127.0.0.1:5173/app/login`。两个演示账号共享 `Reelay 创作组`，个人空间互相隔离：

```text
tianmaochao@reelay.test / reelay-demo
linjing@reelay.test      / reelay-demo
```

开发壳会把 `/api` 请求转发到 `http://127.0.0.1:5175`。账号使用 HttpOnly 服务端会话；项目仍是 server-memory 演示数据，不是持久化或生产鉴权。

旧静态入口仍可用作兼容和视觉回归参考：

```powershell
python -m http.server 5174 --bind 127.0.0.1
```

对应 `login.html`、`home.html` 和 `index.html`。新页面与账户逻辑不得再写入这些静态入口。

## 变更验证

安装 Node.js 20 或更高版本，并先安装锁定依赖：

```powershell
npm ci
npm run check
```

它会检查旧原型的 JavaScript、配置、CSS、HTML 与基础契约，以及应用壳的 TypeScript 和 Vitest。开发中的定向检查见 [docs/development-workflow.md](docs/development-workflow.md)；浏览器手势、主题与跨画布任务只在相关改动影响对应边界时运行验证。

## 当前能力

- 登录流程：固定演示账号由服务端校验并建立 HttpOnly 会话；未登录深链会返回登录页，成功后恢复被授权的目标路由。忘记密码、Google 登录、协议和注册仍只做明确的未接入提示。
- 登录后主页：React 路由直接读取工作空间和项目 API；最近项目跨个人与协作空间按时间混排，首张卡为新建项目，并保留三卡创作主题、创作意图输入和能力快捷入口。
- 全部项目：个人 / 协作项目是不同工作空间投影，支持本地搜索、真实的 server-memory 新建与重命名、协作标识、快捷改名笔和统一三点菜单；修改封面、转换归属和删除尚未接入。
- 双账号组织演示：两个隔离浏览器会话可读取和重命名同一组织项目，各自的个人项目不可互见。
- 路由画布宿主：进入画布前校验会话、工作空间和项目；旧画布通过 iframe 隔离运行。它尚未消费项目内容或保存 `CanvasDocument`，因此不能把“能进入某项目路由”等同于项目画布已持久化。
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
- 工程工具链：旧静态原型继续保留 JavaScript、配置、结构和 Node 契约测试；Phase 0B 新代码使用 TypeScript、Vite 与 Vitest，并通过 `npm run check` 一起验证。格式化、lint 和浏览器端到端测试在出现对应代码量与稳定主链路后再引入。
- 数据层：以 PostgreSQL repository 和 schema 迁移替换 server-memory，再补齐画布文档、素材、命令历史、会话和生成任务持久化。
- 依赖治理：React 壳通过包管理器使用 Lucide；旧静态画布继续固定本地 vendor 版本，直到迁移对应表面。
- 版本管理：已建立 Git 基线和 Agent 接力约束，后续功能应通过独立分支和小范围提交推进。

详细产品说明见 [docs/current-product-spec.md](docs/current-product-spec.md)。
