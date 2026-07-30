import {
  ArrowDownLeft,
  CreditCard,
  ListFilter,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { OrganizationMember } from "../../domain/workspace/workspace";
import styles from "./OrganizationCenterPage.module.css";
import {
  CREDIT_ALLOCATION_RECORDS,
  CREDIT_INCOME_RECORDS,
  getMemberCreditBalance,
  ORGANIZATION_CREDIT_SUMMARY,
  type CreditAllocationRecord,
  type CreditAllocationValidity,
  type CreditGenerationTaskType,
  type CreditIncomeKind,
} from "./organization-credit-data";

export type CreditDrawerKind = "income" | "allocation" | "consumption";

interface CreditDetailDrawerProps {
  kind: CreditDrawerKind | null;
  memberAccount?: string;
  accountView?: boolean;
  members: OrganizationMember[];
  onKindChange: (kind: CreditDrawerKind) => void;
  onMemberFilterChange: (memberAccount?: string) => void;
  onClose: () => void;
}

type AllocationRecord = CreditAllocationRecord & {
  action: "grant" | "reclaim";
};

interface ConsumptionFilters {
  taskType: CreditGenerationTaskType | "";
  modelName: string;
}

const emptyConsumptionFilters: ConsumptionFilters = {
  taskType: "",
  modelName: "",
};

const generationTaskTypes: CreditGenerationTaskType[] = [
  "图片生成",
  "图生视频",
  "参考生视频",
];

const incomeIcons: Record<CreditIncomeKind, typeof ArrowDownLeft> = {
  purchase: CreditCard,
  grant: Sparkles,
  adjustment: RotateCcw,
};

const allocationLabels = {
  grant: "发放",
  reclaim: "回收",
} as const;

const incomeLabels: Record<CreditIncomeKind, string> = {
  purchase: "充值",
  grant: "赠送",
  adjustment: "调整",
};

function formatGenerationSpec(record: CreditAllocationRecord) {
  const spec = record.generationSpec;
  if (!spec) return "—";
  return [
    spec.resolution,
    spec.aspectRatio,
    spec.imageCount ? `${spec.imageCount} 张` : undefined,
    spec.durationSeconds ? `${spec.durationSeconds} 秒` : undefined,
  ].filter(Boolean).join(" · ");
}

function renderAllocationValidity(validity?: CreditAllocationValidity) {
  if (!validity) return <strong>—</strong>;
  if (validity.kind === "permanent") return <strong>永久</strong>;
  if (validity.kind === "until") {
    return (
      <>
        <strong>截至</strong>
        <small>{validity.endsAt}</small>
      </>
    );
  }
  return (
    <>
      <strong>{validity.startsAt}</strong>
      <small>至 {validity.endsAt}</small>
    </>
  );
}

export function CreditDetailDrawer({
  kind,
  memberAccount,
  accountView = false,
  members,
  onKindChange,
  onMemberFilterChange,
  onClose,
}: CreditDetailDrawerProps) {
  const drawerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [consumptionFilters, setConsumptionFilters] = useState<ConsumptionFilters>(
    emptyConsumptionFilters,
  );
  const [filtersOpen, setFiltersOpen] = useState(false);

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
  const isMemberLedger = Boolean(accountView && selectedMember && memberAccount);
  const memberRecords = memberAccount
    ? CREDIT_ALLOCATION_RECORDS.filter((record) => record.memberAccount === memberAccount)
    : CREDIT_ALLOCATION_RECORDS;
  const allocationRecords = memberRecords.filter(
    (record): record is AllocationRecord => record.action !== "consume",
  );
  const consumptionRecords = memberRecords.filter((record) => record.action === "consume");
  const filteredConsumptionRecords = consumptionRecords.filter((record) => {
    if (consumptionFilters.taskType && record.taskType !== consumptionFilters.taskType) return false;
    if (consumptionFilters.modelName && record.modelName !== consumptionFilters.modelName) return false;
    return true;
  });
  const allocationTotals = allocationRecords.reduce(
    (totals, record) => {
      if (record.action === "grant") totals.granted += record.amount;
      else totals.reclaimed += Math.abs(record.amount);
      return totals;
    },
    { granted: 0, reclaimed: 0 },
  );
  const consumedTotal = filteredConsumptionRecords.reduce(
    (total, record) => total + Math.abs(record.amount),
    0,
  );
  const selectedBalance = selectedMember
    ? getMemberCreditBalance(selectedMember)
    : ORGANIZATION_CREDIT_SUMMARY.allocated;
  const activeFilterCount = Object.values(consumptionFilters).filter(Boolean).length
    + (!isMemberLedger && memberAccount ? 1 : 0);
  const modelOptionRecords = isMemberLedger
    ? consumptionRecords
    : CREDIT_ALLOCATION_RECORDS.filter((record) => record.action === "consume");
  const modelOptions = Array.from(new Set(modelOptionRecords.map((record) => record.modelName)))
    .filter((model): model is string => Boolean(model))
    .sort((left, right) => left.localeCompare(right, "zh-CN"));
  const memberFilterSelect = (
    <select
      className={styles.memberFilterSelect}
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
  );
  const consumptionFilterTrigger = (
    <button
      className={styles.consumptionFilterTrigger}
      type="button"
      aria-expanded={filtersOpen}
      onClick={() => setFiltersOpen((current) => !current)}
    >
      <ListFilter aria-hidden="true" />
      筛选
      {activeFilterCount ? <strong>{activeFilterCount}</strong> : null}
    </button>
  );
  const consumptionFilterPanel = filtersOpen ? (
    <div className={styles.consumptionFilterPanel} role="group" aria-label="筛选消耗记录">
      {!isMemberLedger ? (
        <label>
          <span>成员</span>
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
        </label>
      ) : null}
      <label>
        <span>任务类型</span>
        <select
          aria-label="任务类型"
          value={consumptionFilters.taskType}
          onChange={(event) => setConsumptionFilters((current) => ({
            ...current,
            taskType: event.target.value as CreditGenerationTaskType | "",
          }))}
        >
          <option value="">全部</option>
          {generationTaskTypes.map((taskType) => (
            <option key={taskType} value={taskType}>{taskType}</option>
          ))}
        </select>
      </label>
      <label>
        <span>模型</span>
        <select
          aria-label="模型"
          value={consumptionFilters.modelName}
          onChange={(event) => setConsumptionFilters((current) => ({
            ...current,
            modelName: event.target.value,
          }))}
        >
          <option value="">全部</option>
          {modelOptions.map((model) => <option key={model} value={model}>{model}</option>)}
        </select>
      </label>
      <button
        className={styles.clearConsumptionFilters}
        type="button"
        disabled={!activeFilterCount}
        onClick={() => {
          setConsumptionFilters(emptyConsumptionFilters);
          if (!isMemberLedger) onMemberFilterChange(undefined);
        }}
      >
        清除筛选
      </button>
    </div>
  ) : null;

  return createPortal(
    <div
      className={styles.drawerBackdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        ref={drawerRef}
        className={`${styles.creditDrawer} ${isMemberLedger ? styles.memberCreditDrawer : ""}`}
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
            <h2 id="credit-drawer-title">
              {isMemberLedger ? `${selectedMember?.displayName} 账户记录` : "积分变动记录"}
            </h2>
            {isMemberLedger ? (
              <p className={styles.memberLedgerIdentity}>
                <span>{selectedMember?.loginIdentifier}</span>
                <span>可用余额 <strong>{selectedBalance.toLocaleString("zh-CN")}</strong></span>
              </p>
            ) : (
              <p>查看组织积分的入账、内部额度分配与任务消耗</p>
            )}
          </span>
          <button ref={closeButtonRef} type="button" aria-label="关闭详情" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>

        {!isMemberLedger ? (
          <div className={styles.drawerTabs} role="tablist" aria-label="积分变动记录类型">
          <button
            id="credit-tab-income"
            type="button"
            role="tab"
            aria-controls="credit-panel-income"
            aria-selected={kind === "income"}
            className={kind === "income" ? styles.activeDrawerTab : undefined}
            onClick={() => onKindChange("income")}
          >
            入账记录
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
            分配记录
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
            消耗记录
          </button>
          </div>
        ) : null}

        {isMemberLedger ? (
          <div className={styles.memberLedgerBody}>
            <section className={styles.memberLedgerSection}>
              <div className={styles.memberLedgerSectionHeading}>
                <span>
                  <h3>额度变动</h3>
                  <p>成员账户积分的发放与回收</p>
                </span>
                <small>共 {allocationRecords.length} 笔</small>
              </div>
              <div className={styles.memberLedgerScroll}>
                <div
                  className={`${styles.allocationRecords} ${styles.memberAllocationRecordTable}`}
                  role="table"
                  aria-label={`${selectedMember?.displayName ?? "成员"}额度变动记录`}
                >
                  <div className={styles.drawerTableHeader} role="row">
                    <span role="columnheader">时间</span>
                    <span role="columnheader">类型</span>
                    <span role="columnheader">额度变动</span>
                    <span role="columnheader">有效期</span>
                    <span role="columnheader">操作人</span>
                    <span role="columnheader">备注</span>
                  </div>
                  {allocationRecords.length ? allocationRecords.map((record) => (
                      <article key={record.id} role="row">
                        <span className={styles.ledgerTime} role="cell">
                          <strong>{record.date.slice(0, 10)}</strong>
                          <small>{record.date.slice(11)}</small>
                        </span>
                        <span
                          className={`${styles.allocationAction} ${
                            record.action === "grant"
                              ? styles.allocationGrant
                              : styles.allocationReclaim
                          }`}
                          role="cell"
                        >
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
                        </span>
                        <span className={styles.allocationValidity} role="cell">
                          {renderAllocationValidity(record.validity)}
                        </span>
                        <span role="cell">
                          <strong>{record.operator}</strong>
                        </span>
                        <span role="cell">
                          <small>{record.note || "—"}</small>
                        </span>
                      </article>
                  )) : (
                    <div className={styles.memberLedgerEmpty}>暂无额度变动</div>
                  )}
                </div>
              </div>
            </section>

            <section className={styles.memberLedgerSection}>
              <div className={styles.memberLedgerSectionHeading}>
                <span>
                  <h3>消耗明细</h3>
                  <p>生成任务产生的积分结算流水</p>
                </span>
                <div className={styles.memberLedgerHeadingActions}>
                  <small>
                    共 {filteredConsumptionRecords.length} 条 · 消耗{" "}
                    {consumedTotal.toLocaleString("zh-CN")} 积分
                  </small>
                  {consumptionFilterTrigger}
                </div>
              </div>
              <div className={styles.memberLedgerScroll}>
                {consumptionFilterPanel}
                <div
                  className={`${styles.allocationRecords} ${styles.memberConsumptionRecordTable}`}
                  role="table"
                  aria-label={`${selectedMember?.displayName ?? "成员"}积分消耗明细`}
                >
                  <div className={styles.drawerTableHeader} role="row">
                    <span role="columnheader">时间</span>
                    <span role="columnheader">项目</span>
                    <span role="columnheader">任务类型</span>
                    <span role="columnheader">模型</span>
                    <span role="columnheader">生成规格</span>
                    <span role="columnheader">消耗积分</span>
                  </div>
                  {filteredConsumptionRecords.length ? filteredConsumptionRecords.map((record) => (
                    <article key={record.id} role="row">
                      <span className={styles.ledgerTime} role="cell">
                        <strong>{record.date.slice(0, 10)}</strong>
                        <small>{record.date.slice(11)}</small>
                      </span>
                      <span className={styles.ledgerProject} role="cell">
                        <strong>{record.projectName ?? "未命名项目"}</strong>
                      </span>
                      <span className={styles.taskTypeCell} role="cell">
                        {record.taskType ?? "图片生成"}
                      </span>
                      <span className={styles.modelCell} role="cell">
                        <strong>{record.modelName ?? "—"}</strong>
                      </span>
                      <span className={styles.generationSpecCell} role="cell">
                        {formatGenerationSpec(record)}
                      </span>
                      <span className={styles.consumedAmount} role="cell">
                        −{Math.abs(record.amount).toLocaleString("zh-CN")}
                      </span>
                    </article>
                  )) : (
                    <div className={styles.memberLedgerEmpty}>
                      {activeFilterCount ? "没有符合筛选条件的记录" : "暂无消耗明细"}
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {!isMemberLedger && kind === "income" ? (
          <section
            className={styles.drawerPanel}
            id="credit-panel-income"
            role="tabpanel"
            aria-labelledby="credit-tab-income"
          >
            <div className={styles.drawerSectionHeading}>
              <h3>入账明细</h3>
              <span className={styles.drawerSectionStats}>
                共 {CREDIT_INCOME_RECORDS.length} 笔
                <i aria-hidden="true" />
                累计入账
                <strong>
                  {ORGANIZATION_CREDIT_SUMMARY.lifetimeIncome.toLocaleString("zh-CN")}
                </strong>
                积分
              </span>
            </div>
            <div
              className={`${styles.allocationRecords} ${styles.incomeRecordTable}`}
              role="table"
              aria-label="组织积分入账记录"
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

        {!isMemberLedger && kind === "allocation" ? (
          <section
            className={styles.drawerPanel}
            id="credit-panel-allocation"
            role="tabpanel"
            aria-labelledby="credit-tab-allocation"
          >
            <div className={styles.drawerSectionHeading}>
              <h3>发放与回收明细</h3>
              <div className={styles.drawerSectionHeadingActions}>
                <span className={styles.drawerSectionStats}>
                  共 {allocationRecords.length} 笔
                  <i aria-hidden="true" />
                  已发放
                  <strong>{allocationTotals.granted.toLocaleString("zh-CN")}</strong>
                  <i aria-hidden="true" />
                  已回收
                  <strong>{allocationTotals.reclaimed.toLocaleString("zh-CN")}</strong>
                </span>
                {memberFilterSelect}
              </div>
            </div>
            <div
              className={`${styles.allocationRecords} ${styles.allocationRecordTable}`}
              role="table"
              aria-label="成员积分分配记录"
            >
              <div className={styles.drawerTableHeader} role="row">
                <span role="columnheader">时间</span>
                <span role="columnheader">成员</span>
                <span role="columnheader">类型</span>
                <span role="columnheader">额度变动</span>
                <span role="columnheader">有效期</span>
                <span role="columnheader">操作人</span>
                <span role="columnheader">备注</span>
              </div>
              {allocationRecords.map((record) => (
                  <article key={record.id} role="row">
                    <span className={styles.ledgerTime} role="cell">
                      <strong>{record.date.slice(0, 10)}</strong>
                      <small>{record.date.slice(11)}</small>
                    </span>
                    <span role="cell">
                      <strong>{record.memberName}</strong>
                      <small>{record.memberAccount}</small>
                    </span>
                    <span
                      className={`${styles.allocationAction} ${
                        record.action === "grant"
                          ? styles.allocationGrant
                          : styles.allocationReclaim
                      }`}
                      role="cell"
                    >
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
                    </span>
                    <span className={styles.allocationValidity} role="cell">
                      {renderAllocationValidity(record.validity)}
                    </span>
                    <span role="cell">
                      <strong>{record.operator}</strong>
                    </span>
                    <span role="cell">
                      <small>{record.note}</small>
                    </span>
                  </article>
              ))}
            </div>
          </section>
        ) : null}

        {!isMemberLedger && kind === "consumption" ? (
          <section
            className={styles.drawerPanel}
            id="credit-panel-consumption"
            role="tabpanel"
            aria-labelledby="credit-tab-consumption"
          >
            <div className={styles.drawerSectionHeading}>
              <h3>任务消耗</h3>
              <div className={styles.drawerSectionHeadingActions}>
                <span className={styles.drawerSectionStats}>
                  共 {filteredConsumptionRecords.length} 条 · 合计消耗{" "}
                  <strong>{consumedTotal.toLocaleString("zh-CN")}</strong>
                  积分
                </span>
                {consumptionFilterTrigger}
              </div>
            </div>
            {consumptionFilterPanel}
            <div
              className={`${styles.allocationRecords} ${styles.consumptionRecords}`}
              role="table"
              aria-label="任务积分消耗记录"
            >
              <div className={styles.drawerTableHeader} role="row">
                <span role="columnheader">时间</span>
                <span role="columnheader">成员</span>
                <span role="columnheader">项目</span>
                <span role="columnheader">任务类型</span>
                <span role="columnheader">模型</span>
                <span role="columnheader">生成规格</span>
                <span role="columnheader">消耗积分</span>
              </div>
              {filteredConsumptionRecords.length ? filteredConsumptionRecords.map((record) => (
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
                  <span className={styles.taskTypeCell} role="cell">
                    {record.taskType ?? "图片生成"}
                  </span>
                  <span className={styles.modelCell} role="cell">
                    <strong>{record.modelName ?? "—"}</strong>
                  </span>
                  <span className={styles.generationSpecCell} role="cell">
                    {formatGenerationSpec(record)}
                  </span>
                  <span className={styles.consumedAmount} role="cell">
                    −{Math.abs(record.amount).toLocaleString("zh-CN")}
                  </span>
                </article>
              )) : (
                <div className={styles.memberLedgerEmpty}>
                  {activeFilterCount ? "没有符合筛选条件的记录" : "暂无消耗记录"}
                </div>
              )}
            </div>
          </section>
        ) : null}
      </aside>
    </div>,
    document.body,
  );
}
