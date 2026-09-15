(function registerLibraryUploadController(root) {
  "use strict";

  function createLibraryUploadController(options = {}) {
    const { saveController, isMutable, getUploadPolicy, getScopeKey, pickFiles } = options;
    if (![saveController?.open, saveController?.appendEntries, isMutable, getUploadPolicy, getScopeKey, pickFiles].every((value) => typeof value === "function")) {
      throw new TypeError("Library upload controller dependencies are incomplete.");
    }
    const createObjectURL = options.createObjectURL || ((blob) => root.URL.createObjectURL(blob));
    const revokeObjectURL = options.revokeObjectURL || ((url) => root.URL.revokeObjectURL(url));
    const makeId = options.makeId || (() => root.crypto.randomUUID());
    const makeBlob = options.makeBlob || ((file, type) => new root.Blob([file], { type }));
    let active = null;
    let chooser = null;
    const isCurrent = (owner) => owner && active === owner && owner.scope === getScopeKey() && isMutable();
    function release(owner) {
      for (const url of owner.urls.values()) revokeObjectURL(url);
      owner.urls.clear();
      if (active === owner) active = null;
      if (chooser === owner) chooser = null;
    }
    function choose(owner) {
      if (!isCurrent(owner)) return false;
      chooser = owner;
      try {
        pickFiles({ accept: owner.policy.library.formats.flatMap((format) => Object.keys(format.extensions).map((extension) => `.${extension}`)).join(",") });
        return true;
      }
      catch (error) { chooser = null; throw error; }
    }
    function open({ space = "personal", folderId = null } = {}) {
      if (!isMutable()) return false;
      if (space !== "personal" && space !== "organization") throw new Error("请选择个人或组织空间上传素材");
      const policy = getUploadPolicy();
      if (!policy?.library) throw new Error("上传设置尚未就绪，请稍后重试");
      const owner = { scope: getScopeKey(), urls: new Map(), policy };
      if (active) release(active);
      active = owner;
      try {
        const opened = saveController.open([], {
          space, folderId, intent: "upload", uploadPolicy: policy,
          onChooseFiles: () => choose(owner),
          onRemoveItem(key) {
            const url = owner.urls.get(key);
            if (url) { revokeObjectURL(url); owner.urls.delete(key); }
          },
          onRelease: () => release(owner),
        });
        if (!opened) release(owner);
        return Boolean(opened);
      } catch (error) { release(owner); throw error; }
    }
    function validate(files, currentCount, policy) {
      const input = Array.from(files || []);
      if (input.length + currentCount > 100) throw new Error("每次最多上传 100 个素材，请减少选择");
      // Validate each addition before allocating previews or changing the existing draft.
      return input.map((file) => {
        const name = String(file?.name || "").trim();
        const providedType = String(file?.type || "").trim().toLowerCase().split(";", 1)[0].trim();
        const extension = name.includes(".") ? name.split(".").at(-1).toLowerCase() : "";
        const format = policy.library.formats.find((group) => Object.hasOwn(group.extensions, extension));
        const contentType = format?.extensions[extension];
        const canonicalType = policy.library.contentTypeAliases[providedType] || providedType;
        const mediaKind = format?.mediaKind;
        if (!name || name.length > 300 || !mediaKind || (canonicalType && canonicalType !== "application/octet-stream" && canonicalType !== contentType)) {
          throw new Error(`不支持的文件类型：${name || "未命名文件"}，请选择列表中的图片、视频或音频格式`);
        }
        const limit = Math.min(policy.library.maxFileBytes, policy.maxFileBytesByContentType[contentType] || policy.library.maxFileBytes);
        if (!Number.isSafeInteger(file.size) || file.size <= 0) throw new Error(`文件为空或无法读取：${name}`);
        if (file.size > limit) throw new Error(`${name} 超过单文件 ${limit / (1024 * 1024)} MB 上传限制`);
        return { file, name, contentType, mediaKind };
      });
    }
    function complete(files) {
      const owner = chooser;
      chooser = null;
      if (!isCurrent(owner)) return false;
      const allocated = new Map();
      try {
        const accepted = validate(files, owner.urls.size, owner.policy);
        if (!accepted.length) return false;
        const entries = accepted.map(({ file, name, contentType, mediaKind }) => {
          const blob = file.type === contentType ? file : makeBlob(file, contentType);
          const id = `library-upload-${makeId()}`;
          const url = createObjectURL(blob);
          allocated.set(id, url);
          return { asset: { id, name, displayName: name, type: mediaKind,
            mediaKind, contentType, byteSize: file.size, url } };
        });
        const added = new Set(saveController.appendEntries(entries));
        for (const [key, url] of allocated) {
          if (added.has(key)) owner.urls.set(key, url);
          else revokeObjectURL(url);
        }
        allocated.clear();
        return added.size > 0;
      } catch (error) {
        for (const url of allocated.values()) revokeObjectURL(url);
        if (isCurrent(owner)) saveController.showError?.(error?.message || "无法添加文件，请重试");
        return false;
      }
    }
    return Object.freeze({ open, complete, cancel() { chooser = null; } });
  }

  root.REELAY_CANVAS_LIBRARY_UPLOAD_CONTROLLER = Object.freeze({ createLibraryUploadController });
})(typeof globalThis === "object" ? globalThis : window);
