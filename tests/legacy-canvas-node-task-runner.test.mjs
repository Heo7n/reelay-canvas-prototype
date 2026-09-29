import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const context = vm.createContext({});
context.window = context;
for (const file of ["config/prototype-config.js", "infrastructure/generation/simulated-generation-executor.js",
  "application/generation-task-service.js", "legacy-canvas/canvas-node-task-runner.js"]) {
  vm.runInContext(await readFile(new URL(`../src/${file}`, import.meta.url), "utf8"), context);
}

function createHarness(overrides = {}) {
  let taskSerial = 0, timerSerial = 0, time = 10000, balance = 3000;
  let projectId = "project-one";
  const nodes = new Map([["canvas-one/node-one", {}], ["canvas-two/node-one", {}]]);
  const timers = new Map(), callbacks = [];
  const calls = { starts: [], completes: [], cancels: [], refunds: [] };
  const clock = {
    now: () => time,
    setTimer(callback, delay) {
      const id = ++timerSerial; timers.set(id, { callback, at: time + delay }); callbacks.push(callback); return id;
    },
    clearTimer: (id) => timers.delete(id),
  };
  const service = context.REELAY_GENERATION_TASKS.createService({
    makeId: () => `task-${++taskSerial}`, now: clock.now,
    executor: context.REELAY_SIMULATED_GENERATION_EXECUTOR.createExecutor(clock),
    cancelWindowMs: 5000, previewDurationMs: 7500,
    charge(cost) { if (balance < cost) return false; balance -= cost; return true; },
    refund(cost) { balance += cost; calls.refunds.push(cost); return true; },
    makeResult: () => ({ id: `result-${taskSerial}`, type: "video", url: "/result.mp4" }),
  });
  const runner = context.REELAY_CANVAS_NODE_TASK_RUNNER.createCanvasNodeTaskRunner({
    service,
    resolveTarget: (scope) => scope.projectId === projectId ? nodes.get(`${scope.canvasId}/${scope.nodeId}`) : null,
    onStart: (task, node) => { calls.starts.push({ task, node }); },
    onComplete: (task, node) => { calls.completes.push({ task, node }); },
    onCancel: (task, node, reason) => { calls.cancels.push({ task, node, reason }); },
    ...overrides,
  });
  const start = (extra = {}) => runner.start({
    scope: { projectId, canvasId: "canvas-one", nodeId: "node-one" },
    input: { mediaType: "video", cost: 24, parameters: { prompt: "hello", assetIds: ["media-one"] } }, ...extra,
  });
  const advance = (duration) => {
    const until = time + duration;
    for (;;) {
      const next = [...timers.entries()].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      const [id, timer] = next;
      time = timer.at; timers.delete(id); timer.callback();
    }
    time = until;
  };
  return { runner, service, start, nodes, timers, callbacks, calls, advance,
    balance: () => balance, changeProject: (id) => { projectId = id; } };
}

test("node adapter and conversation read the same immutable application task and settlement", () => {
  const h = createHarness();
  const input = { mediaType: "video", cost: 24, parameters: { prompt: "original", assetIds: ["a"] } };
  const task = h.start({ input });
  input.parameters.prompt = "edited"; input.parameters.assetIds.push("b");
  assert.equal(task.input.parameters.prompt, "original");
  assert.equal(task.input.parameters.assetIds.length, 1);
  assert.ok(Object.isFrozen(task) && Object.isFrozen(task.input.parameters));
  assert.equal(h.service.get(task.id), task);
  assert.equal(h.runner.get(task.id), task);
  assert.equal(task.sourceSurface, "canvas"); assert.equal(task.scope.conversationId, null);
  assert.equal(h.start(), null); assert.equal(h.balance(), 2976);
  h.advance(7499); assert.equal(h.calls.completes.length, 0); assert.ok(task.progress < 100);
  h.advance(1); assert.equal(h.calls.completes[0].task, task);
  assert.equal(task.status, "succeeded"); assert.equal(task.progress, 100);
  for (const callback of [...h.callbacks]) callback();
  assert.equal(h.calls.completes.length, 1); assert.equal(h.timers.size, 0);
  assert.ok(h.start()); h.runner.dispose(); h.service.dispose();
});

test("system cancellation retires callbacks without clearing a newer task or inventing refunds", () => {
  const h = createHarness(); const original = h.start(); const callbacks = [...h.callbacks];
  assert.equal(h.runner.cancelScope({ canvasId: "canvas-one", nodeIds: ["node-one"] }, "nodes-deleted"), 1);
  assert.equal(h.calls.cancels[0].task, original); assert.equal(original.cancellationReason, "nodes-deleted");
  const next = h.start(); for (const callback of callbacks) callback();
  assert.equal(h.calls.completes.length, 0); assert.equal(h.runner.get(next.id), next);
  h.advance(7500); assert.equal(h.calls.completes[0].task, next);
  assert.deepEqual(h.calls.refunds, []); assert.equal(h.balance(), 2952);
});

