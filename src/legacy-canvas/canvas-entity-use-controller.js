(function registerCanvasEntityUseController(root) {
  "use strict";

  function createCanvasEntityUseController(options = {}) {
    const { grid, detailPortal, pickerPortal, background, view } = options;
    if (!grid || !detailPortal || !pickerPortal || !view?.renderEntityDetail || !view?.renderEntityPicker) {
      throw new TypeError("Canvas Entity use controller dependencies are incomplete.");
    }
    for (const name of ["getScope", "getDetailContext", "getDetailEntity", "getPickerEntities", "isTargetAvailable", "isMutable", "requireMutation", "getPickerTrigger", "onAddEntities", "onAddToCanvas"]) {
      if (typeof options[name] !== "function") throw new TypeError(`${name} must be a function.`);
    }
    const document = grid.ownerDocument;
    const window = document.defaultView;
    const refreshIcons = options.refreshIcons || (() => undefined);
    const listeners = [];
    const frames = new Map();
    let disposed = false;
    let detail = null;
    let pendingDetail = null;
    let openTimer = 0;
    let closeTimer = 0;
    let picker = null;
    let previousBackground = null;
    let restoringDetailFocus = false;

    function listen(target, event, callback, settings) {
      target.addEventListener(event, callback, settings);
      listeners.push(() => target.removeEventListener(event, callback, settings));
    }

    function cancelFrame(name) {
      if (frames.has(name)) window.cancelAnimationFrame(frames.get(name));
      frames.delete(name);
    }

    function scheduleFrame(name, callback) {
      cancelFrame(name);
      const id = window.requestAnimationFrame(() => {
        if (frames.get(name) !== id || disposed) return;
        frames.delete(name);
        callback();
      });
      frames.set(name, id);
    }

    function captureScope() {
      const scope = options.getScope();
      return Object.freeze({ projectId: scope.projectId, canvasId: scope.canvasId });
    }

    function isCurrentScope(scope) {
      const current = options.getScope();
      return scope.projectId === current.projectId && scope.canvasId === current.canvasId;
    }

    function findCard(entityId) {
      return [...grid.querySelectorAll("[data-library-entity]")]
        .find((element) => element.dataset.libraryEntity === entityId) || null;
    }

    function clearCloseTimer() {
      window.clearTimeout(closeTimer);
      closeTimer = 0;
    }

    function clearDetailTimers() {
      window.clearTimeout(openTimer);
      openTimer = 0;
      pendingDetail = null;
      clearCloseTimer();
    }

    function isDetailAvailable(session) {
      if (!session || disposed || picker || !isCurrentScope(session.scope)) return false;
      const context = options.getDetailContext();
      return context.eligible && context.space === session.space && Boolean(findCard(session.entityId));
    }

    function closeDetail({ restoreFocus = false } = {}) {
      const previous = detail;
      clearDetailTimers();
      cancelFrame("detail-render");
      cancelFrame("detail-focus");
      detail = null;
      view.syncEntityDetailPortal(detailPortal, { visible: false });
      detailPortal.innerHTML = "";
      if (restoreFocus && previous && !disposed) {
        scheduleFrame("detail-focus", () => {
          if (picker || detail || !isCurrentScope(previous.scope)) return;
          const context = options.getDetailContext();
          if (!context.eligible || context.space !== previous.space) return;
          restoringDetailFocus = true;
          try {
            findCard(previous.entityId)?.querySelector(".asset-library-card-preview")?.focus({ preventScroll: true });
          } finally {
            restoringDetailFocus = false;
          }
        });
      }
    }

    function renderDetail() {
      if (!detail) return;
      if (!isDetailAvailable(detail)) return closeDetail();
      const entity = options.getDetailEntity(detail.entityId, detail.space);
      if (!entity) return closeDetail();
      const anchorRect = findCard(detail.entityId).getBoundingClientRect();
      const placement = view.computeDetailPlacement({
        viewportRect: { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight },
        anchorRect,
        sourceRect: anchorRect,
        avoidRects: options.getAvoidRects?.() || [],
        panelWidth: 340,
        panelHeight: 454,
        gap: 10,
        margin: 12,
      });
      detailPortal.innerHTML = view.renderEntityDetail({ entity, media: entity.media, pinned: detail.pinned, placement, canAdd: options.isMutable() });
      view.syncEntityDetailPortal(detailPortal, { visible: true, pinned: detail.pinned, placement });
      refreshIcons();
    }

    function openDetail(entityId, { pinned = false, delay = 0 } = {}) {
      if (disposed || restoringDetailFocus || (detail?.pinned && !pinned)) return;
      const session = { entityId, pinned: Boolean(pinned), scope: captureScope(), space: options.getDetailContext().space };
      if (!isDetailAvailable(session)) return;
      clearDetailTimers();
      cancelFrame("detail-focus");
      cancelFrame("picker-focus");
      pendingDetail = session;
      const open = () => {
        openTimer = 0;
        if (pendingDetail !== session) return;
        pendingDetail = null;
        if (!isDetailAvailable(session)) return;
        detail = session;
        renderDetail();
      };
      if (delay > 0) openTimer = window.setTimeout(open, delay);
      else open();
    }

    function scheduleDetailClose(delay = 170) {
      window.clearTimeout(openTimer);
      openTimer = 0;
      pendingDetail = null;
      if (detail?.pinned) return;
      clearCloseTimer();
      closeTimer = window.setTimeout(() => {
        closeTimer = 0;
        if (!detail?.pinned) closeDetail();
      }, delay);
    }

    function isolateBackground(active) {
      if (!background) return;
      if (active) {
        if (previousBackground) return;
        previousBackground = { inert: background.inert, ariaHidden: background.getAttribute("aria-hidden") };
        background.inert = true;
        background.setAttribute("aria-hidden", "true");
      } else if (previousBackground) {
        background.inert = previousBackground.inert;
        if (previousBackground.ariaHidden == null) background.removeAttribute("aria-hidden");
        else background.setAttribute("aria-hidden", previousBackground.ariaHidden);
        previousBackground = null;
      }
    }

    function closePicker({ restoreFocus = true } = {}) {
      const previous = picker;
      picker = null;
      cancelFrame("picker-focus");
      view.syncEntityPickerPortal(pickerPortal, { visible: false });
      pickerPortal.innerHTML = "";
      isolateBackground(false);
      if (!restoreFocus || !previous || disposed) return;
      scheduleFrame("picker-focus", () => {
        if (picker || detail || !isCurrentScope(previous.scope)) return;
        const trigger = options.getPickerTrigger(previous.nodeId);
        if (trigger?.isConnected) trigger.focus({ preventScroll: true });
        else if (previous.returnFocus?.isConnected) previous.returnFocus.focus({ preventScroll: true });
      });
    }

    function validatePicker() {
      if (!picker || disposed) return false;
      if (!isCurrentScope(picker.scope) || !options.isMutable() || !options.isTargetAvailable(picker.nodeId)) {
        closePicker({ restoreFocus: false });
        return false;
      }
      return true;
    }

    function readSearch(input) {
      picker.query = input.value;
      picker.selectionStart = input.selectionStart;
      picker.selectionEnd = input.selectionEnd;
    }

    function renderPicker({ focusSearch = false } = {}) {
      if (!validatePicker() || picker.composing) return;
      const activeSearch = document.activeElement;
      if (pickerPortal.contains(activeSearch) && activeSearch.matches("[data-entity-use-search]")) {
        // External refreshes must retain the current caret, including navigation within the input.
        if (!focusSearch) readSearch(activeSearch);
        focusSearch = true;
      }
      const session = picker;
      cancelFrame("picker-focus");
      pickerPortal.innerHTML = view.renderEntityPicker({
        entities: options.getPickerEntities(), space: session.space, query: session.query,
        selectedIds: session.selectedIds, canAdd: true,
      });
      view.syncEntityPickerPortal(pickerPortal, { visible: true });
      refreshIcons();
      if (focusSearch) scheduleFrame("picker-focus", () => {
        if (picker !== session || !validatePicker()) return;
        const input = pickerPortal.querySelector("[data-entity-use-search]");
        if (!(input instanceof window.HTMLInputElement)) return;
        input.focus({ preventScroll: true });
        const start = Math.min(session.selectionStart ?? input.value.length, input.value.length);
        const end = Math.min(session.selectionEnd ?? start, input.value.length);
        input.setSelectionRange(start, end);
      });
    }

    function openPicker(nodeId) {
      if (disposed || !options.requireMutation() || !options.isTargetAvailable(nodeId)) return false;
      const returnFocus = picker?.returnFocus || document.activeElement;
      closeDetail();
      cancelFrame("picker-focus");
      picker = {
        nodeId, scope: captureScope(), space: "personal", query: "", selectedIds: new Set(), selectedSpaces: new Map(),
        composing: false, selectionStart: 0, selectionEnd: 0,
        returnFocus: returnFocus instanceof window.HTMLElement ? returnFocus : null,
      };
      isolateBackground(true);
      renderPicker({ focusSearch: true });
      return true;
    }

    function submitPicker() {
      if (!validatePicker() || !picker.selectedIds.size || !options.requireMutation()) return;
      const submission = Object.freeze({
        scope: picker.scope,
        nodeId: picker.nodeId,
        selections: Object.freeze([...picker.selectedIds].map((entityId) => Object.freeze({ entityId, space: picker.selectedSpaces.get(entityId) }))),
      });
      // End the UI session before dispatch so repeated events cannot submit it twice.
      closePicker();
      options.onAddEntities(submission);
    }

    function refreshDetail() {
      if (disposed) return;
      if (pendingDetail && !isDetailAvailable(pendingDetail)) clearDetailTimers();
      if (!detail) return;
      if (!isDetailAvailable(detail)) closeDetail();
      else scheduleFrame("detail-render", renderDetail);
    }

    function refresh({ renderPicker: shouldRenderPicker = false } = {}) {
      if (disposed) return;
      if (validatePicker() && shouldRenderPicker) renderPicker();
      refreshDetail();
    }

    function handleGlobalKeyDown(event) {
      if (disposed) return false;
      if (picker) {
        if (event.key === "Escape") {
          event.preventDefault();
          closePicker();
        }
        return true;
      }
      if (event.key === "Escape" && detail?.pinned) {
        event.preventDefault();
        closeDetail({ restoreFocus: true });
        return true;
      }
      return false;
    }

    function cardFromEvent(event) {
      return event.target instanceof window.Element ? event.target.closest("[data-library-entity]") : null;
    }

    function movedWithin(event, element) {
      return event.relatedTarget instanceof window.Node && element.contains(event.relatedTarget);
    }

    listen(grid, "pointerover", (event) => {
      const card = cardFromEvent(event);
      if (card && !movedWithin(event, card)) openDetail(card.dataset.libraryEntity, { delay: 130 });
    });
    listen(grid, "pointerout", (event) => {
      const card = cardFromEvent(event);
      if (card && !movedWithin(event, card) && !movedWithin(event, detailPortal)) scheduleDetailClose();
    });
    listen(grid, "focusin", (event) => {
      const card = cardFromEvent(event);
      if (card) openDetail(card.dataset.libraryEntity);
    });
    listen(grid, "focusout", (event) => {
      const card = cardFromEvent(event);
      if (card && !movedWithin(event, card) && !movedWithin(event, detailPortal)) scheduleDetailClose();
    });
    listen(grid, "scroll", () => {
      if (detail?.pinned) renderDetail();
      else closeDetail();
    }, { passive: true });
    listen(detailPortal, "pointerenter", clearCloseTimer);
    listen(detailPortal, "pointerleave", () => scheduleDetailClose());
    listen(detailPortal, "focusin", clearCloseTimer);
    listen(detailPortal, "focusout", (event) => {
      if (!movedWithin(event, detailPortal)) scheduleDetailClose();
    });
    listen(detailPortal, "pointerdown", (event) => event.stopPropagation());
    listen(detailPortal, "click", (event) => {
      event.stopPropagation();
      if (!(event.target instanceof window.Element)) return;
      if (event.target.closest("[data-entity-use-detail-close]")) return closeDetail({ restoreFocus: true });
      const addButton = event.target.closest("[data-entity-use-add-canvas]");
      if (!addButton || addButton.disabled || !detail) return;
      if (!isDetailAvailable(detail)) return closeDetail();
      if (!options.requireMutation()) return;
      const submission = Object.freeze({ scope: detail.scope, entityId: detail.entityId, space: detail.space });
      if (options.onAddToCanvas(submission)) closeDetail();
    });
    listen(detailPortal, "keydown", (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closeDetail({ restoreFocus: true });
    });
    listen(pickerPortal, "pointerdown", (event) => event.stopPropagation());
    listen(pickerPortal, "click", (event) => {
      event.stopPropagation();
      if (!(event.target instanceof window.Element) || !validatePicker()) return;
      if (event.target.matches("[data-entity-use-picker-backdrop]")) return closePicker();
      const button = event.target.closest("[data-entity-use-action]");
      if (!button || button.disabled) return;
      const action = button.dataset.entityUseAction;
      if (action === "close-picker" || action === "cancel-picker") return closePicker();
      if (action === "change-space") {
        picker.space = button.dataset.entityUseSpace === "organization" ? "organization" : "personal";
        renderPicker();
      } else if (action === "clear-search") {
        picker.query = "";
        picker.selectionStart = 0;
        picker.selectionEnd = 0;
        renderPicker({ focusSearch: true });
      } else if (action === "toggle-entity") {
        const entityId = button.dataset.entityUseToggle;
        if (!entityId) return;
        if (picker.selectedIds.has(entityId)) {
          picker.selectedIds.delete(entityId);
          picker.selectedSpaces.delete(entityId);
        } else {
          picker.selectedIds.add(entityId);
          picker.selectedSpaces.set(entityId, picker.space);
        }
        renderPicker();
      } else if (action === "add-entities") submitPicker();
    });
    listen(pickerPortal, "input", (event) => {
      if (!picker || !event.target.matches("[data-entity-use-search]")) return;
      readSearch(event.target);
      if (!event.isComposing && !picker.composing) renderPicker({ focusSearch: true });
    });
    listen(pickerPortal, "compositionstart", (event) => {
      if (picker && event.target.matches("[data-entity-use-search]")) {
        picker.composing = true;
        cancelFrame("picker-focus");
      }
    });
    listen(pickerPortal, "compositionend", (event) => {
      if (!picker || !event.target.matches("[data-entity-use-search]")) return;
      picker.composing = false;
      readSearch(event.target);
      renderPicker({ focusSearch: true });
    });
    listen(pickerPortal, "keydown", (event) => {
      if (!picker) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        return closePicker();
      }
      if (event.key !== "Tab") return;
      const focusable = [...pickerPortal.querySelectorAll("button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex='-1'])")]
        .filter((element) => element.getClientRects().length);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first && event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (last && !event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    function dispose() {
      if (disposed) return;
      disposed = true;
      closeDetail();
      closePicker({ restoreFocus: false });
      for (const name of frames.keys()) cancelFrame(name);
      listeners.splice(0).forEach((remove) => remove());
    }

    listen(window, "pagehide", (event) => {
      if (!event.persisted) dispose();
    });

    return Object.freeze({ openDetail, closeDetail, openPicker, closePicker, refresh, refreshDetail, handleGlobalKeyDown, dispose });
  }

  root.REELAY_CANVAS_ENTITY_USE_CONTROLLER = Object.freeze({ createCanvasEntityUseController });
})(typeof window === "undefined" ? globalThis : window);
