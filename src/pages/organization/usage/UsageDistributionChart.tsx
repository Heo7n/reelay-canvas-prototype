import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import type { UsageTimelinePoint } from "./usage-analytics";
import styles from "./UsageDistributionChart.module.css";

interface UsageDistributionChartProps {
  points: UsageTimelinePoint[];
  horizontal?: boolean;
  rangeLabel: string;
}

const numberFormatter = new Intl.NumberFormat("zh-CN");
const TOOLTIP_WIDTH = 168;
const PLOT_OFFSET_X = 46;
const TOOLTIP_MARGIN = 0;
const TOOLTIP_ARROW_MARGIN = 4.5;
const SEGMENTS = [
  { id: "video" as const, label: "视频生成", className: styles.video },
  { id: "image" as const, label: "图片生成", className: styles.image },
  { id: "processing" as const, label: "媒体处理", className: styles.processing },
];

function niceMaximum(value: number): number {
  if (value <= 0) return 100;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const factor = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]
    .find((candidate) => candidate >= normalized) ?? 10;
  return factor * magnitude;
}

function compactNumber(value: number): string {
  if (value >= 1_000) {
    const scaled = value / 1_000;
    return `${Number.isInteger(scaled) ? scaled.toFixed(0) : scaled.toFixed(1)}k`;
  }
  return numberFormatter.format(value);
}

function axisLabel(point: UsageTimelinePoint): string {
  if (point.label.includes("—") || point.label.includes("年")) return point.label;
  return /^\d{4}-\d{2}-\d{2}$/.test(point.key)
    ? `${Number(point.key.slice(5, 7))}月${Number(point.key.slice(8, 10))}日`
    : point.label;
}

function minimumSlotWidth(points: UsageTimelinePoint[]): number {
  if (points.some((point) => point.label.includes("年"))) return 78;
  if (points.some((point) => point.label.includes("—"))) return 70;
  return points.length <= 31 ? 28 : 38;
}

