# Reelay 当前交接

本文只保留下一位开发者真正需要的当前状态。产品细节、规划和工程规则分别以 `current-product-spec.md`、`product-expansion-plan.md`、`engineering-guardrails.md` 与 ADR 为准；阅读路径见 `development-workflow.md`。

## 当前定位

- 用户可见主链路仍是 `login.html` → `home.html` → `index.html` 的高保真静态原型。
- 静态原型没有真实账号、持久化、共享项目、真实生成 API 或生产部署。
- 隔离的 React + TypeScript + Vite 应用壳已经建立，包含 browser route contract、首批领域对象 / repository ports、Vitest 和版本化 `LegacyCanvasHost`；它还没有接管现有三页。
- 最小共享服务已经建立：两个独立的演示账号使用 HttpOnly 服务端会话，可读写同一组织项目；集成测试使用两个独立 cookie 验证双向可见。当前 repository 位于服务端进程内，重启即丢失，不是持久化。
- 当前画布已实现生成节点首次成功后的图片 / 视频类型锁；入口使用统一模型选择图标，选择器内部仍保留具体模型图标。

## 下一开发切片

为新壳实现 HTTP gateway / repository adapter，再迁移登录、主页和全部项目，让它们直接消费当前共享 API。页面主链路稳定后，把 server-memory adapter 替换为 PostgreSQL，并加入 schema 迁移。

暂不加入邀请、外部分享、实时光标、复杂权限、真实密码生命周期和公开部署。

## 开始与验证

```powershell
git branch --show-current
git status --short
npm ci
npm run check
```

- 已安装依赖时不必重复执行 `npm ci`。
- 开发中的定向检查与文档选读按 `docs/development-workflow.md` 执行。
- 用户可见行为变化才更新 `current-product-spec.md`；未实现规划不要写成完成状态。

## 关键边界

- 不再向 `app.js` 增加新页面或账户 / repository 逻辑。
- 模型条目和参数能力只进入 `data/model-catalog.js`。
- React、HTTP DTO、数据库 schema 和领域对象是不同边界，不应互相直接替代。
- `LegacyCanvasHost` 只承载上下文、导航和迁移桥接，不复制权限、计费或 repository。
- 清理旧代码与新增大功能分开提交；每个提交保持可运行、可回退。
