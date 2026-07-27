import {
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import type { OrganizationMember } from "../../domain/workspace/workspace";
import styles from "./OrganizationCenterPage.module.css";
import {
  CREDIT_ALLOCATION_RECORDS,
  CREDIT_INCOME_RECORDS,
  getAllocationTotals,
  ORGANIZATION_CREDIT_SUMMARY,
  type CreditIncomeKind,
} from "./organization-credit-data";

export type CreditDrawerKind = "income" | "allocation" | "pool";

interface CreditDetailDrawerProps {
  kind: CreditDrawerKind | null;
  memberAccount?: string;
  members: OrganizationMember[];
  onClose: () => void;
}

const incomeIcons: Record<CreditIncomeKind, typeof ArrowDownLeft> = {
  purchase: CreditCard,
  grant: Sparkles,
  adjustment: RotateCcw,
};

export function CreditDetailDrawer({
  kind,
  memberAccount,
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
  const isPool = kind === "pool";
  const selectedMember = members.find((member) => member.loginIdentifier === memberAccount);
  const allocationRecords = memberAccount
    ? CREDIT_ALLOCATION_RECORDS.filter((record) => record.memberAccount === memberAccount)
    : CREDIT_ALLOCATION_RECORDS;
  const allocationTotals = getAllocationTotals();

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
            <h2 id="credit-drawer-title">
              {isIncome
                ? "组织积分明细"
                : isPool
                  ? "可分配余额明细"
                : selectedMember
                  ? `${selectedMember.displayName} 的分配记录`
                  : "成员账户余额明细"}
            </h2>
            <p>
              {isIncome
                ? "查看组织累计入账、消耗与当前可用余额"
                : isPool
                  ? "查看组织池向成员账户发放与回收的变动"
                : selectedMember
                  ? selectedMember.loginIdentifier
                  : "查看成员账户余额与内部调拨流水"}
            </p>
          </span>
          <button ref={closeButtonRef} type="button" aria-label="关闭详情" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>

        <div className={styles.drawerBadge}>演示流水 · 尚未接入 CreditLedger</div>

        {isIncome ? (
          <>
            <div className={styles.drawerSummaryGrid}>
              <article>
                <span>累计入账</span>
                <strong>{ORGANIZATION_CREDIT_SUMMARY.lifetimeIncome.toLocaleString("zh-CN")}</strong>
              </article>
              <article>
                <span>累计消耗</span>
                <strong>{ORGANIZATION_CREDIT_SUMMARY.consumed.toLocaleString("zh-CN")}</strong>
              </article>
              <article>
                <span>当前可用</span>
                <strong>{ORGANIZATION_CREDIT_SUMMARY.available.toLocaleString("zh-CN")}</strong>
              </article>
            </div>
            <div className={styles.drawerSectionHeading}>
              <h3>入账记录</h3>
              <span>共 {CREDIT_INCOME_RECORDS.length} 笔</span>
            </div>
            <div className={styles.incomeRecords}>
              {CREDIT_INCOME_RECORDS.map((record) => {
                const Icon = incomeIcons[record.kind];
                return (
                  <article key={record.id}>
                    <span className={styles.recordIcon}><Icon aria-hidden="true" /></span>
                    <span>
                      <strong>{record.source}</strong>
                      <small>{record.description} · {record.date}</small>
                    </span>
                    <span className={styles.recordAmount}>
                      <strong>+{record.amount.toLocaleString("zh-CN")}</strong>
                      <small>{record.id}</small>
                    </span>
                  </article>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div className={styles.drawerSummaryGrid}>
              <article>
                <span>{isPool ? "可分配余额" : "成员余额合计"}</span>
                <strong>
                  {(isPool
                    ? ORGANIZATION_CREDIT_SUMMARY.unallocated
                    : ORGANIZATION_CREDIT_SUMMARY.allocated).toLocaleString("zh-CN")}
                </strong>
              </article>
              <article>
                <span>本月发放</span>
                <strong>{allocationTotals.granted.toLocaleString("zh-CN")}</strong>
              </article>
              <article>
                <span>本月回收</span>
                <strong>{allocationTotals.reclaimed.toLocaleString("zh-CN")}</strong>
              </article>
            </div>
            <div className={styles.drawerSectionHeading}>
              <h3>{selectedMember ? "成员记录" : "调拨记录"}</h3>
              <span>共 {allocationRecords.length} 笔</span>
            </div>
            <div className={styles.allocationRecords}>
              <div className={styles.drawerTableHeader}>
                <span>成员 / 时间</span>
                <span>类型</span>
                <span>变动</span>
                <span>变动后余额</span>
              </div>
              {allocationRecords.map((record) => (
                <article key={record.id}>
                  <span>
                    <strong>{record.memberName}</strong>
                    <small>{record.date} · {record.operator} 操作</small>
                  </span>
                  <span className={styles.allocationAction}>
                    {record.action === "grant"
                      ? <ArrowDownLeft aria-hidden="true" />
                      : <ArrowUpRight aria-hidden="true" />}
                    {record.action === "grant" ? "发放" : "回收"}
                  </span>
                  <strong className={record.amount > 0 ? styles.positiveAmount : styles.negativeAmount}>
                    {record.amount > 0 ? "+" : "−"}
                    {Math.abs(record.amount).toLocaleString("zh-CN")}
                  </strong>
                  <span>
                    <strong>{record.balanceAfter.toLocaleString("zh-CN")}</strong>
                    <small>{record.note}</small>
                  </span>
                </article>
              ))}
            </div>
          </>
        )}
      </aside>
    </div>,
    document.body,
  );
}
