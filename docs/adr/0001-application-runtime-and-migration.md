# ADR 0001：应用运行时与渐进迁移边界

- 状态：暂定采用；跨浏览器组织演示范围已确认，其余账号与部署细节后续确认
- 日期：2026-07-21
- 适用阶段：Phase 0B 可迁移基础

## 背景

Reelay 已有登录样机、登录后主页、项目库页面状态和一套交互密集的无限画布，但三者仍是静态入口。画布依赖全局 DOM、全局状态和大体量单文件，当前不适合直接组件化重写；账号、Workspace、Project、Membership 和持久化也不能继续叠加在静态脚本中。

本决策的目标不是一次完成生产架构，而是让新工作台逐步接管页面，同时让现有画布保持可运行、可验证和可回退。

## 暂定决策

### 前端运行时

- React + TypeScript 严格模式。
- Vite 负责开发和生产构建。
- React Router 使用浏览器历史路由，不再扩写 `#all-projects` 一类 hash 路由。
- npm 继续作为包管理器，当前没有更换 pnpm 或建立 monorepo 的收益。
- 新工作台样式使用 CSS Modules 和共享设计变量；现有 `styles/app.css` 作为 legacy canvas 样式隔离保留，不迁入 Tailwind。
- Zod 只用于 URL、IndexedDB、消息桥和未来 API 等运行时边界，不让领域对象依赖表单或网络结构。
- 本地草稿和 Blob 使用 Dexie / IndexedDB；`localStorage` 继续只保存主题等设备偏好。
- 新代码使用 Vitest、Testing Library 和 `fake-indexeddb`；现有 `node:test` 契约测试继续保留，直到被等价行为测试覆盖。
- 端到端主链路稳定后再引入 Playwright，不在第一批脚手架中制造空测试。
- 构建后图标使用 `lucide-react`；旧静态入口在迁移完成前继续使用本地固定 Lucide 运行时。

当前不采用 Next.js、SSR、Redux、微前端、Turborepo 或完整 UI 组件库。核心产品是浏览器重交互工作台和画布，当前没有必须用 SSR 解决的 SEO 或服务端渲染需求；国内自托管也更适合同源 SPA 与独立 API 边界。

### 路由契约

Workspace 必须进入 URL，不能只依赖全局 `activeWorkspace`：

```text
/login
/w/:workspaceId
/w/:workspaceId/projects
/w/:workspaceId/projects/:projectId/canvases/:canvasId
/w/:workspaceId/assets
/w/:workspaceId/generations
/w/:workspaceId/members
/settings
```

个人空间和组织空间共用 Workspace 路由；权限来自 Membership，不从 `workspace.kind` 推断。

### 领域与应用边界

第一批必须建立的接口：

- `SessionGateway`
- `WorkspaceRepository`
- `MembershipRepository`
- `ProjectRepository`
- `CanvasDocumentRepository`

`Asset`、`GenerationTask`、`GenerationResult` 和 `CreditLedger` 先定义不变量和标识关系；在真实生成接入前再确定完整 repository 方法和事务边界。禁止建立一个对所有对象通用的 CRUD repository。

领域层不得依赖 React、DOM、IndexedDB、HTTP 或具体数据库。

### 旧画布迁移

第一阶段把现有画布视为 `LegacyCanvasHost`，不整体重写。由于它目前依赖全局 DOM 和样式，允许通过同源隔离页面暂时接入新路由，但必须使用带版本号、经过 schema 校验的桥协议传递：

- `workspaceId`
- `projectId`
- `canvasId`
- 主题
- 会话摘要
- 导航意图
- dirty 状态

桥接层只负责上下文和导航，不复制 repository、权限或计费逻辑。后续按数据与交互边界逐步替换画布内部模块，不按文件长度机械拆组件。

## 建议目录

```text
src/
  app/
    main.tsx
    router.tsx
    AppProviders.tsx
  pages/
    login/
    home/
    projects/
    canvas/
  domain/
    identity/
    workspace/
    project/
    canvas/
    asset/
    generation/
    credits/
  application/
    session/
    workspaces/
    projects/
    canvases/
  infrastructure/
    db/
    repositories/
      memory/
      indexeddb/
      http/
  shared/
    ui/
    styles/
    config/
    errors/
  legacy-canvas/
    CanvasHost.tsx
    bridge-protocol.ts
```

## 迁移顺序

1. 固化当前原型为可运行 Git 基线。
2. 加入 TypeScript、Vite、React Router 和新的检查流程，不改变产品行为。
3. 先迁移登录、主页和全部项目，让静态入口逐步退出。
4. 建立内存版 Session、Workspace、Membership 和 Project repository，验证多个演示账号看到同一组织项目。
5. 引入 IndexedDB schema、版本迁移和项目 / 画布保存。
6. 通过带真实标识的画布路由接入 `LegacyCanvasHost`。
7. 让画布通过 application service 加载和保存，不再直接承担项目级全局状态。
8. 再实现节点生成历史、真实任务和积分账本。
9. 最后接真实账户密码服务、服务端会话和数据库。

每一步必须是独立、可运行、可回退的提交。

## 后端暂定边界

工程壳第一阶段不需要域名或正式服务器凭据。用户已确认两个浏览器需要同时看到同一组织数据，因此仅靠 IndexedDB 或同浏览器内存 mock 不满足演示范围；Phase 0B 必须增加最小共享后端、服务端会话和共享数据存储。IndexedDB 只负责本地草稿、缓存和离线恢复，不能被描述为跨账号协作。

如果团队没有既定后端约束，暂按 TypeScript Fastify + PostgreSQL 的模块化单体设计，通过同源会话和 API 服务前端；开发阶段可先使用本机服务与开发数据库，公网部署、域名和云厂商后续再定。

## 待用户确认

已确认：多账号组织演示需要两个浏览器同时看到共享数据，因此最小后端从 Phase 0C 提前进入 Phase 0B。

以下答案仍会影响后续账号和部署范围，但不阻塞当前壳层与共享数据边界开发：

1. 首期账号标识优先使用用户名、邮箱还是手机号。
2. 演示权限是否先采用“组织所有者 / 编辑者”两级。
3. 未来主要部署在公网云服务还是企业内网；具体云厂商和域名可以以后再定。

在这些答案确定前，默认按“用户名 + 密码、所有者 / 编辑者、公网云但供应商未定”推进可逆实现，不加入短信、外部分享或实时光标。

## 重新评审条件

出现以下任一条件时必须重新评审本 ADR：

- 需要两个设备实时看到组织数据，而仍没有后端。
- 公开营销站要求与应用共用 SSR 运行时。
- 企业内网环境禁止 SPA history fallback 或 IndexedDB。
- 团队已有必须复用的后端语言、身份平台或数据库。
- 现有画布的同源隔离方案导致输入、媒体或性能不可接受。
