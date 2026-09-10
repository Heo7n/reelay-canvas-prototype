(function registerCanvasReferenceThumbnails(global) {
  "use strict";

  const SELECTOR = "video[data-reference-video-src]";

  function renderVideo(asset, { sanitizeUrl, escapeHtml }) {
    const poster = sanitizeUrl(asset.posterUrl) || sanitizeUrl(asset.thumbnailUrl);
    const source = sanitizeUrl(asset.url);
    const play = '<span class="reference-video-play" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="m6 4 6 4-6 4Z"/></svg></span>';
    if (!poster && !source) return '<svg class="agent-reference-glyph" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="m10 8 6 4-6 4Z"/></svg>';
    const media = poster
      ? `<img class="reference-video-frame" src="${escapeHtml(poster)}" alt="" draggable="false" loading="lazy"/>`
      : `<video class="reference-video-frame" data-reference-video-src="${escapeHtml(source)}" muted playsinline preload="metadata" tabindex="-1" aria-hidden="true" draggable="false"></video>`;
    return `<span class="reference-video-thumbnail" aria-hidden="true">${media}${play}</span>`;
  }

  // Decode only visible reference frames, including those in scrollable strips.
  // The observer owns these inert thumbnails, never the actual media players.
  function createController({ document, sanitizeUrl }) {
    const view = document.defaultView;
    const tracked = new Set();
    let suspended = false;
    let disposed = false;

    function release(media) {
      if (!media.hasAttribute("src")) return;
      media.pause();
      media.removeAttribute("src");
      media.load();
    }

    function load(media) {
      if (disposed || suspended || !tracked.has(media) || !media.isConnected || media.hasAttribute("src")) return;
      const source = sanitizeUrl(media.getAttribute("data-reference-video-src"));
      if (!source) return;
      media.muted = true;
      media.autoplay = false;
      media.src = source;
    }

    const intersection = typeof view.IntersectionObserver === "function"
      ? new view.IntersectionObserver((entries) => {
        for (const entry of entries) if (entry.isIntersecting) load(entry.target);
      }, { rootMargin: "0px", threshold: 0 }) : null;

    function visibleFallback() {
      if (intersection || suspended || disposed) return;
      for (const media of tracked) {
        const rect = media.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0
          && rect.top < view.innerHeight && rect.left < view.innerWidth
          && !media.closest("[hidden], [inert]")) load(media);
      }
    }

    function visit(node, callback) {
      if (node.nodeType !== 1) return;
      if (node.matches(SELECTOR)) callback(node);
      for (const media of node.querySelectorAll(SELECTOR)) callback(media);
    }

    function track(media) {
      if (tracked.has(media) || !media.isConnected) return;
      tracked.add(media);
      if (!suspended) intersection?.observe(media);
    }

    const mutations = new view.MutationObserver((records) => {
      for (const record of records) for (const node of record.removedNodes) visit(node, (media) => {
        // Reordering a reference moves its existing decoder without reloading it.
        if (media.isConnected) return;
        intersection?.unobserve(media);
        tracked.delete(media);
        release(media);
      });
      for (const record of records) for (const node of record.addedNodes) visit(node, track);
      visibleFallback();
    });
    mutations.observe(document.body, { childList: true, subtree: true });
    visit(document.body, track);
    visibleFallback();

    function onPageHide(event) {
      if (!event.persisted) { dispose(); return; }
      suspended = true;
      intersection?.disconnect();
      for (const media of tracked) release(media);
    }

    function onPageShow() {
      if (!suspended || disposed) return;
      suspended = false;
      for (const media of tracked) intersection?.observe(media);
      visibleFallback();
    }

    function dispose() {
      if (disposed) return;
      disposed = true;
      mutations.disconnect();
      intersection?.disconnect();
      for (const media of tracked) release(media);
      tracked.clear();
      view.removeEventListener("pagehide", onPageHide);
      view.removeEventListener("pageshow", onPageShow);
      if (!intersection) {
        document.removeEventListener("scroll", visibleFallback, true);
        view.removeEventListener("resize", visibleFallback);
      }
    }

    view.addEventListener("pagehide", onPageHide);
    view.addEventListener("pageshow", onPageShow);
    if (!intersection) {
      document.addEventListener("scroll", visibleFallback, true);
      view.addEventListener("resize", visibleFallback);
    }
    return { dispose };
  }

  global.REELAY_CANVAS_REFERENCE_THUMBNAILS = { renderVideo, createController };
})(window);
