import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "node:url";
import { buildPromptEditor } from "../scripts/build-prompt-editor.mjs";

const root = new URL("../", import.meta.url);
const html = await readFile(new URL("index.html", root), "utf8");
const scriptDocument = new JSDOM(html);
const paths = [...scriptDocument.window.document.querySelectorAll("script[src]")]
  .map((script) => script.getAttribute("src"))
  .filter((src) => src.startsWith("./"))
  .map((src) => src.split("?")[0]);
scriptDocument.window.close();
const sources = await Promise.all(paths.map(async (path) => ({ path, source: await readFile(new URL(path, root), "utf8") })));
const promptEditorSource = await buildPromptEditor(fileURLToPath(root));
const plain = (value) => JSON.parse(JSON.stringify(value));

// Run the shipped entry/modules. Only scheduling and unsupported browser/media APIs are replaced.
function harness(t, { hosted = false, publicHistory = false } = {}) {
  const dom = new JSDOM(html, { url: "http://reelay.test/index.html", runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  const hostWindow = { postMessage() {} };
  if (hosted) Object.defineProperty(window, "parent", { configurable: true, value: hostWindow });
  const timers = new Map();
  const mediaElements = [];
  let time = 1000;
  let timerId = 0;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.structuredClone = structuredClone;
  window.requestAnimationFrame = () => 1;
  window.cancelAnimationFrame = () => {};
  window.Range.prototype.getClientRects = () => [{ left: 120, right: 121, top: 120, bottom: 140, width: 1, height: 20 }];
  window.Range.prototype.getBoundingClientRect = () => ({ left: 120, right: 121, top: 120, bottom: 140, width: 1, height: 20 });
  window.scrollBy = () => {};
  window.HTMLElement.prototype.scrollTo = function (options) { this.scrollTop = options?.top || 0; };
  window.Date.now = () => time;
  window.setTimeout = (callback, delay) => {
    const id = ++timerId;
    timers.set(id, { at: time + Number(delay || 0), callback });
    return id;
  };
  window.clearTimeout = (id) => timers.delete(id);
  window.URL.createObjectURL = () => "blob:http://reelay.test/mock";
  window.URL.revokeObjectURL = () => {};
  window.HTMLMediaElement.prototype.pause = () => {};
  window.HTMLMediaElement.prototype.load = () => {};
  window.HTMLMediaElement.prototype.play = () => Promise.resolve();
  const createElement = window.document.createElement.bind(window.document);
  window.document.createElement = (...args) => {
    const element = createElement(...args);
    if (element instanceof window.HTMLMediaElement) mediaElements.push(element);
    return element;
  };
  window.Element.prototype.setPointerCapture = () => {};
  window.Element.prototype.releasePointerCapture = () => {};
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  window.eval(promptEditorSource);
  for (const { path, source } of sources) {
    // Most task tests use an empty history fixture; publicHistory exercises the complete shipped entry.
    if (!publicHistory && path === "./src/config/generation-history-presets.js") continue;
    window.eval(source + (path === "./app.js"
      ? "\nwindow.generationIntegration = { state, agentGeneration, agentModels, agentParameters, agentReferences, agentHistory, canvasRuntimeStore, promptEditors };"
      : ""));
  }
  const exposed = window.generationIntegration;
  t.after(() => {
    exposed.agentGeneration.dispose();
    exposed.promptEditors.destroy();
    window.close();
  });
  const { state, agentGeneration, agentModels, agentParameters, agentReferences, agentHistory, canvasRuntimeStore, promptEditors } = exposed;
  state.projectId = "generation-project";
  const first = window.createCanvasRecord("generation-canvas");
  const second = window.createCanvasRecord("other-canvas");
  canvasRuntimeStore.replaceCanvases([first, second], first.id);
  window.clearSelection();
  window.render();
  window.setAgentOpen(true);
  agentHistory.startNew();
  agentModels.setGenerationModel("seedance-2-5");
  const service = agentGeneration.service;
  const record = (task) => window.document.querySelector(`.generation-record[data-generation-task-id="${task.id}"]`);
  const editor = () => promptEditors.get(window.getConversation());
  function draft(value) { editor().setDocument(value, { notify: true }); }
  function send(value = "镜头缓慢推进，表现玻璃通透感") {
    if (value !== null) draft(value);
    const task = window.sendAgentMessage();
    assert.ok(task, "real generation send must produce a task");
    return task;
  }
  function click(task, action) {
    const button = record(task)?.querySelector(`[data-generation-action="${action}"]`);
    assert.ok(button && !button.hidden && !button.disabled, `expected actionable ${action} on ${task.id}`);
    button.click();
  }
  function advance(milliseconds) {
    const target = time + milliseconds;
    while (true) {
      const next = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      time = next[1].at;
      timers.delete(next[0]);
      next[1].callback();
    }
    time = target;
  }
  const dispatchHost = (data) => window.dispatchEvent(new window.MessageEvent("message", {
    data, source: hostWindow, origin: window.location.origin,
  }));
  return { window, document: window.document, ...exposed, service, first, second, timers, mediaElements, advance, record, editor, draft, send, click, dispatchHost };
}

function withReferences(h) {
  h.agentReferences.addAssets([
    { id: "portrait", type: "image", name: "幽影人物", url: "/portrait.png", width: 600, height: 1200 },
    { id: "walk", type: "video", name: "行走动作", url: "/walk.mp4", duration: 12 },
    { id: "voice", type: "audio", name: "人物配音", url: "/voice.mp3", duration: 6 },
  ]);
  const entries = h.agentReferences.getEntries();
  const document = { version: 1, content: [{ type: "text", text: "参考" }, ...entries.map((entry, index) => ({
    type: "reference", key: entry.key, mediaType: entry.asset.type, fallbackLabel: ["图片1", "视频1", "音频1"][index],
  })), { type: "text", text: "生成自然的镜头" }] };
  h.draft(document);
  return { entries: plain(entries), document: plain(document), references: plain(h.agentReferences.getAssets()) };
}

async function enablePreviewHistory(h) {
  for (const path of ["src/config/generation-demo-presets.js", "src/config/generation-history-presets.js"]) {
    h.window.eval(await readFile(new URL(path, root), "utf8"));
  }
  let capabilities;
  h.window.addEventListener("reelay:generation-ready", (event) => { capabilities = event.detail; }, { once: true });
  h.window.dispatchEvent(new h.window.CustomEvent("reelay:generation-connect"));
  const config = h.window.REELAY_PROTOTYPE_CONFIG;
  const initialize = () => capabilities.initializePreviewHistory(({ presets, prepareInput }) =>
    h.window.REELAY_GENERATION_HISTORY_PRESETS.create({ presets, prepareInput, media: config.assetLibrarySeed.media,
      simulationAssets: config.simulationAssets, now: h.window.Date.now() }));
  return { capabilities, initialize };
}

test("shared default history renders four scoped states from real presets without debit, delivery or draft changes", async (t) => {
  const h = harness(t);
  const current = plain(h.window.createCanvasDocumentSnapshot());
  const account = plain(h.state.account);
  const { capabilities, initialize } = await enablePreviewHistory(h);
  const records = h.document.querySelector("#agentGenerationRecords");
  Object.defineProperty(records, "scrollHeight", { configurable: true, get: () => 1600 });
  records.scrollTop = 800;
  assert.equal(initialize(), true);
  const tasks = h.service.list();
  assert.equal(tasks.length, 4);
  assert.deepEqual(plain(tasks.map((task) => task.status)), ["succeeded", "succeeded", "failed", "canceled"]);
  assert.deepEqual(plain(tasks.map((task) => task.input.mediaType)), ["video", "image", "image", "video"]);
  assert.equal(tasks[0].input.references.length, 9);
  assert.ok(tasks.every((task) => task.isPreview && task.scope.canvasId === h.first.id && !task.addedNodeId));
  assert.equal(h.document.querySelectorAll(".generation-record").length, 4);
  assert.equal(h.document.querySelectorAll(".generation-record-refund").length, 2);
  for (const task of tasks) {
    const locate = h.record(task).querySelector('[data-generation-action="locate"]');
    assert.equal(locate.hidden, task.status !== "succeeded");
    assert.equal(locate.getAttribute("aria-disabled"), "true");
    assert.equal(locate.title, "演示记录暂无画布节点");
    locate.click();
  }
  assert.equal(records.scrollTop, 0);
  assert.deepEqual(plain(h.state.account), account);
  assert.deepEqual(plain(h.window.createCanvasDocumentSnapshot()), current);
  assert.equal(h.editor().getText(), ""); assert.equal(h.agentReferences.getAssets().length, 0);
  assert.equal(capabilities.list().length, 0, "preview history is excluded from real task monitoring");
  assert.equal(initialize(), false);
  h.agentGeneration.render(); assert.equal(h.service.list().length, 4);
  h.agentHistory.startNew();
  assert.equal(h.document.querySelectorAll(".generation-record").length, 0);
  assert.equal(initialize(), false);
  h.agentHistory.select(tasks[0].scope.conversationId);
  h.click(tasks[0], "again");
  const real = capabilities.list()[0];
  assert.ok(real && !real.isPreview);
  assert.equal(h.state.account.credits, 3000 - tasks[0].input.cost);
  h.service.complete(real);
  assert.equal(h.first.nodes.length, 1);
  assert.equal(h.state.account.consumedCredits, tasks[0].input.cost);
});

test("preview history waits outside Agent mode and never follows its first conversation into a different project", async (t) => {
  const h = harness(t);
  h.agentModels.setMode("agent");
  const { initialize } = await enablePreviewHistory(h);
  assert.equal(initialize(), true);
  assert.equal(h.service.list().length, 0);
  h.agentModels.setMode("generation");
  h.agentGeneration.render();
  assert.equal(h.service.list().length, 4);
  h.state.projectId = "other-project";
  h.agentGeneration.render();
  assert.equal(h.document.querySelectorAll(".generation-record").length, 0);
  assert.equal(initialize(), false);
  assert.equal(h.first.nodes.length, 0);
  assert.equal(h.state.account.credits, 3000);
});

test("existing records or a user draft permanently skip automatic example history for this page", async (t) => {
  for (const existing of ["draft", "record"]) {
    const h = harness(t);
    if (existing === "draft") h.draft("不要改我的草稿"); else h.send("已有发送记录");
    const { initialize } = await enablePreviewHistory(h);
    assert.equal(initialize(), true);
    assert.equal(h.service.list().filter((task) => task.isPreview).length, 0);
    if (existing === "draft") assert.equal(h.editor().getText(), "不要改我的草稿");
    h.agentHistory.startNew();
    h.agentGeneration.render();
    assert.equal(initialize(), false);
    assert.equal(h.service.list().filter((task) => task.isPreview).length, 0);
  }
});

test("hosted preview waits through host:init and hydrates examples only when the formal document becomes editable", async (t) => {
  const h = harness(t, { hosted: true, publicHistory: true });
  h.window.setAgentOpen(false);
  assert.equal(h.document.querySelector("#reelay-generation-simulator"), null);
  assert.equal(h.service.list().length, 0, "the initial iframe loading scope cannot consume preview initialization");
  const content = plain(h.window.createCanvasDocumentSnapshot());
  const context = { protocolVersion: 1, projectId: "formal-project", projectName: "正式项目", workspaceId: "workspace-a",
    canvasId: "main", writable: true, theme: "light" };
  h.dispatchHost({ source: "reelay-shell", type: "host:init", context });
  assert.equal(h.service.list().length, 0);
  h.window.setAgentOpen(true);
  assert.equal(h.service.list().length, 0, "opening the panel must not bypass document readiness");
  h.dispatchHost({ source: "reelay-shell", type: "host:document", protocolVersion: 1, writable: true,
    document: { id: "main", projectId: "wrong-project", schemaVersion: 1, revision: 1, content } });
  assert.equal(h.service.list().length, 0);
  h.dispatchHost({ source: "reelay-shell", type: "host:document", protocolVersion: 1, writable: true,
    document: { id: "main", projectId: context.projectId, schemaVersion: 1, revision: 1, content } });
  const tasks = h.service.list();
  assert.equal(tasks.length, 4);
  assert.ok(tasks.every((task) => task.scope.projectId === "formal-project" && task.scope.canvasId === h.first.id));
  assert.equal(h.document.querySelectorAll(".generation-record").length, 4);
  assert.equal(h.document.querySelector("#agentGenerationRecords").scrollTop, 0);
  assert.equal(h.state.account.credits, 3000); assert.equal(h.state.account.consumedCredits, 0);
  assert.deepEqual(plain(h.window.createCanvasDocumentSnapshot().canvases), content.canvases);
  assert.equal(h.state.activeCanvasId, content.activeCanvasId);
  h.agentGeneration.render();
  assert.equal(h.service.list().length, 4);
  h.agentHistory.startNew();
  assert.equal(h.document.querySelectorAll(".generation-record").length, 0);
});

test("generation send freezes prompt/reference inputs, charges 24 and creates one record without role messages", (t) => {
  const h = harness(t);
  const saved = withReferences(h);
  const conversation = h.window.getConversation();
  const messages = plain(conversation.messages);
  const beforeCanvas = plain(h.window.createCanvasDocumentSnapshot());
  const task = h.send(null);
  assert.equal(task.input.cost, 24);
  assert.equal(task.charged, 24);
  assert.equal(h.state.account.credits, 2976);
  assert.equal(h.state.account.consumedCredits, 24);
  assert.deepEqual(plain(conversation.messages), messages);
  assert.equal(h.service.list().length, 1);
  assert.ok(h.record(task));
  assert.equal(h.document.querySelector("#agentMessages").hidden, true);
  assert.equal(h.document.querySelector("#agentGenerationRecords").hidden, false);
  assert.deepEqual(plain(task.input.references), saved.references);
  assert.deepEqual(plain(task.input.referenceSnapshot.map((entry) => entry.label)), ["图片1", "视频1", "音频1"]);
  assert.deepEqual(plain(task.input.promptDocument.content.filter((part) => part.type === "reference").map((part) => part.key)), saved.entries.map((entry) => entry.key));
  assert.equal(h.editor().getText(), "");
  assert.equal(h.editor().undo(), false);
  assert.equal(h.agentReferences.getAssets().length, 0);
  h.draft("下一轮草稿");
  h.agentReferences.addAssets([{ id: "later", type: "image", name: "新的图", url: "/later.png" }]);
  assert.deepEqual(plain(task.input.references), saved.references);
  assert.match(task.input.prompt, /图片1视频1音频1/);
  assert.deepEqual(plain(h.window.createCanvasDocumentSnapshot()), beforeCanvas);
});

test("record cancellation refunds once and stale completion cannot overwrite its terminal state", (t) => {
  const h = harness(t);
  const task = h.send();
  const completion = [...h.timers.values()].find((timer) => timer.at === task.createdAt + 11000)?.callback;
  assert.ok(completion);
  h.advance(6999);
  h.click(task, "cancel");
  assert.equal(task.status, "canceled");
  assert.equal(task.refunded, 24);
  assert.equal(h.state.account.credits, 3000);
  assert.equal(h.state.account.consumedCredits, 0);
  assert.match(h.record(task).textContent, /已取消/);
  assert.match(h.record(task).textContent, /积分已返还/);
  assert.match(h.document.querySelector(".action-toast")?.textContent || "", /已返还 24 积分/);
  assert.equal(h.service.cancel(task.id), false);
  completion();
  assert.equal(task.status, "canceled");
  assert.equal(task.result, null);
  assert.equal(h.state.account.credits, 3000);
});

test("cancel disappears at seven seconds without a countdown while held task continues", (t) => {
  const h = harness(t);
  h.service.setNextScenario("hold");
  const task = h.send();
  assert.ok(h.record(task).querySelector('[data-generation-action="cancel"]'));
  h.advance(7000);
  assert.equal(task.status, "running");
  const button = h.record(task).querySelector('[data-generation-action="cancel"]');
  assert.ok(!button || button.hidden, "deadline update must hide the cancellation action");
  assert.equal(h.service.cancel(task), false);
  assert.doesNotMatch(h.record(task).textContent, /倒计时|剩余\s*\d+\s*秒/);
  assert.equal(h.state.account.credits, 2976);
});

test("failure keeps reason and refund visible; retry creates a new record preserving the old attempt", (t) => {
  const h = harness(t);
  h.service.setNextScenario({ outcome: "failure", reason: "参考视频暂时不可读取" });
  const task = h.send();
  h.advance(11000);
  assert.equal(task.status, "failed");
  assert.match(h.record(task).textContent, /生成失败.*参考视频暂时不可读取/s);
  assert.equal(h.state.account.credits, 3000);
  h.click(task, "again");
  const retry = h.service.list().at(-1);
  assert.notEqual(retry.id, task.id);
  assert.equal(task.status, "failed");
  assert.equal(retry.status, "queued");
  assert.deepEqual(plain(retry.input), plain(task.input));
  assert.equal(h.document.querySelectorAll(".generation-record").length, 2);
  assert.equal(h.state.account.credits, 2976);
});

test("edit restores original model, parameters and stable @ bindings and protects a nonempty draft", (t) => {
  const h = harness(t);
  const model = h.agentModels.getModel();
  h.agentParameters.restore(model, { ...h.agentParameters.getCurrent(), aspect: "9:16", duration: "12s", quality: "720p" });
  const saved = withReferences(h);
  const task = h.send(null);
  h.service.complete(task);
  h.agentModels.setGenerationModel("gpt-image-2");
  h.draft("不可被覆盖的新草稿");
  h.click(task, "edit");
  assert.equal(h.editor().getText(), "不可被覆盖的新草稿");
  assert.equal(h.agentReferences.getAssets().length, 0);
  assert.equal(h.agentModels.getModel().id, "gpt-image-2");
  h.draft("");
  h.click(task, "edit");
  assert.equal(h.agentModels.getModel().id, task.input.modelId);
  assert.equal(h.agentParameters.getCurrent().aspect, task.input.parameters.aspect);
  assert.equal(h.agentParameters.getCurrent().duration, task.input.parameters.duration);
  assert.equal(h.agentParameters.getCurrent().quality, task.input.parameters.quality);
  assert.deepEqual(plain(h.agentReferences.getAssets()), saved.references);
  const resolved = h.window.REELAY_CANVAS_PROMPT_DOCUMENT.resolve(h.editor().getDocument(), h.agentReferences.getEntries());
  assert.equal(resolved.valid, true);
  assert.deepEqual(plain(resolved.document), plain(task.input.promptDocument));
});

test("success automatically places once without changing existing selection or viewport; undo does not regenerate it", (t) => {
  const h = harness(t);
  const existing = h.window.defaultGeneratorNode(20, 30, "image");
  existing.prompt = "已有节点保持不变";
  existing.expanded = false;
  h.first.nodes.push(existing);
  h.window.setSelection([existing.id], existing.id);
  h.window.render();
  const original = plain(existing);
  const viewport = [h.state.tx, h.state.ty, h.state.scale];
  const task = h.send();
  h.service.complete(task);
  const inputSnapshot = plain(task.input);
  const added = task.addedNodeId;
  assert.ok(added);
  assert.equal(task.addedCanvasId, h.first.id);
  assert.equal(h.first.nodes.length, 2);
  assert.equal(h.second.nodes.length, 0);
  assert.equal(h.first.nodes.find((node) => node.id === added).assets[0].generationTaskId, task.id);
  assert.deepEqual([...h.state.selectedIds], [existing.id]);
  assert.equal(h.state.activeId, existing.id);
  assert.deepEqual([h.state.tx, h.state.ty, h.state.scale], viewport);
  const resultBounds = h.window.getNodeBounds(h.first.nodes.find((node) => node.id === added));
  const originalBounds = h.window.getNodeBounds(existing);
  assert.ok(resultBounds.left >= originalBounds.right || resultBounds.right <= originalBounds.left
    || resultBounds.top >= originalBounds.bottom || resultBounds.bottom <= originalBounds.top);
  assert.equal(h.record(task).querySelector('[data-generation-action="add"], [draggable="true"]'), null);
  assert.equal(h.service.complete(task), false);
  h.agentGeneration.render();
  assert.equal(h.first.nodes.length, 2);
  h.window.undoLastAction();
  assert.equal(h.first.nodes.length, 1);
  assert.deepEqual(plain(h.first.nodes[0]), original);
  assert.equal(task.status, "succeeded");
  assert.equal(task.refunded, 0);
  assert.equal(h.state.account.credits, 2976);
  assert.deepEqual(plain(task.input), inputSnapshot);
  h.agentGeneration.render();
  h.advance(11000);
  assert.equal(h.first.nodes.length, 1, "undo must not cause result delivery to run again");
  assert.equal(h.state.account.credits, 2976);
});

test("pending conversation deletion is blocked through the actual history delete action", (t) => {
  const h = harness(t);
  const task = h.send();
  const id = task.scope.conversationId;
  const deleteButton = h.document.querySelector(`#agentHistoryList [data-chat-id="${id}"] [data-history-action="delete"]`);
  assert.ok(deleteButton);
  deleteButton.click();
  assert.ok(h.agentHistory.getConversation(id));
  assert.equal(task.status, "queued");
  assert.equal(h.state.account.credits, 2976);
  assert.match(h.document.querySelector(".action-toast")?.textContent || "", /仍有生成任务/);
  assert.equal(h.document.querySelector("dialog[open]"), null);
});

test("Agent mode retains existing role messages and does not create generation tasks or charge credits", (t) => {
  const h = harness(t);
  h.agentModels.setMode("agent");
  const conversation = h.window.getConversation();
  const count = conversation.messages.length;
  const before = plain(h.state.account);
  h.draft("请帮我梳理这个镜头方案");
  h.window.sendAgentMessage();
  assert.equal(conversation.messages.length, count + 2);
  assert.equal(conversation.messages[count].role, "user");
  assert.equal(conversation.messages[count + 1].role, "agent");
  assert.equal(h.service.list().length, 0);
  assert.deepEqual(plain(h.state.account), before);
  assert.equal(h.document.querySelector("#agentMessages").hidden, false);
  assert.equal(h.document.querySelector("#agentGenerationRecords").hidden, true);
});

test("background success places in its captured canvas and keeps the currently viewed canvas and conversation intact", (t) => {
  const h = harness(t);
  const task = h.send();
  const originalConversation = h.agentHistory.getActiveId();
  h.agentHistory.startNew();
  assert.notEqual(h.agentHistory.getActiveId(), originalConversation);
  assert.equal(h.document.querySelectorAll(".generation-record").length, 0);
  h.window.switchCanvas(h.second.id);
  const current = plain(h.second);
  const selected = [...h.state.selectedIds];
  h.service.complete(task);
  assert.equal(task.scope.canvasId, h.first.id);
  assert.equal(h.first.nodes.length, 1);
  assert.equal(h.second.nodes.length, 0);
  assert.deepEqual(plain(h.second), current, "background delivery must not increment the active canvas z counter or history");
  assert.deepEqual([...h.state.selectedIds], selected);
  assert.equal(h.state.activeCanvasId, h.second.id);
  assert.equal(h.first.undoStack.length, 1);
  assert.equal(h.document.querySelectorAll(".generation-record").length, 0);
  h.agentHistory.select(originalConversation);
  assert.ok(h.record(task));
  h.state.projectId = "different-project";
  h.agentGeneration.render();
  assert.equal(h.document.querySelectorAll(".generation-record").length, 0);
  h.state.projectId = task.scope.projectId;
  h.agentGeneration.render();
  assert.ok(h.record(task));
  assert.equal(task.addedCanvasId, h.first.id);
  assert.equal(h.first.nodes.length, 1);
  assert.equal(h.second.nodes.length, 0);
});

test("success cannot write into another project or a replacement canvas with the same id", (t) => {
  const h = harness(t);
  const firstTask = h.send();
  h.state.projectId = "different-project";
  h.service.complete(firstTask);
  assert.equal(h.first.nodes.length, 0);
  assert.equal(firstTask.addedNodeId, null);
  h.state.projectId = firstTask.scope.projectId;
  const secondTask = h.send();
  const replacement = h.window.createCanvasRecord("replacement");
  replacement.id = h.first.id;
  h.canvasRuntimeStore.replaceCanvases([replacement, h.second], replacement.id);
  h.service.complete(secondTask);
  assert.equal(replacement.nodes.length, 0);
  assert.equal(h.first.nodes.length, 0);
  assert.equal(secondTask.addedNodeId, null);
});

test("locate result switches to its original canvas, selects the delivered node and fits it into the available canvas", (t) => {
  const h = harness(t);
  const task = h.send();
  assert.equal(h.record(task).querySelector('[data-generation-action="locate"]').hidden, true);
  h.service.complete(task);
  const result = h.first.nodes.find((node) => node.id === task.addedNodeId);
  result.x = 6000; result.y = 4500;
  const original = plain(result);
  const undoCount = h.first.undoStack.length;
  h.window.switchCanvas(h.second.id);
  const otherViewport = [h.second.tx, h.second.ty, h.second.scale];
  h.click(task, "locate");
  assert.equal(h.state.activeCanvasId, h.first.id);
  assert.deepEqual([...h.state.selectedIds], [result.id]);
  assert.equal(h.state.activeId, result.id);
  assert.ok(h.state.tx < 0 && h.state.ty < 0, "the viewport moves to the distant result");
  assert.deepEqual(plain(result), original);
  assert.equal(h.first.undoStack.length, undoCount);
  assert.equal(h.first.nodes.length, 1);
  assert.equal(h.second.nodes.length, 0);
  assert.deepEqual([h.second.tx, h.second.ty, h.second.scale], otherViewport);
  assert.equal(h.state.account.credits, 2976);
});

test("locate never recreates an undone result or follows a replacement canvas with the same id", (t) => {
  const h = harness(t);
  const task = h.send();
  h.service.complete(task);
  h.window.undoLastAction();
  const viewport = [h.state.tx, h.state.ty, h.state.scale];
  h.click(task, "locate");
  assert.equal(h.first.nodes.length, 0);
  assert.deepEqual([h.state.tx, h.state.ty, h.state.scale], viewport);
  assert.match(h.document.querySelector(".action-toast")?.textContent || "", /结果已不存在或暂不可访问/);

  const secondTask = h.send();
  h.service.complete(secondTask);
  const replacement = h.window.createCanvasRecord("replacement");
  replacement.id = h.first.id;
  replacement.nodes.push({ ...h.first.nodes[0] });
  h.canvasRuntimeStore.replaceCanvases([replacement, h.second], h.second.id);
  h.window.render();
  h.click(secondTask, "locate");
  assert.equal(h.state.activeCanvasId, h.second.id);
  assert.equal(replacement.nodes.length, 1);
  assert.equal(h.state.account.credits, 2952);
});

test("stale locate activation from another project cannot change canvas or selection", (t) => {
  const h = harness(t);
  const task = h.send();
  h.service.complete(task);
  h.window.switchCanvas(h.second.id);
  const button = h.record(task).querySelector('[data-generation-action="locate"]');
  h.state.projectId = "other-project";
  const viewport = [h.state.tx, h.state.ty, h.state.scale];
  button.click();
  assert.equal(h.state.activeCanvasId, h.second.id);
  assert.deepEqual([...h.state.selectedIds], []);
  assert.deepEqual([h.state.tx, h.state.ty, h.state.scale], viewport);
  assert.equal(h.first.nodes.length, 1);
  assert.equal(h.second.nodes.length, 0);
});

test("generation after a reference lands to its right and concurrent results avoid one another", (t) => {
  const h = harness(t);
  const source = h.window.defaultAssetNode(80, 90, { id: "source-picture", type: "image", url: "/source.png", width: 600, height: 900 });
  h.first.nodes.push(source);
  h.window.render();
  h.agentReferences.addAssets([source.assets[0]]);
  const first = h.send("参考图片生成一段运镜");
  const second = h.send("另一个镜头");
  h.service.complete(first);
  h.service.complete(second);
  const firstNode = h.first.nodes.find((node) => node.id === first.addedNodeId);
  const secondNode = h.first.nodes.find((node) => node.id === second.addedNodeId);
  const sourceBounds = h.window.getNodeBounds(source);
  const firstBounds = h.window.getNodeBounds(firstNode);
  const secondBounds = h.window.getNodeBounds(secondNode);
  assert.ok(firstBounds.left >= sourceBounds.right + 48);
  assert.equal(firstBounds.top, sourceBounds.top);
  assert.ok(firstBounds.left >= secondBounds.right || firstBounds.right <= secondBounds.left
    || firstBounds.top >= secondBounds.bottom || firstBounds.bottom <= secondBounds.top);
  assert.equal(h.first.undoStack.length, 2);
});

test("insufficient credits preserve the actual composer draft and references without creating a record", (t) => {
  const h = harness(t);
  const saved = withReferences(h);
  h.state.account.credits = 1;
  h.state.account.consumedCredits = 2999;
  const prompt = plain(h.editor().getDocument());
  const task = h.window.sendAgentMessage();
  assert.equal(task, null);
  assert.equal(h.service.list().length, 0);
  assert.deepEqual(plain(h.agentReferences.getAssets()), saved.references);
  assert.deepEqual(plain(h.editor().getDocument()), prompt);
  assert.equal(h.state.account.credits, 1);
  assert.equal(h.state.account.consumedCredits, 2999);
  assert.match(h.document.querySelector(".action-toast")?.textContent || "", /积分不足/);
});

test("immediate repeated send cannot debit a second time after the composer was consumed", (t) => {
  const h = harness(t);
  const task = h.send();
  assert.equal(h.window.sendAgentMessage(), null);
  h.document.querySelector(".agent-send").click();
  assert.equal(h.service.list().length, 1);
  assert.equal(h.service.list()[0], task);
  assert.equal(h.state.account.credits, 2976);
  assert.equal(h.state.account.consumedCredits, 24);
});

test("feedback copies TaskId and confirms only a successful clipboard write", async (t) => {
  const h = harness(t);
  const copied = [];
  Object.defineProperty(h.window.navigator, "clipboard", {
    configurable: true, value: { async writeText(value) { copied.push(value); } },
  });
  const task = h.send();
  h.service.fail(task, "模拟反馈场景");
  h.click(task, "feedback");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(copied, [task.id]);
  assert.match(h.document.querySelector(".action-toast")?.textContent || "", /TaskId 已复制/);
  h.window.navigator.clipboard.writeText = async () => { throw new Error("clipboard denied"); };
  h.click(task, "feedback");
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(h.document.querySelector(".action-toast")?.textContent || "", /复制未成功/);
  assert.equal(h.state.account.credits, 3000);
});

test("terminal record deletion retains its added canvas result and does not refund the successful task", (t) => {
  const h = harness(t);
  const task = h.send();
  h.service.complete(task);
  const nodeId = task.addedNodeId;
  assert.ok(nodeId);
  h.record(task).querySelector('[data-record-popover="menu"]').click();
  const remove = h.record(task).querySelector('[data-record-delete-reveal] [data-generation-action="remove"]');
  assert.ok(remove);
  remove.click();
  assert.equal(h.record(task), null);
  assert.equal(h.service.get(task.id), null);
  assert.ok(h.first.nodes.find((node) => node.id === nodeId));
  assert.equal(h.state.account.credits, 2976);
  assert.equal(h.state.account.consumedCredits, 24);
});

test("ordinary renders and panel resize retain the generated media element and playback position", (t) => {
  const h = harness(t);
  const task = h.send();
  h.service.complete(task);
  const media = h.record(task).querySelector("video.generation-record-media");
  assert.ok(media);
  media.currentTime = 4;
  h.agentGeneration.render();
  h.document.querySelector("#agentPanel").style.width = "360px";
  h.window.dispatchEvent(new h.window.Event("resize"));
  h.agentGeneration.render();
  assert.equal(h.record(task).querySelector("video.generation-record-media"), media);
  assert.equal(media.isConnected, true);
  assert.equal(media.currentTime, 4);
});

test("dropping multiple library assets onto the real prompt editor adds references without inserting IDs", (t) => {
  const h = harness(t);
  h.draft("保持我的提示词");
  const assets = ["one", "two"].map((id) => ({ id: `drop-${id}`, type: "image",
    name: id, url: `https://example.test/${id}.png`, width: 600, height: 800 }));
  h.window.registerLibraryAssets(assets, "personal");
  h.window.switchAssetLibraryContext({ space: "personal", section: "media" });
  const payload = { version: 1, projectId: h.state.projectId, canvasId: h.state.activeCanvasId,
    space: "personal", assetIds: assets.map((asset) => asset.id) };
  const transfer = { types: ["application/x-reelay-asset", "text/plain"], files: [],
    getData: (type) => type === "application/x-reelay-asset" ? JSON.stringify(payload) : payload.assetIds.join("\n") };
  const editor = h.document.querySelector("#agentComposer [contenteditable=true]");
  assert.ok(editor);
  for (const type of ["dragover", "drop"]) {
    const event = new h.window.Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: transfer });
    editor.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
  }
  assert.deepEqual(plain(h.agentReferences.getAssets().map((asset) => asset.url)), assets.map((asset) => asset.url));
  assert.equal(h.editor().getText(), "保持我的提示词");
  assert.equal(h.service.list().length, 0);
  assert.equal(h.state.account.credits, 3000);
});

