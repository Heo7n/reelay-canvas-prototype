import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const [interactionSource, controllerSource] = await Promise.all([
  readFile(new URL("../src/legacy-canvas/canvas-node-interaction.js", import.meta.url), "utf8"),
  readFile(new URL("../src/legacy-canvas/canvas-pointer-interaction-controller.js", import.meta.url), "utf8"),
]);
const context = vm.createContext({});
new vm.Script(interactionSource).runInContext(context);
new vm.Script(controllerSource).runInContext(context);

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function createHarness() {
  const calls = [];
  const frames = new Map();
  let nextFrameId = 1;
  let action = null;
  let selection = new Set(["base"]);
  const nodes = [
    { id: "inside", x: 20, y: 20, width: 20, height: 20 },
    { id: "outside", x: 200, y: 200, width: 20, height: 20 },
  ];
  const controller = context.REELAY_CANVAS_POINTER_INTERACTION_CONTROLLER.createCanvasPointerInteractionController({
    interaction: context.REELAY_CANVAS_NODE_INTERACTION,
    requestFrame: (callback) => {
      const id = nextFrameId++;
      frames.set(id, callback);
      return id;
    },
    cancelFrame: (id) => frames.delete(id),
    getAction: () => action,
    getViewport: () => ({ tx: 10, ty: 15 }),
    setAction: (nextAction) => { action = nextAction; },
    setDragging: (dragging) => calls.push(`dragging:${dragging}`),
    capturePointer: (_target, pointer) => calls.push(`capture:${pointer.pointerId}`),
    applyViewport: (viewport) => calls.push(["viewport", viewport]),
    getShellRect: () => ({ left: 5, top: 10 }),
    getSelection: () => selection,
    getNodes: () => nodes,
    getNodeBounds: (node) => ({
      left: node.x,
      top: node.y,
      right: node.x + node.width,
      bottom: node.y + node.height,
    }),
    screenToWorld: (x, y) => ({ x, y }),
    showMarquee: (rect) => calls.push(["marquee", rect]),
    hideMarquee: () => calls.push("hide"),
    setSelection: (ids) => {
      selection = new Set(ids);
      calls.push(["selection", [...selection]]);
    },
    clearSelection: () => {
      selection = new Set();
      calls.push("clear");
    },
    collapseGeneratorPanels: () => calls.push("collapse"),
    render: () => calls.push("render"),
  });
  return {
    controller,
    calls,
    frames,
    getAction: () => action,
    setAction: (nextAction) => { action = nextAction; },
    getSelection: () => selection,
  };
}

test("pointer frame scheduling coalesces moves and ignores stale actions", () => {
  const harness = createHarness();
  const action = {};
  const moves = [];
  harness.setAction(action);
  harness.controller.schedule(action, { clientX: 10, clientY: 20 }, (_action, pointer) => moves.push(pointer));
  harness.controller.schedule(action, { clientX: 30, clientY: 40 }, (_action, pointer) => moves.push(pointer));
  assert.equal(harness.frames.size, 1);
  [...harness.frames.values()][0]();
  assert.deepEqual(plain(moves), [{ clientX: 30, clientY: 40 }]);

  harness.controller.schedule(action, { clientX: 50, clientY: 60 }, (_action, pointer) => moves.push(pointer));
  harness.setAction({});
  [...harness.frames.values()][1]();
  assert.equal(moves.length, 1);
});

test("flushing a pointer frame cancels pending work and applies the final pointer", () => {
  const harness = createHarness();
  const action = {};
  const moves = [];
  harness.setAction(action);
  harness.controller.schedule(action, { clientX: 10, clientY: 20 }, (_action, pointer) => moves.push(pointer));
  harness.controller.flush(action, { clientX: 70, clientY: 80 }, (_action, pointer) => moves.push(pointer));
  assert.equal(harness.frames.size, 0);
  assert.deepEqual(plain(moves), [{ clientX: 70, clientY: 80 }]);
});

test("canvas pan snapshots the viewport and applies screen-space deltas", () => {
  const harness = createHarness();
  const action = harness.controller.beginPan({ pointerId: 4, clientX: 100, clientY: 120 }, {});
  const viewport = harness.controller.movePan(action, { clientX: 125, clientY: 110 });
  assert.deepEqual(plain(viewport), { tx: 35, ty: 5 });
  assert.deepEqual(plain(harness.calls), [
    "dragging:true",
    "capture:4",
    ["viewport", { tx: 35, ty: 5 }],
  ]);
});

test("marquee selection respects threshold, additive selection, and finish behavior", () => {
  const harness = createHarness();
  const action = harness.controller.beginMarquee({
    pointerId: 5,
    clientX: 10,
    clientY: 10,
    shiftKey: true,
  }, {});
  assert.equal(harness.controller.moveMarquee(action, { clientX: 11, clientY: 11 }), null);
  const result = harness.controller.moveMarquee(action, { clientX: 45, clientY: 45 });
  assert.deepEqual([...result.selectedIds].sort(), ["base", "inside"]);
  assert.deepEqual([...harness.getSelection()].sort(), ["base", "inside"]);
  harness.controller.finishMarquee(action);
  assert.ok(harness.calls.includes("hide"));
  assert.equal(harness.calls.includes("clear"), false);

  const clickAction = harness.controller.beginMarquee({
    pointerId: 6,
    clientX: 50,
    clientY: 50,
    shiftKey: false,
  }, {});
  harness.controller.finishMarquee(clickAction);
  assert.equal(harness.getSelection().size, 0);
  assert.ok(harness.calls.includes("clear"));
});
