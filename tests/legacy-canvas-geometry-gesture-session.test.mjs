import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const context = vm.createContext({});
vm.runInContext(await readFile(new URL("../src/legacy-canvas/canvas-geometry-gesture-session.js", import.meta.url), "utf8"), context);
const plain = (value) => JSON.parse(JSON.stringify(value));

function fixture() {
  const nodes = [{ id: "a", x: 10, y: 20, z: 1, assets: [] }, { id: "b", x: 80, y: 90, z: 2, assets: [] }];
  const canvas = { id: "canvas", nodes, groups: [], zCounter: 2, undoStack: [] };
  const owner = { projectId: "project", canvas, canMutate: true };
  const preview = context.REELAY_CANVAS_GEOMETRY_GESTURE.createSession({ getContext: () => owner,
    cloneNode: (source) => ({ ...source, id: `${source.id}-copy`, assets: source.assets.slice() }) });
  const candidate = (options = {}) => ({ type: "drag-candidate", ids: ["a", "b"], activeId: "a", ...options });
  return { preview, nodes, canvas, owner, candidate };
}

test("candidate layering and node movement remain presentation until a single commit", () => {
  const f = fixture();
  const action = f.candidate();
  const before = JSON.stringify(f.canvas);
  assert.equal(f.preview.capture(action), true);
  assert.ok(f.preview.getNodeZ(f.nodes[0]) > f.preview.getNodeZ(f.nodes[1]));
  assert.equal(JSON.stringify(f.canvas), before);
  f.preview.promoteNodes(action);
  assert.equal(f.preview.setNodePositions(action, [{ id: "a", x: 40, y: 50 }, { id: "b", x: 110, y: 120 }]), true);
  assert.equal(JSON.stringify(f.canvas), before);
  assert.deepEqual(plain(f.preview.getNodePosition(f.nodes[0])), { x: 40, y: 50 });
  const asset = { id: "background-result", duration: 7.5 };
  f.nodes[0].assets.push(asset);
  f.canvas.nodes.push({ id: "background-node", x: 900, y: 900, z: 8 });
  const result = f.preview.commit(action);
  assert.equal(result.ok, true); assert.equal(result.changed, true);
  assert.equal(f.canvas.nodes[0], f.nodes[0]);
  assert.equal(f.nodes[0].assets[0], asset);
  assert.deepEqual([f.nodes[0].x, f.nodes[0].y, f.nodes[1].x, f.nodes[1].y], [40, 50, 110, 120]);
  assert.equal(f.canvas.nodes.length, 3);
  assert.equal(f.nodes[0].z, 10); assert.equal(f.canvas.zCounter, 10);
  assert.equal(f.preview.hasActive(), false);
  assert.equal(f.preview.commit(action).ok, false);
  assert.equal(f.canvas.zCounter, 10);
});

test("a completed click promotes layers without writing position or creating copies", () => {
  const f = fixture(); const action = f.candidate({ altKey: true });
  f.preview.capture(action);
  assert.equal(f.preview.commit(action).ok, true);
  assert.equal(f.canvas.nodes.length, 2);
  assert.deepEqual([f.nodes[0].x, f.nodes[0].y], [10, 20]);
  assert.ok(f.nodes[0].z > f.nodes[1].z);
});

for (const finish of ["cancel", "commit"]) test(`Alt copies stay outside the document until ${finish}`, () => {
  const f = fixture(); const action = f.candidate({ altKey: true });
  const before = JSON.stringify(f.canvas);
  const promoted = f.preview.promoteNodes(action);
  assert.equal(promoted.activeId, "a-copy");
  assert.equal(f.canvas.nodes.length, 2);
  assert.equal(f.preview.getViewNodes().length, 4);
  assert.equal(JSON.stringify(f.canvas), before);
  f.preview.setNodePositions(action, [{ id: "a-copy", x: 200, y: 300 }, { id: "b-copy", x: 270, y: 370 }]);
  assert.equal(JSON.stringify(f.canvas), before);
  f.preview[finish](action);
  if (finish === "cancel") assert.equal(JSON.stringify(f.canvas), before);
  else {
    assert.equal(f.canvas.nodes.length, 4);
    assert.deepEqual([f.canvas.nodes[2].x, f.canvas.nodes[2].y], [200, 300]);
    assert.equal(f.canvas.nodes[0], f.nodes[0]);
  }
  assert.equal(f.preview.getViewNodes(), f.canvas.nodes);
});

