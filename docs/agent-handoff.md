# Reelay 前端原型接力清单

本文只保留接手开发需要执行的事项。产品细节以 `docs/current-product-spec.md` 为准，工程边界以 `docs/engineering-guardrails.md` 为准。

## 1. 当前定位

- 这是静态高保真前端原型，不是生产应用。
- 无后端、无真实账号、无真实模型 API、无项目持久化，也尚无 bundler、生产构建和部署链路。
- 已有零依赖的 Node 检查与契约测试基线，统一入口为 `npm run check`。
- `prototype-shell-baseline-2026-07-14` 是历史原型壳层标签，不代表最新已验证工作区。
- 接手时用 `git branch --show-current` 和 `git status --short` 确认实际分支与未提交改动，不依赖文档中的静态分支名。

## 2. 接手前必读

按顺序阅读：

1. `AGENTS.md`
2. `docs/current-product-spec.md`
3. `docs/engineering-guardrails.md`
4. 本文

涉及新页面、路由、持久化、资产归属、生成任务、积分或跨项目 Agent 时，还必须读 `docs/product-expansion-plan.md`。

## 3. 运行方式

```powershell
python -m http.server 5174 --bind 127.0.0.1
```

访问：

```text
http://127.0.0.1:5174/
```

## 4. 文件职责

| 位置 | 职责 |
| --- | --- |
| `index.html` | 静态页面骨架与脚本加载顺序 |
| `app.js` | 当前画布、节点、资产库、Agent 的主要交互逻辑 |
| `styles.css` | 样式入口，保持轻量 |
| `styles/app.css` | 当前原型完整样式，后续再按区域拆分 |
| `data/model-catalog.js` | 图片/视频模型目录与参数能力 |
| `src/config/prototype-config.js` | 模拟媒体、布局常量、工具栏与示例会话等静态原型配置 |
| `package.json` / `scripts/` / `tests/` | 零依赖检查入口、静态契约与回归测试 |
| `docs/current-product-spec.md` | 已实现产品行为 |
| `docs/product-expansion-plan.md` | 未实现页面规划 |
| `docs/engineering-guardrails.md` | 下一阶段工程边界 |

## 5. 改动边界

- 不要继续把新页面、资产中心、任务中心、工作台写进 `app.js`。
- 不要把新页面大块样式写进 `styles/app.css`。
- 模型与参数能力只改 `data/model-catalog.js`。
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
- 功能区滚轮不带动画布。
- 未填写提示词时生成按钮不可用。
- 切换画布后生成结果仍回到发起任务的节点。
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
