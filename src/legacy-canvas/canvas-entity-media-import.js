(function registerCanvasEntityMediaImport(root) {
  "use strict";

  const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;
  const ID_FIELDS = ["workspaceAssetId", "librarySourceId", "id"];
  const KINDS = new Set(["image", "video", "audio"]);
  const EXTENSIONS = /\.(?:png|jpe?g|webp|gif|avif|bmp|mp4|webm|mov|m4v|mp3|wav|ogg|m4a|aac|flac)$/i;

  function mediaKind(media) {
    return media?.mediaKind || media?.type;
  }

  function identities(media) {
    return ID_FIELDS.map((field) => String(media?.[field] || "").trim()).filter(Boolean);
  }

  function failure(message, code = "invalid") {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function contentTypeMatches(type, kind) {
    return typeof type === "string" && type.startsWith(`${kind}/`) && type !== "image/svg+xml";
  }

  function inspectImportSource(media, { baseUrl } = {}) {
    const kind = mediaKind(media);
    const denied = (reason) => Object.freeze({ allowed: false, reason, url: "", mediaKind: kind });
    if (!KINDS.has(kind)) return denied("该节点没有可保存的图片、视频或音频");
    if (media?.workspaceAssetId || media?.projectAssetReferenceId) {
      return denied("该素材尚不属于个人素材库，无法自动收录");
    }
    let url;
    let base;
    try {
      base = new URL(baseUrl);
      url = new URL(String(media?.url || ""), base);
    } catch {
      return denied("该素材的来源地址无效");
    }
    if (!media?.url || url.username || url.password) return denied("该素材的来源地址无效");
    if (url.protocol === "blob:" && url.origin === base.origin) {
      return Object.freeze({ allowed: true, reason: "", url: url.href, mediaKind: kind });
    }
    if (url.protocol === "data:") {
      const type = url.href.match(/^data:([^;,]+)[;,]/i)?.[1]?.toLowerCase();
      if (contentTypeMatches(type, kind)) {
        return Object.freeze({ allowed: true, reason: "", url: url.href, mediaKind: kind });
      }
    }
    if (["http:", "https:"].includes(url.protocol) && url.origin === base.origin
      && url.pathname.startsWith("/assets/") && EXTENSIONS.test(url.pathname)) {
      return Object.freeze({ allowed: true, reason: "", url: url.href, mediaKind: kind });
    }
    return denied("该素材来源暂不支持自动入库，请先下载后上传");
  }

  function createEntityMediaImport(options = {}) {
    const { getPersonalMedia, persistFile, getBaseUrl, getScopeKey } = options;
    if (![getPersonalMedia, persistFile, getBaseUrl, getScopeKey].every((value) => typeof value === "function")) {
      throw new TypeError("Entity media import dependencies are incomplete.");
    }
    const fetchMedia = options.fetchMedia || ((url, init) => root.fetch(url, init));
    const checksumFile = options.checksumFile || (async (file) => {
      const digest = await root.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    });
    const onImported = typeof options.onImported === "function" ? options.onImported : () => undefined;
    const maxUploadBytes = options.maxUploadBytes == null ? MAX_UPLOAD_BYTES : Number(options.maxUploadBytes);
    if (!Number.isSafeInteger(maxUploadBytes) || maxUploadBytes <= 0 || maxUploadBytes > MAX_UPLOAD_BYTES) {
      throw new TypeError("Entity media upload size limit is invalid.");
    }
    // Keep aliases, never Blob/File bodies or a second authoritative personal catalog.
    const importedAliases = new Map();
    const pending = new Map();

    function assertCurrent(scopeKey, isContextValid) {
      if (!scopeKey || getScopeKey() !== scopeKey || !isContextValid()) {
        throw failure("画布或访问权限已变化，请重新打开主体编辑器", "stale");
      }
    }

    function catalog() {
      return getPersonalMedia() || [];
    }

    function byIdentity(media, scopeKey) {
      const ids = new Set(identities(media));
      const resolvedIds = new Set([...ids].map((id) => importedAliases.get(`${scopeKey}\u0000${id}`)).filter(Boolean));
      return catalog().find((candidate) => resolvedIds.has(candidate.id)
        || identities(candidate).some((id) => ids.has(id))) || null;
    }

    function byContent(checksum, size, kind) {
      return catalog().find((candidate) => candidate.checksumSha256 === checksum
        && candidate.byteSize === size && mediaKind(candidate) === kind) || null;
    }

    async function readMedia(source, scopeKey, isContextValid) {
      if (source.url.startsWith("data:") && source.url.length > maxUploadBytes * 4 + 1024) {
        throw failure("素材超过单文件上传大小限制");
      }
      const response = await fetchMedia(source.url, { credentials: "same-origin", redirect: "error" });
      assertCurrent(scopeKey, isContextValid);
      if (!response?.ok || response.redirected) throw failure("素材读取失败，请重新上传后再试", "network");
      if (response.url && response.url !== source.url) throw failure("素材来源发生跳转，无法自动入库");
      const declaredSize = Number(response.headers?.get?.("content-length") || 0);
      if (declaredSize > maxUploadBytes) throw failure("素材超过单文件上传大小限制");
      const contentType = String(response.headers?.get?.("content-type") || "").split(";", 1)[0].trim().toLowerCase();
      if (!contentTypeMatches(contentType, source.mediaKind)) throw failure("素材内容类型与节点不一致，请重新上传");
      let file;
      if (response.body?.getReader) {
        const reader = response.body.getReader();
        const chunks = [];
        let size = 0;
        try {
          while (true) {
            const chunk = await reader.read();
            assertCurrent(scopeKey, isContextValid);
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > maxUploadBytes) throw failure("素材超过单文件上传大小限制");
            chunks.push(chunk.value);
          }
          file = new Blob(chunks, { type: contentType });
        } catch (error) {
          await reader.cancel().catch(() => undefined);
          throw error;
        } finally {
          reader.releaseLock();
        }
      } else {
        file = await response.blob();
      }
      assertCurrent(scopeKey, isContextValid);
      if (!file?.size || file.size > maxUploadBytes) throw failure("素材为空或超过单文件上传大小限制");
      return { file, contentType };
    }

    async function prepareMedia(values, { isContextValid = () => true } = {}) {
      const scopeKey = String(getScopeKey() || "");
      assertCurrent(scopeKey, isContextValid);
      if (!Array.isArray(values) || values.length < 1 || values.length > 100) {
        throw failure("主体需要 1 至 100 个素材");
      }
      const media = [];
      const idMap = new Map();
      let importedCount = 0;
      let reusedCount = 0;
      // Reject unavailable sources before any upload; an empty personal placement is not ownership.
      for (const asset of values) {
        if (!asset?.id) throw failure("素材缺少稳定标识");
        if (!byIdentity(asset, scopeKey)) {
          const source = inspectImportSource(asset, { baseUrl: getBaseUrl() });
          if (!source.allowed) throw failure(source.reason, "unsupported");
        }
      }
      for (const asset of values) {
        assertCurrent(scopeKey, isContextValid);
        let canonical = byIdentity(asset, scopeKey);
        let imported = false;
        if (!canonical) {
          const source = inspectImportSource(asset, { baseUrl: getBaseUrl() });
          const { file, contentType } = await readMedia(source, scopeKey, isContextValid);
          const checksum = String(await checksumFile(file)).toLowerCase();
          assertCurrent(scopeKey, isContextValid);
          if (!/^[a-f\d]{64}$/.test(checksum)) throw failure("素材校验值无效");
          canonical = byContent(checksum, file.size, source.mediaKind);
          if (!canonical) {
            const key = `${scopeKey}:${source.mediaKind}:${file.size}:${checksum}`;
            let operation = pending.get(key);
            if (!operation) {
              const displayName = String(asset.displayName || asset.name || "未命名素材").trim();
              const metadata = { target: "personal", mediaKind: source.mediaKind, displayName, contentType };
              operation = Promise.resolve().then(async () => {
                const identityDigest = String(await checksumFile(new Blob([
                  JSON.stringify([checksum, file.size, source.mediaKind, contentType, displayName]),
                ]))).toLowerCase();
                assertCurrent(scopeKey, isContextValid);
                if (!/^[a-f\d]{64}$/.test(identityDigest)) throw failure("素材幂等标识无效");
                metadata.idempotencyKey = `entity-media-v1-${identityDigest}`;
                return persistFile(file, metadata);
              }).then((saved) => {
                if (!saved?.id || !identities(saved).length || mediaKind(saved) !== source.mediaKind
                  || saved.checksumSha256 !== checksum || saved.byteSize !== file.size) {
                  throw failure("素材入库结果无效", "network");
                }
                const entry = { ...saved };
                identities(asset).forEach((id) => importedAliases.set(`${scopeKey}\u0000${id}`, entry.id));
                // Import succeeded even if the initiating editor has since closed.
                if (getScopeKey() === scopeKey) onImported(entry);
                return entry;
              }).finally(() => pending.delete(key));
              pending.set(key, operation);
              imported = true;
            }
            canonical = await operation;
          }
        }
        assertCurrent(scopeKey, isContextValid);
        identities(asset).forEach((id) => idMap.set(id, canonical.id));
        identities(asset).forEach((id) => importedAliases.set(`${scopeKey}\u0000${id}`, canonical.id));
        if (!media.some((candidate) => candidate.id === canonical.id)) media.push({ ...canonical });
        if (imported) importedCount += 1;
        else reusedCount += 1;
      }
      return { media, idMap, importedCount, reusedCount };
    }

    async function prepareWithFailureNotice(values, context) {
      const beforeIds = new Set(catalog().map((asset) => asset.id));
      const scopeKey = String(getScopeKey() || "");
      try {
        return await prepareMedia(values, context);
      } catch (caught) {
        const error = caught instanceof Error ? caught : failure(caught?.message || "素材入库失败，请重试", caught?.code || "network");
        const importedCount = getScopeKey() === scopeKey
          ? catalog().filter((asset) => !beforeIds.has(asset.id)).length : 0;
        if (importedCount && error.code !== "stale") {
          error.message += `；已入库的 ${importedCount} 个素材会保留，重试不会重复保存`;
        }
        throw error;
      }
    }

    return Object.freeze({
      prepareMedia: prepareWithFailureNotice,
      resolvePersonalMedia: (asset) => byIdentity(asset, String(getScopeKey() || "")),
    });
  }

  root.REELAY_CANVAS_ENTITY_MEDIA_IMPORT = Object.freeze({ createEntityMediaImport, inspectImportSource });
}(typeof globalThis === "object" ? globalThis : window));
