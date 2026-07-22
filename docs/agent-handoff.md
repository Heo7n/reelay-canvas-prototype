# Reelay 当前交接

本文只保留下一位开发者真正需要的当前状态。产品细节、规划和工程规则分别以 `current-product-spec.md`、`product-expansion-plan.md`、`engineering-guardrails.md` 与 ADR 为准；阅读路径见 `development-workflow.md`。

## 当前定位

- 用户可见主链路仍是 `login.html` → `home.html` → `index.html` 的高保真静态原型。
- 静态原型没有真实账号、持久化、共享项目、真实生成 API 或生产部署。
- 隔离的 React + TypeScript + Vite 应用壳已经建立，包含 browser route contract、首批领域对象 / repository ports、Vitest 和版本化 `LegacyCanvasHost`；它还没有接管现有三页。
- 组织演示的硬需求是：两个独立浏览器账号能读取同一组织的共享项目数据。浏览器内存和 IndexedDB 都不能满足该需求。
- 当前画布已实现生成节点首次成功后的图片 / 视频类型锁；入口使用统一模型选择图标，选择器内部仍保留具体模型图标。

## 下一开发切片

建立最小共享服务纵切：

1. 服务端应用工厂和开发启动入口。
2. 两个演示账号的服务端会话；明确标注为演示鉴权。
3. Workspace、Membership、Project 的共享 repository adapter。
4. 会话、工作区和项目元数据 API。
5. 使用两个独立 cookie jar 的集成测试，证明账号 A 的项目写入可被同组织账号 B 读取。

首个切片允许使用服务端进程内存储来验证共享协议，但不得描述为持久化；下一切片再替换为 PostgreSQL adapter。暂不加入邀请、外部分享、实时光标、复杂权限、真实密码生命周期和公开部署。

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
