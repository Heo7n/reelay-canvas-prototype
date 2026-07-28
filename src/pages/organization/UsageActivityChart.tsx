import { useMemo, useState, type CSSProperties } from "react";

import type { HeatmapDay } from "./organization-usage-data";
import styles from "./OrganizationUsageSection.module.css";

export type UsageActivityMode = "calendar" | "weekly" | "cumulative";

interface UsageActivityChartProps {
  days: HeatmapDay[];
  mode: UsageActivityMode;
}

interface MonthLabel {
  key: string;
  label: string;
  column: number;
}

interface ActivityWeek {
  key: string;
  label: string;
  credits: number;
  cumulativeCredits: number;
}

const COLUMN_COUNT = 53;
const LINE_WIDTH = 1060;
const LINE_HEIGHT = 184;
const LINE_PADDING_Y = 12;

const numberFormatter = new Intl.NumberFormat("zh-CN");
const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "long",
  day: "numeric",
});
const compactDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "numeric",
  day: "numeric",
});

function getTooltipAlignment(column: number): "start" | "center" | "end" {
  if (column <= 2) return "start";
  if (column >= COLUMN_COUNT - 1) return "end";
  return "center";
}

function getMonthLabels(days: HeatmapDay[], leadingSlots: number): MonthLabel[] {
  const seen = new Set<string>();
  const labelsByColumn = new Map<number, MonthLabel>();

  days.forEach((day, index) => {
    const monthKey = `${day.date.getFullYear()}-${day.date.getMonth()}`;
    if (seen.has(monthKey)) return;
    seen.add(monthKey);

    const column = Math.floor((leadingSlots + index) / 7) + 1;
    labelsByColumn.set(column, {
      key: monthKey,
      label: `${day.date.getMonth() + 1}月`,
      column,
    });
  });

  return [...labelsByColumn.values()];
}

function getActivityWeeks(days: HeatmapDay[], leadingSlots: number): ActivityWeek[] {
  const columns = Array.from({ length: COLUMN_COUNT }, () => [] as HeatmapDay[]);

  days.forEach((day, index) => {
    const column = Math.floor((leadingSlots + index) / 7);
    columns[column]?.push(day);
  });

  let cumulativeCredits = 0;
  return columns.map((columnDays, index) => {
    const firstDay = columnDays[0];
    const lastDay = columnDays.at(-1);
    const credits = columnDays.reduce((total, day) => total + day.credits, 0);
    cumulativeCredits += credits;

    return {
      key: firstDay?.key ?? `empty-week-${index}`,
      label: firstDay && lastDay
        ? `${compactDateFormatter.format(firstDay.date)}–${compactDateFormatter.format(lastDay.date)}`
        : "无日期",
      credits,
      cumulativeCredits,
    };
  });
}

function getLinePoints(weeks: ActivityWeek[]) {
  const maximum = Math.max(1, ...weeks.map((week) => week.cumulativeCredits));
  const chartHeight = LINE_HEIGHT - LINE_PADDING_Y * 2;

  return weeks.map((week, index) => ({
    ...week,
    x: ((index + 0.5) / COLUMN_COUNT) * LINE_WIDTH,
    y: LINE_PADDING_Y
      + chartHeight
      - (week.cumulativeCredits / maximum) * chartHeight,
  }));
}

function buildPath(points: ReturnType<typeof getLinePoints>): string {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
}

