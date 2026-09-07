import { Moon, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import perfumeUrl from "../../../assets/home/project-perfume.webp";
import characterUrl from "../../../assets/home/project-character.webp";
import scifiUrl from "../../../assets/home/project-scifi.webp";
import { routePaths } from "../../app/routes";
import { useTransientNotice } from "../../shared/hooks/useTransientNotice";
import { useTheme } from "../../shared/theme/theme";
import { Brand } from "../../shared/ui/Brand";
import { preloadFirstLoginImage } from "../login/login-media";
import { CapabilityStrip } from "./CapabilityStrip";
import { CreationComposer } from "./CreationComposer";
import { HeroCarousel } from "./HeroCarousel";
import { capabilities, heroSlides, type Capability } from "./home-content";
import { clearGuestCreationDraft, readGuestCreationDraft, saveGuestCreationDraft } from "./guest-creation-draft";
import styles from "./PublicEntryPage.module.css";
import workspaceStyles from "./WorkspacePages.module.css";

export interface PublicEntryContext {
  closeLogin: () => void;
  prepareLogin: () => void;
}

const examples = [
  { title: "品牌与商业影像", description: "从产品细节出发，构思品牌镜头", image: perfumeUrl, prompt: "为香水品牌构思一组产品广告镜头" },
  { title: "角色与故事", description: "围绕角色，展开一段新的故事", image: characterUrl, prompt: "围绕一个动画角色，规划一段短片故事和分镜" },
  { title: "场景与世界", description: "让想象中的场景，成为故事的起点", image: scifiUrl, prompt: "为科幻短片设计场景气氛和镜头语言" },
];

// This route parent stays mounted while its login child opens and closes.
// Public content never requests workspace, project, or account data.
export function PublicEntryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const loginOpen = location.pathname === routePaths.login();
  const [prompt, setPrompt] = useState(readGuestCreationDraft);
  const [activeSlide, setActiveSlide] = useState(1);
  const loginButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(loginOpen);
  const { theme, toggleTheme } = useTheme();
  const { notice, showNotice } = useTransientNotice();

  useEffect(() => {
    preloadFirstLoginImage();
    document.addEventListener("visibilitychange", preloadFirstLoginImage);
    return () => document.removeEventListener("visibilitychange", preloadFirstLoginImage);
  }, []);

  useEffect(() => {
    if (!loginOpen) {
      clearGuestCreationDraft();
      if (wasOpen.current) (returnFocus.current ?? loginButton.current)?.focus({ preventScroll: true });
    }
    wasOpen.current = loginOpen;
  }, [loginOpen]);

  function openLogin(): void {
    preloadFirstLoginImage();
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Another tab may already have established the shared cookie; the loader
    // can redirect straight to the workspace without ever showing the form.
    saveGuestCreationDraft(prompt);
    void navigate(routePaths.login(), { preventScrollReset: true });
  }

  function chooseCapability(capability: Capability): void {
    if (capability.prompt) setPrompt(capability.prompt);
    else showNotice("更多能力将陆续开放。");
  }

  const context: PublicEntryContext = {
    closeLogin: () => { void navigate(routePaths.home(), { replace: true, preventScrollReset: true }); },
    prepareLogin: () => {
      // A protected deep link takes precedence over an unrelated composing draft.
      saveGuestCreationDraft(new URLSearchParams(location.search).has("returnTo") ? "" : prompt);
    },
  };

  return (
    <div className={workspaceStyles.workspaceShell}>
      <header className={styles.header}>
        <Brand to={routePaths.home()} />
        <div className={styles.accountActions}>
          <button className={styles.themeToggle} type="button" aria-label={theme === "light" ? "切换深色模式" : "切换浅色模式"} onClick={toggleTheme}>
            {theme === "light" ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
          </button>
          <button ref={loginButton} className={styles.login} type="button" onClick={openLogin}>注册/登录</button>
        </div>
      </header>

      <main className={workspaceStyles.homeMain}>
        <h1 className={workspaceStyles.srOnly}>Reelay 创作主页</h1>
        <HeroCarousel slides={heroSlides} activeIndex={activeSlide} onActiveIndexChange={setActiveSlide} paused={loginOpen}
          onChooseSlide={(slide) => setPrompt(`我想从「${slide.title}」开始一个新项目`)} />

        <section className={workspaceStyles.creationStart} aria-label="开始创作">
          <CreationComposer prompt={prompt} onPromptChange={setPrompt} onNotice={showNotice} onRequestLogin={openLogin} />
          <CapabilityStrip capabilities={capabilities} onChoose={chooseCapability} />
        </section>

        <section className={styles.examples} aria-labelledby="creation-examples-title">
          <div className={styles.sectionHeading}>
            <h2 id="creation-examples-title">创作灵感</h2>
            <span>从一个想法，开始你的下一个项目</span>
          </div>
          <div className={styles.exampleGrid}>
            {examples.map((example) => (
              <button key={example.title} className={styles.example} type="button" onClick={() => {
                setPrompt(example.prompt);
                document.getElementById("creation-prompt")?.focus();
              }}>
                <img src={example.image} alt="" />
                <div><strong>{example.title}</strong><span>{example.description}</span></div>
              </button>
            ))}
          </div>
        </section>
      </main>

      <div className={`${workspaceStyles.toast} ${notice ? workspaceStyles.toastVisible : ""}`} role="status">{notice}</div>
      <Outlet context={context} />
    </div>
  );
}
