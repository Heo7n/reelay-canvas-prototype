(function registerGenerationRecordView(global) {
  "use strict";

  const TYPES = { image: "图片", video: "视频", audio: "音频" };
  const ICONS = { image: "image", video: "square-play", audio: "audio-lines" };
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
    notice.textContent = "新结果 · 查看";
    const noticeSlot = document.createElement("div"); noticeSlot.className = "generation-record-feedback-slot";
    noticeSlot.append(notice);
    const popover = document.createElement("div");
    popover.id = `generation-record-popover-${++nextPopover}`;
    popover.className = "generation-record-popover";
    popover.dataset.wheelScope = "local";
    const inlinePopover = document.createElement("div");
    inlinePopover.id = `${popover.id}-inline`;
    inlinePopover.dataset.wheelScope = "local";
    let inlineActive = null;
    let inlineHideTimer = 0;
    const cards = new Map();
    const mediaPlayers = new WeakMap();
    const referencePreview = global.REELAY_GENERATION_REFERENCE_PREVIEW.createController({ document, sanitizeUrl, refreshIcons });
    const scrollPositions = new Map();
    let scopeKey = "";
    let active = null;
    let showTimer = 0;
    let hideTimer = 0;
    let expiryTimer = 0;
    let disposed = false;
    let restoringFocus = false;
    let resizeObserver;
    const hoverPaused = new Map();
    let pointerPosition = null;
    const observedTasks = new Map();
    const unreadResults = new Map();
    const readingTimers = new Map();
    let highlight = null;

    function keyOf(scope) {
      return scope?.projectId && (scope.conversationId || scope.conversation?.id)
        ? `${scope.projectId}\u0000${scope.conversationId || scope.conversation.id}` : "";
    }
    function resultKey(task) { return `${keyOf(task.scope)}\u0000${task.id}`; }
    function isUnread(task) { return Boolean(task && unreadResults.has(resultKey(task))); }
    function observeTask(task, event = {}) {
      if (disposed || !task || task.sourceSurface === "canvas" || task.isPreview) return;
      const key = resultKey(task);
      if (event.type === "removed") { observedTasks.delete(key); unreadResults.delete(key); return; }
      const previous = observedTasks.get(key);
      if (task.status === "succeeded" && task.result && previous?.status !== "succeeded"
        && (previous || event.type === "succeeded")) {
        unreadResults.set(key, { id: task.id, scope: keyOf(task.scope) });
      }
      observedTasks.set(key, { id: task.id, scope: keyOf(task.scope), status: task.status });
    }
    function mediaVisible(card) {
      const media = card?.element.querySelector(".generation-record-result");
      if (!media || !container.isConnected || document.visibilityState === "hidden" || container.closest("[hidden], [inert], [aria-hidden='true']")) return false;
      const bounds = container.getBoundingClientRect();
      const rect = media.getBoundingClientRect();
      const visibleHeight = Math.min(rect.bottom, bounds.bottom, view.innerHeight) - Math.max(rect.top, bounds.top, 0);
      return rect.height > 0 && visibleHeight >= Math.min(rect.height, bounds.height || container.clientHeight, view.innerHeight) * .5;
    }
    function selectedVisible(card, id) { return card?.selectedId === id && mediaVisible(card); }
    function setUnread(element, value) {
      if (value && element.dataset.unread !== "true") element.dataset.unread = "true";
      else if (!value && element.hasAttribute("data-unread")) element.removeAttribute("data-unread");
    }
    function acknowledge(task) {
      if (!task || !unreadResults.delete(resultKey(task))) return false;
      const key = resultKey(task);
      view.clearTimeout(readingTimers.get(key)); readingTimers.delete(key);
      const card = cardForTask(task.id);
      if (card) updateGroupControls(card, getTask(card.selectedId) || card.group.root);
      return true;
    }
    function syncResultFeedback() {
      if (disposed) return;
      if (document.visibilityState === "hidden") clearResultHighlight();
      const candidates = [...unreadResults].filter(([, entry]) => entry.scope === scopeKey);
      let outside = 0;
      const reading = new Set();
      for (const [key, entry] of candidates) {
        const card = cardForTask(entry.id);
        if (!card) continue;
        if (!selectedVisible(card, entry.id)) { outside++; continue; }
        reading.add(key);
        if (!readingTimers.has(key)) readingTimers.set(key, view.setTimeout(() => {
          readingTimers.delete(key);
          if (entry.scope === scopeKey && selectedVisible(cardForTask(entry.id), entry.id)) acknowledge(getTask(entry.id));
          syncResultFeedback();
        }, 900));
      }
      for (const [key, timer] of readingTimers) if (!reading.has(key)) { view.clearTimeout(timer); readingTimers.delete(key); }
      const label = `${outside} 个新结果 · 查看`;
      if (notice.textContent !== label) notice.textContent = label;
      notice.hidden = outside === 0;
      for (const card of cards.values()) {
        const output = card.element.querySelector(".generation-record-output");
        const selected = getTask(card.selectedId);
        const unread = isUnread(selected);
        setUnread(output, unread);
        let marker = output.querySelector(".generation-record-media-new");
        if (unread && !marker) {
          marker = document.createElement("span"); marker.className = "generation-record-media-new";
          marker.textContent = "新"; marker.setAttribute("aria-label", "新生成的结果"); output.append(marker);
        } else if (!unread) marker?.remove();
        const trigger = card.element.querySelector('[data-record-popover="versions"]');
        const hasNewFinal = card.group.finals.some(isUnread);
        setUnread(trigger, hasNewFinal);
        const triggerLabel = `${trigger.querySelector(".generation-record-version-count").textContent}，查看样片与正片版本${hasNewFinal ? "，含新结果" : ""}`;
        if (trigger.getAttribute("aria-label") !== triggerLabel) trigger.setAttribute("aria-label", triggerLabel);
        for (const button of card.versionMenu.querySelectorAll("[data-record-version]")) {
          const fresh = isUnread(getTask(button.dataset.recordVersion));
          setUnread(button, fresh);
          const title = `${fresh ? "新生成，" : ""}查看${button.title}`;
          if (button.getAttribute("aria-label") !== title) button.setAttribute("aria-label", title);
        }
      }
    }
    function clearResultHighlight() {
      if (!highlight) return;
      view.clearTimeout(highlight.timer); highlight.element.classList.remove("is-result-highlighted"); highlight = null;
    }
    function highlightResult(card) {
      clearResultHighlight();
      const element = card.element.querySelector(".generation-record-output");
      element.classList.add("is-result-highlighted");
      highlight = { element, timer: view.setTimeout(clearResultHighlight, 1200) };
    }
    function cardForTask(id) {
      return cards.get(id) || [...cards.values()].find((card) => card.group?.finals.some((task) => task.id === id));
    }
    function inScope(task) { return task && keyOf(task.scope) === scopeKey && keyOf(getScope()) === scopeKey; }
    function busy(task) { return task.status === "queued" || task.status === "running"; }
    function cancellable(task) {
      return busy(task) && (canCancel ? canCancel(task) : now() < Number(task.cancelUntil || 0));
    }
    function icon(name) {
      return global.REELAY_ICONS.markup(name, { "data-generation-icon": name });
    }
    function stageOf(task) {
      return task.input.generationStage || (global.REELAY_DRAFT_VIDEO?.isDraftInput(task.input) ? "draft" : "")
        || (task.result?.asset || task.result)?.generation?.stage || "";
    }
    function finalEligibility(task) {
      return global.REELAY_DRAFT_VIDEO?.getFinalEligibility(task.result?.asset || task.result,
        { projectId: getScope()?.projectId, now: now() }) || { eligible: false, reason: "此视频不支持生成成片" };
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
    function recordModelName(task, sourceTask) {
      const isFinal = stageOf(task) === "final";
      const input = isFinal
        ? task.input.sourceDraftAsset?.generation?.input || sourceTask?.input || task.input
        : task.input;
      const catalogName = global.REELAY_MODEL_DIRECTORY?.find((model) => model.id === input.modelId)?.name;
      return (isFinal && input === task.input ? catalogName : input.modelName) || catalogName || input.modelName || input.modelId || "生成任务";
    }
    function modelMarkup(task) {
      const name = recordModelName(task);
      return `<strong title="${escape(name)}">${escape(name)}</strong>`;
    }
    function finalSourceMarkup(task, details) {
      const source = task.input.sourceDraftAsset;
      const poster = sanitizeUrl(source?.posterUrl) || sanitizeUrl(source?.thumbnailUrl);
      const url = source?.type === "video" && sanitizeUrl(source.url);
      const preview = poster ? `<img src="${escape(poster)}" alt="" loading="lazy" decoding="async" draggable="false">`
        : url ? `<video src="${escape(url)}" muted playsinline preload="metadata" tabindex="-1" aria-hidden="true" draggable="false"></video>`
          : icon("square-play");
      const parameters = task.input.parameters || {};
      const duration = parameters.duration === -1 ? "智能时长" : Number.isFinite(parameters.duration) ? `${parameters.duration}s` : parameters.duration;
      const summary = [duration, parameters.aspect, parameters.quality, parameters.outputFormat].filter(Boolean).map((value) => String(value).replace(/p$/i, "P").replace(/^(mp4|mov)$/i, (format) => format.toUpperCase()));
      return `<div class="generation-record-final-source"><span class="generation-record-source-pill"><span class="generation-record-source-thumbnail" role="img" aria-label="来源样片">${preview}</span><strong>正片生成</strong></span>
        <div class="generation-record-parameters">${modelMarkup(task)}${summary.map((item) => `<span class="generation-record-parameter">${escape(item)}</span>`).join("")}${details}</div></div>`;
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
      closeInlinePreview();
      hoverPaused.delete(popover);
      referencePreview.close();
      view.clearTimeout(showTimer); view.clearTimeout(hideTimer); showTimer = 0; hideTimer = 0;
      if (active?.gallery) settleReferenceTransition(active.gallery);
      if (active?.kind === "menu") {
        const reveal = cardForTask(active.taskId)?.element.querySelector("[data-record-delete-reveal]");
        if (reveal) { reveal.hidden = true; reveal.inert = true; }
      }
      active?.anchor?.setAttribute("aria-expanded", "false");
      active?.anchor?.removeAttribute("aria-controls");
      active = null; releaseMedia(popover); popover.replaceChildren(); popover.remove();
    }
    function makeCard(task) {
      const article = document.createElement("article");
      article.className = "generation-record"; article.dataset.generationTaskId = task.id;
      const isFinal = stageOf(task) === "final";
      const entries = isFinal ? [] : references(task.input);
      const counts = Object.keys(TYPES).map((type) => ({ type, count: entries.filter((entry) => entry.mediaType === type).length })).filter((item) => item.count);
      const title = counts.map(({ type, count }) => `${count} 个${TYPES[type]}`).join("、");
      const cover = entries.find((entry) => entry.mediaType === "image") || entries[0];
      const details = `<button type="button" class="generation-record-details-trigger" data-record-popover="details" aria-expanded="false" aria-label="任务详情"><span class="generation-record-details-label">任务详情</span>${icon("info")}</button>`;
      article.innerHTML = `<div class="generation-record-surface">${isFinal ? finalSourceMarkup(task, details) : `<div class="generation-record-input${entries.length ? " has-references" : ""}">
        ${entries.length ? `<button type="button" class="generation-record-references" data-record-popover="references" aria-expanded="false" aria-label="参考素材：${escape(title)}">
          <span class="generation-record-cover">${thumbnail(cover)}</span>
          <span class="generation-record-counts">${counts.map(({ type, count }) => `<span title="${count} 个${TYPES[type]}">${icon(ICONS[type])}<span>${count}</span></span>`).join("")}</span>
        </button>` : ""}
        <div class="generation-record-copy"><div class="generation-record-prompt" data-record-popover="prompt" tabindex="0" role="button" aria-label="查看完整提示词" aria-expanded="false">${promptMarkup(task.input)}</div>
        <div class="generation-record-parameters">${modelMarkup(task)}${parameterItems(task.input).map((item) => `<span class="generation-record-parameter">${escape(item)}</span>`).join("")}${details}</div>
      </div></div>`}</div>
      <div class="generation-record-media-layout"><div class="generation-record-output" tabindex="-1" aria-label="生成结果"></div>
      <div class="generation-record-versions" hidden><button type="button" class="generation-record-version-trigger" data-record-popover="versions" aria-haspopup="dialog" aria-expanded="false"><span class="generation-record-version-stack" aria-hidden="true"><span class="generation-record-version-cover"></span></span><span class="generation-record-version-count"></span></button></div></div>
      <div class="generation-record-final-state" hidden></div>
      <footer class="generation-record-footer">
        <div class="generation-record-actions">
          <button type="button" data-generation-action="final" hidden>${icon("check")}生成正片</button>
          <button type="button" data-generation-action="edit">${icon("square-pen")}重新编辑</button>
          <span class="generation-record-terminal-actions"><button type="button" data-generation-action="again">${icon("rotate-ccw")}再次生成</button><button type="button" data-generation-action="locate" class="generation-record-icon-action" aria-label="定位画布中的生成结果" title="定位生成结果" hidden>${icon("locate-fixed")}</button><button type="button" data-record-popover="menu" class="generation-record-more" aria-label="更多操作" aria-expanded="false">${icon("ellipsis")}</button><span data-record-delete-reveal hidden inert><button type="button" data-generation-action="remove">${icon("trash-2")}<span>删除此记录</span></button></span></span>
        </div></footer>`;
      list.append(article);
      const sourcePreview = article.querySelector(".generation-record-source-thumbnail :is(img, video)");
      if (sourcePreview) {
        if (sourcePreview.tagName === "VIDEO") sourcePreview.muted = true;
        sourcePreview.addEventListener("error", () => {
          const cover = sourcePreview.parentElement;
          if (!cover) return;
          releaseMedia(cover); cover.innerHTML = icon("square-play");
        }, { once: true });
      }
      const card = { taskId: task.id, element: article, entries, signature: "", input: task.input, start: 0, pageSize: 0,
        versionMenu: document.createElement("div") };
      card.versionMenu.className = "generation-record-version-options";
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
      const stage = stageOf(task);
      const edit = article.querySelector('[data-generation-action="edit"]');
      edit.hidden = stage === "final";
      const draftAction = article.querySelector('[data-generation-action="final"]');
      draftAction.hidden = stage !== "draft" || task.status !== "succeeded";
      if (!draftAction.hidden) {
        const eligibility = finalEligibility(task);
        draftAction.disabled = !eligibility.eligible;
        draftAction.title = eligibility.eligible ? "生成 1080P 正片" : eligibility.reason;
        draftAction.setAttribute("aria-description", draftAction.title);
      }
      const resultAsset = task.result?.asset || task.result || {};
      const signature = JSON.stringify([busy(task) ? "active" : task.status, task.error, task.refunded, task.id, resultAsset.id, resultAsset.url, resultAsset.type, resultAsset.generation, task.input.parameters]);
      const output = article.querySelector(".generation-record-output");
      let changed = false;
      if (signature !== card.signature) {
        const sameMedia = task.status === "succeeded" && output.querySelector(".generation-record-result")
          && output.dataset.generationTaskId === task.id && output.dataset.resultUrl === resultAsset.url && output.dataset.resultType === resultAsset.type;
        if (!sameMedia) {
          releaseMedia(output); output.replaceChildren();
          delete output.dataset.resultUrl; delete output.dataset.resultType;
          if (busy(task)) {
            output.innerHTML = `<div class="generation-record-wait">${global.REELAY_GENERATION_STATUS.render({ progress: task.progress, canCancel: cancellable(task) })}</div>`;
            const aspect = String(task.input.parameters?.aspect || "16:9").split(":").map(Number);
            setMediaAspect(output.firstElementChild, aspect[0] / aspect[1]);
          } else if (task.status === "succeeded") {
            const asset = resultAsset;
            const result = document.createElement("div"); result.className = `generation-record-result is-${asset.type || "image"}`;
            const media = mediaElement(asset, asset.name || "生成结果", "generation-record-media");
            const onDimensions = () => setMediaAspect(result,
              (media.naturalWidth || media.videoWidth) / (media.naturalHeight || media.videoHeight));
            media.addEventListener(asset.type === "video" ? "loadedmetadata" : "load", onDimensions, { once: true });
            if (asset.type === "image") { media.dataset.recordPopover = "result"; media.tabIndex = 0; media.setAttribute("role", "button"); media.setAttribute("aria-label", "放大预览生成结果"); }
            result.append(media);
            output.append(result);
            setMediaAspect(result, Number(asset.width) / Number(asset.height) || Number(asset.aspectRatio));
            if (asset.type === "video" && media.tagName === "VIDEO") {
              const player = global.REELAY_GENERATION_MEDIA?.mount({ document, container: result, video: media, asset });
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
        output.dataset.generationTaskId = task.id;
        card.signature = signature; changed = true;
      }
      article.querySelector(".generation-record-terminal-actions").hidden = busy(task);
      const cancel = article.querySelector('[data-cancel-generation]');
      const cancelFocused = cancel && document.activeElement === cancel;
      if (busy(task)) global.REELAY_GENERATION_STATUS.update(output, { progress: task.progress, canCancel: cancellable(task) });
      if (cancel?.disabled && cancelFocused) {
        if (!edit.hidden) edit.focus({ preventScroll: true });
        else article.querySelector('[data-record-popover="details"]').focus({ preventScroll: true });
      }
      const locate = article.querySelector('[data-generation-action="locate"]');
      locate.hidden = task.status !== "succeeded";
      locate.setAttribute("aria-disabled", String(!task.addedNodeId));
      locate.title = task.addedNodeId ? "定位生成结果" : task.isPreview ? "演示记录暂无画布节点" : "生成结果尚未放入画布";
      locate.setAttribute("aria-label", task.addedNodeId ? "定位画布中的生成结果" : `定位生成结果：${locate.title}`);
      return changed;
    }
    function updateGroupSelection(card) {
      const successes = card.group.finals.filter((task) => task.status === "succeeded");
      const latest = successes.at(-1);
      const previous = card.successIds;
      card.successIds = new Set(successes.map((task) => task.id));
      if (!previous) { card.selectedId = latest?.id || card.taskId; return; }
      if (!card.successIds.has(card.selectedId) && card.selectedId !== card.taskId) card.selectedId = card.taskId;
      const completed = latest && !previous.has(latest.id);
      if (completed) {
        const media = card.element.querySelector(".generation-record-output video");
        const reading = card.element.querySelector(".generation-record-output").contains(document.activeElement)
          || card.element.querySelector(".generation-record-versions").contains(document.activeElement)
          || (active?.kind === "versions" && active.taskId === card.taskId);
        if (mediaVisible(card) && !reading && (!media || media.paused || media.ended)) {
          card.selectedId = latest.id;
        }
      }
    }
    function updateGroupControls(card, selected) {
      const { root, finals } = card.group;
      const article = card.element;
      const successes = finals.filter((task) => task.status === "succeeded");
      const latest = finals.at(-1);
      const pending = finals.find(busy);
      const eligibility = finals.length ? finalEligibility(root) : null;
      const versions = article.querySelector(".generation-record-versions");
      const formatOf = (task) => String(task.input.parameters?.outputFormat || (task.result?.asset || task.result)?.generation?.outputFormat || "MP4").toUpperCase();
      const format = formatOf(selected);
      versions.hidden = !successes.length;
      const trigger = versions.querySelector("button");
      const count = `正片 ×${successes.length}`;
      const countLabel = trigger.querySelector(".generation-record-version-count");
      if (countLabel.textContent !== count) countLabel.textContent = count;
      trigger.setAttribute("aria-label", `${count}，查看样片与正片版本`);
      trigger.title = "查看生成版本";
      const coverAsset = successes.at(-1)?.result;
      const asset = coverAsset?.asset || coverAsset;
      const coverUrl = sanitizeUrl(asset?.posterUrl || asset?.thumbnailUrl);
      if (card.versionCover !== coverUrl) {
        const cover = trigger.querySelector(".generation-record-version-cover");
        cover.innerHTML = coverUrl
          ? `<img src="${escape(coverUrl)}" alt="" loading="lazy" decoding="async" draggable="false">` : icon("square-play");
        cover.querySelector("img")?.addEventListener("error", () => { cover.innerHTML = icon("square-play"); }, { once: true });
        card.versionCover = coverUrl;
      }
      const available = successes.length ? [root, ...successes] : [];
      const buttons = new Map([...card.versionMenu.querySelectorAll("[data-record-version]")].map((button) => [button.dataset.recordVersion, button]));
      const availableIds = new Set(available.map((task) => task.id));
      for (const [id, button] of buttons) if (!availableIds.has(id)) button.remove();
      for (const [index, task] of available.entries()) {
        let button = buttons.get(task.id);
        if (!button) {
          button = document.createElement("button"); button.type = "button";
          button.dataset.recordVersion = task.id;
          button.innerHTML = `<span class="generation-record-version-label"></span><span class="generation-record-version-spec"></span>${icon("check")}`;
          card.versionMenu.append(button);
        }
        const label = index === 0 ? "样片" : `正片 ${index}`;
        const labelElement = button.querySelector(".generation-record-version-label");
        if (labelElement.textContent !== label) labelElement.textContent = label;
        const specification = `${index === 0 ? "480P" : "1080P"} · ${formatOf(task)}`;
        const specElement = button.querySelector(".generation-record-version-spec");
        if (specElement.textContent !== specification) specElement.textContent = specification;
        button.setAttribute("aria-pressed", String(task.id === selected.id));
        button.title = `${label} · ${index === 0 ? "480P" : "1080P"} · ${formatOf(task)}`;
        button.setAttribute("aria-label", `查看${button.title}`);
      }
      article.querySelector(".generation-record-footer").dataset.generationTaskId = selected.id;
      article.querySelector('[data-record-popover="details"]').dataset.generationTaskId = selected.id;
      if (finals.length && card.parameterTaskId !== selected.id) {
        const parameters = article.querySelector(".generation-record-parameters");
        const details = parameters.querySelector('[data-record-popover="details"]');
        const name = parameters.querySelector("strong");
        name.textContent = recordModelName(selected, root);
        name.title = name.textContent;
        let operation = parameters.querySelector(".generation-record-operation");
        if (!operation && stageOf(selected) === "final") {
          operation = document.createElement("span"); operation.className = "generation-record-operation";
          operation.textContent = "正片生成"; name.before(operation);
        }
        if (operation) operation.hidden = stageOf(selected) !== "final";
        for (const parameter of parameters.querySelectorAll(".generation-record-parameter")) parameter.remove();
        const values = selected.input.parameters || {};
        const summary = parameterItems(selected.input);
        const items = stageOf(selected) === "final"
          ? [values.aspect, "1080P", values.duration === -1 ? "智能时长" : values.duration, format].filter(Boolean)
          : [...summary.filter((item) => !/^(mp4|mov)$/i.test(item)), format];
        for (const value of items) {
          const parameter = document.createElement("span"); parameter.className = "generation-record-parameter";
          parameter.textContent = String(value); details.before(parameter);
        }
        card.parameterTaskId = selected.id;
      }
      article.querySelector('[data-generation-action="remove"]').dataset.generationTaskId = root.id;
      article.querySelector('[data-record-popover="menu"]').dataset.generationTaskId = root.id;
      if (finals.length) {
        article.querySelector('[data-generation-action="final"]').hidden = selected.id !== root.id || Boolean(pending);
        article.querySelector('.generation-record-footer [data-generation-action="again"]').hidden = Boolean(pending);
        const again = article.querySelector('.generation-record-footer [data-generation-action="again"]');
        again.disabled = selected.id !== root.id && !eligibility.eligible;
        again.title = again.disabled ? eligibility.reason : "";
      }
      article.querySelector('[data-record-popover="menu"]').disabled = !global.REELAY_GENERATION_RECORD_GROUPS.canRemove(card.group);
      const state = article.querySelector(".generation-record-final-state");
      const attempt = pending || (latest && latest.status !== "succeeded" ? latest : null);
      const ready = successes.find((task) => task.id !== selected.id && isUnread(task));
      const stateKey = attempt ? `${attempt.id}:${busy(attempt) ? "active" : attempt.status}:${attempt.error?.message || attempt.error || ""}:${attempt.refunded}` : ready ? `ready:${ready.id}` : "";
      state.hidden = !stateKey;
      const stateFocused = state.contains(document.activeElement);
      if (card.finalStateKey !== stateKey) {
        state.removeAttribute("data-generation-task-id");
        if (attempt) {
          state.dataset.generationTaskId = attempt.id;
          state.innerHTML = `<span class="generation-record-final-label">正片 1080P</span>${busy(attempt) ? global.REELAY_GENERATION_STATUS.render({ progress: attempt.progress, canCancel: cancellable(attempt) }) : `<span class="generation-record-final-outcome" role="status">${attempt.status === "failed" ? "生成失败" : "已取消"}${attempt.refunded ? " · 积分已返还" : ""}</span><button type="button" data-generation-action="again">重试</button>`}`;
          if (!busy(attempt) && attempt.error) {
            const reason = String(attempt.error.message || attempt.error);
            const outcome = state.querySelector(".generation-record-final-outcome");
            outcome.textContent += ` · ${reason}`; outcome.title = reason;
          }
        } else state.innerHTML = ready ? `<span role="status">正片已就绪</span><button type="button" class="generation-record-final-ready" data-record-version="${escape(ready.id)}">查看</button>` : "";
        card.finalStateKey = stateKey;
      }
      const retry = state.querySelector('[data-generation-action="again"]');
      if (retry) {
        retry.disabled = !eligibility.eligible;
        retry.title = retry.disabled ? eligibility.reason : "重新生成正片";
        retry.setAttribute("aria-description", retry.title);
      }
      if (stateFocused && (!state.contains(document.activeElement) || document.activeElement.disabled)) {
        (state.querySelector("button:not(:disabled)") || article.querySelector('[data-record-popover="details"]'))?.focus({ preventScroll: true });
      }
      if (pending) {
        const cancel = state.querySelector('[data-cancel-generation]');
        const focused = cancel === document.activeElement;
        global.REELAY_GENERATION_STATUS.update(state, { progress: pending.progress, canCancel: cancellable(pending) });
        if (focused && cancel.disabled) article.querySelector('[data-record-popover="details"]').focus({ preventScroll: true });
      }
    }
    function chooseVersion(target, id) {
      const fromMenu = popover.contains(target) && active?.kind === "versions";
      const rootId = fromMenu ? active.taskId : target.closest(".generation-record")?.dataset.generationTaskId;
      const card = cards.get(rootId);
      if (!card || !inScope(card.group.root)) return;
      const selected = id === rootId ? card.group.root : card.group.finals.find((task) => task.id === id && task.status === "succeeded");
      if (!selected) return;
      if (card.selectedId === id) {
        if (acknowledge(selected)) { syncResultFeedback(); highlightResult(card); }
        if (fromMenu) closeAndRestoreFocus(); return;
      }
      const versionTrigger = card.element.querySelector('[data-record-popover="versions"]');
      const restoreFocus = document.activeElement === target;
      const fresh = isUnread(selected);
      dismiss(); card.selectedId = id;
      acknowledge(selected);
      // Browsing versions is a local view change, not a task/list update.
      // In particular it must not invoke the list's follow-bottom policy.
      updateCard(card, selected);
      updateGroupControls(card, selected);
      refreshIcons(card.element);
      syncResultFeedback();
      if (fresh) highlightResult(card);
      if (fromMenu || (restoreFocus && !target.isConnected)) versionTrigger.focus({ preventScroll: true });
    }
    function setMediaAspect(element, ratio) {
      const aspect = Number.isFinite(ratio) && ratio > 0 ? ratio : 16 / 9;
      element.style.setProperty("--generation-media-aspect", String(aspect));
      element.closest(".generation-record-media-layout")?.style.setProperty("--generation-media-aspect", String(aspect));
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
        if (scopeKey) {
          scrollPositions.set(scopeKey, container.scrollTop);
          hoverPaused.set(list, now());
        }
        clearResultHighlight();
        dismiss(); releaseMedia(list); cards.clear(); list.replaceChildren(); scopeKey = nextScope;
      }
      if (list.parentNode !== container) { container.replaceChildren(list, noticeSlot); }
      const tasks = scopeKey ? (getTasks() || []).filter(inScope) : [];
      view.clearTimeout(expiryTimer); expiryTimer = 0;
      const expiries = tasks.filter((task) => task.status === "succeeded" && stageOf(task) === "draft")
        .map((task) => finalEligibility(task).expiresAt).filter((at) => at > now());
      if (expiries.length) expiryTimer = view.setTimeout(() => render(), Math.min(2147483647, Math.min(...expiries) - now() + 1));
      const groups = global.REELAY_GENERATION_RECORD_GROUPS.groupTasks(tasks);
      const ids = new Set(tasks.map((task) => task.id));
      for (const [key, entry] of observedTasks) if (entry.scope === scopeKey && !ids.has(entry.id)) { observedTasks.delete(key); unreadResults.delete(key); }
      for (const task of tasks) observeTask(task);
      const roots = new Set(groups.map((group) => group.root.id));
      for (const [id, card] of cards) {
        if (!roots.has(id)) { releaseMedia(card.element); card.element.remove(); cards.delete(id); }
      }
      for (const group of groups) {
        const task = group.root;
        const card = cards.get(task.id) || makeCard(task);
        card.group = group;
        updateGroupSelection(card);
        const selected = group.finals.find((item) => item.id === card.selectedId) || task;
        updateCard(card, selected);
        updateGroupControls(card, selected);
        fillReferences(card);
      }
      if (!tasks.length) {
        if (!list.querySelector(".generation-record-empty")) {
          const empty = document.createElement("div"); empty.className = "generation-record-empty";
          empty.textContent = "描述你的创意，生成结果会留在这里"; list.append(empty);
        }
      } else list.querySelector(".generation-record-empty")?.remove();
      if (forceBottom || (!switched && wasBottom)) container.scrollTop = container.scrollHeight;
      else if (switched) container.scrollTop = scrollPositions.get(scopeKey) ?? container.scrollHeight;
      else if (anchor?.element.isConnected) container.scrollTop += anchor.element.getBoundingClientRect().top - anchor.top;
      syncResultFeedback();
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
      const minimumTile = sparse ? 112 : 64; const gap = 8;
      // Full pages share the message width; short galleries remain content-sized.
      const contentWidth = Math.max(0, width - 26);
      const size = Math.max(1, Math.min(10, Math.floor((contentWidth + gap) / (minimumTile + gap))));
      const tile = !sparse && card.entries.length >= size
        ? Math.min(80, Math.max(minimumTile, (contentWidth - (size - 1) * gap) / size)) : minimumTile;
      return { size, tile, gap, sparse };
    }
    function settleReferenceTransition(gallery) {
      for (const animation of gallery.animations || []) { animation.onfinish = null; animation.cancel(); }
      gallery.animations = [];
      if (gallery.outgoing) { releaseMedia(gallery.outgoing); gallery.outgoing.remove(); gallery.outgoing = null; }
    }
    function fillReferences(card, force = false, direction = 0) {
      const { size, tile, gap, sparse } = referenceLayout(card); const total = card.entries.length;
      if (!force && size === card.pageSize && tile === card.referenceTileSize) return;
      const previousStart = Math.max(0, Math.min(card.start || 0, Math.max(0, total - 1)));
      // Reflow onto the page containing the previous leading item. Once every
      // reference fits, the first page is the only valid, reachable position.
      card.start = total <= size ? 0 : Math.floor(previousStart / size) * size;
      card.pageSize = size; card.referenceTileSize = tile;
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
        rail.innerHTML = `<div class="generation-record-reference-viewport" tabindex="-1"></div>`;
        gallery = active.gallery = { rail, viewport: rail.querySelector(".generation-record-reference-viewport"),
          previous: popover.querySelector('[data-reference-page="-1"]'), next: popover.querySelector('[data-reference-page="1"]'), animations: [] };
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
      }
      popover.querySelector(".generation-record-reference-navigation").hidden = !paged;
      const page = document.createElement("div"); page.className = "generation-record-reference-page";
      page.innerHTML = visible.map((entry, index) => `<button type="button" class="generation-record-reference-item" data-record-popover="reference" data-reference-preview="${card.start + index}" aria-expanded="false" aria-label="${escape(`${entry.label}：${entry.name}，预览`)}"><span>${thumbnail(entry)}<small>${escape(entry.label)}</small></span></button>`).join("");
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
      syncResultFeedback();
      positionPopover();
    }
    function positionPopover() {
      positionSurface(popover, active);
      if (inlineActive) positionSurface(inlinePopover, inlineActive);
    }
    function positionSurface(surface, state) {
      if (!state || !state.anchor.isConnected || !inScope(getTask(state.taskId))) return state && (surface === inlinePopover ? closeInlinePreview() : dismiss());
      const anchorRect = state.anchor.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const listRect = list.getBoundingClientRect();
      if (anchorRect.bottom < containerRect.top || anchorRect.top > containerRect.bottom) return surface === inlinePopover ? closeInlinePreview() : dismiss();
      if (state.kind === "menu") return;
      const maxWidth = Math.max(120, Math.min(listRect.width || 340, view.innerWidth - 24));
      surface.style.maxWidth = `${maxWidth}px`;
      surface.style.maxHeight = `${Math.max(80, Math.min(state.kind === "versions" ? 360 : Infinity, view.innerHeight - 32))}px`;
      surface.style.setProperty("--generation-prompt-width", `${maxWidth}px`);
      const floating = surface.getBoundingClientRect();
      const isMenu = state.kind === "details" || state.kind === "versions";
      const isReference = state.kind === "reference";
      const anchor = isMenu || isReference ? anchorRect : {
        left: listRect.left, right: listRect.right, width: listRect.width,
        top: anchorRect.top, bottom: anchorRect.bottom, height: anchorRect.height,
      };
      const boundary = {
        left: isReference ? Math.max(0, listRect.left - 12) : 0,
        right: isReference ? Math.min(view.innerWidth, listRect.right + 12) : view.innerWidth,
        top: 0, bottom: view.innerHeight,
      };
      const placement = placeAnchoredPopover?.({ anchor, floating,
        boundary,
        placements: isMenu ? ["top-end", "bottom-end"] : isReference ? ["top", "bottom"] : ["top-start", "bottom-start"], gap: 7, padding: 12,
      });
      surface.style.left = `${placement?.left ?? Math.max(12, Math.min(anchor.left, view.innerWidth - floating.width - 12))}px`;
      surface.style.top = `${placement?.top ?? Math.max(12, anchor.top - floating.height - 7)}px`;
      surface.dataset.placement = placement?.placement || "top-start";
    }
    function open(kind, anchor, task, pinned = false, referenceKey = "") {
      if (!task || !inScope(task)) return;
      if (kind === "prompt" && anchor.scrollHeight <= anchor.clientHeight + 1) return;
      const entries = kind === "reference" ? cardForTask(task.id)?.entries || [] : [];
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
        if (!global.REELAY_GENERATION_RECORD_GROUPS.canRemove(cardForTask(task.id)?.group)) return dismiss();
        const reveal = cardForTask(task.id).element.querySelector("[data-record-delete-reveal]");
        reveal.hidden = false; reveal.inert = false;
        anchor.setAttribute("aria-controls", reveal.id);
        return;
      }
      popover.className = `generation-record-popover generation-record-${kind}-popover`;
      popover.setAttribute("role", "dialog");
      if (kind === "references") {
        const card = cardForTask(task.id);
        if (!card.entries.length) return dismiss();
        popover.setAttribute("aria-label", "参考素材");
        popover.innerHTML = `<div class="generation-record-popover-title"><span>参考素材 <span class="generation-record-reference-total">(${card.entries.length})</span></span><div class="generation-record-reference-navigation" role="group" aria-label="参考素材翻页"><button type="button" class="generation-record-page-button" data-reference-page="-1" aria-label="上一页素材">${icon("chevron-left")}</button><button type="button" class="generation-record-page-button" data-reference-page="1" aria-label="下一页素材">${icon("chevron-right")}</button></div></div><div class="generation-record-reference-rail"></div>`;
        fillReferences(card, true);
      } else if (kind === "reference") {
        showMedia(entry.asset, `${entry.label} · ${entry.name}`);
      } else if (kind === "prompt") {
        popover.setAttribute("aria-label", "完整提示词");
        popover.innerHTML = `<div class="generation-record-popover-title">提示词<button type="button" data-record-close aria-label="关闭完整提示词">${icon("x")}</button></div><div class="generation-record-full-prompt" tabindex="0">${promptMarkup(task.input)}</div>`;
      } else if (kind === "details") {
        popover.setAttribute("aria-label", "任务详情");
        fillDetails(task);
      } else if (kind === "versions") {
        const card = cards.get(task.id);
        if (!card || card.element.querySelector(".generation-record-versions").hidden) return dismiss();
        popover.setAttribute("aria-label", "生成版本");
        popover.append(card.versionMenu);
      } else if (kind === "result") {
        showMedia(task.result?.asset || task.result, "生成结果");
      }
      document.body.append(popover); refreshIcons(popover); positionPopover();
    }
    function showMedia(asset, label) {
      if (active) fillMedia(popover, asset, label, active.kind === "reference");
    }
    function fillMedia(surface, asset, label, reference = true) {
      releaseMedia(surface); surface.replaceChildren();
      surface.className = "generation-record-popover generation-record-preview-popover";
      if (surface === inlinePopover) surface.classList.add("generation-record-inline-preview");
      surface.setAttribute("role", "dialog"); surface.setAttribute("aria-label", `${label}预览`);
      const media = mediaElement(asset, label, "generation-record-preview-media");
      const imageOnly = media.tagName === "IMG" && reference;
      surface.classList.toggle("reference-image-preview", imageOnly);
      surface.classList.toggle("generation-record-reference-media-preview", reference);
      if (!reference) {
        const title = document.createElement("div"); title.className = "generation-record-popover-title";
        title.innerHTML = `<span>${escape(label)}</span><button type="button" data-record-close aria-label="关闭预览">${icon("x")}</button>`;
        surface.append(title);
      }
      surface.append(media);
      if (media.tagName === "IMG") media.addEventListener("load", () => {
        if (surface.contains(media)) positionPopover();
      }, { once: true });
      refreshIcons(surface); positionPopover();
    }
    function closeInlinePreview(restoreFocus = false) {
      view.clearTimeout(inlineHideTimer); inlineHideTimer = 0;
      const anchor = inlineActive?.anchor;
      inlineActive = null;
      anchor?.setAttribute("aria-expanded", "false"); anchor?.removeAttribute("aria-controls");
      releaseMedia(inlinePopover); inlinePopover.replaceChildren(); inlinePopover.remove();
      if (restoreFocus && anchor?.isConnected) {
        restoringFocus = true;
        try { anchor.focus({ preventScroll: true }); } finally { restoringFocus = false; }
      }
    }
    function openInlinePreview(anchor, pinned = false) {
      if (active?.kind !== "prompt" || !popover.contains(anchor) || !inScope(getTask(active.taskId))) return;
      view.clearTimeout(showTimer); view.clearTimeout(hideTimer); view.clearTimeout(inlineHideTimer);
      if (inlineActive?.anchor === anchor) { inlineActive.pinned ||= pinned; return; }
      const entry = cardForTask(active.taskId)?.entries.find((item) => item.key === anchor.dataset.referenceKey);
      if (!entry || anchor.classList.contains("is-missing")) return;
      closeInlinePreview();
      inlineActive = { kind: "reference", anchor, taskId: active.taskId, pinned };
      anchor.setAttribute("aria-expanded", "true"); anchor.setAttribute("aria-controls", inlinePopover.id);
      fillMedia(inlinePopover, entry.asset, `${entry.label} · ${entry.name}`);
      document.body.append(inlinePopover); positionPopover();
    }
    function scheduleInlineHide() {
      view.clearTimeout(inlineHideTimer);
      if (inlineActive && !inlineActive.pinned) inlineHideTimer = view.setTimeout(() => {
        if (!inlinePopover.contains(document.activeElement) && !inlineActive?.anchor.contains(document.activeElement)) closeInlinePreview();
      }, 210);
    }
    function inlineEnter() { view.clearTimeout(hideTimer); view.clearTimeout(inlineHideTimer); }
    function inlineLeave(event) {
      if (inlinePopover.contains(event.relatedTarget) || inlineActive?.anchor.contains(event.relatedTarget)) return;
      scheduleInlineHide();
      if (!popover.contains(event.relatedTarget)) scheduleHide();
    }
    function inlineClick(event) {
      event.stopPropagation();
      if (event.target.closest("[data-record-close]")) closeInlinePreview(true);
      else if (inlineActive) { inlineActive.pinned = true; pinPopover(); }
    }
    function fillDetails(task) {
      const finishedAt = task.finishedAt ?? task.completedAt;
      const group = cardForTask(task.id)?.group;
      const attempts = group?.finals.length ? [group.root, ...group.finals] : [];
      const signature = JSON.stringify([task.id, task.status, finishedAt, task.refunded, attempts.map((item) => [item.id, item.status, item.refunded])]);
      if (active.detailsSignature === signature) return;
      active.detailsSignature = signature;
      const focused = popover.contains(document.activeElement) ? document.activeElement : null;
      const copyFocused = focused?.matches('[data-generation-action="feedback"]');
      const closeFocused = focused?.matches("[data-record-close]");
      const historyFocused = focused?.dataset.recordHistoryTask;
      popover.innerHTML = `<div class="generation-record-popover-title">任务详情<button type="button" data-record-close aria-label="关闭任务详情">${icon("x")}</button></div><dl><dt>发送时间</dt><dd>${escape(formatTime(task.createdAt, true))}</dd>${finishedAt != null ? `<dt>${task.status === "canceled" ? "取消时间" : "完成时间"}</dt><dd>${escape(formatTime(finishedAt, true))}</dd><dt>耗时</dt><dd>${Math.max(0, Math.round((finishedAt - task.createdAt) / 1000))} 秒</dd>` : ""}<dt>本次消耗</dt><dd>${escape(task.input.cost ?? 0)} 积分${task.refunded ? " · 已返还" : ""}</dd><dt>TaskId</dt><dd class="generation-record-task-id"><code>${escape(task.id)}</code><button type="button" data-generation-action="feedback" aria-label="复制 TaskId" title="复制任务编号">${icon("copy")}</button></dd></dl>`;
      if (attempts.length) {
        popover.insertAdjacentHTML("beforeend", `<div class="generation-record-task-history"><strong>生成历史</strong><ol>${attempts.map((item) => `<li class="generation-record-task-attempt"><button type="button" data-record-history-task="${escape(item.id)}" aria-pressed="${item.id === task.id}">${item.id === group.root.id ? "样片" : "正片"} · ${escape(String(item.input.parameters?.outputFormat || "MP4").toUpperCase())} · ${{queued:"生成中",running:"生成中",succeeded:"已完成",failed:"失败",canceled:"已取消"}[item.status] || escape(item.status)}</button><span>${escape(item.input.cost ?? 0)} 积分${item.refunded ? " · 已返还" : ""}</span></li>`).join("")}</ol></div>`);
      }
      refreshIcons(popover);
      if (copyFocused || closeFocused) popover.querySelector(copyFocused ? '[data-generation-action="feedback"]' : "[data-record-close]")?.focus({ preventScroll: true });
      else if (historyFocused) [...popover.querySelectorAll("[data-record-history-task]")].find((button) => button.dataset.recordHistoryTask === historyFocused)?.focus({ preventScroll: true });
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
        if (active === expected && !active.pinned && !inlinePopover.contains(document.activeElement) && !popover.contains(document.activeElement) && !active.anchor.contains(document.activeElement)) dismiss();
      }, 210);
    }
    function suspendHover(surface) {
      hoverPaused.set(surface, now());
      view.clearTimeout(showTimer); showTimer = 0;
      if (surface === popover) closeInlinePreview();
      else if (active && !active.pinned) dismiss();
    }
    function movePointer(event) {
      const previous = pointerPosition;
      pointerPosition = { x: event.clientX, y: event.clientY };
      if (!previous || event.pointerType === "touch" || (previous.x === event.clientX && previous.y === event.clientY)) return;
      const surface = list.contains(event.target) ? list : popover.contains(event.target) ? popover : null;
      const pausedAt = hoverPaused.get(surface);
      // Scroll-induced boundary events are not reading intent. Re-arm only on
      // actual movement after wheel/trackpad momentum has been quiet briefly.
      if (pausedAt === undefined || now() - pausedAt < 160) return;
      hoverPaused.delete(surface);
      hover(event);
    }
    function wheelReading(event) {
      if (event.ctrlKey || event.metaKey || (!event.deltaX && !event.deltaY)) return;
      if (container.contains(event.target)) suspendHover(list);
      else if (event.target.closest?.(".generation-record-full-prompt")) suspendHover(popover);
    }
    function hover(event) {
      if (!pointerPosition) pointerPosition = { x: event.clientX, y: event.clientY };
      const surface = popover.contains(event.target) ? popover : list;
      if (hoverPaused.has(surface)) return;
      const part = event.target.closest?.(".prompt-reference[data-reference-key]:not(.is-missing)");
      if (part && popover.contains(part) && active?.kind === "prompt") {
        if (part.contains(event.relatedTarget)) return;
        view.clearTimeout(hideTimer); view.clearTimeout(showTimer); view.clearTimeout(inlineHideTimer);
        showTimer = view.setTimeout(() => { showTimer = 0; openInlinePreview(part); }, 300);
        return;
      }
      if (active?.pinned) return;
      const anchor = event.target.closest?.('[data-record-popover="references"], [data-record-popover="prompt"], [data-record-popover="details"], .prompt-reference[data-reference-key]:not(.is-missing)');
      if (!anchor || !list.contains(anchor) || anchor.contains(event.relatedTarget)) return;
      view.clearTimeout(hideTimer); view.clearTimeout(showTimer);
      const kind = anchor.dataset.recordPopover || "reference";
      // Show the gallery during the entry's 160 ms scale feedback, while
      // retaining reading intent delay for prompt and inline-media previews.
      showTimer = view.setTimeout(() => { showTimer = 0; open(kind, anchor, taskAt(anchor)); }, kind === "references" ? 80 : 300);
    }
    function focusPreview(event) {
      if (restoringFocus) return;
      const part = event.target.closest?.(".prompt-reference[data-reference-key]:not(.is-missing)");
      if (part && popover.contains(part)) { openInlinePreview(part); return; }
      if (active?.pinned) return;
      const anchor = event.target.closest?.('[data-record-popover="references"], [data-record-popover="details"], .prompt-reference[data-reference-key]:not(.is-missing)');
      if (anchor) open(anchor.dataset.recordPopover || "reference", anchor, taskAt(anchor));
    }
    function blurPreview(event) {
      if (inlineActive && (inlineActive.anchor.contains(event.target) || inlinePopover.contains(event.target))) {
        if (inlineActive.anchor.contains(event.relatedTarget) || inlinePopover.contains(event.relatedTarget)) return;
        if (!inlineActive.pinned) closeInlinePreview();
      }
      if (active?.kind === "menu") {
        const reveal = cardForTask(active.taskId)?.element.querySelector("[data-record-delete-reveal]");
        if (!active.anchor.contains(event.relatedTarget) && !reveal?.contains(event.relatedTarget)) dismiss();
        return;
      }
      if (active?.kind === "versions" && !active.anchor.contains(event.relatedTarget) && !popover.contains(event.relatedTarget)) { dismiss(); return; }
      if (!active || active.pinned || active.anchor.contains(event.relatedTarget) || popover.contains(event.relatedTarget) || inlinePopover.contains(event.relatedTarget)) return;
      dismiss();
    }
    function closeAndRestoreFocus() {
      const anchor = active?.anchor;
      dismiss(); restoringFocus = true;
      try { anchor?.focus({ preventScroll: true }); }
      finally { restoringFocus = false; }
    }
    function leave(event) {
      const part = event.target.closest?.(".prompt-reference[data-reference-key]");
      if (part && popover.contains(part)) {
        if (part.contains(event.relatedTarget)) return;
        view.clearTimeout(showTimer);
        if (!inlinePopover.contains(event.relatedTarget)) scheduleInlineHide();
        return;
      }
      const anchor = event.target.closest?.("[data-record-popover], .prompt-reference[data-reference-key]");
      if (!anchor || !list.contains(anchor) || anchor.contains(event.relatedTarget)) return;
      view.clearTimeout(showTimer); scheduleHide();
    }
    function turnReferencePage(direction, focusNavigation = false) {
      const task = active?.kind === "references" && getTask(active.taskId);
      const card = task && inScope(task) && cardForTask(task.id);
      if (!card || referencePreview.isOpen()) return false;
      const start = card.start + direction * card.pageSize;
      if (start < 0 || start >= card.entries.length) return false;
      pinPopover(); card.start = start;
      fillReferences(card, true, direction); positionPopover();
      if (focusNavigation) {
        const next = popover.querySelector(`[data-reference-page="${direction}"]:not(:disabled)`)
          || popover.querySelector("[data-reference-page]:not(:disabled)");
        next?.focus({ preventScroll: true });
      }
      return true;
    }
    function wheelReferences(event) {
      if (active?.kind !== "references" || referencePreview.isOpen() || event.ctrlKey || event.metaKey) return;
      const card = cardForTask(active.taskId);
      if (!card || card.entries.length <= card.pageSize || !inScope(getTask(active.taskId))) return;
      const raw = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (!Number.isFinite(raw) || raw === 0) return;
      event.preventDefault(); event.stopPropagation(); pinPopover();
      const delta = raw * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? container.clientWidth : 1);
      const time = now(); const direction = Math.sign(delta);
      let wheel = active.wheel;
      if (!wheel || time - wheel.last > 160 || wheel.direction !== direction) {
        wheel = active.wheel = { total: 0, last: time, direction, turned: false };
      }
      wheel.last = time; wheel.total += Math.abs(delta);
      // One page per wheel gesture; trackpad momentum must not skip several pages.
      if (!wheel.turned && wheel.total >= 48) {
        wheel.turned = true; turnReferencePage(direction);
      }
    }
    function click(event) {
      const version = event.target.closest?.("[data-record-version]");
      if (version && (list.contains(version) || (popover.contains(version) && active?.kind === "versions"))) { event.preventDefault(); chooseVersion(version, version.dataset.recordVersion); return; }
      const history = event.target.closest?.("[data-record-history-task]");
      if (history && popover.contains(history)) {
        const task = getTask(history.dataset.recordHistoryTask);
        if (inScope(task)) {
          const focused = document.activeElement === history;
          active.taskId = task.id; active.detailsSignature = ""; fillDetails(task); positionPopover();
          if (focused) [...popover.querySelectorAll("[data-record-history-task]")].find((button) => button.dataset.recordHistoryTask === task.id)?.focus({ preventScroll: true });
        }
        return;
      }
      const task = taskAt(event.target);
      if (!task) return;
      const action = event.target.closest?.("[data-generation-action]");
      if (action && (list.contains(action) || popover.contains(action))) {
        const name = action.dataset.generationAction;
        if (action.disabled || action.hidden) return;
        if (name === "edit" && stageOf(task) === "final") return;
        if (name === "final" && (task.status !== "succeeded" || !finalEligibility(task).eligible)) return;
        if (name === "cancel" && !cancellable(task)) return;
        if (name === "again" && busy(task)) return;
        if (name === "remove" && (!global.REELAY_GENERATION_RECORD_GROUPS.canRemove(cardForTask(task.id)?.group) || action.closest("[data-record-delete-reveal]")?.hidden)) return;
        if (name === "locate" && (task.status !== "succeeded" || !task.addedNodeId)) return;
        event.preventDefault(); event.stopPropagation(); if (name === "remove") dismiss();
        onAction(name, task, event); return;
      }
      const page = event.target.closest?.("[data-reference-page]");
      if (page && !page.disabled && popover.contains(page) && active?.kind === "references") {
        event.preventDefault(); event.stopPropagation();
        turnReferencePage(Number(page.dataset.referencePage), true);
        return;
      }
      const tile = event.target.closest?.("[data-reference-preview]");
      if (tile && popover.contains(tile) && !tile.closest(".is-leaving")) {
        const card = cardForTask(task.id);
        const entry = card.entries[Number(tile.dataset.referencePreview)];
        if (entry) {
          event.preventDefault(); event.stopPropagation(); pinPopover();
          const expected = active;
          referencePreview.open({ asset: entry.asset, label: `${entry.label} · ${entry.name}`, trigger: tile,
            onClose() {
              if (active !== expected || !inScope(task)) return;
              positionPopover();
              const target = popover.querySelector(`[data-reference-preview="${Number(tile.dataset.referencePreview)}"]`)
                || popover.querySelector("[data-reference-preview]");
              target?.focus({ preventScroll: true });
            },
          });
        }
        return;
      }
      const part = event.target.closest?.(".prompt-reference[data-reference-key]");
      if (part) {
        const entry = cardForTask(task.id)?.entries.find((item) => item.key === part.dataset.referenceKey);
        if (entry) {
          if (popover.contains(part)) { openInlinePreview(part, true); pinPopover(); }
          else open("reference", part, task, true, part.dataset.referenceKey);
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
      click(event);
    }
    function pointerOutside(event) {
      if (referencePreview.isOpen()) return;
      if (inlinePopover.contains(event.target)) { if (inlineActive) inlineActive.pinned = true; pinPopover(); return; }
      if (inlineActive && !inlineActive.anchor.contains(event.target)) closeInlinePreview();
      if (active?.kind === "references" && popover.contains(event.target)) { pinPopover(); return; }
      if (active?.kind === "menu" && cardForTask(active.taskId)?.element.querySelector("[data-record-delete-reveal]")?.contains(event.target)) return;
      if (active && !popover.contains(event.target) && !active.anchor.contains(event.target)) dismiss();
    }
    function keydown(event) {
      if (referencePreview.isOpen()) return;
      if (event.key === "Escape" && inlineActive) { closeInlinePreview(true); event.preventDefault(); return; }
      if (event.key === "Escape" && active) { closeAndRestoreFocus(); event.preventDefault(); }
      else if ((event.key === "Enter" || event.key === " ") && (list.contains(event.target) || popover.contains(event.target))) {
        if (event.target.matches('[role="button"]:not(button)')) { event.preventDefault(); event.target.click(); }
      }
    }
    function onScroll(event) {
      if (event.target === container) suspendHover(list);
      else if (popover.contains(event.target)) suspendHover(popover);
      if (event.target === container) syncResultFeedback();
      if (active && !popover.contains(event.target)) positionPopover();
    }
    function onPopoverEnter() { view.clearTimeout(hideTimer); }
    function onPopoverLeave(event) { view.clearTimeout(showTimer); if (!popover.contains(event.relatedTarget) && !inlinePopover.contains(event.relatedTarget)) { scheduleInlineHide(); scheduleHide(); } }
    function revealNewResult() {
      const entry = [...unreadResults.values()].find((item) => item.scope === scopeKey && !selectedVisible(cardForTask(item.id), item.id));
      const task = entry && getTask(entry.id);
      const card = task && cardForTask(task.id);
      if (!card || !inScope(task) || task.status !== "succeeded") return syncResultFeedback();
      chooseVersion(card.element, task.id);
      const output = card.element.querySelector(".generation-record-output");
      container.scrollTop += output.getBoundingClientRect().top - container.getBoundingClientRect().top - 16;
      output.focus({ preventScroll: true });
      syncResultFeedback();
    }
    list.addEventListener("pointerover", hover); list.addEventListener("pointerout", leave);
    list.addEventListener("focusin", focusPreview);
    list.addEventListener("focusout", blurPreview);
    list.addEventListener("click", click);
    container.addEventListener("wheel", wheelReading, { passive: true });
    document.addEventListener("pointermove", movePointer, { passive: true });
    popover.addEventListener("pointerover", hover); popover.addEventListener("pointerout", leave);
    popover.addEventListener("focusin", focusPreview);
    inlinePopover.addEventListener("pointerenter", inlineEnter); inlinePopover.addEventListener("pointerleave", inlineLeave);
    inlinePopover.addEventListener("click", inlineClick); inlinePopover.addEventListener("focusout", blurPreview);
    popover.addEventListener("click", popoverClick);
    popover.addEventListener("wheel", wheelReferences, { passive: false });
    popover.addEventListener("wheel", wheelReading, { passive: true });
    popover.addEventListener("focusout", blurPreview);
    popover.addEventListener("pointerenter", onPopoverEnter); popover.addEventListener("pointerleave", onPopoverLeave);
    notice.addEventListener("click", revealNewResult);
    document.addEventListener("visibilitychange", syncResultFeedback);
    document.addEventListener("pointerdown", pointerOutside);
    document.addEventListener("keydown", keydown); document.addEventListener("scroll", onScroll, true);
    view.addEventListener("resize", onResize);
    if (view.ResizeObserver) { resizeObserver = new view.ResizeObserver(onResize); resizeObserver.observe(container); }

    function close() {
      for (const timer of readingTimers.values()) view.clearTimeout(timer);
      readingTimers.clear(); clearResultHighlight();
      view.clearTimeout(expiryTimer); expiryTimer = 0;
      hoverPaused.set(list, now());
      dismiss();
      // Hiding the workspace stops sound without destroying playback position.
      for (const media of list.querySelectorAll("video, audio")) media.pause();
    }
    function dispose() {
      if (disposed) return; disposed = true; close(); referencePreview.dispose(); resizeObserver?.disconnect(); releaseMedia(list); cards.clear();
      list.remove(); noticeSlot.remove();
      list.removeEventListener("pointerover", hover); list.removeEventListener("pointerout", leave);
      list.removeEventListener("focusin", focusPreview);
      list.removeEventListener("focusout", blurPreview);
      list.removeEventListener("click", click);
      container.removeEventListener("wheel", wheelReading);
      document.removeEventListener("pointermove", movePointer);
      hoverPaused.clear(); pointerPosition = null;
      popover.removeEventListener("pointerover", hover); popover.removeEventListener("pointerout", leave);
      popover.removeEventListener("focusin", focusPreview);
      inlinePopover.removeEventListener("pointerenter", inlineEnter); inlinePopover.removeEventListener("pointerleave", inlineLeave);
      inlinePopover.removeEventListener("click", inlineClick); inlinePopover.removeEventListener("focusout", blurPreview);
      popover.removeEventListener("click", popoverClick); popover.removeEventListener("pointerenter", onPopoverEnter); popover.removeEventListener("pointerleave", onPopoverLeave);
      popover.removeEventListener("wheel", wheelReferences);
      popover.removeEventListener("wheel", wheelReading);
      popover.removeEventListener("focusout", blurPreview);
      observedTasks.clear(); unreadResults.clear();
      notice.removeEventListener("click", revealNewResult); document.removeEventListener("visibilitychange", syncResultFeedback); document.removeEventListener("pointerdown", pointerOutside);
      document.removeEventListener("keydown", keydown); document.removeEventListener("scroll", onScroll, true); view.removeEventListener("resize", onResize);
    }
    return Object.freeze({ render, close, dispose, observeTask });
  }
  global.REELAY_GENERATION_RECORD_VIEW = Object.freeze({ createController });
}(typeof globalThis === "object" ? globalThis : window));
