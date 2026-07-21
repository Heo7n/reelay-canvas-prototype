(function initializeReelayHome() {
  const config = window.REELAY_HOME_PROTOTYPE_CONFIG || {};
  const heroSlides = config.heroSlides || [];
  const capabilities = config.capabilities || [];
  const recentProjects = config.recentProjects || [];
  const allProjects = config.allProjects || recentProjects;
  const systemThemeQuery = window.matchMedia("(prefers-color-scheme: light)");
  const launchIntentKey = "reelay-home-launch-intent";

  const heroTrack = document.querySelector("#heroTrack");
  const carouselDots = document.querySelector("#carouselDots");
  const creationComposer = document.querySelector("#creationComposer");
  const creationPrompt = document.querySelector("#creationPrompt");
  const composerSubmit = document.querySelector(".composer-submit");
  const capabilityStrip = document.querySelector("#capabilityStrip");
  const projectGrid = document.querySelector("#projectGrid");
  const profileButton = document.querySelector("#homeProfileButton");
  const creditButton = document.querySelector("#homeCreditButton");
  const profileMenu = document.querySelector("#homeProfileMenu");
  const creditSummary = document.querySelector("#homeCreditSummary");
  const themeLabel = document.querySelector("#homeThemeLabel");
  const toast = document.querySelector("#homeToast");
  const homeMain = document.querySelector("#homeMain");
  const allProjectsTrigger = document.querySelector("#allProjectsTrigger");
  const allProjectsView = document.querySelector("#allProjectsView");
  const allProjectsBack = document.querySelector("#allProjectsBack");
  const allProjectsTitle = document.querySelector("#allProjectsTitle");
  const allProjectsGrid = document.querySelector("#allProjectsGrid");
  const projectsSearchInput = document.querySelector("#projectsSearchInput");
  const projectsResultSummary = document.querySelector("#projectsResultSummary");
  const projectContextMenu = document.querySelector("#projectContextMenu");
  const projectMenuOpen = document.querySelector("#projectMenuOpen");
  let activeSlide = Math.min(1, Math.max(0, heroSlides.length - 1));
  let activeProjectScope = "personal";
  let projectQuery = "";
  let allProjectsOpen = false;
  let toastTimer = null;
  let shouldRestoreProjectsTrigger = false;
  let projectsBackgroundScrollY = 0;
  let activeProjectMenuTrigger = null;
  let activeProjectTitle = "";
  const projectTitleOverrides = new Map();

  const projectKinds = {
    storyboard: { icon: "panels-top-left", label: "分镜项目" },
    video: { icon: "clapperboard", label: "视频项目" },
    workflow: { icon: "workflow", label: "创作流程" },
    character: { icon: "user-round-check", label: "角色资产" },
    canvas: { icon: "layout-dashboard", label: "画布探索" },
    asset: { icon: "package-open", label: "项目资产" },
  };

  function refreshIcons() {
    if (!window.lucide) return;
    window.lucide.createIcons({ attrs: { "stroke-width": 1.8 } });
  }

  function normalizeTheme(mode) {
    if (mode === "light" || mode === "dark") return mode;
    if (mode === "system") return systemThemeQuery.matches ? "light" : "dark";
    return "light";
  }

  function loadTheme() {
    try {
      return normalizeTheme(localStorage.getItem("reelay-theme-mode"));
    } catch {
      return "light";
    }
  }

  function applyTheme(mode, persist = false) {
    const nextTheme = normalizeTheme(mode);
    document.documentElement.dataset.theme = nextTheme;
    if (persist) {
      try {
        localStorage.setItem("reelay-theme-mode", nextTheme);
      } catch {
        // Theme changes remain available for the current page when storage is blocked.
      }
    }
    if (themeLabel) themeLabel.textContent = nextTheme === "light" ? "深色模式" : "浅色模式";
    const liveThemeIcon = document.querySelector("#homeThemeIcon");
    if (liveThemeIcon) {
      const replacement = document.createElement("i");
      replacement.id = "homeThemeIcon";
      replacement.dataset.lucide = nextTheme === "light" ? "moon" : "sun";
      replacement.setAttribute("aria-hidden", "true");
      liveThemeIcon.replaceWith(replacement);
    }
    refreshIcons();
  }

  function showToast(message) {
    if (!toast) return;
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 2200);
  }

  function escapeHtml(value) {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return String(value ?? "").replace(/[&<>"']/g, (character) => entities[character]);
  }

  function getProjectTitle(project) {
    return projectTitleOverrides.get(project.id) || project.title;
  }

  function getSlideRole(index) {
    if (index === activeSlide) return "active";
    const nextIndex = (activeSlide + 1) % heroSlides.length;
    return index === nextIndex ? "right" : "left";
  }

  function renderCarousel() {
    if (!heroTrack || !carouselDots || !heroSlides.length) return;
    heroTrack.innerHTML = heroSlides.map((slide, index) => {
      const role = getSlideRole(index);
      return `
        <button class="hero-card is-${role}" type="button" data-slide-index="${index}" aria-label="${slide.title}${role === "active" ? "，当前项" : ""}">
          <img src="${slide.image}" alt="" />
          <span class="hero-card-shade" aria-hidden="true"></span>
          <span class="hero-card-copy">
            <strong>${slide.title}</strong>
            <small>${slide.description}</small>
          </span>
        </button>
      `;
    }).join("");
    carouselDots.innerHTML = heroSlides.map((slide, index) => `
      <button class="carousel-dot${index === activeSlide ? " is-active" : ""}" type="button" data-slide-dot="${index}" aria-label="显示${slide.title}" aria-pressed="${index === activeSlide}">
        <span></span>
      </button>
    `).join("");
    refreshIcons();
  }

  function setActiveSlide(index) {
    if (!heroSlides.length) return;
    activeSlide = (index + heroSlides.length) % heroSlides.length;
    renderCarousel();
  }

  function renderCapabilities() {
    if (!capabilityStrip) return;
    capabilityStrip.innerHTML = capabilities.map((capability) => `
      <button type="button" data-capability="${capability.id}">
        <i data-lucide="${capability.icon}" aria-hidden="true"></i>
        <span>${capability.label}</span>
        ${capability.id === "all" ? '<i data-lucide="chevron-right" aria-hidden="true"></i>' : ""}
      </button>
    `).join("");
  }

  function renderProjects() {
    if (!projectGrid) return;
    closeProjectContextMenu();
    const recentProjectCards = recentProjects.map((project) => {
      const projectTitle = getProjectTitle(project);
      return `
      <article class="project-card${project.workspace === "organization" ? " is-collaboration" : ""}" data-project-card data-project-id="${escapeHtml(project.id)}">
        <a class="project-cover-link" href="./index.html" aria-label="打开项目 ${escapeHtml(projectTitle)}" tabindex="-1">
          <span class="project-cover"><img src="${escapeHtml(project.image)}" alt="" /></span>
        </a>
        ${project.workspace === "organization" ? '<span class="project-collaboration-badge" aria-label="协作项目" title="协作项目"><i data-lucide="users-round" aria-hidden="true"></i></span>' : ""}
        <div class="project-info">
          <div class="project-title-line">
            <a class="project-card-link" href="./index.html" data-project-title-link title="${escapeHtml(projectTitle)}"><strong>${escapeHtml(projectTitle)}</strong></a>
            <button class="project-quick-rename" type="button" data-project-rename-trigger data-project-id="${escapeHtml(project.id)}" data-project-title="${escapeHtml(projectTitle)}" aria-label="快捷重命名项目：${escapeHtml(projectTitle)}" title="快捷重命名">
              <i data-lucide="pencil" aria-hidden="true"></i>
            </button>
          </div>
          <span>${escapeHtml(project.editedAt)}</span>
        </div>
        <button class="project-menu-trigger" type="button" data-project-menu-trigger data-project-id="${escapeHtml(project.id)}" data-project-title="${escapeHtml(projectTitle)}" aria-label="打开项目菜单：${escapeHtml(projectTitle)}" aria-haspopup="menu" aria-expanded="false" aria-controls="projectContextMenu">
          <i data-lucide="ellipsis" aria-hidden="true"></i>
        </button>
      </article>
    `;
    }).join("");
    projectGrid.innerHTML = `
      <a class="project-card project-create-card" href="./index.html" aria-label="新建项目">
        <span class="project-create-main">
          <span class="project-create-icon" aria-hidden="true"><i data-lucide="plus"></i></span>
          <strong>新建项目</strong>
        </span>
      </a>
      ${recentProjectCards}
    `;
  }

  function renderAllProjects() {
    if (!allProjectsGrid || !projectsResultSummary) return;
    closeProjectContextMenu();
    const normalizedQuery = projectQuery.trim().toLocaleLowerCase("zh-CN");
    const filteredProjects = allProjects.filter((project) => {
      if (project.workspace !== activeProjectScope) return false;
      if (!normalizedQuery) return true;
      return `${getProjectTitle(project)} ${project.editedAt}`.toLocaleLowerCase("zh-CN").includes(normalizedQuery);
    });

    const projectCards = filteredProjects.map((project) => {
      const kind = projectKinds[project.kind] || projectKinds.canvas;
      const projectTitle = getProjectTitle(project);
      const visual = project.image
        ? `<span class="library-project-visual has-image"><img src="${escapeHtml(project.image)}" alt="" /></span>`
        : `<span class="library-project-visual is-symbol tone-${escapeHtml(project.accent || "slate")}" aria-hidden="true"><i data-lucide="${kind.icon}"></i><small>${kind.label}</small></span>`;
      return `
        <article class="library-project-card${project.image ? " has-cover" : " is-compact"}${project.workspace === "organization" ? " is-collaboration" : ""}" data-project-card data-project-id="${escapeHtml(project.id)}">
          <a class="library-project-visual-link" href="./index.html" aria-label="打开项目 ${escapeHtml(projectTitle)}，原型将进入当前画布" tabindex="-1">
            ${visual}
          </a>
          ${project.workspace === "organization" ? '<span class="project-collaboration-badge" aria-label="协作项目" title="协作项目"><i data-lucide="users-round" aria-hidden="true"></i></span>' : ""}
          <div class="library-project-copy">
            <div class="project-title-line">
              <a class="library-project-link" href="./index.html" data-project-title-link title="${escapeHtml(projectTitle)}"><strong>${escapeHtml(projectTitle)}</strong></a>
              <button class="project-quick-rename" type="button" data-project-rename-trigger data-project-id="${escapeHtml(project.id)}" data-project-title="${escapeHtml(projectTitle)}" aria-label="快捷重命名项目：${escapeHtml(projectTitle)}" title="快捷重命名">
                <i data-lucide="pencil" aria-hidden="true"></i>
              </button>
            </div>
            <span>${escapeHtml(project.editedAt)}</span>
          </div>
          <button class="library-project-more project-menu-trigger" type="button" data-project-menu-trigger data-project-id="${escapeHtml(project.id)}" data-project-title="${escapeHtml(projectTitle)}" aria-label="打开项目菜单：${escapeHtml(projectTitle)}" aria-haspopup="menu" aria-expanded="false" aria-controls="projectContextMenu">
            <i data-lucide="ellipsis" aria-hidden="true"></i>
          </button>
        </article>
      `;
    }).join("");

    allProjectsGrid.innerHTML = `
      <a class="library-project-card library-project-create" href="./index.html" aria-label="新建项目">
        <span class="library-project-create-main">
          <span class="library-project-create-icon" aria-hidden="true"><i data-lucide="plus"></i></span>
          <strong>新建项目</strong>
        </span>
      </a>
      ${projectCards}
    `;

    const scopeLabel = activeProjectScope === "organization" ? "协作项目" : "个人";
    projectsResultSummary.textContent = `${scopeLabel} · ${filteredProjects.length} 个`;
    refreshIcons();
  }

  function setAllProjectsOpen(open, options = {}) {
    if (!allProjectsView || !allProjectsTrigger || !homeMain) return;
    const { focus = true, syncHash = false } = options;
    if (open === allProjectsOpen) return;
    if (open) {
      shouldRestoreProjectsTrigger = document.activeElement === allProjectsTrigger;
      projectsBackgroundScrollY = window.scrollY;
    }
    allProjectsOpen = open;
    allProjectsTrigger.setAttribute("aria-expanded", String(open));
    allProjectsView.setAttribute("aria-hidden", String(!open));
    allProjectsView.inert = !open;
    allProjectsView.hidden = !open;
    homeMain.inert = open;
    homeMain.hidden = open;
    if (open) homeMain.setAttribute("aria-hidden", "true");
    else homeMain.removeAttribute("aria-hidden");

    if (open) {
      setProfileMenuOpen(false);
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      if (focus) allProjectsTitle?.focus({ preventScroll: true });
    } else {
      if (syncHash && window.location.hash === "#all-projects") {
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      }
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: projectsBackgroundScrollY, left: 0, behavior: "auto" });
        if (focus && shouldRestoreProjectsTrigger) {
          allProjectsTrigger.focus({ preventScroll: true });
        }
        shouldRestoreProjectsTrigger = false;
      });
    }
  }

  function closeAllProjects() {
    if (window.location.hash === "#all-projects" && window.history.state?.reelaySubview === "all-projects") {
      window.history.back();
      return;
    }
    setAllProjectsOpen(false, { focus: true, syncHash: true });
  }

  function updateComposerState() {
    if (!composerSubmit || !creationPrompt) return;
    composerSubmit.disabled = !creationPrompt.value.trim();
  }

  function setProfileMenuOpen(open, showCredits = false) {
    if (!profileMenu || !profileButton || !creditButton) return;
    profileMenu.hidden = !open;
    profileButton.setAttribute("aria-expanded", String(open));
    creditButton.setAttribute("aria-expanded", String(open));
    if (creditSummary) creditSummary.hidden = !(open && showCredits);
  }

  function closeProjectContextMenu(options = {}) {
    if (!projectContextMenu) return;
    const { restoreFocus = false } = options;
    const triggerToRestore = activeProjectMenuTrigger;
    projectContextMenu.hidden = true;
    projectContextMenu.style.removeProperty("left");
    projectContextMenu.style.removeProperty("top");
    activeProjectMenuTrigger?.setAttribute("aria-expanded", "false");
    activeProjectMenuTrigger = null;
    activeProjectTitle = "";
    if (restoreFocus) triggerToRestore?.focus({ preventScroll: true });
  }

  function openProjectContextMenu(trigger) {
    if (!projectContextMenu || !projectMenuOpen) return;
    if (activeProjectMenuTrigger === trigger && !projectContextMenu.hidden) {
      closeProjectContextMenu({ restoreFocus: true });
      return;
    }
    closeProjectContextMenu();
    setProfileMenuOpen(false);
    activeProjectMenuTrigger = trigger;
    activeProjectTitle = trigger.dataset.projectTitle || "当前项目";
    trigger.setAttribute("aria-expanded", "true");
    projectMenuOpen.setAttribute("aria-label", `打开项目：${activeProjectTitle}`);
    projectContextMenu.hidden = false;

    window.requestAnimationFrame(() => {
      const triggerRect = trigger.getBoundingClientRect();
      const menuRect = projectContextMenu.getBoundingClientRect();
      const edgeGap = 8;
      const left = Math.min(
        Math.max(edgeGap, triggerRect.right - menuRect.width),
        window.innerWidth - menuRect.width - edgeGap,
      );
      const below = triggerRect.bottom + edgeGap;
      const top = below + menuRect.height <= window.innerHeight - edgeGap
        ? below
        : Math.max(edgeGap, triggerRect.top - menuRect.height - edgeGap);
      projectContextMenu.style.left = `${left}px`;
      projectContextMenu.style.top = `${top}px`;
      projectMenuOpen.focus({ preventScroll: true });
    });
  }

  function handleProjectMenuTrigger(event) {
    const trigger = event.target.closest("[data-project-menu-trigger]");
    if (!trigger) return;
    event.preventDefault();
    event.stopPropagation();
    openProjectContextMenu(trigger);
  }

  function findProjectRenameTrigger(container, projectId) {
    return Array.from(container?.querySelectorAll("[data-project-rename-trigger]") || [])
      .find((button) => button.dataset.projectId === projectId);
  }

  function beginProjectRename(sourceTrigger) {
    const card = sourceTrigger?.closest("[data-project-card]");
    const titleLine = card?.querySelector(".project-title-line");
    const titleLink = titleLine?.querySelector("[data-project-title-link]");
    const quickRenameButton = titleLine?.querySelector("[data-project-rename-trigger]");
    const projectId = sourceTrigger?.dataset.projectId;
    if (!card || !titleLine || !titleLink || !quickRenameButton || !projectId || titleLine.querySelector("input")) return;

    const currentTitle = quickRenameButton.dataset.projectTitle || titleLink.textContent.trim();
    const targetGrid = card.closest("#allProjectsGrid") ? allProjectsGrid : projectGrid;
    const input = document.createElement("input");
    input.className = "project-inline-rename";
    input.type = "text";
    input.maxLength = 80;
    input.value = currentTitle;
    input.setAttribute("aria-label", `重命名项目：${currentTitle}`);
    titleLink.hidden = true;
    quickRenameButton.hidden = true;
    titleLine.append(input);
    card.classList.add("is-renaming");
    input.focus({ preventScroll: true });
    input.select();

    let settled = false;
    const restore = () => {
      input.remove();
      titleLink.hidden = false;
      quickRenameButton.hidden = false;
      card.classList.remove("is-renaming");
    };
    const cancel = () => {
      if (settled) return;
      settled = true;
      restore();
      quickRenameButton.focus({ preventScroll: true });
    };
    const commit = () => {
      if (settled) return;
      const nextTitle = input.value.trim();
      if (!nextTitle || nextTitle === currentTitle) {
        cancel();
        return;
      }
      settled = true;
      projectTitleOverrides.set(projectId, nextTitle);
      renderProjects();
      renderAllProjects();
      showToast(`已在本次演示中重命名为“${nextTitle}”`);
      findProjectRenameTrigger(targetGrid, projectId)?.focus({ preventScroll: true });
    };

    input.addEventListener("click", (event) => event.stopPropagation());
    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (event) => {
      if (event.isComposing) return;
      if (event.key === "Enter") {
        event.preventDefault();
        commit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        cancel();
      }
    });
  }

  function handleProjectRenameTrigger(event) {
    const trigger = event.target.closest("[data-project-rename-trigger]");
    if (!trigger) return;
    event.preventDefault();
    event.stopPropagation();
    beginProjectRename(trigger);
  }

  document.querySelectorAll("[data-carousel-direction]").forEach((button) => {
    button.addEventListener("click", () => setActiveSlide(activeSlide + Number(button.dataset.carouselDirection)));
  });

  heroTrack?.addEventListener("click", (event) => {
    const card = event.target.closest("[data-slide-index]");
    if (!card) return;
    const index = Number(card.dataset.slideIndex);
    if (index !== activeSlide) {
      setActiveSlide(index);
      return;
    }
    const slide = heroSlides[index];
    if (creationPrompt && slide) {
      creationPrompt.value = `我想从「${slide.title}」开始一个新项目`;
      updateComposerState();
      creationPrompt.focus();
    }
  });

  carouselDots?.addEventListener("click", (event) => {
    const dot = event.target.closest("[data-slide-dot]");
    if (dot) setActiveSlide(Number(dot.dataset.slideDot));
  });

  capabilityStrip?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-capability]");
    if (!button) return;
    const capability = capabilities.find((item) => item.id === button.dataset.capability);
    if (!capability) return;
    if (capability.id === "all") {
      showToast("更多能力会随工作台数据层逐步接入");
      return;
    }
    creationPrompt.value = capability.prompt;
    updateComposerState();
    creationPrompt.focus();
  });

  creationPrompt?.addEventListener("input", updateComposerState);
  creationPrompt?.addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      creationComposer?.requestSubmit();
    }
  });

  creationComposer?.addEventListener("submit", (event) => {
    event.preventDefault();
    const prompt = creationPrompt?.value.trim();
    if (!prompt) {
      creationPrompt?.focus();
      return;
    }
    try {
      sessionStorage.setItem(launchIntentKey, prompt);
    } catch {
      // The canvas can still open if session storage is unavailable.
    }
    window.location.assign("./index.html");
  });

  document.querySelector(".composer-tools")?.addEventListener("click", (event) => {
    const action = event.target.closest("[data-composer-action]")?.dataset.composerAction;
    if (!action) return;
    const messages = {
      add: "主页素材添加尚未接入，请进入画布后添加",
      template: "模板中心尚未接入，当前可直接描述创作需求",
      image: "主页图片添加尚未接入，请进入画布后添加",
      agent: "Reelay Agent 入口目前位于画布右侧",
    };
    showToast(messages[action]);
  });

  allProjectsTrigger?.addEventListener("click", (event) => {
    event.preventDefault();
    if (window.location.hash !== "#all-projects") {
      window.history.pushState({ reelaySubview: "all-projects" }, "", "#all-projects");
    }
    setAllProjectsOpen(true, { focus: true });
  });

  allProjectsBack?.addEventListener("click", closeAllProjects);

  document.querySelector(".project-scope-switch")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-project-scope]");
    if (!button || button.dataset.projectScope === activeProjectScope) return;
    activeProjectScope = button.dataset.projectScope;
    document.querySelectorAll("[data-project-scope]").forEach((item) => {
      item.setAttribute("aria-pressed", String(item === button));
    });
    renderAllProjects();
  });

  projectsSearchInput?.addEventListener("input", () => {
    projectQuery = projectsSearchInput.value;
    renderAllProjects();
  });

  projectGrid?.addEventListener("click", handleProjectMenuTrigger);
  allProjectsGrid?.addEventListener("click", handleProjectMenuTrigger);
  projectGrid?.addEventListener("click", handleProjectRenameTrigger);
  allProjectsGrid?.addEventListener("click", handleProjectRenameTrigger);

  projectContextMenu?.addEventListener("click", (event) => {
    event.stopPropagation();
    if (event.target.closest("#projectMenuOpen")) {
      closeProjectContextMenu();
      return;
    }
    const action = event.target.closest("[data-project-action]")?.dataset.projectAction;
    if (!action) return;
    if (action === "rename") {
      const sourceTrigger = activeProjectMenuTrigger;
      closeProjectContextMenu();
      beginProjectRename(sourceTrigger);
      return;
    }
    const actionMessages = {
      cover: `“${activeProjectTitle}”封面修改将在项目数据持久化接入后可用`,
      collaborate: `“${activeProjectTitle}”转为协作项目将在项目数据持久化接入后可用`,
      delete: `“${activeProjectTitle}”删除操作将在项目数据持久化接入后可用`,
    };
    showToast(actionMessages[action]);
    closeProjectContextMenu();
  });

  window.addEventListener("popstate", () => {
    const shouldOpen = window.location.hash === "#all-projects";
    setAllProjectsOpen(shouldOpen, { focus: shouldOpen !== allProjectsOpen });
  });

  window.addEventListener("hashchange", () => {
    const shouldOpen = window.location.hash === "#all-projects";
    setAllProjectsOpen(shouldOpen, { focus: shouldOpen !== allProjectsOpen });
  });

  profileButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    setProfileMenuOpen(profileMenu?.hidden !== false, false);
  });

  creditButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    setProfileMenuOpen(true, true);
  });

  profileMenu?.addEventListener("click", (event) => {
    event.stopPropagation();
    const workspaceButton = event.target.closest("[data-workspace]");
    if (workspaceButton) {
      profileMenu.querySelectorAll("[data-workspace]").forEach((button) => button.classList.toggle("is-current", button === workspaceButton));
      showToast(workspaceButton.dataset.workspace === "organization" ? "已切换到 Reelay Studio（组织空间原型）" : "已切换到个人空间");
      return;
    }
    if (event.target.closest('[data-profile-action="theme"]')) {
      const nextTheme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
      applyTheme(nextTheme, true);
    }
  });

  window.addEventListener("resize", () => closeProjectContextMenu());
  window.addEventListener("scroll", () => closeProjectContextMenu(), true);

  document.addEventListener("click", (event) => {
    setProfileMenuOpen(false);
    if (!event.target.closest("#projectContextMenu")) closeProjectContextMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && projectContextMenu && !projectContextMenu.hidden) {
      event.preventDefault();
      closeProjectContextMenu({ restoreFocus: true });
      return;
    }
    if (event.key === "Escape" && profileMenu && !profileMenu.hidden) {
      setProfileMenuOpen(false);
      profileButton?.focus();
      return;
    }
    if (event.key === "Escape" && allProjectsOpen) {
      event.preventDefault();
      closeAllProjects();
    }
  });

  renderCarousel();
  renderCapabilities();
  renderProjects();
  renderAllProjects();
  applyTheme(loadTheme());
  updateComposerState();
  refreshIcons();
  if (window.location.hash === "#all-projects") {
    setAllProjectsOpen(true, { focus: true });
  }
})();
