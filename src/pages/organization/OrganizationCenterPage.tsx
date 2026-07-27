import { BarChart3, Building2, ChevronLeft, CircleDollarSign, LockKeyhole, UsersRound } from "lucide-react";
import { Link, useLoaderData } from "react-router-dom";

import type { OrganizationRouteData } from "../../app/route-data";
import { routePaths } from "../../app/routes";
import { useTransientNotice } from "../../shared/hooks/useTransientNotice";
import { WorkspaceHeader } from "../../shared/ui/WorkspaceHeader";
import { OrganizationCreditsSection } from "./OrganizationCreditsSection";
import { OrganizationManagementSection } from "./OrganizationManagementSection";
import { OrganizationUsageSection } from "./OrganizationUsageSection";
import styles from "./OrganizationCenterPage.module.css";

export type OrganizationSection = "management" | "credits" | "usage";

interface OrganizationCenterPageProps {
  section: OrganizationSection;
}

const roleLabels = {
  owner: "主账户",
  admin: "管理员",
  member: "成员",
} as const;

export function OrganizationCenterPage({ section }: OrganizationCenterPageProps) {
  const data = useLoaderData() as OrganizationRouteData;
  const { notice, showNotice } = useTransientNotice();
  const workspaceId = data.currentWorkspace.id;
  const currentRole = data.currentWorkspace.currentUserRole ?? "member";
  const canViewUsage = currentRole === "owner" || currentRole === "admin";

  const navigation = [
    {
      id: "management",
      label: "组织管理",
      icon: UsersRound,
      to: routePaths.organization(workspaceId),
    },
    {
      id: "credits",
      label: "积分管理",
      icon: CircleDollarSign,
      to: routePaths.organizationCredits(workspaceId),
    },
    {
      id: "usage",
      label: "用量看板",
      icon: BarChart3,
      to: routePaths.organizationUsage(workspaceId),
    },
  ] as const;
  const visibleNavigation = navigation.filter((item) => item.id !== "usage" || canViewUsage);

  return (
    <div className={styles.organizationShell}>
      <WorkspaceHeader
        actor={data.actor}
        currentWorkspace={data.currentWorkspace}
        onNotice={showNotice}
        showAccount={false}
      />

      <main className={styles.organizationMain}>
        <div className={styles.pageHeading}>
          <Link to={routePaths.workspaceHome(workspaceId)}>
            <ChevronLeft aria-hidden="true" />
            <span>返回</span>
          </Link>
          <span aria-hidden="true" />
          <strong>组织中心</strong>
        </div>

        <div className={styles.centerLayout}>
          <aside className={styles.sidebar}>
            <div className={styles.organizationIdentity}>
              <span className={styles.organizationAvatar} aria-hidden="true">
                <Building2 />
              </span>
              <span>
                <strong>{data.currentWorkspace.name}</strong>
                <small>{roleLabels[currentRole]}</small>
              </span>
            </div>

            <nav aria-label="组织中心分栏">
              {visibleNavigation.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.id}
                    className={section === item.id ? styles.activeNavItem : ""}
                    aria-current={section === item.id ? "page" : undefined}
                    to={item.to}
                  >
                    <Icon aria-hidden="true" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </aside>

          <div className={styles.content}>
            {section === "management" ? (
              <OrganizationManagementSection
                actor={data.actor}
                members={data.members}
                workspace={data.currentWorkspace}
                onNotice={showNotice}
              />
            ) : null}
            {section === "credits" ? (
              <OrganizationCreditsSection members={data.members} onNotice={showNotice} />
            ) : null}
            {section === "usage" && canViewUsage ? (
              <OrganizationUsageSection
                members={data.members}
                workspaceName={data.currentWorkspace.name}
              />
            ) : null}
            {section === "usage" && !canViewUsage ? (
              <section className={styles.permissionState}>
                <LockKeyhole aria-hidden="true" />
                <strong>此页面仅对主账户与管理员开放</strong>
                <p>组织成员仍可在个人积分记录中查看与自己相关的余额信息。</p>
              </section>
            ) : null}
          </div>
        </div>
      </main>

      <div
        className={`${styles.toast} ${notice ? styles.toastVisible : ""}`}
        role="status"
        aria-live="polite"
      >
        {notice}
      </div>
    </div>
  );
}
