import {
  ArrowRight,
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
  Sparkles,
  Video,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import type { OrganizationMember } from "../../domain/workspace/workspace";
import {
  UsageActivityChart,
  type UsageActivityMode,
} from "./UsageActivityChart";
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
  getWeeklyActivity,
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
  { id: "week", label: "本周" },
  { id: "month", label: "本月" },
  { id: "all", label: "累计" },
  { id: "custom", label: "自定义" },
];

const ACTIVITY_MODES: { id: UsageActivityMode; label: string }[] = [
  { id: "calendar", label: "日历分布" },
  { id: "weekly", label: "周趋势" },
  { id: "cumulative", label: "累计趋势" },
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
  const weeklyActivity = useMemo(
    () => getWeeklyActivity(demoData.records, activityAnchor),
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

  const moveActivityWindow = (direction: -1 | 1) => {
    setActivityAnchor((current) => {
      const shifted = addDays(current, direction * 364);
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
      <header className={styles.pageHeader}>
        <span>
          <h1 id="organization-usage-title">用量看板</h1>
          <p>{workspaceName} · 了解积分余量、消耗趋势与媒体产出。</p>
        </span>
        <span className={styles.dataFreshness}>
          <Clock3 aria-hidden="true" />
          演示数据 · 更新于 5 分钟前
        </span>
      </header>

      <div className={styles.toolbar}>
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
                <span><strong>CSV</strong><small>当前时间范围</small></span>
              </button>
              <button type="button" onClick={() => exportRecords("excel")}>
                <BarChart3 aria-hidden="true" />
                <span><strong>Excel</strong><small>当前时间范围</small></span>
              </button>
            </div>
          </details>
        </div>
      </div>

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

      <section className={styles.overviewStrip} aria-label="组织用量概览">
        <article>
          <span><CircleDollarSign aria-hidden="true" />组织可用积分</span>
          <strong>{numberFormatter.format(demoData.availableCredits)}</strong>
          <small>未分配与成员账户可用余额之和</small>
        </article>
        <article className={styles.forecastMetric}>
          <span><Clock3 aria-hidden="true" />预计可用</span>
          <div>
            <span><strong>{formatForecast(summary.estimatedDays30)}</strong><small>近 30 日口径</small></span>
            <span><strong>{formatForecast(summary.estimatedDaysLifetime)}</strong><small>累计口径</small></span>
          </div>
        </article>
        <article className={styles.periodMetric}>
          <span><Sparkles aria-hidden="true" />本期消耗</span>
          <strong>{numberFormatter.format(summary.netCredits)}</strong>
          <small>{formatChange(summary.changeRate)}</small>
        </article>
        <article className={styles.outputMetric}>
          <span><Image aria-hidden="true" />媒体产出</span>
          <div>
            <span><Image aria-hidden="true" /><strong>{numberFormatter.format(summary.imageCount)}</strong><small>张图片</small></span>
            <span><Video aria-hidden="true" /><strong>{formatVideoDuration(summary.videoSeconds)}</strong><small>视频时长</small></span>
          </div>
        </article>
      </section>

      <section className={styles.activityPanel} aria-labelledby="usage-activity-title">
        <header className={styles.panelHeader}>
          <span>
            <h2 id="usage-activity-title">近一年活动</h2>
            <p>按统一年度窗口观察用量分布，不受上方统计周期影响。</p>
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
              <span>{activityRangeLabel}</span>
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
          weeklyPoints={weeklyActivity}
        />
      </section>

      <section className={styles.compositionPanel} aria-labelledby="usage-composition-title">
        <header className={styles.panelHeader}>
          <span>
            <h2 id="usage-composition-title">消耗构成</h2>
            <p>切换分析维度，回答积分主要花在了哪里。</p>
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
            <article key={item.id}>
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
                    : `${numberFormatter.format(item.tasks)} 次处理`}
              </small>
            </article>
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
    </section>
  );
}
