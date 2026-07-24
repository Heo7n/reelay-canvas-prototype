# Render 预览部署

本配置用于产品原型的公开评审，不是正式生产环境。它在一个 Render Web Service 中同时提供 React 应用壳、旧画布静态文件和 `/api`，并连接独立的 Render PostgreSQL。

## 创建服务

1. 将当前分支推送到 GitHub。
2. 在 Render 选择 **New > Blueprint**，连接仓库并选择根目录下的 `render.yaml`。
3. 确认将创建 `reelay-canvas-preview` 和 `reelay-preview-db`，然后应用 Blueprint。
4. 部署完成后访问服务域名；根路径会跳转到 `/app/login`，健康检查位于 `/api/health`。

Render 每次启动会顺序执行数据库迁移和幂等演示数据初始化。演示账号仅在
`NODE_ENV=production`、`REELAY_DEPLOYMENT_MODE=preview` 和
`ALLOW_DEMO_SEED=true` 同时成立时允许写入。

## 本地生产模式验收

不连接 PostgreSQL 时，可用内存存储验证最终静态产物：

```powershell
npm run build:preview
$env:NODE_ENV="production"
$env:REELAY_STORAGE="memory"
$env:PORT="5180"
npm run start:server
```

随后检查 `/api/health`、`/app/login` 和 `/index.html`。完成后清理上述临时环境变量。

## 预览边界

- 公开地址只放演示数据，不上传敏感素材。
- 固定演示账号与密码不构成正式认证系统。
- 免费服务可能休眠，首次访问会有冷启动等待。
- 免费 PostgreSQL 的保留期和备份能力有限，不作为唯一数据副本。
