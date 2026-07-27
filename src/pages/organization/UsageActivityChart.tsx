import { useMemo, useState, type CSSProperties } from "react";

import type {
  HeatmapDay,
  UsageActivityPoint,
} from "./organization-usage-data";
import styles from "./OrganizationUsageSection.module.css";

export type UsageActivityMode = "calendar" | "weekly" | "cumulative";

interface UsageActivityChartProps {
  days: HeatmapDay[];
  mode: UsageActivityMode;
  weeklyPoints: UsageActivityPoint[];
}

interface MonthLabel {
  key: string;
  label: string;
  column: number;
}

const numberFormatter = new Intl.NumberFormat("zh-CN");
const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "long",
  day: "numeric",
});

const LINE_WIDTH = 820;
const LINE_HEIGHT = 224;
const LINE_PADDING_X = 14;
const LINE_PADDING_Y = 18;

function buildLinePoints(points: UsageActivityPoint[]) {
  const maximum = Math.max(1, ...points.map((point) => point.cumulativeCredits));
  const width = LINE_WIDTH - LINE_PADDING_X * 2;
  const height = LINE_HEIGHT - LINE_PADDING_Y * 2;
  return points.map((point, index) => ({
    ...point,
    x: LINE_PADDING_X + (index / Math.max(1, points.length - 1)) * width,
    y: LINE_PADDING_Y + height - (point.cumulativeCredits / maximum) * height,
  }));
}

function buildPath(points: ReturnType<typeof buildLinePoints>): string {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
}

function getCalendarMonthLabels(days: HeatmapDay[], leadingSlots: number): MonthLabel[] {
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

  return Array.from(labelsByColumn.values());
}

function getWeeklyMonthLabels(points: UsageActivityPoint[]): MonthLabel[] {
  const seen = new Set<string>();
  return points.flatMap((point, index) => {
    const monthKey = `${point.start.getFullYear()}-${point.start.getMonth()}`;
    if (seen.has(monthKey)) return [];
    seen.add(monthKey);
    return [{
      key: monthKey,
      label: `${point.start.getMonth() + 1}月`,
      column: index + 1,
    }];
  });
}

function formatSignedCredits(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "±";
  return `${sign}${numberFormatter.format(Math.abs(value))}`;
}

