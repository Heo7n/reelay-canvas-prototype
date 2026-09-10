(function registerCanvasMediaToolbarView(root) {
  "use strict";

  function renderToolButton(tool, showLabel) {
    if (!tool?.id || !tool?.icon || !tool?.label) return "";
    return `
      <button class="media-tool-button ${showLabel ? "with-label" : ""}" type="button" data-media-tool="${tool.id}" aria-label="${tool.label}">
        <i data-lucide="${tool.icon}" aria-hidden="true"></i>
        ${showLabel ? `<span>${tool.label}</span>` : ""}
        <span class="toolbar-tip" aria-hidden="true">${tool.label}</span>
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
    const editingTools = pinnedTools.filter((tool) => tool?.id !== "add-library");
    const libraryTool = pinnedTools.find((tool) => tool?.id === "add-library");
    const unpinnedTools = Array.isArray(options.unpinnedTools) ? options.unpinnedTools : [];
    const toolbarScale = Number.isFinite(options.toolbarScale) ? options.toolbarScale : 1;

    return `
      <div class="media-edit-toolbar ${showLabels ? "show-labels" : "compact"}" data-media-toolbar="true" role="group" aria-label="媒体操作" style="--toolbar-scale: ${toolbarScale}">
        <div class="media-tool-primary">
          ${editingTools.map((tool) => renderToolButton(tool, showLabels)).join("")}
          <div class="media-tool-more">
            <button class="media-tool-button ${options.menuOpen ? "active" : ""}" type="button" data-media-tool="toggle-more" aria-label="更多工具" aria-expanded="${Boolean(options.menuOpen)}">
              <i data-lucide="ellipsis" aria-hidden="true"></i>
              <span class="toolbar-tip" aria-hidden="true">更多工具</span>
            </button>
            ${
              options.menuOpen
                ? `
                  <div class="media-tool-menu" popover="manual" data-toolbar-popover="media">
                    ${unpinnedTools.map(renderMenuTool).join("")}
                    ${unpinnedTools.length ? '<div class="media-tool-menu-separator"></div>' : ""}
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
        </div>
        <span class="media-tool-separator" aria-hidden="true"></span>
        <div class="media-tool-actions">
          ${libraryTool ? renderToolButton(libraryTool, showLabels) : ""}
          <button class="media-tool-button" type="button" data-media-tool="download" aria-label="下载">
            <i data-lucide="download" aria-hidden="true"></i>
            <span class="toolbar-tip" aria-hidden="true">下载</span>
          </button>
        </div>
      </div>
    `;
  }

  root.REELAY_CANVAS_MEDIA_TOOLBAR_VIEW = Object.freeze({ renderMediaToolbar });
}(typeof globalThis === "object" ? globalThis : window));