test("library media preview adds to the Agent reference destination while preserving the prompt draft", (t) => {
  const h = harness(t);
  h.draft("保留这段尚未发送的提示词");
  const fixture = { id: "preview-to-agent", type: "image", name: "角色全身图.png",
    url: "https://example.test/preview-to-agent.png", width: 600, height: 1200 };
  h.window.registerLibraryAssets([fixture], "personal");
  h.window.switchAssetLibraryContext({ space: "personal", section: "media" });
  h.window.openAssetLibrary(null, { agentScope: h.agentReferences.captureScope() });
  const before = plain(h.window.createCanvasDocumentSnapshot());
  const account = plain(h.state.account);
  const card = h.document.querySelector(`[data-library-media="${fixture.id}"]`);
  assert.ok(card);
  card.querySelector("[data-library-preview]").click();
  const preview = h.document.querySelector("#assetLibraryPreviewDialog");
  assert.equal(preview.open, true);
  assert.equal(h.state.libraryPreviewTarget.id, fixture.id);
  assert.equal(preview.querySelector("img").src, fixture.url);
  const use = h.document.querySelector("#assetLibraryPreviewUse");
  assert.match(use.textContent, /加入对话参考/);
  use.click();
  assert.deepEqual(plain(h.agentReferences.getAssets().map((asset) => asset.url)), [fixture.url]);
  assert.equal(h.editor().getText(), "保留这段尚未发送的提示词");
  assert.equal(preview.open, false);
  assert.deepEqual(plain(h.window.createCanvasDocumentSnapshot()), before);
  assert.deepEqual(plain(h.state.account), account);
  assert.equal(h.first.undoStack.length, 0);
});

