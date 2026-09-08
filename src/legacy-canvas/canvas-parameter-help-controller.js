(function registerCanvasParameterHelp(root) {
  "use strict";

  let nextTooltipId = 0;

  function createController({ document, placeAnchoredPopover }) {
    const view = document.defaultView;
    const tooltip = document.createElement("div");
    const title = document.createElement("strong");
    tooltip.id = `parameter-help-tooltip-${++nextTooltipId}`;
    tooltip.className = "parameter-help-tooltip";
    tooltip.setAttribute("role", "tooltip");
    title.className = "parameter-help-tooltip-title";

    let active = null;
    let hovered = null;
    let focused = null;
    let tooltipHovered = false;
    let showTimer = 0;
    let hideTimer = 0;
    let frame = 0;
    let disposed = false;

    function findTrigger(target) {
      return target?.closest?.("button[data-parameter-help]") || null;
    }

    function clearTimers() {
      view.clearTimeout(showTimer);
      view.clearTimeout(hideTimer);
      showTimer = 0;
      hideTimer = 0;
    }

    function releaseDescription() {
      if (!active) return;
      const ids = (active.getAttribute("aria-describedby") || "").split(/\s+/)
        .filter((id) => id && id !== tooltip.id);
      if (ids.length) active.setAttribute("aria-describedby", ids.join(" "));
      else active.removeAttribute("aria-describedby");
    }

    function close() {
      clearTimers();
      view.cancelAnimationFrame(frame);
      frame = 0;
      releaseDescription();
      active = null;
      hovered = null;
      focused = null;
      tooltipHovered = false;
      tooltip.remove();
    }

    function visibleAnchor(trigger) {
      if (!trigger.isConnected || trigger.disabled) return null;
      const anchor = trigger.getBoundingClientRect();
      if (!anchor.width || !anchor.height) return null;
      const clip = { left: 0, top: 0, right: view.innerWidth, bottom: view.innerHeight };
      for (let element = trigger; element; element = element.parentElement) {
        const style = view.getComputedStyle(element);
        if (element.hidden || element.inert || style.display === "none"
          || style.visibility === "hidden" || style.visibility === "collapse"
          || style.opacity === "0") return null;
        if (element === trigger) continue;
        const clipsX = /^(auto|scroll|hidden|clip)$/.test(style.overflowX || style.overflow);
        const clipsY = /^(auto|scroll|hidden|clip)$/.test(style.overflowY || style.overflow);
        if (!clipsX && !clipsY) continue;
        const bounds = element.getBoundingClientRect();
        if (clipsX) { clip.left = Math.max(clip.left, bounds.left); clip.right = Math.min(clip.right, bounds.right); }
        if (clipsY) { clip.top = Math.max(clip.top, bounds.top); clip.bottom = Math.min(clip.bottom, bounds.bottom); }
      }
      if (anchor.bottom <= clip.top || anchor.top >= clip.bottom
        || anchor.right <= clip.left || anchor.left >= clip.right) return null;
      return anchor;
    }

    function position() {
      if (!active || !visibleAnchor(active)) { close(); return false; }
      const panel = active.closest(".agent-param-menu") || active.closest(".param-panel");
      const anchor = panel?.getBoundingClientRect();
      if (!anchor?.width || !anchor.height) { close(); return false; }
      tooltip.style.width = `${Math.min(anchor.width, Math.max(0, view.innerWidth - 24))}px`;
      tooltip.style.maxHeight = `${Math.max(0, view.innerHeight - 24)}px`;
      const placement = placeAnchoredPopover({
        anchor,
        floating: tooltip.getBoundingClientRect(),
        boundary: { left: 0, top: 0, right: view.innerWidth, bottom: view.innerHeight },
        placements: ["top-start", "bottom-start"],
        gap: 8,
        padding: 12,
      });
      if (!placement) { close(); return false; }
      tooltip.style.left = `${placement.left}px`;
      tooltip.style.top = `${placement.top}px`;
      tooltip.dataset.placement = placement.placement;
      return true;
    }

    function followAnchor() {
      frame = 0;
      if (position()) frame = view.requestAnimationFrame(followAnchor);
    }

    function open(trigger) {
      if (disposed || !visibleAnchor(trigger)) return;
      let items;
      try { items = JSON.parse(trigger.dataset.helpItems || "[]"); }
      catch { return; }
      if (!Array.isArray(items) || !items.length || items.some((item) =>
        !item || typeof item.title !== "string" || typeof item.description !== "string")) return;
      clearTimers();
      if (active !== trigger) releaseDescription();
      active = trigger;
      title.textContent = trigger.dataset.helpTitle || "";
      tooltip.replaceChildren(title, ...items.map((item) => {
        const section = document.createElement("div");
        const mode = document.createElement("strong");
        const description = document.createElement("p");
        section.className = "parameter-help-tooltip-section";
        mode.className = "parameter-help-tooltip-mode";
        description.className = "parameter-help-tooltip-description";
        mode.textContent = item.title;
        description.textContent = item.description;
        section.append(mode, description);
        return section;
      }));
      const ids = new Set((trigger.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean));
      ids.add(tooltip.id);
      trigger.setAttribute("aria-describedby", [...ids].join(" "));
      if (!tooltip.isConnected) document.body.append(tooltip);
      if (position() && !frame) frame = view.requestAnimationFrame(followAnchor);
    }

    function keepOpen() {
      return active && (hovered === active || focused === active || tooltipHovered);
    }

    function scheduleClose() {
      view.clearTimeout(hideTimer);
      hideTimer = 0;
      if (active && !keepOpen()) hideTimer = view.setTimeout(close, 160);
    }

    function onPointerOver(event) {
      if (tooltip.contains(event.target)) {
        tooltipHovered = true;
        view.clearTimeout(hideTimer);
        hideTimer = 0;
        return;
      }
      const trigger = findTrigger(event.target);
      if (!trigger || trigger.contains(event.relatedTarget)) return;
      hovered = trigger;
      view.clearTimeout(showTimer);
      view.clearTimeout(hideTimer);
      hideTimer = 0;
      if (active === trigger) return;
      showTimer = view.setTimeout(() => { showTimer = 0; if (hovered === trigger) open(trigger); }, 220);
    }

    function onPointerOut(event) {
      const trigger = findTrigger(event.target);
      if (trigger && !trigger.contains(event.relatedTarget)) {
        if (hovered === trigger) hovered = null;
        view.clearTimeout(showTimer);
        showTimer = 0;
      } else if (!tooltip.contains(event.target) || tooltip.contains(event.relatedTarget)) return;
      tooltipHovered = tooltip.contains(event.relatedTarget);
      const nextTrigger = findTrigger(event.relatedTarget);
      if (nextTrigger === active) hovered = nextTrigger;
      scheduleClose();
    }

    function onFocusIn(event) {
      const trigger = findTrigger(event.target);
      if (!trigger) return;
      focused = trigger;
      open(trigger);
    }

    function onFocusOut(event) {
      const trigger = findTrigger(event.target);
      if (!trigger || trigger.contains(event.relatedTarget)) return;
      if (focused === trigger) focused = null;
      scheduleClose();
    }

    function onPointerDown(event) {
      if (findTrigger(event.target) || tooltip.contains(event.target)) event.stopPropagation();
    }

    function onClick(event) {
      const trigger = findTrigger(event.target);
      if (trigger || tooltip.contains(event.target)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (trigger) open(trigger);
      } else close();
    }

    function onKeyDown(event) {
      if (event.key !== "Escape") return;
      if (active) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      close();
    }

    const listeners = [
      ["pointerover", onPointerOver, false], ["pointerout", onPointerOut, false],
      ["focusin", onFocusIn, false], ["focusout", onFocusOut, false],
      ["pointerdown", onPointerDown, true], ["click", onClick, true], ["keydown", onKeyDown, true],
    ];
    listeners.forEach(([type, listener, capture]) => document.addEventListener(type, listener, capture));
    function onPageHide(event) {
      if (event.persisted) close();
      else dispose();
    }
    view.addEventListener("pagehide", onPageHide);

    function dispose() {
      if (disposed) return;
      disposed = true;
      close();
      listeners.forEach(([type, listener, capture]) => document.removeEventListener(type, listener, capture));
      view.removeEventListener("pagehide", onPageHide);
    }

    return Object.freeze({ close, dispose });
  }

  root.REELAY_CANVAS_PARAMETER_HELP = Object.freeze({ createController });
}(typeof globalThis === "object" ? globalThis : window));
