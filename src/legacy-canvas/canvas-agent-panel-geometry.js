(function registerCanvasAgentPanelGeometry(root) {
  "use strict";

  function finiteNonNegative(value) {
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  }

  function normalizeInsets(options) {
    const input = options && typeof options === "object" ? options : {};
    const viewportHeight = finiteNonNegative(input.viewportHeight);
    const requestedMinHeight = finiteNonNegative(input.minHeight);

    if (viewportHeight <= requestedMinHeight) {
      return {
        top: 0,
        bottom: 0,
        height: viewportHeight,
      };
    }

    const availableInset = viewportHeight - requestedMinHeight;
    const requestedTop = finiteNonNegative(input.top);
    const requestedBottom = finiteNonNegative(input.bottom);
    let top;
    let bottom;

    if (input.preferredEdge === "bottom") {
      top = Math.min(requestedTop, availableInset);
      bottom = Math.min(requestedBottom, availableInset - top);
    } else {
      bottom = Math.min(requestedBottom, availableInset);
      top = Math.min(requestedTop, availableInset - bottom);
    }

    return {
      top,
      bottom,
      height: viewportHeight - top - bottom,
    };
  }

  root.REELAY_CANVAS_AGENT_PANEL_GEOMETRY = Object.freeze({
    normalizeInsets,
  });
}(typeof globalThis === "object" ? globalThis : window));
