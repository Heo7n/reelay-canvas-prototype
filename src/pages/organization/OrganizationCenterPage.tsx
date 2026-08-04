import { BarChart3, Building2, ChevronLeft, CircleDollarSign, Info } from "lucide-react";
import { Link, NavLink, Outlet, useLoaderData } from "react-router-dom";

import type { OrganizationMembersRouteData, OrganizationRouteData } from "../../app/route-data";
import { routePaths } from "../../app/routes";
import { useWorkspaceRouteData } from "../../app/useWorkspaceRouteData";
import { useTransientNotice } from "../../shared/hooks/useTransientNotice";
import { WorkspaceHeader } from "../../shared/ui/WorkspaceHeader";
import styles from "./OrganizationCenterPage.module.css";

export interface OrganizationCenterOutletContext {
  data: OrganizationRouteData;
  showNotice: (message: string) => void;
}

const roleLabels = {
  owner: "主账户",
  admin: "管理员",
  member: "成员",
} as const;

export function OrganizationCenterPage() {
  const workspaceData = useWorkspaceRouteData();
  const organizationData = useLoaderData() as OrganizationMembersRouteData;
  const data: OrganizationRouteData = {
    actor: workspaceData.actor,
    currentWorkspace: workspaceData.currentWorkspace,
    members: organizationData.members,
    workspaces: workspaceData.workspaces,
  };
  const { notice, showNotice } = useTransientNotice();
  const workspaceId = data.currentWorkspace.id;
  const currentRole = data.currentWorkspace.currentUserRole ?? "member";
  const canManageOrganization = currentRole === "owner" || currentRole === "admin";

  const navigation = [
    {
      id: "management",
      label: "组织信息",
      icon: Info,
      to: routePaths.organization(workspaceId),
      end: true,
    },
    {
      id: "credits",
      label: "积分管理",
      icon: CircleDollarSign,
      to: routePaths.organizationCredits(workspaceId),
      end: false,
    },
    {
      id: "usage",
      label: "用量看板",
      icon: BarChart3,
      to: routePaths.organizationUsage(workspaceId),
      end: false,
    },
  ] as const;
  const visibleNavigation = navigation.filter((item) => (
    item.id === "management" || canManageOrganization
  ));

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
                  <NavLink
                    key={item.id}
                    className={({ isActive }) => isActive ? styles.activeNavItem : ""}
                    end={item.end}
                    to={item.to}
                  >
                    <Icon aria-hidden="true" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </nav>
          </aside>

          <div className={styles.content}>
            <Outlet context={{ data, showNotice } satisfies OrganizationCenterOutletContext} />
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