export function UsageActivityChart({
  days,
  mode,
}: UsageActivityChartProps) {
  const [activeLineIndex, setActiveLineIndex] = useState<number | null>(null);
  const leadingSlots = days[0] ? (days[0].date.getDay() + 6) % 7 : 0;
  const trailingSlots = Math.max(0, COLUMN_COUNT * 7 - leadingSlots - days.length);
  const monthLabels = useMemo(
    () => getMonthLabels(days, leadingSlots),
    [days, leadingSlots],
  );
  const weeks = useMemo(
    () => getActivityWeeks(days, leadingSlots),
    [days, leadingSlots],
  );
  const linePoints = useMemo(() => getLinePoints(weeks), [weeks]);
  const weeklyMaximum = Math.max(1, ...weeks.map((week) => week.credits));
  const activeLinePoint = activeLineIndex === null ? null : linePoints[activeLineIndex];

  return (
    <div className={styles.activityChart} data-mode={mode}>
      {mode === "calendar" ? (
        <div
          className={`${styles.annualPlot} ${styles.heatmapGrid}`}
          role="group"
          aria-label="近 365 天组织积分消耗日历，颜色越深表示当天消耗越高"
        >
          {Array.from({ length: leadingSlots }, (_, index) => (
            <span key={`leading-${index}`} className={styles.heatmapEmpty} aria-hidden="true" />
          ))}
          {days.map((day, index) => {
            const column = Math.floor((leadingSlots + index) / 7);
            return (
              <button
                key={day.key}
                className={styles.heatmapDay}
                data-level={day.level}
                data-tooltip-align={getTooltipAlignment(column)}
                type="button"
                aria-label={`${dateFormatter.format(day.date)}，${numberFormatter.format(day.credits)} 积分`}
              >
                <span className={styles.chartTooltip} aria-hidden="true">
                  <strong className={styles.tooltipDate}>
                    {dateFormatter.format(day.date)}
                  </strong>
                  <span className={styles.tooltipSeparator}>·</span>
                  <span className={styles.tooltipValue}>
                    {numberFormatter.format(day.credits)} 积分
                  </span>
                </span>
              </button>
            );
          })}
          {Array.from({ length: trailingSlots }, (_, index) => (
            <span key={`trailing-${index}`} className={styles.heatmapEmpty} aria-hidden="true" />
          ))}
        </div>
      ) : null}

      {mode === "weekly" ? (
        <div
          className={`${styles.annualPlot} ${styles.weeklyBars}`}
          role="group"
          aria-label="近 365 天每周积分消耗趋势"
        >
          {weeks.map((week, index) => (
            <button
              key={week.key}
              style={{
                "--bar-height": `${Math.max(2, (week.credits / weeklyMaximum) * 100)}%`,
              } as CSSProperties}
              data-tooltip-align={getTooltipAlignment(index)}
              type="button"
              aria-label={`${week.label}，${numberFormatter.format(week.credits)} 积分`}
            >
              <i aria-hidden="true" />
              <span className={styles.chartTooltip} aria-hidden="true">
                <strong className={styles.tooltipDate}>{week.label}</strong>
                <span className={styles.tooltipSeparator}>·</span>
                <span className={styles.tooltipValue}>
                  {numberFormatter.format(week.credits)} 积分
                </span>
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {mode === "cumulative" ? (
        <div
          className={`${styles.annualPlot} ${styles.cumulativeCanvas}`}
          onMouseLeave={() => setActiveLineIndex(null)}
        >
          <svg
            viewBox={`0 0 ${LINE_WIDTH} ${LINE_HEIGHT}`}
            preserveAspectRatio="none"
            role="img"
            aria-label="近 365 天按周累计积分消耗"
          >
            <g className={styles.activityGuideLines} aria-hidden="true">
              {[0, 1, 2, 3].map((line) => {
                const y = LINE_PADDING_Y
                  + ((LINE_HEIGHT - LINE_PADDING_Y * 2) / 3) * line;
                return (
                  <line
                    key={line}
                    x1={0}
                    x2={LINE_WIDTH}
                    y1={y}
                    y2={y}
                  />
                );
              })}
            </g>
            <path
              className={styles.cumulativeArea}
              d={`${buildPath(linePoints)} L ${linePoints.at(-1)?.x ?? 0} ${LINE_HEIGHT - LINE_PADDING_Y} L ${linePoints[0]?.x ?? 0} ${LINE_HEIGHT - LINE_PADDING_Y} Z`}
            />
            <path className={styles.cumulativeLine} d={buildPath(linePoints)} />
            {activeLinePoint ? (
              <g className={styles.activeCumulativeGuide} aria-hidden="true">
                <line
                  x1={activeLinePoint.x}
                  x2={activeLinePoint.x}
                  y1={0}
                  y2={LINE_HEIGHT}
                />
                <circle cx={activeLinePoint.x} cy={activeLinePoint.y} r="5" />
              </g>
            ) : null}
          </svg>
          {linePoints.map((point, index) => (
            <button
              key={point.key}
              className={styles.cumulativeTarget}
              data-tooltip-align={getTooltipAlignment(index)}
              style={{
                left: `${((index + 0.5) / COLUMN_COUNT) * 100}%`,
              }}
              type="button"
              aria-label={`${point.label}，累计 ${numberFormatter.format(point.cumulativeCredits)} 积分，本周增加 ${numberFormatter.format(point.credits)} 积分`}
              onBlur={() => setActiveLineIndex(null)}
              onFocus={() => setActiveLineIndex(index)}
              onMouseEnter={() => setActiveLineIndex(index)}
            />
          ))}
          {activeLinePoint && activeLineIndex !== null ? (
            <span
              className={`${styles.chartTooltip} ${styles.cumulativeTooltip}`}
              data-tooltip-align={getTooltipAlignment(activeLineIndex)}
              style={{
                "--point-x": `${((activeLineIndex + 0.5) / COLUMN_COUNT) * 100}%`,
                "--point-y": `${(activeLinePoint.y / LINE_HEIGHT) * 100}%`,
              } as CSSProperties}
              aria-hidden="true"
            >
              <strong className={styles.tooltipDate}>{activeLinePoint.label}</strong>
              <span className={styles.tooltipSeparator}>·</span>
              <span className={styles.tooltipValue}>
                累计 {numberFormatter.format(activeLinePoint.cumulativeCredits)}
              </span>
              <span className={styles.tooltipSecondary}>
                本周 +{numberFormatter.format(activeLinePoint.credits)}
              </span>
            </span>
          ) : null}
        </div>
      ) : null}

      <div className={styles.activityMonthAxis} aria-hidden="true">
        {monthLabels.map((month) => (
          <span key={month.key} style={{ gridColumnStart: month.column }}>
            {month.label}
          </span>
        ))}
      </div>
    </div>
  );
}
