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
