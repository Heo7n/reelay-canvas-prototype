# ADR 0002：单组织容器与项目级访问控制

- 状态：`DECIDED`
- 日期：2026-07-22
- 适用阶段：Phase 0B 可迁移基础

## 背景

早期原型把“个人 / 协作项目”投影为个人 Workspace 与组织 Workspace。用户已明确首期账号主要属于同一个组织，项目库中的“个人 / 协作项目”是项目访问方式，不是两套空间。继续保留每账号个人 Workspace 会重复导航和数据归属，也会让后续成员、分享与积分归集变得含混。

## 决策

- 首期保留一个 organization Workspace 作为组织容器和稳定 URL scope；不再为每个演示账号建立个人 Workspace。
- Project 使用 `private / collaborative` 表达访问类型。新建项目默认 `private`。
- 组织 Membership 使用 `owner / admin / member`，只证明账号属于组织并允许创建项目，不推导具体项目权限。
- ProjectMembership 使用 `admin / edit / view`，是项目读取与修改的权限来源：
  - `private` 只有创建者 `admin`；
  - `collaborative` 只对显式项目成员可见；
  - `admin/edit` 可修改，`view` 只读。
- 项目列表、详情和修改必须在服务端按当前 actor 过滤。前端 `accessKind` 和标签只负责呈现，不能成为授权依据。
- 未加入项目的组织成员按项目不存在处理，避免泄露项目标识；已加入但只有 `view` 的成员修改时返回明确的只读错误。
- `private` 项目由其创建者删除；`collaborative` 项目只有 ProjectMembership `admin` 可以删除，组织角色不替代项目权限。当前删除为软删除：服务端立即从项目列表、详情与画布授权中排除该项目，同时保留项目记录、ProjectMembership 和 CanvasDocument，为后续回收站恢复提供数据基础。
- “转为协作项目”、成员选择、外部分享链接、实时协作和积分账本在后续切片实现；本决策只建立可迁移的数据与权限边界。

## 数据迁移

- 旧 personal Workspace 项目迁入唯一组织并标记为 `private`，创建者成为项目 `admin`。
- 旧 organization Workspace 项目标记为 `collaborative`，旧成员写入对应 ProjectMembership，以保留已有可见性。
- personal Workspace 在项目与成员迁移完成后删除；既有项目元数据、封面引用、作者与更新时间不丢失。

## 后果

- 主页和项目库只请求当前组织项目；“个人 / 协作项目”在同一路由中筛选。
- 多账号演示可以证明组织归属、个人隔离和协作角色，而不用伪造多个空间。
- 后续积分可以先按组织归集，再通过稳定用户、项目和任务标识展示成员用量；当前不提前固化账本周期与扣费规则。
- 若未来需要一个用户加入多个组织，可增加多个 organization Workspace 或独立 Organization 实体，不需要恢复个人 Workspace 模型。
