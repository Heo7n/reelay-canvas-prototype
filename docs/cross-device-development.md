# 两台 Windows 电脑接续开发

本机已完成独立云开发库迁移并切换日常 API；家里电脑尚待安装、配置和验收。代码通过 Git 接续，两台电脑各自运行前端与 API，连接同一份开发数据库和私有素材库。换电脑时不再往返覆盖数据库或素材目录。聊天记录不迁移，接手上下文以仓库文档为准。

## 当前状态（2026-09-07）

- 已按用户确认，在 Supabase `Ho_Org` 下创建 `Reelay_Dev`，区域 `ap-southeast-1`，项目 ref `oocagsuhijyvmzwotyxn`。创建时工具返回费用为每月 `0`，未升级套餐。
- 公网演示站仍使用独立的 `Reelay_Test`（`yacgzkkttwtyxkfxiwyn`）。开发数据不自动进入演示站，演示站数据也不自动回流。
- 新项目已按仓库 `0001`–`0013` 建立业务 schema 和 checksum ledger；17 张表均启用 RLS 并保留仅服务端访问边界。15 个项目（含 2 个软删除）、6 份画布、3 个主体与 42 个 Media 的业务数据已通过 PostgreSQL 类型化精确比对后事务导入，ID、revision、主体素材顺序及账号密码散列保留。65 条旧 sessions 没有导入，登录在新环境建立会话。
- 42 个原始素材共 `85,123,200` 字节已上传同项目私有桶 `reelay-assets`，全部回读 SHA-256 通过。当前个人素材列表有 20 项，另 22 个历史 Media 及二进制仍保留；这两个数字不能混作丢失素材。
- 本机 `.env.shared-development.local` 已配置，日常 API 改用 `npm run dev:server:shared`。前端 `5173` 和 API `5175` 都读取 `D:\Software\codePro\0707` 当前代码；配置缺失或数据库、Storage 不属于同一项目时在启动前失败。
- 本机已通过 HTTP 实测：创作者登录、两个原项目画布 `200`、3 主体 / 20 素材列表、三主体封面原图 Range `206`、缩略图 `200`、未登录访问 `401`；两个入口的 health 正常。浏览器刷新并重新登录后，原画布、20 项个人素材与三主体封面正常显示，控制台无 error / warn。新素材上传、再次保存和家里电脑接续仍待专门实测。
- **家里电脑尚未安装和验收，不能据本机成功宣称两机端到端验证完成。** 家里按下文接入现有 `Reelay_Dev`，不再导入旧库、重新初始化或 seed。

私有桶与本地 Supabase API 的单素材上限均为 **50 MiB**，超限在创建上传 intent 前返回 `413`；独立 filesystem 模式仍为 `64 MiB`，Vercel 演示站仍为 `4 MiB`。

最终迁移使用旧 API 停止后的 `.reelay-data/shared-development/source-backup-2026-09-07T11-55-08-749Z/` 快照，导入结果见该目录的 `cloud-import-result.json`。仅画布 `nodes.assets.url` 中 18 处指向 `127.0.0.1:5173/5174` 的持久 API 地址被规范为同源相对路径，精确差异保存在同目录 `canvas-url-normalization.json`；原始快照保留。素材全量回读证据在较早备份目录 `source-backup-2026-09-07T11-43-38-793Z/cloud-object-verification.json`，切换前已再次确认最终快照的全部 object key 和 hash 相同。

原 Docker `54329` 与两个历史 ObjectStore 根目录保留作为迁移源，不再用于日常写入；它们不会继续收到云开发库的新编辑。不要重新 seed，也不要把旧快照恢复到现有 `Reelay_Dev` 来覆盖新数据。备份、配置和验证文件均在 Git 忽略目录中，不随代码分发。

## 数据与代码的归属

| 内容 | 权威位置 / 同步方式 |
| --- | --- |
| 代码、依赖锁文件、迁移、交接说明 | Git；离开前提交并推送，到另一台先拉取同一分支 |
| 项目、画布、主体和素材关联 | `Reelay_Dev` PostgreSQL；本机日常 API 已切换 |
| 上传的原始图片、视频等素材 | 同一项目的私有 Storage 桶 `reelay-assets`；缩略图由 API 生成 |
| API 代码与前端预览 | 各电脑本地运行；更改代码通过本地预览验证 |
| 凭据 | 每台电脑专用的忽略文件；不放 Git，不放前端环境变量 |
| Codex 聊天与个人插件 | 用户不要求迁移；需要的插件在另一台单独安装、登录 |

Git 提交只保存在当前电脑，推送后另一台才拿得到。Git 不实时同步尚未保存、尚未提交的编辑。共享数据库也不是实时协同画布：切换前等待保存完成，另一台重新打开项目；不要让两台同时修改同一画布。现有 revision 冲突不能当作内容自动合并。

## 首次迁移记录（已执行参考）

以下记录说明本次如何保留原数据，不是家里电脑的安装步骤，也不应在普通换机时重跑。

