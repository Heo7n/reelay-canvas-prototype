import { Building2, Check, Hash, MoreHorizontal, Pencil, Search, UsersRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { SessionActor } from "../../domain/identity/session";
import type {
  MembershipRole,
  OrganizationMember,
  Workspace,
} from "../../domain/workspace/workspace";
import { MemberControlDialog } from "./MemberControlDialog";
import { OrganizationRolePopover } from "./OrganizationRolePopover";
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
  const [organizationName, setOrganizationName] = useState(workspace.name);
  const [organizationNameDraft, setOrganizationNameDraft] = useState(workspace.name);
  const [editingOrganizationName, setEditingOrganizationName] = useState(false);
  const [organizationAvatarUrl, setOrganizationAvatarUrl] = useState<string | null>(null);
  const [roleOverrides, setRoleOverrides] = useState<Record<string, MembershipRole>>({});
  const [roleEditor, setRoleEditor] = useState<{
    anchor: HTMLButtonElement;
    member: OrganizationMember;
  } | null>(null);
  const [selectedMember, setSelectedMember] = useState<OrganizationMember | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const currentRole = workspace.currentUserRole ?? "member";
  const canEditOrganization = currentRole === "owner";
  const canControlAccounts = currentRole === "owner";
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const filteredMembers = normalizedQuery
    ? members.filter((member) => (
      member.displayName.toLocaleLowerCase("zh-CN").includes(normalizedQuery)
      || member.loginIdentifier?.toLocaleLowerCase("zh-CN").includes(normalizedQuery)
    ))
    : members;

  useEffect(() => () => {
    if (organizationAvatarUrl) URL.revokeObjectURL(organizationAvatarUrl);
  }, [organizationAvatarUrl]);

  function commitOrganizationName(): void {
    const nextName = organizationNameDraft.trim();
    if (nextName.length < 2) {
      setOrganizationNameDraft(organizationName);
      setEditingOrganizationName(false);
      onNotice("组织名称至少需要 2 个字符。");
      return;
    }
    setOrganizationName(nextName);
    setOrganizationNameDraft(nextName);
    setEditingOrganizationName(false);
    if (nextName !== workspace.name) {
      onNotice("组织名称已在本页预览；共享保存接口尚未接入，刷新后会恢复。");
    }
  }

  function handleOrganizationAvatar(file: File | undefined): void {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      onNotice("请选择图片文件作为组织头像。");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      onNotice("组织头像请控制在 5 MB 以内。");
      return;
    }
    setOrganizationAvatarUrl(URL.createObjectURL(file));
    onNotice("组织头像已在本页预览；共享保存接口尚未接入，刷新后会恢复。");
  }

  function displayRoleFor(member: OrganizationMember): MembershipRole {
    return roleOverrides[member.userId] ?? member.role;
  }

  function canChangeMemberRole(member: OrganizationMember): boolean {
    if (member.role === "owner") return false;
    if (currentRole === "owner") return true;
    return currentRole === "admin" && member.userId !== actor.id;
  }

  return (
    <section className={styles.section} aria-labelledby="organization-management-title">
      <div className={styles.sectionHeading}>
        <span>
          <h1 id="organization-management-title">组织管理</h1>
          <p>管理组织资料、成员身份与账号控制权。</p>
        </span>
      </div>

      <article className={styles.organizationCard}>
        {canEditOrganization ? (
          <>
            <button
              className={styles.organizationAvatarEditor}
              type="button"
              aria-label="更改组织头像"
              data-tooltip="更改组织头像"
              onClick={() => avatarInputRef.current?.click()}
            >
              <span className={styles.largeOrganizationAvatar}>
                {organizationAvatarUrl ? <img src={organizationAvatarUrl} alt="" /> : <Building2 aria-hidden="true" />}
              </span>
              <span className={styles.avatarEditIcon} aria-hidden="true"><Pencil /></span>
            </button>
            <input
              ref={avatarInputRef}
              hidden
              type="file"
              accept="image/*"
              tabIndex={-1}
              onChange={(event) => {
                handleOrganizationAvatar(event.currentTarget.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
          </>
        ) : (
          <div className={styles.largeOrganizationAvatar} aria-hidden="true">
            <Building2 />
          </div>
        )}
        <div className={styles.organizationCopy}>
          {editingOrganizationName ? (
            <label className={styles.organizationNameInput}>
              <span className={styles.srOnly}>组织名称</span>
              <input
                autoFocus
                value={organizationNameDraft}
                maxLength={40}
                onBlur={commitOrganizationName}
                onChange={(event) => setOrganizationNameDraft(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitOrganizationName();
                  }
                  if (event.key === "Escape") {
                    setOrganizationNameDraft(organizationName);
                    setEditingOrganizationName(false);
                  }
                }}
              />
              <Check aria-hidden="true" />
            </label>
          ) : canEditOrganization ? (
            <div className={styles.organizationNameLine}>
              <h2>{organizationName}</h2>
              <button
                className={styles.organizationNameEditor}
                type="button"
                aria-label="更改组织名称"
                data-tooltip="更改组织名称"
                onClick={() => setEditingOrganizationName(true)}
              >
                <Pencil aria-hidden="true" />
              </button>
            </div>
          ) : <h2>{organizationName}</h2>}
          <div className={styles.organizationMeta}>
            <span><UsersRound aria-hidden="true" />{members.length} 位成员</span>
            <span><Hash aria-hidden="true" />组织 ID：{workspace.id}</span>
          </div>
        </div>
      </article>

      <div className={styles.membersSection}>
        <div className={styles.subsectionHeading}>
          <h2>成员管理</h2>
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
            const displayRole = displayRoleFor(member);
            const canChangeRole = canChangeMemberRole(member);
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
                <span className={styles.roleCell}>
                  {canChangeRole ? (
                    <button
                      type="button"
                      className={`${styles.roleBadge} ${styles.roleButton} ${styles[`role-${displayRole}`]}`}
                      aria-label={`调整 ${member.displayName} 的组织角色`}
                      aria-expanded={roleEditor?.member.userId === member.userId}
                      onClick={(event) => {
                        const anchor = event.currentTarget;
                        setRoleEditor((current) => (
                          current?.member.userId === member.userId
                            ? null
                            : { anchor, member }
                        ));
                      }}
                    >
                      {roleLabels[displayRole]}
                    </button>
                  ) : (
                    <span className={`${styles.roleBadge} ${styles[`role-${displayRole}`]}`}>
                      {roleLabels[displayRole]}
                    </span>
                  )}
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
      {roleEditor ? (
        <OrganizationRolePopover
          anchor={roleEditor.anchor}
          member={roleEditor.member}
          selectedRole={displayRoleFor(roleEditor.member) === "admin" ? "admin" : "member"}
          onClose={() => setRoleEditor(null)}
          onSelect={(nextRole) => {
            setRoleOverrides((current) => ({
              ...current,
              [roleEditor.member.userId]: nextRole,
            }));
            setRoleEditor(null);
            onNotice(
              `${roleEditor.member.displayName} 已在本页显示为${roleLabels[nextRole]}；`
              + "角色写入接口尚未接入，刷新后会恢复。",
            );
          }}
        />
      ) : null}
    </section>
  );
}
