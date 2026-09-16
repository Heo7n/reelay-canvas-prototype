(function registerCanvasSaveMediaDialog(root) {
  "use strict";

  const BUILTIN_TAGS = Object.freeze([
    { id: "builtin:character", name: "角色", space: "builtin" },
    { id: "builtin:scene", name: "场景", space: "builtin" },
    { id: "builtin:object", name: "物品", space: "builtin" },
  ]);
  // Lucide 1.25.0 paths, ISC; see assets/icons/LUCIDE-LICENSE.txt.
  const ICONS = {
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    plus: '<path d="M5 12h14M12 5v14"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497zM15 5l4 4"/>',
    trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>',
    check: '<path d="m20 6-11 11-5-5"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    right: '<path d="m9 6 6 6-6 6"/>',
    folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    personal: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
    organization: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>',
    image: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.814.014L6 21"/>',
    audio: '<path d="M2 10v4M6 6v12M10 3v18M14 8v8M18 5v14M22 10v4"/>',
    video: '<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  };
  const SPACE_NAMES = { personal: "个人", organization: "组织" };

  function getFolderPath(folders, space, folderId) {
    const path = [];
    const seen = new Set();
    let id = folderId;
    while (id && !seen.has(id)) {
      seen.add(id);
      const folder = folders.find((item) => item.id === id && item.space === space);
      if (!folder) break;
      path.unshift(folder);
      id = folder.parentId;
    }
    return path;
  }

  function getPathLabels(folders, space, folderId) {
    const names = getFolderPath(folders, space, folderId).map((folder) => folder.name);
    return [SPACE_NAMES[space], ...(names.length ? names : ["默认目录"])];
  }

  function compactPath(labels, availableWidth, measure) {
    if (labels.length <= 2 || measure(labels.join(" / ")) <= availableWidth) return labels;
    return [labels[0], "…", labels.at(-1)];
  }

  function createSaveMediaDialog(options = {}) {
    const document = options.document || root.document;
    if (!document || !["getCatalog", "createFolder", "createTag", "save", "confirmMove"].every((name) => typeof options[name] === "function")) {
      throw new TypeError("Save media dialog dependencies are incomplete.");
    }
    const window = document.defaultView;
    const listeners = [];
    let disposed = false;
    let session = 0;
    let active = false;
    let catalog = { folders: [], tags: [], entries: [] };
    let items = [];
    let space = "personal";
    let folderId = null;
    let initialFolderId;
    let intent = "save";
    let tagIds = new Set();
    let expanded = new Set(["root"]);
    let popup = null;
    let uploadHelpMode = null;
    let folderDraft = null;
    let tagDraft = null;
    let busy = null;
    let ready = false;
    let dismissConfirmation = null;
    let returnFocus = null;

    function element(tag, className, text) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }

    function icon(name) {
      const node = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      for (const [key, value] of Object.entries({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.75", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false" })) node.setAttribute(key, value);
      node.innerHTML = ICONS[name] || ICONS.image;
      return node;
    }

    function button(label, className = "save-media-icon-button", iconName) {
      const node = element("button", className);
      node.type = "button";
      node.setAttribute("aria-label", label);
      if (iconName) { node.append(icon(iconName)); node.title = label; }
      else node.textContent = label;
      return node;
    }

    function listen(node, type, fn, config) {
      node.addEventListener(type, fn, config);
      listeners.push(() => node.removeEventListener(type, fn, config));
    }

    const dialog = element("dialog", "save-media-dialog");
    dialog.setAttribute("aria-labelledby", "save-media-title");
    const header = element("header", "save-media-header");
    const title = element("h2", "", "保存到素材");
    title.id = "save-media-title";
    title.tabIndex = -1;
    const itemCount = element("span", "save-media-item-count");
    const uploadHelp = element("div", "save-media-upload-help");
    uploadHelp.hidden = true;
    const uploadHelpButton = button("格式与限制", "save-media-upload-help-button");
    uploadHelpButton.replaceChildren(element("span", "", "格式与限制"), icon("info"));
    uploadHelpButton.setAttribute("aria-expanded", "false");
    uploadHelpButton.setAttribute("aria-controls", "save-media-upload-hint");
    uploadHelpButton.setAttribute("aria-describedby", "save-media-upload-hint");
    const uploadHint = element("section", "save-media-upload-hint");
    uploadHint.id = "save-media-upload-hint";
    uploadHint.setAttribute("role", "tooltip");
    uploadHint.setAttribute("aria-label", "支持的文件格式");
    uploadHint.hidden = true;
    const uploadHintContent = element("div", "save-media-upload-hint-content");
    uploadHint.append(uploadHintContent);
    uploadHelp.append(uploadHelpButton, uploadHint);
    const closeButton = button("关闭保存到素材", "save-media-close", "x");
    header.append(title, itemCount, uploadHelp, closeButton);
    const body = element("div", "save-media-body");
    const preview = element("section", "save-media-preview");
    preview.setAttribute("aria-label", "素材预览");
    const mediaStage = element("div", "save-media-preview-stage");
    const previewName = element("div", "save-media-preview-name");
    preview.append(mediaStage, previewName);
    const batchPreview = element("section", "save-media-batch-preview");
    batchPreview.setAttribute("aria-label", "所选素材");
    batchPreview.tabIndex = 0;
    const batchGrid = element("ul", "save-media-batch-grid");
    batchGrid.setAttribute("role", "list");
    const uploadTile = element("li", "save-media-upload-tile");
    const chooseFilesButton = button("选择本地文件", "save-media-upload-add", "plus");
    uploadTile.append(chooseFilesButton);
    const batchCards = new Map();
    chooseFilesButton.addEventListener("click", () => {
      if (!active || intent !== "upload" || busy === "save") return;
      try { options.onChooseFiles?.(); }
      catch (error) { showError(error?.message || "无法选择本地文件，请重试"); }
    });
    batchPreview.append(batchGrid);
    const fields = element("div", "save-media-fields");
    const nameGroup = element("div", "save-media-field-group");
    const nameLabel = element("label", "save-media-label", "素材名称");
    nameLabel.htmlFor = "save-media-name";
    const nameInput = element("input", "save-media-input");
    nameInput.id = "save-media-name";
    nameInput.type = "text";
    nameInput.maxLength = 120;
    nameInput.autocomplete = "off";
    nameGroup.append(nameLabel, nameInput);
    const locationGroup = element("div", "save-media-field-group save-media-location-group");
    const locationLabel = element("span", "save-media-label", "保存位置");
    locationLabel.id = "save-media-location-label";
    const locationButton = button("选择保存位置", "save-media-location save-media-input");
    locationButton.setAttribute("aria-haspopup", "dialog");
    locationButton.setAttribute("aria-expanded", "false");
    locationButton.setAttribute("aria-describedby", "save-media-full-path");
    const pathText = element("span", "save-media-path");
    const fullPath = element("span", "save-media-path-tooltip");
    fullPath.id = "save-media-full-path";
    fullPath.setAttribute("role", "tooltip");
    locationButton.replaceChildren(icon("folder"), pathText, icon("down"));
    locationGroup.append(locationLabel, locationButton, fullPath);
    const tagsGroup = element("div", "save-media-field-group");
    tagsGroup.append(element("span", "save-media-label", "标签"));
    const tagsButton = button("选择标签", "save-media-tags-toggle save-media-input");
    tagsButton.setAttribute("aria-haspopup", "dialog");
    tagsButton.setAttribute("aria-expanded", "false");
    tagsGroup.append(tagsButton);
    const status = element("div", "save-media-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    fields.append(nameGroup, locationGroup, tagsGroup);
    body.append(preview, batchPreview, fields);
    const footer = element("footer", "save-media-footer");
    const cancelButton = button("取消", "save-media-button");
    const saveButton = button("保存", "save-media-button save-media-primary");
    footer.append(status, cancelButton, saveButton);
    const popupHost = element("div", "save-media-popup");
    popupHost.hidden = true;
    popupHost.setAttribute("role", "dialog");
    dialog.append(header, body, footer, popupHost);

    function currentEntries() {
      return items.map((item) => catalog.entries.find((entry) => item.assetId && entry.assetId === item.assetId && entry.space === space));
    }

    function movedEntries() {
      return currentEntries().filter((entry) => entry && (entry.folderId || null) !== folderId);
    }

    function newItemCount() {
      return currentEntries().filter((entry) => !entry).length;
    }

    function addOnly() { return intent === "upload" || items.length > 1; }

    function hasValidLocation() {
      if (folderId === null) return true;
      const path = getFolderPath(catalog.folders, space, folderId);
      return path.length > 0 && !path[0].parentId && path.at(-1).id === folderId;
    }

    function availableTags() {
      const custom = catalog.tags.filter((tag) => tag.space === space && !BUILTIN_TAGS.some((builtin) => builtin.id === tag.id || builtin.name === tag.name));
      return [...BUILTIN_TAGS, ...custom];
    }

    function showStatus(message = "", isError = false) {
      status.replaceChildren();
      status.textContent = message;
      status.classList.toggle("is-error", isError);
      status.hidden = !message;
    }

    function showError(message) { if (active) showStatus(message, true); }

    function focus(node) {
      if (!node?.isConnected) return;
      node.focus({ preventScroll: true });
      if (popupHost.contains(node)) node.scrollIntoView?.({ block: "nearest" });
    }

    function updateBusy() {
      dialog.setAttribute("aria-busy", String(Boolean(busy)));
      closeButton.disabled = busy === "save";
      cancelButton.disabled = busy === "save";
      nameInput.disabled = busy === "save" || !ready;
      locationButton.disabled = Boolean(busy) || !ready;
      tagsButton.disabled = Boolean(busy) || !ready;
      const additions = addOnly();
      const count = newItemCount();
      saveButton.disabled = Boolean(busy) || !ready || !hasValidLocation() || (!nameInput.hidden && !nameInput.value.trim()) || (additions && count === 0);
      saveButton.textContent = busy === "save" ? "保存中…" : additions && ready && items.length ? count ? `保存 ${count} 项` : "已保存" : "保存";
      chooseFilesButton.disabled = busy === "save";
      batchGrid.querySelectorAll("[data-upload-remove]").forEach((node) => { node.disabled = busy === "save"; });
    }

    function updateLocation() {
      if (!ready) {
        pathText.replaceChildren(element("span", "save-media-path-leaf", busy === "load" ? "读取中…" : "暂不可用"));
        fullPath.textContent = "";
        locationButton.removeAttribute("title");
        locationButton.setAttribute("aria-label", "保存位置");
        updateBusy();
        return;
      }
      if (!hasValidLocation()) {
        pathText.replaceChildren(element("span", "save-media-path-leaf", "位置已不可用"));
        fullPath.textContent = "";
        locationButton.removeAttribute("title");
        locationButton.setAttribute("aria-label", "保存位置已不可用，请重新选择");
        updateBusy();
        return;
      }
      const labels = getPathLabels(catalog.folders, space, folderId);
      const complete = labels.join(" / ");
      fullPath.textContent = complete;
      locationButton.title = complete;
      locationButton.setAttribute("aria-label", `保存位置：${complete}`);
      const width = pathText.clientWidth;
      // A hidden text probe uses the actual font, so Chinese and Latin names
      // compress by rendered width rather than arbitrary character counts.
      const probe = element("span", "save-media-path-measure");
      dialog.append(probe);
      const measure = (text) => {
        const segments = text.split(" / ");
        probe.textContent = segments.join("/");
        return probe.getBoundingClientRect().width + Math.max(0, segments.length - 1) * 12;
      };
      const visible = width > 0 ? compactPath(labels, width, measure) : labels;
      pathText.replaceChildren();
      visible.forEach((label, index) => {
        if (index) pathText.append(element("span", "save-media-path-divider", "/"));
        pathText.append(element("span", index === visible.length - 1 ? "save-media-path-leaf" : "save-media-path-segment", label));
      });
      probe.remove();
      updateBusy();
    }

    function updateTags() {
      const selectedNames = availableTags().filter((tag) => tagIds.has(tag.id)).map((tag) => tag.name).join("、");
      const label = element("span", selectedNames ? "save-media-tags-value" : "save-media-tags-value save-media-placeholder", selectedNames || "选择标签");
      tagsButton.title = selectedNames;
      tagsButton.replaceChildren(label, icon("down"));
    }

    function pausePreview() {
      for (const media of mediaStage.querySelectorAll("video, audio")) { media.pause(); media.removeAttribute("src"); media.load(); }
      mediaStage.replaceChildren();
    }

    function renderFileName(target, name) {
      const { stem, extension } = root.REELAY_CANVAS_FILE_NAME.splitFileName(name);
      target.replaceChildren(element("span", "save-media-filename-stem", stem));
      if (extension) target.append(element("span", "save-media-filename-extension", extension));
      target.title = name;
    }

    function createBatchCard(item) {
      const card = element("li", "save-media-batch-item");
      const thumbnail = element("div", "save-media-batch-thumbnail");
      const placeholder = icon(item.mediaKind);
      thumbnail.append(placeholder);
      const source = item.thumbnailUrl || (item.mediaKind === "image" ? item.url : null);
      if (source) {
        const image = element("img");
        image.alt = "";
        image.loading = "lazy";
        image.decoding = "async";
        image.addEventListener("load", () => placeholder.remove(), { once: true });
        image.addEventListener("error", () => { image.remove(); thumbnail.prepend(placeholder); }, { once: true });
        image.src = source;
        thumbnail.append(image);
      }
      if (item.mediaKind !== "image") {
        const kind = element("span", "save-media-batch-kind", item.mediaKind === "video" ? "视频" : "音频");
        thumbnail.append(kind);
      }
      if (intent === "upload") {
        const remove = button(`移除 ${item.displayName}`, "save-media-upload-remove", "x");
        remove.dataset.uploadRemove = item.key;
        remove.addEventListener("click", () => {
          if (!active || busy === "save") return;
          try { options.onRemoveItem?.(item.key); }
          catch (error) { showError(error?.message || "无法移除此素材，请重试"); }
        });
        thumbnail.append(remove);
      }
      const name = element("div", "save-media-preview-name", item.displayName);
      renderFileName(name, item.displayName);
      card.append(thumbnail, name);
      return card;
    }

    function syncBatchGrid(previousIndex = -1) {
      const focused = document.activeElement;
      const previousScroll = batchPreview.scrollTop;
      const retained = new Set();
      const nodes = intent === "upload" ? [uploadTile] : [];
      for (const item of items) {
        retained.add(item.key);
        const signature = JSON.stringify([item.displayName, item.mediaKind, item.url, item.thumbnailUrl, intent]);
        let entry = batchCards.get(item.key);
        if (!entry || entry.signature !== signature) {
          const card = createBatchCard(item);
          entry?.card.replaceWith(card);
          entry = { card, signature };
          batchCards.set(item.key, entry);
        }
        nodes.push(entry.card);
      }
      for (const [key, entry] of batchCards) {
        if (!retained.has(key)) { entry.card.remove(); batchCards.delete(key); }
      }
      let position = batchGrid.firstElementChild;
      for (const node of nodes) {
        if (node !== position) batchGrid.insertBefore(node, position);
        position = node.nextElementSibling;
      }
      if (intent !== "upload") uploadTile.remove();
      if (focused && !focused.isConnected && intent === "upload") {
        const choices = [...batchGrid.querySelectorAll("[data-upload-remove]")];
        focus(choices[Math.max(0, Math.min(previousIndex, choices.length - 1))] || chooseFilesButton);
      }
      batchPreview.scrollTop = previousScroll;
    }

    function renderPreview() {
      pausePreview();
      batchGrid.replaceChildren();
      batchCards.clear();
      const batch = intent === "upload" || items.length > 1;
      preview.hidden = batch;
      batchPreview.hidden = !batch;
      if (batch) {
        syncBatchGrid();
        return;
      }
      const item = items[0];
      if (!item) return;
      const kind = item.mediaKind;
      const source = kind === "image" ? item.thumbnailUrl || item.url : item.url;
      if (source) {
        const media = element(kind === "video" ? "video" : kind === "audio" ? "audio" : "img");
        if (kind === "image") media.alt = item.displayName;
        else { media.controls = true; media.preload = "metadata"; media.setAttribute("aria-label", item.displayName); }
        if (kind === "video" && item.thumbnailUrl) media.poster = item.thumbnailUrl;
        if (kind === "audio") mediaStage.append(icon("audio"));
        media.src = source;
        mediaStage.append(media);
      } else mediaStage.append(icon(kind));
      renderFileName(previewName, item.displayName);
    }

    function positionPopup() {
      if (!popup || !active) return;
      const anchor = (popup === "location" ? locationButton : tagsButton).getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const below = viewportHeight - anchor.bottom - 16;
      const above = anchor.top - 16;
      const opensAbove = below < 260 && above > below;
      const available = Math.max(100, opensAbove ? above : below);
      const maxHeight = Math.min(360, available);
      const width = Math.min(Math.max(280, anchor.width), window.innerWidth - 32);
      const left = Math.max(16, Math.min(anchor.left, window.innerWidth - width - 16));
      popupHost.style.width = `${width}px`;
      popupHost.style.maxHeight = `${maxHeight}px`;
      popupHost.style.left = `${left}px`;
      popupHost.style.top = opensAbove ? "auto" : `${anchor.bottom + 6}px`;
      popupHost.style.bottom = opensAbove ? `${viewportHeight - anchor.top + 6}px` : "auto";
      popupHost.dataset.placement = opensAbove ? "above" : "below";
    }

    function closePopup(restoreFocus = false) {
      const previous = popup;
      popup = null;
      folderDraft = null;
      tagDraft = null;
      popupHost.hidden = true;
      popupHost.replaceChildren();
      locationButton.setAttribute("aria-expanded", "false");
      tagsButton.setAttribute("aria-expanded", "false");
      if (restoreFocus) focus(previous === "location" ? locationButton : tagsButton);
    }

    function openPopup(kind) {
      if (!ready || busy) return;
      closeUploadHelp();
      if (popup === kind) { closePopup(true); return; }
      closePopup();
      popup = kind;
      popupHost.hidden = false;
      popupHost.setAttribute("aria-label", kind === "location" ? "选择保存位置" : "选择标签");
      (kind === "location" ? locationButton : tagsButton).setAttribute("aria-expanded", "true");
      if (kind === "location") renderFolders(); else renderTags();
      positionPopup();
      const selected = popupHost.querySelector(kind === "location" ? ".save-media-folder-row.is-selected .save-media-folder-select" : '[aria-checked="true"]');
      focus(selected || popupHost.querySelector("button"));
      selected?.scrollIntoView?.({ block: "nearest" });
    }

    function closeUploadHelp() {
      uploadHelpMode = null;
      uploadHint.hidden = true;
      uploadHelpButton.setAttribute("aria-expanded", "false");
    }

    function openUploadHelp(mode) {
      if (!active || uploadHelp.hidden || (popup && mode !== "pinned")) return;
      // Hovering over help must not discard an in-progress directory/tag edit.
      if (mode === "pinned") closePopup();
      if (uploadHelpMode !== "pinned") uploadHelpMode = mode;
      uploadHint.hidden = false;
      uploadHelpButton.setAttribute("aria-expanded", "true");
    }

    function expandAncestors(id) {
      expanded.add("root");
      for (const folder of getFolderPath(catalog.folders, space, id)) expanded.add(folder.id);
    }

    function switchSpace(next) {
      if (busy || space === next) return;
      space = next;
      folderDraft = null;
      tagIds = new Set([...tagIds].filter((id) => BUILTIN_TAGS.some((tag) => tag.id === id)));
      const existing = currentEntries();
      folderId = intent !== "upload" && existing.length && existing.every((entry) => entry && (entry.folderId || null) === (existing[0]?.folderId || null)) ? existing[0].folderId || null : null;
      if (!addOnly() && existing[0]) {
        nameInput.value = existing[0].displayName;
        for (const id of existing[0].tagIds || []) tagIds.add(id);
      }
      expandAncestors(folderId);
      showStatus();
      updateLocation();
      updateTags();
      renderFolders();
      focus(popupHost.querySelector('[aria-selected="true"]'));
    }

    function inlineEditor(kind, draft, indent = 0) {
      const renaming = kind === "folder" && draft.kind === "rename";
      const wrapper = element("div", "save-media-inline-wrapper");
      wrapper.style.setProperty("--save-media-depth", String(indent));
      const row = element("div", "save-media-inline-create");
      if (kind === "folder") row.append(icon("folder"));
      const input = element("input", "save-media-inline-input");
      input.value = draft.name;
      input.placeholder = kind === "folder" ? "文件夹名称" : "标签名称";
      input.setAttribute("aria-label", renaming ? "重命名文件夹" : input.placeholder);
      input.maxLength = kind === "folder" ? 100 : 40;
      input.disabled = Boolean(busy);
      const confirm = button(kind === "folder" ? renaming ? "确认重命名文件夹" : "确认新建文件夹" : "确认新建标签", "save-media-icon-button save-media-inline-confirm", "check");
      const cancel = button(kind === "folder" ? renaming ? "取消重命名文件夹" : "取消新建文件夹" : "取消新建标签", "save-media-icon-button", "x");
      confirm.disabled = Boolean(busy);
      cancel.disabled = Boolean(busy);
      const dismiss = () => { if (busy) return; if (kind === "folder") { folderDraft = null; renderFolders(); } else { tagDraft = null; renderTags(); } focus(popupHost.querySelector("button")); };
      input.addEventListener("input", () => { draft.name = input.value; });
      input.addEventListener("keydown", (event) => {
        if (event.isComposing || event.keyCode === 229) return;
        if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); void commitInline(kind); }
        else if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); dismiss(); }
      });
      confirm.addEventListener("click", () => { void commitInline(kind); });
      cancel.addEventListener("click", dismiss);
      row.append(input, confirm, cancel);
      wrapper.append(row);
      if (draft.error) {
        const error = element("p", "save-media-inline-error", draft.error);
        error.id = `save-media-${kind}-error`;
        input.setAttribute("aria-invalid", "true");
        input.setAttribute("aria-describedby", error.id);
        error.setAttribute("role", "alert");
        wrapper.append(error);
      }
      return wrapper;
    }

    function renderFolders() {
      popupHost.replaceChildren();
      const tabs = element("div", "save-media-space-tabs");
      tabs.setAttribute("role", "tablist");
      tabs.setAttribute("aria-label", "素材空间");
      for (const scope of ["personal", "organization"]) {
        const tab = button(SPACE_NAMES[scope], "save-media-space-tab");
        tab.replaceChildren(icon(scope), element("span", "", SPACE_NAMES[scope]));
        tab.setAttribute("role", "tab");
        tab.setAttribute("aria-selected", String(space === scope));
        tab.tabIndex = space === scope ? 0 : -1;
        tab.disabled = Boolean(busy);
        tab.addEventListener("click", () => switchSpace(scope));
        tab.addEventListener("keydown", (event) => {
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); switchSpace(event.key === "Home" ? "personal" : event.key === "End" ? "organization" : space === "personal" ? "organization" : "personal"); }
        });
        tabs.append(tab);
      }
      const tree = element("div", "save-media-folder-tree");
      tree.setAttribute("role", "group");
      tree.setAttribute("aria-label", `${SPACE_NAMES[space]}目录`);
      const folders = catalog.folders.filter((folder) => folder.space === space);
      const visited = new Set();
      function addRow(folder, depth) {
        const id = folder?.id || null;
        const key = id || "root";
        if (visited.has(key)) return;
        visited.add(key);
        const name = folder?.name || "默认目录";
        const children = folders.filter((child) => (child.parentId || null) === id);
        const selected = folderId === id;
        const row = element("div", "save-media-folder-row");
        row.classList.toggle("is-selected", selected);
        row.style.setProperty("--save-media-depth", String(depth));
        const disclosure = button(`${expanded.has(key) ? "收起" : "展开"} ${name}`, "save-media-icon-button save-media-folder-disclosure", "right");
        disclosure.setAttribute("aria-expanded", String(expanded.has(key)));
        disclosure.disabled = Boolean(busy) || (!children.length && folderDraft?.parentId !== id);
        disclosure.classList.toggle("is-empty", !children.length && folderDraft?.parentId !== id);
        disclosure.addEventListener("click", () => { if (expanded.has(key)) expanded.delete(key); else expanded.add(key); renderFolders(); focus([...popupHost.querySelectorAll("[data-folder-key]")].find((node) => node.dataset.folderKey === key)?.querySelector(".save-media-folder-disclosure")); });
        const select = button(`保存到 ${name}`, "save-media-folder-select");
        select.replaceChildren(icon("folder"), element("span", "", name));
        select.setAttribute("aria-pressed", String(selected));
        select.title = getPathLabels(catalog.folders, space, id).join(" / ");
        select.disabled = Boolean(busy);
        select.addEventListener("click", () => { folderId = id; showStatus(); updateLocation(); closePopup(true); });
        const actions = element("div", "save-media-folder-actions");
        if (options.canCreateFolder?.(space) !== false) {
          const plus = button(`在 ${name} 中新建文件夹`, "save-media-icon-button save-media-folder-add", "plus");
          plus.disabled = Boolean(busy) || depth >= 4;
          if (depth >= 4) { plus.title = "最多支持 5 级目录"; plus.setAttribute("aria-label", "最多支持 5 级目录"); }
          plus.addEventListener("click", () => { folderDraft = { kind: "create", parentId: id, name: "", error: "" }; expanded.add(key); renderFolders(); focus(popupHost.querySelector(".save-media-inline-input")); });
          actions.append(plus);
        }
        if (folder && options.canManageFolders?.(space)) {
          const rename = button(`重命名 ${name}`, "save-media-icon-button", "pencil");
          rename.disabled = Boolean(busy);
          rename.addEventListener("click", () => {
            folderDraft = { kind: "rename", folderId: id, parentId: folder.parentId || null, expectedName: name, name, error: "" };
            renderFolders();
            const input = popupHost.querySelector(".save-media-inline-input");
            focus(input); input?.select();
          });
          const remove = button(`删除 ${name}`, "save-media-icon-button save-media-folder-delete", "trash");
          remove.disabled = Boolean(busy);
          remove.setAttribute("aria-haspopup", "dialog");
          remove.addEventListener("click", () => confirmFolderRemoval(folder));
          actions.append(rename, remove);
        }
        const check = element("span", "save-media-folder-check");
        if (selected) { check.append(icon("check")); check.setAttribute("aria-label", "当前保存位置"); }
        row.dataset.folderKey = key;
        row.append(disclosure, select, check);
        if (actions.childElementCount) row.append(actions);
        tree.append(folderDraft?.kind === "rename" && folderDraft.folderId === id ? inlineEditor("folder", folderDraft, depth) : row);
        if (expanded.has(key)) {
          if (folderDraft && folderDraft.kind !== "rename" && folderDraft.parentId === id) tree.append(inlineEditor("folder", folderDraft, depth + 1));
          for (const child of children) addRow(child, depth + 1);
        }
      }
      addRow(null, 0);
      popupHost.append(tabs, tree);
      positionPopup();
    }

    function renderTags() {
      popupHost.replaceChildren();
      const heading = element("div", "save-media-popup-heading");
      heading.append(element("span", "", "标签"));
      const add = button("新建标签", "save-media-icon-button", "plus");
      add.disabled = Boolean(busy);
      add.addEventListener("click", () => { tagDraft = { name: "", error: "" }; renderTags(); focus(popupHost.querySelector("input")); });
      heading.append(add);
      popupHost.append(heading);
      if (tagDraft) popupHost.append(inlineEditor("tag", tagDraft));
      const list = element("div", "save-media-tag-options");
      list.setAttribute("role", "group");
      list.setAttribute("aria-label", "可选标签");
      for (const tag of availableTags()) {
        const option = button(tag.name, "save-media-tag-option");
        option.setAttribute("role", "checkbox");
        option.setAttribute("aria-checked", String(tagIds.has(tag.id)));
        option.dataset.tagId = tag.id;
        option.disabled = Boolean(busy);
        option.replaceChildren(element("span", "", tag.name));
        if (tagIds.has(tag.id)) option.append(icon("check"));
        option.addEventListener("click", () => { if (tagIds.has(tag.id)) tagIds.delete(tag.id); else tagIds.add(tag.id); updateTags(); renderTags(); focus([...popupHost.querySelectorAll("[data-tag-id]")].find((node) => node.dataset.tagId === tag.id)); });
        list.append(option);
      }
      popupHost.append(list);
      positionPopup();
    }

    async function commitInline(kind) {
      if (busy) return;
      const draft = kind === "folder" ? folderDraft : tagDraft;
      if (!draft) return;
      const name = draft.name.trim();
      const renaming = kind === "folder" && draft.kind === "rename";
      const rerender = () => { if (kind === "folder") renderFolders(); else renderTags(); focus(popupHost.querySelector(".save-media-inline-input")); };
      draft.error = !name ? `请输入${kind === "folder" ? "文件夹" : "标签"}名称` : "";
      if (kind === "folder" && !draft.error) {
        if (renaming ? !options.canManageFolders?.(space) : options.canCreateFolder?.(space) === false) draft.error = "当前没有管理此目录的权限";
        else if (!renaming && getFolderPath(catalog.folders, space, draft.parentId).length >= 4) draft.error = "最多支持 5 级目录";
        else if (catalog.folders.some((folder) => folder.id !== draft.folderId && folder.space === space && (folder.parentId || null) === draft.parentId && folder.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) draft.error = "此目录下已有同名文件夹";
      }
      if (draft.error) { rerender(); return; }
      if (renaming && name === draft.expectedName) { folderDraft = null; renderFolders(); focus(popupHost.querySelector("button")); return; }
      const existingTag = kind === "tag" && availableTags().find((tag) => tag.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase());
      if (existingTag) { tagIds.add(existingTag.id); tagDraft = null; updateTags(); renderTags(); focus(popupHost.querySelector("button")); return; }
      const owner = session;
      const scope = space;
      busy = kind;
      updateBusy();
      rerender();
      try {
        if (kind === "folder") {
          const folder = renaming
            ? await options.renameFolder({ space: scope, folderId: draft.folderId, name, expectedName: draft.expectedName })
            : await options.createFolder({ space: scope, parentId: draft.parentId, name });
          if (!active || owner !== session) return;
          catalog = { ...catalog, folders: [...catalog.folders.filter((item) => item.id !== folder.id), folder] };
          if (!renaming) { folderId = folder.id; expandAncestors(folder.id); }
          folderDraft = null;
          showStatus();
        } else {
          const tag = await options.createTag({ space: scope, name });
          if (!active || owner !== session) return;
          catalog = { ...catalog, tags: [...catalog.tags.filter((item) => item.id !== tag.id), tag] };
          tagIds.add(tag.id);
          tagDraft = null;
        }
      } catch (error) {
        if (!active || owner !== session) return;
        draft.error = error?.message || (renaming ? "重命名失败，请重试" : "创建失败，请重试");
      } finally {
        if (active && owner === session) {
          busy = null;
          updateLocation(); updateTags();
          if (popup === "location") renderFolders(); else if (popup === "tags") renderTags();
          focus(popupHost.querySelector(".save-media-inline-input") || popupHost.querySelector("button"));
        }
      }
    }

    function confirmFolderRemoval(folder) {
      if (busy || !options.canManageFolders?.(space)) return;
      const owner = session;
      const scope = space;
      const selectedInside = getFolderPath(catalog.folders, scope, folderId).some((item) => item.id === folder.id);
      closePopup(true);
      busy = "confirm";
      updateBusy();
      dismissConfirmation = options.confirmDeleteFolder({
        folder, space: scope,
        async onConfirm() {
          if (!active || owner !== session || !options.canManageFolders?.(scope)) throw new Error("空间或访问权限已变化，请重新打开目录菜单");
          const result = await options.deleteFolder({ space: scope, folderId: folder.id });
          if (!active || owner !== session) return;
          // Only an explicit deletion here moves the selected destination to its surviving parent.
          // External catalog changes still require the user to choose a valid destination.
          if (selectedInside) folderId = folder.parentId || null;
          dismissConfirmation = null;
          busy = null;
          setCatalog(result);
          showStatus(hasValidLocation() ? "" : "所选目录已不存在或无权访问，请重新选择保存位置", !hasValidLocation());
          openPopup("location");
        },
        onCancel() {
          if (!active || owner !== session) return;
          dismissConfirmation = null;
          busy = null;
          updateBusy();
          openPopup("location");
        },
      });
    }

    function setCatalog(value) {
      if (disposed) return;
      catalog = { ...value, folders: value.folders || [], tags: value.tags || [], entries: value.entries || [] };
      if (!active) return;
      if (ready && !hasValidLocation()) showStatus("所选目录已不存在或无权访问，请重新选择保存位置", true);
      const allowed = new Set(availableTags().map((tag) => tag.id));
      tagIds = new Set([...tagIds].filter((id) => allowed.has(id)));
      updateLocation(); updateTags();
      if (popup === "location") renderFolders(); else if (popup === "tags") renderTags();
    }

    async function loadCatalog() {
      const owner = session;
      busy = "load"; ready = false; showStatus(); updateLocation();
      try {
        const value = await options.getCatalog();
        if (!active || owner !== session) return;
        setCatalog(value);
        const existing = currentEntries();
        if (initialFolderId === undefined && intent !== "upload" && existing.length && existing.every((entry) => entry && (entry.folderId || null) === (existing[0]?.folderId || null))) folderId = existing[0].folderId || null;
        if (!addOnly() && existing[0]) {
          nameInput.value = existing[0].displayName;
          tagIds = new Set(existing[0].tagIds || []);
        }
        expandAncestors(folderId);
        ready = true;
        showStatus(hasValidLocation() ? "" : "所选目录已不存在或无权访问，请重新选择保存位置", !hasValidLocation());
      } catch (error) {
        if (!active || owner !== session) return;
        showStatus(error?.message || "保存位置读取失败", true);
        const retry = button("重试", "save-media-retry");
        retry.addEventListener("click", () => { void loadCatalog(); });
        status.append(retry);
      } finally {
        if (active && owner === session) { busy = null; updateLocation(); updateTags(); }
      }
    }

    async function submit() {
      if (busy || !ready || !hasValidLocation()) return;
      if (intent !== "upload" && items.length === 1 && !nameInput.value.trim()) { showStatus("请输入素材名称", true); focus(nameInput); return; }
      const owner = session;
      const existing = currentEntries();
      const batch = intent === "upload" || items.length > 1;
      const additions = addOnly();
      const payload = {
        space, folderId, tagIds: [...tagIds],
        items: items.flatMap((item, index) => {
          const entry = existing[index];
          if (additions && entry) return [];
          const moving = entry && (entry.folderId || null) !== folderId;
          return [{ ...item, displayName: batch ? item.displayName : nameInput.value.trim(), action: additions ? "add" : moving ? "move" : "save", ...(moving ? { expectedFolderId: entry.folderId || null } : {}) }];
        }),
      };
      if (!payload.items.length) return;
      if (!additions && movedEntries().length) {
        busy = "confirm"; closePopup(); updateBusy();
        dismissConfirmation = options.confirmMove({
          count: movedEntries().length,
          destination: getPathLabels(catalog.folders, space, folderId).join(" / "),
          onConfirm() {
            if (!active || owner !== session) return;
            dismissConfirmation = null;
            void persist(payload, owner);
          },
          onCancel() {
            if (!active || owner !== session) return;
            dismissConfirmation = null; busy = null; updateBusy();
          },
        });
        return;
      }
      await persist(payload, owner);
    }

    async function persist(payload, owner) {
      busy = "save"; closePopup(); updateBusy(); updateTags(); showStatus();
      try {
        const result = await options.save(payload);
        if (!active || owner !== session) return;
        options.onSaved?.(result);
        close();
      } catch (error) {
        if (!active || owner !== session) return;
        showStatus(error?.message || "保存失败，请重试", true);
      } finally {
        if (active && owner === session) { busy = null; updateBusy(); updateTags(); }
      }
    }

    function close(notify = true) {
      if (!active) return;
      active = false;
      session += 1;
      dismissConfirmation?.(); dismissConfirmation = null;
      closePopup();
      closeUploadHelp();
      pausePreview();
      batchGrid.replaceChildren();
      batchCards.clear();
      if (dialog.open) dialog.close();
      busy = null;
      focus(returnFocus);
      if (notify) options.onClose?.();
    }

    function open(input) {
      if (disposed || !Array.isArray(input?.items) || (!input.items.length && input.intent !== "upload")) return false;
      if (active) close(false);
      active = true;
      session += 1;
      items = input.items.map((item) => ({ ...item }));
      space = input.space === "organization" ? "organization" : "personal";
      intent = input.intent === "upload" ? "upload" : "save";
      initialFolderId = input.folderId;
      folderId = input.folderId || null; tagIds = new Set(); expanded = new Set(["root"]);
      ready = false; busy = "load";
      catalog = { folders: [], tags: [], entries: [] };
      returnFocus = document.activeElement;
      const batch = intent === "upload" || items.length > 1;
      dialog.classList.toggle("is-batch", batch);
      dialog.classList.toggle("is-upload", intent === "upload");
      if (intent === "upload") fields.append(footer);
      else dialog.insertBefore(footer, popupHost);
      closeUploadHelp();
      uploadHintContent.replaceChildren();
      uploadHelp.hidden = intent !== "upload" || !input.uploadPolicy?.library?.formats.length;
      if (!uploadHelp.hidden) {
        uploadHintContent.append(element("p", "save-media-upload-hint-title", "支持的文件格式"));
        const formats = element("ul", "save-media-upload-formats");
        const kindNames = { image: "图片", video: "视频", audio: "音频" };
        for (const { mediaKind, extensions } of input.uploadPolicy.library.formats) {
          const names = Object.keys(extensions);
          const row = element("li", "save-media-upload-format");
          row.setAttribute("aria-label", `${kindNames[mediaKind]}：${names.join("、")}`);
          row.append(icon(mediaKind), element("span", "", names.join(" / ").toUpperCase()));
          formats.append(row);
        }
        uploadHintContent.append(formats);
        const { library, maxFileBytesByContentType } = input.uploadPolicy;
        const exceptions = library.formats.flatMap((group) => Object.entries(group.extensions)
          .filter(([, type]) => maxFileBytesByContentType[type] < library.maxFileBytes)
          .map(([extension, type]) => `${extension.toUpperCase()} ${maxFileBytesByContentType[type] / (1024 * 1024)} MB`));
        const limitText = `单个文件不超过 ${library.maxFileBytes / (1024 * 1024)} MB${exceptions.length ? `（${exceptions.join("、")}）` : ""}`;
        uploadHintContent.append(element("p", "save-media-upload-hint-limit", limitText));
      }
      title.textContent = intent === "upload" ? "上传资产" : "保存到素材";
      closeButton.setAttribute("aria-label", intent === "upload" ? "关闭上传资产" : "关闭保存到素材");
      closeButton.title = closeButton.getAttribute("aria-label");
      nameInput.value = items[0]?.displayName || "";
      nameInput.hidden = batch;
      nameGroup.hidden = batch;
      itemCount.hidden = !batch || !items.length;
      itemCount.textContent = `${items.length} 项`;
      showStatus();
      if (!dialog.isConnected) document.body.append(dialog);
      renderPreview(); updateLocation(); updateTags();
      dialog.showModal();
      batchPreview.scrollTop = 0;
      focus(title);
      void loadCatalog();
      return true;
    }

    function setItems(values) {
      if (disposed || !active || intent !== "upload" || busy === "save" || !Array.isArray(values)) return false;
      const previousIndex = items.findIndex((item) => item.key === document.activeElement?.dataset?.uploadRemove);
      items = values.map((item) => ({ ...item }));
      itemCount.hidden = items.length === 0;
      itemCount.textContent = `${items.length} 项`;
      syncBatchGrid(previousIndex);
      updateBusy();
      return true;
    }

    function updateItemsIdentity(identities) {
      items = items.map((item) => ({ ...item, assetId: identities.get?.(item.key) || identities[item.key] || item.assetId }));
      if (active) updateLocation();
    }

    listen(closeButton, "click", () => { if (busy !== "save") close(); });
    listen(cancelButton, "click", () => { if (busy !== "save") close(); });
    listen(saveButton, "click", () => { void submit(); });
    listen(locationButton, "click", () => openPopup("location"));
    listen(tagsButton, "click", () => openPopup("tags"));
    listen(nameInput, "input", updateBusy);
    listen(uploadHelp, "pointerenter", () => openUploadHelp("hover"));
    listen(uploadHelp, "pointerleave", () => {
      if (uploadHelpMode !== "pinned" && !uploadHelp.contains(document.activeElement)) closeUploadHelp();
    });
    listen(uploadHelp, "focusin", () => openUploadHelp("focus"));
    listen(uploadHelp, "focusout", (event) => {
      if (!uploadHelp.contains(event.relatedTarget) && (event.relatedTarget || uploadHelpMode !== "pinned")) closeUploadHelp();
    });
    listen(uploadHelpButton, "click", () => {
      if (uploadHelpMode === "pinned") closeUploadHelp();
      else openUploadHelp("pinned");
    });
    function dismissTopLayer() {
      if (uploadHelpMode) closeUploadHelp();
      else if (popup && !busy) closePopup(true);
      else if (busy !== "save") close();
    }
    listen(dialog, "cancel", (event) => { event.preventDefault(); dismissTopLayer(); });
    listen(dialog, "keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Escape" && !event.isComposing) { event.preventDefault(); dismissTopLayer(); }
    });
    listen(dialog, "pointerdown", (event) => {
      event.stopPropagation();
      if (!uploadHelp.contains(event.target)) closeUploadHelp();
      if (popup && !busy && !popupHost.contains(event.target) && !locationButton.contains(event.target) && !tagsButton.contains(event.target)) closePopup();
    });
    listen(dialog, "click", (event) => event.stopPropagation());
    listen(dialog, "wheel", (event) => event.stopPropagation(), { passive: true });
    listen(body, "scroll", positionPopup, { passive: true });
    listen(window, "resize", () => { if (active) { updateLocation(); positionPopup(); } });
    const observer = typeof window.ResizeObserver === "function" ? new window.ResizeObserver(() => { if (active) { updateLocation(); positionPopup(); } }) : null;
    observer?.observe(locationButton);

    return {
      open, close, setCatalog, setItems, showError, updateItemsIdentity,
      isOpen: () => active,
      destroy() {
        if (disposed) return;
        close(); disposed = true; session += 1;
        observer?.disconnect();
        for (const unsubscribe of listeners) unsubscribe();
        dialog.remove();
      },
    };
  }

  root.REELAY_CANVAS_SAVE_MEDIA_DIALOG = Object.freeze({ createSaveMediaDialog, getFolderPath, getPathLabels, compactPath, BUILTIN_TAGS });
})(typeof window !== "undefined" ? window : globalThis);
