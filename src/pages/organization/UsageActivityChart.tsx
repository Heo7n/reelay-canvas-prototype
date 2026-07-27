import { useEffect, useMemo, useState, type CSSProperties } from "react";

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

const numberFormatter = new Intl.NumberFormat("zh-CN");
const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

const LINE_WIDTH = 820;
const LINE_HEIGHT = 210;
const LINE_PADDING_X = 18;
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

function getMonthLabels(days: HeatmapDay[], leadingSlots: number) {
  const seen = new Set<string>();
  const labelsByColumn = new Map<number, {
    key: string;
    label: string;
    column: number;
  }>();

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

export function UsageActivityChart({
  days,
  mode,
  weeklyPoints,
}: UsageActivityChartProps) {
  const [activeIndex, setActiveIndex] = useState(
    mode === "calendar" ? Math.max(0, days.length - 1) : Math.max(0, weeklyPoints.length - 1),
  );
  const leadingSlots = days[0] ? (days[0].date.getDay() + 6) % 7 : 0;
  const monthLabels = useMemo(
    () => getMonthLabels(days, leadingSlots),
    [days, leadingSlots],
  );
  const linePoints = useMemo(() => buildLinePoints(weeklyPoints), [weeklyPoints]);
  const weeklyMaximum = Math.max(1, ...weeklyPoints.map((point) => point.credits));

  useEffect(() => {
    setActiveIndex(
      mode === "calendar" ? Math.max(0, days.length - 1) : Math.max(0, weeklyPoints.length - 1),
    );
  }, [days.length, mode, weeklyPoints.length]);

  const activeDay = days[Math.min(activeIndex, Math.max(0, days.length - 1))];
  const activeWeek = weeklyPoints[
    Math.min(activeIndex, Math.max(0, weeklyPoints.length - 1))
  ];
  const activeCredits = mode === "calendar"
    ? activeDay?.credits ?? 0
    : mode === "cumulative"
      ? activeWeek?.cumulativeCredits ?? 0
      : activeWeek?.credits ?? 0;
  const activeLabel = mode === "calendar"
    ? activeDay ? dateFormatter.format(activeDay.date) : "暂无日期"
    : activeWeek?.label ?? "暂无日期";

  return (
    <div className={styles.activityChart}>
      <div className={styles.activityReading} aria-live="polite">
        <span>{activeLabel}</span>
        <strong>{numberFormatter.format(activeCredits)} 积分</strong>
      </div>

      {mode === "calendar" ? (
        <div className={styles.heatmapViewport}>
          <div className={styles.heatmapMonths} aria-hidden="true">
            {monthLabels.map((month) => (
              <span key={month.key} style={{ gridColumnStart: month.column }}>
                {month.label}
              </span>
            ))}
          </div>
          <div className={styles.heatmapBody}>
            <div className={styles.heatmapWeekdays} aria-hidden="true">
              <span>一</span><span>三</span><span>五</span>
            </div>
            <div
              className={styles.heatmapGrid}
              role="group"
              aria-label="最近一年组织积分消耗日历，颜色越深表示当天消耗越高"
            >
              {Array.from({ length: leadingSlots }, (_, index) => (
                <span key={`empty-${index}`} className={styles.heatmapEmpty} aria-hidden="true" />
              ))}
              {days.map((day, index) => (
                <button
                  key={day.key}
                  className={styles.heatmapDay}
                  data-level={day.level}
                  type="button"
                  aria-label={`${dateFormatter.format(day.date)}，${numberFormatter.format(day.credits)} 积分`}
                  onFocus={() => setActiveIndex(index)}
                  onMouseEnter={() => setActiveIndex(index)}
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {mode === "weekly" ? (
        <div className={styles.weeklyChart}>
          <div className={styles.weeklyBars} role="group" aria-label="最近 52 周积分消耗趋势">
            {weeklyPoints.map((point, index) => (
              <button
                key={point.key}
                className={index === activeIndex ? styles.activeWeeklyBar : ""}
                style={{
                  "--bar-height": `${Math.max(3, (point.credits / weeklyMaximum) * 100)}%`,
                } as CSSProperties}
                type="button"
                aria-label={`${point.label}，${numberFormatter.format(point.credits)} 积分`}
                onFocus={() => setActiveIndex(index)}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <i aria-hidden="true" />
              </button>
            ))}
          </div>
          <div className={styles.activityAxis} aria-hidden="true">
            <span>{weeklyPoints[0]?.label.split("–")[0]}</span>
            <span>{weeklyPoints[Math.floor(weeklyPoints.length / 2)]?.label.split("–")[0]}</span>
            <span>{weeklyPoints.at(-1)?.label.split("–")[1]}</span>
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
              {linePoints.map((point, index) => (
                <circle
                  key={point.key}
                  className={index === activeIndex ? styles.activeCumulativePoint : styles.cumulativePoint}
                  cx={point.x}
                  cy={point.y}
                  r={index === activeIndex ? 4.5 : 2.4}
                />
              ))}
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
                aria-label={`${point.label}，累计 ${numberFormatter.format(point.cumulativeCredits)} 积分`}
                onFocus={() => setActiveIndex(index)}
                onMouseEnter={() => setActiveIndex(index)}
              />
            ))}
          </div>
          <div className={styles.activityAxis} aria-hidden="true">
            <span>{weeklyPoints[0]?.label.split("–")[0]}</span>
            <span>{weeklyPoints[Math.floor(weeklyPoints.length / 2)]?.label.split("–")[0]}</span>
            <span>{weeklyPoints.at(-1)?.label.split("–")[1]}</span>
          </div>
        </div>
      ) : null}

      <div className={styles.activityLegend} aria-label="日历强度图例">
        {mode === "calendar" ? (
          <>
            <span>低</span>
            {[0, 1, 2, 3, 4].map((level) => <i key={level} data-level={level} />)}
            <span>高</span>
          </>
        ) : (
          <span>悬停图形查看日期与积分消耗</span>
        )}
      </div>
    </div>
  );
}