test("same-id replacement never inherits old task effects and can start a new task", () => {
  const h = createHarness(); const old = h.start(); const callbacks = [...h.callbacks];
  const replacement = {}; h.nodes.set("canvas-one/node-one", replacement);
  const next = h.start(); assert.ok(next); assert.equal(old.status, "canceled");
  assert.equal(h.calls.cancels.length, 0);
  for (const callback of callbacks) callback();
  h.advance(7500); assert.equal(h.calls.completes[0].node, replacement);
  assert.equal(h.calls.completes[0].task, next); assert.equal(h.calls.completes.length, 1);
});

test("expired projects, deleted nodes and replaced identities reject manual as well as scheduled completion", () => {
  for (const invalidate of [(h) => h.changeProject("project-two"),
    (h) => h.nodes.delete("canvas-one/node-one"), (h) => h.nodes.set("canvas-one/node-one", {})]) {
    const h = createHarness(); const task = h.start(); invalidate(h);
    assert.equal(h.service.complete(task), false); assert.equal(task.status, "canceled");
    for (const callback of [...h.callbacks]) callback();
    assert.equal(h.calls.completes.length, 0); assert.equal(h.calls.cancels.length, 0);
    assert.equal(h.timers.size, 0); assert.equal(h.runner.cancelScope(), 0);
  }
});

test("canceling one canvas leaves another canvas and conversation task running", () => {
  const h = createHarness(); h.start();
  const background = h.start({ scope: { projectId: "project-one", canvasId: "canvas-two", nodeId: "node-one" } });
  const conversation = h.service.submit({ scope: { projectId: "project-one", canvasId: "canvas-one", conversationId: "chat" },
    input: { mediaType: "video", cost: 36 } });
  assert.equal(h.runner.cancelScope({ projectId: "project-two" }), 0);
  assert.equal(h.runner.cancelScope({ canvasId: "canvas-one" }), 1);
  h.advance(7500); assert.equal(h.calls.completes[0].task, background);
  assert.equal(conversation.status, "succeeded"); assert.equal(h.calls.completes.length, 1);
});

test("disposal cleans up only node projections and does not own the application service", () => {
  const h = createHarness(); const task = h.start();
  const conversation = h.service.submit({ scope: { projectId: "project-one", canvasId: "canvas-one", conversationId: "chat" },
    input: { mediaType: "video", cost: 36 } });
  h.runner.dispose(); h.runner.dispose(); assert.equal(h.start(), null);
  assert.equal(task.status, "canceled"); assert.equal(h.calls.cancels[0].reason, "disposed");
  h.advance(7500); assert.equal(conversation.status, "succeeded");
  assert.equal(h.runner.get(task.id), null); assert.equal(h.runner.canCancel(task.id), false);
  assert.equal(h.runner.cancel(task.id), false); assert.equal(h.timers.size, 0);
});

test("all entry points use a strict five-second deadline and one refund per task", () => {
  for (const elapsed of [4999, 5000, 5500]) {
    const h = createHarness(); const task = h.start(); h.advance(elapsed);
    assert.equal(task.canCancel, elapsed < 5000); assert.equal(h.runner.canCancel(task.id), elapsed < 5000);
    assert.equal(h.runner.cancel(task.id), elapsed < 5000);
    if (elapsed < 5000) {
      assert.equal(task.cancellationReason, "user-canceled"); assert.equal(h.runner.cancel(task.id), false);
      assert.equal(h.service.cancel(task), false); assert.equal(h.balance(), 3000);
      assert.deepEqual(h.calls.refunds, [24]);
    } else {
      assert.equal(h.runner.cancelScope({ canvasId: "canvas-one" }, "canvas-deleted"), 1);
      assert.equal(h.balance(), 2976); assert.deepEqual(h.calls.refunds, []);
    }
    for (const callback of [...h.callbacks]) callback();
    assert.equal(h.calls.cancels.length, 1); assert.equal(h.calls.completes.length, 0); assert.equal(h.timers.size, 0);
  }
});

test("progress and completion observer failures cannot strand the target or repeat settlement", () => {
  const h = createHarness({ onProgress() { throw new Error("view failed"); }, onComplete() { throw new Error("projection failed"); } });
  const first = h.start(); h.advance(7500);
  assert.equal(first.status, "succeeded"); assert.equal(h.timers.size, 0);
  assert.ok(h.start()); h.runner.dispose(); assert.equal(h.timers.size, 0);
});

test("failed execution releases the original node and refunds the service debit once", () => {
  const h = createHarness(); const task = h.start();
  assert.equal(h.service.fail(task, "supplier failed"), true);
  assert.equal(h.calls.cancels[0].reason, "failed"); assert.equal(h.balance(), 3000);
  assert.deepEqual(h.calls.refunds, [24]); assert.equal(h.service.fail(task), false);
  assert.ok(h.start()); h.runner.dispose();
});

test("invalid targets are rejected before debit and insufficient credits never start a node", () => {
  const h = createHarness(); h.nodes.delete("canvas-one/node-one");
  assert.equal(h.start(), null); assert.equal(h.service.list().length, 0); assert.equal(h.balance(), 3000);
  h.nodes.set("canvas-one/node-one", {});
  assert.equal(h.start({ input: { mediaType: "video", cost: 3001 } }), null);
  assert.equal(h.calls.starts.length, 0); assert.equal(h.timers.size, 0);
});
