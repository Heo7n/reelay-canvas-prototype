import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { test } from "node:test";

const sandbox = vm.createContext({});
sandbox.window = sandbox;
for (const file of ["src/config/prototype-config.js", "data/model-catalog.js", "src/infrastructure/generation/simulated-generation-executor.js", "src/application/draft-video-policy.js", "src/application/generation-task-service.js"]) {
  vm.runInContext(fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), sandbox, { filename: file });
}
const { createService } = sandbox.REELAY_GENERATION_TASKS;

function fixture(overrides = {}, makeService = createService) {
  let time = 1000;
  let nextTimer = 0;
  let nextTask = 0;
  let balance = overrides.balance ?? 3000;
  const timers = new Map();
  const debits = [];
  const refunds = [];
  const refundNotices = [];
  const events = [];
  const serviceOptions = {
    makeId: () => `task-${++nextTask}`,
    now: () => time,
    setTimer(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { at: time + delay, callback });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
    charge(cost, id) {
      debits.push({ cost, id });
      if (balance < cost) return false;
      balance -= cost;
      return true;
    },
    refund(cost, id) {
      refunds.push({ cost, id });
      balance += cost;
      return true;
    },
    makeResult: (task) => ({ id: `result-${task.id}`, type: task.input.mediaType, url: "/assets/example.mp4", name: "示例结果" }),
    onRefund: (task) => refundNotices.push(task.refunded),
    draftPolicy: sandbox.REELAY_DRAFT_VIDEO,
    cancelWindowMs: 5000, previewDurationMs: 7500,
    ...overrides,
  };
  const service = makeService({ ...serviceOptions,
    executor: overrides.executor || sandbox.REELAY_SIMULATED_GENERATION_EXECUTOR.createExecutor(serviceOptions),
  });
  service.subscribe((task, event) => events.push({ id: task.id, type: event.type, status: task.status, progress: task.progress, canCancel: task.canCancel, refunded: task.refunded }));
  function advance(milliseconds) {
    const target = time + milliseconds;
    while (true) {
      const pending = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!pending) break;
      time = pending[1].at;
      timers.delete(pending[0]);
      pending[1].callback();
    }
    time = target;
  }
  return { service, timers, debits, refunds, refundNotices, events, advance, setTime: (value) => { time = value; }, balance: () => balance };
}

function input(overrides = {}) {
  return {
    scope: { projectId: "project-1", conversationId: "conversation-1", canvasId: "canvas-1" },
    input: {
      prompt: "以图片1为参考生成视频",
      promptDocument: { version: 1, content: [{ type: "text", text: "以" }, { type: "reference", key: "asset:a" }] },
      references: [{ id: "a", type: "image", url: "/reference.jpg" }],
      referenceSnapshot: [{ key: "asset:a", label: "图片1" }],
      parameters: { duration: 10, nested: { resolution: "480p" } },
      modelId: "example-video", modelName: "Example", parameterSummary: "16:9 · 10s",
      mediaType: "video", cost: 24,
    },
    ...overrides,
  };
}

test("owner invalidation wins over a late failure without applying a supplier refund", () => {
  const signals = [];
  const f = fixture({ executor: { start: (callbacks) => signals.push(callbacks), stop() {}, dispose() {} } });
  let current = true;
  const task = f.service.submit(input({ isCurrent: () => current }));
  current = false;
  signals[0].onFail("late failure");
  assert.equal(task.status, "canceled");
  assert.equal(task.cancellationReason, "owner-replaced");
  assert.equal(task.refunded, 0); assert.equal(f.refunds.length, 0);
  assert.equal(f.service.fail(task), false); assert.equal(f.service.complete(task), false);
  assert.equal(f.balance(), 2976);
});

test("acceptance binds a task before execution and a rejected projection refunds once", () => {
  let observed;
  const f = fixture({ executor: { start({ onComplete }) { assert.ok(observed); onComplete(); }, stop() {}, dispose() {} } });
  const task = f.service.submit(input({ onAccepted(value) { observed = value; } }));
  assert.equal(task, observed); assert.equal(task.status, "succeeded");
  const rejected = f.service.submit(input({ onAccepted() { return false; } }));
  assert.equal(rejected.status, "failed"); assert.equal(rejected.refunded, 24);
  assert.equal(f.refunds.length, 1);
});

