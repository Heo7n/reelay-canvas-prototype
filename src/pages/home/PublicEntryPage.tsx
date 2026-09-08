import { Moon, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

import { routePaths } from "../../app/routes";
import { useTheme } from "../../shared/theme/theme";
import { preloadFirstLoginImage } from "../login/login-media";
import { getDemoLoginPreset } from "../login/demo-login-preset";
import { HeroCarousel } from "./HeroCarousel";
import { HomeFooter } from "./HomeFooter";
import { CreationEntry } from "./CreationEntry";
import { EntryFrame } from "./EntryFrame";
import { clearGuestCreationDraft, readLoginCreationDraft, saveGuestCreationDraft } from "./guest-creation-draft";
import styles from "./PublicEntryPage.module.css";
import workspaceStyles from "./WorkspacePages.module.css";

export interface PublicEntryContext {
  closeLogin: () => void;
  prepareLogin: () => void;
}

// This route parent stays mounted while its login child opens and closes.
// Public content never requests workspace, project, or account data.
export function PublicEntryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const loginOpen = location.pathname === routePaths.login();
  const demoSearch = getDemoLoginPreset(location.search).search;
  const [draft, setDraft] = useState(() => readLoginCreationDraft(new URLSearchParams(location.search).get("returnTo")));
  const loginButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(loginOpen);
  const { theme, toggleTheme } = useTheme();

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
    saveGuestCreationDraft(draft.prompt, draft.workspaceId);
    const search = new URLSearchParams(demoSearch);
    if (draft.workspaceId) search.set("returnTo", routePaths.workspaceHome(draft.workspaceId));
    void navigate(`${routePaths.login()}${search.size ? `?${search}` : ""}`, { preventScrollReset: true });
  }

  const context: PublicEntryContext = {
    closeLogin: () => { void navigate(`${routePaths.home()}${demoSearch}`, { replace: true, preventScrollReset: true }); },
    prepareLogin: () => {
      const returnTo = new URLSearchParams(location.search).get("returnTo");
      const matches = draft.workspaceId === null ? returnTo === null : returnTo === routePaths.workspaceHome(draft.workspaceId);
      if (matches) saveGuestCreationDraft(draft.prompt, draft.workspaceId);
      else clearGuestCreationDraft();
    },
  };

  return (
    <EntryFrame activePage="home" header={
      <header className={styles.header}>
        <div className={styles.accountActions}>
          <button className={styles.themeToggle} type="button" aria-label={theme === "light" ? "切换深色模式" : "切换浅色模式"} onClick={toggleTheme}>
            {theme === "light" ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
          </button>
          <button ref={loginButton} className={styles.login} type="button" onClick={openLogin}>注册/登录</button>
        </div>
      </header>
    }>
      <main id="entry-content" tabIndex={-1} className={workspaceStyles.homeMain}>
        <HeroCarousel paused={loginOpen} />
        <section className={workspaceStyles.creationStart} aria-label="开始创作">
          <div className={workspaceStyles.welcome}>
            <h1>让想法，成为画面。</h1>
          </div>
          <CreationEntry prompt={draft.prompt} onPromptChange={(prompt) => setDraft((current) => ({ ...current, prompt }))} onRequestLogin={openLogin} paused={loginOpen} />
        </section>
      </main>
      <HomeFooter homePath={routePaths.home()} />
      <Outlet context={context} />
    </EntryFrame>
  );
}
