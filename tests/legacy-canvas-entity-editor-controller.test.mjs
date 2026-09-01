import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const [modelSource, viewSource, controllerSource] = await Promise.all([
  readFile(new URL("../src/legacy-canvas/canvas-entity-editor-model.js", import.meta.url), "utf8"),
  readFile(new URL("../src/legacy-canvas/canvas-entity-editor-view.js", import.meta.url), "utf8"),
  readFile(new URL("../src/legacy-canvas/canvas-entity-editor-controller.js", import.meta.url), "utf8"),
]);

const media = [
  { id: "portrait", mediaKind: "image", displayName: "角色正面.png", url: "https://cdn.example/portrait.png" },
  { id: "turnaround", mediaKind: "video", displayName: "角色转身.mp4", url: "https://cdn.example/turnaround.mp4" },
  { id: "voice", mediaKind: "audio", displayName: "角色声音.mp3", url: "https://cdn.example/voice.mp3" },
  { id: "detail", mediaKind: "image", displayName: "服装细节.png", url: "https://cdn.example/detail.png" },
];

const editEntity = {
  id: "entity-lirael",
  name: "Lirael",
  description: "精灵感角色",
  mediaRefs: [
    { mediaId: "portrait", order: 0 },
    { mediaId: "turnaround", order: 1 },
    { mediaId: "voice", order: 2 },
  ],
  coverMediaId: "portrait",
  version: 4,
};

function createHarness(overrides = {}) {
  const dom = new JSDOM(`
    <!doctype html>
    <html>
      <body>
        <div id="editor" hidden inert aria-hidden="true"></div>
        <div id="picker" hidden inert aria-hidden="true"></div>
        <input id="upload" type="file" multiple>
      </body>
    </html>
  `, { runScripts: "outside-only", url: "https://reelay.test/index.html" });
  const { window } = dom;
  window.eval(modelSource);
  window.eval(viewSource);
  window.eval(controllerSource);

  const host = window.document.querySelector("#editor");
  const pickerHost = window.document.querySelector("#picker");
  const uploadInput = window.document.querySelector("#upload");
  const calls = {
    confirms: 0,
    errors: [],
    persistedFiles: [],
    saved: [],
    savePayloads: [],
    visibility: [],
  };
  let confirmResult = overrides.confirmResult ?? true;
  const getAvailableMedia = overrides.getAvailableMedia || (() => media);
  const persistFiles = overrides.persistFiles || (async (files) => {
    calls.persistedFiles.push(files);
    return [];
  });
  const saveEntity = overrides.saveEntity || (async (payload) => {
    calls.savePayloads.push(payload);
    return { id: payload.entityId || "entity-created", ...payload, version: 1 };
  });
  const controller = window.REELAY_CANVAS_ENTITY_EDITOR_CONTROLLER.createCanvasEntityEditorController({
    host,
    pickerHost,
    uploadInput,
    model: window.REELAY_CANVAS_ENTITY_EDITOR_MODEL,
    view: window.REELAY_CANVAS_ENTITY_EDITOR_VIEW,
    getAvailableMedia,
    persistFiles,
    saveEntity,
    confirmDiscard: async () => {
      calls.confirms += 1;
      return confirmResult;
    },
    onVisibilityChange: (visible) => calls.visibility.push(visible),
    onSaved: (entity) => calls.saved.push(entity),
    onError: (error) => calls.errors.push(error),
    refreshIcons: () => undefined,
  });

  function input(selector, value, root = host) {
    const element = root.querySelector(selector);
    assert.ok(element, `Expected ${selector} to be rendered.`);
    element.value = value;
    element.dispatchEvent(new window.Event("input", { bubbles: true }));
    return element;
  }

  function click(selector, root = host) {
    const element = root.querySelector(selector);
    assert.ok(element, `Expected ${selector} to be rendered.`);
    element.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    return element;
  }

  function visibleMediaIds(root = host) {
    return [...root.querySelectorAll("[data-entity-editor-media]")]
      .map((element) => element.dataset.entityEditorMedia);
  }

  return {
    calls,
    click,
    controller,
    dom,
    host,
    input,
    pickerHost,
    setConfirmResult(value) {
      confirmResult = value;
    },
    uploadInput,
    visibleMediaIds,
    window,
  };
}

