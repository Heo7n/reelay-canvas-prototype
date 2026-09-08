# Reelay 当前交接

本文只保留下一位开发者真正需要的当前状态。产品细节、规划和工程规则分别以 `current-product-spec.md`、`product-expansion-plan.md`、`engineering-guardrails.md` 与 ADR 为准；阅读路径见 `development-workflow.md`。

## 2026-09-08 多会话发布集成

- 在独立 `codex/integration-20260908` worktree 从远端 `main` 的 `e0638a7` 集成主页 / 登录 / 项目页 `154674c`、画布与媒体加载 `4e85533`、节点与 Agent 输入区 `d721b88`。主体预览修复 `9fce2e5` 与 `f966305` 为相同补丁，仅保留一份实现；原工作区和共享预览服务保持原状。
- 合并保留管理员预填与按项目 / 画布归属的创建提示词交接、渐进资产初始化及权限校验、媒体缩略图到原图的切换、Seedance 2.5 模式说明 / 动态占位、Agent 单次积分估算。48 个经典脚本依赖顺序和测试入口已合并，开发入口不恢复手写缓存版本参数。
- 最终代码通过 `npm run check` 1000 项（539 legacy / 274 shell / 180 server / 7 setup）、隔离 PostgreSQL 29 项、账号与静态体验两套构建及 `git diff --cached --check`。静态体验浏览器已验收首页提示词仅创建一个待生成节点、模型模式说明和按参数估算积分，控制台无 error / warn；各切片的主题 / 响应式验收记录仍见下文。
- 本次发布不执行云库 migration / seed，也不复制 Dev / Test 数据。公网候选、promotion 和最终域名证据以本次 PR 的发布记录为准；本段的集成验收不代表部署已经完成。

## 2026-09-08 节点与对话框提交交接

- `f8b9f5a` 后的补充：Agent 添加入口由 32px 调为 36px，与节点参考区一致；发送旁从账户余额改为复用节点 `getCost` 的单次预计消耗，随当前模型 / 参数更新。Agent 自动规划或缺少参考视频时长时显示“— / 待估算”，个人余额仍由 `syncCreditDisplay` 独立更新；发送维持本地模拟且不新增扣费。后续合并须保留这一费用语义，不能恢复发送区展示余额的旧逻辑。
- 本批在实际分支 `codex/entity-library-design`、worktree `f859/0707` 上完成，父提交为 `9fce2e5`。统一节点与 Agent 输入区、积分发送区、模型 / 参数 / 添加菜单的主题和文字层级；Seedance 2.5 三模式名称居中，仅在“模式”标题旁提供一个说明入口，说明跟随父面板等宽对齐并避让视口。
- 模式说明区分上传、生成和续写时长；节点与 Agent 生成模式共用 `data/model-catalog.js` 的动态占位。全模态最终只保留“基于图片、视频或音频参考生成新视频”，不恢复两行“若需要……”；编辑 / 延长保留操作引导。更新只改 placeholder，原文、输入框身份、选区、滚动与原生文字撤销保持。
- `index.html` 与 `styles.css` 移除固定 `?v=`，修复 Vite 将旧源码视为 immutable 导致预览显示滞后；生产构建仍生成内容哈希。合并其他分支的新增 script / favicon 时保留双方入口与脚本顺序，不恢复手工版本值；新帮助 controller 及其测试入口必须一并保留。
- 本轮 `npm run check` 通过；此前已实测节点与 Agent 三模式、深浅主题、说明对齐及边界，5174 完整路由与 5177 静态体验均已更新。最后一次文案仅删除全模态两行占位，本次提交前再次通过完整检查；未执行公网发布、数据迁移或 seed。
- 后续同步先重新执行 `npm run worktrees` 核对现场。本次只读盘点时，`codex/canvas-development` 在 `e0638a7`、`codex/canvas-agent-refinement` 在 `4e85533`，两者干净；`codex/home-login-development` 和 `codex/canvas-dialog-refinement` 尚有未提交内容。主要交集是 `app.js`、`index.html`、`package.json`、共享测试与文档，需按功能合并，不整文件覆盖；参数说明 / 占位逻辑与新增媒体加载模块均须保留。主体预览修复 `9fce2e5` 与另一分支的 `f966305` 已核对 stable patch-id 相同，避免重复移植。以上为盘点快照，不代表其他任务已经合并，也不能据此推断远端或公网状态。

## 当前定位

- 2026-09-08 管理员入口与两站 Favicon 已上线：账号 <https://reelay-canvas-prototype.vercel.app/app/login?demo=admin>（炭黑），体验 <https://reelay-experience.vercel.app/app>（紫色）。构建源 `c23b338`；两个实际部署、独立上传边界和 HTTP / UI 证据见 `vercel-supabase-preview.md` 的当日记录。林静的 3 份正式 main 画布已深比通过；另保留的历史 deployment-smoke 源/副本均是原有无效测试文档，不能计作可用画布。

- 2026-09-08 管理员演示入口：`/app/login?demo=admin` 预填既有林静账号；账号版 / 体验版分别使用炭黑 / 紫色 SVG Favicon。公网 Reelay_Test 已通过原有 HTTP 上传和主体创建流程，为林静建立独立的 12 素材与 3 主体；5 个主账号项目及 4 份画布以受保护事务复制为林静的个人项目，素材 URL 指向新副本。管理员原有项目与权限保留，主账号内容未被覆盖；这是一份当前示例快照，不是后续双向同步。本机忽略目录 `.reelay-data/admin-demo/` 保存源快照、映射、事务与验证记录，不随 Git 或部署发布。此次没有向 Reelay_Dev 复制这些公网测试副本。

- 两台 Windows 长期接续开发：本机已完成 Ho_Org 下独立 Reelay_Dev（oocagsuhijyvmzwotyxn，新加坡，已确认月费 0）的业务数据与 42 个原文件迁移，并切换为主目录 `dev:server:shared` API；前端 5173 / API 5175 同用 `D:\Software\codePro\0707` 代码，与演示站 Reelay_Test 分离。家里电脑尚待安装与接续验收，不能宣称两机端到端已完成。用户明确不迁聊天记录，开发上下文随仓库交接；最新证据见下文“开始与验证”及 `cross-device-development.md`。

- 2026-09-08 主页与项目页视觉追加验收：主页轮播/最近项目/页脚在2560宽屏下均为1600px且左右对齐，1440展开侧栏及390窄屏无横向溢出；三张新生成的WebP共563650字节，来源及提示词见`assets/home/carousel-v2.md`。固定卡位淡化保留4秒轮播和暂停行为，侧卡选中后焦点跟随到中心卡；测试覆盖该焦点与暂停关系。项目页恢复上方“全部项目”标题，下方个人/协作与搜索为44px等高工具栏；顶部账户栏64px加内容上边距8px，标题从72px开始，比此前上移32px。首页最近项目右侧为主文字色“全部项目 >”。浏览器已核验深浅主题、跨分类搜索保留、窄屏两行工具栏及控制台无error/warn；临时检查页已关闭，外观/侧栏和视口已恢复。最终`npm run check`共847项（496/234/113/4）、内部构建、独立体验构建和`git diff --check`通过；未改写持久项目、重启共享服务或发布公网。

