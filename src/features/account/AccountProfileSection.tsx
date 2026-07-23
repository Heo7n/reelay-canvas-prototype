import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router-dom";

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

interface ContactDraft {
  email: string;
  phone: string;
}

type AutoSaveState = "idle" | "dirty" | "saving" | "saved" | "error";

function serializeContacts(contacts: ContactDraft): string {
  return `${contacts.email.trim()}|${contacts.phone.trim()}`;
}

export function AccountProfileSection({ actor, workspace }: AccountProfileSectionProps) {
  const fetcher = useFetcher<WorkspaceActionData>();
  const formRef = useRef<HTMLFormElement>(null);
  const saveTimerRef = useRef<number | null>(null);
  const initialContacts: ContactDraft = {
    email: actor.contactEmail ?? "",
    phone: actor.contactPhone ?? "",
  };
  const [draft, setDraft] = useState<ContactDraft>(initialContacts);
  const draftRef = useRef<ContactDraft>(initialContacts);
  const savedContactsRef = useRef<ContactDraft>(initialContacts);
  const submittedContactsRef = useRef<ContactDraft | null>(null);
  const lastActorValueRef = useRef(serializeContacts(initialContacts));
  const [autoSaveState, setAutoSaveState] = useState<AutoSaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const avatar = actor.displayName.slice(0, 1).toUpperCase();

  useEffect(() => {
    if (
      fetcher.state !== "idle"
      || fetcher.data === undefined
      || submittedContactsRef.current === null
    ) return;

    const completedContacts = submittedContactsRef.current;
    submittedContactsRef.current = null;
    if (fetcher.data?.ok) {
      savedContactsRef.current = completedContacts;
      setSaveError(null);
      if (serializeContacts(draftRef.current) === serializeContacts(completedContacts)) {
        setAutoSaveState("saved");
      } else {
        setAutoSaveState("dirty");
        queueAutoSave(0);
      }
    } else if (fetcher.data?.error) {
      setSaveError(fetcher.data.error);
      setAutoSaveState("error");
      if (serializeContacts(draftRef.current) !== serializeContacts(completedContacts)) {
        queueAutoSave(0);
      }
    }
  }, [fetcher.data, fetcher.state]);

  useEffect(() => () => {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
  }, []);

  useEffect(() => {
    const nextActorContacts: ContactDraft = {
      email: actor.contactEmail ?? "",
      phone: actor.contactPhone ?? "",
    };
    const nextActorValue = serializeContacts(nextActorContacts);
    if (nextActorValue === lastActorValueRef.current) return;

    lastActorValueRef.current = nextActorValue;
    const previousSavedValue = serializeContacts(savedContactsRef.current);
    savedContactsRef.current = nextActorContacts;
    if (
      submittedContactsRef.current === null
      && serializeContacts(draftRef.current) === previousSavedValue
    ) {
      draftRef.current = nextActorContacts;
      setDraft(nextActorContacts);
      setAutoSaveState("idle");
    }
  }, [actor.contactEmail, actor.contactPhone]);

  function submitLatestDraft(): void {
    saveTimerRef.current = null;
    const form = formRef.current;
    if (!form || !form.checkValidity()) return;

    if (submittedContactsRef.current !== null || fetcher.state !== "idle") {
      return;
    }

    const contacts = { ...draftRef.current };
    if (serializeContacts(contacts) === serializeContacts(savedContactsRef.current)) {
      setAutoSaveState("idle");
      return;
    }

    const formData = new FormData();
    formData.set("contactEmail", contacts.email.trim());
    formData.set("contactPhone", contacts.phone.trim());
    submittedContactsRef.current = contacts;
    setAutoSaveState("saving");
    setSaveError(null);
    fetcher.submit(formData, { method: "post", action: routePaths.account() });
  }

  function queueAutoSave(delay = 600): void {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(submitLatestDraft, delay);
  }

  function updateDraft(field: keyof ContactDraft, value: string): void {
    const nextDraft = { ...draftRef.current, [field]: value };
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    setSaveError(null);
    if (serializeContacts(nextDraft) === serializeContacts(savedContactsRef.current)) {
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
      setAutoSaveState(submittedContactsRef.current === null ? "idle" : "dirty");
      return;
    }
    setAutoSaveState("dirty");
    queueAutoSave();
  }

  return (
    <section className={`${styles.section} ${styles.profileSection}`} aria-labelledby="account-profile-title">
      <div className={`${styles.sectionHeading} ${styles.profileHeading}`}>
        <h2 id="account-profile-title">账户信息</h2>
      </div>

      <div className={styles.profileLayout}>
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
          ref={formRef}
          method="post"
          action={routePaths.account()}
          className={styles.contactForm}
          onBlur={() => queueAutoSave(0)}
          onSubmit={(event) => {
            event.preventDefault();
            queueAutoSave(0);
          }}
        >
          <label>
            <span>邮箱</span>
            <input
              name="contactEmail"
              type="email"
              value={draft.email}
              onChange={(event) => updateDraft("email", event.currentTarget.value)}
              maxLength={254}
              placeholder="name@example.com"
              autoComplete="email"
            />
          </label>
          <label>
            <span>手机</span>
            <input
              name="contactPhone"
              type="tel"
              value={draft.phone}
              onChange={(event) => updateDraft("phone", event.currentTarget.value)}
              minLength={5}
              maxLength={32}
              pattern="[+0-9()\- ]{5,32}"
              placeholder="+86 138 0000 0000"
              autoComplete="tel"
            />
          </label>

          <div className={styles.formFeedback} aria-live="polite">
            {autoSaveState === "saving"
              ? <p className={styles.formStatus} role="status">正在自动保存…</p>
              : null}
            {autoSaveState === "error" && saveError
              ? <p className={styles.formError} role="alert">{saveError}</p>
              : null}
            {autoSaveState === "saved"
              ? <p className={styles.formSuccess} role="status">已自动保存</p>
              : null}
          </div>
        </fetcher.Form>
      </div>
    </section>
  );
}