test("submit freezes inputs and scope while task identity remains stable across state changes", () => {
  const f = fixture();
  const request = input();
  const task = f.service.submit(request);
  request.input.prompt = "later draft";
  request.input.parameters.nested.resolution = "1080p";
  request.input.references[0].url = "/changed.jpg";
  request.input.referenceSnapshot[0].label = "图片2";
  request.scope.projectId = "other";
  assert.equal(task.input.prompt, "以图片1为参考生成视频");
  assert.equal(task.input.parameters.nested.resolution, "480p");
  assert.equal(task.input.references[0].url, "/reference.jpg");
  assert.equal(task.input.referenceSnapshot[0].label, "图片1");
  assert.equal(task.scope.projectId, "project-1");
  assert.ok(Object.isFrozen(task) && Object.isFrozen(task.input.parameters.nested));
  assert.throws(() => { task.status = "succeeded"; }, TypeError);
  assert.throws(() => { task.input.references.push({}); }, TypeError);
  f.advance(700);
  assert.equal(f.service.get(task.id), task);
  assert.equal(f.service.list()[0], task);
  assert.equal(task.status, "running");
  assert.equal(task.startedAt, 1700);
});

test("successful task debits once, follows queued/running states, and holds immutable result", () => {
  const f = fixture();
  const task = f.service.submit(input());
  assert.equal(task.status, "queued");
  assert.equal(task.progress, 0);
  assert.equal(task.charged, 24);
  assert.equal(f.balance(), 2976);
  f.advance(699);
  assert.equal(task.status, "queued");
  f.advance(1);
  assert.equal(task.status, "running");
  f.advance(6799);
  assert.equal(task.status, "running");
  f.advance(1);
  assert.equal(task.status, "succeeded");
  assert.equal(task.progress, 100);
  assert.equal(task.finishedAt, 8500);
  assert.equal(task.result.id, `result-${task.id}`);
  assert.ok(Object.isFrozen(task.result));
  assert.equal(task.canCancel, false);
  assert.equal(f.debits.length, 1);
  assert.equal(f.refunds.length, 0);
  assert.equal(f.timers.size, 0);
});

test("all task readers observe one monotonic simulation percentage that reaches 100 only on success", () => {
  const f = fixture();
  const request = input();
  const task = f.service.submit(request);
  const observations = [];
  f.service.subscribe((updated, event) => {
    if (event.type !== "progress") return;
    assert.equal(updated, task);
    assert.equal(f.service.get(task.id).progress, task.progress);
    assert.equal(f.service.list(request.scope)[0].progress, task.progress);
    assert.ok(task.progress >= 0 && task.progress < 100 && Number.isInteger(task.progress));
    observations.push(task.progress);
  });
  assert.throws(() => { task.progress = 87; }, TypeError);
  f.advance(500);
  assert.ok(task.progress > 0);
  f.advance(6999);
  assert.equal(task.status, "running");
  assert.ok(observations.length > 10);
  assert.ok(observations.every((value, index) => index === 0 || value > observations[index - 1]));
  f.advance(1);
  assert.equal(task.progress, 100);
  assert.equal(f.events.at(-1).type, "succeeded");
  assert.equal(f.events.at(-1).progress, 100);
  assert.equal(f.timers.size, 0);
});

test("progress ignores invalid, duplicate and stale signals and clamps active percentages below completion", () => {
  const signals = [];
  const isolated = vm.createContext({});
  vm.runInContext(fs.readFileSync(new URL("../src/application/generation-task-service.js", import.meta.url), "utf8"), isolated);
  const f = fixture({ executor: { start: (callbacks) => signals.push(callbacks), stop() {}, dispose() {} } }, isolated.REELAY_GENERATION_TASKS.createService);
  const task = f.service.submit(input());
  for (const value of [NaN, Infinity, "40", undefined, -5]) signals[0].onProgress(value);
  assert.equal(task.progress, 0);
  signals[0].onProgress(12.9);
  for (const value of [12, 12.4, 8, 0]) signals[0].onProgress(value);
  assert.equal(task.progress, 12);
  assert.equal(f.events.filter((event) => event.type === "progress").length, 1);
  signals[0].onProgress(100);
  assert.equal(task.progress, 99);
  signals[0].onProgress(1000);
  assert.equal(f.events.filter((event) => event.type === "progress").length, 2);
  f.service.complete(task);
  signals[0].onProgress(20);
  assert.equal(task.progress, 100);
  const failed = f.service.submit(input());
  signals[1].onProgress(26);
  f.service.fail(failed);
  signals[1].onProgress(88);
  assert.equal(failed.progress, 26);
  const disposed = f.service.submit(input());
  f.service.dispose();
  signals[2].onProgress(70);
  assert.equal(disposed.progress, 0);
});

