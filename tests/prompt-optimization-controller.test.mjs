import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const scripts = await Promise.all([
  "../src/legacy-canvas/canvas-prompt-document.js",
  "../src/application/prompt-optimization-service.js",
  "../src/application/prompt-optimization-preferences.js",
  "../src/legacy-canvas/canvas-prompt-optimization-controller.js",
].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
const plain = (value) => JSON.parse(JSON.stringify(value));
const text = (value) => ({ type: "text", text: value });
const reference = { type: "reference", key: "asset:one", mediaType: "image", fallbackLabel: "图片1" };
const doc = (...content) => ({ version: 1, content });
const modelCatalog = [
  { id: "image-model", name: "Image Model", type: "image", optimizationInstructions: "图片默认：保留主体与构图" },
  { id: "video-model", name: "Video Model", type: "video", optimizationInstructions: "视频默认：明确动作与镜头" },
  { id: "other-model", name: "Other Model", type: "image", optimizationInstructions: "另一个模型的默认指令" },
  { id: "unsupported-model", name: "Unsupported Model", type: "video" },
];

function fixture(t, overrides = {}) {
  const dom = new JSDOM('<!doctype html><body><div class="prompt-optimization-dialog"></div></body>', { runScripts: "outside-only" });
  const { window } = dom;
  for (const script of scripts) window.eval(script);
  const timers = new Map();
  let sequence = 0, opened = false, viewOptions, viewState;
  const view = {
    isOpen: () => opened,
    open(state) { opened = true; viewState = state; },
    update(state) { viewState = state; },
    close() { opened = false; viewOptions?.onClose(); },
    dispose() { opened = false; },
  };
  const controller = window.REELAY_PROMPT_OPTIMIZATION.createController({
    document: window.document, promptDocument: window.REELAY_CANVAS_PROMPT_DOCUMENT,
    getModels: () => modelCatalog,
    createView(options) { viewOptions = options; return view; },
    setTimer(callback) { timers.set(++sequence, callback); return sequence; },
    clearTimer(id) { timers.delete(id); },
    ...overrides,
  });
  t.after(() => { controller.dispose(); window.close(); });
  function target(initial = "香水瓶置于森林中。", resultPolicy = "draft") {
    const conversation = { id: "node-one" };
    const owner = resultPolicy === "draft" ? controller.getDraftOwner(conversation) : conversation;
    let currentOwner = owner, focusCount = 0;
    const data = { prompt: plain(window.REELAY_CANVAS_PROMPT_DOCUMENT.normalize(initial)),
      references: [], model: { id: "image-model", type: "image", parameters: { ratio: "1:1" } }, scope: "canvas-one" };
    const writes = [];
    return { owner, conversation, data, writes, resultPolicy,
      isCurrent: () => currentOwner === owner && (resultPolicy !== "draft" || controller.getDraftOwner(conversation) === owner),
      read: () => data.prompt,
      references: () => data.references,
      snapshot: () => data,
      write(value) { writes.push(plain(value)); data.prompt = plain(value); return true; },
      focus() { focusCount++; },
      replaceOwner() { currentOwner = { id: owner.id }; },
      get focusCount() { return focusCount; },
    };
  }
  const run = () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach((callback) => callback()); };
  const ready = (input) => { assert.equal(controller.activate(input), true); run(); assert.equal(controller.activate(input), true); };
  const toastAction = () => window.document.querySelector(".prompt-optimization-toast button")?.click();
  return { controller, target, ready, run, timers, window, toastAction,
    get viewOptions() { return viewOptions; }, get viewState() { return viewState; }, get opened() { return opened; } };
}

test("unsupported models cannot start optimization and hide the control before any adapter exists", (t) => {
  const f = fixture(t), input = f.target(), button = f.window.document.createElement("button");
  input.data.model = { id: "unsupported-model", type: "video" };
  f.controller.syncButton(button, input.owner, { model: input.data.model, hasPrompt: true });
  assert.equal(button.hidden, true);
  assert.equal(button.disabled, true);
  assert.equal(f.controller.activate(input), false);
  assert.equal(f.timers.size, 0);
  assert.equal(input.writes.length, 0);
  input.data.model = { id: "video-model", type: "video" };
  f.controller.syncButton(button, input.owner, { model: input.data.model, hasPrompt: true });
  assert.equal(button.hidden, false);
  assert.equal(button.disabled, false);
});

