(function registerCanvasEntityEditorModel(root) {
  "use strict";

  const MODES = new Set(["create", "edit"]);
  const MEDIA_KINDS = new Set(["image", "video", "audio"]);
  const FILTERS = new Set(["all", ...MEDIA_KINDS]);
  const COVER_MEDIA_KINDS = new Set(["image"]);

  function cloneValue(value) {
    if (Array.isArray(value)) return value.map(cloneValue);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)]));
  }

  function resolveMode(mode) {
    const candidate = mode == null ? "create" : String(mode);
    if (!MODES.has(candidate)) throw new Error(`Unknown Entity editor mode: ${candidate}`);
    return candidate;
  }

  function resolveFilter(filter) {
    const candidate = filter == null ? "all" : String(filter);
    if (!FILTERS.has(candidate)) throw new Error(`Unknown Entity media filter: ${candidate}`);
    return candidate;
  }

  function resolveMediaId(value) {
    const source = value && typeof value === "object" && value.media ? value.media : value;
    const id = typeof source === "string"
      ? source
      : source?.mediaId || source?.id || source?.assetId || source?.workspaceAssetId;
    const normalized = String(id || "").trim();
    if (!normalized) throw new Error("Media id is required.");
    return normalized;
  }

  function normalizeMediaRecord(value, existing = null) {
    const source = value && typeof value === "object" && value.media ? value.media : value;
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      throw new TypeError("A Media record is required.");
    }
    const id = resolveMediaId(source);
    const mediaKind = source.mediaKind || source.type || existing?.mediaKind;
    if (!MEDIA_KINDS.has(mediaKind)) {
      throw new Error(`Unknown media kind for ${id}: ${String(mediaKind)}`);
    }
    return {
      ...(existing ? cloneValue(existing) : {}),
      ...cloneValue(source),
      id,
      mediaKind,
      type: mediaKind,
    };
  }

  function normalizeMediaRefs(values = []) {
    if (!Array.isArray(values)) throw new TypeError("Entity mediaRefs must be an array.");
    const seen = new Set();
    const ids = [];
    for (const value of values) {
      const id = resolveMediaId(value);
      if (seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
    return ids;
  }

  function normalizeExpectedVersion(value) {
    if (value == null) return null;
    if (!Number.isInteger(value) || value < 0) {
      throw new Error("Entity expectedVersion must be a non-negative integer or null.");
    }
    return value;
  }

  function createCanvasEntityEditorDraft(options = {}) {
    const mode = resolveMode(options.mode);
    const inputEntity = options.entity;
    if (mode === "edit" && (!inputEntity || typeof inputEntity !== "object" || Array.isArray(inputEntity))) {
      throw new TypeError("Editing an Entity requires the current Entity record.");
    }

    const mediaById = new Map();
    for (const value of options.media || []) {
      const record = normalizeMediaRecord(value);
      if (mediaById.has(record.id)) throw new Error(`Duplicate Media id: ${record.id}`);
      mediaById.set(record.id, record);
    }

    const source = mode === "edit" ? inputEntity : {};
    const initialMediaIds = normalizeMediaRefs(source.mediaRefs || []);
    for (const mediaId of initialMediaIds) {
      if (!mediaById.has(mediaId)) {
        throw new Error(`Entity references missing Media: ${mediaId}`);
      }
    }

    const initialCoverMediaId = source.coverMediaId == null
      ? null
      : resolveMediaId(source.coverMediaId);
    if (initialCoverMediaId != null) {
      if (!initialMediaIds.includes(initialCoverMediaId)) {
        throw new Error("Entity cover must belong to its mediaRefs.");
      }
      const cover = mediaById.get(initialCoverMediaId);
      if (!COVER_MEDIA_KINDS.has(cover.mediaKind)) {
        throw new Error("Entity cover must be an image.");
      }
    }

    const expectedVersion = normalizeExpectedVersion(
      Object.prototype.hasOwnProperty.call(options, "expectedVersion")
        ? options.expectedVersion
        : source.version,
    );
    const baseline = {
      name: mode === "edit" ? String(source.name || source.displayName || "").trim() : "",
      description: mode === "edit" ? String(source.description || "") : "",
      mediaIds: [...initialMediaIds],
      coverMediaId: initialCoverMediaId,
    };
    if (mode === "edit" && !baseline.name) {
      throw new Error("Entity name is required.");
    }

    const draft = cloneValue(baseline);
    let filter = resolveFilter(options.filter);
    let selectedPreviewId = initialCoverMediaId || initialMediaIds[0] || null;

    function persistedState(value = draft) {
      return {
        name: String(value.name || "").trim(),
        description: String(value.description || ""),
        mediaIds: [...value.mediaIds],
        coverMediaId: value.coverMediaId,
      };
    }

    function isDirty() {
      return JSON.stringify(persistedState()) !== JSON.stringify(persistedState(baseline));
    }

    function requireReferencedMedia(value) {
      const mediaId = resolveMediaId(value);
      if (!draft.mediaIds.includes(mediaId)) {
        throw new Error(`Media is not referenced by this Entity: ${mediaId}`);
      }
      return mediaById.get(mediaId);
    }

    function listMedia(requestedFilter = filter) {
      const resolvedFilter = resolveFilter(requestedFilter);
      return draft.mediaIds
        .map((mediaId) => mediaById.get(mediaId))
        .filter((record) => resolvedFilter === "all" || record.mediaKind === resolvedFilter)
        .map(cloneValue);
    }

    function getCounts() {
      const counts = { all: draft.mediaIds.length, image: 0, video: 0, audio: 0 };
      for (const mediaId of draft.mediaIds) counts[mediaById.get(mediaId).mediaKind] += 1;
      return counts;
    }

    function getTitle() {
      if (mode === "create") return "新建主体";
      return String(draft.name || "").trim() || baseline.name;
    }

    function getValidation() {
      const errors = {};
      const normalizedName = String(draft.name || "").trim();
      if (!normalizedName) errors.name = "主体名称不能为空。";
      else if (normalizedName.length > 200) errors.name = "主体名称不能超过 200 个字符。";
      if (String(draft.description || "").length > 2_000) errors.description = "主体描述不能超过 2000 个字符。";
      if (draft.mediaIds.length === 0) errors.media = "请至少添加一个素材。";
      else if (draft.mediaIds.length > 100) errors.media = "一个主体最多添加 100 个素材。";
      if (draft.coverMediaId != null) {
        const cover = mediaById.get(draft.coverMediaId);
        if (!draft.mediaIds.includes(draft.coverMediaId)) {
          errors.coverMediaId = "主体封面必须属于当前主体。";
        } else if (!cover || !COVER_MEDIA_KINDS.has(cover.mediaKind)) {
          errors.coverMediaId = "主体封面必须是图片。";
        }
      }
      return { valid: Object.keys(errors).length === 0, errors };
    }

    function getState() {
      const validation = getValidation();
      return {
        mode,
        entityId: mode === "edit" ? String(source.id || "").trim() || null : null,
        title: getTitle(),
        name: draft.name,
        description: draft.description,
        mediaRefs: draft.mediaIds.map((mediaId, order) => ({ mediaId, order })),
        coverMediaId: draft.coverMediaId,
        selectedPreviewId,
        filter,
        counts: getCounts(),
        filteredMedia: listMedia(filter),
        expectedVersion,
        dirty: isDirty(),
        valid: validation.valid,
        errors: cloneValue(validation.errors),
      };
    }

    function setName(value) {
      draft.name = String(value == null ? "" : value);
      return getState();
    }

    function setDescription(value) {
      draft.description = String(value == null ? "" : value);
      return getState();
    }

    function setFilter(value) {
      filter = resolveFilter(value);
      return getState();
    }

    function addMedia(value) {
      const mediaId = resolveMediaId(value);
      if (typeof value !== "string" && !(value && typeof value === "object" && Object.keys(value).length === 1 && "mediaId" in value)) {
        const existing = mediaById.get(mediaId) || null;
        mediaById.set(mediaId, normalizeMediaRecord(value, existing));
      } else if (!mediaById.has(mediaId)) {
        throw new Error(`Media not found: ${mediaId}`);
      }
      const added = !draft.mediaIds.includes(mediaId);
      if (added) draft.mediaIds.push(mediaId);
      if (selectedPreviewId == null) selectedPreviewId = mediaId;
      return { added, media: cloneValue(mediaById.get(mediaId)), state: getState() };
    }

    function addMediaBatch(values) {
      if (!Array.isArray(values)) throw new TypeError("Media additions must be an array.");
      return values.map(addMedia);
    }

    function addUploadedMedia(value) {
      if (Array.isArray(value)) return addMediaBatch(value);
      return addMedia(value);
    }

    function selectPreview(value) {
      const media = requireReferencedMedia(value);
      selectedPreviewId = media.id;
      return cloneValue(media);
    }

    function setCover(value) {
      if (value == null || String(value).trim() === "") {
        draft.coverMediaId = null;
        return getState();
      }
      const media = requireReferencedMedia(value);
      if (!COVER_MEDIA_KINDS.has(media.mediaKind)) {
        throw new Error("Entity cover must be an image.");
      }
      draft.coverMediaId = media.id;
      return getState();
    }

    function renameMedia(value, displayName) {
      const media = requireReferencedMedia(value);
      const normalizedName = String(displayName == null ? "" : displayName).trim();
      if (!normalizedName) throw new Error("Media display name is required.");
      if (normalizedName.length > 300) throw new Error("Media display name cannot exceed 300 characters.");
      media.name = normalizedName;
      media.displayName = normalizedName;
      return cloneValue(media);
    }

    function removeMedia(value) {
      const mediaId = resolveMediaId(value);
      const index = draft.mediaIds.indexOf(mediaId);
      if (index < 0) return { removed: false, state: getState() };
      draft.mediaIds.splice(index, 1);
      if (draft.coverMediaId === mediaId) {
        draft.coverMediaId = draft.mediaIds.find((id) => COVER_MEDIA_KINDS.has(mediaById.get(id).mediaKind)) || null;
      }
      if (selectedPreviewId === mediaId) {
        selectedPreviewId = draft.mediaIds[index] || draft.mediaIds[index - 1] || null;
      }
      return { removed: true, media: cloneValue(mediaById.get(mediaId)), state: getState() };
    }

    function createCommitPayload() {
      const validation = getValidation();
      if (!validation.valid) {
        const error = new Error("Entity draft is invalid.");
        error.code = "invalid";
        error.errors = cloneValue(validation.errors);
        throw error;
      }
      return {
        name: String(draft.name).trim(),
        description: String(draft.description),
        mediaRefs: draft.mediaIds.map((mediaId, order) => ({ mediaId, order })),
        coverMediaId: draft.coverMediaId,
        expectedVersion,
      };
    }

    function cancel() {
      draft.name = baseline.name;
      draft.description = baseline.description;
      draft.mediaIds = [...baseline.mediaIds];
      draft.coverMediaId = baseline.coverMediaId;
      selectedPreviewId = baseline.coverMediaId || baseline.mediaIds[0] || null;
      return getState();
    }

    return Object.freeze({
      addMedia,
      addMediaBatch,
      addUploadedMedia,
      cancel,
      createCommitPayload,
      getCounts,
      getState,
      getTitle,
      getValidation,
      isDirty,
      listMedia,
      removeMedia,
      renameMedia,
      selectPreview,
      setCover,
      setDescription,
      setFilter,
      setName,
    });
  }

  root.REELAY_CANVAS_ENTITY_EDITOR_MODEL = Object.freeze({
    createCanvasEntityEditorDraft,
  });
}(typeof globalThis === "object" ? globalThis : window));
