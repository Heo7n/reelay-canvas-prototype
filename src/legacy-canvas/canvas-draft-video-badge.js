(function registerDraftVideoBadge(root) {
  "use strict";

  function escape(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  }

  function render({ asset, pending, eligibility, mediaWidth }) {
    const stage = pending ? pending.stage : asset?.generation?.simulated ? asset.generation.stage : "";
    if (!["draft", "final"].includes(stage)) return "";
    const style = `--draft-badge-scale: ${root.REELAY_DRAFT_VIDEO_CONTROLLER.getMediaRelativeScale(mediaWidth)}`;
    if (stage === "final" || pending) return `<div class="node-draft-badge" style="${style}"><span class="node-draft-label">${stage === "final" ? "正片 1080P" : "样片 480P"}</span></div>`;
    return `<div class="node-draft-badge" style="${style}">
      <button class="node-draft-action" data-node-draft-final type="button" aria-label="生成正片 1080P" aria-haspopup="dialog" aria-expanded="false"${!eligibility?.eligible ? ` disabled title="${escape(eligibility?.reason)}"` : ""}>
        <span class="node-draft-idle" aria-hidden="true">样片 480P</span>
        <span class="node-draft-ready" aria-hidden="true">生成正片 1080P</span>
      </button>
    </div>`;
  }

  function bind(element, onOpen) {
    const badge = element.querySelector(".node-draft-badge");
    const button = badge?.querySelector("[data-node-draft-final]");
    if (!button) return;
    badge.addEventListener("pointerdown", (event) => event.stopPropagation());
    button.addEventListener("pointerenter", (event) => {
      if (!button.disabled && event.pointerType !== "touch") onOpen(button, { interaction: "hover" });
    });
    button.addEventListener("pointerleave", () => onOpen(button, { interaction: "leave" }));
    button.addEventListener("click", (event) => {
      event.preventDefault(); event.stopPropagation();
      if (!button.disabled) onOpen(button);
    });
  }

  function sync(element, mediaWidth) {
    const badge = element.querySelector(".node-draft-badge");
    if (!badge) return;
    badge.style.setProperty("--draft-badge-scale", String(root.REELAY_DRAFT_VIDEO_CONTROLLER.getMediaRelativeScale(mediaWidth)));
  }

  root.REELAY_DRAFT_VIDEO_BADGE = Object.freeze({ render, bind, sync });
})(globalThis);