test("switching to an unsupported model closes review and preserves results for returning", (t) => {
  const f = fixture(t), input = f.target();
  f.ready(input);
  const previous = plain(f.controller.get(input.owner));
  input.data.model = { id: "unsupported-model", type: "video" };
  f.controller.syncButton(f.window.document.createElement("button"), input.owner, { model: input.data.model, hasPrompt: true });
  assert.equal(f.opened, false);
  assert.equal(f.controller.activate(input), false);
  assert.deepEqual(plain(f.controller.get(input.owner)), previous);
  input.data.model = { id: "image-model", type: "image" };
  assert.equal(f.controller.activate(input), true);
  assert.equal(f.opened, true);
  assert.equal(f.timers.size, 0);
});

test("a pending result does not notify or reopen after switching to an unsupported model", (t) => {
  const f = fixture(t), input = f.target();
  f.controller.activate(input);
  input.data.model = { id: "unsupported-model", type: "video" };
  f.run();
  assert.equal(f.window.document.querySelector('.prompt-optimization-toast'), null);
  assert.equal(f.controller.open(input.owner), false);
  assert.equal(f.controller.get(input.owner).status, "ready");
  assert.equal(input.writes.length, 0);
});

test("optimization is a suggestion workflow: starting, completing and opening never write the input", (t) => {
  const f = fixture(t), input = f.target();
  const before = structuredClone(input.data);
  assert.equal(f.controller.activate(input), true);
  assert.equal(f.controller.get(input.owner).status, "processing");
  assert.equal(f.opened, false);
  assert.equal(f.controller.activate(input), false);
  f.run();
  assert.equal(f.controller.get(input.owner).status, "ready");
  assert.equal(f.opened, false);
  assert.equal(f.window.document.querySelector(".prompt-optimization-toast button").textContent, "查看");
  f.toastAction();
  assert.equal(f.opened, true);
  assert.equal(f.controller.get(input.owner).unread, false);
  assert.deepEqual(input.data, before);
  assert.equal(input.writes.length, 0);
});

test("a stale result starts optimization of the current input instead of confirming an overwrite", (t) => {
  const f = fixture(t), input = f.target();
  f.ready(input);
  input.data.prompt = doc(text("处理期间补写的新内容"));
  f.controller.refresh();
  assert.equal(f.viewState.stale, true);
  assert.equal(f.controller.apply(), true);
  assert.equal(f.viewState.confirmAction, "");
  assert.equal(f.controller.get(input.owner).status, "processing");
  assert.equal(f.controller.get(input.owner).source.prompt.content[0].text, "香水瓶置于森林中。");
  assert.equal(input.writes.length, 0);
  assert.equal(f.opened, true);
  f.run();
  assert.equal(f.viewState.stale, false);
  assert.equal(f.controller.apply(), true);
  assert.equal(input.writes.length, 1);
  assert.equal(f.opened, false);
});

for (const resultPolicy of ["node", "draft"]) {
  for (const [name, change] of [
    ["prompt", data => { data.prompt = doc(text("新的提示词")); }],
    ["model", data => { data.model.id = "other-model"; }],
    ["parameters", data => { data.model.parameters.ratio = "16:9"; }],
    ["references", data => { data.references = [{ key: "asset:new", asset: { type: "image", url: "/new.png" } }]; }],
  ]) {
    test(`${resultPolicy} changing ${name} reopens its successful pair until explicit regeneration finishes`, t => {
      const f = fixture(t), input = f.target("原文", resultPolicy);
      f.ready(input); f.controller.close();
      const previous = plain(f.controller.get(input.owner));
      change(input.data);
      const button = f.window.document.createElement("button");
      f.controller.syncButton(button, input.owner, { hasPrompt: true });
      assert.equal(button.classList.contains("has-optimization"), true);
      assert.equal(button.getAttribute("aria-label"), "查看提示词优化");
      assert.equal(f.controller.activate(input), true);
      assert.equal(f.opened, true);
      assert.equal(f.timers.size, 0);
      assert.deepEqual(plain(f.controller.get(input.owner).source), previous.source);
      assert.deepEqual(plain(f.controller.get(input.owner).suggestion), previous.suggestion);
      assert.equal(f.viewState.stale, true);
      assert.equal(f.controller.regenerate(), true);
      assert.equal(f.controller.get(input.owner).status, "processing");
      assert.deepEqual(plain(f.controller.get(input.owner).source), previous.source);
      assert.deepEqual(plain(f.controller.get(input.owner).suggestion), previous.suggestion);
      f.run();
      assert.deepEqual(plain(f.controller.get(input.owner).source.prompt), input.data.prompt);
      assert.equal(f.controller.get(input.owner).source.model.id, input.data.model.id);
      assert.deepEqual(plain(f.controller.get(input.owner).source.references), input.data.references);
      assert.equal(input.writes.length, 0);
    });
  }
}

