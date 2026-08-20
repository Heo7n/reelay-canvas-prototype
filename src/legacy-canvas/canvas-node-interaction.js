(function registerCanvasNodeInteraction(root) {
  "use strict";

  const defaultDragThreshold = 4;

  function uniqueIds(ids = []) {
    return ids.filter((id, index) => ids.indexOf(id) === index);
  }

  function resolvePointerSelection({ selectedIds = [], nodeId, shiftKey = false }) {
    const current = uniqueIds(selectedIds);
    const wasSelected = current.includes(nodeId);

    if (shiftKey) {
      if (wasSelected && current.length > 1) {
        return current.filter((id) => id !== nodeId);
      }
      if (!wasSelected) return [...current, nodeId];
      return current;
    }

    if (!wasSelected || current.length <= 1) return [nodeId];
    return current;
  }

  function getPointerDistance(action, pointer) {
    return Math.hypot(
      pointer.clientX - action.startClientX,
      pointer.clientY - action.startClientY,
    );
  }

  function hasCrossedDragThreshold(action, pointer, threshold = defaultDragThreshold) {
    return getPointerDistance(action, pointer) >= threshold;
  }

  function getDragDelta(action, pointer, scale = 1) {
    const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    return {
      dx: (pointer.clientX - action.startClientX) / safeScale,
      dy: (pointer.clientY - action.startClientY) / safeScale,
    };
  }

  function getDraggedPositions(action, pointer, scale = 1) {
    const { dx, dy } = getDragDelta(action, pointer, scale);
    return {
      dx,
      dy,
      moved: Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01,
      positions: (action.origins || []).map((origin) => ({
        id: origin.id,
        x: origin.x + dx,
        y: origin.y + dy,
      })),
    };
  }

  function getLocalMarqueeRect(action, pointer, shellRect) {
    const localX = pointer.clientX - shellRect.left;
    const localY = pointer.clientY - shellRect.top;
    return {
      left: Math.min(action.localStartX, localX),
      top: Math.min(action.localStartY, localY),
      width: Math.abs(localX - action.localStartX),
      height: Math.abs(localY - action.localStartY),
    };
  }

  function getWorldMarqueeRect(start, end) {
    return {
      left: Math.min(start.x, end.x),
      top: Math.min(start.y, end.y),
      right: Math.max(start.x, end.x),
      bottom: Math.max(start.y, end.y),
    };
  }

  function rectsIntersect(a, b) {
    return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
  }

  function resolveMarqueeSelection({
    nodes = [],
    marquee,
    getBounds,
    additive = false,
    baseSelection = [],
  }) {
    if (!marquee || typeof getBounds !== "function") return uniqueIds(baseSelection);
    const hits = nodes
      .filter((node) => rectsIntersect(marquee, getBounds(node)))
      .map((node) => node.id);
    return uniqueIds(additive ? [...baseSelection, ...hits] : hits);
  }

  root.REELAY_CANVAS_NODE_INTERACTION = Object.freeze({
    defaultDragThreshold,
    resolvePointerSelection,
    getPointerDistance,
    hasCrossedDragThreshold,
    getDragDelta,
    getDraggedPositions,
    getLocalMarqueeRect,
    getWorldMarqueeRect,
    rectsIntersect,
    resolveMarqueeSelection,
  });
}(typeof globalThis === "object" ? globalThis : window));