async function flushAsync() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test("create keeps 新建主体 while edit follows the current Entity name", () => {
  const create = createHarness();
  create.controller.open({ mode: "create", media });
  assert.equal(create.host.querySelector("#canvasEntityEditorTitle")?.textContent, "新建主体");
  create.input("[data-entity-editor-name]", "输入中的主体名");
  assert.equal(create.host.querySelector("#canvasEntityEditorTitle")?.textContent, "新建主体");
  create.controller.destroy();

  const edit = createHarness();
  edit.controller.open({ mode: "edit", entity: editEntity, media });
  assert.equal(edit.host.querySelector("#canvasEntityEditorTitle")?.textContent, "Lirael");
  edit.input("[data-entity-editor-name]", "Lirael II");
  assert.equal(edit.host.querySelector("#canvasEntityEditorTitle")?.textContent, "Lirael II");
  edit.controller.destroy();
});

test("all four filters apply only to Media already referenced by the Entity", () => {
  const harness = createHarness();
  harness.controller.open({ mode: "edit", entity: editEntity, media });

  assert.deepEqual(harness.visibleMediaIds(), ["portrait", "turnaround", "voice"]);
  const expectations = new Map([
    ["image", ["portrait"]],
    ["video", ["turnaround"]],
    ["audio", ["voice"]],
    ["all", ["portrait", "turnaround", "voice"]],
  ]);
  for (const [filter, expected] of expectations) {
    harness.click(`[data-entity-editor-filter="${filter}"]`);
    assert.deepEqual(harness.visibleMediaIds(), expected);
    assert.equal(harness.visibleMediaIds().includes("detail"), false);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(harness.controller.getDraftState().counts)), {
    all: 3,
    image: 1,
    video: 1,
    audio: 1,
  });
  harness.controller.destroy();
});

test("filter tabs support roving keyboard navigation in the editor and picker", async () => {
  const harness = createHarness();
  harness.controller.open({ mode: "edit", entity: editEntity, media });
  const all = harness.host.querySelector('[data-entity-editor-filter="all"]');
  all.focus();
  all.dispatchEvent(new harness.window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
  await flushAsync();

  assert.equal(harness.controller.getDraftState().filter, "image");
  assert.deepEqual(harness.visibleMediaIds(), ["portrait"]);
  assert.equal(harness.window.document.activeElement?.dataset.entityEditorFilter, "image");

  harness.click("[data-entity-editor-add-from-library]");
  const pickerAll = harness.pickerHost.querySelector('[data-entity-picker-filter="all"]');
  pickerAll.focus();
  pickerAll.dispatchEvent(new harness.window.KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true }));
  await flushAsync();

  assert.equal(harness.pickerHost.querySelector("[data-entity-picker]")?.dataset.entityPickerFilterActive, "audio");
  assert.equal(harness.window.document.activeElement?.dataset.entityPickerFilter, "audio");
  harness.controller.destroy();
});

test("picker adds selected personal Media and excludes them when reopened", () => {
  const harness = createHarness();
  harness.controller.open({ mode: "create", media });
  harness.input("[data-entity-editor-name]", "新主体");

  harness.click("[data-entity-editor-add-from-library]");
  assert.equal(harness.pickerHost.hidden, false);
  assert.deepEqual(
    [...harness.pickerHost.querySelectorAll("[data-entity-picker-media]")].map((element) => element.dataset.entityPickerMedia),
    ["portrait", "turnaround", "voice", "detail"],
  );
  harness.click('[data-entity-picker-toggle="portrait"]', harness.pickerHost);
  harness.click('[data-entity-picker-toggle="voice"]', harness.pickerHost);
  harness.click("[data-entity-picker-confirm]", harness.pickerHost);

  assert.equal(harness.pickerHost.hidden, true);
  assert.deepEqual(
    JSON.parse(JSON.stringify(harness.controller.getDraftState().mediaRefs)),
    [{ mediaId: "portrait", order: 0 }, { mediaId: "voice", order: 1 }],
  );
  assert.deepEqual(harness.visibleMediaIds(), ["portrait", "voice"]);

  harness.click("[data-entity-editor-add-from-library]");
  assert.equal(harness.pickerHost.querySelector('[data-entity-picker-media="portrait"]'), null);
  assert.equal(harness.pickerHost.querySelector('[data-entity-picker-media="voice"]'), null);
  assert.ok(harness.pickerHost.querySelector('[data-entity-picker-media="turnaround"]'));
  harness.controller.destroy();
});

