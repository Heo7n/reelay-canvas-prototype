import type { HeatmapDay } from "./organization-usage-data";
import styles from "./OrganizationUsageSection.module.css";

interface UsageHeatmapProps {
  days: HeatmapDay[];
}

const numberFormatter = new Intl.NumberFormat("zh-CN");
const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

export function UsageHeatmap({ days }: UsageHeatmapProps) {
  const total = days.reduce((sum, day) => sum + day.credits, 0);
  const peak = days.reduce((highest, day) => day.credits > highest.credits ? day : highest, days[0]);
  const weeklyAverage = Math.round(total / 52);
  const leadingSlots = days[0] ? (days[0].date.getDay() + 6) % 7 : 0;

  return (
    <div className={styles.heatmapContent}>
      <div className={styles.heatmapScroller}>
        <div
          className={styles.heatmapGrid}
          role="img"
          aria-label="最近 365 天组织积分消耗热力图，颜色越深表示当天积分消耗越高"
        >
          {Array.from({ length: leadingSlots }, (_, index) => (
            <span key={`empty-${index}`} className={styles.heatmapEmpty} aria-hidden="true" />
          ))}
          {days.map((day) => (
            <span
              key={day.key}
              className={styles.heatmapDay}
              data-level={day.level}
              title={`${dateFormatter.format(day.date)}：${numberFormatter.format(day.credits)} 积分，${day.tasks} 个任务`}
              aria-hidden="true"
            />
          ))}
        </div>
      </div>

      <div className={styles.heatmapFooter}>
        <div className={styles.heatmapMetrics}>
          <span><small>近一年总消耗</small><strong>{numberFormatter.format(total)}</strong></span>
          <span><small>单日峰值</small><strong>{numberFormatter.format(peak?.credits ?? 0)}</strong></span>
          <span><small>周均消耗</small><strong>{numberFormatter.format(weeklyAverage)}</strong></span>
        </div>
        <div className={styles.heatmapLegend} aria-label="热力图强度图例">
          <span>少</span>
          {[0, 1, 2, 3, 4].map((level) => <i key={level} data-level={level} />)}
          <span>多</span>
        </div>
      </div>
    </div>
  );
}
