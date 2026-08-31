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
  let selectionFrameTarget = false;
  const mark = (name) => (...args) => calls.push([name, ...args]);
  const controller = context.REELAY_CANVAS_POINTER_DISPATCH_CONTROLLER.createCanvasPointerDispatchController({
    getAction: () => action,
    schedule: mark("schedule"),
    flush: mark("flush"),
    hasCrossedDragThreshold: (_action, pointer) => pointer.clientX >= 10,
    moveConnection: mark("moveConnection"),
    finishConnection: mark("finishConnection"),
    promoteNodeDrag: (dragCandidate, pointer) => {
      calls.push(["promoteNodeDrag", dragCandidate, pointer]);
      return { ...dragCandidate, type: "drag-nodes", moved: true };
    },
    promoteGroupDrag: (dragCandidate, pointer) => {
      calls.push(["promoteGroupDrag", dragCandidate, pointer]);
      return { ...dragCandidate, type: "drag-group", moved: true };
    },
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
    finishNodeClick: mark("finishNodeClick"),
    finishGroup: mark("finishGroup"),
    finishAssetLibraryResize: mark("finishAssetLibraryResize"),
    clearAction: () => {
      calls.push(["clearAction"]);
      action = null;
    },
    setDragging: mark("setDragging"),
    releasePointer: mark("releasePointer"),
    isCanvasSurface: (target) => target === "canvas",
    isSelectionFrameDragTarget: () => selectionFrameTarget,
    beginSelectionFrameDrag: () => {
      calls.push(["beginSelectionFrameDrag"]);
      return true;
    },
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
    setSelectionFrameTarget: (value) => { selectionFrameTarget = value; },
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

  harness.setAction({ type: "resize-asset-library", startWidth: 550, startClientX: 100 });
  harness.controller.handleMove({ clientX: 164 });
  assert.deepEqual(harness.calls.at(-1), ["resizeAssetLibrary", 614]);

  harness.setAction({ type: "resize-agent", startWidth: 300, startClientX: 100 });
  harness.controller.handleMove({ clientX: 70 });
  assert.deepEqual(harness.calls.at(-1), ["resizeAgent", 330]);
});

test("asset resize finalizes once and releases its capture target", () => {
  const harness = createHarness();
  const captureTarget = {};
  harness.setAction({ type: "resize-asset-library", pointerId: 7, captureTarget });
  harness.controller.finish({ type: "pointerup", pointerId: 7 });
  assert.deepEqual(harness.calls.map(([name]) => name), [
    "finishAssetLibraryResize",
    "clearAction",
    "setDragging",
    "releasePointer",
  ]);
  assert.equal(harness.calls.at(-1)[1], captureTarget);
});

test("finish flushes movement, runs the action finalizer, and releases capture", () => {
  const harness = createHarness();
  const captureTarget = {};
  harness.setAction({ type: "drag-nodes", captureTarget });
  harness.controller.finish({ pointerId: 7 });
  assert.deepEqual(harness.calls.map(([name]) => name), [
    "flush",
    "finishNodeDrag",
    "finishNodeClick",
    "clearAction",
    "setDragging",
    "releasePointer",
  ]);
  assert.equal(harness.calls.at(-1)[1], captureTarget);
});

test("a node panel opens only when the drag candidate finishes as a click", () => {
  const harness = createHarness();
  harness.setAction({ type: "drag-candidate", activeId: "node-1" });
  harness.controller.finish({ type: "pointerup", pointerId: 6 });
  assert.deepEqual(harness.calls.map(([name]) => name), [
    "finishNodeClick",
    "clearAction",
    "setDragging",
    "releasePointer",
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(harness.calls[0].slice(1))), [
    { type: "drag-candidate", activeId: "node-1" },
    { type: "pointerup", pointerId: 6 },
    { cancelled: false },
  ]);
  assert.equal(harness.controller.finish({ type: "pointerup", pointerId: 6 }), false);
  assert.equal(harness.calls.filter(([name]) => name === "finishNodeClick").length, 1);
});

test("pointer cancellation does not reveal deferred node chrome", () => {
  const harness = createHarness();
  harness.setAction({ type: "drag-candidate", activeId: "node-1" });
  harness.controller.finish({ type: "pointercancel", pointerId: 6 });
  assert.equal(harness.calls[0][0], "finishNodeClick");
  assert.deepEqual(JSON.parse(JSON.stringify(harness.calls[0].at(-1))), { cancelled: true });
});

test("pointerup beyond the drag threshold reveals node chrome only after finishing the drag", () => {
  const harness = createHarness();
  harness.setAction({ type: "drag-candidate", activeId: "node-1" });
  harness.controller.finish({ type: "pointerup", pointerId: 6, clientX: 12 });
  assert.deepEqual(harness.calls.map(([name]) => name), [
    "promoteNodeDrag",
    "finishNodeDrag",
    "finishNodeClick",
    "clearAction",
    "setDragging",
    "releasePointer",
  ]);
});

