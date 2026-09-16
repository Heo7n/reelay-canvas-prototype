(function registerCanvasAssetLibraryHeaderController(root) {
  "use strict";

  function create(options = {}) {
    const { panel, spaceTabs, searchRegion, searchInput, searchClear, onSpaceChange, onQueryChange, onSearchOpenChange } = options;
    if (![panel, spaceTabs, searchRegion, searchInput, searchClear].every((element) => element?.addEventListener)
      || typeof onSpaceChange !== "function" || typeof onQueryChange !== "function" || typeof onSearchOpenChange !== "function") {
      throw new TypeError("Asset library header dependencies are incomplete.");
    }
    const listeners = [];
    let disposed = false;
    let visible = false;
    let expanded = false;
    let currentSpace = null;

    function listen(element, type, listener) {
      element.addEventListener(type, listener);
      listeners.push(() => element.removeEventListener(type, listener));
    }

    function syncSearch() {
      const active = visible && expanded;
      panel.classList.toggle("is-search-open", active);
      searchRegion.inert = !active;
      searchRegion.toggleAttribute("inert", !active);
      searchRegion.setAttribute("aria-hidden", String(!active));
      searchClear.hidden = !active || (currentSpace === "platform" && !searchInput.value);
      searchClear.setAttribute("aria-label", currentSpace === "platform" ? "清空搜索" : "关闭搜索");
      searchClear.setAttribute("title", currentSpace === "platform" ? "清空搜索" : "关闭搜索");
      for (const toggle of panel.querySelectorAll("[data-library-search-toggle]")) {
        toggle.setAttribute("aria-expanded", String(active));
        if (searchRegion.id) toggle.setAttribute("aria-controls", searchRegion.id);
      }
      for (const covered of panel.querySelectorAll("[data-library-search-covered]")) {
        covered.inert = active;
        covered.toggleAttribute("inert", active);
        if (active) covered.setAttribute("aria-hidden", "true");
        else covered.removeAttribute("aria-hidden");
      }
    }

    function requestSearchOpen(nextExpanded) {
      if (disposed || !visible || expanded === nextExpanded) return;
      onSearchOpenChange(nextExpanded);
      if (disposed || !visible || expanded !== nextExpanded) return;
      const target = expanded ? searchInput : panel.querySelector("[data-library-search-toggle], [data-library-selection-cancel]");
      if (target?.isConnected && !target.disabled) target.focus({ preventScroll: true });
    }

    function clear({ restoreFocus = true } = {}) {
      if (disposed) return;
      const hadQuery = searchInput.value !== "";
      searchInput.value = "";
      syncSearch();
      if (hadQuery) onQueryChange("");
      if (restoreFocus && visible && expanded && searchInput.isConnected) searchInput.focus({ preventScroll: true });
    }

    function tabs() {
      return [...spaceTabs.querySelectorAll("[data-library-space]")].filter((tab) => !tab.disabled);
    }

    function activate(tab, { focus = false } = {}) {
      if (disposed || !visible || !tab || !tabs().includes(tab)) return;
      if (focus) tab.focus({ preventScroll: true });
      if (tab.dataset.librarySpace !== currentSpace) onSpaceChange(tab.dataset.librarySpace);
    }

    function sync({ space = "personal", query = "", visible: nextVisible = true, expanded: nextExpanded = false } = {}) {
      if (disposed) return;
      currentSpace = space;
      visible = Boolean(nextVisible);
      expanded = space === "platform" || Boolean(nextExpanded);
      spaceTabs.setAttribute("role", "tablist");
      for (const tab of tabs()) {
        const selected = tab.dataset.librarySpace === space;
        tab.setAttribute("role", "tab");
        tab.setAttribute("aria-selected", String(selected));
        tab.tabIndex = selected ? 0 : -1;
        tab.classList.toggle("active", selected);
      }
      const value = String(query ?? "");
      if (searchInput.value !== value) searchInput.value = value;
      syncSearch();
    }

    listen(spaceTabs, "click", (event) => activate(event.target.closest?.("[data-library-space]")));
    listen(panel, "click", (event) => {
      const toggle = event.target.closest?.("[data-library-search-toggle]");
      if (!toggle || !panel.contains(toggle) || toggle.disabled || !visible) return;
      event.preventDefault();
      event.stopPropagation();
      requestSearchOpen(true);
    });
    listen(spaceTabs, "keydown", (event) => {
      if (!visible) return;
      const availableTabs = tabs();
      const index = availableTabs.indexOf(event.target.closest?.("[data-library-space]"));
      if (index < 0 || event.altKey || event.ctrlKey || event.metaKey) return;
      let nextIndex;
      if (event.key === "ArrowLeft") nextIndex = (index + availableTabs.length - 1) % availableTabs.length;
      else if (event.key === "ArrowRight") nextIndex = (index + 1) % availableTabs.length;
      else if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = availableTabs.length - 1;
      else return;
      event.preventDefault();
      event.stopPropagation();
      activate(availableTabs[nextIndex], { focus: true });
    });
    listen(panel, "keydown", (event) => {
      if (!visible || event.altKey || event.ctrlKey || event.metaKey) return;
      const toggle = event.target.closest?.('[data-library-add-toggle]');
      const menu = event.target.closest?.('.asset-library-add-menu');
      if (toggle && ["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        event.stopPropagation();
        if (toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
        const items = [...panel.querySelectorAll('.asset-library-add-menu button:not(:disabled)')];
        (event.key === "ArrowUp" ? items.at(-1) : items[0])?.focus();
      } else if (menu && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        event.stopPropagation();
        const items = [...menu.querySelectorAll('button:not(:disabled)')];
        const index = items.indexOf(event.target.closest('button'));
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      }
    });
    listen(searchClear, "click", () => {
      if (currentSpace === "platform") clear();
      else requestSearchOpen(false);
    });
    listen(searchInput, "input", () => {
      if (!visible || !expanded) return;
      syncSearch();
      onQueryChange(searchInput.value);
    });
    listen(searchRegion, "keydown", (event) => {
      if (!visible || !expanded || event.key !== "Escape" || event.isComposing || event.keyCode === 229) return;
      event.preventDefault();
      event.stopPropagation();
      if (currentSpace === "platform") clear();
      else requestSearchOpen(false);
    });
    syncSearch();

    return Object.freeze({
      sync,
      clear,
      destroy() {
        if (disposed) return;
        listeners.splice(0).forEach((remove) => remove());
        visible = false;
        expanded = false;
        syncSearch();
        disposed = true;
      },
    });
  }

  root.REELAY_CANVAS_ASSET_LIBRARY_HEADER_CONTROLLER = Object.freeze({ create });
})(typeof globalThis === "object" ? globalThis : window);
