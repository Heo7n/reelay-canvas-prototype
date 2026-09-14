# Reelay 产品预演版

用于验证 AIGC 创作流程、画布交互与产品规则。当前采用 React / TypeScript 路由壳、迁移期画布 iframe 和 Fastify / PostgreSQL 服务；真实生成、正式账号生命周期与积分账本尚未接入。已实现行为以[产品规范](docs/current-product-spec.md)为准。

## 启动与检查

使用 Node.js `24.x` 和 npm；首次安装或锁文件变化后运行 `npm ci`。

- 当前本机预览：[5174 /app](http://127.0.0.1:5174/app)，API 为 5175。先核对进程来自哪个工作区，再复用或恢复。
- 启动命令、换电脑接续、配置与数据位置统一见[本地开发](docs/local-development.md)。
- 独立画布调试使用 `npm run dev:canvas`；它不替代完整路由、权限和保存验收。
- 代码里程碑执行 `npm run check` 与 `git diff --check`；迭代中的定向检查按[开发工作流](docs/development-workflow.md)选择。
- 局部代码规则检查用 `npm run lint -- src/<本次文件>`；完整检查已包含 lint 和核心模块依赖边界校验。
- 视觉微调用 `npm run check:visual` 并查看预览；关键链路用 `npm run test:e2e` 在隔离内存服务自动验收，不接入本机创作数据。

## 规范入口

| 要解决的问题 | 唯一维护入口 |
| --- | --- |
| 如何开展 Vibe coding、分工、清理、验证与交付 | [开发工作流](docs/development-workflow.md) |
| 字体、颜色、控件、图标、浮层、动效与适配 | [设计规范](docs/design-system.md) |
| 状态、撤销、异步、权限、持久化与代码边界 | [工程护栏](docs/engineering-guardrails.md) |
| 当前行为 / 后续产品规划 | [产品规范](docs/current-product-spec.md) / [扩展规划](docs/product-expansion-plan.md) |
| 当前集成状态与下一入口 | [当前交接](docs/agent-handoff.md) |
| 双站构建、发布与数据隔离 | [公网预览](docs/vercel-supabase-preview.md) |

Agent 从 [AGENTS.md](AGENTS.md) 开始；产品功能不再在 README 重复列清单，历史实现与发布证据查 Git / PR。

## 目录职责

```text
app-shell.html / src/app/          React 入口、路由、依赖组装
src/pages/ / src/shared/           产品页面、共享 UI 与主题
src/features/                     模型目录适配等独立功能
src/domain/                       不依赖 UI / HTTP / 数据库的领域规则
src/application/                  用例、service 与 repository / gateway ports
src/infrastructure/               浏览器 HTTP 与体验模式 adapters
src/server/ / api/                 常驻服务、数据库 / 存储、Vercel API 入口
index.html / app.js                迁移期画布入口与现有适配
src/legacy-canvas/ / src/prompt-editor/
                                  画布控制器、视图、内容事务与编辑器
styles.css / styles/              画布样式入口与功能样式
data/model-catalog.js              模型、参数与能力的唯一目录
assets/                           随版本分发的预置素材
dev/ / src/dev/                    开发工具及 Vite 插件
tests/ / src/**/*.test.*           legacy 行为测试与 TS / React 测试
scripts/ / .github/workflows/      检查、构建、运行与 CI
docs/ / docs/adr/                  规范、运行说明与架构决策
```

React + legacy、JS + TS 和两套构建是[渐进迁移决策](docs/adr/0001-application-runtime-and-migration.md)，不是本轮要整体替换的残留。旧工作区可能保存 Git 外的环境文件和素材，清理规则见开发工作流。