test("node application keeps its previous result readable, including after the input is emptied", t => {
  const f = fixture(t), input = f.target("节点原文", "node");
  f.ready(input);
  const previous = plain(f.controller.get(input.owner));
  assert.equal(f.controller.apply(), true);
  assert.deepEqual(plain(f.controller.get(input.owner).source), previous.source);
  assert.deepEqual(plain(f.controller.get(input.owner).suggestion), previous.suggestion);
  assert.equal(f.opened, false);
  assert.equal(f.controller.activate(input), true);
  assert.equal(f.timers.size, 0);
  f.controller.close(); input.data.prompt = doc(text("填入后重新改写的原文"));
  assert.equal(f.controller.activate(input), true);
  assert.equal(f.timers.size, 0);
  assert.deepEqual(plain(f.controller.get(input.owner).suggestion), previous.suggestion);
  assert.deepEqual(plain(f.controller.get(input.owner).source), previous.source);
  f.controller.close(); input.data.prompt = doc(text(""));
  const button = f.window.document.createElement("button");
  f.controller.syncButton(button, input.owner, { hasPrompt: false });
  assert.equal(button.disabled, false);
  assert.equal(button.classList.contains("has-optimization"), true);
  assert.equal(f.controller.activate(input), true);
  assert.equal(f.opened, true);
  assert.equal(f.viewState.emptyInput, true);
  assert.equal(f.controller.regenerate(), false);
  assert.equal(f.controller.apply(), false);
  assert.equal(input.writes.length, 1);
});

test("another node with the same ID cannot inherit the previous node suggestion", t => {
  const f = fixture(t), first = f.target("第一节点", "node"); f.ready(first); f.controller.close();
  const next = f.target("新节点原文", "node");
  assert.equal(next.owner.id, first.owner.id);
  const button = f.window.document.createElement("button");
  f.controller.syncButton(button, next.owner, { hasPrompt: true });
  assert.equal(button.classList.contains("has-optimization"), false);
  assert.equal(f.controller.activate(next), true);
  assert.equal(f.opened, false);
  assert.equal(f.controller.get(next.owner).status, "processing");
  assert.equal(f.controller.get(next.owner).source.prompt.content[0].text, "新节点原文");
  assert.equal(next.writes.length, 0);
});

test("regenerating a stale result protects unapplied manual edits before using current source", t => {
  const f = fixture(t), input = f.target(); f.ready(input);
  f.viewOptions.onEdit("旧建议的手工修改");
  input.data.prompt = doc(text("新的原始输入"));
  assert.equal(f.controller.regenerate(), false);
  assert.equal(f.viewState.confirmAction, "current");
  assert.equal(f.timers.size, 0);
  assert.equal(f.controller.regenerate(), true);
  assert.equal(f.viewState.confirmAction, "");
  assert.equal(f.controller.get(input.owner).status, "processing");
  assert.equal(f.controller.get(input.owner).source.prompt.content[0].text, "香水瓶置于森林中。");
  f.run();
  assert.deepEqual(plain(f.controller.get(input.owner).source.prompt), input.data.prompt);
  assert.equal(input.writes.length, 0);
});

test("manually edited suggestions require regeneration confirmation and restart from the original", (t) => {
  const f = fixture(t), input = f.target();
  f.ready(input);
  f.viewOptions.onEdit("我手动编辑的建议稿");
  assert.equal(f.controller.get(input.owner).edited, true);
  assert.equal(f.controller.regenerate(), false);
  assert.equal(f.viewState.confirmAction, "regenerate");
  assert.equal(f.timers.size, 0);
  assert.equal(f.controller.regenerate(), true);
  assert.equal(f.controller.get(input.owner).suggestion.content[0].text, "我手动编辑的建议稿");
  f.run();
  assert.equal(f.controller.get(input.owner).source.prompt.content[0].text, "香水瓶置于森林中。");
  assert.equal(f.controller.get(input.owner).edited, false);
  assert.equal(input.writes.length, 0);
});

