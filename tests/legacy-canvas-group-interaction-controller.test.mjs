import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("../src/legacy-canvas/canvas-group-interaction-controller.js", import.meta.url),
  "utf8",
);
const context = vm.createContext({});
new vm.Script(source).runInContext(context);

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function createHarness() {
  const group = { id: "group-1", x: 20, y: 30, width: 240, height: 180 };
  const nodes = [
    { id: "a", x: 40, y: 60 },
    { id: "b", x: 120, y: 140 },
  ];
  const calls = [];
  const undoActions = [];
  let action = null;
  const controller = context.REELAY_CANVAS_GROUP_INTERACTION_CONTROLLER.createCanvasGroupInteractionController({
    getScale: () => 2,
    getGroup: (id) => (id === group.id ? group : null),
    getGroupBounds: () => ({ left: group.x, top: group.y, width: group.width, height: group.height }),
    getGroupNodes: () => nodes,
    getGroupSnapshots: () => [{ ...group }],
    setActiveGroup: (id) => calls.push(`active:${id}`),
    setAction: (nextAction) => { action = nextAction; },
    setDragging: (dragging) => calls.push(`dragging:${dragging}`),
    capturePointer: (_target, pointerId) => calls.push(`capture:${pointerId}`),
    applyGroupFrame: (_id, frame) => Object.assign(group, frame),
    applyNodePosition: (id, position) => Object.assign(nodes.find((node) => node.id === id), position),
    minWidth: 160,
    minHeight: 120,
    pushUndoAction: (entry) => undoActions.push(entry),
    render: () => calls.push("render"),
  });
  return { controller, group, nodes, calls, undoActions, getAction: () => action };
}

test("group drag promotion preserves group and node offsets", () => {
  const harness = createHarness();
  const candidate = harness.controller.beginDrag(
    harness.group,
    { pointerId: 7, clientX: 100, clientY: 100 },
    {},
  );
  const drag = harness.controller.promoteDrag(candidate, { clientX: 120, clientY: 110 });

  assert.equal(drag.type, "drag-group");
  assert.equal(harness.getAction(), drag);
  assert.deepEqual(plain(harness.group), { id: "group-1", x: 30, y: 35, width: 240, height: 180 });
  assert.deepEqual(plain(harness.nodes), [
    { id: "a", x: 50, y: 65 },
    { id: "b", x: 130, y: 145 },
  ]);
  assert.deepEqual(harness.calls, ["active:group-1", "capture:7", "render", "dragging:true", "render"]);
});

test("north-west resize respects minimum dimensions and anchored far edges", () => {
  const harness = createHarness();
  const action = harness.controller.beginResize(
    harness.group,
    { pointerId: 8, clientX: 100, clientY: 100 },
    "nw",
    {},
  );
  const frame = harness.controller.resize(action, { clientX: 300, clientY: 260 });

  assert.deepEqual(plain(frame), { x: 100, y: 90, width: 160, height: 120 });
  assert.deepEqual(plain(harness.group), { id: "group-1", x: 100, y: 90, width: 160, height: 120 });
});

test("finishing a changed group records one shared movement undo entry", () => {
  const harness = createHarness();
  const action = harness.controller.beginDrag(
    harness.group,
    { pointerId: 9, clientX: 0, clientY: 0 },
    {},
  );
  harness.controller.promoteDrag(action, { clientX: 20, clientY: 10 });
  harness.controller.finish(harness.getAction());

  assert.deepEqual(plain(harness.undoActions), [{
    type: "move",
    positions: [{ id: "a", x: 40, y: 60 }, { id: "b", x: 120, y: 140 }],
    groups: [{ id: "group-1", x: 20, y: 30, width: 240, height: 180 }],
  }]);
});