test("multi-selection adds image, video and audio references once while ignoring empty generators and preserving canvas history", (t) => {
  const h = harness(t);
  const assets = [
    { id: "selected-image", type: "image", name: "人物.png", url: "/selected-image.png", width: 600, height: 1200 },
    { id: "selected-video", type: "video", name: "动作.mp4", url: "/selected-video.mp4", duration: 10 },
    { id: "selected-audio", type: "audio", name: "配音.mp3", url: "/selected-audio.mp3", duration: 5 },
  ];
  const nodes = assets.map((asset, index) => h.window.defaultAssetNode(index * 360, 30, asset));
  const empty = h.window.defaultGeneratorNode(1080, 30, "video");
  empty.expanded = false;
  h.first.nodes.push(...nodes, empty);
  h.window.setSelection(h.first.nodes.map((node) => node.id), nodes[0].id);
  h.window.render();
  h.draft("草稿保持不变");
  const before = plain(h.window.createCanvasDocumentSnapshot());
  const account = plain(h.state.account);
  const historySize = h.first.undoStack.length;
  const button = h.document.querySelector('[data-selection-action="add-conversation"]');
  assert.ok(button);
  assert.equal(button.disabled, false);
  button.click();
  assert.deepEqual(plain(h.agentReferences.getAssets().map((asset) => asset.type)), ["image", "video", "audio"]);
  assert.equal(h.editor().getText(), "草稿保持不变");
  assert.equal(h.state.agentOpen, true);
  button.click();
  assert.equal(h.agentReferences.getAssets().length, 3, "repeat add must reuse draft media identity instead of duplicating it");
  assert.deepEqual(plain(h.window.createCanvasDocumentSnapshot()), before);
  assert.deepEqual(plain(h.state.account), account);
  assert.equal(h.first.undoStack.length, historySize);
  assert.equal(h.second.nodes.length, 0);
});

