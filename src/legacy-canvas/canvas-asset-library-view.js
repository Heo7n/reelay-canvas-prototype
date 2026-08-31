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

  const FOLDER_ACTIONS = Object.freeze([
    { id: "rename", icon: "pencil", label: "重命名" },
    { id: "move", icon: "folder-input", label: "移动" },
    { id: "share-organization", icon: "users", label: "共享到组织空间", personalOnly: true },
    { id: "delete", icon: "trash-2", label: "删除", danger: true },
  ]);

  const BATCH_ACTIONS = Object.freeze([
    { id: "review", icon: "shield-check", label: "提交 Seedance 合规审核" },
    { id: "move", icon: "folder-input", label: "移动" },
    { id: "share-organization", icon: "users", label: "共享到组织空间", personalOnly: true },
    { id: "delete", icon: "trash-2", label: "删除", danger: true },
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

  function actionsForSpace(actions, space) {
    return actions.filter((action) => !action.personalOnly || space === "personal");
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

  function renderBatchMenu(space, reviewableSelection) {
    const actions = actionsForSpace(BATCH_ACTIONS, space)
      .filter((action) => action.id !== "review" || reviewableSelection);
    return `
      <div class="asset-library-toolbar-menu" role="menu" aria-label="批量操作">
        ${actions.map((action) => `
          <button class="${action.danger ? "danger" : ""}" type="button" role="menuitem" data-library-batch-action="${action.id}">
            ${icon(action.icon)}
            <span>${action.label}</span>
          </button>
        `).join("")}
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
    const section = normalizeSection(options.section);
    const space = normalizeSpace(options.space);
    const mutable = canMutate(options.mutable, space);
    const selectionMode = mutable && Boolean(options.selectionMode);
    const selectedCount = Number.isFinite(Number(options.selectedCount))
      ? Math.max(0, Math.floor(Number(options.selectedCount)))
      : 0;
    const filter = normalizeFilter(options.filter, section);
    const display = normalizeDisplay(options.display);
    const requestedMenu = normalizeMenu(options.menu);
    const reviewableSelection = options.reviewableSelection !== false;
    const menu = selectionMode && requestedMenu === "batch"
      ? "batch"
      : section === "media" && requestedMenu === "filter"
        ? "filter"
        : "";

    const leadingCommand = !mutable
      ? `
        <button class="asset-library-readonly-command" type="button" disabled aria-disabled="true">
          ${icon("eye")}
          <span>仅可查看</span>
        </button>
      `
      : selectionMode
        ? `
          <div class="asset-library-command-popover">
            <button class="asset-library-primary-command" type="button" aria-haspopup="menu" aria-expanded="${menu === "batch"}" aria-label="操作，已选 ${selectedCount} 项" data-library-batch-toggle="true">
              ${icon("list")}
              <span>操作</span>
              ${icon("chevron-down")}
            </button>
            ${menu === "batch" ? renderBatchMenu(space, reviewableSelection) : ""}
          </div>
        `
        : section === "entity"
          ? `
            <button class="asset-library-primary-command" type="button" data-library-create-entity="true">
              ${icon("user-round-plus")}
              <span>创建主体</span>
            </button>
          `
          : `
            <button class="asset-library-primary-command" type="button" data-library-upload="true">
              ${icon("upload")}
              <span>上传</span>
            </button>
          `;

    const selectionControl = mutable && !selectionMode
      ? `
        <button type="button" title="多选" aria-label="进入多选" aria-pressed="false" data-library-selection-toggle="true">
          ${icon("square-check-big")}
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
      <div class="${classNames("asset-library-commandbar", selectionMode && "selection-mode", !mutable && "readonly")}" data-library-commandbar="${section}" data-library-space="${space}" data-library-active-filter="${filter}" data-library-active-display="${display}" data-library-open-menu="${menu}" data-library-selection-mode="${selectionMode}">
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

  function renderItemMenu({ id, kind, space, mediaKind = null }) {
    const safeId = escapeHtml(id);
    const safeKind = escapeHtml(kind);
    const itemLabel = safeKind === "folder" ? "文件夹" : safeKind === "entity" ? "主体" : "素材";
    const actions = actionsForSpace(kind === "folder" ? FOLDER_ACTIONS : ITEM_ACTIONS, space)
      .filter((action) => action.id !== "review" || kind !== "media" || mediaKind !== "audio");
    return `
      <div class="asset-library-item-menu" role="menu" aria-label="${itemLabel}操作">
        ${actions.map((action) => `
          <button class="${action.danger ? "danger" : ""}" type="button" role="menuitem" data-library-menu-item="${action.id}" data-library-item-id="${safeId}" data-library-item-kind="${safeKind}"${action.id === "rename" ? ` data-library-rename="${safeId}"` : ""}>
            ${icon(action.icon)}
            <span>${action.label}</span>
          </button>
        `).join("")}
      </div>
    `;
  }

  function renderCardControls({ id, kind, selected, selectionMode, menuOpen, mutable, space, mediaKind = null }) {
    const safeId = escapeHtml(id);
    const safeKind = escapeHtml(kind);
    return `
      ${selectionMode
        ? `
          <button class="${classNames("asset-library-selection-button", selected && "active")}" type="button" aria-label="${selected ? "取消选择" : "选择"}" aria-pressed="${selected}" data-library-select="${safeId}" data-library-item-kind="${safeKind}">
            ${icon(selected ? "check" : "plus")}
          </button>
        `
        : ""}
      ${mutable
        ? `
          <button class="asset-library-more-button" type="button" aria-label="更多操作" aria-haspopup="menu" aria-expanded="${menuOpen}" data-library-menu-toggle="${safeId}" data-library-item-kind="${safeKind}">
            ${icon("ellipsis-vertical")}
          </button>
          ${menuOpen ? renderItemMenu({ id, kind, space, mediaKind }) : ""}
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
    const selectionMode = mutable && Boolean(options.selectionMode);
    const selected = mutable && Boolean(options.selected);
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
        ${renderCardControls({ id, kind: "media", selected, selectionMode, menuOpen, mutable, space, mediaKind })}
      </article>
    `;
  }

  function renderEntityCard(options = {}) {
    const entity = options.entity && typeof options.entity === "object" ? options.entity : {};
    const id = entity.id ?? "";
    const name = options.name ?? entity.name ?? "未命名主体";
    const space = resolveSpace(options.space, entity);
    const mutable = canMutate(options.mutable, space);
    const selectionMode = mutable && Boolean(options.selectionMode);
    const selected = mutable && Boolean(options.selected);
    const menuOpen = mutable && Boolean(options.menuOpen);
    const renaming = mutable && Boolean(options.renaming);
    const previews = (Array.isArray(options.mediaPreviews) ? options.mediaPreviews : []).slice(0, 4);
    const mediaCount = options.mediaCount ?? previews.length;
    const safeId = escapeHtml(id);
    const safeName = escapeHtml(name);
    const safeCount = escapeHtml(mediaCount);
    const collage = previews.length
      ? previews.map((preview) => `<span>${renderStructuredPreview(preview)}</span>`).join("")
      : `<span>${icon("user-round")}</span>`;

    return `
      <article class="${classNames("asset-library-card", "asset-library-entity-card", selected && "selected", selectionMode && "selection-mode", menuOpen && "menu-open", renaming && "renaming", !mutable && "readonly")}" data-library-entity="${safeId}" data-library-space="${space}">
        <button class="asset-library-card-preview" type="button" aria-label="预览主体 ${safeName}" data-library-preview="${safeId}" data-library-item-kind="entity">
          <span class="asset-library-entity-collage">${collage}</span>
          <span class="asset-library-entity-badge">${safeCount} 个素材</span>
        </button>
        ${renderNameBar({ id, kind: "entity", name, meta: options.meta ?? "", renaming, mutable })}
        ${renderCardControls({ id, kind: "entity", selected, selectionMode, menuOpen, mutable, space })}
      </article>
    `;
  }

  function renderEmptyState(options = {}) {
    const section = normalizeSection(options.section);
    const space = normalizeSpace(options.space);
    const mutable = canMutate(options.mutable, space);
    const hasQuery = Boolean(options.hasQuery);

    let iconName;
    let title;
    let description;
    let action = "";

    if (hasQuery) {
      iconName = "search-x";
      title = "没有匹配结果";
      description = "试试其他关键词，或清除当前搜索与筛选条件。";
      action = `<button type="button" data-library-clear-query="true" data-library-clear-filter="true">清除筛选</button>`;
    } else if (section === "entity") {
      iconName = "user-round";
      title = mutable ? "还没有主体" : "暂无可用主体";
      description = mutable ? "创建主体，把相关图片、视频和音频整理在一起。" : "这个空间暂时没有可用主体。";
      action = mutable
        ? `<button type="button" data-library-create-entity="true">创建主体</button>`
        : "";
    } else {
      iconName = "image";
      title = mutable ? "还没有素材" : "暂无可用素材";
      description = mutable ? "上传图片、视频或音频，开始建立素材库。" : "这个空间暂时没有可用素材。";
      action = mutable
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
    renderEmptyState,
    renderMovePopover,
  });
}(typeof globalThis === "object" ? globalThis : window));
