import { CircleDollarSign, Info } from "lucide-react";

import styles from "./AccountSettingsDialog.module.css";

export function CreditRecordsSection() {
  return (
    <section className={styles.section} aria-labelledby="credit-records-title">
      <div className={styles.sectionHeading}>
        <span>
          <h2 id="credit-records-title">积分记录</h2>
          <p>当前仅展示原型基线，尚未建立可持久化的积分账本。</p>
        </span>
        <span className={styles.prototypeBadge}>刷新后重置</span>
      </div>

      <div className={styles.metricGrid}>
        <article>
          <span><CircleDollarSign aria-hidden="true" />可用积分</span>
          <strong>3000</strong>
          <small>演示额度</small>
        </article>
        <article>
          <span>本周期消耗</span>
          <strong>0</strong>
          <small>未接入账本</small>
        </article>
      </div>

      <div className={styles.boundaryNotice}>
        <Info aria-hidden="true" />
        <p>正式记录将区分发放、预占、扣减、退款和人工调整；规则确认前不生成虚构流水。</p>
      </div>

      <div className={styles.tableShell}>
        <div className={styles.tableHeader} aria-hidden="true">
          <span>时间</span>
          <span>记录类型</span>
          <span>关联项目 / 模型</span>
          <span>积分变化</span>
          <span>状态</span>
        </div>
        <div className={styles.emptyTable}>
          <CircleDollarSign aria-hidden="true" />
          <strong>暂无积分记录</strong>
          <span>真实生成与积分账本接入后，记录会显示在这里。</span>
        </div>
      </div>
    </section>
  );
}