test("selection reference action rejects empty generators but accepts media while optimization preserves its snapshot", (t) => {
  const h = harness(t);
  const emptyNodes = [h.window.defaultGeneratorNode(0, 0, "image"), h.window.defaultGeneratorNode(360, 0, "video")];
  h.first.nodes.push(...emptyNodes);
  h.window.setSelection(emptyNodes.map((node) => node.id), emptyNodes[0].id);
  h.window.render();
  assert.equal(h.document.querySelector('[data-selection-action="add-conversation"]').disabled, true);
  const media = h.window.defaultAssetNode(720, 0, { id: "busy-image", type: "image", name: "参考.png", url: "/busy.png" });
  h.first.nodes.push(media);
  h.window.setSelection([emptyNodes[0].id, media.id], media.id);
  h.window.render();
  h.draft("正在优化的草稿");
  h.window.startAgentPromptOptimization();
  assert.equal(h.document.querySelector("#agentPromptOptimizationBtn").getAttribute("aria-busy"), "true");
  h.document.querySelector('[data-selection-action="add-conversation"]').click();
  assert.equal(h.agentReferences.getAssets().length, 1);
  assert.equal(h.editor().getText(), "正在优化的草稿");
  assert.equal(h.document.querySelector("#agentPromptOptimizationBtn").getAttribute("aria-busy"), "true");
});

