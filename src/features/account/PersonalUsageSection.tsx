import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Image,
  ListFilter,
  ListTree,
  Video,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { SessionActor } from "../../domain/identity/session";
import {
  createOrganizationUsageDemoData,
  filterUsageRecords,
  getUsageComposition,
  getUsageRange,
  getUsageTrend,
  type UsageActivityKind,
  type UsageRangePreset,
  type UsageTrendPoint,
} from "../../pages/organization/organization-usage-data";
import styles from "./AccountSettingsDialog.module.css";

interface PersonalUsageSectionProps {
  actor: SessionActor;
}

type PersonalCreditsView = "analysis" | "ledger";
type PersonalLedgerDirection = "all" | "gain" | "consume";
type AnalysisRangePreset = Extract<UsageRangePreset, "rolling7" | "rolling30" | "month">;
type PersonalAnalysisDetailView = "trend" | "daily";
type PersonalSourceDimension = "project" | "model";

interface PersonalLedgerEntry {
  credits: number;
  direction: Exclude<PersonalLedgerDirection, "all">;
  id: string;
  modelName: string;
  occurredAt: string;
  projectName: string;
  specification: string;
  taskType: string;
  typeLabel: string;
}

interface AppliedLedgerRange {
  end: string;
  start: string;
}

const numberFormatter = new Intl.NumberFormat("zh-CN");
const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const dayInMilliseconds = 86_400_000;
const currentDemoBalance = 3_000;
const personalLedgerPageSize = 10;

const analysisRangeOptions: Array<{ id: AnalysisRangePreset; label: string }> = [
  { id: "rolling7", label: "近 7 天" },
  { id: "rolling30", label: "近 30 天" },
  { id: "month", label: "本月" },
];

const ledgerFilterOptions: Array<{ id: PersonalLedgerDirection; label: string }> = [
  { id: "all", label: "全部" },
  { id: "gain", label: "获得" },
  { id: "consume", label: "消耗" },
];

const grantTemplates = [
  { daysAgo: 1, credits: 5_000 },
  { daysAgo: 33, credits: 3_000 },
  { daysAgo: 63, credits: 6_000 },
  { daysAgo: 93, credits: 4_000 },
  { daysAgo: 123, credits: 5_000 },
] as const;

const personalCompositionGroups: Array<{
  id: "video" | "image" | "processing";
  kinds: ReadonlySet<UsageActivityKind>;
  label: string;
}> = [
  { id: "video", label: "视频生成", kinds: new Set<UsageActivityKind>(["video"]) },
  { id: "image", label: "图片生成", kinds: new Set<UsageActivityKind>(["image"]) },
  { id: "processing", label: "媒体处理", kinds: new Set<UsageActivityKind>(["enhancement", "agent"]) },
];

