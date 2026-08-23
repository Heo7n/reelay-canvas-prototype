(function registerCanvasSpatialSelection(root) {
  "use strict";

  function finite(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
  }

  function normalizeRect(rect) {
    if (!rect) return null;
    const left = Math.min(finite(rect.left), finite(rect.right));
    const top = Math.min(finite(rect.top), finite(rect.bottom));
    const right = Math.max(finite(rect.left), finite(rect.right));
    const bottom = Math.max(finite(rect.top), finite(rect.bottom));
    const width = right - left;
    const height = bottom - top;
    if (width <= 0 || height <= 0) return null;
    return Object.freeze({ left, top, right, bottom, width, height });
  }

  function getIntersectionRatio(subjectRect, containerRect) {
    const subject = normalizeRect(subjectRect);
    const container = normalizeRect(containerRect);
    if (!subject || !container) return 0;
    const width = Math.max(0, Math.min(subject.right, container.right) - Math.max(subject.left, container.left));
    const height = Math.max(0, Math.min(subject.bottom, container.bottom) - Math.max(subject.top, container.top));
    return (width * height) / (subject.width * subject.height);
  }

  function containsSubjectCenter(subjectRect, containerRect) {
    const subject = normalizeRect(subjectRect);
    const container = normalizeRect(containerRect);
    if (!subject || !container) return false;
    const centerX = subject.left + subject.width / 2;
    const centerY = subject.top + subject.height / 2;
    return centerX >= container.left && centerX <= container.right
      && centerY >= container.top && centerY <= container.bottom;
  }

  function resolveNodeGroup(input) {
    const nodeBounds = normalizeRect(input?.nodeBounds);
    if (!nodeBounds) return null;
    const enterRatio = Math.max(0, Math.min(1, finite(input?.enterRatio, 0.55)));
    const retainRatio = Math.max(0, Math.min(enterRatio, finite(input?.retainRatio, 0.35)));
    const groups = (Array.isArray(input?.groups) ? input.groups : [])
      .map((group) => {
        const bounds = normalizeRect(group?.bounds);
        if (!group?.id || !bounds) return null;
        return {
          id: group.id,
          bounds,
          area: bounds.width * bounds.height,
          ratio: getIntersectionRatio(nodeBounds, bounds),
          centerInside: containsSubjectCenter(nodeBounds, bounds),
        };
      })
      .filter(Boolean);

    const current = groups.find((group) => group.id === input?.currentGroupId);
    if (current && current.ratio >= retainRatio) return current.id;

    const candidate = groups
      .filter((group) => group.centerInside && group.ratio >= enterRatio)
      .sort((a, b) => b.ratio - a.ratio || a.area - b.area || a.id.localeCompare(b.id))[0];
    return candidate?.id || null;
  }

  function getSelectionScreenRect(worldBounds, viewport, paddingScreen = 8) {
    const bounds = normalizeRect(worldBounds);
    const scale = Math.max(0.0001, finite(viewport?.scale, 1));
    if (!bounds) return null;
    const tx = finite(viewport?.tx);
    const ty = finite(viewport?.ty);
    const padding = Math.max(0, finite(paddingScreen, 8));
    const left = tx + bounds.left * scale - padding;
    const top = ty + bounds.top * scale - padding;
    const right = tx + bounds.right * scale + padding;
    const bottom = ty + bounds.bottom * scale + padding;
    return Object.freeze({
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top,
      centerX: (left + right) / 2,
      centerY: (top + bottom) / 2,
    });
  }

  root.REELAY_CANVAS_SPATIAL_SELECTION = Object.freeze({
    containsSubjectCenter,
    getIntersectionRatio,
    getSelectionScreenRect,
    normalizeRect,
    resolveNodeGroup,
  });
}(typeof globalThis === "object" ? globalThis : window));
