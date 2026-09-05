import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const [interactionSource, controllerSource] = await Promise.all([
  readFile(new URL("../src/legacy-canvas/canvas-node-interaction.js", import.meta.url), "utf8"),
  readFile(new URL("../src/legacy-canvas/canvas-node-pointer-controller.js", import.meta.url), "utf8"),
]);
const context = vm.createContext({});
new vm.Script(interactionSource).runInContext(context);
new vm.Script(controllerSource).runInContext(context);

function createHarness({ canMutate = true, spaceDown = false, selectedNodeIds = ["a", "b"] } = {}) {
  const nodes = [
    { id: "a", kind: "generator", x: 10, y: 20, expanded: false, generating: false },
    { id: "b", kind: "media", x: 80, y: 90 },
  ];
  const selectedIds = new Set(selectedNodeIds);
  const calls = [];
  let action = null;
  const controller = context.REELAY_CANVAS_NODE_POINTER_CONTROLLER.createCanvasNodePointerController({
    interaction: context.REELAY_CANVAS_NODE_INTERACTION,
    isSpaceDown: () => spaceDown,
    beginPan: () => calls.push("pan"),
    getNode: (nodeId) => nodes.find((node) => node.id === nodeId),
    getSelectedIds: () => [...selectedIds],
    getSelectedNodes: () => nodes.filter((node) => selectedIds.has(node.id)),
    getGroupSnapshots: () => [{ id: "group-1" }],
    canMutate: () => canMutate,
    isEditableMedia: () => true,
    handleControlPointer: () => calls.push("control"),
    applySelection: (ids) => {
      selectedIds.clear();
      ids.forEach((id) => selectedIds.add(id));
      calls.push("selection");
    },
    setMediaToolbarNodeId: (nodeId) => calls.push(`toolbar:${nodeId || "none"}`),
    promoteNodes: (items) => calls.push(`promote:${items.map((item) => item.id).join(",")}`),
    setAction: (nextAction) => { action = nextAction; },
    capturePointer: (pointerId) => calls.push(`capture:${pointerId}`),
    render: () => calls.push("render"),
  });
  return { controller, nodes, calls, getAction: () => action };
}

function pointerEvent(overrides = {}) {
  return {
    button: 0,
    pointerId: 7,
    clientX: 120,
    clientY: 140,
    shiftKey: false,
    altKey: false,
    target: { closest: () => null },
    preventDefault() {},
    stopPropagation() {},
    ...overrides,
  };
}

test("middle pointer and space drag pan even when starting over a node", () => {
  const middle = createHarness();
  assert.equal(middle.controller.handlePointerDown(pointerEvent({ button: 1 }), "a"), "pan");
  assert.deepEqual(middle.calls, ["pan"]);

  const space = createHarness({ spaceDown: true });
  assert.equal(space.controller.handlePointerDown(pointerEvent(), "a"), "pan");
  assert.deepEqual(space.calls, ["pan"]);
});

test("embedded controls never start a node drag", () => {
  const harness = createHarness();
  const target = { closest: (selector) => selector.includes("button") ? {} : null };
  assert.equal(harness.controller.handlePointerDown(pointerEvent({ target }), "a"), "control");
  assert.deepEqual(harness.calls, ["control"]);
  assert.equal(harness.getAction(), null);
});

test("read-only node clicks update selection without creating a drag action", () => {
  const harness = createHarness({ canMutate: false });
  assert.equal(harness.controller.handlePointerDown(pointerEvent(), "a"), "selected");
  assert.deepEqual(harness.calls, ["selection", "toolbar:none", "render"]);
  assert.equal(harness.getAction(), null);
});

test("node body pointer prepares a stable drag candidate with active node promoted last", () => {
  const harness = createHarness();
  const target = { closest: (selector) => selector === ".media-frame" ? {} : null };
  assert.equal(harness.controller.handlePointerDown(pointerEvent({ target, altKey: true }), "a"), "drag-candidate");
  assert.deepEqual(harness.calls, [
    "selection",
    "promote:b,a",
    "capture:7",
    "render",
  ]);
  assert.equal(harness.nodes[0].expanded, false);
  assert.deepEqual({ ...harness.getAction(), groups: undefined }, {
    type: "drag-candidate",
    pointerId: 7,
    ids: ["a", "b"],
    activeId: "a",
    altKey: true,
    startClientX: 120,
    startClientY: 140,
    origins: harness.getAction().origins,
    groups: undefined,
    revealMediaToolbar: false,
    revealGeneratorPanel: false,
  });
  assert.deepEqual(Array.from(harness.getAction().origins, (origin) => ({ ...origin })), [
    { id: "a", x: 10, y: 20 },
    { id: "b", x: 80, y: 90 },
  ]);
});

test("selection-frame origin is carried by the shared drag candidate", () => {
  const harness = createHarness();
  assert.equal(
    harness.controller.handlePointerDown(pointerEvent(), "a", { interactionSource: "selection-frame" }),
    "drag-candidate",
  );
  assert.equal(harness.getAction().interactionSource, "selection-frame");
  assert.deepEqual(Array.from(harness.getAction().ids), ["a", "b"]);
});

test("a single media-frame click defers chrome until pointer release", () => {
  const harness = createHarness({ selectedNodeIds: ["a"] });
  const target = { closest: (selector) => selector === ".media-frame" ? {} : null };
  harness.controller.handlePointerDown(pointerEvent({ target }), "a");
  assert.equal(harness.getAction().revealMediaToolbar, true);
  assert.equal(harness.getAction().revealGeneratorPanel, true);
  assert.equal(harness.nodes[0].expanded, false);
  assert.doesNotMatch(harness.calls.join("|"), /toolbar|expand/);
});

test("shift-removing a node from multi-selection does not drag the remaining nodes", () => {
  const harness = createHarness();
  const target = { closest: (selector) => selector === ".media-frame" ? {} : null };
  assert.equal(
    harness.controller.handlePointerDown(pointerEvent({ target, shiftKey: true }), "a"),
    "deselected",
  );
  assert.equal(harness.getAction(), null);
  assert.deepEqual(harness.calls, ["selection", "toolbar:none", "render"]);
  assert.equal(harness.nodes[0].expanded, false);
});
