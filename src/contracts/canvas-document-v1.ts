export const LEGACY_CANVAS_DOCUMENT_SCHEMA_VERSION = 1 as const;
export const LEGACY_CANVAS_DOCUMENT_KIND = "reelay-legacy-canvas" as const;

type MediaKind = "image" | "video" | "audio";
type GeneratorMediaKind = "image" | "video";

export interface LegacyCanvasAssetV1 {
  id: string;
  type: MediaKind;
  name?: string;
  displayName?: string;
  url?: string;
  width?: number;
  height?: number;
  duration?: number;
  aspectRatio?: number;
  source?: string;
  category?: string;
  librarySourceId?: string;
  enhanced?: boolean;
}

export interface LegacyCanvasNodeV1 {
  id: string;
  kind: "generator" | "asset";
  x: number;
  y: number;
  z: number;
  groupId?: string;
  mode?: MediaKind;
  mediaKind?: GeneratorMediaKind;
  model?: string;
  aspect?: string;
  resolution?: string;
  quality?: string;
  duration?: string;
  count?: number;
  workflow?: string;
  audioEnabled?: boolean;
  autoLinkEnabled?: boolean;
  assetValidationEnabled?: boolean;
  prompt?: string;
  preview?: boolean;
  name?: string;
  generatedAsset?: LegacyCanvasAssetV1 | null;
  assets: LegacyCanvasAssetV1[];
  activeAssetId: string | null;
}

export interface LegacyCanvasConnectionV1 {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceRatio?: number;
  targetRatio?: number;
  sourcePortId?: string;
  targetPortId?: string;
  createdAt?: string;
}

export interface LegacyCanvasGroupV1 {
  id: string;
  name: string;
  nodeIds: string[];
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
}

export interface LegacyCanvasV1 {
  id: string;
  name: string;
  nodes: LegacyCanvasNodeV1[];
  connections: LegacyCanvasConnectionV1[];
  groups: LegacyCanvasGroupV1[];
  viewport: { tx: number; ty: number; scale: number };
  zCounter: number;
}

export interface LegacyCanvasDocumentV1 {
  kind: typeof LEGACY_CANVAS_DOCUMENT_KIND;
  version: typeof LEGACY_CANVAS_DOCUMENT_SCHEMA_VERSION;
  activeCanvasId: string;
  canvases: LegacyCanvasV1[];
  lastPreset: {
    mode: GeneratorMediaKind;
    model: string;
    aspect: string;
    resolution: string;
    quality: string;
    duration: string;
    count: number;
    workflow: string;
    audioEnabled: boolean;
  };
}

export interface LegacyCanvasDocumentEnvelopeV1 {
  schemaVersion: typeof LEGACY_CANVAS_DOCUMENT_SCHEMA_VERSION;
  content: LegacyCanvasDocumentV1;
}

const MEDIA_TYPES = new Set<MediaKind>(["image", "video", "audio"]);
const GENERATOR_MEDIA_TYPES = new Set<GeneratorMediaKind>(["image", "video"]);
const MAX_COORDINATE = 1_000_000;
const MAX_DIMENSION = 1_000_000;
const MAX_Z_INDEX = 1_000_000;
const MAX_CANVASES = 100;
const MAX_NODES_PER_CANVAS = 2_000;
const MAX_CONNECTIONS_PER_CANVAS = 5_000;
const MAX_GROUPS_PER_CANVAS = 500;
const MAX_ASSETS_PER_NODE = 200;
const MAX_GROUP_NODE_IDS = 2_000;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finiteNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value) ? clamp(value, min, max) : fallback;
}

function finiteInteger(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? clamp(Math.round(value), min, max)
    : fallback;
}

function boundedString(value: unknown, fallback = "", maxLength = 200): string {
  return typeof value === "string" ? value.slice(0, maxLength) : fallback;
}

function requiredId(value: unknown): string | null {
  const id = boundedString(value, "", 200).trim();
  return id || null;
}

