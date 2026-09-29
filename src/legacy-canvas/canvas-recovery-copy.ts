import { canonicalizeLegacyCanvasDocumentEnvelopeV1, type LegacyCanvasDocumentV1 } from "../contracts/canvas-document-v1";

export function recoveryContent(content: unknown): LegacyCanvasDocumentV1 {
  const canonical = canonicalizeLegacyCanvasDocumentEnvelopeV1(1, content)?.content;
  if (!canonical) throw new Error("画布副本无法安全读取，已保留当前页面，请勿刷新。");
  const source = content as { canvases?: { nodes?: { assets?: unknown[] }[]; groups?: unknown[]; connections?: unknown[] }[] };
  const truncated = source.canvases?.length !== canonical.canvases.length || source.canvases?.some((canvas, index) => {
    const saved = canonical.canvases[index];
    return !saved || (canvas.nodes?.length ?? 0) !== saved.nodes.length
      || (canvas.groups?.length ?? 0) !== saved.groups.length || (canvas.connections?.length ?? 0) !== saved.connections.length
      || canvas.nodes?.some((node, nodeIndex) => (node.assets?.length ?? 0) !== saved.nodes[nodeIndex]?.assets.length);
  });
  if (truncated) throw new Error("画布内容超出保存范围，无法完整建立副本。当前修改仍保留在此页面，请勿刷新。");
  return canonical;
}

// Copies are complete internal canvases, not a node-level merge. Stable IDs
// make a retry discover a prior successful save whose response was lost.
export function createRecoveryCopies(content: unknown, makeId = () => crypto.randomUUID()) {
  const local = recoveryContent(content);
  const copies = local.canvases.map((canvas) => {
    const nodeIds = new Map(canvas.nodes.map((node) => [node.id, makeId()]));
    const groupIds = new Map(canvas.groups.map((group) => [group.id, makeId()]));
    const connectionIds = new Map(canvas.connections.map((connection) => [connection.id, makeId()]));
    const nodes = canvas.nodes.map((original) => {
      const assetIds = new Map(original.assets.map((asset) => [asset.id, makeId()]));
      const remapReference = (key: string) => {
        const split = key.indexOf(":");
        const kind = key.slice(0, split);
        const mapped = (kind === "asset" ? assetIds : kind === "connection" ? connectionIds : undefined)?.get(key.slice(split + 1));
        return mapped ? `${kind}:${mapped}` : undefined;
      };
      const node = structuredClone(original);
      node.id = nodeIds.get(original.id)!;
      node.assets = node.assets.map((asset) => ({ ...asset, id: assetIds.get(asset.id)! }));
      node.activeAssetId = assetIds.get(original.activeAssetId || "") || node.assets[0]?.id || null;
      if (node.groupId) node.groupId = groupIds.get(node.groupId);
      if (node.generatedAsset) node.generatedAsset.id = makeId();
      if (node.referenceOrder) node.referenceOrder = node.referenceOrder.flatMap((key) => remapReference(key) || []);
      if (node.prompt && typeof node.prompt !== "string") {
        for (const part of node.prompt.content) {
          if (part.type === "reference") part.key = remapReference(part.key) || part.key;
        }
      }
      // Frozen generation provenance describes the original task/result, not
      // this placement. Preserve it just like the existing canvas-copy path.
      return node;
    });
    return { ...canvas, id: makeId(), name: `${canvas.name.slice(0, 190)} · 恢复副本`, nodes,
      groups: canvas.groups.map((group) => ({ ...group, id: groupIds.get(group.id)!, nodeIds: group.nodeIds.map((id) => nodeIds.get(id)!) })),
      connections: canvas.connections.map((connection) => ({ ...connection, id: connectionIds.get(connection.id)!,
        sourceNodeId: nodeIds.get(connection.sourceNodeId)!, targetNodeId: nodeIds.get(connection.targetNodeId)!,
        ...(connection.sourcePortId ? { sourcePortId: `${nodeIds.get(connection.sourceNodeId)!}:output` } : {}),
        ...(connection.targetPortId ? { targetPortId: `${nodeIds.get(connection.targetNodeId)!}:input` } : {}) })) };
  });
  return { canvases: copies, activeCanvasId: copies[local.canvases.findIndex((canvas) => canvas.id === local.activeCanvasId)]!.id };
}

export function appendRecoveryCopies(latestContent: unknown, copies: ReturnType<typeof createRecoveryCopies>) {
  const latest = recoveryContent(latestContent);
  const missing = copies.canvases.filter((copy) => {
    const existing = latest.canvases.find((canvas) => canvas.id === copy.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(copy)) {
      throw new Error("恢复副本已被其他窗口修改，请保留当前页面后再处理。");
    }
    return !existing;
  });
  const content = { ...latest, canvases: [...latest.canvases, ...missing], activeCanvasId: copies.activeCanvasId };
  // The persistence codec has bounded collections: never silently truncate a
  // recovery operation to fit its limits.
  if (canonicalizeLegacyCanvasDocumentEnvelopeV1(1, content)?.content.canvases.length !== content.canvases.length) {
    throw new Error("项目画布数量已达上限，无法添加全部恢复副本。当前修改仍保留在此页面，请勿刷新。");
  }
  return { content, alreadySaved: missing.length === 0 && latest.activeCanvasId === copies.activeCanvasId };
}
