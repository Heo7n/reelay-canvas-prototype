(function registerCanvasPopoverPlacement(root) {
  "use strict";

  const defaultPlacements = [
    "top-start",
    "top",
    "top-end",
    "bottom-start",
    "bottom",
    "bottom-end",
    "right-start",
    "left-start",
  ];

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function candidateFor(placement, anchor, floating, gap) {
    const vertical = placement.startsWith("top") || placement.startsWith("bottom");
    let left = anchor.left + (anchor.width - floating.width) / 2;
    let top = anchor.top + (anchor.height - floating.height) / 2;

    if (placement.startsWith("top")) top = anchor.top - floating.height - gap;
    if (placement.startsWith("bottom")) top = anchor.bottom + gap;
    if (placement.startsWith("left")) left = anchor.left - floating.width - gap;
    if (placement.startsWith("right")) left = anchor.right + gap;

    if (vertical && placement.endsWith("start")) left = anchor.left;
    if (vertical && placement.endsWith("end")) left = anchor.right - floating.width;
    if (!vertical && placement.endsWith("start")) top = anchor.top;
    if (!vertical && placement.endsWith("end")) top = anchor.bottom - floating.height;
    return { left, top };
  }

  function overflowFor(candidate, floating, boundary, padding) {
    const left = Math.max(0, boundary.left + padding - candidate.left);
    const top = Math.max(0, boundary.top + padding - candidate.top);
    const right = Math.max(0, candidate.left + floating.width - (boundary.right - padding));
    const bottom = Math.max(0, candidate.top + floating.height - (boundary.bottom - padding));
    return { left, top, right, bottom, total: left + top + right + bottom };
  }

  function placeAnchoredPopover(options) {
    const anchor = options?.anchor;
    const boundary = options?.boundary;
    const floating = options?.floating;
    if (!anchor || !boundary || !floating) return null;
    const gap = Number.isFinite(options.gap) ? options.gap : 10;
    const padding = Number.isFinite(options.padding) ? options.padding : 12;
    const placements = options.placements?.length ? options.placements : defaultPlacements;
    let best = null;

    placements.forEach((placement, index) => {
      const candidate = candidateFor(placement, anchor, floating, gap);
      const overflow = overflowFor(candidate, floating, boundary, padding);
      const score = overflow.total * 10_000 + index;
      if (!best || score < best.score) best = { ...candidate, overflow, placement, score };
    });
    if (!best) return null;

    const minLeft = boundary.left + padding;
    const maxLeft = Math.max(minLeft, boundary.right - padding - floating.width);
    const minTop = boundary.top + padding;
    const maxTop = Math.max(minTop, boundary.bottom - padding - floating.height);
    return {
      left: clamp(best.left, minLeft, maxLeft),
      top: clamp(best.top, minTop, maxTop),
      placement: best.placement,
      overflow: best.overflow,
    };
  }

  root.REELAY_CANVAS_POPOVER_PLACEMENT = Object.freeze({
    placeAnchoredPopover,
  });
}(typeof globalThis === "object" ? globalThis : window));
