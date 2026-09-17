(function registerCanvasReferenceDrop(root) {
  "use strict";

  function createCanvasReferenceDropController({ window, hasPayload, isCanvasTarget, isMutable, getNode, getScope }) {
    let activeSurface = null;
    let activeScope = null;

    function clear() {
      activeSurface?.classList.remove("reference-drop-active");
      activeSurface = null;
      activeScope = null;
    }

    function canDrop(target) {
      if (!isCanvasTarget(target) || !isMutable()) return false;
      const node = getNode(target);
      return node?.kind !== "generator" || !node.generating;
    }

    function surfaceFor(target) {
      if (!canDrop(target) || getNode(target)?.kind !== "generator") return null;
      return target.closest?.(".prompt-panel, .media-frame") || null;
    }

    function syncContext() {
      if (activeSurface && (activeScope !== getScope() || !activeSurface.isConnected
        || surfaceFor(activeSurface) !== activeSurface)) clear();
    }

    function onDragCapture(event) {
      syncContext();
      // The Agent receives media drops before bubbling reaches the canvas handler.
      if (!hasPayload(event) || surfaceFor(event.target) !== activeSurface) clear();
    }

    function onDragOver(event) {
      if (!hasPayload(event)) return;
      event.preventDefault();
      const accepted = canDrop(event.target);
      if (event.dataTransfer) event.dataTransfer.dropEffect = accepted ? "copy" : "none";
      const surface = accepted ? surfaceFor(event.target) : null;
      if (surface !== activeSurface) clear();
      if (surface) {
        activeSurface = surface;
        activeScope = getScope();
        surface.classList.add("reference-drop-active");
      }
    }

    function onDragLeave(event) {
      if (activeSurface && !activeSurface.contains(event.relatedTarget)) clear();
    }

    const listeners = [
      ["dragover", onDragCapture, true],
      ["dragover", onDragOver, false],
      ["dragleave", onDragLeave, true],
      ["drop", clear, true],
      ["dragend", clear, true],
      ["blur", clear, false],
      ["pagehide", clear, false],
    ];
    for (const [type, listener, capture] of listeners) window.addEventListener(type, listener, capture);
    return {
      canDrop, syncContext, clear,
      destroy() {
        clear();
        for (const [type, listener, capture] of listeners) window.removeEventListener(type, listener, capture);
      },
    };
  }

  root.REELAY_CANVAS_REFERENCE_DROP = { createCanvasReferenceDropController };
})(typeof window !== "undefined" ? window : globalThis);
