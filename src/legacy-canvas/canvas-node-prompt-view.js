(function registerCanvasNodePromptView(root) {
  "use strict";
  const mediaMarkup = new WeakMap();
  const mediaContentMarkup = new WeakMap();

  // Keep the live editor and its ancestors connected. Native scroll, selection,
  // focus and text undo belong to this editor, not to its surrounding controls.
  function renderContents(element, markup) {
    const template = element.ownerDocument.createElement("template");
    template.innerHTML = markup;
    const panel = element.querySelector(".prompt-panel");
    const input = panel?.querySelector("[data-node-prompt-input]");
    const nextPanel = template.content.querySelector(".prompt-panel");
    const nextInput = nextPanel?.querySelector("[data-node-prompt-input]");
    const media = element.querySelector(".media-frame");
    const nextMedia = template.content.querySelector(".media-frame");
    const content = media?.querySelector(".media-content");
    const nextContent = nextMedia?.querySelector(".media-content");
    const nextMediaMarkup = nextMedia?.outerHTML;
    const nextContentMarkup = nextContent?.outerHTML;
    const retained = new Map();
    const retainedMedia = Boolean(media && nextMedia && mediaMarkup.get(element) === nextMediaMarkup);
    if (retainedMedia) retained.set(nextMedia, media);
    else if (content && nextContent && mediaContentMarkup.get(element) === nextContentMarkup) {
      // Selection/toolbars change the frame chrome, not the playing media.
      // Keep both media ancestors connected so native playback and capture survive.
      media.className = nextMedia.className;
      media.style.cssText = nextMedia.style.cssText;
      replaceAround(media, nextMedia, new Map([[nextContent, content]]));
      retained.set(nextMedia, media);
    }
    mediaMarkup.set(element, nextMediaMarkup);
    mediaContentMarkup.set(element, nextContentMarkup);
    const retainedInput = Boolean(input && nextInput);
    if (retainedInput) {
      panel.className = nextPanel.className;
      panel.style.cssText = nextPanel.style.cssText;
      input.setAttribute("aria-readonly", nextInput.getAttribute("aria-readonly") || "false");
      input.dataset.placeholder = nextInput.dataset.placeholder || "";
      replaceAround(panel, nextPanel, new Map([[nextInput, input]]));
      retained.set(nextPanel, panel);
    }
    replaceAround(element, template.content, retained);
    return { retainedInput, retainedMedia };
  }

  function replaceAround(parent, nextParent, retained) {
    const liveChildren = new Set(retained.values());
    for (const child of Array.from(parent.childNodes)) {
      if (!liveChildren.has(child)) child.remove();
    }
    let before = parent.firstChild;
    for (const child of Array.from(nextParent.childNodes)) {
      if (retained.has(child)) before = retained.get(child).nextSibling;
      else parent.insertBefore(child, before);
    }
  }

  function measureContentHeight(input) {
    // Measuring by collapsing the live textarea can move its scroll/caret.
    // A noninteractive twin measures identical wrapping without touching it.
    const measure = input.cloneNode(true);
    measure.removeAttribute("data-node-prompt-input");
    measure.removeAttribute("id");
    measure.setAttribute("aria-hidden", "true");
    measure.tabIndex = -1;
    measure.inert = true;
    measure.querySelectorAll("[contenteditable]").forEach((editable) => editable.removeAttribute("contenteditable"));
    Object.assign(measure.style, { height: "auto", bottom: "auto", overflowY: "hidden", visibility: "hidden", pointerEvents: "none" });
    input.parentElement.appendChild(measure);
    try {
      return measure.scrollHeight;
    } finally {
      measure.remove();
    }
  }

  root.REELAY_CANVAS_NODE_PROMPT_VIEW = Object.freeze({ renderContents, measureContentHeight });
}(typeof globalThis === "object" ? globalThis : window));
