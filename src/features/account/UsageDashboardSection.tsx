import { Activity, BarChart3, UsersRound } from "lucide-react";

import type { SessionActor } from "../../domain/identity/session";
import type { Workspace } from "../../domain/workspace/workspace";
import styles from "./AccountSettingsDialog.module.css";

interface UsageDashboardSectionProps {
  actor: SessionActor;
  workspace: Workspace;
}

export function UsageDashboardSection({ actor, workspace }: UsageDashboardSectionProps) {
  const canViewOrganization = workspace.currentUserRole === "owner" || workspace.currentUserRole === "admin";
  const scopeLabel = canViewOrganization
    ? `${workspace.name} · 组织用量`
    : `${actor.displayName} · 个人用量`;

  return (
    <section className={styles.section} aria-labelledby="usage-dashboard-title">
      <div className={styles.sectionHeading}>
        <span>
          <h2 id="usage-dashboard-title">用量看板</h2>
          <p>{scopeLabel}，当前为等待统计口径接入的空状态。</p>
        </span>
        <span className={styles.prototypeBadge}>近 30 天</span>
      </div>

      <div className={styles.metricGrid}>
        <article>
          <span><BarChart3 aria-hidden="true" />生成次数</span>
          <strong>0</strong>
          <small>暂无任务数据</small>
        </article>
        <article>
          <span><Activity aria-hidden="true" />消耗积分</span>
          <strong>0</strong>
          <small>暂无账本数据</small>
        </article>
        <article>
          <span><UsersRound aria-hidden="true" />活跃成员</span>
          <strong>0</strong>
          <small>{canViewOrganization ? "组织范围" : "个人范围"}</small>
        </article>
      </div>

      <div className={styles.chartShell} aria-label="近 30 天用量趋势空状态">
        <div className={styles.chartGrid} aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className={styles.chartEmpty}>
          <BarChart3 aria-hidden="true" />
          <strong>尚无可统计数据</strong>
          <span>后续将按成员、项目和模型类型汇总，但不会用项目角色替代组织可见范围。</span>
        </div>
      </div>
    </section>
  );
}
