import { GalleryVerticalEnd, Search } from "lucide-react";
import { Link, useActionData, useSearchParams } from "react-router-dom";
import { useMemo, useState } from "react";

import type { WorkspaceActionData } from "../../app/route-data";
import { routePaths } from "../../app/routes";
import { useWorkspaceRouteData } from "../../app/useWorkspaceRouteData";
import { useTransientNotice } from "../../shared/hooks/useTransientNotice";
import { ProjectCard } from "../../shared/ui/ProjectCard";
import { NewProjectCard } from "../../shared/ui/NewProjectCard";
import { ProjectMenuProvider } from "../../shared/ui/ProjectMenuProvider";
import { WorkspaceHeader } from "../../shared/ui/WorkspaceHeader";
import { EntryFrame } from "../home/EntryFrame";
import styles from "./ProjectsPage.module.css";

export function ProjectsPage() {
  const data = useWorkspaceRouteData();
  const actionData = useActionData() as WorkspaceActionData | undefined;
  const [query, setQuery] = useState("");
  const [searchParams] = useSearchParams();
  const { notice, showNotice } = useTransientNotice();
  const activeAccessKind = searchParams.get("kind") === "collaborative" ? "collaborative" : "private";
  const hasSearch = query.trim().length > 0;
  const filteredProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
    return data.projects.filter((project) => {
      if (project.accessKind !== activeAccessKind) return false;
      return !normalizedQuery || project.name.toLocaleLowerCase("zh-CN").includes(normalizedQuery);
    });
  }, [activeAccessKind, data.projects, query]);

  return (
    <EntryFrame activePage="projects" workspaceId={data.currentWorkspace.id} header={
      <WorkspaceHeader actor={data.actor} currentWorkspace={data.currentWorkspace} showBrand={false} />
    }>
      <main id="entry-content" tabIndex={-1} className={styles.projectsMain}>
        <h1 className={styles.pageTitle}>全部项目</h1>
        <div className={styles.projectsHeading}>
          <nav className={styles.scopeTabs} aria-label="项目类型筛选">
            <Link
              className={activeAccessKind === "private" ? styles.activeTab : ""}
              aria-current={activeAccessKind === "private" ? "true" : undefined}
              to={`${routePaths.projects(data.currentWorkspace.id)}?kind=private`}
            >个人</Link>
            <Link
              className={activeAccessKind === "collaborative" ? styles.activeTab : ""}
              aria-current={activeAccessKind === "collaborative" ? "true" : undefined}
              to={`${routePaths.projects(data.currentWorkspace.id)}?kind=collaborative`}
            >协作</Link>
          </nav>

          <label className={styles.searchBox}>
            <Search aria-hidden="true" />
            <span className={styles.srOnly}>搜索项目</span>
            <input type="search" value={query} maxLength={80} placeholder="搜索项目" onChange={(event) => setQuery(event.currentTarget.value)} />
          </label>
        </div>

        <ProjectMenuProvider>
          <div className={styles.libraryGrid}>
            <NewProjectCard personalNote={activeAccessKind === "collaborative"} />
            {filteredProjects.map((project) => (
              <ProjectCard key={project.id} project={project} onNotice={showNotice} />
            ))}
          </div>
        </ProjectMenuProvider>

        {filteredProjects.length === 0 ? <div className={styles.emptyProjects}>
          <GalleryVerticalEnd aria-hidden="true" />
          <div><strong>{hasSearch ? `没有找到匹配“${query.trim()}”的${activeAccessKind === "private" ? "个人" : "协作"}项目` : activeAccessKind === "private" ? "还没有个人项目" : "还没有参与协作项目"}</strong>
            <p>{hasSearch ? "换一个关键词试试，或切换项目类型。" : activeAccessKind === "private" ? "从空白画布开始，创建你的第一个项目。" : "加入的协作项目会显示在这里。"}</p></div>
        </div> : null}
      </main>

      <div className={`${styles.toast} ${notice || actionData?.error || actionData?.notice ? styles.toastVisible : ""}`} role="status" aria-live="polite">
        {actionData?.error ?? actionData?.notice ?? notice}
      </div>
    </EntryFrame>
  );
}
