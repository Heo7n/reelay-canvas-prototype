import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";
import { installCanvasIcons } from "./helpers/canvas-icons.mjs";

const sources = await Promise.all([
  "config/prototype-config.js", "application/draft-video-policy.js", "legacy-canvas/canvas-popover-placement.js", "legacy-canvas/canvas-draft-video-controller.js",
  "infrastructure/generation/simulated-generation-executor.js", "application/generation-task-service.js", "application/generation-record-groups.js",
  "legacy-canvas/canvas-agent-generation-controller.js", "legacy-canvas/canvas-draft-video-badge.js",
].map((path) => readFile(new URL(`../src/${path}`, import.meta.url), "utf8")));
const plain = (value) => JSON.parse(JSON.stringify(value));
const catalog = await readFile(new URL("../data/model-catalog.js", import.meta.url), "utf8");

function fixture(t, { agent = false, parameters = {}, synchronous = false } = {}) {
  const dom = new JSDOM('<!doctype html><body><button id="anchor">生成成片</button><div id="records"></div><div id="chat"></div></body>', { runScripts: "outside-only" });
  const { window } = dom; const { document } = window;
  installCanvasIcons(window);
  let time = 100000; let timerId = 0; let counter = 0;
  let scope = { projectId: "project", canvasId: "canvas", conversationId: "chat" };
  let editable = true; let generationMode = true; let balance = 3000; let cleared = 0;
  const timers = new Map(); const submissions = []; const messages = []; const placements = []; const targets = []; const restored = []; const discarded = [];
  window.Date.now = () => time;
  window.setTimeout = (callback, delay) => { const id = ++timerId; timers.set(id, { at: time + delay, callback }); return id; };
  window.clearTimeout = (id) => timers.delete(id);
  window.HTMLElement.prototype.showPopover = function () { this.dataset.open = "true"; };
  window.HTMLElement.prototype.hidePopover = function () { delete this.dataset.open; };
  const frames = new Map(); let frameId = 0;
  window.requestAnimationFrame = (callback) => { frames.set(++frameId, callback); return frameId; };
  window.cancelAnimationFrame = (id) => frames.delete(id);
  window.eval(catalog);
  for (const source of sources) window.eval(source);
  const policy = window.REELAY_DRAFT_VIDEO;
  const input = { mediaType: "video", modelId: "seedance-2-5-draft", modelName: "Seedance 2.5（样片模式）",
    prompt: "镜头跟随人物走过街道", references: [{ id: "ref", type: "image", name: "人物正面", url: "/portrait.png" }],
    parameters: { aspect: "16:9", duration: "10s", quality: "480p", audioEnabled: true, ...parameters }, cost: 15 };
  const sourceAsset = { id: "draft-result", type: "video", name: "样片", url: "/draft.mp4", width: 640, height: 360,
    generation: policy.createDraftProvenance({ input, taskId: "draft-task", createdAt: time, scope, resultId: "draft-result" }) };
  function createFinalInput(asset, { outputFormat, scope: targetScope }) {
    return policy.buildFinalInput(asset, { outputFormat, projectId: targetScope.projectId, now: time, cost: 36 });
  }
  let actions;
  let controller;
  let taskService;
  if (agent) {
    window.REELAY_GENERATION_RECORD_VIEW = { createController(options) {
      actions = options.onAction;
      return { render() {}, close() {}, dispose() {}, observeTask() {} };
    } };
    const service = window.REELAY_GENERATION_TASKS.createService({
      makeId: () => window.crypto.randomUUID(), now: () => time,
      executor: synchronous ? { start({ onComplete }) { onComplete(); return true; }, stop() {}, dispose() {} }
        : window.REELAY_SIMULATED_GENERATION_EXECUTOR.createExecutor({ now: () => time }),
      draftPolicy: policy, cancelWindowMs: 5000, previewDurationMs: 7500,
      charge: (cost) => { if (balance < cost) return false; balance -= cost; return true; },
      refund: (cost) => { balance += cost; return true; },
      makeResult: () => ({ id: `result-${++counter}`, type: "video", url: "/generated.mp4" }),
      onRefund: (task) => messages.push(`已返还 ${task.refunded} 积分`),
    });
    taskService = service;
    controller = window.REELAY_AGENT_GENERATION.createController({
      service,
      document, container: document.querySelector("#records"), chatContainer: document.querySelector("#chat"),
      getScope: () => scope, isGenerationMode: () => generationMode, isEditable: () => editable,
      captureInput: () => input, clearDraft: () => { cleared++; }, restoreDraft: (value) => { restored.push(value); return true; },
      hasDraft: () => false,
      capturePlacementTarget: (value, submitted) => { const target = { scope: { ...value }, input: submitted }; targets.push(target); return target; },
      placeResult: (task, target) => { placements.push({ task, target }); return { nodeId: `node-${task.id}`, canvasId: target.scope.canvasId }; },
      discardResult: (task) => discarded.push(task),
      locateResult: () => true, showMessage: (message) => messages.push(message), createFinalInput,
    });
  } else {
    controller = window.REELAY_DRAFT_VIDEO_CONTROLLER.createController({
      document, getScope: () => scope, isEditable: () => editable, now: () => time, createFinalInput,
      onSubmit: (...args) => { submissions.push(args); return { id: "final-task" }; }, showMessage: (message) => messages.push(message),
    });
  }
  t.after(() => { controller.dispose(); taskService?.dispose(); window.close(); });
  const anchor = document.querySelector("#anchor");
  anchor.getBoundingClientRect = () => ({ left: 100, top: 400, right: 200, bottom: 432, width: 100, height: 32 });
  function open() {
    anchor.focus();
    return agent ? controller.requestFinal(sourceAsset, { anchor }) : controller.open({ sourceAsset, anchor });
  }
  function submit() { document.querySelector(".draft-video-popover form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })); }
  function advance(amount) {
    time += amount;
    for (const [id, timer] of [...timers]) if (timer.at <= time) { timers.delete(id); timer.callback(); }
  }
  return { window, document, controller, sourceAsset, input, submissions, messages, placements, targets, restored, discarded, timers, open, submit, advance, anchor,
    get scope() { return scope; }, setScope(value) { scope = value; }, setEditable(value) { editable = value; },
    setMode(value) { generationMode = value; }, get balance() { return balance; }, get cleared() { return cleared; },
    action: (...args) => actions(...args), query: (selector) => document.querySelector(selector),
    position() { for (const [id, callback] of [...frames]) { frames.delete(id); callback(); } },
  };
}

test("ordinary and final submissions bind their canvas target before synchronous executor completion", (t) => {
  const f = fixture(t, { agent: true, synchronous: true });
  const ordinary = f.controller.submit();
  assert.equal(ordinary.status, "succeeded");
  assert.equal(ordinary.addedNodeId, `node-${ordinary.id}`);
  f.open(); f.submit();
  const final = f.controller.service.list().find((task) => task.input.generationStage === "final");
  assert.equal(final.status, "succeeded");
  assert.equal(final.addedNodeId, `node-${final.id}`);
  assert.equal(f.placements.length, 2);
});

test("closing UI retains delivery while adapter disposal invalidates only its owned placements without refund", (t) => {
  const f = fixture(t, { agent: true });
  const task = f.controller.submit();
  f.controller.close(); f.advance(7500);
  assert.equal(task.status, "succeeded");
  assert.equal(f.placements.length, 1);
  const pending = f.controller.submit();
  const independent = f.controller.service.submit({ sourceSurface: "canvas", scope: { projectId: "project", canvasId: "canvas", nodeId: "native" }, input: f.input });
  const chargedBalance = f.balance;
  f.controller.dispose();
  assert.equal(pending.status, "canceled");
  assert.equal(pending.cancellationReason, "projection-disposed");
  assert.equal(pending.refunded, 0);
  assert.equal(f.discarded.includes(pending), true);
  assert.equal(f.balance, chargedBalance);
  f.advance(7500);
  assert.equal(independent.status, "succeeded");
  assert.equal(f.placements.length, 1);
});

test("compact sample popover fixes 1080P, chooses a model format and submits the original input", (t) => {
  const f = fixture(t); const before = plain(f.sourceAsset);
  assert.equal(f.open(), true);
  assert.equal(f.query('[data-draft-resolution]').textContent, "1080P");
  assert.equal(f.query('[data-draft-cost]').textContent, "36");
  assert.equal(f.query('textarea,select,input:not([type="radio"])'), null, "only output format is editable");
  assert.deepEqual([...f.document.querySelectorAll('input[type="radio"]')].map((input) => input.value), ["mp4", "mov"]);
  assert.equal(f.query('[data-draft-prompt]'), null, "original inputs are not repeated in the parameters popover");
  const format = f.query('input[value="mov"]'); format.checked = true; format.focus(); format.dispatchEvent(new f.window.Event("change", { bubbles: true }));
  assert.equal(f.document.activeElement, format);
  f.submit();
  assert.equal(f.submissions.length, 1);
  assert.equal(f.submissions[0][0].parameters.outputFormat, "mov");
  assert.equal(f.submissions[0][0].parameters.quality, "1080p");
  assert.equal(f.submissions[0][0].prompt, f.input.prompt);
  assert.deepEqual(plain(f.sourceAsset), before);
  assert.equal(f.query(".draft-video-popover"), null); assert.equal(f.document.activeElement, f.anchor);
  assert.equal(f.anchor.getAttribute("aria-expanded"), "false");
});

test("confirmation expires while open without charging or losing the sample", (t) => {
  const f = fixture(t); f.open(); f.advance(7 * 24 * 60 * 60 * 1000 + 1);
  assert.equal(f.query('.draft-video-submit').disabled, true);
  assert.match(f.query('[data-draft-error]').textContent, /已过期/);
  f.submit(); assert.equal(f.submissions.length, 0);
  assert.equal(f.sourceAsset.url, "/draft.mp4");
});

test("popover follows its anchor, fits the viewport and closes when its source leaves view", (t) => {
  const f = fixture(t); f.open();
  const panel = f.query(".draft-video-popover");
  panel.getBoundingClientRect = () => ({ width: 280, height: 180 });
  f.controller.reposition(); f.position();
  assert.equal(panel.style.top, "212px");
  assert.equal(panel.style.left, "100px");
  f.anchor.getBoundingClientRect = () => ({ left: 950, right: 1020, top: 20, bottom: 52, width: 70, height: 32 });
  f.controller.reposition(); f.position();
  assert.equal(panel.style.top, "60px");
  assert.ok(parseFloat(panel.style.left) + 280 <= f.window.innerWidth - 12);
  f.anchor.getBoundingClientRect = () => ({ left: 100, right: 200, top: -70, bottom: -38, width: 100, height: 32 });
  f.controller.reposition(); f.position();
  assert.equal(f.query(".draft-video-popover"), null);
  assert.equal(f.timers.size, 0);
});

test("node media action opens below its right edge while record actions open above their left edge", (t) => {
  const f = fixture(t);
  f.anchor.getBoundingClientRect = () => ({ left: 400, top: 300, right: 580, bottom: 332, width: 180, height: 32 });
  f.controller.open({ sourceAsset: f.sourceAsset, sourceNodeId: "video-node", anchor: f.anchor });
  const panel = f.query(".draft-video-popover");
  panel.getBoundingClientRect = () => ({ width: 280, height: 220 });
  f.controller.reposition(); f.position();
  assert.equal(panel.style.top, "340px");
  assert.equal(panel.style.left, "300px");
  f.controller.close(); f.open(); f.controller.reposition(); f.position();
  assert.equal(panel.style.top, "72px");
  assert.equal(panel.style.left, "400px");
});

test("node menu keeps the reference media proportion through zoom while chat stays screen-sized", (t) => {
  const f = fixture(t);
  const media = f.document.createElement("section"); media.className = "media-frame";
  f.document.body.append(media); media.append(f.anchor);
  let mediaWidth = 768;
  media.getBoundingClientRect = () => ({ width: mediaWidth });
  f.anchor.getBoundingClientRect = () => ({ left: 600, right: 720, top: 40, bottom: 72, width: 120, height: 32 });
  f.controller.open({ sourceAsset: f.sourceAsset, anchor: f.anchor, sourceNodeId: "sample-node" });
  const panel = f.query(".draft-video-popover");
  const scale = () => Number(panel.style.transform.slice(6, -1));
  panel.getBoundingClientRect = () => ({ width: parseFloat(panel.style.width) * scale(), height: 300 * scale() });
  const format = f.query('input[value="mov"]'); format.checked = true; format.focus();
  for (mediaWidth of [768, 384, 960, 768]) {
    f.controller.reposition(); f.position();
    const renderedWidth = panel.getBoundingClientRect().width;
    assert.equal(renderedWidth / mediaWidth, 280 / 768);
    assert.equal(parseFloat(panel.style.left) + renderedWidth, 720, "scaled menu stays aligned to the trigger's right edge");
    assert.equal(parseFloat(panel.style.top), 72 + 8 * scale());
    assert.equal(f.document.activeElement, format);
    assert.equal(format.checked, true);
  }
  f.controller.close();
  mediaWidth = 384;
  f.open(); f.position();
  assert.equal(scale(), 1, "conversation-origin menus do not inherit node scale");
  assert.equal(panel.style.width, "280px");
  assert.equal(panel.style.maxHeight, (f.window.innerHeight - 24) + "px");
});

test("visible timing card uses the sample creation and expiry times, never the current time", (t) => {
  const f = fixture(t); f.advance(24 * 60 * 60 * 1000); f.open();
  const expected = (value) => new Date(value).toLocaleString("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  assert.equal(f.query("[data-draft-created]").textContent, expected(f.sourceAsset.generation.createdAt));
  assert.equal(f.query("[data-draft-expires]").textContent, expected(f.sourceAsset.generation.expiresAt));
  assert.match(f.query('.draft-video-time-card').textContent, /样片任务创建时间：.*正片生成截止时间：.*逾期需重新生成样片/);
  const standalone = f.document.createElement("div");
  standalone.innerHTML = f.window.REELAY_DRAFT_VIDEO_CONTROLLER.renderTimingMarkup(f.sourceAsset);
  assert.equal(standalone.querySelector(".draft-video-timing").outerHTML, f.query(".draft-video-timing").outerHTML);
  standalone.innerHTML = f.window.REELAY_DRAFT_VIDEO_CONTROLLER.renderTimingMarkup({ generation: { createdAt: '<img src=x onerror="bad">' } });
  assert.equal(standalone.querySelector("img"), null);
  assert.equal(standalone.querySelector("[data-draft-created]").textContent, "—");
});

test("both cards and their gap share one dismissal boundary", (t) => {
  const f = fixture(t); f.open();
  const panel = f.query(".draft-video-popover");
  assert.equal(panel.getAttribute("popover"), "manual");
  assert.equal(panel.children.length, 2);
  assert.equal(f.query('[role="tooltip"], .draft-video-help'), null);
  for (const target of [f.query("form"), f.query(".draft-video-time-card"), panel]) {
    target.dispatchEvent(new f.window.Event("pointerdown", { bubbles: true }));
    target.dispatchEvent(new f.window.Event("click", { bubbles: true }));
    assert.equal(f.query(".draft-video-popover"), panel);
  }
  f.document.body.dispatchEvent(new f.window.Event("pointerdown", { bubbles: true }));
  assert.equal(f.query(".draft-video-popover"), null);
  assert.equal(f.query(".draft-video-time-card"), null);
  assert.equal(f.submissions.length, 0);
});

test("viewport flips keep parameters closest to the trigger and preserve format focus", (t) => {
  for (const sourceNodeId of ["", "sample-node"]) {
    const f = fixture(t);
    f.controller.open({ sourceAsset: f.sourceAsset, anchor: f.anchor, sourceNodeId });
    const panel = f.query(".draft-video-popover");
    panel.getBoundingClientRect = () => ({ width: 280, height: 300 });
    const format = f.query('input[value="mov"]');
    format.checked = true; format.focus();
    for (const top of [20, 650, 20]) {
      f.anchor.getBoundingClientRect = () => ({ left: 400, right: 500, top, bottom: top + 32, width: 100, height: 32 });
      f.controller.reposition(); f.position();
      assert.equal(panel.firstElementChild.className, top === 20 ? "draft-video-parameter-card" : "draft-video-time-card");
      assert.equal(f.document.activeElement, format);
      assert.equal(format.checked, true);
      assert.ok(parseFloat(panel.style.top) >= 12);
      assert.ok(parseFloat(panel.style.top) + 300 <= f.window.innerHeight - 12);
    }
  }
});

test("outside interactions and repeated activation dismiss without stealing focus or submitting", (t) => {
  const f = fixture(t); f.open();
  assert.equal(f.anchor.getAttribute("aria-expanded"), "true");
  f.open();
  assert.equal(f.query(".draft-video-popover"), null);
  f.open();
  const outside = f.document.createElement("button"); f.document.body.append(outside);
  outside.focus();
  assert.equal(f.query(".draft-video-popover"), null);
  assert.equal(f.document.activeElement, outside);
  f.open();
  outside.dispatchEvent(new f.window.Event("pointerdown", { bubbles: true }));
  assert.equal(f.query(".draft-video-popover"), null);
  assert.equal(f.submissions.length, 0);
});

test("only the owning node treats the detached final popover as an internal media interaction", (t) => {
  const f = fixture(t);
  f.controller.open({ sourceAsset: f.sourceAsset, anchor: f.anchor, sourceNodeId: "sample-node" });
  const panel = f.query(".draft-video-popover");
  for (const target of [panel, panel.querySelector("form"), panel.querySelector(".draft-video-time-card"), panel.querySelector('input[value="mov"]')]) {
    assert.equal(f.controller.containsNodeInteraction("sample-node", target), true);
    assert.equal(f.controller.containsNodeInteraction("other-node", target), false);
    assert.equal(f.controller.containsNodeInteraction(null, target), false);
  }
  assert.equal(f.controller.containsNodeInteraction("sample-node", f.document.body), false);
  f.controller.close();
  assert.equal(f.controller.containsNodeInteraction("sample-node", panel), false);
  f.open();
  assert.equal(f.controller.containsNodeInteraction("sample-node", f.query(".draft-video-popover")), false,
    "conversation confirmations cannot keep an unrelated canvas toolbar open");
});

test("popover keyboard input cannot invoke canvas delete, undo or space-pan shortcuts", (t) => {
  const f = fixture(t); f.open();
  const escapedKeys = [];
  f.window.addEventListener("keydown", (event) => escapedKeys.push(event.key));
  const button = f.query(".draft-video-submit"); button.focus();
  for (const key of ["Delete", "Backspace", " ", "z"]) {
    const event = new f.window.KeyboardEvent("keydown", { key, ctrlKey: key === "z", bubbles: true, cancelable: true });
    button.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false, "native radio and button keyboard behavior remains available");
  }
  assert.deepEqual(escapedKeys, []);
  assert.ok(f.query(".draft-video-popover"));
});

test("scope and permission changes dismiss a confirmation and prevent stale submit", (t) => {
  for (const change of ["scope", "permission"]) {
    const f = fixture(t); f.open(); const form = f.query("form");
    // Test each invalidation against the captured scope without a user accepting new ownership.
    if (change === "scope") f.setScope({ ...f.scope, canvasId: "other" });
    else f.setEditable(false);
    f.controller.refresh(); assert.equal(f.query(".draft-video-popover"), null);
    form.dispatchEvent(new f.window.Event("submit", { bubbles: true, cancelable: true }));
    assert.equal(f.submissions.length, 0);
  }
});

test("Escape releases the expiry timer and returns focus without exposing locked parameters", (t) => {
  const f = fixture(t, { parameters: { duration: -1, audioEnabled: false } }); f.open();
  f.query('.draft-video-submit').focus();
  assert.ok(f.query('.draft-video-time-card'));
  assert.match(f.query('.draft-video-resolution-value').getAttribute('aria-description'), /模拟预览/);
  f.document.dispatchEvent(new f.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  assert.equal(f.query(".draft-video-popover"), null); assert.equal(f.timers.size, 0); assert.equal(f.document.activeElement, f.anchor);
});

test("node-origin final submits while Agent mode is active and finishes only in captured canvas", (t) => {
  const f = fixture(t, { agent: true }); f.setMode(false);
  assert.equal(f.open(), true); f.submit();
  const [task] = f.controller.service.list(); assert.ok(task);
  assert.equal(task.input.generationStage, "final"); assert.equal(task.scope.canvasId, "canvas");
  assert.equal(f.balance, 2964); assert.equal(f.cleared, 0);
  f.setScope({ ...f.scope, canvasId: "other", conversationId: "other-chat" }); f.controller.render();
  f.controller.service.complete(task);
  assert.equal(f.placements.length, 1); assert.equal(f.placements[0].target.scope.canvasId, "canvas");
  assert.equal(task.result.url, f.sourceAsset.url); assert.equal(task.result.width, 640);
  assert.equal(f.sourceAsset.generation.stage, "draft"); assert.equal(task.result.generation.stage, "final");
});

test("repeat clicks from another conversation reuse the pending final without recapturing placement or charging", (t) => {
  const f = fixture(t, { agent: true }); f.open(); f.submit();
  const [task] = f.controller.service.list(); const target = f.targets[0];
  f.setScope({ ...f.scope, canvasId: "other", conversationId: "other-chat" });
  f.open(); f.submit();
  assert.equal(f.controller.service.list().length, 1); assert.equal(f.targets.length, 1);
  assert.equal(f.balance, 2964); assert.match(f.messages.at(-1), /已在生成中/);
  f.controller.service.complete(task); assert.equal(f.placements[0].target, target);
});

test("final record repeats reopen locked confirmation and do not enter editable draft", async (t) => {
  const f = fixture(t, { agent: true }); f.open(); f.submit();
  const [task] = f.controller.service.list(); f.controller.service.fail(task, "模拟失败");
  assert.equal(f.balance, 3000);
  await f.action("edit", task, {}); assert.equal(f.restored.length, 0);
  await f.action("again", task, { target: f.anchor });
  assert.ok(f.query(".draft-video-popover")); assert.equal(f.controller.service.list().length, 1);
  f.submit(); assert.equal(f.controller.service.list().length, 2); assert.equal(f.balance, 2964);
  const next = f.controller.service.list().at(-1); f.controller.service.cancel(next);
  assert.equal(f.balance, 3000); assert.equal(f.sourceAsset.generation.stage, "draft");
});


test("only the node badge hover opens after intent delay and leaves keyboard focus unchanged", (t) => {
  const f = fixture(t);
  const node = f.document.createElement("article");
  node.innerHTML = f.window.REELAY_DRAFT_VIDEO_BADGE.render({ asset: f.sourceAsset, eligibility: { eligible: true } });
  f.document.body.append(node);
  const badge = node.querySelector("button");
  badge.getBoundingClientRect = f.anchor.getBoundingClientRect;
  f.window.REELAY_DRAFT_VIDEO_BADGE.bind(node, (anchor, { interaction } = {}) => {
    if (interaction === "leave") f.controller.leave(anchor);
    else if (interaction === "hover") f.controller.hover({ sourceAsset: f.sourceAsset, anchor, sourceNodeId: "node" });
    else f.controller.open({ sourceAsset: f.sourceAsset, anchor, sourceNodeId: "node" });
  });
  f.anchor.focus();
  node.dispatchEvent(new f.window.Event("pointerenter")); f.advance(200);
  assert.equal(f.query(".draft-video-popover"), null, "the whole node is not a hover trigger");
  const touch = new f.window.Event("pointerenter"); Object.defineProperty(touch, "pointerType", { value: "touch" });
  badge.dispatchEvent(touch); f.advance(200);
  assert.equal(f.query(".draft-video-popover"), null, "touch still uses click activation");
  badge.dispatchEvent(new f.window.Event("pointerenter")); f.advance(149);
  assert.equal(f.query(".draft-video-popover"), null);
  f.advance(1);
  assert.ok(f.query(".draft-video-popover"));
  assert.equal(f.document.activeElement, f.anchor);
  assert.equal(badge.getAttribute("aria-expanded"), "true");
  badge.click();
  assert.ok(f.query(".draft-video-popover"), "first click pins an already hovered menu");
  assert.equal(f.document.activeElement, f.query("input:checked"));
  badge.dispatchEvent(new f.window.Event("pointerleave")); f.advance(300);
  assert.ok(f.query(".draft-video-popover"), "pinned menus survive pointer departure");
  badge.click(); assert.equal(f.query(".draft-video-popover"), null);
});

test("hover traverses the trigger gap and both cards, then dismisses without moving focus", (t) => {
  const f = fixture(t); f.anchor.focus();
  f.controller.hover({ sourceAsset: f.sourceAsset, anchor: f.anchor }); f.advance(150);
  const panel = f.query(".draft-video-popover");
  f.controller.leave(f.anchor); f.advance(150);
  panel.dispatchEvent(new f.window.Event("pointerenter")); f.advance(300);
  assert.equal(f.query(".draft-video-popover"), panel);
  for (const target of [f.query("form"), panel, f.query(".draft-video-time-card")]) {
    target.dispatchEvent(new f.window.Event("pointermove", { bubbles: true })); f.advance(300);
    assert.equal(f.query(".draft-video-popover"), panel, "cards and internal gap share the same hover boundary");
  }
  panel.dispatchEvent(new f.window.Event("pointerleave")); f.advance(219);
  assert.equal(f.query(".draft-video-popover"), panel);
  f.advance(1); assert.equal(f.query(".draft-video-popover"), null);
  assert.equal(f.document.activeElement, f.anchor); assert.equal(f.timers.size, 0);
});

test("brief hover, scope change, permission loss, Escape and disposal clear pending opens", (t) => {
  for (const change of ["leave", "scope", "permission", "escape", "dispose", "outside"]) {
    const f = fixture(t);
    f.controller.hover({ sourceAsset: f.sourceAsset, anchor: f.anchor });
    if (change === "leave") f.controller.leave(f.anchor);
    if (change === "scope") { f.setScope({ ...f.scope, canvasId: "other" }); f.controller.refresh(); }
    if (change === "permission") { f.setEditable(false); f.controller.refresh(); }
    if (change === "escape") f.document.dispatchEvent(new f.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    if (change === "dispose") f.controller.dispose();
    if (change === "outside") f.document.body.dispatchEvent(new f.window.Event("pointerdown", { bubbles: true }));
    f.advance(500);
    assert.equal(f.query(".draft-video-popover"), null, change);
    assert.equal(f.timers.size, 0, change);
  }
});

test("removing a hovered source closes the popover and clears its lifecycle timers", async (t) => {
  const f = fixture(t);
  f.controller.hover({ sourceAsset: f.sourceAsset, anchor: f.anchor }); f.advance(150);
  assert.ok(f.query(".draft-video-popover"));
  f.anchor.remove(); await Promise.resolve();
  assert.equal(f.query(".draft-video-popover"), null); assert.equal(f.timers.size, 0);
});

test("interacting with a hovered parameter pins the menu until explicit dismissal", (t) => {
  const f = fixture(t);
  f.controller.hover({ sourceAsset: f.sourceAsset, anchor: f.anchor }); f.advance(150);
  const panel = f.query(".draft-video-popover");
  const format = f.query('input[value="mov"]');
  format.dispatchEvent(new f.window.Event("pointerdown", { bubbles: true })); format.focus();
  panel.dispatchEvent(new f.window.Event("pointerleave")); f.advance(300);
  assert.equal(f.query(".draft-video-popover"), panel);
  f.document.dispatchEvent(new f.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  assert.equal(f.query(".draft-video-popover"), null); assert.equal(f.document.activeElement, f.anchor);
});

test("node hover uses the agent adapter without submitting or charging", (t) => {
  const f = fixture(t, { agent: true }); f.anchor.focus();
  f.controller.requestFinal(f.sourceAsset, { anchor: f.anchor, sourceNodeId: "node", interaction: "hover" });
  f.advance(150); assert.ok(f.query(".draft-video-popover"));
  assert.equal(f.document.activeElement, f.anchor); assert.equal(f.balance, 3000);
  assert.equal(f.controller.service.list().length, 0);
  f.controller.requestFinal(f.sourceAsset, { anchor: f.anchor, sourceNodeId: "node", interaction: "leave" });
  f.advance(220); assert.equal(f.query(".draft-video-popover"), null);
});


test("canvas final scope ignores conversation changes and never acquires a conversation owner", (t) => {
  const f = fixture(t, { agent: true });
  assert.equal(f.controller.requestFinal(f.sourceAsset, { anchor: f.anchor, sourceNodeId: "sample-node" }), true);
  f.setScope({ ...f.scope, conversationId: "other-chat" });
  f.controller.render();
  assert.ok(f.query(".draft-video-popover"));
  f.submit();
  const task = f.controller.service.list()[0];
  assert.equal(task.sourceSurface, "canvas");
  assert.equal(task.scope.conversationId, null);
  assert.equal(f.targets[0].scope.conversationId, null);
  assert.equal(f.controller.hasRecords("chat"), false);
  assert.equal(f.controller.hasRecords("other-chat"), false);
  f.controller.removeConversation("chat");
  f.controller.removeConversation("other-chat");
  f.controller.service.complete(task);
  assert.equal(f.placements.length, 1);
});

test("conversation final popover cannot submit into another conversation", (t) => {
  const f = fixture(t, { agent: true });
  assert.equal(f.open(), true);
  f.setScope({ ...f.scope, conversationId: "other-chat" });
  f.controller.render();
  assert.equal(f.query(".draft-video-popover"), null);
  assert.equal(f.controller.service.list().length, 0);
  assert.equal(f.balance, 3000);
});
