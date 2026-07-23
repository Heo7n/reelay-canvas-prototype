import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BarChart3, CircleDollarSign, UserRound, X } from "lucide-react";

import type { SessionActor } from "../../domain/identity/session";
import type { Workspace } from "../../domain/workspace/workspace";
import { AccountProfileSection } from "./AccountProfileSection";
import { CreditRecordsSection } from "./CreditRecordsSection";
import { UsageDashboardSection } from "./UsageDashboardSection";
import styles from "./AccountSettingsDialog.module.css";

type AccountSection = "profile" | "credits" | "usage";

interface AccountSettingsDialogProps {
  actor: SessionActor;
  onClose: () => void;
  open: boolean;
  workspace: Workspace;
}

const sectionItems = [
  { id: "profile", label: "个人主页", icon: UserRound },
  { id: "credits", label: "积分记录", icon: CircleDollarSign },
  { id: "usage", label: "用量看板", icon: BarChart3 },
] as const;

export function AccountSettingsDialog({
  actor,
  onClose,
  open,
  workspace,
}: AccountSettingsDialogProps) {
  const [activeSection, setActiveSection] = useState<AccountSection>("profile");
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className={styles.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="账号设置"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
            return;
          }
          if (event.key !== "Tab") return;
          const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
          );
          if (!focusable?.length) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        <aside className={styles.sidebar}>
          <strong>账户管理</strong>
          <nav aria-label="账号设置分栏">
            {sectionItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={activeSection === item.id ? styles.activeNavItem : ""}
                  aria-current={activeSection === item.id ? "page" : undefined}
                  onClick={() => setActiveSection(item.id)}
                >
                  <Icon aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <div className={styles.content}>
          <button ref={closeButtonRef} className={styles.closeButton} type="button" onClick={onClose} aria-label="关闭账号设置">
            <X aria-hidden="true" />
          </button>
          {activeSection === "profile" ? <AccountProfileSection actor={actor} workspace={workspace} /> : null}
          {activeSection === "credits" ? <CreditRecordsSection /> : null}
          {activeSection === "usage" ? <UsageDashboardSection actor={actor} workspace={workspace} /> : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
