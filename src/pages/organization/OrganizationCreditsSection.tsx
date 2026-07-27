import { ArrowRight, History, SlidersHorizontal, WalletCards } from "lucide-react";
import { useState } from "react";

import type { OrganizationMember } from "../../domain/workspace/workspace";
import { CreditAdjustmentPopover } from "./CreditAdjustmentPopover";
import { CreditDetailDrawer, type CreditDrawerKind } from "./CreditDetailDrawer";
import styles from "./OrganizationCenterPage.module.css";
import {
  getLatestMemberCreditRecord,
  getMemberCreditBalance,
  getMemberCreditUsage,
  ORGANIZATION_CREDIT_SUMMARY,
} from "./organization-credit-data";

interface OrganizationCreditsSectionProps {
  members: OrganizationMember[];
  onNotice: (message: string) => void;
}

interface DrawerState {
  kind: CreditDrawerKind;
  memberAccount?: string;
}

interface AdjustmentState {
  anchor: HTMLButtonElement;
  member: OrganizationMember;
}

export function OrganizationCreditsSection({
  members,
  onNotice,
}: OrganizationCreditsSectionProps) {
  const [drawerState, setDrawerState] = useState<DrawerState | null>(null);
  const [adjustmentState, setAdjustmentState] = useState<AdjustmentState | null>(null);
  const allocations = members.map((member) => ({
    member,
    amount: getMemberCreditBalance(member),
    consumed: getMemberCreditUsage(member),
    latestRecord: getLatestMemberCreditRecord(member),
  }));
  const allocatedShare = (
    ORGANIZATION_CREDIT_SUMMARY.allocated / ORGANIZATION_CREDIT_SUMMARY.available
  ) * 100;

  return (
    <section className={styles.section} aria-labelledby="organization-credits-title">
      <div className={styles.sectionHeading}>
        <span>
          <h1 id="organization-credits-title">积分管理</h1>
          <p>管理组织余额及成员账户当前可使用的积分。</p>
        </span>
      </div>

      <div className={styles.creditBalanceOverview}>
        <div className={styles.creditBalanceTotal}>
          <span className={styles.creditBalanceLabel}>
            <span><WalletCards aria-hidden="true" />组织积分余额</span>
          </span>
          <strong>
            {ORGANIZATION_CREDIT_SUMMARY.available.toLocaleString("zh-CN")}
          </strong>
          <span className={styles.creditBalanceFooter}>
            <small>组织当前尚未消耗的全部积分</small>
            <button
              className={styles.creditLedgerAction}
              type="button"
              aria-label="查看积分流水"
              onClick={() => setDrawerState({ kind: "income" })}
            >
              <History aria-hidden="true" />
              积分流水
              <ArrowRight aria-hidden="true" />
            </button>
          </span>
        </div>

        <div className={styles.creditComposition}>
          <span className={styles.creditCompositionHeading}>
            <strong>余额构成</strong>
          </span>
          <div
            className={styles.creditCompositionBar}
            role="img"
            aria-label={`所有成员账户余额 ${ORGANIZATION_CREDIT_SUMMARY.allocated.toLocaleString("zh-CN")}，可分配余额 ${ORGANIZATION_CREDIT_SUMMARY.unallocated.toLocaleString("zh-CN")}`}
          >
            <span
              className={styles.memberBalanceSegment}
              style={{ width: `${allocatedShare}%` }}
            />
            <span
              className={styles.poolBalanceSegment}
              style={{ width: `${100 - allocatedShare}%` }}
            />
          </div>
          <div className={styles.creditCompositionLegend}>
            <div className={styles.compositionMetric}>
              <span className={styles.memberBalanceMarker} aria-hidden="true" />
              <span>
                <small>所有成员账户余额</small>
                <strong>
                  {ORGANIZATION_CREDIT_SUMMARY.allocated.toLocaleString("zh-CN")}
                </strong>
              </span>
            </div>
            <div className={styles.compositionMetric}>
              <span className={styles.poolBalanceMarker} aria-hidden="true" />
              <span>
                <small>可分配余额</small>
                <strong>
                  {ORGANIZATION_CREDIT_SUMMARY.unallocated.toLocaleString("zh-CN")}
                </strong>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.allocationSection}>
        <div className={styles.subsectionHeading}>
          <h2>成员余额</h2>
          <button
            className={styles.sectionHeaderAction}
            type="button"
            aria-label="查看分配明细"
            onClick={() => setDrawerState({ kind: "allocation" })}
          >
            <History aria-hidden="true" />
            分配明细
            <ArrowRight aria-hidden="true" />
          </button>
        </div>

        <div className={styles.allocationTable}>
          <div className={styles.allocationTableHeader} aria-hidden="true">
            <span>成员</span>
            <span>角色</span>
            <span>可用余额</span>
            <span>本月消耗</span>
            <span>操作</span>
          </div>
          {allocations.map(({ member, amount, consumed, latestRecord }) => (
            <div className={styles.allocationRow} key={member.userId}>
              <span className={styles.memberIdentity}>
                <span className={styles.memberAvatar} aria-hidden="true">{member.displayName.slice(0, 1)}</span>
                <strong>{member.displayName}</strong>
              </span>
              <span>{member.role === "owner" ? "主账户" : member.role === "admin" ? "管理员" : "成员"}</span>
              <span className={styles.memberCreditBalance}>
                <strong>{amount.toLocaleString("zh-CN")}</strong>
                <small>{latestRecord?.date.slice(5, 10).replace("-", "/")} 最近变动</small>
              </span>
              <span className={styles.memberCreditUsage}>
                {consumed.toLocaleString("zh-CN")}
              </span>
              <span className={styles.creditRowActions}>
                <button
                  className={styles.creditAdjustmentAction}
                  type="button"
                  aria-label={`调整 ${member.displayName} 的积分额度`}
                  aria-expanded={adjustmentState?.member.userId === member.userId}
                  onClick={(event) => {
                    const anchor = event.currentTarget;
                    setAdjustmentState((current) => (
                      current?.member.userId === member.userId
                        ? null
                        : { anchor, member }
                    ));
                  }}
                >
                  <SlidersHorizontal aria-hidden="true" />
                  调整
                </button>
                <button
                  className={styles.creditDetailAction}
                  type="button"
                  aria-label={`查看 ${member.displayName} 的积分明细`}
                  onClick={() => setDrawerState({
                    kind: "consumption",
                    memberAccount: member.loginIdentifier ?? undefined,
                  })}
                >
                  <History aria-hidden="true" />
                  明细
                </button>
              </span>
            </div>
          ))}
        </div>
      </div>

      <CreditDetailDrawer
        kind={drawerState?.kind ?? null}
        memberAccount={drawerState?.memberAccount}
        members={members}
        onKindChange={(kind) => setDrawerState((current) => ({
          kind,
          memberAccount: current?.memberAccount,
        }))}
        onMemberFilterChange={(memberAccount) => setDrawerState({
          kind: drawerState?.kind === "consumption" ? "consumption" : "allocation",
          memberAccount,
        })}
        onClose={() => setDrawerState(null)}
      />

      {adjustmentState ? (
        <CreditAdjustmentPopover
          anchor={adjustmentState.anchor}
          member={adjustmentState.member}
          onClose={() => setAdjustmentState(null)}
          onGrant={(member) => {
            setAdjustmentState(null);
            onNotice(`${member.displayName} 的积分发放流程将在额度规则确认后接入。`);
          }}
          onReclaim={(member) => {
            setAdjustmentState(null);
            onNotice(`${member.displayName} 的积分回收流程将在额度规则确认后接入。`);
          }}
        />
      ) : null}
    </section>
  );
}