test("an established node drag reveals chrome after pointerup but not after cancellation", () => {
  const completed = createHarness();
  completed.setAction({ type: "drag-nodes", activeId: "node-1" });
  completed.controller.finish({ type: "pointerup", pointerId: 6, clientX: 12 });
  assert.deepEqual(completed.calls.map(([name]) => name), [
    "flush",
    "finishNodeDrag",
    "finishNodeClick",
    "clearAction",
    "setDragging",
    "releasePointer",
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(completed.calls[2].at(-1))), { cancelled: false });

  const cancelled = createHarness();
  cancelled.setAction({ type: "drag-nodes", activeId: "node-1" });
  cancelled.controller.finish({ type: "pointercancel", pointerId: 6, clientX: 12 });
  assert.deepEqual(cancelled.calls.map(([name]) => name), [
    "finishNodeDrag",
    "finishNodeClick",
    "clearAction",
    "setDragging",
    "releasePointer",
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(cancelled.calls[1].at(-1))), { cancelled: true });
});

test("group candidate promotes and commits from the terminal pointer position", () => {
  const harness = createHarness();
  harness.setAction({ type: "group-drag-candidate", pointerId: 12, groupId: "group-1" });
  harness.controller.finish({ type: "pointerup", pointerId: 12, clientX: 12 });
  assert.deepEqual(harness.calls.map(([name]) => name), [
    "promoteGroupDrag",
    "finishGroup",
    "clearAction",
    "setDragging",
    "releasePointer",
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(harness.calls[1].at(-1))), { cancelled: false });
});

test("group cancellation rolls back without flushing terminal movement", () => {
  const harness = createHarness();
  harness.setAction({ type: "drag-group", pointerId: 13, groupId: "group-1" });
  harness.controller.finish({ type: "pointercancel", pointerId: 13, clientX: 30 });
  assert.deepEqual(harness.calls.map(([name]) => name), [
    "finishGroup",
    "clearAction",
    "setDragging",
    "releasePointer",
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(harness.calls[0].at(-1))), { cancelled: true });
});

test("unrelated pointers cannot move or finish the active group interaction", () => {
  const harness = createHarness();
  harness.setAction({ type: "drag-group", pointerId: 14, groupId: "group-1" });
  assert.equal(harness.controller.handleMove({ pointerId: 15, clientX: 30 }), false);
  assert.equal(harness.controller.finish({ type: "pointerup", pointerId: 15, clientX: 30 }), false);
  assert.deepEqual(harness.calls, []);
});

test("connection pointerup flushes the last move before committing", () => {
  const harness = createHarness();
  harness.setAction({ type: "connect" });
  harness.controller.finish({ type: "pointerup", pointerId: 8 });
  assert.deepEqual(harness.calls.map(([name]) => name), ["flush", "finishConnection"]);
  assert.deepEqual(JSON.parse(JSON.stringify(harness.calls.at(-1).slice(1))), [
    { type: "pointerup", pointerId: 8 },
    { cancelled: false },
  ]);
});

test("connection pointercancel skips commit work and reports cancellation", () => {
  const harness = createHarness();
  harness.setAction({ type: "connect" });
  harness.controller.finish({ type: "pointercancel", pointerId: 9 });
  assert.deepEqual(harness.calls.map(([name]) => name), ["finishConnection"]);
  assert.deepEqual(JSON.parse(JSON.stringify(harness.calls.at(-1).slice(1))), [
    { type: "pointercancel", pointerId: 9 },
    { cancelled: true },
  ]);
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

test("selection-frame blank space starts aggregate dragging before marquee", () => {
  const harness = createHarness();
  harness.setSelectionFrameTarget(true);
  let prevented = false;
  assert.equal(harness.controller.handleSurfacePointerDown({
    target: "canvas",
    button: 0,
    preventDefault: () => { prevented = true; },
  }), true);
  assert.equal(prevented, true);
  assert.deepEqual(harness.calls.map(([name]) => name), [
    "closeConnectionCreateMenu",
    "beginSelectionFrameDrag",
  ]);
  assert.doesNotMatch(harness.calls.map(([name]) => name).join("|"), /beginMarquee/);
});

test("pan keeps priority over selection-frame dragging", () => {
  const harness = createHarness();
  harness.setSelectionFrameTarget(true);
  harness.controller.handleSurfacePointerDown({
    target: "canvas",
    button: 1,
    preventDefault() {},
  });
  assert.deepEqual(harness.calls.map(([name]) => name), [
    "closeConnectionCreateMenu",
    "beginPan",
  ]);
});
