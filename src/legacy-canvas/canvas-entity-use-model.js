(function registerCanvasEntityUseModel(root) {
  "use strict";

  const sourceIdFields = Object.freeze([
    "librarySourceId",
    "workspaceAssetId",
    "platformSourceId",
    "sourceId",
  ]);
  const mediaIdFields = Object.freeze(["id", "assetId", "mediaAssetId"]);

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

  function normalizeId(value) {
    return String(value ?? "").trim();
  }

  function unwrapMedia(value) {
    return value?.media && typeof value.media === "object" ? value.media : value;
  }

  function getMediaId(value) {
    const media = unwrapMedia(value);
    for (const field of mediaIdFields) {
      const mediaId = normalizeId(media?.[field]);
      if (mediaId) return mediaId;
    }
    return "";
  }

  function getMediaIdentityKeys(value) {
    const media = unwrapMedia(value);
    if (!media || typeof media !== "object") return Object.freeze([]);
    const keys = [];
    const seen = new Set();
    for (const field of [...mediaIdFields, ...sourceIdFields]) {
      const key = normalizeId(media[field]);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      keys.push(key);
    }
    return Object.freeze(keys);
  }

  function getSourceMediaId(media) {
    for (const field of sourceIdFields) {
      const sourceId = normalizeId(media?.[field]);
      if (sourceId) return sourceId;
    }
    return getMediaId(media);
  }

  function normalizeMediaRef(value) {
    return normalizeId(
      typeof value === "string"
        ? value
        : value?.mediaId || value?.assetId || value?.mediaAssetId || value?.id,
    );
  }

  function normalizeEntity(value) {
    const entity = value?.entity && typeof value.entity === "object" ? value.entity : value;
    return entity && typeof entity === "object" ? entity : null;
  }

  function createEntityMediaPlan(options = {}) {
    const entities = Array.isArray(options.entities) ? options.entities : [];
    const media = Array.isArray(options.media) ? options.media : [];
    const existingMedia = Array.isArray(options.existingMedia) ? options.existingMedia : [];
    const isMediaVisible = typeof options.isMediaVisible === "function"
      ? options.isMediaVisible
      : null;
    const mediaById = new Map();

    for (const value of media) {
      const record = unwrapMedia(value);
      const mediaId = getMediaId(record);
      if (!mediaId || mediaById.has(mediaId)) continue;
      mediaById.set(mediaId, record.id === mediaId ? record : { ...record, id: mediaId });
    }

    const existingKeys = new Set();
    for (const value of existingMedia) {
      for (const key of getMediaIdentityKeys(value)) existingKeys.add(key);
    }

    const plannedKeys = new Set();
    const entries = [];
    const skipped = [];
    const entityIds = [];

    entities.forEach((value, entityIndex) => {
      const entity = normalizeEntity(value);
      if (!entity) return;
      const entityId = normalizeId(entity.id);
      entityIds.push(entityId);
      const refs = Array.isArray(entity.mediaRefs) ? entity.mediaRefs : [];

      refs.forEach((ref, mediaIndex) => {
        const mediaId = normalizeMediaRef(ref);
        if (!mediaId) return;
        const record = mediaById.get(mediaId);
        if (!record) {
          skipped.push({ entityId, mediaId, entityIndex, mediaIndex, reason: "missing" });
          return;
        }
        const visibleByRecord = record.visible !== false && record.hidden !== true;
        const visibleByScope = !isMediaVisible || isMediaVisible(record, entity, ref) !== false;
        if (!visibleByRecord || !visibleByScope) {
          skipped.push({ entityId, mediaId, entityIndex, mediaIndex, reason: "invisible" });
          return;
        }

        const identityKeys = getMediaIdentityKeys(record);
        if (identityKeys.some((key) => existingKeys.has(key))) {
          skipped.push({ entityId, mediaId, entityIndex, mediaIndex, reason: "existing" });
          return;
        }
        if (identityKeys.some((key) => plannedKeys.has(key))) {
          skipped.push({ entityId, mediaId, entityIndex, mediaIndex, reason: "duplicate" });
          return;
        }
        identityKeys.forEach((key) => plannedKeys.add(key));
        entries.push({
          entityId,
          mediaId,
          sourceMediaId: getSourceMediaId(record),
          entityIndex,
          mediaIndex,
          media: cloneValue(record),
        });
      });
    });

    return freezeValue({
      entityIds,
      entries,
      media: entries.map((entry) => cloneValue(entry.media)),
      skipped,
    });
  }

  function positiveNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  function finiteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function parseAspectRatio(value) {
    if (typeof value === "string") {
      const match = value.trim().match(/^([0-9]+(?:\.[0-9]+)?)\s*[:/]\s*([0-9]+(?:\.[0-9]+)?)$/);
      if (match) return positiveNumber(Number(match[1]) / Number(match[2]), null);
    }
    return positiveNumber(value, null);
  }

  function getMediaAspectRatio(media) {
    const width = positiveNumber(media?.width, null);
    const height = positiveNumber(media?.height, null);
    if (width && height) return width / height;
    const declaredRatio = parseAspectRatio(media?.aspectRatio);
    if (declaredRatio) return declaredRatio;
    const mediaKind = media?.mediaKind || media?.type;
    if (mediaKind === "video") return 16 / 9;
    if (mediaKind === "audio") return 16 / 5;
    return 1;
  }

  function normalizeLayoutEntries(value) {
    const source = Array.isArray(value)
      ? value
      : Array.isArray(value?.entries)
        ? value.entries
        : [];
    return source
      .map((entry) => {
        const media = unwrapMedia(entry);
        if (!media || typeof media !== "object") return null;
        if (entry?.media && typeof entry.media === "object") return cloneValue(entry);
        return {
          mediaId: getMediaId(media),
          sourceMediaId: getSourceMediaId(media),
          media: cloneValue(media),
        };
      })
      .filter(Boolean);
  }

  function getExplicitItemSize(entry, getItemSize) {
    const resolved = getItemSize ? getItemSize(entry) : null;
    const resolvedWidth = positiveNumber(resolved?.width ?? resolved?.layoutWidth, null);
    const resolvedHeight = positiveNumber(resolved?.height ?? resolved?.layoutHeight, null);
    if (resolvedWidth && resolvedHeight) return { width: resolvedWidth, height: resolvedHeight };
    const entryWidth = positiveNumber(entry?.layoutWidth ?? entry?.media?.layoutWidth, null);
    const entryHeight = positiveNumber(entry?.layoutHeight ?? entry?.media?.layoutHeight, null);
    return entryWidth && entryHeight ? { width: entryWidth, height: entryHeight } : null;
  }

  function createCenteredGridPlan(value, options = {}) {
    const entries = normalizeLayoutEntries(value);
    const count = entries.length;
    const centerX = finiteNumber(options.centerX, 0);
    const centerY = finiteNumber(options.centerY, 0);
    const viewportWidth = positiveNumber(options.viewportWidth, 960);
    const viewportHeight = positiveNumber(options.viewportHeight, 640);
    const requestedPadding = Math.max(0, finiteNumber(options.padding, 32));
    const padding = Math.min(requestedPadding, Math.max(0, Math.min(viewportWidth, viewportHeight) / 2 - 0.5));
    const requestedGapX = Math.max(0, finiteNumber(options.gapX, 32));
    const requestedGapY = Math.max(0, finiteNumber(options.gapY, 28));
    const maxItemWidth = positiveNumber(options.maxItemWidth, 240);
    const maxItemHeight = positiveNumber(options.maxItemHeight, 190);
    const maxColumns = Math.max(1, Math.floor(positiveNumber(options.maxColumns, Number.MAX_SAFE_INTEGER)));
    const getItemSize = typeof options.getItemSize === "function" ? options.getItemSize : null;

    if (!count) {
      return freezeValue({
        center: { x: centerX, y: centerY },
        viewport: { width: viewportWidth, height: viewportHeight, padding },
        columns: 0,
        rows: 0,
        gap: { x: 0, y: 0 },
        bounds: { x: centerX, y: centerY, width: 0, height: 0 },
        items: [],
      });
    }

    const columns = Math.min(count, maxColumns, Math.ceil(Math.sqrt(count)));
    const rows = Math.ceil(count / columns);
    const usableWidth = Math.max(columns, viewportWidth - padding * 2);
    const usableHeight = Math.max(rows, viewportHeight - padding * 2);
    const gapX = columns > 1
      ? Math.min(requestedGapX, Math.max(0, (usableWidth - columns) / (columns - 1)))
      : 0;
    const gapY = rows > 1
      ? Math.min(requestedGapY, Math.max(0, (usableHeight - rows) / (rows - 1)))
      : 0;
    const cellWidth = Math.max(1, Math.min(maxItemWidth, (usableWidth - gapX * (columns - 1)) / columns));
    const cellHeight = Math.max(1, Math.min(maxItemHeight, (usableHeight - gapY * (rows - 1)) / rows));

    const rowLayouts = [];
    for (let row = 0; row < rows; row += 1) {
      const start = row * columns;
      const rowEntries = entries.slice(start, start + columns).map((entry, rowIndex) => {
        const explicitSize = getExplicitItemSize(entry, getItemSize);
        const mediaAspectRatio = getMediaAspectRatio(entry.media);
        const cellRatio = cellWidth / cellHeight;
        const width = explicitSize?.width
          || (mediaAspectRatio >= cellRatio ? cellWidth : cellHeight * mediaAspectRatio);
        const height = explicitSize?.height
          || (mediaAspectRatio >= cellRatio ? cellWidth / mediaAspectRatio : cellHeight);
        const aspectRatio = explicitSize ? width / height : mediaAspectRatio;
        return {
          entry,
          index: start + rowIndex,
          row,
          column: rowIndex,
          aspectRatio,
          width,
          height,
        };
      });
      rowLayouts.push({
        entries: rowEntries,
        width: rowEntries.reduce((sum, entry) => sum + entry.width, 0) + gapX * Math.max(0, rowEntries.length - 1),
        height: Math.max(...rowEntries.map((entry) => entry.height)),
      });
    }

    const totalHeight = rowLayouts.reduce((sum, row) => sum + row.height, 0) + gapY * Math.max(0, rows - 1);
    const items = [];
    let cursorY = centerY - totalHeight / 2;
    for (const rowLayout of rowLayouts) {
      let cursorX = centerX - rowLayout.width / 2;
      for (const layout of rowLayout.entries) {
        const x = cursorX;
        const y = cursorY + (rowLayout.height - layout.height) / 2;
        items.push({
          ...layout.entry,
          index: layout.index,
          row: layout.row,
          column: layout.column,
          x,
          y,
          centerX: x + layout.width / 2,
          centerY: y + layout.height / 2,
          width: layout.width,
          height: layout.height,
          aspectRatio: layout.aspectRatio,
        });
        cursorX += layout.width + gapX;
      }
      cursorY += rowLayout.height + gapY;
    }

    const left = Math.min(...items.map((item) => item.x));
    const top = Math.min(...items.map((item) => item.y));
    const right = Math.max(...items.map((item) => item.x + item.width));
    const bottom = Math.max(...items.map((item) => item.y + item.height));
    return freezeValue({
      center: { x: centerX, y: centerY },
      viewport: { width: viewportWidth, height: viewportHeight, padding },
      columns,
      rows,
      gap: { x: gapX, y: gapY },
      bounds: { x: left, y: top, width: right - left, height: bottom - top },
      items,
    });
  }

  root.REELAY_CANVAS_ENTITY_USE_MODEL = Object.freeze({
    getMediaIdentityKeys,
    createEntityMediaPlan,
    createCenteredGridPlan,
  });
})(typeof globalThis === "object" ? globalThis : window);
