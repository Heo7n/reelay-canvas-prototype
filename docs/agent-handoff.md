# Reelay 当前交接

核对日期：2026-09-29。本页只保存当前基线、环境、未完成项与最近验证；已实现功能见[产品规范](current-product-spec.md)，操作规则见[开发工作流](development-workflow.md)，历史从 Git / PR 查，不追加逐轮状态。

## 当前代码与工作

- 实际工作区：`C:/Users/Ho/.codex/worktrees/cc38/0707-experiment`，分支 `codex/experiment-20260910`。开始时重新检查 Git；不要使用任务环境提供的其他旧 worktree。
- 本轮治理起点为 `8afd67d`；`origin/main` 最近本机已知为 `f32034c`（PR #29），实验分支尚未经 PR 集成。后续源提交与脏文件以实际 Git 为准。
- 已实现审计后的有限收敛：普通节点、对话和正片共用生成服务；绘制不再隐式保存；登录失效保护当前快照并支持同页恢复；版本冲突可另存全部内部画布副本，放弃修改必须确认。没有扩展为云数据迁移或旧工作区清理。
- CI 配置覆盖 `main`、当前评审分支 push、PR 与手动触发。[当前评审分支运行](https://github.com/Heo7n/reelay-canvas-prototype/actions/workflows/ci.yml?query=branch%3Acodex%2Fexperiment-20260910)是远端证据入口；`check:release-ci` 只接受精确源 SHA 的 push / manual 三项成功，PR merge 检查不能替代该源码树证据。

## 当前本机评审

- 用户正在使用 `http://localhost:5182/index.html`；完整项目入口为 `/app`，API 为 5183，同属上述工作区。当前数据为既有本机 `reelay_library_preview_20260915` 与 `.reelay-data/library-preview/objects`，不是共享云库。
- 恢复命令、唯一端口 / 容器 / 数据位置表见[当前评审环境](local-development.md#当前评审环境)。本机忽略的 `.env.local-preview` 已从既有 launcher 安全转存。2026-09-29 已用入库 launcher 仅重启 5183，载入新 API 契约；5183 与 5182 代理的 `/api/health` 均为 200 / PostgreSQL。前端、数据库、原媒体与用户项目保留，未迁移或 seed。
- 仓库迁移已至 `0019`；这只是源码可提供的最高迁移，不代表 Reelay_Dev / Reelay_Test 已应用。本机实验迁移不能自动用于共享库；操作前核实目标 ledger 和兼容范围。
- 自动浏览器曾对当前 localhost 返回 `URL protocol not allowed`，根因尚未确定；没有证据说明是用户主动限制。后续没有绕过拒绝，最近版本栏 / 新结果反馈未实际浏览器视觉或 E2E 复核。HTTP 和 JSDOM 不替代该验收。

## 最近公开版本

| 目标 | 已记录事实 |
| --- | --- |
| [免注册分享站](https://reelay-experience.vercel.app/app) | 2026-09-28 发布源 `b7c0267f56299b1dec387b361e5177f6bd0c55f2`，production `dpl_H7JWcUqCYdpGAq8wstmxBFieoFPu`；实际部署域名 `reelay-experience-qspw5pv3m-heos-projects-560eccff.vercel.app` |
| 体验站边界 | 独立静态输出，无 API / 数据库；项目与临时资产仅当前标签页内存，刷新重置。上次核对 Vercel 无 Git link，发布前须再次检查，不假定配置永不变 |
| [公网账号站](https://reelay-canvas-prototype.vercel.app/app) | 最近保留记录为 PR #29 基线；2026-09-28 体验站发布未部署账号站、迁移云库或复制本机数据。本轮未查询账号站当前部署 |

分享站最近验证：本地完整 `npm run check`、161 项相关回归、Experience 构建与差异检查通过；候选 173 个源文件经平台 SHA1 匹配，主域 172 个文件中 143 个完整 SHA256、29 个大媒体首段匹配；两个 SPA 入口、视频 206、API 404 通过。实际 promote 创建了新 production ID，上表记录的是最终部署。其浏览器视觉验收仍缺失，且当时没有同源 SHA 的远端 CI。

历史证据仍保留在本机忽略目录：`.reelay-data/hover-version-release-check.log`、`.reelay-data/inline-version-release-build.log`、`.reelay-data/inline-version-public-verification.json`、`.reelay-data/inline-version-production-inspect.log`。通用新核验命令见[发布步骤](vercel-supabase-preview.md#4-发布步骤)，不再依赖历史临时验证脚本。本轮治理未同步公网。

本轮本地完整检查与两种构建证据在 `.reelay-data/governance-check-final.log`、`governance-account-build.log`、`governance-experience-build.log`；涵盖 legacy、shell、server、交付与启动工具测试，以及 lint、类型、文档、CSS / HTML 和 E2E 类型检查。独立临时 PostgreSQL 的 94 项集成测试通过，临时容器已清理。新增浏览器验收覆盖真实 401 同页续登与 409 保存副本；实际运行结果查看上述 CI 入口，不将本地类型检查当成浏览器通过。

远端验收已暴露并修复旧迁移断言、测试数据隔离、过期 UI 定位器、正片参数被误判外部点击、主体编辑返回丢失搜索，以及演示初始化首轮返回陈旧标签数据的问题；没有跳过失败或放宽错误校验。浏览器每项测试使用独立内存服务，数据库测试只在隔离环境执行，不接触当前评审数据。

## 接续边界与下一入口

- 生成记录、节点任务、提示词优化仍是模拟，没有真实供应商执行或持久 CreditLedger；刷新测试积分保持 `3000 / 0`。可见结果与正片关系以产品规范为准，演示进度、媒体与时限不能直接当供应商协议。
- React 壳与 legacy iframe 是渐进迁移结构；按真实功能边界提取，不以大文件或 JS / TS 混用为理由重写整个应用。高频移动与部分结构写入尚未全部迁入统一内容命令。
- 当前本机数据、保留源数据库、旧 ObjectStore 与云端内容均需保留；位置和备份边界见[本地开发](local-development.md#数据归属与保留)。本机样本备份演练已做，真实云库与原媒体配套备份 / 隔离恢复仍未验收。
- 保存恢复副本在成功保存前只保留当前页面内存，不提供浏览器崩溃 / 刷新后的永久恢复。真实供应商、持久任务与积分账本仍待独立切片。
- 下一次发布必须以 `check:release-ci` 绑定明确 source SHA 与实际目标；本地受限页面的视觉验收仍不能由 CI 隔离业务流程代替。
- 分享申请、实时协同、持久生成 / 结算等仍属[扩展规划](product-expansion-plan.md)，不是已实现页面。家里电脑接续也仍待真实验收。
