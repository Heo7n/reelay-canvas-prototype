(function registerCanvasNodePlacement(root) {
  "use strict";

  const defaultPortOffset = 32;

  function getNodePosition({ world, layout, anchor = "media-center", portOffset = defaultPortOffset }) {
    if (!world || !layout) return null;
    const nodeWidth = Number(layout.nodeWidth);
    const mediaWidth = Number(layout.mediaWidth);
    const mediaHeight = Number(layout.mediaHeight);
    if (
      !Number.isFinite(world.x)
      || !Number.isFinite(world.y)
      || !Number.isFinite(nodeWidth)
      || !Number.isFinite(mediaWidth)
      || !Number.isFinite(mediaHeight)
    ) return null;

    const mediaInsetX = (nodeWidth - mediaWidth) / 2;
    if (anchor === "input") {
      return {
        x: world.x - mediaInsetX + portOffset,
        y: world.y - mediaHeight / 2,
      };
    }
    if (anchor === "output") {
      return {
        x: world.x - mediaInsetX - mediaWidth - portOffset,
        y: world.y - mediaHeight / 2,
      };
    }
    return {
      x: world.x - nodeWidth / 2,
      y: world.y - mediaHeight / 2,
    };
  }

  function getBottomCenterAnchoredPosition({ position, currentLayout, nextLayout }) {
    if (!position || !currentLayout || !nextLayout) return null;
    const x = Number(position.x);
    const y = Number(position.y);
    const currentNodeWidth = Number(currentLayout.nodeWidth);
    const currentMediaHeight = Number(currentLayout.mediaHeight);
    const nextNodeWidth = Number(nextLayout.nodeWidth);
    const nextMediaHeight = Number(nextLayout.mediaHeight);
    if (
      !Number.isFinite(x)
      || !Number.isFinite(y)
      || !Number.isFinite(currentNodeWidth)
      || !Number.isFinite(currentMediaHeight)
      || !Number.isFinite(nextNodeWidth)
      || !Number.isFinite(nextMediaHeight)
    ) return null;

    const mediaCenterX = x + currentNodeWidth / 2;
    const mediaBottom = y + currentMediaHeight;
    return {
      x: mediaCenterX - nextNodeWidth / 2,
      y: mediaBottom - nextMediaHeight,
    };
  }

  root.REELAY_CANVAS_NODE_PLACEMENT = Object.freeze({
    defaultPortOffset,
    getNodePosition,
    getBottomCenterAnchoredPosition,
  });
}(typeof globalThis === "object" ? globalThis : window));
