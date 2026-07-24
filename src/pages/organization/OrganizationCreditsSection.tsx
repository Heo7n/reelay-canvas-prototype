import { ArrowDownLeft, ArrowRight, CircleDollarSign, Info, UsersRound, WalletCards } from "lucide-react";
import { useState } from "react";

import type { OrganizationMember } from "../../domain/workspace/workspace";
import { CreditDetailDrawer, type CreditDrawerKind } from "./CreditDetailDrawer";
import styles from "./OrganizationCenterPage.module.css";

interface OrganizationCreditsSectionProps {
  members: OrganizationMember[];
  onNotice: (message: string) => void;
}

const demoAllocationAmounts = [12_000, 8_000, 5_000, 4_000, 4_000] as const;

export function OrganizationCreditsSection({
  members,
  onNotice,
}: OrganizationCreditsSectionProps) {
  const [drawerKind, setDrawerKind] = useState<CreditDrawerKind | null>(null);
  const allocations = members.map((member, index) => ({
    member,
    amount: demoAllocationAmounts[index] ?? 0,
  }));

  return (
    <section className={styles.section} aria-labelledby="organization-credits-title">
      <div className={styles.sectionHeading}>
        <span>
          <h1 id="organization-credits-title">积分管理</h1>
          <p>查看组织积分池与成员分配情况。</p>
        </span>
        <span className={styles.prototypeBadge}>原型演示数据</span>
      </div>

      <div className={styles.creditMetricGrid}>
        <article className={styles.primaryMetric}>
          <span><WalletCards aria-hidden="true" />待分配积分</span>
          <strong>67,000</strong>
          <small>组织积分池当前可继续分配的余额</small>
        </article>
        <button type="button" onClick={() => setDrawerKind("income")}>
          <span><ArrowDownLeft aria-hidden="true" />累计入账积分</span>
          <strong>100,000</strong>
          <small>查看入账记录 <ArrowRight aria-hidden="true" /></small>
        </button>
        <button type="button" onClick={() => setDrawerKind("allocation")}>
          <span><UsersRound aria-hidden="true" />当前已分配余额</span>
          <strong>33,000</strong>
          <small>查看分配详情 <ArrowRight aria-hidden="true" /></small>
        </button>
      </div>

      <div className={styles.creditFormula}>
        <Info aria-hidden="true" />
        <span>
          <strong>当前演示口径</strong>
          <small>待分配 67,000 = 累计入账 100,000 − 当前已分配余额 33,000</small>
        </span>
      </div>

      <div className={styles.allocationSection}>
        <div className={styles.subsectionHeading}>
          <span>
            <h2>成员分配概览</h2>
            <p>成员额度首版按组织子账户展示，项目预算暂不加入。</p>
          </span>
          <button
            className={styles.primaryButton}
            type="button"
            onClick={() => onNotice("积分分配操作将在账本口径确认后接入。")}
          >
            <CircleDollarSign aria-hidden="true" />
            分配积分
          </button>
        </div>

        <div className={styles.allocationTable}>
          <div className={styles.allocationTableHeader} aria-hidden="true">
            <span>成员</span>
            <span>组织角色</span>
            <span>当前分配余额</span>
            <span>有效期</span>
          </div>
          {allocations.map(({ member, amount }) => (
            <div className={styles.allocationRow} key={member.userId}>
              <span className={styles.memberIdentity}>
                <span className={styles.memberAvatar} aria-hidden="true">{member.displayName.slice(0, 1)}</span>
                <strong>{member.displayName}</strong>
              </span>
              <span>{member.role === "owner" ? "主账户" : member.role === "admin" ? "管理员" : "成员"}</span>
              <strong>{amount.toLocaleString("zh-CN")}</strong>
              <span>2026-07-31</span>
            </div>
          ))}
        </div>
      </div>

      <CreditDetailDrawer
        kind={drawerKind}
        members={members}
        onClose={() => setDrawerKind(null)}
      />
    </section>
  );
}
