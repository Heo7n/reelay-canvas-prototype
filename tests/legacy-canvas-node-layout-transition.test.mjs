import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("../src/legacy-canvas/canvas-node-layout-transition.js", import.meta.url),
  "utf8",
);
const context = vm.createContext({});
new vm.Script(source).runInContext(context);
const transitionFactory = context.REELAY_CANVAS_NODE_LAYOUT_TRANSITION;

function createHarness({ reducedMotion = false } = {}) {
  let time = 0;
  let nextFrameId = 0;
  const frames = new Map();
  const frameCalls = [];
  const finishCalls = [];
  const controller = transitionFactory.createNodeLayoutTransitionController({
    now: () => time,
    requestFrame: (callback) => {
      nextFrameId += 1;
      frames.set(nextFrameId, callback);
      return nextFrameId;
    },
    cancelFrame: (frameId) => frames.delete(frameId),
    shouldReduceMotion: () => reducedMotion,
    onFrame: (ids) => frameCalls.push([...ids]),
    onFinish: (ids) => finishCalls.push([...ids]),
    duration: 240,
  });

  function advance(timestamp) {
    time = timestamp;
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(timestamp));
  }

  return { controller, advance, frameCalls, finishCalls };
}

const landscape = {
  x: 100,
  y: 220,
  nodeWidth: 705,
  nodeHeight: 760,
  mediaWidth: 620,
  mediaHeight: 349,
};
const portrait = {
  x: 82.5,
  y: 49,
  nodeWidth: 740,
  nodeHeight: 931,
  mediaWidth: 293,
  mediaHeight: 520,
};

test("a transition keeps the bottom edge and center stable at every sampled frame", () => {
  const harness = createHarness();
  assert.equal(harness.controller.start({ id: "node-a", from: landscape, to: portrait }), true);
  assert.deepEqual({ ...harness.controller.get("node-a") }, landscape);

  harness.advance(120);
  const middle = harness.controller.get("node-a");
  assert.ok(middle);
  assert.ok(Math.abs(middle.y + middle.mediaHeight - (landscape.y + landscape.mediaHeight)) < 0.001);
  assert.ok(Math.abs(middle.x + middle.nodeWidth / 2 - (landscape.x + landscape.nodeWidth / 2)) < 0.001);
  assert.deepEqual(harness.frameCalls, [["node-a"]]);

  harness.advance(240);
  assert.equal(harness.controller.get("node-a"), null);
  assert.deepEqual(harness.finishCalls, [["node-a"]]);
});

test("rapid aspect changes retarget from the currently presented frame", () => {
  const harness = createHarness();
  harness.controller.start({ id: "node-a", from: landscape, to: portrait });
  harness.advance(60);
  const presented = { ...harness.controller.get("node-a") };
  const square = {
    x: 100,
    y: 109,
    nodeWidth: 705,
    nodeHeight: 871,
    mediaWidth: 460,
    mediaHeight: 460,
  };

  harness.controller.start({ id: "node-a", from: portrait, to: square });
  assert.deepEqual({ ...harness.controller.get("node-a") }, presented);
});

test("reduced motion adopts canonical geometry without starting a transition", () => {
  const harness = createHarness({ reducedMotion: true });
  assert.equal(harness.controller.start({ id: "node-a", from: landscape, to: portrait }), false);
  assert.equal(harness.controller.get("node-a"), null);
  assert.deepEqual(harness.frameCalls, []);
});

test("finishing active transitions publishes the target frame before cleanup", () => {
  const harness = createHarness();
  harness.controller.start({ id: "node-a", from: landscape, to: portrait });
  assert.equal(harness.controller.finishAll(), true);
  assert.equal(harness.controller.get("node-a"), null);
  assert.deepEqual(harness.frameCalls, [["node-a"]]);
  assert.deepEqual(harness.finishCalls, [["node-a"]]);
});
