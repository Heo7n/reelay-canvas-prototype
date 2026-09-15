(function registerLibraryDeleteController(root) {
  "use strict";

  function createLibraryDeleteController(options) {
    let active = null;
    const current = (owner) => active === owner && owner.scope === options.getScopeKey()
      && options.canDelete(owner.space);
    function close() {
      const owner = active;
      active = null;
      owner?.dismiss?.();
    }
    function open({ space, items, folderName }) {
      if (!items.length || !options.canDelete(space)) return false;
      if (active?.pending) return false;
      close();
      const groupsOnly = items.every((item) => item.kind === "entity");
      const folder = items.length === 1 && items[0].kind === "folder";
      const noun = folder ? "文件夹" : groupsOnly ? "素材组"
        : items.every((item) => item.kind === "media") ? "素材" : "资产";
      const owner = { scope: options.getScopeKey(), space, items: items.map((item) => ({ ...item })), pending: false };
      active = owner;
      owner.dismiss = options.confirm({
        title: `删除${items.length > 1 ? ` ${items.length} 个` : ""}${noun}？`,
        body: folder
          ? `「${folderName}」及其子文件夹中的素材将从${space === "organization" ? "组织" : "个人"}空间移除。已放到画布上的内容会保留；仍被素材组引用时无法删除。此操作无法撤销。`
          : groupsOnly ? "素材组将从当前空间移除，组内素材和已放到画布上的内容会保留。此操作无法撤销。"
            : "所选资产将从当前空间移除，已放到画布上的内容会保留。仍被未选中素材组引用时无法删除。此操作无法撤销。",
        confirmText: `删除${noun}`,
        danger: true,
        waitForConfirm: true,
        pendingText: "删除中…",
        async onConfirm() {
          if (!current(owner)) throw new Error("空间或访问权限已变化，请重新选择要删除的资产");
          if (owner.pending) return;
          owner.pending = true;
          try {
            const result = await options.remove({ space: owner.space, items: owner.items });
            if (!current(owner)) return;
            options.onDeleted(result, owner.items);
            options.notify(`已删除${folder ? "文件夹" : ` ${owner.items.length} 个${noun}`}`);
            active = null;
          } finally {
            owner.pending = false;
          }
        },
        onCancel() { if (active === owner) active = null; },
      });
      return true;
    }
    return Object.freeze({ open, close, destroy: close,
      syncContext() { if (active && !current(active)) close(); },
    });
  }
  root.REELAY_CANVAS_LIBRARY_DELETE_CONTROLLER = Object.freeze({ createLibraryDeleteController });
})(typeof globalThis === "object" ? globalThis : window);
