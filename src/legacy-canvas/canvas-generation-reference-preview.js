(function registerGenerationReferencePreview(root) {
  "use strict";

  let nextId = 0;
  const types = { image: "图片", video: "视频", audio: "音频" };
  const svg = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

  function createController({ document, sanitizeUrl = () => "" } = {}) {
    let current = null;
    let disposed = false;

    function cleanUrl(value) {
      try { return sanitizeUrl(value) || ""; } catch { return ""; }
    }

    function close({ notify = false, restoreFocus = false } = {}) {
      const session = current;
      if (!session) return;
      current = null;
      session.listeners.forEach(([target, name, handler]) => target.removeEventListener(name, handler));
      const { media, dialog, trigger, onClose } = session;
      if (media) {
        if (media.tagName !== "IMG") {
          try { media.pause(); } catch { /* The browser may already have released the decoder. */ }
        }
        media.removeAttribute("src");
        media.removeAttribute("poster");
        if (media.tagName !== "IMG") {
          try { media.load(); } catch { /* A detached document has no active media loader. */ }
        }
      }
      // Native close restores its opener automatically. Removing a modal exits
      // the top layer without refocusing a stale record during a scope change.
      if (restoreFocus && dialog.open) dialog.close();
      dialog.remove();
      dialog.removeAttribute("open");
      if (restoreFocus && trigger?.isConnected) trigger.focus({ preventScroll: true });
      if (notify && typeof onClose === "function") onClose();
    }

    function open({ asset, label, trigger, onClose } = {}) {
      if (disposed || !document?.body || !types[asset?.type]) return false;
      const dialog = document.createElement("dialog");
      if (typeof dialog.showModal !== "function") return false;
      close();
      const type = asset.type;
      const name = String(label || asset.name || `${types[type]}预览`);
      const titleId = `generation-reference-preview-title-${++nextId}`;
      dialog.className = "generation-reference-preview";
      dialog.setAttribute("aria-labelledby", titleId);
      dialog.innerHTML = `<header class="generation-reference-preview-header"><h2 id="${titleId}"></h2><button type="button" class="generation-reference-preview-close" aria-label="关闭素材预览" title="关闭（Esc）" autofocus>${svg('<path d="m6 6 12 12M6 18 18 6"/>')}</button></header><div class="generation-reference-preview-stage"><div class="generation-reference-preview-status" role="status" aria-live="polite"><span class="generation-reference-preview-spinner" aria-hidden="true"></span><span data-preview-message>正在加载…</span></div></div>`;
      dialog.querySelector("h2").textContent = name;
      const stage = dialog.querySelector(".generation-reference-preview-stage");
      const status = dialog.querySelector(".generation-reference-preview-status");
      const message = status.querySelector("[data-preview-message]");
      const spinner = status.querySelector(".generation-reference-preview-spinner");
      const url = cleanUrl(asset.url);
      const session = { dialog, media: null, trigger, onClose, listeners: [], backgroundPointer: false };
      current = session;

      function listen(target, event, handler) {
        target.addEventListener(event, handler);
        session.listeners.push([target, event, handler]);
      }
      function setState(state) {
        if (current !== session) return;
        dialog.dataset.state = state;
        status.hidden = state === "ready";
        spinner.hidden = state === "error";
        message.textContent = state === "error" ? "此素材暂时无法预览" : state === "buffering" ? "正在缓冲…" : "正在加载…";
        if (session.media) session.media.hidden = state === "error";
      }
      const userClose = () => close({ notify: true, restoreFocus: true });
      const isBackground = (target) => target === dialog || target === stage;
      listen(dialog, "cancel", (event) => { event.preventDefault(); event.stopPropagation(); userClose(); });
      listen(dialog, "close", userClose);
      listen(dialog.querySelector("button"), "click", userClose);
      listen(dialog, "pointerdown", (event) => {
        session.backgroundPointer = isBackground(event.target);
        event.stopPropagation();
      });
      listen(dialog, "click", (event) => {
        if (session.backgroundPointer && isBackground(event.target)) userClose();
        session.backgroundPointer = false;
        event.stopPropagation();
      });
      ["pointerup", "keydown", "keyup", "wheel"].forEach((event) => listen(dialog, event, (value) => value.stopPropagation()));

      if (url) {
        const media = document.createElement(type === "image" ? "img" : type);
        session.media = media;
        media.className = `generation-reference-preview-media generation-reference-preview-${type}`;
        if (type === "image") {
          media.alt = name;
          media.draggable = false;
          listen(media, "load", () => setState("ready"));
          stage.prepend(media);
        } else {
          media.controls = true;
          media.autoplay = false;
          media.preload = "metadata";
          media.setAttribute("aria-label", name);
          if (type === "video") {
            media.playsInline = true;
            const poster = cleanUrl(asset.posterUrl || asset.thumbnailUrl);
            if (poster) media.poster = poster;
            stage.prepend(media);
          } else {
            const audioCard = document.createElement("div");
            audioCard.className = "generation-reference-preview-audio-card";
            audioCard.innerHTML = `<span class="generation-reference-preview-audio-icon">${svg('<path d="M9 18V5l12-2v13M9 8l12-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="18" cy="16" rx="3" ry="3"/>')}</span><span class="generation-reference-preview-audio-label"></span>`;
            audioCard.querySelector(".generation-reference-preview-audio-label").textContent = name;
            audioCard.append(media);
            stage.prepend(audioCard);
          }
          listen(media, type === "audio" ? "loadedmetadata" : "loadeddata", () => setState("ready"));
          listen(media, "canplay", () => setState("ready"));
          listen(media, "playing", () => setState("ready"));
          listen(media, "waiting", () => { if (!media.paused) setState("buffering"); });
          listen(media, "pause", () => { if (media.readyState >= 2) setState("ready"); });
        }
        listen(media, "error", () => setState("error"));
        media.src = url;
      }
      setState(url ? "loading" : "error");
      document.body.append(dialog);
      try { dialog.showModal(); } catch { close(); return false; }
      return true;
    }

    return {
      open,
      close,
      isOpen: () => Boolean(current?.dialog.open),
      dispose() { close(); disposed = true; },
    };
  }

  root.REELAY_GENERATION_REFERENCE_PREVIEW = Object.freeze({ createController });
})(typeof window !== "undefined" ? window : globalThis);