function getPaginationItems(page: number, pageCount: number): Array<number | "ellipsis"> {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, "ellipsis", pageCount];
  if (page >= pageCount - 3) {
    return [1, "ellipsis", pageCount - 4, pageCount - 3, pageCount - 2, pageCount - 1, pageCount];
  }
  return [1, "ellipsis", page - 1, page, page + 1, "ellipsis", pageCount];
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function PersonalTrendChart({ points, rangeLabel }: { points: UsageTrendPoint[]; rangeLabel: string }) {
  const width = 680;
  const height = 164;
  const inset = { top: 12, right: 8, bottom: 26, left: 38 };
  const plotWidth = width - inset.left - inset.right;
  const plotHeight = height - inset.top - inset.bottom;
  const maximum = Math.max(1, ...points.map((point) => Math.max(0, point.credits)));
  const chartPoints = points.map((point, index) => ({
    ...point,
    x: inset.left + (points.length <= 1 ? plotWidth / 2 : index / (points.length - 1) * plotWidth),
    y: inset.top + plotHeight - Math.max(0, point.credits) / maximum * plotHeight,
  }));
  const line = chartPoints.map((point) => `${point.x},${point.y}`).join(" ");
  const area = chartPoints.length > 0
    ? `M ${chartPoints[0].x} ${inset.top + plotHeight} L ${chartPoints
        .map((point) => `${point.x} ${point.y}`)
        .join(" L ")} L ${chartPoints.at(-1)?.x ?? inset.left} ${inset.top + plotHeight} Z`
    : "";
  const labelIndexes = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])]
    .filter((index) => index >= 0 && index < points.length);

  return (
    <svg
      className={styles.personalTrendChart}
      role="img"
      aria-label={`${rangeLabel}个人积分消耗走势`}
      viewBox={`0 0 ${width} ${height}`}
    >
      {[0, 0.5, 1].map((ratio) => {
        const y = inset.top + plotHeight * ratio;
        return (
          <line
            key={ratio}
            className={styles.personalTrendGridLine}
            x1={inset.left}
            x2={width - inset.right}
            y1={y}
            y2={y}
          />
        );
      })}
      {area ? <path className={styles.personalTrendArea} d={area} /> : null}
      {line ? <polyline className={styles.personalTrendLine} points={line} /> : null}
      {chartPoints.map((point) => (
        <circle
          key={point.key}
          className={styles.personalTrendPoint}
          cx={point.x}
          cy={point.y}
          r="2.6"
        >
          <title>{point.label} · {numberFormatter.format(point.credits)} 积分 · {point.tasks} 项任务</title>
        </circle>
      ))}
      {labelIndexes.map((index) => {
        const point = chartPoints[index];
        return (
          <text
            key={point.key}
            className={styles.personalTrendLabel}
            textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
            x={point.x}
            y={height - 6}
          >
            {point.label}
          </text>
        );
      })}
    </svg>
  );
}

