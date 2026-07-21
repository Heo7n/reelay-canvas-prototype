# Reelay 前端原型接力清单

本文只保留接手开发需要执行的事项。产品细节以 `docs/current-product-spec.md` 为准，工程边界以 `docs/engineering-guardrails.md` 为准。

## 1. 当前定位

- 这是静态高保真前端原型，不是生产应用。
- 无后端、无真实账号、无真实模型 API、无项目持久化和部署链路；login / home / canvas 目前仍通过三个静态入口串联，不是正式 router。
- Phase 0B 已建立隔离的 React + TypeScript + Vite 应用壳、browser route contract、Vitest 和 legacy canvas host；它尚未接管现有三页。旧原型检查与新壳类型 / 单元检查的统一入口仍是 `npm run check`。
- `prototype-shell-baseline-2026-07-14` 是历史原型壳层标签，不代表最新已验证工作区。
- 接手时用 `git branch --show-current` 和 `git status --short` 确认实际分支与未提交改动，不依赖文档中的静态分支名。

## 2. 接手前必读

按顺序阅读：

1. `AGENTS.md`
2. `docs/current-product-spec.md`
3. `docs/engineering-guardrails.md`
4. 本文

涉及新页面、路由、持久化、资产归属、生成任务、积分或跨项目 Agent 时，还必须读 `docs/product-expansion-plan.md`。

进入正式应用壳、runtime、router、Workspace / Membership 或 legacy canvas 迁移时，还必须读 `docs/adr/0001-application-runtime-and-migration.md`。

## 3. 运行方式

```powershell
python -m http.server 5174 --bind 127.0.0.1
```

访问：

```text
http://127.0.0.1:5174/login.html
http://127.0.0.1:5174/home.html
http://127.0.0.1:5174/
```

## 4. 文件职责

| 位置 | 职责 |
| --- | --- |
| `index.html` | 静态页面骨架与脚本加载顺序 |
| `login.html` | 账户密码流程样机；只验证静态进入路径，不提供真实鉴权 |
| `home.html` | 登录后主页与项目库页面状态的静态入口 |
| `app.js` | 当前画布、节点、资产库、Agent 的主要交互逻辑 |
| `styles.css` | 样式入口，保持轻量 |
| `styles/app.css` | 当前原型完整样式，后续再按区域拆分 |
| `styles/login.css` / `src/login/index.js` | 登录样机独立视觉与交互；不得写入 Token 或持久登录状态 |
| `styles/home.css` | 主页独立视觉与响应式样式 |
| `src/home/index.js` / `src/config/home-prototype-config.js` | 主页、项目库页面状态交互与 mock 数据；项目库界面使用“个人 / 协作项目”，最近项目从全部项目数据按近期混排派生，协作卡显示多人标识 |
| `data/model-catalog.js` | 图片/视频模型目录与参数能力 |
| `src/config/prototype-config.js` | 模拟媒体、布局常量、工具栏与示例会话等静态原型配置 |
| `package.json` / `scripts/` / `tests/` | 旧原型静态契约、新应用壳类型 / 单元检查与统一验证入口 |
| `app-shell.html` / `vite.shell.config.ts` / `tsconfig.shell.json` | Phase 0B 隔离应用壳入口、构建和严格类型检查 |
| `src/app/` / `src/pages/` / `src/domain/` / `src/application/` | 正式路由壳、迁移页面、领域对象与 repository ports |
| `src/legacy-canvas/` | 带版本校验的旧画布宿主与消息协议；不得复制权限和 repository 逻辑 |
| `docs/current-product-spec.md` | 已实现产品行为 |
| `docs/product-expansion-plan.md` | 未实现页面规划 |
| `docs/engineering-guardrails.md` | 下一阶段工程边界 |
| `docs/adr/0001-application-runtime-and-migration.md` | Phase 0B 暂定 runtime、路由、领域边界和 legacy canvas 迁移决策 |

## 5. 改动边界

- 不要继续把新页面、资产中心、任务中心、工作台写进 `app.js`。
- 不要把新页面大块样式写进 `styles/app.css`。
- 主页项目卡仍是 mock，当前统一进入同一个内存画布；三点菜单和快捷编辑笔允许在当前页面生命周期内演示重命名，但刷新即重置，其他数据操作只给出未接入提示。不要把这些交互描述为项目持久化已经实现。
- 模型与参数能力只改 `data/model-catalog.js`。
- 生成节点首次成功后以独立 `lockedMode` 固定为图片或视频；同类型模型可继续切换，跨类型必须新建节点。不要从当前预览是否存在推断锁，也不要让参数撤销越过成功生成边界。
- 模拟配置优先放进 `src/config/prototype-config.js`。
- 已实现行为变化必须同步 `docs/current-product-spec.md`。
- 未实现规划只写进 `docs/product-expansion-plan.md`，不要写成已完成。
- 清理旧代码和新增大功能尽量分开提交。

## 6. 最低验证

每个分支完成前至少检查：

- `npm run check`
- `git diff --check`
- 浅色和深色模式各看一次。
- 浏览器控制台无错误。
- 在当前内存模拟账户阶段，页面刷新后积分回到 `3000 / 0`；接入 `CreditLedger` 后改查余额/账本一致、扣费幂等和退款幂等。
- 登录页的可提交主流程只验证账户密码与页面路径；忘记密码、Google 登录、协议和注册入口目前只显示会自动消失的未接入提示。不要把默认演示账号、前端判断或浏览器存储扩写成真实鉴权。
- 全部项目目前是共享顶部栏下通过 hash 即时切换的常规页面状态；项目卡仍进入同一画布，不得添加假 `projectId` 或描述为已加载真实项目。
- 功能区滚轮不带动画布。
- 未填写提示词时生成按钮不可用。
- 切换画布后生成结果仍回到发起任务的节点。
- 空节点可在图片 / 视频模型间切换；首次成功后另一类型不可选，同类型模型仍可切换，Ctrl+Z 不会恢复到成功前的另一类型或清除结果锁。
- 撤销历史不跨画布 / 项目，项目资产不泄漏到新项目。

涉及画布交互时额外验证：

- 中键和空格平移。
- 空白框选。
- 多选移动。
- 节点/组删除与撤销。
- 资产库展开、收起、调宽。

## 7. 分支建议

- 基础重构：`codex/foundation-frontend-modularization`
- 画布模块拆分：`refactor/canvas-modules`
- 项目首页：`feature/project-home`
- 资产中心：`feature/asset-center`
- 生成任务：`feature/generation-jobs`

多人协作时，不要让两个分支同时大范围改 `app.js` 和 `styles/app.css`。
