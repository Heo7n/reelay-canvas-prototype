import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("../src/legacy-canvas/canvas-pointer-dispatch-controller.js", import.meta.url),
  "utf8",
);
const context = vm.createContext({});
new vm.Script(source).runInContext(context);

function createHarness() {
  const calls = [];
  let action = null;
  let activeNode = null;
  const mark = (name) => (...args) => calls.push([name, ...args]);
  const controller = context.REELAY_CANVAS_POINTER_DISPATCH_CONTROLLER.createCanvasPointerDispatchController({
    getAction: () => action,
    schedule: mark("schedule"),
    flush: mark("flush"),
    hasCrossedDragThreshold: (_action, pointer) => pointer.clientX >= 10,
    moveConnection: mark("moveConnection"),
    finishConnection: mark("finishConnection"),
    promoteNodeDrag: mark("promoteNodeDrag"),
    promoteGroupDrag: mark("promoteGroupDrag"),
    moveGroup: mark("moveGroup"),
    resizeGroup: mark("resizeGroup"),
    moveNodes: mark("moveNodes"),
    moveMarquee: mark("moveMarquee"),
    movePan: mark("movePan"),
    moveMinimap: mark("moveMinimap"),
    resizeAssetLibrary: mark("resizeAssetLibrary"),
    resizeAgent: mark("resizeAgent"),
    finishMarquee: mark("finishMarquee"),
    finishNodeDrag: mark("finishNodeDrag"),
    finishGroup: mark("finishGroup"),
    finishAssetLibraryResize: mark("finishAssetLibraryResize"),
    clearAction: () => {
      calls.push(["clearAction"]);
      action = null;
    },
    setDragging: mark("setDragging"),
    releasePointer: mark("releasePointer"),
    isCanvasSurface: (target) => target === "canvas",
    closeConnectionCreateMenu: mark("closeConnectionCreateMenu"),
    isSpaceDown: () => false,
    beginPan: mark("beginPan"),
    getActiveNode: () => activeNode,
    closeNodePanel: (node) => {
      node.panel = null;
      calls.push(["closeNodePanel"]);
    },
    beginMarquee: mark("beginMarquee"),
    render: mark("render"),
  });
  return {
    controller,
    calls,
    setAction: (nextAction) => { action = nextAction; },
    setActiveNode: (node) => { activeNode = node; },
  };
}

test("move dispatches candidate promotion, scheduled moves, and direct resize actions", () => {
  const harness = createHarness();
  harness.setAction({ type: "drag-candidate" });
  harness.controller.handleMove({ clientX: 4 });
  assert.equal(harness.calls.length, 0);
  harness.controller.handleMove({ clientX: 12 });
  assert.equal(harness.calls[0][0], "promoteNodeDrag");

  harness.setAction({ type: "drag-nodes" });
  harness.controller.handleMove({ clientX: 20 });
  assert.equal(harness.calls.at(-1)[0], "schedule");

  harness.setAction({ type: "resize-agent", startWidth: 300, startClientX: 100 });
  harness.controller.handleMove({ clientX: 70 });
  assert.deepEqual(harness.calls.at(-1), ["resizeAgent", 330]);
});

test("finish flushes movement, runs the action finalizer, and releases capture", () => {
  const harness = createHarness();
  const captureTarget = {};
  harness.setAction({ type: "drag-nodes", captureTarget });
  harness.controller.finish({ pointerId: 7 });
  assert.deepEqual(harness.calls.map(([name]) => name), [
    "flush",
    "finishNodeDrag",
    "clearAction",
    "setDragging",
    "releasePointer",
  ]);
  assert.equal(harness.calls.at(-1)[1], captureTarget);
});

test("connection finish preserves its specialized cleanup path", () => {
  const harness = createHarness();
  harness.setAction({ type: "connect" });
  harness.controller.finish({ pointerId: 8 });
  assert.deepEqual(harness.calls.map(([name]) => name), ["flush", "finishConnection"]);
});

test("surface pointerdown routes pan, panel dismissal, and marquee without leaking outside", () => {
  const harness = createHarness();
  const outside = { target: "toolbar", button: 0, preventDefault() {} };
  assert.equal(harness.controller.handleSurfacePointerDown(outside), false);

  let prevented = false;
  harness.controller.handleSurfacePointerDown({
    target: "canvas",
    button: 1,
    preventDefault: () => { prevented = true; },
  });
  assert.equal(prevented, true);
  assert.equal(harness.calls.at(-1)[0], "beginPan");

  harness.setActiveNode({ kind: "generator", panel: "model" });
  harness.controller.handleSurfacePointerDown({ target: "canvas", button: 0 });
  assert.deepEqual(harness.calls.slice(-2).map(([name]) => name), ["closeNodePanel", "render"]);

  harness.setActiveNode(null);
  harness.controller.handleSurfacePointerDown({ target: "canvas", button: 0 });
  assert.equal(harness.calls.at(-1)[0], "beginMarquee");
});
