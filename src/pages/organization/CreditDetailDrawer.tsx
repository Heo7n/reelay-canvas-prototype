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
  type CreditSettlementStatus,
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

const incomeLabels: Record<CreditIncomeKind, string> = {
  purchase: "充值",
  grant: "赠送",
  adjustment: "调整",
};

const settlementLabels: Record<CreditSettlementStatus, string> = {
  settled: "已结算",
  reserved: "预占中",
  refunded: "已退回",
};

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
            入账
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
            分配
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
            消耗
          </button>
        </div>

        {kind === "income" ? (
          <section
            className={styles.drawerPanel}
            id="credit-panel-income"
            role="tabpanel"
            aria-labelledby="credit-tab-income"
          >
            <div className={`${styles.drawerSummaryGrid} ${styles.drawerIncomeSummary}`}>
              <article>
                <span>累计入账积分</span>
                <strong>{ORGANIZATION_CREDIT_SUMMARY.lifetimeIncome.toLocaleString("zh-CN")}</strong>
              </article>
            </div>
            <div className={styles.drawerSectionHeading}>
              <h3>入账流水</h3>
              <span>共 {CREDIT_INCOME_RECORDS.length} 笔</span>
            </div>
            <div
              className={`${styles.allocationRecords} ${styles.incomeRecordTable}`}
              role="table"
              aria-label="组织积分入账流水"
            >
              <div className={styles.drawerTableHeader} role="row">
                <span role="columnheader">时间</span>
                <span role="columnheader">类型</span>
                <span role="columnheader">来源与说明</span>
                <span role="columnheader">入账积分</span>
              </div>
              {CREDIT_INCOME_RECORDS.map((record) => {
                const Icon = incomeIcons[record.kind];
                return (
                  <article key={record.id} role="row">
                    <span className={styles.ledgerTime} role="cell">
                      <strong>{record.date.slice(0, 10)}</strong>
                      <small>{record.date.slice(11)}</small>
                    </span>
                    <span className={styles.recordType} role="cell">
                      <span className={styles.recordIcon}><Icon aria-hidden="true" /></span>
                      {incomeLabels[record.kind]}
                    </span>
                    <span role="cell">
                      <strong>{record.source}</strong>
                      <small>{record.description}</small>
                    </span>
                    <span className={styles.recordAmount} role="cell">
                      <strong>+{record.amount.toLocaleString("zh-CN")}</strong>
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
            {memberFilter}
            <div className={`${styles.drawerSummaryGrid} ${styles.drawerAllocationSummary}`}>
              <article>
                <span>可分配余额</span>
                <strong>{ORGANIZATION_CREDIT_SUMMARY.unallocated.toLocaleString("zh-CN")}</strong>
              </article>
              <article>
                <span>本月发放</span>
                <strong>{allocationTotals.granted.toLocaleString("zh-CN")}</strong>
              </article>
              <article>
                <span>本月回收</span>
                <strong>{allocationTotals.reclaimed.toLocaleString("zh-CN")}</strong>
              </article>
              <article>
                <span>{selectedMember ? `${selectedMember.displayName} 当前余额` : "所有成员账户余额"}</span>
                <strong>{selectedBalance.toLocaleString("zh-CN")}</strong>
              </article>
            </div>
            <div className={styles.drawerSectionHeading}>
              <h3>额度分配流水</h3>
              <span>共 {allocationRecords.length} 笔</span>
            </div>
            <div
              className={`${styles.allocationRecords} ${styles.allocationRecordTable}`}
              role="table"
              aria-label="成员积分分配流水"
            >
              <div className={styles.drawerTableHeader} role="row">
                <span role="columnheader">时间</span>
                <span role="columnheader">成员</span>
                <span role="columnheader">类型</span>
                <span role="columnheader">额度变动</span>
                <span role="columnheader">有效期</span>
                <span role="columnheader">操作信息</span>
              </div>
              {allocationRecords.map((record) => {
                const ChangeIcon = allocationIcons[record.action];
                return (
                  <article key={record.id} role="row">
                    <span className={styles.ledgerTime} role="cell">
                      <strong>{record.date.slice(0, 10)}</strong>
                      <small>{record.date.slice(11)}</small>
                    </span>
                    <span role="cell">
                      <strong>{record.memberName}</strong>
                      <small>{record.memberAccount}</small>
                    </span>
                    <span className={styles.allocationAction} role="cell">
                      <ChangeIcon aria-hidden="true" />
                      {allocationLabels[record.action]}
                    </span>
                    <span className={styles.ledgerChange} role="cell">
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
                      <small>余额 {record.balanceAfter.toLocaleString("zh-CN")}</small>
                    </span>
                    <span role="cell">
                      <strong>{record.validUntil ?? "—"}</strong>
                    </span>
                    <span role="cell">
                      <strong>{record.operator}</strong>
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
            {memberFilter}
            <div className={styles.drawerSectionHeading}>
              <h3>任务消耗流水</h3>
              <span>
                共 {consumptionRecords.length} 条 · 合计消耗{" "}
                {consumedTotal.toLocaleString("zh-CN")} 积分
              </span>
            </div>
            <div
              className={`${styles.allocationRecords} ${styles.consumptionRecords}`}
              role="table"
              aria-label="任务积分消耗流水"
            >
              <div className={styles.drawerTableHeader} role="row">
                <span role="columnheader">时间</span>
                <span role="columnheader">成员</span>
                <span role="columnheader">项目</span>
                <span role="columnheader">任务 / 模型</span>
                <span role="columnheader">结算状态</span>
                <span role="columnheader">消耗积分</span>
              </div>
              {consumptionRecords.map((record) => (
                <article key={record.id} role="row">
                  <span className={styles.ledgerTime} role="cell">
                    <strong>{record.date.slice(0, 10)}</strong>
                    <small>{record.date.slice(11)}</small>
                  </span>
                  <span role="cell">
                    <strong>{record.memberName}</strong>
                    <small>{record.memberAccount}</small>
                  </span>
                  <span className={styles.ledgerProject} role="cell">
                    <strong>{record.projectName ?? "未命名项目"}</strong>
                  </span>
                  <span className={styles.consumptionTask} role="cell">
                    <Sparkles aria-hidden="true" />
                    <span>
                      <strong>{record.taskType ?? "生成任务"}</strong>
                      <small>
                        {record.modelName ?? record.note}
                        {record.specification ? ` · ${record.specification}` : ""}
                      </small>
                    </span>
                  </span>
                  <span role="cell">
                    <span className={styles.settlementStatus}>
                      {settlementLabels[record.settlementStatus ?? "settled"]}
                    </span>
                  </span>
                  <span className={styles.consumedAmount} role="cell">
                    −{Math.abs(record.amount).toLocaleString("zh-CN")}
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
