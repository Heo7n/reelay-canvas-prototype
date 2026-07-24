import { ArrowRightLeft, Building2, MoreHorizontal, Pencil, Search, ShieldCheck, UsersRound } from "lucide-react";
import { useState } from "react";

import type { SessionActor } from "../../domain/identity/session";
import type { OrganizationMember, Workspace } from "../../domain/workspace/workspace";
import { MemberControlDialog } from "./MemberControlDialog";
import styles from "./OrganizationCenterPage.module.css";

interface OrganizationManagementSectionProps {
  actor: SessionActor;
  members: OrganizationMember[];
  onNotice: (message: string) => void;
  workspace: Workspace;
}

const roleLabels = {
  owner: "主账户",
  admin: "管理员",
  member: "成员",
} as const;

export function OrganizationManagementSection({
  actor,
  members,
  onNotice,
  workspace,
}: OrganizationManagementSectionProps) {
  const [query, setQuery] = useState("");
  const [selectedMember, setSelectedMember] = useState<OrganizationMember | null>(null);
  const currentRole = workspace.currentUserRole ?? "member";
  const canEditOrganization = currentRole === "owner" || currentRole === "admin";
  const canControlAccounts = currentRole === "owner";
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const filteredMembers = normalizedQuery
    ? members.filter((member) => (
      member.displayName.toLocaleLowerCase("zh-CN").includes(normalizedQuery)
      || member.loginIdentifier?.toLocaleLowerCase("zh-CN").includes(normalizedQuery)
    ))
    : members;

  return (
    <section className={styles.section} aria-labelledby="organization-management-title">
      <div className={styles.sectionHeading}>
        <span>
          <h1 id="organization-management-title">组织管理</h1>
          <p>管理组织资料、成员身份与账号控制权。</p>
        </span>
      </div>

      <article className={styles.organizationCard}>
        <div className={styles.largeOrganizationAvatar} aria-hidden="true">
          <Building2 />
        </div>
        <div className={styles.organizationCopy}>
          <span className={styles.eyebrow}>组织信息</span>
          <h2>{workspace.name}</h2>
          <div className={styles.organizationMeta}>
            <span><UsersRound aria-hidden="true" />{members.length} 位成员</span>
            <span><ShieldCheck aria-hidden="true" />当前身份：{roleLabels[currentRole]}</span>
          </div>
        </div>
        {canEditOrganization ? (
          <div className={styles.organizationActions}>
            {currentRole === "owner" ? (
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={() => onNotice("主账户转移需要二次验证与会话审计，当前只展示入口。")}
              >
                <ArrowRightLeft aria-hidden="true" />
                转移主账户
              </button>
            ) : null}
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => onNotice("组织资料编辑将在下一切片接入共享数据。")}
            >
              <Pencil aria-hidden="true" />
              编辑组织信息
            </button>
          </div>
        ) : null}
      </article>

      <div className={styles.membersSection}>
        <div className={styles.subsectionHeading}>
          <span>
            <h2>成员管理</h2>
            <p>{members.length} 位组织成员</p>
          </span>
          <label className={styles.searchBox}>
            <Search aria-hidden="true" />
            <span className={styles.srOnly}>搜索组织成员</span>
            <input
              type="search"
              value={query}
              maxLength={80}
              placeholder="搜索成员或登录账号"
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </label>
        </div>

        <div className={styles.memberTable}>
          <div className={styles.memberTableHeader} aria-hidden="true">
            <span>成员</span>
            <span>登录账号</span>
            <span>组织角色</span>
            <span>账号管理</span>
          </div>
          {filteredMembers.map((member) => {
            const isCurrentActor = member.userId === actor.id;
            return (
              <div className={styles.memberRow} key={member.userId}>
                <div className={styles.memberIdentity}>
                  <span className={styles.memberAvatar} aria-hidden="true">
                    {member.displayName.slice(0, 1).toUpperCase()}
                  </span>
                  <span>
                    <strong>{member.displayName}</strong>
                    {isCurrentActor ? <small>当前账号</small> : null}
                  </span>
                </div>
                <span className={styles.loginIdentifier}>
                  {member.loginIdentifier ?? "未绑定登录账号"}
                </span>
                <span>
                  <span className={`${styles.roleBadge} ${styles[`role-${member.role}`]}`}>
                    {roleLabels[member.role]}
                  </span>
                </span>
                <span className={styles.rowAction}>
                  {canControlAccounts && member.role !== "owner" ? (
                    <button
                      type="button"
                      aria-label={`管理 ${member.displayName} 的账号`}
                      onClick={() => setSelectedMember(member)}
                    >
                      <MoreHorizontal aria-hidden="true" />
                    </button>
                  ) : (
                    <small>{member.role === "owner" ? "所有权账号" : "无管理权限"}</small>
                  )}
                </span>
              </div>
            );
          })}
          {filteredMembers.length === 0 ? (
            <div className={styles.memberEmpty}>没有找到匹配“{query}”的成员</div>
          ) : null}
        </div>
      </div>

      <MemberControlDialog
        member={selectedMember}
        onClose={() => setSelectedMember(null)}
        onNotice={onNotice}
      />
    </section>
  );
}
