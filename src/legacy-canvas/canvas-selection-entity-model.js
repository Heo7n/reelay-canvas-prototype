(function registerCanvasSelectionEntityModel(root) {
  "use strict";

  const MEDIA_KINDS = new Set(["image", "video", "audio"]);
  const ID_FIELDS = ["workspaceAssetId", "librarySourceId", "id"];
  const MAX_MEDIA = 100;

  function cloneValue(value) {
    if (Array.isArray(value)) return value.map(cloneValue);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)]));
  }

  function freezeValue(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.values(value).forEach(freezeValue);
    return Object.freeze(value);
  }

  function identityKeys(media) {
    return ID_FIELDS.map((field) => String(media?.[field] || "").trim()).filter(Boolean);
  }

  function isUsableMedia(media) {
    return Boolean(media && MEDIA_KINDS.has(media.mediaKind || media.type)
      && typeof media.url === "string" && media.url.trim() && identityKeys(media).length);
  }

  function displayedMedia(node) {
    if (!node || node.generating) return null;
    if (node.kind === "asset") {
      const assets = Array.isArray(node.assets) ? node.assets : [];
      return assets.find((asset) => asset?.id === node.activeAssetId) || assets[0] || null;
    }
    return node.kind === "generator" ? node.generatedAsset || null : null;
  }

  function coordinate(value) {
    return Number.isFinite(value) ? value : 0;
  }

  function createSelectionEntityPlan({ nodes = [], personalMedia = [], hosted = true, canCreate = true, catalogStatus = "", canImportMedia = () => false } = {}) {
    const selected = Array.isArray(nodes) ? [...nodes] : [];
    selected.sort((left, right) => coordinate(left?.y) - coordinate(right?.y)
      || coordinate(left?.x) - coordinate(right?.x)
      || String(left?.id || "").localeCompare(String(right?.id || "")));

    const personalByIdentity = new Map();
    for (const record of Array.isArray(personalMedia) ? personalMedia : []) {
      if (!isUsableMedia(record)) continue;
      for (const key of identityKeys(record)) {
        if (!personalByIdentity.has(key)) personalByIdentity.set(key, record);
      }
    }

    const media = [];
    const included = new Set();
    let duplicateCount = 0;
    let emptyCount = 0;
    let unavailableCount = 0;
    let existingCount = 0;
    let pendingImportCount = 0;
    for (const node of selected) {
      const asset = displayedMedia(node);
      if (!isUsableMedia(asset)) {
        emptyCount += 1;
        continue;
      }
      const canonical = identityKeys(asset).map((key) => personalByIdentity.get(key)).find(Boolean);
      if (hosted && !canonical && !(typeof canImportMedia === "function" && canImportMedia(asset) === true)) {
        unavailableCount += 1;
        continue;
      }
      const record = canonical || asset;
      const id = canonical ? String(record.id || identityKeys(record)[0]).trim() : identityKeys(record)[0];
      if (included.has(id)) {
        duplicateCount += 1;
        continue;
      }
      included.add(id);
      const mediaKind = record.mediaKind || record.type;
      media.push({ ...cloneValue(record), id, type: mediaKind, mediaKind });
      if (canonical) existingCount += 1;
      else pendingImportCount += 1;
    }

    const skippedCount = emptyCount + unavailableCount;
    let reason = "";
    if (!canCreate) reason = "当前画布不可新建主体";
    else if (selected.length < 2) reason = "请先选择至少 2 个节点";
    else if (hosted && catalogStatus && catalogStatus !== "ready") {
      reason = catalogStatus === "loading" ? "个人素材库加载中，请稍后重试" : "个人素材库暂不可用，请稍后重试";
    } else if (media.length > MAX_MEDIA) reason = `一个主体最多添加 ${MAX_MEDIA} 个素材，请减少选择`;
    else if (!media.length) {
      reason = unavailableCount ? "选中素材无法导入个人素材库" : "选中节点暂无可用素材";
    }

    const details = [];
    if (pendingImportCount) {
      if (existingCount) details.push(`${existingCount} 个已有素材保持原位置`);
      details.push(`${pendingImportCount} 个新素材将在创建时保存到个人素材库的默认目录`);
    }
    if (duplicateCount) details.push(`已合并 ${duplicateCount} 个重复素材`);
    if (emptyCount) details.push(`已跳过 ${emptyCount} 个暂无可用素材的节点`);
    if (unavailableCount) details.push(`已跳过 ${unavailableCount} 个无法导入个人素材库的素材`);
    const notice = media.length && details.length
      ? `已带入 ${media.length} 个素材；${details.join("；")}`
      : "";

    return freezeValue({ media, selectedCount: selected.length, existingCount, pendingImportCount, duplicateCount, skippedCount, unavailableCount, emptyCount, reason, notice });
  }

  root.REELAY_CANVAS_SELECTION_ENTITY_MODEL = Object.freeze({ createSelectionEntityPlan });
}(typeof globalThis === "object" ? globalThis : window));
