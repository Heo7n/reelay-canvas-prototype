(function registerGenerationRecordView(global) {
  "use strict";

  const TYPES = { image: "图片", video: "视频", audio: "音频" };
  const ICONS = { image: "image", video: "square-play", audio: "audio-lines" };
  // Local Lucide primitives keep record actions consistent with media symbols.
  const LOCAL_ICON_PATHS = Object.freeze({
    "image": '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="m21 16-5-5-4 4-2-2-5 5"/>',
    "square-play": '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m10 8 6 4-6 4z"/>',
    "audio-lines": '<path d="M4 10v4"/><path d="M8 8v8"/><path d="M12 5v14"/><path d="M16 8v8"/><path d="M20 10v4"/>',
    "circle-alert": '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
    "circle-minus": '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/>',
    "info": '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    "copy": '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    "pencil": '<path d="m16 3 5 5M4 16 16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1z"/>',
    "rotate-cw": '<path d="M21 12a9 9 0 1 1-9-9c2.5 0 4.9 1 6.7 2.8L21 8"/><path d="M21 3v5h-5"/>',
    "locate": '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="1"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>',
  });
  let nextPopover = 0;

  function createController({ document, container, getScope, getTasks, getTask, onAction,
    escapeHtml, assetPreview, renderPrompt, placeAnchoredPopover, refreshIcons = () => {},
    sanitizeUrl = (url) => /^(https?:|blob:|data:(image|audio|video)\/|\/)/i.test(String(url || "")) ? url : "",
    canCancel, now = () => Date.now() }) {
    const view = document.defaultView;
    const escape = escapeHtml || ((value) => String(value ?? "").replace(/[&<>"']/g,
      (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])));
    const list = document.createElement("div");
    list.className = "generation-record-list";
    const notice = document.createElement("button");
    notice.type = "button"; notice.className = "generation-record-new"; notice.hidden = true;
    notice.textContent = "有新的生成结果 ↓";
    const popover = document.createElement("div");
    popover.id = `generation-record-popover-${++nextPopover}`;
    popover.className = "generation-record-popover";
    popover.dataset.wheelScope = "local";
    const cards = new Map();
    const mediaPlayers = new WeakMap();
    const scrollPositions = new Map();
    let scopeKey = "";
    let active = null;
    let showTimer = 0;
    let hideTimer = 0;
    let disposed = false;
    let restoringFocus = false;
    let resizeObserver;

    function keyOf(scope) {
      return scope?.projectId && (scope.conversationId || scope.conversation?.id)
        ? `${scope.projectId}\u0000${scope.conversationId || scope.conversation.id}` : "";
    }
    function inScope(task) { return task && keyOf(task.scope) === scopeKey && keyOf(getScope()) === scopeKey; }
    function busy(task) { return task.status === "queued" || task.status === "running"; }
    function cancellable(task) {
      return busy(task) && (canCancel ? canCancel(task) : now() < Number(task.cancelUntil || 0));
    }
    function icon(name) {
      if (LOCAL_ICON_PATHS[name]) return `<svg data-generation-icon="${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${LOCAL_ICON_PATHS[name]}</svg>`;
      return `<i data-lucide="${name}" aria-hidden="true"></i>`;
    }
    function references(input) {
      const raw = Array.isArray(input.referenceSnapshot) ? input.referenceSnapshot
        : (input.references || []).map((entry) => entry.asset ? entry : { asset: entry, key: `asset:${entry.id}` });
      const count = {};
      return raw.filter((entry) => entry?.asset && TYPES[entry.asset.type]).map((entry) => {
        const type = entry.asset.type;
        const ordinal = (count[type] || 0) + 1; count[type] = ordinal;
        return { ...entry, mediaType: type, ordinal,
          label: `${TYPES[type]}${ordinal}`, name: entry.name || entry.asset.name || entry.asset.displayName || `${TYPES[type]}${ordinal}` };
      });
    }
    function thumbnail(entry) {
      const asset = entry.asset;
      if (assetPreview) return assetPreview(asset);
      const url = sanitizeUrl(asset.type === "image" ? asset.url : asset.posterUrl || asset.thumbnailUrl || "");
      return url ? `<img src="${escape(url)}" alt="" loading="lazy" decoding="async" draggable="false">`
        : icon(ICONS[asset.type] || "image");
    }
    function promptMarkup(input) {
      if (!renderPrompt) return escape(typeof input.prompt === "string" ? input.prompt : "").replaceAll("\n", "<br>");
      const template = document.createElement("template");
      template.innerHTML = renderPrompt(input);
      const entries = new Map(references(input).map((entry) => [entry.key, entry]));
      for (const reference of template.content.querySelectorAll(".prompt-reference[data-reference-key]")) {
        const entry = entries.get(reference.dataset.referenceKey);
        const thumb = reference.querySelector(".prompt-reference-thumb");
        if (entry && thumb) thumb.innerHTML = thumbnail(entry);
        // Space the read-only rendering, leaving the saved prompt untouched.
        // Text whitespace wraps naturally; chip margins would indent new lines.
        const before = reference.previousSibling;
        const after = reference.nextSibling;
        if (before?.nodeType === 3 && /\S$/.test(before.textContent)) before.textContent += " ";
        if (after?.nodeType === 3 && /^\S/.test(after.textContent)) after.textContent = ` ${after.textContent}`;
        else if (after?.nodeType === 1 && after.matches(".prompt-reference")) reference.after(document.createTextNode(" "));
      }
      return template.innerHTML;
    }
    function parameterItems(input) {
      const summary = input.parameterSummary;
      const items = Array.isArray(summary) ? summary : typeof summary === "string" ? summary.split("·") : [];
      return items.filter(Boolean).map((item) => String(item).trim()).filter(Boolean);
    }
    function formatTime(value, full = false) {
      const date = new Date(value);
      return Number.isFinite(date.getTime()) ? date.toLocaleString("zh-CN", {
        ...(full ? { year: "numeric" } : {}), month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
      }) : "";
    }
    function releaseMedia(element) {
      for (const media of element.querySelectorAll("video, audio")) {
        mediaPlayers.get(media)?.dispose({ releaseMedia: false });
        mediaPlayers.delete(media);
        media.pause(); media.removeAttribute("src"); media.load();
      }
    }
    function dismiss() {
      view.clearTimeout(showTimer); view.clearTimeout(hideTimer); showTimer = 0; hideTimer = 0;
      if (active?.gallery) settleReferenceTransition(active.gallery);
      if (active?.kind === "menu") {
        const reveal = cards.get(active.taskId)?.element.querySelector("[data-record-delete-reveal]");
        if (reveal) { reveal.hidden = true; reveal.inert = true; }
      }
      active?.anchor?.setAttribute("aria-expanded", "false");
      active?.anchor?.removeAttribute("aria-controls");
      active = null; releaseMedia(popover); popover.replaceChildren(); popover.remove();
    }
    function makeCard(task) {
      const article = document.createElement("article");
      article.className = "generation-record"; article.dataset.generationTaskId = task.id;
      const entries = references(task.input);
      const counts = Object.keys(TYPES).map((type) => ({ type, count: entries.filter((entry) => entry.mediaType === type).length })).filter((item) => item.count);
      const title = counts.map(({ type, count }) => `${count} 个${TYPES[type]}`).join("、");
      const cover = entries.find((entry) => entry.mediaType === "image") || entries[0];
      article.innerHTML = `<div class="generation-record-surface"><div class="generation-record-input${entries.length ? " has-references" : ""}">
        ${entries.length ? `<button type="button" class="generation-record-references" data-record-popover="references" aria-expanded="false" aria-label="参考素材：${escape(title)}">
          <span class="generation-record-cover">${thumbnail(cover)}</span>
          <span class="generation-record-counts">${counts.map(({ type, count }) => `<span title="${count} 个${TYPES[type]}">${icon(ICONS[type])}<span>${count}</span></span>`).join("")}</span>
        </button>` : ""}
        <div class="generation-record-copy"><div class="generation-record-prompt" data-record-popover="prompt" tabindex="0" role="button" aria-label="查看完整提示词" aria-expanded="false">${promptMarkup(task.input)}</div>
        <div class="generation-record-parameters"><strong title="${escape(task.input.modelName || task.input.modelId || "生成任务")}">${escape(task.input.modelName || task.input.modelId || "生成任务")}</strong>${parameterItems(task.input).map((item) => `<span class="generation-record-parameter">${escape(item)}</span>`).join("")}<button type="button" class="generation-record-details-trigger" data-record-popover="details" aria-expanded="false" aria-label="任务详情" title="任务详情"><span class="generation-record-details-label">任务详情</span>${icon("info")}</button></div>
      </div></div></div>
      <div class="generation-record-output"></div>
      <footer class="generation-record-footer">
        <div class="generation-record-actions">
          <button type="button" data-generation-action="cancel" class="generation-record-cancel">取消生成</button>
          <span class="generation-record-terminal-actions"><button type="button" data-generation-action="edit">${icon("pencil")}重新编辑</button><button type="button" data-generation-action="again">${icon("rotate-cw")}再次生成</button><button type="button" data-generation-action="locate" class="generation-record-icon-action" aria-label="定位画布中的生成结果" title="定位生成结果" hidden>${icon("locate")}</button><button type="button" data-record-popover="menu" class="generation-record-more" aria-label="更多操作" aria-expanded="false">${icon("more-horizontal")}</button><span data-record-delete-reveal hidden inert><button type="button" data-generation-action="remove">${icon("trash-2")}<span>删除此记录</span></button></span></span>
        </div></footer>`;
      list.append(article);
      const card = { taskId: task.id, element: article, entries, signature: "", input: task.input, start: 0, pageSize: 0 };
      article.querySelector("[data-record-delete-reveal]").id = `${popover.id}-delete-${encodeURIComponent(task.id)}`;
      cards.set(task.id, card);
      fillReferences(card);
      return card;
    }
    function mediaElement(asset, label, className) {
      const type = TYPES[asset?.type] ? asset.type : "image";
      const url = sanitizeUrl(asset?.url);
      if (!url) {
        const missing = document.createElement("span"); missing.className = "generation-record-media-unavailable";
        missing.textContent = "此素材暂时无法预览"; return missing;
      }
      const media = document.createElement(type === "image" ? "img" : type);
      media.className = className;
      if (type === "image") { media.alt = label; media.loading = "lazy"; media.decoding = "async"; }
      else {
        media.controls = true; media.preload = "metadata";
        if (type === "video") { media.playsInline = true; const poster = sanitizeUrl(asset.posterUrl); if (poster) media.poster = poster; }
      }
      media.draggable = false; media.src = url;
      return media;
    }
    function updateCard(card, task) {
      const article = card.element;
      article.dataset.status = task.status;
      const resultAsset = task.result?.asset || task.result || {};
      const signature = JSON.stringify([task.status, task.error, task.refunded, resultAsset.url, resultAsset.type]);
      const output = article.querySelector(".generation-record-output");
      let changed = false;
      if (signature !== card.signature) {
        const sameMedia = task.status === "succeeded" && output.querySelector(".generation-record-result")
          && output.dataset.resultUrl === resultAsset.url && output.dataset.resultType === resultAsset.type;
        if (!sameMedia) {
          releaseMedia(output); output.replaceChildren();
          delete output.dataset.resultUrl; delete output.dataset.resultType;
          if (busy(task)) {
            output.innerHTML = `<div class="generation-record-wait" role="status"><span class="generation-record-spinner" aria-hidden="true"></span><span>${task.status === "queued" ? "正在排队" : "正在生成"}</span><small>生成完成后会显示在这里</small></div>`;
            const aspect = String(task.input.parameters?.aspect || "16:9").split(":").map(Number);
            setMediaAspect(output.firstElementChild, aspect[0] / aspect[1]);
          } else if (task.status === "succeeded") {
            const asset = resultAsset;
            const result = document.createElement("div"); result.className = `generation-record-result is-${asset.type || "image"}`;
            const media = mediaElement(asset, asset.name || "生成结果", "generation-record-media");
            setMediaAspect(result, Number(asset.width) / Number(asset.height) || Number(asset.aspectRatio));
            const onDimensions = () => setMediaAspect(result,
              (media.naturalWidth || media.videoWidth) / (media.naturalHeight || media.videoHeight));
            media.addEventListener(asset.type === "video" ? "loadedmetadata" : "load", onDimensions, { once: true });
            if (asset.type === "image") { media.dataset.recordPopover = "result"; media.tabIndex = 0; media.setAttribute("role", "button"); media.setAttribute("aria-label", "放大预览生成结果"); }
            result.append(media);
            output.append(result);
            if (asset.type === "video" && media.tagName === "VIDEO") {
              const player = global.REELAY_GENERATION_MEDIA?.mount({ document, container: result, video: media });
              if (player) mediaPlayers.set(media, player);
            }
            output.dataset.resultUrl = asset.url || ""; output.dataset.resultType = asset.type || "";
          } else {
            const status = document.createElement("div"); status.className = "generation-record-outcome"; status.setAttribute("role", "status");
            const reason = task.status === "failed" ? String(task.error?.message || task.error || "本次生成未完成，请重试") : "";
            status.innerHTML = `${icon(task.status === "failed" ? "circle-alert" : "circle-minus")}<div><span>${task.status === "failed" ? "生成失败" : "生成已取消"}</span>${reason ? `<span class="generation-record-separator" aria-hidden="true">｜</span><span>${escape(reason)}</span>` : ""}${task.refunded ? `<span class="generation-record-refund">积分已返还</span>` : ""}<button type="button" data-generation-action="feedback" title="复制任务编号，用于反馈">反馈</button></div>`;
            output.append(status);
          }
        }
        card.signature = signature; changed = true;
      }
      article.querySelector(".generation-record-terminal-actions").hidden = busy(task);
      const cancel = article.querySelector('[data-generation-action="cancel"]');
      cancel.hidden = !cancellable(task);
      article.querySelector('[data-generation-action="locate"]').hidden = task.status !== "succeeded" || !task.addedNodeId;
      return changed;
    }
    function setMediaAspect(element, ratio) {
      const aspect = Number.isFinite(ratio) && ratio > 0 ? ratio : 16 / 9;
      element.style.setProperty("--generation-media-aspect", String(aspect));
    }
    function visibleAnchor() {
      const bounds = container.getBoundingClientRect();
      for (const card of cards.values()) {
        const rect = card.element.getBoundingClientRect();
        if (rect.bottom > bounds.top && rect.top < bounds.bottom) return { element: card.element, top: rect.top };
      }
      return null;
    }
    function render({ forceBottom = false } = {}) {
      if (disposed) return;
      const nextScope = keyOf(getScope());
      const switched = nextScope !== scopeKey;
      const wasBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 48;
      const anchor = !switched && !wasBottom ? visibleAnchor() : null;
      if (switched) {
        if (scopeKey) scrollPositions.set(scopeKey, container.scrollTop);
        dismiss(); releaseMedia(list); cards.clear(); list.replaceChildren(); scopeKey = nextScope;
      }
      if (list.parentNode !== container) { container.replaceChildren(list, notice); }
      const tasks = scopeKey ? (getTasks() || []).filter(inScope) : [];
      const ids = new Set(tasks.map((task) => task.id));
      for (const [id, card] of cards) {
        if (!ids.has(id)) { releaseMedia(card.element); card.element.remove(); cards.delete(id); }
      }
      let newResult = false;
      for (const task of tasks) {
        const card = cards.get(task.id) || makeCard(task);
        const previous = card.element.dataset.status;
        const changed = updateCard(card, task);
        fillReferences(card);
        if (changed && previous && previous !== task.status && !busy(task)) newResult = true;
      }
      if (!tasks.length) {
        if (!list.querySelector(".generation-record-empty")) {
          const empty = document.createElement("div"); empty.className = "generation-record-empty";
          empty.textContent = "描述你的创意，生成结果会留在这里"; list.append(empty);
        }
      } else list.querySelector(".generation-record-empty")?.remove();
      if (forceBottom || (!switched && wasBottom)) { container.scrollTop = container.scrollHeight; notice.hidden = true; }
      else if (switched) { container.scrollTop = scrollPositions.get(scopeKey) ?? container.scrollHeight; notice.hidden = true; }
      else if (anchor?.element.isConnected) container.scrollTop += anchor.element.getBoundingClientRect().top - anchor.top;
      if (!forceBottom && !wasBottom && newResult) notice.hidden = false;
      if (active && !ids.has(active.taskId)) dismiss();
      if (active?.kind === "details") fillDetails(getTask(active.taskId));
      refreshIcons(list); positionPopover();
    }
    function taskAt(target) {
      const id = target?.closest?.("[data-generation-task-id]")?.dataset.generationTaskId || (popover.contains(target) ? active?.taskId : null);
      const task = id ? getTask(id) : null;
      return inScope(task) ? task : null;
    }
    function referenceLayout(card) {
      const width = Math.min(list.getBoundingClientRect().width || container.clientWidth || 340, view.innerWidth - 24);
      const sparse = card.entries.length <= 2;
      const tile = sparse ? 112 : 52; const gap = sparse ? 8 : 6;
      // Geometry and CSS share these metrics: reserve surface padding/borders,
      // and both navigation controls only when the references need pagination.
      const allFit = card.entries.length <= 10 && card.entries.length * (tile + gap) - gap <= width - 26;
      const navigation = allFit ? 0 : 44 + gap * 2;
      const size = Math.max(1, Math.min(10, Math.floor((width - 26 - navigation + gap) / (tile + gap))));
      return { size, tile, gap, sparse };
    }
    function settleReferenceTransition(gallery) {
      for (const animation of gallery.animations || []) { animation.onfinish = null; animation.cancel(); }
      gallery.animations = [];
      if (gallery.outgoing) { releaseMedia(gallery.outgoing); gallery.outgoing.remove(); gallery.outgoing = null; }
    }
    function fillReferences(card, force = false, direction = 0) {
      const { size, tile, gap, sparse } = referenceLayout(card); const total = card.entries.length;
      if (!force && size === card.pageSize) return;
      const previousStart = Math.max(0, Math.min(card.start || 0, Math.max(0, total - 1)));
      // Reflow onto the page containing the previous leading item. Once every
      // reference fits, the first page is the only valid, reachable position.
      card.start = total <= size ? 0 : Math.floor(previousStart / size) * size;
      card.pageSize = size;
      const rail = active?.kind === "references" && active.taskId === card.taskId
        ? popover.querySelector(".generation-record-reference-rail") : null;
      if (!rail) return;
      popover.classList.toggle("is-sparse", sparse);
      rail.style.setProperty("--reference-tile-size", `${tile}px`);
      rail.style.setProperty("--reference-tile-gap", `${gap}px`);
      const paged = total > size;
      const visible = card.entries.slice(card.start, card.start + size);
      let gallery = active.gallery;
      if (!gallery) {
        rail.innerHTML = `<div class="generation-record-reference-viewport" tabindex="-1"></div><button type="button" class="generation-record-page-button" data-reference-page="-1" aria-label="上一页素材">${icon("chevron-left")}</button><button type="button" class="generation-record-page-button" data-reference-page="1" aria-label="下一页素材">${icon("chevron-right")}</button>`;
        gallery = active.gallery = { rail, viewport: rail.querySelector(".generation-record-reference-viewport"),
          previous: rail.querySelector('[data-reference-page="-1"]'), next: rail.querySelector('[data-reference-page="1"]'), animations: [] };
      }
      settleReferenceTransition(gallery);
      const focused = document.activeElement;
      const focusedIndex = gallery.page?.contains(focused) ? focused.closest("[data-reference-preview]")?.dataset.referencePreview : null;
      const previousAvailable = paged && card.start > 0;
      const nextAvailable = paged && card.start + size < total;
      const moveFocus = focusedIndex != null || (focused === gallery.previous && !previousAvailable) || (focused === gallery.next && !nextAvailable);
      // Transfer focus inside the same stable surface before removing a page
      // or disabling its last navigation button; blur cannot escape the picker.
      if (moveFocus) gallery.viewport.focus({ preventScroll: true });
      for (const [button, available] of [[gallery.previous, previousAvailable], [gallery.next, nextAvailable]]) {
        button.hidden = !paged; button.disabled = !available;
        button.style.visibility = available ? "" : "hidden";
      }
      const page = document.createElement("div"); page.className = "generation-record-reference-page";
      page.innerHTML = visible.map((entry, index) => `<button type="button" class="generation-record-reference-item" data-record-popover="reference" data-reference-preview="${card.start + index}" aria-expanded="false" aria-label="${escape(`${entry.label}：${entry.name}，预览`)}"><span>${thumbnail(entry)}</span><small>${escape(entry.label)}</small></button>`).join("");
      const previousPage = gallery.page; const previousWidth = gallery.width || 0;
      // A paged strip keeps its viewport even on a short final page. Only the
      // real references are rendered; empty capacity is never a placeholder tile.
      gallery.page = page; gallery.width = Math.max(0, (paged ? size : visible.length) * (tile + gap) - gap);
      gallery.viewport.style.width = `${gallery.width}px`;
      gallery.viewport.append(page);
      const animate = previousPage && direction && typeof page.animate === "function" && !view.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      if (animate) {
        previousPage.classList.add("is-leaving"); previousPage.inert = true; previousPage.setAttribute("aria-hidden", "true");
        gallery.outgoing = previousPage;
        const distance = (direction > 0 ? previousWidth : gallery.width) + gap;
        const offset = direction > 0 ? distance : -distance;
        const timing = { duration: 180, easing: "cubic-bezier(.2,.7,.2,1)" };
        const outgoing = previousPage.animate([{ transform: "translateX(0)" }, { transform: `translateX(${-offset}px)` }], timing);
        const incoming = page.animate([{ transform: `translateX(${offset}px)` }, { transform: "translateX(0)" }], timing);
        gallery.animations = [outgoing, incoming];
        incoming.onfinish = () => { if (gallery.page === page) settleReferenceTransition(gallery); };
      } else if (previousPage) { releaseMedia(previousPage); previousPage.remove(); }
      refreshIcons(rail);
      if (moveFocus) {
        const reference = focusedIndex != null ? page.querySelector(`[data-reference-preview="${focusedIndex}"]`) || page.querySelector("button") : null;
        const navigation = nextAvailable && focused === gallery.next ? gallery.next : previousAvailable ? gallery.previous : nextAvailable ? gallery.next : null;
        (reference || navigation || page.querySelector("button"))?.focus({ preventScroll: true });
      }
    }
    function onResize() {
      for (const card of cards.values()) fillReferences(card);
      positionPopover();
    }
    function positionPopover() {
      if (!active || !active.anchor.isConnected || !inScope(getTask(active.taskId))) return active && dismiss();
      const anchorRect = active.anchor.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const listRect = list.getBoundingClientRect();
      if (anchorRect.bottom < containerRect.top || anchorRect.top > containerRect.bottom) return dismiss();
      if (active.kind === "menu") return;
      const maxWidth = Math.max(120, Math.min(listRect.width || 340, view.innerWidth - 24));
      popover.style.maxWidth = `${maxWidth}px`;
      popover.style.maxHeight = `${Math.max(80, view.innerHeight - 32)}px`;
      const floating = popover.getBoundingClientRect();
      const isMenu = active.kind === "details";
      const anchor = isMenu ? anchorRect : {
        left: listRect.left, right: listRect.right, width: listRect.width,
        top: anchorRect.top, bottom: anchorRect.bottom, height: anchorRect.height,
      };
      const placement = placeAnchoredPopover?.({ anchor, floating,
        boundary: { left: 0, top: 0, right: view.innerWidth, bottom: view.innerHeight },
        placements: isMenu ? ["top-end", "bottom-end"] : ["top-start", "bottom-start"], gap: 7, padding: 12,
      });
      popover.style.left = `${placement?.left ?? Math.max(12, Math.min(anchor.left, view.innerWidth - floating.width - 12))}px`;
      popover.style.top = `${placement?.top ?? Math.max(12, anchor.top - floating.height - 7)}px`;
      popover.dataset.placement = placement?.placement || "top-start";
    }
    function open(kind, anchor, task, pinned = false, referenceKey = "") {
      if (!task || !inScope(task)) return;
      if (kind === "prompt" && anchor.scrollHeight <= anchor.clientHeight + 1) return;
      const entries = kind === "reference" ? cards.get(task.id)?.entries || [] : [];
      const key = referenceKey || anchor.dataset.referenceKey || "";
      const entry = kind === "reference" ? key ? entries.find((item) => item.key === key)
        : entries[Number(anchor.dataset.referencePreview)] : null;
      if (kind === "reference" && !entry) return;
      if (active?.anchor === anchor && active.kind === kind && active.referenceKey === (entry?.key || "")) {
        active.pinned ||= pinned; view.clearTimeout(hideTimer); return;
      }
      dismiss(); active = { kind, anchor, taskId: task.id, pinned, referenceKey: entry?.key || "" };
      anchor.setAttribute("aria-expanded", "true"); anchor.setAttribute("aria-controls", popover.id);
      if (kind === "menu") {
        if (busy(task)) return dismiss();
        const reveal = cards.get(task.id).element.querySelector("[data-record-delete-reveal]");
        reveal.hidden = false; reveal.inert = false;
        anchor.setAttribute("aria-controls", reveal.id);
        return;
      }
      popover.className = `generation-record-popover generation-record-${kind}-popover`;
      popover.setAttribute("role", "dialog");
      if (kind === "references") {
        const card = cards.get(task.id);
        if (!card.entries.length) return dismiss();
        popover.setAttribute("aria-label", "参考素材");
        popover.innerHTML = `<div class="generation-record-popover-title"><span>参考素材 <span class="generation-record-reference-total">(${card.entries.length})</span></span></div><div class="generation-record-reference-rail"></div>`;
        fillReferences(card, true);
      } else if (kind === "reference") {
        showMedia(entry.asset, `${entry.label} · ${entry.name}`);
      } else if (kind === "prompt") {
        popover.setAttribute("aria-label", "完整提示词");
        popover.innerHTML = `<div class="generation-record-popover-title">提示词<button type="button" data-record-close aria-label="关闭完整提示词">${icon("x")}</button></div><div class="generation-record-full-prompt" tabindex="0">${promptMarkup(task.input)}</div>`;
      } else if (kind === "details") {
        popover.setAttribute("aria-label", "任务详情");
        fillDetails(task);
      } else if (kind === "result") {
        showMedia(task.result?.asset || task.result, "生成结果");
      }
      document.body.append(popover); refreshIcons(popover); positionPopover();
    }
    function showMedia(asset, label) {
      if (!active) return;
      releaseMedia(popover); popover.replaceChildren();
      popover.className = "generation-record-popover generation-record-preview-popover";
      popover.setAttribute("role", "dialog"); popover.setAttribute("aria-label", `${label}预览`);
      const media = mediaElement(asset, label, "generation-record-preview-media");
      const fromGallery = active.anchor.dataset.recordPopover === "references";
      const imageOnly = media.tagName === "IMG" && active.kind === "reference" && !fromGallery;
      popover.classList.toggle("reference-image-preview", imageOnly);
      if (!imageOnly) {
        const title = document.createElement("div"); title.className = "generation-record-popover-title";
        title.innerHTML = `${fromGallery ? `<button type="button" data-record-back aria-label="返回参考素材">${icon("chevron-left")}</button>` : ""}<span>${escape(label)}</span><button type="button" data-record-close aria-label="关闭预览">${icon("x")}</button>`;
        popover.append(title);
      }
      popover.append(media);
      if (media.tagName === "IMG") media.addEventListener("load", () => {
        if (popover.contains(media)) positionPopover();
      }, { once: true });
      refreshIcons(popover); positionPopover();
    }
    function fillDetails(task) {
      const finishedAt = task.finishedAt ?? task.completedAt;
      const signature = JSON.stringify([task.status, finishedAt, task.refunded]);
      if (active.detailsSignature === signature) return;
      active.detailsSignature = signature;
      const focused = popover.contains(document.activeElement) ? document.activeElement : null;
      const copyFocused = focused?.matches('[data-generation-action="feedback"]');
      const closeFocused = focused?.matches("[data-record-close]");
      popover.innerHTML = `<div class="generation-record-popover-title">任务详情<button type="button" data-record-close aria-label="关闭任务详情">${icon("x")}</button></div><dl><dt>发送时间</dt><dd>${escape(formatTime(task.createdAt, true))}</dd>${finishedAt != null ? `<dt>${task.status === "canceled" ? "取消时间" : "完成时间"}</dt><dd>${escape(formatTime(finishedAt, true))}</dd><dt>耗时</dt><dd>${Math.max(0, Math.round((finishedAt - task.createdAt) / 1000))} 秒</dd>` : ""}<dt>本次消耗</dt><dd>${escape(task.input.cost ?? 0)} 积分${task.refunded ? " · 已返还" : ""}</dd><dt>TaskId</dt><dd class="generation-record-task-id"><code>${escape(task.id)}</code><button type="button" data-generation-action="feedback" aria-label="复制 TaskId" title="复制任务编号">${icon("copy")}</button></dd></dl>`;
      refreshIcons(popover);
      if (copyFocused || closeFocused) popover.querySelector(copyFocused ? '[data-generation-action="feedback"]' : "[data-record-close]")?.focus({ preventScroll: true });
    }
    function pinPopover() {
      view.clearTimeout(showTimer); view.clearTimeout(hideTimer); showTimer = 0; hideTimer = 0;
      if (active) active.pinned = true;
    }
    function scheduleHide() {
      view.clearTimeout(hideTimer);
      const expected = active;
      if (expected && !expected.pinned) hideTimer = view.setTimeout(() => {
        hideTimer = 0;
        if (active === expected && !active.pinned && !popover.contains(document.activeElement) && !active.anchor.contains(document.activeElement)) dismiss();
      }, 210);
    }
    function hover(event) {
      if (active?.pinned) return;
      const anchor = event.target.closest?.('[data-record-popover="references"], [data-record-popover="prompt"], .prompt-reference[data-reference-key]:not(.is-missing)');
      if (!anchor || !list.contains(anchor) || anchor.contains(event.relatedTarget)) return;
      view.clearTimeout(hideTimer); view.clearTimeout(showTimer);
      const kind = anchor.dataset.recordPopover || "reference";
      // Show the gallery during the entry's 160 ms scale feedback, while
      // retaining reading intent delay for prompt and inline-media previews.
      showTimer = view.setTimeout(() => { showTimer = 0; open(kind, anchor, taskAt(anchor)); }, kind === "references" ? 80 : 300);
    }
    function focusPreview(event) {
      if (restoringFocus || active?.pinned) return;
      const anchor = event.target.closest?.('[data-record-popover="references"], .prompt-reference[data-reference-key]:not(.is-missing)');
      if (anchor) open(anchor.dataset.recordPopover || "reference", anchor, taskAt(anchor));
    }
    function blurPreview(event) {
      if (active?.kind === "menu") {
        const reveal = cards.get(active.taskId)?.element.querySelector("[data-record-delete-reveal]");
        if (!active.anchor.contains(event.relatedTarget) && !reveal?.contains(event.relatedTarget)) dismiss();
        return;
      }
      if (!active || active.pinned || active.anchor.contains(event.relatedTarget) || popover.contains(event.relatedTarget)) return;
      dismiss();
    }
    function closeAndRestoreFocus() {
      const anchor = active?.anchor;
      dismiss(); restoringFocus = true;
      try { anchor?.focus({ preventScroll: true }); }
      finally { restoringFocus = false; }
    }
    function leave(event) {
      const anchor = event.target.closest?.("[data-record-popover], .prompt-reference[data-reference-key]");
      if (!anchor || !list.contains(anchor) || anchor.contains(event.relatedTarget)) return;
      view.clearTimeout(showTimer); scheduleHide();
    }
    function click(event) {
      const task = taskAt(event.target);
      if (!task) return;
      const action = event.target.closest?.("[data-generation-action]");
      if (action && (list.contains(action) || popover.contains(action))) {
        const name = action.dataset.generationAction;
        if (name === "cancel" && !cancellable(task)) return;
        if (name === "remove" && (busy(task) || action.closest("[data-record-delete-reveal]")?.hidden)) return;
        if (name === "locate" && (task.status !== "succeeded" || !task.addedNodeId)) return;
        event.preventDefault(); event.stopPropagation(); if (name === "remove") dismiss();
        onAction(name, task, event); return;
      }
      const page = event.target.closest?.("[data-reference-page]");
      if (page && !page.disabled && popover.contains(page) && active?.kind === "references") {
        event.preventDefault(); event.stopPropagation();
        pinPopover();
        const card = cards.get(task.id); const direction = Number(page.dataset.referencePage);
        card.start = Math.max(0, Math.min(card.entries.length - 1, card.start + direction * card.pageSize));
        fillReferences(card, true, direction);
        positionPopover();
        const next = popover.querySelector(`[data-reference-page="${direction}"]:not(:disabled)`)
          || popover.querySelector("[data-reference-page]:not(:disabled)");
        next?.focus({ preventScroll: true });
        return;
      }
      const tile = event.target.closest?.("[data-reference-preview]");
      if (tile && popover.contains(tile) && !tile.closest(".is-leaving")) {
        const card = cards.get(task.id);
        const entry = card.entries[Number(tile.dataset.referencePreview)];
        if (entry) open("reference", card.element.querySelector(".generation-record-references"), task, true, entry.key);
        return;
      }
      const part = event.target.closest?.(".prompt-reference[data-reference-key]");
      if (part) {
        const entry = cards.get(task.id)?.entries.find((item) => item.key === part.dataset.referenceKey);
        if (entry) {
          // A reference inside the full-prompt portal disappears when that
          // portal becomes a media preview. Anchor to the persistent record,
          // while resolving the media by the original immutable reference key.
          const anchor = popover.contains(part) ? cards.get(task.id)?.element.querySelector(".generation-record-prompt") : part;
          if (anchor) open("reference", anchor, task, true, part.dataset.referenceKey);
        }
        return;
      }
      const anchor = event.target.closest?.("[data-record-popover]");
      if (anchor && list.contains(anchor)) {
        event.preventDefault();
        if (active?.anchor === anchor && active.pinned) dismiss();
        else {
          open(anchor.dataset.recordPopover, anchor, task, true);
          if (active && event.detail === 0 && active.kind !== "menu") popover.querySelector(".generation-record-full-prompt, button")?.focus({ preventScroll: true });
        }
      }
    }
    function popoverClick(event) {
      if (event.target.closest("[data-record-close]")) { closeAndRestoreFocus(); return; }
      if (event.target.closest("[data-record-back]")) {
        const task = getTask(active.taskId); const anchor = active.anchor; const card = cards.get(active.taskId);
        const index = card?.entries.findIndex((entry) => entry.key === active.referenceKey);
        if (index >= 0) card.start = index;
        open("references", anchor, task, true);
        (popover.querySelector(`[data-reference-preview="${index}"]`) || popover.querySelector("[data-reference-preview]"))?.focus({ preventScroll: true });
        return;
      }
      click(event);
    }
    function pointerOutside(event) {
      if (active?.kind === "references" && popover.contains(event.target)) { pinPopover(); return; }
      if (active?.kind === "menu" && cards.get(active.taskId)?.element.querySelector("[data-record-delete-reveal]")?.contains(event.target)) return;
      if (active && !popover.contains(event.target) && !active.anchor.contains(event.target)) dismiss();
    }
    function keydown(event) {
      if (event.key === "Escape" && active) { closeAndRestoreFocus(); event.preventDefault(); }
      else if ((event.key === "Enter" || event.key === " ") && (list.contains(event.target) || popover.contains(event.target))) {
        if (event.target.matches('[role="button"]:not(button)')) { event.preventDefault(); event.target.click(); }
      }
    }
    function onScroll(event) {
      if (event.target === container && container.scrollHeight - container.scrollTop - container.clientHeight < 48) notice.hidden = true;
      if (active && !popover.contains(event.target)) positionPopover();
    }
    function onPopoverEnter() { view.clearTimeout(hideTimer); }
    function onPopoverLeave(event) { if (!popover.contains(event.relatedTarget)) scheduleHide(); }
    function scrollBottom() { container.scrollTop = container.scrollHeight; notice.hidden = true; }
    list.addEventListener("pointerover", hover); list.addEventListener("pointerout", leave);
    list.addEventListener("focusin", focusPreview);
    list.addEventListener("focusout", blurPreview);
    list.addEventListener("click", click);
    popover.addEventListener("click", popoverClick);
    popover.addEventListener("focusout", blurPreview);
    popover.addEventListener("pointerenter", onPopoverEnter); popover.addEventListener("pointerleave", onPopoverLeave);
    notice.addEventListener("click", scrollBottom);
    document.addEventListener("pointerdown", pointerOutside);
    document.addEventListener("keydown", keydown); document.addEventListener("scroll", onScroll, true);
    view.addEventListener("resize", onResize);
    if (view.ResizeObserver) { resizeObserver = new view.ResizeObserver(onResize); resizeObserver.observe(container); }

    function close() {
      dismiss();
      // Hiding the workspace stops sound without destroying playback position.
      for (const media of list.querySelectorAll("video, audio")) media.pause();
    }
    function dispose() {
      if (disposed) return; disposed = true; close(); resizeObserver?.disconnect(); releaseMedia(list); cards.clear();
      list.remove(); notice.remove();
      list.removeEventListener("pointerover", hover); list.removeEventListener("pointerout", leave);
      list.removeEventListener("focusin", focusPreview);
      list.removeEventListener("focusout", blurPreview);
      list.removeEventListener("click", click);
      popover.removeEventListener("click", popoverClick); popover.removeEventListener("pointerenter", onPopoverEnter); popover.removeEventListener("pointerleave", onPopoverLeave);
      popover.removeEventListener("focusout", blurPreview);
      notice.removeEventListener("click", scrollBottom); document.removeEventListener("pointerdown", pointerOutside);
      document.removeEventListener("keydown", keydown); document.removeEventListener("scroll", onScroll, true); view.removeEventListener("resize", onResize);
    }
    return Object.freeze({ render, close, dispose });
  }
  global.REELAY_GENERATION_RECORD_VIEW = Object.freeze({ createController });
}(typeof globalThis === "object" ? globalThis : window));
