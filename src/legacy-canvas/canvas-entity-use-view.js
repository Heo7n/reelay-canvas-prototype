(function registerCanvasEntityUseView(root) {
  "use strict";

  const HTML_ESCAPES = Object.freeze({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  });
  const ENTITY_SPACES = Object.freeze([
    { id: "personal", label: "个人" },
    { id: "organization", label: "组织" },
  ]);

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
  }

  function classNames(...values) {
    return values.filter(Boolean).join(" ");
  }

  function icon(name, className = "") {
    return `<i${className ? ` class="${className}"` : ""} data-lucide="${name}" aria-hidden="true"></i>`;
  }

  function finiteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
  }

  function normalizeSpace(value) {
    return value === "organization" ? "organization" : "personal";
  }

  function normalizeMediaKind(media) {
    const kind = media?.mediaKind || media?.type;
    return ["image", "video", "audio"].includes(kind) ? kind : null;
  }

  function isVisualMedia(media) {
    return ["image", "video"].includes(normalizeMediaKind(media));
  }

  function safeMediaUrl(value) {
    const url = String(value ?? "").trim();
    if (!url || /[\u0000-\u001f\u007f<>"']/.test(url)) return "";
    const compact = url.replace(/[\u0000-\u0020]+/g, "");
    const scheme = compact.match(/^([a-z][a-z\d+.-]*):/i)?.[1]?.toLowerCase();
    if (scheme && !["http", "https", "blob"].includes(scheme)) {
      const safeDataImage = /^data:image\/(?:avif|gif|jpe?g|png|webp)(?:;|,)/i;
      if (!safeDataImage.test(compact)) return "";
    }
    return escapeHtml(url);
  }

  function normalizeMedia(input) {
    const media = [];
    const seen = new Set();
    for (const candidate of Array.isArray(input) ? input : []) {
      const id = String(candidate?.id || candidate?.mediaId || "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      media.push({ ...candidate, id });
    }
    return media;
  }

  function mediaName(media, fallback = "未命名素材") {
    return String(media?.displayName || media?.name || fallback);
  }

  function renderMediaThumbnail(media, options = {}) {
    if (!media || typeof media !== "object") {
      return `<span class="entity-use-media-placeholder">${icon("image-off")}</span>`;
    }
    const mediaKind = normalizeMediaKind(media);
    const thumbnailUrl = safeMediaUrl(media.thumbnailUrl);
    const mediaUrl = mediaKind === "image" ? safeMediaUrl(media.url) : "";
    const imageUrl = thumbnailUrl || mediaUrl;
    const label = escapeHtml(mediaName(media));
    if (imageUrl) {
      return `<img src="${imageUrl}" alt="${options.decorative ? "" : label}" loading="lazy" draggable="false">`;
    }
    if (mediaKind === "video") {
      return `<span class="entity-use-media-placeholder video" aria-label="${label}，视频">${icon("circle-play")}</span>`;
    }
    if (mediaKind === "audio") {
      return `<span class="entity-use-media-placeholder audio" aria-label="${label}，音频">${icon("audio-lines")}</span>`;
    }
    return `<span class="entity-use-media-placeholder" aria-label="${label}">${icon("image")}</span>`;
  }

  function getRefId(value) {
    return String(typeof value === "string" ? value : value?.mediaId || value?.id || "").trim();
  }

  function resolveEntityMedia(entity, options = {}) {
    const direct = Array.isArray(entity?.media)
      ? entity.media
      : Array.isArray(entity?.mediaItems)
        ? entity.mediaItems
        : null;
    if (direct) return normalizeMedia(direct);

    const entityId = String(entity?.id || "").trim();
    const source = options.mediaByEntity;
    const associated = source && typeof source.get === "function"
      ? source.get(entityId)
      : source && typeof source === "object"
        ? source[entityId]
        : null;
    if (Array.isArray(associated)) return normalizeMedia(associated);

    const allMedia = normalizeMedia(options.media);
    const mediaById = new Map(allMedia.map((media) => [media.id, media]));
    const references = Array.isArray(entity?.mediaRefs) ? entity.mediaRefs : [];
    return normalizeMedia(references.map((reference) => mediaById.get(getRefId(reference))).filter(Boolean));
  }

  function entityName(entity) {
    return String(entity?.displayName || entity?.name || "未命名主体");
  }

  function resolveCoverMedia(entity, media) {
    const requestedId = String(entity?.coverMediaId || "").trim();
    const requested = requestedId ? media.find((candidate) => candidate.id === requestedId) : null;
    if (requested && isVisualMedia(requested)) return requested;
    return media.find(isVisualMedia) || null;
  }

  function detailPlacementStyle(placement) {
    if (!placement || typeof placement !== "object") return "";
    const values = [
      ["--entity-use-detail-left", placement.left],
      ["--entity-use-detail-top", placement.top],
      ["--entity-use-detail-width", placement.width],
      ["--entity-use-detail-max-height", placement.maxHeight],
    ];
    const declarations = values
      .filter(([, value]) => Number.isFinite(Number(value)))
      .map(([name, value]) => `${name}:${Math.round(Number(value))}px`);
    return declarations.length ? ` style="${declarations.join(";")}"` : "";
  }

  function renderEntityDetail(options = {}) {
    if (options.visible === false) return "";
    const entity = options.entity && typeof options.entity === "object" ? options.entity : {};
    const entityId = String(entity.id || "").trim();
    const media = resolveEntityMedia(entity, options);
    const cover = resolveCoverMedia(entity, media);
    const featuredMedia = cover || media.find((item) => safeMediaUrl(item.thumbnailUrl)) || media[0] || null;
    const name = entityName(entity);
    const description = String(entity.description || "").trim();
    const pinned = Boolean(options.pinned);
    const busy = Boolean(options.busy);
    const addSupported = options.canAdd !== false && Boolean(entityId) && media.length > 0;
    const canAdd = addSupported && !busy;
    const unavailableReason = busy
      ? "正在添加主体"
      : options.canAdd === false
        ? "当前画布不可编辑"
        : !entityId || !media.length
          ? "主体没有可添加的素材"
          : "";
    const safeId = escapeHtml(entityId);
    const safeName = escapeHtml(name);
    const safeDescription = escapeHtml(description);
    const state = pinned ? "pinned" : "preview";
    const placement = options.placement && typeof options.placement === "object" ? options.placement : null;

    return `
      <section class="${classNames("entity-use-detail", pinned && "is-pinned", busy && "is-busy")}" role="dialog" aria-modal="false" aria-labelledby="entity-use-detail-title" data-entity-use-detail="${safeId}" data-entity-use-state="${state}" data-pinned="${pinned}" data-placement="${escapeHtml(placement?.side || "right")}"${detailPlacementStyle(placement)}>
        <div class="entity-use-detail-cover" data-cover-kind="${cover ? normalizeMediaKind(cover) : featuredMedia ? "preview" : "empty"}" data-media-kind="${normalizeMediaKind(featuredMedia) || "empty"}">
          ${featuredMedia ? renderMediaThumbnail(featuredMedia) : `<span class="entity-use-media-placeholder entity">${icon("user-round")}</span>`}
        </div>
        <div class="entity-use-detail-copy">
          <div class="entity-use-detail-title-row">
            <h2 id="entity-use-detail-title" title="${safeName}">${safeName}</h2>
            <span class="entity-use-detail-count">${media.length} 个素材</span>
          </div>
          <p${description ? "" : ' class="muted"'}>${description ? safeDescription : "暂无主体描述"}</p>
        </div>
        <footer>
          <button class="entity-use-detail-add" type="button"${canAdd ? ` data-entity-use-action="add-canvas" data-entity-use-add-canvas="${safeId}"` : ` data-entity-use-unavailable="add-canvas" disabled aria-disabled="true" title="${escapeHtml(unavailableReason)}"`}>
            ${busy ? icon("loader-circle") : ""}
            <span>添加到画布</span>
          </button>
        </footer>
      </section>
    `;
  }

  function normalizeRect(value, fallback = {}) {
    const left = finiteNumber(value?.left, finiteNumber(fallback.left, 0));
    const top = finiteNumber(value?.top, finiteNumber(fallback.top, 0));
    const inferredWidth = finiteNumber(value?.right, left) - left;
    const inferredHeight = finiteNumber(value?.bottom, top) - top;
    const widthFallback = Number.isFinite(Number(value?.right)) ? inferredWidth : finiteNumber(fallback.width, inferredWidth);
    const heightFallback = Number.isFinite(Number(value?.bottom)) ? inferredHeight : finiteNumber(fallback.height, inferredHeight);
    const width = Math.max(0, finiteNumber(value?.width, widthFallback));
    const height = Math.max(0, finiteNumber(value?.height, heightFallback));
    return Object.freeze({ left, top, right: left + width, bottom: top + height, width, height });
  }

  function intersectionArea(first, second) {
    const width = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
    const height = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
    return width * height;
  }

  function uniqueNumbers(values) {
    return [...new Set(values.map((value) => Math.round(value * 1000) / 1000))];
  }

  function computeDetailPlacement(options = {}) {
    const viewportWidth = Math.max(1, finiteNumber(options.viewportRect?.width, finiteNumber(options.viewportWidth, 1280)));
    const viewportHeight = Math.max(1, finiteNumber(options.viewportRect?.height, finiteNumber(options.viewportHeight, 720)));
    const viewport = normalizeRect(options.viewportRect, {
      left: 0,
      top: 0,
      width: viewportWidth,
      height: viewportHeight,
    });
    const margin = clamp(finiteNumber(options.margin, 12), 0, Math.min(viewport.width, viewport.height) / 3);
    const gap = clamp(finiteNumber(options.gap, 10), 0, 48);
    const requestedWidth = clamp(finiteNumber(options.panelWidth, 328), 240, Math.max(240, viewport.width - margin * 2));
    const requestedHeight = clamp(finiteNumber(options.panelHeight, 446), 180, Math.max(180, viewport.height - margin * 2));
    const width = Math.min(requestedWidth, Math.max(1, viewport.width - margin * 2));
    const height = Math.min(requestedHeight, Math.max(1, viewport.height - margin * 2));
    const anchor = normalizeRect(options.anchorRect, {
      left: viewport.left + margin,
      top: viewport.top + margin,
      width: 1,
      height: 1,
    });
    const source = normalizeRect(options.sourceRect || options.anchorRect, anchor);
    const avoidRects = (Array.isArray(options.avoidRects) ? options.avoidRects : [])
      .filter((rect) => rect && typeof rect === "object")
      .map((rect) => normalizeRect(rect));
    const leftMin = viewport.left + margin;
    const leftMax = viewport.right - margin - width;
    const topMin = viewport.top + margin;
    const topMax = viewport.bottom - margin - height;
    const preferredLeft = source.right + gap;
    const preferredTop = anchor.top;
    const horizontalCandidates = uniqueNumbers([
      clamp(preferredLeft, leftMin, leftMax),
      clamp(anchor.right + gap, leftMin, leftMax),
      clamp(source.left - gap - width, leftMin, leftMax),
      ...avoidRects.flatMap((rect) => [
        clamp(rect.left - gap - width, leftMin, leftMax),
        clamp(rect.right + gap, leftMin, leftMax),
      ]),
      leftMax,
      leftMin,
    ]);
    const verticalCandidates = uniqueNumbers([
      clamp(preferredTop, topMin, topMax),
      clamp(anchor.bottom - height, topMin, topMax),
      clamp(anchor.top + anchor.height / 2 - height / 2, topMin, topMax),
      ...avoidRects.flatMap((rect) => [
        clamp(rect.top - gap - height, topMin, topMax),
        clamp(rect.bottom + gap, topMin, topMax),
      ]),
      topMin,
      topMax,
    ]);
    const sourcePenalty = options.allowSourceOverlap ? 0 : 1;
    let best = null;

    for (const left of horizontalCandidates) {
      for (const top of verticalCandidates) {
        const candidate = { left, top, right: left + width, bottom: top + height, width, height };
        const avoidArea = avoidRects.reduce((total, rect) => total + intersectionArea(candidate, rect), 0);
        const sourceArea = intersectionArea(candidate, source);
        const horizontalDistance = Math.abs(left - preferredLeft);
        const verticalDistance = Math.abs(top - preferredTop);
        const leftSidePenalty = left + width <= source.left ? 900 : 0;
        const score = avoidArea * 100000 + sourceArea * sourcePenalty * 50000
          + horizontalDistance * 4 + verticalDistance + leftSidePenalty;
        if (!best || score < best.score) best = { ...candidate, score };
      }
    }

    const side = best.left >= source.right ? "right" : best.right <= source.left ? "left" : "overlap";
    return Object.freeze({
      left: Math.round(best.left),
      top: Math.round(best.top),
      width: Math.round(width),
      maxHeight: Math.round(Math.max(1, viewport.bottom - margin - best.top)),
      side,
    });
  }

  function normalizeSelectedIds(selectedIds) {
    const ids = [];
    const seen = new Set();
    const values = selectedIds != null
      && typeof selectedIds !== "string"
      && typeof selectedIds[Symbol.iterator] === "function"
      ? Array.from(selectedIds)
      : [];
    for (const value of values) {
      const id = String(value?.entityId || value?.id || value || "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
    return ids;
  }

  function normalizePickerEntities(options, activeSpace) {
    const entities = [];
    const seen = new Set();
    for (const candidate of Array.isArray(options.entities) ? options.entities : []) {
      const id = String(candidate?.id || "").trim();
      if (!id || candidate?.space === "platform" || candidate?.space === "official") continue;
      const candidateSpaces = Array.isArray(candidate.spaces)
        ? candidate.spaces.filter((space) => space === "personal" || space === "organization")
        : [];
      const spaces = candidate.space === "organization" || candidate.space === "personal"
        ? [candidate.space]
        : candidateSpaces.length
          ? [...new Set(candidateSpaces)]
          : [activeSpace];
      const media = resolveEntityMedia(candidate, options);
      for (const space of spaces) {
        const key = `${space}:${id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        entities.push({
          ...candidate,
          id,
          space: normalizeSpace(space),
          media,
        });
      }
    }
    return entities;
  }

  function renderPickerCard(entity, selected, selectable) {
    const safeId = escapeHtml(entity.id);
    const name = entityName(entity);
    const safeName = escapeHtml(name);
    const media = normalizeMedia(entity.media);
    const cover = resolveCoverMedia(entity, media);
    const count = media.length || Math.max(0, Math.floor(finiteNumber(entity.mediaCount, 0)));
    const actionLabel = selected ? `取消选择 ${name}` : `选择 ${name}`;
    return `
      <article class="${classNames("entity-use-picker-card", selected && "is-selected")}" role="listitem" data-entity-use-picker-card="${safeId}" data-selected="${selected}" data-media-count="${count}">
        <button type="button" aria-label="${escapeHtml(actionLabel)}" aria-pressed="${selected}"${selectable ? ` data-entity-use-action="toggle-entity" data-entity-use-toggle="${safeId}"` : ' data-entity-use-unavailable="toggle-entity" disabled aria-disabled="true"'}>
          <span class="entity-use-picker-cover">${cover ? renderMediaThumbnail(cover, { decorative: true }) : `<span class="entity-use-media-placeholder entity">${icon("user-round")}</span>`}</span>
          <span class="entity-use-picker-check" aria-hidden="true">${selected ? icon("check") : ""}</span>
          <span class="entity-use-picker-copy">
            <strong title="${safeName}">${safeName}</strong>
          </span>
        </button>
      </article>
    `;
  }

  function renderEntityPicker(options = {}) {
    if (options.visible === false) return "";
    const activeSpace = normalizeSpace(options.space);
    const query = String(options.query || "");
    const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
    const selectedIds = normalizeSelectedIds(options.selectedIds);
    const selected = new Set(selectedIds);
    const entities = normalizePickerEntities(options, activeSpace);
    const spaceCounts = Object.fromEntries(ENTITY_SPACES.map(({ id }) => [
      id,
      entities.filter((entity) => entity.space === id).length,
    ]));
    const visibleEntities = entities.filter((entity) => {
      if (entity.space !== activeSpace) return false;
      if (!normalizedQuery) return true;
      return `${entityName(entity)} ${String(entity.description || "")}`.toLocaleLowerCase("zh-CN").includes(normalizedQuery);
    });
    const busy = Boolean(options.busy);
    const selectable = options.canAdd !== false && !busy;
    const canAdd = selectable && selected.size > 0;
    const cards = visibleEntities.map((entity) => renderPickerCard(entity, selected.has(entity.id), selectable)).join("");
    const emptyTitle = normalizedQuery ? "没有匹配的主体" : `当前${activeSpace === "organization" ? "组织" : "个人"}空间还没有主体`;
    const emptyCopy = normalizedQuery ? "调整搜索关键词后再试。" : "先在资产库中创建主体，再从这里添加。";

    return `
      <div class="entity-use-picker-backdrop" data-entity-use-picker-backdrop="true">
        <section class="${classNames("entity-use-picker", busy && "is-busy")}" role="dialog" aria-modal="true" aria-labelledby="entity-use-picker-title" data-entity-use-picker="true" data-space="${activeSpace}"${busy ? ' aria-busy="true"' : ""}>
          <header>
            <h2 id="entity-use-picker-title">选择主体</h2>
          </header>
          <div class="entity-use-picker-tools">
            <div class="entity-use-picker-spaces" role="group" aria-label="主体空间">
              ${ENTITY_SPACES.map((space) => `
                <button class="${space.id === activeSpace ? "active" : ""}" id="entity-use-space-${space.id}" type="button" aria-label="${space.label}，${spaceCounts[space.id]} 个主体" aria-pressed="${space.id === activeSpace}" aria-controls="entity-use-picker-results"${busy ? ' disabled aria-disabled="true"' : ` data-entity-use-action="change-space" data-entity-use-space="${space.id}"`}>
                  <span>${space.label}</span>
                </button>
              `).join("")}
            </div>
            <label class="entity-use-picker-search">
              ${icon("search")}
              <span class="sr-only">搜索主体</span>
              <input type="search" value="${escapeHtml(query)}" placeholder="搜索主体" autocomplete="off" data-entity-use-search="true"${busy ? " disabled" : ""}>
              ${query ? `<button type="button" aria-label="清除搜索"${busy ? ' disabled aria-disabled="true"' : ' data-entity-use-action="clear-search" data-entity-use-search-clear="true"'}>${icon("x")}</button>` : ""}
            </label>
          </div>
          <div class="entity-use-picker-results" id="entity-use-picker-results" role="list" aria-labelledby="entity-use-space-${activeSpace}" aria-live="polite" aria-busy="${busy}" data-entity-use-picker-results="true">
            ${cards || `
              <div class="entity-use-picker-empty" data-entity-use-picker-empty="true">
                ${icon(normalizedQuery ? "search-x" : "users-round")}
                <strong>${emptyTitle}</strong>
                <span>${emptyCopy}</span>
              </div>
            `}
          </div>
          <footer>
            <span class="entity-use-picker-count" aria-live="polite" data-entity-use-picker-count="true">已选 ${selected.size} 个</span>
            <div>
              <button type="button" data-entity-use-action="cancel-picker" data-entity-use-picker-cancel="true"${busy ? " disabled" : ""}>取消</button>
              <button class="primary" type="button" data-entity-use-picker-add="true"${canAdd ? ' data-entity-use-action="add-entities"' : ' data-entity-use-unavailable="add-entities" disabled aria-disabled="true"'}>
                ${busy ? icon("loader-circle") : ""}<span>添加</span>
              </button>
            </div>
          </footer>
        </section>
      </div>
    `;
  }

  function setPortalVisibility(portal, visible) {
    if (!portal || typeof portal !== "object") return;
    portal.hidden = !visible;
    portal.inert = !visible;
    portal.setAttribute?.("aria-hidden", visible ? "false" : "true");
    portal.classList?.toggle("is-open", visible);
  }

  function syncEntityDetailPortal(portal, state = {}) {
    if (!portal || typeof portal !== "object") return null;
    const visible = Boolean(state.visible);
    const pinned = visible && Boolean(state.pinned);
    setPortalVisibility(portal, visible);
    portal.classList?.toggle("is-pinned", pinned);
    portal.setAttribute?.("data-entity-use-state", visible ? (pinned ? "pinned" : "preview") : "hidden");
    const placement = state.placement && typeof state.placement === "object" ? state.placement : null;
    const properties = [
      ["--entity-use-detail-left", placement?.left],
      ["--entity-use-detail-top", placement?.top],
      ["--entity-use-detail-width", placement?.width],
      ["--entity-use-detail-max-height", placement?.maxHeight],
    ];
    for (const [name, value] of properties) {
      if (Number.isFinite(Number(value))) portal.style?.setProperty(name, `${Math.round(Number(value))}px`);
      else portal.style?.removeProperty?.(name);
    }
    return portal;
  }

  function syncEntityPickerPortal(portal, state = {}) {
    if (!portal || typeof portal !== "object") return null;
    const visible = Boolean(state.visible);
    const busy = visible && Boolean(state.busy);
    setPortalVisibility(portal, visible);
    portal.classList?.toggle("is-busy", busy);
    portal.setAttribute?.("data-entity-use-state", visible ? (busy ? "busy" : "open") : "hidden");
    return portal;
  }

  root.REELAY_CANVAS_ENTITY_USE_VIEW = Object.freeze({
    computeDetailPlacement,
    renderEntityDetail,
    renderEntityPicker,
    syncEntityDetailPortal,
    syncEntityPickerPortal,
  });
}(typeof globalThis === "object" ? globalThis : window));
