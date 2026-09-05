import { useState } from "react";

import type { HeatmapDay } from "../../../features/usage";
import {
  UsageActivityChart,
  type UsageActivityMode,
} from "../UsageActivityChart";
import styles from "./UsageLongTermActivity.module.css";

interface UsageLongTermActivityProps {
  days: HeatmapDay[];
}

const modeLabels: Record<UsageActivityMode, string> = {
  calendar: "每日",
  weekly: "每周",
  cumulative: "累计",
};

export function UsageLongTermActivity({ days }: UsageLongTermActivityProps) {
  const [mode, setMode] = useState<UsageActivityMode>("calendar");

  return (
    <section className={styles.activity} aria-labelledby="long-term-activity-title">
      <header className={styles.heading}>
        <h3 id="long-term-activity-title">长期活动</h3>
        <div className={styles.headingTools}>
          <span className={styles.rangeHint}>近365天积分消耗</span>
          <div className={styles.modeTabs} aria-label="长期活动统计方式">
            {(Object.keys(modeLabels) as UsageActivityMode[]).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={mode === item}
                onClick={() => setMode(item)}
              >
                {modeLabels[item]}
              </button>
            ))}
          </div>
        </div>
      </header>
      <div className={styles.chartViewport}>
        <UsageActivityChart days={days} mode={mode} />
      </div>
    </section>
  );
}
