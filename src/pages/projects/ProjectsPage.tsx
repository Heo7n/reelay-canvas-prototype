import { ChevronLeft, Search } from "lucide-react";
import { Link, useActionData, useSearchParams } from "react-router-dom";
import { useMemo, useState } from "react";

import type { WorkspaceActionData } from "../../app/route-data";
import { routePaths } from "../../app/routes";
import { useWorkspaceRouteData } from "../../app/useWorkspaceRouteData";
import { useTransientNotice } from "../../shared/hooks/useTransientNotice";
import { NewProjectCard } from "../../shared/ui/NewProjectCard";
import { ProjectCard } from "../../shared/ui/ProjectCard";
import { ProjectMenuProvider } from "../../shared/ui/ProjectMenuProvider";
import { WorkspaceHeader } from "../../shared/ui/WorkspaceHeader";
import styles from "../home/WorkspacePages.module.css";

export function ProjectsPage() {
  const data = useWorkspaceRouteData();
  const actionData = useActionData() as WorkspaceActionData | undefined;
  const [query, setQuery] = useState("");
  const [searchParams] = useSearchParams();
  const { notice, showNotice } = useTransientNotice();
  const activeAccessKind = searchParams.get("kind") === "collaborative" ? "collaborative" : "private";
  const filteredProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
    return data.projects.filter((project) => {
      if (project.accessKind !== activeAccessKind) return false;
      return !normalizedQuery || project.name.toLocaleLowerCase("zh-CN").includes(normalizedQuery);
    });
  }, [activeAccessKind, data.projects, query]);

  return (
    <div className={styles.workspaceShell}>
      <WorkspaceHeader actor={data.actor} currentWorkspace={data.currentWorkspace} onNotice={showNotice} />
      <main className={styles.projectsMain}>
        <div className={styles.projectsHeading}>
          <Link className={styles.backLink} to={routePaths.workspaceHome(data.currentWorkspace.id)}>
            <ChevronLeft aria-hidden="true" />
            <span>返回</span>
          </Link>
          <span className={styles.headingDivider} aria-hidden="true" />
          <h1>全部项目</h1>
        </div>

        <div className={styles.projectControls}>
          <nav className={styles.scopeTabs} aria-label="项目类型筛选">
            <Link
              className={activeAccessKind === "private" ? styles.activeTab : ""}
              to={`${routePaths.projects(data.currentWorkspace.id)}?kind=private`}
            >个人</Link>
            <Link
              className={activeAccessKind === "collaborative" ? styles.activeTab : ""}
              to={`${routePaths.projects(data.currentWorkspace.id)}?kind=collaborative`}
            >协作项目</Link>
          </nav>

          <label className={styles.searchBox}>
            <Search aria-hidden="true" />
            <span className={styles.srOnly}>搜索项目</span>
            <input type="search" value={query} maxLength={80} placeholder="搜索项目" onChange={(event) => setQuery(event.currentTarget.value)} />
          </label>
        </div>

        <ProjectMenuProvider>
          <div className={styles.libraryGrid}>
            <NewProjectCard />
            {filteredProjects.map((project) => (
              <ProjectCard key={project.id} project={project} onNotice={showNotice} />
            ))}
          </div>
        </ProjectMenuProvider>

        {query && filteredProjects.length === 0 ? <p className={styles.emptyState}>没有找到匹配“{query}”的项目</p> : null}
      </main>

      <div className={`${styles.toast} ${notice || actionData?.error || actionData?.notice ? styles.toastVisible : ""}`} role="status" aria-live="polite">
        {actionData?.error ?? actionData?.notice ?? notice}
      </div>
    </div>
  );
}
