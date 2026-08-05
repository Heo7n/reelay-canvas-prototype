import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
} from "lucide-react";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";

import creditsStackUrl from "../../../assets/organization/credits-stack.png";
import type { OrganizationMember } from "../../domain/workspace/workspace";
import {
  UsageActivityChart,
  type UsageActivityMode,
} from "./UsageActivityChart";
import { UsageDetailDrawer } from "./UsageDetailDrawer";
import {
  buildUsageExcelXml,
  addOrganizationDays,
  createOrganizationUsageDemoData,
  filterUsageRecords,
  formatUsageDateInput,
  getComparisonRange,
  getHeatmapDays,
  getUsageComposition,
  getUsageRange,
  getUsageSummary,
  getUsageTrend,
  startOfOrganizationDay,
  type UsageCompositionItem,
  type UsageDimension,
  type UsageRangePreset,
  ORGANIZATION_TIME_ZONE,
} from "./organization-usage-data";
import styles from "./OrganizationUsageSection.module.css";
import { UsageTrendChart } from "./UsageTrendChart";

interface OrganizationUsageSectionProps {
  members: OrganizationMember[];
  workspaceName: string;
}

type FixedRangePreset = "today" | "rolling7" | "rolling30";
type PickerRangePreset = "month" | "previousMonth" | "all" | "custom";

interface PickerSelection {
  kind: PickerRangePreset;
  startDate: string;
  endDate: string;
}

interface SelectedBreakdown {
  composition: UsageCompositionItem[];
  dimension: UsageDimension;
  item: UsageCompositionItem;
}

const FIXED_RANGE_ITEMS: { id: FixedRangePreset; label: string }[] = [
  { id: "today", label: "今天" },
  { id: "rolling7", label: "近 7 天" },
  { id: "rolling30", label: "近 30 天" },
];

const ACTIVITY_MODES: { id: UsageActivityMode; label: string }[] = [
  { id: "calendar", label: "每日" },
  { id: "weekly", label: "每周" },
  { id: "cumulative", label: "累计" },
];

const SOURCE_DIMENSIONS: { id: Exclude<UsageDimension, "type">; label: string }[] = [
  { id: "model", label: "模型" },
  { id: "member", label: "成员" },
  { id: "project", label: "项目" },
];

const TYPE_COLOR_VARIABLES: Record<string, string> = {
  video: "var(--usage-type-video)",
  image: "var(--usage-type-image)",
  agent: "var(--usage-type-agent)",
  enhancement: "var(--usage-type-enhancement)",
};

const numberFormatter = new Intl.NumberFormat("zh-CN");
const percentFormatter = new Intl.NumberFormat("zh-CN", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const shortDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: ORGANIZATION_TIME_ZONE,
});
function createPickerSelection(
  kind: PickerRangePreset,
  now: Date,
  historyStart?: Date,
): PickerSelection {
  if (kind === "previousMonth") {
    const range = getUsageRange("previousMonth", now);
    return {
      kind,
      startDate: formatUsageDateInput(range.start),
      endDate: formatUsageDateInput(new Date(range.end.getTime() - 1)),
    };
  }
  if (kind === "all") {
    const range = getUsageRange("all", now, undefined, undefined, historyStart);
    return {
      kind,
      startDate: formatUsageDateInput(range.start),
      endDate: formatUsageDateInput(now),
    };
  }
  const range = getUsageRange("month", now);
  return {
    kind,
    startDate: formatUsageDateInput(range.start),
    endDate: formatUsageDateInput(now),
  };
}

function formatVideoDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  if (minutes > 0) return `${minutes} 分钟`;
  return `${seconds} 秒`;
}

function formatCompositionOutput(item: UsageCompositionItem): string {
  if (item.videoSeconds > 0) {
    return `${numberFormatter.format(item.videoSeconds)}s`;
  }
  if (item.imageCount > 0) {
    return `${numberFormatter.format(item.imageCount)} 张`;
  }
  return `${numberFormatter.format(item.tasks)} 次`;
}

function formatForecast(days: number | null): string {
  if (days === null) return "数据不足";
  return `约 ${numberFormatter.format(days)} 天`;
}

function pickerButtonLabel(selection: PickerSelection | null): string {
  if (!selection) return "日期范围";
  if (selection.kind === "month") return "本月";
  if (selection.kind === "previousMonth") return "上月";
  if (selection.kind === "all") return "全部历史";
  return `${selection.startDate.slice(5).replace("-", "/")}–${
    selection.endDate.slice(5).replace("-", "/")
  }`;
}

