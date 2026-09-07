(function (root) {
  "use strict";

  function createController({ trigger, menu, boundary, models, initialModelId, escapeHtml, modelIconMarkup, refreshIcons, beforeOpen, onChange }) {
    const catalog = models.filter((model) => model.type === "image" || model.type === "video");
    let generationId = catalog.find((model) => model.id === initialModelId)?.id || catalog[0]?.id;
    let preferredIds = generationId ? [generationId] : [];
    let mode = "generation";
    let automatic = false;
    let activeSection = "image";
    const getModel = () => mode === "generation" ? catalog.find((model) => model.id === generationId) || null : null;
    const getPreferredModels = () => preferredIds.map((id) => catalog.find((model) => model.id === id));
    const isOpen = () => !menu.classList.contains("hidden");

    function position() {
      if (!isOpen()) return;
      const anchor = trigger.getBoundingClientRect();
      const parent = menu.offsetParent?.getBoundingClientRect();
      if (!parent) return;
      const width = Math.min(340, Math.max(0, parent.width));
      menu.style.width = `${width}px`;
      menu.style.left = `${Math.max(0, Math.min(anchor.left - parent.left, parent.width - width))}px`;
      menu.style.bottom = `${parent.bottom - anchor.top + 8}px`;
      menu.style.maxHeight = `${Math.max(0, Math.min(390, anchor.top - boundary.getBoundingClientRect().top - 20))}px`;
    }

    function updateSection(section) {
      activeSection = section;
      menu.querySelector(".agent-model-tabs")?.style.setProperty("--active-index", section === "video" ? "1" : "0");
      menu.querySelectorAll("[data-agent-model-tab]").forEach((button) => {
        const active = button.dataset.agentModelTab === section;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });
    }

    function syncSectionFromScroll() {
      const scroll = menu.querySelector(".agent-model-scroll");
      const video = menu.querySelector('[data-agent-model-section="video"]');
      if (!scroll || !video) return;
      const viewport = scroll.getBoundingClientRect();
      updateSection(video.getBoundingClientRect().top <= viewport.top + Math.min(64, viewport.height * 0.3) ? "video" : "image");
    }

    function render() {
      const managed = mode === "agent";
      const selectedIds = new Set(managed ? preferredIds : [generationId]);
      const option = (model) => {
        const active = selectedIds.has(model.id);
        return `<button class="agent-model-option${active ? " active" : ""}" type="button" data-agent-model="${escapeHtml(model.id)}" aria-pressed="${active}" aria-label="${escapeHtml(model.name)}" title="${escapeHtml(model.desc)}">
          ${modelIconMarkup(model, "agent-model-provider")}
          <span class="agent-model-copy"><span class="agent-model-title">${escapeHtml(model.name)}</span><span class="agent-model-detail">${escapeHtml(model.desc)}</span></span>
          <i class="agent-model-check" data-lucide="check" aria-hidden="true"></i>
        </button>`;
      };
      menu.setAttribute("aria-label", managed ? "模型偏好" : "选择模型");
      menu.innerHTML = `<div class="agent-model-fixed">
        <div class="agent-model-menu-head"><div class="agent-model-menu-title">${managed ? "模型偏好" : "选择模型"}</div>
          ${managed ? `<label class="agent-auto-toggle"><span>自动</span><input type="checkbox" data-agent-auto ${automatic ? "checked" : ""} /><i aria-hidden="true"></i></label>` : ""}
        </div>
        <div class="agent-model-tabs" style="--active-index: ${activeSection === "video" ? 1 : 0}" role="group" aria-label="定位模型类型">
          <span class="agent-model-tab-indicator" aria-hidden="true"></span>
          <button type="button" data-agent-model-tab="image">图片</button><button type="button" data-agent-model-tab="video">视频</button>
        </div>
      </div><div class="agent-model-scroll">${["image", "video"].map((type) => `<section class="agent-model-section" data-agent-model-section="${type}" aria-label="${type === "image" ? "图片" : "视频"}模型">
        <div class="agent-model-section-label">${type === "image" ? "图片" : "视频"}</div><div class="agent-model-list">${catalog.filter((model) => model.type === type).map(option).join("")}</div>
      </section>`).join("")}</div>`;
      menu.querySelector(".agent-model-scroll").addEventListener("scroll", syncSectionFromScroll, { passive: true });
      updateSection(activeSection);
      refreshIcons();
    }

    function setOpen(open, { focus = false } = {}) {
      const visible = Boolean(open && catalog.length);
      if (visible) {
        beforeOpen();
        activeSection = (getModel() || getPreferredModels()[0])?.type || "image";
        render();
      }
      menu.classList.toggle("hidden", !visible);
      trigger.classList.toggle("active", visible);
      trigger.setAttribute("aria-expanded", String(visible));
      if (!visible) return;
      position();
      const current = menu.querySelector(".agent-model-option.active") || menu.querySelector(".agent-model-option");
      const scroll = menu.querySelector(".agent-model-scroll");
      if (current && scroll) {
        scroll.scrollTop = Math.max(0, current.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 6);
        if (focus) current.focus({ preventScroll: true });
      }
    }

    function setMode(nextMode) {
      const next = nextMode === "agent" ? "agent" : "generation";
      if (mode === next) return;
      setOpen(false);
      mode = next;
      onChange();
    }

    function choose(id) {
      const selected = catalog.find((model) => model.id === id);
      if (!selected) return;
      if (mode === "generation") {
        generationId = id;
        setOpen(false);
        onChange();
        trigger.focus({ preventScroll: true });
        return;
      }
      const existing = preferredIds.includes(id);
      if (existing && preferredIds.length === 1) return;
      preferredIds = existing ? preferredIds.filter((value) => value !== id) : [...preferredIds, id];
      const scrollTop = menu.querySelector(".agent-model-scroll").scrollTop;
      onChange();
      // Keep the list and focused button in place while changing an Agent preference.
      menu.querySelectorAll("[data-agent-model]").forEach((button) => {
        const active = preferredIds.includes(button.dataset.agentModel);
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      menu.querySelector(".agent-model-scroll").scrollTop = scrollTop;
    }

    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      setOpen(!isOpen(), { focus: true });
    });
    menu.addEventListener("pointerdown", (event) => event.stopPropagation());
    menu.addEventListener("click", (event) => {
      event.stopPropagation();
      const tab = event.target.closest("[data-agent-model-tab]");
      if (tab) {
        const section = menu.querySelector(`[data-agent-model-section="${tab.dataset.agentModelTab}"]`);
        const scroll = menu.querySelector(".agent-model-scroll");
        updateSection(tab.dataset.agentModelTab);
        scroll.scrollTo({ top: scroll.scrollTop + section.getBoundingClientRect().top - scroll.getBoundingClientRect().top, behavior: "smooth" });
        return;
      }
      const option = event.target.closest("[data-agent-model]");
      if (option) choose(option.dataset.agentModel);
    });
    menu.addEventListener("change", (event) => {
      if (mode === "agent" && event.target.matches("[data-agent-auto]")) automatic = event.target.checked;
    });
    root.addEventListener("resize", position);
    const observer = root.ResizeObserver ? new root.ResizeObserver(position) : null;
    observer?.observe(boundary);
    observer?.observe(trigger);

    return { getMode: () => mode, getModel, getPreferredModels, setMode, setOpen, isOpen };
  }

  root.REELAY_AGENT_MODELS = Object.freeze({ createController });
})(globalThis);