for (const invalidation of ["node", "canvas", "project", "permission", "geometry", "membership"]) {
  test(`${invalidation} changes reject every pending geometry write and omit stale previews`, () => {
    const f = fixture(); const action = f.candidate();
    f.preview.promoteNodes(action);
    f.preview.setNodePositions(action, [{ id: "a", x: 40, y: 50 }, { id: "b", x: 110, y: 120 }]);
    if (invalidation === "node") f.canvas.nodes[0] = { ...f.nodes[0] };
    if (invalidation === "canvas") f.owner.canvas = { ...f.canvas };
    if (invalidation === "project") f.owner.projectId = "other";
    if (invalidation === "permission") f.owner.canMutate = false;
    if (invalidation === "geometry") f.nodes[1].y = 400;
    if (invalidation === "membership") f.nodes[1].groupId = "other";
    const before = JSON.stringify(f.canvas);
    assert.equal(f.preview.isCurrent(action), false);
    assert.equal(f.preview.getNodePosition(f.nodes[1]), null);
    assert.equal(f.preview.commit(action).ok, false);
    assert.equal(JSON.stringify(f.canvas), before);
    assert.equal(f.preview.hasActive(), false);
  });
}

test("non-writable content fails before the first node or layer is changed", () => {
  const f = fixture(); const action = f.candidate();
  f.preview.promoteNodes(action);
  f.preview.setNodePositions(action, [{ id: "a", x: 40, y: 50 }, { id: "b", x: 110, y: 120 }]);
  Object.defineProperty(f.nodes[1], "y", { writable: false });
  const before = JSON.stringify(f.canvas);
  assert.equal(f.preview.commit(action).ok, false);
  assert.equal(JSON.stringify(f.canvas), before);
});

test("group movement and resize project only geometry and retain live node content", () => {
  const f = fixture();
  const group = { id: "g", nodeIds: ["a", "b"], x: 0, y: 0, width: 300, height: 200, name: "group" };
  f.canvas.groups.push(group); f.nodes.forEach((node) => { node.groupId = "g"; });
  const action = { type: "group-drag-candidate", groupId: "g", origins: f.nodes.map(({ id, x, y }) => ({ id, x, y })) };
  const before = JSON.stringify(f.canvas);
  f.preview.capture(action);
  f.preview.setGroupFrame(action, { x: 80, y: 30 });
  f.preview.setNodePositions(action, [{ id: "a", x: 90, y: 50 }, { id: "b", x: 160, y: 120 }]);
  assert.deepEqual(plain(f.preview.getGroupFrame(group)), { x: 80, y: 30 });
  assert.equal(JSON.stringify(f.canvas), before);
  group.name = "renamed during gesture";
  assert.equal(f.preview.commit(action).ok, true);
  assert.equal(group.name, "renamed during gesture");
  const resize = { ...action, type: "resize-group", gesture: undefined };
  f.preview.capture(resize); f.preview.setGroupFrame(resize, { x: 80, y: 30, width: 400, height: 250 });
  assert.equal(group.width, 300);
  assert.equal(f.preview.commit(resize).ok, true);
  assert.equal(group.width, 400);
  assert.equal(f.nodes[0].x, 90);
});

test("group geometry or membership changes invalidate an in-progress resize atomically", () => {
  for (const field of ["width", "nodeIds"]) {
    const f = fixture();
    const group = { id: "g", nodeIds: ["a", "b"], x: 0, y: 0, width: 300, height: 200 };
    f.canvas.groups.push(group);
    const action = { type: "resize-group", groupId: "g", origins: f.nodes.map(({ id, x, y }) => ({ id, x, y })) };
    f.preview.capture(action); f.preview.setGroupFrame(action, { width: 400 });
    if (field === "width") group.width = 350;
    else group.nodeIds.pop();
    const before = JSON.stringify(f.canvas);
    assert.equal(f.preview.commit(action).ok, false);
    assert.equal(JSON.stringify(f.canvas), before);
  }
});

test("old action tokens cannot cancel or commit a later gesture", () => {
  const f = fixture(); const old = f.candidate(); const next = f.candidate();
  f.preview.capture(old); f.preview.capture(next);
  assert.equal(f.preview.cancel(old), false);
  assert.equal(f.preview.commit(old).ok, false);
  assert.equal(f.preview.isCurrent(next), true);
  assert.equal(f.preview.capture(old), false);
  f.preview.cancel(next);
  assert.equal(f.preview.hasActive(), false);
});

test("invalid batched positions never partially replace an existing preview", () => {
  const f = fixture(); const action = f.candidate(); f.preview.promoteNodes(action);
  f.preview.setNodePositions(action, [{ id: "a", x: 30, y: 40 }]);
  assert.equal(f.preview.setNodePositions(action, [{ id: "a", x: 70, y: 80 }, { id: "b", x: NaN, y: 1 }]), false);
  assert.deepEqual(plain(f.preview.getNodePosition(f.nodes[0])), { x: 30, y: 40 });
});