function appliedRangeName(preset: UsageRangePreset, picker: PickerSelection | null): string {
  if (preset === "today") return "今天";
  if (preset === "rolling7") return "近 7 天";
  if (preset === "rolling30") return "近 30 天";
  return pickerButtonLabel(picker);
}

function formatActualRange(start: Date, end: Date): string {
  const displayEnd = new Date(Math.max(start.getTime(), end.getTime() - 1));
  return `${shortDateFormatter.format(start)}–${shortDateFormatter.format(displayEnd)}`;
}

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

export function OrganizationUsageSection({
  members,
  workspaceName,
}: OrganizationUsageSectionProps) {
  const now = useMemo(() => new Date(), []);
  const demoData = useMemo(
    () => createOrganizationUsageDemoData(members, now),
    [members, now],
  );
  const earliestRecordDate = useMemo(
    () => demoData.records.reduce<Date>(
      (earliest, record) => {
        const occurredAt = new Date(record.occurredAt);
        return occurredAt < earliest ? occurredAt : earliest;
      },
      now,
    ),
    [demoData.records, now],
  );
  const initialPickerSelection = useMemo(
    () => createPickerSelection("month", now),
    [now],
  );

  const [rangePreset, setRangePreset] = useState<UsageRangePreset>("rolling30");
  const [appliedPickerSelection, setAppliedPickerSelection] =
    useState<PickerSelection | null>(null);
  const [lastPickerSelection, setLastPickerSelection] =
    useState<PickerSelection | null>(null);
  const [draftPickerSelection, setDraftPickerSelection] =
    useState<PickerSelection>(initialPickerSelection);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activityMode, setActivityMode] = useState<UsageActivityMode>("calendar");
  const [activityAnchor, setActivityAnchor] = useState(now);
  const [sourceDimension, setSourceDimension] =
    useState<Exclude<UsageDimension, "type">>("model");
  const [sourceQuery, setSourceQuery] = useState("");
  const [sourceSearchOpen, setSourceSearchOpen] = useState(false);
  const [selectedBreakdown, setSelectedBreakdown] =
    useState<SelectedBreakdown | null>(null);
  const [highlightedTypeId, setHighlightedTypeId] = useState<string | null>(null);

  const pickerRef = useRef<HTMLDivElement>(null);
  const pickerTriggerRef = useRef<HTMLButtonElement>(null);
  const sourceListRef = useRef<HTMLDivElement>(null);

  const range = useMemo(
    () => getUsageRange(
      rangePreset,
      now,
      appliedPickerSelection?.startDate,
      appliedPickerSelection?.endDate,
      earliestRecordDate,
    ),
    [appliedPickerSelection, earliestRecordDate, now, rangePreset],
  );
  const comparisonRange = useMemo(
    () => getComparisonRange(rangePreset, range),
    [range, rangePreset],
  );
  const rangeRecords = useMemo(
    () => filterUsageRecords(demoData.records, range),
    [demoData.records, range],
  );
  const comparisonRecords = useMemo(
    () => comparisonRange
      ? filterUsageRecords(demoData.records, comparisonRange)
      : [],
    [comparisonRange, demoData.records],
  );
  const summary = useMemo(
    () => getUsageSummary(
      rangeRecords,
      comparisonRecords,
      demoData.records,
      now,
      demoData.availableCredits,
    ),
    [comparisonRecords, demoData, now, rangeRecords],
  );
  const trend = useMemo(
    () => getUsageTrend(rangeRecords, range),
    [range, rangeRecords],
  );
  const typeComposition = useMemo(
    () => getUsageComposition(rangeRecords, "type"),
    [rangeRecords],
  );
  const sourceComposition = useMemo(
    () => getUsageComposition(rangeRecords, sourceDimension),
    [rangeRecords, sourceDimension],
  );
  const activeSourceLabel = SOURCE_DIMENSIONS.find(
    (item) => item.id === sourceDimension,
  )?.label ?? "来源";
  const sourceSearchAvailable = sourceComposition.length > 0;
  const filteredSourceComposition = useMemo(() => {
    const query = sourceQuery.trim().toLocaleLowerCase("zh-CN");
    if (!query) return sourceComposition;
    return sourceComposition.filter((item) =>
      `${item.label} ${item.detail}`.toLocaleLowerCase("zh-CN").includes(query)
    );
  }, [sourceComposition, sourceQuery]);
  const activityDays = useMemo(
    () => getHeatmapDays(demoData.records, activityAnchor),
    [activityAnchor, demoData.records],
  );

  const activityStart = addOrganizationDays(startOfOrganizationDay(activityAnchor), -364);
  const canMoveBackward = activityStart > startOfOrganizationDay(earliestRecordDate);
  const canMoveForward =
    startOfOrganizationDay(activityAnchor) < startOfOrganizationDay(now);
  const activityRangeLabel = `${shortDateFormatter.format(activityStart)} — ${
    shortDateFormatter.format(activityAnchor)
  }`;
  const activityWindowLabel = canMoveForward
    ? activityRangeLabel
    : `近 365 天 · ${activityRangeLabel}`;
  const activeRangeLabel = appliedRangeName(rangePreset, appliedPickerSelection);
  const actualRangeLabel = formatActualRange(range.start, range.end);
  const pickerLabel = pickerButtonLabel(lastPickerSelection);
  const totalTypeCredits = Math.max(
    0,
    typeComposition.reduce((total, item) => total + item.credits, 0),
  );
  const highlightedType = typeComposition.find(
    (item) => item.id === highlightedTypeId,
  ) ?? null;
  let donutOffset = 0;
  const donutSegments = typeComposition.map((item) => {
    const start = donutOffset;
    donutOffset += item.share * 100;
    const color = TYPE_COLOR_VARIABLES[item.id] ?? "var(--workspace-muted)";
    const displayedColor = highlightedType && highlightedType.id !== item.id
      ? `color-mix(in srgb, ${color} 24%, var(--workspace-surface))`
      : color;
    return `${displayedColor} ${
      start.toFixed(2)
    }% ${donutOffset.toFixed(2)}%`;
  });
  const donutStyle = {
    "--usage-donut": totalTypeCredits > 0 && donutSegments.length > 0
      ? `conic-gradient(${donutSegments.join(", ")})`
      : "conic-gradient(var(--workspace-border) 0 100%)",
  } as CSSProperties;

  const previewDonutSegment = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const diameter = Math.min(bounds.width, bounds.height);
    const x = event.clientX - bounds.left - bounds.width / 2;
    const y = event.clientY - bounds.top - bounds.height / 2;
    const radius = Math.hypot(x, y);
    const outerRadius = diameter / 2;
    const innerRadius = diameter * (52 / 172);

    if (radius < innerRadius || radius > outerRadius || totalTypeCredits === 0) {
      setHighlightedTypeId(null);
      return;
    }

    const angle = (Math.atan2(y, x) * 180 / Math.PI + 90 + 360) % 360;
    const targetShare = angle / 360;
    let cumulativeShare = 0;
    const nextType = typeComposition.find((item) => {
      cumulativeShare += item.share;
      return targetShare <= cumulativeShare;
    });
    setHighlightedTypeId(nextType?.id ?? null);
  };

  useEffect(() => {
    const closeFloatingControls = (event: PointerEvent) => {
      const target = event.target as Node;
      if (pickerOpen && !pickerRef.current?.contains(target)) {
        setPickerOpen(false);
      }
    };
    const closeFloatingControlsOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (pickerOpen) {
        setPickerOpen(false);
        pickerTriggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeFloatingControls);
    document.addEventListener("keydown", closeFloatingControlsOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeFloatingControls);
      document.removeEventListener("keydown", closeFloatingControlsOnEscape);
    };
  }, [pickerOpen]);

  useEffect(() => {
    setSelectedBreakdown(null);
    setSourceQuery("");
    setSourceSearchOpen(false);
    sourceListRef.current?.scrollTo?.({ top: 0 });
  }, [range, sourceDimension]);

  const openPicker = () => {
    setDraftPickerSelection(lastPickerSelection ?? initialPickerSelection);
    setPickerOpen(true);
  };

  const choosePickerQuickRange = (kind: Exclude<PickerRangePreset, "custom">) => {
    setDraftPickerSelection(createPickerSelection(kind, now, earliestRecordDate));
  };

  const applyPickerSelection = () => {
    const next = { ...draftPickerSelection };
    setAppliedPickerSelection(next);
    setLastPickerSelection(next);
    setRangePreset(next.kind);
    setPickerOpen(false);
  };

  const moveActivityWindow = (direction: -1 | 1) => {
    setActivityAnchor((current) => {
      const shifted = addOrganizationDays(current, direction * 365);
      return shifted > now ? now : shifted;
    });
  };

  const exportUsageReport = () => {
    const stamp = formatUsageDateInput(now);
    downloadFile(
      buildUsageExcelXml(rangeRecords, actualRangeLabel),
      `Reelay-用量报表-${stamp}.xls`,
      "application/vnd.ms-excel;charset=utf-8",
    );
  };

  const activityPanel = (
    <section className={styles.activityPanel} aria-labelledby="usage-activity-title">
      <header className={styles.panelHeader}>
        <span className={styles.activityTitle}>
          <h2 id="usage-activity-title">长期活动</h2>
        </span>
        <div className={styles.activityHeaderControls}>
          <div className={styles.windowNavigation} aria-label="长期活动时间窗口">
            <button
              type="button"
              disabled={!canMoveBackward}
              aria-label="查看更早一年"
              onClick={() => moveActivityWindow(-1)}
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            <span>{activityWindowLabel}</span>
            <button
              type="button"
              disabled={!canMoveForward}
              aria-label="查看更新一年"
              onClick={() => moveActivityWindow(1)}
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
          <div className={styles.activityModeTabs} aria-label="活动图表形式">
            {ACTIVITY_MODES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={activityMode === item.id ? styles.activeActivityMode : ""}
                aria-pressed={activityMode === item.id}
                onClick={() => setActivityMode(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </header>
      <UsageActivityChart days={activityDays} mode={activityMode} />
    </section>
  );

  return (
    <section className={styles.usageSection} aria-labelledby="organization-usage-title">
      <h1 id="organization-usage-title" className={styles.visuallyHidden}>用量看板</h1>
      <p className={styles.visuallyHidden}>{workspaceName}的组织用量统计</p>

      <div className={styles.overviewGrid}>
        <section className={styles.stableOverview} aria-labelledby="usage-overview-title">
          <header className={styles.overviewHeader}>
            <h2 id="usage-overview-title">概览</h2>
          </header>
          <article className={styles.primaryMetric}>
            <span>可用积分</span>
            <div className={styles.metricValue}>
              <strong>{numberFormatter.format(demoData.availableCredits)}</strong>
            </div>
            <div className={styles.overviewIllustration} aria-hidden="true">
              <img src={creditsStackUrl} alt="" />
            </div>
          </article>
          <dl className={styles.averageMetrics} aria-label="日均消耗参考">
            <div>
              <dt>近 30 天日均</dt>
              <dd>{numberFormatter.format(summary.recentDailyAverage)}</dd>
            </div>
            <div>
              <dt>历史日均</dt>
              <dd>{numberFormatter.format(summary.lifetimeDailyAverage)}</dd>
            </div>
          </dl>
          <article className={styles.forecastMetric}>
            <span className={styles.forecastIcon} aria-hidden="true">
              <CalendarDays />
            </span>
            <div className={styles.forecastCopy}>
              <span>预计可用</span>
              <small className={styles.forecastBasis}>
                按近 30 天日均消耗估算
              </small>
            </div>
            <div className={styles.metricValue}>
              <strong>{formatForecast(summary.estimatedDaysRecent)}</strong>
            </div>
          </article>
        </section>
        {activityPanel}
      </div>

      <section className={styles.periodPanel} aria-labelledby="usage-period-title">
        <header className={styles.periodHeader}>
          <span className={styles.periodTitle}>
            <h2 id="usage-period-title">期间分析</h2>
            <small>{actualRangeLabel}</small>
          </span>
          <div className={styles.periodControls}>
            <div className={styles.toolbarMeta}>
              <button
                type="button"
                className={styles.exportButton}
                aria-label={`导出 ${actualRangeLabel} 用量报表`}
                title={`导出 ${actualRangeLabel} 用量报表`}
                onClick={exportUsageReport}
              >
                <Download aria-hidden="true" />
              </button>
            </div>

            <div className={styles.rangeControl} aria-label="统计时间范围">
              {FIXED_RANGE_ITEMS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={rangePreset === item.id ? styles.activeRange : ""}
                  aria-pressed={rangePreset === item.id}
                  onClick={() => {
                    setRangePreset(item.id);
                    setAppliedPickerSelection(null);
                    setPickerOpen(false);
                  }}
                >
                  {item.label}
                </button>
              ))}
              <div ref={pickerRef} className={styles.dateRangeControl}>
                <button
                  ref={pickerTriggerRef}
                  type="button"
                  className={
                    !FIXED_RANGE_ITEMS.some((item) => item.id === rangePreset)
                      ? styles.activeRange
                      : ""
                  }
                  aria-expanded={pickerOpen}
                  aria-haspopup="dialog"
                  onClick={() => {
                    if (pickerOpen) {
                      setPickerOpen(false);
                    } else {
                      openPicker();
                    }
                  }}
                >
                  <span>{pickerLabel}</span>
                  <ChevronDown aria-hidden="true" />
                </button>
                {pickerOpen ? (
                  <div
                    className={styles.dateRangePopover}
                    role="dialog"
                    aria-label="选择日期范围"
                  >
                    <div className={styles.dateFields}>
                      <label>
                        <span>开始日期</span>
                        <input
                          type="date"
                          min={formatUsageDateInput(earliestRecordDate)}
                          max={draftPickerSelection.endDate || formatUsageDateInput(now)}
                          value={draftPickerSelection.startDate}
                          onChange={(event) => setDraftPickerSelection({
                            kind: "custom",
                            startDate: event.target.value,
                            endDate: draftPickerSelection.endDate,
                          })}
                        />
                      </label>
                      <span aria-hidden="true">至</span>
                      <label>
                        <span>结束日期</span>
                        <input
                          type="date"
                          min={
                            draftPickerSelection.startDate
                            || formatUsageDateInput(earliestRecordDate)
                          }
                          max={formatUsageDateInput(now)}
                          value={draftPickerSelection.endDate}
                          onChange={(event) => setDraftPickerSelection({
                            kind: "custom",
                            startDate: draftPickerSelection.startDate,
                            endDate: event.target.value,
                          })}
                        />
                      </label>
                    </div>
                    <div className={styles.dateRangeQuick}>
                      <span>快捷选择</span>
                      {([
                        ["month", "本月"],
                        ["previousMonth", "上月"],
                        ["all", "全部历史"],
                      ] as const).map(([kind, label]) => (
                        <button
                          key={kind}
                          type="button"
                          className={
                            draftPickerSelection.kind === kind
                              ? styles.activeDateQuick
                              : ""
                          }
                          aria-pressed={draftPickerSelection.kind === kind}
                          onClick={() => choosePickerQuickRange(kind)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <footer>
                      <button type="button" onClick={() => setPickerOpen(false)}>取消</button>
                      <button
                        type="button"
                        className={styles.applyDateRange}
                        disabled={
                          draftPickerSelection.kind === "custom"
                          && (!draftPickerSelection.startDate
                            || !draftPickerSelection.endDate
                            || draftPickerSelection.startDate > draftPickerSelection.endDate)
                        }
                        onClick={applyPickerSelection}
                      >
                        应用
                      </button>
                    </footer>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        <section className={styles.trendSection} aria-labelledby="usage-trend-title">
          <header className={styles.analysisHeading}>
            <span>
              <h3 id="usage-trend-title">消耗走势</h3>
              <small>{activeRangeLabel}的积分消耗变化</small>
            </span>
          </header>
          <UsageTrendChart points={trend} rangeLabel={actualRangeLabel} />
        </section>

        <section className={styles.breakdownGrid} aria-label="消耗构成与消耗来源">
          <section className={styles.typeSection} aria-labelledby="usage-type-title">
            <header className={styles.analysisHeading}>
              <span>
                <h3 id="usage-type-title">消耗构成</h3>
                <small>积分主要花在什么地方</small>
              </span>
            </header>
            <div className={styles.typeCompositionLayout}>
              <div
                className={styles.typeDonut}
                style={donutStyle}
                aria-hidden="true"
                onPointerMove={previewDonutSegment}
                onPointerLeave={() => setHighlightedTypeId(null)}
              >
                <span>
                  <small>{highlightedType?.label ?? "本期消耗"}</small>
                  <strong>
                    {numberFormatter.format(
                      highlightedType?.credits ?? totalTypeCredits,
                    )}
                  </strong>
                  {highlightedType ? (
                    <em>{(highlightedType.share * 100).toFixed(1)}%</em>
                  ) : null}
                </span>
              </div>
              <div className={styles.typeLegend}>
                {typeComposition.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    data-active={highlightedTypeId === item.id || undefined}
                    data-dimmed={
                      Boolean(highlightedTypeId && highlightedTypeId !== item.id)
                      || undefined
                    }
                    aria-label={`查看${item.label}消耗明细`}
                    onPointerEnter={() => setHighlightedTypeId(item.id)}
                    onPointerLeave={() => setHighlightedTypeId(null)}
                    onFocus={() => setHighlightedTypeId(item.id)}
                    onBlur={() => setHighlightedTypeId(null)}
                    onClick={() => setSelectedBreakdown({
                      composition: typeComposition,
                      dimension: "type",
                      item,
                    })}
                  >
                    <i
                      aria-hidden="true"
                      style={{
                        background: TYPE_COLOR_VARIABLES[item.id]
                          ?? "var(--workspace-muted)",
                      }}
                    />
                    <span>
                      <strong>{item.label}</strong>
                      <small>{formatCompositionOutput(item)}</small>
                    </span>
                    <span>
                      <strong>{numberFormatter.format(item.credits)}</strong>
                      <small>{(item.share * 100).toFixed(1)}%</small>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className={styles.sourceSection} aria-labelledby="usage-composition-title">
            <header className={styles.compositionHeader}>
              <span>
                <h3 id="usage-composition-title">消耗来源</h3>
                <p>按模型、成员或项目定位积分使用集中度</p>
              </span>
              <div className={styles.sourceHeaderActions}>
                {sourceSearchAvailable ? (
                  <div className={styles.sourceSearchControl}>
                    {sourceSearchOpen ? (
                      <label className={styles.sourceSearch}>
                        <Search aria-hidden="true" />
                        <input
                          type="search"
                          value={sourceQuery}
                          autoFocus
                          placeholder={`搜索${activeSourceLabel}`}
                          aria-label={`搜索${activeSourceLabel}`}
                          onChange={(event) => setSourceQuery(event.target.value)}
                        />
                      </label>
                    ) : null}
                    <button
                      type="button"
                      className={styles.sourceSearchTrigger}
                      aria-label={`${sourceSearchOpen ? "收起" : "搜索"}${activeSourceLabel}`}
                      aria-pressed={sourceSearchOpen}
                      title={`${sourceSearchOpen ? "收起" : "搜索"}${activeSourceLabel}`}
                      onClick={() => {
                        setSourceSearchOpen((open) => !open);
                        if (sourceSearchOpen) setSourceQuery("");
                      }}
                    >
                      <Search aria-hidden="true" />
                    </button>
                  </div>
                ) : null}
                <div className={styles.dimensionTabs} aria-label="消耗来源分析维度">
                  {SOURCE_DIMENSIONS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={sourceDimension === item.id ? styles.activeDimension : ""}
                      aria-pressed={sourceDimension === item.id}
                      onClick={() => {
                        setSourceDimension(item.id);
                        setSourceQuery("");
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </header>

            <div className={styles.sourceListRegion}>
              <div
                ref={sourceListRef}
                className={styles.compositionList}
                aria-label="消耗来源排名"
              >
                <div className={styles.sourceColumnHeader} aria-hidden="true">
                  <span>{activeSourceLabel}</span>
                  <span>占比</span>
                  <span>积分</span>
                  <span />
                </div>
                {filteredSourceComposition.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={styles.compositionRow}
                    aria-label={`查看${item.label}用量汇总`}
                    onClick={() => setSelectedBreakdown({
                      composition: sourceComposition,
                      dimension: sourceDimension,
                      item,
                    })}
                  >
                    <span className={styles.compositionIdentity}>
                      <strong>{item.label}</strong>
                      {sourceDimension !== "model" ? <small>{item.detail}</small> : null}
                    </span>
                    <span className={styles.compositionTrack} aria-hidden="true">
                      <i style={{ width: `${Math.max(2, item.share * 100)}%` }} />
                    </span>
                    <span className={styles.compositionShare}>
                      {percentFormatter.format(item.share)}
                    </span>
                    <span className={styles.compositionValue}>
                      <strong>{numberFormatter.format(item.credits)}</strong>
                    </span>
                    <ArrowUpRight className={styles.compositionAction} aria-hidden="true" />
                  </button>
                ))}
                {filteredSourceComposition.length === 0 ? (
                  <p className={styles.sourceEmpty}>没有匹配的来源</p>
                ) : null}
              </div>
            </div>
            <footer className={styles.compositionFooter}>
              <span>需要核对具体任务与扣费记录？</span>
              <Link to="../credits">
                查看积分明细
                <ArrowRight aria-hidden="true" />
              </Link>
            </footer>
          </section>
        </section>
      </section>

      <UsageDetailDrawer
        allRecords={demoData.records}
        composition={selectedBreakdown?.composition ?? []}
        dimension={selectedBreakdown?.dimension ?? "type"}
        item={selectedBreakdown?.item ?? null}
        rangeLabel={activeRangeLabel}
        records={rangeRecords}
        onClose={() => setSelectedBreakdown(null)}
      />
    </section>
  );
}
