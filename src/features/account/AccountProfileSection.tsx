import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router-dom";
import { Mail, Phone } from "lucide-react";

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
  const wasSavingRef = useRef(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "error" | "success"; message: string } | null>(null);
  const saving = fetcher.state !== "idle";
  const avatar = actor.displayName.slice(0, 1).toUpperCase();

  useEffect(() => {
    if (fetcher.state !== "idle") {
      wasSavingRef.current = true;
      return;
    }
    if (!wasSavingRef.current) return;

    wasSavingRef.current = false;
    if (fetcher.data?.ok) {
      setHasUnsavedChanges(false);
      setFeedback({
        kind: "success",
        message: fetcher.data.notice ?? "联系资料已保存。",
      });
      return;
    }
    if (fetcher.data?.error) {
      setFeedback({ kind: "error", message: fetcher.data.error });
    }
  }, [fetcher.data, fetcher.state]);

  function markAsChanged(): void {
    setHasUnsavedChanges(true);
    setFeedback(null);
  }

  return (
    <section className={`${styles.section} ${styles.profileSection}`} aria-labelledby="account-profile-title">
      <div className={`${styles.sectionHeading} ${styles.profileHeading}`}>
        <h2 id="account-profile-title">账户信息</h2>
      </div>

      <div className={styles.profileSummary}>
        <div className={styles.identityCard}>
          <span className={styles.largeAvatar} aria-hidden="true">{avatar}</span>
          <span className={styles.identityCopy}>
            <strong>{actor.displayName}</strong>
            <small>{actor.account}</small>
          </span>
        </div>

        <dl className={`${styles.detailsList} ${styles.membershipDetails}`}>
          <div>
            <dt>所属组织</dt>
            <dd>{workspace.name}</dd>
          </div>
          <div>
            <dt>组织角色</dt>
            <dd>{roleLabels[workspace.currentUserRole ?? "member"]}</dd>
          </div>
        </dl>
      </div>

      <fetcher.Form
        key={`${actor.contactEmail ?? ""}|${actor.contactPhone ?? ""}`}
        method="post"
        action={routePaths.account()}
        className={styles.contactForm}
        onChange={markAsChanged}
        onSubmit={() => setFeedback(null)}
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
            disabled={saving}
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
            disabled={saving}
          />
        </label>

        <div className={styles.contactFooter}>
          <div className={styles.formFeedback}>
            {saving ? <p className={styles.formStatus} role="status">正在保存…</p> : null}
            {!saving && feedback?.kind === "error"
              ? <p className={styles.formError} role="alert">{feedback.message}</p>
              : null}
            {!saving && feedback?.kind === "success"
              ? <p className={styles.formSuccess} role="status">{feedback.message}</p>
              : null}
          </div>
          <button type="submit" disabled={saving || !hasUnsavedChanges}>
            {saving ? "保存中…" : "保存资料"}
          </button>
        </div>
      </fetcher.Form>
    </section>
  );
}
