import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

const sandbox = vm.createContext({});
vm.runInContext(fs.readFileSync(new URL("../src/legacy-canvas/canvas-video-generation-controller.js", import.meta.url), "utf8"), sandbox);
const { createController, parametersFor } = sandbox.REELAY_CANVAS_VIDEO_GENERATION;
const plain = (value) => JSON.parse(JSON.stringify(value));
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const taskId = "38975aa7-a00d-4ed4-8412-850343a15a27";
const conversationId = "584accc2-df5c-4021-9020-0d51dfda46c7";
const secondTaskId = "55d747b4-9cc8-4a5c-b420-f1c2821e15ea";
const thirdTaskId = "adecfbf6-25d4-4e8d-9278-d8b2648b9e5a";
const input = { mediaType: "video", modelId: "seedance-2-fast", modelName: "Seedance 2.0 Fast", cost: 55,
  prompt: "沿海岸线前进", references: [], generationStage: "standard",
  parameters: { model: "seedance-2-fast", quality: "480p", aspect: "16:9", duration: "5s", audioEnabled: true,
    workflow: "omni-reference", count: "1", outputFormat: "mp4", omniReferenceTaskType: "auto" } };
function task(overrides = {}) {
  return { id: taskId, sourceSurface: "canvas", input: structuredClone(input),
    scope: { projectId: "project-1", canvasId: "canvas-1", nodeId: "node-1", conversationId: null }, ...overrides };
}
function dto(overrides = {}) {
  return { id: taskId, requestKey: taskId, projectId: "project-1", canvasDocumentId: "main", canvasRecordId: "canvas-1", nodeId: "node-1",
    conversationId: null, sourceSurface: "canvas", prompt: input.prompt,
    parameters: { modelId: "seedance-2-fast", model: "Seedance 2.0 Fast", resolution: "480P", aspectRatio: "16:9", duration: 5,
      generateAudio: true, workflow: "omni-reference", generationStage: "standard" },
    status: "waiting", createdAt: "2026-10-13T00:00:00.000Z", updatedAt: "2026-10-13T00:00:00.000Z", message: "等待平台", result: null, ...overrides };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

function fixture(t, overrides = {}) {
  let nextId = 0, nextTimer = 0;
  const timers = new Map();
  const posts = [], imports = [], projected = [], restoredConversations = [], updates = [], completed = [], failures = [], historyReady = [];
  const parent = {};
  const node = { id: "node-1" };
  const tasks = new Map([[taskId, task()]]);
  const state = { projectId: "project-1", node, writable: true, hosted: true, capability: true, records: [{ id: "canvas-1", nodes: [node] }] };
  const persistence = { post: (type, payload) => posts.push({ type, ...plain(payload) }), canMutate: () => state.writable,
    flushAndWait: async () => {} };
  const options = {
    instanceId: "instance-1", makeId: () => `request-${++nextId}`,
    isHosted: () => state.hosted, getExpectedOrigin: () => "http://localhost:5182", getExpectedSource: () => parent,
    getCapabilities: () => ({ realVideoGeneration: state.capability }), getProjectId: () => state.projectId,
    getPersistence: () => persistence,
    getTaskService: () => ({ get: (id) => tasks.get(id), importRealTask: (entry) => { const result = plain(entry); imports.push(result); tasks.set(result.id, result); return result; },
      updateRealTask: (_task, update) => updates.push(plain(update)), complete: (_task, media) => completed.push(plain(media)), fail: (_task, message) => failures.push(message) }),
    getCanvasRecords: () => state.records,
    getNodeForTask: () => state.node,
    projectTask: (value) => projected.push(plain(value)),
    restoreConversation: (id, prompt) => restoredConversations.push({ id, prompt }),
    onHistoryReady: () => historyReady.push(imports.length),
    setTimer(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    clearTimer: (id) => timers.delete(id),
    ...overrides,
  };
  const controller = createController(options);
  t.after(() => controller.dispose());
  const command = (operation) => posts.filter((entry) => entry.type === "canvas:video-generation-command" && entry.operation === operation).at(-1);
  const host = (message, eventOverrides = {}) => controller.handleHostMessage({ origin: "http://localhost:5182", source: parent,
    data: { source: "reelay-shell", protocolVersion: 1, instanceId: "instance-1", ...message }, ...eventOverrides });
  const respond = (request, result) => host({ type: "host:video-generation-result", requestId: request.requestId, operation: request.operation, result });
  const fail = (request, message = "网络不可读", submissionState) => host({ type: "host:video-generation-error", requestId: request.requestId, operation: request.operation,
    code: "request_failed", message, ...(submissionState ? { submissionState } : {}) });
  const start = (value = tasks.get(taskId)) => {
    tasks.set(value.id, value);
    controller.executor.start({ task: value, onUpdate: (update) => updates.push(plain(update)), onComplete: (media) => completed.push(plain(media)), onFail: (message) => failures.push(message) });
    return command("submit");
  };
  const bind = (request = command("submit"), value = dto({ status: "prepared" })) => host({ type: "host:video-generation-bind", requestId: request.requestId, task: value });
  const fireTimer = async (delay) => {
    const entry = [...timers].find(([, value]) => value.delay === delay);
    assert.ok(entry, `a ${delay} ms timer exists`);
    timers.delete(entry[0]); const result = entry[1].callback(); await tick(); return result;
  };
  return { controller, posts, state, persistence, tasks, parent, node, timers, imports, projected, restoredConversations,
    updates, completed, failures, historyReady, command, host, respond, fail, start, bind, fireTimer };
}

async function openHistory(h, context = { kind: "simulation", reason: "disconnected", taskHistoryAvailable: true }) {
  h.respond(h.command("context"), context);
  await tick();
}

test("real parameters retain duration units, audio, selected count and format instead of silently narrowing intent", () => {
  const mapped = plain(parametersFor({ ...input, parameters: { ...input.parameters, duration: "5s", count: "2", outputFormat: "mov", omniReferenceTaskType: "edit" } }));
  assert.deepEqual(mapped, { modelId: "seedance-2-fast", resolution: "480p", aspectRatio: "16:9", duration: 5, generateAudio: true,
    workflow: "omni-reference", generationStage: "standard", omniReferenceTaskType: "edit", outputFormat: "mov", count: 2 });
  assert.equal(parametersFor({ ...input, parameters: { ...input.parameters, duration: "auto" } }).duration.toString(), "NaN");
});

test("execution checks connection freshly for each attempt and keeps explicit disconnection as simulation", async (t) => {
  const h = fixture(t);
  let attempt = h.controller.resolveExecution(task());
  h.respond(h.command("context"), { kind: "real", platformUser: { id: "user", displayName: "真实账号" }, binding: null });
  assert.equal(await attempt, "real");
  attempt = h.controller.resolveExecution(task());
  h.respond(h.command("context"), { kind: "simulation", reason: "disconnected" });
  assert.equal(await attempt, "simulation");
  assert.equal(h.posts.filter((message) => message.operation === "context").length, 2);
  assert.equal(h.controller.getContext().kind, "simulation");
});

test("expired and unreadable connections reject without submitting or falling back", async (t) => {
  const h = fixture(t);
  const expired = h.controller.resolveExecution(task());
  h.respond(h.command("context"), { kind: "blocked", reason: "expired" });
  await assert.rejects(expired, /失效/);
  const network = h.controller.resolveExecution(task());
  h.fail(h.command("context"));
  await assert.rejects(network, /网络不可读/);
  assert.equal(h.posts.filter((message) => message.operation === "submit").length, 0);
});

test("images and experience without a real capability preserve simulation without requesting the API", async (t) => {
  const h = fixture(t);
  assert.equal(await h.controller.resolveExecution(task({ input: { ...input, mediaType: "image" } })), "simulation");
  h.state.capability = false;
  assert.equal(await h.controller.resolveExecution(task()), "simulation");
  assert.equal(h.posts.length, 0);
});

test("submit carries frozen source identity and all real intent fields through the bridge", (t) => {
  const h = fixture(t);
  const value = task({ sourceSurface: "conversation", scope: { projectId: "project-1", canvasId: "canvas-1", conversationId },
    input: { ...input, parameters: { ...input.parameters, count: "2", outputFormat: "mov" } } });
  const request = h.start(value);
  assert.equal(request.requestKey, value.id); assert.equal(request.nodeId, "node-1");
  assert.equal(request.canvasRecordId, "canvas-1"); assert.equal(request.conversationId, conversationId);
  assert.equal(request.parameters.duration, 5); assert.equal(request.parameters.count, 2); assert.equal(request.parameters.outputFormat, "mov");
  assert.equal(request.projectId, undefined); assert.equal(request.canvasDocumentId, undefined);
});

test("binding acknowledges true only after persistence resolves and retains the stable task reference", async (t) => {
  const h = fixture(t); const save = deferred(); h.persistence.flushAndWait = () => save.promise;
  const request = h.start(); h.bind(request);
  assert.equal(h.node.realGenerationTaskId, taskId);
  await tick(); assert.equal(h.posts.some((message) => message.type === "canvas:video-generation-bound"), false);
  save.resolve(); await tick();
  assert.deepEqual(h.posts.find((message) => message.type === "canvas:video-generation-bound"), {
    type: "canvas:video-generation-bound", requestId: request.requestId, taskId, bound: true,
  });
});

test("duplicate bind messages share one durable save and acknowledge only once", async (t) => {
  const h = fixture(t); const save = deferred(); let writes = 0;
  h.persistence.flushAndWait = () => { writes++; return save.promise; };
  const request = h.start(); h.bind(request); h.bind(request);
  assert.equal(writes, 1);
  save.resolve(); await tick();
  assert.equal(h.posts.filter((message) => message.type === "canvas:video-generation-bound").length, 1);
});

for (const change of ["delete", "replacement", "project", "permission", "save-failure"]) {
  test(`binding acknowledges false when ${change} invalidates the original durable association`, async (t) => {
    const h = fixture(t); const save = deferred(); h.persistence.flushAndWait = () => save.promise;
    h.start(); h.bind();
    if (change === "delete") h.state.node = null;
    if (change === "replacement") h.state.node = { id: "node-1" };
    if (change === "project") h.state.projectId = "project-2";
    if (change === "permission") h.state.writable = false;
    if (change === "save-failure") save.reject(new Error("save failed")); else save.resolve();
    await tick();
    assert.equal(h.posts.find((message) => message.type === "canvas:video-generation-bound")?.bound, false);
  });
}

test("resetting the bridge invalidates a pending durable binding even within the same project", async (t) => {
  const h = fixture(t); const save = deferred(); h.persistence.flushAndWait = () => save.promise;
  h.start(); h.bind(); h.controller.reset(); save.resolve(); await tick();
  assert.equal(h.posts.find((message) => message.type === "canvas:video-generation-bound")?.bound, false);
  assert.equal(h.failures.length, 0);
});

test("wrong origin, source, protocol and iframe instance cannot complete a pending request", async (t) => {
  const h = fixture(t); const promise = h.controller.resolveExecution(task()); const request = h.command("context");
  const response = { type: "host:video-generation-result", operation: "context", requestId: request.requestId, result: { kind: "simulation", reason: "disconnected" } };
  assert.equal(h.host(response, { origin: "https://other.example" }), false);
  assert.equal(h.host(response, { source: {} }), false);
  assert.equal(h.host({ ...response, instanceId: "stale" }), false);
  assert.equal(h.host({ ...response, protocolVersion: 2 }), false);
  assert.equal(h.controller.getContext(), null);
  h.respond(request, response.result); assert.equal(await promise, "simulation");
});

test("wrong prepared node identity cannot bind or acknowledge a task as saved", async (t) => {
  const h = fixture(t); h.start(); h.bind(undefined, dto({ status: "prepared", nodeId: "different-node" }));
  await tick();
  assert.equal(h.node.realGenerationTaskId, undefined);
  assert.equal(h.posts.find((message) => message.type === "canvas:video-generation-bound")?.bound, false);
});

test("a submit failure before binding fails safely without any new simulator or paid request", async (t) => {
  const h = fixture(t); const request = h.start(); h.fail(request); await tick();
  assert.deepEqual(h.failures, ["网络不可读"]);
  assert.equal(h.posts.filter((message) => message.type === "canvas:video-generation-command").length, 1);
});

test("a lost submit response after durable binding preserves unconfirmed state and reads the existing task", async (t) => {
  const h = fixture(t); const request = h.start(); h.bind(request); await tick();
  h.fail(request, "响应丢失", "unknown"); await tick();
  assert.equal(h.failures.length, 0, "an existing durable task must not become a false definitive failure");
  assert.equal(h.updates.at(-1)?.status, "unconfirmed");
  const polling = h.fireTimer(2000); await tick();
  const get = h.command("get"); assert.equal(get.taskId, taskId);
  h.respond(get, dto()); await polling;
  assert.equal(h.posts.filter((message) => message.operation === "submit").length, 1);
});

test("an explicit task_not_bound after a failed save remains an uncharged safe failure", async (t) => {
  const h = fixture(t); h.persistence.flushAndWait = async () => { throw new Error("save failed"); };
  const request = h.start(); h.bind(request); await tick();
  assert.equal(h.posts.find((message) => message.type === "canvas:video-generation-bound")?.bound, false);
  h.host({ type: "host:video-generation-error", requestId: request.requestId, operation: "submit", code: "task_not_bound", submissionState: "not-submitted", message: "关联尚未保存，没有开始生成。" });
  await tick();
  assert.deepEqual(h.failures, ["关联尚未保存，没有开始生成。"]);
  assert.equal(h.updates.some((update) => update.status === "unconfirmed"), false);
  assert.equal([...h.timers.values()].some((timer) => timer.delay === 2000), false);
});

test("a disconnected submit result never silently starts simulation in an accepted real attempt", async (t) => {
  const h = fixture(t); const request = h.start();
  h.respond(request, { kind: "simulation", reason: "disconnected" }); await tick();
  assert.equal(h.failures.length, 1);
  assert.equal(h.posts.filter((message) => message.type === "canvas:video-generation-command").length, 1);
});

test("owner task restoration recreates only owner conversations while shared projection remains canvas only", async (t) => {
  const h = fixture(t);
  h.state.records[0].nodes.push({ id: "shared-node", realGenerationTaskId: secondTaskId });
  const restoration = h.controller.restore();
  assert.equal(h.controller.isHistoryReady(), false);
  await openHistory(h);
  h.respond(h.command("list"), { tasks: [dto({ sourceSurface: "conversation", conversationId, status: "prepared" }),
    dto({ id: thirdTaskId, requestKey: thirdTaskId, status: "failed", nodeId: "canvas-only", message: "失败" })] });
  await tick();
  assert.equal(h.controller.isHistoryReady(), false, "demo initialization waits for referenced shared/owner histories");
  const shared = h.command("projection"); assert.equal(shared.taskId, secondTaskId);
  h.respond(shared, dto({ id: secondTaskId, sourceSurface: "conversation", conversationId: "private-other-actor", prompt: "private-other-prompt", isOwner: false,
    nodeId: "shared-node", status: "prepared" }));
  await restoration;
  assert.deepEqual(h.restoredConversations, [{ id: conversationId, prompt: input.prompt }]);
  const sharedImport = h.imports.find((entry) => entry.id === secondTaskId);
  assert.equal(sharedImport.isOwner, false); assert.equal(sharedImport.sourceSurface, "canvas"); assert.equal(sharedImport.scope.conversationId, null);
  assert.equal(sharedImport.input.prompt, "");
  assert.equal(h.imports.find((entry) => entry.id === thirdTaskId).sourceSurface, "canvas");
  assert.equal(h.posts.some((message) => message.operation === "submit"), false);
  assert.equal(h.controller.isHistoryReady(), true);
  assert.deepEqual(h.historyReady, [3]);
});

test("obsolete project restoration discards late owner task results", async (t) => {
  const h = fixture(t); const restoration = h.controller.restore(); await openHistory(h); const list = h.command("list");
  h.state.projectId = "project-2"; h.respond(list, { tasks: [dto()] }); await restoration;
  assert.equal(h.imports.length, 0); assert.equal(h.restoredConversations.length, 0);
});

test("prepared restoration never activates automatically and explicit resume reuses the frozen task id", async (t) => {
  const h = fixture(t); const restoration = h.controller.restore();
  await openHistory(h);
  h.respond(h.command("list"), { tasks: [dto({ status: "prepared" })] }); await restoration;
  assert.deepEqual(h.posts.filter((message) => message.type === "canvas:video-generation-command").map((message) => message.operation), ["context", "list"]);
  const prepared = h.tasks.get(taskId); h.controller.resume(prepared);
  assert.equal(h.command("submit").requestKey, taskId); assert.equal(h.command("submit").nodeId, "node-1");
  h.controller.resume(prepared);
  assert.equal(h.posts.filter((message) => message.operation === "submit").length, 1);
  assert.throws(() => h.controller.resume({ ...prepared, isOwner: false }), /不能重新提交/);
  assert.throws(() => h.controller.resume({ ...prepared, executionStatus: "waiting" }), /不能重新提交/);
});

test("an unavailable task history completes the readiness gate without attempting a failing list", async (t) => {
  const h = fixture(t); const restoration = h.controller.restore();
  await openHistory(h, { kind: "simulation", reason: "unavailable", taskHistoryAvailable: false });
  await restoration;
  assert.deepEqual(h.posts.filter((message) => message.type === "canvas:video-generation-command").map((message) => message.operation), ["context"]);
  assert.equal(h.controller.isHistoryReady(), true);
  assert.equal(h.imports.length, 0); assert.equal(h.failures.length, 0);
  assert.deepEqual(h.historyReady, [0]);
  assert.equal([...h.timers.values()].some((timer) => timer.delay === 3000), false);
});

test("an owner reference omitted from a 100-task list fetches full private history after projection ownership", async (t) => {
  const h = fixture(t);
  h.state.records[0].nodes.push({ id: "older-owner-node", realGenerationTaskId: secondTaskId });
  const restoration = h.controller.restore(); await openHistory(h);
  const page = Array.from({ length: 100 }, (_, index) => dto({
    id: `listed-task-${index}`, requestKey: `listed-task-${index}`, status: "prepared", nodeId: `listed-node-${index}`,
  }));
  h.respond(h.command("list"), { tasks: page }); await tick();
  const projection = h.command("projection"); assert.equal(projection.taskId, secondTaskId);
  h.respond(projection, dto({ id: secondTaskId, requestKey: secondTaskId, status: "prepared", nodeId: "older-owner-node", sourceSurface: "conversation", isOwner: true,
    prompt: undefined, conversationId: undefined }));
  await tick();
  const full = h.command("get"); assert.equal(full.taskId, secondTaskId);
  assert.equal(h.restoredConversations.length, 0, "the shared projection is not a private-history record");
  assert.equal(h.controller.isHistoryReady(), false);
  h.respond(full, dto({ id: secondTaskId, requestKey: secondTaskId, status: "prepared", nodeId: "older-owner-node", sourceSurface: "conversation", conversationId, prompt: "本人较早的创作" }));
  await restoration;
  const restored = h.imports.find((entry) => entry.id === secondTaskId);
  assert.equal(restored.isOwner, true); assert.equal(restored.scope.conversationId, conversationId);
  assert.equal(restored.input.prompt, "本人较早的创作");
  assert.deepEqual(h.restoredConversations, [{ id: conversationId, prompt: "本人较早的创作" }]);
  assert.equal(h.controller.isHistoryReady(), true);
  assert.deepEqual(h.historyReady, [101]);
});

test("retry-save issues storage retry and refresh reads without a new generation", async (t) => {
  const h = fixture(t); const promise = h.controller.retrySave(task());
  const retry = h.command("retry-save"); assert.equal(retry.taskId, taskId);
  h.respond(retry, dto({ status: "saving" })); await promise;
  await openHistory(h, { kind: "simulation", reason: "unavailable", taskHistoryAvailable: false });
  assert.deepEqual(h.posts.filter((message) => message.type === "canvas:video-generation-command").map((message) => message.operation), ["retry-save", "context"]);
  assert.equal(h.imports[0].executionStatus, "saving");
});

test("stopping local polling never sends a remote abort or processes a late result", async (t) => {
  const h = fixture(t); const request = h.start(); h.respond(request, dto()); await tick();
  const polling = h.fireTimer(2000); await tick(); const get = h.command("get");
  h.controller.executor.stop(taskId);
  h.respond(get, dto({ status: "succeeded", result: { id: taskId, taskId, projectId: "project-1", url: `/api/projects/project-1/generation-results/${taskId}/video`, contentType: "video/mp4", byteSize: 32 } }));
  await polling;
  assert.equal(h.completed.length, 0);
  assert.deepEqual(h.posts.filter((message) => message.type === "canvas:video-generation-command").map((message) => message.operation), ["submit", "get"]);
  assert.equal([...h.timers.values()].some((timer) => timer.delay === 2000), false);
});
