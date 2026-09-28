import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const connectionsSource = await readFile(
  new URL("../src/legacy-canvas/canvas-connections.js", import.meta.url),
  "utf8",
);
const context = vm.createContext({});
new vm.Script(connectionsSource, { filename: "canvas-connections.js" }).runInContext(context);
const connectionsApi = context.REELAY_CANVAS_CONNECTIONS;
const plain = (value) => JSON.parse(JSON.stringify(value));

const nodes = [
  { id: "asset-1", kind: "asset", mode: "image" },
  { id: "generator-1", kind: "generator", mode: "video" },
  { id: "generator-2", kind: "generator", mode: "image" },
];

test("canConnect accepts generator inputs and rejects invalid, duplicate, self, and cyclic edges", () => {
  assert.deepEqual(
    plain(connectionsApi.canConnect([], nodes, "asset-1", "generator-1")),
    { ok: true, reason: null },
  );
  assert.equal(connectionsApi.canConnect([], nodes, "missing", "generator-1").reason, "invalid-target");
  assert.equal(connectionsApi.canConnect([], nodes, "generator-1", "asset-1").reason, "invalid-target");
  assert.equal(connectionsApi.canConnect([], nodes, "generator-1", "generator-1").reason, "self");

  const existing = [
    { id: "connection-1", sourceNodeId: "asset-1", targetNodeId: "generator-1", mediaType: "image" },
    { id: "connection-2", sourceNodeId: "generator-1", targetNodeId: "generator-2", mediaType: "video" },
  ];
  assert.equal(
    connectionsApi.canConnect(existing, nodes, "asset-1", "generator-1").reason,
    "duplicate",
  );
  assert.equal(
    connectionsApi.canConnect(existing, nodes, "generator-2", "generator-1").reason,
    "cycle",
  );
});

test("normalizeConnections infers media types and removes malformed or unsafe edges", () => {
  const normalized = connectionsApi.normalizeConnections([
    { id: " connection-1 ", sourceNodeId: " asset-1 ", targetNodeId: " generator-1 " },
    { id: "duplicate-edge", sourceNodeId: "asset-1", targetNodeId: "generator-1", mediaType: "image" },
    { id: "connection-2", sourceNodeId: "generator-1", targetNodeId: "generator-2" },
    { id: "cycle", sourceNodeId: "generator-2", targetNodeId: "generator-1" },
    { id: "missing", sourceNodeId: "missing", targetNodeId: "generator-1", mediaType: "image" },
    { id: "invalid-target", sourceNodeId: "generator-1", targetNodeId: "asset-1", mediaType: "video" },
    { sourceNodeId: "asset-1", targetNodeId: "generator-1", mediaType: "image" },
    null,
  ], nodes);

  assert.deepEqual(plain(normalized), [
    { id: "connection-1", sourceNodeId: "asset-1", targetNodeId: "generator-1", mediaType: "image" },
    { id: "connection-2", sourceNodeId: "generator-1", targetNodeId: "generator-2", mediaType: "video" },
  ]);
});

test("getBezierPath returns stable horizontal and vertical cubic paths", () => {
  assert.equal(
    connectionsApi.getBezierPath({ x: 0, y: 10 }, { x: 200, y: 50 }),
    "M 0 10 C 96 10, 104 50, 200 50",
  );
  assert.equal(
    connectionsApi.getBezierPath({ x: 5, y: 5 }, { x: 5, y: 205 }),
    "M 5 5 C 77 5, -67 205, 5 205",
  );
});

test("batch planning deduplicates sources and keeps every legal edge", () => {
  const existing = [
    { id: "existing", sourceNodeId: "asset-1", targetNodeId: "generator-1", mediaType: "image" },
    { id: "downstream", sourceNodeId: "generator-1", targetNodeId: "generator-2", mediaType: "video" },
  ];
  const plan = connectionsApi.planBatchConnections(
    existing,
    nodes,
    ["asset-1", "generator-1", "generator-2", "generator-2"],
    "generator-1",
  );
  assert.deepEqual(plain(plan), {
    validSourceIds: [],
    rejected: [
      { sourceNodeId: "asset-1", reason: "duplicate" },
      { sourceNodeId: "generator-1", reason: "self" },
      { sourceNodeId: "generator-2", reason: "cycle" },
    ],
  });

  const cleanPlan = connectionsApi.planBatchConnections(
    [],
    nodes,
    ["asset-1", "generator-2", "asset-1"],
    "generator-1",
  );
  assert.deepEqual(plain(cleanPlan), {
    validSourceIds: ["asset-1", "generator-2"],
    rejected: [],
  });
});

