import { Building2, CircleHelp, GalleryVerticalEnd, Home, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useLayoutEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

import { routePaths } from "../../app/routes";
import { Brand } from "../../shared/ui/Brand";
import { organizationNavigationState } from "../../shared/navigation/organization-navigation";
import wordmarkUrl from "../../../assets/home/reelay-wordmark.png";
import styles from "./EntryFrame.module.css";
import pageStyles from "./WorkspacePages.module.css";

const preferenceKey = "reelay-entry-sidebar-collapsed";

interface EntryFrameProps {
  activePage: "home" | "projects" | "organization";
  children: ReactNode;
  header: ReactNode;
  workspaceId?: string;
}

// Workspace browsing shares one frame; the canvas keeps its full editing viewport.
export function EntryFrame({ activePage, children, header, workspaceId }: EntryFrameProps) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    try { return window.localStorage.getItem(preferenceKey) !== "false"; } catch { return true; }
  });
  const homePath = workspaceId ? routePaths.workspaceHome(workspaceId) : routePaths.home();

  useLayoutEffect(() => {
    // Page navigation starts at its heading; opening the login child keeps this frame mounted.
    if (window.scrollY !== 0) window.scrollTo({ top: 0, behavior: "instant" });
  }, [activePage, workspaceId]);

  function toggleSidebar(): void {
    const next = !collapsed;
    setCollapsed(next);
    try { window.localStorage.setItem(preferenceKey, String(next)); } catch { /* Optional appearance preference. */ }
  }

  return (
    <div className={`${pageStyles.workspaceShell} ${styles.frame} ${collapsed ? styles.collapsed : ""}`}>
      <a className={styles.skipLink} href="#entry-content">跳转到主要内容</a>
      <aside className={styles.sidebar} aria-label="主导航">
        <div className={styles.brandRow}>
          <Brand className={styles.brand} to={homePath} />
          <button type="button" className={styles.collapseToggle} onClick={toggleSidebar} aria-expanded={!collapsed} aria-controls="entry-navigation" aria-label={collapsed ? "展开侧栏" : "收起侧栏"} title={collapsed ? "展开侧栏" : "收起侧栏"}>
            {collapsed ? <>
              <span className={styles.brandSymbol} aria-hidden="true"><img src={wordmarkUrl} alt="" /></span>
              <PanelLeftOpen className={styles.expandIcon} aria-hidden="true" />
            </> : <PanelLeftClose aria-hidden="true" />}
          </button>
        </div>
        <nav id="entry-navigation" className={styles.navigation} aria-label="页面导航">
          <Link className={activePage === "home" ? styles.active : ""} to={homePath} aria-current={activePage === "home" ? "page" : undefined} aria-label="首页" title="首页">
            <Home aria-hidden="true" /><span>首页</span>
          </Link>
          {workspaceId ? (
            <Link className={activePage === "projects" ? styles.active : ""} to={routePaths.projects(workspaceId)} aria-current={activePage === "projects" ? "page" : undefined} aria-label="项目" title="项目">
              <GalleryVerticalEnd aria-hidden="true" /><span>项目</span>
            </Link>
          ) : null}
          {workspaceId ? (
            <div className={styles.organizationNavigation}>
              <Link className={activePage === "organization" ? styles.active : ""} to={routePaths.organization(workspaceId)} state={organizationNavigationState(workspaceId, location)} replace={activePage === "organization"} aria-current={activePage === "organization" ? "page" : undefined} aria-label="组织中心" title="组织中心">
                <Building2 aria-hidden="true" /><span>组织中心</span>
              </Link>
            </div>
          ) : null}
        </nav>
        <div className={styles.sidebarFooter}>
          <a href="https://reelay.tech.jetsentv.com/manual" target="_blank" rel="noopener noreferrer" title="使用帮助" aria-label="使用帮助">
            <CircleHelp aria-hidden="true" /><span>使用帮助</span>
          </a>
        </div>
      </aside>
      <div className={styles.body}>
        <div className={`${styles.topbar} ${activePage !== "home" ? styles.compactTopbar : ""}`}>{header}</div>
        {children}
      </div>
    </div>
  );
}
