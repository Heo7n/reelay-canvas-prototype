import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const [interactionSource, controllerSource] = await Promise.all([
  readFile(new URL("../src/legacy-canvas/canvas-node-interaction.js", import.meta.url), "utf8"),
  readFile(new URL("../src/legacy-canvas/canvas-node-drag-controller.js", import.meta.url), "utf8"),
]);
const context = vm.createContext({});
new vm.Script(interactionSource).runInContext(context);
new vm.Script(controllerSource).runInContext(context);

function createHarness() {
  const nodes = [
    { id: "a", kind: "generator", x: 10, y: 20 },
    { id: "b", kind: "media", x: 70, y: 90 },
  ];
  const calls = [];
  const undoActions = [];
  let activeAction = null;
  let cloneCount = 0;
  const controller = context.REELAY_CANVAS_NODE_DRAG_CONTROLLER.createCanvasNodeDragController({
    interaction: context.REELAY_CANVAS_NODE_INTERACTION,
    getScale: () => 2,
    getNode: (nodeId) => nodes.find((node) => node.id === nodeId),
    cloneNode: (node) => ({ ...node, id: `${node.id}-copy-${++cloneCount}` }),
    addNodes: (items) => nodes.push(...items),
    selectNodes: (ids, activeId) => calls.push(`select:${ids.join(",")}:${activeId}`),
    promoteNodes: (items) => calls.push(`promote:${items.map((item) => item.id).join(",")}`),
    setAction: (action) => { activeAction = action; },
    setDragging: (dragging) => calls.push(`dragging:${dragging}`),
    applyNodePosition: (position) => {
      const node = nodes.find((item) => item.id === position.id);
      Object.assign(node, { x: position.x, y: position.y });
    },
    renderMovement: () => calls.push("movement"),
    updateGroupMembership: (ids) => calls.push(`groups:${ids.join(",")}`),
    pushUndoAction: (action) => undoActions.push(action),
    render: () => calls.push("render"),
  });
  return { controller, nodes, calls, undoActions, getAction: () => activeAction };
}

function candidate(overrides = {}) {
  return {
    type: "drag-candidate",
    pointerId: 3,
    ids: ["a", "b"],
    activeId: "a",
    altKey: false,
    startClientX: 100,
    startClientY: 100,
    origins: [{ id: "a", x: 10, y: 20 }, { id: "b", x: 70, y: 90 }],
    groups: [{ id: "group-1" }],
    revealMediaToolbar: true,
    revealGeneratorPanel: true,
    ...overrides,
  };
}

test("promoting a drag candidate preserves offsets and begins immediate movement", () => {
  const harness = createHarness();
  const action = harness.controller.promote(candidate(), { clientX: 120, clientY: 110 });

  assert.equal(action.type, "drag-nodes");
  assert.equal(action.activeId, "a");
  assert.equal(action.revealMediaToolbar, true);
  assert.equal(action.revealGeneratorPanel, true);
  assert.equal(harness.getAction(), action);
  assert.deepEqual(harness.nodes.slice(0, 2).map(({ id, x, y }) => ({ id, x, y })), [
    { id: "a", x: 20, y: 25 },
    { id: "b", x: 80, y: 95 },
  ]);
  assert.deepEqual(harness.calls, ["promote:a,b", "dragging:true", "movement"]);
});

test("Alt promotion duplicates nodes and drags only the copies", () => {
  const harness = createHarness();
  const action = harness.controller.promote(candidate({ altKey: true }), { clientX: 120, clientY: 110 });

  assert.deepEqual(action.ids, ["a-copy-1", "b-copy-2"]);
  assert.equal(action.activeId, "a-copy-1");
  assert.equal(harness.nodes.length, 4);
  assert.deepEqual(harness.nodes.slice(0, 2).map(({ x, y }) => ({ x, y })), [{ x: 10, y: 20 }, { x: 70, y: 90 }]);
  assert.deepEqual(harness.nodes.slice(2).map(({ x, y }) => ({ x, y })), [{ x: 20, y: 25 }, { x: 80, y: 95 }]);
  assert.deepEqual(harness.calls, [
    "select:a-copy-1,b-copy-2:a-copy-1",
    "render",
    "promote:a-copy-1,b-copy-2",
    "dragging:true",
    "movement",
  ]);
});

test("Alt promotion maps the active node to its corresponding copy", () => {
  const harness = createHarness();
  const action = harness.controller.promote(candidate({ activeId: "b", altKey: true }), { clientX: 120, clientY: 110 });
  assert.equal(action.activeId, "b-copy-2");
  assert.equal(harness.calls[0], "select:a-copy-1,b-copy-2:b-copy-2");
});

test("finishing a moved original records undo while duplicate movement does not", () => {
  const original = createHarness();
  const originalAction = { ...candidate(), type: "drag-nodes", moved: true, isDuplicate: false };
  original.controller.finish(originalAction);
  assert.deepEqual(original.calls, ["groups:a,b", "render"]);
  assert.deepEqual(JSON.parse(JSON.stringify(original.undoActions)), [{
    type: "move",
    positions: originalAction.origins,
    groups: originalAction.groups,
  }]);

  const duplicate = createHarness();
  duplicate.controller.finish({ ...originalAction, isDuplicate: true });
  assert.equal(duplicate.undoActions.length, 0);
});
