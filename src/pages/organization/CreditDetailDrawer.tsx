import {
  ArrowDownLeft,
  CalendarDays,
  Check,
  ChevronDown,
  CreditCard,
  Download,
  FileDown,
  FileSpreadsheet,
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
import {
  buildCreditLedgerCsv,
  buildCreditLedgerExcelXml,
  type CreditLedgerExportData,
} from "./organization-credit-export";

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

type CreditLedgerRange = "all" | "month" | "quarter" | "custom";

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

const exportKindLabels: Record<CreditDrawerKind, string> = {
  income: "入账记录",
  allocation: "分配记录",
  consumption: "消耗记录",
};

const ledgerRangeLabels: Record<CreditLedgerRange, string> = {
  all: "全部时间",
  month: "本月",
  quarter: "近 3 个月",
  custom: "自定义",
};

const organizationAllocationRecords = CREDIT_ALLOCATION_RECORDS.filter(
  (record): record is AllocationRecord => record.action !== "consume",
);
const organizationConsumptionRecords = CREDIT_ALLOCATION_RECORDS.filter(
  (record) => record.action === "consume",
);
const organizationExportData: CreditLedgerExportData = {
  incomeRecords: CREDIT_INCOME_RECORDS,
  allocationRecords: organizationAllocationRecords,
  consumptionRecords: organizationConsumptionRecords,
};

function downloadFile(content: string, fileName: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function getExportDateStamp(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
  }).format(new Date());
}

function getLedgerRangeBounds(
  range: CreditLedgerRange,
  customStart: string,
  customEnd: string,
): { start?: string; end?: string } {
  if (range === "all") return {};
  if (range === "custom") return { start: customStart, end: customEnd };
  const end = getExportDateStamp();
  const [year, month] = end.split("-").map(Number);
  const monthOffset = range === "quarter" ? 2 : 0;
  const start = new Date(Date.UTC(year, month - 1 - monthOffset, 1))
    .toISOString()
    .slice(0, 10);
  return { start, end };
}

function filterRecordsByLedgerRange<T extends { date: string }>(
  records: T[],
  range: CreditLedgerRange,
  customStart: string,
  customEnd: string,
): T[] {
  const { start, end } = getLedgerRangeBounds(range, customStart, customEnd);
  if (!start && !end) return records;
  return records.filter((record) => {
    const date = record.date.slice(0, 10);
    return (!start || date >= start) && (!end || date <= end);
  });
}