export function sanitizePersistedMediaUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const url = value.trim().slice(0, 2_048);
  if (!url || /[\u0000-\u001f\u007f<>"'`]/.test(url)) return "";
  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:" ? url : "";
    } catch {
      return "";
    }
  }
  return /^\/(?!\/)/.test(url) || /^\.\.?\//.test(url) ? url : "";
}

function serializeAsset(value: unknown): LegacyCanvasAssetV1 | null {
  const candidate = record(value);
  if (!candidate) return null;
  const id = requiredId(candidate.id);
  if (!id || !MEDIA_TYPES.has(candidate.type as MediaKind)) return null;
  const asset: LegacyCanvasAssetV1 = { id, type: candidate.type as MediaKind };
  if (typeof candidate.name === "string") asset.name = boundedString(candidate.name, "", 300);
  if (typeof candidate.displayName === "string") asset.displayName = boundedString(candidate.displayName, "", 300);
  if (typeof candidate.url === "string") asset.url = sanitizePersistedMediaUrl(candidate.url);
  if (typeof candidate.width === "number" && Number.isFinite(candidate.width)) asset.width = finiteNumber(candidate.width, 0, 0, MAX_DIMENSION);
  if (typeof candidate.height === "number" && Number.isFinite(candidate.height)) asset.height = finiteNumber(candidate.height, 0, 0, MAX_DIMENSION);
  if (typeof candidate.duration === "number" && Number.isFinite(candidate.duration)) asset.duration = finiteNumber(candidate.duration, 0, 0, 86_400);
  if (typeof candidate.aspectRatio === "number" && Number.isFinite(candidate.aspectRatio)) asset.aspectRatio = finiteNumber(candidate.aspectRatio, 1, 0.01, 100);
  if (typeof candidate.source === "string") asset.source = boundedString(candidate.source, "", 80);
  if (typeof candidate.category === "string") asset.category = boundedString(candidate.category, "", 80);
  if (typeof candidate.librarySourceId === "string") asset.librarySourceId = boundedString(candidate.librarySourceId, "", 200);
  if (typeof candidate.enhanced === "boolean") asset.enhanced = candidate.enhanced;
  return asset;
}

function generatorMediaKind(candidate: Record<string, unknown>, generatedAsset: LegacyCanvasAssetV1 | null): GeneratorMediaKind {
  for (const value of [candidate.mediaKind, candidate.lockedMode, generatedAsset?.type, candidate.mode]) {
    if (GENERATOR_MEDIA_TYPES.has(value as GeneratorMediaKind)) return value as GeneratorMediaKind;
  }
  return "image";
}

function serializeNode(value: unknown): LegacyCanvasNodeV1 | null {
  const candidate = record(value);
  if (!candidate) return null;
  const id = requiredId(candidate.id);
  if (!id || (candidate.kind !== "generator" && candidate.kind !== "asset")) return null;
  const assets = Array.isArray(candidate.assets)
    ? candidate.assets.slice(0, MAX_ASSETS_PER_NODE).map(serializeAsset).filter((asset): asset is LegacyCanvasAssetV1 => Boolean(asset))
    : [];
  const requestedActiveAssetId = requiredId(candidate.activeAssetId);
  const activeAssetId = requestedActiveAssetId && assets.some((asset) => asset.id === requestedActiveAssetId)
    ? requestedActiveAssetId
    : assets[0]?.id ?? null;
  const node: LegacyCanvasNodeV1 = {
    id,
    kind: candidate.kind,
    x: finiteNumber(candidate.x, 0, -MAX_COORDINATE, MAX_COORDINATE),
    y: finiteNumber(candidate.y, 0, -MAX_COORDINATE, MAX_COORDINATE),
    z: finiteNumber(candidate.z, 1, 0, MAX_Z_INDEX),
    assets,
    activeAssetId,
  };
  const groupId = requiredId(candidate.groupId);
  if (groupId) node.groupId = groupId;
  if (candidate.kind === "asset") {
    node.mode = MEDIA_TYPES.has(candidate.mode as MediaKind) ? candidate.mode as MediaKind : assets[0]?.type ?? "image";
    return node;
  }
  const generatedAsset = serializeAsset(candidate.generatedAsset);
  const mediaKind = generatorMediaKind(candidate, generatedAsset);
  node.mediaKind = mediaKind;
  node.model = boundedString(candidate.model, "", 200);
  node.aspect = boundedString(candidate.aspect, "", 40);
  node.resolution = boundedString(candidate.resolution, "", 40);
  node.quality = boundedString(candidate.quality, "", 40);
  node.duration = boundedString(candidate.duration, "", 40);
  node.count = finiteInteger(candidate.count, 1, 1, 100);
  node.workflow = boundedString(candidate.workflow, "", 80);
  node.audioEnabled = candidate.audioEnabled === true;
  node.autoLinkEnabled = candidate.autoLinkEnabled !== false;
  node.assetValidationEnabled = mediaKind === "video" && candidate.assetValidationEnabled === true;
  node.prompt = boundedString(candidate.prompt, "", 20_000);
  node.preview = candidate.preview === true;
  node.name = boundedString(candidate.name, "", 300);
  node.generatedAsset = generatedAsset?.type === mediaKind ? generatedAsset : null;
  return node;
}

