# Vercel + Supabase 公网预览

当前公网预览使用 Vercel Hobby 承载同源 Fastify 应用，使用 Supabase Free
PostgreSQL 保存会话、组织、项目、联系资料和画布文档。

公开地址：<https://reelay-canvas-prototype.vercel.app>

当前 Supabase 项目已完成 `0001` 至 `0009` 迁移和固定 demo seed。部署验收已覆盖
健康检查、固定账号登录、组织项目读取，以及画布文档写入和回读。

## 部署边界

- `api/index.ts` 是 Vercel 的无状态 API 入口；`src/server/start.ts`
  只服务本地常驻进程。两者复用同一个 `buildServer` 和 PostgreSQL store。
- `npm run build` 生成 React 应用壳并复制迁移期旧画布到 `dist/shell`。
- Vercel CDN 直接提供 `dist/shell` 静态产物，`/api/*` 交给同一个 Fastify
  Function；前端与 API 仍然同源，不增加第二套鉴权。
- 浏览器中不包含数据库连接串、Supabase service key 或 demo seed 开关。
- migration 与 demo seed 是一次性人工初始化步骤，不在构建、冷启动或请求中执行。

## 数据库连接

Vercel 的 `DATABASE_URL` 使用 Supavisor transaction mode（端口 `6543`）。
迁移和 seed 使用单独的 `MIGRATION_DATABASE_URL`，优先 direct connection；网络不支持
IPv6 时使用 Supavisor session mode（端口 `5432`）。

运行时连接池默认每个 Function 实例最多两个连接，并通过 `attachDatabasePool`
在 Fluid Compute 挂起前释放空闲连接。服务端使用仓库内固定的 Supabase 官方
Root 2021 CA 校验 TLS，不在运行时关闭证书验证。

## 新环境初始化

1. 在空 Supabase 项目执行 `src/server/db/migrations` 中的迁移。
2. 临时设置 `REELAY_DEPLOYMENT_MODE=preview` 与 `ALLOW_DEMO_SEED=true`。
3. 运行一次 `npm run db:seed`，随后删除 seed 开关。
4. 在 Vercel 的 Preview 与 Production 环境设置 `DATABASE_URL`。
5. 部署后检查 `/api/health`、登录、项目读写与画布自动保存。

固定演示账号与密码见 `docs/agent-handoff.md`。免费层可能在长期无活动后暂停，
因此该地址只作为前端原型评审环境，不承诺正式生产可用性。