test("canceling from a progress observer stops execution without rescheduling another tick", () => {
  const f = fixture();
  const task = f.service.submit(input());
  f.service.subscribe((updated, event) => {
    if (event.type === "progress") f.service.cancel(updated);
  });
  f.advance(500);
  assert.equal(task.status, "canceled");
  assert.equal(f.timers.size, 0);
  const stoppedProgress = task.progress;
  f.advance(60000);
  assert.equal(task.progress, stoppedProgress);
  assert.equal(f.refunds.length, 1);
});

test("duplicate submit returns same task and never creates timers or another debit", () => {
  const f = fixture();
  const request = input({ idempotencyKey: "send-1" });
  const first = f.service.submit(request);
  const timerCount = f.timers.size;
  const second = f.service.submit({ ...request, input: { ...request.input, cost: 500 } });
  assert.equal(first, second);
  assert.equal(f.service.list().length, 1);
  assert.equal(f.debits.length, 1);
  assert.equal(f.timers.size, timerCount);
});

test("idempotency is scoped and cannot combine different projects, conversations, or canvases", () => {
  const f = fixture();
  const request = input({ idempotencyKey: "same-key" });
  const tasks = [f.service.submit(request)];
  for (const field of ["projectId", "conversationId", "canvasId"]) {
    tasks.push(f.service.submit({ ...request, scope: { ...request.scope, [field]: "other" } }));
  }
  assert.equal(new Set(tasks.map((task) => task.id)).size, 4);
  assert.equal(f.service.list({ projectId: "project-1" }).length, 3);
  assert.equal(f.service.list(request.scope).length, 1);
});

