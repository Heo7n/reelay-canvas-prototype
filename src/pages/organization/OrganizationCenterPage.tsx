import { BarChart3, Building2, ChevronLeft, Info } from "lucide-react";
import { NavLink, Outlet, useLoaderData, useLocation, useNavigate } from "react-router-dom";

import type { OrganizationMembersRouteData, OrganizationRouteData } from "../../app/route-data";
import { routePaths } from "../../app/routes";
import { useWorkspaceRouteData } from "../../app/useWorkspaceRouteData";
import { useTransientNotice } from "../../shared/hooks/useTransientNotice";
import { WorkspaceHeader } from "../../shared/ui/WorkspaceHeader";
import { CreditIcon } from "../../shared/ui/CreditIcon";
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

interface OrganizationNavigationState {
  organizationReturnTo?: string;
}

export function OrganizationCenterPage() {
  const location = useLocation();
  const navigate = useNavigate();
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
      icon: CreditIcon,
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
  const navigationState = location.state as OrganizationNavigationState | null;
  const workspaceRoot = routePaths.workspaceHome(workspaceId);
  const organizationRoot = routePaths.organization(workspaceId);
  const requestedReturnTo = navigationState?.organizationReturnTo;
  const returnTo = typeof requestedReturnTo === "string"
    && (requestedReturnTo === workspaceRoot || requestedReturnTo.startsWith(`${workspaceRoot}/`))
    && requestedReturnTo !== organizationRoot
    && !requestedReturnTo.startsWith(`${organizationRoot}/`)
    ? requestedReturnTo
    : workspaceRoot;
  const returnFromOrganizationCenter = () => {
    navigate(returnTo, { replace: true });
  };

  return (
    <div className={styles.organizationShell}>
      <WorkspaceHeader
        actor={data.actor}
        currentWorkspace={data.currentWorkspace}
        onNotice={showNotice}
        showAccount={false}
      />

      <main className={styles.organizationMain}>
        <div className={styles.centerLayout}>
          <aside className={styles.sidebar}>
            <div className={styles.organizationIdentity}>
              <span className={styles.organizationAvatar} aria-hidden="true">
                <Building2 />
              </span>
              <span className={styles.organizationCopy}>
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
                    replace
                    state={{ organizationReturnTo: returnTo }}
                    to={item.to}
                  >
                    <Icon aria-hidden="true" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </nav>

            <div className={styles.sidebarFooter}>
              <button
                aria-label="返回"
                className={styles.backUtility}
                onClick={returnFromOrganizationCenter}
                type="button"
              >
                <ChevronLeft aria-hidden="true" />
                <span>返回</span>
              </button>
            </div>
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
