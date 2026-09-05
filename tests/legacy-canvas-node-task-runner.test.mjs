import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../src/legacy-canvas/canvas-node-task-runner.js", import.meta.url), "utf8");
const context = vm.createContext({});
vm.runInContext(source, context);
const { createCanvasNodeTaskRunner } = context.REELAY_CANVAS_NODE_TASK_RUNNER;

function createHarness(overrides = {}) {
  let taskSerial = 0;
  let timerSerial = 0;
  let projectId = "project-one";
  const nodes = new Map([["canvas-one/node-one", {}], ["canvas-two/node-one", {}]]);
  const timers = new Map();
  const callbacks = new Map();
  const calls = { starts: [], completes: [], cancels: [] };
  const runner = createCanvasNodeTaskRunner({
    makeTaskId: () => `task-${++taskSerial}`,
    setTimer: (callback, delay) => { const id = ++timerSerial; timers.set(id, { callback, delay }); callbacks.set(id, callback); return id; },
    clearTimer: (id) => timers.delete(id),
    resolveTarget: (scope) => scope.projectId === projectId ? nodes.get(`${scope.canvasId}/${scope.nodeId}`) : null,
    onStart: (task, node) => { calls.starts.push({ task, node }); },
    onComplete: (task, node) => { calls.completes.push({ task, node }); },
    onCancel: (task, node, reason) => { calls.cancels.push({ task, node, reason }); },
    ...overrides,
  });
  const start = (extra = {}) => runner.start({
    kind: "generation", scope: { projectId, canvasId: "canvas-one", nodeId: "node-one" },
    inputs: { parameterSnapshot: { prompt: "hello", assetIds: ["media-one"] } }, delayMs: 1200, ...extra,
  });
  return { runner, start, nodes, timers, callbacks, calls, changeProject: (id) => { projectId = id; } };
}

test("runner snapshots task inputs, owns its timer and emits completion exactly once", () => {
  const h = createHarness();
  const inputs = { parameterSnapshot: { prompt: "original", assetIds: ["a"] } };
  const task = h.start({ inputs });
  inputs.parameterSnapshot.prompt = "edited";
  inputs.parameterSnapshot.assetIds.push("b");
  assert.equal(task.inputs.parameterSnapshot.prompt, "original");
  assert.equal(task.inputs.parameterSnapshot.assetIds.length, 1);
  assert.ok(Object.isFrozen(task) && Object.isFrozen(task.inputs.parameterSnapshot.assetIds));
  assert.equal(h.timers.get(1).delay, 1200);
  assert.equal(h.start(), null, "an existing task owns this live target across task kinds");
  assert.equal(h.start({ kind: "prompt-optimization" }), null);
  const complete = h.callbacks.get(1);
  complete();
  complete();
  assert.equal(h.calls.starts.length, 1);
  assert.equal(h.calls.completes.length, 1);
  assert.equal(h.timers.size, 0);
  assert.ok(h.start(), "completion releases the target for a later operation");
  h.runner.dispose();
});

test("cancellation retires old callbacks and cannot clear a newer task on the same node", () => {
  const h = createHarness();
  const original = h.start({ kind: "prompt-optimization", delayMs: 900 });
  assert.equal(h.runner.cancelScope({ projectId: "project-one", canvasId: "canvas-one", nodeIds: ["node-one"] }, "nodes-deleted"), 1);
  assert.equal(h.calls.cancels[0].task, original);
  assert.equal(h.calls.cancels[0].reason, "nodes-deleted");
  const next = h.start({ kind: "prompt-optimization", delayMs: 900 });
  h.callbacks.get(1)();
  assert.equal(h.calls.completes.length, 0);
  assert.equal(h.timers.size, 1);
  h.callbacks.get(2)();
  assert.equal(h.calls.completes[0].task, next);
  assert.equal(h.calls.cancels.length, 1);
});

test("same-id replacement does not inherit the old target's task or cancellation effects", () => {
  const h = createHarness();
  h.start();
  const replacement = {};
  h.nodes.set("canvas-one/node-one", replacement);
  const next = h.start({ kind: "prompt-optimization", delayMs: 900 });
  assert.ok(next);
  assert.equal(h.timers.has(1), false);
  assert.equal(h.calls.cancels.length, 0, "the replaced target is no longer live");
  h.callbacks.get(1)();
  assert.equal(h.calls.completes.length, 0);
  h.callbacks.get(2)();
  assert.equal(h.calls.completes[0].node, replacement);
  assert.equal(h.calls.completes[0].task, next);
});

test("expired project, deleted node and replaced identity cannot receive completion", () => {
  for (const invalidate of [
    (h) => h.changeProject("project-two"),
    (h) => h.nodes.delete("canvas-one/node-one"),
    (h) => h.nodes.set("canvas-one/node-one", {}),
  ]) {
    const h = createHarness();
    h.start();
    invalidate(h);
    h.callbacks.get(1)();
    assert.equal(h.calls.completes.length, 0);
    assert.equal(h.calls.cancels.length, 0);
    assert.equal(h.timers.size, 0);
    assert.equal(h.runner.cancelScope(), 0);
  }
});

test("scope cancellation leaves another canvas with the same node id running", () => {
  const h = createHarness();
  h.start();
  const background = h.start({ scope: { projectId: "project-one", canvasId: "canvas-two", nodeId: "node-one" } });
  assert.equal(h.runner.cancelScope({ projectId: "project-two" }), 0);
  assert.equal(h.runner.cancelScope({ canvasId: "canvas-one" }), 1);
  assert.equal(h.timers.size, 1);
  h.callbacks.get(2)();
  assert.equal(h.calls.completes[0].task, background);
});

test("dispose releases every timer, rejects new tasks and makes queued callbacks inert", () => {
  const h = createHarness();
  h.start();
  h.start({ scope: { projectId: "project-one", canvasId: "canvas-two", nodeId: "node-one" } });
  h.runner.dispose();
  h.runner.dispose();
  for (const callback of h.callbacks.values()) callback();
  assert.equal(h.timers.size, 0);
  assert.equal(h.calls.cancels.length, 2);
  assert.ok(h.calls.cancels.every((call) => call.reason === "disposed"));
  assert.equal(h.calls.completes.length, 0);
  assert.equal(h.start(), null);
  assert.equal(h.runner.cancelScope(), 0);
  assert.deepEqual(Object.keys(h.runner), ["start", "cancelScope", "dispose"]);
});

test("effect failures cannot leave completed or cancelled records owning targets", () => {
  const completion = createHarness({ onComplete: () => { throw new Error("commit failed"); } });
  completion.start();
  assert.throws(completion.callbacks.get(1), /commit failed/);
  assert.equal(completion.timers.size, 0);
  assert.ok(completion.start());
  completion.runner.dispose();
  const cancellation = createHarness({ onCancel: () => { throw new Error("cancel failed"); } });
  cancellation.start();
  cancellation.start({ scope: { projectId: "project-one", canvasId: "canvas-two", nodeId: "node-one" } });
  assert.throws(() => cancellation.runner.dispose(), /cancel failed/);
  assert.equal(cancellation.timers.size, 0);
  assert.equal(cancellation.runner.cancelScope(), 0);
});
