(function registerCanvasNodePromptView(root) {
  "use strict";
  const mediaMarkup = new WeakMap();

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
    const retained = new Map();
    const retainedMedia = Boolean(media && nextMedia && mediaMarkup.get(element) === nextMedia.outerHTML);
    if (retainedMedia) retained.set(nextMedia, media);
    mediaMarkup.set(element, nextMedia?.outerHTML);
    const retainedInput = Boolean(input && nextInput);
    if (retainedInput) {
      panel.className = nextPanel.className;
      panel.style.cssText = nextPanel.style.cssText;
      input.disabled = nextInput.disabled;
      if (input.placeholder !== nextInput.placeholder) input.placeholder = nextInput.placeholder;
      if (input.value !== nextInput.value) input.value = nextInput.value;
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
    const measure = input.cloneNode(false);
    measure.removeAttribute("data-node-prompt-input");
    measure.removeAttribute("id");
    measure.setAttribute("aria-hidden", "true");
    measure.tabIndex = -1;
    measure.inert = true;
    measure.value = input.value;
    Object.assign(measure.style, { height: "0px", bottom: "auto", overflowY: "hidden", visibility: "hidden", pointerEvents: "none" });
    input.parentElement.appendChild(measure);
    try {
      return measure.scrollHeight;
    } finally {
      measure.remove();
    }
  }

  root.REELAY_CANVAS_NODE_PROMPT_VIEW = Object.freeze({ renderContents, measureContentHeight });
}(typeof globalThis === "object" ? globalThis : window));
