# Reelay 开发工作流

本文只解决一件事：让每次改动读取正确的上下文、运行正确的检查，避免把任何小改动都升级成全仓库审计。它不替代产品规范、工程护栏或 ADR。

## 1. 开始工作

每次开始先确认：

1. 当前分支和工作区状态。
2. `docs/agent-handoff.md` 中当前实现边界。
3. 本次改动属于下表哪一类。

不要为了“保险”默认通读所有长文档。只有改动会改变对应边界时，才读取和更新对应文档。

多个 Codex 会话并行时，每个会话应使用独立 worktree；同一目录只能同时处于一个分支状态，不能把它当成多个会话的共享分支容器。开始工作或准备合并前运行：

```powershell
npm run worktrees
```

该命令会列出每个 worktree 的目录、分支、未提交改动、远端领先 / 落后状态和最后一次提交，并展开所有脏文件。不要在另一个会话仍有未提交改动时切换、删除或复用它的 worktree。

### 1.1 日常入口与归档

- 主工作目录检出的本地 `main` 是已验证集成入口；新切片从此建立 `codex/<具体任务>` 分支，需要并行时再建立独立 worktree。以 `npm run worktrees` 输出的实际路径为准，不根据旧任务标题或目录名称猜测版本。
- 功能验收后再合入本地 `main`；推送远端、创建 PR 和部署分别核对范围，不能把本地快进等同于公网更新。CI 使用 `package.json` 中声明的 Node 版本。
- `codex/archive/*` 保存已整合历史或未定稿草稿。草稿必须先形成可恢复快照；需要复用时按具体行为移植并验证，不整文件覆盖最新实现。
- 代码已经合入，不代表 worktree 里的 `.reelay-data`、环境文件和正在运行的服务可以删除。ObjectStore 默认相对于进程工作目录，迁移 API 前必须明确 `REELAY_OBJECT_STORE_ROOT` 并验证既有媒体可读；不能重新 seed 来掩盖原素材丢失。
- 不以重写画布或迁移 React Flow 作为主体库继续开发的前置条件。下一次扩大画布核心能力前，再以代表性节点、分组和连接的独立验证评估是否替换画布交互层。

## 2. 上下文路由

| 改动范围 | 必读内容 | 常见代码位置 |
| --- | --- | --- |
| 旧画布交互、节点、Agent、素材库 | `current-product-spec.md` 的对应章节；涉及边界时再读 `engineering-guardrails.md` | `app.js`、`styles/app.css`、`src/config/`、`data/` |
| 登录、主页、最近项目、全部项目 | `current-product-spec.md` 的登录/主页/项目章节；涉及迁移边界时再读 ADR 0001 | `src/app/`、`src/pages/`、`src/shared/` |
| React 应用壳、路由、页面迁移 | `adr/0001-application-runtime-and-migration.md`；相关 `product-expansion-plan.md` 章节 | `src/app/`、`src/pages/`、`src/infrastructure/http/` |
| Session、Workspace、Membership、Project、共享后端 | ADR 的领域和后端章节；扩展计划的数据边界章节 | `src/domain/`、`src/application/`、后续服务端目录 |
| 资产、生成任务、积分、跨项目 Agent | `product-expansion-plan.md` 的对应领域章节和相关护栏 | 对应 domain/application 模块 |
| Vercel / Supabase 公网预览 | `vercel-supabase-preview.md`；涉及服务边界时再读后端 ADR | `api/`、`src/server/`、`vercel.json`、数据库迁移 |
| 只改文档 | 被修改文档及其直接引用 | `docs/` |

文档职责：

- `current-product-spec.md`：只记录已经实现并可运行的行为。
- `product-expansion-plan.md`：只记录尚未实现的产品与领域规划。
- `engineering-guardrails.md`：记录跨功能仍需成立的工程边界。
- `adr/`：记录会影响多个模块的可逆架构决策和被否决方案。
- `agent-handoff.md`：只保留接手所需的当前状态，不复制整份规范。

发现文档与运行证据冲突时，以运行证据为起点，重新判断设计并同步修正文档；不要为了符合旧文档而延续错误实现。

## 3. 检查路由

迭代过程中使用最小相关检查：

| 改动范围 | 快速检查 |
| --- | --- |
| 旧画布端口、连线、拖拽、框选等局部交互 | `npm run check:canvas` |
| 迁移期旧画布 JS / 配置 / HTML / CSS | `npm run check:legacy` |
| React / TypeScript 应用壳或领域层 | `npm run check:shell` |
| 共享服务、会话或项目 API | `npm run check:server` |
| PostgreSQL schema、迁移、seed 或 adapter | `npm run check:server`；本地 PostgreSQL 健康时再运行 `npm run check:server:postgres` |
| 应用壳构建、入口或路由 | `npm run verify:shell` |
| 仅文档 | `git diff --check` |

代码里程碑或提交前统一执行：

```powershell
npm run check
git diff --check
```

`npm run check` 保持不依赖 Docker，便于快速回归；数据库切片的里程碑还必须显式运行 `npm run check:server:postgres`，不能用内存 adapter 测试代替持久化验收。

视觉与行为检查按影响面执行：

- 旧画布局部视觉和手势迭代使用 `npm run dev:canvas` 启动独立预览，不要求同时启动 React 应用壳、API 或 Docker。浏览器只复验本次改动直接影响的手势；完整手势矩阵留到代码里程碑或合并前。
- 改到可见 UI：检查相关页面、响应式状态、浅色/深色和控制台。
- 改到账户或积分：检查当前 mock 刷新契约；引入持久账本后改为余额、扣费和退款幂等检查。
- 改到生成、撤销、画布归属或项目资产：检查不会跨画布或跨项目写入。
- 只改文档、纯领域类型或无 UI 的 repository port：不要求重复整套画布手势回归。

### 3.1 画布布局调节器

本地 `npm run dev:shell` 预览可在画布路由末尾添加 `?layoutTune=1`，打开只用于开发的布局调节器。它只对白名单中的项目条、资产库、画布工具条、Agent 和共享间距提供位置、尺寸与数值微调；选框标签是独立移动抓手，四边手柄只调整尺寸，不会让整个选框吞掉真实控件。`Ctrl + Shift + L` 可隐藏或重新显示。临时参数保存在当前浏览器标签页的 `sessionStorage`，不会进入 CanvasDocument、服务端或撤销栈；“全部重置”会恢复本次页面进入时的基准。

确认视觉后使用“复制参数”导出当前值，再把通过评审的值收敛回正式 CSS / 几何状态和相关契约。调节器由 Vite `serve` 插件注入，生产构建不应包含它的脚本、样式或静态 DOM。

## 4. 实现原则

- 新产品页面进入正式路由壳，不再扩写 `app.js`。
- 旧画布只通过明确的 host / bridge 边界接入；不要在迁移前整体重写。
- 优先按数据所有权和交互边界拆分，不按文件行数机械拆组件。
- 一次提交只表达一个可回退意图：工程治理、迁移、功能和清理尽量分开。
- 自动检查不能替代浏览器验证，但浏览器验证也必须与改动范围匹配。
