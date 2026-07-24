import { ArrowDownLeft, RotateCcw, Sparkles, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import type { OrganizationMember } from "../../domain/workspace/workspace";
import styles from "./OrganizationCenterPage.module.css";

export type CreditDrawerKind = "income" | "allocation";

interface CreditDetailDrawerProps {
  kind: CreditDrawerKind | null;
  members: OrganizationMember[];
  onClose: () => void;
}

const demoAllocationAmounts = [12_000, 8_000, 5_000, 4_000, 4_000] as const;

const incomeRecords = [
  { id: "IN-20260701", source: "组织充值", amount: 60_000, date: "2026-07-01 10:26", icon: ArrowDownLeft },
  { id: "IN-20260618", source: "活动赠送", amount: 30_000, date: "2026-06-18 16:40", icon: Sparkles },
  { id: "IN-20260506", source: "运营调整", amount: 10_000, date: "2026-05-06 09:12", icon: RotateCcw },
] as const;

export function CreditDetailDrawer({
  kind,
  members,
  onClose,
}: CreditDetailDrawerProps) {
  const drawerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!kind) return undefined;
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
  }, [kind, onClose]);

  if (!kind) return null;

  const isIncome = kind === "income";

  return createPortal(
    <div
      className={styles.drawerBackdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        ref={drawerRef}
        className={styles.creditDrawer}
        aria-modal="true"
        role="dialog"
        aria-labelledby="credit-drawer-title"
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
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
        <header>
          <span>
            <h2 id="credit-drawer-title">{isIncome ? "入账记录" : "分配详情"}</h2>
            <p>{isIncome ? "组织积分的充值、赠送与调整记录" : "当前成员分配余额与最近操作记录"}</p>
          </span>
          <button ref={closeButtonRef} type="button" aria-label="关闭详情" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>

        <div className={styles.drawerBadge}>原型演示记录 · 尚未接入 CreditLedger</div>

        {isIncome ? (
          <div className={styles.incomeRecords}>
            {incomeRecords.map((record) => {
              const Icon = record.icon;
              return (
                <article key={record.id}>
                  <span className={styles.recordIcon}><Icon aria-hidden="true" /></span>
                  <span>
                    <strong>{record.source}</strong>
                    <small>{record.id} · {record.date}</small>
                  </span>
                  <strong>+{record.amount.toLocaleString("zh-CN")}</strong>
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.allocationRecords}>
            <div className={styles.drawerTableHeader}>
              <span>接收成员</span>
              <span>分配额度</span>
              <span>有效期</span>
            </div>
            {members.map((member, index) => (
              <article key={member.userId}>
                <span>
                  <strong>{member.displayName}</strong>
                  <small>分配人：Hoo · 2026-07-01 09:30</small>
                </span>
                <strong>{(demoAllocationAmounts[index] ?? 0).toLocaleString("zh-CN")}</strong>
                <span>
                  <strong>2026-07-31</strong>
                  <small>{member.role === "owner" ? "主账户日常创作" : "7 月创作额度"}</small>
                </span>
              </article>
            ))}
          </div>
        )}
      </aside>
    </div>,
    document.body,
  );
}
