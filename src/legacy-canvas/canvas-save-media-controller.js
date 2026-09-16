(function registerSaveMediaController(root) {
  "use strict";

  function createSaveMediaController(options) {
    const { createDialog, coordinator, importer, getScopeKey, isMutable, onCatalog, notify } = options;
    let draft = null;
    let catalog = null;
    function releaseDraft() {
      const owner = draft;
      draft = null;
      owner?.onRelease?.();
    }
    function assertCurrent(owner) {
      if (!draft || draft !== owner || owner.scope !== getScopeKey() || !isMutable()) {
        throw new Error("画布或访问权限已变化，请重新打开保存窗口");
      }
    }
    async function request(command, payload) {
      const owner = draft;
      assertCurrent(owner);
      const result = await coordinator.request(command, payload);
      if (command === "list" || command === "save" || command === "delete") {
        assertCurrent(owner);
        catalog = result;
        onCatalog(catalog);
        return result;
      }
      // Confirmed directory/tag changes survive cancelling the enclosing save draft.
      if (owner.scope === getScopeKey()) {
        if (catalog && (command === "create-folder" || command === "rename-folder")) {
          catalog = { ...catalog, folders: [...catalog.folders.filter((folder) => folder.id !== result.id), result] };
          options.onFolder?.(result);
        }
        else if (catalog && command === "create-tag" && !result.id.startsWith("builtin:")) catalog = { ...catalog,
          tags: [...catalog.tags.filter((tag) => tag.id !== result.id), result] };
        if (command === "create-tag") options.onTag?.(result);
      }
      assertCurrent(owner);
      return result;
    }
    const dialog = createDialog({
      document: options.document,
      getCatalog: () => request("list"),
      createFolder: (input) => request("create-folder", input),
      renameFolder: (input) => request("rename-folder", input),
      deleteFolder: ({ space, folderId }) => request("delete", { space, items: [{ kind: "folder", id: folderId }] }),
      canCreateFolder: options.canCreateFolder,
      canManageFolders: options.canManageFolders,
      confirmDeleteFolder: options.confirmDeleteFolder,
      createTag: (input) => request("create-tag", input),
      confirmMove: options.confirmMove,
      onChooseFiles() {
        const owner = draft;
        assertCurrent(owner);
        if (!owner.saving && owner.intent === "upload") owner.onChooseFiles?.();
      },
      onRemoveItem: removeItem,
      save: async (input) => {
        const owner = draft;
        assertCurrent(owner);
        if (owner.saving) throw new Error("正在保存，请稍候");
        if (!input.items?.length) throw new Error("请先选择要保存的素材");
        owner.saving = true;
        try {
          const items = [];
          // Validate all sources before starting a batch. Reading/uploading remains deferred until Save.
          for (const item of input.items) {
            const source = owner.sources.get(item.key);
            if (!source) throw new Error("选中的素材已变化，请重新打开保存窗口");
            if (!source.workspaceAssetId && !importer.resolvePersonalMedia(source)) {
              const inspection = options.inspectSource(source);
              if (!inspection.allowed) throw new Error(inspection.reason);
            }
          }
          for (const item of input.items) {
            assertCurrent(owner);
            const source = owner.sources.get(item.key);
            let assetId = owner.resolved.get(item.key) || source.workspaceAssetId || importer.resolvePersonalMedia(source)?.id;
            if (!assetId) {
              const result = await importer.prepareMedia([source], { uploadPurpose: owner.intent === "upload" ? "library" : "canvas",
                storageSpace: input.space, isContextValid: () => draft === owner
                && owner.scope === getScopeKey() && isMutable() });
              assetId = result.idMap.get(source.id);
              if (result.importedCount > 0) owner.importedIds.add(assetId);
            }
            assertCurrent(owner);
            if (!assetId) throw new Error("素材入库失败，请重试");
            owner.resolved.set(item.key, assetId);
            const newlyImported = owner.importedIds.has(assetId);
            const existing = catalog?.entries.find((entry) => entry.assetId === assetId && entry.space === input.space);
            // A new upload acquires its personal root placement as part of finalization.
            // Only that placement may be advanced to the chosen folder without a second move prompt.
            const initialMove = newlyImported && input.space === "personal" && input.folderId !== null;
            const initialRootSave = newlyImported && input.space === "personal" && input.folderId === null;
            const action = owner.intent === "upload" ? "add" : item.action || "save";
            if (action !== "add" && !item.assetId && !newlyImported && existing && existing.folderId !== input.folderId) {
              dialog.updateItemsIdentity?.(new Map([[item.key, assetId]]));
              dialog.setCatalog?.(catalog);
              throw new Error("此素材已在当前空间入库，请确认是否移动到所选位置");
            }
            items.push({ assetId, displayName: item.displayName,
              action: initialMove ? "move" : initialRootSave ? "save" : action,
              ...(initialMove ? { expectedFolderId: null }
                : action === "move" ? { expectedFolderId: item.expectedFolderId ?? null } : {}) });
          }
          const byAsset = new Map();
          for (const item of items) if (!byAsset.has(item.assetId)) byAsset.set(item.assetId, item);
          const unique = [...byAsset.values()];
          return await request("save", { ...input, items: unique });
        } finally { owner.saving = false; }
      },
      onSaved(result) {
        onCatalog(result);
        notify("已保存到素材库");
      },
      onClose: releaseDraft,
    });
    function collectEntries(entries, existing = new Map()) {
      const sources = new Map(existing);
      const items = [];
      for (const { asset } of entries) {
        const known = importer.resolvePersonalMedia(asset);
        const key = asset.workspaceAssetId || known?.id || asset.librarySourceId || asset.id;
        if (!key || sources.has(key)) continue;
        sources.set(key, { ...asset });
        items.push({ key, assetId: asset.workspaceAssetId || known?.id,
          displayName: asset.displayName || asset.name || "未命名素材",
          mediaKind: asset.mediaKind || asset.type, url: asset.url, thumbnailUrl: asset.thumbnailUrl });
      }
      return { sources, items };
    }
    function open(entries, { space = "personal", folderId, intent = "save", uploadPolicy, onRelease, onChooseFiles, onRemoveItem } = {}) {
      let released = false;
      const release = () => { if (!released) { released = true; onRelease?.(); } };
      if (!isMutable()) { release(); return false; }
      const { sources, items } = collectEntries(entries);
      if ((!items.length && intent !== "upload") || items.length > 100) {
        release(); notify(items.length ? "每次最多保存 100 个素材，请减少选择" : "选中的节点还没有可保存素材"); return false;
      }
      close();
      draft = { scope: getScopeKey(), sources, items, intent, resolved: new Map(), importedIds: new Set(),
        onRelease: release, onChooseFiles, onRemoveItem, saving: false };
      try {
        if (dialog.open({ items, space, folderId, intent, uploadPolicy }) === false) { close(); return false; }
        return true;
      } catch (error) {
        close();
        throw error;
      }
    }
    function appendEntries(entries) {
      const owner = draft;
      assertCurrent(owner);
      if (owner.intent !== "upload" || owner.saving) throw new Error("当前无法添加文件，请稍后重试");
      const next = collectEntries(entries, owner.sources);
      if (next.sources.size > 100) throw new Error("每次最多上传 100 个素材，请减少选择");
      const items = [...owner.items, ...next.items];
      dialog.setItems(items);
      owner.sources = next.sources;
      owner.items = items;
      return next.items.map((item) => item.key);
    }
    function removeItem(key) {
      const owner = draft;
      assertCurrent(owner);
      if (owner.intent !== "upload" || owner.saving || !owner.sources.has(key)) return false;
      const items = owner.items.filter((item) => item.key !== key);
      dialog.setItems(items);
      owner.sources.delete(key);
      owner.resolved.delete(key);
      owner.items = items;
      owner.onRemoveItem?.(key);
      return true;
    }
    function close() { dialog.close(); releaseDraft(); }
    return Object.freeze({ open, close, appendEntries, showError: (message) => dialog.showError?.(message), isOpen: () => Boolean(draft), destroy() { close(); dialog.destroy(); },
      syncContext() { if (draft && (draft.scope !== getScopeKey() || !isMutable())) close(); } });
  }
  root.REELAY_CANVAS_SAVE_MEDIA_CONTROLLER = Object.freeze({ createSaveMediaController });
})(typeof globalThis === "object" ? globalThis : window);
