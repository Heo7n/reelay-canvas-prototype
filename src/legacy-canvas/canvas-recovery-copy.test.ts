import { describe, expect, it } from "vitest";
import { canonicalizeLegacyCanvasDocumentV1 } from "../contracts/canvas-document-v1";
import { appendRecoveryCopies, createRecoveryCopies } from "./canvas-recovery-copy";

const generation = { version: 1, stage: "draft", simulated: true, taskId: "task", resultId: "result", createdAt: 1000,
  projectId: "project", canvasId: "original", expiresAt: 604801000,
  input: { mediaType: "video", modelId: "seedance-2-5-draft", prompt: "Original prompt",
    parameters: { quality: "480p", duration: "10s", outputDuration: 10, seed: 42, audioEnabled: true },
    references: [{ id: "ref", type: "image", url: "/ref.jpg" }] } };
function fixture(count = 1) {
  return canonicalizeLegacyCanvasDocumentV1({ kind: "reelay-legacy-canvas", version: 1, activeCanvasId: "original",
    canvases: Array.from({ length: count }, (_, index) => ({ id: index ? `canvas-${index}` : "original", name: "原画布",
      nodes: [
        { id: "draft", kind: "generator", mediaKind: "video", groupId: "group", generatedAsset: { id: "result", type: "video", url: "/clip.mp4", generation } },
        { id: "target", kind: "generator", mediaKind: "video", groupId: "group", assets: [{ id: "ref", type: "image", url: "/ref.jpg" }], activeAssetId: "ref",
          prompt: { version: 1, content: [{ type: "reference", key: "asset:ref", mediaType: "image", fallbackLabel: "图片1" },
            { type: "reference", key: "connection:edge", mediaType: "video", fallbackLabel: "视频1" },
            { type: "reference", key: "connection:removed", mediaType: "video", fallbackLabel: "已移除" }] },
          referenceOrder: ["asset:ref", "connection:edge"] },
      ], connections: [{ id: "edge", sourceNodeId: "draft", targetNodeId: "target", sourcePortId: "draft:output", targetPortId: "target:input" }],
      groups: [{ id: "group", name: "组", nodeIds: ["draft", "target"], x: 0, y: 0, width: 500, height: 300, z: 1 }],
    })) })!;
}

describe("recovery copies", () => {
  it("remaps placement identities, group membership, edges, ordered references and prompt bindings together", () => {
    const original = fixture(2);
    const copies = createRecoveryCopies(original);
    const ids = new Set<string>();
    for (const canvas of copies.canvases) {
      const [draft, target] = canvas.nodes;
      const edge = canvas.connections[0]!;
      const group = canvas.groups[0]!;
      for (const id of [canvas.id, draft!.id, target!.id, edge.id, group.id, target!.assets[0]!.id]) {
        expect(ids.has(id)).toBe(false); ids.add(id);
      }
      expect(group.nodeIds).toEqual([draft!.id, target!.id]);
      expect(draft!.groupId).toBe(group.id); expect(target!.groupId).toBe(group.id);
      expect(edge.sourceNodeId).toBe(draft!.id); expect(edge.targetNodeId).toBe(target!.id);
      expect(edge.sourcePortId).toBe(`${draft!.id}:output`); expect(edge.targetPortId).toBe(`${target!.id}:input`);
      expect(target!.activeAssetId).toBe(target!.assets[0]!.id);
      expect(target!.referenceOrder).toEqual([`asset:${target!.assets[0]!.id}`, `connection:${edge.id}`]);
      const prompt = target!.prompt;
      expect(typeof prompt).not.toBe("string");
      if (prompt && typeof prompt !== "string") expect(prompt.content).toEqual([
        expect.objectContaining({ key: `asset:${target!.assets[0]!.id}` }),
        expect.objectContaining({ key: `connection:${edge.id}` }),
        expect.objectContaining({ key: "connection:removed" }),
      ]);
      expect(draft!.generatedAsset!.generation).toEqual(original.canvases[0]!.nodes[0]!.generatedAsset!.generation);
    }
    expect(original).toEqual(fixture(2));
    expect(copies.activeCanvasId).toBe(copies.canvases[0]!.id);
  });
  it("preserves draft conversion eligibility and the original frozen task identity after copying", () => {
    const copies = createRecoveryCopies(fixture());
    const policy = (globalThis as unknown as { REELAY_DRAFT_VIDEO: {
      getFinalEligibility(asset: unknown, options: { projectId: string; now: number }): { eligible: boolean };
      buildFinalInput(asset: unknown, options: { projectId: string; now: number; cost: number }): { sourceDraftTaskId: string; sourceResultId: string };
    } }).REELAY_DRAFT_VIDEO;
    const asset = copies.canvases[0]!.nodes[0]!.generatedAsset;
    expect(policy.getFinalEligibility(asset, { projectId: "project", now: 2000 }).eligible).toBe(true);
    expect(policy.buildFinalInput(asset, { projectId: "project", now: 2000, cost: 10 })).toMatchObject({ sourceDraftTaskId: "task", sourceResultId: "result" });
    expect(policy.getFinalEligibility(asset, { projectId: "other-project", now: 2000 }).eligible).toBe(false);
  });
  it("does not silently truncate recovery when the saved document is at its canvas limit", () => {
    expect(() => appendRecoveryCopies(fixture(100), createRecoveryCopies(fixture(2)))).toThrow("数量已达上限");
  });
  it("cannot mistake a modified copy for the result of the original failed request", () => {
    const copies = createRecoveryCopies(fixture());
    const merged = structuredClone(appendRecoveryCopies(fixture(), copies).content);
    merged.canvases.at(-1)!.name = "另一个窗口编辑了副本";
    expect(() => appendRecoveryCopies(merged, copies)).toThrow("已被其他窗口修改");
  });
  it("recognizes committed copies after JSONB key reordering and document canonicalization", () => {
    const reorder = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(reorder);
      if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reorder(child)]));
      return value;
    };
    const copies = createRecoveryCopies(fixture(2));
    const committed = appendRecoveryCopies(fixture(), copies).content;
    const fromDatabase = canonicalizeLegacyCanvasDocumentV1(reorder(committed))!;
    const retry = appendRecoveryCopies(fromDatabase, copies);
    expect(retry.alreadySaved).toBe(true);
    expect(retry.content.canvases).toHaveLength(3);
  });
});
