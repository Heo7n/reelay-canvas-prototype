(function registerCanvasMediaAssetCoordinator(root) {
  "use strict";

  const PROTOCOL_VERSION = 1;
  const LEGACY_SOURCE = "reelay-legacy-canvas";
  const HOST_SOURCE = "reelay-shell";
  const MEDIA_KINDS = new Set(["image", "video", "audio"]);
  const ERROR_CODES = new Set(["invalid", "forbidden", "missing", "network", "unsupported"]);
  const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;

  function isNonEmptyString(value, maxLength = 200) {
    return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
  }

  function isProjectAsset(value) {
    return Boolean(value && typeof value === "object"
      && isNonEmptyString(value.referenceId) && isNonEmptyString(value.assetId)
      && Number.isInteger(value.assetVersion) && value.assetVersion > 0
      && MEDIA_KINDS.has(value.mediaKind) && isNonEmptyString(value.displayName, 300)
      && isNonEmptyString(value.contentType, 120)
      && Number.isInteger(value.byteSize) && value.byteSize >= 0
      && /^[a-f\d]{64}$/.test(value.checksumSha256)
      && isNonEmptyString(value.contentUrl, 2048));
  }

  function createCanvasMediaAssetCoordinator(options = {}) {
    const instanceId = String(options.instanceId || "").trim();
    const { makeRequestId, postMessage, checksumFile, uploadFile, getBaseUrl, setTimer, clearTimer } = options;
    if (!instanceId || ![makeRequestId, postMessage, checksumFile, uploadFile, getBaseUrl, setTimer, clearTimer].every((entry) => typeof entry === "function")) {
      throw new TypeError("Canvas media asset coordinator dependencies are incomplete.");
    }
    const isHosted = typeof options.isHosted === "function" ? options.isHosted : () => true;
    const getExpectedOrigin = typeof options.getExpectedOrigin === "function" ? options.getExpectedOrigin : () => "";
    const getExpectedSource = typeof options.getExpectedSource === "function" ? options.getExpectedSource : () => null;
    const onProjectAssets = typeof options.onProjectAssets === "function" ? options.onProjectAssets : () => undefined;
    const requestTimeoutMs = Number.isFinite(options.requestTimeoutMs) ? options.requestTimeoutMs : 120_000;
    const pending = new Map();
    const seenProjectAssetRequests = new Set();

    function send(type, payload) {
      if (!isHosted()) return false;
      postMessage({ source: LEGACY_SOURCE, type, protocolVersion: PROTOCOL_VERSION, instanceId, ...payload });
      return true;
    }

    function commandError(code, message) {
      const error = new Error(message || "资产请求失败");
      error.code = code;
      return error;
    }

    function finish(requestId, error, value) {
      const operation = pending.get(requestId);
      if (!operation) return false;
      pending.delete(requestId);
      clearTimer(operation.timeoutId);
      if (error) operation.reject(error);
      else operation.resolve(value);
      return true;
    }

    async function persistFile(file, metadata = {}) {
      if (!isHosted()) throw commandError("unsupported", "当前画布未连接资产持久化服务");
      const mediaKind = metadata.mediaKind;
      const displayName = String(metadata.displayName || file?.name || "").trim();
      const contentType = String(metadata.contentType || file?.type || "").trim().toLowerCase();
      const byteSize = file?.size;
      if (!file || !MEDIA_KINDS.has(mediaKind) || !isNonEmptyString(displayName, 300)
        || !isNonEmptyString(contentType, 120) || !Number.isInteger(byteSize)
        || byteSize <= 0 || byteSize > MAX_UPLOAD_BYTES) {
        throw commandError("invalid", "文件类型、大小或名称不符合上传要求");
      }
      const checksumSha256 = String(await checksumFile(file)).toLowerCase();
      if (!/^[a-f\d]{64}$/.test(checksumSha256)) throw commandError("invalid", "文件校验值无效");
      const requestId = String(makeRequestId()).trim();
      const idempotencyKey = String(makeRequestId()).trim();
      if (!requestId || !idempotencyKey || pending.has(requestId)) throw commandError("invalid", "无法创建唯一的上传请求");
      return new Promise((resolve, reject) => {
        const timeoutId = setTimer(() => finish(requestId, commandError("network", "资产上传请求已超时")), requestTimeoutMs);
        pending.set(requestId, { file, resolve, reject, timeoutId, stage: "grant", uploadId: null });
        send("canvas:create-media-upload", { requestId, idempotencyKey, mediaKind, displayName, contentType, byteSize, checksumSha256 });
      });
    }

    function isTrustedHostEvent(event) {
      return Boolean(isHosted() && event && event.origin === getExpectedOrigin() && event.source === getExpectedSource());
    }

    function acceptProjectAssets(message) {
      if (message.instanceId !== instanceId || !isNonEmptyString(message.requestId)
        || seenProjectAssetRequests.has(message.requestId) || !Array.isArray(message.projectAssets)
        || !message.projectAssets.every(isProjectAsset)) return false;
      seenProjectAssetRequests.add(message.requestId);
      onProjectAssets(message.projectAssets.map((asset) => ({ ...asset })));
      return true;
    }

    function acceptUploadGrant(message) {
      const operation = pending.get(message.requestId);
      if (message.instanceId !== instanceId || !operation || operation.stage !== "grant"
        || !isNonEmptyString(message.uploadIntent?.id) || message.upload?.method !== "PUT"
        || !isNonEmptyString(message.upload?.url, 4096) || !message.upload.headers
        || typeof message.upload.headers !== "object" || Array.isArray(message.upload.headers)
        || !Object.values(message.upload.headers).every((value) => typeof value === "string")) return false;
      let uploadUrl;
      try {
        const baseUrl = new URL(getBaseUrl());
        uploadUrl = new URL(message.upload.url, baseUrl);
        if (uploadUrl.origin !== baseUrl.origin) throw new Error("Cross-origin upload grants are not enabled.");
      } catch (error) {
        finish(message.requestId, commandError("invalid", error?.message || "上传地址无效"));
        return true;
      }
      operation.stage = "uploading";
      operation.uploadId = message.uploadIntent.id;
      void Promise.resolve(uploadFile({ url: uploadUrl.href, method: "PUT", headers: { ...message.upload.headers }, file: operation.file })).then(
        () => {
          if (!pending.has(message.requestId)) return;
          operation.stage = "finalize";
          send("canvas:finalize-media-upload", { requestId: message.requestId, uploadId: operation.uploadId });
        },
        (error) => finish(message.requestId, commandError("network", error?.message || "文件上传失败")),
      );
      return true;
    }

    function acceptUploadResult(message) {
      const operation = pending.get(message.requestId);
      if (message.instanceId !== instanceId || !operation || operation.stage !== "finalize"
        || message.uploadId !== operation.uploadId || !isProjectAsset(message.projectAsset)) return false;
      return finish(message.requestId, null, { ...message.projectAsset });
    }

    function acceptError(message) {
      const operation = pending.get(message.requestId);
      if (message.instanceId !== instanceId || !operation || !ERROR_CODES.has(message.code)) return false;
      return finish(message.requestId, commandError(message.code, "资产命令执行失败"));
    }

    function handleHostMessage(event) {
      if (!isTrustedHostEvent(event)) return false;
      const message = event.data;
      if (!message || typeof message !== "object" || message.source !== HOST_SOURCE || message.protocolVersion !== PROTOCOL_VERSION) return false;
      if (message.type === "host:project-assets") return acceptProjectAssets(message);
      if (message.type === "host:media-upload-grant") return acceptUploadGrant(message);
      if (message.type === "host:media-upload-result") return acceptUploadResult(message);
      if (message.type === "host:asset-command-error") return acceptError(message);
      return false;
    }

    function dispose() {
      for (const requestId of [...pending.keys()]) finish(requestId, commandError("network", "资产协调器已停止"));
      seenProjectAssetRequests.clear();
    }

    return Object.freeze({ dispose, getPendingCount: () => pending.size, handleHostMessage, persistFile });
  }

  root.REELAY_CANVAS_MEDIA_ASSET_COORDINATOR = Object.freeze({ createCanvasMediaAssetCoordinator });
}(typeof globalThis === "object" ? globalThis : window));
