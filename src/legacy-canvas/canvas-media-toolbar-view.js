(function registerCanvasMediaToolbarView(root) {
  "use strict";

  function renderToolButton(tool, showLabel) {
    if (!tool?.id || !tool?.icon || !tool?.label) return "";
    return `
      <button class="media-tool-button ${showLabel ? "with-label" : ""}" type="button" data-media-tool="${tool.id}" title="${tool.label}" aria-label="${tool.label}">
        <i data-lucide="${tool.icon}" aria-hidden="true"></i>
        ${showLabel ? `<span>${tool.label}</span>` : ""}
      </button>
    `;
  }

  function renderMenuTool(tool) {
    if (!tool?.id || !tool?.icon || !tool?.label) return "";
    return `
      <button type="button" data-media-tool="${tool.id}">
        <i data-lucide="${tool.icon}" aria-hidden="true"></i>
        <span>${tool.label}</span>
      </button>
    `;
  }

  function renderMediaToolbar(options = {}) {
    if (!options.visible) return "";
    const showLabels = Boolean(options.showLabels);
    const pinnedTools = Array.isArray(options.pinnedTools) ? options.pinnedTools : [];
    const unpinnedTools = Array.isArray(options.unpinnedTools) ? options.unpinnedTools : [];
    const toolbarScale = Number.isFinite(options.toolbarScale) ? options.toolbarScale : 1;

    return `
      <div class="media-edit-toolbar ${showLabels ? "show-labels" : "compact"}" data-media-toolbar="true" style="--toolbar-scale: ${toolbarScale}">
        <div class="media-tool-primary">
          ${pinnedTools.map((tool) => renderToolButton(tool, showLabels)).join("")}
        </div>
        <div class="media-tool-actions">
          <button class="media-tool-button" type="button" data-media-tool="toggle-more" title="更多工具" aria-label="更多工具">
            <i data-lucide="ellipsis" aria-hidden="true"></i>
          </button>
          <span class="media-tool-separator" aria-hidden="true"></span>
          <button class="media-tool-button" type="button" data-media-tool="download" title="下载" aria-label="下载">
            <i data-lucide="download" aria-hidden="true"></i>
          </button>
        </div>
        ${
          options.menuOpen
            ? `
              <div class="media-tool-menu">
                ${unpinnedTools.map(renderMenuTool).join("")}
                <div class="media-tool-menu-separator"></div>
                <button type="button" data-media-tool="customize">
                  <i data-lucide="settings-2" aria-hidden="true"></i>
                  <span>自定义工具栏</span>
                  <i data-lucide="chevron-right" aria-hidden="true"></i>
                </button>
              </div>
            `
            : ""
        }
      </div>
    `;
  }

  root.REELAY_CANVAS_MEDIA_TOOLBAR_VIEW = Object.freeze({ renderMediaToolbar });
}(typeof globalThis === "object" ? globalThis : window));
