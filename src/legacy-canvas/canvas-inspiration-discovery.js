(function registerInspirationDiscovery(root) {
  "use strict";

  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const icon = (name) => `<i data-lucide="${name}" aria-hidden="true"></i>`;

  function create({ document, host, grid, catalog, onChange, refreshIcons = () => {}, getScope = () => "", getTrigger = () => null,
    schedule = (fn, delay) => root.setTimeout(fn, delay), cancel = (id) => root.clearTimeout(id) }) {
    let selected = [];
    let expanded = "";
    let open = false;
    let active = false;
    let selecting = false;
    let query = "";
    let scope = getScope();
    let initialized = false;
    const optionQueries = new Map();
    const facetOrder = ["scale", "movement", "light", "composition", "editing", "duration"];
    const facets = () => facetOrder.map((id) => (catalog.discoveryFacets || []).find((facet) => facet.id === id)).filter(Boolean);
    const normalize = (value) => String(value || "").normalize("NFKC").toLocaleLowerCase().trim();
    let preview = null;
    let pending = null;
    const cleanups = [];
    const listen = (element, name, callback, options) => {
      element.addEventListener(name, callback, options);
      cleanups.push(() => element.removeEventListener(name, callback, options));
    };
    function syncScope() {
      if (scope === getScope()) return;
      scope = getScope();
      selected = [];
      expanded = "";
      optionQueries.clear();
      open = false;
      host.hidden = true;
      stopPreview();
    }
    function stopPreview() {
      if (pending !== null) cancel(pending);
      pending = null;
      if (!preview) return;
      const previous = preview;
      preview = null;
      previous.pause();
      previous.removeAttribute("src");
      previous.load();
      previous.remove();
    }
    const bounds = host.closest(".asset-library-content");
    function sizePopover() {
      if (!open || !active || !bounds) return;
      const available = bounds.getBoundingClientRect().bottom - host.getBoundingClientRect().top - 8;
      host.style.setProperty("--discovery-available-height", `${Math.max(0, available)}px`);
    }
    if (bounds && root.ResizeObserver) {
      const observer = new root.ResizeObserver(sizePopover);
      observer.observe(bounds);
      cleanups.push(() => observer.disconnect());
    }
    listen(root, "resize", sizePopover);
    function syncVisibility() {
      host.hidden = !active || !open;
      getTrigger()?.setAttribute("aria-expanded", String(active && open));
      sizePopover();
    }
    function close(returnFocus = false) {
      open = false;
      syncVisibility();
      if (returnFocus) getTrigger()?.focus({ preventScroll: true });
    }
    function renderOptions(facet) {
      const list = host.querySelector(`[data-discovery-options="${facet.id}"]`);
      const term = normalize(optionQueries.get(facet.id));
      const other = selected.filter((id) => !facet.options.some((option) => option.id === id));
      const options = facet.options.map((tag, index) => ({ tag, index, total: catalog.search({ facets: [tag.id] }).length }))
        .filter(({ tag, total }) => total > 0 && normalize([tag.label, ...(tag.aliases || [])].join(" ")).includes(term))
        .sort((a, b) => facet.id === "duration" ? a.index - b.index : b.total - a.total || a.index - b.index);
      list.innerHTML = options.map(({ tag }) => {
        const matching = catalog.search({ query, facets: [...other, tag.id] }).length;
        return `<button type="button" data-discovery-facet="${escape(tag.id)}" aria-pressed="${selected.includes(tag.id)}" title="${escape(tag.description || tag.label)}"${matching ? "" : ' class="is-empty"'}><span>${escape(tag.label)}</span><small>${matching}</small><span class="inspiration-facet-check">${selected.includes(tag.id) ? icon("check") : ""}</span></button>`;
      }).join("") || '<p class="inspiration-facet-empty" role="status">没有匹配的选项</p>';
    }
    function render(focusId) {
      if (!initialized) {
        host.innerHTML = `<header class="inspiration-discovery-header"><strong>筛选</strong><button type="button" data-discovery-reset>重置</button></header><div class="inspiration-discovery-fields">${facets().map((facet) => `<section class="inspiration-facet"><button type="button" class="inspiration-facet-heading" data-discovery-group="${facet.id}" aria-expanded="false" aria-controls="inspirationFacet-${facet.id}"><span>${escape(facet.label)}</span><span class="inspiration-facet-summary">不限</span>${icon("chevron-down")}</button><div class="inspiration-facet-body" id="inspirationFacet-${facet.id}" hidden><label class="inspiration-facet-search">${icon("search")}<input type="search" data-discovery-search="${facet.id}" aria-label="搜索${escape(facet.label)}选项" placeholder="搜索${escape(facet.label)}" autocomplete="off"></label><button type="button" class="inspiration-facet-any" data-discovery-clear-group="${facet.id}" aria-pressed="true">不限</button><div class="inspiration-facet-options" data-discovery-options="${facet.id}" role="group" aria-label="${escape(facet.label)}"></div></div></section>`).join("")}</div><footer class="inspiration-discovery-footer"><span data-discovery-results role="status"></span><button type="button" data-discovery-done>完成</button></footer>`;
        initialized = true;
      }
      for (const facet of facets()) {
        const heading = host.querySelector(`[data-discovery-group="${facet.id}"]`);
        const chosen = facet.options.filter((tag) => selected.includes(tag.id));
        const summary = chosen.map((tag) => tag.label).join("、") || "不限";
        const summaryNode = heading.querySelector(".inspiration-facet-summary");
        summaryNode.textContent = summary;
        summaryNode.title = summary;
        heading.classList.toggle("has-value", chosen.length > 0);
        heading.setAttribute("aria-expanded", String(expanded === facet.id));
        host.querySelector(`#inspirationFacet-${facet.id}`).hidden = expanded !== facet.id;
        host.querySelector(`[data-discovery-clear-group="${facet.id}"]`).setAttribute("aria-pressed", String(!chosen.length));
        const input = host.querySelector(`[data-discovery-search="${facet.id}"]`);
        if (input.value !== (optionQueries.get(facet.id) || "")) input.value = optionQueries.get(facet.id) || "";
        renderOptions(facet);
      }
      host.querySelector("[data-discovery-reset]").disabled = !selected.length;
      host.querySelector("[data-discovery-results]").textContent = `${catalog.search({ query, facets: selected }).length} 个片段`;
      refreshIcons();
      if (focusId) host.querySelector(focusId)?.focus({ preventScroll: true });
    }
    function changed(focusId) {
      stopPreview();
      onChange();
      render(focusId);
    }
    listen(host, "click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      const groupId = button.dataset.discoveryGroup;
      if (groupId) {
        expanded = expanded === groupId ? "" : groupId;
        render(`[data-discovery-group="${groupId}"]`);
        return;
      }
      const id = button.dataset.discoveryFacet;
      if (id) {
        selected = selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id];
        changed(`[data-discovery-facet="${id}"]`);
      } else if (button.hasAttribute("data-discovery-clear-group")) {
        const facet = facets().find((item) => item.id === button.dataset.discoveryClearGroup);
        selected = selected.filter((value) => !facet.options.some((tag) => tag.id === value));
        changed(`[data-discovery-clear-group="${facet.id}"]`);
      } else if (button.hasAttribute("data-discovery-reset")) {
        selected = [];
        optionQueries.clear();
        changed('[data-discovery-done]');
      } else if (button.hasAttribute("data-discovery-done")) close(true);
    });
    function searchOptions(event) {
      const id = event.target.dataset.discoverySearch;
      if (!id || event.isComposing) return;
      optionQueries.set(id, event.target.value);
      const facet = facets().find((item) => item.id === id);
      if (facet) { renderOptions(facet); refreshIcons(); }
    }
    listen(host, "input", searchOptions);
    listen(host, "compositionend", searchOptions);
    listen(host, "keydown", (event) => {
      if (event.key !== "Escape" || !open) return;
      event.preventDefault();
      event.stopPropagation();
      close(true);
    });
    listen(document, "pointerdown", (event) => {
      if (open && !host.contains(event.target) && !getTrigger()?.contains(event.target)) close();
    }, true);
    listen(document, "focusin", (event) => {
      if (open && !host.contains(event.target) && !getTrigger()?.contains(event.target)) close();
    });
    function startPreview(event) {
      if (!active || selecting || document.hidden || root.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
      const button = event.target.closest(".inspiration-card-preview");
      if (!button || button.contains(event.relatedTarget)) return;
      const clip = catalog.get(button.dataset.libraryPreview);
      if (!clip) return;
      stopPreview();
      pending = schedule(() => {
        pending = null;
        if (!active || selecting || !button.isConnected || document.querySelector("dialog[open]")) return;
        const video = document.createElement("video");
        preview = video;
        video.className = "inspiration-card-motion";
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.setAttribute("aria-hidden", "true");
        video.src = clip.url;
        button.append(video);
        video.addEventListener("loadeddata", () => { if (preview === video) video.classList.add("is-ready"); }, { once: true });
        video.addEventListener("error", () => { if (preview === video) stopPreview(); }, { once: true });
        Promise.resolve(video.play()).catch(() => { if (preview === video) stopPreview(); });
      }, 180);
    }
    function leavePreview(event) {
      const button = event.target.closest(".inspiration-card-preview");
      if (button && !button.contains(event.relatedTarget)) stopPreview();
    }
    listen(grid, "click", (event) => {
      const button = event.target.closest("[data-discovery-card-facet]");
      if (!button || !active || selecting) return;
      const id = button.dataset.discoveryCardFacet;
      if (!facets().some((facet) => facet.options.some((tag) => tag.id === id))) return;
      event.preventDefault();
      event.stopPropagation();
      if (!selected.includes(id)) { selected = [...selected, id]; changed(); }
      if (event.detail === 0) grid.querySelector(`[data-discovery-card-facet="${id}"]`)?.focus({ preventScroll: true });
    }, true);
    listen(grid, "pointerover", startPreview);
    listen(grid, "focusin", startPreview);
    listen(grid, "pointerout", leavePreview);
    listen(grid, "focusout", leavePreview);
    listen(grid, "scroll", stopPreview);
    listen(grid, "click", stopPreview, true);
    listen(grid, "dragstart", stopPreview);
    listen(document, "visibilitychange", stopPreview);
    return Object.freeze({
      results(text) { syncScope(); return catalog.search({ query: text, facets: selected }); },
      sync(options) {
        syncScope();
        active = options.active;
        if (!active || selecting !== Boolean(options.selectionMode)) open = false;
        selecting = Boolean(options.selectionMode);
        query = options.query || "";
        syncVisibility();
        stopPreview();
        if (active) render();
      },
      toggle() {
        if (!active) return;
        open = !open;
        stopPreview();
        syncVisibility();
        if (open) render(`[data-discovery-group="${expanded || facets()[0]?.id}"]`);
      },
      get count() { syncScope(); return selected.length; },
      get selectedIds() { syncScope(); return [...selected]; },
      get expanded() { return active && open; },
      stopPreview,
      destroy() { stopPreview(); cleanups.forEach((remove) => remove()); host.replaceChildren(); },
    });
  }
  root.REELAY_CANVAS_INSPIRATION_DISCOVERY = Object.freeze({ create });
})(window);
