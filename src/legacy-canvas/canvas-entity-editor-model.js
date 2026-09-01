(function registerCanvasEntityEditorModel(root) {
  "use strict";

  const mediaKinds = new Set(["all", "image", "video", "audio"]);
  const spaces = new Set(["personal", "organization", "platform"]);

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

  function hasOwn(value, key) {
    return Object.prototype.hasOwnProperty.call(value || {}, key);
  }

  function normalizeText(value = "") {
    return String(value ?? "").trim().toLowerCase();
  }

  function normalizeSpace(value) {
    const candidate = value === "official" ? "platform" : value;
    return spaces.has(candidate) ? candidate : "personal";
  }

  function normalizeMediaKind(value) {
    return mediaKinds.has(value) ? value : "all";
  }

  function normalizeMediaId(value) {
    return String(typeof value === "string" ? value : value?.mediaId || value?.id || "").trim();
  }

  function normalizeMediaRefs(refs = []) {
    const seen = new Set();
    const normalized = [];
    for (const value of refs || []) {
      const mediaId = normalizeMediaId(value);
      if (!mediaId || seen.has(mediaId)) continue;
      seen.add(mediaId);
      normalized.push({ mediaId, order: normalized.length });
    }
    return normalized;
  }

  function hasMediaRef(refs, mediaId) {
    return Boolean(mediaId) && refs.some((ref) => ref.mediaId === mediaId);
  }

  function freezeDraft(source) {
    const mediaRefs = normalizeMediaRefs(source.mediaRefs || []);
    const firstMediaId = mediaRefs[0]?.mediaId || null;
    const requestedActiveMediaId = normalizeMediaId(source.activeMediaId) || null;
    const requestedCoverMediaId = normalizeMediaId(source.coverMediaId) || null;
    const activeMediaId = hasMediaRef(mediaRefs, requestedActiveMediaId)
      ? requestedActiveMediaId
      : firstMediaId;
    const coverMediaId = hasMediaRef(mediaRefs, requestedCoverMediaId)
      ? requestedCoverMediaId
      : null;
    return freezeValue({
      mode: source.mode === "edit" ? "edit" : "create",
      entityId: source.entityId == null ? null : String(source.entityId).trim() || null,
      space: normalizeSpace(source.space),
      name: String(source.name ?? ""),
      description: String(source.description ?? ""),
      mediaRefs,
      activeMediaId,
      coverMediaId,
      query: String(source.query ?? ""),
      mediaKind: normalizeMediaKind(source.mediaKind),
    });
  }

  function requireDraft(draft) {
    if (!draft || typeof draft !== "object" || !Array.isArray(draft.mediaRefs)) {
      throw new Error("An Entity editor draft is required.");
    }
    return draft;
  }

  function createDraft(options = {}) {
    const entity = options.entity && typeof options.entity === "object" ? options.entity : null;
    const source = entity || {};
    const mediaRefs = hasOwn(options, "mediaRefs") ? options.mediaRefs : source.mediaRefs;
    const coverMediaId = hasOwn(options, "coverMediaId") ? options.coverMediaId : source.coverMediaId;
    return freezeDraft({
      mode: entity?.id ? "edit" : "create",
      entityId: entity?.id || null,
      space: hasOwn(options, "space") ? options.space : source.space,
      name: hasOwn(options, "name") ? options.name : source.name || source.displayName || "",
      description: hasOwn(options, "description") ? options.description : source.description || "",
      mediaRefs: mediaRefs || [],
      activeMediaId: hasOwn(options, "activeMediaId") ? options.activeMediaId : coverMediaId,
      coverMediaId,
      query: options.query,
      mediaKind: options.mediaKind,
    });
  }

  function updateDetails(draft, patch = {}) {
    requireDraft(draft);
    return freezeDraft({
      ...draft,
      name: hasOwn(patch, "name") ? patch.name : draft.name,
      description: hasOwn(patch, "description") ? patch.description : draft.description,
    });
  }

  function addMediaRefs(draft, refs = []) {
    requireDraft(draft);
    const additions = Array.isArray(refs) ? refs : [refs];
    return freezeDraft({
      ...draft,
      mediaRefs: [...draft.mediaRefs, ...additions],
    });
  }

  function removeMediaRef(draft, mediaIdInput) {
    requireDraft(draft);
    const mediaId = normalizeMediaId(mediaIdInput);
    if (!mediaId) throw new Error("Media id is required.");
    return freezeDraft({
      ...draft,
      mediaRefs: draft.mediaRefs.filter((ref) => ref.mediaId !== mediaId),
      activeMediaId: draft.activeMediaId === mediaId ? null : draft.activeMediaId,
      coverMediaId: draft.coverMediaId === mediaId ? null : draft.coverMediaId,
    });
  }

  function setActiveMedia(draft, mediaIdInput) {
    requireDraft(draft);
    const mediaId = normalizeMediaId(mediaIdInput) || null;
    if (mediaId && !hasMediaRef(draft.mediaRefs, mediaId)) {
      throw new Error(`Active Media must belong to the Entity references: ${mediaId}`);
    }
    return freezeDraft({ ...draft, activeMediaId: mediaId });
  }

  function setCoverMedia(draft, mediaInput) {
    requireDraft(draft);
    const mediaId = normalizeMediaId(mediaInput);
    if (!mediaId) throw new Error("A cover Media record is required.");
    if (!hasMediaRef(draft.mediaRefs, mediaId)) {
      throw new Error(`Cover Media must belong to the Entity references: ${mediaId}`);
    }
    if (getMediaKind(mediaInput) !== "image") {
      throw new Error(`Cover Media must be an image: ${mediaId}`);
    }
    return freezeDraft({ ...draft, coverMediaId: mediaId });
  }

  function setFilter(draft, patch = {}) {
    requireDraft(draft);
    return freezeDraft({
      ...draft,
      query: hasOwn(patch, "query") ? patch.query : draft.query,
      mediaKind: hasOwn(patch, "mediaKind") ? patch.mediaKind : draft.mediaKind,
    });
  }

  function getMediaKind(media) {
    const value = media?.mediaKind || media?.type;
    return mediaKinds.has(value) && value !== "all" ? value : null;
  }

  function matchesMedia(media, query) {
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) return true;
    return [media?.id, media?.name, media?.displayName, media?.description, media?.tags]
      .flatMap((value) => (Array.isArray(value) ? value : [value]))
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  }

  function filterMedia(draft, media = []) {
    requireDraft(draft);
    const uniqueMedia = [];
    const seen = new Set();
    for (const item of media || []) {
      const mediaId = normalizeMediaId(item);
      if (!mediaId || seen.has(mediaId)) continue;
      seen.add(mediaId);
      uniqueMedia.push(item);
    }
    const queryMatches = uniqueMedia.filter((item) => matchesMedia(item, draft.query));
    const counts = queryMatches.reduce((result, item) => {
      result.all += 1;
      const mediaKind = getMediaKind(item);
      if (mediaKind) result[mediaKind] += 1;
      return result;
    }, { all: 0, image: 0, video: 0, audio: 0 });
    const items = draft.mediaKind === "all"
      ? queryMatches
      : queryMatches.filter((item) => getMediaKind(item) === draft.mediaKind);
    return freezeValue({
      items: cloneValue(items),
      counts,
      visibleCount: items.length,
    });
  }

  function validateDraft(draft, options = {}) {
    requireDraft(draft);
    const errors = [];
    if (!String(draft.name || "").trim()) {
      errors.push({ field: "name", code: "name_required", message: "请输入主体名称" });
    }
    if (!draft.mediaRefs.length) {
      errors.push({ field: "mediaRefs", code: "media_required", message: "主体至少需要一个素材" });
    }
    if (draft.coverMediaId && !hasMediaRef(draft.mediaRefs, draft.coverMediaId)) {
      errors.push({ field: "coverMediaId", code: "cover_not_referenced", message: "封面必须来自主体素材" });
    }
    if (draft.activeMediaId && !hasMediaRef(draft.mediaRefs, draft.activeMediaId)) {
      errors.push({ field: "activeMediaId", code: "active_not_referenced", message: "当前预览素材不在主体中" });
    }
    if (hasOwn(options, "media")) {
      const availableMedia = new Map(
        (options.media || [])
          .map((item) => [normalizeMediaId(item), item])
          .filter(([mediaId]) => Boolean(mediaId)),
      );
      const missingMediaIds = draft.mediaRefs
        .map((ref) => ref.mediaId)
        .filter((mediaId) => !availableMedia.has(mediaId));
      if (missingMediaIds.length) {
        errors.push({
          field: "mediaRefs",
          code: "media_missing",
          message: `以下素材不可用：${missingMediaIds.join("、")}`,
          mediaIds: missingMediaIds,
        });
      }
      const coverMedia = draft.coverMediaId ? availableMedia.get(draft.coverMediaId) : null;
      if (coverMedia && getMediaKind(coverMedia) !== "image") {
        errors.push({ field: "coverMediaId", code: "cover_not_image", message: "只有图片可以设为主体封面" });
      }
    } else if (draft.coverMediaId) {
      errors.push({ field: "coverMediaId", code: "cover_unverified", message: "无法验证主体封面素材" });
    }
    return freezeValue({ valid: errors.length === 0, errors });
  }

  function toEntityInput(draft, options = {}) {
    requireDraft(draft);
    const validation = validateDraft(draft, options);
    if (!validation.valid) throw new Error(validation.errors[0].message);
    return freezeValue({
      name: String(draft.name).trim(),
      description: String(draft.description || "").trim(),
      mediaRefs: cloneValue(draft.mediaRefs),
      coverMediaId: draft.coverMediaId || null,
    });
  }

  root.REELAY_CANVAS_ENTITY_EDITOR_MODEL = Object.freeze({
    createDraft,
    updateDetails,
    addMediaRefs,
    removeMediaRef,
    setActiveMedia,
    setCoverMedia,
    setFilter,
    filterMedia,
    validateDraft,
    toEntityInput,
  });
})(typeof globalThis === "object" ? globalThis : window);
