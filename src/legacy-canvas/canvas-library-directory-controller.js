(function registerLibraryDirectoryController(root) {
  "use strict";

  function createLibraryDirectoryController(options = {}) {
    const { getScopeKey, getSpace, getFolders, getCurrentFolderId, canCreate, canRename, request,
      onFolder, onDraftChange, onCreated, onError } = options;
    if (![getScopeKey, getSpace, getFolders, canCreate, canRename, request].every((value) => typeof value === "function")) {
      throw new TypeError("Library directory dependencies are incomplete.");
    }
    let draft = null;
    let disposed = false;
    let scope = getScopeKey();
    let space = getSpace();
    let epoch = 0;
    let requestSequence = 0;
    const tokens = new WeakMap();
    const published = new Map();
    const permissions = new Map();
    const permissionEpochs = new Map();
    for (const targetSpace of ["personal", "organization"]) {
      for (const kind of ["create", "rename"]) {
        const key = permissionKey(kind, targetSpace);
        permissions.set(key, permitted(kind, targetSpace));
        permissionEpochs.set(key, 0);
      }
    }

    function permitted(kind, targetSpace) {
      return (targetSpace === "personal" || targetSpace === "organization")
        && Boolean(kind === "create" ? canCreate(targetSpace) : canRename(targetSpace));
    }
    function permissionKey(kind, targetSpace) { return `${targetSpace}:${kind}`; }
    function normalizeName(value) { return String(value ?? "").trim().normalize("NFKC"); }
    function nameKey(value) { return normalizeName(value).toLowerCase(); }
    function folderId(value) { return value == null || value === "" ? null : String(value); }
    function folders(targetSpace) { return (getFolders(targetSpace) || []).filter((folder) => folder.space === targetSpace); }
    function getDraft() { return draft ? Object.freeze({ ...draft }) : null; }
    function publishDraft(change = "structure") { onDraftChange?.(getDraft(), { reason: change }); }
    function clearDraft() {
      if (!draft) return false;
      draft = null;
      publishDraft();
      return true;
    }
    function syncContext() {
      if (disposed) return false;
      const nextScope = getScopeKey();
      const nextSpace = getSpace();
      const changedScope = scope !== nextScope;
      const changedSpace = space !== nextSpace;
      if (changedScope) { epoch += 1; published.clear(); }
      scope = nextScope;
      space = nextSpace;
      for (const targetSpace of ["personal", "organization"]) {
        for (const kind of ["create", "rename"]) {
          const key = permissionKey(kind, targetSpace);
          const allowed = permitted(kind, targetSpace);
          if (allowed !== permissions.get(key)) permissionEpochs.set(key, permissionEpochs.get(key) + 1);
          permissions.set(key, allowed);
        }
      }
      if (draft && (changedScope || changedSpace || !permissions.get(permissionKey(draft.kind, draft.space)))) return clearDraft();
      return false;
    }
    function isCatalogScope(owner) {
      syncContext();
      const token = tokens.get(owner);
      const key = permissionKey(owner.kind, owner.space);
      return !disposed && token?.epoch === epoch && token.permissionEpoch === permissionEpochs.get(key)
        && owner.scope === scope && permissions.get(key);
    }
    function isCurrentScope(owner) { return isCatalogScope(owner) && owner.space === space; }
    function report(message, owner = null) {
      if (owner && draft === owner) { owner.error = message; owner.pending = false; publishDraft(); }
      onError?.(message);
      return false;
    }
    function parentError(parentId, targetSpace) {
      const available = new Map(folders(targetSpace).map((folder) => [folder.id, folder]));
      const seen = new Set();
      let nextId = parentId;
      let depth = 1;
      while (nextId !== null) {
        const parent = available.get(nextId);
        if (!parent || seen.has(nextId)) return "目录层级已变化，请重新选择位置";
        seen.add(nextId);
        depth += 1;
        if (depth > 4) return "目录最多支持五级，当前位置无法新建子文件夹";
        nextId = folderId(parent.parentId);
      }
      return null;
    }
    function begin(kind, values) {
      if (disposed) return false;
      syncContext();
      if (draft?.pending) return false;
      if (!permissions.get(permissionKey(kind, space))) return report(kind === "create" ? "当前空间无法新建文件夹" : "当前空间无法重命名文件夹");
      draft = { kind, space, parentId: null, folderId: null, expectedName: null,
        name: "", error: null, pending: false, scope, ...values };
      tokens.set(draft, { epoch, permissionEpoch: permissionEpochs.get(permissionKey(kind, space)) });
      publishDraft();
      return true;
    }
    function beginCreate(parentId = getCurrentFolderId?.() ?? null) {
      if (disposed) return false;
      syncContext();
      if (draft?.pending) return false;
      const parent = folderId(parentId);
      const error = parentError(parent, space);
      return error ? report(error) : begin("create", { parentId: parent });
    }
    function beginRename(id) {
      if (disposed) return false;
      syncContext();
      if (draft?.pending) return false;
      const folder = folders(space).find((candidate) => candidate.id === String(id ?? ""));
      if (!folder) return report("文件夹不存在或无法访问");
      return begin("rename", { folderId: folder.id, parentId: folderId(folder.parentId), expectedName: folder.name, name: folder.name });
    }
    function setName(value) {
      syncContext();
      if (disposed || !draft || draft.pending) return false;
      const name = String(value ?? "");
      if (draft.name === name && !draft.error) return false;
      draft.name = name;
      draft.error = null;
      publishDraft("input");
      return true;
    }
    function validationError(owner, name) {
      if (!name) return "请输入文件夹名称";
      if (name.length > 100 || [...name].some((character) => character.charCodeAt(0) < 32)) return "文件夹名称需为 1–100 个有效字符";
      const available = folders(owner.space);
      if (owner.kind === "create") {
        const error = parentError(owner.parentId, owner.space);
        if (error) return error;
      } else {
        const current = available.find((folder) => folder.id === owner.folderId);
        if (!current) return "文件夹已不存在，请重新选择";
        if (current.name !== owner.expectedName || folderId(current.parentId) !== owner.parentId) return "目录已变化，请重新打开重命名";
      }
      if (available.some((folder) => folder.id !== owner.folderId && folderId(folder.parentId) === owner.parentId
        && nameKey(folder.name) === nameKey(name))) return "当前目录已有同名文件夹";
      return null;
    }
    async function commit() {
      syncContext();
      const owner = draft;
      if (disposed || !owner || owner.pending || !isCurrentScope(owner)) return null;
      const name = normalizeName(owner.name);
      const error = validationError(owner, name);
      if (error) { report(error, owner); return null; }
      if (owner.kind === "rename" && name === normalizeName(owner.expectedName)) { clearDraft(); return null; }
      const sequence = ++requestSequence;
      const payload = owner.kind === "create"
        ? { space: owner.space, parentId: owner.parentId, name }
        : { space: owner.space, folderId: owner.folderId, name, expectedName: owner.expectedName };
      owner.pending = true;
      owner.error = null;
      publishDraft();
      let result;
      try {
        result = await request(owner.kind === "create" ? "create-folder" : "rename-folder", payload);
        if (!result || typeof result.id !== "string" || !result.id || result.space !== owner.space
          || normalizeName(result.name) !== name || folderId(result.parentId) !== owner.parentId
          || (owner.kind === "rename" && result.id !== owner.folderId)) throw new Error("目录保存结果无效，请刷新后重试");
      } catch (failure) {
        if (isCurrentScope(owner) && draft === owner) report(failure?.message || "目录保存失败，请重试", owner);
        return null;
      }
      if (!isCatalogScope(owner)) return null;
      // A cancelled command still changed the catalog, but a newer observed rename wins.
      const known = folders(owner.space).find((folder) => folder.id === result.id);
      const isNewerName = known && known.name !== result.name
        && (owner.kind === "create" || known.name !== owner.expectedName);
      if (!isNewerName && (published.get(result.id) ?? 0) < sequence) {
        published.set(result.id, sequence);
        onFolder?.({ ...result });
      }
      if (draft === owner) {
        clearDraft();
        if (owner.kind === "create" && draft === null && isCurrentScope(owner)) onCreated?.({ ...result });
      }
      return { ...result };
    }
    function cancel() { return clearDraft(); }
    function destroy() { disposed = true; epoch += 1; published.clear(); clearDraft(); }

    return { beginCreate, beginRename, setName, commit, cancel, getDraft, syncContext, destroy };
  }

  root.REELAY_CANVAS_LIBRARY_DIRECTORY_CONTROLLER = Object.freeze({ createLibraryDirectoryController });
})(typeof window !== "undefined" ? window : globalThis);
