(function registerCanvasMediaImageView(root) {
  "use strict";

  const PREVIEW_LONG_EDGE = 512;
  const IMAGE_SELECTOR = "img[data-canvas-image-url]";
  const CONTENT_PATH = /^\/api\/(?:workspaces\/[^/]+\/media-assets|projects\/[^/]+\/asset-references)\/[^/]+\/content$/;

  function escapeAttribute(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
  }

  function knownAnimatedImage(asset) {
    return asset.animated === true || asset.isAnimated === true || asset.frameCount > 1
      || /^image\/gif(?:;|$)/i.test(asset.contentType || asset.mimeType || "")
      || [asset.name, asset.displayName, asset.url].some((value) => /\.gif(?:[?#]|$)/i.test(String(value || "")));
  }

  function getImageSources(asset, { origin, thumbnail = false } = {}) {
    const original = String(asset?.url || "");
    const unchanged = { original, preview: "", originalWidth: 0, previewWidth: 0 };
    if ((asset?.type || asset?.mediaKind) !== "image" || knownAnimatedImage(asset)) return unchanged;
    let url;
    try {
      url = new URL(original, origin);
      if (!/^https?:$/.test(url.protocol) || url.origin !== new URL(origin).origin
        || url.username || url.password || !CONTENT_PATH.test(url.pathname)
        || url.search || url.hash) return unchanged;
    } catch {
      return unchanged;
    }
    const width = asset.width;
    const height = asset.height;
    const hasDimensions = Number.isSafeInteger(width) && width > 0 && Number.isSafeInteger(height) && height > 0;
    if (!thumbnail && (!hasDimensions || Math.max(width, height) <= PREVIEW_LONG_EDGE)) return unchanged;
    url.searchParams.set("preview", thumbnail ? "library" : "canvas");
    return {
      original,
      preview: url.href,
      originalWidth: hasDimensions ? width : 0,
      // The service fits inside 512 x 512. A portrait preview is NOT 512px wide.
      previewWidth: hasDimensions ? Math.max(1, Math.round(width * Math.min(1, PREVIEW_LONG_EDGE / Math.max(width, height)))) : 0,
    };
  }

  function createCanvasMediaImageView({ origin } = {}) {
    const images = new WeakMap();
    const originalSources = new Set();

    function renderImage(asset, { className = "", displayWidth = 0, thumbnail = false } = {}) {
      const sources = getImageSources(asset, { origin, thumbnail });
      const common = `class="${escapeAttribute(className)}" alt="" draggable="false" decoding="async"`;
      if (!sources.preview) return `<img ${common} src="${escapeAttribute(sources.original)}" />`;
      // Request attributes are installed together by syncImages. Keeping this
      // markup independent of zoom/currentSrc preserves the live media frame
      // when the prompt renderer compares its last generated markup.
      return `<img ${common} data-canvas-image-url="${escapeAttribute(sources.original)}" data-canvas-image-preview="${escapeAttribute(sources.preview)}" data-canvas-image-width="${sources.originalWidth}" data-canvas-image-preview-width="${sources.previewWidth}" data-canvas-image-display-width="${Number.isFinite(displayWidth) ? displayWidth : 0}" data-canvas-image-thumbnail="${thumbnail}" />`;
    }

    function normalizedUrl(value) {
      try { return new URL(value, origin).href; } catch { return ""; }
    }

    function selectOriginal(image, record) {
      record.originalOnly = true;
      // Set the fallback first; removing srcset must never expose the preview
      // again after a full-resolution image has already been selected.
      if (image.getAttribute("src") !== record.original) image.setAttribute("src", record.original);
      image.removeAttribute("srcset");
      image.removeAttribute("sizes");
    }

    function bindImage(image) {
      let record = images.get(image);
      if (record) return record;
      record = {
        original: image.dataset.canvasImageUrl,
        preview: image.dataset.canvasImagePreview,
        originalWidth: Number(image.dataset.canvasImageWidth),
        previewWidth: Number(image.dataset.canvasImagePreviewWidth),
        thumbnail: image.dataset.canvasImageThumbnail === "true",
        originalOnly: false,
        fallbackUsed: false,
      };
      images.set(image, record);
      image.addEventListener("load", () => {
        if (!image.isConnected || images.get(image) !== record) return;
        if (normalizedUrl(image.currentSrc || image.src) !== normalizedUrl(record.original)) return;
        originalSources.add(normalizedUrl(record.original));
        selectOriginal(image, record);
      });
      image.addEventListener("error", () => {
        if (!image.isConnected || images.get(image) !== record || record.fallbackUsed || record.originalOnly) return;
        // A failed original is not a failed preview; do not request it again.
        if (normalizedUrl(image.currentSrc || image.src) === normalizedUrl(record.original)) {
          selectOriginal(image, record);
          return;
        }
        record.fallbackUsed = true;
        originalSources.add(normalizedUrl(record.original));
        selectOriginal(image, record);
      });
      return record;
    }

    function syncImages(container, { scale = 1, displayWidth } = {}) {
      if (!container) return;
      for (const image of container.querySelectorAll(IMAGE_SELECTOR)) {
        const record = bindImage(image);
        if (record.originalOnly) continue;
        if (originalSources.has(normalizedUrl(record.original))) {
          selectOriginal(image, record);
          continue;
        }
        if (!record.thumbnail) {
          const worldWidth = Number.isFinite(displayWidth) && displayWidth > 0
            ? displayWidth : Number(image.dataset.canvasImageDisplayWidth);
          const width = Math.max(1, Math.ceil(worldWidth * (Number.isFinite(scale) && scale > 0 ? scale : 1)));
          const density = Number.isFinite(root.devicePixelRatio) && root.devicePixelRatio > 0 ? root.devicePixelRatio : 1;
          if (width * density > record.previewWidth) {
            originalSources.add(normalizedUrl(record.original));
            selectOriginal(image, record);
            continue;
          }
          const sizes = `${width}px`;
          if (image.getAttribute("sizes") !== sizes) image.setAttribute("sizes", sizes);
          if (!image.hasAttribute("srcset")) {
            // Offering a cached original here lets Chromium eagerly revalidate
            // it while this new image is still detached, even when the preview
            // already covers the display's physical pixels. Only expose the
            // required representation; upgrade explicitly at its size boundary.
            image.setAttribute("srcset", `${record.preview} ${record.previewWidth}w`);
          }
        }
        if (!image.hasAttribute("src")) image.setAttribute("src", record.preview);
      }
    }

    return Object.freeze({ renderImage, syncImages });
  }

  root.REELAY_CANVAS_MEDIA_IMAGE_VIEW = Object.freeze({ getImageSources, createCanvasMediaImageView });
}(typeof globalThis === "object" ? globalThis : window));
