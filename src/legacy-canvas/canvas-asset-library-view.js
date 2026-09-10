(function registerCanvasAssetLibraryView(root) {
  "use strict";

  const HTML_ESCAPES = Object.freeze({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  });

  const FILTERS = Object.freeze([
    { id: "all", label: "全部" },
    { id: "image", label: "图片" },
    { id: "video", label: "视频" },
    { id: "audio", label: "音频" },
  ]);

  const ITEM_ACTIONS = Object.freeze([
    { id: "rename", icon: "pencil", label: "重命名" },
    { id: "review", icon: "shield-check", label: "提交 Seedance 合规审核" },
    { id: "move", icon: "folder-input", label: "移动" },
    { id: "share-organization", icon: "users", label: "共享到组织空间", personalOnly: true },
    { id: "delete", icon: "trash-2", label: "删除", danger: true },
  ]);

  const ENTITY_ACTIONS = Object.freeze([
    { id: "edit", icon: "pencil-line", label: "编辑" },
    { id: "view-media", icon: "images", label: "查看关联素材" },
    { id: "rename", icon: "pencil", label: "重命名" },
    { id: "move", icon: "folder-input", label: "移动" },
    { id: "share-organization", icon: "users", label: "复制到组织空间", personalOnly: true },
    { id: "delete", icon: "trash-2", label: "删除", danger: true },
  ]);

  const FOLDER_ACTIONS = Object.freeze([
    { id: "rename", icon: "pencil", label: "重命名" },
    { id: "move", icon: "folder-input", label: "移动" },
    { id: "share-organization", icon: "users", label: "共享到组织空间", personalOnly: true },
    { id: "delete", icon: "trash-2", label: "删除", danger: true },
  ]);

  const BATCH_ACTIONS = Object.freeze([
    { id: "review", label: "批量提交审核" },
    { id: "move", label: "批量移动" },
    { id: "share-organization", label: "复制到组织空间", personalOnly: true },
    { id: "delete", label: "批量删除", danger: true },
  ]);

  const PLATFORM_BATCH_ACTIONS = Object.freeze([
    { id: "add-canvas", label: "添加到画布" },
    { id: "save-personal", label: "保存到素材" },
  ]);

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
  }

  function classNames(...values) {
    return values.filter(Boolean).join(" ");
  }

  function icon(name, className = "") {
    return `<i${className ? ` class="${className}"` : ""} data-lucide="${name}" aria-hidden="true"></i>`;
  }

  function normalizeSection(section) {
    return section === "entity" || section === "entities" ? "entity" : "media";
  }

  function normalizeSpace(space) {
    if (space === "official" || space === "platform") return "platform";
    if (space === "organization") return "organization";
    return "personal";
  }

  function normalizeFilter(filter, section) {
    if (section === "entity") return "all";
    return FILTERS.some((candidate) => candidate.id === filter) ? filter : "all";
  }

  function normalizeDisplay(display) {
    return display === "list" ? "list" : "grid";
  }

  function normalizeMenu(menu) {
    return menu === "filter" || menu === "batch" ? menu : "";
  }

  function resolveSpace(explicitSpace, record) {
    return normalizeSpace(explicitSpace ?? record?.space);
  }

  function canMutate(mutable, space) {
    return Boolean(mutable) && space !== "platform";
  }

  function normalizeAllowedActions(value) {
    if (value == null) return null;
    const source = Array.isArray(value)
      ? value
      : typeof value !== "string" && typeof value?.[Symbol.iterator] === "function"
        ? [...value]
        : [];
    return new Set(Array.from(source, (action) => String(action || "").trim()).filter(Boolean));
  }

  function actionsForSpace(actions, space, allowedActions = null) {
    const allowed = normalizeAllowedActions(allowedActions);
    return actions.filter((action) =>
      (!action.personalOnly || space === "personal") && (!allowed || allowed.has(action.id)),
    );
  }

  function renderFilterMenu(activeFilter) {
    return `
      <div class="asset-library-toolbar-menu compact" role="menu" aria-label="素材类型筛选">
        ${FILTERS.map((filter) => `
          <button class="${filter.id === activeFilter ? "active" : ""}" type="button" role="menuitemradio" aria-checked="${filter.id === activeFilter}" data-library-filter="${filter.id}">
            <span>${filter.label}</span>
          </button>
        `).join("")}
      </div>
    `;
  }

  function getBatchActions(space, reviewableSelection, section, allowedActions = null) {
    const actions = space === "platform" ? PLATFORM_BATCH_ACTIONS : BATCH_ACTIONS;
    return actionsForSpace(actions, space, allowedActions)
      .filter((action) => action.id !== "review" || (section === "media" && reviewableSelection));
  }

  function isBatchActionAvailable(action, space, options = {}) {
    if (space === "platform" && action.id === "save-personal") {
      return options.canImportPlatformAssets === true;
    }
    return true;
  }

  function renderBatchMenu(actions, space, options = {}) {
    return `
      <div class="asset-library-toolbar-menu batch" role="menu" aria-label="批量操作">
        ${actions.map((action) => {
          const available = isBatchActionAvailable(action, space, options);
          return `
            <button class="${action.danger ? "danger" : ""}" type="button" role="menuitem"${available
              ? ` data-library-batch-action="${action.id}"`
              : ` disabled aria-disabled="true" aria-label="${action.label}，暂未接入" title="暂未接入" data-library-batch-unavailable="${action.id}"`}>
              <span>${action.label}</span>
              ${available ? "" : '<small aria-hidden="true">暂未接入</small>'}
            </button>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderDisplayControl(display) {
    const nextDisplay = display === "grid" ? "list" : "grid";
    const label = nextDisplay === "list" ? "切换到列表视图" : "切换到网格视图";
    return `
      <button type="button" title="${label}" aria-label="${label}" data-library-display="${nextDisplay}" data-library-current-display="${display}">
        ${icon(display === "list" ? "list" : "grid-2x2")}
      </button>
    `;
  }

  function renderCommandBar(options = {}) {
    const space = normalizeSpace(options.space);
    const section = space === "platform" ? "media" : normalizeSection(options.section);
    const mutable = canMutate(options.mutable, space);
    const canCreateEntity = mutable && options.canCreateEntity !== false;
    const canUploadMedia = mutable && options.canUploadMedia !== false;
    const selectedCount = Number.isFinite(Number(options.selectedCount))
      ? Math.max(0, Math.floor(Number(options.selectedCount)))
      : 0;
    const filter = normalizeFilter(options.filter, section);
    const display = normalizeDisplay(options.display);
    const requestedMenu = normalizeMenu(options.menu);
    const reviewableSelection = options.reviewableSelection !== false;
    const batchActions = getBatchActions(space, reviewableSelection, section, options.allowedBatchActions);
    const hasBatchActions = batchActions.length > 0;
    const hasExecutableBatchActions = batchActions.some((action) => isBatchActionAvailable(action, space, options));
    const selectionEnabled = hasBatchActions && hasExecutableBatchActions && (mutable || space === "platform");
    const selectionMode = selectionEnabled && Boolean(options.selectionMode);
    const hasSelection = selectedCount > 0;
    const menu = selectionMode && hasSelection && requestedMenu === "batch"
      ? "batch"
      : section === "media" && requestedMenu === "filter"
        ? "filter"
        : "";

    const leadingCommand = selectionMode
      ? `
          <div class="asset-library-command-popover">
            <button class="asset-library-primary-command asset-library-batch-command" type="button" aria-haspopup="menu" aria-expanded="${menu === "batch"}" aria-label="${hasSelection ? `操作，已选 ${selectedCount} 项` : "操作，尚未选择资产"}" data-library-batch-toggle="true"${hasSelection ? "" : ' disabled aria-disabled="true"'}>
              ${icon("list-checks")}
              <span>操作</span>
            </button>
            ${menu === "batch" ? renderBatchMenu(batchActions, space, options) : ""}
          </div>
        `
      : space === "platform"
        ? ""
        : options.entityFilter
          ? `<button class="asset-library-primary-command" type="button" aria-label="返回素材库" title="返回素材库" data-library-clear-entity-filter="true">${icon("chevron-left")}<span>返回</span></button>`
        : !mutable
          ? `
            <button class="asset-library-readonly-command" type="button" disabled aria-disabled="true">
              ${icon("eye")}
              <span>仅可查看</span>
            </button>
          `
        : section === "entity"
          ? canCreateEntity ? `
            <button class="asset-library-primary-command" type="button" data-library-create-entity="true">
              ${icon("plus")}
              <span>新建主体</span>
            </button>
          ` : `
            <button class="asset-library-readonly-command" type="button" disabled aria-disabled="true" title="当前项目暂不支持新建主体">
              ${icon("lock-keyhole")}
              <span>暂不可新建</span>
            </button>
          `
          : canUploadMedia ? `
            <button class="asset-library-primary-command" type="button" data-library-upload="true">
              ${icon("upload")}
              <span>上传</span>
            </button>
          ` : `
            <button class="asset-library-readonly-command" type="button" disabled aria-disabled="true" title="当前项目暂不支持上传素材">
              ${icon("lock-keyhole")}
              <span>暂不可上传</span>
            </button>
          `;

    const selectionControl = selectionEnabled && !selectionMode
      ? `
        <button type="button" title="多选" aria-label="进入多选" aria-pressed="false" data-library-selection-toggle="true">
          ${icon("copy-check")}
        </button>
      `
      : selectionMode
        ? `
          <button class="asset-library-select-all" type="button" data-library-select-all="true">
            ${icon("square")}
            <span>全选</span>
          </button>
          <button class="asset-library-select-all asset-library-selection-cancel" type="button" aria-label="取消多选" data-library-selection-cancel="true">
            ${icon("x")}
            <span>取消</span>
          </button>
        `
        : "";

    const filterControl = section === "media"
      ? `
        <button class="${filter !== "all" ? "active" : ""}" type="button" title="筛选" aria-label="筛选素材类型" aria-haspopup="menu" aria-expanded="${menu === "filter"}" data-library-filter-toggle="true">
          ${icon("list-filter")}
        </button>
      `
      : "";

    return `
      <div class="${classNames("asset-library-commandbar", space === "platform" && "platform", selectionMode && "selection-mode", !mutable && "readonly")}" data-library-commandbar="${section}" data-library-space="${space}" data-library-active-filter="${filter}" data-library-active-display="${display}" data-library-open-menu="${menu}" data-library-selection-enabled="${selectionEnabled}" data-library-selection-mode="${selectionMode}">
        ${leadingCommand}
        <div class="asset-library-command-popover">
          <div class="asset-library-command-group">
            ${selectionControl}
            ${filterControl}
            ${renderDisplayControl(display)}
          </div>
          ${menu === "filter" ? renderFilterMenu(filter) : ""}
        </div>
      </div>
    `;
  }

  function renderDirectoryTree(options = {}) {
    const folders = (Array.isArray(options.folders) ? options.folders : [])
      .filter((folder) => folder && typeof folder === "object" && String(folder.id || "").trim())
      .map((folder) => ({
        id: String(folder.id),
        name: String(folder.name || "未命名文件夹"),
        parentId: folder.parentId == null ? null : String(folder.parentId),
      }));
    const currentFolderId = options.currentFolderId == null ? null : String(options.currentFolderId);
    const expandedIds = new Set((Array.isArray(options.expandedFolderIds) ? options.expandedFolderIds : []).map(String));
    const rootExpanded = options.rootExpanded !== false;
    const foldersById = new Map(folders.map((folder) => [folder.id, folder]));
    const childrenByParent = new Map();
    for (const folder of folders) {
      const parentKey = folder.parentId && foldersById.has(folder.parentId) ? folder.parentId : "";
      const children = childrenByParent.get(parentKey) || [];
      children.push(folder);
      childrenByParent.set(parentKey, children);
    }

    const pathLabel = (folder) => {
      const names = [];
      const visited = new Set();
      let current = folder;
      while (current && !visited.has(current.id)) {
        visited.add(current.id);
        names.unshift(current.name);
        current = current.parentId ? foldersById.get(current.parentId) : null;
      }
      return ["默认目录", ...names].join(" / ");
    };

    const renderToggle = ({ id, expanded, root = false }) => `
      <button class="asset-library-directory-toggle" type="button" aria-label="${expanded ? "收起" : "展开"}目录" aria-expanded="${expanded}" ${root ? 'data-library-directory-root-toggle="true"' : `data-library-directory-toggle="${escapeHtml(id)}"`}>
        ${icon(expanded ? "chevron-down" : "chevron-right")}
      </button>
    `;

    const renderRows = (parentId, level, ancestry = new Set()) => {
      const children = childrenByParent.get(parentId || "") || [];
      return children.map((folder) => {
        if (ancestry.has(folder.id)) return "";
        const nextAncestry = new Set(ancestry);
        nextAncestry.add(folder.id);
        const descendants = childrenByParent.get(folder.id) || [];
        const hasChildren = descendants.length > 0;
        const expanded = hasChildren && expandedIds.has(folder.id);
        const selected = folder.id === currentFolderId;
        const safeId = escapeHtml(folder.id);
        const safeName = escapeHtml(folder.name);
        const safePath = escapeHtml(pathLabel(folder));
        return `
          <div class="${classNames("asset-library-directory-row", selected && "current")}" role="treeitem" aria-level="${level}" aria-selected="${selected}"${hasChildren ? ` aria-expanded="${expanded}"` : ""} style="--asset-directory-level:${level}">
            ${hasChildren
              ? renderToggle({ id: folder.id, expanded })
              : '<span class="asset-library-directory-toggle-spacer" aria-hidden="true"></span>'}
            <button class="asset-library-directory-select" type="button" data-library-directory-select="${safeId}" title="${safePath}">
              ${icon("folder")}
              <span>${safeName}</span>
            </button>
            <span class="asset-library-directory-check" aria-hidden="true">${selected ? icon("check") : ""}</span>
          </div>
          ${expanded ? renderRows(folder.id, level + 1, nextAncestry) : ""}
        `;
      }).join("");
    };

    const rootChildren = childrenByParent.get("") || [];
    const rootSelected = currentFolderId == null;
    return `
      <div class="asset-library-directory-tree" role="tree" aria-label="目录">
        <div class="${classNames("asset-library-directory-row", "root", rootSelected && "current")}" role="treeitem" aria-level="1" aria-selected="${rootSelected}"${rootChildren.length ? ` aria-expanded="${rootExpanded}"` : ""} style="--asset-directory-level:1">
          ${rootChildren.length
            ? renderToggle({ id: "", expanded: rootExpanded, root: true })
            : '<span class="asset-library-directory-toggle-spacer" aria-hidden="true"></span>'}
          <button class="asset-library-directory-select" type="button" data-library-directory-select="" title="默认目录">
            ${icon("folder")}
            <span>默认目录</span>
          </button>
          <span class="asset-library-directory-check" aria-hidden="true">${rootSelected ? icon("check") : ""}</span>
        </div>
        ${rootExpanded ? renderRows(null, 2) : ""}
      </div>
    `;
  }

  function renderRenameField({ id, kind, name }) {
    const safeId = escapeHtml(id);
    const safeKind = escapeHtml(kind);
    const safeName = escapeHtml(name);
    return `
      <input type="text" value="${safeName}" aria-label="重命名 ${safeName}" autocomplete="off" spellcheck="false" data-library-rename-input="${safeId}" data-library-item-kind="${safeKind}">
    `;
  }

  function renderNameBar({ id, kind, name, meta, renaming, mutable }) {
    const safeId = escapeHtml(id);
    const safeKind = escapeHtml(kind);
    const safeName = escapeHtml(name);
    const safeMeta = escapeHtml(meta);
    const renameKeyboardAttrs = mutable && !renaming
      ? ` tabindex="0" aria-label="名称 ${safeName}，按 Enter 或 F2 重命名"`
      : "";
    return `
      <div class="asset-library-card-namebar"${mutable ? ` data-library-rename="${safeId}" data-library-item-kind="${safeKind}"${renameKeyboardAttrs}` : ""}>
        ${renaming
          ? renderRenameField({ id, kind, name })
          : `<span class="asset-library-card-name" title="${safeName}">${safeName}</span>`}
        ${safeMeta ? `<span class="asset-library-card-meta">${safeMeta}</span>` : ""}
      </div>
    `;
  }

  function renderFolderCard(options = {}) {
    const folder = options.folder && typeof options.folder === "object" ? options.folder : {};
    const id = folder.id ?? "";
    const name = folder.name ?? "未命名文件夹";
    const space = resolveSpace(options.space, folder);
    const mutable = options.mutable !== false && space !== "platform";
    const menuOpen = mutable && Boolean(options.menuOpen);
    const renaming = mutable && Boolean(options.renaming);
    const safeId = escapeHtml(id);
    const safeName = escapeHtml(name);
    const safeKind = escapeHtml(folder.kind ?? "media");

    return `
      <article class="${classNames("asset-library-card", "asset-library-folder-card", menuOpen && "menu-open", renaming && "renaming", !mutable && "readonly")}" data-library-folder="${safeId}" data-library-space="${space}" data-library-item-kind="${safeKind}">
        <button class="asset-library-card-preview asset-library-folder-preview" type="button" aria-label="打开文件夹 ${safeName}" data-library-folder-open="${safeId}">
          ${icon("folder")}
        </button>
        ${renderNameBar({ id, kind: "folder", name, meta: "", renaming, mutable })}
        ${renderCardControls({ id, kind: "folder", selected: false, selectionMode: false, menuOpen, mutable, space })}
      </article>
    `;
  }

  function normalizeMediaKind(media) {
    const mediaKind = media?.mediaKind || media?.type;
    if (mediaKind === "video" || mediaKind === "audio") return mediaKind;
    return "image";
  }

  function safeMediaUrl(value) {
    const url = String(value ?? "").trim();
    if (!url) return "";
    if (/[\u0000-\u001f\u007f<>"']/.test(url)) return "";

    const compact = url.replace(/[\u0000-\u0020]+/g, "");
    const scheme = compact.match(/^([a-z][a-z\d+.-]*):/i)?.[1]?.toLowerCase();
    if (scheme && !["http", "https", "blob"].includes(scheme)) {
      const safeDataMedia = /^data:(?:image\/(?:avif|gif|jpe?g|png|webp)|video\/(?:mp4|ogg|webm)|audio\/(?:aac|mpeg|ogg|wav|webm))(?:;|,)/i;
      if (!safeDataMedia.test(compact)) return "";
    }
    return escapeHtml(url);
  }

  function renderAudioWave() {
    return `
      <span class="audio-wave" aria-hidden="true">
        <i></i><i></i><i></i><i></i><i></i>
      </span>
    `;
  }

  function renderStructuredPreview(media) {
    if (!media || typeof media !== "object") return icon("image");
    const mediaKind = normalizeMediaKind(media);
    const url = safeMediaUrl(media.url);
    const thumbnailUrl = safeMediaUrl(media.thumbnailUrl);

    if (mediaKind === "audio") return renderAudioWave();
    if (mediaKind === "video") {
      if (url) {
        return `
          <video src="${url}"${thumbnailUrl ? ` poster="${thumbnailUrl}"` : ""} muted playsinline preload="metadata" draggable="false"></video>
          <span class="video-play" aria-hidden="true">▶</span>
        `;
      }
      if (thumbnailUrl) {
        return `
          <img src="${thumbnailUrl}" alt="" loading="lazy" draggable="false">
          <span class="video-play" aria-hidden="true">▶</span>
        `;
      }
      return icon("circle-play", "video-play");
    }

    const imageUrl = thumbnailUrl || url;
    return imageUrl
      ? `<img src="${imageUrl}" alt="" loading="lazy" draggable="false">`
      : icon("image");
  }

  function getItemActions({ kind, space, mediaKind = null, allowedActions = null, mutable = true }) {
    return actionsForSpace(
      kind === "folder" ? FOLDER_ACTIONS : kind === "entity" ? ENTITY_ACTIONS : ITEM_ACTIONS,
      space,
      allowedActions,
    ).filter((action) => mutable || (kind === "entity" && space !== "platform" && action.id === "view-media"))
      .filter((action) => action.id !== "review" || kind !== "media" || mediaKind !== "audio");
  }

  function renderItemMenu({ id, kind, space, mediaKind = null, allowedActions = null, mutable = true }) {
    const safeId = escapeHtml(id);
    const safeKind = escapeHtml(kind);
    const itemLabel = safeKind === "folder" ? "文件夹" : safeKind === "entity" ? "主体" : "素材";
    const actions = getItemActions({ kind, space, mediaKind, allowedActions, mutable });
    return `
      <div class="asset-library-item-menu" popover="manual" role="menu" aria-label="${itemLabel}操作">
        ${actions.map((action) => `
          <button class="${action.danger ? "danger" : ""}" type="button" role="menuitem" data-library-menu-item="${action.id}" data-library-item-id="${safeId}" data-library-item-kind="${safeKind}"${action.id === "rename" ? ` data-library-rename="${safeId}"` : ""}${action.id === "edit" ? ` data-library-edit-entity="${safeId}"` : ""}>
            ${icon(action.icon)}
            <span>${action.label}</span>
          </button>
        `).join("")}
      </div>
    `;
  }

  function renderCardControls({ id, kind, selected, selectionMode, menuOpen, mutable, selectable = true, space, mediaKind = null, allowedActions = null }) {
    const safeId = escapeHtml(id);
    const safeKind = escapeHtml(kind);
    const hasMenuActions = getItemActions({ kind, space, mediaKind, allowedActions, mutable }).length > 0;
    return `
      ${kind !== "folder" && selectable && (mutable || space === "platform")
        ? `
          <button class="${classNames("asset-library-selection-button", selected && "active")}" type="button" aria-label="${selected ? "取消选择" : "选择"}" aria-pressed="${selected}" data-library-select="${safeId}" data-library-item-kind="${safeKind}">
            ${selected ? icon("check") : ""}
          </button>
        `
        : ""}
      ${hasMenuActions
        ? `
          <button class="asset-library-more-button" type="button" aria-label="更多操作" aria-haspopup="menu" aria-expanded="${menuOpen}" data-library-menu-toggle="${safeId}" data-library-item-kind="${safeKind}">
            ${icon("ellipsis-vertical")}
          </button>
          ${menuOpen ? renderItemMenu({ id, kind, space, mediaKind, allowedActions, mutable }) : ""}
        `
        : ""}
    `;
  }

  function renderMediaCard(options = {}) {
    const media = options.media && typeof options.media === "object" ? options.media : {};
    const id = media.id ?? "";
    const name = options.name ?? media.name ?? "未命名素材";
    const space = resolveSpace(options.space, media);
    const mutable = canMutate(options.mutable, space);
    const selectionEnabled = mutable || space === "platform";
    const selectionMode = selectionEnabled && Boolean(options.selectionMode);
    const selected = selectionEnabled && Boolean(options.selected);
    const menuOpen = mutable && Boolean(options.menuOpen);
    const renaming = mutable && Boolean(options.renaming);
    const safeId = escapeHtml(id);
    const safeName = escapeHtml(name);
    const mediaKind = normalizeMediaKind(media);

    return `
      <article class="${classNames("asset-library-card", "asset-library-media-card", selected && "selected", selectionMode && "selection-mode", menuOpen && "menu-open", renaming && "renaming", !mutable && "readonly")}" draggable="true" data-library-media="${safeId}" data-library-space="${space}" data-library-media-kind="${mediaKind}">
        <button class="asset-library-card-preview" type="button" aria-label="预览 ${safeName}" data-library-preview="${safeId}" data-library-item-kind="media">
          ${renderStructuredPreview(media)}
        </button>
        ${renderNameBar({ id, kind: "media", name, meta: options.meta ?? "", renaming, mutable })}
        ${renderCardControls({ id, kind: "media", selected, selectionMode, menuOpen, mutable, selectable: selectionEnabled, space, mediaKind })}
      </article>
    `;
  }

  const gridMarkup = new WeakMap();
  const regionMarkup = new WeakMap();

  function syncAttributes(target, source) {
    for (const attribute of [...target.attributes]) {
      if (!source.hasAttribute(attribute.name)) target.removeAttribute(attribute.name);
    }
    for (const attribute of source.attributes) {
      if (target.getAttribute(attribute.name) !== attribute.value) target.setAttribute(attribute.name, attribute.value);
    }
  }

  function rememberRegion(element) {
    regionMarkup.set(element, { outer: element.outerHTML, inner: element.innerHTML });
  }

  function syncCardRegion(target, source) {
    const previous = regionMarkup.get(target);
    const next = { outer: source.outerHTML, inner: source.innerHTML };
    if (previous?.outer === next.outer) return;
    syncAttributes(target, source);
    // Keep a loaded video/image connected when only the surrounding control or
    // its accessible name changes. Compare source markup, before icon hydration.
    if (previous?.inner !== next.inner) target.replaceChildren(...source.childNodes);
    regionMarkup.set(target, next);
  }

  function gridItemKey(element) {
    for (const kind of ["folder", "media", "entity"]) {
      const id = element.getAttribute(`data-library-${kind}`);
      if (id !== null) return `${element.dataset.librarySpace}:${kind}:${id}`;
    }
    return "empty";
  }

  function syncGrid(grid, markup) {
    if (gridMarkup.get(grid) === markup) return;
    const template = grid.ownerDocument.createElement("template");
    template.innerHTML = markup;
    const existing = new Map([...grid.children].map((element) => [gridItemKey(element), element]));
    let position = grid.firstElementChild;
    for (const source of [...template.content.children]) {
      const key = gridItemKey(source);
      let target = existing.get(key);
      if (!target) {
        target = source;
        [...target.children].forEach(rememberRegion);
      } else {
        syncAttributes(target, source);
        const regions = new Map([...target.children].map((region) => [region.classList[0] || region.tagName, region]));
        let regionPosition = target.firstElementChild;
        for (const nextRegion of [...source.children]) {
          const regionKey = nextRegion.classList[0] || nextRegion.tagName;
          let region = regions.get(regionKey);
          if (region && region.tagName === nextRegion.tagName) syncCardRegion(region, nextRegion);
          else {
            region = nextRegion;
            rememberRegion(region);
          }
          if (region !== regionPosition) target.insertBefore(region, regionPosition);
          regionPosition = region.nextElementSibling;
          regions.delete(regionKey);
        }
        regions.forEach((region) => region.remove());
      }
      if (target !== position) grid.insertBefore(target, position);
      position = target.nextElementSibling;
      existing.delete(key);
    }
    existing.forEach((element) => element.remove());
    gridMarkup.set(grid, markup);
  }

  function renderEntityCard(options = {}) {
    const entity = options.entity && typeof options.entity === "object" ? options.entity : {};
    const id = entity.id ?? "";
    const name = options.name ?? entity.name ?? "未命名主体";
    const space = resolveSpace(options.space, entity);
    const mutable = canMutate(options.mutable, space);
    const entityActions = getItemActions({ kind: "entity", space, allowedActions: options.allowedActions, mutable });
    const canRename = mutable && entityActions.some((action) => action.id === "rename");
    const selectionMode = mutable && Boolean(options.selectionMode);
    const selected = mutable && Boolean(options.selected);
    const menuOpen = entityActions.length > 0 && Boolean(options.menuOpen);
    const renaming = canRename && Boolean(options.renaming);
    const previews = (Array.isArray(options.mediaPreviews) ? options.mediaPreviews : [])
      .filter((preview) => preview && typeof preview === "object");
    const explicitCover = options.coverPreview &&
      typeof options.coverPreview === "object" &&
      normalizeMediaKind(options.coverPreview) !== "audio"
      ? options.coverPreview
      : null;
    const coverPreview = explicitCover || previews.find((preview) => normalizeMediaKind(preview) !== "audio") || null;
    const safeId = escapeHtml(id);
    const safeName = escapeHtml(name);
    const cover = coverPreview ? renderStructuredPreview(coverPreview) : icon("user-round");

    return `
      <article class="${classNames("asset-library-card", "asset-library-entity-card", selected && "selected", selectionMode && "selection-mode", menuOpen && "menu-open", renaming && "renaming", !mutable && "readonly")}" data-library-entity="${safeId}" data-library-space="${space}">
        <button class="asset-library-card-preview" type="button" aria-label="打开主体 ${safeName}" data-library-preview="${safeId}" data-library-item-kind="entity">
          <span class="asset-library-entity-cover" data-library-entity-cover="${coverPreview ? "media" : "placeholder"}">${cover}</span>
        </button>
        ${renderNameBar({ id, kind: "entity", name, meta: "", renaming, mutable: canRename })}
        ${renderCardControls({ id, kind: "entity", selected, selectionMode, menuOpen, mutable, space, allowedActions: options.allowedActions })}
      </article>
    `;
  }

  function renderEntityMediaFilter({ entity = null, status = "ready", unavailableCount = 0 } = {}) {
    const name = status === "unavailable" ? "主体已不可用" : entity?.name || "未命名主体";
    const missingCount = Number.isFinite(Number(unavailableCount)) ? Math.max(0, Math.floor(Number(unavailableCount))) : 0;
    const detail = missingCount ? `跨目录 · ${missingCount} 项素材不可用` : "跨目录";
    return `<div class="asset-library-entity-filter" data-library-entity-filter="true">
      <div class="asset-library-entity-filter-label"><span>关联主体</span><strong title="${escapeHtml(name)}">${escapeHtml(name)}</strong><small>${detail}</small></div>
      <button type="button" data-library-clear-entity-filter="true" aria-label="清除主体筛选" title="清除主体筛选">${icon("x")}</button>
    </div>`;
  }

  function renderEmptyState(options = {}) {
    const space = normalizeSpace(options.space);
    const section = space === "platform" ? "media" : normalizeSection(options.section);
    const mutable = canMutate(options.mutable, space);
    const canCreateEntity = mutable && options.canCreateEntity !== false;
    const canUploadMedia = mutable && options.canUploadMedia !== false;
    const hasQuery = Boolean(options.hasQuery);

    let iconName;
    let title;
    let description;
    let action = "";

    if (options.entityFilterStatus === "unavailable") {
      iconName = "user-round";
      title = "主体已不可用";
      description = "该主体已删除或不在当前空间，清除主体筛选以查看素材库。";
      action = `<button type="button" data-library-clear-entity-filter="true">清除主体筛选</button>`;
    } else if (hasQuery) {
      iconName = "search-x";
      title = "没有匹配结果";
      description = "试试其他关键词，或清除当前搜索与筛选条件。";
      action = `<button type="button" data-library-clear-query="true" data-library-clear-filter="true">清除筛选</button>`;
    } else if (options.entityFilterStatus) {
      iconName = "images";
      title = "没有可用的关联素材";
      description = "该主体没有当前空间可访问的素材。";
      action = `<button type="button" data-library-clear-entity-filter="true">清除主体筛选</button>`;
    } else if (space === "platform") {
      iconName = "sparkles";
      title = "暂无灵感素材";
      description = "试试其他关键词或素材类型。";
    } else if (section === "entity") {
      iconName = "user-round";
      title = canCreateEntity ? "还没有主体" : "暂无可用主体";
      description = canCreateEntity ? "新建主体，把相关图片、视频和音频整理在一起。" : "这个空间暂时没有可用主体。";
      action = canCreateEntity
        ? `<button type="button" data-library-create-entity="true">新建主体</button>`
        : "";
    } else {
      iconName = "image";
      title = canUploadMedia ? "还没有素材" : "暂无可用素材";
      description = canUploadMedia ? "上传图片、视频或音频，开始建立素材库。" : "这个空间暂时没有可用素材。";
      action = canUploadMedia
        ? `<button type="button" data-library-upload="true">上传素材</button>`
        : "";
    }

    return `
      <div class="asset-library-empty" data-library-empty="${section}" data-library-space="${space}">
        <div>
          ${icon(iconName)}
          <strong>${title}</strong>
          <span>${description}</span>
          ${action}
        </div>
      </div>
    `;
  }

  function renderMovePopover(options = {}) {
    const folders = Array.isArray(options.folders) ? options.folders : [];
    const space = normalizeSpace(options.space);
    if (space === "platform" || options.mutable === false) return "";
    const currentFolderId = String(options.currentFolderId ?? "");
    const excludedIds = new Set((Array.isArray(options.excludedFolderIds) ? options.excludedFolderIds : []).map(String));
    const foldersById = new Map(folders.map((folder) => [String(folder?.id || ""), folder]));
    const childrenByParent = new Map();
    for (const folder of folders) {
      const id = String(folder?.id || "");
      if (!id || excludedIds.has(id)) continue;
      const parentId = folder?.parentId == null ? "" : String(folder.parentId);
      const parentKey = foldersById.has(parentId) && !excludedIds.has(parentId) ? parentId : "";
      const children = childrenByParent.get(parentKey) || [];
      children.push(folder);
      childrenByParent.set(parentKey, children);
    }
    const renderDestination = ({ id, name, iconName = "folder", level = 0, path = name }) => {
      const rawId = String(id ?? "");
      const safeId = escapeHtml(rawId);
      const safeName = escapeHtml(name);
      const safePath = escapeHtml(path);
      const current = rawId === currentFolderId;
      return `
        <button class="${current ? "current" : ""}" type="button" data-library-move-target="${safeId}" title="${safePath}" style="--asset-move-level:${level}"${current ? ' disabled aria-disabled="true" aria-current="true"' : ""}>
          ${icon(iconName)}
          <span>${safeName}</span>
        </button>
      `;
    };
    const renderChildren = (parentId = "", level = 1, parentPath = "默认目录", ancestry = new Set()) => {
      return (childrenByParent.get(parentId) || []).map((folder) => {
        const id = String(folder?.id || "");
        if (!id || ancestry.has(id)) return "";
        const name = String(folder?.name || "未命名文件夹");
        const path = `${parentPath} / ${name}`;
        const nextAncestry = new Set(ancestry);
        nextAncestry.add(id);
        return renderDestination({ id, name, level, path }) + renderChildren(id, level + 1, path, nextAncestry);
      }).join("");
    };
    const destinations = renderChildren();

    return `
      <section class="asset-library-move-popover" role="dialog" aria-label="移动到文件夹" data-library-move-popover="true" data-library-space="${space}">
        <header>
          <strong>移动到</strong>
          <button type="button" aria-label="关闭" data-library-move-close="true">${icon("x")}</button>
        </header>
        ${renderDestination({ id: "", name: "默认目录", iconName: "house", path: "默认目录" })}
        ${destinations || `<div class="asset-library-move-empty">暂无其他文件夹</div>`}
      </section>
    `;
  }

  root.REELAY_CANVAS_ASSET_LIBRARY_VIEW = Object.freeze({
    renderCommandBar,
    renderDirectoryTree,
    renderFolderCard,
    renderMediaCard,
    renderEntityCard,
    renderEntityMediaFilter,
    renderEmptyState,
    renderMovePopover,
    syncGrid,
  });
}(typeof globalThis === "object" ? globalThis : window));
