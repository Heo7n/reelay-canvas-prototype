(function registerCanvasEntityAssetCoordinator(root) {
  "use strict";

  const PROTOCOL_VERSION = 1;
  const LEGACY_SOURCE = "reelay-legacy-canvas";
  const HOST_SOURCE = "reelay-shell";
  const MEDIA_KINDS = new Set(["image", "video", "audio"]);
  const ERROR_CODES = new Set(["invalid", "forbidden", "missing", "conflict", "network", "unsupported"]);

  function isNonEmptyString(value, maxLength = 200) {
    return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
  }

  function normalizeRefs(values) {
    if (!Array.isArray(values) || values.length < 1 || values.length > 100) return null;
    const ordered = [...values].sort((left, right) => left.order - right.order);
    const seen = new Set();
    const refs = [];
    for (const value of ordered) {
      if (!value || !isNonEmptyString(value.assetId) || !Number.isInteger(value.order) || value.order < 0 || seen.has(value.assetId)) {
        return null;
      }
      seen.add(value.assetId);
      refs.push({ mediaId: value.assetId, order: refs.length });
    }
    return refs;
  }

  function isWorkspaceAsset(value) {
    return Boolean(value && typeof value === "object"
      && isNonEmptyString(value.assetId)
      && Number.isInteger(value.assetVersion) && value.assetVersion > 0
      && MEDIA_KINDS.has(value.mediaKind)
      && isNonEmptyString(value.displayName, 300)
      && isNonEmptyString(value.contentType, 120)
      && Number.isInteger(value.byteSize) && value.byteSize > 0
      && /^[a-f\d]{64}$/.test(value.checksumSha256)
      && isNonEmptyString(value.contentUrl, 2048));
  }

  function normalizeEntity(value) {
    if (!value || typeof value !== "object" || !isNonEmptyString(value.id)
      || !isNonEmptyString(value.name, 200) || typeof value.description !== "string"
      || value.description.length > 2_000 || !Number.isInteger(value.version) || value.version < 1) return null;
    const mediaRefs = normalizeRefs(value.mediaRefs);
    if (!mediaRefs) return null;
    const coverMediaId = value.coverAssetId == null ? null : String(value.coverAssetId).trim();
    if (coverMediaId && !mediaRefs.some((ref) => ref.mediaId === coverMediaId)) return null;
    return {
      id: String(value.id),
      name: String(value.name),
      description: value.description,
      mediaRefs,
      coverMediaId,
      version: value.version,
    };
  }

  function createCanvasEntityAssetCoordinator(options = {}) {
    const instanceId = String(options.instanceId || "").trim();
    const { makeRequestId, postMessage, setTimer, clearTimer } = options;
    if (!instanceId || ![makeRequestId, postMessage, setTimer, clearTimer].every((entry) => typeof entry === "function")) {
      throw new TypeError("Canvas Entity asset coordinator dependencies are incomplete.");
    }
    const isHosted = typeof options.isHosted === "function" ? options.isHosted : () => true;
    const getExpectedOrigin = typeof options.getExpectedOrigin === "function" ? options.getExpectedOrigin : () => "";
    const getExpectedSource = typeof options.getExpectedSource === "function" ? options.getExpectedSource : () => null;
    const onCatalog = typeof options.onCatalog === "function" ? options.onCatalog : () => undefined;
    const onEntity = typeof options.onEntity === "function" ? options.onEntity : () => undefined;
    const requestTimeoutMs = Number.isFinite(options.requestTimeoutMs) ? options.requestTimeoutMs : 30_000;
    const pending = new Map();
    const seenCatalogRequests = new Set();

    function commandError(code, message) {
      const error = new Error(message || "主体请求失败");
      error.code = code;
      return error;
    }

    function send(type, payload) {
      if (!isHosted()) return false;
      postMessage({ source: LEGACY_SOURCE, type, protocolVersion: PROTOCOL_VERSION, instanceId, ...payload });
      return true;
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

    function normalizeCommandPayload(input, mode) {
      const name = String(input?.name || "").trim();
      const description = String(input?.description || "");
      const refs = Array.isArray(input?.mediaRefs) ? input.mediaRefs : [];
      const assetIds = [];
      const seen = new Set();
      for (const ref of refs) {
        const assetId = String(ref?.mediaId || ref?.assetId || "").trim();
        if (!assetId || seen.has(assetId)) continue;
        seen.add(assetId);
        assetIds.push(assetId);
      }
      const coverAssetId = input?.coverMediaId == null ? null : String(input.coverMediaId).trim() || null;
      if (!name || name.length > 200 || description.length > 2_000 || assetIds.length < 1 || assetIds.length > 100
        || (coverAssetId && !seen.has(coverAssetId))) {
        throw commandError("invalid", "主体名称、素材或封面不符合要求");
      }
      if (mode === "update") {
        const entityId = String(input?.entityId || "").trim();
        if (!entityId || !Number.isInteger(input?.expectedVersion) || input.expectedVersion < 1) {
          throw commandError("invalid", "主体版本信息无效");
        }
        return { entityId, expectedVersion: input.expectedVersion, name, description, assetIds, coverAssetId };
      }
      return { name, description, assetIds, coverAssetId };
    }

    function start(type, payload) {
      if (!isHosted()) return Promise.reject(commandError("unsupported", "当前画布未连接主体持久化服务"));
      const requestId = String(makeRequestId()).trim();
      if (!requestId || pending.has(requestId)) return Promise.reject(commandError("invalid", "无法创建唯一的主体请求"));
      return new Promise((resolve, reject) => {
        const timeoutId = setTimer(() => finish(requestId, commandError("network", "主体请求已超时")), requestTimeoutMs);
        pending.set(requestId, { resolve, reject, timeoutId });
        send(type, { requestId, ...payload });
      });
    }

    function createEntity(input) {
      const payload = normalizeCommandPayload(input, "create");
      const idempotencyKey = String(makeRequestId()).trim();
      if (!idempotencyKey) return Promise.reject(commandError("invalid", "无法创建主体幂等标识"));
      return start("canvas:create-entity", { idempotencyKey, ...payload });
    }

    function updateEntity(input) {
      return start("canvas:update-entity", normalizeCommandPayload(input, "update"));
    }

    function isTrustedHostEvent(event) {
      return Boolean(isHosted() && event && event.origin === getExpectedOrigin() && event.source === getExpectedSource());
    }

    function acceptCatalog(message) {
      if (message.instanceId !== instanceId || !isNonEmptyString(message.requestId)
        || seenCatalogRequests.has(message.requestId) || !Array.isArray(message.assets) || !Array.isArray(message.entities)
        || !message.assets.every(isWorkspaceAsset)) return false;
      const entities = message.entities.map(normalizeEntity);
      if (entities.some((entity) => entity == null)) return false;
      const assetIds = new Set(message.assets.map((asset) => asset.assetId));
      if (entities.some((entity) => entity.mediaRefs.some((ref) => !assetIds.has(ref.mediaId)))) return false;
      seenCatalogRequests.add(message.requestId);
      onCatalog({
        assets: message.assets.map((asset) => ({ ...asset })),
        entities,
      });
      return true;
    }

    function acceptResult(message) {
      if (message.instanceId !== instanceId || !pending.has(message.requestId)) return false;
      const entity = normalizeEntity(message.entity);
      if (!entity) return false;
      onEntity(entity);
      return finish(message.requestId, null, entity);
    }

    function acceptError(message) {
      if (message.instanceId !== instanceId || !pending.has(message.requestId) || !ERROR_CODES.has(message.code)) return false;
      const messages = {
        invalid: "主体内容不符合要求",
        forbidden: "没有权限修改此主体",
        missing: "主体或素材已不存在",
        conflict: "主体已在其他窗口更新，请重新打开后再试",
        network: "主体暂时保存失败",
        unsupported: "当前环境尚未接入主体持久化",
      };
      return finish(message.requestId, commandError(message.code, messages[message.code]));
    }

    function handleHostMessage(event) {
      if (!isTrustedHostEvent(event)) return false;
      const message = event.data;
      if (!message || typeof message !== "object" || message.source !== HOST_SOURCE || message.protocolVersion !== PROTOCOL_VERSION) return false;
      if (message.type === "host:workspace-asset-catalog") return acceptCatalog(message);
      if (message.type === "host:entity-command-result") return acceptResult(message);
      if (message.type === "host:asset-command-error") return acceptError(message);
      return false;
    }

    function dispose() {
      for (const requestId of [...pending.keys()]) finish(requestId, commandError("network", "主体协调器已停止"));
      seenCatalogRequests.clear();
    }

    return Object.freeze({ createEntity, dispose, getPendingCount: () => pending.size, handleHostMessage, updateEntity });
  }

  root.REELAY_CANVAS_ENTITY_ASSET_COORDINATOR = Object.freeze({ createCanvasEntityAssetCoordinator });
}(typeof globalThis === "object" ? globalThis : window));