test("sending during optimization uses the live draft and completion never refills or charges it", (t) => {
  const h = harness(t);
  h.draft("最初的优化输入");
  assert.equal(h.window.startAgentPromptOptimization(), true);
  h.draft("处理期间修改后立即发送");
  const task = h.send(null);
  const creditsAfterSend = plain(h.state.account);
  assert.equal(h.editor().getText(), "");
  h.advance(1800);
  assert.equal(h.editor().getText(), "", "optimization must not refill the composer after sending");
  assert.deepEqual(plain(h.state.account), creditsAfterSend, "suggestion completion is not a generation charge");
  assert.ok(h.record(task));
  assert.equal(h.document.querySelector("#agentPromptOptimizationBtn").classList.contains("has-optimization"), false);
  assert.equal(h.document.querySelector("#agentPromptOptimizationBtn").disabled, true);
});

test("development presets fill mixed-media and twelve-reference drafts without sending or overriding unapproved drafts", async (t) => {
  const h = harness(t);
  h.window.eval(await readFile(new URL("src/config/generation-demo-presets.js", root), "utf8"));
  let capabilities;
  h.window.addEventListener("reelay:generation-ready", (event) => { capabilities = event.detail; }, { once: true });
  h.window.dispatchEvent(new h.window.CustomEvent("reelay:generation-connect"));
  assert.ok(capabilities);
  assert.ok(capabilities.listPresets().some((preset) => preset.id === "video-omni"));
  assert.equal(capabilities.listPresets().length, 5);
  assert.ok(capabilities.listPresets().some((preset) => preset.id === "image-many"));
  const account = plain(h.state.account);
  const canvas = plain(h.window.createCanvasDocumentSnapshot());
  h.agentModels.setGenerationModel("gpt-image-2");
  assert.equal(capabilities.hasDraft(), false);
  assert.equal(capabilities.fillPreset("video-omni"), true);
  assert.equal(h.agentModels.getModel().id, "seedance-2-5");
  assert.deepEqual(plain(h.agentReferences.getAssets().map((asset) => asset.type)), [...Array(7).fill("image"), "video", "audio"]);
  let resolved = h.window.REELAY_CANVAS_PROMPT_DOCUMENT.resolve(h.editor().getDocument(), h.agentReferences.getEntries());
  assert.equal(resolved.valid, true);
  assert.equal(resolved.document.content.filter((part) => part.type === "reference").length, 9);
  assert.equal(new Set(resolved.document.content.filter((part) => part.type === "reference").map((part) => part.key)).size, 9);
  assert.ok([...resolved.text.matchAll(/\p{Script=Han}/gu)].length >= 300);
  assert.ok(h.window.captureAgentGenerationInput(), "a filled preset must pass the actual send validation");
  const previous = { prompt: plain(h.editor().getDocument()), references: plain(h.agentReferences.getAssets()) };
  assert.equal(capabilities.hasDraft(), true);
  assert.equal(capabilities.fillPreset("image-many", { replace: false }), false);
  assert.deepEqual(plain(h.editor().getDocument()), previous.prompt);
  assert.deepEqual(plain(h.agentReferences.getAssets()), previous.references);
  assert.equal(capabilities.fillPreset("image-many", { replace: true }), true);
  assert.equal(h.agentModels.getModel().id, "gpt-image-2");
  assert.equal(h.agentReferences.getAssets().length, 12);
  assert.ok(h.agentReferences.getAssets().every((asset) => asset.type === "image"));
  resolved = h.window.REELAY_CANVAS_PROMPT_DOCUMENT.resolve(h.editor().getDocument(), h.agentReferences.getEntries());
  assert.equal(resolved.valid, true);
  assert.match(resolved.text, /^以图片1、图片2和图片3/);
  const citedKeys = new Set(resolved.document.content.filter((part) => part.type === "reference").map((part) => part.key));
  assert.equal(citedKeys.size, 12);
  assert.ok(h.agentReferences.getEntries().every((entry) => citedKeys.has(entry.key)));
  assert.ok(h.window.captureAgentGenerationInput(), h.document.querySelector(".action-toast")?.textContent);
  assert.equal(h.service.list().length, 0);
  assert.deepEqual(plain(h.state.account), account);
  assert.deepEqual(plain(h.window.createCanvasDocumentSnapshot()), canvas);
});
