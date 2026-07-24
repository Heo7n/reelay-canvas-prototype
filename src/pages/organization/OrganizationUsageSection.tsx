import { Activity, BarChart3, CalendarDays, CheckCircle2, Layers3, UsersRound } from "lucide-react";

import styles from "./OrganizationCenterPage.module.css";

export function OrganizationUsageSection() {
  return (
    <section className={styles.section} aria-labelledby="organization-usage-title">
      <div className={styles.sectionHeading}>
        <span>
          <h1 id="organization-usage-title">用量看板</h1>
          <p>查看组织生成任务与积分消耗的总体分布。</p>
        </span>
        <span className={styles.prototypeBadge}>统计口径待接入</span>
      </div>

      <div className={styles.usageToolbar}>
        <span><CalendarDays aria-hidden="true" />本月</span>
        <small>组织时区：Asia/Shanghai</small>
      </div>

      <div className={styles.usageMetricGrid}>
        <article><span><Activity aria-hidden="true" />本期净消耗</span><strong>—</strong><small>已结算扣减 − 退款</small></article>
        <article><span><Layers3 aria-hidden="true" />生成任务</span><strong>—</strong><small>图片与视频任务总数</small></article>
        <article><span><CheckCircle2 aria-hidden="true" />生成成功率</span><strong>—</strong><small>成功任务 / 已结束任务</small></article>
        <article><span><UsersRound aria-hidden="true" />活跃成员</span><strong>—</strong><small>本期产生任务的成员</small></article>
      </div>

      <div className={styles.usageChart}>
        <div className={styles.chartGrid} aria-hidden="true">
          <span /><span /><span /><span /><span />
        </div>
        <div className={styles.chartEmpty}>
          <BarChart3 aria-hidden="true" />
          <strong>等待真实生成任务与积分账本</strong>
          <span>接入后将在这里展示每日净消耗趋势；预占、退款和免费任务不会被混为同一种用量。</span>
        </div>
      </div>

      <div className={styles.breakdownGrid}>
        <article>
          <h2>成员消耗</h2>
          <div><UsersRound aria-hidden="true" /><span>暂无可归集的成员用量</span></div>
        </article>
        <article>
          <h2>项目消耗</h2>
          <div><Layers3 aria-hidden="true" /><span>暂无可归集的项目用量</span></div>
        </article>
      </div>
    </section>
  );
}
