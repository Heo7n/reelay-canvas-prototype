(function registerCanvasAssetLibraryHeaderController(root) {
  "use strict";

  function create(options = {}) {
    const { panel, spaceTabs, searchRegion, searchInput, searchToggle, searchClose, commands, onSpaceChange, onQueryChange } = options;
    if (![panel, spaceTabs, searchRegion, searchInput, searchToggle, searchClose, commands].every((element) => element?.addEventListener)
      || typeof onSpaceChange !== "function" || typeof onQueryChange !== "function") {
      throw new TypeError("Asset library header dependencies are incomplete.");
    }
    const document = panel.ownerDocument;
    const listeners = [];
    let disposed = false;
    let open = false;
    let visible = true;
    let currentSpace = null;
    let pointerInside = false;
    let leaveTimer = null;

    function clearLeaveTimer() {
      if (leaveTimer !== null) document.defaultView.clearTimeout(leaveTimer);
      leaveTimer = null;
    }

    function listen(element, type, listener) {
      element.addEventListener(type, listener);
      listeners.push(() => element.removeEventListener(type, listener));
    }

    function setOpen(value) {
      const permanent = currentSpace === "platform";
      open = visible && (permanent || value);
      panel.classList.toggle("is-searching", open);
      searchRegion.inert = !open;
      searchRegion.toggleAttribute("inert", !open);
      searchRegion.setAttribute("aria-hidden", String(!open));
      const overlay = open && !permanent;
      commands.inert = overlay;
      commands.toggleAttribute("inert", overlay);
      commands.setAttribute("aria-hidden", String(overlay));
      searchClose.setAttribute("aria-label", permanent ? "清除搜索" : "关闭搜索");
      searchClose.title = permanent ? "清除搜索" : "关闭搜索";
      searchClose.hidden = permanent && !searchInput.value;
      searchToggle.setAttribute("aria-expanded", String(open));
    }

    function close({ restoreFocus = false } = {}) {
      if (disposed) return;
      clearLeaveTimer();
      const hadQuery = searchInput.value !== "";
      searchInput.value = "";
      setOpen(false);
      if (hadQuery) onQueryChange("");
      const focusTarget = currentSpace === "platform" ? searchInput : searchToggle;
      if (restoreFocus && visible && focusTarget.isConnected) focusTarget.focus({ preventScroll: true });
    }

    function tabs() {
      return [...spaceTabs.querySelectorAll("[data-library-space]")].filter((tab) => !tab.disabled);
    }

    function activate(tab, { focus = false } = {}) {
      if (disposed || !visible || !tab || !tabs().includes(tab)) return;
      if (focus) tab.focus({ preventScroll: true });
      if (tab.dataset.librarySpace !== currentSpace) onSpaceChange(tab.dataset.librarySpace);
    }

    function sync({ space = "personal", query = "", visible: nextVisible = true } = {}) {
      if (disposed) return;
      const changedSpace = currentSpace !== space;
      if (changedSpace || !nextVisible) {
        clearLeaveTimer();
        pointerInside = false;
      }
      currentSpace = space;
      visible = Boolean(nextVisible);
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
      setOpen(Boolean(value) || (!changedSpace && open));
    }

    listen(spaceTabs, "click", (event) => activate(event.target.closest?.("[data-library-space]")));
    listen(spaceTabs, "keydown", (event) => {
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
    listen(searchToggle, "click", () => {
      if (!visible) return;
      clearLeaveTimer();
      setOpen(true);
      searchInput.focus({ preventScroll: true });
    });
    function pointerEnter(event) {
      if (!visible || event.pointerType === "touch") return;
      clearLeaveTimer();
      pointerInside = true;
      setOpen(true);
    }
    function pointerLeave(event) {
      if (searchRegion.contains(event.relatedTarget) || searchToggle.contains(event.relatedTarget)) return;
      pointerInside = false;
      clearLeaveTimer();
      leaveTimer = document.defaultView.setTimeout(() => {
        leaveTimer = null;
        if (!disposed && !searchInput.value && !searchRegion.contains(document.activeElement)) setOpen(false);
      }, 140);
    }
    for (const element of [searchToggle, searchRegion]) {
      listen(element, "pointerenter", pointerEnter);
      listen(element, "pointerleave", pointerLeave);
    }
    listen(searchClose, "click", () => close({ restoreFocus: true }));
    listen(searchInput, "input", () => onQueryChange(searchInput.value));
    listen(searchRegion, "keydown", (event) => {
      if (event.key !== "Escape" || event.isComposing || !open) return;
      event.preventDefault();
      event.stopPropagation();
      close({ restoreFocus: true });
    });
    listen(searchRegion, "focusout", (event) => {
      if (searchRegion.contains(event.relatedTarget) || event.relatedTarget === searchToggle) return;
      // Null relatedTarget occurs when focus leaves the document; inspect after the
      // browser finishes its focus transition without closing during internal moves.
      document.defaultView.queueMicrotask(() => {
        if (!disposed && open && !pointerInside && !searchInput.value && !searchRegion.contains(document.activeElement)) setOpen(false);
      });
    });
    setOpen(false);

    return Object.freeze({
      sync,
      close,
      destroy() {
        if (disposed) return;
        clearLeaveTimer();
        visible = false;
        listeners.splice(0).forEach((remove) => remove());
        setOpen(false);
        disposed = true;
      },
    });
  }

  root.REELAY_CANVAS_ASSET_LIBRARY_HEADER_CONTROLLER = Object.freeze({ create });
})(typeof globalThis === "object" ? globalThis : window);
