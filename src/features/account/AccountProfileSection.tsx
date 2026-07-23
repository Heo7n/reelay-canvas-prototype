import { useFetcher } from "react-router-dom";
import { Building2, Mail, Phone, ShieldCheck } from "lucide-react";

import type { WorkspaceActionData } from "../../app/route-data";
import { routePaths } from "../../app/routes";
import type { SessionActor } from "../../domain/identity/session";
import type { Workspace } from "../../domain/workspace/workspace";
import styles from "./AccountSettingsDialog.module.css";

const roleLabels = {
  owner: "主账户",
  admin: "管理员",
  member: "成员",
} as const;

interface AccountProfileSectionProps {
  actor: SessionActor;
  workspace: Workspace;
}

export function AccountProfileSection({ actor, workspace }: AccountProfileSectionProps) {
  const fetcher = useFetcher<WorkspaceActionData>();
  const saving = fetcher.state !== "idle";
  const avatar = actor.displayName.slice(0, 1).toUpperCase();

  return (
    <section className={styles.section} aria-labelledby="account-profile-title">
      <div className={styles.sectionHeading}>
        <span>
          <h2 id="account-profile-title">账户信息</h2>
          <p>当前为固定演示账号，昵称、登录标识与头像暂不可修改。</p>
        </span>
        <span className={styles.demoBadge}><ShieldCheck aria-hidden="true" />演示账号</span>
      </div>

      <div className={styles.identityCard}>
        <span className={styles.largeAvatar} aria-hidden="true">{avatar}</span>
        <span className={styles.identityCopy}>
          <strong>{actor.displayName}</strong>
          <small>{actor.account}</small>
        </span>
      </div>

      <dl className={styles.detailsList}>
        <div>
          <dt>登录标识</dt>
          <dd>{actor.account}</dd>
        </div>
        <div>
          <dt><Building2 aria-hidden="true" />所属组织</dt>
          <dd>{workspace.name}</dd>
        </div>
        <div>
          <dt>组织角色</dt>
          <dd>{roleLabels[workspace.currentUserRole ?? "member"]}</dd>
        </div>
      </dl>

      <div className={styles.subsectionHeading}>
        <h3>联系资料</h3>
        <p>以下信息为可选项，用于后续接收经你主动开启的用量报表。</p>
      </div>

      <fetcher.Form
        key={`${actor.contactEmail ?? ""}|${actor.contactPhone ?? ""}`}
        method="post"
        action={routePaths.account()}
        className={styles.contactForm}
      >
        <label>
          <span><Mail aria-hidden="true" />联系邮箱 <small>选填</small></span>
          <input
            name="contactEmail"
            type="email"
            defaultValue={actor.contactEmail ?? ""}
            maxLength={254}
            placeholder="name@example.com"
            autoComplete="email"
          />
        </label>
        <label>
          <span><Phone aria-hidden="true" />手机号码 <small>选填</small></span>
          <input
            name="contactPhone"
            type="tel"
            defaultValue={actor.contactPhone ?? ""}
            minLength={5}
            maxLength={32}
            pattern="[+0-9()\- ]{5,32}"
            placeholder="+86 138 0000 0000"
            autoComplete="tel"
          />
        </label>

        <div className={styles.contactFooter}>
          <p>填写联系方式不会自动订阅任何报表；报表接收开关将在用量功能接入时单独提供。</p>
          <button type="submit" disabled={saving}>{saving ? "保存中…" : "保存资料"}</button>
        </div>
        {fetcher.data?.error ? <p className={styles.formError} role="alert">{fetcher.data.error}</p> : null}
        {fetcher.data?.notice ? <p className={styles.formSuccess} role="status">{fetcher.data.notice}</p> : null}
      </fetcher.Form>
    </section>
  );
}