test("current-input action confirms unapplied edits and invalidates confirmation when input changes", t => {
  const f = fixture(t), input = f.target(); f.ready(input);
  f.viewOptions.onEdit("尚未填入的手改建议");
  input.data.prompt = doc(text("新的输入"));
  assert.equal(f.controller.apply(), false);
  assert.equal(f.viewState.confirmAction, "current");
  f.viewOptions.onCancelConfirm();
  assert.equal(f.viewState.confirmAction, "");
  assert.equal(f.timers.size, 0);
  assert.equal(f.controller.apply(), false);
  input.data.prompt = doc(text("再次更改输入")); f.controller.refresh();
  assert.equal(f.viewState.confirmAction, "");
  assert.equal(f.controller.apply(), false);
  assert.equal(f.controller.apply(), true);
  f.run();
  assert.deepEqual(plain(f.controller.get(input.owner).source.prompt), input.data.prompt);
  assert.equal(input.writes.length, 0);
});

test("an applied manual suggestion needs no discard confirmation after subsequent input edits", t => {
  const f = fixture(t), input = f.target(); f.ready(input);
  f.viewOptions.onEdit("已经填入的手改建议"); f.controller.apply();
  input.data.prompt = doc(text("另一份输入")); f.controller.activate(input);
  assert.equal(f.controller.apply(), true);
  assert.equal(f.viewState.confirmAction, "");
  f.run();
  assert.deepEqual(plain(f.controller.get(input.owner).source.prompt), input.data.prompt);
  assert.equal(input.writes.length, 1);
});

test("previous model attribution appears only for a different model and clears on completion", t => {
  const f = fixture(t), input = f.target(); f.ready(input);
  assert.equal(f.viewState.previousModelName, "");
  input.data.model.parameters.ratio = "16:9"; f.controller.refresh();
  assert.equal(f.viewState.previousModelName, "");
  input.data.model = { id: "video-model", type: "video" }; f.controller.refresh();
  assert.equal(f.viewState.previousModelName, "Image Model");
  f.controller.apply(); f.run();
  assert.equal(f.viewState.previousModelName, "");
});

test("apply replaces only the prompt and undo restores exactly the prior prompt", (t) => {
  const f = fixture(t), input = f.target(doc(text("参考 "), reference));
  input.data.references = [{ key: "asset:one", asset: { id: "one", type: "image", url: "/one.png" } }];
  const before = structuredClone(input.data);
  f.ready(input);
  const suggestion = plain(f.controller.get(input.owner).suggestion);
  assert.equal(f.controller.apply(), true);
  assert.deepEqual(input.data.prompt, suggestion);
  assert.deepEqual({ ...input.data, prompt: before.prompt }, before);
  assert.equal(input.focusCount, 1);
  assert.equal(f.window.document.querySelector(".prompt-optimization-toast button").textContent, "撤销");
  f.toastAction();
  assert.deepEqual(input.data, before);
  assert.equal(input.writes.length, 2);
  assert.equal(input.focusCount, 2);
});

test("undo refuses to overwrite subsequent input edits", (t) => {
  const f = fixture(t), input = f.target();
  f.ready(input);
  f.controller.apply();
  input.data.prompt = doc(text("填入后继续编辑"));
  f.toastAction();
  assert.equal(input.writes.length, 1);
  assert.deepEqual(input.data.prompt, doc(text("填入后继续编辑")));
  assert.match(f.window.document.querySelector(".prompt-optimization-toast").textContent, /未撤销后续编辑/);
});

test("same ID replacement invalidates pending apply and prevents stale owner undo", (t) => {
  const f = fixture(t), input = f.target();
  f.ready(input);
  input.replaceOwner();
  assert.equal(f.controller.apply(), false);
  assert.equal(f.viewState.unavailable, true);
  assert.equal(input.writes.length, 0);
  assert.equal(f.controller.open(input.owner), false);
  const other = f.target("另一个输入");
  f.ready(other);
  assert.equal(f.controller.apply(), true);
  other.replaceOwner();
  f.toastAction();
  assert.equal(other.writes.length, 1);
});

