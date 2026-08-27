(function registerCanvasNodeLayoutTransition(root) {
  "use strict";

  const defaultDuration = 240;
  const geometryFields = Object.freeze([
    "x",
    "y",
    "nodeWidth",
    "nodeHeight",
    "mediaWidth",
    "mediaHeight",
  ]);

  function clampProgress(value) {
    return Math.min(1, Math.max(0, value));
  }

  function easeOutCubic(progress) {
    const remaining = 1 - clampProgress(progress);
    return 1 - remaining * remaining * remaining;
  }

  function normalizeGeometry(candidate) {
    if (!candidate || typeof candidate !== "object") return null;
    const geometry = {};
    for (const field of geometryFields) {
      const value = Number(candidate[field]);
      if (!Number.isFinite(value)) return null;
      geometry[field] = value;
    }
    return geometry;
  }

  function interpolateGeometry(from, to, progress) {
    const easedProgress = easeOutCubic(progress);
    return Object.fromEntries(
      geometryFields.map((field) => [
        field,
        from[field] + (to[field] - from[field]) * easedProgress,
      ]),
    );
  }

  function geometriesMatch(left, right) {
    return geometryFields.every((field) => Math.abs(left[field] - right[field]) < 0.01);
  }

  function createNodeLayoutTransitionController(options = {}) {
    const now = typeof options.now === "function" ? options.now : () => performance.now();
    const requestFrame = typeof options.requestFrame === "function"
      ? options.requestFrame
      : (callback) => requestAnimationFrame(callback);
    const cancelFrame = typeof options.cancelFrame === "function"
      ? options.cancelFrame
      : (frameId) => cancelAnimationFrame(frameId);
    const onFrame = typeof options.onFrame === "function" ? options.onFrame : () => {};
    const onFinish = typeof options.onFinish === "function" ? options.onFinish : () => {};
    const shouldReduceMotion = typeof options.shouldReduceMotion === "function"
      ? options.shouldReduceMotion
      : () => false;
    const duration = Math.max(1, Number(options.duration) || defaultDuration);
    const transitions = new Map();
    let frameId = 0;

    function scheduleFrame() {
      if (frameId || !transitions.size) return;
      frameId = requestFrame(tick);
    }

    function tick(timestamp) {
      frameId = 0;
      const completedIds = [];
      for (const [id, transition] of transitions) {
        const progress = clampProgress((timestamp - transition.startedAt) / transition.duration);
        transition.presented = interpolateGeometry(transition.from, transition.to, progress);
        if (progress >= 1) completedIds.push(id);
      }

      if (transitions.size) onFrame([...transitions.keys()]);

      for (const id of completedIds) transitions.delete(id);
      if (completedIds.length) onFinish(completedIds);
      scheduleFrame();
    }

    function start({ id, from, to }) {
      const key = String(id || "");
      const nextGeometry = normalizeGeometry(to);
      const requestedFrom = normalizeGeometry(from);
      if (!key || !nextGeometry || !requestedFrom) return false;

      const current = transitions.get(key)?.presented || requestedFrom;
      if (shouldReduceMotion() || geometriesMatch(current, nextGeometry)) {
        const wasActive = transitions.delete(key);
        if (wasActive) onFinish([key]);
        if (!transitions.size && frameId) {
          cancelFrame(frameId);
          frameId = 0;
        }
        return false;
      }

      transitions.set(key, {
        from: { ...current },
        to: nextGeometry,
        presented: { ...current },
        startedAt: now(),
        duration,
      });
      scheduleFrame();
      return true;
    }

    function get(id) {
      return transitions.get(String(id || ""))?.presented || null;
    }

    function isActive(id) {
      return transitions.has(String(id || ""));
    }

    function finishAll() {
      if (!transitions.size) return false;
      const ids = [...transitions.keys()];
      for (const transition of transitions.values()) {
        transition.presented = { ...transition.to };
      }
      onFrame(ids);
      transitions.clear();
      if (frameId) {
        cancelFrame(frameId);
        frameId = 0;
      }
      onFinish(ids);
      return true;
    }

    function prune(liveIds) {
      const live = liveIds instanceof Set ? liveIds : new Set(liveIds || []);
      for (const id of transitions.keys()) {
        if (!live.has(id)) transitions.delete(id);
      }
      if (!transitions.size && frameId) {
        cancelFrame(frameId);
        frameId = 0;
      }
    }

    return Object.freeze({ start, get, isActive, finishAll, prune });
  }

  root.REELAY_CANVAS_NODE_LAYOUT_TRANSITION = Object.freeze({
    defaultDuration,
    easeOutCubic,
    interpolateGeometry,
    createNodeLayoutTransitionController,
  });
}(typeof globalThis === "object" ? globalThis : window));
