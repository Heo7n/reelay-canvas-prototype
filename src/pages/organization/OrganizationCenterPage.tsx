import { ArrowLeft, Building2, RotateCcw } from "lucide-react";
import { Suspense, useLayoutEffect } from "react";
import { Await, Link, Navigate, NavLink, Outlet, useLoaderData, useLocation, useRevalidator } from "react-router-dom";

import type { OrganizationMembersResult, OrganizationMembersRouteData, OrganizationRouteData } from "../../app/route-data";
import { routePaths } from "../../app/routes";
import { useWorkspaceRouteData } from "../../app/useWorkspaceRouteData";
import { useTransientNotice } from "../../shared/hooks/useTransientNotice";
import { organizationCanvasReturnTo, organizationNavigationState } from "../../shared/navigation/organization-navigation";
import { WorkspaceHeader } from "../../shared/ui/WorkspaceHeader";
import { EntryFrame } from "../home/EntryFrame";
import styles from "./OrganizationCenterPage.module.css";

export interface OrganizationCenterOutletContext {
  data: OrganizationRouteData;
  showNotice: (message: string) => void;
}

export function OrganizationCenterPage() {
  const location = useLocation();
  const workspaceData = useWorkspaceRouteData();
  const organizationData = useLoaderData() as OrganizationMembersRouteData;
  const revalidator = useRevalidator();
  const { notice, showNotice } = useTransientNotice();
  const workspaceId = workspaceData.currentWorkspace.id;
  const currentRole = workspaceData.currentWorkspace.currentUserRole ?? "member";
  const canManageOrganization = currentRole === "owner" || currentRole === "admin";
  const navigation = [
    { id: "management", label: "组织信息", to: routePaths.organization(workspaceId), end: true },
    { id: "credits", label: "积分管理", to: routePaths.organizationCredits(workspaceId), end: false },
    { id: "usage", label: "用量看板", to: routePaths.organizationUsage(workspaceId), end: false },
  ];
  const returnTo = organizationCanvasReturnTo(workspaceId, location.state);
  const navigationState = organizationNavigationState(workspaceId, location);
  const restrictedSection = !canManageOrganization && location.pathname !== routePaths.organization(workspaceId);

  useLayoutEffect(() => {
    if (window.scrollY !== 0) window.scrollTo({ top: 0, behavior: "instant" });
  }, [location.pathname]);

  return (
    <EntryFrame activePage="organization" workspaceId={workspaceId} header={
      <WorkspaceHeader actor={workspaceData.actor} currentWorkspace={workspaceData.currentWorkspace} showBrand={false} />
    }>
      <main id="entry-content" tabIndex={-1} className={styles.organizationMain}>
        <div className={styles.pageHeading}>
          <div className={styles.titleRow}>
            <h1>组织中心</h1>
            {returnTo ? <Link className={styles.canvasReturn} replace to={returnTo}>
              <ArrowLeft aria-hidden="true" />返回画布
            </Link> : null}
          </div>
          <nav className={styles.sectionNavigation} aria-label="组织中心分栏">
            {navigation.filter((item) => item.id === "management" || canManageOrganization).map((item) => (
              <NavLink
                key={item.id}
                className={({ isActive }) => isActive ? styles.activeNavItem : ""}
                end={item.end}
                replace
                state={navigationState}
                to={item.to}
              >{item.label}</NavLink>
            ))}
          </nav>
        </div>
        <div className={styles.content}>
          {restrictedSection ? <Navigate replace state={location.state} to={routePaths.organization(workspaceId)} /> : (
            <Suspense fallback={
              <section className={styles.section} aria-busy="true" aria-label="正在加载组织成员">
                <div className={styles.organizationCard}>
                  <span className={styles.largeOrganizationAvatar}><Building2 aria-hidden="true" /></span>
                  <div className={styles.organizationCopy}>
                    <h2>{workspaceData.currentWorkspace.name}</h2>
                    <div className={styles.organizationMeta}><span>我的角色：{{ owner: "主账户", admin: "管理员", member: "成员" }[currentRole]}</span></div>
                  </div>
                </div>
                <div className={styles.membersLoading} aria-hidden="true">
                  {Array.from({ length: 5 }, (_, index) => <div className={styles.loadingMember} key={index}><i /><span /><span /></div>)}
                </div>
              </section>
            }>
              <Await resolve={organizationData.members}>
                {(result: OrganizationMembersResult) => {
                  if (result.status === "redirect") return <Navigate replace to={result.to} />;
                  if (result.status === "error") return <section className={styles.loadError} role="alert">
                    <h2>成员信息暂时无法加载</h2>
                    <p>请重试，或通过左侧导航继续使用其他页面。</p>
                    <button type="button" disabled={revalidator.state !== "idle"} onClick={() => void revalidator.revalidate()}><RotateCcw aria-hidden="true" />重新加载</button>
                  </section>;
                  const data: OrganizationRouteData = { ...workspaceData, members: result.members };
                  return <Outlet context={{ data, showNotice } satisfies OrganizationCenterOutletContext} />;
                }}
              </Await>
            </Suspense>
          )}
        </div>
      </main>
      <div className={`${styles.toast} ${notice ? styles.toastVisible : ""}`} role="status" aria-live="polite">
        {notice}
      </div>
    </EntryFrame>
  );
}