test("removed and mismatched references prevent starting, filling and regeneration", (t) => {
  const f = fixture(t), input = f.target(doc(text("参考 "), reference));
  assert.equal(f.controller.activate(input), false);
  assert.equal(f.timers.size, 0);
  input.data.references = [{ key: "asset:one", asset: { type: "image", url: "/one.png" } }];
  f.ready(input);
  input.data.references[0].asset.type = "video";
  f.controller.refresh();
  assert.equal(f.controller.apply(), false);
  assert.equal(f.controller.regenerate(), false);
  assert.equal(f.viewState.unavailable, true);
  assert.equal(input.writes.length, 0);
  input.data.references = [];
  assert.equal(f.controller.apply(), false);
  assert.equal(f.controller.regenerate(), false);
});

test("saved model configurations affect only later requests and persist without exposing platform instructions", t => {
  const saved = new Map();
  const storage = { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) };
  const f = fixture(t, { storage }), input = f.target(); const before = structuredClone(input.data); f.ready(input);
  const previous = plain(f.controller.get(input.owner));
  assert.equal(f.viewState.configuration.selectedId, "default");
  assert.equal(f.viewState.configuration.customInstructions, "");
  assert.ok(!JSON.stringify(f.viewState).includes(modelCatalog[0].optimizationInstructions));
  const defaultOption = f.viewState.configuration.options.find(option => option.id === "default");
  assert.ok(!defaultOption.customInstructions);
  for (const oldName of ["onSettingsChange", "onSaveConfiguration", "onCopyConfiguration", "onRestoreConfiguration"]) assert.equal(f.viewOptions[oldName], undefined);
  assert.equal(f.viewOptions.onCommitConfiguration({ name: "人物保持", modelId: "image-model", customInstructions: "不添加角色" }), true);
  assert.equal(f.viewState.configuration.modelId, "image-model");
  assert.equal(f.viewState.configuration.customInstructions, "不添加角色");
  assert.deepEqual(plain(f.controller.get(input.owner)), previous);
  assert.equal(f.controller.regenerate(), true); f.run();
  assert.equal(f.controller.get(input.owner).settings.customInstructions, "不添加角色");
  assert.deepEqual(input.data, before); assert.equal(input.writes.length, 0);
  const restored = fixture(t, { storage }), restoredInput = restored.target(); restored.ready(restoredInput);
  assert.equal(restored.viewState.configuration.customInstructions, "不添加角色");
});

test("legacy default drafts migrate to a visible custom configuration and never override platform default", t => {
  const saved = new Map([["reelay:prompt-optimization:preferences:v1", JSON.stringify({ focus: "motion", detail: "detailed", customInstructions: "保持自然语言" })]]);
  const f = fixture(t, { storage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) } });
  const first = f.target(); f.ready(first);
  assert.notEqual(f.viewState.configuration.selectedId, "default");
  assert.equal(f.viewState.configuration.customInstructions, "保持自然语言");
  assert.ok(f.viewState.configuration.options.some(option => option.name === "自定义草稿"));
  f.viewOptions.onSelectConfiguration("default");
  assert.equal(f.viewState.configuration.customInstructions, "");
  f.controller.regenerate(); f.run();
  assert.equal(f.controller.get(first.owner).settings.customInstructions, modelCatalog[0].optimizationInstructions);
  const second = f.target(); second.data.model = { id: "video-model", name: "Video Model", type: "video" }; f.ready(second);
  assert.equal(f.viewState.configuration.selectedId, "default");
  assert.equal(f.viewState.configuration.customInstructions, "");
  assert.equal(f.controller.get(second.owner).settings.customInstructions, modelCatalog[1].optimizationInstructions);
});

