import { useEffect, useRef, useState } from "react";
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
  const chartRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const height = 198;
  const inset = { top: 18, right: 10, bottom: 30, left: 46 };

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return undefined;

    const updateWidth = () => {
      setWidth(Math.max(480, Math.round(chart.getBoundingClientRect().width)));
    };

    updateWidth();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateWidth);
      return () => window.removeEventListener("resize", updateWidth);
    }

    const observer = new ResizeObserver(updateWidth);
    observer.observe(chart);
    return () => observer.disconnect();
  }, []);

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
  const hoveredPoint = hoveredIndex === null ? null : chartPoints[hoveredIndex];
  const tooltipAlignment = hoveredPoint
    ? hoveredPoint.x < width * 0.28
      ? "start"
      : hoveredPoint.x > width * 0.72
        ? "end"
        : "center"
    : "center";

  return (
    <div
      ref={chartRef}
      className={styles.trendChart}
      onMouseLeave={() => setHoveredIndex(null)}
      onMouseMove={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const localX = event.clientX - bounds.left;
        const localY = event.clientY - bounds.top;
        const isWithinPlot = localX >= inset.left
          && localX <= width - inset.right
          && localY >= inset.top
          && localY <= inset.top + plotHeight;
        if (!isWithinPlot || chartPoints.length === 0) {
          setHoveredIndex(null);
          return;
        }
        const progress = (localX - inset.left) / plotWidth;
        setHoveredIndex(Math.round(progress * (chartPoints.length - 1)));
      }}
    >
      <svg
        role="img"
        aria-label={`${rangeLabel}积分消耗走势`}
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

        {hoveredPoint ? (
          <g className={styles.trendHoverIndicator} aria-hidden="true">
            <line
              x1={hoveredPoint.x}
              x2={hoveredPoint.x}
              y1={inset.top}
              y2={inset.top + plotHeight}
            />
            <circle cx={hoveredPoint.x} cy={hoveredPoint.y} r="4" />
          </g>
        ) : null}

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
      {hoveredPoint ? (
        <div
          className={styles.trendHoverCard}
          data-align={tooltipAlignment}
          style={{ left: `${hoveredPoint.x}px` }}
          role="status"
        >
          <span>{formatTrendPointDate(hoveredPoint.key, hoveredPoint.label)}</span>
          <strong>{hoveredPoint.credits.toLocaleString("zh-CN")} 积分</strong>
          <span>{hoveredPoint.tasks} 项任务</span>
        </div>
      ) : null}
    </div>
  );
}

function formatTrendPointDate(key: string, fallback: string): string {
  if (/^\d{4}-\d{2}-\d{2}-\d{2}$/.test(key)) {
    const [year, month, day, hour] = key.split("-");
    return `${year}/${month}/${day} ${hour}:00`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(key)) return key.replaceAll("-", "/");
  if (/^\d{4}-\d{2}$/.test(key)) return key.replace("-", "/");
  return fallback;
}
