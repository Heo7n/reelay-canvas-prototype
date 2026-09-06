(function registerCanvasNodeEditorLayout(root) {
  "use strict";

  function getEditorLayout({ scale, availableWidth, mode = "video", rules }) {
    const canvasScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    const preferredWidth = rules.promptScreenWidthByMode[mode] || rules.promptScreenWidthByMode.video;
    const viewportWidth = Number.isFinite(availableWidth) && availableWidth > 0
      ? availableWidth
      : preferredWidth + rules.promptScreenMargin;

    return {
      panelWidth: Math.min(preferredWidth, Math.max(1, viewportWidth - rules.promptScreenMargin)),
      promptScale: 1 / canvasScale,
      panelGap: rules.panelGap / Math.min(canvasScale, 1),
    };
  }

  root.REELAY_CANVAS_NODE_EDITOR_LAYOUT = Object.freeze({ getEditorLayout });
}(typeof globalThis === "object" ? globalThis : window));