- 当前主页 / 项目设计切片：访客、登录后主页和项目页使用 EntryFrame，侧栏默认收起 64px、展开 200px，44px 导航点击区，Logo 实际墨迹与收起按钮对齐；新建不放在侧栏。侧栏、顶栏和内容共用柔白细颗粒底色，保留 1px 低对比竖线。主页按三卡轮播→居中标题与真实输入→最近项目排列；轮播、最近项目和页脚共用最大1600px版心，输入最大960px。桌面三卡30%/36%/30%、间距各2%，全16:9、垂直居中，无斜切和重叠；固定卡位内360ms淡入淡出，每4秒切换，保留原暂停/键盘规则；窄屏露出两侧。首页新图为场景构想、人物塑造、视觉探索（初始场景居中），采用远/中/近景和统一青绿暖白配色，两行HTML文案，图与提示词见assets/home/carousel-v2.md。空输入使用 PromptExamples 逐字输入、停留、删除换句，示例不写入真实 textarea；焦点/真实内容进入后隐藏，后台/登录/提交暂停，减少动态效果为静态提示。输入区右下“新建项目”支持空白创建或携带最多600字描述，仅在新建成功后发布匹配 workspace/project/canvas 的一次交接，旧画布通过 context.launchPrompt 接收并预填待生成节点，不自动生成、不直接读全局 sessionStorage。访客正常登录、跨标签已有会话、会话过期续登都保留真实输入；续登草稿只回原主页，深链及其他 Workspace 不接收，体验版仅用内存。最近项目第一格固定 NewProjectCard，随后最多3个最近项目；新建卡只创建空白个人项目。项目页顶部两层：上方24px全部项目标题，下方左侧个人/协作分段切换+右侧搜索的44px等高工具栏，层间距20px；最大1600px版心和外边距与主页统一，窄屏两行工具栏，最大1600px自适应网格，第1格始终新建，协作分类次文案说明创建个人项目；没有返回、回收站、文件夹入口或标题旁重复新建项目。项目卡为裸16:9封面与最小64px信息区，新建卡用中性轻渐变；常显横向三点移到名称右侧，移除编辑笔。封面进入项目；可编辑名称点击后原位编辑并全选，Enter/失焦保存、Esc取消、IME确认/未改名不提交、请求中只读防重、失败保留输入及可见错误。日期统一本地YYYY-MM-DD，协作多人标识位于日期左侧；原有权限边界保持。主页/项目页导航从标题开始，登录子路由保留原滚动和焦点。HomeFooter 保留品牌、禁用协议、联系邮箱和帮助。注册继续禁用，项目封面读取现有数据，本轮仅替换主页展示图；框架不覆盖画布和组织中心。
- 本轮本地验证：最终 npm run check 共846项通过（legacy496、shell233、server113、setup4），内部 npm run build、独立 npm run build:experience 和 git diff --check 通过。浏览器核验390/1440/2560宽度的主页比例、16:9封面、近期项目首格新建、项目页标题与二级分类、搜索跨分类保留及空态、新建卡在协作范围的个人归属说明、浅深主题和菜单；体验构建实测真实多行描述只带入一个待生成节点、返回再进不重复、随后空白创建不误带提示词，以及新版项目卡的新建入口。本轮追加项目卡验收：体验版项目页 Enter 改名、Esc 取消、主页失焦改名、初始全选、协作标识与固定日期、菜单定位、深浅主题和390px无横向溢出均已实测。改名提交使用当前页面action，修复旧显式workspace父路由没有action导致的整页错误；自动回归使用真实index/projects嵌套路由，两处保存均刷新新名称。未创建内部持久测试项目。自动测试覆盖IME/换行、重复提交/失败重试、普通登录及过期续登草稿、作用域校验、只读/StrictMode/初始化前不消费。最终体验构建控制台无error/warn；开发页HMR重载期间的过渡记录不作为正式运行结果。内部预览仍5176、共享API5175；未重启共享服务、修改数据库或发布公网。
- 2026-09-08 运行时核验：当前共享 API 5175 由主工作目录的 `scripts/start-shared-server.mjs` 使用 `.env.shared-development.local` 启动，连接独立的 Reelay_Dev Supabase；不能按旧本地数据库记录推断实际后端。验证期间短暂出现数据库健康探测失败，之后数据库只读探测及 5175 / 5176 健康检查均恢复，访客页重新加载成功；未重启、迁移或 seed。具体故障原因未确定，后续恢复服务前仍须核对实际进程和数据目标。
- 2026-09-08 资产库与主体预览跟进：主体编辑器已接入独立 `canvas-media-preview.js`，先小图后解码完成的原图，保留同素材预览 / 视频 DOM，切素材隔离旧完成；主体悬停详情保持仅小图。`ImagePreviewService` 新增 16 MiB / 256 条 / 5 分钟闲置过期的已验证派生内容缓存，route 每次实时鉴权不变。本轮作为本地阶段提交保存，仍使用本任务 `5178 → 5180` 预览，尚未推送或部署；当前代码 863 项完整检查与两种构建通过，实际性能与网络边界见 [迭代评估](canvas-iteration-review.md)。

