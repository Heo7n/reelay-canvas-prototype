(function registerDraftVideoController(root) {
  "use strict";

  let nextPopover = 0;
  // Reference layout: a 280px menu beside a 768px-wide node media frame.
  function getMediaRelativeScale(mediaWidth) {
    return Number.isFinite(mediaWidth) && mediaWidth > 0 ? mediaWidth / 768 : 1;
  }

  function renderTimingMarkup(sourceAsset) {
    const formatTime = (value) => Number.isFinite(value) ? new Date(value).toLocaleString("zh-CN", {
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }) : "—";
    return '<dl class="draft-video-timing"><div><dt>样片任务创建时间：</dt><dd data-draft-created>'
      + formatTime(sourceAsset?.generation?.createdAt) + '</dd></div><div><dt>正片生成截止时间：</dt><dd data-draft-expires>'
      + formatTime(sourceAsset?.generation?.expiresAt) + '</dd></div></dl>'
      + '<p class="draft-video-timing-note">逾期需重新生成样片</p>';
  }

  function createController({ document, getScope, isEditable, createFinalInput, onSubmit,
    placeAnchoredPopover = root.REELAY_CANVAS_POPOVER_PLACEMENT?.placeAnchoredPopover,
    showMessage = () => {}, now = () => Date.now() }) {
    const view = document.defaultView;
    const panel = document.createElement("div");
    panel.id = "draft-video-parameters-" + ++nextPopover;
    panel.className = "draft-video-popover";
    panel.setAttribute("popover", "manual");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "正片生成参数");
    panel.dataset.wheelScope = "local";
    panel.innerHTML = '<form class="draft-video-parameter-card"><div class="draft-video-resolution"><span class="draft-video-resolution-heading">分辨率</span><div class="draft-video-resolution-value" title="模拟预览，不实际提升画质或转码。" aria-description="模拟预览，不实际提升画质或转码。"><span data-draft-resolution></span></div></div>'
      + '<fieldset class="draft-video-formats"><legend>输出格式</legend><div data-draft-formats></div></fieldset>'
      + '<p class="draft-video-error" data-draft-error role="status" hidden></p>'
      + '<button type="submit" class="draft-video-submit"><span class="draft-video-cost"><img src="./assets/icons/credit-prism.svg" alt="" aria-hidden="true"><span data-draft-cost></span></span><span>生成</span></button></form>'
      + '<div class="draft-video-time-card"></div>';
    const form = panel.querySelector("form");
    const submitButton = panel.querySelector(".draft-video-submit");
    const error = panel.querySelector("[data-draft-error]");
    const timeCard = panel.querySelector(".draft-video-time-card");
    let active = null;
    let disposed = false;
    let submitting = false;
    let expiryTimer = 0;
    let observer = null;
    let frame = 0;
    let hoverTimer = 0;
    let closeTimer = 0;
    let pendingHover = null;
    let removalObserver = null;

    function clearHoverTimer() {
      view.clearTimeout(hoverTimer); hoverTimer = 0; pendingHover = null;
    }
    function keepOpen() { view.clearTimeout(closeTimer); closeTimer = 0; }
    function pin() {
      keepOpen();
      if (active) active.pinned = true;
    }
    function leave(anchor) {
      if (!anchor || pendingHover?.anchor === anchor) clearHoverTimer();
      if (!active || active.pinned || (anchor && active.anchor !== anchor)) return;
      keepOpen();
      closeTimer = view.setTimeout(() => close({ restoreFocus: false }), 220);
    }
    function hover(options) {
      if (disposed) return false;
      clearHoverTimer();
      if (active?.anchor === options.anchor) { keepOpen(); return true; }
      pendingHover = { ...options, scope: { ...(options.scope || getScope()) } };
      hoverTimer = view.setTimeout(() => {
        const request = pendingHover;
        clearHoverTimer();
        if (request) open({ ...request, hoverOnly: true });
      }, 150);
      return true;
    }

    function sameScope(scope, sourceSurface = "conversation") {
      const current = getScope();
      return Boolean(current && scope && current.projectId === scope.projectId
        && current.canvasId === scope.canvasId
        && (sourceSurface === "canvas" || current.conversationId === scope.conversationId));
    }
    function close({ restoreFocus = true } = {}) {
      clearHoverTimer(); keepOpen();
      removalObserver?.disconnect(); removalObserver = null;
      const returnFocus = active?.pinned;
      view.clearTimeout(expiryTimer); expiryTimer = 0;
      view.cancelAnimationFrame(frame); frame = 0;
      observer?.disconnect(); observer = null;
      const anchor = active?.anchor;
      active = null;
      if (panel.isConnected) { panel.hidePopover(); panel.remove(); }
      if (anchor) {
        anchor.setAttribute("aria-expanded", "false");
        anchor.removeAttribute("aria-controls");
      }
      if (restoreFocus && returnFocus && anchor?.isConnected && !anchor.disabled) anchor.focus({ preventScroll: true });
    }
    function position() {
      view.cancelAnimationFrame(frame); frame = 0;
      if (!active) return;
      if (!active.anchor.isConnected || !sameScope(active.scope, active.sourceSurface) || !isEditable()) { close({ restoreFocus: false }); return; }
      const anchor = active.anchor.getBoundingClientRect();
      const scroller = active.anchor.closest("#agentGenerationRecords");
      const clip = scroller?.getBoundingClientRect();
      const top = Math.max(0, clip?.top || 0);
      const bottom = Math.min(view.innerHeight, clip?.bottom ?? view.innerHeight);
      if (anchor.bottom <= top || anchor.top >= bottom || anchor.right <= 0 || anchor.left >= view.innerWidth) {
        close({ restoreFocus: false }); return;
      }
      const mediaWidth = active.sourceNodeId ? active.anchor.closest(".media-frame")?.getBoundingClientRect().width : 0;
      const scale = getMediaRelativeScale(mediaWidth);
      panel.style.transform = `scale(${scale})`;
      panel.style.width = Math.min(280, (view.innerWidth - 24) / scale) + "px";
      panel.style.maxHeight = (view.innerHeight - 24) / scale + "px";
      const placement = placeAnchoredPopover({ anchor, floating: panel.getBoundingClientRect(),
        boundary: { left: 0, top: 0, right: view.innerWidth, bottom: view.innerHeight },
        placements: active.sourceNodeId
          ? ["bottom-end", "top-end", "bottom-start", "top-start"]
          : ["top-start", "bottom-start", "top-end", "bottom-end"], gap: 8 * scale, padding: 12 });
      panel.style.left = placement.left + "px";
      panel.style.top = placement.top + "px";
      // Keep the parameters nearest the anchor even when viewport avoidance flips the pair.
      const above = placement.placement.startsWith("top");
      if (above && panel.firstElementChild !== timeCard) panel.prepend(timeCard);
      else if (!above && panel.lastElementChild !== timeCard) panel.append(timeCard);
    }
    function schedulePosition(event) {
      if (!active || panel.contains(event?.target)) return;
      if (!frame) frame = view.requestAnimationFrame(position);
    }
    function refresh() {
      if (pendingHover && (!sameScope(pendingHover.scope, pendingHover.sourceSurface) || !isEditable() || !pendingHover.anchor?.isConnected)) clearHoverTimer();
      if (!active || disposed) return null;
      if (!sameScope(active.scope, active.sourceSurface) || !isEditable() || !active.anchor.isConnected) { close({ restoreFocus: false }); return null; }
      const eligibility = root.REELAY_DRAFT_VIDEO.getFinalEligibility(active.sourceAsset,
        { projectId: active.scope.projectId, now: now() });
      let input = null;
      if (eligibility.eligible) {
        try { input = createFinalInput(active.sourceAsset, {
          outputFormat: form.querySelector('input[name="outputFormat"]:checked')?.value,
          scope: active.scope, sourceNodeId: active.sourceNodeId,
        }); } catch { /* An expired source cannot be submitted from an old open popover. */ }
      }
      const reason = !eligibility.eligible ? eligibility.reason : !input ? "当前无法生成正片，请稍后重试" : "";
      error.textContent = reason; error.hidden = !reason;
      submitButton.disabled = submitting || !input;
      panel.querySelector("[data-draft-cost]").textContent = input ? String(input.cost) : "—";
      submitButton.setAttribute("aria-label", input ? "生成正片，消耗 " + input.cost + " 积分" : "生成正片");
      timeCard.innerHTML = renderTimingMarkup(active.sourceAsset);
      view.clearTimeout(expiryTimer); expiryTimer = 0;
      if (eligibility.eligible && eligibility.expiresAt > now()) {
        expiryTimer = view.setTimeout(refresh, Math.min(2147483647, eligibility.expiresAt - now() + 1));
      }
      schedulePosition();
      return input;
    }
    function open({ sourceAsset, scope = getScope(), sourceNodeId = "", sourceSurface = sourceNodeId ? "canvas" : "conversation", anchor = document.activeElement, hoverOnly = false }) {
      if (disposed || !sourceAsset || !scope || !sameScope(scope, sourceSurface) || !isEditable() || !anchor?.isConnected) return false;
      clearHoverTimer(); keepOpen();
      if (active?.anchor === anchor) {
        if (hoverOnly) return true;
        if (!active.pinned) {
          pin(); form.querySelector("input:checked")?.focus({ preventScroll: true });
        } else close();
        return true;
      }
      close({ restoreFocus: false });
      const model = root.REELAY_MODEL_DIRECTORY.find((entry) => entry.id === sourceAsset.generation?.input.modelId);
      const formats = model?.capabilities.outputFormats || [];
      if (!formats.length || !model.capabilities.draftConversion) return false;
      active = { sourceAsset, scope: { ...scope }, sourceNodeId, sourceSurface, anchor, pinned: !hoverOnly };
      panel.querySelector("[data-draft-resolution]").textContent = model.capabilities.draftConversion.quality.toUpperCase();
      const options = panel.querySelector("[data-draft-formats]");
      options.replaceChildren();
      const originalFormat = sourceAsset.generation.input.parameters.outputFormat;
      const selected = formats.includes(originalFormat) ? originalFormat : formats[0];
      for (const value of formats) {
        const label = document.createElement("label");
        const input = document.createElement("input");
        input.type = "radio"; input.name = "outputFormat"; input.value = value; input.checked = value === selected;
        const text = document.createElement("span"); text.textContent = value.toUpperCase();
        label.append(input, text); options.append(label);
      }
      document.body.append(panel);
      if (!refresh() && !active) return false;
      anchor.setAttribute("aria-haspopup", "dialog");
      anchor.setAttribute("aria-controls", panel.id);
      anchor.setAttribute("aria-expanded", "true");
      panel.showPopover(); position();
      if (!active) return false;
      if (view.ResizeObserver) {
        observer = new view.ResizeObserver(schedulePosition);
        observer.observe(panel); observer.observe(anchor);
        const mediaFrame = sourceNodeId && anchor.closest(".media-frame");
        if (mediaFrame) observer.observe(mediaFrame);
      }
      if (view.MutationObserver) {
        removalObserver = new view.MutationObserver(() => {
          if (active && !active.anchor.isConnected) close({ restoreFocus: false });
        });
        removalObserver.observe(document.body, { childList: true, subtree: true });
      }
      if (!hoverOnly) form.querySelector("input:checked")?.focus({ preventScroll: true });
      return true;
    }
    function submit(event) {
      event.preventDefault();
      if (submitting || !active) return;
      const input = refresh();
      if (!input || !active) return;
      submitting = true; submitButton.disabled = true;
      try {
        const task = onSubmit(input, { ...active });
        if (task) close();
        else { error.textContent = "未提交，请检查积分或样片状态后重试"; error.hidden = false; }
      } catch { showMessage("本次生成未提交，请稍后重试"); }
      finally { submitting = false; if (active) { submitButton.disabled = false; schedulePosition(); } }
    }
    function pointerOutside(event) {
      if (pendingHover && !pendingHover.anchor.contains(event.target)) clearHoverTimer();
      if (active && !panel.contains(event.target) && !active.anchor.contains(event.target)) close({ restoreFocus: false });
    }
    function focusOutside(event) {
      if (pendingHover && !pendingHover.anchor.contains(event.target) && !panel.contains(event.target)) clearHoverTimer();
      if (active && !panel.contains(event.target) && !active.anchor.contains(event.target)) close({ restoreFocus: false });
    }
    function keydown(event) {
      if (event.key === "Escape") clearHoverTimer();
      if (active && event.key === "Escape") {
        event.preventDefault(); event.stopPropagation(); close();
      }
    }
    function contain(event) { event.stopPropagation(); }
    function containsNodeInteraction(nodeId, target) {
      return Boolean(nodeId && active?.sourceNodeId === nodeId && panel.contains(target));
    }
    const listeners = [
      [form, "submit", submit], [form, "change", refresh],
      [panel, "pointerdown", contain], [panel, "pointerdown", pin], [panel, "click", contain],
      [panel, "pointerenter", keepOpen], [panel, "pointerleave", () => leave()], [panel, "focusin", pin],
      [panel, "keydown", contain], [panel, "keyup", contain],
      [document, "pointerdown", pointerOutside, true], [document, "focusin", focusOutside],
      [document, "keydown", keydown, true], [document, "scroll", schedulePosition, true],
      [view, "resize", schedulePosition],
    ];
    for (const [target, name, listener, capture] of listeners) target.addEventListener(name, listener, capture);
    return Object.freeze({ open, hover, leave, refresh, close, containsNodeInteraction, reposition: schedulePosition, dispose() {
      if (disposed) return;
      close({ restoreFocus: false }); disposed = true;
      for (const [target, name, listener, capture] of listeners) target.removeEventListener(name, listener, capture);
    } });
  }
  root.REELAY_DRAFT_VIDEO_CONTROLLER = Object.freeze({ createController, renderTimingMarkup, getMediaRelativeScale });
})(globalThis);
