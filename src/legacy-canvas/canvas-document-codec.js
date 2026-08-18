(function registerCanvasDocumentCodec(root) {
  "use strict";

  const DOCUMENT_KIND = "reelay-legacy-canvas";
  const DOCUMENT_VERSION = 1;
  const MEDIA_TYPES = new Set(["image", "video", "audio"]);
  const GENERATOR_MODES = new Set(["image", "video"]);
  const MAX_COORDINATE = 1_000_000;
  const MAX_DIMENSION = 1_000_000;
  const MAX_Z_INDEX = 1_000_000;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function finiteNumber(value, fallback, min, max) {
    if (!Number.isFinite(value)) return fallback;
    return clamp(value, min, max);
  }

  function finiteInteger(value, fallback, min, max) {
    if (!Number.isFinite(value)) return fallback;
    return clamp(Math.round(value), min, max);
  }

  function boundedString(value, fallback = "", maxLength = 200) {
    if (typeof value !== "string") return fallback;
    return value.slice(0, maxLength);
  }

  function requiredId(value) {
    const id = boundedString(value, "", 200).trim();
    return id || null;
  }

  function optionalId(value) {
    return requiredId(value);
  }

  function sanitizeMediaUrl(value) {
    if (typeof value !== "string") return "";
    const url = value.trim().slice(0, 2_048);
    if (!url) return "";
    if (/^https?:\/\//i.test(url)) return url;
    if (/^\/(?!\/)/.test(url) || /^\.\.?\//.test(url)) return url;
    return "";
  }

  function serializeAsset(candidate) {
    if (!candidate || typeof candidate !== "object") return null;
    const id = requiredId(candidate.id);
    if (!id || !MEDIA_TYPES.has(candidate.type)) return null;

    const asset = {
      id,
      type: candidate.type,
    };
    if (typeof candidate.name === "string") asset.name = boundedString(candidate.name, "", 300);
    if (typeof candidate.displayName === "string") asset.displayName = boundedString(candidate.displayName, "", 300);
    if (typeof candidate.url === "string") asset.url = sanitizeMediaUrl(candidate.url);
    if (Number.isFinite(candidate.width)) asset.width = finiteNumber(candidate.width, 0, 0, MAX_DIMENSION);
    if (Number.isFinite(candidate.height)) asset.height = finiteNumber(candidate.height, 0, 0, MAX_DIMENSION);
    if (Number.isFinite(candidate.duration)) asset.duration = finiteNumber(candidate.duration, 0, 0, 86_400);
    if (Number.isFinite(candidate.aspectRatio)) asset.aspectRatio = finiteNumber(candidate.aspectRatio, 1, 0.01, 100);
    if (typeof candidate.source === "string") asset.source = boundedString(candidate.source, "", 80);
    if (typeof candidate.category === "string") asset.category = boundedString(candidate.category, "", 80);
    if (typeof candidate.librarySourceId === "string") {
      asset.librarySourceId = boundedString(candidate.librarySourceId, "", 200);
    }
    if (typeof candidate.enhanced === "boolean") asset.enhanced = candidate.enhanced;
    return asset;
  }

  function serializeNode(candidate) {
    if (!candidate || typeof candidate !== "object") return null;
    const id = requiredId(candidate.id);
    if (!id || (candidate.kind !== "generator" && candidate.kind !== "asset")) return null;

    const node = {
      id,
      kind: candidate.kind,
      x: finiteNumber(candidate.x, 0, -MAX_COORDINATE, MAX_COORDINATE),
      y: finiteNumber(candidate.y, 0, -MAX_COORDINATE, MAX_COORDINATE),
      z: finiteNumber(candidate.z, 1, 0, MAX_Z_INDEX),
    };
    const groupId = optionalId(candidate.groupId);
    if (groupId) node.groupId = groupId;

    const assets = Array.isArray(candidate.assets)
      ? candidate.assets.map(serializeAsset).filter(Boolean)
      : [];
    const activeAssetId = optionalId(candidate.activeAssetId);

    if (candidate.kind === "asset") {
      node.mode = MEDIA_TYPES.has(candidate.mode) ? candidate.mode : assets[0]?.type || "image";
      node.assets = assets;
      node.activeAssetId = activeAssetId && assets.some((asset) => asset.id === activeAssetId)
        ? activeAssetId
        : assets[0]?.id || null;
      return node;
    }

    const generatedAsset = serializeAsset(candidate.generatedAsset);
    node.mode = GENERATOR_MODES.has(candidate.mode) ? candidate.mode : "image";
    node.model = boundedString(candidate.model, "", 200);
    node.aspect = boundedString(candidate.aspect, "", 40);
    node.resolution = boundedString(candidate.resolution, "", 40);
    node.quality = boundedString(candidate.quality, "", 40);
    node.duration = boundedString(candidate.duration, "", 40);
    node.count = finiteInteger(candidate.count, 1, 1, 100);
    node.prompt = boundedString(candidate.prompt, "", 20_000);
    node.preview = candidate.preview === true;
    node.name = boundedString(candidate.name, "", 300);
    node.generatedAsset = generatedAsset;
    node.lockedMode = GENERATOR_MODES.has(candidate.lockedMode) ? candidate.lockedMode : null;
    node.assets = assets;
    node.activeAssetId = activeAssetId && assets.some((asset) => asset.id === activeAssetId)
      ? activeAssetId
      : assets[0]?.id || null;
    return node;
  }

  function serializeGroup(candidate, nodeIds) {
    if (!candidate || typeof candidate !== "object") return null;
    const id = requiredId(candidate.id);
    if (!id) return null;
    return {
      id,
      name: boundedString(candidate.name, "", 200),
      nodeIds: Array.isArray(candidate.nodeIds)
        ? candidate.nodeIds.filter((nodeId) => typeof nodeId === "string" && nodeIds.has(nodeId))
        : [],
      x: finiteNumber(candidate.x, 0, -MAX_COORDINATE, MAX_COORDINATE),
      y: finiteNumber(candidate.y, 0, -MAX_COORDINATE, MAX_COORDINATE),
      width: finiteNumber(candidate.width, 1, 1, MAX_DIMENSION),
      height: finiteNumber(candidate.height, 1, 1, MAX_DIMENSION),
      z: finiteNumber(candidate.z, 1, 0, MAX_Z_INDEX),
    };
  }

  function serializeConnections(candidates, nodeIds) {
    if (!Array.isArray(candidates)) return [];
    const seenIds = new Set();
    const seenEdges = new Set();
    const connections = [];

    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== "object") continue;
      const id = requiredId(candidate.id);
      const sourceNodeId = requiredId(candidate.sourceNodeId);
      const targetNodeId = requiredId(candidate.targetNodeId);
      if (
        !id
        || !sourceNodeId
        || !targetNodeId
        || sourceNodeId === targetNodeId
        || !nodeIds.has(sourceNodeId)
        || !nodeIds.has(targetNodeId)
      ) continue;

      const edgeKey = `${sourceNodeId}\u0000${targetNodeId}`;
      if (seenIds.has(id) || seenEdges.has(edgeKey)) continue;
      seenIds.add(id);
      seenEdges.add(edgeKey);

      const connection = { id, sourceNodeId, targetNodeId };
      if (Number.isFinite(candidate.sourceRatio)) {
        connection.sourceRatio = finiteNumber(candidate.sourceRatio, 0.5, 0.08, 0.92);
      }
      if (Number.isFinite(candidate.targetRatio)) {
        connection.targetRatio = finiteNumber(candidate.targetRatio, 0.5, 0.08, 0.92);
      }
      if (typeof candidate.sourcePortId === "string") {
        const sourcePortId = boundedString(candidate.sourcePortId, "", 240).trim();
        if (sourcePortId) connection.sourcePortId = sourcePortId;
      }
      if (typeof candidate.targetPortId === "string") {
        const targetPortId = boundedString(candidate.targetPortId, "", 240).trim();
        if (targetPortId) connection.targetPortId = targetPortId;
      }
      if (typeof candidate.createdAt === "string") {
        const createdAt = boundedString(candidate.createdAt, "", 80).trim();
        if (createdAt) connection.createdAt = createdAt;
      }
      connections.push(connection);
    }
    return connections;
  }

  function serializeCanvas(candidate, index) {
    if (!candidate || typeof candidate !== "object") return null;
    const id = requiredId(candidate.id);
    if (!id) return null;
    const nodes = Array.isArray(candidate.nodes) ? candidate.nodes.map(serializeNode).filter(Boolean) : [];
    const nodeIds = new Set(nodes.map((node) => node.id));
    const connections = serializeConnections(candidate.connections, nodeIds);
    const groups = Array.isArray(candidate.groups)
      ? candidate.groups.map((group) => serializeGroup(group, nodeIds)).filter(Boolean)
      : [];
    const groupIds = new Set(groups.map((group) => group.id));
    for (const node of nodes) {
      if (node.groupId && !groupIds.has(node.groupId)) delete node.groupId;
    }

    const viewport = candidate.viewport && typeof candidate.viewport === "object"
      ? candidate.viewport
      : candidate;
    return {
      id,
      name: boundedString(candidate.name, `画布 ${index + 1}`, 200).trim() || `画布 ${index + 1}`,
      nodes,
      connections,
      groups,
      viewport: {
        tx: finiteNumber(viewport.tx, 0, -MAX_COORDINATE, MAX_COORDINATE),
        ty: finiteNumber(viewport.ty, 0, -MAX_COORDINATE, MAX_COORDINATE),
        scale: finiteNumber(viewport.scale, 1, 0.01, 100),
      },
      zCounter: finiteNumber(candidate.zCounter, 1, 1, MAX_Z_INDEX),
    };
  }

  function serializeLastPreset(candidate) {
    const preset = candidate && typeof candidate === "object" ? candidate : {};
    return {
      mode: GENERATOR_MODES.has(preset.mode) ? preset.mode : "image",
      model: boundedString(preset.model, "", 200),
      aspect: boundedString(preset.aspect, "", 40),
      resolution: boundedString(preset.resolution, "", 40),
      quality: boundedString(preset.quality, "", 40),
      duration: boundedString(preset.duration, "", 40),
      count: finiteInteger(preset.count, 1, 1, 100),
    };
  }

  function createSnapshot(state) {
    const source = state && typeof state === "object" ? state : {};
    const canvases = Array.isArray(source.canvases)
      ? source.canvases.map(serializeCanvas).filter(Boolean)
      : [];
    const requestedActiveId = optionalId(source.activeCanvasId);
    const activeCanvasId = requestedActiveId && canvases.some((canvas) => canvas.id === requestedActiveId)
      ? requestedActiveId
      : canvases[0]?.id || null;
    return {
      kind: DOCUMENT_KIND,
      version: DOCUMENT_VERSION,
      activeCanvasId,
      canvases,
      lastPreset: serializeLastPreset(source.lastPreset),
    };
  }

  function restoreNode(node, promptInputHeight) {
    if (node.kind === "asset") {
      return {
        ...node,
        expanded: false,
        panel: null,
        mediaMenuOpen: false,
      };
    }
    return {
      ...node,
      credits: 0,
      generating: false,
      expanded: false,
      promptLarge: false,
      promptInputHeight,
      mediaMenuOpen: false,
      panel: null,
      modelFilter: node.mode,
    };
  }

  function restoreSnapshot(content, options = {}) {
    if (
      !content
      || typeof content !== "object"
      || content.kind !== DOCUMENT_KIND
      || content.version !== DOCUMENT_VERSION
    ) return null;

    const snapshot = createSnapshot(content);
    if (!snapshot.canvases.length) return null;
    const minScale = Number.isFinite(options.minScale) ? options.minScale : 0.2;
    const maxScale = Number.isFinite(options.maxScale) ? options.maxScale : 2;
    const promptInputHeight = finiteNumber(options.promptInputHeight, 112, 1, 10_000);
    const canvases = snapshot.canvases.map((canvas) => ({
      id: canvas.id,
      name: canvas.name,
      nodes: canvas.nodes.map((node) => restoreNode(node, promptInputHeight)),
      connections: canvas.connections,
      groups: canvas.groups,
      tx: canvas.viewport.tx,
      ty: canvas.viewport.ty,
      scale: clamp(canvas.viewport.scale, Math.min(minScale, maxScale), Math.max(minScale, maxScale)),
      zCounter: canvas.zCounter,
      undoStack: [],
    }));
    return {
      kind: DOCUMENT_KIND,
      version: DOCUMENT_VERSION,
      activeCanvasId: canvases.some((canvas) => canvas.id === snapshot.activeCanvasId)
        ? snapshot.activeCanvasId
        : canvases[0].id,
      canvases,
      lastPreset: snapshot.lastPreset,
    };
  }

  root.REELAY_CANVAS_DOCUMENT_CODEC = Object.freeze({
    createSnapshot,
    restoreSnapshot,
  });
}(typeof globalThis === "object" ? globalThis : window));
