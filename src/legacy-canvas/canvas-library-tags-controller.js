(function registerLibraryTagsController(root) {
  "use strict";

  function createLibraryTagsController(options) {
    const { document, request, getScopeKey, canEdit, onCatalog, notify } = options;
    const getCatalogScopeKey = options.getCatalogScopeKey || getScopeKey;
    const canCreateTag = options.canCreateTag || canEdit;
    let active = null;
    let catalog = null;
    let operation = "add";
    let selected = new Set();
    let busy = "";
    const node = (tag, className, text) => {
      const result = document.createElement(tag);
      result.className = className;
      if (text) result.textContent = text;
      return result;
    };
    const button = (text, className = "save-media-button") => {
      const result = node("button", className, text);
      result.type = "button";
      return result;
    };
    const dialog = node("dialog", "save-media-dialog library-tags-dialog");
    dialog.setAttribute("aria-labelledby", "library-tags-title");
    const header = node("header", "save-media-header");
    const title = node("h2", "", "设置标签");
    title.id = "library-tags-title";
    title.tabIndex = -1;
    const count = node("span", "save-media-item-count");
    const closeButton = button("", "save-media-close");
    closeButton.setAttribute("aria-label", "关闭设置标签");
    // Lucide x, local 1.25.0 subset (assets/icons/LUCIDE-LICENSE.txt).
    closeButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m18 6-12 12M6 6l12 12"/></svg>';
    header.append(title, count, closeButton);
    const body = node("div", "library-tags-body");
    const modes = node("div", "library-tags-modes");
    modes.setAttribute("role", "group");
    modes.setAttribute("aria-label", "标签操作");
    const add = button("添加标签", "library-tags-mode");
    const remove = button("移除标签", "library-tags-mode");
    modes.append(add, remove);
    if (options.onManage) {
      const manage = button("管理标签", "library-tags-manage-link");
      manage.addEventListener("click", () => { if (current(active) && !busy) options.onManage(active.space); });
      modes.append(manage);
    }
    const chips = node("div", "library-tags-chips");
    chips.setAttribute("role", "group");
    chips.setAttribute("aria-label", "可选标签");
    const create = button("", "library-tags-create");
    create.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14M12 5v14"/></svg><span>新建标签</span>';
    const createForm = node("div", "library-tags-create-form");
    const name = node("input", "library-tags-name");
    name.maxLength = 40;
    name.placeholder = "标签名称";
    name.setAttribute("aria-label", "新标签名称");
    const createConfirm = button("创建");
    const createCancel = button("取消");
    createForm.append(name, createCancel, createConfirm);
    const empty = node("p", "library-tags-empty");
    body.append(modes, chips, empty, create, createForm);
    const footer = node("footer", "save-media-footer");
    const status = node("span", "save-media-status");
    status.setAttribute("role", "status");
    const retry = button("重试");
    const cancel = button("取消");
    const apply = button("应用", "save-media-button primary");
    footer.append(status, retry, cancel, apply);
    dialog.append(header, body, footer);
    document.body.append(dialog);

    const current = (owner) => active === owner && owner?.scope === getScopeKey() && canEdit(owner.space);
    const canApply = () => !busy && Boolean(catalog) && selected.size > 0 && createForm.hidden;
    function dictionary() {
      if (!active || !catalog) return [];
      const tags = [...options.builtinTags, ...catalog.tags.filter((tag) => tag.space === active.space)];
      if (operation === "add") return tags;
      const ids = new Set(active.items.flatMap((item) => {
        const entries = item.kind === "entity" ? catalog.entityEntries || [] : catalog.entries;
        return entries.find((entry) => entry.space === active.space
          && (item.kind === "entity" ? entry.entityId : entry.assetId) === item.id)?.tagIds || [];
      }));
      return tags.filter((tag) => ids.has(tag.id));
    }
    function render() {
      const tags = dictionary();
      add.setAttribute("aria-pressed", String(operation === "add"));
      remove.setAttribute("aria-pressed", String(operation === "remove"));
      add.disabled = remove.disabled = Boolean(busy);
      chips.replaceChildren(...tags.map((tag) => {
        const chip = button(tag.name, "library-tags-chip");
        chip.title = tag.name;
        chip.dataset.tagId = tag.id;
        chip.setAttribute("aria-pressed", String(selected.has(tag.id)));
        chip.disabled = Boolean(busy);
        chip.addEventListener("click", () => {
          if (selected.has(tag.id)) selected.delete(tag.id); else selected.add(tag.id);
          chip.setAttribute("aria-pressed", String(selected.has(tag.id)));
          apply.disabled = !canApply();
          status.textContent = "";
        });
        return chip;
      }));
      empty.hidden = !catalog || tags.length > 0;
      empty.textContent = operation === "remove" ? "所选资产暂无标签" : "暂无标签";
      create.hidden = operation !== "add" || !createForm.hidden;
      create.disabled = Boolean(busy) || !catalog;
      name.disabled = createConfirm.disabled = createCancel.disabled = Boolean(busy);
      apply.disabled = !canApply();
      apply.textContent = busy === "save" ? "应用中…" : "应用";
      cancel.disabled = closeButton.disabled = busy === "save";
      retry.hidden = catalog !== null || Boolean(busy);
    }
    function close(force = false) {
      if (!active || (busy === "save" && !force)) return;
      const owner = active;
      active = null;
      dialog.close();
      if (owner.scope === getScopeKey()) {
        if (owner.focus?.isConnected) owner.focus.focus({ preventScroll: true });
        else options.returnFocus?.();
      }
    }
    async function load(owner) {
      busy = "load";
      status.textContent = "正在加载标签…";
      render();
      try {
        const result = await request("list");
        if (!current(owner)) return;
        catalog = result;
        onCatalog(result);
        status.textContent = "";
      } catch (error) {
        if (current(owner)) status.textContent = error.message || "标签加载失败，请重试";
      } finally {
        if (current(owner)) { busy = ""; render(); }
      }
    }
    async function createTag() {
      const owner = active;
      if (!current(owner) || busy || createForm.hidden) return;
      if (!name.value.trim()) { name.focus(); return; }
      busy = "create";
      status.textContent = "";
      render();
      try {
        const tag = await request("create-tag", { space: owner.space, name: name.value.trim() });
        // An explicitly confirmed tag survives closing its enclosing draft.
        if (owner.catalogScope === getCatalogScopeKey() && canCreateTag(owner.space)) options.onTag?.(tag);
        if (!current(owner)) return;
        if (!tag.id.startsWith("builtin:")) catalog.tags = [...catalog.tags.filter((entry) => entry.id !== tag.id), tag];
        selected.add(tag.id);
        createForm.hidden = true;
        name.value = "";
      } catch (error) {
        if (current(owner)) status.textContent = error.message || "创建标签失败";
      } finally {
        if (current(owner)) { busy = ""; render(); }
      }
    }
    function chooseMode(next) {
      if (busy) return;
      operation = next;
      selected.clear();
      createForm.hidden = true;
      status.textContent = "";
      render();
    }
    add.addEventListener("click", () => chooseMode("add"));
    remove.addEventListener("click", () => chooseMode("remove"));
    create.addEventListener("click", () => { createForm.hidden = false; render(); name.focus(); });
    createCancel.addEventListener("click", () => { createForm.hidden = true; name.value = ""; render(); create.focus(); });
    createConfirm.addEventListener("click", createTag);
    name.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.isComposing) { event.preventDefault(); void createTag(); }
    });
    retry.addEventListener("click", () => { if (current(active)) void load(active); });
    closeButton.addEventListener("click", () => close());
    cancel.addEventListener("click", () => close());
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
    dialog.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key !== "Escape" || event.isComposing) return;
      event.preventDefault();
      if (!createForm.hidden && !busy) { createForm.hidden = true; render(); create.focus(); }
      else close();
    });
    for (const event of ["click", "pointerdown", "wheel"]) dialog.addEventListener(event, (e) => e.stopPropagation());
    apply.addEventListener("click", async () => {
      const owner = active;
      if (!current(owner) || !canApply()) return;
      busy = "save";
      status.textContent = "";
      render();
      try {
        const result = await request("update-tags", { space: owner.space, operation, tagIds: [...selected], items: owner.items });
        if (!current(owner)) return;
        onCatalog(result);
        options.onApplied?.();
        notify("标签已更新");
        busy = "";
        close();
      } catch (error) {
        if (current(owner)) status.textContent = error.message || "标签更新失败，请重试";
      } finally {
        if (current(owner)) { busy = ""; render(); }
      }
    });
    return Object.freeze({
      open({ space, items }) {
        if (!canEdit(space) || !items?.length || items.some((item) => !["media", "entity"].includes(item.kind))) return false;
        if (active && busy === "save") return false;
        close();
        active = { scope: getScopeKey(), catalogScope: getCatalogScopeKey(), space, focus: document.activeElement,
          items: items.map(({ kind, id }) => ({ kind, id })) };
        catalog = null;
        busy = "";
        operation = "add";
        selected = new Set();
        count.textContent = `${items.length} 项`;
        createForm.hidden = true;
        name.value = "";
        dialog.showModal();
        title.focus({ preventScroll: true });
        void load(active);
        return true;
      },
      close,
      syncCatalog(value) {
        if (!current(active)) return;
        catalog = value;
        const ids = new Set([...options.builtinTags, ...value.tags.filter((tag) => tag.space === active.space)].map((tag) => tag.id));
        selected = new Set([...selected].filter((id) => ids.has(id)));
        render();
      },
      syncContext() { if (active && !current(active)) close(true); },
      destroy() { close(true); dialog.remove(); },
    });
  }
  function createLibraryTagManager(options) {
    const { document, request, getScopeKey, canEdit, onCatalog, notify } = options;
    let active = null;
    let catalog = null;
    let busy = "";
    let pendingTag = null;
    let pendingFocus = null;
    let adjacentFocus = null;
    const node = (tag, className, text = "") => {
      const element = document.createElement(tag);
      element.className = className;
      element.textContent = text;
      return element;
    };
    const button = (text, className = "save-media-button") => {
      const element = node("button", className, text);
      element.type = "button";
      return element;
    };
    const dialog = node("dialog", "save-media-dialog library-tags-dialog library-tag-manager");
    dialog.setAttribute("aria-labelledby", "library-tag-manager-title");
    const header = node("header", "save-media-header");
    const title = node("h2", "", "管理标签");
    title.id = "library-tag-manager-title";
    title.tabIndex = -1;
    const closeButton = button("", "save-media-close");
    closeButton.setAttribute("aria-label", "关闭标签管理");
    closeButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m18 6-12 12M6 6l12 12"/></svg>';
    header.append(title, closeButton);
    const body = node("div", "library-tags-body");
    const list = node("div", "library-tag-manager-list");
    body.append(list);
    const footer = node("footer", "save-media-footer");
    const status = node("span", "save-media-status");
    status.setAttribute("role", "status");
    const retry = button("重试");
    const cancel = button("完成");
    footer.append(status, retry, cancel);
    dialog.append(header, body, footer);
    const deleteDialog = node("dialog", "save-media-dialog library-tags-dialog library-tag-delete-dialog");
    deleteDialog.setAttribute("aria-labelledby", "library-tag-delete-title");
    deleteDialog.setAttribute("aria-describedby", "library-tag-delete-description");
    const deleteHeader = node("header", "save-media-header");
    const deleteTitle = node("h2", "", "删除标签？");
    deleteTitle.id = "library-tag-delete-title";
    const deleteClose = closeButton.cloneNode(true);
    deleteClose.setAttribute("aria-label", "关闭删除确认");
    deleteHeader.append(deleteTitle, deleteClose);
    const deleteBody = node("div", "library-tags-body");
    const confirmation = node("p", "library-tag-delete-confirmation");
    confirmation.id = "library-tag-delete-description";
    deleteBody.append(confirmation);
    const deleteFooter = node("footer", "save-media-footer");
    const deleteStatus = node("span", "save-media-status");
    deleteStatus.setAttribute("role", "status");
    const deleteCancel = button("取消");
    const confirm = button("删除标签", "save-media-button library-tag-delete-confirm");
    deleteFooter.append(deleteStatus, deleteCancel, confirm);
    deleteDialog.append(deleteHeader, deleteBody, deleteFooter);
    document.body.append(dialog, deleteDialog);
    const current = (owner) => active === owner && owner?.scope === getScopeKey() && canEdit(owner.space);
    const usageCount = (tag) => [...(catalog?.entries || []), ...(catalog?.entityEntries || [])]
      .filter((entry) => entry.space === active?.space && entry.tagIds.includes(tag.id)).length;
    function render() {
      closeButton.disabled = cancel.disabled = busy === "delete";
      retry.hidden = Boolean(catalog) || Boolean(busy);
      confirm.disabled = deleteCancel.disabled = deleteClose.disabled = Boolean(busy);
      confirm.textContent = busy === "delete" ? "删除中…" : "删除标签";
      if (pendingTag) {
        const count = usageCount(pendingTag);
        confirmation.textContent = `删除「${pendingTag.name}」${count ? `会解除 ${count} 项素材或主体的标签关联` : "后，该标签将不再可选"}。素材、主体和文件都会保留。此操作无法撤销。`;
      }
      const existing = new Map([...list.children].map((row) => [row.dataset.tagId, row]));
      const tags = [...(options.builtinTags || []), ...(catalog?.tags || []).filter((tag) => tag.space === active?.space)];
      let position = list.firstElementChild;
      const scrollTop = body.scrollTop;
      for (const tag of tags) {
        let row = existing.get(tag.id);
        if (!row) {
          row = node("div", "library-tag-manager-row");
          row.dataset.tagId = tag.id;
          const label = node("span", "library-tag-manager-name", tag.name);
          label.title = tag.name;
          row.append(label);
          if (tag.id.startsWith("builtin:")) row.append(node("span", "library-tag-manager-meta", "内置"));
          else {
            row.append(node("span", "library-tag-manager-meta", `${usageCount(tag)} 项`));
            const remove = button("", "library-tag-manager-delete");
            remove.setAttribute("aria-label", `删除标签 ${tag.name}`);
            remove.title = "删除标签";
            remove.disabled = Boolean(busy);
            // Lucide trash-2, same local subset as the canvas menus.
            remove.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M19 6v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M10 10v7M14 10v7"/></svg>';
            remove.addEventListener("click", () => {
              if (!current(active) || busy || pendingTag) return;
              pendingTag = tag;
              pendingFocus = remove;
              const buttons = [...list.querySelectorAll(".library-tag-manager-delete")];
              const index = buttons.indexOf(remove);
              adjacentFocus = buttons[index + 1] || buttons[index - 1] || title;
              deleteStatus.textContent = "";
              render();
              deleteDialog.showModal();
              deleteCancel.focus({ preventScroll: true });
            });
            row.append(remove);
          }
        }
        const remove = row.querySelector(".library-tag-manager-delete");
        if (remove) {
          remove.disabled = Boolean(busy);
          row.querySelector(".library-tag-manager-meta").textContent = `${usageCount(tag)} 项`;
        }
        if (row !== position) list.insertBefore(row, position);
        position = row.nextElementSibling;
        existing.delete(tag.id);
      }
      existing.forEach((row) => row.remove());
      body.scrollTop = scrollTop;
    }
    function closeConfirmation({ restoreFocus = true, force = false } = {}) {
      if (busy === "delete" && !force) return;
      pendingTag = null;
      if (deleteDialog.open) deleteDialog.close();
      if (restoreFocus && current(active)) {
        const target = pendingFocus?.isConnected ? pendingFocus : adjacentFocus?.isConnected ? adjacentFocus : title;
        target.focus({ preventScroll: true });
      }
      pendingFocus = adjacentFocus = null;
    }
    function close(force = false) {
      if (!active || (busy === "delete" && !force)) return;
      const owner = active;
      active = null;
      closeConfirmation({ restoreFocus: false, force: true });
      dialog.close();
      if (owner.scope === getScopeKey()) {
        if (owner.focus?.isConnected) owner.focus.focus({ preventScroll: true });
        else options.returnFocus?.();
      }
    }
    async function load(owner) {
      busy = "load";
      status.textContent = "正在加载标签…";
      render();
      try {
        const value = await request("list");
        if (!current(owner)) return;
        catalog = value;
        onCatalog(value);
        status.textContent = "";
      } catch (error) {
        if (current(owner)) status.textContent = error.message || "标签加载失败，请重试";
      } finally { if (current(owner)) { busy = ""; render(); } }
    }
    async function removeTag() {
      const owner = active;
      if (!current(owner) || busy || !pendingTag) return;
      const tag = pendingTag;
      const expectedUsageCount = usageCount(tag);
      let removed = false;
      busy = "delete";
      deleteStatus.textContent = "";
      render();
      try {
        const value = await request("delete-tag", { space: owner.space, tagId: tag.id, expectedUsageCount });
        if (!current(owner)) return;
        catalog = value;
        removed = true;
        onCatalog(value);
        options.onDeleted?.(tag);
        notify("标签已删除");
      } catch (error) {
        if (!current(owner)) return;
        // Refresh the confirmation's association count before an explicit retry.
        try {
          const value = await request("list");
          if (!current(owner)) return;
          catalog = value;
          removed = !value.tags.some((entry) => entry.id === tag.id && entry.space === owner.space);
          onCatalog(value);
        } catch { /* Keep the last confirmed catalog; the server still validates every retry. */ }
        if (current(owner)) {
          if (removed) options.onDeleted?.(tag);
          else deleteStatus.textContent = error.message || "删除失败，请重试";
        }
      } finally {
        if (current(owner)) {
          busy = "";
          render();
          if (removed) closeConfirmation();
          else deleteCancel.focus({ preventScroll: true });
        }
      }
    }
    retry.addEventListener("click", () => { if (current(active) && !busy) void load(active); });
    cancel.addEventListener("click", () => close());
    deleteCancel.addEventListener("click", () => closeConfirmation());
    deleteClose.addEventListener("click", () => closeConfirmation());
    confirm.addEventListener("click", removeTag);
    closeButton.addEventListener("click", () => close());
    for (const surface of [dialog, deleteDialog]) {
      const dismiss = () => { if (deleteDialog.open) closeConfirmation(); else close(); };
      surface.addEventListener("cancel", (event) => { event.preventDefault(); dismiss(); });
      surface.addEventListener("keydown", (event) => { event.stopPropagation(); if (event.key === "Escape" && !event.isComposing) { event.preventDefault(); dismiss(); } });
      for (const event of ["click", "pointerdown", "wheel"]) surface.addEventListener(event, (e) => e.stopPropagation());
    }
    return Object.freeze({
      open({ space }) {
        if (!canEdit(space) || (active && busy === "delete")) return false;
        close();
        active = { scope: getScopeKey(), space, focus: document.activeElement };
        catalog = null; pendingTag = null; busy = "";
        dialog.showModal(); title.focus({ preventScroll: true });
        void load(active);
        return true;
      },
      close,
      syncContext() { if (active && !current(active)) close(true); },
      destroy() { close(true); deleteDialog.remove(); dialog.remove(); },
    });
  }
  root.REELAY_CANVAS_LIBRARY_TAGS_CONTROLLER = Object.freeze({ createLibraryTagsController, createLibraryTagManager });
})(typeof window !== "undefined" ? window : globalThis);
