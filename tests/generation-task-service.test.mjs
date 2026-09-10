import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { test } from "node:test";

const sandbox = vm.createContext({});
for (const file of ["src/infrastructure/generation/simulated-generation-executor.js", "src/application/generation-task-service.js"]) {
  vm.runInContext(fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), sandbox, { filename: file });
}
const { createService } = sandbox.REELAY_GENERATION_TASKS;

function fixture(overrides = {}) {
  let time = 1000;
  let nextTimer = 0;
  let nextTask = 0;
  let balance = overrides.balance ?? 3000;
  const timers = new Map();
  const debits = [];
  const refunds = [];
  const refundNotices = [];
  const events = [];
  const service = createService({
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
    ...overrides,
  });
  service.subscribe((task, event) => events.push({ id: task.id, type: event.type, status: task.status, canCancel: task.canCancel, refunded: task.refunded }));
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
  assert.equal(task.charged, 24);
  assert.equal(f.balance(), 2976);
  f.advance(699);
  assert.equal(task.status, "queued");
  f.advance(1);
  assert.equal(task.status, "running");
  f.advance(10300);
  assert.equal(task.status, "succeeded");
  assert.equal(task.finishedAt, 12000);
  assert.equal(task.result.id, `result-${task.id}`);
  assert.ok(Object.isFrozen(task.result));
  assert.equal(task.canCancel, false);
  assert.equal(f.debits.length, 1);
  assert.equal(f.refunds.length, 0);
  assert.equal(f.timers.size, 0);
});

test("duplicate submit returns same task and never creates timers or another debit", () => {
  const f = fixture();
  const request = input({ idempotencyKey: "send-1" });
  const first = f.service.submit(request);
  const second = f.service.submit({ ...request, input: { ...request.input, cost: 500 } });
  assert.equal(first, second);
  assert.equal(f.service.list().length, 1);
  assert.equal(f.debits.length, 1);
  assert.equal(f.timers.size, 3);
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
  f.advance(11000);
  assert.equal(task.status, "failed");
  assert.equal(task.error, "测试原因");
  assert.equal(f.balance(), 20);
});

test("cancel before seven seconds refunds exactly once and rejects all late signals", () => {
  const f = fixture();
  const task = f.service.submit(input());
  const staleCallbacks = [...f.timers.values()].map((timer) => timer.callback);
  f.advance(6999);
  assert.equal(f.service.cancel(task), true);
  assert.equal(task.status, "canceled");
  assert.equal(task.refunded, 24);
  assert.equal(f.balance(), 3000);
  assert.equal(f.service.cancel(task), false);
  assert.equal(f.service.complete(task), false);
  assert.equal(f.service.fail(task, "late failure"), false);
  for (const callback of staleCallbacks) callback();
  assert.equal(task.status, "canceled");
  assert.equal(task.result, null);
  assert.equal(f.refunds.length, 1);
  assert.deepEqual(f.refundNotices, [24]);
  assert.equal(f.timers.size, 0);
});

test("seven-second boundary is strict even if the timeout has not fired", () => {
  const f = fixture();
  const task = f.service.submit(input());
  f.setTime(8000);
  assert.equal(task.canCancel, false);
  assert.equal(f.service.canCancel(task.id), false);
  assert.equal(f.service.cancel(task), false);
  assert.equal(task.status, "queued");
  assert.equal(f.refunds.length, 0);
});

test("cancel deadline notifies once without adding countdown ticks", () => {
  const f = fixture();
  const task = f.service.submit(input());
  f.advance(7000);
  assert.deepEqual(f.events.map((event) => event.type), ["submitted", "running", "cancel-window-closed"]);
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
  f.advance(11000);
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
  assert.equal(task.canCancel, false);
  assert.equal(f.timers.size, 0);
  assert.equal(f.service.complete(task.id), true);
  assert.equal(task.status, "succeeded");
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
  f.advance(11000);
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
  f.advance(11000);
  assert.equal(real.status, "failed"); assert.equal(f.balance(), 3000); assert.equal(f.refunds.length, 1);
  assert.equal(f.service.get(preview.id), preview);
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
