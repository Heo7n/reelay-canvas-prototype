# Reelay 当前交接

核对日期：2026-10-15。本页只保存当前基线、环境、未完成项与最近验证；已实现功能见[产品规范](current-product-spec.md)，操作规则见[开发工作流](development-workflow.md)，历史从 Git / PR 查，不追加逐轮状态。

## 当前代码与工作

- 实际工作区：`C:/Users/Ho/.codex/worktrees/cc38/0707-experiment`，分支 `codex/experiment-20260910`。开始时重新检查 Git；不要使用任务环境提供的其他旧 worktree。
- 本轮治理起点为 `8afd67d`；2026-10-15 fetch 后 `origin/main` 仍为 `f32034c`（PR #29），没有打开的 PR。原 91 个未提交文件中的真实生成接入、积分与相关修复已整理为 `869cb35`；深色配色独立提交。本轮按用户授权仅同步 `codex/experiment-20260910`，不合主线。最终 HEAD 与远端状态以实际 Git 为准。
- 分支 / 工作区盘点：历史 public-preview 的 3 个本地额外提交和空画布设计已进入 experiment；旧 development / entity / integration 及远端独有历史分支已进入 main，不重复合并。f859 工作区的 12 个未提交文件已逐项确认功能、测试和规则均在 experiment。3c52 的深色配色已按当前 token / ring 体系移植到实验分支，保留 8px 圆角和现有三态几何，源工作区保留；composer-unification 工作区干净，没有遗漏输入布局修改。canvas-refinement 只留旧文档修改；两个 archive 分支及两个旧 stash 保留作历史，不直接恢复。
- 已实现审计后的有限收敛：普通节点、对话和正片共用生成服务；绘制不再隐式保存；登录失效保护当前快照并支持同页恢复；版本冲突可另存全部内部画布副本，放弃修改必须确认。没有扩展为云数据迁移或旧工作区清理。
- 接续治理修复了拖动中途位置 / Alt 副本进入自动保存，以及未结束手势跨画布写入同 ID 节点的问题。节点移动、组移动 / 缩放和 Alt 复制改为独立预览 owner，松手提交，取消丢弃；保存协调器继续只读取 CanvasRecord，后台生成不被手势阻塞。没有扩大为全部节点结构命令迁移。
- 积分 / 发送按钮改动已随 `869cb35` 提交：Seedance 2.5 / 2.0 / Fast（含样片、正片）按官方尺寸、单价和最低用量计算，配置归模型目录；用户确认成本 × 16.5，最终向上取整整数。节点、对话和正片共用报价规则；唯一目标的编辑 / 指定时长延长继承视频规格显示单值，智能时长及多目标未定保留范围；非标准画幅按标称像素面积明确标注近似，未知时长 / 所需宽高显示计算中，节点滑杆预览更新报价但不写内容 / 撤销。受理前重新估算并冻结模拟扣费，没有接入供应商实际 usage 或持久账本。
- CI 配置覆盖 `main`、当前评审分支 push、PR 与手动触发。[当前评审分支运行](https://github.com/Heo7n/reelay-canvas-prototype/actions/workflows/ci.yml?query=branch%3Acodex%2Fexperiment-20260910)是远端证据入口；`check:release-ci` 只接受精确源 SHA 的 push / manual 三项成功，PR merge 检查不能替代该源码树证据。

## 当前本机评审

- 2026-10-15 同步结果：真实生成等有效改动提交 `869cb35`，深色配色提交 `e2dc7f6`，均已推送实验分支；主线仍为 `f32034c`，未合并或部署公网。同步时 5182 / 5183 原服务已停止，已从既有配置与原数据库 / ObjectStore 恢复：API PID 32140（launcher 28852）、前端 PID 13856（launcher 38204）。新日志为 `canvas-video-api-20261015.*.log` 与 `frontend-20261015.*.log`；预览 CSS 200 且含新配色，代理 health 200 / PostgreSQL 正常。旧成功 Probe Range 仍为 206；平台连接为 disconnected，使用真实生成前需在页面重新登录，不自动恢复凭据或提交任务。下方 2026-10-14 PID 与连接记录仅为当时验证事实。

- 2026-10-15 提交前完整 `npm run check`、两种构建、10 项隔离浏览器回归与 103 项独立 PostgreSQL 测试通过；浅深主题各默认 / hover / selected 六张截图核对，几何一致、控制台零错误。证据在 `.reelay-data/commit-sync-20261015/`。生成连接页已纠正旧“画布与对话仍模拟”说明；known prepared / busy 状态缺口仍按下文记录，不因此声称修复。本轮未重启实际生成 API、发送付费任务或部署公网。

- 用户正在使用 `http://localhost:5182/index.html`；完整项目入口为 `/app`，API 为 5183，同属上述工作区。当前数据为既有本机 `reelay_library_preview_20260915` 与 `.reelay-data/library-preview/objects`，不是共享云库。
- 恢复命令、唯一端口 / 容器 / 数据位置表见[当前评审环境](local-development.md#当前评审环境)。仍使用既有 `.env.local-preview`、PostgreSQL `reelay_library_preview_20260915` 和 ObjectStore，本机已应用 0020，未 seed 或复制业务内容。前端 5182 保留，API 5183 已加载任务准备 / 节点引用修复，日志 `.reelay-data/library-preview/canvas-video-api.stdout.log` / `stderr.log`。2026-10-14 最新只读确认 `channel: web / available: true / connected`、官网列表 18 项；旧成功 Probe 视频仍为 206。scifi 项目共五条普通任务：一条画布 Fast / 480P / 4 秒 succeeded，原节点引用和结果已保存，Range 206 / MP4 签名通过；一条对话 Fast / 720P / 4 秒 prepared，激活时收到 409；三条历史 prepared 未执行。最新证据为 `.reelay-data/real-generation-assessment-20261014.json`。本轮评估未发送平台生成或修改任务。平台凭据仍仅在服务进程内；当前 API PID 44572、launcher 60012，前端 PID 14376，不得随意重启正在生成的 API。此前同 JWT 对照已确认 Agent / Web 分别 1 / 17 项且无重合，不用再次询问账号或网址。
- 仓库迁移已至 `0020`，本机评审库已应用 `0020_canvas_video_generation.sql`；这只是源码可提供的最高迁移，不代表 Reelay_Dev / Reelay_Test 已应用。本机实验迁移不能自动用于共享库；操作前核实目标 ledger 和兼容范围。
- 自动浏览器曾对当前 localhost 返回 `URL protocol not allowed`，根因尚未确定；没有证据说明是用户主动限制。后续没有绕过拒绝，最近版本栏 / 新结果反馈未实际浏览器视觉或 E2E 复核。HTTP 和 JSDOM 不替代该验收。

## 最近公开版本

| 目标 | 已记录事实 |
| --- | --- |
| [免注册分享站](https://reelay-experience.vercel.app/app) | 2026-09-28 发布源 `b7c0267f56299b1dec387b361e5177f6bd0c55f2`，production `dpl_H7JWcUqCYdpGAq8wstmxBFieoFPu`；实际部署域名 `reelay-experience-qspw5pv3m-heos-projects-560eccff.vercel.app` |
| 体验站边界 | 独立静态输出，无 API / 数据库；项目与临时资产仅当前标签页内存，刷新重置。上次核对 Vercel 无 Git link，发布前须再次检查，不假定配置永不变 |
| [公网账号站](https://reelay-canvas-prototype.vercel.app/app) | 2026-10-14 用户授权恢复登录后，原 Supabase `Reelay_Test`（`yacgzkkttwtyxkfxiwyn`）已从 INACTIVE 恢复为 ACTIVE_HEALTHY，组织仍为 Free。16:23 北京时间一次 HTTPS 验收通过：health 200、公开 creator 演示登录 201、Secure / HttpOnly cookie、会话身份及项目列表 200；验证临时会话注销 204。证据 `.reelay-data/verify-public-login-20261014.json`。仅恢复原项目，未重新建库、migration / seed、发布或付费生成；官网真实连接路由仍未发布。Vercel connector 当前 scope 对项目和域名均返回 not_found，未确认现部署源 SHA，不能沿用旧 PR 基线当作线上证据 |

分享站最近验证：本地完整 `npm run check`、161 项相关回归、Experience 构建与差异检查通过；候选 173 个源文件经平台 SHA1 匹配，主域 172 个文件中 143 个完整 SHA256、29 个大媒体首段匹配；两个 SPA 入口、视频 206、API 404 通过。实际 promote 创建了新 production ID，上表记录的是最终部署。其浏览器视觉验收仍缺失，且当时没有同源 SHA 的远端 CI。

历史证据仍保留在本机忽略目录：`.reelay-data/hover-version-release-check.log`、`.reelay-data/inline-version-release-build.log`、`.reelay-data/inline-version-public-verification.json`、`.reelay-data/inline-version-production-inspect.log`。通用新核验命令见[发布步骤](vercel-supabase-preview.md#4-发布步骤)，不再依赖历史临时验证脚本。本轮治理未同步公网。

最新积分预估切片的本地完整检查与两种构建证据在 `.reelay-data/credit-estimate-check.log`、`credit-estimate-account-build.log`、`credit-estimate-experience-build.log`；1765 项 legacy、478 项 shell、328 项 server 以及交付 / 启动工具检查通过。新增回归覆盖官方计费配置、参考元数据、Auto 范围、滑杆预览、正片冻结参考与扣费退款。[功能提交的远端运行](https://github.com/Heo7n/reelay-canvas-prototype/actions/runs/38206908541)中 quality 和 27 项隔离浏览器测试通过，包括按钮报价、浅深单行布局、提交 / 取消。PostgreSQL 的 94 项断言通过，但 storage 测试关闭连接池后再强制终止后端，触发清理竞态；已删除该强制终止，使用普通 DROP，保留真实泄漏时的失败。修复后的完整状态以当前源 SHA 的上述 CI 入口为准。该积分切片没有修改数据库结构；本次真实视频切片新增的 0020 与本机迁移记录见下文。

远端验收已暴露并修复旧迁移断言、测试数据隔离、过期 UI 定位器、正片参数被误判外部点击、主体编辑返回丢失搜索，以及演示初始化首轮返回陈旧标签数据的问题；没有跳过失败或放宽错误校验。浏览器每项测试使用独立内存服务，数据库测试只在隔离环境执行，不接触当前评审数据。

官网 Web 普通生成切片完整 `npm run check` 与两种构建通过：1775 项 legacy、511 项 shell、440 项 server；最新证据为 `.reelay-data/web-ordinary-generation-final-check.log`、`web-ordinary-generation-build.log`、`web-ordinary-generation-experience-build.log`。111 项直接相关服务端测试验证官网占位 Asset → Artifact → stream、显式付费确认、同键去重、严格输出关联、代理与凭据边界；JSON 202 接受包和矛盾终态保持账号锁。自动测试全为 fake fetch / 隔离 stores，无远端写入或费用。用户手动确认的真实首测于 2026-10-13 12:11:49 提交，12:13:28 保存成功（北京时间，约 99 秒）；收到 24 个 artifact / artifact_status / done 事件，关联输出终态 completed。本机文件 1,736,964 字节、864 × 496、5.088 秒、H.264 / AAC，校验和与完整 FFmpeg 解码通过；鉴权视频 Range 返回 206 / video/mp4 / 正确 ftyp 签名。实际浏览器播放及费用尚未核对；本轮只读跟踪，没有追加生成。安全证据在 `.reelay-data/web-generation-task-status.json`、`web-generation-video-verification.json`、`web-generation-live-status.json`，只读脚本为 `.reelay-data/track-web-generation.mjs`、`verify-web-generation-video.mjs`、`inspect-web-generation.mjs`；临时本机会话已撤销，脚本和证据均忽略，不含平台凭据。昨日通道对照证据仍在 `.reelay-data/project-channel-comparison-live.json`。未提交、推送或同步公网。

最新节点修复里程碑：`npm run check`、账号 / 体验两种构建、6 项隔离浏览器生成与积分回归通过；1822 项 legacy、544 项 shell、509 项 server。真实 PostgreSQL 曾精确复现画布请求省略 conversationId 后首次 prepare 409；修复后 9 项隔离数据库测试通过，覆盖 HTTP 准备 → canonical 保存节点任务引用 → 激活 → 假平台结果 → Range 206。新增 Host 测试验证保存确认前零激活、确认后仅激活一次；明确提交失败在原节点显示原因并允许编辑重试。证据为 `.reelay-data/scifi-node-fix-full-check.log`、`scifi-node-fix-account-build.log`、`scifi-node-fix-experience-build.log`、`scifi-node-fix-e2e.log`；数据库执行摘要及重跑入口为 `canvas-video-postgres-null-input-verification.json`（摘要，不是原始终端日志）。上游调用全为注入假平台，未付费验证新双入口，不替代当前页面视觉验收。此前全量 PostgreSQL 101 项及事务修正 7 项证据仍保留。

本机迁移前保存完整数据库 dump，并确认已有用户 / 项目 / 画布文档计数不变；对象目录未复制或删除。证据 `.reelay-data/library-preview/canvas-video-migration-evidence.json`，备份 `before-canvas-video-0020.dump`。当前 API 使用忽略目录 `launch-upgraded-canvas-generation-api.mjs` 保全旧固定 Probe；新的普通任务不依赖该导入脚本即可重启读回。用户本次三次点击均停在 prepared，首次准备因 JSONB 去掉 undefined 会话字段而误报 409；对应节点未保存任务引用，没有 activate 或平台生成。修复未激活这三条旧任务、未改用户文档或业务库结构。更新后只读任务读取 200、文档 revision 447、旧视频 206；跨账号 / 跨项目读取仍分别为 401 / 404，三条 prepared 未变，证据为 `.reelay-data/scifi-node-fix-live-verification.json`。快照 `scifi-generation-debug-snapshot.json` 含私人提示词，仅本机忽略保存；旧结果状态为 `web-generation-live-status.json`。未提交、推送或同步公网。

## 接续边界与下一入口

- 普通 Seedance 视频已接入同一持久真实任务链路：节点和对话均在有效连接下走真实，明确未连接 / 未启用走模拟；网络错误、过期及未确认结果不回退模拟。图片、提示词优化与无连接的样片 / 正片仍为模拟。没有持久 CreditLedger；真实任务不扣退模拟余额，刷新测试积分保持 `3000 / 0`。
- 普通画布入口已有真实成功证据；对话请求在画布任务执行中激活 409 后仍停在 prepared。Host 在 activate 前统一标 unknown，明确拒绝也按未知处理；legacy start / restore 把准备任务持续轮询，最新日志已观察到该对话任务 3928 次 GET。下一次若用户授权修复，先收口明确拒绝 / 待提交 / 已受理 / 未知结果的状态边界与显式继续，不能自动激活旧任务或重发费用。此次评估未修改实现、清理任务或扩大图片 / 公网接入。
- 普通真实生成已迁入[官网 Web 阶段 A](current-product-spec.md#23-本机普通真实生成联调)：账号设置 → 生成连接，固定 Fast / 480P / 16:9 / 5 秒 / 1 条 / 无参考。用户的首次付费请求已出片、保存、分段读取和完整解码；旧成功视频已通过已保存 DTO 与 ObjectStore metadata 在升级后回载，Range 仍为 206；用户重新登录后已只读确认 connected，官网列表 17 项，画布 context 为 real、持久任务读取 200；没有新增付费首测。凭据仍仅进程内；普通画布 / 对话任务、个人官网项目绑定、结果与账号执行锁已经落库。未知结果不重发，保存重试不生成；未删除远端占位资源。图片、参考上传、编辑 / 延长、样片 / 正片及多人公网接入仍未实现，不扩大为发布。详细边界见[首期接入规划](product-expansion-plan.md#83-普通真实生成本机首期接入方案)。
- 后续双入口设计已补进 §8.3：用户确认项目成员共享结果、平台连接 / 凭据 / 费用和私人对话分别归发起人；项目对应关系带个人 connection 身份，任务与节点引用须在远端执行前可靠落库。图片尺寸能力按模型原生 / Reelay 通道 / 官网展示分层，不能把官网 GPT 菜单视为 API 上限。已读 OpenAI 官方 GPT Image 2 自定义 size / quality 文档，公开客户端传输层也无额外字段删除白名单，但 Reelay GPT 字段位置 / 接受及生效仍未验证；未追加生成或更改运行服务。普通 Seedance 双入口已按该设计实现；图片相关证据仍为规划，不能称图片真实接入已实现。
- React 壳与 legacy iframe 是渐进迁移结构；按真实功能边界提取，不以大文件或 JS / TS 混用为理由重写整个应用。高频移动已分离预览和提交，仍复用现有受控移动 / 创建撤销；部分结构写入尚未迁入统一内容命令。工程治理已收口，后续按具体产品目标或已复现问题安排，不自动继续文件导入和结构迁移。
- 当前本机数据、保留源数据库、旧 ObjectStore 与云端内容均需保留；位置和备份边界见[本地开发](local-development.md#数据归属与保留)。本机样本备份演练已做，真实云库与原媒体配套备份 / 隔离恢复仍未验收。
- 保存恢复副本在成功保存前只保留当前页面内存，不提供浏览器崩溃 / 刷新后的永久恢复。真实积分账本与公网多人连接仍待独立切片，本机阶段 A 不承诺这些能力。
- 下一次发布必须以 `check:release-ci` 绑定明确 source SHA 与实际目标；本地受限页面的视觉验收仍不能由 CI 隔离业务流程代替。
- 分享申请、实时协同、持久生成 / 结算等仍属[扩展规划](product-expansion-plan.md)，不是已实现页面。家里电脑接续也仍待真实验收。
