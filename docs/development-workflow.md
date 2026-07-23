# Reelay 开发工作流

本文只解决一件事：让每次改动读取正确的上下文、运行正确的检查，避免把任何小改动都升级成全仓库审计。它不替代产品规范、工程护栏或 ADR。

## 1. 开始工作

每次开始先确认：

1. 当前分支和工作区状态。
2. `docs/agent-handoff.md` 中当前实现边界。
3. 本次改动属于下表哪一类。

不要为了“保险”默认通读所有长文档。只有改动会改变对应边界时，才读取和更新对应文档。

## 2. 上下文路由

| 改动范围 | 必读内容 | 常见代码位置 |
| --- | --- | --- |
| 旧画布交互、节点、Agent、素材库 | `current-product-spec.md` 的对应章节；涉及边界时再读 `engineering-guardrails.md` | `app.js`、`styles/app.css`、`src/config/`、`data/` |
| 登录、主页、最近项目、全部项目 | `current-product-spec.md` 的登录/主页/项目章节；涉及迁移边界时再读 ADR 0001 | `src/app/`、`src/pages/`、`src/shared/` |
| React 应用壳、路由、页面迁移 | `adr/0001-application-runtime-and-migration.md`；相关 `product-expansion-plan.md` 章节 | `src/app/`、`src/pages/`、`src/infrastructure/http/` |
| Session、Workspace、Membership、Project、共享后端 | ADR 的领域和后端章节；扩展计划的数据边界章节 | `src/domain/`、`src/application/`、后续服务端目录 |
| 资产、生成任务、积分、跨项目 Agent | `product-expansion-plan.md` 的对应领域章节和相关护栏 | 对应 domain/application 模块 |
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

- 改到可见 UI：检查相关页面、响应式状态、浅色/深色和控制台。
- 改到账户或积分：检查当前 mock 刷新契约；引入持久账本后改为余额、扣费和退款幂等检查。
- 改到生成、撤销、画布归属或项目资产：检查不会跨画布或跨项目写入。
- 只改文档、纯领域类型或无 UI 的 repository port：不要求重复整套画布手势回归。

## 4. 实现原则

- 新产品页面进入正式路由壳，不再扩写 `app.js`。
- 旧画布只通过明确的 host / bridge 边界接入；不要在迁移前整体重写。
- 优先按数据所有权和交互边界拆分，不按文件行数机械拆组件。
- 一次提交只表达一个可回退意图：工程治理、迁移、功能和清理尽量分开。
- 自动检查不能替代浏览器验证，但浏览器验证也必须与改动范围匹配。