test("upload persists selected files and appends returned Media to the current draft", async () => {
  let resolveUpload;
  const receivedFiles = [];
  const upload = new Promise((resolve) => {
    resolveUpload = resolve;
  });
  const harness = createHarness({
    persistFiles: (files) => {
      receivedFiles.push(files);
      return upload;
    },
  });
  harness.controller.open({ mode: "create", media });
  harness.input("[data-entity-editor-name]", "上传主体");
  const file = new harness.window.File(["image"], "uploaded.png", { type: "image/png" });
  Object.defineProperty(harness.uploadInput, "files", { configurable: true, value: [file] });
  harness.uploadInput.dispatchEvent(new harness.window.Event("change", { bubbles: true }));

  assert.equal(receivedFiles.length, 1);
  assert.equal(receivedFiles[0][0].name, "uploaded.png");
  assert.equal(harness.host.querySelector("[data-entity-editor-name]")?.disabled, true);
  assert.match(harness.host.querySelector("[data-entity-editor-submit]")?.textContent || "", /正在上传/);
  assert.equal(harness.host.querySelector("[data-entity-editor-submit]")?.disabled, true);
  resolveUpload([{
    id: "uploaded",
    mediaKind: "image",
    displayName: "uploaded.png",
    url: "https://cdn.example/uploaded.png",
  }]);
  await flushAsync();

  assert.deepEqual(
    JSON.parse(JSON.stringify(harness.controller.getDraftState().mediaRefs)),
    [{ mediaId: "uploaded", order: 0 }],
  );
  assert.ok(harness.host.querySelector('[data-entity-editor-media="uploaded"]'));
  assert.equal(harness.host.querySelector("[data-entity-editor-submit]")?.disabled, false);
  harness.controller.destroy();
});

test("per-open capabilities prevent unavailable edit, picker, upload, and submit actions", async () => {
  const harness = createHarness();
  let uploadClicks = 0;
  harness.uploadInput.addEventListener("click", () => {
    uploadClicks += 1;
  });
  harness.controller.open({
    mode: "edit",
    entity: editEntity,
    media,
    mutable: false,
    canAddFromLibrary: false,
    canUpload: false,
  });

  assert.equal(harness.host.querySelector("[data-entity-editor-name]")?.disabled, true);
  assert.equal(harness.host.querySelector("[data-entity-editor-add-from-library]")?.disabled, true);
  assert.equal(harness.host.querySelector("[data-entity-editor-upload]")?.disabled, true);
  harness.input("[data-entity-editor-name]", "不应写入");
  harness.click("[data-entity-editor-add-from-library]");
  harness.click("[data-entity-editor-upload]");
  await harness.controller.submit();

  assert.equal(harness.controller.getDraftState().name, "Lirael");
  assert.equal(harness.pickerHost.hidden, true);
  assert.equal(uploadClicks, 0);
  assert.equal(harness.calls.savePayloads.length, 0);
  harness.controller.destroy();
});

test("dirty cancel asks for confirmation and keeps the draft when discard is refused", async () => {
  const harness = createHarness({ confirmResult: false });
  harness.controller.open({ mode: "edit", entity: editEntity, media });
  harness.input("[data-entity-editor-description]", "尚未保存的描述");
  assert.equal(harness.controller.getDraftState().dirty, true);

  assert.equal(await harness.controller.requestClose(), false);
  assert.equal(harness.calls.confirms, 1);
  assert.equal(harness.controller.isOpen(), true);
  assert.equal(harness.host.hidden, false);
  assert.equal(harness.controller.getDraftState().description, "尚未保存的描述");

  harness.setConfirmResult(true);
  assert.equal(await harness.controller.requestClose(), true);
  assert.equal(harness.calls.confirms, 2);
  assert.equal(harness.controller.isOpen(), false);
  assert.equal(harness.host.hidden, true);
  harness.controller.destroy();
});

test("submit sends one complete create payload, reports the saved Entity, and closes", async () => {
  const harness = createHarness();
  harness.controller.open({ mode: "create", media });
  harness.input("[data-entity-editor-name]", "  Lirael  ");
  harness.input("[data-entity-editor-description]", "主体描述");
  harness.click("[data-entity-editor-add-from-library]");
  harness.click('[data-entity-picker-toggle="portrait"]', harness.pickerHost);
  harness.click('[data-entity-picker-toggle="voice"]', harness.pickerHost);
  harness.click("[data-entity-picker-confirm]", harness.pickerHost);
  harness.click('[data-entity-editor-set-cover="portrait"]');

  await harness.controller.submit();
  assert.deepEqual(JSON.parse(JSON.stringify(harness.calls.savePayloads)), [{
    mode: "create",
    entityId: null,
    name: "Lirael",
    description: "主体描述",
    mediaRefs: [{ mediaId: "portrait", order: 0 }, { mediaId: "voice", order: 1 }],
    coverMediaId: "portrait",
    expectedVersion: null,
  }]);
  assert.equal(harness.calls.saved.length, 1);
  assert.equal(harness.calls.saved[0].id, "entity-created");
  assert.equal(harness.controller.isOpen(), false);
  assert.equal(harness.host.hidden, true);
  harness.controller.destroy();
});

