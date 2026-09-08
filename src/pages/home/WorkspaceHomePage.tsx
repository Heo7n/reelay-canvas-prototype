import { ChevronRight } from "lucide-react";
import { Link, useActionData, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";

import { routePaths } from "../../app/routes";
import type { WorkspaceActionData } from "../../app/route-data";
import { useWorkspaceRouteData } from "../../app/useWorkspaceRouteData";
import { useTransientNotice } from "../../shared/hooks/useTransientNotice";
import { ProjectCard } from "../../shared/ui/ProjectCard";
import { NewProjectCard } from "../../shared/ui/NewProjectCard";
import { ProjectMenuProvider } from "../../shared/ui/ProjectMenuProvider";
import { WorkspaceHeader } from "../../shared/ui/WorkspaceHeader";
import { HeroCarousel } from "./HeroCarousel";
import { HomeFooter } from "./HomeFooter";
import { CreationEntry } from "./CreationEntry";
import { EntryFrame } from "./EntryFrame";
import { clearGuestCreationDraft, readGuestCreationDraft } from "./guest-creation-draft";
import styles from "./WorkspacePages.module.css";

export function WorkspaceHomePage() {
  const data = useWorkspaceRouteData();
  const location = useLocation();
  const actionData = useActionData() as WorkspaceActionData | undefined;
  const workspaceId = data.currentWorkspace.id;
  const [draft, setDraft] = useState(() => ({ workspaceId, prompt: readGuestCreationDraft(workspaceId) }));
  const prompt = draft.workspaceId === workspaceId ? draft.prompt : "";
  useEffect(() => {
    const pendingPrompt = readGuestCreationDraft(workspaceId);
    setDraft((current) => current.workspaceId === workspaceId ? current : { workspaceId, prompt: pendingPrompt });
    clearGuestCreationDraft();
  }, [location.key, workspaceId]);
  const { notice, showNotice } = useTransientNotice();
  const recentProjects = [...data.projects]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 3);

  return (
    <EntryFrame activePage="home" workspaceId={data.currentWorkspace.id} header={
      <WorkspaceHeader actor={data.actor} currentWorkspace={data.currentWorkspace} showBrand={false} />
    }>
      <main id="entry-content" tabIndex={-1} className={styles.homeMain}>
        <HeroCarousel />
        <section className={styles.creationStart} aria-label="开始创作">
          <div className={styles.welcome}>
            <h1>让想法，成为画面。</h1>
          </div>
          <CreationEntry prompt={prompt} onPromptChange={(prompt) => setDraft({ workspaceId, prompt })} />
        </section>

        <section className={styles.recentSection} aria-labelledby="recent-projects-title">
          <div className={styles.sectionHeading}>
            <h2 id="recent-projects-title">最近项目</h2>
            <Link to={routePaths.projects(data.currentWorkspace.id)}>全部项目 <ChevronRight aria-hidden="true" /></Link>
          </div>
          <ProjectMenuProvider>
            <div className={styles.projectGrid}>
              <NewProjectCard />
              {recentProjects.map((project) => (
                <ProjectCard key={project.id} project={project} onNotice={showNotice} />
              ))}
            </div>
          </ProjectMenuProvider>
        </section>
      </main>
      <HomeFooter homePath={routePaths.workspaceHome(data.currentWorkspace.id)} />

      <div className={`${styles.toast} ${notice || actionData?.error || actionData?.notice ? styles.toastVisible : ""}`} role="status" aria-live="polite">
        {actionData?.error ?? actionData?.notice ?? notice}
      </div>
    </EntryFrame>
  );
}
