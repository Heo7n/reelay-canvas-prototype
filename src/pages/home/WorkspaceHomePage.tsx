import { ChevronRight } from "lucide-react";
import { Link, useActionData, useLoaderData } from "react-router-dom";
import { useState } from "react";

import { routePaths } from "../../app/routes";
import type { WorkspaceActionData, WorkspaceRouteData } from "../../app/route-data";
import { useTransientNotice } from "../../shared/hooks/useTransientNotice";
import { NewProjectCard } from "../../shared/ui/NewProjectCard";
import { ProjectCard } from "../../shared/ui/ProjectCard";
import { WorkspaceHeader } from "../../shared/ui/WorkspaceHeader";
import { CapabilityStrip } from "./CapabilityStrip";
import { CreationComposer } from "./CreationComposer";
import { HeroCarousel } from "./HeroCarousel";
import { capabilities, heroSlides, type Capability, type HeroSlide } from "./home-content";
import styles from "./WorkspacePages.module.css";

export function WorkspaceHomePage() {
  const data = useLoaderData() as WorkspaceRouteData;
  const actionData = useActionData() as WorkspaceActionData | undefined;
  const [activeSlide, setActiveSlide] = useState(1);
  const [prompt, setPrompt] = useState("");
  const { notice, showNotice } = useTransientNotice();
  const recentProjects = [...data.projects]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 4);

  function chooseSlide(slide: HeroSlide): void {
    setPrompt(`我想从「${slide.title}」开始一个新项目`);
  }

  function chooseCapability(capability: Capability): void {
    if (!capability.prompt) {
      showNotice("更多能力会随核心工作台逐步开放。");
      return;
    }
    setPrompt(capability.prompt);
  }

  return (
    <div className={styles.workspaceShell}>
      <WorkspaceHeader actor={data.actor} currentWorkspace={data.currentWorkspace} onNotice={showNotice} />
      <main className={styles.homeMain}>
        <h1 className={styles.srOnly}>Reelay 创作主页</h1>
        <HeroCarousel slides={heroSlides} activeIndex={activeSlide} onActiveIndexChange={setActiveSlide} onChooseSlide={chooseSlide} />

        <section className={styles.creationStart} aria-label="开始创作">
          <CreationComposer prompt={prompt} onPromptChange={setPrompt} onNotice={showNotice} />
          <CapabilityStrip capabilities={capabilities} onChoose={chooseCapability} />
        </section>

        <section className={styles.recentSection} aria-labelledby="recent-projects-title">
          <div className={styles.sectionHeading}>
            <h2 id="recent-projects-title">最近项目</h2>
            <Link to={routePaths.projects(data.currentWorkspace.id)}>全部项目 <ChevronRight aria-hidden="true" /></Link>
          </div>
          <div className={styles.projectGrid}>
            <NewProjectCard />
            {recentProjects.map((project) => (
              <ProjectCard key={project.id} project={project} onNotice={showNotice} />
            ))}
          </div>
        </section>
      </main>

      <div className={`${styles.toast} ${notice || actionData?.error || actionData?.notice ? styles.toastVisible : ""}`} role="status" aria-live="polite">
        {actionData?.error ?? actionData?.notice ?? notice}
      </div>
    </div>
  );
}
