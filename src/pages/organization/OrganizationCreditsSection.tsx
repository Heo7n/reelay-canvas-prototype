import { ArrowDownLeft, ArrowRight, History, Minus, Plus, UsersRound, WalletCards } from "lucide-react";
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
      </div>

      <div className={styles.creditMetricGrid}>
        <button type="button" onClick={() => setDrawerKind("income")}>
          <span><ArrowDownLeft aria-hidden="true" />累计入账积分</span>
          <strong>100,000</strong>
          <small>查看入账记录 <ArrowRight aria-hidden="true" /></small>
        </button>
        <button type="button" onClick={() => setDrawerKind("allocation")}>
          <span><UsersRound aria-hidden="true" />已分配积分</span>
          <strong>33,000</strong>
          <small>查看分配详情 <ArrowRight aria-hidden="true" /></small>
        </button>
        <article className={styles.primaryMetric}>
          <span><WalletCards aria-hidden="true" />未分配积分</span>
          <strong>67,000</strong>
          <small>组织积分池当前可继续分配的余额</small>
        </article>
      </div>

      <div className={styles.allocationSection}>
        <div className={styles.subsectionHeading}>
          <h2>成员分配概览</h2>
        </div>

        <div className={styles.allocationTable}>
          <div className={styles.allocationTableHeader} aria-hidden="true">
            <span>成员</span>
            <span>角色</span>
            <span>可用余额</span>
            <span>操作</span>
          </div>
          {allocations.map(({ member, amount }) => (
            <div className={styles.allocationRow} key={member.userId}>
              <span className={styles.memberIdentity}>
                <span className={styles.memberAvatar} aria-hidden="true">{member.displayName.slice(0, 1)}</span>
                <strong>{member.displayName}</strong>
              </span>
              <span>{member.role === "owner" ? "主账户" : member.role === "admin" ? "管理员" : "成员"}</span>
              <strong>{amount.toLocaleString("zh-CN")}</strong>
              <span className={styles.creditRowActions}>
                <button
                  type="button"
                  aria-label={`为 ${member.displayName} 发放积分`}
                  onClick={() => onNotice(`${member.displayName} 的积分发放流程将在额度规则确认后接入。`)}
                >
                  <Plus aria-hidden="true" />
                  发放
                </button>
                <button
                  type="button"
                  aria-label={`回收 ${member.displayName} 的积分`}
                  onClick={() => onNotice(`${member.displayName} 的积分回收流程将在额度规则确认后接入。`)}
                >
                  <Minus aria-hidden="true" />
                  回收
                </button>
                <button
                  type="button"
                  aria-label={`查看 ${member.displayName} 的积分记录`}
                  onClick={() => setDrawerKind("allocation")}
                >
                  <History aria-hidden="true" />
                  记录
                </button>
              </span>
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
