# Reelay 当前交接

本文只保留下一位开发者真正需要的当前状态。产品细节、规划和工程规则分别以 `current-product-spec.md`、`product-expansion-plan.md`、`engineering-guardrails.md` 与 ADR 为准；阅读路径见 `development-workflow.md`。

## 当前定位

- 当前本地主链路是 `/app/login` → `/app/w/:workspaceId` → `/app/w/:workspaceId/projects` → 受保护的 legacy canvas host。`login.html` 与 `home.html` 只保留作视觉回归参考，新功能不得再进入静态页面逻辑。
- React 页面通过 `src/infrastructure/http` adapters 消费共享 API；Zod 在传输边界校验 DTO，页面不直接依赖 server-memory store。
- 五个固定演示账号使用 HttpOnly 服务端会话并属于唯一的 `Reelay 创作组`。个人 / 协作是 Project 的 `accessKind`，不是两类 Workspace；项目读取和修改由服务端 ProjectMembership 的 `admin/edit/view` 过滤。Session、Workspace、Membership、Project 与 ProjectMembership 已切换到 PostgreSQL，migration / seed 可重复，集成测试覆盖跨服务重启持久化。浏览器 token 只以摘要存库并具有过期 / 撤销状态，但固定账号与 demo 密码散列仍不是生产鉴权。
- `LegacyCanvasHost` 已受路由权限保护；旧 `index.html` 消费版本化上下文和 CanvasDocument 消息，按 `projectId + canvasId` 加载 / 自动保存。PostgreSQL 使用 revision 乐观并发，`admin/edit` 可写、`view` 只读，非成员不可见。
- 开发服务器必须让 `/app/*` 回退到 `app-shell.html`，同时保留 `/index.html` 给旧画布 iframe；不要重新引入会吞掉 Vite 内部脚本或旧画布入口的宽泛回退。
- 当前画布已实现生成节点首次成功后的图片 / 视频类型锁；入口使用统一模型选择图标，选择器内部仍保留具体模型图标。

## 下一开发切片

下一切片优先定义积分前端模拟所需的产品口径和最小领域不变量，再决定是否实现账本。至少需要确认：组织月度额度与结转规则、一次生成的预占 / 扣减 / 失败退款、成员与项目的统计维度、管理员可见范围，以及要演示的月份和异常场景。没有这些口径前，不把当前 `3000 / 0` mock 扩成伪账本。

CanvasDocument 当前是迁移桥：一个路由 `main` 文档内保存旧画布的多画布 bundle，只包含节点、组、视口和模型参数；它不保存素材 Blob、撤销栈、生成任务、Agent 对话、账号或积分。后续生成历史与 AssetReference 应建立独立实体，不继续向该 bundle 塞运行态。

暂不加入邀请、外部分享、实时光标、复杂权限、真实密码生命周期和公开部署。

固定演示账号统一使用密码 `reelay-demo`：

- `tianmaochao@reelay.test`（天猫超）
- `linjing@reelay.test`（林静）
- `chenxi@reelay.test`（陈曦）
- `zhouyu@reelay.test`（周予）
- `suhe@reelay.test`（苏禾）

这些稳定账号可用于后续组织积分月度模拟，但当前还没有 `CreditLedger`，不要把账户面板的 `3000 / 0` 当成持久余额。

## 开始与验证

```powershell
git branch --show-current
git status --short
npm ci
npm run db:up
npm run db:migrate
npm run check
```

空库首次需要显式设置 `ALLOW_DEMO_SEED=true` 后运行 `npm run db:seed`；服务启动不会自动 migration 或 seed，也不会在 PostgreSQL 故障时回退到内存。

- 已安装依赖时不必重复执行 `npm ci`。
- 开发中的定向检查与文档选读按 `docs/development-workflow.md` 执行。
- 用户可见行为变化才更新 `current-product-spec.md`；未实现规划不要写成完成状态。

## 关键边界

- 不再向 `app.js` 增加新页面或账户 / repository 逻辑。
- 模型条目和参数能力只进入 `data/model-catalog.js`。
- React、HTTP DTO、数据库 schema 和领域对象是不同边界，不应互相直接替代。
- `LegacyCanvasHost` 只承载上下文、导航和迁移桥接，不复制权限、计费或 repository。
- 清理旧代码与新增大功能分开提交；每个提交保持可运行、可回退。