export function PersonalUsageSection({ actor }: PersonalUsageSectionProps) {
  const [activeView, setActiveView] = useState<PersonalCreditsView>("ledger");
  const [analysisRangePreset, setAnalysisRangePreset] = useState<AnalysisRangePreset>("rolling30");
  const [analysisDetailView, setAnalysisDetailView] = useState<PersonalAnalysisDetailView>("trend");
  const [sourceDimension, setSourceDimension] = useState<PersonalSourceDimension>("project");
  const [ledgerDirection, setLedgerDirection] = useState<PersonalLedgerDirection>("all");
  const [ledgerPage, setLedgerPage] = useState(1);
  const [appliedLedgerRange, setAppliedLedgerRange] = useState<AppliedLedgerRange | null>(null);
  const [draftLedgerStart, setDraftLedgerStart] = useState("");
  const [draftLedgerEnd, setDraftLedgerEnd] = useState("");
  const [rangeMenuOpen, setRangeMenuOpen] = useState(false);
  const [now] = useState(() => new Date());
  const rangeMenuRef = useRef<HTMLDetailsElement>(null);
  const ledgerStartDateRef = useRef<HTMLInputElement>(null);
  const ledgerEndDateRef = useRef<HTMLInputElement>(null);
  const demoData = useMemo(() => createOrganizationUsageDemoData([], now), [now]);
  const personalRecords = useMemo(
    () => demoData.records.filter((record) => record.memberAccount === actor.account),
    [actor.account, demoData.records],
  );
  const gainEntries = useMemo<PersonalLedgerEntry[]>(() => grantTemplates.map((template, index) => ({
    credits: template.credits,
    direction: "gain" as const,
    id: `personal-grant-${index}-${actor.id}`,
    modelName: "—",
    occurredAt: new Date(now.getTime() - template.daysAgo * dayInMilliseconds).toISOString(),
    projectName: "—",
    specification: "—",
    taskType: "—",
    typeLabel: "组织发放",
  })), [actor.id, now]);
  const allLedgerEntries = useMemo<PersonalLedgerEntry[]>(() => [
    ...gainEntries,
    ...personalRecords.map((record) => {
      const refunded = record.status === "refunded";
      return {
        credits: refunded ? Math.abs(record.credits) : -Math.abs(record.credits),
        direction: refunded ? "gain" as const : "consume" as const,
        id: record.id,
        modelName: record.modelName,
        occurredAt: record.occurredAt,
        projectName: record.projectName,
        specification: record.specification,
        taskType: record.activityLabel,
        typeLabel: refunded ? "任务退款" : "任务消耗",
      };
    }),
  ].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)), [gainEntries, personalRecords]);
  const analysisRange = useMemo(
    () => getUsageRange(analysisRangePreset, now),
    [analysisRangePreset, now],
  );
  const analysisRecords = useMemo(
    () => filterUsageRecords(personalRecords, analysisRange).filter((record) => record.status === "settled"),
    [analysisRange, personalRecords],
  );
  const monthRange = useMemo(() => getUsageRange("month", now), [now]);
  const monthGainCredits = gainEntries.reduce((total, entry) => {
    const occurredAt = new Date(entry.occurredAt);
    return total + (occurredAt >= monthRange.start && occurredAt < monthRange.end ? entry.credits : 0);
  }, 0);
  const monthConsumedCredits = filterUsageRecords(personalRecords, monthRange)
    .filter((record) => record.status === "settled")
    .reduce((total, record) => total + Math.abs(record.credits), 0);
  const dateFilteredLedgerEntries = appliedLedgerRange
    ? allLedgerEntries.filter((entry) => {
        const occurredAt = new Date(entry.occurredAt);
        const start = new Date(`${appliedLedgerRange.start}T00:00:00`);
        const end = new Date(`${appliedLedgerRange.end}T00:00:00`);
        end.setDate(end.getDate() + 1);
        return occurredAt >= start && occurredAt < end;
      })
    : allLedgerEntries;
  const filteredLedgerEntries = ledgerDirection === "all"
    ? dateFilteredLedgerEntries
    : dateFilteredLedgerEntries.filter((entry) => entry.direction === ledgerDirection);
  const ledgerPageCount = Math.max(1, Math.ceil(filteredLedgerEntries.length / personalLedgerPageSize));
  const currentLedgerPage = Math.min(ledgerPage, ledgerPageCount);
  const visibleLedgerEntries = filteredLedgerEntries.slice(
    (currentLedgerPage - 1) * personalLedgerPageSize,
    currentLedgerPage * personalLedgerPageSize,
  );
  const ledgerPaginationItems = getPaginationItems(currentLedgerPage, ledgerPageCount);
  const activeLedgerFilterCount = Number(ledgerDirection !== "all") + Number(appliedLedgerRange !== null);
  const consumedCredits = analysisRecords.reduce((total, record) => total + Math.abs(record.credits), 0);
  const imageCount = analysisRecords.reduce((total, record) => total + record.outputImages, 0);
  const videoSeconds = analysisRecords.reduce((total, record) => total + record.outputVideoSeconds, 0);
  const averageCredits = analysisRecords.length > 0 ? Math.round(consumedCredits / analysisRecords.length) : 0;
  const compositionTotal = Math.max(1, consumedCredits);
  const typeComposition = personalCompositionGroups.map((item) => {
    const records = analysisRecords.filter((record) => item.kinds.has(record.activityKind));
    const credits = records.reduce((total, record) => total + Math.abs(record.credits), 0);
    return { ...item, credits, share: credits / compositionTotal, tasks: records.length };
  });
  const sourceComposition = getUsageComposition(analysisRecords, sourceDimension).slice(0, 6);
  const trendPoints = getUsageTrend(analysisRecords, analysisRange);
  const maxSourceCredits = Math.max(1, ...sourceComposition.map((item) => item.credits));
  const analysisRangeLabel = analysisRangeOptions.find((option) => option.id === analysisRangePreset)?.label ?? "";

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!rangeMenuRef.current?.contains(event.target as Node)) {
        rangeMenuRef.current?.removeAttribute("open");
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") rangeMenuRef.current?.removeAttribute("open");
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const updateLedgerRange = (start: string, end: string) => {
    setDraftLedgerStart(start);
    setDraftLedgerEnd(end);
    setAppliedLedgerRange(start && end && start <= end ? { start, end } : null);
    setLedgerPage(1);
  };

  const showDatePicker = (input: HTMLInputElement | null) => {
    if (!input) return;
    try {
      if (input.showPicker) input.showPicker();
      else input.click();
    } catch {
      input.click();
    }
  };

  const viewControls = activeView === "ledger" ? (
    <details
      ref={rangeMenuRef}
      className={styles.personalLedgerFilter}
      data-active={activeLedgerFilterCount > 0}
      onToggle={(event) => setRangeMenuOpen(event.currentTarget.open)}
    >
      <summary
        role="button"
        aria-expanded={rangeMenuOpen}
        aria-label={`筛选个人积分流水，当前${activeLedgerFilterCount > 0 ? `${activeLedgerFilterCount}项筛选` : "无筛选"}`}
      >
        <ListFilter aria-hidden="true" />
        <span>筛选</span>
        {activeLedgerFilterCount > 0 ? (
          <b className={styles.personalLedgerFilterBadge}>{activeLedgerFilterCount}</b>
        ) : null}
        <ChevronDown aria-hidden="true" />
      </summary>
      <div className={styles.personalLedgerFilterPanel} role="group" aria-label="个人积分流水筛选">
        <div className={styles.personalLedgerFilterTypes} aria-label="积分流水类型">
          {ledgerFilterOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={ledgerDirection === option.id}
              onClick={() => {
                setLedgerDirection(option.id);
                setLedgerPage(1);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className={styles.personalLedgerFilterDates}>
          <span className={styles.personalLedgerDateField}>
            <button
              type="button"
              aria-label={`选择个人流水开始日期，当前${draftLedgerStart || "未选择"}`}
              onClick={() => showDatePicker(ledgerStartDateRef.current)}
            >
              <span>{draftLedgerStart ? draftLedgerStart.replaceAll("-", "/") : "年/月/日"}</span>
              <CalendarDays aria-hidden="true" />
            </button>
            <input
              ref={ledgerStartDateRef}
              type="date"
              aria-hidden="true"
              tabIndex={-1}
              value={draftLedgerStart}
              max={draftLedgerEnd || toDateInputValue(now)}
              onChange={(event) => updateLedgerRange(event.target.value, draftLedgerEnd)}
            />
          </span>
          <i aria-hidden="true">—</i>
          <span className={styles.personalLedgerDateField}>
            <button
              type="button"
              aria-label={`选择个人流水结束日期，当前${draftLedgerEnd || "未选择"}`}
              onClick={() => showDatePicker(ledgerEndDateRef.current)}
            >
              <span>{draftLedgerEnd ? draftLedgerEnd.replaceAll("-", "/") : "年/月/日"}</span>
              <CalendarDays aria-hidden="true" />
            </button>
            <input
              ref={ledgerEndDateRef}
              type="date"
              aria-hidden="true"
              tabIndex={-1}
              value={draftLedgerEnd}
              min={draftLedgerStart}
              max={toDateInputValue(now)}
              onChange={(event) => updateLedgerRange(draftLedgerStart, event.target.value)}
            />
          </span>
        </div>
      </div>
    </details>
  ) : (
    <div className={styles.personalAnalysisToolbar}>
      <span>统计周期</span>
      <div className={styles.personalRangeSwitch} aria-label="个人用量分析时间范围">
        {analysisRangeOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={analysisRangePreset === option.id}
            onClick={() => setAnalysisRangePreset(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <section className={`${styles.section} ${styles.personalUsageSection}`} aria-labelledby="personal-credits-title">
      <div className={styles.personalUsageHeading}>
        <span>
          <h2 id="personal-credits-title">我的积分</h2>
          <p>查看当前账号的积分余额、变动流水与个人用量。</p>
        </span>
      </div>

      <div className={styles.personalBalanceBar}>
        <article>
          <span>可用积分</span>
          <strong>{numberFormatter.format(currentDemoBalance)}</strong>
        </article>
        <span className={styles.personalBalanceDivider} aria-hidden="true" />
        <article>
          <span>本月获得</span>
          <strong className={styles.personalBalanceGain}>+{numberFormatter.format(monthGainCredits)}</strong>
        </article>
        <article>
          <span>本月消耗</span>
          <strong>{numberFormatter.format(monthConsumedCredits)}</strong>
        </article>
      </div>

      <div className={styles.personalUsageViewBar}>
        <div className={styles.personalUsageTabs} role="tablist" aria-label="我的积分视图">
          <button
            type="button"
            role="tab"
            aria-selected={activeView === "ledger"}
            onClick={() => setActiveView("ledger")}
          >
            <ListTree aria-hidden="true" />
            积分流水
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeView === "analysis"}
            onClick={() => setActiveView("analysis")}
          >
            <BarChart3 aria-hidden="true" />
            用量分析
          </button>
        </div>
        {viewControls}
      </div>

      {activeView === "ledger" ? (
        <div className={styles.personalLedgerPanel} role="tabpanel">
          <div className={styles.personalLedgerTable}>
            <div className={styles.personalLedgerTableHeader} aria-hidden="true">
              <span>时间</span>
              <span>类型</span>
              <span>项目</span>
              <span>任务类型</span>
              <span>模型</span>
              <span>生成规格</span>
              <span>积分变化</span>
            </div>
            {visibleLedgerEntries.map((entry) => (
              <div className={styles.personalLedgerRow} key={entry.id}>
                <span className={styles.personalLedgerTime}>
                  <Clock3 aria-hidden="true" />
                  {dateFormatter.format(new Date(entry.occurredAt))}
                </span>
                <span className={styles.personalLedgerType} data-direction={entry.direction}>
                  {entry.direction === "gain" ? <ArrowDownLeft aria-hidden="true" /> : <ArrowUpRight aria-hidden="true" />}
                  {entry.typeLabel}
                </span>
                <strong title={entry.projectName}>{entry.projectName}</strong>
                <span className={styles.personalLedgerTask}>{entry.taskType}</span>
                <span className={styles.personalLedgerModel} title={entry.modelName}>{entry.modelName}</span>
                <span className={styles.personalLedgerSpec} title={entry.specification}>{entry.specification}</span>
                <strong className={entry.direction === "gain" ? styles.personalCreditRefund : ""}>
                  {entry.credits > 0 ? "+" : "−"}{numberFormatter.format(Math.abs(entry.credits))}
                </strong>
              </div>
            ))}
            {filteredLedgerEntries.length === 0 ? (
              <div className={styles.personalUsageEmpty}>当前筛选范围内没有积分流水</div>
            ) : null}
          </div>
          {filteredLedgerEntries.length > 0 ? (
            <footer className={styles.personalLedgerPagination}>
              <span>共 {filteredLedgerEntries.length} 条</span>
              <nav aria-label="个人积分流水分页">
                <button
                  type="button"
                  disabled={currentLedgerPage === 1}
                  aria-label="上一页"
                  onClick={() => setLedgerPage((page) => Math.max(1, page - 1))}
                >
                  <ChevronLeft aria-hidden="true" />
                  上一页
                </button>
                {ledgerPaginationItems.map((item, index) => item === "ellipsis" ? (
                  <span key={`ellipsis-${index}`} aria-hidden="true">…</span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    className={item === currentLedgerPage ? styles.activeLedgerPage : ""}
                    aria-label={`第 ${item} 页`}
                    aria-current={item === currentLedgerPage ? "page" : undefined}
                    onClick={() => setLedgerPage(item)}
                  >
                    {item}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={currentLedgerPage === ledgerPageCount}
                  aria-label="下一页"
                  onClick={() => setLedgerPage((page) => Math.min(ledgerPageCount, page + 1))}
                >
                  下一页
                  <ChevronRight aria-hidden="true" />
                </button>
              </nav>
            </footer>
          ) : null}
        </div>
      ) : (
        <div className={styles.personalAnalysisPanel} role="tabpanel">
          <div className={styles.personalMetricGrid}>
            <article>
              <span>消耗积分</span>
              <strong>{numberFormatter.format(consumedCredits)}</strong>
              <small>{analysisRangeLabel}</small>
            </article>
            <article>
              <span>任务数量</span>
              <strong>{numberFormatter.format(analysisRecords.length)}</strong>
              <small>已完成任务</small>
            </article>
            <article>
              <span>平均单任务</span>
              <strong>{numberFormatter.format(averageCredits)}</strong>
              <small>积分 / 项</small>
            </article>
            <article>
              <span>媒体产出</span>
              <strong className={styles.personalOutputValue}>
                <span><Image aria-hidden="true" />{numberFormatter.format(imageCount)} 张</span>
                <span><Video aria-hidden="true" />{numberFormatter.format(videoSeconds)} 秒</span>
              </strong>
              <small>图片与视频分别统计</small>
            </article>
          </div>

          <article className={styles.personalTrendCard}>
            <div className={styles.personalCardHeading}>
              <span>
                <strong>{analysisDetailView === "trend" ? "消耗趋势" : "日明细"}</strong>
                <small>{analysisDetailView === "trend" ? "识别使用高峰与变化" : "按日核对消耗与任务数量"}</small>
              </span>
              <div className={styles.personalAnalysisViewSwitch} aria-label="个人用量日明细与趋势图">
                <button
                  type="button"
                  aria-pressed={analysisDetailView === "trend"}
                  onClick={() => setAnalysisDetailView("trend")}
                >
                  趋势图
                </button>
                <button
                  type="button"
                  aria-pressed={analysisDetailView === "daily"}
                  onClick={() => setAnalysisDetailView("daily")}
                >
                  日明细
                </button>
              </div>
            </div>
            {analysisDetailView === "trend" ? (
              <PersonalTrendChart points={trendPoints} rangeLabel={analysisRangeLabel} />
            ) : (
              <div className={styles.personalDailyTable} role="table" aria-label={`${analysisRangeLabel}个人每日用量明细`}>
                <div role="row">
                  <span role="columnheader">日期</span>
                  <span role="columnheader">消耗积分</span>
                  <span role="columnheader">任务数量</span>
                  <span role="columnheader">平均单任务</span>
                </div>
                {trendPoints.slice().reverse().map((point) => (
                  <div key={point.key} role="row">
                    <strong role="cell">{point.label}</strong>
                    <span role="cell">{numberFormatter.format(point.credits)}</span>
                    <span role="cell">{numberFormatter.format(point.tasks)}</span>
                    <span role="cell">
                      {numberFormatter.format(point.tasks > 0 ? Math.round(point.credits / point.tasks) : 0)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </article>

          <div className={styles.personalAnalysisGrid}>
            <article className={styles.personalCompositionCard}>
              <div className={styles.personalCardHeading}>
                <strong>消耗构成</strong>
                <span>按任务大类统计</span>
              </div>
              <div className={styles.personalCompositionList}>
                {typeComposition.map((item) => (
                  <div key={item.id}>
                    <span className={styles.personalCompositionDot} data-kind={item.id} />
                    <span>{item.label}</span>
                    <strong>{numberFormatter.format(item.credits)}</strong>
                    <small>{item.tasks} 项 · {(item.share * 100).toFixed(0)}%</small>
                  </div>
                ))}
              </div>
            </article>

            <article className={styles.personalModelCard}>
              <div className={styles.personalCardHeading}>
                <strong>消耗来源</strong>
                <div className={styles.personalSourceTabs} aria-label="个人消耗来源维度">
                  <button
                    type="button"
                    aria-pressed={sourceDimension === "project"}
                    onClick={() => setSourceDimension("project")}
                  >
                    按项目
                  </button>
                  <button
                    type="button"
                    aria-pressed={sourceDimension === "model"}
                    onClick={() => setSourceDimension("model")}
                  >
                    按模型
                  </button>
                </div>
              </div>
              <div className={styles.personalModelList}>
                {sourceComposition.map((item) => (
                  <div key={item.id}>
                    <span title={item.label}>{item.label}</span>
                    <i aria-hidden="true"><b style={{ width: `${Math.max(5, item.credits / maxSourceCredits * 100)}%` }} /></i>
                    <strong>{numberFormatter.format(item.credits)}</strong>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </div>
      )}
    </section>
  );
}