1. 只读盘点本机 PostgreSQL 18.4 与两处 ObjectStore；当前目录提供 30 个对象，历史目录补足 12 个，42 个对象全部匹配数据库 checksum，没有缺件。
2. 停止旧 `5175` API 后导出最终一致快照，配套保存 17 表逻辑 JSON、原始对象及 checksum 清单；保留原数据库和目录。
3. 新 Supabase PostgreSQL 17 按仓库迁移建立 schema，通过逻辑数据导入和 PostgreSQL 类型化比对迁移业务数据，未复制 Docker volume 或盲目恢复跨大版本物理备份。
4. 保留项目、画布、Media、Entity 的原 ID、revision、时间戳、名称、封面与主体内顺序；仅执行上文限定的 18 处 URL 规范化，不运行 demo seed。账号散列保留，旧会话不迁入。
5. 将 42 个原文件按原 object key 写入私有桶并全量回读验证，保留历史 Media；桶和本地 Supabase API 统一为 `50 MiB`。
6. 切换当前主目录的日常 API，完成上文列出的本机 HTTP 登录、画布、列表、原图 / 缩略图和鉴权验收。家里电脑接入及两机实际接续仍待完成。

## 每台电脑的首次安装

安装 Git、Node `24.x` 和 Codex，取得同一仓库的权限。仓库放在普通本地目录；不要让网盘同时同步整个 `.git`、`node_modules`、数据库 volume 或 `.codex` 目录。

```powershell
git clone https://github.com/Heo7n/reelay-canvas-prototype.git
Set-Location reelay-canvas-prototype
# 按交接记录检出已推送的实际开发分支；不要猜分支名。
npm ci
Copy-Item -LiteralPath 'docs/examples/shared-development.env.example' -Destination '.env.shared-development.local'
```

`npm ci` 在各电脑安装自己的依赖，包括 sharp 的平台二进制，不复制另一台的 `node_modules`。

在忽略文件 `.env.shared-development.local` 中填写 **Reelay_Dev** 的 Session pooler（5432）数据库连接串、服务端 secret key 和桶名。密码中的特殊字符须 URL 编码；池地址从新项目 Connect 面板读取。不要把密码或密钥发到聊天记录中，也不要沿用 `Reelay_Test` 的密钥。

共享模式日常启动不需要本地 Docker；数据库集成测试或实验性 schema 修改仍使用独立本机 Docker 数据库，不能把测试管理员 URL 指向共享开发库。

## 日常启动

先核对两个端口是否已有服务；正在运行的 API 必须确认属于哪个数据环境，不能直接另起进程抢占。

```powershell
git status --short --branch
git pull --ff-only
npm run dev:server:shared
```

首次安装或依赖变化时先运行 `npm ci`。另一个终端运行：

```powershell
npm run dev:shell -- --host 127.0.0.1 --port 5173 --strictPort
```

`dev:server:shared` 只从专用文件读取数据连接配置，清除终端中残留的公网部署、旧本机数据和 seed 环境变量，再以 `development + postgresql + supabase` 在 `127.0.0.1:5175` 启动当前代码的 API。启动不迁移、不 seed、不建桶；缺配置不会退回空的本地素材库。前端继续通过同源 `/api` 代理访问它，secret key 不进入前端进程。服务端代码修改后需要重启这个 API；前端继续由 Vite 热更新。

不要用未配置的 `npm run start:server` 代替共享入口：该兼容入口仍可能读取本机 PostgreSQL / filesystem 默认值，不是当前日常启动方式。

入口：<http://127.0.0.1:5173/app/login>。两台电脑分别登录自己的本机浏览器会话即可，不搬运 Cookie。

家里首次接入后应验证登录、原项目与画布、3 个主体及其素材顺序、个人素材和原图 / 缩略图；再完成一次明确的保存与另一台重新打开的接续检查。完成前保持“家里待验收”状态，不用重新 seed 来处理连接或显示问题。

## 每次离开与接续

离开前保存文件和画布，更新 `docs/agent-handoff.md` 中本次目标、实际范围、未完成项与验证结果；按 `development-workflow.md` 检查、提交并推送当前开发分支。未做完的工作也应以可恢复的分支提交保留，不能仅留在本机 stash。多个任务各自的 worktree 都需盘点，不只看主目录。

另一台先核对本地是否有未提交改动，再拉取交接的同一分支；`--ff-only` 失败时先处理分叉，不 force/reset 覆盖。`main` 的保护与 PR 流程保持。每次切换不要求创建或合并 PR，但代码要推送到可恢复的开发分支。

给另一台 Codex 的接手说明：

> 继续 Reelay 项目。先核对实际分支、提交和未提交改动，再读 AGENTS.md、docs/development-workflow.md、docs/agent-handoff.md 与 docs/cross-device-development.md。本机共享开发迁移已完成，家里电脑尚待接入；用 Reelay_Dev 专用配置和 dev:server:shared 启动本地预览，再核对既有数据。不要重新 seed、导入旧快照或连接演示站数据库。结合交接中的未完成项继续，不迁移之前的聊天记录。

共享开发库的 schema 变更由一个任务执行，另一台先同步对应代码再继续；会破坏既有数据或不兼容另一分支的实验使用独立本机数据库。备份仍需同时覆盖数据库与原始素材，共享存储不替代备份。

## 官方依据

- [Supabase 数据库连接方式](https://supabase.com/docs/guides/database/connecting-to-postgres)：常驻后端在 IPv4 网络使用 Session pooler。
- [Supabase 计费与免费项目](https://supabase.com/docs/guides/platform/billing-on-supabase)：免费额度有项目、容量和流量限制；本次费用以创建时工具报价为准。