- 2026-09-08 当前对话 / 画布任务使用 `C:\Users\Ho\.codex\worktrees\cc38\0707` 的 `codex/canvas-agent-refinement`。预览 `5178` 已连接本任务候选 API `5180`，服务端读取本 worktree 代码并复用既有共享开发云端数据；原 `5175` 服务保留原归属。已接入竖图修复 `f966305`；本轮合并并发 GET、协商渐进画布初始化、按显示尺寸选择静态图片变体，并支持授权后原图 ETag / 304。常驻服务空闲连接默认保留 60 秒，serverless 仍为 10 秒，显式设置优先。代码、验证和首次派生图片的网络边界见 [迭代评估](canvas-iteration-review.md#2026-09-08-接续工作区的加载实测)。本轮与资产库跟进一并保存为本地阶段提交，尚未合并或部署。

- 2026-09-08 对话区 / 画布 / 节点新切片已从远端已验证的 PR #21 基线建立；现状、实际 CI 耗时、主目录尚未集成的共享开发提交及下一步建议见 [迭代评估](canvas-iteration-review.md)。当前只完成评估和连续迭代规则，尚未实施新的界面改动、模块重构或发布自动化；后续按工作流 1.3 先收口局部体验，再做阶段提交与发布。

- 当前免注册体验切片：用户确认内部继续共用主账号，外部使用独立静态体验站，所有修改刷新重置。`npm run build:experience` → `dist/experience`，必须单独部署，不能覆盖内部主域。通过构建常量注入 `createExperienceServices`，保留相同 React / CanvasHost UI；三主体 12 图为公开 fixture，非主账号实时读取。临时文件≤4 MiB/个、累计≤128 MiB，经 ArrayBuffer bridge 进入宿主 Blob 内存。测试项目、画布、主体及素材改名在 SPA 导航中保留，刷新或退出重置；业务内容不进入浏览器持久存储。实际发布 URL 与部署 ID 见该切片 PR。
- 当前加载修复切片基于 PR #18 的 `bb4650c`：登录媒体增加首图预加载、内联占位与解码后切换；持久图片卡片改用受鉴权的 512px WebP，原图消费不变。新增 `ImagePreviewService` 与原内容路由固定 preview 查询，无 schema / seed / 账号变更。新增 sharp 0.35.4，Fastify 同主版本更新至 5.12.1；现有 12 图实测缩略图总量约 292 KiB，原图约 23.3 MiB。测试和发布证据见该切片 PR。
- 日常开发使用主工作目录中的活动开发分支，`main` 保留已验证集成基线；分支名、worktree 和未提交改动必须在接手时用 `git branch --show-current`、`git status --short` 与 `npm run worktrees` 重新确认，本交接不把静态分支名当成事实。此前改崩的用量看板实验 worktree 与本地分支已经清理，不再作为可恢复或可合并来源。
- 当前本地主链路是访客主页 `/app` → 登录弹窗 `/app/login` → `/app/w/:workspaceId` → `/app/w/:workspaceId/projects` → 受保护的 legacy canvas host。登录、主页和项目库只保留 React 正式路由；旧静态双轨已经删除，`index.html` 仅作为迁移期画布 iframe。
- 访客主页与登录弹窗共用持续挂载的路由父级；关闭保留滚动与焦点；主页真实输入及登录草稿行为见上面的当前切片；登录后回主页由用户确认创建。登录仍使用真实本机 Session API 的固定演示账号密码，打开时用 3.8 秒 Toast 提示；注册入口可见但禁用，无常驻未开放文案。左侧“想象世界 / 灵感展开 / 角色叙事”三张新生成的展示图与提示词在 `assets/login/`，每 4.5 秒轮播，底边为三段等宽细条，无播放图标；悬停 / 焦点进入 / 后台 / 减少动效 / 窄屏暂停。品牌墨迹与表单左对齐，底部按“继续即表示您同意 使用条款 和 隐私政策”展示禁用协议入口；具体行为见实现规范 2.1。
- 公网原型已部署到 `https://reelay-canvas-prototype.vercel.app`。Vercel Hobby
  提供同源静态页面和 Fastify API，Supabase Free PostgreSQL 保存服务端状态；
  具体部署边界、初始化和验收项见 `docs/vercel-supabase-preview.md`。
- React 页面通过 `src/infrastructure/http` adapters 消费共享 API；Zod 在传输边界校验 DTO，页面不直接依赖 server-memory store。
- HTTP adapter 已把 401 / 403 / 404 / 409 和网络失败映射为 application error，route data 与 `CanvasHost` 不再依赖 HTTP 错误类型；登录、主页、项目库、画布与组织中心按 route 延迟加载，loader / action 契约不变。
- 服务端 route 已改为只依赖 Session / Account / Workspace / Project / CanvasDocument 的最小 capability 组合；资产路由另外依赖 WorkspaceMediaAssetStore、ProjectAssetReferenceStore 与 ObjectStore，没有扩写 `CollaborationStore`。项目、画布与资产读写会在内存和 PostgreSQL adapter 内再次按 actor scope 原子授权，不能依赖 route 前置检查作为唯一安全边界。
- 个人与组织用量共用 `src/features/usage` 的分析函数和确定性 fixture，不再从账号 feature 反向依赖组织页面。`data/model-catalog.js` 同时提供 legacy `REELAY_MODEL_CATALOG` 与共享 `REELAY_MODEL_DIRECTORY`，React 只通过类型化 adapter 读取，模型元数据和 demo 成本不再散落在用量页面。
- migration checksum 会先把 CRLF / CR 归一为 LF，SQL 也由 `.gitattributes` 固定为 LF；迁移器可安全升级旧 CRLF ledger，但仍会拒绝语义变更。当前仓库 schema 通过 0010 加入 WorkspaceMediaAsset、MediaAssetPlacement、upload intent 与 ProjectAssetReference，0011 修正长期资产审计记录与可撤销 membership 之间的生命周期约束，0012 加入个人根目录 Entity、有序 Media 引用和 placement，0013 以 entity_personal_media_bindings 约束个人主体引用的素材必须具有同一用户的 personal placement。2026-09-07 公网已在校验既有 ledger 后从 0009 一次补迁移至 0013；正式主域随后已通过资产 / 主体 HTTP 读取及三主体浏览器展示验收。
- 十个固定演示账号使用 HttpOnly 服务端会话并属于唯一的 `星海视觉工作室`，角色为一名主账户、两名管理员和七名成员。个人 / 协作是 Project 的 `accessKind`，不是两类 Workspace；项目读取和修改由服务端 ProjectMembership 的 `admin/edit/view` 过滤。Session、Workspace、Membership、Project 与 ProjectMembership 已切换到 PostgreSQL，migration / seed 可重复；固定 demo seed 会精确校准固定账号与固定项目之间的预置关系，但不会触碰用户创建项目或非 demo 成员。集成测试覆盖该边界和跨服务重启持久化。浏览器 token 只以摘要存库并具有过期 / 撤销状态，但固定账号与 demo 密码散列仍不是生产鉴权。
- 个人项目由当前创建者从卡片菜单二次确认后删除；协作项目仅项目级 `admin` 可删除，组织角色不越权。删除立即撤销相关列表、详情和画布访问，已打开画布保存收到 404 后会停止 iframe。项目、成员关系和 CanvasDocument 仍保留；回收站列表、恢复与永久删除尚未实现。
- 账号设置是 React 弹出面板，只包含个人主页与“我的积分”；组织用量仍由组织中心承接。可选联系邮箱与手机号通过 PostgreSQL 持久化，但它们不是登录标识、未做验证，也不会自动订阅报表。“我的积分”以确定性前端演示数据展示当前账号余额、本月获得 / 消耗、统一的获得 / 消耗流水及个人用量分析；流水按时间、类型、项目、任务类型、模型、生成规格和积分变化呈现，类型与日期合并为一个即时生效的极简筛选面板，日期只通过整块按钮唤起系统日期选择器，不提供年月日键盘录入。该页面仍不是真实 `CreditLedger`，不能把演示余额或流水当成持久账本。
- 头像菜单中的组织入口已改为独立 Workspace 路由。`/app/w/:workspaceId/organization` 把精简组织信息与真实只读成员列表放在同一页；`/organization/credits` 展示组织余额、成员额度以及入账 / 分配 / 消耗明细；`/organization/usage` 仅对主账户与管理员展示确定性前端演示看板。用量页已重构为“概览—用量分析—消耗来源”：概览并列展示可用积分、预计可用、今日消耗与近 30 天日均；用量分析默认近 7 天，可切换近 30 天和确认后才生效的自定义日期范围；近 7 天使用每日横向条形图，近 30 天使用默认可见最近约 15 天的每日堆叠柱形图与总消耗折线；消耗类型统一展示视频生成、图片生成和媒体处理。消耗来源可按项目、模型、成员切换并保留搜索和聚合详情抽屉，完整来源项在表格区域滚动，不静默截断。Agent 与增强处理当前只在展示层归入媒体处理。任务级流水继续由积分管理承接，组织用量演示数据后续必须由 `GenerationTask`、计费快照和不可变 `CreditLedger` 替换。
- 当前组织中心作为 `w/:workspaceId` 的子路由复用工作台已经加载的 `WorkspaceContext`，首次进入只额外读取组织成员。主账户与管理员可访问组织信息、积分管理和用量看板，普通成员只显示只读“组织信息”；直接访问积分管理或用量看板会返回组织信息。三个分区切换不重复请求工作区和项目数据，内容区保留隐藏的语义标题。用量看板布局按笔记本与宽屏自适应；30 天图按视口计算柱宽以稳定展示约 15 根柱，来源表独立滚动。
- 后续公网更新从验收后的集成主线发布，发布前单独核对部署范围和环境。2026-09-07 PR #18 已将登录设计与导航加载修复合入 `main` 的 `bb4650c`，对应部署 `dpl_344sxvDUbmJFDhQkGnWexnbBDh7K`，构建源 `f2a1d0250ee34fee494d04051bcafd4d838015b3`，promote 与主域验收已完成。本文后续的首次资产发布 ID 是历史记录；更新部署以各发布 PR 的实际部署证据为准。项目仍未连接 Git 自动部署，不由 `main` 自动推断线上版本。
- `LegacyCanvasHost` 已受路由权限保护；旧 `index.html` 消费版本化账号 / 组织 / 项目上下文和 CanvasDocument 消息，按 `projectId + canvasId` 加载 / 自动保存。PostgreSQL 使用 revision 乐观并发，`admin/edit` 可写、`view` 只读，非成员不可见；只读画布保留选择、浏览、缩放和下载，但会禁用拖动、删除、生成、重命名与参数修改。CanvasDocument v1 已收敛到 canonical allow-list，不支持的版本失败关闭，持久媒体 URL 会经过安全校验后才进入快照与 DOM sink。
- legacy 画布壳层已重排为四个独立区域：左上返回主页 / 项目名 / 项目选择，左侧中部常显内部画布 / 资产 / 分享 / 个人，左下小地图 / 适应视图 / 禁用的整理占位 / 缩放滑条，右上只保留 Agent。左上项目栏、左中竖条和左下工具栏分别收敛为约 `248 × 38px`、`48px` 宽和 `248 × 38px`；中部入口使用约 `40px` 命中区，两端等高后资产面板获得对称的上下边界。共享的 `8px` 外边距和 `4px` 沟槽只继续定义资产面板与主体编辑器的上下边界。展开后的 Agent 默认约 `560px` 宽，并恢复为顶、右、底贴合视口的完整高度抽屉；桌面端顶部和底部可独立拖动或键盘调整，最小高度为 `420px`，脱离视口的一侧才恢复边界和左侧圆角，高度偏好不写入 CanvasDocument。空会话由输入框占位文案引导，不重复显示大号品牌欢迎区。积分已从右上常驻徽标迁入个人菜单，并通过严格 `canvas:open-account` 的 `profile | credits` bridge 打开 React 对应分栏；旧无 `section` 消息兼容为 `profile`。个人入口只在 hover 时显示文字提示，点击才展开菜单；菜单与左侧胶囊外框底边对齐，前两项为“我的积分 / 组织中心”，退出账号使用中性色。帮助子菜单位于主菜单右侧并与其底边对齐；帮助触发行到子菜单之间使用真实命中桥和 `180ms` 菜单关闭延迟，横向移动不再意外收起。帮助项按“使用教程 / 反馈问题 / 快捷键”排列；第三项展开的约 `620px` 双栏快捷键卡片位于帮助子菜单下方，并以一级菜单为定位容器对齐其左边缘，不使用与菜单宽度耦合的反向偏移。项目名编辑态只使用 hover 同款浅色底框，不额外显示描边、下划线或阴影。项目选择器由 React host 传入当前账号授权项目投影，支持搜索、缩略图、当前项勾选和固定的新建项目入口；打开其他项目与新建项目意图都会先等待当前画布保存，再由宿主路由或现有 workspace action 执行，iframe 不持有 repository 或伪造项目。资产面板改为独立的“资产库 / 空间切换”头部，收起入口固定在面板右缘，与左侧资产库入口保持同一水平线，上下间距由共享尺寸变量稳定保持约 `4px`。画布壳层覆盖集中在 `styles/canvas-chrome.css`，资产库独立样式位于 `styles/canvas-asset-library.css`；两者都不要与 `styles/app.css` 中的组框 / 临时选择面规则重新耦合。
- 个人菜单最新视觉契约：竖条 → 一级菜单 → 帮助子菜单 → 快捷键卡片的三个实测沟槽为 `7px / 7px / 7px`；组织中心默认透明，仅在交互时显底；主题项位于账号设置前；快捷键箭头按“收起向下 / 展开向上”反馈状态。
- 画布内资产库已按 `个人 / 组织 / 平台` 三空间和 `素材 / 主体` 两分栏重做，网格 / 列表、搜索、媒体筛选、预览和拖入画布均已接通。顶部控件高度按“分栏 > 搜索 > 目录命令行”收敛；搜索与文件夹行内编辑不显示额外黑框；“上传 / 操作”主按钮右缘与“素材”选中块右缘对齐，多选态使用 `list-checks` 批处理图标且不再叠加下拉箭头，未选条目时保持深色主按钮身份并降低整体强度来表达禁用，而不是切换成浅灰次级按钮。网格卡片固定约 `164px`，面板在 `380–780px` 间调整时按外宽约 `550px / 728px` 阈值从 `2 → 3 → 4` 列重排，不拉伸条目；右侧调宽热区与 Agent 左缘统一使用原生 col-resize 光标及悬停/拖动边线反馈；默认不额外显示边线，悬停显现细线，拖动时加强对比。指针、键盘、ARIA 和 Agent 联动共用实际宽度边界，Agent 关闭后恢复资产库首选宽度；`≤480px` 全屏降级隐藏无效调整器。卡片待选态使用空复选框，选中后显示带勾复选框；右上三点菜单进入浏览器顶层，只有视口空间不足时翻转，可跨出资产库边界并随触发按钮滚动定位。个人空间 Media 上传通过 host bridge 执行 checksum 约束的 upload intent，写入 ObjectStore，登记 WorkspaceMediaAsset + personal root placement，并幂等创建当前项目的 ProjectAssetReference。个人主体已改为单封面卡片和独立编辑工作区：新建标题为“新建主体”，编辑标题跟随名称，可填写名称 / 描述，从个人素材库或上传添加 Media，四类标签只筛选主体内素材。只有图片可设封面；预览区以纯文字“设为封面 / 当前封面”区分动作与状态，素材卡常显封面标记。左栏只让分类工具行以下的素材卡片区滚动，名称、描述与分类工具保持固定；资产库仍只让目录命令行以下的网格滚动。Entity create / list / get / update、幂等键、引用可见性与乐观版本已通过独立 repository、0012 migration 和严格 bridge 落地；持久 Entity 的移动、组织复制与删除仍未实现，这些操作会明确拒绝而不制造页面内成功。主体使用预览已有逐 Media 展开为独立画布节点的适配，正式 Node 级引用和完整持久化验收仍待补齐。私有 Supabase ObjectStore 配置与三主体 12 图迁移已完成，正式主域已通过 Asset / Entity HTTP 读取、鉴权、大小限制和三主体浏览器展示验收；filesystem adapter 保留供独立本机环境；当前日常 API 已改用 Reelay_Dev 私有 Storage。
- 账号分栏 bridge 使用显式能力协商：新宿主在 `host:init` 提供 `accountSections`，新 iframe 只有看到该能力才为积分入口附加 `section`；缺少 capability 的旧宿主继续收到原始 v1 消息并降级打开默认个人页。旧 iframe 发来的无 `section` 消息则由新宿主默认解释为 `profile`，不能在 v1 strict schema 上无协商扩字段。
- 画布壳层 disclosure 已补齐键盘闭环：项目 / 画布 / 更多操作 / 个人入口同步 expanded 状态，键盘打开后进入首个可用项，Escape 分层关闭并回焦，画布改名结束回到对应行。资产面板和 Agent 同开时至少保留 `280px` 画布走廊，`1000px` 以下改为互斥；后续调整面板最小宽度时要一起更新联合约束和行为测试。
- 开发服务器必须让 `/app/*` 回退到 `app-shell.html`，同时保留 `/index.html` 给旧画布 iframe；不要重新引入会吞掉 Vite 内部脚本或旧画布入口的宽泛回退。
- 本地 Vite `serve` 支持在画布路由追加 `?layoutTune=1` 打开开发专用布局调节器；它只调节白名单几何并把临时值放在当前标签页的 `sessionStorage`，不写 CanvasDocument。项目条、资产库、工具条和 Agent 可通过选框标签独立移动并用四边手柄调整尺寸，移动值始终是相对正式基准的 X / Y 偏移。该工具通过 development-only HTML 插件注入，生产构建不得携带其 JS / CSS；评审后的参数仍需显式固化回正式布局变量与状态约束。
- 当前生成节点在创建时即确定不可变的图片 / 视频类型；CanvasDocument 与任务快照用 `mediaKind` 表达，legacy runtime 暂用内部 `mode` 适配，模型与结果必须保持同类型。CanvasDocument v1 读取器仍兼容旧 `mode / lockedMode / generatedAsset.type`，恢复后归一为单一运行时类型，新文档不写节点 `mode / lockedMode`。入口使用统一模型选择图标，选择器内部仍保留具体模型图标。

## 下一开发切片

2026-09-07 当前集成：以共同基线 `c6dd68a` 合并节点视觉与交互提交 `acf9a61`、Agent 与媒体控件提交 `3c76f22`。本次在 `f859` worktree 集成并解决共享文件冲突；本地验收通过，主工作目录 `D:\Software\codePro\0707` 的 `codex/canvas-development` 将在集成提交完成并确认干净后快进到同一提交。测试列表、缓存版本和下列产品规则按最终实现合并，不整文件覆盖。共享 API、数据库、ObjectStore 和公网部署保持现状；本地快进不代表远端或公网已更新。

节点工作区保留固定屏幕尺寸：`canvas-node-editor-layout.js` 为视频使用 `800px`、图片使用 `850px`，仅受扣除侧栏后的可用走廊减 `24px` 限制。内容高度为 `248–320px`，两类节点高级设置统一增加 `118px`，长提示词展开高级设置后的总高为 `438px`；圆角 `20px`、正文 `17px`、底栏 `16px`，参考入口 `48px`、`14px` 圆角、`16px` 内边距。画布倍率不改变输入区宽度，只有实际走廊变窄才降低底栏密度。深色媒体和编辑器同为 `#1f1f1f`，媒体两主题使用 `22px` 世界圆角和 `1.5px` 世界边线，选中边线为深色 `#707070` / 浅色 `#999b9f`。媒体与编辑器间距为 `12px × max(scale, 1)`；媒体世界尺寸、`705px` 坐标兼容锚点与 `20%–200%` 缩放范围保持。生成入口保留 Reelay 胶囊与圆形发送块，不把本轮称为 Tapnow 最大、最小媒体几何的完整复刻。

节点阅读状态由同一 live node 的持续展开生命周期维护：`canvas-node-prompt-view.js` 保留编辑器外壳、textarea 和未变化的媒体 DOM，正文仅在内容变化时赋值；高度使用非交互副本测量，不临时压缩原输入框。开关高级设置或切换参数不重置长提示词阅读位置、选区和文本撤销。节点根与正文监听只绑定一次，新控件独立绑定；脱离文档的布局回调停止，同 ID 的新节点对象不继承原编辑器。未聚焦正文、聚焦短文本和编辑器空白将滚轮交给画布；聚焦且溢出的正文内部滚动，到边缘也不链出。正文与空白上的 `Ctrl/Cmd + 滚轮` 缩放画布，实际画布导航退出提示词焦点。Escape 排除输入法组合后仅退出编辑，保持节点展开与内容；菜单、素材架、滑杆和其他具体控件保持本地策略。

编辑器与媒体工具栏同帧反向补偿；仅新展开编辑器有 `120ms` 透明度淡入，减少动态效果时关闭。侧栏尺寸变化同步编辑器与测高，菜单按可用边界限宽、限高。节点实际可见边界用于小地图和已有局部排列；适应视图仍以媒体内容为边界，不保证整个展开编辑器进入视口。媒体名称、图标与规格采用对方专门修订的等比缩放规则，名称在等宽信息栏内省略、规格最多占半行，不再按远景阈值隐藏。媒体工具栏保持约 `52px` 屏幕高、`40px` 按钮、`22px` 图标，使用 Lucide 图形和分组分隔；始终锚定媒体上方，超出视口自然裁切，不吸附顶部。默认仅显示图标，自定义与已保存名称显示偏好保留。

节点与 Agent 高级设置统一为“自动校验素材”，默认关闭，说明为“自动提交尚未审核的图片与视频素材”；“自动”指提交，不含识别、分类或自动通过。节点仅保留 `assetValidationEnabled` 内容字段，图片与视频均保存并可撤销，旧 AutoLink 字段读取时忽略；Agent 只保留页面内偏好。当前未接入审核服务，定时任务仍禁用；模型依据与接入边界见 `model-catalog-notes.md`。

Agent 输入区仅保留生成 / Agent 两模式：`canvas-agent-models.js` 独占生成单选与 Agent 多选偏好，生成跨图片 / 视频选模型后切换参数并收起面板；Agent 保留自动开关与至少一项偏好。模型面板约 `340px` 宽，两组连续滚动、分类栏固定。模式与偏好分别使用 Lucide `sparkles / workflow / layers-2`，许可证位于 `assets/icons/LUCIDE-LICENSE.txt`；共享模型目录保留 2 图片 / 4 视频模型，NanoBanana Pro 已移除，旧模型按同媒体类型回退。简介由第一方资料核实，引用见 `model-catalog-notes.md`。`canvas-agent-parameters.js` 持有按模型隔离的页面配置，复用节点模板与参数归一规则，不写节点、撤销或 CanvasDocument；发送仍是本地示例，未接真实生成服务。

Agent 标题兼作历史菜单入口，右侧保留新建 / 收起。`canvas-agent-history.js` 独占会话集合、当前项与改名状态；悬停或键盘聚焦显示编辑 / 删除，当前勾选临时让位，默认不铺选中底色。行内改名失焦 / Enter 保存、Escape 取消；删除使用带具体名称的原生模态确认，默认取消、Esc 关闭并归还焦点，删除当前项切相邻，删完保留空白。新建不依赖固定 ID；历史菜单无搜索，顶部新建固定、仅记录区滚动，长名不挤占操作。所有历史操作仅在当前页面生效。

集成前节点切片已通过 `604` 项测试、构建、深浅主题与长提示词真实浏览器检查；该结果仅对应 `acf9a61`，不能代替合并后的验收。本次合并已通过 `npm run check` 的 632 项测试、`npm run build`、`git diff --check`；真实浏览器在深浅主题下复验 3000 字提示词滚到底后四次开关高级设置，正文滚动位置与输入框身份保持，新增高度为 `118px`。Agent 跨类型模型选择、参数修改与历史改名可用，控制台无错误。2026-09-07 该轮集成时远端核验 main 仍要求 quality / postgres 检查，Vercel Git link 为 null，当时生产部署为 dpl_3e9rT3hKtg6p6XuKHKnxZdfF9hMv；随后正式发布结果见下文。本 worktree 的 `5174` 保留隔离内存试用入口；主目录前端 `5173` 在快进后使用同一集成代码，共享数据服务不迁移。

2026-09-05 当前切片：节点 / 分组基础治理已接入离散参数、生成媒体命名、建组 / 解组 / 成员结算和已有局部布局；下方记录实际边界。按 `development-workflow.md` 第 1.2 / 4.1 节复用活动分支与完整路由预览，不把全量拆分 `app.js` 或迁移 React Flow 当作继续主体库设计的前置条件。下一产品入口优先复核主体库与节点配合，具体范围仍结合用户当次反馈决定。

开发前收尾已移除 3 个无调用函数、旧连接快照撤销分支和废弃样式，同步修正测试锚点、实现状态文案与本地启动说明。`npm run check` 的 588 项测试通过；原项目画布、浅深主题与个人菜单局部复核正常，控制台无 error / warn。此次未修改产品交互、迁移数据或部署公网；不把这次已确认的死代码清理描述为全仓库不存在历史代码。

后续目标与阶段入口统一见 [产品扩展规划第 8.1 节](product-expansion-plan.md#81-当前滚动路线2026-09-05)：主体与节点、Agent 模拟生成、项目生成历史、整理、消息与必要配置，以及分享权限 / 申请加入和最终真实双浏览器同时编辑均已确认；顺序是可重审的建议，详细规则仍按阶段决定。新切片开始时主动提醒该阶段目标与待定边界，完成时更新实际范围和下一入口，不依赖用户记住本次讨论。通知不是审批真相；历史独立于画布展示；后台区分共享服务、组织管理、最小运营页与开发演练控制，当前不要求完整独立后台网站。

2026-09-05 工作区释放：已在复核干净状态、忽略文件与目录解析后移除 6 个纯代码 / 缓存 worktree，包括首页登录草稿、交互修复、连线、首页菜单、消息中心与节点参数历史目录；所有 `codex/archive/*` 分支及提交号保持不变。当前只保留主工作目录、承载 API 与 ObjectStore 的 `0707-wt-canvas-integration`、保存另一批素材的 `0707-wt-canvas-shell-redesign`。恢复历史代码从归档分支重新建立工作区，不依赖已删除目录。

主体使用交互现由 `canvas-entity-use-controller.js` 持有选择器 / 详情 UI 状态、timer / animation frame、焦点、背景隔离和监听器生命周期；入口只注入最小读取与提交能力，旧状态和事件路径已移除。选择器绑定打开时的 project / canvas / node，确认前重新验证可写与节点可用性；陈旧回调不能跨作用域恢复弹层或焦点。逐 Media 展开与内容写入仍复用既有 model 和 app 适配器；向生成节点追加主体素材的撤销改为仅移除本次新增引用 ID，保留已有素材元数据、节点身份及无关字段，不再恢复整节点快照。它仍是 legacy 增量 action，正式稳定引用命令尚未完成。

节点生成与提示词优化现由无 DOM 的 `canvas-node-task-runner.js` 独占运行记录、timer、取消与完成归属，已移除根 `state` 中的两套任务 Map。runner 保留启动输入快照和实际节点身份，完成前验证 project / canvas / node / task，拒绝重复启动与陈旧回调；`app.js` 继续负责输入验证、原有模拟扣费、字段提交、撤销和保存。普通切画布允许原画布后台完成，删除（含撤销创建）、hydrate、宿主上下文替换和访问失效会取消任务。Alt 复制正在优化的节点已修复为可编辑的空闲副本。生成耗时仍为 900–1600ms、提示词优化为 900ms，刷新积分仍为 `3000 / 0`，没有新增退款或持久任务规则。此次没有改动样式、节点模板、拖动、选择和连线手势。

主体使用规则已确认：主体只组织与圈定素材，使用时展开为独立 Media 输入 / 连接，放入画布时拆成独立素材节点；后续编辑或删除主体不联动既有使用。底层 Media 的删除、权限、版本，以及模型容量与类型不兼容是另外的设计边界，不从该规则推导。详见 `product-expansion-plan.md` 第 4.2 节。

本机服务与数据位置统一记录在 [本地开发与数据位置](local-development.md)：前端与共享 API 都从主目录读取当前活动代码，API 通过忽略配置连接 Reelay_Dev PostgreSQL 与私有桶。日常使用 `npm run dev:server:shared`，不重跑 seed；旧 Docker 和两处 ObjectStore 仅保留作迁移源，不再日常写入或反向覆盖云库。

产品方向澄清：项目是正式 Reelay 前端的产品行为预演版，已确认规则需可执行，后端可模拟；后续范围与滚动路线已补入 `product-expansion-plan.md` 第 1 / 8.1 节。用户已启动独立的首页 / 登录设计切片，旧“首页与登录后置”不再限制本切片。面向 B 端，邀请码已确定为注册资格，不默认表达组织成员关系；此阶段注册入口只展示禁用态。手机号 / 邮箱、验证码与账号关联的详细流程仍待定，参考图和归档草稿不替代最终规则。

当前修复切片保留部分删除后的组及剩余成员，删除撤销恢复原组顺序和成员；视频提示词优化采用独立字段撤销，不再恢复任务启动时的整节点快照。组织积分发放 / 回收尚未实现状态变化，确认操作只反馈本次未执行，不再声称提交成功；后续模拟规则另行设计。

2026-09-05 审查的 27 文件草稿已原样提交至 `codex/archive/home-login-draft-20260905`（`e5eec9e`），逐文件 SHA256 核对未改变内容；该工作区目录现已释放，草稿仍可从归档分支恢复。草稿没有手机号 / 邮箱注册、验证码或邀请码实现；首页 / 登录视觉可延期。创建项目的忙碌互锁、带项目归属的提示词交接、重命名失败保留输入是可单独复核的行为候选；部分画布视觉已在后续分支实现，不能整文件覆盖最新资产和壳层代码。这些候选尚未合入当前修复切片。

迁移桥的三个收尾项已经完成：后台画布生成会显式触发保存，dirty / 导航会先刷新保存；尚无文档的画布先建立内存同步基线，只有主页意图或真实用户修改才首写 revision 1，不会因纯浏览生成空记录；`view` 的修改交互和加载失败画布已封锁并提供重试；CanvasDocument 使用真实字段 allow-list 和序列化 / 恢复行为测试；旧静态登录 / 主页双轨已经删除，画布导航统一回到 React 路由。

iframe 侧文档保存已经从 `app.js` 提取为无 DOM 的持久化协调器，独占 baseline、dirty、debounce、单一 in-flight、revision、续写、重试与错误降级；行为测试覆盖空文档不首写、保存中继续修改、陈旧响应和非法消息。宿主用 iframe instance id 和 route scope 拒绝重复 ready 与旧 scope 保存回调；同 route 新 iframe 会等待旧同 scope 保存结算后再 hydrate 最新 revision，旧 epoch 的 dirty / saving / navigation 不会污染新实例，旧保存失败则先重新读取服务端权威文档。

多画布内容已经由 `canvas-runtime-store.js` 统一持有：每个 CanvasRecord 是节点、组、连接、视口、层级和撤销栈的唯一权威，根 `state` 只保留供现有 renderer / 手势 adapter 使用的活动画布访问门面。`render()`、缩放和画布切换不再执行 CanvasRecord 与根状态之间的镜像复制；后台任务按 canvas id 直接定位目标记录，删除非活动画布也会显式触发保存。

无 DOM 的 `canvas-command-executor.js` 已建立 touched collection draft、before conflict、normalizer scope、transition validator、逆命令、每画布隔离和 50 条混合 undo 上限。连接单条创建、批量创建和删除已统一通过原子命令提交，批量连接只写一条 undo；连接归一化已从 renderer 移到提交 / hydrate 边界。提交后保存 effect 抛错会作为 `effectError` 报告，不会把已经提交的内容伪报为失败。`canvas-content-commands.js` 新增字段白名单、组事务规划和双向成员验证；节点字段提交与撤销保留 live 对象身份，组只有创建 / 删除使用 canonical record。参数和生成媒体命名已接入字段命令；素材节点命名只撤回目标素材的 displayName。组成员归一化只在 hydrate 执行，render / bounds 不再隐式修复内容。

建组、解组与已有组 / 多选布局各记录一次撤销，布局只回退坐标，不被随后点击置顶的 z 变化阻塞。拖动 / 组框缩放仍用原 session 预览和 legacy move / group-update 撤销，在完成时通过组事务结算成员；取消恢复起始状态。Alt 拖动复制完成登记一条 create 撤销，取消移除副本并恢复原选择；撤销创建不会删除原有空组。受控删除恢复使用 executor 的 adoptRestoredRecord 衔接原字段历史，任意同 ID 替换仍拒绝旧撤销。新一轮生成清除旧结果名时显式退休 name 字段历史，保留同条模型等参数；生成成功继续清理该节点先前的参数 / 名称 / 优化 / 主体追加历史，保留布局与组 / 移动历史。

本批本地验收：`npm run check` 的 588 项测试、`npm run build` 和 `git diff --check` 通过；其中真实 app 撤销集成覆盖 50 项。隔离浏览器检查了深浅主题、比例 / 任务模式与撤销、建组 / 解组 / 局部布局、生成期间移动另一节点、媒体改名，以及一次 24 积分扣减和刷新恢复 3000；控制台无 error / warn。完整路由预览仍使用 5173，API / ObjectStore 保持原位置。2026-09-05 11:29 再次核验 Vercel 未连接 Git，生产部署与公网别名未变，本批不部署。

后续工程按以下边界随产品切片推进；待定规则按扩展规划第 8.1 节主动复核，不启动未经评估的整体画布迁移：

1. 字段级 Node patch 与 Group membership invariant 已建立；后续按功能需要迁移节点结构、素材引用与其余内容修改。不能使用整节点快照，不能修改运行时创建类型或恢复生成 / 提示词任务态。高频 pointer preview 继续保留在 session/adapter 层，完整 pointerup 坐标字段命令仍待后续迁移。
2. 任务 runner 已完成；后续节点字段命令成熟后，再把当前 app 中显式的完成写入适配到字段命令，继续保留任务作用域验证、提示词字段撤销和生成成功时的撤销边界。Agent 对话任务尚不在该 runner 的范围内。
3. 资产下一步以已落地的 WorkspaceMediaAsset + personal placement + ProjectAssetReference + ObjectStore + personal Entity 为基线，把 Folder / organization placement、Entity 删除恢复，以及主体选定 Media 的独立引用 / 节点创建纳入明确应用边界，再接组织发布与审核。不把这些逻辑塞进 `CollaborationStore`、`app.js` 或 CanvasDocument；GenerationResult 只有显式保存后才幂等晋升为 WorkspaceMediaAsset。

节点创建撤销尚未统一：当前 `create` action 用于主体展开和 Alt 拖动复制，普通双击新建仍未登记创建撤销；不能描述为已实现所有节点创建的撤销。整画布自动整理仍是禁用占位，已支持的是组 / 选中节点的既有排列入口。

积分前端模拟需另开切片。开始前至少确认组织月度额度与结转规则、一次生成的预占 / 扣减 / 失败退款、成员与项目统计维度、管理员可见范围，以及演示月份和异常场景；没有这些口径前，不把当前 `3000 / 0` mock 扩成伪账本。

CanvasDocument 当前仍是迁移桥：一个路由 `main` 文档内保存旧画布的多画布 bundle，v1 canonical allow-list 只包含节点、组、视口、节点 `mediaKind` 和模型参数，持久媒体 URL 必须通过安全校验。后续 GenerationTask、GenerationResult、Node 级资产引用与 CreditLedger 应建立独立实体，不继续向该 bundle 塞运行态；WorkspaceMediaAsset 二进制和 ProjectAssetReference 也不属于 CanvasDocument。

本轮节点 / 分组治理不实现分享、申请、实时协作或真实密码生命周期。分享申请与真实双浏览器同时编辑已进入后续确认目标，不能沿用旧“暂不加入”表述将其永久排除；具体规则与阶段验收见扩展规划第 4.6 / 8.1 节。当前公网地址只用于原型评审，不应扩写为生产可用承诺。

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

2026-09-07 共享开发库切换：停止旧 5175 API（当时 PID 36992）后，最终快照写入 `.reelay-data/shared-development/source-backup-2026-09-07T11-55-08-749Z/`。Reelay_Dev 按仓库 0001–0013 建立 schema；`cloud-import-result.json` 记录全部业务表经 PostgreSQL 类型化精确比对后事务导入，保留 15 项目、6 画布、3 主体、42 Media、账号密码散列及所有关联，65 条旧 sessions 未导入。只有 `nodes.assets.url` 中 18 处本机 5173 / 5174 的持久 API 地址规范为同源相对路径，精确差异在同快照的 `canvas-url-normalization.json`；原 ID、revision、封面、素材顺序与其他内容保留，没有运行 seed。

42 个原文件共 85,123,200 字节已上传同项目私有 `reelay-assets` 桶并全量回读 SHA-256 验证；证据在较早快照 `source-backup-2026-09-07T11-43-38-793Z/cloud-object-verification.json`，切换前已再次核对最终快照的 object key / hash 一致。桶及本地 Supabase API 上限为 50 MiB，filesystem 为 64 MiB，Vercel 仍为 4 MiB。当前主目录通过 `node scripts/start-shared-server.mjs` 后台运行共享 API（启动时父 PID 57800），日志为 `.git/dev-shared-api.stdout.log` / `.git/dev-shared-api.stderr.log`；恢复前重新检查实际进程，常规启动命令为 `npm run dev:server:shared`。

本次本机 HTTP 已验证：创作者登录、两个原项目画布 200、3 主体 / 20 个人素材列表、三主体封面原图 Range 206、缩略图 200、未登录 401，以及 5173 / 5175 health。旧 Docker 54329 和两处素材根保留，不再日常写入。家里电脑安装、首次连接及两机保存接续仍待验收，本轮尚未实测新素材上传或再次画布保存。首次迁移步骤已执行，不能在家里接入时重新 seed 或导入旧快照覆盖共享数据。

2026-09-07 后续登录整合已纳入 `b7cc3b37e27c44f8f0934e8c0e3234fa809eb8f6` 的访客主页和登录弹窗；下文较早资产发布记录中的“排除登录”仅描述当时范围。整合保留当前云端 Storage、三主体目录与加载修复，不重跑迁移或 seed；根地址经 `/app` 进入访客主页或当前账号的工作空间。合并后的 `npm run check` 共 742 项、生产构建和 diff 检查通过；实际构建预览已复验浅深主题、关闭登录后输入保留与错误密码反馈。此次正式部署 ID、构建源 SHA 和公网性能复验记录随集成 PR 的发布结果更新，不能由本地通过推断公网已更新。

2026-09-07 公网加载修复：进入画布时取消整库原图的元数据探测，关闭的资产库不渲染媒体预览；实际使用 / 编辑的尺寸读取保留。生产构建将 45 个经典脚本与导入样式分别合为带内容哈希的单一 JS / CSS，仅公开静态产物使用 immutable 缓存。此次未修改数据库、私有媒体权限或导航前保存。发布前线上完整进入项目的一次连续测量为约 5.5 秒；纯返回主页约 129 毫秒，尚未稳定复现用户描述的长时间返回阻塞，不能由这次加载修复宣称所有导航卡顿已解决。

2026-09-07 资产库交互切片：空间入口改为紧凑悬停切换，主体悬停预览按卡片 / 列表行中线定位并避让视口；编辑工作区改进标题、页脚、退出动画与焦点返回，删除确认统一为克制的主题样式。主体选择器与资产列表复用弹层和卡片，搜索 / 勾选 / 画布空白点击不重建未变化的视频；卡片左上角悬停勾选可直接进入多选，已选素材拖入画布或生成器时整批提交并只记一次增量撤销。有效拖放目标恢复 copy 反馈，生成器装饰图标不参与命中。此切片独立验证通过 `npm run check` 的 677 项测试、构建和 `git diff --check`，深浅主题、网格 / 列表、多选拖放与视频加载保持已实测；该记录尚不代表已整合其他任务或已发布公网。

2026-09-07 发布整合：资产交互提交 `ed8a645` 已与 `42a64a1` 的 v4 主体案例、`157a09e` 的紧凑防裁切菜单合并；菜单同节点刷新只重新定位，保留焦点，BFCache 暂存不释放仍有效的菜单会话。整合验证通过 `npm run check` 的 680 项测试、27 项 PostgreSQL 集成测试、构建及 `git diff --check`；浏览器复验深浅主题、网格 / 列表与底部菜单、多选拖放 / 撤销、视频加载和主体编辑返回。登录设计分支未纳入。以上结果对应资产 UI 整合，不覆盖随后新增的公网 Storage 代码。2026-09-07 CLI 再次确认 Vercel Git link 为 null，PR 合并与公网部署需要分别完成。

2026-09-07 公网资产补齐：Supabase `yacgzkkttwtyxkfxiwyn` 已在验证旧 ledger 后一次从 `0009` 补迁移至 `0013`；已创建私有桶 `reelay-assets`（`public=false`、`4 MiB` 上限），并配置 Vercel Production 的 `SUPABASE_URL`、仅服务端的 `SUPABASE_SERVICE_ROLE_KEY` 和 `REELAY_SUPABASE_STORAGE_BUCKET`。12 张二进制从本机既有 ObjectStore 读出上传，逐张全量 SHA-256 与 range 读取通过。Security Advisors 仅返回既有且符合服务端独占访问设计的 INFO（启用 RLS、无客户端策略），没有 warning / error。

本次目录迁移没有运行 `db:seed:preview-assets`：Vercel 中现有敏感数据库凭据无法拉取，因此准确导出本机真实三主体、12 媒体、个人 placement、Entity 有序素材引用、个人绑定和 finalized upload intent，在临时 PostgreSQL 通过五项冲突 / 幂等验证后，经 MCP 单事务导入公网。原 ID、微秒时间戳、封面、顺序与版本（玄翎 `v2`、幽影 `v4`、白汐 `v4`）保留，账号、会话、项目、画布与项目引用等保护表哈希前后不变。存储与目录已就绪，候选部署已通过三主体精确目录及 12 图 HTTP 内容验证；候选地址的浏览器已登录 Hoo 并验证 12 素材、三主体封面和幽影的 5 图 / 描述 / 顺序，刷新后保持；正式主域切换后也已通过 HTTP 与三主体封面浏览器复验。本次没有制造测试新素材或改变既有画布。

`SupabaseObjectStore` 和 `api/index.ts` 的 Asset / Entity store 接线已具备代码；公网单素材限制为 `4 MiB`，超过时 intent 阶段返回中文 `413`，本地 filesystem 模式为 `64 MiB`，当前日常 Supabase 模式为 `50 MiB`。运行时只验证预建私有桶，不创建桶或回退到临时文件系统。后续标准夹具入口为 `npm run db:seed:preview-assets`，要求 `REELAY_DEPLOYMENT_MODE=preview`、`ALLOW_DEMO_ASSET_SEED=true`、同一 Supabase 项目的 `MIGRATION_DATABASE_URL`（direct / session，非 6543）及上述三个 Storage 变量。入口使用 `seedDemoAssetLibrary(..., { personalOnly: true })`，只写个人 Media / placement / Entity，不执行账号 / 会话 / 项目 seed、不改画布或 ProjectAssetReference、不清退旧项目引用、不自动 migration，也不覆盖指纹不匹配的用户编辑记录。它不是本次真实记录迁移的执行入口。登录设计继续排除；真实凭据不进源码和日志。

2026-09-07 发布验证：Vercel 部署 `dpl_6qMnyrE8Wihk4eryUySZvL6idE6X` 来自 `28580275b042890bcb4c634adde46fb718259643`，地址为 <https://reelay-canvas-prototype-dyfzxyrf9-heos-projects-560eccff.vercel.app>。Vercel rewrite 的 `apiPath` 内部 query 已在入口移除，避免业务严格查询校验误拒绝。`npm run check` 的 716 项及 CI `quality / postgres` 全通过。实际 HTTP 已验证 health、三主体 ID / version / cover / 顺序、12 媒体逐张内容 SHA-256、range `206`、匿名 `401`、超 `4 MiB` intent `413`；候选地址的浏览器已真实登录 Hoo、进入既有项目，验证 12 素材与封面正确的三主体；幽影打开后显示 5 张图、描述与正确顺序，主视觉原图清晰，刷新后 12 素材和三主体仍可读取。本次未创建测试新素材或改变既有画布，不能把新素材上传、项目挂载与视频播放写成公网实测完成。

[PR #15](https://github.com/Heo7n/reelay-canvas-prototype/pull/15) 已合并为 `df5839a`；修复 [PR #16](https://github.com/Heo7n/reelay-canvas-prototype/pull/16) 已合入 `main` 的 `5ee4efc237b1f50eb789ac0dc231177b25d944b6`。已成功 promote 构建源 `2858027` 对应的 `dpl_6qMnyrE8Wihk4eryUySZvL6idE6X`，CLI inspect 正式主域名确认同一部署且 Ready。正式主域 HTTP 于 `2026-09-07T08:35:57.883Z` 全部复验通过：health、三主体精确 ID / version / cover / 顺序、12 图逐张 SHA-256、range `206`、匿名 `401`、超 `4 MiB` intent `413`。主域 Chrome 重新登录 Hoo，进入“香水品牌 TVC”既有画布，个人主体页显示玄翎、幽影、白汐及正确封面，已截图验收；候选地址上幽影 5 图和刷新保持的验证单独保留。详见 `docs/vercel-supabase-preview.md`。本次定向同步三主体 12 图不建立自动双向同步。

```powershell
git branch --show-current
git status --short
npm run worktrees
npm run check
```

启动前按 [本地开发与数据位置](local-development.md) 使用共享 API 入口；依赖已安装时不重复 `npm ci`，家里电脑首次接入也不初始化数据库。`npm run db:setup` 只用于明确隔离的新建本机演示环境，不用于当前保留源或共享开发库；它依次执行 `db:up`、`db:migrate` 和幂等 `db:seed`，拒绝 production / preview 环境。该脚本的本机目标检查优先读取 `MIGRATION_DATABASE_URL`，未设置时检查 `DATABASE_URL`，并非分别验证两者；独立初始化时必须先让两者指向同一测试数据库，不能沿用云端凭据。公网初始化仍按 `docs/vercel-supabase-preview.md` 单独执行。

该 seed 除账号和项目外，还会为 Hoo 写入 v4 演示夹具：用户提供的 12 张 PNG / JPEG 原图组成“幽影”5 张、“白汐”3 张、“玄翎”4 张。各组从主形象 / 肖像开始作为封面，再按形象设定、造型探索、装备 / 特效排序；展示名和仓库文件名均带组内两位序号。v1–v3 的两组历史主体仅在完整旧 fixture 指纹匹配时原位校准，保留 Entity ID 与 placement，第三组使用新的固定创建键。历史媒体在无额外 Entity、项目或画布引用时只撤销个人 placement 和演示项目引用，底层资产 / blob 不硬删；已发布的历史文件与指纹仍留在仓库。用户编辑过的旧主体会 fail closed，不会偷偷覆盖或追加重复案例；并发编辑发生在上传与事务校准之间时，事务仍会二次校验并失败，已经完成的 canonical Media 可在解决冲突后由下一次 seed 幂等收敛。只有在独立本机夹具环境中更新案例时，才可在核对数据库和 API 的 ObjectStore 根后定向调用 `seedDemoAssetLibrary`；不针对保留迁移源或 Reelay_Dev 运行该步骤。

素材源文件随 Git 同步；日常开发的 PostgreSQL 元数据与原始对象已统一到 Reelay_Dev，家里电脑接入同一环境即可读取现有用户内容，不用 seed 重建。云端状态仍需要数据库与 ObjectStore 配套备份，旧本机迁移源不能覆盖云端的新编辑。共享 schema 变更由一个任务按变更范围执行，普通换机或拉取不运行 migration / seed。普通 `db:seed` 的 preview 模式继续跳过媒体；`db:seed:preview-assets` 是独立公网演示环境显式写入标准仓库夹具的入口，上文公网真实三主体 12 图的一次性迁移与当前共享开发迁移是不同记录。该命令不会建立 Reelay_Dev 与演示站的双向同步，也不会复制后续用户数据。服务启动和依赖安装不会自动 migration 或 seed，也不会在 PostgreSQL 故障时回退到内存。

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