function serializeConnections(value: unknown, nodeIds: Set<string>): LegacyCanvasConnectionV1[] {
  if (!Array.isArray(value)) return [];
  const seenIds = new Set<string>();
  const seenEdges = new Set<string>();
  const connections: LegacyCanvasConnectionV1[] = [];
  for (const raw of value.slice(0, MAX_CONNECTIONS_PER_CANVAS)) {
    const candidate = record(raw);
    if (!candidate) continue;
    const id = requiredId(candidate.id);
    const sourceNodeId = requiredId(candidate.sourceNodeId);
    const targetNodeId = requiredId(candidate.targetNodeId);
    if (!id || !sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId || !nodeIds.has(sourceNodeId) || !nodeIds.has(targetNodeId)) continue;
    const edgeKey = `${sourceNodeId}\u0000${targetNodeId}`;
    if (seenIds.has(id) || seenEdges.has(edgeKey)) continue;
    seenIds.add(id);
    seenEdges.add(edgeKey);
    const connection: LegacyCanvasConnectionV1 = { id, sourceNodeId, targetNodeId };
    if (typeof candidate.sourceRatio === "number" && Number.isFinite(candidate.sourceRatio)) connection.sourceRatio = finiteNumber(candidate.sourceRatio, 0.5, 0.08, 0.92);
    if (typeof candidate.targetRatio === "number" && Number.isFinite(candidate.targetRatio)) connection.targetRatio = finiteNumber(candidate.targetRatio, 0.5, 0.08, 0.92);
    const sourcePortId = requiredId(candidate.sourcePortId);
    const targetPortId = requiredId(candidate.targetPortId);
    if (sourcePortId) connection.sourcePortId = boundedString(sourcePortId, "", 240);
    if (targetPortId) connection.targetPortId = boundedString(targetPortId, "", 240);
    const createdAt = boundedString(candidate.createdAt, "", 80).trim();
    if (createdAt) connection.createdAt = createdAt;
    connections.push(connection);
  }
  return connections;
}

function serializeGroup(value: unknown, nodeIds: Set<string>): LegacyCanvasGroupV1 | null {
  const candidate = record(value);
  if (!candidate) return null;
  const id = requiredId(candidate.id);
  if (!id) return null;
  return {
    id,
    name: boundedString(candidate.name, "", 200),
    nodeIds: Array.isArray(candidate.nodeIds)
      ? candidate.nodeIds.slice(0, MAX_GROUP_NODE_IDS).filter((nodeId): nodeId is string => typeof nodeId === "string" && nodeIds.has(nodeId))
      : [],
    x: finiteNumber(candidate.x, 0, -MAX_COORDINATE, MAX_COORDINATE),
    y: finiteNumber(candidate.y, 0, -MAX_COORDINATE, MAX_COORDINATE),
    width: finiteNumber(candidate.width, 1, 1, MAX_DIMENSION),
    height: finiteNumber(candidate.height, 1, 1, MAX_DIMENSION),
    z: finiteNumber(candidate.z, 1, 0, MAX_Z_INDEX),
  };
}

