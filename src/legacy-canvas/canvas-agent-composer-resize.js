(function registerAgentComposerResize(global) {
  "use strict";

  const DEFAULT_HEIGHT = 240;
  const MIN_HEIGHT = 208;
  const MAX_HEIGHT = 420;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function createController({ document, panel, composer, stage, handle: suppliedHandle,
    onResizeStart = () => {}, onResize = () => {} }) {
    const view = document.defaultView;
    const handle = suppliedHandle || document.createElement("div");
    const ownHandle = !suppliedHandle;
    const previousHeight = composer.style.getPropertyValue("--agent-composer-height");
    let preferredHeight = DEFAULT_HEIGHT;
    let renderedHeight = DEFAULT_HEIGHT;
    let drag = null;
    let disposed = false;
    let observer;
    handle.classList.add("agent-composer-resize-handle");
    handle.setAttribute("role", "separator");
    handle.setAttribute("aria-orientation", "horizontal");
    handle.setAttribute("aria-label", "调整输入区高度");
    handle.setAttribute("aria-controls", stage.id || composer.id);
    handle.tabIndex = 0;
    handle.title = "拖动调整输入区高度；上下方向键微调；双击恢复默认";
    if (ownHandle) composer.prepend(handle);

    function available() {
      return !disposed && panel.isConnected && composer.isConnected && !panel.hidden
        && !panel.inert && panel.getAttribute("aria-hidden") !== "true";
    }
    function bounds() {
      const panelHeight = panel.getBoundingClientRect().height || panel.clientHeight;
      if (!panelHeight) return { min: MIN_HEIGHT, max: MAX_HEIGHT };
      const header = panel.querySelector(".agent-header");
      const headerHeight = header?.getBoundingClientRect().height || 52;
      const composerRect = composer.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      const chrome = Math.max(0, composerRect.height - stageRect.height);
      const style = view.getComputedStyle(composer);
      const margins = (Number.parseFloat(style.marginTop) || 0) + (Number.parseFloat(style.marginBottom) || 0);
      const physicalSpace = Math.max(0, panelHeight - headerHeight - chrome - margins);
      // Prefer an actual readable history area; very short panels prioritize
      // keeping the input controls reachable over the usual 208 px minimum.
      const historySpace = Math.min(160, Math.max(48, panelHeight * .2));
      const max = Math.max(0, Math.min(MAX_HEIGHT, Math.max(Math.min(160, physicalSpace), physicalSpace - historySpace)));
      return { min: Math.min(MIN_HEIGHT, max), max };
    }
    function apply(source) {
      const limits = bounds();
      const height = Math.round(clamp(preferredHeight, limits.min, limits.max));
      const changed = height !== renderedHeight || composer.style.getPropertyValue("--agent-composer-height") !== `${height}px`;
      renderedHeight = height;
      if (changed) composer.style.setProperty("--agent-composer-height", `${height}px`);
      handle.setAttribute("aria-valuemin", String(Math.round(limits.min)));
      handle.setAttribute("aria-valuemax", String(Math.round(limits.max)));
      handle.setAttribute("aria-valuenow", String(height));
      handle.setAttribute("aria-valuetext", `输入区高度 ${height} 像素`);
      if (changed) onResize(height, { source });
      return { ...limits, height };
    }
    function sync() {
      if (!available()) { if (drag) finish(false); return null; }
      return apply("layout");
    }
    function finish(commit) {
      if (!drag) return;
      const current = drag; drag = null;
      if (!commit) preferredHeight = current.preferredHeight;
      composer.classList.remove("is-resizing-composer");
      try {
        if (handle.hasPointerCapture?.(current.pointerId)) handle.releasePointerCapture(current.pointerId);
      } catch { /* Pointer capture may already be released by the browser. */ }
      apply(commit ? "commit" : "cancel");
    }
    function down(event) {
      if (!available() || drag || event.button !== 0 || event.isPrimary === false) return;
      event.preventDefault(); event.stopPropagation();
      onResizeStart();
      const current = apply("start");
      drag = { pointerId: event.pointerId, y: event.clientY, height: current.height, preferredHeight };
      composer.classList.add("is-resizing-composer");
      try { handle.setPointerCapture(event.pointerId); }
      catch { finish(false); }
    }
    function move(event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.preventDefault(); event.stopPropagation();
      if (!available()) { finish(false); return; }
      const limits = bounds();
      preferredHeight = clamp(drag.height + drag.y - event.clientY, limits.min, limits.max);
      apply("pointer");
    }
    function up(event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.preventDefault(); event.stopPropagation(); move(event); finish(true);
    }
    function cancel(event) {
      if (!drag || (event.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
      event.stopPropagation(); finish(false);
    }
    function keyboard(event) {
      if (event.key === "Escape" && drag) {
        event.preventDefault(); event.stopPropagation(); finish(false); return;
      }
      if (event.target !== handle || !available()) return;
      const step = event.shiftKey ? 48 : 16;
      const limits = bounds();
      const values = { ArrowUp: renderedHeight + step, ArrowDown: renderedHeight - step, Home: limits.min, End: limits.max };
      if (!Object.hasOwn(values, event.key)) return;
      event.preventDefault(); event.stopPropagation();
      onResizeStart(); preferredHeight = clamp(values[event.key], limits.min, limits.max); apply("keyboard");
    }
    function reset(event) {
      if (!available()) return;
      event.preventDefault(); event.stopPropagation(); finish(false);
      onResizeStart(); preferredHeight = DEFAULT_HEIGHT; apply("reset");
    }
    function blockClick(event) { event.stopPropagation(); }
    function blur() { finish(false); }
    handle.addEventListener("pointerdown", down);
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", cancel);
    handle.addEventListener("lostpointercapture", cancel);
    handle.addEventListener("dblclick", reset);
    handle.addEventListener("click", blockClick);
    // Consume an active resize cancellation before the panel's own Escape
    // handler can close the panel or collapse its advanced settings.
    document.addEventListener("keydown", keyboard, true);
    view.addEventListener("blur", blur);
    view.addEventListener("resize", sync);
    if (view.ResizeObserver) {
      observer = new view.ResizeObserver(sync);
      observer.observe(panel); observer.observe(composer);
    }
    sync();
    function close() { finish(false); }
    function dispose() {
      if (disposed) return;
      close(); disposed = true; observer?.disconnect();
      handle.removeEventListener("pointerdown", down); handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up); handle.removeEventListener("pointercancel", cancel);
      handle.removeEventListener("lostpointercapture", cancel); handle.removeEventListener("dblclick", reset);
      handle.removeEventListener("click", blockClick); document.removeEventListener("keydown", keyboard, true);
      view.removeEventListener("blur", blur); view.removeEventListener("resize", sync);
      if (previousHeight) composer.style.setProperty("--agent-composer-height", previousHeight);
      else composer.style.removeProperty("--agent-composer-height");
      if (ownHandle) handle.remove();
    }
    return Object.freeze({ sync, close, dispose });
  }
  global.REELAY_CANVAS_AGENT_COMPOSER_RESIZE = Object.freeze({ createController });
}(typeof globalThis === "object" ? globalThis : window));
