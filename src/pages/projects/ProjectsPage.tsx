import { Search } from "lucide-react";
import { Link, useActionData, useSearchParams } from "react-router-dom";
import { useMemo } from "react";

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
  const [searchParams, setSearchParams] = useSearchParams();
  const { notice, showNotice } = useTransientNotice();
  const requestedAccessKind = searchParams.get("kind");
  const activeAccessKind = requestedAccessKind === "private" || requestedAccessKind === "collaborative"
    ? requestedAccessKind
    : "all";
  const query = searchParams.get("q") ?? "";
  const projectCounts = useMemo(() => ({
    all: data.projects.length,
    collaborative: data.projects.filter((project) => project.accessKind === "collaborative").length,
    private: data.projects.filter((project) => project.accessKind === "private").length,
  }), [data.projects]);
  const filteredProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
    return data.projects
      .filter((project) => {
        if (activeAccessKind !== "all" && project.accessKind !== activeAccessKind) return false;
        return !normalizedQuery || project.name.toLocaleLowerCase("zh-CN").includes(normalizedQuery);
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }, [activeAccessKind, data.projects, query]);

  function filterHref(kind: "all" | "private" | "collaborative"): string {
    const nextParams = new URLSearchParams(searchParams);
    if (kind === "all") nextParams.delete("kind");
    else nextParams.set("kind", kind);
    const suffix = nextParams.toString();
    return `${routePaths.projects(data.currentWorkspace.id)}${suffix ? `?${suffix}` : ""}`;
  }

  function updateQuery(value: string): void {
    const nextParams = new URLSearchParams(searchParams);
    if (value) nextParams.set("q", value);
    else nextParams.delete("q");
    setSearchParams(nextParams, { replace: true });
  }

  const emptyMessage = query.trim()
    ? `没有找到匹配“${query.trim()}”的项目`
    : activeAccessKind === "collaborative"
      ? "你目前没有可访问的协作项目。项目管理员添加你后，项目会出现在这里。"
      : activeAccessKind === "private"
        ? "还没有个人项目。创建后只有你自己可以访问。"
        : "还没有可访问的项目。先创建一个个人项目开始创作。";

  return (
    <div className={styles.workspaceShell}>
      <WorkspaceHeader activeSection="projects" actor={data.actor} currentWorkspace={data.currentWorkspace} />
      <main className={styles.projectsMain}>
        <div className={styles.projectsHeading}>
          <span className={styles.projectsEyebrow}>工作台</span>
          <h1>项目空间</h1>
          <p>集中查看你有权访问的个人项目与协作项目。</p>
        </div>

        <div className={styles.projectControls}>
          <nav className={styles.scopeTabs} aria-label="项目类型筛选">
            <Link
              className={activeAccessKind === "all" ? styles.activeTab : ""}
              to={filterHref("all")}
              aria-current={activeAccessKind === "all" ? "page" : undefined}
            >全部 <span>{projectCounts.all}</span></Link>
            <Link
              className={activeAccessKind === "private" ? styles.activeTab : ""}
              to={filterHref("private")}
              aria-current={activeAccessKind === "private" ? "page" : undefined}
            >个人 <span>{projectCounts.private}</span></Link>
            <Link
              className={activeAccessKind === "collaborative" ? styles.activeTab : ""}
              to={filterHref("collaborative")}
              aria-current={activeAccessKind === "collaborative" ? "page" : undefined}
            >协作 <span>{projectCounts.collaborative}</span></Link>
          </nav>

          <label className={styles.searchBox}>
            <Search aria-hidden="true" />
            <span className={styles.srOnly}>搜索项目</span>
            <input
              type="search"
              value={query}
              maxLength={80}
              placeholder="搜索当前项目空间"
              onChange={(event) => updateQuery(event.currentTarget.value)}
            />
          </label>
        </div>

        <ProjectMenuProvider>
          <div className={styles.libraryGrid}>
            {activeAccessKind !== "collaborative" && !query.trim() ? (
              <NewProjectCard label="新建个人项目" description="仅自己可见" />
            ) : null}
            {filteredProjects.map((project) => (
              <ProjectCard key={project.id} project={project} onNotice={showNotice} />
            ))}
          </div>
        </ProjectMenuProvider>

        {filteredProjects.length === 0 ? <p className={styles.emptyState} role="status">{emptyMessage}</p> : null}
      </main>

      <div className={`${styles.toast} ${notice || actionData?.error || actionData?.notice ? styles.toastVisible : ""}`} role="status" aria-live="polite">
        {actionData?.error ?? actionData?.notice ?? notice}
      </div>
    </div>
  );
}
