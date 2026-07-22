# Reelay 当前交接

本文只保留下一位开发者真正需要的当前状态。产品细节、规划和工程规则分别以 `current-product-spec.md`、`product-expansion-plan.md`、`engineering-guardrails.md` 与 ADR 为准；阅读路径见 `development-workflow.md`。

## 当前定位

- 当前本地主链路是 `/app/login` → `/app/w/:workspaceId` → `/app/w/:workspaceId/projects` → 受保护的 legacy canvas host。`login.html` 与 `home.html` 只保留作视觉回归参考，新功能不得再进入静态页面逻辑。
- React 页面通过 `src/infrastructure/http` adapters 消费共享 API；Zod 在传输边界校验 DTO，页面不直接依赖 server-memory store。
- 两个固定演示账号使用 HttpOnly 服务端会话，可读写同一组织项目且个人空间隔离；Session、Workspace、Membership 与 Project 已切换到 PostgreSQL，migration / seed 可重复，集成测试覆盖跨服务重启持久化。浏览器 token 只以摘要存库并具有过期 / 撤销状态，但固定账号与 demo 密码散列仍不是生产鉴权。
- `LegacyCanvasHost` 已受路由权限保护并发送版本化 `host:init`，但旧 `index.html` 尚未消费上下文，也不会按 project id 加载或保存画布内容。
- 开发服务器必须让 `/app/*` 回退到 `app-shell.html`，同时保留 `/index.html` 给旧画布 iframe；不要重新引入会吞掉 Vite 内部脚本或旧画布入口的宽泛回退。
- 当前画布已实现生成节点首次成功后的图片 / 视频类型锁；入口使用统一模型选择图标，选择器内部仍保留具体模型图标。

## 下一开发切片

下一切片让旧画布消费 `host:init`，通过明确的 `CanvasDocument` API 加载 / 保存项目画布；CanvasDocument 使用独立 migration 和 repository，不把 `app.js` 内存状态直接序列化成数据库领域对象。完成真实路由画布持久化后，再删除重复的静态登录与主页入口。

暂不加入邀请、外部分享、实时光标、复杂权限、真实密码生命周期和公开部署。

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
