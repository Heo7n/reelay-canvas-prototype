(function registerCanvasEntityEditorView(root) {
  "use strict";

  const HTML_ESCAPES = Object.freeze({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  });

  const MEDIA_FILTERS = Object.freeze([
    { id: "all", label: "全部" },
    { id: "image", label: "图片" },
    { id: "video", label: "视频" },
    { id: "audio", label: "音频" },
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

  function normalizeSpace(value) {
    if (value === "organization") return "organization";
    if (value === "platform" || value === "official") return "platform";
    return "personal";
  }

  function normalizeMediaKind(media) {
    const mediaKind = media?.mediaKind || media?.type;
    return ["image", "video", "audio"].includes(mediaKind) ? mediaKind : null;
  }

  function normalizeDraft(input = {}) {
    const refs = [];
    const seen = new Set();
    for (const value of Array.isArray(input.mediaRefs) ? input.mediaRefs : []) {
      const mediaId = String(typeof value === "string" ? value : value?.mediaId || value?.id || "").trim();
      if (!mediaId || seen.has(mediaId)) continue;
      seen.add(mediaId);
      refs.push({ mediaId, order: refs.length });
    }
    const firstId = refs[0]?.mediaId || "";
    const requestedActiveId = String(input.activeMediaId || "").trim();
    const requestedCoverId = String(input.coverMediaId || "").trim();
    return {
      mode: input.mode === "edit" ? "edit" : "create",
      entityId: input.entityId == null ? "" : String(input.entityId).trim(),
      space: normalizeSpace(input.space),
      name: String(input.name ?? ""),
      description: String(input.description ?? ""),
      mediaRefs: refs,
      activeMediaId: requestedActiveId || firstId,
      coverMediaId: refs.some((ref) => ref.mediaId === requestedCoverId) ? requestedCoverId : "",
      query: String(input.query ?? ""),
      mediaKind: MEDIA_FILTERS.some((filter) => filter.id === input.mediaKind) ? input.mediaKind : "all",
    };
  }

  function normalizeMedia(media = []) {
    const records = [];
    const seen = new Set();
    for (const candidate of Array.isArray(media) ? media : []) {
      const id = String(candidate?.id || "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      records.push({ ...candidate, id });
    }
    return records;
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

  function mediaName(media, fallback = "未命名素材") {
    return String(media?.displayName || media?.name || fallback);
  }

  function mediaAspectRatio(media) {
    const explicitRatio = Number(media?.aspectRatio);
    const width = Number(media?.width);
    const height = Number(media?.height);
    const candidate = Number.isFinite(explicitRatio) && explicitRatio > 0
      ? explicitRatio
      : width > 0 && height > 0
        ? width / height
        : 16 / 10;
    return Math.min(2.5, Math.max(0.4, candidate));
  }

  function previewFrameStyle(media) {
    const ratio = mediaAspectRatio(media);
    const inlineCap = Math.min(1320, ratio * 860);
    return [
      `--entity-preview-ratio:${ratio.toFixed(4)}`,
      `--entity-preview-inline-cap:${inlineCap.toFixed(1)}px`,
      `--entity-preview-block-bound:${(ratio * 100).toFixed(1)}cqh`,
    ].join(";");
  }

  function renderMediaPreview(media, { controls = false } = {}) {
    if (!media || typeof media !== "object") return icon("image-off");
    const mediaKind = normalizeMediaKind(media);
    const url = safeMediaUrl(media.url);
    const thumbnailUrl = safeMediaUrl(media.thumbnailUrl);
    if (mediaKind === "audio") {
      return controls && url
        ? `<audio src="${url}" controls preload="metadata"></audio>`
        : icon("audio-lines");
    }
    if (mediaKind === "video") {
      if (controls && url) return `<video src="${url}" controls playsinline preload="metadata"></video>`;
      if (thumbnailUrl) return `<img src="${thumbnailUrl}" alt="" loading="lazy" draggable="false">`;
      if (url) return `<video src="${url}" muted playsinline preload="metadata" draggable="false"></video>`;
      return icon("circle-play");
    }
    const imageUrl = thumbnailUrl || url;
    return imageUrl
      ? `<img src="${imageUrl}" alt="" loading="lazy" draggable="false">`
      : icon("image");
  }

  function selectedMediaState(draft, media) {
    const mediaById = new Map(media.map((item) => [item.id, item]));
    const records = draft.mediaRefs.map((ref) => ({ ref, media: mediaById.get(ref.mediaId) || null }));
    const counts = records.reduce((result, entry) => {
      result.all += 1;
      const mediaKind = normalizeMediaKind(entry.media);
      if (mediaKind) result[mediaKind] += 1;
      return result;
    }, { all: 0, image: 0, video: 0, audio: 0 });
    const visible = draft.mediaKind === "all"
      ? records
      : records.filter((entry) => entry.media && normalizeMediaKind(entry.media) === draft.mediaKind);
    return { mediaById, records, visible, counts };
  }

  function renderFilterButtons(activeFilter, counts, hook) {
    return MEDIA_FILTERS.map((filter) => `
      <button class="${filter.id === activeFilter ? "active" : ""}" type="button" aria-pressed="${filter.id === activeFilter}" ${hook}="${filter.id}">
        <span>${filter.label}</span>
        <small>(${counts[filter.id] ?? 0})</small>
      </button>
    `).join("");
  }

  function renderSelection(options = {}) {
    const draft = normalizeDraft(options.draft);
    const media = normalizeMedia(options.media);
    const mutable = options.mutable !== false && draft.space !== "platform";
    const { visible, counts } = selectedMediaState(draft, media);
    const cards = visible.map(({ ref, media: record }) => {
      const safeId = escapeHtml(ref.mediaId);
      const safeName = escapeHtml(mediaName(record, `素材 ${ref.order + 1}`));
      const active = ref.mediaId === draft.activeMediaId;
      const cover = ref.mediaId === draft.coverMediaId && Boolean(record) && normalizeMediaKind(record) === "image";
      return `
        <article class="${classNames("asset-entity-media-card", active && "selected", cover && "is-cover", !record && "unavailable")}" role="listitem" aria-selected="${active}"${cover ? ' aria-current="true"' : ""} data-entity-editor-selected-media="${safeId}" data-selected="${active}" data-cover="${cover}">
          <button class="asset-entity-media-preview" type="button" aria-label="预览 ${safeName}" aria-pressed="${active}" data-entity-editor-active-media="${safeId}">${renderMediaPreview(record)}</button>
          <span class="asset-entity-media-name" title="${safeName}">${safeName}</span>
          <button class="asset-entity-media-remove" type="button" aria-label="移除 ${safeName}" data-entity-editor-remove-media="${safeId}"${mutable ? "" : " disabled"}>${icon("x")}</button>
        </article>
      `;
    }).join("");

    return `
      <section class="asset-entity-media-section" aria-labelledby="asset-entity-media-title" data-entity-editor-selection="true">
        <h3 id="asset-entity-media-title">添加素材</h3>
        <div class="asset-entity-media-toolbar">
          <div class="asset-entity-media-filters" role="group" aria-label="筛选已添加素材">
            ${renderFilterButtons(draft.mediaKind, counts, "data-entity-editor-media-filter")}
          </div>
          <div class="asset-entity-media-actions">
            <button type="button" data-entity-editor-open-library="true"${mutable ? "" : " disabled"}>${icon("images")}<span>从素材库添加</span></button>
            <button type="button" data-entity-editor-upload="true"${mutable ? "" : " disabled"}>${icon("upload")}<span>上传</span></button>
          </div>
        </div>
        <div class="asset-entity-media-grid" role="list" data-entity-editor-selected-grid="true">
          ${cards || `
            <div class="asset-entity-media-empty" data-entity-editor-selection-empty="true">
              ${icon("images")}
              <strong>${draft.mediaRefs.length ? "当前筛选下没有素材" : "还没有添加素材"}</strong>
              <span>${draft.mediaRefs.length ? "切换素材类型查看其他已添加内容。" : "从素材库选择或上传至少一个素材。"}</span>
            </div>
          `}
        </div>
      </section>
    `;
  }

  function renderStage(options = {}) {
    const draft = normalizeDraft(options.draft);
    const media = normalizeMedia(options.media);
    const mutable = options.mutable !== false && draft.space !== "platform";
    const mediaById = new Map(media.map((item) => [item.id, item]));
    const activeMedia = mediaById.get(draft.activeMediaId) || null;
    const safeActiveId = escapeHtml(draft.activeMediaId);
    const activeMediaKind = normalizeMediaKind(activeMedia);
    const activeCanBeCover = Boolean(activeMedia) && activeMediaKind === "image";
    const activeIsCover = activeCanBeCover && draft.activeMediaId === draft.coverMediaId;
    const activeMediaIndex = draft.mediaRefs.findIndex((ref) => ref.mediaId === draft.activeMediaId);
    const mediaWidth = Number(activeMedia?.width);
    const mediaHeight = Number(activeMedia?.height);
    const stageMeta = activeMedia
      ? [
          activeMediaIndex >= 0 ? `${activeMediaIndex + 1} / ${draft.mediaRefs.length}` : "",
          mediaWidth > 0 && mediaHeight > 0 ? `${Math.round(mediaWidth)} × ${Math.round(mediaHeight)}` : "",
        ].filter(Boolean)
      : [];
    const preview = activeMedia
      ? renderMediaPreview(activeMedia, { controls: true })
      : `
        <div class="asset-entity-stage-empty" data-entity-editor-stage-empty="true">
          ${icon("image")}
          <span>${draft.mediaRefs.length ? "当前素材在这个空间不可用" : "添加素材后可在这里预览"}</span>
        </div>
      `;
    return `
      <section class="asset-entity-editor-stage" aria-label="主体素材预览" data-entity-editor-stage="true" data-empty="${!activeMedia}">
        <div class="asset-entity-stage-frame" data-media-kind="${activeMediaKind || "empty"}" style="${previewFrameStyle(activeMedia)}">
          <div class="asset-entity-stage-preview" data-entity-editor-stage-media="${safeActiveId}">${preview}</div>
          ${stageMeta.length
            ? `<div class="asset-entity-stage-meta" aria-hidden="true" data-entity-editor-stage-meta="true">${stageMeta.map((item) => `<span>${item}</span>`).join("")}</div>`
            : ""}
          ${activeCanBeCover
            ? `
              <button class="${classNames("asset-entity-cover-button", activeIsCover && "active")}" type="button" aria-label="${activeIsCover ? "当前素材已是封面" : "将当前素材设为封面"}" aria-pressed="${activeIsCover}" data-entity-editor-cover-media="${safeActiveId}"${mutable ? "" : " disabled"}>
                ${icon(activeIsCover ? "badge-check" : "image")}
                <span>${activeIsCover ? "当前封面" : "设为封面"}</span>
              </button>
            `
            : ""}
        </div>
      </section>
    `;
  }

  function collectValidationMessages(validation) {
    if (!validation || typeof validation !== "object") return [];
    const source = Array.isArray(validation.errors)
      ? validation.errors
      : validation.errors && typeof validation.errors === "object"
        ? Object.values(validation.errors).flat()
        : [];
    return source.map((entry) => {
      if (typeof entry === "string") return entry;
      return typeof entry?.message === "string" ? entry.message : "";
    }).filter(Boolean);
  }

  function validatePresentationState(draft, mediaById, validation) {
    const messages = collectValidationMessages(validation);
    if (!draft.name.trim()) messages.unshift("请输入主体名称");
    if (!draft.mediaRefs.length) messages.push("主体至少需要一个素材");
    if (draft.coverMediaId && !draft.mediaRefs.some((ref) => ref.mediaId === draft.coverMediaId)) {
      messages.push("封面必须来自主体素材");
    }
    const coverMedia = draft.coverMediaId ? mediaById.get(draft.coverMediaId) : null;
    if (coverMedia && normalizeMediaKind(coverMedia) !== "image") messages.push("只有图片可以设为主体封面");
    if (draft.mediaRefs.some((ref) => !mediaById.has(ref.mediaId))) {
      messages.push("主体包含当前空间不可用的素材");
    }
    const explicitlyInvalid = validation?.valid === false || validation?.ok === false;
    return { valid: !explicitlyInvalid && messages.length === 0, messages: [...new Set(messages)] };
  }

  function renderEditor(options = {}) {
    const draft = normalizeDraft(options.draft);
    const media = normalizeMedia(options.media);
    const mediaById = new Map(media.map((item) => [item.id, item]));
    const mutable = options.mutable !== false && draft.space !== "platform";
    const busy = Boolean(options.busy);
    const showValidation = options.showValidation !== false;
    const validation = validatePresentationState(draft, mediaById, options.validation);
    const title = draft.mode === "create" ? "新建主体" : draft.name.trim() || "未命名主体";
    const submitLabel = "完成";
    const disabled = busy || !validation.valid;
    const safeEntityId = escapeHtml(draft.entityId);
    const validationMarkup = showValidation && validation.messages.length
      ? `<span class="asset-entity-editor-validation" role="alert" data-entity-editor-validation="true">${validation.messages.map(escapeHtml).join("；")}</span>`
      : '<span class="asset-entity-editor-validation valid" role="status" data-entity-editor-validation="false"></span>';

    return `
          <form class="${classNames("asset-entity-editor-form", busy && "busy", !mutable && "readonly")}" data-entity-editor-form="true" data-entity-editor-mode="${draft.mode}" data-entity-editor-id="${safeEntityId}" data-entity-editor-space="${draft.space}"${busy ? ' aria-busy="true"' : ""}>
            <header>
              <button type="button" aria-label="关闭主体编辑器" data-entity-editor-close="true"${busy ? " disabled" : ""}>${icon("x")}</button>
              <h2 id="asset-entity-editor-title" title="${escapeHtml(title)}" data-entity-editor-title="true">${escapeHtml(title)}</h2>
            </header>
            <div class="asset-entity-editor-fields">
              <div class="asset-entity-field">
                <label for="assetEntityEditorName">名称 <abbr class="required" title="必填">*</abbr></label>
                <input class="asset-entity-name-input" id="assetEntityEditorName" type="text" value="${escapeHtml(draft.name)}" maxlength="80" autocomplete="off" placeholder="为主体命名" data-entity-editor-name="true"${mutable && !busy ? "" : " disabled"}>
              </div>
              <div class="asset-entity-field">
                <label for="assetEntityEditorDescription">描述</label>
                <textarea class="asset-entity-description-input" id="assetEntityEditorDescription" maxlength="500" rows="4" placeholder="补充主体特征、用途或备注" data-entity-editor-description="true"${mutable && !busy ? "" : " disabled"}>${escapeHtml(draft.description)}</textarea>
              </div>
              ${renderSelection({ draft, media, mutable })}
            </div>
            <footer>
              ${mutable
                ? `${validationMarkup}
                  <button type="button" data-entity-editor-cancel="true"${busy ? " disabled" : ""}>取消</button>
                  <button class="primary" type="submit" data-entity-editor-submit="true"${disabled ? ' disabled aria-disabled="true"' : ""}>
                    ${busy ? `${icon("loader-circle")}<span>保存中</span>` : `<span>${submitLabel}</span>`}
                  </button>`
                : '<button type="button" data-entity-editor-cancel="true">关闭</button>'}
            </footer>
          </form>
          ${renderStage({ draft, media, mutable })}
    `;
  }

  function resolvePickerResults(options, media) {
    const candidate = options.results && typeof options.results === "object" ? options.results : {};
    const items = normalizeMedia(Array.isArray(candidate.items) ? candidate.items : media);
    const fallbackCounts = media.reduce((counts, item) => {
      counts.all += 1;
      const mediaKind = normalizeMediaKind(item);
      if (mediaKind) counts[mediaKind] += 1;
      return counts;
    }, { all: 0, image: 0, video: 0, audio: 0 });
    const sourceCounts = candidate.counts && typeof candidate.counts === "object" ? candidate.counts : {};
    const counts = Object.fromEntries(MEDIA_FILTERS.map((filter) => {
      const rawCount = Number(sourceCounts[filter.id]);
      return [filter.id, Number.isFinite(rawCount) ? Math.max(0, Math.floor(rawCount)) : fallbackCounts[filter.id]];
    }));
    return { items, counts };
  }

  function renderMediaPicker(options = {}) {
    if (options.visible === false) return "";
    const draft = normalizeDraft(options.draft);
    const media = normalizeMedia(options.media);
    const { items, counts } = resolvePickerResults(options, media);
    const referencedIds = new Set(draft.mediaRefs.map((ref) => ref.mediaId));
    const requestedSelection = options.selectedIds == null
      ? []
      : Array.from(options.selectedIds).map((value) => String(value?.mediaId || value?.id || value).trim()).filter(Boolean);
    const requestedIds = new Set(requestedSelection);
    const cards = items.map((record) => {
      const safeId = escapeHtml(record.id);
      const safeName = escapeHtml(mediaName(record));
      const referenced = referencedIds.has(record.id);
      const selected = referenced || requestedIds.has(record.id);
      const actionLabel = referenced ? `${safeName} 已在主体中` : selected ? `取消选择 ${safeName}` : `选择 ${safeName}`;
      return `
        <article class="${classNames("asset-entity-media-card", selected && "selected")}" role="listitem" aria-selected="${selected}" data-entity-editor-picker-media="${safeId}" data-selected="${selected}" data-referenced="${referenced}">
          <button class="asset-entity-media-preview" type="button" aria-label="${actionLabel}" aria-pressed="${selected}" data-entity-editor-toggle-picker-media="${safeId}"${referenced ? ' disabled aria-disabled="true"' : ""}>
            ${renderMediaPreview(record)}
            <span class="asset-entity-picker-check" aria-hidden="true">${selected ? icon("check") : ""}</span>
          </button>
          <span class="asset-entity-media-name" title="${safeName}">${safeName}</span>
        </article>
      `;
    }).join("");
    return `
      <div class="asset-entity-picker-backdrop" data-entity-editor-picker-backdrop="true">
        <section class="asset-entity-picker" role="dialog" aria-modal="true" aria-labelledby="asset-entity-picker-title" data-entity-editor-picker="true">
          <header>
            <h2 id="asset-entity-picker-title">从素材库添加</h2>
            <button type="button" aria-label="关闭素材选择" data-entity-editor-picker-close="true">${icon("x")}</button>
          </header>
          <div>
            <label class="asset-library-search">
              ${icon("search")}
              <span class="sr-only">搜索素材</span>
              <input type="search" value="${escapeHtml(draft.query)}" placeholder="搜索素材" autocomplete="off" data-entity-editor-search="true">
              ${draft.query ? `<button type="button" aria-label="清除搜索" data-entity-editor-clear-search="true">${icon("x")}</button>` : ""}
            </label>
            <div class="asset-entity-media-filters" role="group" aria-label="素材类型">
              ${renderFilterButtons(draft.mediaKind, counts, "data-entity-editor-picker-filter")}
            </div>
            <div class="asset-entity-media-grid" role="list" aria-live="polite" data-entity-editor-picker-grid="true">
              ${cards || `
                <div class="asset-entity-media-empty" data-entity-editor-picker-empty="true">
                  ${icon("search-x")}
                  <strong>没有匹配的素材</strong>
                  <span>调整关键词或素材类型后再试。</span>
                </div>
              `}
            </div>
          </div>
          <footer>
            <span data-entity-editor-picker-count="true">本次已选 ${requestedIds.size} 项</span>
            <button type="button" data-entity-editor-picker-cancel="true">取消</button>
            <button class="primary" type="button" data-entity-editor-picker-done="true">完成</button>
          </footer>
        </section>
      </div>
    `;
  }

  root.REELAY_CANVAS_ENTITY_EDITOR_VIEW = Object.freeze({
    renderEditor,
    renderSelection,
    renderStage,
    renderMediaPicker,
  });
}(typeof globalThis === "object" ? globalThis : window));
