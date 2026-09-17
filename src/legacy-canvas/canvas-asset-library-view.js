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
    { id: "set-tags", icon: "tags", label: "设置标签" },
    { id: "review", icon: "shield-check", label: "提交合规审核" },
    { id: "move", icon: "folder-input", label: "移动" },
    { id: "share-organization", icon: "users", label: "共享到组织空间", personalOnly: true },
    { id: "delete", icon: "trash-2", label: "删除", danger: true },
  ]);

  const ENTITY_ACTIONS = Object.freeze([
    { id: "edit", icon: "pencil-line", label: "编辑主体" },
    { id: "rename", icon: "pencil", label: "重命名" },
    { id: "set-tags", icon: "tags", label: "设置标签" },
    { id: "delete", icon: "trash-2", label: "删除", danger: true },
  ]);

  const FOLDER_ACTIONS = Object.freeze([
    { id: "rename", icon: "pencil", label: "重命名" },
    { id: "move", icon: "folder-input", label: "移动" },
    { id: "share-organization", icon: "users", label: "共享到组织空间", personalOnly: true },
    { id: "delete", icon: "trash-2", label: "删除", danger: true },
  ]);

  const BATCH_ACTIONS = Object.freeze([
    { id: "add-canvas", label: "添加到画布" },
    { id: "create-group", label: "新建主体" },
    { id: "set-tags", icon: "tags", label: "设置标签" },
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
    return section === "all" ? "all" : section === "entity" || section === "entities" ? "entity" : "media";
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

  function normalizeMenu(menu) {
    return ["filter", "batch", "select-kind", "add"].includes(menu) ? menu : "";
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

  function normalizeTagFilter(value = {}) {
    const untagged = value?.untagged === true;
    return {
      tagIds: untagged ? [] : [...new Set((Array.isArray(value?.tagIds) ? value.tagIds : []).map((id) => String(id).trim()).filter(Boolean))],
      untagged,
    };
  }

  function renderFilterMenu(options, activeFilter) {
    const draft = options.filterDraft || { mediaKind: activeFilter, ...normalizeTagFilter(options.tagFilter) };
    const mediaKind = normalizeFilter(draft.mediaKind, options.section);
    const subjectZone = options.subjectZone === true || normalizeSection(options.section) === "entity";
    const platform = normalizeSpace(options.space) === "platform";
    const { tagIds, untagged } = normalizeTagFilter(draft);
    const selectedTags = new Set(tagIds);
    const builtins = platform ? [] : [
      { id: "builtin:character", name: "角色" },
      { id: "builtin:scene", name: "场景" },
      { id: "builtin:object", name: "物品" },
    ];
    const seen = new Set(builtins.map((tag) => tag.id));
    const tags = [...builtins];
    for (const tag of Array.isArray(options.tags) ? options.tags : []) {
      const id = String(tag?.id || "");
      const name = String(tag?.name || "").trim();
      if (!id || !name || seen.has(id) || id.startsWith("builtin:")
        || (tag.space && normalizeSpace(tag.space) !== normalizeSpace(options.space))) continue;
      seen.add(id);
      tags.push({ id, name });
    }
    const tagsAvailable = options.tagsAvailable !== false;
    return `
      <section class="asset-library-filter-popover" role="dialog" aria-label="筛选" data-library-filter-popover="true">
        <header><strong>筛选</strong><button type="button" data-library-filter-reset="true">重置</button></header>
        <div class="asset-library-filter-body">
          ${subjectZone || platform ? "" : `<fieldset><legend>类型</legend>
            <div class="asset-library-filter-types" role="group" aria-label="素材类型">
              ${FILTERS.map((filter) => `<button class="${filter.id === mediaKind ? "active" : ""}" type="button" aria-pressed="${filter.id === mediaKind}" data-library-filter="${filter.id}">${filter.label}</button>`).join("")}
            </div>
          </fieldset>`}
          <fieldset${tagsAvailable ? "" : " disabled"}><legend>${platform ? "镜头特征" : "标签"}</legend>
            <div class="asset-library-filter-tags" role="group" aria-label="标签">
              ${tags.map((tag) => `<button class="${selectedTags.has(tag.id) ? "active" : ""}" type="button" aria-pressed="${selectedTags.has(tag.id)}" data-library-filter-tag="${escapeHtml(tag.id)}" title="${escapeHtml(tag.name)}">${escapeHtml(tag.name)}</button>`).join("")}
              ${platform ? "" : `<button class="${untagged ? "active" : ""}" type="button" aria-pressed="${untagged}" data-library-filter-untagged="true">未标记</button>`}
            </div>
          </fieldset>
        </div>
        <footer>${options.canManageTags ? '<button class="asset-library-manage-tags" type="button" data-library-manage-tags="true">管理标签</button>' : ""}<button type="button" data-library-filter-cancel="true">取消</button><button class="asset-library-filter-apply" type="button" data-library-filter-apply="true">应用</button></footer>
      </section>
    `;
  }

  function getBatchActions(space, reviewableSelection, section, allowedActions = null) {
    const actions = space === "platform" ? PLATFORM_BATCH_ACTIONS : BATCH_ACTIONS;
    return actionsForSpace(actions, space, allowedActions)
      .filter((action) => section !== "entity" || ["add-canvas", "set-tags", "delete"].includes(action.id))
      .filter((action) => action.id !== "create-group" || section === "all" || section === "media")
      .filter((action) => action.id !== "review" || (section !== "entity" && reviewableSelection));
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
          const label = action.id === "add-canvas"
            ? String(options.addLabel || (options.subjectZone ? "使用所含素材" : action.label)) : action.label;
          const available = isBatchActionAvailable(action, space, options);
          return `
            <button class="${action.danger ? "danger" : ""}" type="button" role="menuitem"${available
              ? ` data-library-batch-action="${action.id}"`
              : ` disabled aria-disabled="true" aria-label="${action.label}，暂未接入" title="暂未接入" data-library-batch-unavailable="${action.id}"`}>
              ${action.icon ? icon(action.icon) : ""}<span>${escapeHtml(label)}</span>
              ${available ? "" : '<small aria-hidden="true">暂未接入</small>'}
            </button>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderCommandBar(options = {}) {
    const space = normalizeSpace(options.space);
    const section = space === "platform" ? "media" : options.subjectZone ? "entity" : normalizeSection(options.section);
    const mutable = canMutate(options.mutable, space);
    const referencePicking = Boolean(options.referencePicking);
    const canCreateEntity = mutable && options.canCreateEntity !== false;
    const canUploadMedia = mutable && options.canUploadMedia !== false;
    const canCreateFolder = mutable && options.canCreateFolder === true;
    const folderDepthLimit = Number(options.folderDepth) >= 5;
    const selectedCount = Number.isFinite(Number(options.selectedCount))
      ? Math.max(0, Math.floor(Number(options.selectedCount)))
      : 0;
    const filter = normalizeFilter(options.filter, section);
    const tagFilter = normalizeTagFilter(options.tagFilter);
    const filterCount = space === "platform" ? Number(options.discoveryCount || 0) : Number(filter !== "all") + (tagFilter.untagged ? 1 : tagFilter.tagIds.length);
    const requestedMenu = normalizeMenu(options.menu);
    const reviewableSelection = options.reviewableSelection !== false;
    const batchActions = getBatchActions(space, reviewableSelection, section, options.allowedBatchActions);
    const hasBatchActions = batchActions.length > 0;
    const hasExecutableBatchActions = batchActions.some((action) => isBatchActionAvailable(action, space, options));
    const selectionEnabled = !referencePicking && hasBatchActions && hasExecutableBatchActions && (mutable || space === "platform");
    const selectionMode = selectionEnabled && Boolean(options.selectionMode);
    const hasSelection = selectedCount > 0;
    const menu = selectionMode && hasSelection && requestedMenu === "batch"
      ? "batch"
      : requestedMenu === "filter"
        ? "filter"
        : selectionMode && requestedMenu === "select-kind" ? "select-kind"
          : !referencePicking && !selectionMode && !options.entityFilter && section !== "entity" && (canUploadMedia || canCreateFolder) && requestedMenu === "add" ? "add" : "";

    const leadingCommand = referencePicking ? "" : selectionMode
      ? `<div class="asset-library-command-popover">
          <button class="asset-library-primary-command asset-library-batch-command" type="button" aria-haspopup="menu" aria-expanded="${menu === "batch"}" aria-label="${hasSelection ? `操作，已选 ${selectedCount} 项` : "操作，尚未选择资产"}" data-library-batch-toggle="true"${hasSelection ? "" : ' disabled aria-disabled="true"'}>
            ${icon("list-checks")}<span>操作</span>
          </button>
          ${menu === "batch" ? renderBatchMenu(batchActions, space, { ...options, subjectZone: section === "entity" }) : ""}
        </div>`
      : options.entityFilter
        ? canCreateEntity ? `<button class="asset-library-primary-command" type="button" data-library-edit-current-group="true" aria-label="编辑主体" title="编辑主体">${icon("pencil")}</button>` : ""
      : space === "platform"
        ? ""
        : !mutable
          ? `
            <button class="asset-library-readonly-command" type="button" disabled aria-disabled="true" aria-label="仅可查看" title="仅可查看">
              ${icon("plus")}
            </button>
          `
        : section === "entity"
          ? canCreateEntity ? `
            <button class="asset-library-primary-command" type="button" data-library-create-entity="true" aria-label="新建主体" title="新建主体">
              ${icon("plus")}
            </button>
          ` : `
            <button class="asset-library-readonly-command" type="button" disabled aria-disabled="true" aria-label="暂不可新建" title="当前项目暂不支持新建主体">
              ${icon("plus")}
            </button>
          `
          : canUploadMedia || canCreateFolder ? `
            <div class="asset-library-command-popover">
              <button class="asset-library-primary-command" type="button" data-library-add-toggle="true" aria-label="添加资产" title="添加资产" aria-haspopup="menu" aria-expanded="${menu === "add"}">
                ${icon("plus")}
              </button>
              ${menu === "add" ? `<div class="asset-library-toolbar-menu asset-library-add-menu" role="menu" aria-label="添加资产">
                <button type="button" role="menuitem" data-library-add-folder="true"${canCreateFolder && !folderDepthLimit ? "" : ` disabled aria-disabled="true" title="${folderDepthLimit ? "最多支持五级目录" : "当前空间暂不支持新建文件夹"}"`}>${icon("folder-plus")}<span>新建文件夹</span></button>
                <button type="button" role="menuitem" data-library-upload="true"${canUploadMedia ? "" : ' disabled aria-disabled="true" title="当前项目暂不支持上传素材"'}>${icon("upload")}<span>上传资产</span></button>
              </div>` : ""}
            </div>
          ` : `
            <button class="asset-library-readonly-command" type="button" disabled aria-disabled="true" aria-label="暂不可上传" title="当前项目暂不支持上传素材">
              ${icon("plus")}
            </button>
          `;

    const selectionControl = selectionEnabled
      ? `<button class="${selectionMode ? "active" : ""}" type="button" title="多选" aria-label="${selectionMode ? "退出多选" : "进入多选"}" aria-pressed="${selectionMode}" data-library-selection-toggle="true">
          ${icon("copy-check")}
        </button>`
      : "";

    const selectionControls = `
      <button class="asset-library-select-all" type="button" data-library-select-all="true">${icon("square")}<span>全选</span></button>
      <button class="asset-library-selection-cancel" type="button" aria-label="取消多选" data-library-selection-cancel="true">${icon("x")}<span>取消</span></button>`;

    const filterControl = `
        <button class="asset-library-filter-toggle${filterCount ? " active" : ""}" type="button" title="筛选" aria-label="筛选${filterCount ? `，已应用 ${filterCount} 项条件` : ""}" aria-haspopup="dialog" ${space === "platform" ? 'aria-controls="inspirationDiscovery"' : ""} aria-expanded="${space === "platform" ? Boolean(options.discoveryExpanded) : menu === "filter"}" data-library-filter-toggle="true">
          ${icon("list-filter")}
          ${filterCount ? `<span class="asset-library-filter-count" aria-hidden="true">${filterCount}</span>` : ""}
        </button>
      `;

    return `
      <div class="${classNames("asset-library-commandbar", referencePicking && "reference-picking", space === "platform" && "platform", selectionMode && "selection-mode", !mutable && "readonly")}" data-library-commandbar="${section}" data-library-space="${space}" data-library-active-filter="${filter}" data-library-open-menu="${menu}" data-library-selection-enabled="${selectionEnabled}" data-library-selection-mode="${selectionMode}">
        ${leadingCommand ? `<div class="asset-library-leading-command"${selectionMode ? "" : " data-library-search-covered"}>${leadingCommand}</div>` : ""}
        ${selectionMode || space === "platform" ? "" : `<button class="asset-library-search-toggle" data-library-search-toggle type="button" aria-label="${options.searchReturn ? "返回搜索结果" : "搜索资产"}" title="${options.searchReturn ? "返回搜索结果" : "搜索资产"}" aria-controls="assetLibrarySearchRegion" aria-expanded="${Boolean(options.searchOpen)}">${icon("search")}</button>`}
        <div class="asset-library-command-popover">
          <div class="asset-library-command-group${selectionMode ? " selecting" : ""}">
            ${selectionMode ? selectionControls : `${filterControl}${selectionControl}`}
          </div>
          ${menu === "filter" && space !== "platform" ? renderFilterMenu({ ...options, section }, filter) : ""}
          ${menu === "select-kind" ? `<div class="asset-library-toolbar-menu" role="menu" aria-label="选择结果类型">${(options.selectionKinds || []).map(({ kind, label, count }) => `<button type="button" role="menuitem" data-library-select-kind="${escapeHtml(kind)}">全选${escapeHtml(label)}<span>${count}</span></button>`).join("")}</div>` : ""}
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
    const writableSpace = normalizeSpace(options.space) !== "platform";
    const canCreate = writableSpace && options.canCreate === true;
    const canRename = writableSpace && options.canRename === true;
    const canDelete = writableSpace && options.canDelete === true;
    const candidateDraft = options.directoryDraft;
    const draft = candidateDraft && ((candidateDraft.kind === "create" && canCreate) || (candidateDraft.kind === "rename" && canRename))
      ? { ...candidateDraft, parentId: candidateDraft.parentId == null ? null : String(candidateDraft.parentId),
        folderId: candidateDraft.folderId == null ? null : String(candidateDraft.folderId) } : null;
    const pending = draft?.pending === true;
    const disabled = pending ? ' disabled aria-disabled="true"' : "";
    const creatingUnder = (id) => draft?.kind === "create" && draft.parentId === id;
    const rootExpanded = options.rootExpanded !== false || creatingUnder(null);
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
      <button class="asset-library-directory-toggle" type="button" aria-label="${expanded ? "收起" : "展开"}目录" aria-expanded="${expanded}" ${root ? 'data-library-directory-root-toggle="true"' : `data-library-directory-toggle="${escapeHtml(id)}"`}${disabled}>
        ${icon(expanded ? "chevron-down" : "chevron-right")}
      </button>
    `;

    const renderActions = (folder, level) => {
      const id = escapeHtml(folder?.id || "");
      const name = escapeHtml(folder?.name || "默认目录");
      const actions = [];
      if (canCreate) {
        const atMaximumDepth = level >= 5;
        const label = atMaximumDepth ? "最多支持 5 级目录" : `在 ${name} 中新建文件夹`;
        actions.push(`<button class="asset-library-directory-action" type="button" data-library-directory-create="${id}" aria-label="${label}" title="${label}"${atMaximumDepth ? ' disabled aria-disabled="true"' : disabled}>${icon("plus")}</button>`);
      }
      if (folder && canRename) actions.push(`<button class="asset-library-directory-action" type="button" data-library-directory-rename="${id}" aria-label="重命名 ${name}" title="重命名"${disabled}>${icon("pencil")}</button>`);
      if (folder && canDelete) actions.push(`<button class="asset-library-directory-action danger" type="button" data-library-directory-delete="${id}" aria-label="删除 ${name}" title="删除"${disabled}>${icon("trash-2")}</button>`);
      return actions.length ? `<span class="asset-library-directory-actions-overlay">${actions.join("")}</span>` : "";
    };

    const renderDraft = (level) => {
      const label = draft.kind === "create" ? "文件夹名称" : "重命名文件夹";
      const error = String(draft.error || "");
      const errorId = "asset-library-directory-draft-error";
      return `
        <div class="asset-library-directory-draft" role="treeitem" aria-level="${level}" style="--asset-directory-level:${level}" data-library-directory-draft="${draft.kind}">
          <div class="asset-library-directory-draft-row">
            ${icon("folder")}
            <input class="asset-library-directory-draft-input" type="text" value="${escapeHtml(draft.name || "")}" aria-label="${label}" placeholder="${label}" maxlength="100" autocomplete="off" spellcheck="false" data-library-directory-draft-input="true" data-library-directory-draft-kind="${draft.kind}"${error ? ` aria-invalid="true" aria-describedby="${errorId}"` : ""}${disabled}>
            <button class="asset-library-directory-action" type="button" data-library-directory-draft-confirm="true" aria-label="${draft.kind === "create" ? "确认新建文件夹" : "确认重命名文件夹"}" title="确认"${disabled}>${icon("check")}</button>
            <button class="asset-library-directory-action" type="button" data-library-directory-draft-cancel="true" aria-label="取消目录编辑" title="取消"${disabled}>${icon("x")}</button>
          </div>
          ${error ? `<p class="asset-library-directory-draft-error" id="${errorId}" role="alert">${escapeHtml(error)}</p>` : ""}
        </div>
      `;
    };

    const renderRows = (parentId, level, ancestry = new Set()) => {
      const children = childrenByParent.get(parentId || "") || [];
      return children.map((folder) => {
        if (ancestry.has(folder.id)) return "";
        const nextAncestry = new Set(ancestry);
        nextAncestry.add(folder.id);
        const descendants = childrenByParent.get(folder.id) || [];
        const hasDraftChild = level < 5 && creatingUnder(folder.id);
        const hasChildren = descendants.length > 0 || hasDraftChild;
        const expanded = hasChildren && (expandedIds.has(folder.id) || hasDraftChild);
        const selected = folder.id === currentFolderId;
        const safeId = escapeHtml(folder.id);
        const safeName = escapeHtml(folder.name);
        const safePath = escapeHtml(pathLabel(folder));
        const row = draft?.kind === "rename" && draft.folderId === folder.id ? renderDraft(level) : `
          <div class="${classNames("asset-library-directory-row", selected && "current")}" role="treeitem" aria-level="${level}" aria-selected="${selected}"${hasChildren ? ` aria-expanded="${expanded}"` : ""} style="--asset-directory-level:${level}">
            ${hasChildren
              ? renderToggle({ id: folder.id, expanded })
              : '<span class="asset-library-directory-toggle-spacer" aria-hidden="true"></span>'}
            <button class="asset-library-directory-select" type="button" data-library-directory-select="${safeId}" title="${safePath}"${disabled}>
              ${icon("folder")}
              <span>${safeName}</span>
            </button>
            <span class="asset-library-directory-check" aria-hidden="true">${selected ? icon("check") : ""}</span>
            ${renderActions(folder, level)}
          </div>
        `;
        return `${row}${hasDraftChild ? renderDraft(level + 1) : ""}${expanded ? renderRows(folder.id, level + 1, nextAncestry) : ""}`;
      }).join("");
    };

    const rootChildren = childrenByParent.get("") || [];
    const rootSelected = currentFolderId == null;
    return `
      <div class="asset-library-directory-tree" role="tree" aria-label="目录">
        <div class="${classNames("asset-library-directory-row", "root", rootSelected && "current")}" role="treeitem" aria-level="1" aria-selected="${rootSelected}"${rootChildren.length || creatingUnder(null) ? ` aria-expanded="${rootExpanded}"` : ""} style="--asset-directory-level:1">
          ${rootChildren.length || creatingUnder(null)
            ? renderToggle({ id: "", expanded: rootExpanded, root: true })
            : '<span class="asset-library-directory-toggle-spacer" aria-hidden="true"></span>'}
          <button class="asset-library-directory-select" type="button" data-library-directory-select="" title="默认目录"${disabled}>
            ${icon("folder")}
            <span>默认目录</span>
          </button>
          <span class="asset-library-directory-check" aria-hidden="true">${rootSelected ? icon("check") : ""}</span>
          ${renderActions(null, 1)}
        </div>
        ${creatingUnder(null) ? renderDraft(2) : ""}
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
    const fileName = kind === "media" ? root.REELAY_CANVAS_FILE_NAME.splitFileName(name) : null;
    const displayName = fileName
      ? `<span class="asset-library-file-name-stem">${escapeHtml(fileName.stem)}</span><span class="asset-library-file-name-extension">${escapeHtml(fileName.extension)}</span>`
      : safeName;
    const renameKeyboardAttrs = mutable && !renaming
      ? ` tabindex="0" aria-label="名称 ${safeName}，按 Enter 或 F2 重命名"`
      : "";
    return `
      <div class="asset-library-card-namebar"${mutable ? ` data-library-rename="${safeId}" data-library-item-kind="${safeKind}"${renameKeyboardAttrs}` : ""}>
        ${renaming
          ? renderRenameField({ id, kind, name })
          : `<span class="${classNames("asset-library-card-name", fileName && "asset-library-file-name")}" title="${safeName}">${displayName}</span>`}
        ${kind === "entity" && !renaming ? `<span class="asset-library-subject-mark" aria-hidden="true">${icon("layout-grid")}</span>` : ""}
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
    const selectionMode = Boolean(options.selectionMode);
    const menuOpen = !selectionMode && mutable && Boolean(options.menuOpen);
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
        ${renderCardControls({ id, kind: "folder", selected: false, selectionMode, menuOpen, mutable, space, canDelete: options.canDelete })}
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

  function getItemActions({ kind, space, mediaKind = null, allowedActions = null, mutable = true, canDelete = true }) {
    return actionsForSpace(
      kind === "folder" ? FOLDER_ACTIONS : kind === "entity" ? ENTITY_ACTIONS : ITEM_ACTIONS,
      space,
      allowedActions,
    ).filter(() => mutable)
      .filter((action) => action.id !== "review" || kind !== "media" || mediaKind !== "audio")
      .filter((action) => action.id !== "delete" || canDelete);
  }

  function renderItemMenu({ id, kind, space, mediaKind = null, allowedActions = null, mutable = true, canDelete = true }) {
    const safeId = escapeHtml(id);
    const safeKind = escapeHtml(kind);
    const itemLabel = safeKind === "folder" ? "文件夹" : safeKind === "entity" ? "主体" : "素材";
    const actions = getItemActions({ kind, space, mediaKind, allowedActions, mutable, canDelete });
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

  function renderCardControls({ id, kind, selected, selectionMode, selectionDisabled = false, menuOpen, mutable, selectable = true, space, mediaKind = null, allowedActions = null, canDelete = true }) {
    const safeId = escapeHtml(id);
    const safeKind = escapeHtml(kind);
    const hasMenuActions = !selectionMode && getItemActions({ kind, space, mediaKind, allowedActions, mutable, canDelete }).length > 0;
    return `
      ${kind !== "folder" && selectable && (mutable || space === "platform")
        ? `
          <button class="${classNames("asset-library-selection-button", selected && "active")}" type="button" aria-label="${selected ? "取消选择" : "选择"}" aria-pressed="${selected}" data-library-select="${safeKind}:${safeId}" data-library-item-kind="${safeKind}"${selectionDisabled ? ' disabled title="仅可同时选择同类结果"' : ""}>
            ${selected ? icon("check") : ""}
          </button>
        `
        : ""}
      ${hasMenuActions
        ? `
          <button class="asset-library-more-button" type="button" aria-label="更多操作" aria-haspopup="menu" aria-expanded="${menuOpen}" data-library-menu-toggle="${safeId}" data-library-item-kind="${safeKind}">
            ${icon("ellipsis-vertical")}
          </button>
          ${menuOpen ? renderItemMenu({ id, kind, space, mediaKind, allowedActions, mutable, canDelete }) : ""}
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
    const referencePicking = Boolean(options.referencePicking);
    const referenceSelected = referencePicking && Boolean(options.referenceSelected);
    const referenceDisabled = referencePicking && Boolean(options.referenceDisabled);
    const selectionEnabled = !referencePicking && (mutable || space === "platform");
    const selectionMode = selectionEnabled && Boolean(options.selectionMode);
    const selected = selectionEnabled && Boolean(options.selected);
    const menuOpen = !referencePicking && !selectionMode && mutable && Boolean(options.menuOpen);
    const renaming = !referencePicking && mutable && Boolean(options.renaming);
    const safeId = escapeHtml(id);
    const safeName = escapeHtml(name);
    const mediaKind = normalizeMediaKind(media);

    return `
      <article class="${classNames("asset-library-card", "asset-library-media-card", referencePicking && "reference-picking", referenceSelected && "reference-selected", referenceDisabled && "reference-disabled", selected && "selected", selectionMode && "selection-mode", menuOpen && "menu-open", renaming && "renaming", !mutable && "readonly")}" draggable="${!referencePicking}" data-library-media="${safeId}" data-library-space="${space}" data-library-media-kind="${mediaKind}">
        <button class="asset-library-card-preview" type="button" aria-label="${escapeHtml(referencePicking ? referenceSelected ? "取消参考" : "选择参考" : selectionMode ? "选择" : options.referenceAction || "预览")} ${safeName}"${referencePicking ? ` aria-pressed="${referenceSelected}"${referenceDisabled ? ` disabled aria-disabled="true" title="${escapeHtml(options.referenceHint || "当前素材不可添加为参考")}"` : ""}` : ""}${!referencePicking && !selectionMode && options.referenceAction ? ` title="${escapeHtml(options.referenceAction)}"` : ""} data-library-preview="${safeId}" data-library-item-kind="media"${selectionMode && options.selectionDisabled ? ' disabled title="仅可同时选择同类结果"' : ""}>
          ${renderStructuredPreview(media)}
          ${referencePicking ? `<span class="asset-library-reference-check" aria-hidden="true">${icon("check")}</span>` : ""}
        </button>
        ${renderNameBar({ id, kind: "media", name, meta: options.meta ?? "", renaming, mutable: !referencePicking && mutable })}
        ${referencePicking ? "" : renderCardControls({ id, kind: "media", selected, selectionMode, selectionDisabled: options.selectionDisabled, menuOpen, mutable, selectable: selectionEnabled, space, mediaKind, allowedActions: options.allowedActions, canDelete: options.canDelete })}
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
    if (element.hasAttribute("data-library-result-heading")) return `heading:${element.dataset.libraryResultHeading}`;
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
    const referencePicking = Boolean(options.referencePicking);
    const mutable = !referencePicking && canMutate(options.mutable, space);
    const entityActions = getItemActions({ kind: "entity", space, allowedActions: options.allowedActions, mutable });
    const canRename = mutable && entityActions.some((action) => action.id === "rename");
    const selectionMode = mutable && Boolean(options.selectionMode);
    const selected = mutable && Boolean(options.selected);
    const menuOpen = !selectionMode && entityActions.length > 0 && Boolean(options.menuOpen);
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
    const cover = coverPreview ? renderStructuredPreview(coverPreview) : icon("images");
    const canAddToCanvas = Boolean(options.canAddToCanvas) && !referencePicking
      && !options.selectionMode && !options.menuOpen && !options.renaming;

    return `
      <article class="${classNames("asset-library-card", "asset-library-entity-card", selected && "selected", selectionMode && "selection-mode", menuOpen && "menu-open", renaming && "renaming", !mutable && "readonly")}" data-library-entity="${safeId}" data-library-space="${space}">
        <span class="asset-library-group-stack" aria-hidden="true"></span>
        <button class="asset-library-card-preview" type="button" aria-label="${referencePicking ? "查看主体素材" : selectionMode ? selected ? "取消选择主体" : "选择主体" : "打开主体"} ${safeName}"${selectionMode ? ` aria-pressed="${selected}"` : ""} data-library-preview="${safeId}" data-library-item-kind="entity"${selectionMode && options.selectionDisabled ? ' disabled title="仅可同时选择同类结果"' : ""}>
          <span class="asset-library-entity-cover" data-library-entity-cover="${coverPreview ? "media" : "placeholder"}">${cover}</span>
        </button>
        ${canAddToCanvas ? `<button class="asset-library-entity-add" type="button" data-library-entity-add="${safeId}" aria-label="添加 ${safeName} 到画布">${icon("plus")}<span>添加到画布</span></button>` : ""}
        ${renderNameBar({ id, kind: "entity", name, meta: "", renaming, mutable: canRename })}
        ${referencePicking ? "" : renderCardControls({ id, kind: "entity", selected, selectionMode, selectable: selectionMode, selectionDisabled: options.selectionDisabled, menuOpen, mutable, space, allowedActions: options.allowedActions })}
      </article>
    `;
  }

  function renderSearchFolder({ folder, path, space }) {
    return `<article class="asset-library-search-folder" data-library-folder="${escapeHtml(folder.id)}" data-library-space="${escapeHtml(space)}"><button type="button" data-library-folder-open="${escapeHtml(folder.id)}" title="${escapeHtml(path)}">${icon("folder")}<span><strong>${escapeHtml(folder.name)}</strong><small>${escapeHtml(path)}</small></span>${icon("chevron-right")}</button></article>`;
  }

  function renderSearchGroups({ folders, folderCount, media, mediaCount, entities, entityCount }) {
    return [["folders", "目录", folderCount, folders], ["media", "素材", mediaCount, media], ["entities", "主体", entityCount, entities]]
      .filter(([, , count]) => count > 0)
      .map(([kind, label, count, markup]) => `<div class="asset-library-result-heading" data-library-result-heading="${kind}"><strong>${label}</strong><span>${count}</span></div>${markup}`).join("");
  }

  function renderEntityMediaFilter({ entity = null, status = "ready", unavailableCount = 0, searchReturn = false } = {}) {
    const name = status === "unavailable" ? "主体已不可用" : entity?.name || "未命名主体";
    const description = status === "unavailable" ? "" : String(entity?.description || "").trim();
    const missingCount = Number.isFinite(Number(unavailableCount)) ? Math.max(0, Math.floor(Number(unavailableCount))) : 0;
    return `<div class="asset-library-entity-filter" data-library-entity-filter="true">
      <button type="button" data-library-clear-entity-filter="true" aria-label="${searchReturn ? "返回搜索结果" : "返回主体列表"}" title="${searchReturn ? "返回搜索结果" : "返回主体列表"}">${icon("chevron-left")}<span>${searchReturn ? "搜索结果" : "主体"}</span></button>
      <div class="asset-library-entity-filter-label"><strong title="${escapeHtml(name)}">${escapeHtml(name)}</strong>${missingCount ? `<small>${missingCount} 项素材不可用</small>` : ""}</div>
      ${description ? `<div class="asset-library-entity-description" role="region" aria-label="主体描述" tabindex="0">${escapeHtml(description)}</div>` : ""}
    </div>`;
  }

  function renderEmptyState(options = {}) {
    const space = normalizeSpace(options.space);
    const section = space === "platform" ? "media" : options.subjectZone ? "entity" : normalizeSection(options.section);
    const mutable = canMutate(options.mutable, space);
    const canCreateEntity = mutable && options.canCreateEntity !== false;
    const canUploadMedia = mutable && options.canUploadMedia !== false;
    const hasQuery = Boolean(options.hasQuery);

    let iconName;
    let title;
    let description;
    let action = "";

    if (options.entityFilterStatus === "unavailable") {
      iconName = "images";
      title = "主体已不可用";
      description = "该主体已删除或不在当前空间。";
      action = `<button type="button" data-library-clear-entity-filter="true">返回主体列表</button>`;
    } else if (hasQuery) {
      iconName = "search-x";
      title = "没有匹配结果";
      description = "试试其他关键词，或清除当前搜索与筛选条件。";
      action = `<button type="button" data-library-clear-query="true" data-library-clear-filter="true">清除筛选</button>`;
    } else if (options.entityFilterStatus) {
      iconName = "images";
      title = "主体中没有可用素材";
      description = "该主体没有当前空间可访问的素材。";
      action = `<button type="button" data-library-clear-entity-filter="true">返回主体列表</button>`;
    } else if (space === "platform") {
      iconName = "sparkles";
      title = "暂无灵感素材";
      description = "试试其他关键词或素材类型。";
    } else if (section === "entity") {
      iconName = "images";
      title = canCreateEntity ? "还没有主体" : "暂无可用主体";
      description = "";
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
          ${description ? `<span>${description}</span>` : ""}
          ${action}
        </div>
      </div>
    `;
  }

  function renderMovePopover(options = {}) {
    const folders = Array.isArray(options.folders) ? options.folders : [];
    const space = normalizeSpace(options.space);
    if (space === "platform" || options.mutable === false) return "";
    const currentFolderId = options.currentFolderId === undefined ? undefined : String(options.currentFolderId ?? "");
    const pending = options.pending === true;
    const title = String(options.title || "移动到");
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
        <button class="${current ? "current" : ""}" type="button" data-library-move-target="${safeId}" title="${safePath}" style="--asset-move-level:${level}"${current || pending ? ' disabled aria-disabled="true"' : ""}${current ? ' aria-current="true"' : ""}>
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
      <section class="asset-library-move-popover" role="dialog" aria-label="${escapeHtml(options.title || "移动到文件夹")}" aria-busy="${pending}" data-library-move-popover="true" data-library-space="${space}">
        <header>
          <strong>${escapeHtml(title)}</strong>
          <button type="button" aria-label="关闭" data-library-move-close="true"${pending ? ' disabled aria-disabled="true"' : ""}>${icon("x")}</button>
        </header>
        ${renderDestination({ id: "", name: "默认目录", iconName: "house", path: "默认目录" })}
        ${destinations || `<div class="asset-library-move-empty">暂无其他文件夹</div>`}
        ${options.error ? `<div class="asset-library-move-error" role="status">${escapeHtml(options.error)}</div>` : ""}
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
    renderSearchFolder,
    renderSearchGroups,
  });
}(typeof globalThis === "object" ? globalThis : window));
