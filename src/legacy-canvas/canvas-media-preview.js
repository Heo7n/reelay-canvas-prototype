(function registerCanvasMediaPreview(root) {
  "use strict";
  const bound = new WeakSet();

  function syncImages(container) {
    for (const preview of container.querySelectorAll("[data-progressive-preview]")) {
      if (bound.has(preview)) continue;
      bound.add(preview);
      const full = preview.querySelector("[data-preview-full]");
      let settled = false;
      const reveal = async () => {
        if (settled) return;
        settled = true;
        try {
          if (typeof full.decode === "function") await full.decode();
          if (!preview.isConnected || !full.isConnected) return;
          preview.dataset.previewQuality = "full";
          preview.setAttribute("aria-busy", "false");
        } catch {
          if (preview.isConnected) preview.setAttribute("aria-busy", "false");
        }
      };
      full.addEventListener("load", reveal, { once: true });
      full.addEventListener("error", () => {
        settled = true;
        if (preview.isConnected) preview.setAttribute("aria-busy", "false");
      }, { once: true });
      full.src = full.dataset.previewFull;
      if (full.complete && full.naturalWidth > 0) void reveal();
    }
  }

  function syncAttributes(target, source) {
    for (const attribute of Array.from(target.attributes)) {
      if (!source.hasAttribute(attribute.name)) target.removeAttribute(attribute.name);
    }
    for (const attribute of Array.from(source.attributes)) {
      if (target.getAttribute(attribute.name) !== attribute.value) target.setAttribute(attribute.name, attribute.value);
    }
  }

  function replaceAround(parent, nextParent, retained, nextRetained) {
    for (const child of Array.from(parent.childNodes)) {
      if (child !== retained) child.remove();
    }
    let before = parent.firstChild;
    for (const child of Array.from(nextParent.childNodes)) {
      if (child === nextRetained) before = retained.nextSibling;
      else parent.insertBefore(child, before);
    }
  }

  // The selected media and its ancestors remain connected while surrounding
  // controls change. Reparenting a video through a new tree can pause playback.
  function renderPreservingMedia(container, markup, selector) {
    const template = container.ownerDocument.createElement("template");
    template.innerHTML = markup;
    let current = container.querySelector(selector);
    let next = template.content.querySelector(selector);
    const key = current?.getAttribute("data-media-preview-key");
    const retained = Boolean(key && key === next?.getAttribute("data-media-preview-key"));
    if (retained) {
      // Names may change while the immutable media source remains the same.
      const currentMedia = current.querySelectorAll("img,video,audio");
      const nextMedia = next.querySelectorAll("img,video,audio");
      currentMedia.forEach((media, index) => {
        for (const name of ["alt", "aria-label"]) {
          const value = nextMedia[index]?.getAttribute(name);
          if (value !== null && value !== undefined) media.setAttribute(name, value);
        }
      });
      while (current !== container) {
        syncAttributes(current, next);
        const parent = current.parentNode;
        const nextParent = next.parentNode;
        replaceAround(parent, nextParent, current, next);
        current = parent;
        next = nextParent;
      }
    } else {
      container.replaceChildren(template.content);
    }
    syncImages(container);
    return retained;
  }

  root.REELAY_CANVAS_MEDIA_PREVIEW = Object.freeze({ syncImages, renderPreservingMedia });
}(typeof globalThis === "object" ? globalThis : window));