export function UsageDistributionChart({
  points,
  horizontal = false,
  rangeLabel,
}: UsageDistributionChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const maximum = useMemo(
    () => niceMaximum(Math.max(0, ...points.map((point) => point.total)) * 1.08),
    [points],
  );
  const total = points.reduce((sum, point) => sum + point.total, 0);

  useEffect(() => {
    if (horizontal || !scrollRef.current) return;
    const nextScrollLeft = scrollRef.current.scrollWidth - scrollRef.current.clientWidth;
    scrollRef.current.scrollLeft = nextScrollLeft;
    setScrollLeft(scrollRef.current.scrollLeft);
  }, [horizontal, points.length, viewportWidth]);

  useEffect(() => {
    if (horizontal || !scrollRef.current) return;
    const scroller = scrollRef.current;
    const updateWidth = () => setViewportWidth(scroller.clientWidth);
    updateWidth();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateWidth);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [horizontal]);

  if (horizontal) {
    const displayPoints = [...points].reverse();
    return (
      <div className={styles.horizontalChart} aria-label={`${rangeLabel}每日积分消耗`}>
        <div className={styles.horizontalRows}>
          {displayPoints.map((point) => {
            const barPercent = Math.max(point.total > 0 ? 3 : 0, point.total / maximum * 100);
            return (
              <div key={point.key} className={styles.horizontalRow}>
                <span className={styles.dayLabel}>{point.label}</span>
                <span className={styles.horizontalTrack}>
                  <i aria-hidden="true" style={{ width: `${barPercent}%` }} />
                  <strong style={{ left: `calc(${barPercent}% + 9px)` }}>
                    {numberFormatter.format(point.total)}
                  </strong>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const chartHeight = 268;
  const chartTop = 18;
  const chartBottom = 46;
  const plotHeight = chartHeight - chartTop - chartBottom;
  const visiblePointCount = points.length <= 31
    ? Math.max(1, points.length)
    : Math.min(15, Math.max(1, points.length));
  const slotWidth = Math.max(
    minimumSlotWidth(points),
    (viewportWidth || 860) / (visiblePointCount + 0.5),
  );
  const chartWidth = Math.max(viewportWidth || 860, points.length * slotWidth);
  const barWidth = Math.max(16, Math.min(26, slotWidth * 0.56));
  const labelStep = points.length > 20 ? Math.ceil(points.length / 10) : 1;
  const yTicks = [1, 0.75, 0.5, 0.25, 0];
  const activePoint = activeIndex === null ? null : points[activeIndex];
  const activeX = activeIndex === null
    ? 0
    : (activeIndex + 0.5) * (chartWidth / Math.max(1, points.length));
  const activeY = activePoint
    ? Math.max(chartTop + 2, chartTop + plotHeight - (activePoint.total / maximum) * plotHeight)
    : 0;
  const activeViewportX = activeX - scrollLeft;
  const plotViewportWidth = viewportWidth || 860;
  const tooltipTargetX = PLOT_OFFSET_X + activeViewportX;
  const tooltipMinLeft = PLOT_OFFSET_X + TOOLTIP_MARGIN;
  const tooltipMaxLeft = Math.max(
    tooltipMinLeft,
    PLOT_OFFSET_X + plotViewportWidth - TOOLTIP_WIDTH - TOOLTIP_MARGIN,
  );
  const tooltipLeft = Math.max(
    tooltipMinLeft,
    Math.min(tooltipTargetX - TOOLTIP_WIDTH / 2, tooltipMaxLeft),
  );
  const tooltipArrowX = Math.max(
    TOOLTIP_ARROW_MARGIN,
    Math.min(tooltipTargetX - tooltipLeft, TOOLTIP_WIDTH - TOOLTIP_ARROW_MARGIN),
  );
  const tooltipStyle = {
    left: `${tooltipLeft}px`,
    top: `${activeY}px`,
    "--tooltip-arrow-x": `${tooltipArrowX}px`,
  } as CSSProperties;
  const tooltipPlacement = activeY > chartTop + plotHeight * 0.48 ? "above" : "below";

  return (
    <div className={styles.stackedChart} aria-label={`${rangeLabel}积分消耗分布`}>
      <div className={styles.yAxis} aria-hidden="true">
        <small>积分</small>
        {yTicks.map((ratio) => (
          <span key={ratio} style={{ top: `${chartTop + (1 - ratio) * plotHeight}px` }}>
            {compactNumber(maximum * ratio)}
          </span>
        ))}
      </div>
      <div
        ref={scrollRef}
        className={styles.plotScroller}
        onScroll={(event) => setScrollLeft(event.currentTarget.scrollLeft)}
      >
        <div className={styles.plotCanvas} style={{ width: `${chartWidth}px` }}>
          <svg
            className={styles.plotSvg}
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            role="img"
            aria-label={`${rangeLabel}每日堆叠柱形图，总消耗${numberFormatter.format(total)}积分`}
          >
            {yTicks.map((ratio) => {
              const y = chartTop + (1 - ratio) * plotHeight;
              return <line key={ratio} x1="0" x2={chartWidth} y1={y} y2={y} className={styles.gridLine} />;
            })}
            {points.map((point, index) => {
              const slot = chartWidth / Math.max(1, points.length);
              const x = (index + 0.5) * slot - barWidth / 2;
              let cursorY = chartTop + plotHeight;
              return (
                <g
                  key={point.key}
                  onPointerEnter={() => setActiveIndex(index)}
                  onPointerLeave={() => setActiveIndex(null)}
                >
                  {SEGMENTS.map((segment) => {
                    const value = point.segments[segment.id];
                    const height = value / maximum * plotHeight;
                    cursorY -= height;
                    return (
                      <rect
                        key={segment.id}
                        x={x}
                        y={cursorY}
                        width={barWidth}
                        height={Math.max(0, height)}
                        rx="2"
                        className={segment.className}
                      />
                    );
                  })}
                  <rect x={(index * slot)} y="0" width={slot} height={chartHeight - 28} className={styles.hitArea} />
                  {index % labelStep === 0 || index === points.length - 1 ? (
                    <text
                      x={index === 0 ? 3 : index === points.length - 1 ? chartWidth - 3 : (index + 0.5) * slot}
                      y={chartHeight - 17}
                      textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
                      className={styles.xLabel}
                    >
                      {axisLabel(point)}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      {activePoint ? (
        <div
          className={styles.tooltip}
          data-placement={tooltipPlacement}
          style={tooltipStyle}
        >
          <strong>{activePoint.label}</strong>
          <span><i className={styles.totalDot} />总消耗 <b>{numberFormatter.format(activePoint.total)}</b></span>
          {SEGMENTS.map((segment) => (
            <span key={segment.id}>
              <i className={segment.className} />{segment.label}
              <b>{numberFormatter.format(activePoint.segments[segment.id])}</b>
            </span>
          ))}
        </div>
      ) : null}
      <div className={styles.legend} aria-hidden="true">
        {SEGMENTS.map((segment) => <span key={segment.id}><i className={segment.className} />{segment.label}</span>)}
      </div>
    </div>
  );
}
