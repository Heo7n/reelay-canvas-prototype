import { KeyRound, LogOut, ShieldCheck, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import type { OrganizationMember } from "../../domain/workspace/workspace";
import styles from "./OrganizationCenterPage.module.css";

interface MemberControlDialogProps {
  member: OrganizationMember | null;
  onClose: () => void;
  onNotice: (message: string) => void;
}

const roleLabels = {
  owner: "主账户",
  admin: "管理员",
  member: "成员",
} as const;

export function MemberControlDialog({
  member,
  onClose,
  onNotice,
}: MemberControlDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!member) return undefined;
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [member, onClose]);

  if (!member) return null;

  function runPrototypeAction(message: string): void {
    onClose();
    onNotice(`${message}当前为安全流程演示，未修改共享账号数据。`);
  }

  return createPortal(
    <div
      className={styles.dialogBackdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={styles.memberDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="member-control-title"
        onKeyDown={(event) => {
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
        <button
          ref={closeButtonRef}
          className={styles.dialogClose}
          type="button"
          aria-label="关闭成员账号管理"
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </button>

        <div className={styles.dialogIdentity}>
          <span className={styles.memberAvatar} aria-hidden="true">
            {member.displayName.slice(0, 1).toUpperCase()}
          </span>
          <span>
            <h2 id="member-control-title">{member.displayName}</h2>
            <p>{member.loginIdentifier ?? "未绑定登录账号"}</p>
          </span>
        </div>

        <div className={styles.controlList}>
          <article>
            <span className={styles.controlIcon}><ShieldCheck aria-hidden="true" /></span>
            <span>
              <strong>组织角色</strong>
              <small>当前为{roleLabels[member.role]}。只有主账户可以任免管理员。</small>
            </span>
            <button
              type="button"
              onClick={() => runPrototypeAction(member.role === "admin" ? "已选择调整为普通成员。" : "已选择调整为管理员。")}
            >
              {member.role === "admin" ? "调整为成员" : "设为管理员"}
            </button>
          </article>

          <article>
            <span className={styles.controlIcon}><KeyRound aria-hidden="true" /></span>
            <span>
              <strong>重置登录凭证</strong>
              <small>不展示现有密码；成员将在下次登录时设置新密码。</small>
            </span>
            <button type="button" onClick={() => runPrototypeAction("已发起登录凭证重置。")}>
              发起重置
            </button>
          </article>

          <article>
            <span className={styles.controlIcon}><LogOut aria-hidden="true" /></span>
            <span>
              <strong>撤销全部会话</strong>
              <small>用于人员变动或账号风险处置，保留成员身份和项目数据。</small>
            </span>
            <button type="button" onClick={() => runPrototypeAction("已选择撤销该账号全部会话。")}>
              退出全部设备
            </button>
          </article>
        </div>
      </div>
    </div>,
    document.body,
  );
}