test("insufficient balance yields no task, timer, or refund and preserves next scenario", () => {
  const f = fixture({ balance: 20 });
  f.service.setNextScenario({ outcome: "failure", reason: "测试原因" });
  const request = input({ idempotencyKey: "send-1" });
  assert.equal(f.service.submit(request), null);
  assert.equal(f.service.list().length, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(f.refunds.length, 0);
  assert.equal(f.balance(), 20);
  request.input.cost = 10;
  const task = f.service.submit(request);
  f.advance(7500);
  assert.equal(task.status, "failed");
  assert.equal(task.error, "测试原因");
  assert.equal(f.balance(), 20);
});

test("cancel before five seconds refunds exactly once and rejects all late signals", () => {
  const f = fixture();
  const task = f.service.submit(input());
  const staleCallbacks = [...f.timers.values()].map((timer) => timer.callback);
  f.advance(4999);
  staleCallbacks.push(...[...f.timers.values()].map((timer) => timer.callback));
  const canceledProgress = task.progress;
  assert.equal(f.service.cancel(task), true);
  assert.equal(task.status, "canceled");
  assert.equal(task.refunded, 24);
  assert.equal(f.balance(), 3000);
  assert.equal(f.service.cancel(task), false);
  assert.equal(f.service.complete(task), false);
  assert.equal(f.service.fail(task, "late failure"), false);
  for (const callback of staleCallbacks) callback();
  assert.equal(task.progress, canceledProgress);
  assert.equal(task.status, "canceled");
  assert.equal(task.result, null);
  assert.equal(f.refunds.length, 1);
  assert.deepEqual(f.refundNotices, [24]);
  assert.equal(f.timers.size, 0);
});

test("five-second boundary is strict even if the timeout has not fired", () => {
  const f = fixture();
  const task = f.service.submit(input());
  f.setTime(6000);
  assert.equal(task.canCancel, false);
  assert.equal(f.service.canCancel(task.id), false);
  assert.equal(f.service.cancel(task), false);
  assert.equal(task.status, "queued");
  assert.equal(f.refunds.length, 0);
});

test("cancel deadline notifies once independently of progress updates", () => {
  const f = fixture();
  const task = f.service.submit(input());
  f.advance(5000);
  assert.deepEqual(f.events.filter((event) => event.type !== "progress").map((event) => event.type), ["submitted", "running", "cancel-window-closed"]);
  assert.equal(f.events.at(-1).canCancel, false);
  assert.equal(task.status, "running");
  assert.equal(f.service.cancel(task), false);
});

test("failure refunds actual charged amount and remains terminal on completion", () => {
  const f = fixture();
  const request = input();
  const task = f.service.submit(request);
  request.input.cost = 900;
  assert.equal(f.service.fail(task, "  输入素材不可读取  "), true);
  assert.equal(task.error, "输入素材不可读取");
  assert.equal(task.refunded, 24);
  assert.equal(f.service.complete(task), false);
  assert.equal(f.service.fail(task), false);
  assert.equal(f.refunds.length, 1);
  assert.equal(f.events.at(-1).refunded, 24);
  assert.equal(f.balance(), 3000);
});

test("next-scenario configuration is consumed by exactly one accepted task", () => {
  const f = fixture();
  f.service.setNextScenario("failure", "指定的失败原因");
  const failed = f.service.submit(input());
  const successful = f.service.submit(input());
  f.advance(7500);
  assert.equal(failed.status, "failed");
  assert.equal(failed.error, "指定的失败原因");
  assert.equal(successful.status, "succeeded");
  assert.equal(f.balance(), 2976);
});

test("hold keeps running beyond the cancellation window and supports manual completion", () => {
  const f = fixture();
  f.service.setNextScenario({ outcome: "hold" });
  const task = f.service.submit(input());
  f.advance(60000);
  assert.equal(task.status, "running");
  assert.equal(task.progress, 99);
  assert.equal(task.canCancel, false);
  assert.equal(f.timers.size, 0);
  assert.equal(f.service.complete(task.id), true);
  assert.equal(task.status, "succeeded");
  assert.equal(task.progress, 100);
  assert.equal(task.finishedAt, 61000);
});

test("retry creates a distinct task and retains failed record and its refund", () => {
  const f = fixture();
  const first = f.service.submit(input());
  f.service.fail(first, "模拟失败");
  const retry = f.service.submit({ scope: first.scope, input: first.input });
  assert.notEqual(retry.id, first.id);
  assert.equal(first.status, "failed");
  assert.equal(retry.status, "queued");
  assert.equal(f.service.list().length, 2);
  assert.equal(f.debits.length, 2);
  assert.equal(f.refunds.length, 1);
  assert.equal(f.balance(), 2976);
});

test("remove only hides a terminal record and cannot undo charge or canvas linkage", () => {
  const f = fixture();
  const request = input({ idempotencyKey: "send-1" });
  const task = f.service.submit(request);
  assert.equal(f.service.remove(task), false);
  f.service.complete(task);
  f.service.markAdded(task, { nodeId: "node-a", canvasId: "canvas-1" });
  assert.equal(f.service.remove(task), true);
  assert.equal(f.service.remove(task), false);
  assert.equal(f.service.get(task.id), null);
  assert.equal(f.service.list().length, 0);
  assert.equal(task.addedNodeId, "node-a");
  assert.equal(f.refunds.length, 0);
  assert.equal(f.service.submit(request), task);
  assert.equal(f.debits.length, 1);
  assert.equal(f.service.list().length, 0);
});

test("canvas linkage is idempotent, protects existing target, and clears only matching mapping", () => {
  const f = fixture();
  const task = f.service.submit(input());
  const mapping = { nodeId: "node-1", canvasId: "canvas-2" };
  assert.equal(f.service.markAdded(task, mapping), false);
  f.service.complete(task);
  assert.equal(f.service.markAdded(task, mapping), true);
  assert.equal(f.service.markAdded(task, mapping), true);
  assert.equal(f.service.markAdded(task, { nodeId: "node-2", canvasId: "canvas-2" }), false);
  assert.equal(f.service.clearAdded(task, { ...mapping, nodeId: "wrong" }), false);
  assert.equal(f.service.clearAdded(task, mapping), true);
  assert.equal(task.addedNodeId, null);
  assert.equal(f.service.markAdded(task, { nodeId: "node-2", canvasId: "canvas-2" }), true);
  assert.equal(f.events.filter((event) => event.type === "added").length, 2);
});

test("task ownership rejects foreign facade even when it has the same id", () => {
  const first = fixture();
  const second = fixture();
  const task = first.service.submit(input());
  const foreignTask = second.service.submit(input());
  assert.equal(task.id, foreignTask.id);
  assert.equal(first.service.get(foreignTask), null);
  assert.equal(first.service.cancel(foreignTask), false);
  assert.equal(first.service.complete(foreignTask), false);
  assert.equal(first.service.fail(foreignTask), false);
  assert.equal(task.status, "queued");
});

test("dispose clears timers and subscribers, prevents late writes, and does not invent a refund", () => {
  const f = fixture();
  const task = f.service.submit(input());
  const staleCallbacks = [...f.timers.values()].map((timer) => timer.callback);
  f.service.dispose();
  f.service.dispose();
  for (const callback of staleCallbacks) callback();
  assert.equal(f.timers.size, 0);
  assert.equal(f.service.submit(input()), null);
  assert.equal(f.service.cancel(task), false);
  assert.equal(f.service.complete(task), false);
  assert.equal(f.service.fail(task), false);
  assert.equal(task.canCancel, false);
  assert.equal(task.status, "queued");
  assert.equal(f.refunds.length, 0);
  assert.equal(f.events.length, 1);
});

test("zero-cost tasks can complete and cancel without debit, refund, or refund toast", () => {
  const f = fixture();
  const request = input();
  request.input.cost = 0;
  const task = f.service.submit(request);
  assert.equal(f.service.cancel(task), true);
  assert.equal(task.charged, 0);
  assert.equal(task.refunded, 0);
  assert.equal(f.debits.length, 0);
  assert.equal(f.refunds.length, 0);
  assert.equal(f.refundNotices.length, 0);
});

test("refund failure is never shown as refunded and callbacks cannot retry settlement", () => {
  let attempts = 0;
  const f = fixture({ refund() { attempts += 1; return false; } });
  const task = f.service.submit(input());
  assert.equal(f.service.cancel(task), true);
  assert.equal(task.refunded, 0);
  assert.equal(f.refundNotices.length, 0);
  assert.equal(f.service.fail(task), false);
  assert.equal(f.service.cancel(task), false);
  assert.equal(attempts, 1);
});

test("throwing or reentrant observers cannot corrupt task settlement", () => {
  const f = fixture();
  f.service.subscribe(() => { throw new Error("view error"); });
  f.service.subscribe((task) => {
    if (task.status === "failed") {
      f.service.fail(task, "repeat");
      f.service.complete(task);
    }
  });
  const task = f.service.submit(input());
  assert.equal(f.service.fail(task, "original"), true);
  assert.equal(task.error, "original");
  assert.equal(task.status, "failed");
  assert.equal(f.refunds.length, 1);
  assert.equal(f.refundNotices.length, 1);
});

test("subscriber can cancel immediately on submit without leaving timers alive", () => {
  const f = fixture();
  f.service.subscribe((task, event) => { if (event.type === "submitted") f.service.cancel(task); });
  const task = f.service.submit(input());
  assert.equal(task.status, "canceled");
  assert.equal(f.timers.size, 0);
  assert.equal(f.balance(), 3000);
});

test("makeResult failures become a failed task with one refund", () => {
  const f = fixture({ makeResult() { throw new Error("结果暂不可用"); } });
  const task = f.service.submit(input());
  f.advance(7500);
  assert.equal(task.status, "failed");
  assert.equal(task.error, "结果暂不可用");
  assert.equal(task.result, null);
  assert.equal(f.refunds.length, 1);
});

test("an explicit completion result is copied rather than retaining caller-owned data", () => {
  const f = fixture();
  const task = f.service.submit(input());
  const result = { id: "output", type: "video", url: "/result.mp4", metadata: { duration: 10 } };
  f.service.complete(task, result);
  result.metadata.duration = 50;
  result.url = "/other.mp4";
  assert.equal(task.result.metadata.duration, 10);
  assert.equal(task.result.url, "/result.mp4");
  assert.equal(f.service.cancel(task), false);
});

test("completion cannot change the task media kind", () => {
  const f = fixture();
  const task = f.service.submit(input());
  f.service.complete(task, { id: "wrong-kind", type: "image", url: "/output.jpg" });
  assert.equal(task.status, "failed");
  assert.equal(task.result, null);
  assert.match(task.error, /类型/);
  assert.equal(task.input.mediaType, "video");
  assert.equal(task.refunded, 24);
});

test("invalid scope, snapshot, cost, scenario, and duplicate ids fail before debit", () => {
  const f = fixture({ makeId: () => "duplicate" });
  for (const cost of [-1, Infinity, NaN, undefined]) {
    const request = input();
    request.input.cost = cost;
    assert.throws(() => f.service.submit(request), /cost/);
  }
  assert.throws(() => f.service.submit(input({ scope: { projectId: "project-1" } })), /scope/);
  const cyclic = input();
  cyclic.input.parameters.self = cyclic.input;
  assert.throws(() => f.service.submit(cyclic), /cycles/);
  assert.throws(() => f.service.setNextScenario("random"), /outcome/);
  assert.equal(f.debits.length, 0);
  f.service.submit(input());
  assert.throws(() => f.service.submit(input()), /unique/);
  assert.equal(f.debits.length, 1);
});

test("settlement uses frozen cost even if the charge adapter changes the original draft", () => {
  const request = input();
  let refunded = 0;
  const f = fixture({
    charge(cost) { assert.equal(cost, 24); request.input.cost = 500; return true; },
    refund(cost) { refunded = cost; return true; },
  });
  const task = f.service.submit(request);
  f.service.cancel(task);
  assert.equal(task.input.cost, 24);
  assert.equal(task.charged, 24);
  assert.equal(refunded, 24);
});

test("unsubscribe detaches only its own observer", () => {
  const f = fixture();
  let notifications = 0;
  const unsubscribe = f.service.subscribe(() => { notifications += 1; });
  const task = f.service.submit(input());
  unsubscribe();
  f.service.complete(task);
  assert.equal(notifications, 1);
  assert.equal(f.events.at(-1).type, "succeeded");
});

test("preview history imports immutable terminal snapshots without touching the current account or executor", () => {
  const f = fixture();
  const request = input();
  const entries = ["succeeded", "failed", "canceled"].map((status) => ({ input: request.input, status,
    result: status === "succeeded" ? { type: "video", url: "/example.mp4" } : null,
    error: "参考视频读取失败", createdAt: 100, finishedAt: 200 }));
  const imported = f.service.importPreviewRecords({ scope: request.scope, records: entries });
  assert.equal(imported.length, 3);
  assert.equal(f.balance(), 3000);
  assert.equal(f.debits.length, 0); assert.equal(f.refunds.length, 0); assert.equal(f.refundNotices.length, 0);
  assert.equal(f.timers.size, 0);
  assert.deepEqual(Array.from(imported, (task) => task.status), ["succeeded", "failed", "canceled"]);
  assert.deepEqual(Array.from(imported, (task) => task.progress), [100, 0, 0]);
  assert.deepEqual(Array.from(imported, (task) => task.refunded), [0, 24, 24]);
  assert.ok(imported.every((task) => task.isPreview && task.charged === 24 && !task.canCancel && !task.addedNodeId));
  assert.ok(f.events.every((event) => event.type === "preview-imported"));
  request.input.prompt = "later";
  assert.equal(imported[0].input.prompt, "以图片1为参考生成视频");
  assert.equal(f.service.cancel(imported[2]), false);
  assert.equal(f.service.complete(imported[0]), false);
  assert.equal(f.service.markAdded(imported[0], { nodeId: "n", canvasId: "canvas-1" }), false);
  assert.equal(f.service.importPreviewRecords({ scope: request.scope, records: entries }).length, 0);
});

test("preview import is scoped and atomic; ordinary retries still charge and refund through the task service", () => {
  const f = fixture(); const request = input();
  const valid = { input: request.input, status: "failed", error: "示例失败" };
  assert.equal(f.service.importPreviewRecords({ scope: request.scope, records: [valid, { ...valid, status: "running" }] }).length, 0);
  assert.equal(f.service.list().length, 0);
  const [preview] = f.service.importPreviewRecords({ scope: request.scope, records: [valid] });
  assert.equal(f.service.list({ projectId: "different-project" }).length, 0);
  assert.equal(f.service.list({ conversationId: "different-conversation" }).length, 0);
  f.service.setNextScenario("failure");
  const real = f.service.submit({ scope: preview.scope, input: preview.input });
  assert.equal(real.isPreview, undefined);
  assert.equal(f.balance(), 2976); assert.equal(f.debits.length, 1);
  f.advance(7500);
  assert.equal(real.status, "failed"); assert.equal(f.balance(), 3000); assert.equal(f.refunds.length, 1);
  assert.equal(f.service.get(preview.id), preview);
});

test("preview import preserves provenance identities and rejects collisions atomically", () => {
  const f = fixture(); const request = input();
  const example = { id: "preview-fixed-task", input: request.input, status: "canceled" };
  assert.equal(f.service.importPreviewRecords({ scope: request.scope, records: [example, example] }).length, 0);
  assert.equal(f.service.list().length, 0);
  assert.equal(f.service.importPreviewRecords({ scope: request.scope, records: [{ ...example, id: "" }] }).length, 0);
  const [task] = f.service.importPreviewRecords({ scope: request.scope, records: [example] });
  assert.equal(task.id, example.id);
  const otherScope = { ...request.scope, conversationId: "other" };
  assert.equal(f.service.importPreviewRecords({ scope: otherScope, records: [{ ...example, id: "unique" }, example] }).length, 0);
  assert.equal(f.service.list().length, 1);
  const real = f.service.submit({ ...request, scope: otherScope });
  assert.equal(f.service.importPreviewRecords({ scope: { ...request.scope, conversationId: "third" },
    records: [{ ...example, id: real.id }] }).length, 0);
  assert.equal(f.service.get(real.id), real);
  assert.equal(f.debits.length, 1);
  assert.equal(f.refunds.length, 0);
});

test("preview history cannot overwrite an existing real conversation or import after disposal", () => {
  const f = fixture(); const request = input();
  f.service.submit(request);
  const history = { scope: request.scope, records: [{ input: request.input, status: "canceled" }] };
  assert.equal(f.service.importPreviewRecords(history).length, 0);
  assert.equal(f.service.list().length, 1); assert.equal(f.balance(), 2976);
  f.service.dispose();
  assert.equal(f.service.importPreviewRecords({ ...history, scope: { ...request.scope, conversationId: "new" } }).length, 0);
});

function submitDraft(f) {
  const request = input();
  request.input.modelId = "seedance-2-5-draft";
  request.input.parameters = { quality: "480p", aspect: "16:9", duration: "10s", outputFormat: "mp4", outputDuration: 10, seed: 42, audioEnabled: true };
  const draft = f.service.submit(request);
  f.service.complete(draft, { id: "source-result", type: "video", url: "/source.mp4", name: "source.mp4", width: 640, height: 360, duration: 8 });
  return draft;
}

test("sample completion records immutable provenance; final conversion separately charges and keeps the exact clip", () => {
  const f = fixture();
  const draft = submitDraft(f);
  assert.equal(draft.result.generation.stage, "draft");
  assert.equal(draft.result.generation.createdAt, 1000);
  assert.equal(draft.result.generation.expiresAt, 604801000);
  const final = f.service.submitFinal({ source: draft.result, scope: draft.scope, cost: 60, outputFormat: "mov" });
  assert.equal(f.balance(), 2916);
  assert.equal(f.debits.length, 2);
  assert.equal(final.input.parameters.quality, "1080p");
  assert.equal(final.input.parameters.outputFormat, "mov");
  f.advance(7500);
  assert.equal(final.status, "succeeded");
  assert.equal(final.result.url, draft.result.url);
  assert.equal(final.result.name, "source.mp4");
  assert.equal(final.result.width, 640);
  assert.equal(final.result.height, 360);
  assert.equal(final.result.duration, 8);
  assert.notEqual(final.result.id, draft.result.id);
  assert.equal(final.result.generation.stage, "final");
  assert.equal(final.result.generation.sourceDraftTaskId, draft.id);
  assert.equal(final.result.generation.sourceResultId, "source-result");
  assert.equal(draft.result.generation.stage, "draft");
  assert.equal(f.refunds.length, 0);
});

test("simultaneous sample conversions charge once; canceled and failed attempts can retry with one refund each", () => {
  const f = fixture();
  const draft = submitDraft(f);
  const request = { source: draft.result, scope: draft.scope, cost: 60 };
  const first = f.service.submitFinal(request);
  assert.equal(f.service.submitFinal(request), first);
  assert.equal(f.debits.length, 2);
  assert.equal(f.service.cancel(first), true);
  assert.equal(f.service.cancel(first), false);
  assert.equal(f.refunds.length, 1);
  assert.equal(f.balance(), 2976);
  f.service.setNextScenario("failure");
  const failed = f.service.submitFinal(request);
  assert.notEqual(failed.id, first.id);
  f.advance(7500);
  assert.equal(failed.status, "failed");
  assert.equal(f.refunds.length, 2);
  assert.equal(f.balance(), 2976);
  assert.equal(f.service.fail(failed), false);
  assert.equal(f.service.complete(failed), false);
  assert.equal(draft.status, "succeeded");
  assert.equal(draft.result.url, "/source.mp4");
});

test("final submission accepts persisted node provenance but rejects ordinary, expired or foreign source media before charge", () => {
  const firstPage = fixture();
  const draft = submitDraft(firstPage);
  const persisted = JSON.parse(JSON.stringify(draft.result));
  const secondPage = fixture();
  assert.equal(secondPage.service.list().length, 0);
  const request = { source: persisted, scope: draft.scope, cost: 60 };
  assert.ok(secondPage.service.submitFinal(request));
  assert.equal(secondPage.debits.length, 1);
  assert.throws(() => secondPage.service.submitFinal({ ...request, source: { ...persisted, generation: undefined } }), /仅成功/);
  assert.throws(() => secondPage.service.submitFinal({ ...request, scope: { ...draft.scope, projectId: "other" } }), /所属项目/);
  secondPage.setTime(draft.createdAt + 604800000);
  assert.throws(() => secondPage.service.submitFinal(request), /过期/);
  assert.equal(secondPage.debits.length, 1);
});

test("direct final repeats cannot alter frozen content or bypass expiry, and reentrant conversion cannot double charge", () => {
  const f = fixture();
  const draft = submitDraft(f);
  const first = f.service.submitFinal({ source: draft.result, scope: draft.scope, cost: 60 });
  f.service.cancel(first);
  const changed = { ...first.input, prompt: "changed prompt", parameters: { ...first.input.parameters, seed: 9, aspect: "9:16" } };
  const repeated = f.service.submit({ scope: draft.scope, input: changed });
  assert.equal(repeated.input.prompt, draft.input.prompt);
  assert.equal(repeated.input.parameters.seed, 42);
  assert.equal(repeated.input.parameters.aspect, "16:9");
  f.setTime(draft.createdAt + 604800000);
  assert.throws(() => f.service.submit({ scope: draft.scope, input: changed }), /过期/);

  let nested;
  let reentered = false;
  let service;
  const g = fixture({ charge() {
    if (reentered) return true;
    reentered = true;
    nested = service.submitFinal({ source: draft.result, scope: draft.scope, cost: 60 });
    return true;
  } });
  service = g.service;
  const outer = service.submitFinal({ source: draft.result, scope: draft.scope, cost: 60 });
  assert.equal(nested, outer);
  assert.equal(service.list().length, 1);
});


test("canvas ownership is explicit, conversation validation and history imports stay strict", () => {
  const f = fixture();
  const request = input();
  const scope = { projectId: request.scope.projectId, canvasId: request.scope.canvasId };
  assert.throws(() => f.service.submit({ ...request, scope }), /conversation scope/);
  assert.throws(() => f.service.submit({ ...request, sourceSurface: "canvas" }), /scope/);
  assert.throws(() => f.service.submit({ ...request, sourceSurface: "unknown" }), /source surface/);
  const canvas = f.service.submit({ ...request, scope, sourceSurface: "canvas", idempotencyKey: "same" });
  assert.equal(canvas.scope.conversationId, null);
  assert.equal(canvas.sourceSurface, "canvas");
  assert.equal(f.service.submit({ ...request, scope: { ...scope, conversationId: null }, sourceSurface: "canvas", idempotencyKey: "same" }), canvas);
  const chat = f.service.submit({ ...request, idempotencyKey: "same" });
  assert.notEqual(chat, canvas);
  assert.equal(chat.sourceSurface, "conversation");
  assert.equal(f.service.list({ conversationId: request.scope.conversationId }).length, 1);
  assert.equal(f.service.importPreviewRecords({ scope, records: [{ status: "canceled", input: request.input }] }).length, 0);
});

for (const firstSurface of ["canvas", "conversation"]) {
  test(`pending final deduplication preserves ${firstSurface} ownership across both entry surfaces`, () => {
    const f = fixture();
    const draft = submitDraft(f);
    const request = { source: draft.result, scope: draft.scope, cost: 60 };
    const canvas = { ...request, scope: { ...draft.scope, conversationId: null }, sourceSurface: "canvas" };
    const first = f.service.submitFinal(firstSurface === "canvas" ? canvas : request);
    const duplicate = f.service.submitFinal(firstSurface === "canvas" ? request : canvas);
    assert.equal(duplicate, first);
    assert.equal(first.sourceSurface, firstSurface);
    assert.equal(f.debits.length, 2);
    assert.equal(f.service.cancel(duplicate), true);
    assert.equal(f.service.cancel(first), false);
    assert.equal(f.refunds.length, 1);
    assert.equal(draft.status, "succeeded");
  });
}
