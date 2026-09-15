(function registerMediaLibraryCoordinator(root) {
  "use strict";

  const commands = new Set(["list", "rename-folder", "create-folder", "create-tag", "save", "delete"]);
  const spaces = new Set(["personal", "organization"]);
  const text = (value) => typeof value === "string" && value.trim().length > 0;
  const folder = (value) => Boolean(value && text(value.id) && text(value.name)
    && spaces.has(value.space) && (value.parentId === null || text(value.parentId)));
  const tag = (value) => Boolean(value && text(value.id) && text(value.name) && spaces.has(value.space));
  function isCatalog(value) {
    return Boolean(value && Array.isArray(value.folders) && value.folders.every(folder)
      && Array.isArray(value.tags) && value.tags.every(tag)
      && Array.isArray(value.entries) && value.entries.every((entry) => entry && text(entry.assetId)
        && text(entry.displayName) && spaces.has(entry.space) && ["image", "video", "audio"].includes(entry.mediaKind)
        && text(entry.contentUrl) && Number.isInteger(entry.assetVersion) && entry.assetVersion > 0
        && (entry.folderId === null || text(entry.folderId)) && Array.isArray(entry.tagIds) && entry.tagIds.every(text)));
  }

  function createMediaLibraryCoordinator(options) {
    const pending = new Map();
    const { instanceId, postMessage, getExpectedSource, getExpectedOrigin, isHosted,
      makeRequestId, setTimer, clearTimer } = options;
    function finish(id, error, result) {
      const request = pending.get(id);
      if (!request) return false;
      pending.delete(id);
      clearTimer(request.timer);
      if (error) request.reject(error);
      else request.resolve(result);
      return true;
    }
    function request(command, payload = {}) {
      if (!commands.has(command)) return Promise.reject(new Error("不支持的素材库操作"));
      if (!isHosted()) return Promise.reject(new Error(command === "delete" ? "请从项目画布打开资产库后删除" : command === "rename-folder" ? "请从项目画布打开资产库后重命名" : "请从项目画布打开素材保存"));
      const requestId = makeRequestId();
      return new Promise((resolve, reject) => {
        const timer = setTimer(() => finish(requestId, new Error("素材请求超时，请重试")), 120_000);
        pending.set(requestId, { command, timer, resolve, reject });
        postMessage({ source: "reelay-legacy-canvas", type: "canvas:media-library-command",
          protocolVersion: 1, instanceId, requestId, command, ...payload });
      });
    }
    function handleHostMessage(event) {
      if (!isHosted() || event.origin !== getExpectedOrigin() || event.source !== getExpectedSource()) return false;
      const message = event.data;
      if (!message || message.source !== "reelay-shell" || message.protocolVersion !== 1
        || message.instanceId !== instanceId || !pending.has(message.requestId)) return false;
      if (message.type === "host:asset-command-error") {
        return finish(message.requestId, new Error(message.message || "素材库操作暂未完成，请重试"));
      }
      const operation = pending.get(message.requestId);
      if (message.type !== "host:media-library-result" || message.command !== operation.command) return false;
      const valid = ["create-folder", "rename-folder"].includes(operation.command) ? folder(message.result)
        : operation.command === "create-tag" ? tag(message.result) : isCatalog(message.result);
      if (!valid) return finish(message.requestId, new Error("素材服务返回了无效结果，请重试"));
      return finish(message.requestId, null, message.result);
    }
    function dispose() {
      for (const id of pending.keys()) finish(id, new Error("当前画布已关闭"));
    }
    return Object.freeze({ request, handleHostMessage, dispose });
  }
  root.REELAY_CANVAS_MEDIA_LIBRARY_COORDINATOR = Object.freeze({ createMediaLibraryCoordinator, isCatalog });
})(typeof globalThis === "object" ? globalThis : window);
