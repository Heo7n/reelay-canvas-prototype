(function registerCanvasAssetLibraryModel(root) {
  "use strict";

  const spaces = new Set(["personal", "organization", "platform"]);
  const mutableSpaces = new Set(["personal", "organization"]);
  const itemKinds = new Set(["media", "entity"]);
  const mediaKinds = new Set(["image", "video", "audio"]);
  const visualMediaKinds = new Set(["image", "video"]);
  const MAX_DIRECTORY_LEVELS = 5;
  const MAX_FOLDER_DEPTH = MAX_DIRECTORY_LEVELS - 1;

  function cloneValue(value) {
    if (Array.isArray(value)) return value.map(cloneValue);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)]));
  }

  function normalizeSearch(value = "") {
    return String(value || "").trim().toLowerCase();
  }

  function matchesSearch(values = [], query = "") {
    const normalizedQuery = normalizeSearch(query);
    if (!normalizedQuery) return true;
    return values
      .flatMap((value) => (Array.isArray(value) ? value : [value]))
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  }

  function normalizeSpace(space) {
    if (space === "official") return "platform";
    return spaces.has(space) ? space : "personal";
  }

  function isMutableSpace(space) {
    if (space === "official") return false;
    return spaces.has(space) && mutableSpaces.has(space);
  }

  function resolveSpace(space, fallback = "personal") {
    const candidate = space == null ? fallback : space;
    if (candidate === "official") return "platform";
    if (!spaces.has(candidate)) throw new Error(`Unknown asset library space: ${String(candidate)}`);
    return candidate;
  }

  function resolveItemKind(kind) {
    if (!itemKinds.has(kind)) throw new Error(`Unknown asset library item kind: ${String(kind)}`);
    return kind;
  }

  function resolveItemRef(value, expectedKind = null) {
    const ref = typeof value === "string" ? { kind: expectedKind, id: value } : value;
    const kind = resolveItemKind(ref?.kind || expectedKind);
    const id = String(ref?.id || "").trim();
    if (!id) throw new Error("Asset library item id is required.");
    if (expectedKind && kind !== expectedKind) throw new Error(`Expected a ${expectedKind} item reference.`);
    return { kind, id };
  }

  function createAssetLibraryStore({ media = [], entities = [], folders = [], placements = [] } = {}) {
    const mediaById = new Map();
    const entitiesById = new Map();
    const foldersById = new Map();
    const placementsByKey = new Map();
    const reviewRequests = new Map();
    const persistedEntityIds = new Set();
    let generatedMediaId = 0;
    let generatedEntityId = 0;
    let generatedFolderId = 0;
    let generatedReviewId = 0;

    function placementKey(item, space) {
      return `${space}:${item.kind}:${item.id}`;
    }

    function getRecord(item) {
      return item.kind === "media" ? mediaById.get(item.id) : entitiesById.get(item.id);
    }

    function requireRecord(item) {
      const record = getRecord(item);
      if (!record) throw new Error(`${item.kind === "media" ? "Media" : "Entity"} not found: ${item.id}`);
      return record;
    }

    function assertPersistedItemCommandAvailable(item, action) {
      const record = requireRecord(item);
      if (item.kind === "media" && record.workspaceAssetId) {
        throw new Error(`云端素材${action}尚未接入，当前操作已取消。`);
      }
      if (item.kind === "entity" && persistedEntityIds.has(item.id)) {
        throw new Error(`持久主体${action}必须通过版本化主体命令执行。`);
      }
      return record;
    }

    function requireOrganizationShareRecord(item) {
      return item.kind === "entity"
        ? assertPersistedItemCommandAvailable(item, "共享")
        : requireRecord(item);
    }

    function assertMutable(space) {
      if (!isMutableSpace(space)) throw new Error(`The ${space} asset library space is read-only.`);
    }

    function normalizeMediaRecord(input, idOverride = null) {
      const source = cloneValue(input || {});
      const id = String(idOverride || source.id || `media-${++generatedMediaId}`).trim();
      if (!id) throw new Error("Media id is required.");
      const mediaKind = source.mediaKind || source.type || (mediaKinds.has(source.kind) ? source.kind : null);
      if (!mediaKinds.has(mediaKind)) throw new Error(`Unknown media kind for ${id}: ${String(mediaKind)}`);
      delete source.kind;
      return {
        ...source,
        id,
        mediaKind,
        type: mediaKind,
      };
    }

    function normalizeMediaRefs(refs = []) {
      const seen = new Set();
      const normalized = [];
      for (const value of refs || []) {
        const mediaId = String(
          typeof value === "string" ? value : value?.mediaId || value?.assetId || value?.id || "",
        ).trim();
        if (!mediaId || seen.has(mediaId)) continue;
        seen.add(mediaId);
        normalized.push({ mediaId, order: normalized.length });
      }
      return normalized;
    }

    function normalizeEntityRecord(input, mediaRefsOverride = null, idOverride = null) {
      const source = input || {};
      const id = String(idOverride || source.id || `entity-${++generatedEntityId}`).trim();
      if (!id) throw new Error("Entity id is required.");
      const refs = normalizeMediaRefs(mediaRefsOverride || source.mediaRefs || []);
      const record = {
        id,
        name: String(source.name || source.displayName || "未命名主体").trim() || "未命名主体",
        mediaRefs: refs,
      };
      if (source.displayName != null) record.displayName = String(source.displayName);
      if (source.description != null) record.description = String(source.description);
      if (Array.isArray(source.tags)) record.tags = source.tags.map((tag) => String(tag));
      const coverMediaId = source.coverMediaId ?? source.coverAssetId;
      if (coverMediaId != null) record.coverMediaId = String(coverMediaId);
      if (source.createdBy != null) record.createdBy = String(source.createdBy);
      if (source.createdAt != null) record.createdAt = source.createdAt;
      if (source.updatedAt != null) record.updatedAt = source.updatedAt;
      if (source.version != null) record.version = source.version;
      if (source.lifecycle != null) record.lifecycle = source.lifecycle;
      return record;
    }

    function validateEntityStructure(entity, mediaMap) {
      if (!entity.mediaRefs.length) throw new Error("An Entity must reference at least one Media item.");
      for (const ref of entity.mediaRefs) {
        if (!mediaMap.has(ref.mediaId)) {
          throw new Error(`Entity ${entity.id} references missing media: ${ref.mediaId}`);
        }
      }
      if (entity.coverMediaId != null && !entity.mediaRefs.some((ref) => ref.mediaId === entity.coverMediaId)) {
        throw new Error(`Entity ${entity.id} cover media must belong to its Media references: ${entity.coverMediaId}`);
      }
      if (entity.coverMediaId != null) {
        const coverMedia = mediaMap.get(entity.coverMediaId);
        if (!coverMedia) throw new Error(`Entity ${entity.id} references missing cover media: ${entity.coverMediaId}`);
        if (!visualMediaKinds.has(coverMedia.mediaKind)) {
          throw new Error(`Entity ${entity.id} cover media must be an image or video: ${entity.coverMediaId}`);
        }
      }
      return entity;
    }

    function createGeneratedFolderId() {
      let candidate;
      do {
        candidate = `folder-${++generatedFolderId}`;
      } while (foldersById.has(candidate));
      return candidate;
    }

    function normalizeFolderRecord(input) {
      const source = input || {};
      const space = resolveSpace(source.space);
      const kind = resolveItemKind(source.kind);
      const id = String(source.id || createGeneratedFolderId()).trim();
      const name = String(source.name || "新建文件夹").trim();
      const parentId = source.parentId == null ? null : String(source.parentId).trim() || null;
      if (!id) throw new Error("Folder id is required.");
      if (!name) throw new Error("Folder name is required.");
      return {
        id,
        name,
        space,
        kind,
        parentId,
        systemDefault: source.systemDefault === true,
      };
    }

    function normalizePlacementRecord(input) {
      const source = input || {};
      const item = resolveItemRef(source.item || source);
      const space = resolveSpace(source.space);
      const folderId = source.folderId == null ? null : String(source.folderId);
      return { item, space, folderId };
    }

    function validateFolder(folderId, space, kind) {
      if (folderId == null) return null;
      const folder = foldersById.get(String(folderId));
      if (!folder) throw new Error(`Folder not found: ${String(folderId)}`);
      if (folder.space !== space || folder.kind !== kind) {
        throw new Error(`Folder ${folder.id} does not belong to ${space}/${kind}.`);
      }
      return folder;
    }

    function getFolderDepthInternal(folderId) {
      const start = foldersById.get(String(folderId || ""));
      if (!start) throw new Error(`Folder not found: ${String(folderId || "")}`);
      const visited = new Set();
      let current = start;
      let depth = 0;
      while (current) {
        if (visited.has(current.id)) throw new Error(`Folder hierarchy contains a cycle at ${current.id}.`);
        visited.add(current.id);
        depth += 1;
        if (depth > MAX_FOLDER_DEPTH) {
          throw new Error(`Folder hierarchy supports at most ${MAX_DIRECTORY_LEVELS} levels including the default directory.`);
        }
        if (current.parentId == null) break;
        const parent = foldersById.get(current.parentId);
        if (!parent) throw new Error(`Folder parent not found: ${current.parentId}`);
        if (parent.space !== current.space || parent.kind !== current.kind) {
          throw new Error(`Folder ${current.id} parent must belong to ${current.space}/${current.kind}.`);
        }
        current = parent;
      }
      return depth;
    }

    function getFolderPathInternal(folderId) {
      if (folderId == null) return [];
      getFolderDepthInternal(folderId);
      const path = [];
      let current = foldersById.get(String(folderId));
      while (current) {
        path.push(current);
        current = current.parentId == null ? null : foldersById.get(current.parentId);
      }
      return path.reverse();
    }

    function isFolderDescendant(candidateId, ancestorId) {
      let current = foldersById.get(String(candidateId || ""));
      const visited = new Set();
      while (current) {
        if (current.id === ancestorId) return true;
        if (visited.has(current.id)) return false;
        visited.add(current.id);
        current = current.parentId == null ? null : foldersById.get(current.parentId);
      }
      return false;
    }

    function getFolderSubtreeHeight(folderId) {
      const rootFolder = foldersById.get(String(folderId || ""));
      if (!rootFolder) throw new Error(`Folder not found: ${String(folderId || "")}`);
      let maximum = 1;
      const queue = [{ id: rootFolder.id, height: 1 }];
      const visited = new Set();
      while (queue.length) {
        const current = queue.shift();
        if (visited.has(current.id)) throw new Error(`Folder hierarchy contains a cycle at ${current.id}.`);
        visited.add(current.id);
        maximum = Math.max(maximum, current.height);
        for (const child of foldersById.values()) {
          if (child.parentId === current.id) queue.push({ id: child.id, height: current.height + 1 });
        }
      }
      return maximum;
    }

    function listFolderSubtreeInternal(folderId) {
      const rootFolder = foldersById.get(String(folderId || ""));
      if (!rootFolder) throw new Error(`Folder not found: ${String(folderId || "")}`);
      const result = [];
      const queue = [rootFolder];
      const visited = new Set();
      while (queue.length) {
        const current = queue.shift();
        if (visited.has(current.id)) throw new Error(`Folder hierarchy contains a cycle at ${current.id}.`);
        visited.add(current.id);
        result.push(current);
        for (const child of foldersById.values()) {
          if (child.parentId === current.id) queue.push(child);
        }
      }
      return result;
    }

    function findDuplicateMedia(input, additionalMedia = []) {
      const incoming = input || {};
      const incomingId = String(incoming.id || "").trim();
      const incomingSourceId = String(incoming.librarySourceId || "").trim();
      const incomingUrl = String(incoming.url || "").trim();
      const candidates = [...mediaById.values(), ...additionalMedia];
      return candidates.find((candidate) => {
        const candidateSourceId = String(candidate.librarySourceId || "").trim();
        const candidateUrl = String(candidate.url || "").trim();
        return Boolean(
          (incomingId && (candidate.id === incomingId || candidateSourceId === incomingId)) ||
          (incomingSourceId && (candidate.id === incomingSourceId || candidateSourceId === incomingSourceId)) ||
          (incomingUrl && candidateUrl && candidateUrl === incomingUrl)
        );
      }) || null;
    }

    function hasPlacementInternal(item, space) {
      return placementsByKey.has(placementKey(item, space));
    }

    function validateMediaPlacementBoundary(item, space, placementMap = placementsByKey) {
      if (item.kind !== "media") return;
      const crossesPlatformBoundary = space === "platform"
        ? [...mutableSpaces].some((mutableSpace) => placementMap.has(placementKey(item, mutableSpace)))
        : mutableSpaces.has(space) && placementMap.has(placementKey(item, "platform"));
      if (crossesPlatformBoundary) {
        throw new Error(`Media ${item.id} cannot have both platform and writable-space placements.`);
      }
    }

    function createPlacement(item, space, folderId = null) {
      validateFolder(folderId, space, item.kind);
      const key = placementKey(item, space);
      if (placementsByKey.has(key)) return false;
      validateMediaPlacementBoundary(item, space);
      placementsByKey.set(key, { item: { ...item }, space, folderId });
      return true;
    }

    for (const input of folders) {
      const folder = normalizeFolderRecord(input);
      if (foldersById.has(folder.id)) throw new Error(`Duplicate folder id: ${folder.id}`);
      foldersById.set(folder.id, folder);
    }
    for (const folder of foldersById.values()) getFolderDepthInternal(folder.id);
    for (const input of media) {
      const record = normalizeMediaRecord(input);
      if (mediaById.has(record.id)) throw new Error(`Duplicate media id: ${record.id}`);
      mediaById.set(record.id, record);
    }
    for (const input of entities) {
      const record = normalizeEntityRecord(input);
      validateEntityStructure(record, mediaById);
      if (entitiesById.has(record.id)) throw new Error(`Duplicate entity id: ${record.id}`);
      entitiesById.set(record.id, record);
      if (Number.isInteger(record.version) && record.version > 0) persistedEntityIds.add(record.id);
    }
    for (const input of placements) {
      const placement = normalizePlacementRecord(input);
      requireRecord(placement.item);
      const key = placementKey(placement.item, placement.space);
      if (!createPlacement(placement.item, placement.space, placement.folderId)) {
        throw new Error(`Duplicate placement: ${key}`);
      }
    }

    function validateEntityVisibility(entity, space, placementMap = placementsByKey, mediaMap = mediaById) {
      if (!entity.mediaRefs.length) throw new Error(`Entity ${entity.id} must reference at least one Media item.`);
      for (const ref of entity.mediaRefs) {
        if (!mediaMap.has(ref.mediaId)) throw new Error(`Entity ${entity.id} references missing media: ${ref.mediaId}`);
        if (!placementMap.has(placementKey({ kind: "media", id: ref.mediaId }, space))) {
          throw new Error(`Entity ${entity.id} cannot be visible in ${space} before media ${ref.mediaId}.`);
        }
      }
      if (entity.coverMediaId != null) {
        const coverMediaId = String(entity.coverMediaId).trim();
        if (!entity.mediaRefs.some((ref) => ref.mediaId === coverMediaId)) {
          throw new Error(`Entity ${entity.id} cover must belong to its mediaRefs.`);
        }
        if (!visualMediaKinds.has(mediaMap.get(coverMediaId)?.mediaKind)) {
          throw new Error(`Entity ${entity.id} cover must be an image or video.`);
        }
      }
    }

    for (const placement of placementsByKey.values()) {
      if (placement.item.kind === "entity") {
        validateEntityVisibility(requireRecord(placement.item), placement.space);
      }
    }

    function listFolders(options = {}) {
      const resolvedSpace = resolveSpace(options.space ?? "personal");
      const resolvedKind = resolveItemKind(options.kind ?? "media");
      const hasParentFilter = Object.prototype.hasOwnProperty.call(options, "parentId");
      const parentId = options.parentId == null ? null : String(options.parentId);
      return [...foldersById.values()]
        .filter((folder) => folder.space === resolvedSpace && folder.kind === resolvedKind)
        .filter((folder) => !hasParentFilter || folder.parentId === parentId)
        .filter((folder) => matchesSearch([folder.name], options.query))
        .map(cloneValue);
    }

    function getFolder(folderId) {
      const folder = foldersById.get(String(folderId || ""));
      return folder ? cloneValue(folder) : null;
    }

    function getFolderPath({ folderId, space = "personal", kind = "media" } = {}) {
      if (folderId == null) return [];
      const resolvedSpace = resolveSpace(space);
      const resolvedKind = resolveItemKind(kind);
      validateFolder(folderId, resolvedSpace, resolvedKind);
      return getFolderPathInternal(folderId).map(cloneValue);
    }

    function listItems(options = {}) {
      const space = resolveSpace(options.space);
      const kind = resolveItemKind(options.kind || "media");
      const hasFolderFilter = Object.prototype.hasOwnProperty.call(options, "folderId");
      const folderId = options.folderId == null ? null : String(options.folderId);
      if (hasFolderFilter) validateFolder(folderId, space, kind);
      const requestedMediaKind = options.mediaKind || options.type || "all";
      return [...placementsByKey.values()]
        .filter((placement) => placement.space === space && placement.item.kind === kind)
        .filter((placement) => !hasFolderFilter || placement.folderId === folderId)
        .map((placement) => ({ placement, record: requireRecord(placement.item) }))
        .filter(({ record }) => kind !== "media" || requestedMediaKind === "all" || record.mediaKind === requestedMediaKind)
        .filter(({ record }) => matchesSearch([
          record.name,
          record.displayName,
          record.mediaKind,
          record.type,
          record.description,
          record.tags,
        ], options.query))
        .map(({ placement, record }) => ({
          ...cloneValue(record),
          kind,
          placement: cloneValue(placement),
        }));
    }

    function getMedia(item) {
      const ref = resolveItemRef(item, "media");
      const record = mediaById.get(ref.id);
      return record ? cloneValue(record) : null;
    }

    function getEntity(item) {
      const ref = resolveItemRef(item, "entity");
      const record = entitiesById.get(ref.id);
      return record ? cloneValue(record) : null;
    }

    function getEntityMedia(item) {
      const entity = getEntity(item);
      if (!entity) return [];
      return entity.mediaRefs.map((ref) => cloneValue(mediaById.get(ref.mediaId))).filter(Boolean);
    }

    function listAllMedia() {
      return [...mediaById.values()].map(cloneValue);
    }

    function hasPlacement(itemOrInput, maybeSpace, maybeFolderId) {
      const wrapped = itemOrInput?.item ? itemOrInput : null;
      const item = resolveItemRef(wrapped?.item || itemOrInput);
      const space = resolveSpace(wrapped?.space || maybeSpace);
      const placement = placementsByKey.get(placementKey(item, space));
      if (!placement) return false;
      const folderId = wrapped && Object.prototype.hasOwnProperty.call(wrapped, "folderId")
        ? wrapped.folderId
        : maybeFolderId;
      return folderId === undefined || placement.folderId === (folderId == null ? null : String(folderId));
    }

    function registerMedia({ media: input, space = "personal", folderId = null } = {}) {
      const resolvedSpace = resolveSpace(space);
      assertMutable(resolvedSpace);
      const platformSourceId = String(input?.platformSourceId || "").trim();
      const workspaceAssetId = String(input?.workspaceAssetId || "").trim();
      if (platformSourceId && !workspaceAssetId) {
        throw new Error("Platform Media import requires an authoritative persisted Workspace Media record.");
      }
      validateFolder(folderId, resolvedSpace, "media");
      const duplicate = findDuplicateMedia(input);
      const record = duplicate || normalizeMediaRecord(input);
      const created = !duplicate;
      if (created) mediaById.set(record.id, record);
      const placementCreated = createPlacement({ kind: "media", id: record.id }, resolvedSpace, folderId);
      return { media: cloneValue(record), created, placementCreated };
    }

    function createEntityVersionConflict(currentVersion, message = "Entity version conflict.") {
      const error = new Error(message);
      error.code = "conflict";
      error.currentVersion = currentVersion;
      return error;
    }

    function normalizePersistedEntityRecord(input) {
      const source = input?.entity || input;
      if (!source || typeof source !== "object" || Array.isArray(source)) {
        throw new TypeError("A persisted Entity record is required.");
      }
      const id = String(source.id || "").trim();
      const name = String(source.name || "").trim();
      const description = String(source.description || "");
      const version = source.version;
      const requestedRefs = source.mediaRefs || (Array.isArray(source.assetIds)
        ? source.assetIds.map((assetId) => ({ mediaId: assetId }))
        : []);
      const mediaRefs = normalizeMediaRefs(requestedRefs);
      if (!id) throw new Error("Persisted Entity id is required.");
      if (!name) throw new Error("Persisted Entity name is required.");
      if (name.length > 200) throw new Error("Persisted Entity name cannot exceed 200 characters.");
      if (description.length > 2_000) throw new Error("Persisted Entity description cannot exceed 2000 characters.");
      if (!mediaRefs.length) throw new Error(`Entity ${id} must reference at least one Media item.`);
      if (mediaRefs.length > 100) throw new Error(`Entity ${id} cannot reference more than 100 Media items.`);
      if (!Number.isInteger(version) || version < 1) {
        throw new Error(`Persisted Entity ${id} version must be a positive integer.`);
      }
      const record = normalizeEntityRecord({
        ...source,
        id,
        name,
        description,
        coverMediaId: source.coverMediaId ?? source.coverAssetId ?? null,
        version,
      }, mediaRefs, id);
      record.coverMediaId = source.coverMediaId == null && source.coverAssetId == null
        ? null
        : String(source.coverMediaId ?? source.coverAssetId).trim() || null;
      return record;
    }

    function entityContentSignature(entity) {
      return JSON.stringify({
        name: entity.name,
        description: entity.description || "",
        mediaRefs: entity.mediaRefs,
        coverMediaId: entity.coverMediaId ?? null,
      });
    }

    function validatePersistedEntityCandidate(entity) {
      validateEntityVisibility(entity, "personal");
      const existing = entitiesById.get(entity.id);
      if (!existing) return;
      if (!persistedEntityIds.has(entity.id)) {
        throw new Error(`Entity id already belongs to a page-local record: ${entity.id}`);
      }
      if (entity.version < existing.version) {
        throw createEntityVersionConflict(existing.version, `Persisted Entity ${entity.id} version cannot move backwards.`);
      }
      if (entity.version === existing.version && entityContentSignature(entity) !== entityContentSignature(existing)) {
        throw createEntityVersionConflict(existing.version, `Persisted Entity ${entity.id} changed without a new version.`);
      }
    }

    function registerPersistedEntity(input = {}) {
      if (input.space != null && resolveSpace(input.space) !== "personal") {
        throw new Error("Persisted Entity projection currently supports only personal space.");
      }
      if (input.folderId != null) {
        throw new Error("Persisted Entity projection belongs in the personal root directory.");
      }
      const entity = normalizePersistedEntityRecord(input);
      validatePersistedEntityCandidate(entity);
      const previous = entitiesById.get(entity.id) || null;
      const item = { kind: "entity", id: entity.id };
      const key = placementKey(item, "personal");
      const previousPlacement = placementsByKey.get(key) || null;
      const created = previous == null;
      const updated = previous != null && entity.version > previous.version;
      entitiesById.set(entity.id, entity);
      persistedEntityIds.add(entity.id);
      placementsByKey.set(key, { item, space: "personal", folderId: null });
      return {
        entity: cloneValue(entity),
        created,
        updated,
        placementCreated: previousPlacement == null,
      };
    }

    function syncPersistedEntities(input = {}) {
      const values = Array.isArray(input) ? input : input.entities;
      if (!Array.isArray(values)) throw new TypeError("Persisted Entity catalog must be an array.");
      const staged = new Map();
      for (const value of values) {
        const entity = normalizePersistedEntityRecord(value);
        if (staged.has(entity.id)) throw new Error(`Duplicate persisted Entity id: ${entity.id}`);
        validatePersistedEntityCandidate(entity);
        staged.set(entity.id, entity);
      }

      const removedEntityIds = [...persistedEntityIds].filter((entityId) => !staged.has(entityId));
      for (const entityId of removedEntityIds) {
        const item = { kind: "entity", id: entityId };
        placementsByKey.delete(placementKey(item, "personal"));
        const hasOtherPlacement = [...placementsByKey.values()].some(
          (placement) => placement.item.kind === "entity" && placement.item.id === entityId,
        );
        if (!hasOtherPlacement) {
          entitiesById.delete(entityId);
          persistedEntityIds.delete(entityId);
        }
      }
      for (const entity of staged.values()) {
        const item = { kind: "entity", id: entity.id };
        entitiesById.set(entity.id, entity);
        persistedEntityIds.add(entity.id);
        placementsByKey.set(placementKey(item, "personal"), { item, space: "personal", folderId: null });
      }
      return {
        entities: [...staged.values()].map(cloneValue),
        removedEntityIds,
      };
    }

    function updateEntity(input = {}) {
      const entityId = String(input.entityId || input.item?.id || "").trim();
      const current = entitiesById.get(entityId);
      if (!current) throw new Error(`Entity not found: ${entityId}`);
      if (!persistedEntityIds.has(entityId) || !Number.isInteger(current.version)) {
        throw new Error(`Entity ${entityId} does not have a persistent version.`);
      }
      if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
        throw new Error("Entity expectedVersion must be a positive integer.");
      }
      if (input.expectedVersion !== current.version) {
        throw createEntityVersionConflict(current.version);
      }
      const mediaRefs = Object.prototype.hasOwnProperty.call(input, "mediaRefs")
        ? input.mediaRefs
        : current.mediaRefs;
      const coverMediaId = Object.prototype.hasOwnProperty.call(input, "coverMediaId")
        ? input.coverMediaId
        : current.coverMediaId;
      const next = normalizePersistedEntityRecord({
        ...current,
        name: Object.prototype.hasOwnProperty.call(input, "name") ? input.name : current.name,
        description: Object.prototype.hasOwnProperty.call(input, "description")
          ? input.description
          : current.description,
        mediaRefs,
        coverMediaId,
        version: current.version + 1,
        updatedAt: input.updatedAt ?? current.updatedAt,
      });
      validateEntityVisibility(next, "personal");
      entitiesById.set(entityId, next);
      return cloneValue(next);
    }

    function createFolder(input = {}) {
      const folder = normalizeFolderRecord(input.folder ? {
        ...input.folder,
        space: input.space ?? input.folder.space,
        kind: input.kind ?? input.folder.kind,
      } : input);
      assertMutable(folder.space);
      if (foldersById.has(folder.id)) throw new Error(`Duplicate folder id: ${folder.id}`);
      const parent = validateFolder(folder.parentId, folder.space, folder.kind);
      const depth = parent ? getFolderDepthInternal(parent.id) + 1 : 1;
      if (depth > MAX_FOLDER_DEPTH) {
        throw new Error(`Folder hierarchy supports at most ${MAX_DIRECTORY_LEVELS} levels including the default directory.`);
      }
      const duplicateName = [...foldersById.values()].some(
        (candidate) => candidate.space === folder.space && candidate.kind === folder.kind &&
          candidate.parentId === folder.parentId &&
          normalizeSearch(candidate.name) === normalizeSearch(folder.name),
      );
      if (duplicateName) throw new Error(`Folder name already exists in this directory: ${folder.name}`);
      foldersById.set(folder.id, folder);
      return cloneValue(folder);
    }

    function renameFolder({ folderId, name, space } = {}) {
      const folder = foldersById.get(String(folderId || ""));
      if (!folder) throw new Error(`Folder not found: ${String(folderId || "")}`);
      const resolvedSpace = resolveSpace(space, folder.space);
      assertMutable(resolvedSpace);
      if (folder.space !== resolvedSpace) throw new Error(`Folder ${folder.id} does not belong to ${resolvedSpace}.`);
      const normalizedName = String(name || "").trim();
      if (!normalizedName) throw new Error("Folder name is required.");
      const duplicateName = [...foldersById.values()].some(
        (candidate) => candidate.id !== folder.id && candidate.space === folder.space && candidate.kind === folder.kind &&
          candidate.parentId === folder.parentId &&
          normalizeSearch(candidate.name) === normalizeSearch(normalizedName),
      );
      if (duplicateName) throw new Error(`Folder name already exists in this directory: ${normalizedName}`);
      folder.name = normalizedName;
      return cloneValue(folder);
    }

    function moveFolder({ folderId, parentId = null, space } = {}) {
      const folder = foldersById.get(String(folderId || ""));
      if (!folder) throw new Error(`Folder not found: ${String(folderId || "")}`);
      const resolvedSpace = resolveSpace(space, folder.space);
      assertMutable(resolvedSpace);
      if (folder.space !== resolvedSpace) throw new Error(`Folder ${folder.id} does not belong to ${resolvedSpace}.`);
      const normalizedParentId = parentId == null ? null : String(parentId);
      if (normalizedParentId === folder.id || isFolderDescendant(normalizedParentId, folder.id)) {
        throw new Error("A folder cannot be moved into itself or one of its descendants.");
      }
      const parent = validateFolder(normalizedParentId, folder.space, folder.kind);
      const nextDepth = parent ? getFolderDepthInternal(parent.id) + 1 : 1;
      if (nextDepth + getFolderSubtreeHeight(folder.id) - 1 > MAX_FOLDER_DEPTH) {
        throw new Error(`Folder hierarchy supports at most ${MAX_DIRECTORY_LEVELS} levels including the default directory.`);
      }
      const duplicateName = [...foldersById.values()].some(
        (candidate) => candidate.id !== folder.id && candidate.space === folder.space && candidate.kind === folder.kind &&
          candidate.parentId === normalizedParentId && normalizeSearch(candidate.name) === normalizeSearch(folder.name),
      );
      if (duplicateName) throw new Error(`Folder name already exists in this directory: ${folder.name}`);
      folder.parentId = normalizedParentId;
      return cloneValue(folder);
    }

    function renameItem({ item: itemInput, name, space = "personal" } = {}) {
      const item = resolveItemRef(itemInput);
      const resolvedSpace = resolveSpace(space);
      assertMutable(resolvedSpace);
      if (!hasPlacementInternal(item, resolvedSpace)) throw new Error(`${item.kind} ${item.id} is not visible in ${resolvedSpace}.`);
      const normalizedName = String(name || "").trim();
      if (!normalizedName) throw new Error("Item name is required.");
      const record = assertPersistedItemCommandAvailable(item, "重命名");
      record.name = normalizedName;
      if (Object.prototype.hasOwnProperty.call(record, "displayName")) record.displayName = normalizedName;
      return cloneValue(record);
    }

    function moveItems({ items = [], space = "personal", folderId = null } = {}) {
      const resolvedSpace = resolveSpace(space);
      assertMutable(resolvedSpace);
      const refs = items.map((item) => resolveItemRef(item));
      for (const item of refs) {
        assertPersistedItemCommandAvailable(item, "移动");
        validateFolder(folderId, resolvedSpace, item.kind);
        if (!hasPlacementInternal(item, resolvedSpace)) throw new Error(`${item.kind} ${item.id} is not visible in ${resolvedSpace}.`);
      }
      for (const item of refs) placementsByKey.get(placementKey(item, resolvedSpace)).folderId = folderId;
      return refs.map((item) => cloneValue(placementsByKey.get(placementKey(item, resolvedSpace))));
    }

    function shareToOrganization({
      items = [],
      fromSpace = "personal",
      folderId = null,
      mediaFolderId = null,
      entityFolderId = null,
    } = {}) {
      const sourceSpace = resolveSpace(fromSpace);
      assertMutable(sourceSpace);
      if (sourceSpace !== "personal") throw new Error("Only personal library items can be shared to the organization.");
      const refs = items.map((item) => resolveItemRef(item));
      for (const item of refs) {
        const record = requireOrganizationShareRecord(item);
        if (!hasPlacementInternal(item, sourceSpace)) throw new Error(`${item.kind} ${item.id} is not visible in ${sourceSpace}.`);
        const targetFolderId = item.kind === "media" ? mediaFolderId ?? folderId : entityFolderId ?? folderId;
        validateFolder(targetFolderId, "organization", item.kind);
        if (item.kind === "entity") {
          for (const mediaRef of record.mediaRefs) {
            if (!hasPlacementInternal({ kind: "media", id: mediaRef.mediaId }, sourceSpace)) {
              throw new Error(`Entity ${record.id} references media ${mediaRef.mediaId} outside ${sourceSpace}.`);
            }
          }
        }
      }
      const staged = [];
      for (const item of refs) {
        if (item.kind === "entity") {
          const entity = requireRecord(item);
          for (const mediaRef of entity.mediaRefs) {
            staged.push({
              item: { kind: "media", id: mediaRef.mediaId },
              space: "organization",
              folderId: mediaFolderId,
            });
          }
        }
        staged.push({
          item,
          space: "organization",
          folderId: item.kind === "media" ? mediaFolderId ?? folderId : entityFolderId ?? folderId,
        });
      }
      for (const placement of staged) createPlacement(placement.item, placement.space, placement.folderId);
      return refs.map((item) => cloneValue(placementsByKey.get(placementKey(item, "organization"))));
    }

    function copyFolderToOrganization({ folderId, fromSpace = "personal" } = {}) {
      const sourceSpace = resolveSpace(fromSpace);
      assertMutable(sourceSpace);
      if (sourceSpace !== "personal") throw new Error("Only personal folders can be shared to the organization.");
      const sourceRoot = validateFolder(folderId, sourceSpace, foldersById.get(String(folderId || ""))?.kind);
      const sourceFolders = listFolderSubtreeInternal(sourceRoot.id);
      const itemsBySourceFolderId = new Map(sourceFolders.map((sourceFolder) => [
        sourceFolder.id,
        [...placementsByKey.values()]
          .filter((placement) => placement.space === sourceSpace && placement.folderId === sourceFolder.id)
          .map((placement) => placement.item),
      ]));
      for (const items of itemsBySourceFolderId.values()) {
        for (const item of items) requireOrganizationShareRecord(item);
      }
      const targetBySourceId = new Map();
      let sharedItemCount = 0;

      for (const sourceFolder of sourceFolders) {
        const targetParentId = sourceFolder.id === sourceRoot.id
          ? null
          : targetBySourceId.get(sourceFolder.parentId)?.id || null;
        let targetFolder = [...foldersById.values()].find(
          (candidate) => candidate.space === "organization" && candidate.kind === sourceFolder.kind &&
            candidate.parentId === targetParentId && normalizeSearch(candidate.name) === normalizeSearch(sourceFolder.name),
        );
        if (!targetFolder) {
          targetFolder = createFolder({
            name: sourceFolder.name,
            space: "organization",
            kind: sourceFolder.kind,
            parentId: targetParentId,
          });
        }
        targetBySourceId.set(sourceFolder.id, targetFolder);

        const items = itemsBySourceFolderId.get(sourceFolder.id) || [];
        if (items.length) {
          shareToOrganization({ items, fromSpace: sourceSpace, folderId: targetFolder.id });
          sharedItemCount += items.length;
        }
      }

      return {
        folder: cloneValue(targetBySourceId.get(sourceRoot.id)),
        folderCount: sourceFolders.length,
        itemCount: sharedItemCount,
      };
    }

    function submitReview({ items = [], space = "personal", targetSpace = "organization", operationKey = null } = {}) {
      const sourceSpace = resolveSpace(space);
      const target = resolveSpace(targetSpace);
      assertMutable(sourceSpace);
      if (sourceSpace === target) throw new Error("Review source and target spaces must differ.");
      if (target === "personal") throw new Error("Review target must be organization or platform.");
      const refs = items.map((item) => resolveItemRef(item));
      for (const item of refs) {
        const record = requireRecord(item);
        if (!hasPlacementInternal(item, sourceSpace)) throw new Error(`${item.kind} ${item.id} is not visible in ${sourceSpace}.`);
        if (item.kind === "media" && record.mediaKind === "audio") {
          throw new Error(`Audio Media cannot be submitted for Seedance compliance review: ${item.id}`);
        }
      }
      const reviews = [];
      for (const item of refs) {
        const key = operationKey ? `${operationKey}:${item.kind}:${item.id}` : null;
        const existing = [...reviewRequests.values()].find((review) =>
          (key && review.operationKey === key) ||
          (!key && review.status === "pending" && review.space === sourceSpace && review.targetSpace === target &&
            review.item.kind === item.kind && review.item.id === item.id),
        );
        if (existing) {
          reviews.push(cloneValue(existing));
          continue;
        }
        const entity = item.kind === "entity" ? requireRecord(item) : null;
        const review = {
          id: `review-${++generatedReviewId}`,
          operationKey: key,
          item: { ...item },
          space: sourceSpace,
          targetSpace: target,
          status: "pending",
          dependencyMediaIds: entity ? entity.mediaRefs.map((ref) => ref.mediaId) : [],
        };
        reviewRequests.set(review.id, review);
        reviews.push(cloneValue(review));
      }
      return reviews;
    }

    function removePlacements({ items = [], space = "personal" } = {}) {
      const resolvedSpace = resolveSpace(space);
      assertMutable(resolvedSpace);
      const refs = items.map((item) => resolveItemRef(item));
      const removalKeys = new Set();
      for (const item of refs) {
        assertPersistedItemCommandAvailable(item, "删除");
        const key = placementKey(item, resolvedSpace);
        if (!placementsByKey.has(key)) throw new Error(`${item.kind} ${item.id} is not visible in ${resolvedSpace}.`);
        removalKeys.add(key);
      }
      for (const item of refs.filter((candidate) => candidate.kind === "media")) {
        for (const placement of placementsByKey.values()) {
          if (placement.space !== resolvedSpace || placement.item.kind !== "entity") continue;
          if (removalKeys.has(placementKey(placement.item, resolvedSpace))) continue;
          const entity = requireRecord(placement.item);
          if (entity.mediaRefs.some((ref) => ref.mediaId === item.id)) {
            throw new Error(`Media ${item.id} is still referenced by Entity ${entity.id} in ${resolvedSpace}.`);
          }
        }
      }
      for (const key of removalKeys) placementsByKey.delete(key);
      return refs.map(cloneValue);
    }

    function removeFolder({ folderId, space } = {}) {
      const folder = foldersById.get(String(folderId || ""));
      if (!folder) throw new Error(`Folder not found: ${String(folderId || "")}`);
      const resolvedSpace = resolveSpace(space, folder.space);
      assertMutable(resolvedSpace);
      if (folder.space !== resolvedSpace) throw new Error(`Folder ${folder.id} does not belong to ${resolvedSpace}.`);
      const subtree = listFolderSubtreeInternal(folder.id);
      const subtreeIds = new Set(subtree.map((entry) => entry.id));
      const items = [...placementsByKey.values()]
        .filter((placement) => placement.space === resolvedSpace && subtreeIds.has(placement.folderId))
        .map((placement) => placement.item);
      if (items.length) removePlacements({ items, space: resolvedSpace });
      for (const entry of subtree.reverse()) foldersById.delete(entry.id);
      return { folders: subtree.map(cloneValue), items: items.map(cloneValue) };
    }

    function snapshot() {
      return cloneValue({
        media: [...mediaById.values()],
        entities: [...entitiesById.values()],
        folders: [...foldersById.values()],
        placements: [...placementsByKey.values()],
        reviews: [...reviewRequests.values()],
      });
    }

    return Object.freeze({
      listFolders,
      getFolder,
      getFolderPath,
      listItems,
      getMedia,
      getEntity,
      getEntityMedia,
      listAllMedia,
      hasPlacement,
      snapshot,
      registerMedia,
      registerPersistedEntity,
      syncPersistedEntities,
      updateEntity,
      createFolder,
      renameFolder,
      moveFolder,
      renameItem,
      moveItems,
      shareToOrganization,
      copyFolderToOrganization,
      submitReview,
      removePlacements,
      removeFolder,
    });
  }

  root.REELAY_CANVAS_ASSET_LIBRARY_MODEL = Object.freeze({
    MAX_DIRECTORY_LEVELS,
    normalizeSearch,
    matchesSearch,
    normalizeSpace,
    isMutableSpace,
    createAssetLibraryStore,
  });
})(typeof globalThis === "object" ? globalThis : window);
