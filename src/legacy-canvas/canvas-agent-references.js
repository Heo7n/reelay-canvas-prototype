(function registerCanvasAgentReferences(global) {
  "use strict";

  const MAX_FILE_BYTES = 64 * 1024 * 1024;
  const MAX_SESSION_BYTES = 128 * 1024 * 1024;
  const MEDIA_TYPES = new Set(["image", "video", "audio"]);

  function createController({ document, shelf, root = shelf, fileInput, getScope, isEditable, sanitizeUrl,
    getAssetType, getAssetLabel, assetPreview, escapeHtml, onChange = () => {}, showMessage = () => {},
    referenceOrder, referenceStrip, placeAnchoredPopover }) {
    const view = document.defaultView;
    const drafts = new WeakMap();
    const records = new Set();
    const ownedUrls = new Map();
    const fileKeys = new WeakMap();
    const cards = new Map();
    let ownedBytes = 0;
    let activeScope = null;
    let epoch = 0;
    let pickerScope = null;
    let disposed = false;
    let sequence = 0;
    let strip;

    shelf.classList.add("asset-shelf", "agent-reference-shelf");
    shelf.setAttribute("role", "group");
    shelf.setAttribute("aria-label", "参考素材，拖动可排序");
    fileInput.multiple = true;
    fileInput.accept = "image/*,video/*,audio/*";

    function scopeValue() {
      const value = getScope();
      return value?.projectId && value.conversation && typeof value.conversation === "object"
        ? { projectId: value.projectId, conversation: value.conversation } : null;
    }

    function sameScope(first, second) {
      return first && second && first.projectId === second.projectId && first.conversation === second.conversation;
    }

    function syncScope() {
      const next = disposed ? null : scopeValue();
      if (!sameScope(activeScope, next) && (activeScope || next)) {
        strip?.close();
        activeScope = next;
        epoch++;
        clearCards();
        shelf.scrollLeft = 0;
      }
      return activeScope;
    }

    function captureScope() {
      const scope = syncScope();
      return scope ? { ...scope, epoch } : null;
    }

    function current(scope, editable = false) {
      syncScope();
      return Boolean(!disposed && sameScope(scope, activeScope) && (scope.epoch === undefined || scope.epoch === epoch)
        && (!editable || isEditable()));
    }

    function recordFor(scope, create = false) {
      if (!scope) return null;
      let record = drafts.get(scope.conversation);
      if (!record && create) {
        record = { projectId: scope.projectId, assets: [], retainedUrls: new Set(), urls: new Set(), probes: new Map(), released: false };
        drafts.set(scope.conversation, record);
        records.add(record);
      }
      return record?.projectId === scope.projectId && !record.released ? record : null;
    }

    function newId() {
      return view.crypto?.randomUUID?.() || `agent-reference-${++sequence}`;
    }

    function entries(record) {
      return (record?.assets || []).map((asset) => ({ key: `asset:${asset.id}`, asset, label: getAssetLabel(asset) }));
    }

    function releaseElement(element) {
      for (const media of element.querySelectorAll("video, audio")) {
        media.pause(); media.removeAttribute("src"); media.load();
      }
    }

    function clearCards() {
      for (const card of cards.values()) releaseElement(card);
      cards.clear();
      shelf.replaceChildren();
    }

    function refreshOwnership(record) {
      const used = new Set([...record.assets.map((asset) => asset.url), ...record.retainedUrls]);
      for (const url of used) {
        const owned = ownedUrls.get(url);
        if (!owned) continue;
        owned.users.add(record);
        record.urls.add(url);
      }
      for (const url of record.urls) {
        if (used.has(url)) continue;
        record.urls.delete(url);
        const owned = ownedUrls.get(url);
        if (!owned) continue;
        owned.users.delete(record);
        if (!owned.users.size) {
          view.URL.revokeObjectURL(url);
          ownedBytes -= owned.bytes;
          ownedUrls.delete(url);
        }
      }
    }

    function refresh() {
      if (disposed) return;
      const scope = syncScope();
      const record = recordFor(scope);
      const ordered = global.REELAY_CANVAS_PROMPT_DOCUMENT.referenceIndex(entries(record));
      const wanted = new Set(ordered.map((entry) => entry.key));
      for (const [key, card] of cards) {
        if (wanted.has(key)) continue;
        releaseElement(card); card.remove(); cards.delete(key);
      }
      const locked = !scope || !isEditable();
      for (const [index, entry] of ordered.entries()) {
        let card = cards.get(entry.key);
        if (!card) {
          card = document.createElement("div");
          card.className = `asset-card agent-reference-card ${entry.asset.type}`;
          card.dataset.referenceKey = entry.key;
          card.setAttribute("role", "button");
          card.tabIndex = 0;
          card.setAttribute("aria-keyshortcuts", "Alt+ArrowLeft Alt+ArrowRight");
          card.innerHTML = `<div class="asset-thumb">${assetPreview(entry.asset)}</div>
            <span class="reference-number" aria-hidden="true"></span>
            <button class="asset-remove" type="button" data-reference-remove="${escapeHtml(entry.asset.id)}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8"/></svg></button>`;
          cards.set(entry.key, card);
        }
        card.dataset.referenceLocked = String(locked);
        card.setAttribute("aria-label", `${entry.label}：${entry.name}，拖动可排序`);
        card.querySelector(".reference-number").textContent = String(entry.ordinal);
        const remove = card.querySelector("[data-reference-remove]");
        remove.disabled = locked;
        remove.setAttribute("aria-label", `移除参考 ${entry.label}：${entry.name}`);
        remove.title = "移除参考";
        // Moving an existing card keeps its media decoder and hover target alive.
        if (shelf.children[index] !== card) shelf.insertBefore(card, shelf.children[index] || null);
      }
      shelf.hidden = !ordered.length;
      shelf.dataset.referenceCount = String(ordered.length);
    }

    function changed(scope) {
      if (!current(scope)) return;
      refresh();
      onChange();
    }

    function probeMetadata(record, asset, scope) {
      // Only duration is needed for the generation estimate. Image dimensions
      // belong to their visible thumbnail/preview, so never fetch an extra image.
      if (!["video", "audio"].includes(asset.type)
        || (Number.isFinite(Number(asset.duration)) && Number(asset.duration) > 0)) return;
      const media = document.createElement(asset.type);
      let done = false;
      let timer = 0;
      function cleanup() {
        if (done) return;
        done = true;
        view.clearTimeout(timer);
        media.removeEventListener("loadedmetadata", ready);
        media.removeEventListener("error", cleanup);
        record.probes.delete(asset.id);
        media.pause();
        media.removeAttribute("src");
        media.load();
      }
      function ready() {
        if (done) return;
        const available = !disposed && !record.released && record.assets.includes(asset);
        if (available) {
          const duration = Number(media.duration);
          if (Number.isFinite(duration) && duration > 0) asset.duration = duration;
        }
        cleanup();
        if (available) changed(scope);
      }
      record.probes.set(asset.id, cleanup);
      media.addEventListener("loadedmetadata", ready);
      media.addEventListener("error", cleanup);
      media.preload = "metadata"; media.autoplay = false;
      timer = view.setTimeout(cleanup, 12000);
      media.src = asset.url;
    }

    function append(record, asset, scope) {
      record.assets.push(asset);
      refreshOwnership(record);
      probeMetadata(record, asset, scope);
    }

    function addAssets(assets, scope = captureScope()) {
      if (!current(scope, true)) return [];
      const record = recordFor(scope, true);
      if (!record) return [];
      const added = [];
      let unsupported = false;
      for (const source of Array.from(assets || [])) {
        const url = sanitizeUrl(source?.url);
        if (!MEDIA_TYPES.has(source?.type) || !url) { unsupported = true; continue; }
        if (record.assets.some((asset) => asset.url === url
          || (source.id && (asset.id === source.id || asset.sourceAssetId === source.id)))) continue;
        const asset = { ...source, id: newId(), sourceAssetId: source.id || null, url };
        append(record, asset, scope);
        added.push({ ...asset });
      }
      if (added.length) changed(scope);
      if (unsupported) showMessage("参考素材支持图片、视频和音频，请选择可预览的素材");
      return added;
    }

    function addFiles(files, scope = captureScope()) {
      if (!current(scope, true)) return [];
      const record = recordFor(scope, true);
      if (!record) return [];
      const added = [];
      const rejected = new Set();
      for (const file of Array.from(files || [])) {
        const type = getAssetType(file);
        if (!MEDIA_TYPES.has(type)) { rejected.add("type"); continue; }
        if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_FILE_BYTES) { rejected.add("file"); continue; }
        const fileKey = `${file.name}\u0000${file.size}\u0000${file.lastModified}\u0000${file.type}`;
        if (record.assets.some((asset) => fileKeys.get(asset) === fileKey)) continue;
        if (ownedBytes + file.size > MAX_SESSION_BYTES) { rejected.add("session"); continue; }
        let url;
        try { url = view.URL.createObjectURL(file); }
        catch { rejected.add("read"); continue; }
        const safe = sanitizeUrl(url);
        if (!safe) { view.URL.revokeObjectURL(url); rejected.add("read"); continue; }
        ownedUrls.set(safe, { bytes: file.size, users: new Set() });
        ownedBytes += file.size;
        const asset = { id: newId(), name: file.name, type, url: safe, size: file.size, mime: file.type };
        fileKeys.set(asset, fileKey);
        append(record, asset, scope);
        added.push({ ...asset });
      }
      if (added.length) changed(scope);
      if (rejected.has("session")) showMessage("本页临时素材已达 128 MiB，请删除不再需要的对话后再添加");
      else if (rejected.has("file")) showMessage("请选择非空且不超过 64 MiB 的素材文件");
      else if (rejected.has("type")) showMessage("参考素材支持图片、视频和音频");
      else if (rejected.has("read")) showMessage("素材暂时无法读取，请重新选择");
      return added;
    }

    function getAssets() {
      return (recordFor(syncScope())?.assets || []).map((asset) => ({ ...asset }));
    }

    function getEntries() {
      return entries(recordFor(syncScope())).map((entry) => ({ ...entry, asset: { ...entry.asset } }));
    }

    function hasDraft(conversation) {
      const record = drafts.get(conversation);
      return Boolean(record && !record.released && record.assets.length);
    }

    function takeForMessage() {
      const scope = captureScope();
      if (!current(scope, true)) return [];
      const record = recordFor(scope);
      if (!record?.assets.length) return [];
      strip.close();
      const assets = record.assets.map((asset) => ({ ...asset }));
      for (const asset of record.assets) {
        if (ownedUrls.has(asset.url)) record.retainedUrls.add(asset.url);
        record.probes.get(asset.id)?.();
      }
      record.assets = [];
      refreshOwnership(record);
      changed(scope);
      return assets;
    }

    function chooseFiles() {
      const scope = captureScope();
      if (!current(scope, true)) return false;
      pickerScope = scope;
      fileInput.value = "";
      fileInput.click();
      return true;
    }

    function onFilesChanged() {
      const scope = pickerScope;
      pickerScope = null;
      const files = Array.from(fileInput.files || []);
      fileInput.value = "";
      if (scope) addFiles(files, scope);
    }

    function onRemove(event) {
      const button = event.target.closest?.("[data-reference-remove]");
      if (!button || !shelf.contains(button)) return;
      event.preventDefault(); event.stopPropagation();
      const scope = captureScope();
      if (!current(scope, true)) return;
      const record = recordFor(scope);
      const index = record?.assets.findIndex((asset) => asset.id === button.dataset.referenceRemove) ?? -1;
      if (index < 0) return;
      strip.close();
      const [asset] = record.assets.splice(index, 1);
      record.probes.get(asset.id)?.();
      refreshOwnership(record);
      changed(scope);
      const next = shelf.children[Math.min(index, shelf.children.length - 1)];
      if (next && !shelf.hidden) next.focus({ preventScroll: true });
    }

    function releaseConversation(conversation) {
      const record = drafts.get(conversation);
      if (!record) return;
      if (activeScope?.conversation === conversation) strip.close();
      record.released = true;
      for (const cleanup of [...record.probes.values()]) cleanup();
      record.assets = [];
      record.retainedUrls.clear();
      refreshOwnership(record);
      records.delete(record);
      // Keep a tombstone so a late callback cannot resurrect a deleted conversation.
      if (activeScope?.conversation === conversation) {
        epoch++;
        refresh();
        onChange();
      }
    }

    strip = referenceStrip.createController({
      document, root, placeAnchoredPopover,
      isCardEligible: (card) => card.closest(".agent-reference-shelf") === shelf
        || (card.matches(".prompt-reference") && root.contains(card)),
      getContext: (card) => {
        const scope = captureScope();
        const record = recordFor(scope);
        return scope && record ? {
          scope: scope.projectId, node: scope.conversation, nodeId: scope.conversation.id,
          epoch: scope.epoch,
          entries: global.REELAY_CANVAS_PROMPT_DOCUMENT.referenceIndex(entries(record))
            .map((entry) => ({ ...entry, label: `${entry.label} · ${entry.name}` })),
          canReorder: isEditable() && !card.matches(".prompt-reference"),
        } : null;
      },
      onMove: (context, { sourceKey, targetKey, placement }) => {
        const scope = { projectId: context.scope, conversation: context.node, epoch: context.epoch };
        if (!current(scope, true)) return false;
        const record = recordFor(scope);
        if (!record) return false;
        const before = entries(record);
        const keys = before.map((entry) => entry.key);
        const order = referenceOrder.move(keys, sourceKey, targetKey, placement);
        if (order === keys) return false;
        record.assets = referenceOrder.orderEntries(before, order).map((entry) => entry.asset);
        changed(scope);
        return true;
      },
    });

    function close() { strip.close(); }
    function onPageHide(event) { if (event.persisted) close(); else dispose(); }
    function dispose() {
      if (disposed) return;
      disposed = true;
      pickerScope = null;
      strip.dispose();
      fileInput.removeEventListener("change", onFilesChanged);
      shelf.removeEventListener("click", onRemove);
      view.removeEventListener("pagehide", onPageHide);
      for (const record of records) {
        record.released = true;
        for (const cleanup of [...record.probes.values()]) cleanup();
      }
      for (const url of ownedUrls.keys()) view.URL.revokeObjectURL(url);
      ownedUrls.clear(); records.clear(); ownedBytes = 0;
      clearCards();
    }

    fileInput.addEventListener("change", onFilesChanged);
    shelf.addEventListener("click", onRemove);
    view.addEventListener("pagehide", onPageHide);
    refresh();
    return Object.freeze({ refresh, captureScope, chooseFiles, addFiles, addAssets, getAssets, getEntries, hasDraft, takeForMessage,
      releaseConversation, close, dispose });
  }

  global.REELAY_CANVAS_AGENT_REFERENCES = Object.freeze({ createController });
}(typeof globalThis === "object" ? globalThis : window));
