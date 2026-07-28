import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Download,
  FileDown,
  Image,
  Info,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Video,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import type { OrganizationMember } from "../../domain/workspace/workspace";
import {
  UsageActivityChart,
  type UsageActivityMode,
} from "./UsageActivityChart";
import { UsageDetailDrawer } from "./UsageDetailDrawer";
import {
  buildUsageCsv,
  buildUsageExcelXml,
  createOrganizationUsageDemoData,
  filterUsageRecords,
  getComparisonRange,
  getHeatmapDays,
  getUsageComposition,
  getUsageRange,
  getUsageSummary,
  type UsageCompositionItem,
  type UsageDimension,
  type UsageRangePreset,
} from "./organization-usage-data";
import styles from "./OrganizationUsageSection.module.css";

interface OrganizationUsageSectionProps {
  members: OrganizationMember[];
  workspaceName: string;
}

const RANGE_ITEMS: { id: UsageRangePreset; label: string }[] = [
  { id: "today", label: "今日" },
  { id: "week", label: "近 7 天" },
  { id: "month", label: "本月" },
  { id: "all", label: "全部" },
  { id: "custom", label: "自定义" },
];

const ACTIVITY_MODES: { id: UsageActivityMode; label: string }[] = [
  { id: "calendar", label: "每日" },
  { id: "weekly", label: "每周" },
  { id: "cumulative", label: "累计" },
];

const DIMENSION_ITEMS: { id: UsageDimension; label: string }[] = [
  { id: "type", label: "类型" },
  { id: "member", label: "成员" },
  { id: "project", label: "项目" },
  { id: "model", label: "模型" },
];

const numberFormatter = new Intl.NumberFormat("zh-CN");
const shortDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function dateInputValue(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(value: Date, amount: number): Date {
  const result = new Date(value);
  result.setDate(result.getDate() + amount);
  return result;
}

function startOfDay(value: Date): Date {
  const result = new Date(value);
  result.setHours(0, 0, 0, 0);
  return result;
}

function formatVideoDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  if (minutes > 0) return `${minutes} 分钟`;
  return `${seconds} 秒`;
}

function formatChange(rate: number | null): string {
  if (rate === null) return "暂无上期数据";
  const percentage = Math.abs(rate * 100).toFixed(1);
  return `较上期 ${rate >= 0 ? "+" : "−"}${percentage}%`;
}

function formatForecast(days: number | null): string {
  if (days === null) return "数据不足";
  return `约 ${numberFormatter.format(days)} 天`;
}

function formatForecastDifference(rate: number | null): string {
  if (rate === null) return "暂无历史基准";
  if (Math.abs(rate) < 0.05) return "近期日均与历史基本持平";
  return `近期日均较历史${rate > 0 ? "高" : "低"} ${Math.abs(rate * 100).toFixed(0)}%`;
}