function serializeCanvas(value: unknown, index: number): LegacyCanvasV1 | null {
  const candidate = record(value);
  if (!candidate) return null;
  const id = requiredId(candidate.id);
  if (!id) return null;
  const nodes = Array.isArray(candidate.nodes)
    ? candidate.nodes.slice(0, MAX_NODES_PER_CANVAS).map(serializeNode).filter((node): node is LegacyCanvasNodeV1 => Boolean(node))
    : [];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const groups = Array.isArray(candidate.groups)
    ? candidate.groups.slice(0, MAX_GROUPS_PER_CANVAS).map((group) => serializeGroup(group, nodeIds)).filter((group): group is LegacyCanvasGroupV1 => Boolean(group))
    : [];
  const groupIds = new Set(groups.map((group) => group.id));
  for (const node of nodes) if (node.groupId && !groupIds.has(node.groupId)) delete node.groupId;
  const viewport = record(candidate.viewport) ?? candidate;
  return {
    id,
    name: boundedString(candidate.name, `画布 ${index + 1}`, 200).trim() || `画布 ${index + 1}`,
    nodes,
    connections: serializeConnections(candidate.connections, nodeIds),
    groups,
    viewport: {
      tx: finiteNumber(viewport.tx, 0, -MAX_COORDINATE, MAX_COORDINATE),
      ty: finiteNumber(viewport.ty, 0, -MAX_COORDINATE, MAX_COORDINATE),
      scale: finiteNumber(viewport.scale, 1, 0.01, 100),
    },
    zCounter: finiteNumber(candidate.zCounter, 1, 1, MAX_Z_INDEX),
  };
}

function serializeLastPreset(value: unknown): LegacyCanvasDocumentV1["lastPreset"] {
  const candidate = record(value) ?? {};
  return {
    mode: GENERATOR_MEDIA_TYPES.has(candidate.mode as GeneratorMediaKind) ? candidate.mode as GeneratorMediaKind : "image",
    model: boundedString(candidate.model, "", 200),
    aspect: boundedString(candidate.aspect, "", 40),
    resolution: boundedString(candidate.resolution, "", 40),
    quality: boundedString(candidate.quality, "", 40),
    duration: boundedString(candidate.duration, "", 40),
    count: finiteInteger(candidate.count, 1, 1, 100),
    workflow: boundedString(candidate.workflow, "", 80),
    audioEnabled: candidate.audioEnabled === true,
  };
}

export function canonicalizeLegacyCanvasDocumentV1(value: unknown): LegacyCanvasDocumentV1 | null {
  const source = record(value);
  if (!source || source.kind !== LEGACY_CANVAS_DOCUMENT_KIND || source.version !== LEGACY_CANVAS_DOCUMENT_SCHEMA_VERSION) return null;
  const canvases = Array.isArray(source.canvases)
    ? source.canvases.slice(0, MAX_CANVASES).map(serializeCanvas).filter((canvas): canvas is LegacyCanvasV1 => Boolean(canvas))
    : [];
  if (!canvases.length) return null;
  const requestedActiveCanvasId = requiredId(source.activeCanvasId);
  return {
    kind: LEGACY_CANVAS_DOCUMENT_KIND,
    version: LEGACY_CANVAS_DOCUMENT_SCHEMA_VERSION,
    activeCanvasId: requestedActiveCanvasId && canvases.some((canvas) => canvas.id === requestedActiveCanvasId)
      ? requestedActiveCanvasId
      : canvases[0].id,
    canvases,
    lastPreset: serializeLastPreset(source.lastPreset),
  };
}

export function canonicalizeLegacyCanvasDocumentEnvelopeV1(
  schemaVersion: unknown,
  content: unknown,
): LegacyCanvasDocumentEnvelopeV1 | null {
  if (schemaVersion !== LEGACY_CANVAS_DOCUMENT_SCHEMA_VERSION) return null;
  const canonicalContent = canonicalizeLegacyCanvasDocumentV1(content);
  return canonicalContent ? { schemaVersion: LEGACY_CANVAS_DOCUMENT_SCHEMA_VERSION, content: canonicalContent } : null;
}
