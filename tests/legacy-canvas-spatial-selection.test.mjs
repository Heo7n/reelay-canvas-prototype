import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("../src/legacy-canvas/canvas-spatial-selection.js", import.meta.url),
  "utf8",
);
const context = vm.createContext({});
new vm.Script(source).runInContext(context);
const geometry = context.REELAY_CANVAS_SPATIAL_SELECTION;
const plain = (value) => JSON.parse(JSON.stringify(value));

test("selection screen rect keeps a stable screen-space padding across zoom", () => {
  const bounds = { left: 100, top: 50, right: 300, bottom: 200 };
  assert.deepEqual(plain(geometry.getSelectionScreenRect(bounds, {
    tx: 20,
    ty: 30,
    scale: 0.2,
  })), {
    left: 32,
    top: 32,
    right: 88,
    bottom: 78,
    width: 56,
    height: 46,
    centerX: 60,
    centerY: 55,
  });
  assert.deepEqual(plain(geometry.getSelectionScreenRect(bounds, {
    tx: 20,
    ty: 30,
    scale: 2,
  })), {
    left: 212,
    top: 122,
    right: 628,
    bottom: 438,
    width: 416,
    height: 316,
    centerX: 420,
    centerY: 280,
  });
});

test("group membership uses overlap hysteresis and prefers the strongest region", () => {
  const groups = [
    { id: "large", bounds: { left: 0, top: 0, right: 300, bottom: 300 } },
    { id: "small", bounds: { left: 40, top: 40, right: 180, bottom: 180 } },
  ];
  assert.equal(geometry.resolveNodeGroup({
    nodeBounds: { left: 60, top: 60, right: 160, bottom: 160 },
    groups,
  }), "small");

  assert.equal(geometry.resolveNodeGroup({
    nodeBounds: { left: 150, top: 40, right: 250, bottom: 140 },
    currentGroupId: "small",
    groups,
  }), "large");

  assert.equal(geometry.resolveNodeGroup({
    nodeBounds: { left: 145, top: 40, right: 245, bottom: 140 },
    currentGroupId: "small",
    groups,
    retainRatio: 0.3,
  }), "small");
});

test("a node does not join from a tiny edge overlap or after leaving every frame", () => {
  const group = { id: "group", bounds: { left: 0, top: 0, right: 200, bottom: 200 } };
  assert.equal(geometry.resolveNodeGroup({
    nodeBounds: { left: 180, top: 80, right: 280, bottom: 180 },
    groups: [group],
  }), null);
  assert.equal(geometry.resolveNodeGroup({
    nodeBounds: { left: 220, top: 80, right: 320, bottom: 180 },
    currentGroupId: "group",
    groups: [group],
  }), null);
});

test("an exact persistent-group selection is recognized without collapsing selection semantics", () => {
  const group = { id: "group-a", nodeIds: ["node-a", "node-b", "node-c"] };
  const otherGroup = { id: "group-b", nodeIds: ["node-d", "node-e"] };
  const nodeA = { id: "node-a", groupId: "group-a" };
  const nodeB = { id: "node-b", groupId: "group-a" };
  const nodeC = { id: "node-c", groupId: "group-a" };
  const otherGroupNode = { id: "node-d", groupId: "group-b" };
  const looseNode = { id: "node-loose", groupId: null };

  assert.equal(
    geometry.getExactSelectionGroup([nodeA, nodeB, nodeC], [group, otherGroup])?.id,
    "group-a",
  );
  assert.equal(geometry.getExactSelectionGroup([nodeA, nodeB], [group, otherGroup]), null);
  assert.equal(geometry.getExactSelectionGroup([nodeA, otherGroupNode], [group, otherGroup]), null);
  assert.equal(
    geometry.getExactSelectionGroup([nodeA, nodeB, nodeC, looseNode], [group, otherGroup]),
    null,
  );
});