test("configuration follows the current model rather than the displayed result and does not split by mode", t => {
  const f = fixture(t), input = f.target(); f.ready(input); const previous = plain(f.controller.get(input.owner));
  input.data.model = { id: "video-model", name: "Video Model", type: "video", parameters: { mode: "edit" } }; f.controller.refresh();
  assert.equal(f.viewState.source.model.id, "image-model");
  assert.equal(f.viewState.configuration.modelId, "video-model");
  assert.equal(f.viewState.configuration.customInstructions, "");
  assert.equal(f.viewOptions.onCommitConfiguration({ name: "视频创作", modelId: "video-model", customInstructions: "当前视频模型的专用指令" }), true);
  input.data.model.parameters.mode = "extend"; f.controller.refresh();
  assert.equal(f.viewState.configuration.customInstructions, "当前视频模型的专用指令");
  assert.deepEqual(plain(f.controller.get(input.owner)), previous);
  assert.equal(f.controller.regenerate(), true); f.run();
  assert.equal(f.controller.get(input.owner).source.model.id, "video-model");
  assert.equal(f.controller.get(input.owner).settings.customInstructions, "当前视频模型的专用指令");
  input.data.model = { id: "image-model", type: "image" }; f.controller.refresh();
  assert.equal(f.viewState.configuration.selectedId, "default");
  assert.equal(f.viewState.configuration.customInstructions, "");
});

test("concurrent owners freeze request settings while another owner commits same-model or other-model changes", t => {
  const f = fixture(t), editor = f.target(); f.ready(editor);
  f.viewOptions.onCommitConfiguration({ name: "图片配置", modelId: "image-model", customInstructions: "发起时的图片指令" });
  const schemeId = f.viewState.configuration.selectedId;
  const running = f.target("正在处理的输入"); f.controller.activate(running);
  assert.equal(f.controller.get(running.owner).status, "processing");
  f.controller.open(editor.owner);
  assert.equal(f.viewOptions.onCommitConfiguration({ id: schemeId, name: "图片配置", modelId: "image-model", customInstructions: "稍后修改的图片指令" }), true);
  editor.data.model = { id: "video-model", type: "video" }; f.controller.refresh();
  f.viewOptions.onCommitConfiguration({ name: "视频配置", modelId: "video-model", customInstructions: "另一模型的指令" }); f.run();
  assert.equal(f.controller.get(running.owner).settings.customInstructions, "发起时的图片指令");
  assert.equal(f.controller.get(running.owner).source.model.id, "image-model");
  assert.equal(running.writes.length, 0);
});

test("configuration saves update one stable ID atomically and creating for another model does not switch either selection", t => {
  const f = fixture(t), image = f.target(), video = f.target(); video.data.model = { id: "video-model", type: "video" };
  f.ready(video); f.viewOptions.onCommitConfiguration({ name: "视频现有", modelId: "video-model", customInstructions: "视频现有规则" });
  const videoSelected = f.viewState.configuration.selectedId;
  f.ready(image); const previous = plain(f.controller.get(image.owner));
  assert.equal(f.viewOptions.onCommitConfiguration({ name: "图片方案", modelId: "image-model", customInstructions: "图片规则" }), true);
  const id = f.viewState.configuration.selectedId, count = f.viewState.configuration.options.length;
  assert.equal(f.viewOptions.onCommitConfiguration({ id, name: "重命名图片方案", modelId: "image-model", customInstructions: "新的图片规则" }), true);
  assert.equal(f.viewState.configuration.selectedId, id);
  assert.equal(f.viewState.configuration.options.length, count);
  assert.equal(f.viewState.configuration.customInstructions, "新的图片规则");
  const beforeInvalid = plain(f.viewState.configuration);
  assert.equal(f.viewOptions.onCommitConfiguration({ id, name: "", modelId: "image-model", customInstructions: "不能部分写入" }), false);
  assert.deepEqual(plain(f.viewState.configuration), beforeInvalid);
  assert.equal(f.viewOptions.onCommitConfiguration({ id, name: "不能换模型", modelId: "video-model", customInstructions: "不能部分写入" }), false);
  assert.deepEqual(plain(f.viewState.configuration), beforeInvalid);
  assert.equal(f.viewOptions.onCommitConfiguration({ name: "新增视频方案", modelId: "video-model", customInstructions: "新增视频规则" }), true);
  assert.equal(f.viewState.configuration.modelId, "image-model");
  assert.equal(f.viewState.configuration.selectedId, id);
  assert.deepEqual(plain(f.controller.get(image.owner)), previous);
  f.controller.open(video.owner);
  assert.equal(f.viewState.configuration.selectedId, videoSelected);
  assert.equal(f.viewState.configuration.customInstructions, "视频现有规则");
  const created = f.viewState.configuration.options.find(option => option.name === "新增视频方案"); assert.ok(created);
  f.viewOptions.onSelectConfiguration(created.id);
  assert.equal(f.viewState.configuration.customInstructions, "新增视频规则");
  f.viewOptions.onSelectConfiguration("default");
  assert.equal(f.viewState.configuration.customInstructions, "");
  assert.ok(f.viewState.configuration.options.some(option => option.id === videoSelected));
  assert.equal(image.writes.length, 0); assert.equal(video.writes.length, 0);
});

