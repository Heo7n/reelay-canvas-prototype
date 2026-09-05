import {
  ArrowRight,
  FileText,
  History,
  SlidersHorizontal,
} from "lucide-react";
import { useState } from "react";

import type { OrganizationMember } from "../../domain/workspace/workspace";
import { CreditIcon } from "../../shared/ui/CreditIcon";
import { CreditAdjustmentPopover } from "./CreditAdjustmentPopover";
import { CreditDetailDrawer, type CreditDrawerKind } from "./CreditDetailDrawer";
import styles from "./OrganizationCenterPage.module.css";
import {
  getMemberCreditBalance,
  ORGANIZATION_CREDIT_SUMMARY,
} from "./organization-credit-data";

interface OrganizationCreditsSectionProps {
  members: OrganizationMember[];
  onNotice: (message: string) => void;
}

interface DrawerState {
  kind: CreditDrawerKind;
  memberAccount?: string;
  accountView?: boolean;
}

interface AdjustmentState {
  anchor: HTMLButtonElement;
  member: OrganizationMember;
  balance: number;
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
  }));
  const availablePoolShare = (
    ORGANIZATION_CREDIT_SUMMARY.unallocated / ORGANIZATION_CREDIT_SUMMARY.available
  ) * 100;

  return (
    <section className={styles.section} aria-labelledby="organization-credits-title">
      <h1 id="organization-credits-title" className={styles.srOnly}>积分管理</h1>
      <div className={styles.creditOverviewSection}>
        <h2 className={styles.creditOverviewTitle}>组织积分账户</h2>
        <div className={styles.creditBalanceOverview}>
          <div className={styles.creditBalanceTotal}>
            <div className={styles.creditBalanceTotalContent}>
              <span className={styles.creditBalanceLabel}>
                <span><CreditIcon className={styles.creditSemanticIcon} />积分余量</span>
              </span>
              <strong>
                {ORGANIZATION_CREDIT_SUMMARY.available.toLocaleString("zh-CN")}
              </strong>
              <span className={styles.creditBalanceFooter}>
                <small>组织当前尚未消耗的全部积分</small>
              </span>
              <button
                className={styles.creditBalanceAction}
                type="button"
                aria-label="查看积分变动记录"
                onClick={() => setDrawerState({ kind: "income" })}
              >
                <span className={styles.creditBalanceActionIcon}>
                  <FileText aria-hidden="true" />
                </span>
                <span>积分变动记录</span>
                <ArrowRight aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className={styles.creditComposition}>
            <span className={styles.creditCompositionHeading}>
              <strong>余量构成</strong>
            </span>
            <div
              className={styles.creditCompositionLegend}
              style={{
                gridTemplateColumns: `${availablePoolShare}fr ${100 - availablePoolShare}fr`,
              }}
            >
              <div className={`${styles.compositionMetric} ${styles.poolBalanceMetric}`}>
                <span>
                  <small>未分配积分</small>
                  <strong>
                    {ORGANIZATION_CREDIT_SUMMARY.unallocated.toLocaleString("zh-CN")}
                  </strong>
                </span>
              </div>
              <div className={`${styles.compositionMetric} ${styles.memberBalanceMetric}`}>
                <span>
                  <small>成员账户积分</small>
                  <strong>
                    {ORGANIZATION_CREDIT_SUMMARY.allocated.toLocaleString("zh-CN")}
                  </strong>
                </span>
              </div>
            </div>
            <div
              className={styles.creditCompositionBar}
              role="img"
              aria-label={`未分配积分 ${ORGANIZATION_CREDIT_SUMMARY.unallocated.toLocaleString("zh-CN")}，成员账户积分 ${ORGANIZATION_CREDIT_SUMMARY.allocated.toLocaleString("zh-CN")}`}
            >
              <span
                className={styles.poolBalanceSegment}
                style={{ width: `${availablePoolShare}%` }}
              />
              <span
                className={styles.memberBalanceSegment}
                style={{ width: `${100 - availablePoolShare}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className={styles.allocationSection}>
        <div className={styles.subsectionHeading}>
          <h2>成员积分账户</h2>
        </div>

        <div className={styles.allocationTable}>
          <div className={styles.allocationTableHeader} aria-hidden="true">
            <span>成员</span>
            <span>账号</span>
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
              <span className={styles.memberAccount}>{member.loginIdentifier ?? "—"}</span>
              <span>{member.role === "owner" ? "主账户" : member.role === "admin" ? "管理员" : "成员"}</span>
              <span className={styles.memberCreditBalance}>
                <strong>{amount.toLocaleString("zh-CN")}</strong>
              </span>
              <span className={styles.creditRowActions}>
                <button
                  className={styles.creditAdjustmentAction}
                  type="button"
                  aria-label={`调整 ${member.displayName} 的积分额度`}
                  aria-expanded={adjustmentState?.member.userId === member.userId}
                  aria-haspopup="dialog"
                  onClick={(event) => {
                    const anchor = event.currentTarget;
                    setAdjustmentState((current) => (
                      current?.member.userId === member.userId
                        ? null
                        : { anchor, member, balance: amount }
                    ));
                  }}
                >
                  <SlidersHorizontal aria-hidden="true" />
                  调整
                </button>
                <button
                  className={styles.creditDetailAction}
                  type="button"
                  aria-label={`查看 ${member.displayName} 的账户变动记录`}
                  onClick={() => setDrawerState({
                    kind: "allocation",
                    memberAccount: member.loginIdentifier ?? undefined,
                    accountView: true,
                  })}
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
        kind={drawerState?.kind ?? null}
        memberAccount={drawerState?.memberAccount}
        accountView={drawerState?.accountView}
        members={members}
        onKindChange={(kind) => setDrawerState((current) => ({
          kind,
          memberAccount: current?.memberAccount,
          accountView: current?.accountView,
        }))}
        onMemberFilterChange={(memberAccount) => setDrawerState({
          kind: drawerState?.kind === "consumption" ? "consumption" : "allocation",
          memberAccount,
          accountView: false,
        })}
        onClose={() => setDrawerState(null)}
      />

      {adjustmentState ? (
        <CreditAdjustmentPopover
          anchor={adjustmentState.anchor}
          member={adjustmentState.member}
          balance={adjustmentState.balance}
          availablePool={ORGANIZATION_CREDIT_SUMMARY.unallocated}
          onClose={() => setAdjustmentState(null)}
          onGrant={() => {
            setAdjustmentState(null);
            onNotice("积分发放尚未开放，本次未执行。");
          }}
          onReclaim={() => {
            setAdjustmentState(null);
            onNotice("积分回收尚未开放，本次未执行。");
          }}
        />
      ) : null}
    </section>
  );
}
