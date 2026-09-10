(function registerAgentResultPlacement(root) {
  "use strict";

  const GAP = 64;
  const CLEARANCE = 48;

  function boundsOf(value) {
    if (!value || ![value.left, value.top, value.right, value.bottom].every(Number.isFinite)
      || value.right <= value.left || value.bottom <= value.top) return null;
    return { left: value.left, top: value.top, right: value.right, bottom: value.bottom,
      width: value.right - value.left, height: value.bottom - value.top };
  }

  function assetIds(asset) {
    return [asset?.id, asset?.sourceAssetId, asset?.librarySourceId]
      .filter((id) => typeof id === "string" && id.length > 0);
  }

  function overlaps(point, size, obstacle) {
    return point.x < obstacle.right + CLEARANCE && point.x + size.width + CLEARANCE > obstacle.left
      && point.y < obstacle.bottom + CLEARANCE && point.y + size.height + CLEARANCE > obstacle.top;
  }

  function belowCollisions(origin, size, obstacles) {
    const point = { ...origin };
    // Each step passes at least one obstacle's bottom; no arbitrary search limit is needed.
    for (;;) {
      const collisions = obstacles.filter((obstacle) => overlaps(point, size, obstacle));
      if (!collisions.length) return point;
      point.y = Math.max(...collisions.map((obstacle) => obstacle.bottom)) + GAP;
    }
  }

  function nearestFreePosition(origin, size, obstacles) {
    if (!obstacles.some((obstacle) => overlaps(origin, size, obstacle))) return origin;
    const candidates = [];
    for (const obstacle of obstacles) {
      const left = obstacle.left - size.width - GAP;
      const right = obstacle.right + GAP;
      const top = obstacle.top - size.height - GAP;
      const bottom = obstacle.bottom + GAP;
      candidates.push({ x: right, y: origin.y }, { x: origin.x, y: bottom },
        { x: left, y: origin.y }, { x: origin.x, y: top },
        { x: right, y: bottom }, { x: left, y: bottom },
        { x: right, y: top }, { x: left, y: top });
    }
    // Distance to the submitted viewport center wins; insertion order breaks ties.
    candidates.sort((a, b) => (a.x - origin.x) ** 2 + (a.y - origin.y) ** 2
      - ((b.x - origin.x) ** 2 + (b.y - origin.y) ** 2));
    return candidates.find((point) => !obstacles.some((obstacle) => overlaps(point, size, obstacle)))
      || belowCollisions(origin, size, obstacles);
  }

  function createController({ getProjectId, getCanvas, isEditable, getViewport,
    getNodeBounds, getNodeMedia, createNode, commitNode, isAccessible = isEditable, focusNode = () => false }) {
    const targets = new WeakSet();
    const placements = new WeakMap();

    function capture(scope, input) {
      if (!scope || scope.projectId !== getProjectId()) return null;
      const canvas = getCanvas(scope.canvasId);
      if (!canvas || !Array.isArray(canvas.nodes) || !isEditable(canvas, scope)) return null;
      const viewport = boundsOf(getViewport(canvas, scope));
      if (!viewport) return null;
      const references = [...(input?.references || []),
        ...(input?.referenceSnapshot || []).map((entry) => entry.asset)];
      const referenceIds = new Set(references.flatMap(assetIds));
      const referenceNodes = canvas.nodes.filter((node) => assetIds(getNodeMedia(node))
        .some((id) => referenceIds.has(id)));
      const target = Object.freeze({ projectId: scope.projectId, canvasId: scope.canvasId,
        canvas, referenceNodes: Object.freeze(referenceNodes),
        center: Object.freeze({ x: (viewport.left + viewport.right) / 2, y: (viewport.top + viewport.bottom) / 2 }) });
      targets.add(target);
      return target;
    }

    function place(task, target) {
      if (!task || typeof task !== "object" || task.status !== "succeeded") return null;
      if (placements.has(task)) return placements.get(task)?.placement || null;
      // A completion is consumed even when its destination no longer permits writes.
      // Mark it before collaborator calls so reentrant notifications cannot duplicate it.
      placements.set(task, null);
      if (!target || !targets.has(target) || task.scope?.projectId !== target.projectId
        || task.scope?.canvasId !== target.canvasId || getProjectId() !== target.projectId
        || getCanvas(target.canvasId) !== target.canvas || !isEditable(target.canvas, task.scope)) return null;
      const canvas = target.canvas;
      if (!Array.isArray(canvas.nodes)) return null;
      const node = createNode(task.result);
      if (!node || typeof node.id !== "string" || !Number.isFinite(node.x) || !Number.isFinite(node.y)) return null;
      const size = boundsOf(getNodeBounds(node, canvas));
      if (!size) return null;
      const existing = new Map(canvas.nodes.map((item) => [item, boundsOf(getNodeBounds(item, canvas))]));
      const obstacles = [...existing.values()].filter(Boolean);
      const references = target.referenceNodes.map((item) => existing.get(item)).filter(Boolean);
      const point = references.length
        ? belowCollisions({ x: Math.max(...references.map((item) => item.right)) + GAP,
          y: Math.min(...references.map((item) => item.top)) }, size, obstacles)
        : nearestFreePosition({ x: target.center.x - size.width / 2,
          y: target.center.y - size.height / 2 }, size, obstacles);
      node.x += point.x - size.left;
      node.y += point.y - size.top;
      // Geometry and node construction are adapters; recheck identity after invoking them.
      if (getProjectId() !== target.projectId || getCanvas(target.canvasId) !== canvas
        || !isEditable(canvas, task.scope) || commitNode(canvas, node) === false) return null;
      const placement = Object.freeze({ nodeId: node.id, canvasId: target.canvasId });
      placements.set(task, { placement, target, node });
      return placement;
    }

    function locate(task) {
      if (!task || typeof task !== "object" || task.status !== "succeeded") return false;
      const entry = placements.get(task);
      if (!entry) return false;
      const { placement, target, node } = entry;
      // IDs describe the record; object identity binds navigation to its actual delivered result.
      if (task.addedNodeId !== placement.nodeId || task.addedCanvasId !== placement.canvasId
        || task.scope?.projectId !== target.projectId || task.scope?.canvasId !== target.canvasId
        || getProjectId() !== target.projectId || getCanvas(target.canvasId) !== target.canvas
        || !isAccessible(target.canvas, task.scope) || node.id !== placement.nodeId
        || !target.canvas.nodes?.includes(node)) return false;
      return focusNode(target.canvas, node) !== false;
    }

    return Object.freeze({ capture, place, locate });
  }

  root.REELAY_AGENT_RESULT_PLACEMENT = Object.freeze({ createController });
})(globalThis);
