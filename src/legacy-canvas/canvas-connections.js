(function registerCanvasConnections(root) {
  "use strict";

  const MEDIA_TYPES = new Set(["image", "video", "audio"]);

  function findNode(nodes, nodeId) {
    return nodes.find((node) => node.id === nodeId) || null;
  }

  function isGenerator(node) {
    return node?.kind === "generator";
  }

  function hasPath(connections, startNodeId, targetNodeId) {
    const adjacency = new Map();
    connections.forEach((connection) => {
      const targets = adjacency.get(connection.sourceNodeId) || [];
      targets.push(connection.targetNodeId);
      adjacency.set(connection.sourceNodeId, targets);
    });

    const pending = [startNodeId];
    const visited = new Set();
    while (pending.length) {
      const nodeId = pending.pop();
      if (nodeId === targetNodeId) return true;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);
      pending.push(...(adjacency.get(nodeId) || []));
    }
    return false;
  }

  function wouldCreateCycle(connections, sourceNodeId, targetNodeId) {
    if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) return true;
    return hasPath(connections, targetNodeId, sourceNodeId);
  }

  function canConnect(connections, nodes, sourceNodeId, targetNodeId) {
    const source = findNode(nodes, sourceNodeId);
    const target = findNode(nodes, targetNodeId);
    if (!source || !isGenerator(target)) return { ok: false, reason: "invalid-target" };
    if (sourceNodeId === targetNodeId) return { ok: false, reason: "self" };
    if (connections.some((item) => item.sourceNodeId === sourceNodeId && item.targetNodeId === targetNodeId)) {
      return { ok: false, reason: "duplicate" };
    }
    if (wouldCreateCycle(connections, sourceNodeId, targetNodeId)) {
      return { ok: false, reason: "cycle" };
    }
    return { ok: true, reason: null };
  }

  function normalizeConnections(connections, nodes) {
    const normalized = [];
    for (const candidate of Array.isArray(connections) ? connections : []) {
      if (!candidate || typeof candidate !== "object") continue;
      const id = typeof candidate.id === "string" ? candidate.id.trim().slice(0, 200) : "";
      const sourceNodeId = typeof candidate.sourceNodeId === "string"
        ? candidate.sourceNodeId.trim().slice(0, 200)
        : "";
      const targetNodeId = typeof candidate.targetNodeId === "string"
        ? candidate.targetNodeId.trim().slice(0, 200)
        : "";
      const source = findNode(nodes, sourceNodeId);
      const mediaType = MEDIA_TYPES.has(candidate.mediaType)
        ? candidate.mediaType
        : source?.mode;
      if (!id || !MEDIA_TYPES.has(mediaType)) continue;
      if (!canConnect(normalized, nodes, sourceNodeId, targetNodeId).ok) continue;
      const connection = { id, sourceNodeId, targetNodeId, mediaType };
      if (Number.isFinite(candidate.sourceRatio)) {
        connection.sourceRatio = Math.max(0.08, Math.min(0.92, candidate.sourceRatio));
      }
      if (Number.isFinite(candidate.targetRatio)) {
        connection.targetRatio = Math.max(0.08, Math.min(0.92, candidate.targetRatio));
      }
      if (typeof candidate.sourcePortId === "string" && candidate.sourcePortId.trim()) {
        connection.sourcePortId = candidate.sourcePortId.trim().slice(0, 240);
      }
      if (typeof candidate.targetPortId === "string" && candidate.targetPortId.trim()) {
        connection.targetPortId = candidate.targetPortId.trim().slice(0, 240);
      }
      normalized.push(connection);
    }
    return normalized;
  }

  function planBatchConnections(connections, nodes, sourceNodeIds, targetNodeId) {
    const working = Array.isArray(connections) ? connections.slice() : [];
    const validSourceIds = [];
    const rejected = [];
    const seen = new Set();
    for (const sourceNodeId of Array.isArray(sourceNodeIds) ? sourceNodeIds : []) {
      if (!sourceNodeId || seen.has(sourceNodeId)) continue;
      seen.add(sourceNodeId);
      const result = canConnect(working, nodes, sourceNodeId, targetNodeId);
      if (!result.ok) {
        rejected.push({ sourceNodeId, reason: result.reason });
        continue;
      }
      validSourceIds.push(sourceNodeId);
      working.push({ sourceNodeId, targetNodeId });
    }
    return Object.freeze({
      validSourceIds: Object.freeze(validSourceIds),
      rejected: Object.freeze(rejected.map((item) => Object.freeze(item))),
    });
  }

  function getBezierGeometry(source, target) {
    const distance = Math.max(0, target.x - source.x);
    const controlOffset = Math.max(72, Math.min(240, distance * 0.48 || Math.abs(target.y - source.y) * 0.34));
    return {
      source,
      sourceControl: { x: source.x + controlOffset, y: source.y },
      targetControl: { x: target.x - controlOffset, y: target.y },
      target,
    };
  }

  function getBezierPath(source, target, { reverse = false } = {}) {
    const geometry = getBezierGeometry(source, target);
    if (reverse) {
      return `M ${target.x} ${target.y} C ${geometry.targetControl.x} ${geometry.targetControl.y}, ${geometry.sourceControl.x} ${geometry.sourceControl.y}, ${source.x} ${source.y}`;
    }
    return `M ${source.x} ${source.y} C ${geometry.sourceControl.x} ${geometry.sourceControl.y}, ${geometry.targetControl.x} ${geometry.targetControl.y}, ${target.x} ${target.y}`;
  }

  function getBezierLength(source, target, sampleCount = 16) {
    const geometry = getBezierGeometry(source, target);
    const samples = Math.max(4, Math.min(64, Math.round(sampleCount) || 16));
    let previous = source;
    let length = 0;
    for (let index = 1; index <= samples; index += 1) {
      const t = index / samples;
      const inverse = 1 - t;
      const point = {
        x: inverse ** 3 * source.x
          + 3 * inverse ** 2 * t * geometry.sourceControl.x
          + 3 * inverse * t ** 2 * geometry.targetControl.x
          + t ** 3 * target.x,
        y: inverse ** 3 * source.y
          + 3 * inverse ** 2 * t * geometry.sourceControl.y
          + 3 * inverse * t ** 2 * geometry.targetControl.y
          + t ** 3 * target.y,
      };
      length += Math.hypot(point.x - previous.x, point.y - previous.y);
      previous = point;
    }
    return length;
  }

  root.REELAY_CANVAS_CONNECTIONS = Object.freeze({
    canConnect,
    getBezierLength,
    getBezierPath,
    normalizeConnections,
    planBatchConnections,
    wouldCreateCycle,
  });
}(typeof globalThis === "object" ? globalThis : window));
