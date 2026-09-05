import { ChevronRight } from "lucide-react";
import { Link, useActionData, useFetchers, useNavigation } from "react-router-dom";
import { useState } from "react";

import { routePaths } from "../../app/routes";
import type { WorkspaceActionData } from "../../app/route-data";
import { useWorkspaceRouteData } from "../../app/useWorkspaceRouteData";
import { useTransientNotice } from "../../shared/hooks/useTransientNotice";
import { NewProjectCard } from "../../shared/ui/NewProjectCard";
import { ProjectCard } from "../../shared/ui/ProjectCard";
import { ProjectMenuProvider } from "../../shared/ui/ProjectMenuProvider";
import { WorkspaceHeader } from "../../shared/ui/WorkspaceHeader";
import { CapabilityStrip } from "./CapabilityStrip";
import { CreationComposer } from "./CreationComposer";
import { HeroCarousel } from "./HeroCarousel";
import { capabilities, heroSlides, type Capability, type HeroSlide } from "./home-content";
import styles from "./WorkspacePages.module.css";

export function WorkspaceHomePage() {
  const data = useWorkspaceRouteData();
  const actionData = useActionData() as WorkspaceActionData | undefined;
  const fetchers = useFetchers();
  const navigation = useNavigation();
  const [activeSlide, setActiveSlide] = useState(1);
  const [prompt, setPrompt] = useState("");
  const { notice, showNotice } = useTransientNotice();
  const recentProjects = [...data.projects]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 4);
  const projectCreationBusy = (
    navigation.state !== "idle"
    && navigation.formData?.get("intent") === "create"
  ) || fetchers.some((fetcher) => (
    fetcher.state !== "idle"
    && fetcher.formData?.get("intent") === "launch-from-prompt"
  ));

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
      <WorkspaceHeader activeSection="home" actor={data.actor} currentWorkspace={data.currentWorkspace} />
      <main className={styles.homeMain}>
        <section className={styles.creationStart} aria-labelledby="home-title">
          <div className={styles.homeIntro}>
            <span>创作工作台</span>
            <h1 id="home-title">从一个创作意图开始</h1>
            <p>描述你想完成的内容，Reelay 会建立项目并带你进入画布。</p>
          </div>
          <CreationComposer
            disabled={projectCreationBusy}
            prompt={prompt}
            onPromptChange={setPrompt}
            onNotice={showNotice}
          />
          <CapabilityStrip capabilities={capabilities} onChoose={chooseCapability} />
        </section>

        <section className={styles.recentSection} aria-labelledby="recent-projects-title">
          <div className={styles.sectionHeading}>
            <h2 id="recent-projects-title">最近项目</h2>
            <Link to={routePaths.projects(data.currentWorkspace.id)}>全部项目 <ChevronRight aria-hidden="true" /></Link>
          </div>
          <ProjectMenuProvider>
            <div className={styles.projectGrid}>
              <NewProjectCard disabled={projectCreationBusy} />
              {recentProjects.map((project) => (
                <ProjectCard key={project.id} project={project} onNotice={showNotice} />
              ))}
            </div>
          </ProjectMenuProvider>
        </section>

        <section className={styles.inspirationSection} aria-labelledby="creation-inspiration-title">
          <div className={styles.sectionHeading}>
            <div>
              <span className={styles.sectionEyebrow}>发现方向</span>
              <h2 id="creation-inspiration-title">创作灵感</h2>
            </div>
          </div>
          <HeroCarousel slides={heroSlides} activeIndex={activeSlide} onActiveIndexChange={setActiveSlide} onChooseSlide={chooseSlide} />
        </section>
      </main>

      <div className={`${styles.toast} ${notice || actionData?.error || actionData?.notice ? styles.toastVisible : ""}`} role="status" aria-live="polite">
        {actionData?.error ?? actionData?.notice ?? notice}
      </div>
    </div>
  );
}
