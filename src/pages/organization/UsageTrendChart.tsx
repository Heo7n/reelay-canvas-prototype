import { useMemo, useState } from "react";

import type { UsageTrendPoint } from "./organization-usage-data";
import styles from "./OrganizationUsageSection.module.css";

interface UsageTrendChartProps {
  comparisonPoints: UsageTrendPoint[];
  points: UsageTrendPoint[];
  showComparison: boolean;
}

interface PlotPoint extends UsageTrendPoint {
  x: number;
  y: number;
}

const WIDTH = 760;
const HEIGHT = 240;
const PADDING_X = 22;
const PADDING_Y = 22;

function buildPlot(points: UsageTrendPoint[], maximum: number): PlotPoint[] {
  const drawableWidth = WIDTH - PADDING_X * 2;
  const drawableHeight = HEIGHT - PADDING_Y * 2;
  return points.map((point, index) => ({
    ...point,
    x: PADDING_X + (points.length <= 1 ? drawableWidth / 2 : (index / (points.length - 1)) * drawableWidth),
    y: PADDING_Y + drawableHeight - (point.credits / maximum) * drawableHeight,
  }));
}

function buildPath(points: PlotPoint[]): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function formatCredits(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(Math.round(value));
}

export function UsageTrendChart({
  comparisonPoints,
  points,
  showComparison,
}: UsageTrendChartProps) {
  const [activeIndex, setActiveIndex] = useState(Math.max(0, points.length - 1));
  const plot = useMemo(() => {
    const maximum = Math.max(1, ...points.map((point) => point.credits), ...comparisonPoints.map((point) => point.credits));
    return {
      current: buildPlot(points, maximum),
      previous: buildPlot(comparisonPoints, maximum),
      maximum,
    };
  }, [comparisonPoints, points]);
  const activePoint = plot.current[Math.min(activeIndex, Math.max(0, plot.current.length - 1))];

  if (points.length === 0) {
    return <div className={styles.chartNoData}>当前筛选范围暂无用量</div>;
  }

  return (
    <div className={styles.trendChart}>
      <div className={styles.chartSummary}>
        <span>{activePoint?.label}</span>
        <strong>{formatCredits(activePoint?.credits ?? 0)} 积分</strong>
        <small>{activePoint?.tasks ?? 0} 个已结算任务</small>
      </div>

      <div className={styles.chartCanvas}>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="组织积分消耗趋势">
          <defs>
            <linearGradient id="usage-area-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <g className={styles.chartGuideLines} aria-hidden="true">
            {[0, 1, 2, 3].map((line) => {
              const y = PADDING_Y + ((HEIGHT - PADDING_Y * 2) / 3) * line;
              return <line key={line} x1={PADDING_X} x2={WIDTH - PADDING_X} y1={y} y2={y} />;
            })}
          </g>
          {showComparison && plot.previous.length > 1 ? (
            <path className={styles.comparisonLine} d={buildPath(plot.previous)} fill="none" />
          ) : null}
          <path
            className={styles.areaFill}
            d={`${buildPath(plot.current)} L ${plot.current.at(-1)?.x ?? 0} ${HEIGHT - PADDING_Y} L ${plot.current[0]?.x ?? 0} ${HEIGHT - PADDING_Y} Z`}
            fill="url(#usage-area-fill)"
          />
          <path className={styles.trendLine} d={buildPath(plot.current)} fill="none" />
          {plot.current.map((point, index) => (
            <circle
              key={point.key}
              className={index === activeIndex ? styles.activeChartPoint : styles.chartPoint}
              cx={point.x}
              cy={point.y}
              r={index === activeIndex ? 4.5 : 2.6}
            />
          ))}
        </svg>

        {plot.current.map((point, index) => (
          <button
            key={point.key}
            className={styles.chartPointTarget}
            style={{
              left: `${(point.x / WIDTH) * 100}%`,
              top: `${(point.y / HEIGHT) * 100}%`,
            }}
            type="button"
            aria-label={`${point.label}，${formatCredits(point.credits)} 积分，${point.tasks} 个任务`}
            onFocus={() => setActiveIndex(index)}
            onMouseEnter={() => setActiveIndex(index)}
          />
        ))}
      </div>

      <div className={styles.chartAxis} aria-hidden="true">
        <span>{points[0]?.label}</span>
        <span>{points[Math.floor(points.length / 2)]?.label}</span>
        <span>{points.at(-1)?.label}</span>
      </div>
    </div>
  );
}