for (const policy of ["node", "draft"]) {
  test(`${policy} retains an applied result without recursive optimization and enables fill after suggestion edits`, t => {
    const f = fixture(t), input = f.target("原始创作内容", policy); f.ready(input);
    const source = plain(f.controller.get(input.owner).source);
    assert.equal(f.controller.apply(), true);
    assert.equal(f.controller.activate(input), true);
    assert.equal(f.viewState.applied, true);
    assert.equal(f.viewState.stale, false);
    assert.equal(f.controller.apply(), false);
    assert.equal(input.writes.length, 1);
    f.viewOptions.onEdit("用户微调后的建议");
    assert.equal(f.viewState.applied, false);
    assert.equal(f.viewState.stale, false);
    assert.equal(f.controller.apply(), true);
    assert.equal(input.writes.length, 2);
    f.controller.activate(input);
    assert.equal(f.viewState.applied, true);
    assert.equal(f.controller.regenerate(), true);
    f.run();
    assert.deepEqual(plain(f.controller.get(input.owner).source), source, "regeneration after applying starts from the original, not the applied output");
  });
}

test("draft ownership is stable within a round and rotates only when the caller accepts a send", t => {
  const f = fixture(t), input = f.target();
  assert.equal(f.controller.getDraftOwner(input.conversation), input.owner);
  f.ready(input); f.controller.close();
  assert.equal(f.controller.getDraftOwner(input.conversation), input.owner, "closing or editing cannot create a new round");
  f.controller.advanceDraft(input.conversation);
  const nextOwner = f.controller.getDraftOwner(input.conversation);
  assert.notEqual(nextOwner, input.owner);
  assert.equal(f.controller.get(nextOwner), null);
  assert.equal(f.controller.open(input.owner), false);
  const independent = { id: input.conversation.id };
  assert.notEqual(f.controller.getDraftOwner(independent), nextOwner);
});

test("late optimization completion and undo cannot enter the next draft round", t => {
  const f = fixture(t), input = f.target();
  f.controller.activate(input);
  const callback = [...f.timers.values()][0];
  f.controller.advanceDraft(input.conversation);
  callback();
  assert.equal(input.writes.length, 0);
  assert.equal(f.controller.open(input.owner), false);
  assert.equal(f.window.document.querySelector(".prompt-optimization-toast"), null);
  const next = f.target("用于撤销的输入"); f.ready(next); f.controller.apply();
  const before = plain(next.data.prompt);
  f.controller.advanceDraft(next.conversation);
  f.toastAction();
  assert.deepEqual(next.data.prompt, before);
  assert.equal(next.writes.length, 1);
});

test("undoing a second fill restores the first applied snapshot without making the comparison stale", t => {
  const f = fixture(t), input = f.target(); f.ready(input);
  f.controller.apply(); const firstApplied = plain(input.data.prompt);
  f.controller.activate(input); f.viewOptions.onEdit("二次修改的优化稿"); f.controller.apply();
  f.toastAction();
  assert.deepEqual(input.data.prompt, firstApplied);
  f.controller.activate(input);
  assert.equal(f.viewState.stale, false);
  assert.equal(f.viewState.applied, false, "the edited second suggestion can be filled again");
});

test("changing scope cannot expose a successful pair from the previous scope", t => {
  const f = fixture(t), input = f.target(); f.ready(input); f.controller.close();
  input.data.scope = "another-project";
  const button = f.window.document.createElement("button");
  f.controller.syncButton(button, input.owner, { hasPrompt: true });
  assert.equal(button.classList.contains("has-optimization"), false);
  assert.equal(f.controller.activate(input), true);
  assert.equal(f.opened, false);
  assert.equal(f.controller.get(input.owner).status, "processing");
  assert.equal(f.controller.get(input.owner).source.scope, "another-project");
  assert.equal(f.controller.get(input.owner).suggestion, null);
});