export function UsageActivityChart({
  days,
  mode,
  weeklyPoints,
}: UsageActivityChartProps) {
  const [activeLineIndex, setActiveLineIndex] = useState<number | null>(null);
  const leadingSlots = days[0] ? (days[0].date.getDay() + 6) % 7 : 0;
  const calendarMonthLabels = useMemo(
    () => getCalendarMonthLabels(days, leadingSlots),
    [days, leadingSlots],
  );
  const weeklyMonthLabels = useMemo(
    () => getWeeklyMonthLabels(weeklyPoints),
    [weeklyPoints],
  );
  const linePoints = useMemo(() => buildLinePoints(weeklyPoints), [weeklyPoints]);
  const weeklyMaximum = Math.max(1, ...weeklyPoints.map((point) => point.credits));
  const activeLinePoint = activeLineIndex === null ? null : linePoints[activeLineIndex];

  return (
    <div className={styles.activityChart} data-mode={mode}>
      {mode === "calendar" ? (
        <div className={styles.heatmapViewport}>
          <div
            className={styles.heatmapGrid}
            role="group"
            aria-label="365 天组织积分消耗日历，颜色越深表示当天消耗越高"
          >
            {Array.from({ length: leadingSlots }, (_, index) => (
              <span key={`empty-${index}`} className={styles.heatmapEmpty} aria-hidden="true" />
            ))}
            {days.map((day) => (
              <button
                key={day.key}
                className={styles.heatmapDay}
                data-level={day.level}
                type="button"
                aria-label={`${dateFormatter.format(day.date)}，${numberFormatter.format(day.credits)} 积分`}
              >
                <span className={styles.chartTooltip} aria-hidden="true">
                  {dateFormatter.format(day.date)} · {numberFormatter.format(day.credits)} 积分
                </span>
              </button>
            ))}
          </div>
          <div className={styles.heatmapMonths} aria-hidden="true">
            {calendarMonthLabels.map((month) => (
              <span key={month.key} style={{ gridColumnStart: month.column }}>
                {month.label}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {mode === "weekly" ? (
        <div className={styles.weeklyChart}>
          <div className={styles.weeklyBars} role="group" aria-label="最近 52 周积分消耗趋势">
            {weeklyPoints.map((point, index) => {
              const previousCredits = weeklyPoints[index - 1]?.credits ?? point.credits;
              const delta = point.credits - previousCredits;
              return (
                <button
                  key={point.key}
                  style={{
                    "--bar-height": `${Math.max(3, (point.credits / weeklyMaximum) * 100)}%`,
                  } as CSSProperties}
                  type="button"
                  aria-label={`${point.label}，${numberFormatter.format(point.credits)} 积分，较前一周 ${formatSignedCredits(delta)}`}
                >
                  <i aria-hidden="true" />
                  <span className={styles.chartTooltip} aria-hidden="true">
                    <strong>{point.label}</strong>
                    <small>{numberFormatter.format(point.credits)} 积分 · {formatSignedCredits(delta)}</small>
                  </span>
                </button>
              );
            })}
          </div>
          <div className={styles.weeklyMonths} aria-hidden="true">
            {weeklyMonthLabels.map((month) => (
              <span key={month.key} style={{ gridColumnStart: month.column }}>
                {month.label}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {mode === "cumulative" ? (
        <div className={styles.cumulativeChart}>
          <div className={styles.cumulativeCanvas}>
            <svg
              viewBox={`0 0 ${LINE_WIDTH} ${LINE_HEIGHT}`}
              role="img"
              aria-label="最近 52 周累计积分消耗趋势"
            >
              <g className={styles.activityGuideLines} aria-hidden="true">
                {[0, 1, 2, 3].map((line) => {
                  const y = LINE_PADDING_Y
                    + ((LINE_HEIGHT - LINE_PADDING_Y * 2) / 3) * line;
                  return (
                    <line
                      key={line}
                      x1={LINE_PADDING_X}
                      x2={LINE_WIDTH - LINE_PADDING_X}
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
                    y1={activeLinePoint.y}
                    y2={LINE_HEIGHT - LINE_PADDING_Y}
                  />
                  <circle cx={activeLinePoint.x} cy={activeLinePoint.y} r="5" />
                </g>
              ) : null}
            </svg>
            {linePoints.map((point, index) => (
              <button
                key={point.key}
                className={styles.cumulativeTarget}
                style={{
                  left: `${(point.x / LINE_WIDTH) * 100}%`,
                  top: `${(point.y / LINE_HEIGHT) * 100}%`,
                }}
                type="button"
                aria-label={`${point.label}，累计 ${numberFormatter.format(point.cumulativeCredits)} 积分，本周增加 ${numberFormatter.format(point.credits)} 积分`}
                onBlur={() => setActiveLineIndex(null)}
                onFocus={() => setActiveLineIndex(index)}
                onMouseEnter={() => setActiveLineIndex(index)}
                onMouseLeave={() => setActiveLineIndex(null)}
              >
                <span className={styles.chartTooltip} aria-hidden="true">
                  <strong>{point.label}</strong>
                  <small>
                    累计 {numberFormatter.format(point.cumulativeCredits)} · 本周 +{numberFormatter.format(point.credits)}
                  </small>
                </span>
              </button>
            ))}
          </div>
          <div className={styles.weeklyMonths} aria-hidden="true">
            {weeklyMonthLabels.map((month) => (
              <span key={month.key} style={{ gridColumnStart: month.column }}>
                {month.label}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {mode === "calendar" ? (
        <div className={styles.activityLegend} aria-label="日历强度图例">
          <span>低</span>
          {[0, 1, 2, 3, 4].map((level) => <i key={level} data-level={level} />)}
          <span>高</span>
        </div>
      ) : null}
    </div>
  );
}