const forecastConfidenceLabels = {
  low: "数据积累中",
  medium: "趋势逐步稳定",
  high: "数据充分",
} as const;

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
  const [rangePreset, setRangePreset] = useState<UsageRangePreset>("month");
  const [customStart, setCustomStart] = useState(
    dateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)),
  );
  const [customEnd, setCustomEnd] = useState(dateInputValue(now));
  const [activityMode, setActivityMode] = useState<UsageActivityMode>("calendar");
  const [activityAnchor, setActivityAnchor] = useState(now);
  const [dimension, setDimension] = useState<UsageDimension>("type");
  const [selectedComposition, setSelectedComposition] = useState<UsageCompositionItem | null>(null);
  const exportMenuRef = useRef<HTMLDetailsElement>(null);

  const range = useMemo(
    () => getUsageRange(rangePreset, now, customStart, customEnd),
    [customEnd, customStart, now, rangePreset],
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
  const composition = useMemo(
    () => getUsageComposition(rangeRecords, dimension),
    [dimension, rangeRecords],
  );
  const activityDays = useMemo(
    () => getHeatmapDays(demoData.records, activityAnchor),
    [activityAnchor, demoData.records],
  );
  const earliestRecordDate = useMemo(
    () => new Date(demoData.records.at(-1)?.occurredAt ?? now),
    [demoData.records, now],
  );
  const activityStart = addDays(startOfDay(activityAnchor), -364);
  const canMoveBackward = activityStart > startOfDay(earliestRecordDate);
  const canMoveForward = startOfDay(activityAnchor) < startOfDay(now);
  const activityRangeLabel = `${shortDateFormatter.format(activityStart)} — ${shortDateFormatter.format(activityAnchor)}`;
  const activityWindowLabel = canMoveForward
    ? activityRangeLabel
    : `近 365 天 · ${activityRangeLabel}`;
  const activeRangeLabel = RANGE_ITEMS.find((item) => item.id === rangePreset)?.label ?? "本月";

  useEffect(() => {
    const closeExportMenu = (event: PointerEvent) => {
      if (!exportMenuRef.current?.contains(event.target as Node)) {
        exportMenuRef.current?.removeAttribute("open");
      }
    };
    const closeExportMenuOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") exportMenuRef.current?.removeAttribute("open");
    };
    document.addEventListener("pointerdown", closeExportMenu);
    document.addEventListener("keydown", closeExportMenuOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeExportMenu);
      document.removeEventListener("keydown", closeExportMenuOnEscape);
    };
  }, []);

  useEffect(() => {
    setSelectedComposition(null);
  }, [customEnd, customStart, dimension, rangePreset]);

  const moveActivityWindow = (direction: -1 | 1) => {
    setActivityAnchor((current) => {
      const shifted = addDays(current, direction * 365);
      return shifted > now ? now : shifted;
    });
  };

  const exportRecords = (format: "csv" | "excel") => {
    const stamp = dateInputValue(now);
    if (format === "csv") {
      downloadFile(
        buildUsageCsv(rangeRecords),
        `Reelay-组织用量-${stamp}.csv`,
        "text/csv;charset=utf-8",
      );
    } else {
      downloadFile(
        buildUsageExcelXml(rangeRecords),
        `Reelay-组织用量-${stamp}.xls`,
        "application/vnd.ms-excel;charset=utf-8",
      );
    }
    exportMenuRef.current?.removeAttribute("open");
  };

  return (
    <section className={styles.usageSection} aria-labelledby="organization-usage-title">
      <h1 id="organization-usage-title" className={styles.visuallyHidden}>用量看板</h1>
      <p className={styles.visuallyHidden}>{workspaceName}的组织用量统计</p>

      <section className={styles.activityPanel} aria-labelledby="usage-activity-title">
        <header className={styles.panelHeader}>
          <span>
            <h2 id="usage-activity-title">365 天活动</h2>
            <p>观察长期使用节奏；每日、每周与累计只是同一时间窗口的不同视图。</p>
            <small className={styles.dataFreshness}>
              <Clock3 aria-hidden="true" />
              演示数据 · 更新于 5 分钟前
            </small>
          </span>
          <div className={styles.activityHeaderControls}>
            <div className={styles.windowNavigation} aria-label="年度活动时间窗口">
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
        <UsageActivityChart
          days={activityDays}
          mode={activityMode}
        />
        <section className={styles.stableOverview} aria-label="组织状态概览">
          <article className={styles.balanceMetric}>
            <span><CircleDollarSign aria-hidden="true" />可用积分</span>
            <strong>{numberFormatter.format(demoData.availableCredits)}</strong>
            <small>组织当前尚未消耗的全部积分</small>
          </article>
          <article className={styles.forecastMetric}>
            <span className={styles.forecastHeading}>
              <span><Clock3 aria-hidden="true" />预计可用</span>
              <small>{forecastConfidenceLabels[summary.forecastConfidence]}</small>
            </span>
            <div className={styles.forecastPrimary}>
              <span>
                <strong>{formatForecast(summary.estimatedDaysRecent)}</strong>
                <small>
                  近期趋势估算 · 日均 {numberFormatter.format(summary.recentDailyAverage)} 积分
                </small>
              </span>
              <span
                className={styles.forecastDifference}
                data-direction={
                  summary.recentToLifetimeRate !== null && summary.recentToLifetimeRate < 0
                    ? "down"
                    : "up"
                }
              >
                {summary.recentToLifetimeRate !== null && summary.recentToLifetimeRate < 0
                  ? <TrendingDown aria-hidden="true" />
                  : <TrendingUp aria-hidden="true" />}
                {formatForecastDifference(summary.recentToLifetimeRate)}
              </span>
            </div>
            <div className={styles.forecastReference}>
              <span>
                历史平均参考
                <span
                  className={styles.forecastMethodHint}
                  tabIndex={0}
                  title="近期趋势综合近 30 个自然日平均和近期加权均值，保留零消耗日与真实高峰。"
                  aria-label="预测方法：综合近 30 个自然日平均和近期加权均值，保留零消耗日与真实高峰"
                >
                  <Info aria-hidden="true" />
                </span>
              </span>
              <strong>{formatForecast(summary.estimatedDaysLifetime)}</strong>
              <small>历史日均 {numberFormatter.format(summary.lifetimeDailyAverage)} 积分</small>
            </div>
          </article>
        </section>
      </section>

      <section className={styles.periodPanel} aria-labelledby="usage-period-title">
        <header className={styles.panelHeader}>
          <span>
            <h2 id="usage-period-title">期间用量</h2>
            <p>{activeRangeLabel} · 统计范围同时作用于媒体产出、消耗构成和导出。</p>
          </span>
          <div className={styles.periodControls}>
            <div className={styles.rangeControl} aria-label="统计时间范围">
              {RANGE_ITEMS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={rangePreset === item.id ? styles.activeRange : ""}
                  aria-pressed={rangePreset === item.id}
                  onClick={() => setRangePreset(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className={styles.toolbarMeta}>
              <span><CalendarDays aria-hidden="true" />Asia/Shanghai</span>
              <details ref={exportMenuRef} className={styles.exportMenu}>
                <summary aria-label="导出当前时间范围的数据">
                  <Download aria-hidden="true" />
                  导出
                  <ChevronDown aria-hidden="true" />
                </summary>
                <div>
                  <button type="button" onClick={() => exportRecords("csv")}>
                    <FileDown aria-hidden="true" />
                    <span><strong>CSV</strong><small>{activeRangeLabel}数据</small></span>
                  </button>
                  <button type="button" onClick={() => exportRecords("excel")}>
                    <BarChart3 aria-hidden="true" />
                    <span><strong>Excel</strong><small>{activeRangeLabel}数据</small></span>
                  </button>
                </div>
              </details>
            </div>
          </div>
        </header>

        {rangePreset === "custom" ? (
          <div className={styles.customRange}>
            <label>
              <span>开始日期</span>
              <input
                type="date"
                max={customEnd}
                value={customStart}
                onChange={(event) => setCustomStart(event.target.value)}
              />
            </label>
            <span aria-hidden="true">至</span>
            <label>
              <span>结束日期</span>
              <input
                type="date"
                min={customStart}
                max={dateInputValue(now)}
                value={customEnd}
                onChange={(event) => setCustomEnd(event.target.value)}
              />
            </label>
          </div>
        ) : null}

        <section className={styles.periodMetrics} aria-label={`${activeRangeLabel}用量摘要`}>
          <article>
            <span><Sparkles aria-hidden="true" />消耗积分</span>
            <strong>{numberFormatter.format(summary.netCredits)}</strong>
            <small>{formatChange(summary.changeRate)}</small>
          </article>
          <article>
            <span><Image aria-hidden="true" />图片产出</span>
            <strong>{numberFormatter.format(summary.imageCount)}</strong>
            <small>张图片</small>
          </article>
          <article>
            <span><Video aria-hidden="true" />视频产出</span>
            <strong>{formatVideoDuration(summary.videoSeconds)}</strong>
            <small>成片时长</small>
          </article>
        </section>

        <header className={styles.compositionHeader}>
          <span>
            <h3 id="usage-composition-title">消耗构成</h3>
            <p>从类型、成员、项目或模型解释当前范围内的积分去向。</p>
          </span>
          <div className={styles.dimensionTabs} aria-label="消耗构成分析维度">
            {DIMENSION_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={dimension === item.id ? styles.activeDimension : ""}
                aria-pressed={dimension === item.id}
                onClick={() => setDimension(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </header>

        <div className={styles.compositionList}>
          {composition.map((item) => (
            <button
              key={item.id}
              type="button"
              className={styles.compositionRow}
              aria-label={`查看${item.label}消耗明细`}
              onClick={() => setSelectedComposition(item)}
            >
              <span className={styles.compositionIdentity}>
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
              </span>
              <span className={styles.compositionTrack} aria-hidden="true">
                <i style={{ width: `${Math.max(2, item.share * 100)}%` }} />
              </span>
              <span className={styles.compositionValue}>
                <strong>{numberFormatter.format(item.credits)}</strong>
                <small>{(item.share * 100).toFixed(1)}%</small>
              </span>
              <small className={styles.compositionOutput}>
                {item.videoSeconds > 0
                  ? `${formatVideoDuration(item.videoSeconds)} 视频`
                  : item.imageCount > 0
                    ? `${numberFormatter.format(item.imageCount)} 张图片`
                    : ""}
              </small>
              <ArrowUpRight className={styles.compositionAction} aria-hidden="true" />
            </button>
          ))}
        </div>

        <footer className={styles.compositionFooter}>
          <span>需要核对任务级扣费、退款或成员流水？</span>
          <Link to="../credits">
            前往积分管理
            <ArrowRight aria-hidden="true" />
          </Link>
        </footer>
      </section>

      <UsageDetailDrawer
        composition={composition}
        dimension={dimension}
        item={selectedComposition}
        rangeLabel={activeRangeLabel}
        records={rangeRecords}
        onClose={() => setSelectedComposition(null)}
      />
    </section>
  );
}
