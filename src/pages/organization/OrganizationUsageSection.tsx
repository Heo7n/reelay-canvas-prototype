import {
  ChevronDown,
  ChevronRight,
  Download,
  Image as ImageIcon,
  Info,
  RefreshCw,
  Video,
  WandSparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { OrganizationMember } from "../../domain/workspace/workspace";
import { UsageDetailDrawer } from "./UsageDetailDrawer";
import {
  buildUsageExcelXml,
  createOrganizationUsageDemoData,
  filterUsageRecords,
  formatUsageDateInput,
  getUsageComposition,
  getUsageRange,
  getUsageSummary,
  type UsageCompositionItem,
  type UsageDimension,
  type UsageRangePreset,
} from "./organization-usage-data";
import { UsageDistributionChart } from "./usage/UsageDistributionChart";
import { UsageSourceTable } from "./usage/UsageSourceTable";
import {
  buildUsageTimeline,
  buildUsageTypeViewModels,
  chooseTimelineGranularity,
} from "./usage/usage-analytics";
import styles from "./usage/UsageDashboard.module.css";

interface OrganizationUsageSectionProps {
  members: OrganizationMember[];
  workspaceName: string;
}

type DashboardRange = "rolling7" | "rolling30" | "custom";
type SourceDimension = Exclude<UsageDimension, "type">;

interface CustomRange {
  startDate: string;
  endDate: string;
}

interface SelectedBreakdown {
  composition: UsageCompositionItem[];
  dimension: UsageDimension;
  item: UsageCompositionItem;
}

const numberFormatter = new Intl.NumberFormat("zh-CN");
const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

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

function rangeLabel(preset: DashboardRange, custom: CustomRange): string {
  if (preset === "rolling7") return "近7天";
  if (preset === "rolling30") return "近30天";
  return `${custom.startDate.replaceAll("-", "/")}–${custom.endDate.replaceAll("-", "/")}`;
}

function formatEstimatedDays(days: number | null): string {
  return days === null ? "—" : `约 ${numberFormatter.format(days)} 天`;
}

function OverviewArt({ kind }: { kind: "credits" | "trend" }) {
  if (kind === "credits") {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <defs>
          <linearGradient id="usage-credit-art" x1="8" y1="5" x2="39" y2="43" gradientUnits="userSpaceOnUse">
            <stop stopColor="#8b9de2" />
            <stop offset="1" stopColor="#5770cf" />
          </linearGradient>
        </defs>
        <ellipse cx="24" cy="13" rx="12" ry="5.5" fill="url(#usage-credit-art)" />
        <path d="M12 13v8c0 3 5.4 5.5 12 5.5S36 24 36 21v-8" fill="url(#usage-credit-art)" opacity=".83" />
        <path d="M12 22v8c0 3 5.4 5.5 12 5.5S36 33 36 30v-8" fill="url(#usage-credit-art)" opacity=".68" />
        <path d="M12 31v4c0 3 5.4 5.5 12 5.5S36 38 36 35v-4" fill="url(#usage-credit-art)" opacity=".5" />
        <path d="M12 13c0 3 5.4 5.5 12 5.5S36 16 36 13M12 22c0 3 5.4 5.5 12 5.5S36 25 36 22M12 31c0 3 5.4 5.5 12 5.5S36 34 36 31" fill="none" stroke="#fff" strokeOpacity=".78" strokeWidth="1.3" />
        <path d="M39 8v5M36.5 10.5h5" stroke="#8092dc" strokeLinecap="round" strokeWidth="1.7" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id="usage-trend-art" x1="9" y1="39" x2="39" y2="8" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7f9fdc" />
          <stop offset="1" stopColor="#4c78c8" />
        </linearGradient>
      </defs>
      <rect x="9" y="29" width="5" height="10" rx="2.5" fill="#b9cae8" />
      <rect x="19" y="23" width="5" height="16" rx="2.5" fill="#91addc" />
      <rect x="29" y="14" width="5" height="25" rx="2.5" fill="url(#usage-trend-art)" />
      <path d="m10 25 10-7 8 3 10-12" fill="none" stroke="url(#usage-trend-art)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
      <circle cx="10" cy="25" r="2.3" fill="#fff" stroke="#7194d1" strokeWidth="1.8" />
      <circle cx="20" cy="18" r="2.3" fill="#fff" stroke="#7194d1" strokeWidth="1.8" />
      <circle cx="28" cy="21" r="2.3" fill="#fff" stroke="#7194d1" strokeWidth="1.8" />
      <circle cx="38" cy="9" r="2.3" fill="#fff" stroke="#4c78c8" strokeWidth="1.8" />
    </svg>
  );
}

function typeIcon(id: string) {
  if (id === "video") return <Video aria-hidden="true" />;
  if (id === "image") return <ImageIcon aria-hidden="true" />;
  return <WandSparkles aria-hidden="true" />;
}

export function OrganizationUsageSection({
  members,
  workspaceName,
}: OrganizationUsageSectionProps) {
  const [refreshedAt, setRefreshedAt] = useState(() => new Date());
  const [rangePreset, setRangePreset] = useState<DashboardRange>("rolling7");
  const [sourceDimension, setSourceDimension] = useState<SourceDimension>("project");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedBreakdown, setSelectedBreakdown] = useState<SelectedBreakdown | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const demoData = useMemo(
    () => createOrganizationUsageDemoData(members, refreshedAt),
    [members, refreshedAt],
  );
  const earliestRecordDate = useMemo(
    () => demoData.records.reduce<Date>((earliest, record) => {
      const occurredAt = new Date(record.occurredAt);
      return occurredAt < earliest ? occurredAt : earliest;
    }, refreshedAt),
    [demoData.records, refreshedAt],
  );
  const initialCustomRange = useMemo(() => {
    const range = getUsageRange("month", refreshedAt);
    return {
      startDate: formatUsageDateInput(range.start),
      endDate: formatUsageDateInput(refreshedAt),
    };
  }, [refreshedAt]);
  const [customRange, setCustomRange] = useState<CustomRange>(initialCustomRange);
  const [draftRange, setDraftRange] = useState<CustomRange>(initialCustomRange);

  const range = useMemo(() => {
    const preset: UsageRangePreset = rangePreset === "custom" ? "custom" : rangePreset;
    return getUsageRange(
      preset,
      refreshedAt,
      rangePreset === "custom" ? customRange.startDate : undefined,
      rangePreset === "custom" ? customRange.endDate : undefined,
      earliestRecordDate,
    );
  }, [customRange, earliestRecordDate, rangePreset, refreshedAt]);
  const rangeRecords = useMemo(
    () => filterUsageRecords(demoData.records, range),
    [demoData.records, range],
  );
  const recent30Range = useMemo(
    () => getUsageRange("rolling30", refreshedAt),
    [refreshedAt],
  );
  const recent30Records = useMemo(
    () => filterUsageRecords(demoData.records, recent30Range),
    [demoData.records, recent30Range],
  );
  const todayRecords = useMemo(
    () => filterUsageRecords(demoData.records, getUsageRange("today", refreshedAt)),
    [demoData.records, refreshedAt],
  );
  const summary = useMemo(
    () => getUsageSummary(
      recent30Records,
      [],
      demoData.records,
      refreshedAt,
      demoData.availableCredits,
    ),
    [demoData, recent30Records, refreshedAt],
  );
  const todayCredits = todayRecords.reduce((total, record) => total + Math.max(0, record.credits), 0);
  const timeline = useMemo(
    () => buildUsageTimeline(rangeRecords, range, chooseTimelineGranularity(range)),
    [range, rangeRecords],
  );
  const typeComposition = useMemo(
    () => buildUsageTypeViewModels(rangeRecords),
    [rangeRecords],
  );
  const sourceComposition = useMemo(
    () => getUsageComposition(rangeRecords, sourceDimension),
    [rangeRecords, sourceDimension],
  );
  const totalRangeCredits = timeline.reduce((total, point) => total + point.total, 0);
  const displayRangeLabel = rangeLabel(rangePreset, customRange);
  const horizontalTimeline = rangePreset === "rolling7";

  useEffect(() => {
    const closePicker = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setPickerOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPickerOpen(false);
    };
    document.addEventListener("pointerdown", closePicker);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closePicker);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  useEffect(() => {
    setSelectedBreakdown(null);
  }, [rangePreset, sourceDimension, customRange]);

  const exportUsageReport = () => {
    const stamp = formatUsageDateInput(refreshedAt);
    downloadFile(
      buildUsageExcelXml(rangeRecords, displayRangeLabel),
      `Reelay-用量报表-${stamp}.xls`,
      "application/vnd.ms-excel;charset=utf-8",
    );
  };

  const applyCustomRange = () => {
    if (!draftRange.startDate || !draftRange.endDate || draftRange.startDate > draftRange.endDate) return;
    setCustomRange(draftRange);
    setRangePreset("custom");
    setPickerOpen(false);
  };

  return (
    <section className={styles.usageSection} aria-labelledby="organization-usage-title">
      <h1 id="organization-usage-title" className={styles.visuallyHidden}>用量看板</h1>
      <p className={styles.visuallyHidden}>{workspaceName}的组织用量统计</p>

      <header className={styles.overviewHeading}>
        <h2>概览</h2>
        <div className={styles.overviewActions}>
          <span>更新于 {timeFormatter.format(refreshedAt)}</span>
          <button
            type="button"
            className={styles.refreshButton}
            aria-label="刷新用量数据"
            title="刷新用量数据"
            onClick={() => setRefreshedAt(new Date())}
          >
            <RefreshCw aria-hidden="true" />
          </button>
          <button type="button" className={styles.exportButton} onClick={exportUsageReport}>
            <Download aria-hidden="true" />
            导出报表
          </button>
        </div>
      </header>

      <div className={styles.overviewGrid}>
        <article className={styles.overviewCard}>
          <i className={styles.overviewIcon}><OverviewArt kind="credits" /></i>
          <div className={styles.overviewMetric} data-accent="true">
            <span>可用积分</span>
            <strong>{numberFormatter.format(demoData.availableCredits)}</strong>
          </div>
          <div className={styles.metricDivider} aria-hidden="true" />
          <div className={styles.overviewMetric}>
            <span>预计可用天数 <Info aria-hidden="true" /></span>
            <strong>{formatEstimatedDays(summary.estimatedDaysRecent)}</strong>
            <small>按近30天日均估算</small>
          </div>
          <div className={styles.metricDivider} aria-hidden="true" />
          <div className={styles.overviewMetric} data-compact="true">
            <span>今日已消耗</span>
            <strong>{numberFormatter.format(todayCredits)}</strong>
          </div>
          <div className={styles.metricDivider} aria-hidden="true" />
          <div className={styles.overviewMetric} data-compact="true">
            <span>近30天日均</span>
            <strong>{numberFormatter.format(summary.recentDailyAverage)}</strong>
          </div>
          <span className={styles.cardGlow} aria-hidden="true" />
        </article>
      </div>

      <header className={styles.analysisHeading}>
        <h2>用量分析</h2>
        <div className={styles.rangeTabs} aria-label="用量统计时间范围">
          {(["rolling7", "rolling30"] as const).map((preset) => (
            <button
              key={preset}
              type="button"
              aria-pressed={rangePreset === preset}
              onClick={() => {
                setRangePreset(preset);
                setPickerOpen(false);
              }}
            >
              {preset === "rolling7" ? "近7天" : "近30天"}
            </button>
          ))}
          <div ref={pickerRef} className={styles.dateRangeControl}>
            <button
              type="button"
              aria-pressed={rangePreset === "custom"}
              aria-expanded={pickerOpen}
              onClick={() => {
                setDraftRange(customRange);
                setPickerOpen((open) => !open);
              }}
            >
              日期范围
              <ChevronDown aria-hidden="true" />
            </button>
            {pickerOpen ? (
              <div className={styles.datePopover} role="dialog" aria-label="选择日期范围">
                <div className={styles.dateFields}>
                  <label>
                    <span>开始日期</span>
                    <input
                      type="date"
                      min={formatUsageDateInput(earliestRecordDate)}
                      max={draftRange.endDate || formatUsageDateInput(refreshedAt)}
                      value={draftRange.startDate}
                      onChange={(event) => setDraftRange((current) => ({ ...current, startDate: event.target.value }))}
                    />
                  </label>
                  <span>至</span>
                  <label>
                    <span>结束日期</span>
                    <input
                      type="date"
                      min={draftRange.startDate || formatUsageDateInput(earliestRecordDate)}
                      max={formatUsageDateInput(refreshedAt)}
                      value={draftRange.endDate}
                      onChange={(event) => setDraftRange((current) => ({ ...current, endDate: event.target.value }))}
                    />
                  </label>
                </div>
                <footer>
                  <button type="button" onClick={() => setPickerOpen(false)}>取消</button>
                  <button type="button" className={styles.applyButton} onClick={applyCustomRange}>应用</button>
                </footer>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className={styles.analysisGrid}>
        <section className={styles.typePanel} aria-labelledby="usage-type-title">
          <h3 id="usage-type-title">消耗类型</h3>
          <div className={styles.typeCards}>
            {typeComposition.map((item) => (
              <button
                key={item.id}
                type="button"
                className={styles.typeCard}
                data-kind={item.id}
                aria-label={`查看${item.label}用量明细`}
                onClick={() => setSelectedBreakdown({ composition: typeComposition, dimension: "type", item })}
              >
                <i className={styles.typeIcon}>{typeIcon(item.id)}</i>
                <div className={styles.typeSummary}>
                  <strong>{item.label}</strong>
                  <span><b>{numberFormatter.format(item.credits)}</b> 积分</span>
                </div>
                <span className={styles.typeShare} aria-label={`占比${(item.share * 100).toFixed(1)}%`}>
                  <svg viewBox="0 0 48 48" aria-hidden="true">
                    <circle className={styles.typeShareTrack} cx="24" cy="24" r="19" pathLength="100" />
                    <circle
                      className={styles.typeShareValue}
                      cx="24"
                      cy="24"
                      r="19"
                      pathLength="100"
                      style={{ strokeDashoffset: 100 - item.share * 100 }}
                    />
                  </svg>
                  <strong>{(item.share * 100).toFixed(1)}%</strong>
                </span>
                <ChevronRight className={styles.typeChevron} aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>

        <section className={styles.timePanel} aria-labelledby="usage-time-title">
          <header className={styles.panelHeading}>
            <h3 id="usage-time-title">时间分布</h3>
            <span className={styles.rangeTotal}>
              <span>总消耗 <strong>{numberFormatter.format(totalRangeCredits)}</strong> 积分</span>
            </span>
          </header>
          <UsageDistributionChart
            horizontal={horizontalTimeline}
            points={timeline}
            rangeLabel={displayRangeLabel}
          />
        </section>
      </div>

      <UsageSourceTable
        composition={sourceComposition}
        dimension={sourceDimension}
        records={rangeRecords}
        onDimensionChange={setSourceDimension}
        onSelect={(item) => setSelectedBreakdown({ composition: sourceComposition, dimension: sourceDimension, item })}
      />

      <UsageDetailDrawer
        allRecords={demoData.records}
        composition={selectedBreakdown?.composition ?? []}
        dimension={selectedBreakdown?.dimension ?? "project"}
        item={selectedBreakdown?.item ?? null}
        rangeLabel={displayRangeLabel}
        records={rangeRecords}
        onClose={() => setSelectedBreakdown(null)}
      />
    </section>
  );
}
