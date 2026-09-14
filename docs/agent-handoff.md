# Reelay 当前交接

本页只保留当前接手信息；功能细节见[产品规范](current-product-spec.md)，规则见[开发工作流](development-workflow.md)。每次更新替换失效状态，历史由 Git / PR 保存。

## 最近核验：2026-09-14

- 清理开始时，本工作区 HEAD、本地 `main` 与 `origin/main` 均为 `f32034c`，对应 [PR #29](https://github.com/Heo7n/reelay-canvas-prototype/pull/29)。实际分支与脏文件仍须通过 `git status --short --branch`、`npm run worktrees` 重新确认。
- 此发布包含侧栏生成记录、参考预览和画布交互的集成，以及 Seedance 2.5 / 2.0 / 2.0 Fast 的提示词优化。优化生命周期和配置规则见[开发简版](prompt-optimization-development.md)。
- PR #29 构建源为 `c31303a80430377d195c0ce0ace5859d10d055fe`；合并提交 `f32034c` 与该来源文件树一致。源码提交与 merge SHA 不必相同，判断发布一致性要核对文件树和实际产物。
- 最近已验收账号站：[reelay-canvas-prototype](https://reelay-canvas-prototype.vercel.app)，部署 `dpl_21E1wxXt7KzR68UqeJ3KkaS3imR9`；体验站：[reelay-experience](https://reelay-experience.vercel.app)，部署 `dpl_EbDomQPJd68Qxpp5iNjKzQBgohc5`。这是最近核验快照，后续推送不自动代表公网更新。

## 当前本地工作

- 规范整理 `5c13646`、独立 Playwright 验收 `d02af86` 已在本地。后续治理首批已落实：ESLint 基础规则、核心层导入边界及其保护测试接入 `check`；两端共用 `styles/typography.css`；CanvasHost 的等待保存导航移入 `useCanvasNavigation.ts`，Host 保留保存与作用域权威。开发依赖 Vitest 更新至 4.1.11 修复已公布的 mock 路径读取问题，本次 npm audit 为 0 项。
- 本轮完整 `npm run check`、账号 / 体验双构建、四条浏览器流程均通过，导航 Host 的 56 条测试通过。5174 实际页面已核对宿主与画布字体一致，默认 / 480px 最窄侧栏和浅深主题无新增排版问题，控制台无错误。单文件 lint 约 1 秒，完整检查实测约 48–57 秒；浏览器独立执行，不加入视觉微调循环。
- `check:backup:drill` 已完成本机 PostgreSQL 样本隔离备份恢复，17 张表及图片 / 视频 / 音频原文件核验一致；工具不接受共享数据库目标。真实云备份位置、持续导出和隔离恢复尚待落实，不能用样本演练代替。事实与边界见本地开发说明的备份段。
- 视觉微调用 `check:visual` 加页面验收，局部代码可 `npm run lint -- src/<文件>`；核心流程用 `test:e2e`，已构建同一代码时用 `test:e2e:run`。新增治理与检查配置尚未推送或发布，公网仍为上述 PR #29 的最近核验版本。
- 用户预览继续使用 `5174 → 5175`，两个进程均来自 `C:/Users/Ho/.codex/worktrees/f859/0707`；恢复命令、日志和既有数据位置见[本地开发](local-development.md)。
- `cc38` 的 `eb32e55` 与 `ead8` 的 `c76271d` 已在上述集成基线中，不重复导入。旧 `0707-wt-canvas-refinement` 仍有未提交文档，不覆盖；分支合入不代表可删除该目录或忽略数据。

## 接续边界

- 持久化：会话、项目、CanvasDocument、个人 Media / Entity 等由 PostgreSQL 与私有 ObjectStore 保存；共享开发使用 Reelay_Dev，公网账号站使用独立 Reelay_Test，体验站使用刷新即重置的内存。代码同步不复制业务数据。
- 生成记录、节点生成和提示词优化仍是本地模拟。没有真实供应商执行或持久 CreditLedger；刷新测试积分仍为 `3000 / 0`。
- `app.js` 与 `CanvasHost.tsx` 仍有集中职责，按功能边界渐进提取；节点结构及高频移动撤销尚未全部迁入内容命令，不宣称已完成整套画布迁移。
- 家里电脑尚待安装与实际接续验收；操作已并入本地开发说明。不要为恢复预览重跑初始化、seed 或导入旧库。
- 新功能优先级与未定规则只在[扩展规划](product-expansion-plan.md)维护。分享申请、实时协同、持久生成 / 结算等尚未完成。

需要追溯旧实现、加载测量或已删除文档时，使用 `git log --all -- <path>` 与 `git show <commit>:<path>`。不再把各轮截图、测试计数、静态 PID 和旧“尚未发布”说明追加到本页。