function formatLedgerRangeLabel(
  range: CreditLedgerRange,
  customStart: string,
  customEnd: string,
): string {
  if (range === "all") return ledgerRangeLabels.all;
  const { start, end } = getLedgerRangeBounds(range, customStart, customEnd);
  if (!start || !end) return ledgerRangeLabels[range];
  return `${start} 至 ${end}`;
}

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
  const rangeMenuRef = useRef<HTMLDetailsElement>(null);
  const exportMenuRef = useRef<HTMLDetailsElement>(null);
  const [consumptionFilters, setConsumptionFilters] = useState<ConsumptionFilters>(
    emptyConsumptionFilters,
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [rangeMenuOpen, setRangeMenuOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [ledgerRange, setLedgerRange] = useState<CreditLedgerRange>("all");
  const [customRangeStart, setCustomRangeStart] = useState(
    () => `${getExportDateStamp().slice(0, 7)}-01`,
  );
  const [customRangeEnd, setCustomRangeEnd] = useState(getExportDateStamp);

  useEffect(() => {
    if (!kind) return undefined;
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (exportMenuRef.current?.open) {
        exportMenuRef.current.removeAttribute("open");
        return;
      }
      if (rangeMenuRef.current?.open) {
        rangeMenuRef.current.removeAttribute("open");
        return;
      }
      onClose();
    };
    const closeFloatingMenus = (event: PointerEvent) => {
      if (!exportMenuRef.current?.contains(event.target as Node)) {
        exportMenuRef.current?.removeAttribute("open");
      }
      if (!rangeMenuRef.current?.contains(event.target as Node)) {
        rangeMenuRef.current?.removeAttribute("open");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", closeFloatingMenus);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", closeFloatingMenus);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [kind, onClose]);

  if (!kind) return null;

  const selectedMember = members.find((member) => member.loginIdentifier === memberAccount);
  const isMemberLedger = Boolean(accountView && selectedMember && memberAccount);
  const memberRecords = memberAccount
    ? CREDIT_ALLOCATION_RECORDS.filter((record) => record.memberAccount === memberAccount)
    : CREDIT_ALLOCATION_RECORDS;
  const memberAllocationRecords = memberRecords.filter(
    (record): record is AllocationRecord => record.action !== "consume",
  );
  const memberConsumptionRecords = memberRecords.filter((record) => record.action === "consume");
  const ledgerRangeIsValid = ledgerRange !== "custom"
    || Boolean(customRangeStart && customRangeEnd && customRangeStart <= customRangeEnd);
  const incomeRecords = isMemberLedger
    ? CREDIT_INCOME_RECORDS
    : filterRecordsByLedgerRange(
        CREDIT_INCOME_RECORDS,
        ledgerRange,
        customRangeStart,
        customRangeEnd,
      );
  const allocationRecords = isMemberLedger
    ? memberAllocationRecords
    : filterRecordsByLedgerRange(
        organizationAllocationRecords,
        ledgerRange,
        customRangeStart,
        customRangeEnd,
      );
  const taskFilteredConsumptionRecords = memberConsumptionRecords.filter((record) => {
    if (consumptionFilters.taskType && record.taskType !== consumptionFilters.taskType) return false;
    if (consumptionFilters.modelName && record.modelName !== consumptionFilters.modelName) return false;
    return true;
  });
  const filteredConsumptionRecords = isMemberLedger
    ? taskFilteredConsumptionRecords
    : filterRecordsByLedgerRange(
        taskFilteredConsumptionRecords,
        ledgerRange,
        customRangeStart,
        customRangeEnd,
      );
  const allocationTotals = allocationRecords.reduce(
    (totals, record) => {
      if (record.action === "grant") totals.granted += record.amount;
      else totals.reclaimed += Math.abs(record.amount);
      return totals;
    },
    { granted: 0, reclaimed: 0 },
  );
  const incomeTotal = incomeRecords.reduce((total, record) => total + record.amount, 0);
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
    ? memberConsumptionRecords
    : organizationConsumptionRecords;
  const modelOptions = Array.from(new Set(modelOptionRecords.map((record) => record.modelName)))
    .filter((model): model is string => Boolean(model))
    .sort((left, right) => left.localeCompare(right, "zh-CN"));
  const currentExportData: CreditLedgerExportData = {
    incomeRecords,
    allocationRecords,
    consumptionRecords: filteredConsumptionRecords,
  };
  const fullRangeExportData: CreditLedgerExportData = {
    incomeRecords: filterRecordsByLedgerRange(
      organizationExportData.incomeRecords,
      ledgerRange,
      customRangeStart,
      customRangeEnd,
    ),
    allocationRecords: filterRecordsByLedgerRange(
      organizationExportData.allocationRecords,
      ledgerRange,
      customRangeStart,
      customRangeEnd,
    ),
    consumptionRecords: filterRecordsByLedgerRange(
      organizationExportData.consumptionRecords,
      ledgerRange,
      customRangeStart,
      customRangeEnd,
    ),
  };
  const ledgerRangeLabel = formatLedgerRangeLabel(
    ledgerRange,
    customRangeStart,
    customRangeEnd,
  );
  const ledgerRangeSummary = ledgerRange === "custom" && ledgerRangeIsValid
    ? `${customRangeStart.slice(5)}–${customRangeEnd.slice(5)}`
    : ledgerRangeLabels[ledgerRange];
  const exportRecords = (format: "csv" | "excel") => {
    if (!ledgerRangeIsValid) return;
    const stamp = getExportDateStamp();
    const rangeLabel = ledgerRangeLabel.replaceAll(" ", "");
    if (format === "excel") {
      downloadFile(
        buildCreditLedgerExcelXml(fullRangeExportData),
        `Reelay-组织积分账户流水-${rangeLabel}-${stamp}.xls`,
        "application/vnd.ms-excel;charset=utf-8",
      );
    } else {
      downloadFile(
        buildCreditLedgerCsv(kind, currentExportData),
        `Reelay-积分流水-${exportKindLabels[kind]}-${rangeLabel}-${stamp}.csv`,
        "text/csv;charset=utf-8",
      );
    }
    exportMenuRef.current?.removeAttribute("open");
  };
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
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), summary, a[href], [tabindex]:not([tabindex="-1"])',
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
          <button
            ref={closeButtonRef}
            className={styles.drawerCloseButton}
            type="button"
            aria-label="关闭详情"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </button>
        </header>

        {!isMemberLedger ? (
          <div className={styles.drawerTabBar}>
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
            <div className={styles.drawerTabActions}>
              <details
                ref={rangeMenuRef}
                className={styles.creditRangeMenu}
                onToggle={(event) => {
                  setRangeMenuOpen(event.currentTarget.open);
                  if (event.currentTarget.open) {
                    exportMenuRef.current?.removeAttribute("open");
                  }
                }}
              >
                <summary
                  role="button"
                  aria-expanded={rangeMenuOpen}
                  aria-label={`筛选记录时间，当前${ledgerRangeLabel}`}
                >
                  <CalendarDays aria-hidden="true" />
                  <span>{ledgerRangeSummary}</span>
                  <ChevronDown aria-hidden="true" />
                </summary>
                <div>
                  <div
                    className={styles.creditRangeOptions}
                    role="group"
                    aria-label="记录时间范围"
                  >
                    {(Object.keys(ledgerRangeLabels) as CreditLedgerRange[]).map((range) => (
                      <button
                        key={range}
                        type="button"
                        aria-pressed={ledgerRange === range}
                        onClick={() => {
                          setLedgerRange(range);
                          if (range !== "custom") {
                            rangeMenuRef.current?.removeAttribute("open");
                          }
                        }}
                      >
                        <span>{ledgerRangeLabels[range]}</span>
                        {ledgerRange === range ? <Check aria-hidden="true" /> : null}
                      </button>
                    ))}
                  </div>
                  {ledgerRange === "custom" ? (
                    <div className={styles.creditRangeCustomDates}>
                      <label>
                        <span>开始日期</span>
                        <input
                          type="date"
                          aria-label="记录开始日期"
                          value={customRangeStart}
                          max={customRangeEnd}
                          onChange={(event) => setCustomRangeStart(event.target.value)}
                        />
                      </label>
                      <label>
                        <span>结束日期</span>
                        <input
                          type="date"
                          aria-label="记录结束日期"
                          value={customRangeEnd}
                          min={customRangeStart}
                          max={getExportDateStamp()}
                          onChange={(event) => setCustomRangeEnd(event.target.value)}
                        />
                      </label>
                      {!ledgerRangeIsValid ? (
                        <small role="alert">结束日期不能早于开始日期</small>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </details>
              <details
                ref={exportMenuRef}
                className={styles.creditExportMenu}
                onToggle={(event) => {
                  setExportMenuOpen(event.currentTarget.open);
                  if (event.currentTarget.open) {
                    rangeMenuRef.current?.removeAttribute("open");
                  }
                }}
              >
                <summary
                  role="button"
                  aria-expanded={exportMenuOpen}
                  aria-label="导出积分账户流水"
                >
                  <Download aria-hidden="true" />
                  <span>导出流水</span>
                  <ChevronDown aria-hidden="true" />
                </summary>
                <div>
                  <button
                    type="button"
                    aria-label="导出全部积分账户流水为 Excel"
                    disabled={!ledgerRangeIsValid}
                    onClick={() => exportRecords("excel")}
                  >
                    <FileSpreadsheet aria-hidden="true" />
                    <span>
                      <strong>Excel</strong>
                      <small>当前时间范围 · 全部类型</small>
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`导出当前${exportKindLabels[kind]}为 CSV`}
                    disabled={!ledgerRangeIsValid}
                    onClick={() => exportRecords("csv")}
                  >
                    <FileDown aria-hidden="true" />
                    <span>
                      <strong>CSV</strong>
                      <small>当前时间范围 · 当前页签及筛选</small>
                    </span>
                  </button>
                </div>
              </details>
            </div>
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
                共 {incomeRecords.length} 笔
                <i aria-hidden="true" />
                累计入账
                <strong>{incomeTotal.toLocaleString("zh-CN")}</strong>
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
              {incomeRecords.length ? incomeRecords.map((record) => {
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
              }) : (
                <div className={styles.memberLedgerEmpty}>当前时间范围内暂无入账记录</div>
              )}
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
              {allocationRecords.length ? allocationRecords.map((record) => (
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
              )) : (
                <div className={styles.memberLedgerEmpty}>
                  当前时间范围内暂无分配记录
                </div>
              )}
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
                  {activeFilterCount
                    ? "没有符合筛选条件的记录"
                    : ledgerRange !== "all"
                      ? "当前时间范围内暂无消耗记录"
                      : "暂无消耗记录"}
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
