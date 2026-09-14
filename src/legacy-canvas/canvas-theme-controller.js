(function registerCanvasThemeController(root) {
  "use strict";

  const STORAGE_KEY = "reelay-theme-mode";

  function createController({ document, refreshIcons, onApply, onChange }) {
    const view = document.defaultView;
    const systemTheme = view.matchMedia("(prefers-color-scheme: light)");
    const modeIcon = document.querySelector("#themeModeIcon");
    const inlineSwitch = document.querySelector("[data-theme-inline-switch]");
    const currentLabel = document.querySelector("#themeCurrentLabel");
    let feedbackTimer = null;
    let disposed = false;

    function normalize(mode) {
      if (mode === "light" || mode === "dark") return mode;
      // Legacy saved preferences are resolved once; the current UI offers two modes.
      if (mode === "system") return systemTheme.matches ? "light" : "dark";
      return "light";
    }

    function load() {
      try { return normalize(view.localStorage.getItem(STORAGE_KEY)); }
      catch { return "light"; }
    }

    let mode = load();

    function clearFeedback() {
      view.clearTimeout(feedbackTimer);
      feedbackTimer = null;
      inlineSwitch?.classList.remove("is-visible");
    }

    function flash() {
      if (!inlineSwitch) return;
      view.clearTimeout(feedbackTimer);
      inlineSwitch.classList.add("is-visible");
      feedbackTimer = view.setTimeout(clearFeedback, 1100);
    }

    function apply(value = mode, { notifyHost = true, flash: shouldFlash = false } = {}) {
      if (disposed) return mode;
      const nextMode = normalize(value);
      const changed = nextMode !== mode;
      mode = nextMode;
      try { view.localStorage.setItem(STORAGE_KEY, mode); }
      catch { /* A blocked storage API must not prevent a session theme change. */ }
      document.documentElement.dataset.theme = mode;
      document.documentElement.dataset.themeMode = mode;
      onApply?.(mode);
      if (currentLabel) currentLabel.textContent = mode === "light" ? "浅色模式" : "深色模式";
      if (modeIcon) modeIcon.innerHTML = `<i data-lucide="${mode === "light" ? "sun" : "moon"}" aria-hidden="true"></i>`;
      inlineSwitch?.style.setProperty("--theme-index", mode === "light" ? 0 : 1);
      refreshIcons?.();
      if (shouldFlash) flash();
      if (changed && notifyHost) onChange?.(mode);
      return mode;
    }

    function toggle() {
      return apply(mode === "light" ? "dark" : "light", { flash: true });
    }

    function dispose() {
      clearFeedback();
      disposed = true;
    }

    return Object.freeze({ apply, toggle, getMode: () => mode, clearFeedback, dispose });
  }

  root.REELAY_CANVAS_THEME_CONTROLLER = Object.freeze({ createController });
}(typeof globalThis === "object" ? globalThis : window));
