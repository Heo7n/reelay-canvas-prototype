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
  getMemberCreditBalance,
  ORGANIZATION_CREDIT_SUMMARY,
  type CreditAllocationRecord,
  type CreditIncomeKind,
} from "./organization-credit-data";

export type CreditDrawerKind = "income" | "allocation" | "consumption";

interface CreditDetailDrawerProps {
  kind: CreditDrawerKind | null;
  memberAccount?: string;
  members: OrganizationMember[];
  onKindChange: (kind: CreditDrawerKind) => void;
  onMemberFilterChange: (memberAccount?: string) => void;
  onClose: () => void;
}

type AllocationRecord = CreditAllocationRecord & {
  action: "grant" | "reclaim";
};

const incomeIcons: Record<CreditIncomeKind, typeof ArrowDownLeft> = {
  purchase: CreditCard,
  grant: Sparkles,
  adjustment: RotateCcw,
};

const allocationIcons = {
  grant: ArrowDownLeft,
  reclaim: ArrowUpRight,
} as const;

const allocationLabels = {
  grant: "发放",
  reclaim: "回收",
} as const;

export function CreditDetailDrawer({
  kind,
  memberAccount,
  members,
  onKindChange,
  onMemberFilterChange,
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

  const selectedMember = members.find((member) => member.loginIdentifier === memberAccount);
  const memberRecords = memberAccount
    ? CREDIT_ALLOCATION_RECORDS.filter((record) => record.memberAccount === memberAccount)
    : CREDIT_ALLOCATION_RECORDS;
  const allocationRecords = memberRecords.filter(
    (record): record is AllocationRecord => record.action !== "consume",
  );
  const consumptionRecords = memberRecords.filter((record) => record.action === "consume");
  const allocationTotals = allocationRecords.reduce(
    (totals, record) => {
      if (record.action === "grant") totals.granted += record.amount;
      else totals.reclaimed += Math.abs(record.amount);
      return totals;
    },
    { granted: 0, reclaimed: 0 },
  );
  const consumedTotal = consumptionRecords.reduce(
    (total, record) => total + Math.abs(record.amount),
    0,
  );
  const selectedBalance = selectedMember
    ? getMemberCreditBalance(selectedMember)
    : ORGANIZATION_CREDIT_SUMMARY.allocated;
  const memberFilter = (
    <div className={styles.drawerFilterBar}>
      <span>{selectedMember ? `${selectedMember.displayName} 的账户` : "全部成员账户"}</span>
      <select
        aria-label="筛选成员"
        value={memberAccount ?? ""}
        onChange={(event) => onMemberFilterChange(event.target.value || undefined)}
      >
        <option value="">全部成员</option>
        {members.map((member) => (
          <option
            key={member.userId}
            value={member.loginIdentifier ?? ""}
          >
            {member.displayName}
          </option>
        ))}
      </select>
    </div>
  );

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
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
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
            <h2 id="credit-drawer-title">积分流水</h2>
            <p>查看组织积分的入账、内部额度分配与任务消耗</p>
          </span>
          <button ref={closeButtonRef} type="button" aria-label="关闭详情" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>

        <div className={styles.drawerTabs} role="tablist" aria-label="积分流水类型">
          <button
            id="credit-tab-income"
            type="button"
            role="tab"
            aria-controls="credit-panel-income"
            aria-selected={kind === "income"}
            className={kind === "income" ? styles.activeDrawerTab : undefined}
            onClick={() => onKindChange("income")}
          >
            入账明细
          </button>
          <button
            id="credit-tab-allocation"
            type="button"
            role="tab"
            aria-controls="credit-panel-allocation"
            aria-selected={kind === "allocation"}
            className={kind === "allocation" ? styles.activeDrawerTab : undefined}
            onClick={() => onKindChange("allocation")}
          >
            分配明细
          </button>
          <button
            id="credit-tab-consumption"
            type="button"
            role="tab"
            aria-controls="credit-panel-consumption"
            aria-selected={kind === "consumption"}
            className={kind === "consumption" ? styles.activeDrawerTab : undefined}
            onClick={() => onKindChange("consumption")}
          >
            消耗明细
          </button>
        </div>

        <div className={styles.drawerBadge}>演示数据 · 仅用于前端预览</div>
        {kind === "allocation" || kind === "consumption" ? memberFilter : null}

        {kind === "income" ? (
          <section
            className={styles.drawerPanel}
            id="credit-panel-income"
            role="tabpanel"
            aria-labelledby="credit-tab-income"
          >
            <div className={styles.drawerSummaryGrid}>
              <article>
                <span>累计入账</span>
                <strong>{ORGANIZATION_CREDIT_SUMMARY.lifetimeIncome.toLocaleString("zh-CN")}</strong>
              </article>
              <article>
                <span>入账笔数</span>
                <strong>{CREDIT_INCOME_RECORDS.length}</strong>
              </article>
              <article>
                <span>组织积分余额</span>
                <strong>{ORGANIZATION_CREDIT_SUMMARY.available.toLocaleString("zh-CN")}</strong>
              </article>
            </div>
            <div className={styles.drawerSectionHeading}>
              <h3>入账流水</h3>
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
          </section>
        ) : null}

        {kind === "allocation" ? (
          <section
            className={styles.drawerPanel}
            id="credit-panel-allocation"
            role="tabpanel"
            aria-labelledby="credit-tab-allocation"
          >
            <div className={styles.drawerSummaryGrid}>
              <article>
                <span>{selectedMember ? "当前余额" : "所有成员账户余额"}</span>
                <strong>{selectedBalance.toLocaleString("zh-CN")}</strong>
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
              <h3>额度分配流水</h3>
              <span>共 {allocationRecords.length} 笔</span>
            </div>
            <div className={styles.allocationRecords}>
              <div className={styles.drawerTableHeader}>
                <span>成员 / 时间</span>
                <span>类型</span>
                <span>变动</span>
                <span>变动后余额</span>
              </div>
              {allocationRecords.map((record) => {
                const ChangeIcon = allocationIcons[record.action];
                return (
                  <article key={record.id}>
                    <span>
                      <strong>{record.memberName}</strong>
                      <small>{record.date} · {record.operator} 操作</small>
                    </span>
                    <span className={styles.allocationAction}>
                      <ChangeIcon aria-hidden="true" />
                      {allocationLabels[record.action]}
                    </span>
                    <strong
                      className={
                        record.action === "grant"
                          ? styles.positiveAmount
                          : styles.negativeAmount
                      }
                    >
                      {record.amount > 0 ? "+" : "−"}
                      {Math.abs(record.amount).toLocaleString("zh-CN")}
                    </strong>
                    <span>
                      <strong>{record.balanceAfter.toLocaleString("zh-CN")}</strong>
                      <small>{record.note}</small>
                    </span>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        {kind === "consumption" ? (
          <section
            className={styles.drawerPanel}
            id="credit-panel-consumption"
            role="tabpanel"
            aria-labelledby="credit-tab-consumption"
          >
            <div className={styles.drawerSummaryGrid}>
              <article>
                <span>{selectedMember ? "当前余额" : "所有成员账户余额"}</span>
                <strong>{selectedBalance.toLocaleString("zh-CN")}</strong>
              </article>
              <article>
                <span>本月消耗</span>
                <strong>{consumedTotal.toLocaleString("zh-CN")}</strong>
              </article>
              <article>
                <span>生成任务</span>
                <strong>{consumptionRecords.length}</strong>
              </article>
            </div>
            <div className={styles.drawerSectionHeading}>
              <h3>任务消耗流水</h3>
              <span>共 {consumptionRecords.length} 笔</span>
            </div>
            <div className={`${styles.allocationRecords} ${styles.consumptionRecords}`}>
              <div className={styles.drawerTableHeader}>
                <span>成员 / 时间</span>
                <span>任务</span>
                <span>消耗</span>
                <span>扣减后余额</span>
              </div>
              {consumptionRecords.map((record) => (
                <article key={record.id}>
                  <span>
                    <strong>{record.memberName}</strong>
                    <small>{record.date} · 生成任务自动扣减</small>
                  </span>
                  <span className={styles.consumptionTask}>
                    <Sparkles aria-hidden="true" />
                    <span>
                      <strong>生成任务</strong>
                      <small>{record.note}</small>
                    </span>
                  </span>
                  <strong className={styles.consumedAmount}>
                    −{Math.abs(record.amount).toLocaleString("zh-CN")}
                  </strong>
                  <span>
                    <strong>{record.balanceAfter.toLocaleString("zh-CN")}</strong>
                    <small>{record.id}</small>
                  </span>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </aside>
    </div>,
    document.body,
  );
}
