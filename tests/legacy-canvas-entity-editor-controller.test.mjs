import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const [modelSource, viewSource, controllerSource, mediaPreviewSource] = await Promise.all([
  readFile(new URL("../src/legacy-canvas/canvas-entity-editor-model.js", import.meta.url), "utf8"),
  readFile(new URL("../src/legacy-canvas/canvas-entity-editor-view.js", import.meta.url), "utf8"),
  readFile(new URL("../src/legacy-canvas/canvas-entity-editor-controller.js", import.meta.url), "utf8"),
  readFile(new URL("../src/legacy-canvas/canvas-media-preview.js", import.meta.url), "utf8"),
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
  window.eval(mediaPreviewSource);
  window.eval(viewSource);
  window.eval(controllerSource);

  const host = window.document.querySelector("#editor");
  const pickerHost = window.document.querySelector("#picker");
  const uploadInput = window.document.querySelector("#upload");
  const calls = {
    confirms: 0,
    errors: [],
    persistedFiles: [],
    renamedMedia: [],
    saved: [],
    savePayloads: [],
    visibility: [],
    exitStarts: 0,
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
  const renameMedia = overrides.renameMedia || (async ({ mediaId, displayName: nextName }) => {
    calls.renamedMedia.push({ mediaId, displayName: nextName });
    return { id: mediaId, displayName: nextName };
  });
  const controller = window.REELAY_CANVAS_ENTITY_EDITOR_CONTROLLER.createCanvasEntityEditorController({
    host,
    pickerHost,
    uploadInput,
    model: window.REELAY_CANVAS_ENTITY_EDITOR_MODEL,
    view: window.REELAY_CANVAS_ENTITY_EDITOR_VIEW,
    getAvailableMedia,
    persistFiles,
    renameMedia,
    saveEntity,
    getMediaSaveNotice: overrides.getMediaSaveNotice,
    confirmDiscard: async () => {
      calls.confirms += 1;
      return overrides.confirmDiscard ? overrides.confirmDiscard() : confirmResult;
    },
    onExitStart: () => { calls.exitStarts += 1; },
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

test("save receives live scope guard and stable keys for unchanged create retries", async () => {
  const attempts = [];
  let valid = true;
  const h = createHarness({ saveEntity: async (payload, context) => {
    attempts.push({ payload, context });
    throw new Error("暂时无法保存");
  }, getMediaSaveNotice: (items) => `${items.length} 个素材将在确认时入库` });
  h.controller.open({ mode: "create", initialMedia: [media[0], media[1]], isContextValid: () => valid });
  assert.match(h.host.textContent, /2 个素材将在确认时入库/);
  h.click('[data-entity-editor-media-remove="turnaround"]');
  assert.match(h.host.textContent, /1 个素材将在确认时入库/);
  h.input('[data-entity-editor-name]', "角色");
  await h.controller.submit();
  await h.controller.submit();
  assert.equal(attempts[0].context.idempotencyKey, attempts[1].context.idempotencyKey);
  assert.equal(attempts[0].context.isContextValid(), true);
  h.input('[data-entity-editor-name]', "另一个角色");
  await h.controller.submit();
  assert.notEqual(attempts[2].context.idempotencyKey, attempts[0].context.idempotencyKey);
  valid = false;
  assert.equal(attempts[2].context.isContextValid(), false);
  valid = true;
  h.controller.open({ mode: "create", initialMedia: [media[0]] });
  assert.equal(attempts[2].context.isContextValid(), false, "replacement drafts invalidate the captured save scope");
  h.controller.destroy();
});

test("selection prefill is a clean draft with ordered media, image cover, notice and cancel focus", async () => {
  const h = createHarness();
  let restored = 0;
  const initialMedia = [media[2], media[0], media[1]];
  h.controller.open({ mode: "create", initialMedia, sourceNotice: "已带入 3 个素材；已跳过 1 个节点",
    returnFocus: () => { restored += 1; } });
  const draft = h.controller.getDraftState();
  assert.equal(draft.dirty, false);
  assert.equal(draft.name, "");
  assert.equal(draft.coverMediaId, "portrait");
  assert.equal(draft.selectedPreviewId, "portrait");
  assert.deepEqual(Array.from(draft.mediaRefs, ({ mediaId }) => mediaId), ["voice", "portrait", "turnaround"]);
  assert.match(h.host.querySelector('[role="status"]').textContent, /已跳过 1 个节点/);
  assert.equal(await h.controller.requestClose(), true);
  assert.equal(h.calls.confirms, 0);
  assert.equal(h.calls.savePayloads.length, 0);
  assert.equal(restored, 1);
  h.controller.destroy();
});

test("selection draft saves only after naming and preserves edits after a failed save", async () => {
  let fail = true;
  const payloads = [];
  const h = createHarness({ saveEntity: async (payload) => {
    payloads.push(payload);
    if (fail) throw new Error("保存失败，请重试");
    return { id: "new-subject", ...payload, version: 1 };
  } });
  h.controller.open({ mode: "create", initialMedia: [media[0], media[1]] });
  await h.controller.submit();
  assert.equal(payloads.length, 0);
  h.input('[data-entity-editor-name]', "角色参考");
  await h.controller.submit();
  assert.equal(h.controller.isOpen(), true);
  assert.equal(h.controller.getDraftState().name, "角色参考");
  assert.equal(h.calls.saved.length, 0);
  fail = false;
  await h.controller.submit();
  assert.equal(h.controller.isOpen(), false);
  assert.deepEqual(Array.from(payloads[1].mediaRefs, ({ mediaId }) => mediaId), ["portrait", "turnaround"]);
  assert.equal(h.calls.saved.length, 1);
  h.controller.destroy();
});

test("selection context is checked before save and before presenting its async result", async () => {
  let valid = true;
  let resolveSave;
  let saves = 0;
  const h = createHarness({ saveEntity: () => { saves += 1; return new Promise((resolve) => { resolveSave = resolve; }); } });
  h.controller.open({ mode: "create", initialMedia: [media[0]], isContextValid: () => valid });
  h.input('[data-entity-editor-name]', "角色");
  valid = false;
  await h.controller.submit();
  assert.equal(saves, 0);
  assert.match(h.calls.errors[0].message, /画布或权限已变化/);
  valid = true;
  const pending = h.controller.submit();
  valid = false;
  resolveSave({ id: "saved-in-original-scope", version: 1 });
  await pending;
  assert.equal(h.calls.saved.length, 0);
  assert.equal(h.controller.isOpen(), false);
  h.controller.destroy();
});

function mockExitAnimations(harness) {
  const animations = [];
  harness.window.Element.prototype.animate = function (frames, timing) {
    let finish;
    let reject;
    const finished = new Promise((resolve, rejectPromise) => { finish = resolve; reject = rejectPromise; });
    const animation = {
      target: this, frames, timing, finished, finish, cancelled: false,
      cancel() { this.cancelled = true; reject(new Error("Animation cancelled")); },
    };
    animations.push(animation);
    return animation;
  };
  return animations;
}

test("closing keeps the real panels visible and inert until every exit animation settles", async () => {
  const harness = createHarness();
  const animations = mockExitAnimations(harness);
  harness.controller.open({ mode: "edit", entity: editEntity, media });
  const panel = harness.host.querySelector("[data-entity-editor]");
  const closing = harness.controller.requestClose();
  assert.equal(harness.calls.exitStarts, 1);
  assert.equal(harness.controller.isOpen(), true);
  assert.equal(harness.host.hidden, false);
  assert.equal(harness.host.hasAttribute("inert"), true);
  assert.equal(harness.host.querySelector("[data-entity-editor]"), panel);
  assert.equal(await harness.controller.requestClose(), false);
  harness.input("[data-entity-editor-name]", "退场中不应写入");
  await harness.controller.submit();
  assert.equal(harness.controller.getDraftState().name, editEntity.name);
  assert.equal(harness.calls.savePayloads.length, 0);
  assert.equal(animations.length, 3);
  animations[2].finish();
  await flushAsync();
  assert.equal(harness.controller.isOpen(), true);
  animations[0].finish();
  animations[1].finish();
  assert.equal(await closing, true);
  assert.equal(harness.host.hidden, true);
  assert.equal(harness.host.innerHTML, "");
  assert.deepEqual(harness.calls.visibility, [true, false]);
  harness.controller.destroy();
});

test("reopening or destroying cancels exit animations and retires their completion", async () => {
  for (const action of ["reopen", "destroy"]) {
    const harness = createHarness();
    const animations = mockExitAnimations(harness);
    harness.controller.open({ mode: "edit", entity: editEntity, media });
    const closing = harness.controller.requestClose();
    if (action === "reopen") harness.controller.open({ mode: "create", media });
    else harness.controller.destroy();
    assert.equal(await closing, false);
    assert.equal(animations.every((animation) => animation.cancelled), true);
    assert.equal(harness.controller.isOpen(), action === "reopen");
    if (action === "reopen") {
      assert.equal(harness.controller.getDraftState().name, "");
      assert.equal(harness.host.hasAttribute("inert"), false);
      harness.controller.destroy();
    }
  }
});

test("a stale discard confirmation cannot animate or close a replacement draft", async () => {
  let confirm;
  const harness = createHarness({ confirmDiscard: () => new Promise((resolve) => { confirm = resolve; }) });
  mockExitAnimations(harness);
  harness.controller.open({ mode: "edit", entity: editEntity, media });
  harness.input("[data-entity-editor-description]", "修改描述");
  const closing = harness.controller.requestClose();
  assert.equal(await harness.controller.requestClose(), false);
  assert.equal(harness.calls.confirms, 1);
  assert.equal(harness.calls.exitStarts, 0);
  harness.controller.open({ mode: "create", media });
  confirm(true);
  assert.equal(await closing, false);
  assert.equal(harness.controller.isOpen(), true);
  assert.equal(harness.calls.exitStarts, 0);
  harness.controller.destroy();
});

test("reduced motion restores the destination immediately without waiting for animation", async () => {
  const harness = createHarness();
  const animations = mockExitAnimations(harness);
  harness.window.matchMedia = () => ({ matches: true });
  harness.controller.open({ mode: "edit", entity: editEntity, media });
  assert.equal(await harness.controller.requestClose(), true);
  assert.equal(harness.calls.exitStarts, 1);
  assert.equal(animations.length, 0);
  assert.equal(harness.host.hidden, true);
  harness.controller.destroy();
});

test("a completed save cannot start an exit on a replacement editor", async () => {
  let save;
  const harness = createHarness({ saveEntity: () => new Promise((resolve) => { save = resolve; }) });
  mockExitAnimations(harness);
  harness.controller.open({ mode: "edit", entity: editEntity, media });
  const saving = harness.controller.submit();
  assert.equal(await harness.controller.requestClose(), false);
  harness.controller.open({ mode: "create", media });
  save(editEntity);
  await saving;
  assert.equal(harness.controller.isOpen(), true);
  assert.equal(harness.calls.saved.length, 0);
  assert.equal(harness.calls.exitStarts, 0);
  harness.controller.destroy();
});

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

test("opening an Entity editor focuses its close control without selecting the name", async () => {
  for (const mode of ["create", "edit"]) {
    const harness = createHarness();
    harness.controller.open({ mode, entity: editEntity, media });
    await flushAsync();

    const name = harness.host.querySelector("[data-entity-editor-name]");
    const close = harness.host.querySelector(".entity-editor-header [data-entity-editor-cancel]");
    assert.equal(harness.window.document.activeElement, close);
    assert.equal(name.selectionStart, name.selectionEnd);
    assert.equal(harness.controller.getDraftState().dirty, false);

    name.focus();
    assert.equal(harness.window.document.activeElement, name);
    assert.equal(name.selectionStart, name.selectionEnd);
    harness.controller.destroy();
  }
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

test("double-click renames only the file stem and preserves the extension", async () => {
  const harness = createHarness();
  harness.controller.open({ mode: "edit", entity: editEntity, media });
  const fileName = harness.host.querySelector('[data-entity-editor-preview-name="portrait"]');
  fileName.dispatchEvent(new harness.window.MouseEvent("dblclick", { bubbles: true, cancelable: true }));

  const input = harness.host.querySelector('[data-entity-editor-preview-rename="portrait"]');
  assert.ok(input);
  assert.equal(input.value, "角色正面");
  assert.equal(input.nextElementSibling?.textContent, ".png");
  input.value = "角色定妆";
  input.dispatchEvent(new harness.window.Event("input", { bubbles: true }));
  input.dispatchEvent(new harness.window.FocusEvent("focusout", { bubbles: true }));
  await flushAsync();

  assert.deepEqual(harness.calls.renamedMedia, [
    { mediaId: "portrait", displayName: "角色定妆.png" },
  ]);
  assert.equal(
    harness.host.querySelector('[data-entity-editor-preview-name="portrait"]')?.textContent,
    "角色定妆.png",
  );
  assert.equal(harness.controller.getDraftState().dirty, false);
  harness.controller.destroy();
});

test("Escape cancels file rename without calling persistence", async () => {
  const harness = createHarness();
  harness.controller.open({ mode: "edit", entity: editEntity, media });
  const fileName = harness.host.querySelector('[data-entity-editor-preview-name="portrait"]');
  fileName.dispatchEvent(new harness.window.KeyboardEvent("keydown", {
    key: "F2",
    bubbles: true,
    cancelable: true,
  }));
  await flushAsync();
  const input = harness.host.querySelector('[data-entity-editor-preview-rename="portrait"]');
  input.value = "不会保存";
  input.dispatchEvent(new harness.window.KeyboardEvent("keydown", {
    key: "Escape",
    bubbles: true,
    cancelable: true,
  }));
  await flushAsync();

  assert.deepEqual(harness.calls.renamedMedia, []);
  assert.equal(
    harness.host.querySelector('[data-entity-editor-preview-name="portrait"]')?.textContent,
    "角色正面.png",
  );
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
  await flushAsync();

  assert.ok(harness.host.querySelector("#canvasEntityEditorNameError"));
  assert.ok(harness.host.querySelector("#canvasEntityEditorMediaError"));
  assert.equal(harness.window.document.activeElement, harness.host.querySelector("[data-entity-editor-name]"));
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

function deferredOperation() {
  let resolve;
  let reject;
  const promise = new Promise((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

function beginTestRename(harness, name) {
  const previewName = harness.host.querySelector('[data-entity-editor-preview-name="portrait"]');
  assert.ok(previewName);
  previewName.dispatchEvent(new harness.window.MouseEvent("dblclick", { bubbles: true }));
  const input = harness.input('[data-entity-editor-preview-rename="portrait"]', name);
  input.dispatchEvent(new harness.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
}

function beginTestUpload(harness, fileName) {
  const file = new harness.window.File(["image"], fileName, { type: "image/png" });
  Object.defineProperty(harness.uploadInput, "files", { configurable: true, value: [file] });
  harness.uploadInput.dispatchEvent(new harness.window.Event("change", { bubbles: true }));
}

test("invalidated selection context blocks rename submission from Enter and focusout", async (t) => {
  for (const trigger of ["enter", "focusout"]) {
    await t.test(trigger, async () => {
      let valid = true;
      const harness = createHarness();
      try {
        harness.controller.open({ mode: "edit", entity: editEntity, media, isContextValid: () => valid });
        harness.host.querySelector('[data-entity-editor-preview-name="portrait"]')
          .dispatchEvent(new harness.window.MouseEvent("dblclick", { bubbles: true }));
        const input = harness.input('[data-entity-editor-preview-rename="portrait"]', "不得保存");
        valid = false;
        input.dispatchEvent(trigger === "enter"
          ? new harness.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
          : new harness.window.FocusEvent("focusout", { bubbles: true }));
        await flushAsync();

        assert.equal(harness.calls.renamedMedia.length, 0);
        assert.equal(harness.controller.getDraftState()?.filteredMedia.find((item) => item.id === "portrait")?.displayName, "角色正面.png");
      } finally { harness.controller.destroy(); }
    });
  }
});

test("pending rename completion cannot change a draft after its canvas context expires", async (t) => {
  for (const outcome of ["resolve", "reject"]) {
    await t.test(outcome, async () => {
      let valid = true;
      const pending = deferredOperation();
      const harness = createHarness({ renameMedia: () => pending.promise });
      try {
        harness.controller.open({ mode: "edit", entity: editEntity, media, isContextValid: () => valid });
        beginTestRename(harness, "陈旧改名");
        assert.equal(harness.host.querySelector("[data-entity-editor-preview-rename]")?.disabled, true);
        assert.equal(await harness.controller.requestClose(), false);
        valid = false;
        if (outcome === "resolve") pending.resolve({ displayName: "陈旧改名.png" });
        else pending.reject(new Error("旧作用域重命名失败"));
        await flushAsync();

        assert.notEqual(harness.controller.getDraftState()?.filteredMedia.find((item) => item.id === "portrait")?.displayName, "陈旧改名.png");
        assert.equal(harness.calls.errors.length, 0);
        assert.equal(await harness.controller.requestClose(), true);
      } finally { harness.controller.destroy(); }
    });
  }
});

test("pending upload completion cannot add media after its canvas context expires", async (t) => {
  for (const outcome of ["resolve", "reject"]) {
    await t.test(outcome, async () => {
      let valid = true;
      const pending = deferredOperation();
      const harness = createHarness({ persistFiles: () => pending.promise });
      try {
        harness.controller.open({ mode: "create", initialMedia: [media[0]], isContextValid: () => valid });
        beginTestUpload(harness, "old.png");
        assert.equal(harness.host.querySelector("[data-entity-editor]")?.dataset.entityEditorBusy, "true");
        valid = false;
        if (outcome === "resolve") pending.resolve([{ id: "late-upload", mediaKind: "image", displayName: "old.png", url: "/old.png" }]);
        else pending.reject(new Error("旧作用域上传失败"));
        await flushAsync();

        assert.equal(harness.controller.getDraftState()?.mediaRefs.some((ref) => ref.mediaId === "late-upload") ?? false, false);
        assert.equal(harness.calls.errors.length, 0);
        assert.notEqual(harness.host.querySelector("[data-entity-editor]")?.dataset.entityEditorBusy, "true");
      } finally { harness.controller.destroy(); }
    });
  }
});

test("late rename completion preserves a replacement draft and its own pending rename", async (t) => {
  for (const outcome of ["resolve", "reject"]) {
    await t.test(outcome, async () => {
      const oldOperation = deferredOperation();
      const currentOperation = deferredOperation();
      const received = [];
      const harness = createHarness({ renameMedia: (payload) => {
        received.push(payload);
        return received.length === 1 ? oldOperation.promise : currentOperation.promise;
      } });
      try {
        harness.controller.open({ mode: "edit", entity: editEntity, media });
        beginTestRename(harness, "上一主体名称");
        harness.controller.open({ mode: "edit", entity: { ...editEntity, id: "replacement", name: "新草稿" }, media });
        beginTestRename(harness, "本次名称");
        assert.equal(received.length, 2);
        if (outcome === "resolve") oldOperation.resolve({ displayName: "上一主体名称.png" });
        else oldOperation.reject(new Error("上一主体重命名失败"));
        await flushAsync();

        assert.equal(harness.controller.getDraftState().entityId, "replacement");
        assert.equal(harness.controller.getDraftState().filteredMedia.find((item) => item.id === "portrait").displayName, "角色正面.png");
        assert.equal(harness.host.querySelector("[data-entity-editor-preview-rename]")?.disabled, true);
        assert.equal(harness.host.querySelector("[data-entity-editor-preview-rename]")?.value, "本次名称");
        assert.equal(await harness.controller.requestClose(), false);
        assert.equal(harness.calls.errors.length, 0);
        currentOperation.resolve({ displayName: "本次名称.png" });
        await flushAsync();
        assert.equal(harness.controller.getDraftState().filteredMedia.find((item) => item.id === "portrait").displayName, "本次名称.png");
        assert.equal(harness.host.querySelector("[data-entity-editor-preview-rename]"), null);
      } finally { harness.controller.destroy(); }
    });
  }
});

test("late upload completion preserves a replacement draft and its own pending upload", async (t) => {
  for (const outcome of ["resolve", "reject"]) {
    await t.test(outcome, async () => {
      const oldOperation = deferredOperation();
      const currentOperation = deferredOperation();
      const received = [];
      const harness = createHarness({ persistFiles: (files) => {
        received.push(files);
        return received.length === 1 ? oldOperation.promise : currentOperation.promise;
      } });
      try {
        harness.controller.open({ mode: "create", initialMedia: [media[0]] });
        beginTestUpload(harness, "old.png");
        harness.controller.open({ mode: "create", initialMedia: [media[2]] });
        harness.input("[data-entity-editor-name]", "新草稿");
        beginTestUpload(harness, "current.png");
        assert.equal(received.length, 2);
        if (outcome === "resolve") oldOperation.resolve([{ id: "old-upload", mediaKind: "image", displayName: "old.png", url: "/old.png" }]);
        else oldOperation.reject(new Error("上一主体上传失败"));
        await flushAsync();

        assert.equal(harness.controller.getDraftState().name, "新草稿");
        assert.deepEqual(JSON.parse(JSON.stringify(harness.controller.getDraftState().mediaRefs)), [{ mediaId: "voice", order: 0 }]);
        assert.equal(harness.host.querySelector("[data-entity-editor]")?.dataset.entityEditorBusy, "true");
        assert.equal(harness.calls.errors.length, 0);
        currentOperation.resolve([{ id: "current-upload", mediaKind: "image", displayName: "current.png", url: "/current.png" }]);
        await flushAsync();
        assert.deepEqual(JSON.parse(JSON.stringify(harness.controller.getDraftState().mediaRefs)), [{ mediaId: "voice", order: 0 }, { mediaId: "current-upload", order: 1 }]);
        assert.equal(harness.host.querySelector("[data-entity-editor]")?.dataset.entityEditorBusy, "false");
      } finally { harness.controller.destroy(); }
    });
  }
});
