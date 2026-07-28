import type { UsageTrendPoint } from "./organization-usage-data";
import styles from "./OrganizationUsageSection.module.css";

interface UsageTrendChartProps {
  points: UsageTrendPoint[];
  rangeLabel: string;
}

const numberFormatter = new Intl.NumberFormat("zh-CN", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function UsageTrendChart({
  points,
  rangeLabel,
}: UsageTrendChartProps) {
  const width = 720;
  const height = 176;
  const inset = { top: 16, right: 12, bottom: 28, left: 50 };
  const plotWidth = width - inset.left - inset.right;
  const plotHeight = height - inset.top - inset.bottom;
  const maximum = Math.max(1, ...points.map((point) => Math.max(0, point.credits)));
  const chartPoints = points.map((point, index) => ({
    ...point,
    x: inset.left + (
      points.length <= 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth
    ),
    y: inset.top + plotHeight - (Math.max(0, point.credits) / maximum) * plotHeight,
  }));
  const line = chartPoints.map((point) => `${point.x},${point.y}`).join(" ");
  const area = chartPoints.length > 0
    ? `M ${chartPoints[0].x} ${inset.top + plotHeight} L ${
      chartPoints.map((point) => `${point.x} ${point.y}`).join(" L ")
    } L ${chartPoints.at(-1)?.x ?? inset.left} ${inset.top + plotHeight} Z`
    : "";
  const labelIndexes = [...new Set([
    0,
    Math.floor((points.length - 1) / 2),
    points.length - 1,
  ])].filter((index) => index >= 0 && index < points.length);

  return (
    <div className={styles.trendChart}>
      <svg
        role="img"
        aria-label={`${rangeLabel}积分消耗趋势`}
        viewBox={`0 0 ${width} ${height}`}
      >
        {[0, 0.5, 1].map((ratio) => {
          const y = inset.top + plotHeight * ratio;
          const value = Math.round(maximum * (1 - ratio));
          return (
            <g key={ratio}>
              <line
                className={styles.trendGridLine}
                x1={inset.left}
                x2={width - inset.right}
                y1={y}
                y2={y}
              />
              <text
                className={styles.trendAxisLabel}
                textAnchor="end"
                x={inset.left - 10}
                y={y + 3}
              >
                {numberFormatter.format(value)}
              </text>
            </g>
          );
        })}

        {area ? <path className={styles.trendArea} d={area} /> : null}
        {line ? <polyline className={styles.trendLine} points={line} /> : null}

        {chartPoints.map((point) => (
          <circle
            key={point.key}
            className={styles.trendPoint}
            cx={point.x}
            cy={point.y}
            r="3"
          >
            <title>
              {point.label} · {point.credits.toLocaleString("zh-CN")} 积分 · {point.tasks} 项任务
            </title>
          </circle>
        ))}

        {labelIndexes.map((index) => {
          const point = chartPoints[index];
          return (
            <text
              key={point.key}
              className={styles.trendAxisLabel}
              textAnchor={
                index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"
              }
              x={point.x}
              y={height - 7}
            >
              {point.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
