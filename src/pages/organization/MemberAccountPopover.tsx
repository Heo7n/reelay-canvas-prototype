import { KeyRound, UserCheck, UserX } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import type { OrganizationMember } from "../../domain/workspace/workspace";
import styles from "./OrganizationCenterPage.module.css";

interface MemberAccountPopoverProps {
  anchor: HTMLButtonElement | null;
  canToggleDisabled: boolean;
  disabled: boolean;
  member: OrganizationMember;
  onClose: () => void;
  onResetPassword: (member: OrganizationMember) => void;
  onToggleDisabled: (member: OrganizationMember) => void;
}

export function MemberAccountPopover({
  anchor,
  canToggleDisabled,
  disabled,
  member,
  onClose,
  onResetPassword,
  onToggleDisabled,
}: MemberAccountPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const rect = anchor?.getBoundingClientRect();
  const panelWidth = 188;
  const panelHeight = canToggleDisabled ? 88 : 48;
  const gap = 8;
  const position = rect ? {
    left: rect.left - panelWidth - gap >= 12
      ? rect.left - panelWidth - gap
      : Math.min(window.innerWidth - panelWidth - 12, rect.right + gap),
    top: Math.max(12, Math.min(rect.top - 7, window.innerHeight - panelHeight - 12)),
  } : null;

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !anchor?.contains(target)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const handleViewportChange = () => onClose();
    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [anchor, onClose]);

  if (!position) return null;

  return createPortal(
    <div
      ref={panelRef}
      className={styles.accountPopover}
      style={position}
      role="dialog"
      aria-label={`管理 ${member.displayName} 的账号`}
    >
      <div className={styles.accountOptions}>
        <button type="button" onClick={() => onResetPassword(member)}>
          <KeyRound aria-hidden="true" />
          <span>重置登录密码</span>
        </button>
        {canToggleDisabled ? (
          <button
            className={disabled ? "" : styles.accountOptionDanger}
            type="button"
            onClick={() => onToggleDisabled(member)}
          >
            {disabled ? <UserCheck aria-hidden="true" /> : <UserX aria-hidden="true" />}
            <span>{disabled ? "恢复账号" : "停用账号"}</span>
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
