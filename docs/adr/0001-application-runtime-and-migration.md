# ADR 0001：应用运行时与渐进迁移边界

- 状态：部分决定。React / TypeScript / Vite 壳、显式 Workspace 路由、legacy host、Fastify 模块化单体与 PostgreSQL adapter 为 `DECIDED`；项目归属与访问控制已由 ADR 0002 更新，正式账号标识仍为 `PROPOSED`
- 日期：2026-07-21
- 适用阶段：Phase 0B 可迁移基础

本文保留 2026-07-21 的决策背景与原有迁移顺序，并记录后续决定；它不是当前完成状态清单，也不要求重新执行已完成的迁移。当前实现见[实现规范](../current-product-spec.md)，下一产品切片以[滚动路线](../product-expansion-plan.md#81-当前滚动路线2026-09-05)为准。

## 背景

决策起草时，Reelay 已有登录样机、登录后主页、项目库页面状态和一套交互密集的无限画布，但仍使用静态入口。画布依赖全局 DOM、全局状态和大体量单文件，当时不适合直接组件化重写；账号、Workspace、Project、Membership 和持久化也不能继续叠加在静态脚本中。登录、主页和项目库现已迁入 React 路由，静态双轨已删除，画布继续通过 legacy host 接入。

本决策的目标不是一次完成生产架构，而是让新工作台逐步接管页面，同时让现有画布保持可运行、可验证和可回退。

## 暂定决策

### 前端运行时

- React + TypeScript 严格模式。
- Vite 负责开发和生产构建。
- React Router 使用浏览器历史路由，不再扩写 `#all-projects` 一类 hash 路由。
- npm 继续作为包管理器，当前没有更换 pnpm 或建立 monorepo 的收益。
- 新工作台样式使用 CSS Modules 和共享设计变量；现有 `styles/app.css` 作为 legacy canvas 样式隔离保留，不迁入 Tailwind。
- Zod 用于 URL、消息桥和 API 等运行时边界，不让领域对象依赖表单或网络结构；当前 HTTP adapters 已执行 DTO 校验。
- 原方案为本地草稿和 Blob 预留 Dexie / IndexedDB；该离线草稿层尚未实现，不代表当前资产存储。已有个人媒体二进制由服务端 filesystem ObjectStore 持久保存；`localStorage` 保存主题等设备偏好。
- 新代码使用 Vitest 和 Testing Library；后续若实现 IndexedDB 草稿层，再引入相应测试适配。现有 `node:test` 契约测试继续保留，直到被等价行为测试覆盖。
- 端到端主链路稳定后再引入 Playwright，不在第一批脚手架中制造空测试。
- 构建后图标使用 `lucide-react`；旧静态画布在迁移完成前使用 `app.js` 内的最小图标路径子集，不加载外部 CDN 或完整 vendor runtime。

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

首期由唯一 organization Workspace 提供稳定路由 scope；具体项目权限来自 ProjectMembership，不从 `workspace.kind`、组织 Membership 或前端标签推断。详见 ADR 0002。

### 领域与应用边界

第一批必须建立的接口：

- `SessionGateway`
- `WorkspaceRepository`
- `MembershipRepository`
- `ProjectRepository`
- `CanvasDocumentRepository`

`Asset`、`GenerationTask`、`GenerationResult` 和 `CreditLedger` 先定义不变量和标识关系；在真实生成接入前再确定完整 repository 方法和事务边界。禁止建立一个对所有对象通用的 CRUD repository。

`GenerationNode` 在创建时持有非空且不可变的 `mediaKind`；`GenerationTask` 持有 actor / workspace / project / canvas / node scope 以及不可变的参数和计价快照；`GenerationResult` 是任务输出且默认不是 `Asset`；`Asset` 由 Workspace 所有，Project / Node 只通过 `AssetReference` 使用；`CreditLedger` 是 append-only 事实源，预占、结算、释放 / 退款按 task id 与 operation key 幂等。上述对象不得折叠进通用 CRUD repository 或 CanvasDocument 运行态。

领域层不得依赖 React、DOM、IndexedDB、HTTP 或具体数据库。

### 旧画布迁移

第一阶段把现有画布视为 `LegacyCanvasHost`，不整体重写。由于它目前依赖全局 DOM 和样式，允许通过同源隔离页面暂时接入新路由，但必须使用带版本号、经过 schema 校验的桥协议传递：

- `workspaceId`
- `projectId`
- `canvasId`
- `projectName`
- 主题
- 项目可写状态
- CanvasDocument 加载 / 保存消息与 revision
- 导航意图
- dirty 状态

桥接层只负责上下文、导航和迁移期间的文档消息转发；repository、会话和服务端授权仍留在 host / application 边界，计费不进入桥协议。同源 origin 与 source 校验之外，每次 iframe 页面实例还必须携带唯一 instance id，route scope 或实例已经变化的异步响应不得回写当前画布。旧画布只产生带 schemaVersion 的 allow-list 快照，不把全量运行内存当成领域对象。后续按数据与交互边界逐步替换画布内部模块，不按文件长度机械拆组件。

画布内容迁移采用渐进式 CanvasCommand：命令核心无 DOM，只处理 CanvasRecord 的显式集合变更、before conflict、归一化、transition validation 和逆命令；UI selection、短暂高亮、render 与保存属于提交后 effect。连接的单条创建、批量创建和删除已接入；节点离散参数 / 生成媒体命名、建组 / 解组 / 成员结算和已有局部布局继续通过字段级契约迁移，兼容现有 legacy undo 栈。字段提交保留运行时对象身份，组成员关系在同一事务中验证；全节点 record 不允许进入命令。高频 pointer preview 和旧移动撤销仍在 session/adapter，节点结构与素材引用命令尚未统一，不能把整个 `app.js` 换一种封装后称为完成。

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

以下为原有迁移依赖与历史分期；当前已完成与未完成范围以实现规范和滚动路线为准。产品预演版的任务与积分行为可以模拟，不因本列表要求接入真实生成或结算服务。

1. 固化当前原型为可运行 Git 基线。
2. 加入 TypeScript、Vite、React Router 和新的检查流程，不改变产品行为。
3. 建立最小共享服务端、服务端会话和 Session / Workspace / Membership / Project repository adapter，先用可替换的服务端内存存储验证两个浏览器能看到同一组织项目；此状态只用于开发，不描述为持久化。
4. 迁移登录、主页和全部项目，让新页面直接消费共享服务契约，静态入口逐步退出。
5. 用 PostgreSQL adapter 替换服务端内存存储，建立 schema 版本和迁移；IndexedDB 只保存本地草稿、缓存和离线恢复。
6. 通过带真实标识的画布路由接入 `LegacyCanvasHost`。
7. 让画布通过 application service 加载和保存，不再直接承担项目级全局状态。
8. 再实现节点生成历史、真实任务和积分账本。
9. 将演示用账户校验升级为正式密码策略与账户生命周期；服务端会话不得等到此时才建立。

每一步必须是独立、可运行、可回退的提交。

## 后端暂定边界

工程壳第一阶段不需要域名或正式服务器凭据。用户已确认两个浏览器需要同时看到同一组织数据，因此仅靠 IndexedDB 或同浏览器内存 mock 不满足演示范围；Phase 0B 必须增加最小共享后端、服务端会话和共享数据存储。IndexedDB 只负责本地草稿、缓存和离线恢复，不能被描述为跨账号协作。

`DECIDED`：共享数据源必须位于浏览器进程之外，并通过服务端会话识别 actor；不得用 localStorage 或 IndexedDB 冒充组织协作。

`DECIDED`：当前使用 TypeScript Fastify 模块化单体和 PostgreSQL adapter，通过同源会话和 API 服务前端。Session、Workspace、Membership 与 Project 已通过 migration / seed 流程持久化，并完成双浏览器与跨服务重启验证；服务端内存 adapter 只保留作快速契约测试和显式开发回退，不允许数据库故障时自动降级。产品评审已有 Vercel + Supabase 公网预览，边界见[公网预览说明](../vercel-supabase-preview.md)；正式产品的部署环境、域名和云厂商仍待后续决定。

首版数据库将可登录的人类主体存为 `users`，请求上下文继续使用领域名 `SessionActor`；登录标识使用可多条扩展的 identity 记录，不把当前邮箱外观的 `.test` 账号固化为正式邮箱策略。浏览器会话 token 只以摘要存库并具有过期 / 撤销状态。组织角色为 `owner/admin/member`，项目角色为 `admin/edit/view`；二者不得互相推断。

## 待用户确认

已确认：多账号组织演示需要两个浏览器同时看到共享数据，因此最小后端从 Phase 0C 提前进入 Phase 0B。

以下答案仍会影响后续账号和部署范围，但不阻塞当前壳层与共享数据边界开发：

1. 手机号 / 邮箱注册与邀请码的具体流程：邀请码的用途、是否必填，登录方式、验证码及账号关联规则。能力方向已于 2026-09-05 确认，详细规则尚未定稿。
2. 未来主要部署在公网云服务还是企业内网；具体云厂商和域名可以以后再定。

当前已实现的演示仍采用“账户 + 密码”、固定账号、单组织 Membership 和项目 `admin/edit/view` 角色，不将其固化为正式账号策略。2026-09-05 用户确认后续需支持手机号 / 邮箱注册与邀请码；相关前端流程可在规则确认后模拟，暂不接入真实短信或邮件服务。首页与登录页的视觉草稿不代表这些流程已经确定；本切片不新增外部分享、实时光标或具体云厂商绑定。

## 重新评审条件

出现以下任一条件时必须重新评审本 ADR：

- 需要两个设备实时看到组织数据，而仍没有后端。
- 公开营销站要求与应用共用 SSR 运行时。
- 企业内网环境禁止 SPA history fallback 或 IndexedDB。
- 团队已有必须复用的后端语言、身份平台或数据库。
- 现有画布的同源隔离方案导致输入、媒体或性能不可接受。