test("an in-flight save locks the draft so later UI events cannot be silently lost", async () => {
  let resolveSave;
  const savedPayloads = [];
  const harness = createHarness({
    saveEntity: (payload) => {
      savedPayloads.push(payload);
      return new Promise((resolve) => {
        resolveSave = resolve;
      });
    },
  });
  harness.controller.open({ mode: "edit", entity: editEntity, media });
  const saving = harness.controller.submit();

  assert.equal(harness.host.querySelector("[data-entity-editor]")?.dataset.entityEditorBusy, "true");
  assert.equal(harness.host.querySelector("[data-entity-editor-name]")?.disabled, true);
  assert.equal(harness.host.querySelector("[data-entity-editor-cancel]")?.disabled, true);
  assert.equal(harness.host.querySelector("[data-entity-editor-media-remove]"), null);
  harness.input("[data-entity-editor-name]", "保存中改名");
  assert.equal(harness.controller.getDraftState().name, "Lirael");
  assert.deepEqual(
    JSON.parse(JSON.stringify(harness.controller.getDraftState().mediaRefs)),
    editEntity.mediaRefs,
  );

  resolveSave({ id: "entity-lirael", ...savedPayloads[0], version: 5 });
  await saving;
  assert.equal(harness.controller.isOpen(), false);
  harness.controller.destroy();
});

test("validation errors are removed from DOM when the corresponding draft data is corrected", async () => {
  const harness = createHarness();
  harness.controller.open({ mode: "create", media });
  await harness.controller.submit();

  assert.ok(harness.host.querySelector("#canvasEntityEditorNameError"));
  assert.ok(harness.host.querySelector("#canvasEntityEditorMediaError"));
  harness.input("[data-entity-editor-name]", "已修正名称");
  assert.equal(harness.host.querySelector("#canvasEntityEditorNameError"), null);
  assert.equal(harness.host.querySelector("[data-entity-editor-name]")?.hasAttribute("aria-invalid"), false);
  assert.ok(harness.host.querySelector("#canvasEntityEditorMediaError"));

  harness.click("[data-entity-editor-add-from-library]");
  harness.click('[data-entity-picker-toggle="portrait"]', harness.pickerHost);
  harness.click("[data-entity-picker-confirm]", harness.pickerHost);
  assert.equal(harness.host.querySelector("#canvasEntityEditorMediaError"), null);
  harness.controller.destroy();
});

test("edit submit preserves Entity identity and optimistic version", async () => {
  const harness = createHarness();
  harness.controller.open({ mode: "edit", entity: editEntity, media });
  harness.input("[data-entity-editor-name]", "Lirael II");
  await harness.controller.submit();

  assert.equal(harness.calls.savePayloads.length, 1);
  assert.equal(harness.calls.savePayloads[0].mode, "edit");
  assert.equal(harness.calls.savePayloads[0].entityId, "entity-lirael");
  assert.equal(harness.calls.savePayloads[0].expectedVersion, 4);
  assert.equal(harness.calls.savePayloads[0].name, "Lirael II");
  harness.controller.destroy();
});

test("save failure reports the error without closing or discarding the dirty draft", async () => {
  const failure = new Error("版本冲突");
  const harness = createHarness({
    saveEntity: async () => {
      throw failure;
    },
  });
  harness.controller.open({ mode: "edit", entity: editEntity, media });
  harness.input("[data-entity-editor-description]", "待重试描述");
  await harness.controller.submit();

  assert.equal(harness.calls.errors.length, 1);
  assert.equal(harness.calls.errors[0], failure);
  assert.equal(harness.controller.isOpen(), true);
  assert.equal(harness.host.hidden, false);
  assert.equal(harness.controller.getDraftState().dirty, true);
  assert.equal(harness.controller.getDraftState().description, "待重试描述");
  assert.equal(harness.host.querySelector("[data-entity-editor-submit]")?.disabled, false);
  harness.controller.destroy();
});
