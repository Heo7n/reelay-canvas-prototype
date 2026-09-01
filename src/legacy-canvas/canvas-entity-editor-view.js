(function registerCanvasEntityEditorView(root) {
  "use strict";

  const HTML_ESCAPES = Object.freeze({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  });

  const FILTERS = Object.freeze([
    { id: "all", label: "全部" },
    { id: "image", label: "图片" },
    { id: "video", label: "视频" },
    { id: "audio", label: "音频" },
  ]);

  const MEDIA_KIND_LABELS = Object.freeze({
    image: "图片",
    video: "视频",
    audio: "音频",
  });

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
  }

  function icon(name, className = "") {
    return `<i${className ? ` class="${className}"` : ""} data-lucide="${name}" aria-hidden="true"></i>`;
  }

  function classNames(...values) {
    return values.filter(Boolean).join(" ");
  }

  function normalizeMode(mode) {
    return mode === "edit" ? "edit" : "create";
  }

  function normalizeFilter(filter) {
    return FILTERS.some((candidate) => candidate.id === filter) ? filter : "all";
  }

  function normalizeMediaKind(media) {
    const mediaKind = media?.mediaKind || media?.type;
    if (mediaKind === "video" || mediaKind === "audio") return mediaKind;
    return "image";
  }

  function safeMediaUrl(value) {
    const url = String(value ?? "").trim();
    if (!url || /[\u0000-\u001f\u007f<>"']/.test(url)) return "";

    const compact = url.replace(/[\u0000-\u0020]+/g, "");
    const scheme = compact.match(/^([a-z][a-z\d+.-]*):/i)?.[1]?.toLowerCase();
    if (scheme && !["http", "https", "blob"].includes(scheme)) {
      const safeDataMedia = /^data:(?:image\/(?:avif|gif|jpe?g|png|webp)|video\/(?:mp4|ogg|webm)|audio\/(?:aac|mpeg|ogg|wav|webm))(?:;|,)/i;
      if (!safeDataMedia.test(compact)) return "";
    }
    return escapeHtml(url);
  }

  function normalizeMedia(media = []) {
    const seen = new Set();
    const normalized = [];
    for (const candidate of Array.isArray(media) ? media : []) {
      if (!candidate || typeof candidate !== "object") continue;
      const id = String(candidate.id ?? candidate.mediaId ?? "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const mediaKind = normalizeMediaKind(candidate);
      normalized.push({
        ...candidate,
        id,
        mediaKind,
        name: String(candidate.name || candidate.displayName || MEDIA_KIND_LABELS[mediaKind]),
      });
    }
    return normalized;
  }

  function normalizeIdList(values) {
    if (values == null) return [];
    let entries;
    if (Array.isArray(values)) entries = values;
    else if (typeof values !== "string" && typeof values?.[Symbol.iterator] === "function") entries = [...values];
    else entries = [values];
    return entries
      .map((value) => String(value?.mediaId ?? value?.id ?? value ?? "").trim())
      .filter(Boolean);
  }

  function normalizeCounts(input, media) {
    const computed = {
      all: media.length,
      image: media.filter((item) => item.mediaKind === "image").length,
      video: media.filter((item) => item.mediaKind === "video").length,
      audio: media.filter((item) => item.mediaKind === "audio").length,
    };
    if (!input || typeof input !== "object") return computed;
    return Object.fromEntries(FILTERS.map((filter) => {
      const value = Number(input[filter.id]);
      return [filter.id, Number.isFinite(value) ? Math.max(0, Math.floor(value)) : computed[filter.id]];
    }));
  }

  function renderAudioWave() {
    return `
      <span class="entity-editor-audio-wave" aria-hidden="true">
        <i></i><i></i><i></i><i></i><i></i><i></i><i></i>
      </span>
    `;
  }

  function renderCardMedia(media) {
    const mediaKind = normalizeMediaKind(media);
    const url = safeMediaUrl(media.url);
    const thumbnailUrl = safeMediaUrl(media.thumbnailUrl);
    const safeName = escapeHtml(media.name);

    if (mediaKind === "audio") return renderAudioWave();
    if (mediaKind === "video") {
      if (thumbnailUrl) return `<img src="${thumbnailUrl}" alt="" loading="lazy" draggable="false">${icon("play", "entity-editor-play-mark")}`;
      if (url) return `<video src="${url}" muted playsinline preload="metadata" draggable="false" aria-label="${safeName}"></video>${icon("play", "entity-editor-play-mark")}`;
      return icon("video");
    }
    const imageUrl = thumbnailUrl || url;
    return imageUrl
      ? `<img src="${imageUrl}" alt="" loading="lazy" draggable="false">`
      : icon("image");
  }

  function renderPreviewMedia(media) {
    if (!media) {
      return `
        <div class="entity-editor-preview-empty">
          ${icon("images")}
          <strong>选择一个素材进行预览</strong>
          <span>已添加的图片、视频和音频会显示在这里。</span>
        </div>
      `;
    }

    const mediaKind = normalizeMediaKind(media);
    const url = safeMediaUrl(media.url);
    const thumbnailUrl = safeMediaUrl(media.thumbnailUrl);
    const safeName = escapeHtml(media.name);
    if (mediaKind === "audio") {
      return `
        <div class="entity-editor-audio-preview">
          ${renderAudioWave()}
          <strong>${safeName}</strong>
          ${url ? `<audio src="${url}" controls preload="metadata" aria-label="播放 ${safeName}"></audio>` : `<span>音频暂不可播放</span>`}
        </div>
      `;
    }
    if (mediaKind === "video") {
      if (url) return `<video src="${url}"${thumbnailUrl ? ` poster="${thumbnailUrl}"` : ""} controls playsinline preload="metadata" aria-label="播放 ${safeName}"></video>`;
      if (thumbnailUrl) return `<img src="${thumbnailUrl}" alt="${safeName}">`;
      return `<div class="entity-editor-preview-empty">${icon("video")}<strong>${safeName}</strong><span>视频暂不可预览</span></div>`;
    }
    const imageUrl = thumbnailUrl || url;
    return imageUrl
      ? `<img src="${imageUrl}" alt="${safeName}">`
      : `<div class="entity-editor-preview-empty">${icon("image")}<strong>${safeName}</strong><span>图片暂不可预览</span></div>`;
  }

  function renderFilterTabs(activeFilter, counts, options = {}) {
    const hook = options.hook === "picker" ? "data-entity-picker-filter" : "data-entity-editor-filter";
    const idPrefix = options.idPrefix || "canvasEntityEditorFilter";
    const panelId = options.panelId || "canvasEntityEditorMediaGrid";
    const disabled = Boolean(options.disabled);
    return `
      <div class="entity-editor-media-filters" role="tablist" aria-label="${escapeHtml(options.label || "已添加素材类型")}">
        ${FILTERS.map((filter) => {
          const selected = filter.id === activeFilter;
          return `
            <button class="${selected ? "active" : ""}" id="${idPrefix}-${filter.id}" type="button" role="tab" aria-controls="${panelId}" aria-selected="${selected}" tabindex="${selected ? "0" : "-1"}" ${hook}="${filter.id}"${disabled ? ' disabled aria-disabled="true"' : ""}>
              <span>${filter.label}</span>
              <span aria-label="${counts[filter.id]} 个">${counts[filter.id]}</span>
            </button>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderMediaCard(media, options = {}) {
    const safeId = escapeHtml(media.id);
    const safeName = escapeHtml(media.name);
    const selected = Boolean(options.selected);
    const isCover = Boolean(options.isCover);
    const mutable = options.mutable !== false;
    const interactive = options.interactive !== false;
    return `
      <article class="${classNames("entity-editor-media-card", selected && "selected", isCover && "cover")}" role="listitem" data-entity-editor-media="${safeId}" data-media-kind="${media.mediaKind}">
        <button class="entity-editor-media-select" type="button" aria-label="预览 ${safeName}" aria-pressed="${selected}" data-entity-editor-media-select="${safeId}"${interactive ? "" : ' disabled aria-disabled="true"'}>
          <span class="entity-editor-media-thumbnail">${renderCardMedia(media)}</span>
          <span class="entity-editor-media-name" title="${safeName}">${safeName}</span>
          <span class="entity-editor-media-kind">${MEDIA_KIND_LABELS[media.mediaKind]}</span>
        </button>
        ${isCover ? `<span class="entity-editor-cover-badge">${icon("bookmark-check")}<span>封面</span></span>` : ""}
        ${mutable ? `
          <button class="entity-editor-media-remove" type="button" aria-label="移除 ${safeName}" data-entity-editor-media-remove="${safeId}">
            ${icon("x")}
          </button>
        ` : ""}
      </article>
    `;
  }

  function renderEntityEditor(options = {}) {
    if (options.visible === false) return "";

    const mode = normalizeMode(options.mode);
    const entity = options.entity && typeof options.entity === "object" ? options.entity : {};
    const media = normalizeMedia(options.media ?? options.filteredMedia);
    const activeFilter = normalizeFilter(options.filter);
    const filteredMedia = activeFilter === "all"
      ? media
      : media.filter((item) => item.mediaKind === activeFilter);
    const requestedSelectedId = String(options.selectedMediaId ?? options.selectedPreviewId ?? "");
    const previewMedia = normalizeMedia(options.previewMedia ? [options.previewMedia] : [])[0] || null;
    const selectedMedia = media.find((item) => item.id === requestedSelectedId) ||
      (previewMedia?.id === requestedSelectedId ? previewMedia : null) ||
      filteredMedia[0] || null;
    const requestedCoverId = String(options.coverMediaId ?? entity.coverMediaId ?? "").trim();
    const coverMediaId = requestedCoverId;
    const name = String(entity.name ?? entity.displayName ?? options.name ?? "");
    const description = String(entity.description ?? options.description ?? "");
    const title = mode === "create" ? "新建主体" : String(options.title ?? name).trim() || "未命名主体";
    const mutable = options.mutable !== false;
    const submitting = Boolean(options.submitting);
    const uploading = Boolean(options.uploading);
    const busy = Boolean(options.busy) || submitting || uploading;
    const editable = mutable && !busy;
    const canAddFromLibrary = editable && options.canAddFromLibrary !== false;
    const canUpload = editable && options.canUpload !== false;
    const errors = options.errors && typeof options.errors === "object" ? options.errors : {};
    const safeNameError = errors.name ? escapeHtml(errors.name) : "";
    const safeMediaError = errors.media ? escapeHtml(errors.media) : "";
    const counts = normalizeCounts(options.counts, media);
    const canSubmit = editable && options.valid !== false && Boolean(name.trim()) && counts.all > 0;
    const selectedId = selectedMedia?.id || "";
    const selectedIsCover = Boolean(selectedId && selectedId === coverMediaId);
    const selectedCanCover = selectedMedia?.mediaKind === "image" || selectedMedia?.mediaKind === "video";
    const submitLabel = uploading ? "正在上传…" : submitting ? "正在保存…" : mode === "create" ? "创建" : "保存";
    const emptyLabel = counts.all === 0
      ? "还没有添加素材"
      : `没有${MEDIA_KIND_LABELS[activeFilter] || "符合条件的"}素材`;

    return `
      <section class="canvas-entity-editor" role="region" aria-labelledby="canvasEntityEditorTitle" aria-busy="${busy}" data-entity-editor="true" data-entity-editor-mode="${mode}" data-entity-editor-busy="${busy}" data-entity-editor-filter-active="${activeFilter}" data-entity-editor-selected-media="${escapeHtml(selectedId)}" data-entity-editor-cover-media="${escapeHtml(coverMediaId)}">
        <form class="entity-editor-details" id="canvasEntityEditorForm" data-entity-editor-form="true" novalidate>
          <header class="entity-editor-header">
            <button type="button" aria-label="关闭主体编辑器" data-entity-editor-cancel="true"${busy ? ' disabled aria-disabled="true"' : ""}>${icon("x")}</button>
            <h2 id="canvasEntityEditorTitle" title="${escapeHtml(title)}">${escapeHtml(title)}</h2>
          </header>

          <div class="entity-editor-details-scroll">
            <div class="entity-editor-field">
              <label for="canvasEntityEditorName">名称 <span aria-hidden="true">*</span></label>
              <input id="canvasEntityEditorName" type="text" name="name" maxlength="200" value="${escapeHtml(name)}" autocomplete="off" required aria-required="true"${safeNameError ? ' aria-invalid="true" aria-describedby="canvasEntityEditorNameError"' : ""} data-entity-editor-name="true"${editable ? "" : ' disabled aria-disabled="true"'}>
              ${safeNameError ? `<span class="entity-editor-field-error" id="canvasEntityEditorNameError" role="alert">${safeNameError}</span>` : ""}
            </div>

            <div class="entity-editor-field">
              <label for="canvasEntityEditorDescription">描述</label>
              <textarea id="canvasEntityEditorDescription" name="description" rows="4" maxlength="2000" data-entity-editor-description="true"${editable ? "" : ' disabled aria-disabled="true"'}>${escapeHtml(description)}</textarea>
            </div>

            <section class="entity-editor-media-section" aria-labelledby="canvasEntityEditorMediaTitle">
              <div class="entity-editor-media-heading">
                <h3 id="canvasEntityEditorMediaTitle">添加素材</h3>
                <div class="entity-editor-media-actions">
                  <button type="button" data-entity-editor-add-from-library="true"${canAddFromLibrary ? "" : ` disabled aria-disabled="true" title="${mutable && !busy ? "当前项目暂不支持从素材库添加" : busy ? "请等待当前操作完成" : "当前主体仅可查看"}"`}>
                    ${icon("images")}
                    <span>从素材库添加</span>
                  </button>
                  <span aria-hidden="true"></span>
                  <button type="button" data-entity-editor-upload="true"${canUpload ? "" : ` disabled aria-disabled="true" title="${mutable && !busy ? "当前项目暂不支持上传素材" : busy ? "请等待当前操作完成" : "当前主体仅可查看"}"`}>
                    ${icon("upload")}
                    <span>上传</span>
                  </button>
                </div>
              </div>

              ${renderFilterTabs(activeFilter, counts, {
                disabled: busy,
                idPrefix: "canvasEntityEditorFilter",
                panelId: "canvasEntityEditorMediaGrid",
              })}
              ${safeMediaError ? `<span class="entity-editor-field-error" id="canvasEntityEditorMediaError" role="alert">${safeMediaError}</span>` : ""}
              <div class="entity-editor-media-grid" id="canvasEntityEditorMediaGrid" role="list" aria-label="${FILTERS.find((filter) => filter.id === activeFilter).label}素材" aria-labelledby="canvasEntityEditorFilter-${activeFilter}"${safeMediaError ? ' aria-describedby="canvasEntityEditorMediaError"' : ""}>
                ${filteredMedia.length
                  ? filteredMedia.map((item) => renderMediaCard(item, {
                    selected: item.id === selectedId,
                    isCover: item.id === coverMediaId,
                    mutable: editable,
                    interactive: !busy,
                  })).join("")
                  : `<div class="entity-editor-media-empty">${icon("image-plus")}<strong>${emptyLabel}</strong><span>${counts.all === 0 ? "可从素材库选择，或上传图片、视频和音频。" : "切换分类查看其他已添加素材。"}</span></div>`}
              </div>
            </section>
          </div>

          <footer class="entity-editor-footer">
            <button type="button" data-entity-editor-cancel="true"${busy ? ' disabled aria-disabled="true"' : ""}>取消</button>
            <button class="primary" type="submit" data-entity-editor-submit="true"${canSubmit ? "" : ' disabled aria-disabled="true"'}>${submitLabel}</button>
          </footer>
        </form>

        <section class="entity-editor-preview" aria-labelledby="canvasEntityEditorPreviewTitle">
          <header>
            <div>
              <span>${selectedMedia ? MEDIA_KIND_LABELS[selectedMedia.mediaKind] : "素材预览"}</span>
              <h3 id="canvasEntityEditorPreviewTitle">${selectedMedia ? escapeHtml(selectedMedia.name) : "预览"}</h3>
            </div>
            ${selectedMedia ? `
              <button type="button" data-entity-editor-set-cover="${escapeHtml(selectedMedia.id)}"${editable && selectedCanCover && !selectedIsCover ? "" : ' disabled aria-disabled="true"'}${selectedCanCover ? "" : ' title="音频不能设为封面"'}>
                ${icon(selectedIsCover ? "bookmark-check" : "bookmark")}
                <span>${selectedIsCover ? "当前封面" : "设为封面"}</span>
              </button>
            ` : ""}
          </header>
          <div class="entity-editor-preview-stage" data-entity-editor-preview="${escapeHtml(selectedId)}">
            ${renderPreviewMedia(selectedMedia)}
          </div>
        </section>
      </section>
    `;
  }

  function renderPickerCard(media, selected) {
    const safeId = escapeHtml(media.id);
    const safeName = escapeHtml(media.name);
    return `
      <button class="${classNames("entity-picker-card", selected && "selected")}" type="button" role="option" aria-selected="${selected}" data-entity-picker-toggle="${safeId}" data-entity-picker-media="${safeId}" data-media-kind="${media.mediaKind}">
        <span class="entity-picker-card-preview">${renderCardMedia(media)}</span>
        <span class="entity-picker-card-name" title="${safeName}">${safeName}</span>
        <span class="entity-picker-card-check" aria-hidden="true">${selected ? icon("check") : ""}</span>
      </button>
    `;
  }

  function renderMediaPicker(options = {}) {
    if (options.visible === false) return "";
    const media = normalizeMedia(options.media ?? options.items);
    const activeFilter = normalizeFilter(options.filter);
    const query = String(options.query ?? "");
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const queryMatches = media.filter((item) => {
      if (!normalizedQuery) return true;
      return [item.name, item.displayName, MEDIA_KIND_LABELS[item.mediaKind]]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedQuery);
    });
    const counts = normalizeCounts(null, queryMatches);
    const visibleMedia = activeFilter === "all"
      ? queryMatches
      : queryMatches.filter((item) => item.mediaKind === activeFilter);
    const knownIds = new Set(media.map((item) => item.id));
    const selectedIds = new Set(normalizeIdList(options.selectedIds ?? options.selectedMediaIds).filter((id) => knownIds.has(id)));
    const busy = Boolean(options.busy);
    const mutable = options.mutable !== false;
    const canConfirm = mutable && !busy && selectedIds.size > 0;
    const confirmLabel = busy ? "正在添加…" : `添加${selectedIds.size ? `（${selectedIds.size}）` : ""}`;

    return `
      <section class="entity-media-picker" role="dialog" aria-modal="true" aria-labelledby="canvasEntityPickerTitle" data-entity-picker="true" data-entity-picker-filter-active="${activeFilter}" data-entity-picker-selected-count="${selectedIds.size}">
        <header class="entity-picker-header">
          <h2 id="canvasEntityPickerTitle">从素材库添加</h2>
          <button type="button" aria-label="关闭素材选择器" data-entity-picker-cancel="true">${icon("x")}</button>
        </header>
        <div class="entity-picker-toolbar">
          <label class="entity-picker-search">
            ${icon("search")}
            <span class="sr-only">搜索个人素材</span>
            <input type="search" value="${escapeHtml(query)}" placeholder="搜索个人素材" autocomplete="off" data-entity-picker-search="true">
          </label>
          ${renderFilterTabs(activeFilter, counts, {
            disabled: busy,
            hook: "picker",
            idPrefix: "canvasEntityPickerFilter",
            panelId: "canvasEntityPickerGrid",
            label: "个人素材类型",
          })}
        </div>
        <div class="entity-picker-grid" id="canvasEntityPickerGrid" role="listbox" aria-label="个人空间素材" aria-labelledby="canvasEntityPickerFilter-${activeFilter}" aria-multiselectable="true">
          ${visibleMedia.length
            ? visibleMedia.map((item) => renderPickerCard(item, selectedIds.has(item.id))).join("")
            : `<div class="entity-picker-empty">${icon(normalizedQuery ? "search-x" : "images")}<strong>${normalizedQuery ? "没有匹配的个人素材" : "暂无可用素材"}</strong><span>${normalizedQuery ? "尝试更换关键词或素材类型。" : "请先向个人空间上传素材。"}</span></div>`}
        </div>
        <footer class="entity-picker-footer">
          <span aria-live="polite">已选择 ${selectedIds.size} 项</span>
          <div>
            <button type="button" data-entity-picker-cancel="true">取消</button>
            <button class="primary" type="button" data-entity-picker-confirm="true"${canConfirm ? "" : ' disabled aria-disabled="true"'}>${confirmLabel}</button>
          </div>
        </footer>
      </section>
    `;
  }

  root.REELAY_CANVAS_ENTITY_EDITOR_VIEW = Object.freeze({ renderEntityEditor, renderMediaPicker });
}(typeof globalThis === "object" ? globalThis : window));
