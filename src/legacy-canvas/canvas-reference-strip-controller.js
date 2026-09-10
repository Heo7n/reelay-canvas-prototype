(function registerCanvasReferenceStrip(global) {
  "use strict";

  let nextPreviewId = 0;

  function createController({ document, root, placeAnchoredPopover, getContext, onMove, isSpaceDown = () => false,
    isCardEligible = (card) => Boolean(card.closest(".canvas-node[data-id]")) }) {
    const view = document.defaultView;
    const preview = document.createElement("div");
    preview.id = `reference-preview-${++nextPreviewId}`;
    preview.className = "reference-preview-popover";
    preview.setAttribute("role", "dialog");
    preview.setAttribute("aria-modal", "false");
    preview.dataset.wheelScope = "local";
    let active = null;
    let hovered = null;
    let focused = null;
    let previewHovered = false;
    let showTimer = 0;
    let hideTimer = 0;
    let frame = 0;
    let drag = null;
    let suppressClick = false;
    let clickTimer = 0;
    let disposed = false;

    function findCard(target) {
      const card = target?.closest?.("[data-reference-key]");
      return card && root.contains(card) && (card.closest(".asset-shelf") || card.matches(".prompt-reference"))
        && isCardEligible(card) ? card : null;
    }

    function isInlineReference(card) { return card?.matches(".prompt-reference"); }

    function isControl(target, card) {
      const control = target?.closest?.("button, input, textarea, select, a, [data-reference-remove]");
      return control && control !== card;
    }

    function read(card) {
      if (!card?.isConnected || !root.contains(card)) return null;
      if (isInlineReference(card) && (card.classList.contains("is-missing")
        || card.closest('.prompt-editor[data-reference-menu-open="true"]'))) return null;
      const context = getContext(card);
      const entry = context?.entries?.find((item) => item.key === card.dataset.referenceKey);
      return context?.scope && context.node && entry ? { context, entry } : null;
    }

    function sameContext(before, after) {
      return after && before.scope === after.scope && before.node === after.node
        && before.nodeId === after.nodeId;
    }

    function visibleBounds(element) {
      const bounds = element.getBoundingClientRect();
      if (!element.isConnected || !bounds.width || !bounds.height) return null;
      const clip = { left: 0, top: 0, right: view.innerWidth, bottom: view.innerHeight };
      for (let parent = element; parent; parent = parent.parentElement) {
        const style = view.getComputedStyle(parent);
        if (parent.hidden || parent.inert || style.display === "none" || style.visibility === "hidden"
          || style.visibility === "collapse" || style.opacity === "0") return null;
        if (parent === element) continue;
        const rect = parent.getBoundingClientRect();
        if (/^(auto|scroll|hidden|clip)$/.test(style.overflowX || style.overflow)) {
          clip.left = Math.max(clip.left, rect.left); clip.right = Math.min(clip.right, rect.right);
        }
        if (/^(auto|scroll|hidden|clip)$/.test(style.overflowY || style.overflow)) {
          clip.top = Math.max(clip.top, rect.top); clip.bottom = Math.min(clip.bottom, rect.bottom);
        }
      }
      const visible = {
        left: Math.max(clip.left, bounds.left), top: Math.max(clip.top, bounds.top),
        right: Math.min(clip.right, bounds.right), bottom: Math.min(clip.bottom, bounds.bottom),
      };
      return visible.right > visible.left && visible.bottom > visible.top ? { bounds, visible } : null;
    }

    function clearTimers() {
      view.clearTimeout(showTimer); view.clearTimeout(hideTimer);
      showTimer = 0; hideTimer = 0;
    }

    function closePreview() {
      clearTimers();
      if (active) {
        active.card.removeAttribute("aria-controls");
        active.card.removeAttribute("aria-expanded");
      }
      active = null; hovered = null; focused = null; previewHovered = false;
      releaseMedia();
      preview.replaceChildren();
      preview.remove();
      stopIdleFrame();
    }

    function releaseMedia() {
      for (const media of preview.querySelectorAll("video, audio")) {
        media.pause(); media.removeAttribute("src"); media.load();
      }
    }

    function stopIdleFrame() {
      if (!active && !drag && frame) { view.cancelAnimationFrame(frame); frame = 0; }
    }

    function ensureFrame() {
      if (!frame && (active || drag)) frame = view.requestAnimationFrame(follow);
    }

    function positionPreview() {
      const current = active && read(active.card);
      const anchor = active && visibleBounds(active.card);
      if (!current || !anchor || !sameContext(active.context, current.context)
        || active.url !== (current.entry.asset?.url || "") || active.type !== current.entry.asset?.type) {
        closePreview(); return;
      }
      preview.style.maxWidth = `${Math.max(0, view.innerWidth - 24)}px`;
      preview.style.maxHeight = `${Math.max(0, view.innerHeight - 24)}px`;
      const placement = placeAnchoredPopover({
        anchor: anchor.bounds, floating: preview.getBoundingClientRect(),
        boundary: { left: 0, top: 0, right: view.innerWidth, bottom: view.innerHeight },
        placements: ["top", "bottom"], gap: 8, padding: 12,
      });
      if (!placement) { closePreview(); return; }
      preview.style.left = `${placement.left}px`;
      preview.style.top = `${placement.top}px`;
      preview.dataset.placement = placement.placement;
    }

    function openPreview(card) {
      const current = read(card);
      if (disposed || drag || !current || !visibleBounds(card)) return;
      clearTimers();
      if (active?.card === card) { positionPreview(); return; }
      if (active) {
        active.card.removeAttribute("aria-controls"); active.card.removeAttribute("aria-expanded");
      }
      const { asset = {}, label = "参考素材" } = current.entry;
      active = { context: { ...current.context }, card, url: asset.url || "", type: asset.type };
      const caption = document.createElement("div");
      caption.className = "reference-preview-label";
      caption.textContent = label;
      let media;
      if (asset.url && ["image", "video", "audio"].includes(asset.type)) {
        media = document.createElement(asset.type === "image" ? "img" : asset.type);
        media.className = `reference-preview-media reference-preview-${asset.type}`;
        if (asset.type === "image") { media.alt = label; media.draggable = false; }
        else { media.controls = true; media.preload = "metadata"; media.autoplay = false; }
        if (asset.type === "video") media.playsInline = true;
        media.src = asset.url;
      } else {
        media = document.createElement("div");
        media.className = "reference-preview-empty";
        media.textContent = asset.type === "text" ? (asset.text || "文本参考") : "暂无可预览内容";
      }
      preview.setAttribute("aria-label", `${label}预览`);
      const imageOnly = media.tagName === "IMG";
      preview.classList.toggle("reference-image-preview", imageOnly);
      releaseMedia();
      preview.replaceChildren(...(imageOnly ? [media] : [media, caption]));
      card.setAttribute("aria-controls", preview.id); card.setAttribute("aria-expanded", "true");
      document.body.append(preview);
      positionPreview(); ensureFrame();
    }

    function keepPreview() {
      return active && (hovered === active.card || focused === active.card || previewHovered
        || preview.contains(document.activeElement));
    }

    function scheduleClose() {
      view.clearTimeout(hideTimer); hideTimer = 0;
      if (active && !keepPreview()) hideTimer = view.setTimeout(closePreview, 180);
    }

    function scheduleOpen(card) {
      view.clearTimeout(showTimer); view.clearTimeout(hideTimer);
      showTimer = 0; hideTimer = 0;
      if (active?.card === card || drag) return;
      showTimer = view.setTimeout(() => {
        showTimer = 0;
        if (hovered === card || focused === card) openPreview(card);
      }, 220);
    }

    function onPointerOver(event) {
      if (preview.contains(event.target)) { previewHovered = true; view.clearTimeout(hideTimer); return; }
      const card = findCard(event.target);
      if (card && isControl(event.target, card)) {
        hovered = null;
        view.clearTimeout(showTimer); showTimer = 0;
        scheduleClose(); return;
      }
      if (!card || (card.contains(event.relatedTarget) && hovered === card)) return;
      hovered = card; scheduleOpen(card);
    }

    function onPointerOut(event) {
      const card = findCard(event.target);
      if (card && !card.contains(event.relatedTarget)) {
        if (hovered === card) hovered = null;
        view.clearTimeout(showTimer); showTimer = 0;
      } else if (!preview.contains(event.target) || preview.contains(event.relatedTarget)) return;
      previewHovered = preview.contains(event.relatedTarget);
      if (findCard(event.relatedTarget) === active?.card) hovered = active.card;
      scheduleClose();
    }

    function onFocusIn(event) {
      if (preview.contains(event.target)) { view.clearTimeout(hideTimer); return; }
      const card = findCard(event.target);
      if (!card) return;
      revealCard(card);
      if (isControl(event.target, card)) return;
      focused = card; scheduleOpen(card);
    }

    function onFocusOut(event) {
      const card = findCard(event.target);
      if (card && !card.contains(event.relatedTarget) && focused === card) focused = null;
      if (card || preview.contains(event.target)) scheduleClose();
    }

    function onPreviewRequest(event) {
      const card = findCard(event.target);
      if (!isInlineReference(card)) return;
      if (event.detail?.open === false) {
        if (focused === card) focused = null;
        if (active?.card === card) closePreview();
      } else if (event.detail?.open === true && read(card)) {
        focused = card;
        openPreview(card);
      }
    }

    function shelfScale(shelf) {
      return (shelf.clientWidth > 0 ? shelf.getBoundingClientRect().width / shelf.clientWidth : 1) || 1;
    }

    function scrollShelf(shelf, delta) {
      const previous = shelf.scrollLeft;
      const maximum = Math.max(0, shelf.scrollWidth - shelf.clientWidth);
      shelf.scrollLeft = Math.max(0, Math.min(maximum, previous + delta));
      return shelf.scrollLeft !== previous;
    }

    function revealCard(card) {
      const shelf = card.closest(".asset-shelf");
      if (!shelf) return;
      const strip = visibleBounds(shelf)?.visible;
      if (!strip) return;
      const bounds = card.getBoundingClientRect();
      const delta = bounds.left < strip.left ? bounds.left - strip.left
        : bounds.right > strip.right ? bounds.right - strip.right : 0;
      if (delta) scrollShelf(shelf, delta / shelfScale(shelf));
    }

    function onWheel(event) {
      const shelf = event.target?.closest?.(".asset-shelf");
      if (!shelf || !root.contains(shelf) || event.ctrlKey || event.metaKey || event.shiftKey
        || event.deltaX || !event.deltaY || shelf.scrollWidth <= shelf.clientWidth) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? shelf.clientWidth : 1;
      if (!scrollShelf(shelf, event.deltaY * unit / shelfScale(shelf))) return;
      event.preventDefault(); event.stopPropagation();
    }

    function clearDrop() {
      if (drag?.target) drag.target.card.removeAttribute("data-reference-drop");
      if (drag) drag.target = null;
    }

    function cancelDrag() {
      if (!drag) return;
      const previous = drag;
      clearDrop(); drag = null;
      if (previous.started) {
        suppressClick = true;
        view.clearTimeout(clickTimer);
        clickTimer = view.setTimeout(() => { suppressClick = false; clickTimer = 0; }, 0);
      }
      previous.card.removeAttribute("data-reference-dragging");
      previous.ghost?.remove();
      document.body.classList.remove("reference-strip-dragging");
      try { previous.card.releasePointerCapture?.(previous.pointerId); } catch { /* Already released by the browser. */ }
      stopIdleFrame();
    }

    function validDrag() {
      const current = drag && read(drag.card);
      return current && sameContext(drag.context, current.context) && current.context.canReorder
        && visibleBounds(drag.shelf) && drag.keys.length === current.context.entries.length
        && drag.keys.every((key, index) => current.context.entries[index].key === key) ? current : null;
    }

    function cardsInShelf(shelf) {
      return [...shelf.querySelectorAll("[data-reference-key]")].filter((card) => card.closest(".asset-shelf") === shelf);
    }

    function updateTarget() {
      clearDrop();
      const shelfBounds = visibleBounds(drag.shelf)?.visible;
      if (!shelfBounds || drag.x < shelfBounds.left || drag.x > shelfBounds.right
        || drag.y < shelfBounds.top || drag.y > shelfBounds.bottom) return;
      const cards = cardsInShelf(drag.shelf).filter((card) => visibleBounds(card));
      if (!cards.length) return;
      const card = cards.find((item) => drag.x < item.getBoundingClientRect().right) || cards[cards.length - 1];
      const bounds = card.getBoundingClientRect();
      const placement = drag.x < bounds.left + bounds.width / 2 ? "before" : "after";
      const targetKey = card.dataset.referenceKey;
      const sourceIndex = drag.keys.indexOf(drag.sourceKey);
      const targetIndex = drag.keys.indexOf(targetKey);
      const insertion = targetIndex + (placement === "after" ? 1 : 0);
      if (targetKey === drag.sourceKey || insertion === sourceIndex || insertion === sourceIndex + 1) return;
      drag.target = { card, targetKey, placement };
      card.dataset.referenceDrop = placement;
    }

    function updateGhost() {
      if (!drag.ghost) return;
      drag.ghost.style.left = `${drag.x - drag.offsetX}px`;
      drag.ghost.style.top = `${drag.y - drag.offsetY}px`;
    }

    function startDrag() {
      closePreview();
      drag.started = true;
      const ghost = drag.card.cloneNode(true);
      ghost.className = "reference-drag-ghost";
      ghost.removeAttribute("id"); ghost.removeAttribute("data-reference-key");
      ghost.removeAttribute("tabindex"); ghost.removeAttribute("role");
      ghost.removeAttribute("aria-controls"); ghost.removeAttribute("aria-expanded");
      ghost.setAttribute("aria-hidden", "true"); ghost.inert = true;
      ghost.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
      ghost.querySelectorAll("button, [data-reference-remove]").forEach((element) => element.remove());
      ghost.style.width = `${drag.bounds.width}px`; ghost.style.height = `${drag.bounds.height}px`;
      drag.ghost = ghost;
      drag.card.dataset.referenceDragging = "true";
      document.body.classList.add("reference-strip-dragging");
      document.body.append(ghost); updateGhost();
    }

    function autoScroll() {
      const visible = visibleBounds(drag.shelf)?.visible;
      if (!visible || drag.y < visible.top || drag.y > visible.bottom
        || drag.x < visible.left || drag.x > visible.right) return;
      const edge = Math.min(28, (visible.right - visible.left) / 3);
      const distance = drag.x < visible.left + edge ? drag.x - visible.left - edge
        : drag.x > visible.right - edge ? drag.x - visible.right + edge : 0;
      if (!distance) return;
      scrollShelf(drag.shelf, distance / edge * 10 / shelfScale(drag.shelf));
    }

    function follow() {
      frame = 0;
      if (active) positionPreview();
      if (drag) {
        if (!validDrag()) cancelDrag();
        else if (drag.started) { autoScroll(); updateTarget(); }
      }
      ensureFrame();
    }

    function onPointerDown(event) {
      if (preview.contains(event.target)) { event.stopPropagation(); return; }
      const card = findCard(event.target);
      if (!card || isControl(event.target, card) || event.button !== 0 || isSpaceDown()) return;
      // Inline atoms keep native editor selection and caret semantics. Their
      // hover/focus preview never starts reference-strip drag or node selection.
      if (isInlineReference(card)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      cancelDrag();
      const current = read(card);
      if (!current?.context.canReorder || !card.closest(".asset-shelf")) { openPreview(card); return; }
      const bounds = card.getBoundingClientRect();
      drag = {
        card, shelf: card.closest(".asset-shelf"), context: { ...current.context }, sourceKey: current.entry.key,
        keys: current.context.entries.map((entry) => entry.key), pointerId: event.pointerId,
        originX: event.clientX, originY: event.clientY, x: event.clientX, y: event.clientY, bounds,
        offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top,
        restoreFocus: document.activeElement === card, started: false, ghost: null, target: null,
      };
      try { card.setPointerCapture?.(event.pointerId); } catch { /* Document listeners still own cancellation. */ }
      ensureFrame();
    }

    function onPointerMove(event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (!validDrag() || isSpaceDown()) { cancelDrag(); return; }
      drag.x = event.clientX; drag.y = event.clientY;
      if (!drag.started && Math.hypot(drag.x - drag.originX, drag.y - drag.originY) >= 5) startDrag();
      if (drag.started) { updateGhost(); updateTarget(); }
    }

    function restoreCardFocus(context, key) {
      for (const card of root.querySelectorAll(".asset-card[data-reference-key]")) {
        if (card.dataset.referenceKey !== key || !card.closest(".asset-shelf")) continue;
        const current = read(card);
        if (current && sameContext(context, current.context)) { card.focus({ preventScroll: true }); return; }
      }
    }

    function onPointerUp(event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.preventDefault(); event.stopImmediatePropagation();
      drag.x = event.clientX; drag.y = event.clientY;
      const current = validDrag();
      if (drag.started) updateTarget();
      const previous = drag;
      const target = drag.target;
      cancelDrag();
      if (previous.started && target && current && !isSpaceDown()) {
        const moved = onMove(current.context, { sourceKey: previous.sourceKey, targetKey: target.targetKey, placement: target.placement });
        if (moved && previous.restoreFocus) restoreCardFocus(current.context, previous.sourceKey);
      } else if (!previous.started && current) openPreview(previous.card);
    }

    function onPointerCancel(event) {
      if (drag && event.pointerId === drag.pointerId) cancelDrag();
    }

    function onClick(event) {
      if (suppressClick) {
        suppressClick = false; view.clearTimeout(clickTimer); clickTimer = 0;
        event.preventDefault(); event.stopImmediatePropagation(); return;
      }
      const card = findCard(event.target);
      if (preview.contains(event.target)) { event.stopPropagation(); return; }
      if (!card && !drag) closePreview();
    }

    function onKeyDown(event) {
      if (event.isComposing) return;
      if (event.key === "Escape" && (drag || active || showTimer)) {
        event.preventDefault(); event.stopImmediatePropagation(); close(); return;
      }
      const card = findCard(event.target);
      if (!card || isControl(event.target, card)) return;
      if (isInlineReference(card)) return;
      if (event.altKey && !event.ctrlKey && !event.metaKey && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault(); event.stopImmediatePropagation();
        const current = read(card);
        if (!current?.context.canReorder) return;
        const index = current.context.entries.findIndex((entry) => entry.key === current.entry.key);
        const direction = event.key === "ArrowLeft" ? -1 : 1;
        const target = current.context.entries[index + direction];
        if (!target) return;
        closePreview();
        if (onMove(current.context, { sourceKey: current.entry.key, targetKey: target.key, placement: direction < 0 ? "before" : "after" })) {
          restoreCardFocus(current.context, current.entry.key);
        }
      } else if (event.key === "Enter") {
        event.preventDefault(); event.stopImmediatePropagation(); openPreview(card);
      }
    }

    function close() { cancelDrag(); closePreview(); }
    function onPageHide(event) { if (event.persisted) close(); else dispose(); }
    const listeners = [
      ["pointerover", onPointerOver, false], ["pointerout", onPointerOut, false],
      ["focusin", onFocusIn, false], ["focusout", onFocusOut, false],
      ["reference-preview-request", onPreviewRequest, false],
      ["pointerdown", onPointerDown, true], ["pointermove", onPointerMove, true],
      ["pointerup", onPointerUp, true], ["pointercancel", onPointerCancel, true],
      ["lostpointercapture", onPointerCancel, true], ["click", onClick, true], ["keydown", onKeyDown, true],
      ["wheel", onWheel, { capture: true, passive: false }],
    ];
    listeners.forEach(([type, listener, capture]) => document.addEventListener(type, listener, capture));
    view.addEventListener("blur", close);
    view.addEventListener("pagehide", onPageHide);
    function dispose() {
      if (disposed) return;
      disposed = true; close();
      view.clearTimeout(clickTimer); clickTimer = 0; suppressClick = false;
      listeners.forEach(([type, listener, capture]) => document.removeEventListener(type, listener, capture));
      view.removeEventListener("blur", close); view.removeEventListener("pagehide", onPageHide);
    }
    return Object.freeze({ close, dispose });
  }

  global.REELAY_CANVAS_REFERENCE_STRIP = Object.freeze({ createController });
}(typeof globalThis === "object" ? globalThis : window));
