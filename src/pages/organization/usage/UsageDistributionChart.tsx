import { useEffect, useMemo, useRef, useState } from "react";

import type { UsageTimelinePoint } from "./usage-analytics";
import styles from "./UsageDistributionChart.module.css";

interface UsageDistributionChartProps {
  points: UsageTimelinePoint[];
  horizontal?: boolean;
  rangeLabel: string;
}

const numberFormatter = new Intl.NumberFormat("zh-CN");
const SEGMENTS = [
  { id: "video" as const, label: "视频生成", className: styles.video },
  { id: "image" as const, label: "图片生成", className: styles.image },
  { id: "processing" as const, label: "媒体处理", className: styles.processing },
];

function niceMaximum(value: number): number {
  if (value <= 0) return 100;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

function compactNumber(value: number): string {
  if (value >= 10_000) return `${Math.round(value / 1_000)}k`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 5_000 ? 0 : 1)}k`;
  return numberFormatter.format(value);
}

export function UsageDistributionChart({
  points,
  horizontal = false,
  rangeLabel,
}: UsageDistributionChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const maximum = useMemo(
    () => niceMaximum(Math.max(0, ...points.map((point) => point.total)) * 1.08),
    [points],
  );
  const total = points.reduce((sum, point) => sum + point.total, 0);

  useEffect(() => {
    if (horizontal || !scrollRef.current) return;
    scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
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
          {displayPoints.map((point) => (
            <div key={point.key} className={styles.horizontalRow}>
              <span className={styles.dayLabel}>{point.label}</span>
              <span className={styles.horizontalTrack} aria-hidden="true">
                <i style={{ width: `${Math.max(point.total > 0 ? 3 : 0, point.total / maximum * 100)}%` }} />
              </span>
              <strong>{numberFormatter.format(point.total)}</strong>
            </div>
          ))}
        </div>
        <div className={styles.horizontalAxis} aria-hidden="true">
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
            <span key={ratio}>{compactNumber(maximum * ratio)}</span>
          ))}
          <em>积分</em>
        </div>
      </div>
    );
  }

  const chartHeight = 250;
  const chartTop = 18;
  const chartBottom = 40;
  const plotHeight = chartHeight - chartTop - chartBottom;
  const visiblePointCount = Math.min(15, Math.max(1, points.length));
  const slotWidth = Math.max(46, (viewportWidth || 860) / visiblePointCount);
  const chartWidth = Math.max(viewportWidth || 860, points.length * slotWidth);
  const barWidth = Math.max(22, Math.min(30, slotWidth * 0.52));
  const yTicks = [1, 0.75, 0.5, 0.25, 0];
  const activePoint = activeIndex === null ? null : points[activeIndex];
  const activeX = activeIndex === null
    ? 0
    : (activeIndex + 0.5) * (chartWidth / Math.max(1, points.length));
  const linePath = points.map((point, index) => {
    const x = (index + 0.5) * (chartWidth / Math.max(1, points.length));
    const y = chartTop + plotHeight - (point.total / maximum) * plotHeight;
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

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
      <div ref={scrollRef} className={styles.plotScroller}>
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
                  role="button"
                  tabIndex={0}
                  aria-label={`${point.fullLabel}，总消耗${numberFormatter.format(point.total)}积分`}
                  onPointerEnter={() => setActiveIndex(index)}
                  onPointerLeave={() => setActiveIndex(null)}
                  onFocus={() => setActiveIndex(index)}
                  onBlur={() => setActiveIndex(null)}
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
                  <text x={(index + 0.5) * slot} y={chartHeight - 17} textAnchor="middle" className={styles.xLabel}>
                    {point.label.replace(/\s*周.$/, "")}
                  </text>
                </g>
              );
            })}
            <path d={linePath} className={styles.totalLine} />
            {points.map((point, index) => {
              const x = (index + 0.5) * (chartWidth / Math.max(1, points.length));
              const y = chartTop + plotHeight - (point.total / maximum) * plotHeight;
              return <circle key={point.key} cx={x} cy={y} r="3.5" className={styles.totalPoint} />;
            })}
          </svg>
          {activePoint ? (
            <div
              className={styles.tooltip}
              data-edge={activeIndex !== null && activeIndex < 2 ? "start" : activeIndex !== null && activeIndex > points.length - 3 ? "end" : undefined}
              style={{ left: `${activeX}px` }}
            >
              <strong>{activePoint.fullLabel}</strong>
              <span><i className={styles.totalDot} />总消耗 <b>{numberFormatter.format(activePoint.total)}</b></span>
              {SEGMENTS.map((segment) => (
                <span key={segment.id}>
                  <i className={segment.className} />{segment.label}
                  <b>{numberFormatter.format(activePoint.segments[segment.id])}</b>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className={styles.legend} aria-hidden="true">
        {SEGMENTS.map((segment) => <span key={segment.id}><i className={segment.className} />{segment.label}</span>)}
        <span><i className={styles.lineLegend} />总消耗</span>
      </div>
    </div>
  );
}