function draftFinalNodes({ pending = false, sourceKind = "asset" } = {}) {
  const draftAsset = { id: "draft-result", type: "video",
    generation: { stage: "draft", simulated: true, taskId: "draft-task", resultId: "draft-result" } };
  const finalGeneration = { stage: "final", simulated: true, taskId: "final-task",
    sourceDraftTaskId: "draft-task", sourceResultId: "draft-result" };
  return [
    { id: "sample", kind: sourceKind, mode: "video", ...(sourceKind === "asset"
      ? { assets: [draftAsset], activeAssetId: draftAsset.id } : { generatedAsset: draftAsset }) },
    { id: "final", kind: "asset", mode: "video", ...(pending
      ? { assets: [], pendingGeneration: finalGeneration }
      : { assets: [{ id: "final-result", type: "video", generation: finalGeneration }], activeAssetId: "final-result" }) },
  ];
}

test("final result derivation survives normalization for asset and generator sample sources", () => {
  const edge = { id: "sample-to-final", sourceNodeId: "sample", targetNodeId: "final", mediaType: "video" };
  for (const sourceKind of ["asset", "generator"]) {
    const resultNodes = draftFinalNodes({ sourceKind });
    assert.equal(connectionsApi.canConnect([], resultNodes, "sample", "final").ok, true);
    assert.deepEqual(plain(connectionsApi.normalizeConnections([edge], resultNodes)), [edge]);
    assert.equal(connectionsApi.canConnect([edge], resultNodes, "sample", "final").reason, "duplicate");
  }
});

test("pending final only accepts its captured sample provenance and persists the edge after completion", () => {
  const resultNodes = draftFinalNodes({ pending: true });
  const edge = { id: "derivation", sourceNodeId: "sample", targetNodeId: "final" };
  assert.equal(connectionsApi.canConnect([], resultNodes, "sample", "final").ok, true);
  const normalized = connectionsApi.normalizeConnections([edge], resultNodes);
  const final = resultNodes[1];
  final.assets = [{ id: "delivered", type: "video", generation: final.pendingGeneration }];
  delete final.pendingGeneration;
  assert.deepEqual(plain(connectionsApi.normalizeConnections(normalized, resultNodes)), plain(normalized));
});

test("asset destinations reject unrelated or incomplete lineage and use only the active sample media", () => {
  for (const pending of [false, true]) {
    for (const corrupt of [
      (source) => { source.assets[0].generation.taskId = "different-task"; },
      (source) => { source.assets[0].generation.resultId = "different-result"; },
      (source) => { source.assets[0].generation.simulated = false; },
      (source) => { delete source.assets[0].generation; },
      (source) => { source.assets[0].type = "image"; },
      (source, target) => { (target.pendingGeneration || target.assets[0].generation).stage = "draft"; },
      (source) => {
        source.assets.push({ id: "other-video", type: "video" }); source.activeAssetId = "other-video";
      },
    ]) {
      const resultNodes = draftFinalNodes({ pending }); corrupt(...resultNodes);
      assert.equal(connectionsApi.canConnect([], resultNodes, "sample", "final").reason, "invalid-target");
      assert.equal(connectionsApi.normalizeConnections([
        { id: "invalid", sourceNodeId: "sample", targetNodeId: "final" },
      ], resultNodes).length, 0);
    }
  }
  const resultNodes = draftFinalNodes(); resultNodes[1].assets[0].generation.simulated = false;
  assert.equal(connectionsApi.canConnect([], resultNodes, "sample", "final").ok, false);
});
