import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "node:url";
import { buildPromptEditor } from "../scripts/build-prompt-editor.mjs";

const root = new URL("../", import.meta.url);
const promptEditorSource = await buildPromptEditor(fileURLToPath(root));
const html = await readFile(new URL("index.html", root), "utf8");
const scriptDocument = new JSDOM(html);
const scriptPaths = [...scriptDocument.window.document.querySelectorAll("script[src]")]
  .map((script) => script.getAttribute("src"))
  .filter((src) => src.startsWith("./"))
  .map((src) => src.split("?")[0]);
scriptDocument.window.close();
const scripts = await Promise.all(scriptPaths.map(async (path) => ({
  path,
  source: await readFile(new URL(path, root), "utf8"),
})));

// Load the real entry and controllers; only browser scheduling/media APIs are stubbed.
// The test-only export exposes state without changing the shipped application.
function createHarness(t, { trackMetadataImages = false } = {}) {
  const dom = new JSDOM(html, {
    url: "http://reelay.test/index.html",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  t.after(() => dom.window.close());
  const { window } = dom;
  const metadataImages = [];
  if (trackMetadataImages) {
    window.Image = class {
      naturalWidth = 0;
      naturalHeight = 0;
      set src(value) {
        this.url = value;
        metadataImages.push(this);
      }
    };
  }
  const timers = new Map();
  const timerDelays = new Map();
  let nextTimerId = 0;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.structuredClone = structuredClone;
  window.requestAnimationFrame = () => 1;
  window.cancelAnimationFrame = () => {};
  window.Range.prototype.getClientRects = () => [{ left: 120, right: 121, top: 120, bottom: 140, width: 1, height: 20 }];
  window.Range.prototype.getBoundingClientRect = () => ({ left: 120, right: 121, top: 120, bottom: 140, width: 1, height: 20 });
  window.scrollBy = () => {};
  window.setTimeout = (callback, delay) => {
    const id = ++nextTimerId;
    timers.set(id, callback);
    timerDelays.set(id, delay);
    return id;
  };
  window.clearTimeout = (id) => timers.delete(id);
  window.URL.createObjectURL = () => "blob:http://reelay.test/mock";
  window.URL.revokeObjectURL = () => {};
  window.HTMLMediaElement.prototype.pause = () => {};
  window.HTMLMediaElement.prototype.load = () => {};
  window.Element.prototype.setPointerCapture = () => {};
  window.Element.prototype.releasePointerCapture = () => {};
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  window.eval(promptEditorSource);
  t.after(() => window.canvasTest?.promptEditors.destroy());
  for (const { path, source } of scripts) {
    window.eval(source + (path === "./app.js"
      ? "\nwindow.canvasTest = { state, canvasRuntimeStore, canvasNodeDragController, canvasGroupInteractionController, canvasCommandExecutor, canvasContentCommands, canvasEntityUse, canvasNodeTasks, canvasPersistence, agentReferences, promptEditors };"
      : ""));
  }
  const { state, canvasRuntimeStore, canvasNodeDragController } = window.canvasTest;
  function node(id, overrides = {}) {
    return Object.assign(window.defaultGeneratorNode(10, 20, "video"), {
      id, prompt: "一只狐狸走过森林", expanded: false, ...overrides,
    });
  }
  function canvas(id, nodes = [], groups = [], connections = []) {
    return { ...window.createCanvasRecord(id), id, nodes, groups, connections };
  }
  function install(...canvases) {
    for (const canvas of canvases) {
      canvas.connections = window.REELAY_CANVAS_CONNECTIONS.normalizeConnections(canvas.connections, canvas.nodes);
    }
    canvasRuntimeStore.replaceCanvases(canvases, canvases[0].id);
    window.clearSelection();
    window.render();
  }
  function fireTimer(id) {
    const callback = timers.get(id);
    assert.equal(typeof callback, "function", "expected a scheduled task callback");
    timers.delete(id);
    callback();
  }
  function editorFor(input) {
    const nodeId = input.closest(".canvas-node[data-id]")?.dataset.id;
    const owner = nodeId ? state.nodes.find((node) => node.id === nodeId) : window.getConversation();
    const editor = window.canvasTest.promptEditors.get(owner);
    assert.ok(editor, "expected the actual prompt editor to be mounted");
    return editor;
  }
  function setText(input, value) {
    const editor = editorFor(input);
    const next = window.REELAY_PROMPT_EDITOR.createSnapshot(value, "test").state.doc;
    editor.view.dispatch(editor.view.state.tr.replaceWith(0, editor.view.state.doc.content.size, next.content));
  }
  function selectText(input, start, end = start, direction = "forward") {
    const editor = editorFor(input);
    const TextSelection = window.REELAY_PROMPT_EDITOR.createSnapshot("", "test").state.selection.constructor;
    const anchor = (direction === "backward" ? end : start) + 1;
    const head = (direction === "backward" ? start : end) + 1;
    editor.view.dispatch(editor.view.state.tr.setSelection(TextSelection.create(editor.view.state.doc, anchor, head)));
  }
  const getText = (input) => editorFor(input).getText();
  const selection = (input) => {
    const { from, to, anchor, head } = editorFor(input).view.state.selection;
    return [from - 1, to - 1, anchor > head ? "backward" : "forward"];
  };
  const promptText = (value, entries) => window.REELAY_CANVAS_PROMPT_DOCUMENT.toText(value, entries);
  function moveNode(nodeId, dx, dy, { altKey = false, cancelled = false } = {}) {
    const current = state.nodes.find((item) => item.id === nodeId);
    const action = canvasNodeDragController.promote({
      type: "drag-candidate", pointerId: 1, ids: [nodeId], activeId: nodeId,
      altKey, startClientX: 0, startClientY: 0,
      origins: [{ id: nodeId, x: current.x, y: current.y }],
      groups: state.groups.map(window.cloneGroupState),
    }, { clientX: dx, clientY: dy });
    canvasNodeDragController.finish(action, { cancelled });
    state.action = null;
  }
  function resizeGroup(groupId, dx, dy, { cancelled = false, onPreview = () => {} } = {}) {
    const current = state.groups.find((item) => item.id === groupId);
    const target = window.document.querySelector("#canvasShell");
    const controller = window.canvasTest.canvasGroupInteractionController;
    const action = controller.beginResize(current, { pointerId: 3, clientX: 0, clientY: 0 }, "se", target);
    controller.resize(action, { clientX: dx, clientY: dy });
    onPreview();
    window.finishPointerInteraction({
      type: cancelled ? "pointercancel" : "pointerup", pointerId: 3,
      clientX: dx, clientY: dy, target,
    });
  }
  function pointerGesture(nodeId, dx = 0, dy = 0, { altKey = false, cancelled = false, onPreview = () => {} } = {}) {
    const target = window.document.querySelector(`.canvas-node[data-id="${nodeId}"]`);
    assert.ok(target, "expected a real rendered node pointer target");
    function pointer(type, clientX, clientY) {
      const event = new window.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX, clientY, altKey });
      Object.defineProperty(event, "pointerId", { value: 5 });
      return event;
    }
    target.dispatchEvent(pointer("pointerdown", 100, 100));
    if (dx || dy) window.dispatchEvent(pointer("pointermove", 100 + dx, 100 + dy));
    onPreview();
    window.dispatchEvent(pointer(cancelled ? "pointercancel" : "pointerup", 100 + dx, 100 + dy));
  }
  // The runner arms its task timer after synchronous render effects complete.
  const scheduledTask = () => {
    const timeoutId = [...timers.keys()].at(-1);
    return { timeoutId, delay: timerDelays.get(timeoutId) };
  };
  return { window, state, node, canvas, install, fireTimer, moveNode, resizeGroup, pointerGesture, timers, scheduledTask, metadataImages,
    editorFor, setText, getText, selectText, selection, promptText };
}

test("experience restores uploaded media by catalog identity after canonical document reload", (t) => {
  const h = createHarness(t);
  h.state.hostCapabilities.transientMediaUpload = true;
  const localAsset = { id: "instance-asset", librarySourceId: "memory-file", type: "image", name: "local.png", url: "blob:http://reelay.test/original" };
  h.install(h.canvas("first", [h.node("with-file", { assets: [localAsset], activeAssetId: localAsset.id })]),
    h.canvas("second", [h.node("also-file", { assets: [{ ...localAsset, id: "instance-2" }], activeAssetId: "instance-2" })]));
  const serialized = h.window.createCanvasDocumentSnapshot();
  assert.equal(serialized.canvases[0].nodes[0].assets[0].url, "");
  assert.equal(h.window.hydrateCanvasDocumentSnapshot(serialized), true);
  h.window.restoreTransientCanvasMedia([{ id: "memory-file", workspaceAssetId: "memory-file", url: "blob:http://reelay.test/current", thumbnailUrl: "blob:http://reelay.test/current" }]);
  for (const canvas of h.state.canvases) {
    assert.equal(canvas.nodes[0].assets[0].url, "blob:http://reelay.test/current");
    assert.equal(canvas.nodes[0].assets[0].librarySourceId, "memory-file");
  }
  assert.equal(h.window.libraryImagePreviewUrl("blob:http://reelay.test/current", "image"), "blob:http://reelay.test/current");
  assert.equal(h.window.libraryImagePreviewUrl("http://reelay.test/assets/home/entity-umbra-01-key-art-v4.jpg", "image"),
    "http://reelay.test/assets/experience-preview/entity-umbra-01-key-art-v4.webp");
  h.state.hostCapabilities.transientMediaUpload = false;
  h.window.restoreTransientCanvasMedia([{ id: "memory-file", url: "blob:http://reelay.test/forbidden" }]);
  assert.equal(h.state.canvases[0].nodes[0].assets[0].url, "blob:http://reelay.test/current");
  assert.equal(h.window.libraryImagePreviewUrl("http://reelay.test/api/workspaces/workspace-one/media-assets/asset-one/content", "image"),
    "http://reelay.test/api/workspaces/workspace-one/media-assets/asset-one/content?preview=library");
});

for (const experience of [false, true]) test(`home launch consumes its context prompt once after hydration with experience=${experience}`, (t) => {
  const h = createHarness(t);
  h.install(h.canvas("empty"));
  h.window.sessionStorage.setItem("reelay-home-launch-intent", "internal pending prompt");
  const host = { postMessage() {} };
  Object.defineProperty(h.window, "parent", { configurable: true, value: host });
  const dispatch = (data) => h.window.canvasTest.canvasPersistence.handleHostMessage({
    origin: h.window.location.origin, source: host, data: { source: "reelay-shell", ...data },
  });
  dispatch({ type: "host:init", context: { protocolVersion: 1, projectId: "new-project", canvasId: "main",
    writable: true, capabilities: { transientMediaUpload: experience }, launchPrompt: "context prompt" } });
  assert.equal(h.window.consumeHomeLaunchIntent(), false);
  assert.equal(h.state.nodes.length, 0);
  dispatch({ type: "host:document", protocolVersion: 1, document: null, writable: true });
  assert.equal(h.state.nodes.length, 1);
  assert.equal(h.state.nodes[0].prompt, "context prompt");
  assert.equal(h.window.consumeHomeLaunchIntent(), false);
  assert.equal(h.window.sessionStorage.getItem("reelay-home-launch-intent"), "internal pending prompt");
});

test("home launch cannot mutate a read-only document or cross into another project context", (t) => {
  const h = createHarness(t);
  h.install(h.canvas("empty"));
  const host = { postMessage() {} };
  Object.defineProperty(h.window, "parent", { configurable: true, value: host });
  const dispatch = (data) => h.window.canvasTest.canvasPersistence.handleHostMessage({
    origin: h.window.location.origin, source: host, data: { source: "reelay-shell", ...data },
  });
  dispatch({ type: "host:init", context: { protocolVersion: 1, workspaceId: "workspace", projectId: "read-only-project",
    canvasId: "main", writable: false, launchPrompt: "不能写入的需求" } });
  dispatch({ type: "host:document", protocolVersion: 1, document: null, writable: false });
  assert.equal(h.window.consumeHomeLaunchIntent(), false);
  assert.equal(h.state.nodes.length, 0);
  dispatch({ type: "host:init", context: { protocolVersion: 1, workspaceId: "workspace", projectId: "other-project",
    canvasId: "main", writable: true } });
  dispatch({ type: "host:document", protocolVersion: 1, document: null, writable: true });
  assert.equal(h.state.nodes.length, 0);
  assert.equal(h.window.consumeHomeLaunchIntent(), false);
});

test("progressive asset arrival preserves the editable document, running task, save, undo and focused prompt", (t) => {
  const h = createHarness(t);
  const editing = h.node("editing", { expanded: true, assets: [{ id: "local", librarySourceId: "memory-file",
    type: "image", name: "local.png", url: "" }], activeAssetId: "local" });
  const running = h.node("running");
  h.install(h.canvas("working", [editing, running]));
  const posted = [];
  const host = { postMessage(message) { posted.push(message); } };
  Object.defineProperty(h.window, "parent", { configurable: true, value: host });
  const dispatch = (data) => h.window.dispatchEvent(new h.window.MessageEvent("message", {
    origin: h.window.location.origin, source: host, data: { source: "reelay-shell", protocolVersion: 1, ...data },
  }));
  dispatch({ type: "host:init", context: { protocolVersion: 1, projectId: h.state.projectId, canvasId: "main", writable: true,
    capabilities: { progressiveAssetLoading: true, transientMediaUpload: true, assetPersistence: false, entityPersistence: false } } });
  dispatch({ type: "host:document", document: null, writable: true });
  h.window.canvasTest.canvasPersistence.post("canvas:ready");
  const instanceId = posted.findLast((message) => message.type === "canvas:ready").instanceId;
  const availability = (projectAssets, workspaceCatalog) => dispatch({ type: "host:asset-availability", instanceId, projectAssets, workspaceCatalog });
  availability("loading", "loading");
  assert.equal(h.window.isCanvasMutationAllowed(), true);
  assert.equal(h.window.canPersistLibraryMedia(), false);
  h.window.openAssetLibrary();
  assert.match(h.window.document.querySelector("#assetLibraryGrid").textContent, /正在加载个人资产/);
  assert.equal(h.window.isAssetLibraryMutable(), false);
  h.window.closeAssetLibrary();

  assert.equal(h.window.startSimulatedGeneration(running), true);
  const task = h.scheduledTask();
  h.moveNode(editing.id, 30, 15);
  h.window.flushCanvasDocumentSave();
  const undoStack = h.state.canvases[0].undoStack;
  const undoCount = undoStack.length;
  const input = h.window.document.querySelector('[data-id="editing"] [data-node-prompt-input] .prompt-editor-content');
  input.focus();
  h.selectText(input, 2, 6);
  const before = JSON.stringify(h.window.canvasTest.canvasPersistence.getState());
  const credits = JSON.stringify(h.state.account);
  const media = { assetId: "memory-file", assetVersion: 1, mediaKind: "image", displayName: "local.png",
    contentType: "image/png", byteSize: 42, checksumSha256: "a".repeat(64), contentUrl: "blob:http://reelay.test/current" };
  dispatch({ type: "host:workspace-asset-catalog", instanceId, requestId: "personal-ready", assets: [media], entities: [] });
  availability("loading", "ready");
  assert.equal(h.window.canPersistLibraryMedia(), false, "project discovery has not yet settled");
  assert.equal(h.window.canPersistLibraryEntities(), true);
  dispatch({ type: "host:project-assets", instanceId, requestId: "project-ready", projectAssets: [{ ...media, referenceId: "reference" }] });
  availability("ready", "ready");
  assert.equal(h.window.canPersistLibraryMedia(), true);
  assert.equal(editing.assets[0].url, "blob:http://reelay.test/current");
  assert.equal(h.state.activeCanvasId, "working");
  assert.equal(h.state.nodes[0], editing);
  assert.equal(h.state.canvases[0].undoStack, undoStack);
  assert.equal(undoStack.length, undoCount);
  assert.equal(JSON.stringify(h.window.canvasTest.canvasPersistence.getState()), before);
  assert.equal(running.generating, true);
  assert.equal(h.timers.has(task.timeoutId), true);
  assert.equal(JSON.stringify(h.state.account), credits);
  assert.equal(h.window.document.activeElement, input);
  assert.equal(h.window.document.querySelector('[data-id="editing"] [data-node-prompt-input] .prompt-editor-content'), input);
  assert.deepEqual(h.selection(input), [2, 6, "forward"]);
});

test("progressive personal catalog failure exposes unavailable state without writable placeholder data", (t) => {
  const h = createHarness(t);
  const posted = [];
  const host = { postMessage(message) { posted.push(message); } };
  Object.defineProperty(h.window, "parent", { configurable: true, value: host });
  const dispatch = (data) => h.window.dispatchEvent(new h.window.MessageEvent("message", {
    origin: h.window.location.origin, source: host, data: { source: "reelay-shell", protocolVersion: 1, ...data },
  }));
  dispatch({ type: "host:init", context: { protocolVersion: 1, projectId: h.state.projectId, canvasId: "main", writable: true,
    capabilities: { progressiveAssetLoading: true } } });
  dispatch({ type: "host:document", document: null, writable: true });
  h.window.canvasTest.canvasPersistence.post("canvas:ready");
  const instanceId = posted.findLast((message) => message.type === "canvas:ready").instanceId;
  dispatch({ type: "host:asset-availability", instanceId, projectAssets: "ready", workspaceCatalog: "unavailable" });
  h.window.openAssetLibrary();
  assert.match(h.window.document.querySelector("#assetLibraryGrid").textContent, /个人资产暂时无法加载/);
  assert.equal(h.window.isAssetLibraryMutable(), false);
  assert.equal(h.window.canPersistLibraryMedia(), false);
  assert.equal(h.window.canPersistLibraryEntities(), false);
  assert.equal(h.window.isCanvasMutationAllowed(), true);
  assert.equal(h.state.hostCapabilities.assetPersistence, true, "project-local file uploads can remain available after personal discovery fails");
});

test("closed library catalog registration loads no media; using an asset hydrates only that node", async (t) => {
  const h = createHarness(t, { trackMetadataImages: true });
  assert.deepEqual(h.metadataImages.map((image) => image.url), [],
    "startup uses its static favicon and must not probe any media in the demo library");
  h.metadataImages.length = 0;
  h.install(h.canvas("on-demand-media"));
  const assets = Array.from({ length: 12 }, (_, index) => ({
    assetId: `catalog-image-${index}`,
    assetVersion: 1,
    mediaKind: "image",
    displayName: `catalog-fixture-${index}`,
    contentType: "image/png",
    byteSize: 1024,
    checksumSha256: "a".repeat(64),
    contentUrl: `/api/workspaces/workspace-one/media-assets/catalog-image-${index}/content`,
  }));
  h.window.registerHostWorkspaceAssetCatalog({ assets });
  assert.equal(h.window.isAssetLibraryOpen(), false);
  assert.equal(h.metadataImages.length, 0, "a catalog describes media without downloading its original bytes");
  assert.equal(h.window.document.querySelectorAll("#assetLibraryGrid img, #assetLibraryGrid video").length, 0,
    "a closed panel must not mount hidden media previews");
  assert.ok(assets.every((asset) => h.window.findLibraryAsset(asset.assetId)));

  h.window.switchAssetLibraryContext({ space: "personal", section: "media" });
  h.state.librarySearch = "catalog-fixture";
  h.window.openAssetLibrary();
  assert.equal(h.window.document.querySelectorAll("#assetLibraryGrid img").length, 12,
    "opening the library mounts its visible image previews");
  for (const image of h.window.document.querySelectorAll("#assetLibraryGrid img")) {
    assert.equal(new URL(image.src).searchParams.get("preview"), "library",
      "library cards request the small authorized derivative rather than the original");
  }
  assert.equal(h.metadataImages.length, 0, "visible previews do not start a second full-library metadata scan");

  h.window.useLibraryAsset(assets[3].assetId, 600, 400);
  assert.equal(h.state.nodes.length, 1);
  assert.equal(h.metadataImages.length, 1);
  assert.equal(h.metadataImages[0].url, `http://reelay.test${assets[3].contentUrl}`);
  Object.assign(h.metadataImages[0], { naturalWidth: 900, naturalHeight: 1600 });
  h.metadataImages[0].onload();
  await Promise.resolve();
  const placed = h.state.nodes[0].assets[0];
  assert.equal(placed.url, `http://reelay.test${assets[3].contentUrl}`,
    "placing and downloading retain the original file");
  assert.equal(placed.width, 900);
  assert.equal(placed.height, 1600);
  assert.equal(placed.aspectRatio, 900 / 1600);
  assert.equal(h.metadataImages.length, 1, "dimension completion must not start background requests for unused assets");
});

test("node controls preserve the live prompt editor and media across content renders", (t) => {
  const h = createHarness(t);
  const node = h.node("reading-position", { expanded: true });
  h.install(h.canvas("reading", [node]));
  const element = h.window.document.querySelector('[data-id="reading-position"]');
  const panel = element.querySelector(".prompt-panel");
  const input = element.querySelector("[data-node-prompt-input] .prompt-editor-content");
  const media = element.querySelector(".media-frame");
  const prompt = "镜头缓慢推进，保持玻璃材质与光影连续。".repeat(120);
  h.setText(input, prompt);
  h.selectText(input, 12, 26, "backward");
  input.parentElement.scrollTop = 640;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    element.querySelector('[data-action="advanced-settings-toggle"]').click();
    assert.equal(node.advancedSettingsExpanded, iteration % 2 === 0, "one click toggles once");
    assert.equal(h.window.document.querySelector('[data-id="reading-position"]'), element);
    assert.equal(element.querySelector(".prompt-panel"), panel);
    assert.equal(element.querySelector("[data-node-prompt-input] .prompt-editor-content"), input);
    assert.equal(element.querySelector(".media-frame"), media);
    assert.equal(input.parentElement.scrollTop, 640);
    assert.equal(h.getText(input), prompt);
    assert.deepEqual(h.selection(input), [12, 26, "backward"]);
  }
  input.focus();
  h.window.render();
  assert.equal(h.window.document.activeElement, input, "unrelated redraw does not leave text editing");
  element.querySelector('[data-action="advanced-settings-toggle"]').click();
  const beforeValidation = node.assetValidationEnabled;
  element.querySelector('[data-action="asset-validation"]').click();
  assert.equal(node.assetValidationEnabled, !beforeValidation);
  assert.equal(input.parentElement.scrollTop, 640);
  h.window.handleAction(node, "param-panel");
  assert.equal(element.querySelector("[data-node-prompt-input] .prompt-editor-content"), input);
  const range = element.querySelector("[data-duration-range]");
  const number = element.querySelector("[data-duration-number]");
  range.value = "12";
  range.dispatchEvent(new h.window.Event("input", { bubbles: true }));
  assert.equal(number.value, "12");
  range.dispatchEvent(new h.window.Event("change", { bubbles: true }));
  assert.equal(node.duration, "12s");
  assert.equal(element.querySelector("[data-node-prompt-input] .prompt-editor-content"), input);
  h.setText(input, h.getText(input) + "继续编辑");
  assert.equal(h.promptText(node.prompt), h.getText(input), "retained listener still edits the live node");
  node.prompt = "外部更新后的提示词";
  h.window.render();
  assert.equal(h.getText(input), node.prompt);
  input.focus();
  input.dispatchEvent(new h.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.notEqual(h.window.document.activeElement, input);
  assert.equal(node.expanded, true);

  const replacement = h.node(node.id, { expanded: true, prompt: node.prompt });
  h.install(h.canvas("another-reading", [replacement]));
  const replacementInput = h.window.document.querySelector("[data-node-prompt-input] .prompt-editor-content");
  assert.notEqual(replacementInput, input, "same ID in another canvas has its own editor");
  h.setText(replacementInput, "只属于新画布");
  assert.equal(h.promptText(replacement.prompt), "只属于新画布");
  assert.equal(node.prompt, "外部更新后的提示词");
});

test("mode guidance updates the live node editor without becoming prompt content or resetting reading state", (t) => {
  const h = createHarness(t);
  const guidance = h.window.REELAY_MODEL_CATALOG.find((model) => model.id === "seedance-2-5")
    .capabilities.omniReferenceTaskType.promptPlaceholders;
  assert.ok(guidance?.auto && guidance?.edit && guidance?.extend, "the model catalog supplies each visible task's guidance");
  const node = h.node("mode-guidance", { expanded: true, model: "seedance-2-5", prompt: "" });
  const canvas = h.canvas("guidance", [node]);
  h.install(canvas);
  const element = h.window.document.querySelector('[data-id="mode-guidance"]');
  const input = element.querySelector("[data-node-prompt-input] .prompt-editor-content");
  assert.equal(input.dataset.placeholder, guidance.auto, "initial rendering resolves the default task");
  h.window.handleAction(node, "omni-reference-task-type", "edit");
  assert.equal(element.querySelector("[data-node-prompt-input] .prompt-editor-content"), input);
  assert.equal(input.dataset.placeholder, guidance.edit);
  assert.equal(h.getText(input), "");
  assert.equal(node.prompt, "");
  assert.equal(canvas.undoStack.length, 1, "guidance adds no separate content command");
  assert.equal(h.window.getGenerationAvailability(node).canGenerate, false, "placeholder text cannot enable generation");

  const prompt = "镜头缓慢推进，保持光影连续。".repeat(120);
  h.setText(input, prompt);
  h.selectText(input, 8, 28, "backward");
  input.parentElement.scrollTop = 640;
  input.focus();
  let editorDocument = h.editorFor(input).view.state.doc;
  function assertEditor(expectedPlaceholder) {
    assert.equal(element.querySelector("[data-node-prompt-input] .prompt-editor-content"), input);
    assert.equal(input.dataset.placeholder, expectedPlaceholder);
    assert.equal(h.getText(input), prompt);
    assert.equal(h.promptText(node.prompt), prompt);
    assert.equal(input.parentElement.scrollTop, 640);
    assert.deepEqual(h.selection(input), [8, 28, "backward"]);
    assert.equal(h.window.document.activeElement, input);
    assert.equal(h.editorFor(input).view.state.doc, editorDocument, "metadata updates must preserve the editor document and its undo history");
  }
  element.querySelector('[data-action="omni-reference-task-type"][data-value="extend"]').click();
  assertEditor(guidance.extend);
  h.window.undoLastAction();
  assertEditor(guidance.edit);
  h.window.handleAction(node, "model", "kling-video-3");
  assertEditor("描述你想生成的内容，或输入 @ 引用");
  h.window.undoLastAction();
  assertEditor(guidance.edit);
  h.window.render();
  assertEditor(guidance.edit);
});

test("prompt scrolling follows editing focus instead of interrupting canvas navigation on hover", (t) => {
  const h = createHarness(t);
  const node = h.node("scroll-editor", { expanded: true });
  h.install(h.canvas("scrolling", [node]));
  const input = h.window.document.querySelector("[data-node-prompt-input] .prompt-editor-content");
  const panel = input.closest(".prompt-panel");
  const shell = h.window.document.querySelector("#canvasShell");
  const originalPrompt = node.prompt;
  Object.defineProperties(input.parentElement, {
    clientHeight: { configurable: true, value: 100 },
    scrollHeight: { configurable: true, value: 800 },
  });
  const viewport = () => ({ tx: h.state.tx, ty: h.state.ty, scale: h.state.scale });
  function wheel(target, options = {}) {
    const event = new h.window.WheelEvent("wheel", {
      bubbles: true, cancelable: true, deltaY: 40, clientX: 200, clientY: 200, ...options,
    });
    target.dispatchEvent(event);
    return event;
  }

  const beforeHover = viewport();
  assert.equal(wheel(input).defaultPrevented, true);
  assert.equal(h.state.ty, beforeHover.ty - 40);
  assert.notEqual(h.window.document.activeElement, input);
  const beforePadding = viewport();
  wheel(panel, { shiftKey: true });
  assert.equal(h.state.tx, beforePadding.tx - 40);
  assert.equal(h.state.ty, beforePadding.ty);

  // Native focus also covers Tab entry; no separate mouse-only editing flag.
  input.focus();
  const editingViewport = viewport();
  for (const scrollTop of [0, 300, 700]) {
    input.parentElement.scrollTop = scrollTop;
    assert.equal(wheel(input).defaultPrevented, false);
    assert.deepEqual(viewport(), editingViewport);
  }
  input.dispatchEvent(new h.window.KeyboardEvent("keydown", {
    key: "Escape", isComposing: true, bubbles: true, cancelable: true,
  }));
  assert.equal(h.window.document.activeElement, input);
  const escape = new h.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  input.dispatchEvent(escape);
  assert.equal(escape.defaultPrevented, true);
  assert.notEqual(h.window.document.activeElement, input);
  assert.equal(node.expanded, true);
  assert.equal(node.prompt, originalPrompt);
  wheel(input);
  assert.equal(h.state.ty, editingViewport.ty - 40);

  input.focus();
  wheel(shell);
  assert.notEqual(h.window.document.activeElement, input);
  const resumed = viewport();
  wheel(input);
  assert.equal(h.state.ty, resumed.ty - 40);

  for (const modifier of ["ctrlKey", "metaKey"]) {
    input.focus();
    const beforeZoom = h.state.scale;
    assert.equal(wheel(input, { [modifier]: true, deltaY: -80 }).defaultPrevented, true);
    assert.ok(h.state.scale > beforeZoom);
    assert.notEqual(h.window.document.activeElement, input);
  }
  Object.defineProperty(input.parentElement, "scrollHeight", { configurable: true, value: 100 });
  input.focus();
  const shortPromptViewport = viewport();
  assert.equal(wheel(input).defaultPrevented, true);
  assert.equal(h.state.ty, shortPromptViewport.ty - 40);
  assert.notEqual(h.window.document.activeElement, input);
});

test("node editor controls and nested parameter menus keep local wheel ownership", (t) => {
  const h = createHarness(t);
  const node = h.node("scroll-controls", { expanded: true });
  h.install(h.canvas("scrolling", [node]));
  for (const action of ["model-panel", "param-panel", "material-panel"]) {
    h.window.handleAction(node, action);
    const panel = h.window.document.querySelector(".prompt-panel");
    const popover = panel.querySelector(".panel-popover, .material-panel");
    assert.ok(popover, action);
    const targets = [popover, ...panel.querySelectorAll("button, input, [role='slider']")];
    for (const target of targets) {
      for (const ctrlKey of [false, true]) {
        const before = { tx: h.state.tx, ty: h.state.ty, scale: h.state.scale };
        const event = new h.window.WheelEvent("wheel", {
          bubbles: true, cancelable: true, deltaY: 80, ctrlKey,
        });
        target.dispatchEvent(event);
        assert.deepEqual({ tx: h.state.tx, ty: h.state.ty, scale: h.state.scale }, before);
        assert.equal(event.defaultPrevented, ctrlKey);
      }
    }
  }
});

test("editor scaling preserves saved media anchors and repeated arrangements do not drift", (t) => {
  const h = createHarness(t);
  const first = h.node("editor-a", { x: 100, y: 100, aspect: "9:16", expanded: true });
  const second = h.node("editor-b", { x: 1200, y: 100, aspect: "16:9" });
  h.install(h.canvas("editor-layout", [first, second]));
  const original = h.window.getNodeMembershipBounds(first);
  for (const scale of [0.2, 0.5, 0.75, 1, 1.5, 2]) {
    h.state.scale = scale;
    const layout = h.window.getNodeLayout(first);
    const media = h.window.getNodeMembershipBounds(first);
    assert.equal(media.left, original.left);
    assert.equal(media.bottom, original.bottom);
    assert.equal(layout.promptScale * scale, 1);
    assert.equal(layout.panelGap * scale, 12 * Math.max(scale, 1));
    assert.deepEqual(plain(h.window.getNodeBounds(first)), plain(h.window.getNodeVisualBounds(first)));
    for (const direction of ["horizontal", "vertical", "grid"]) {
      const positions = h.window.arrangeNodes([first, second], direction);
      for (const position of positions) Object.assign(h.state.nodes.find((node) => node.id === position.id), position);
      const repeated = h.window.arrangeNodes([first, second], direction);
      repeated.forEach((position, index) => {
        assert.equal(position.id, positions[index].id);
        assert.ok(Math.abs(position.x - positions[index].x) < 1e-7);
        assert.ok(Math.abs(position.y - positions[index].y) < 1e-7);
      });
    }
    Object.assign(first, { x: 100, y: 100 });
    Object.assign(second, { x: 1200, y: 100 });
  }
});

function group(id, nodeIds, overrides = {}) {
  return { id, nodeIds, name: id, x: 0, y: 0, width: 1200, height: 900, z: 1, layoutMenuOpen: false, ...overrides };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function installReferenceOrderFixture(h) {
  const linkedImage = { id: "linked-image", type: "image", name: "连线图片", url: "/reference-image.png", width: 900, height: 1600 };
  const linkedVideo = { id: "linked-video", type: "video", name: "连线视频", url: "/reference-video.mp4", duration: 8 };
  const localImage = { id: "local-image", type: "image", name: "上传图片", url: "/local-image.png" };
  const localVideo = { id: "local-video", type: "video", name: "上传视频", url: "/local-video.mp4", duration: 12 };
  const sourceImage = { ...h.window.defaultAssetNode(0, 0, linkedImage), id: "image-source" };
  const sourceVideo = { ...h.window.defaultAssetNode(500, 0, linkedVideo), id: "video-source" };
  const target = h.node("reference-target", { expanded: true, assets: [localImage, localVideo], activeAssetId: localImage.id });
  const canvas = h.canvas("reference-canvas", [sourceImage, sourceVideo, target], [], [
    { id: "image-link", sourceNodeId: sourceImage.id, targetNodeId: target.id },
    { id: "video-link", sourceNodeId: sourceVideo.id, targetNodeId: target.id },
  ]);
  h.install(canvas);
  const element = h.window.document.querySelector('.canvas-node[data-id="reference-target"]');
  const context = () => h.window.getNodeReferenceContext(element.querySelector("[data-reference-key]"));
  return { canvas, target, sourceImage, sourceVideo, localImage, localVideo, linkedImage, linkedVideo, element, context };
}

const promptReference = (key, mediaType = "image", fallbackLabel = "图片1") => ({ type: "reference", key, mediaType, fallbackLabel });
const promptDocument = (...content) => ({ version: 1, content: content.map((part) => typeof part === "string" ? { type: "text", text: part } : part) });
function promptInteraction(h, input) {
  const editor = h.editorFor(input);
  // JSDOM has no layout. Only provide visible caret/ancestor geometry for the
  // real picker placement; selection, events and documents use the real engine.
  for (let ancestor = input; ancestor && ancestor !== h.window.document.body; ancestor = ancestor.parentElement) {
    ancestor.getBoundingClientRect = () => ({ left: 80, top: 80, right: 700, bottom: 600, width: 620, height: 520 });
  }
  editor.focus();
  return { editor,
    type: (text) => editor.view.dispatch(editor.view.state.tr.insertText(text)),
    key: (key, options = {}) => input.dispatchEvent(new h.window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options })),
  };
}

test("node @ keyboard insertion produces stable mixed-media atoms and an immutable generation input", (t) => {
  const h = createHarness(t);
  const f = installReferenceOrderFixture(h);
  const audio = { id: "voice", type: "audio", name: "人物配音", url: "/voice.mp3", duration: 5 };
  f.target.assets.push(audio);
  h.window.render();
  const input = f.element.querySelector(".prompt-editor-content");
  h.setText(input, "让");
  h.selectText(input, 1);
  const ui = promptInteraction(h, input);
  ui.type("@");
  assert.equal(h.window.document.querySelectorAll('.prompt-reference-menu [role="option"]').length, 5);
  ui.key("ArrowDown"); ui.key("ArrowDown"); ui.key("Enter");
  assert.deepEqual(plain(f.target.prompt), promptDocument("让", promptReference("asset:local-image", "image", "图片2")));
  ui.type("参考@视频1"); ui.key("Enter");
  ui.type("，配音@音频1"); ui.key("Enter");
  ui.type("，再次使用@图片2"); ui.key("Enter");
  assert.equal(h.window.document.querySelector(".prompt-reference-menu"), null);
  assert.equal(f.target.generating, false, "picker confirmation cannot start generation");
  const snapshot = h.window.createGenerationParameterSnapshot(f.target);
  assert.equal(snapshot.prompt, "让图片2参考视频1，配音音频1，再次使用图片2");
  assert.deepEqual(plain(snapshot.promptDocument), plain(f.target.prompt));
  assert.equal(snapshot.referenceSnapshot.valid, true);
  assert.equal(snapshot.referenceSnapshot.media.length, 5);
  assert.equal(snapshot.referenceSnapshot.references.length, 3, "repeated mentions do not duplicate the input media");
  assert.deepEqual(plain(snapshot.referenceSnapshot.media.map((entry) => entry.label)), ["图片1", "视频1", "图片2", "视频2", "音频1"]);
  assert.equal(Object.isFrozen(snapshot.referenceSnapshot.media[4].asset), true);
  audio.duration = 90;
  f.localImage.url = "/later-portrait.png";
  ui.type("后续草稿");
  assert.equal(snapshot.referenceSnapshot.media[4].asset.duration, 5);
  assert.equal(snapshot.referenceSnapshot.media[2].asset.url, "/local-image.png");
  assert.equal(snapshot.prompt.includes("后续草稿"), false);
});

test("reordering relabels prompt atoms by identity while disconnect and undo retain an explicit broken binding", (t) => {
  const h = createHarness(t);
  const f = installReferenceOrderFixture(h);
  f.target.prompt = promptDocument("人物", promptReference("connection:image-link"), "背景", promptReference("asset:local-image", "image", "图片2"));
  h.window.render();
  const input = f.element.querySelector(".prompt-editor-content");
  const editor = h.editorFor(input);
  const original = plain(f.target.prompt);
  const chip = () => input.querySelector('[data-reference-key="connection:image-link"]');
  assert.match(chip().textContent, /图片1/);
  assert.equal(h.window.moveNodeReference(f.context(), { sourceKey: "asset:local-image", targetKey: "connection:image-link", placement: "before" }), true);
  assert.equal(h.editorFor(input), editor);
  assert.match(chip().textContent, /图片2/);
  assert.deepEqual(plain(f.target.prompt), original, "rendered numbering never rewrites reference identity or fallback text");
  const account = plain(h.state.account);
  h.window.handleAction(f.target, "remove-linked-source", "image-link");
  assert.ok(input.querySelector('[data-reference-key="connection:image-link"]'), "disconnect retains the atom");
  assert.equal(h.window.REELAY_CANVAS_PROMPT_DOCUMENT.resolve(f.target.prompt, h.window.getNodeReferenceEntries(f.target)).valid, false);
  assert.equal(h.window.getGenerationAvailability(f.target).canGenerate, false);
  assert.equal(h.window.startSimulatedGeneration(f.target), false);
  assert.deepEqual(plain(h.state.account), account);
  h.window.undoLastAction();
  assert.equal(h.window.REELAY_CANVAS_PROMPT_DOCUMENT.resolve(f.target.prompt, h.window.getNodeReferenceEntries(f.target)).valid, true);
  assert.match(chip().textContent, /图片2/);
  assert.deepEqual(plain(f.target.prompt), original);
});

test("node and canvas copies remap prompt atoms with the same copied input identities", (t) => {
  const h = createHarness(t);
  const f = installReferenceOrderFixture(h);
  f.target.prompt = promptDocument(promptReference("asset:local-image", "image", "图片2"), "跟随", promptReference("connection:video-link", "video", "视频1"));
  const copiedNode = h.window.cloneNode(f.target);
  assert.equal(copiedNode.prompt.content[0].key, `asset:${copiedNode.assets[0].id}`);
  assert.equal(copiedNode.prompt.content[2].key, "connection:video-link", "uncopied connections remain identifiable missing references");
  h.state.nodes.push(copiedNode);
  assert.equal(h.window.REELAY_CANVAS_PROMPT_DOCUMENT.resolve(copiedNode.prompt, h.window.getNodeReferenceEntries(copiedNode)).missing[0].key, "connection:video-link");
  h.state.nodes.pop();
  const copied = h.window.cloneCanvasContent(f.canvas);
  const target = copied.nodes.find((node) => node.kind === "generator");
  const video = copied.nodes.find((node) => node.kind === "asset" && node.mode === "video");
  const copiedLink = copied.connections.find((connection) => connection.sourceNodeId === video.id);
  assert.equal(target.prompt.content[0].key, `asset:${target.assets[0].id}`);
  assert.equal(target.prompt.content[2].key, `connection:${copiedLink.id}`);
  assert.notEqual(target.prompt.content, f.target.prompt.content);
  h.install(h.canvas("copy", copied.nodes, copied.groups, copied.connections));
  assert.equal(h.window.REELAY_CANVAS_PROMPT_DOCUMENT.resolve(target.prompt, h.window.getNodeReferenceEntries(target)).valid, true);
});

for (const undoScope of ["editor", "canvas"]) {
  test(`structured optimization keeps atoms and ${undoScope} undo does not duplicate the other history`, (t) => {
    const h = createHarness(t);
    const f = installReferenceOrderFixture(h);
    const initial = promptDocument("  人物  ", promptReference("asset:local-image", "image", "图片2"), "  走进森林  ");
    f.target.prompt = initial;
    h.window.render();
    const input = f.element.querySelector(".prompt-editor-content");
    const editor = h.editorFor(input);
    h.moveNode(f.target.id, 110, 80);
    assert.equal(h.window.startPromptOptimization(f.target), true);
    h.fireTimer(h.scheduledTask().timeoutId);
    assert.notDeepEqual(plain(f.target.prompt), initial);
    assert.deepEqual(plain(f.target.prompt.content.filter((part) => part.type === "reference")), [initial.content[1]]);
    const optimized = plain(f.target.prompt);
    const action = f.canvas.undoStack.find((action) => action.type === "prompt-update");
    assert.ok(action);
    const moved = { x: f.target.x, y: f.target.y };
    if (undoScope === "editor") {
      editor.focus();
      assert.equal(editor.undo(), true);
      assert.deepEqual(plain(f.target.prompt), initial);
      assert.equal(f.canvas.undoStack.includes(action), false, "local undo retires the same canvas optimization marker");
      assert.equal(f.canvas.undoStack.length, 1, "movement remains independently undoable");
      assert.equal(editor.redo(), true);
      assert.deepEqual(plain(f.target.prompt), optimized);
      assert.equal(f.canvas.undoStack.filter((entry) => entry === action).length, 1, "local redo restores exactly one matching canvas marker");
      editor.blur();
      h.window.undoLastAction();
      assert.deepEqual(plain(f.target.prompt), initial, "one canvas undo consumes the redone optimization");
      assert.equal(f.canvas.undoStack.includes(action), false);
      assert.equal(editor.undo(), false, "the editor cannot undo that same optimization for a second time");
      assert.equal(editor.redo(), false, "canvas undo restores the preceding editor history without a stale redo branch");
      assert.deepEqual({ x: f.target.x, y: f.target.y }, moved);
      h.window.undoLastAction();
      assert.deepEqual({ x: f.target.x, y: f.target.y }, { x: 10, y: 20 }, "the very next canvas undo reaches movement without a stale marker");
      assert.deepEqual(plain(f.target.prompt), initial);
    } else {
      editor.blur();
      h.window.undoLastAction();
      assert.deepEqual(plain(f.target.prompt), initial);
      assert.deepEqual(plain(editor.getDocument()), initial);
      assert.equal(f.canvas.undoStack.includes(action), false);
      assert.equal(editor.undo(), false, "canvas optimization undo restores the prior editor history");
      assert.equal(editor.redo(), false);
    }
  });
}

for (const editorState of ["open", "closed"]) {
  test(`successful generation clears prompt editing and optimization history while its editor is ${editorState}`, (t) => {
    const h = createHarness(t);
    const asset = { id: "portrait", type: "image", name: "人物", url: "/portrait.png" };
    const node = h.node("video", { expanded: true, assets: [asset], activeAssetId: asset.id });
    const canvas = h.canvas("history-boundary", [node]);
    h.install(canvas);
    const input = h.window.document.querySelector('.canvas-node[data-id="video"] .prompt-editor-content');
    h.setText(input, "让人物走向森林，使用");
    const editor = h.editorFor(input);
    assert.equal(editor.insertReference("asset:portrait"), true);
    h.moveNode(node.id, 100, 60);
    assert.equal(h.window.startPromptOptimization(node), true);
    h.fireTimer(h.scheduledTask().timeoutId);
    const submitted = plain(node.prompt);
    assert.equal(canvas.undoStack.some((action) => action.type === "prompt-update"), true);
    assert.equal(h.window.startSimulatedGeneration(node), true);
    const generation = h.scheduledTask();
    if (editorState === "closed") {
      node.expanded = false;
      h.window.render();
      assert.equal(h.window.canvasTest.promptEditors.get(node), null);
    }
    h.fireTimer(generation.timeoutId);
    assert.ok(node.generatedAsset);
    assert.equal(canvas.undoStack.some((action) => action.type === "prompt-update"), false);
    node.expanded = true;
    h.window.render();
    const current = h.window.canvasTest.promptEditors.get(node);
    assert.ok(current);
    assert.deepEqual(plain(current.getDocument()), submitted);
    assert.equal(current.undo(), false, "successful generation clears text, reference-insertion and optimization undo together");
    assert.equal(current.redo(), false);
    current.blur();
    h.window.undoLastAction();
    assert.deepEqual({ x: node.x, y: node.y }, { x: 10, y: 20 });
    assert.deepEqual(plain(node.prompt), submitted);
    assert.equal(canvas.undoStack.length, 0);
  });
}

test("reference ordering keeps mixed shelf numbering and real generation snapshots in the same order", (t) => {
  const h = createHarness(t);
  const f = installReferenceOrderFixture(h);
  assert.deepEqual(plain(h.window.getNodeReferenceEntries(f.target).map((entry) => entry.key)), [
    "connection:image-link", "connection:video-link", "asset:local-image", "asset:local-video",
  ]);
  assert.equal(h.window.moveNodeReference(f.context(), { sourceKey: "asset:local-video", targetKey: "connection:image-link", placement: "before" }), true);
  const expected = ["asset:local-video", "connection:image-link", "connection:video-link", "asset:local-image"];
  const entries = h.window.getNodeReferenceEntries(f.target);
  assert.deepEqual(plain(entries.map((entry) => entry.key)), expected);
  assert.equal(entries[0].asset, f.localVideo);
  assert.equal(entries[1].asset, f.linkedImage);
  const cards = [...f.element.querySelectorAll("[data-reference-key]")];
  assert.deepEqual(cards.map((card) => card.dataset.referenceKey), expected);
  assert.deepEqual(cards.map((card) => card.querySelector(".reference-number").textContent), ["1", "1", "2", "2"]);
  assert.ok(cards.every((card, index) => card.getAttribute("aria-label").startsWith(`${["视频1", "图片1", "视频2", "图片2"][index]}：`)));
  const snapshot = h.window.createGenerationParameterSnapshot(f.target);
  assert.deepEqual(plain(snapshot.referenceOrder), expected);
  assert.deepEqual(plain(snapshot.assetIds), ["local-video", "local-image"]);
  assert.deepEqual(plain(snapshot.referenceVideos.map(({ assetId, sourceNodeId, duration }) => ({ assetId, sourceNodeId, duration }))), [
    { assetId: "local-video", sourceNodeId: null, duration: 12 },
    { assetId: "linked-video", sourceNodeId: "video-source", duration: 8 },
  ]);
  assert.equal(f.canvas.undoStack.length, 1);
});

test("reference ordering and its single undo retain the live prompt editor, reading position and unrelated content", (t) => {
  const h = createHarness(t);
  const f = installReferenceOrderFixture(h);
  const assets = f.target.assets;
  const input = f.element.querySelector("[data-node-prompt-input] .prompt-editor-content");
  const panel = f.element.querySelector(".prompt-panel");
  h.setText(input, "长提示词与图片参考保持独立。".repeat(120));
  input.focus();
  h.selectText(input, 7, 31, "backward");
  input.parentElement.scrollTop = 640;
  f.element.querySelector(".asset-shelf").scrollLeft = 72;
  let editorDocument = h.editorFor(input).view.state.doc;
  assert.equal(h.window.moveNodeReference(f.context(), { sourceKey: "asset:local-image", targetKey: "connection:image-link", placement: "before" }), true);
  assert.equal(f.element.querySelector(".asset-shelf").scrollLeft, 72);
  assert.equal(f.canvas.undoStack.length, 1);
  const history = f.canvas.undoStack[0];
  assert.equal(history.command.type, "node-reference-order");
  assert.deepEqual(Object.keys(history.command.changes[0].before.fields), ["referenceOrder"]);
  assert.equal(Object.hasOwn(history.command.changes[0].before, "record"), false);
  const assertEditor = () => {
    assert.equal(f.element.querySelector("[data-node-prompt-input] .prompt-editor-content"), input);
    assert.equal(f.element.querySelector(".prompt-panel"), panel);
    assert.equal(h.window.document.activeElement, input);
    assert.equal(input.parentElement.scrollTop, 640);
    assert.deepEqual(h.selection(input), [7, 31, "backward"]);
    assert.equal(h.editorFor(input).view.state.doc, editorDocument, "reordering must preserve the editor document and text history");
  };
  assertEditor();
  // Model metadata and a later native edit are deliberately outside this command.
  f.localVideo.duration = 18;
  f.target.duration = "15s";
  h.setText(input, `${h.getText(input)}继续描述`);
  editorDocument = h.editorFor(input).view.state.doc;
  h.selectText(input, 7, 31, "backward");
  input.parentElement.scrollTop = 640;
  const editedPrompt = h.getText(input);
  h.window.undoLastAction();
  assert.equal(f.canvas.undoStack.length, 0);
  assert.equal(Object.hasOwn(f.target, "referenceOrder"), false, "the first reorder undoes to the legacy default order");
  assert.equal(f.canvas.nodes[2], f.target);
  assert.equal(f.target.assets, assets);
  assert.equal(f.target.assets[1], f.localVideo);
  assert.equal(f.localVideo.duration, 18);
  assert.equal(f.target.duration, "15s");
  assert.equal(h.promptText(f.target.prompt), editedPrompt);
  assertEditor();
});

test("reference ordering rejects no-op, busy, stale-scope, replaced-node and changed-reference sessions without undo", (t) => {
  const h = createHarness(t);
  const f = installReferenceOrderFixture(h);
  const move = (context, sourceKey = "asset:local-video", targetKey = "connection:image-link", placement = "before") =>
    h.window.moveNodeReference(context, { sourceKey, targetKey, placement });
  const rejectWithoutChange = (context, ...args) => {
    const before = plain(f.canvas);
    assert.equal(move(context, ...args), false);
    assert.deepEqual(plain(f.canvas), before);
    assert.equal(f.canvas.undoStack.length, 0);
  };
  rejectWithoutChange(f.context(), "connection:image-link", "connection:video-link");
  rejectWithoutChange(f.context(), "asset:local-video", "asset:local-video");
  rejectWithoutChange(f.context(), "asset:missing");
  for (const busy of ["generating", "promptOptimizing"]) {
    const context = f.context();
    f.target[busy] = true;
    assert.equal(f.context().canReorder, false);
    rejectWithoutChange(context);
    f.target[busy] = false;
  }
  const staleProject = f.context();
  const projectId = h.state.projectId;
  h.state.projectId = "other-project";
  rejectWithoutChange(staleProject);
  h.state.projectId = projectId;
  rejectWithoutChange({ ...f.context(), scope: JSON.stringify([projectId, "other-canvas"]) });
  rejectWithoutChange({ ...f.context(), nodeId: "another-id" });
  const staleNode = f.context();
  f.canvas.nodes[2] = { ...f.target };
  rejectWithoutChange(staleNode);
  f.canvas.nodes[2] = f.target;
  const staleSequence = f.context();
  f.target.assets.reverse();
  rejectWithoutChange(staleSequence);
  f.target.assets.reverse();
  const staleEntries = f.context();
  f.target.assets.push({ id: "later", type: "image", url: "/later.png" });
  rejectWithoutChange(staleEntries);
});

test("reference ordering respects the real readonly host boundary", (t) => {
  const h = createHarness(t);
  const f = installReferenceOrderFixture(h);
  const context = f.context();
  const host = { postMessage() {} };
  Object.defineProperty(h.window, "parent", { configurable: true, value: host });
  const dispatch = (data) => h.window.canvasTest.canvasPersistence.handleHostMessage({
    origin: h.window.location.origin, source: host, data: { source: "reelay-shell", ...data },
  });
  dispatch({ type: "host:init", context: { protocolVersion: 1, projectId: h.state.projectId, canvasId: f.canvas.id, writable: false } });
  dispatch({ type: "host:document", protocolVersion: 1, document: null, writable: false });
  assert.equal(h.window.canvasTest.canvasPersistence.getAccessMode(), "readonly");
  assert.ok(h.state.nodes.includes(f.target), "the target remains live so rejection exercises access, not a stale object");
  assert.equal(context.scope, JSON.stringify([h.state.projectId, h.state.activeCanvasId]));
  assert.equal(f.context().canReorder, false);
  const before = plain(h.window.createCanvasDocumentSnapshot());
  assert.equal(h.window.moveNodeReference(context, { sourceKey: "asset:local-video", targetKey: "connection:image-link", placement: "before" }), false);
  assert.deepEqual(plain(h.window.createCanvasDocumentSnapshot()), before);
  assert.equal(f.canvas.undoStack.length, 0);
});

test("reference ordering survives real node and canvas copies with remapped local and linked ids", (t) => {
  const h = createHarness(t);
  const f = installReferenceOrderFixture(h);
  f.target.referenceOrder = ["asset:local-video", "connection:image-link", "asset:local-image", "connection:video-link", "connection:outside", "asset:removed"];
  const original = plain({ nodes: f.canvas.nodes, groups: f.canvas.groups, connections: f.canvas.connections });
  const nodeCopy = h.window.cloneNode(f.target);
  assert.notEqual(nodeCopy.id, f.target.id);
  assert.notEqual(nodeCopy.assets[0], f.localImage);
  assert.deepEqual(plain(nodeCopy.referenceOrder), [`asset:${nodeCopy.assets[1].id}`, `asset:${nodeCopy.assets[0].id}`]);
  assert.equal(nodeCopy.activeAssetId, nodeCopy.assets[0].id);
  assert.equal(nodeCopy.prompt, f.target.prompt);
  assert.equal(nodeCopy.assets[1].duration, f.localVideo.duration);
  const copied = h.window.cloneCanvasContent(f.canvas);
  const copiedTarget = copied.nodes[2];
  const imageLink = copied.connections.find((connection) => connection.sourceNodeId === copied.nodes[0].id);
  const videoLink = copied.connections.find((connection) => connection.sourceNodeId === copied.nodes[1].id);
  assert.ok(imageLink && videoLink);
  assert.equal(imageLink.targetNodeId, copiedTarget.id);
  assert.equal(videoLink.targetNodeId, copiedTarget.id);
  assert.deepEqual(plain(copiedTarget.referenceOrder), [
    `asset:${copiedTarget.assets[1].id}`, `connection:${imageLink.id}`, `asset:${copiedTarget.assets[0].id}`, `connection:${videoLink.id}`,
  ]);
  assert.deepEqual(plain({ nodes: f.canvas.nodes, groups: f.canvas.groups, connections: f.canvas.connections }), original);
  assert.notEqual(copiedTarget.assets[0], f.localImage);
  h.install(h.canvas("reference-copy", copied.nodes, copied.groups, copied.connections));
  assert.deepEqual(plain(h.window.getNodeReferenceEntries(copiedTarget).map((entry) => entry.key)), plain(copiedTarget.referenceOrder));
  const legacy = h.node("legacy", { assets: [f.localImage] });
  assert.equal(Object.hasOwn(h.window.cloneNode(legacy), "referenceOrder"), false);
  assert.equal(Object.hasOwn(h.window.cloneCanvasContent(h.canvas("legacy-canvas", [legacy])).nodes[0], "referenceOrder"), false);
});

function prepareLibraryDrag(h) {
  const assets = [
    { id: "drag-image", type: "image", name: "drag-fixture image", url: "https://example.test/drag.png", aspectRatio: 1.5 },
    { id: "drag-video", type: "video", name: "drag-fixture video", url: "https://example.test/drag.mp4", aspectRatio: 16 / 9 },
    { id: "drag-audio", type: "audio", name: "drag-fixture audio", url: "https://example.test/drag.mp3" },
  ];
  h.window.registerLibraryAssets(assets, "personal");
  h.window.switchAssetLibraryContext({ space: "personal", section: "media" });
  h.state.librarySearch = "drag-fixture";
  h.window.openAssetLibrary();
  const card = (id) => h.window.document.querySelector(`[data-library-media="${id}"]`);
  function transfer() {
    const values = new Map();
    return {
      get types() { return [...values.keys()]; },
      getData(type) { return values.get(type) || ""; },
      setData(type, value) { values.set(type, value); },
      effectAllowed: "uninitialized",
      dropEffect: "none",
    };
  }
  function dispatch(type, target, dataTransfer, options = {}) {
    const event = new h.window.MouseEvent(type, {
      bubbles: true, cancelable: true, clientX: 800, clientY: 400, ...options,
    });
    Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
    target.dispatchEvent(event);
    return event;
  }
  function drag(id) {
    const dataTransfer = transfer();
    dispatch("dragstart", card(id), dataTransfer);
    return dataTransfer;
  }
  function drop(dataTransfer, target = h.window.document.querySelector("#canvasShell")) {
    return dispatch("drop", target, dataTransfer);
  }
  return { assets, card, transfer, dispatch, drag, drop };
}

test("dragging a selected library card places all visible selected media in one undoable canvas batch", (t) => {
  const h = createHarness(t);
  const first = h.canvas("library-drop");
  const second = h.canvas("other");
  h.install(first, second);
  const library = prepareLibraryDrag(h);
  library.card("drag-video").querySelector("[data-library-select]").click();
  library.card("drag-image").querySelector("[data-library-select]").click();
  h.state.librarySelectedIds.add("hidden-stale-selection");
  const payload = library.transfer();
  let dragPreview;
  payload.setDragImage = (element) => { dragPreview = element; };
  library.dispatch("dragstart", library.card("drag-video"), payload);
  assert.equal(dragPreview.textContent, "2 个素材");
  assert.equal(dragPreview.querySelector("video, img"), null, "drag preview must not reload media");
  const expected = [...h.window.document.querySelectorAll("[data-library-media]")]
    .map((element) => element.dataset.libraryMedia)
    .filter((id) => h.state.librarySelectedIds.has(id));
  assert.deepEqual(JSON.parse(payload.getData("application/x-reelay-asset")).assetIds, expected);
  library.drop(payload);
  library.dispatch("dragend", library.card("drag-video"), payload);
  assert.equal(dragPreview.isConnected, false);
  assert.equal(h.window.document.querySelector(".asset-library-drag-preview"), null);
  assert.equal(first.nodes.length, 2);
  assert.deepEqual(plain(first.nodes.map((node) => node.assets[0].librarySourceId)), expected);
  assert.equal(first.undoStack.length, 1);
  assert.equal(first.undoStack[0].type, "create");
  assert.deepEqual([...h.state.selectedIds], first.nodes.map((node) => node.id));
  assert.equal(second.nodes.length, 0);
  assert.equal(second.undoStack.length, 0);
  const [left, right] = first.nodes.map((node) => ({ ...node, layout: h.window.getNodeLayout(node) }));
  assert.ok(left.x + left.layout.nodeWidth <= right.x, "batch items must not overlap");
  h.window.undoLastAction();
  assert.equal(first.nodes.length, 0);
  assert.equal(first.undoStack.length, 0);
});

test("dragging an unselected library card keeps the gesture single even during multi-select", (t) => {
  const h = createHarness(t);
  const first = h.canvas("single-library-drop");
  h.install(first);
  const library = prepareLibraryDrag(h);
  library.card("drag-video").querySelector("[data-library-select]").click();
  library.card("drag-image").querySelector("[data-library-select]").click();
  const selectedBefore = [...h.state.librarySelectedIds];
  const payload = library.drag("drag-audio");
  assert.deepEqual(JSON.parse(payload.getData("application/x-reelay-asset")).assetIds, ["drag-audio"]);
  library.drop(payload);
  assert.equal(first.nodes.length, 1);
  assert.equal(first.nodes[0].assets[0].librarySourceId, "drag-audio");
  assert.deepEqual([...h.state.librarySelectedIds], selectedBefore);
  assert.equal(first.undoStack.length, 1);
});

test("library dragover restores copy after crossing the panel for both grid and list destinations", (t) => {
  const h = createHarness(t);
  h.install(h.canvas("library-dragover", [h.node("drop-target")]));
  const library = prepareLibraryDrag(h);
  library.card("drag-video").querySelector("[data-library-select]").click();
  library.card("drag-image").querySelector("[data-library-select]").click();
  const shell = h.window.document.querySelector("#canvasShell");
  for (const display of ["grid", "list"]) {
    if (h.state.libraryDisplay !== display) {
      h.window.document.querySelector("#assetLibraryCommandBar button[data-library-display]").click();
    }
    assert.equal(h.state.libraryDisplay, display);
    const dataTransfer = library.drag("drag-video");
    for (const destination of [shell, h.window.document.querySelector('[data-id="drop-target"]')]) {
      const rejected = library.dispatch("dragover", library.card("drag-video"), dataTransfer);
      assert.equal(rejected.defaultPrevented, true);
      assert.equal(dataTransfer.dropEffect, "none");
      assert.equal(shell.classList.contains("file-dragging"), false);
      const accepted = library.dispatch("dragover", destination, dataTransfer);
      assert.equal(accepted.defaultPrevented, true);
      assert.equal(dataTransfer.dropEffect, "copy", `${display} drag must recover from the panel's rejected target`);
      assert.equal(shell.classList.contains("file-dragging"), true);
    }
    library.dispatch("dragend", library.card("drag-video"), dataTransfer);
    assert.equal(shell.classList.contains("file-dragging"), false);
  }
});

test("library video cards retain their media when checking a corner box and clicking blank canvas", (t) => {
  const h = createHarness(t);
  h.install(h.canvas("library-media-stability", [h.node("selected-node")]));
  const library = prepareLibraryDrag(h);
  const card = library.card("drag-video");
  const video = card.querySelector("video");
  const preview = card.querySelector("[data-library-preview]");
  assert.ok(video);
  video.currentTime = 3;
  card.querySelector("[data-library-select]").click();
  assert.equal(h.state.librarySelectionMode, true);
  assert.equal(h.state.librarySelectedIds.has("drag-video"), true);
  assert.equal(library.card("drag-video"), card);
  assert.equal(card.querySelector("video"), video);
  h.window.setSelection(["selected-node"], "selected-node");
  h.window.render();
  const shell = h.window.document.querySelector("#canvasShell");
  for (const type of ["pointerdown", "pointerup"]) {
    const event = new h.window.MouseEvent(type, {
      bubbles: true, cancelable: true, button: 0, clientX: 800, clientY: 400,
    });
    Object.defineProperty(event, "pointerId", { value: 12 });
    shell.dispatchEvent(event);
  }
  assert.equal(h.state.selectedIds.size, 0, "the real blank-canvas gesture clears node selection");
  assert.equal(library.card("drag-video"), card);
  assert.equal(card.querySelector("[data-library-preview]"), preview);
  assert.equal(card.querySelector("video"), video);
  assert.equal(video.currentTime, 3);
  assert.equal(h.state.librarySelectedIds.has("drag-video"), true);
});

test("library batch drop appends generator references once and undo preserves later content", (t) => {
  const h = createHarness(t);
  const original = { id: "original-reference", type: "image", url: "https://example.test/original.png" };
  const target = h.node("library-target", { model: "seedance-2", assets: [original], activeAssetId: original.id });
  const first = h.canvas("generator-library-drop", [target]);
  h.install(first);
  const library = prepareLibraryDrag(h);
  library.card("drag-image").querySelector("[data-library-select]").click();
  library.card("drag-video").querySelector("[data-library-select]").click();
  const payload = library.drag("drag-image");
  library.drop(payload, h.window.document.querySelector('[data-id="library-target"]'));
  assert.equal(target.assets.length, 3);
  assert.equal(first.nodes.length, 1);
  assert.equal(first.undoStack.length, 1);
  assert.equal(first.undoStack[0].type, "node-assets-add");
  assert.equal(first.undoStack[0].addedAssetIds.length, 2);
  assert.ok(target.assets.slice(1).every((asset) => asset.id !== asset.librarySourceId));
  original.displayName = "仍然保留的新名称";
  const later = { id: "later-reference", type: "audio", url: "https://example.test/later.mp3" };
  target.assets.push(later);
  target.prompt = "追加后继续编辑";
  h.window.undoLastAction();
  assert.deepEqual(plain(target.assets.map((asset) => asset.id)), [original.id, later.id]);
  assert.equal(target.assets[0], original);
  assert.equal(original.displayName, "仍然保留的新名称");
  assert.equal(target.activeAssetId, original.id);
  assert.equal(target.prompt, "追加后继续编辑");
});

test("library drag rejects malformed, stale-scope, hidden-media and readonly drops atomically", (t) => {
  const h = createHarness(t);
  const first = h.canvas("validated-library-drop");
  const second = h.canvas("other-library-drop");
  h.install(first, second);
  const library = prepareLibraryDrag(h);
  const valid = library.drag("drag-image");
  const base = JSON.parse(valid.getData("application/x-reelay-asset"));
  const invalidValues = [
    "drag-image", "{", "null", JSON.stringify([]),
    JSON.stringify({ ...base, version: 2 }),
    JSON.stringify({ ...base, assetIds: ["drag-image", "missing"] }),
    JSON.stringify({ ...base, assetIds: ["drag-image", "drag-image"] }),
    JSON.stringify({ ...base, assetIds: [1] }),
    JSON.stringify({ ...base, projectId: "another-project" }),
    JSON.stringify({ ...base, space: "organization" }),
  ];
  for (const value of invalidValues) {
    const payload = library.transfer();
    payload.setData("application/x-reelay-asset", value);
    assert.equal(library.drop(payload).defaultPrevented, true);
    assert.equal(first.nodes.length, 0);
    assert.equal(first.undoStack.length, 0);
  }
  h.state.librarySearch = "drag-fixture video";
  library.drop(valid);
  assert.equal(first.nodes.length, 0, "newly hidden media must not be added from a stale drag");
  h.state.librarySearch = "drag-fixture";
  h.window.switchCanvas(second.id);
  library.drop(valid);
  assert.equal(second.nodes.length, 0);
  assert.equal(second.undoStack.length, 0);
  h.window.switchCanvas(first.id);
  library.drop(valid, h.window.document.querySelector("#assetLibraryGrid"));
  assert.equal(first.nodes.length, 0, "asset panel is not a canvas destination");

  const host = { postMessage() {} };
  Object.defineProperty(h.window, "parent", { configurable: true, value: host });
  const message = (data) => h.window.canvasTest.canvasPersistence.handleHostMessage({
    origin: h.window.location.origin, source: host, data: { source: "reelay-shell", ...data },
  });
  assert.equal(message({ type: "host:init", context: {
    protocolVersion: 1, projectId: h.state.projectId, canvasId: first.id, writable: false,
  } }), true);
  assert.equal(message({ type: "host:document", protocolVersion: 1, document: null, writable: false }), true);
  assert.equal(h.window.canvasTest.canvasPersistence.getAccessMode(), "readonly");
  library.drop(valid);
  assert.equal(first.nodes.length, 0);
  assert.equal(first.undoStack.length, 0);
  const blocked = library.transfer();
  const event = library.dispatch("dragstart", library.card("drag-image"), blocked);
  assert.equal(event.defaultPrevented, true);
  assert.equal(blocked.types.length, 0);
});

test("media toolbar defaults to icons while preserving explicit saved label choices", (t) => {
  const { window } = createHarness(t);
  for (const saved of [null, { image: { tools: ["crop"] } }, {
    image: { tools: ["crop"], showLabels: true },
    video: { tools: ["trim"], showLabels: false },
  }]) {
    window.localStorage.setItem("reelay-media-tools", JSON.stringify(saved));
    const preferences = window.loadMediaToolPreferences();
    assert.equal(preferences.image.showLabels, saved?.image?.showLabels === true);
    assert.equal(preferences.video.showLabels, false);
    assert.equal(preferences.audio.showLabels, false);
    if (saved?.image) assert.deepEqual(plain(preferences.image.tools), ["crop"]);
  }
});

test("media toolbar retains its screen size across the full canvas zoom range", (t) => {
  const h = createHarness(t);
  const nodes = [h.node("image", { mode: "image" }), h.node("video", { mode: "video" }), {
    kind: "asset", assets: [{ id: "media", type: "image", aspectRatio: 16 / 9 }], activeAssetId: "media",
  }];
  for (const scale of [0.2, 0.28, 0.5, 1, 1.65, 2]) {
    h.state.scale = scale;
    for (const node of nodes) {
      assert.ok(Math.abs(h.window.getNodeLayout(node).toolbarScale * scale - 1) < 1e-10);
    }
  }
});

test("media toolbar is not pushed back into view when its node moves above the viewport", (t) => {
  const h = createHarness(t);
  const node = h.window.defaultAssetNode(100, -200, {
    id: "image", type: "image", url: "blob:http://reelay.test/image", width: 1280, height: 714,
  });
  h.install(h.canvas("main", [node]));
  h.window.setSelection([node.id], node.id);
  h.state.mediaToolbarNodeId = node.id;
  h.window.render();
  const element = h.window.document.querySelector(`[data-id="${node.id}"]`);
  const toolbar = element.querySelector("[data-media-toolbar]");
  assert.ok(toolbar);
  toolbar.getBoundingClientRect = () => ({ top: -280, bottom: -238, left: 100, right: 500, width: 400, height: 42 });
  for (const scale of [0.2, 1, 2]) {
    h.state.scale = scale;
    h.window.syncNodeVisualLayout(node, element);
    assert.equal(toolbar.style.getPropertyValue("--toolbar-nudge"), "");
    assert.equal(element.style.top, "-200px");
  }
});

function assertMembership(canvas) {
  for (const current of canvas.groups) {
    for (const id of current.nodeIds) {
      assert.equal(canvas.nodes.find((node) => node.id === id)?.groupId, current.id);
    }
  }
  for (const node of canvas.nodes) {
    if (node.groupId) assert.ok(canvas.groups.find((group) => group.id === node.groupId)?.nodeIds.includes(node.id));
  }
}

for (const selected of [["a"], ["a", "c"], ["a", "b", "c"], ["a", "b", "c", "d"]]) {
  test(`deleting ${selected.join(",")} preserves remaining groups and undo restores membership and order`, (t) => {
    const h = createHarness(t);
    const nodes = ["a", "b", "c", "d", "outside"].map((id) => h.node(id, {
      ...(id !== "outside" ? { groupId: ["a", "b"].includes(id) ? "first" : "second" } : {}),
    }));
    const groups = [group("first", ["a", "b"]), group("untouched-empty", []), group("second", ["c", "d"])];
    const connections = [
      { id: "a-b", sourceNodeId: "a", targetNodeId: "b" },
      { id: "c-d", sourceNodeId: "c", targetNodeId: "d" },
      { id: "b-outside", sourceNodeId: "b", targetNodeId: "outside" },
    ];
    const first = h.canvas("one", nodes, groups, connections);
    const second = h.canvas("two", [h.node("a")], [group("other-empty", [])]);
    h.install(first, second);
    const beforeGroups = plain(first.groups);
    const beforeConnections = plain(first.connections);
    const otherCanvas = plain(second);
    h.window.setSelection(selected);
    h.window.deleteSelectedNodes(true);
    assert.deepEqual(plain(first.nodes.map((node) => node.id)), ["a", "b", "c", "d", "outside"].filter((id) => !selected.includes(id)));
    assert.deepEqual(plain(first.groups), beforeGroups.flatMap((item) => {
      const nodeIds = item.nodeIds.filter((id) => !selected.includes(id));
      return item.nodeIds.length && !nodeIds.length ? [] : [{ ...item, nodeIds }];
    }));
    assertMembership(first);
    assert.equal(first.undoStack.length, 1);
    assert.deepEqual(plain(second), otherCanvas);
    h.window.undoLastAction();
    assert.deepEqual(plain(first.nodes.map((node) => node.id)), ["a", "b", "c", "d", "outside"]);
    assert.deepEqual(plain(first.groups), beforeGroups);
    assert.deepEqual(plain(first.connections), beforeConnections);
    assertMembership(first);
    assert.equal(first.undoStack.length, 0);
    assert.deepEqual(plain(second), otherCanvas);
  });
}

test("deleting every group member requires confirmation and undo restores the complete group", (t) => {
  const h = createHarness(t);
  const first = h.canvas("one", [h.node("a", { groupId: "group" }), h.node("b", { groupId: "group" })], [group("group", ["a", "b"])]);
  h.install(first);
  h.window.setSelection(["a", "b"]);
  h.window.deleteSelectedNodes();
  assert.equal(first.nodes.length, 2);
  assert.equal(first.undoStack.length, 0);
  const dialog = h.window.document.querySelector(".confirm-layer");
  assert.ok(dialog);
  const description = h.window.document.getElementById(dialog.getAttribute("aria-describedby"));
  assert.match(description.textContent, /可通过撤销恢复/);
  assert.equal(h.window.document.activeElement, dialog.querySelector(".confirm-cancel"));
  dialog.dispatchEvent(new h.window.Event("cancel", { cancelable: true }));
  assert.equal(h.window.document.querySelector(".confirm-layer"), null);
  assert.equal(first.nodes.length, 2, "dismissing confirmation must retain the group content");
  assert.equal(first.undoStack.length, 0);
  h.window.deleteSelectedNodes();
  h.window.document.querySelector(".confirm-ok").click();
  assert.equal(first.nodes.length, 0);
  assert.equal(first.groups.length, 0);
  h.window.undoLastAction();
  assert.deepEqual(plain(first.groups[0].nodeIds), ["a", "b"]);
  assertMembership(first);
});

for (const dx of [120, 1500]) {
  test(`prompt optimization undo preserves a ${dx}px move and its membership change`, (t) => {
    const h = createHarness(t);
    const node = h.node("video", { prompt: "  一只狐狸走过森林  ", groupId: "group" });
    const first = h.canvas("one", [node], [group("group", [node.id])]);
    h.install(first);
    const originalPrompt = node.prompt;
    assert.equal(h.window.startPromptOptimization(node), true);
    const task = h.scheduledTask();
    h.moveNode(node.id, dx, 80);
    const moved = { x: node.x, y: node.y, z: node.z, groupId: node.groupId };
    h.fireTimer(task.timeoutId);
    assert.notEqual(node.prompt, originalPrompt);
    assert.equal(node.promptOptimizing, false);
    assert.equal(first.undoStack.length, 2);
    h.window.undoLastAction();
    assert.equal(first.nodes[0], node, "prompt undo must preserve the live node object");
    assert.equal(node.prompt, originalPrompt);
    assert.deepEqual({ x: node.x, y: node.y, z: node.z, groupId: node.groupId }, moved);
    assert.equal(first.undoStack.length, 1);
    h.window.undoLastAction();
    assert.deepEqual({ x: node.x, y: node.y }, { x: 10, y: 20 });
    assert.equal(node.prompt, originalPrompt);
    assertMembership(first);
  });
}

test("editing an optimized prompt retires only the superseded field undo, without blocking earlier movement", (t) => {
  const h = createHarness(t);
  const node = h.node("video");
  const first = h.canvas("one", [node]);
  h.install(first);
  h.moveNode(node.id, 100, 100);
  h.window.startPromptOptimization(node);
  h.fireTimer(h.scheduledTask().timeoutId);
  node.expanded = true;
  h.window.render();
  const promptInput = h.window.document.querySelector('.canvas-node[data-id="video"] .prompt-editor-content');
  h.setText(promptInput, "手动修改的提示词");
  h.window.undoLastAction();
  assert.equal(h.promptText(node.prompt), "手动修改的提示词");
  assert.equal(first.undoStack.length, 1);
  assert.deepEqual({ x: node.x, y: node.y }, { x: 110, y: 120 });
  h.window.undoLastAction();
  assert.equal(h.promptText(node.prompt), "手动修改的提示词");
  assert.equal(first.undoStack.length, 0);
  assert.deepEqual({ x: node.x, y: node.y }, { x: 10, y: 20 });
});

test("background optimization writes and undoes only on its originating canvas", (t) => {
  const h = createHarness(t);
  const node = h.node("shared-id");
  const first = h.canvas("one", [node]);
  const second = h.canvas("two", [h.node("shared-id", { prompt: "另一个画布" })]);
  h.install(first, second);
  const originalPrompt = node.prompt;
  h.window.startPromptOptimization(node);
  const task = h.scheduledTask();
  h.window.switchCanvas(second.id);
  const otherCanvas = plain(second);
  h.fireTimer(task.timeoutId);
  assert.notEqual(node.prompt, originalPrompt);
  assert.equal(first.undoStack.length, 1);
  assert.deepEqual(plain(second), otherCanvas);
  h.window.undoLastAction();
  assert.notEqual(node.prompt, originalPrompt);
  h.window.switchCanvas(first.id);
  h.window.undoLastAction();
  assert.equal(node.prompt, originalPrompt);
  assert.deepEqual(plain(second), otherCanvas);
});

test("deleted nodes cancel optimization without resurrecting task state on undo", (t) => {
  const h = createHarness(t);
  const node = h.node("video");
  const first = h.canvas("one", [node]);
  h.install(first);
  h.window.startPromptOptimization(node);
  const task = h.scheduledTask();
  const staleCallback = h.timers.get(task.timeoutId);
  h.window.setSelection([node.id]);
  h.window.deleteSelectedNodes();
  assert.equal(node.promptOptimizing, false);
  assert.equal(h.timers.has(task.timeoutId), false);
  h.window.undoLastAction();
  staleCallback();
  assert.equal(first.nodes[0].prompt, node.prompt);
  assert.equal(first.nodes[0].promptOptimizing, false);
  assert.equal(first.undoStack.length, 0);
});

test("optimization ignores replaced prompts and another project", (t) => {
  const h = createHarness(t);
  const node = h.node("video");
  const first = h.canvas("one", [node]);
  h.install(first);
  h.window.startPromptOptimization(node);
  let task = h.scheduledTask();
  node.prompt = "新输入";
  h.fireTimer(task.timeoutId);
  assert.equal(node.prompt, "新输入");
  assert.equal(first.undoStack.length, 0);
  h.window.startPromptOptimization(node);
  task = h.scheduledTask();
  h.state.projectId = "another-project";
  h.fireTimer(task.timeoutId);
  assert.equal(node.prompt, "新输入");
  assert.equal(first.undoStack.length, 0);
});

test("successful generation remains a boundary for prompt undo without removing move undo", (t) => {
  const h = createHarness(t);
  const node = h.node("video");
  const first = h.canvas("one", [node]);
  h.install(first);
  h.window.startPromptOptimization(node);
  const task = h.scheduledTask();
  h.moveNode(node.id, 100, 100);
  h.fireTimer(task.timeoutId);
  const optimized = node.prompt;
  assert.equal(h.window.startSimulatedGeneration(node), true);
  const generation = h.scheduledTask();
  h.window.undoLastAction();
  assert.equal(first.undoStack.length, 2, "generation prevents undoing prompt parameters in flight");
  h.fireTimer(generation.timeoutId);
  assert.equal(first.undoStack.length, 1);
  const result = node.generatedAsset;
  h.window.undoLastAction();
  assert.equal(node.prompt, optimized);
  assert.equal(node.generatedAsset, result);
  assert.deepEqual({ x: node.x, y: node.y }, { x: 10, y: 20 });
});

test("Entity picker expands independent references in one undo and repeated use skips existing media", (t) => {
  const h = createHarness(t);
  const existing = { id: "existing-reference", type: "image", url: "https://example.test/existing.png", displayName: "原参考", aspectRatio: 1 };
  const target = h.node("entity-target", { model: "seedance-2", assets: [existing], activeAssetId: existing.id });
  const first = h.canvas("one", [target]);
  h.install(first);
  const entity = h.window.getEntityUsePickerEntities().find((entry) => entry.spaces.includes("personal") && entry.media.length);
  assert.ok(entity, "expected a usable personal Entity fixture");
  const { canvasEntityUse } = h.window.canvasTest;
  const picker = h.window.document.querySelector("#entityUsePickerPortal");
  function confirmEntity() {
    assert.equal(canvasEntityUse.openPicker(target.id), true);
    picker.querySelector(`[data-entity-use-toggle="${entity.id}"]`).click();
    picker.querySelector('[data-entity-use-action="add-entities"]').click();
  }
  confirmEntity();
  assert.equal(first.undoStack.length, 1);
  assert.equal(first.undoStack[0].type, "node-assets-add");
  assert.equal(picker.hidden, true);
  assert.ok(target.assets.length > 0);
  const expanded = plain(target.assets);
  assert.ok(target.assets.every((asset) => !entity.media.some((media) => media.id === asset.id)), "references receive independent legacy asset ids");
  confirmEntity();
  assert.deepEqual(plain(target.assets), expanded);
  assert.equal(first.undoStack.length, 1, "a duplicate-only confirmation must not add an undo entry");
  existing.displayName = "新的参考名";
  existing.width = 2048;
  const laterReference = { id: "later-reference", type: "image", url: "https://example.test/later.png" };
  target.assets.push(laterReference);
  target.prompt = "使用后继续编辑的提示词";
  target.x = 360;
  const membership = h.window.commitCanvasGroups([group("later-group", [target.id])], { recordUndo: false });
  assert.equal(membership.ok, true);
  h.window.undoLastAction();
  assert.equal(first.nodes[0], target);
  assert.deepEqual(plain(target.assets.map((asset) => asset.id)), [existing.id, laterReference.id]);
  assert.equal(target.assets[0], existing);
  assert.equal(target.assets[1], laterReference);
  assert.equal(existing.displayName, "新的参考名");
  assert.equal(existing.width, 2048);
  assert.equal(target.activeAssetId, existing.id);
  assert.equal(target.prompt, "使用后继续编辑的提示词");
  assert.equal(target.x, 360);
  assert.equal(target.groupId, "later-group");
  assertMembership(first);
  assert.equal(first.undoStack.length, 0);
});

test("Entity-use content adapters reject another project or canvas even when target node ids match", (t) => {
  const h = createHarness(t);
  const first = h.canvas("one", [h.node("same-id", { model: "seedance-2", assets: [] })]);
  const second = h.canvas("two", [h.node("same-id", { model: "seedance-2", assets: [] })]);
  h.install(first, second);
  const entity = h.window.getEntityUsePickerEntities().find((entry) => entry.spaces.includes("personal") && entry.media.length);
  const submission = {
    scope: { projectId: h.state.projectId, canvasId: first.id }, nodeId: "same-id",
    selections: [{ entityId: entity.id, space: "personal" }],
  };
  h.window.switchCanvas(second.id);
  h.window.addSelectedEntitiesToGenerator(submission);
  const created = h.window.addEntityToCanvas({ scope: submission.scope, entityId: entity.id, space: "personal" });
  assert.equal(created.length, 0);
  assert.equal(second.nodes[0].assets.length, 0);
  assert.equal(second.undoStack.length, 0);
  h.window.switchCanvas(first.id);
  h.state.projectId = "another-project";
  h.window.addSelectedEntitiesToGenerator(submission);
  assert.equal(first.nodes[0].assets.length, 0);
  assert.equal(first.undoStack.length, 0);
});

test("Entity canvas consumption creates separate media nodes and undoes the complete expansion once", (t) => {
  const h = createHarness(t);
  const first = h.canvas("one");
  h.install(first);
  const entity = h.window.getEntityUsePickerEntities().find((entry) => entry.spaces.includes("personal") && entry.media.length);
  const scope = { projectId: h.state.projectId, canvasId: first.id };
  const created = h.window.addEntityToCanvas({ scope, entityId: entity.id, space: "personal" });
  assert.ok(created.length > 1);
  assert.equal(first.nodes.length, created.length);
  assert.equal(first.undoStack.length, 1);
  assert.ok(created.every((node) => node.kind === "asset"));
  h.window.undoLastAction();
  assert.equal(first.nodes.length, 0);
  assert.equal(first.undoStack.length, 0);
});

test("generation charges once, completes in its background canvas and preserves its parameter snapshot", (t) => {
  const h = createHarness(t);
  const node = h.node("shared-id", { model: "seedance-2", aspect: "16:9" });
  const first = h.canvas("one", [node]);
  const second = h.canvas("two", [h.node("shared-id")]);
  h.install(first, second);
  const cost = h.window.getCost(node);
  assert.equal(h.window.startSimulatedGeneration(node), true);
  const task = h.scheduledTask();
  const callback = h.timers.get(task.timeoutId);
  assert.ok(task.delay >= 900 && task.delay <= 1600);
  assert.equal(h.state.account.credits, 3000 - cost);
  assert.equal(h.state.account.consumedCredits, cost);
  assert.equal(h.window.startSimulatedGeneration(node), false);
  assert.equal(h.state.account.consumedCredits, cost);
  node.aspect = "9:16";
  h.window.switchCanvas(second.id);
  const other = plain(second);
  let renders = 0;
  let saves = 0;
  h.window.render = () => { renders += 1; };
  h.window.scheduleCanvasDocumentSave = () => { saves += 1; };
  h.fireTimer(task.timeoutId);
  const result = node.generatedAsset;
  callback();
  assert.equal(node.generating, false);
  assert.equal(node.generationTaskId, undefined);
  assert.equal(result.type, "video");
  assert.equal(result.aspectRatio, 16 / 9);
  assert.equal(node.generatedAsset, result);
  assert.equal(h.state.account.consumedCredits, cost);
  assert.deepEqual(plain(second), other);
  assert.equal(renders, 0);
  assert.equal(saves, 1);
});

test("generation rejects foreign and replaced node objects before normalization, charging or scheduling", (t) => {
  const h = createHarness(t);
  const foreign = h.node("same-id", { model: "invalid-model", aspect: "invalid-aspect" });
  const first = h.canvas("one", [foreign]);
  const second = h.canvas("two", [h.node("same-id")]);
  h.install(first, second);
  h.window.switchCanvas(second.id);
  const detached = h.node("same-id", { model: "invalid-model" });
  const before = plain({ foreign, current: second, account: h.state.account });
  const timerCount = h.timers.size;
  assert.equal(h.window.startSimulatedGeneration(foreign), false);
  const detachedBefore = plain(detached);
  assert.equal(h.window.startSimulatedGeneration(detached), false);
  assert.deepEqual(plain(detached), detachedBefore);
  assert.deepEqual(plain({ foreign, current: second, account: h.state.account }), before);
  assert.equal(h.timers.size, timerCount);
});

test("a replacement node with the same id owns a distinct prompt optimization lifecycle", (t) => {
  const h = createHarness(t);
  const original = h.node("video");
  const first = h.canvas("one", [original]);
  h.install(first);
  h.window.startPromptOptimization(original);
  const oldTask = h.scheduledTask();
  const oldCallback = h.timers.get(oldTask.timeoutId);
  const replacement = h.node(original.id, { prompt: original.prompt });
  first.nodes[0] = replacement;
  assert.equal(h.window.startPromptOptimization(replacement), true);
  const nextTask = h.scheduledTask();
  assert.equal(h.timers.has(oldTask.timeoutId), false);
  oldCallback();
  assert.equal(replacement.promptOptimizing, true);
  assert.equal(replacement.prompt, original.prompt);
  assert.equal(first.undoStack.length, 0);
  h.fireTimer(nextTask.timeoutId);
  assert.equal(replacement.promptOptimizing, false);
  assert.notEqual(replacement.prompt, original.prompt);
  assert.equal(first.undoStack.length, 1);
});

test("Alt duplication of an optimizing node starts idle and never inherits the source task", (t) => {
  const h = createHarness(t);
  const source = h.node("video");
  const first = h.canvas("one", [source]);
  h.install(first);
  h.window.startPromptOptimization(source);
  const originalTask = h.scheduledTask();
  h.moveNode(source.id, 500, 80, { altKey: true });
  const duplicate = first.nodes.find((node) => node.id !== source.id);
  assert.ok(duplicate);
  assert.equal(duplicate.promptOptimizing, false);
  assert.equal(duplicate.generating, false);
  assert.equal(duplicate.generationTaskId, undefined);
  assert.equal(h.window.startPromptOptimization(duplicate), true);
  const copiedTask = h.scheduledTask();
  h.fireTimer(originalTask.timeoutId);
  assert.equal(source.promptOptimizing, false);
  assert.equal(duplicate.promptOptimizing, true);
  h.fireTimer(copiedTask.timeoutId);
  assert.equal(duplicate.promptOptimizing, false);
});

for (const kind of ["generation", "prompt-optimization"]) {
  test(`undoing Alt duplication cancels ${kind} and queued completion cannot resurrect the removed copy`, (t) => {
    const h = createHarness(t);
    const source = h.node("video");
    const first = h.canvas("one", [source]);
    h.install(first);
    h.moveNode(source.id, 500, 80, { altKey: true });
    const duplicate = first.nodes.find((node) => node.id !== source.id);
    assert.equal(first.undoStack.length, 1);
    assert.equal(first.undoStack.at(-1).type, "create");
    const started = kind === "generation" ? h.window.startSimulatedGeneration(duplicate) : h.window.startPromptOptimization(duplicate);
    assert.equal(started, true);
    const task = h.scheduledTask();
    const callback = h.timers.get(task.timeoutId);
    const credits = plain(h.state.account);
    h.window.undoLastAction();
    assert.equal(first.nodes.length, 1);
    assert.equal(h.timers.has(task.timeoutId), false);
    assert.equal(duplicate.generating, false);
    assert.equal(duplicate.promptOptimizing, false);
    callback();
    assert.equal(first.nodes.length, 1);
    assert.equal(first.undoStack.length, 0);
    assert.deepEqual(plain(h.state.account), credits, "cancellation retains the current no-refund contract");
    assert.equal(h.window.canvasTest.canvasNodeTasks.cancelScope(), 0, "no task record remains after creation undo");
  });
}

test("document replacement cancels both kinds and queued callbacks cannot modify hydrated nodes", (t) => {
  const h = createHarness(t);
  const first = h.canvas("one", [h.node("generation"), h.node("optimization")]);
  h.install(first);
  const snapshot = h.window.createCanvasDocumentSnapshot();
  h.window.startSimulatedGeneration(first.nodes[0]);
  const generation = h.scheduledTask();
  h.window.startPromptOptimization(first.nodes[1]);
  const optimization = h.scheduledTask();
  assert.equal(optimization.delay, 900);
  const stale = [generation, optimization].map((task) => h.timers.get(task.timeoutId));
  const credits = plain(h.state.account);
  assert.equal(h.window.hydrateCanvasDocumentSnapshot(snapshot), true);
  for (const task of [generation, optimization]) assert.equal(h.timers.has(task.timeoutId), false);
  const restored = plain(h.state.nodes);
  stale.forEach((callback) => callback());
  assert.deepEqual(plain(h.state.nodes), restored);
  assert.ok(h.state.nodes.every((node) => !node.generating && !node.promptOptimizing));
  assert.equal(h.state.undoStack.length, 0);
  assert.deepEqual(plain(h.state.account), credits);
  assert.equal(h.window.canvasTest.canvasNodeTasks.cancelScope(), 0);
});

test("a new host project releases existing tasks before entering the new context", (t) => {
  const h = createHarness(t);
  const nodes = [h.node("generation"), h.node("optimization")];
  h.install(h.canvas("one", nodes));
  h.window.startSimulatedGeneration(nodes[0]);
  const generation = h.scheduledTask();
  h.window.startPromptOptimization(nodes[1]);
  const optimization = h.scheduledTask();
  const stale = [generation, optimization].map((task) => h.timers.get(task.timeoutId));
  const hostWindow = { postMessage() {} };
  Object.defineProperty(h.window, "parent", { configurable: true, value: hostWindow });
  h.window.dispatchEvent(new h.window.MessageEvent("message", {
    origin: h.window.location.origin, source: hostWindow,
    data: { source: "reelay-shell", type: "host:init", context: { protocolVersion: 1, projectId: "new-project", canvasId: "main", writable: true } },
  }));
  assert.equal(h.state.projectId, "new-project");
  assert.ok(nodes.every((node) => !node.generating && !node.promptOptimizing));
  for (const task of [generation, optimization]) assert.equal(h.timers.has(task.timeoutId), false);
  stale.forEach((callback) => callback());
  assert.equal(nodes[0].generatedAsset, null);
  assert.equal(h.state.undoStack.length, 0);
  assert.equal(h.window.canvasTest.canvasNodeTasks.cancelScope(), 0);
});

test("deleting a generating node cancels its task and undo restores idle content without refund", (t) => {
  const h = createHarness(t);
  const node = h.node("video");
  const first = h.canvas("one", [node]);
  h.install(first);
  h.window.startSimulatedGeneration(node);
  const task = h.scheduledTask();
  const callback = h.timers.get(task.timeoutId);
  const credits = plain(h.state.account);
  h.window.setSelection([node.id]);
  h.window.deleteSelectedNodes();
  assert.equal(h.timers.has(task.timeoutId), false);
  assert.equal(h.window.canvasTest.canvasNodeTasks.cancelScope(), 0);
  h.window.undoLastAction();
  const restored = first.nodes[0];
  assert.equal(restored.generating, false);
  assert.equal(restored.promptOptimizing, false);
  assert.equal(restored.generationTaskId, undefined);
  callback();
  assert.equal(restored.generatedAsset, null);
  assert.equal(first.undoStack.length, 0);
  assert.deepEqual(plain(h.state.account), credits);
  assert.equal(h.window.startSimulatedGeneration(restored), true, "the restored idle node can start a new task");
});

test("host access revocation cancels a running task and clears the rendered busy state", (t) => {
  const h = createHarness(t);
  const node = h.node("video");
  h.install(h.canvas("one", [node]));
  const posted = [];
  const hostWindow = { postMessage(message) { posted.push(message); } };
  Object.defineProperty(h.window, "parent", { configurable: true, value: hostWindow });
  const dispatch = (data) => h.window.dispatchEvent(new h.window.MessageEvent("message", {
    origin: h.window.location.origin, source: hostWindow, data: { source: "reelay-shell", ...data },
  }));
  dispatch({ type: "host:init", context: { protocolVersion: 1, projectId: h.state.projectId, canvasId: "main", writable: true } });
  dispatch({ type: "host:document", protocolVersion: 1, document: null, writable: true });
  assert.equal(h.window.startSimulatedGeneration(node), true);
  const task = h.scheduledTask();
  const callback = h.timers.get(task.timeoutId);
  assert.ok(h.window.document.querySelector(".generating-preview"));
  node.x += 40;
  h.window.render();
  h.window.flushCanvasDocumentSave();
  const save = posted.findLast((message) => message.type === "canvas:save");
  assert.ok(save);
  const credits = plain(h.state.account);
  dispatch({ type: "host:save-error", protocolVersion: 1, requestId: save.requestId, code: "forbidden" });
  assert.equal(h.window.isCanvasMutationAllowed(), false);
  assert.equal(node.generating, false);
  assert.equal(h.timers.has(task.timeoutId), false);
  assert.equal(h.window.document.querySelector(".generating-preview"), null);
  callback();
  assert.equal(node.generatedAsset, null);
  assert.deepEqual(plain(h.state.account), credits);
  assert.equal(h.window.canvasTest.canvasNodeTasks.cancelScope(), 0);
});

for (const taskKind of ["generation", "prompt-optimization"]) {
  test(`editing and undoing a different node retains the live ${taskKind} target`, (t) => {
    const h = createHarness(t);
    const edited = h.node("edited");
    const running = h.node("running");
    const first = h.canvas("one", [edited, running]);
    h.install(first);
    const originalPrompt = running.prompt;
    const originalAssetValidation = edited.assetValidationEnabled;
    const start = taskKind === "generation" ? h.window.startSimulatedGeneration : h.window.startPromptOptimization;
    assert.equal(start(running), true);
    const pending = h.scheduledTask();
    h.window.handleAction(edited, "asset-validation");
    assert.equal(first.undoStack.length, 1);
    assert.equal(edited.assetValidationEnabled, !originalAssetValidation);
    assert.equal(first.nodes[0], edited);
    assert.equal(first.nodes[1], running);
    h.window.undoLastAction();
    assert.equal(edited.assetValidationEnabled, originalAssetValidation);
    assert.equal(first.nodes[0], edited);
    assert.equal(first.nodes[1], running);
    assert.equal(first.undoStack.length, 0);
    h.fireTimer(pending.timeoutId);
    if (taskKind === "generation") {
      assert.equal(running.generating, false);
      assert.ok(running.generatedAsset);
    } else {
      assert.equal(running.promptOptimizing, false);
      assert.notEqual(running.prompt, originalPrompt);
    }
  });
}

test("parameter undo restores only its fields after independent prompt, media, position and membership edits", (t) => {
  const h = createHarness(t);
  const node = h.node("edited", { expanded: true });
  const first = h.canvas("one", [node]);
  h.install(first);
  const originalAssetValidation = node.assetValidationEnabled;
  h.window.handleAction(node, "asset-validation");
  const prompt = h.window.document.querySelector('.canvas-node[data-id="edited"] .prompt-editor-content');
  h.setText(prompt, "参数修改之后的新提示词");
  const asset = { id: "later-asset", type: "image", url: "https://example.test/later.png", width: 1600 };
  node.assets.push(asset);
  node.activeAssetId = asset.id;
  const result = h.window.commitCanvasGroups([group("later-group", [node.id])], {
    recordUndo: false, positions: [{ id: node.id, x: 200, y: 240 }],
  });
  assert.equal(result.ok, true);
  assert.equal(first.undoStack.length, 1);
  h.window.undoLastAction();
  assert.equal(first.nodes[0], node);
  assert.equal(node.assetValidationEnabled, originalAssetValidation);
  assert.equal(h.promptText(node.prompt), h.getText(prompt));
  assert.equal(node.assets[0], asset);
  assert.equal(node.activeAssetId, asset.id);
  assert.deepEqual({ x: node.x, y: node.y, groupId: node.groupId }, { x: 200, y: 240, groupId: "later-group" });
  assertMembership(first);
  assert.equal(first.undoStack.length, 0);
});

test("generated media and source asset naming undo never restores unrelated content or metadata", (t) => {
  const h = createHarness(t);
  const media = { id: "generated", type: "video", url: "https://example.test/output.mp4", aspectRatio: 16 / 9 };
  const generated = h.node("generated-node", { preview: true, name: "原结果", generatedAsset: media });
  const source = { id: "source", type: "image", url: "https://example.test/source.png", aspectRatio: 1 };
  const assetNode = Object.assign(h.window.defaultAssetNode(800, 20, source), { id: "source-node" });
  const first = h.canvas("one", [generated, assetNode]);
  h.install(first);
  h.window.renameMediaNode(generated, "  新的  结果  ");
  assert.equal(generated.name, "新的 结果");
  generated.prompt = "命名后修改的提示词";
  generated.x += 70;
  media.width = 1920;
  h.window.undoLastAction();
  assert.equal(first.nodes[0], generated);
  assert.equal(generated.name, "原结果");
  assert.equal(generated.prompt, "命名后修改的提示词");
  assert.equal(generated.x, 80);
  assert.equal(generated.generatedAsset, media);
  assert.equal(media.width, 1920);
  h.window.renameMediaNode(assetNode, "参考图片");
  assert.equal(first.undoStack.at(-1).type, "asset-name-update");
  source.width = 2048;
  assetNode.y += 45;
  h.window.undoLastAction();
  assert.equal(first.nodes[1], assetNode);
  assert.equal(assetNode.assets[0], source);
  assert.equal(Object.hasOwn(source, "displayName"), false);
  assert.equal(source.width, 2048);
  assert.equal(assetNode.y, 65);
  assert.equal(first.undoStack.length, 0);
});

test("parameters remain editable during optimization while undo waits for the task to finish", (t) => {
  const h = createHarness(t);
  const node = h.node("video");
  const first = h.canvas("one", [node]);
  h.install(first);
  const originalAssetValidation = node.assetValidationEnabled;
  const originalPrompt = node.prompt;
  h.window.startPromptOptimization(node);
  const pending = h.scheduledTask();
  h.window.handleAction(node, "asset-validation");
  assert.equal(node.assetValidationEnabled, !originalAssetValidation);
  h.window.undoLastAction();
  assert.equal(first.undoStack.length, 1);
  assert.equal(node.promptOptimizing, true);
  h.fireTimer(pending.timeoutId);
  h.window.undoLastAction();
  assert.equal(node.prompt, originalPrompt);
  assert.equal(node.assetValidationEnabled, !originalAssetValidation);
  h.window.undoLastAction();
  assert.equal(node.assetValidationEnabled, originalAssetValidation);
  assert.equal(first.nodes[0], node);
  assert.equal(first.undoStack.length, 0);
});

test("model and aspect undo restore their coupled parameters and geometry without changing the node type", (t) => {
  const h = createHarness(t);
  const node = h.node("video", { model: "seedance-2", quality: "1080p", duration: "15s", aspect: "16:9" });
  const first = h.canvas("one", [node]);
  h.install(first);
  const original = { model: node.model, quality: node.quality, duration: node.duration };
  const identity = { kind: node.kind, mode: node.mode, mediaKind: node.mediaKind };
  h.window.handleAction(node, "model", "seedance-2-fast");
  assert.deepEqual({ model: node.model, quality: node.quality, duration: node.duration }, {
    model: "seedance-2-fast", quality: "720p", duration: "4s",
  });
  assert.equal(first.undoStack.length, 1);
  h.window.undoLastAction();
  assert.deepEqual({ model: node.model, quality: node.quality, duration: node.duration }, original);
  const geometry = { x: node.x, y: node.y, aspect: node.aspect };
  h.window.handleAction(node, "aspect", "9:16");
  assert.equal(node.aspect, "9:16");
  assert.equal(first.undoStack.length, 1);
  h.window.undoLastAction();
  assert.deepEqual({ x: node.x, y: node.y, aspect: node.aspect }, geometry);
  assert.deepEqual({ kind: node.kind, mode: node.mode, mediaKind: node.mediaKind }, identity);
  assert.equal(first.nodes[0], node);
  assert.equal(first.undoStack.length, 0);
});

test("group creation and ungrouping each undo once without replacing live task targets", (t) => {
  const h = createHarness(t);
  const nodes = [h.node("a"), h.node("b", { x: 500 })];
  const first = h.canvas("one", nodes);
  h.install(first);
  h.window.startSimulatedGeneration(nodes[1]);
  const pending = h.scheduledTask();
  h.window.setSelection(["a", "b"]);
  h.window.groupSelectedNodes();
  const createdId = first.groups[0].id;
  assert.equal(first.groups.length, 1);
  assert.equal(first.undoStack.length, 1);
  assertMembership(first);
  h.window.ungroup(createdId);
  assert.equal(first.groups.length, 0);
  assert.ok(nodes.every((node) => !node.groupId));
  assert.equal(first.undoStack.length, 2);
  h.window.undoLastAction();
  assert.equal(first.groups[0].id, createdId);
  assertMembership(first);
  h.window.undoLastAction();
  assert.equal(first.groups.length, 0);
  assert.ok(nodes.every((node) => !node.groupId));
  assert.equal(first.undoStack.length, 0);
  assert.equal(first.nodes[0], nodes[0]);
  assert.equal(first.nodes[1], nodes[1]);
  h.fireTimer(pending.timeoutId);
  assert.ok(nodes[1].generatedAsset);
});

test("node drag membership and legacy move undo preserve a preceding group command", (t) => {
  const h = createHarness(t);
  const nodes = [h.node("a"), h.node("b", { x: 500 })];
  const first = h.canvas("one", nodes);
  h.install(first);
  h.window.setSelection(["a", "b"]);
  h.window.groupSelectedNodes();
  const created = first.groups[0];
  h.moveNode("a", 2200, 0, { cancelled: true });
  assert.equal(nodes[0].x, 10);
  assert.equal(nodes[0].groupId, created.id);
  assert.equal(first.undoStack.length, 1);
  h.moveNode("a", 2200, 0);
  assert.equal(nodes[0].groupId || null, null);
  assert.deepEqual(plain(first.groups[0].nodeIds), ["b"]);
  assert.equal(first.undoStack.length, 2);
  assert.equal(first.undoStack.at(-1).type, "move");
  h.window.undoLastAction();
  assert.equal(first.groups[0], created);
  assert.equal(nodes[0].x, 10);
  assertMembership(first);
  h.window.undoLastAction();
  assert.equal(first.groups.length, 0);
  assert.equal(first.undoStack.length, 0);
  assert.ok(nodes.every((node) => !node.groupId));
});

test("dragging into a group commits both membership directions and undo removes the membership", (t) => {
  const h = createHarness(t);
  const node = h.node("outside", { x: 1600, y: 100 });
  const frame = group("frame", []);
  const first = h.canvas("one", [node], [frame]);
  h.install(first);
  h.moveNode(node.id, -1450, 0);
  assert.equal(node.groupId, frame.id);
  assert.deepEqual(plain(frame.nodeIds), [node.id]);
  assertMembership(first);
  assert.equal(first.undoStack.length, 1);
  h.window.undoLastAction();
  assert.equal(first.nodes[0], node);
  assert.equal(first.groups[0], frame);
  assert.equal(node.x, 1600);
  assert.equal(node.groupId || null, null);
  assert.deepEqual(plain(frame.nodeIds), []);
  assert.equal(first.undoStack.length, 0);
});

test("group resize settles membership only on release and cancellation restores the original frame", (t) => {
  const h = createHarness(t);
  const inside = h.node("inside", { x: 100, y: 100, groupId: "frame" });
  const outside = h.node("outside", { x: 1500, y: 100 });
  const frame = group("frame", [inside.id]);
  const first = h.canvas("one", [inside, outside], [frame]);
  h.install(first);
  const originalFrame = plain(frame);
  h.resizeGroup(frame.id, 1400, 0, { cancelled: true });
  assert.deepEqual(plain(frame), originalFrame);
  assert.equal(outside.groupId || null, null);
  assert.equal(first.undoStack.length, 0);
  h.resizeGroup(frame.id, 1400, 0, { onPreview() {
    assert.equal(outside.groupId || null, null);
    assert.deepEqual(plain(frame.nodeIds), [inside.id]);
    assert.equal(first.undoStack.length, 0);
  } });
  assert.equal(frame.width, originalFrame.width + 1400);
  assert.equal(outside.groupId, frame.id);
  assertMembership(first);
  assert.equal(first.undoStack.length, 1);
  assert.equal(first.undoStack[0].type, "move");
  h.window.undoLastAction();
  assert.deepEqual(plain(frame), originalFrame);
  assert.equal(outside.groupId || null, null);
  assert.equal(first.nodes[0], inside);
  assert.equal(first.nodes[1], outside);
  assertMembership(first);
  assert.equal(first.undoStack.length, 0);
});

for (const grouped of [false, true]) {
  test(`${grouped ? "group" : "selected-node"} arrangement commits one undo while preserving task and membership state`, (t) => {
    const h = createHarness(t);
    const nodes = [h.node("a", { x: 40, y: 60 }), h.node("b", { x: 720, y: 360 })];
    const frames = grouped ? [group("frame", ["a", "b"])] : [];
    if (grouped) nodes.forEach((node) => { node.groupId = "frame"; });
    const first = h.canvas("one", nodes, frames);
    h.install(first);
    const before = nodes.map(({ x, y }) => ({ x, y }));
    h.window.startSimulatedGeneration(nodes[1]);
    const pending = h.scheduledTask();
    if (grouped) h.window.arrangeGroup(frames[0], "vertical");
    else {
      h.window.setSelection(["a", "b"]);
      h.window.sortSelectedNodes("vertical");
    }
    assert.equal(nodes[0].x, nodes[1].x);
    assert.notEqual(nodes[0].y, nodes[1].y);
    assert.equal(first.undoStack.length, 1);
    assertMembership(first);
    const layersBeforeClick = nodes.map((node) => node.z);
    h.pointerGesture(nodes[0].id);
    assert.ok(nodes[0].z > layersBeforeClick[0], "a real node pointer click brings the node forward");
    const layersAfterClick = nodes.map((node) => node.z);
    h.window.undoLastAction();
    assert.deepEqual(nodes.map(({ x, y }) => ({ x, y })), before);
    assert.deepEqual(nodes.map((node) => node.z), layersAfterClick);
    assert.equal(first.nodes[0], nodes[0]);
    assert.equal(first.nodes[1], nodes[1]);
    assertMembership(first);
    assert.equal(first.undoStack.length, 0);
    h.fireTimer(pending.timeoutId);
    assert.ok(nodes[1].generatedAsset);
  });
}

test("a node drag and its legacy undo do not block an earlier layout undo after promotion", (t) => {
  const h = createHarness(t);
  const nodes = [h.node("a", { x: 40, y: 60 }), h.node("b", { x: 720, y: 360 })];
  const first = h.canvas("one", nodes);
  h.install(first);
  const original = nodes.map(({ x, y }) => ({ x, y }));
  h.window.setSelection(["a", "b"]);
  h.window.sortSelectedNodes("vertical");
  const arranged = nodes.map(({ x, y }) => ({ x, y }));
  h.window.clearSelection();
  h.pointerGesture("a", 140, 100);
  assert.equal(first.undoStack.length, 2);
  assert.equal(first.undoStack.at(-1).type, "move");
  const promotedLayers = nodes.map((node) => node.z);
  h.window.undoLastAction();
  assert.deepEqual(nodes.map(({ x, y }) => ({ x, y })), arranged);
  h.window.undoLastAction();
  assert.deepEqual(nodes.map(({ x, y }) => ({ x, y })), original);
  assert.deepEqual(nodes.map((node) => node.z), promotedLayers);
  assert.equal(first.undoStack.length, 0);
});

test("an Alt copy joins its drop group only on release and can undo before the preceding group creation", (t) => {
  const h = createHarness(t);
  const nodes = [h.node("a", { x: 100, y: 100 }), h.node("b", { x: 700, y: 100 })];
  const first = h.canvas("one", nodes);
  h.install(first);
  h.window.setSelection(["a", "b"]);
  h.window.groupSelectedNodes();
  const frame = first.groups[0];
  let duplicate;
  h.pointerGesture("a", 40, 20, { altKey: true, onPreview() {
    duplicate = first.nodes.find((node) => node.id !== "a" && node.id !== "b");
    assert.ok(duplicate);
    assert.equal(Object.hasOwn(duplicate, "groupId"), false, "a preview copy must not inherit the source group");
    assert.deepEqual(plain(frame.nodeIds), ["a", "b"]);
    assert.equal(first.undoStack.length, 1);
  } });
  assert.equal(first.nodes.length, 3);
  assert.equal(duplicate.groupId, frame.id);
  assertMembership(first);
  assert.equal(first.undoStack.length, 2);
  assert.equal(first.undoStack.at(-1).type, "create");
  h.window.undoLastAction();
  assert.equal(first.nodes.length, 2);
  assert.equal(first.groups[0], frame);
  assert.deepEqual(plain(frame.nodeIds), ["a", "b"]);
  assertMembership(first);
  h.window.undoLastAction();
  assert.equal(first.groups.length, 0);
  assert.equal(first.undoStack.length, 0);
  assert.equal(first.nodes[0], nodes[0]);
  assert.equal(first.nodes[1], nodes[1]);
  assert.ok(first.nodes.every((node) => !node.groupId));
});

test("cancelling an Alt drag removes its preview copies and restores the original node selection", (t) => {
  const h = createHarness(t);
  const nodes = [h.node("a", { x: 100, y: 100, groupId: "frame" }), h.node("b", { x: 700, y: 100, groupId: "frame" })];
  const frame = group("frame", ["a", "b"]);
  const first = h.canvas("one", nodes, [frame]);
  h.install(first);
  h.window.setSelection(["a", "b"], "a");
  h.pointerGesture("a", 40, 20, { altKey: true, cancelled: true, onPreview() {
    assert.equal(first.nodes.length, 4);
    assert.ok([...h.state.selectedIds].every((id) => id !== "a" && id !== "b"));
    assert.equal(first.undoStack.length, 0);
  } });
  assert.deepEqual(plain(first.nodes.map((node) => node.id)), ["a", "b"]);
  assert.deepEqual(plain([...h.state.selectedIds]), ["a", "b"]);
  assert.equal(h.state.activeId, "a");
  assert.equal(first.nodes[0], nodes[0]);
  assert.equal(first.nodes[1], nodes[1]);
  assert.deepEqual(first.nodes.map(({ x, y }) => ({ x, y })), [{ x: 100, y: 100 }, { x: 700, y: 100 }]);
  assert.deepEqual(plain(frame.nodeIds), ["a", "b"]);
  assertMembership(first);
  assert.equal(first.undoStack.length, 0);
});

test("undoing an Alt copy dropped into an existing empty group preserves that group", (t) => {
  const h = createHarness(t);
  const source = h.node("source", { x: 1600, y: 100 });
  const frame = group("empty-frame", []);
  const first = h.canvas("one", [source], [frame]);
  h.install(first);
  h.pointerGesture(source.id, -1450, 0, { altKey: true });
  const duplicate = first.nodes.find((node) => node.id !== source.id);
  assert.equal(duplicate.groupId, frame.id);
  assert.deepEqual(plain(frame.nodeIds), [duplicate.id]);
  assert.equal(first.undoStack.length, 1);
  h.window.undoLastAction();
  assert.equal(first.nodes.length, 1);
  assert.equal(first.nodes[0], source);
  assert.equal(first.groups.length, 1);
  assert.equal(first.groups[0], frame);
  assert.deepEqual(plain(frame.nodeIds), []);
  assert.equal(first.undoStack.length, 0);
});

test("group bounds and repeated rendering derive fallback geometry without repairing stored content", (t) => {
  const h = createHarness(t);
  const node = h.node("member", { groupId: "frame" });
  const frame = group("frame", [node.id]);
  const first = h.canvas("one", [node], [frame]);
  h.install(first);
  delete frame.x;
  frame.width = 1;
  frame.height = 1;
  const before = plain({ nodes: first.nodes, groups: first.groups });
  const bounds = h.window.getGroupBounds(frame);
  assert.ok(bounds.width > 1 && bounds.height > 1);
  h.window.render();
  h.window.getGroupBounds(frame);
  h.window.render();
  assert.deepEqual(plain({ nodes: first.nodes, groups: first.groups }), before);
  assert.equal(first.undoStack.length, 0);
});

for (const rejection of ["stale-field", "task-field", "one-sided-membership"]) {
  test(`a ${rejection} change rejects its whole content transaction without undo or save`, (t) => {
    const h = createHarness(t);
    const nodes = [h.node("a"), h.node("b")];
    const first = h.canvas("one", nodes, [group("frame", [])]);
    h.install(first);
    const { canvasCommandExecutor: executor, canvasContentCommands: content } = h.window.canvasTest;
    const valid = content.buildFieldChange("nodes", nodes[0], { ...nodes[0], name: "must-not-commit" }, ["name"]);
    let rejected;
    if (rejection === "stale-field") {
      rejected = content.buildFieldChange("nodes", nodes[1], { ...nodes[1], name: "new" }, ["name"]);
      nodes[1].name = "edited-after-command-was-built";
    } else if (rejection === "task-field") {
      rejected = {
        collection: "nodes", id: "b", kind: "fields",
        before: { fields: { generating: { present: true, value: nodes[1].generating } } },
        after: { fields: { generating: { present: true, value: true } } },
      };
    } else {
      rejected = content.buildFieldChange("groups", first.groups[0], { ...first.groups[0], nodeIds: ["b"] }, ["nodeIds"]);
    }
    const before = plain(first);
    let saves = 0;
    h.window.scheduleCanvasDocumentSave = () => { saves += 1; };
    const result = executor.execute({ id: `rejected-${rejection}`, type: "content-validation", canvasId: first.id, changes: [valid, rejected] });
    assert.equal(result.ok, false);
    assert.deepEqual(plain(first), before);
    assert.equal(first.nodes[0], nodes[0]);
    assert.equal(first.nodes[1], nodes[1]);
    assert.equal(first.undoStack.length, 0);
    assert.equal(saves, 0);
  });
}

test("matching node ids on different canvases keep parameter commands and undo scoped to their owner", (t) => {
  const h = createHarness(t);
  const firstNode = h.node("shared");
  const otherNode = h.node("shared");
  const first = h.canvas("one", [firstNode]);
  const second = h.canvas("two", [otherNode]);
  h.install(first, second);
  const original = firstNode.assetValidationEnabled;
  h.window.handleAction(firstNode, "asset-validation");
  h.window.switchCanvas(second.id);
  const otherBefore = plain(second);
  h.window.handleAction(firstNode, "asset-validation");
  h.window.renameMediaNode(firstNode, "foreign-edit");
  h.window.undoLastAction();
  assert.deepEqual(plain(second), otherBefore);
  assert.equal(first.undoStack.length, 1);
  assert.equal(firstNode.assetValidationEnabled, !original);
  h.window.switchCanvas(first.id);
  h.window.undoLastAction();
  assert.equal(first.nodes[0], firstNode);
  assert.equal(firstNode.assetValidationEnabled, original);
  assert.equal(second.nodes[0], otherNode);
  assert.equal(first.undoStack.length, 0);
});

test("legacy deletion undo reconnects earlier field history to the restored node", (t) => {
  const h = createHarness(t);
  const node = h.node("edited");
  const first = h.canvas("one", [node]);
  h.install(first);
  const original = node.assetValidationEnabled;
  h.window.handleAction(node, "asset-validation");
  h.window.setSelection([node.id]);
  h.window.deleteSelectedNodes(true);
  assert.equal(first.nodes.length, 0);
  assert.equal(first.undoStack.length, 2);
  h.window.undoLastAction();
  const restored = first.nodes[0];
  assert.equal(restored.assetValidationEnabled, !original);
  h.window.undoLastAction();
  assert.equal(first.nodes[0], restored);
  assert.equal(restored.assetValidationEnabled, original);
  assert.equal(first.undoStack.length, 0);
});

test("successful generation retires only its node input history and keeps other parameters, group and movement undo", (t) => {
  const h = createHarness(t);
  const node = h.node("generated", { model: "seedance-2" });
  const other = h.node("other", { x: 500 });
  const first = h.canvas("one", [node, other]);
  h.install(first);
  h.window.setSelection([node.id, other.id]);
  h.window.groupSelectedNodes();
  h.moveNode(other.id, 60, 30);
  const otherOriginal = other.assetValidationEnabled;
  h.window.handleAction(other, "asset-validation");
  const entity = h.window.getEntityUsePickerEntities().find((entry) => entry.spaces.includes("personal") && entry.media.length);
  h.window.addSelectedEntitiesToGenerator({
    scope: { projectId: h.state.projectId, canvasId: first.id }, nodeId: node.id,
    selections: [{ entityId: entity.id, space: "personal" }],
  });
  h.window.startPromptOptimization(node);
  h.fireTimer(h.scheduledTask().timeoutId);
  // A completed preview is needed to expose generated-media naming on a generator.
  node.preview = true;
  node.generatedAsset = { id: "previous-result", type: "video", url: "https://example.test/old.mp4", aspectRatio: 16 / 9 };
  h.window.renameMediaNode(node, "下一次结果");
  h.window.handleAction(node, "asset-validation");
  const nodeInputHistory = first.undoStack.length;
  assert.equal(nodeInputHistory, 7);
  assert.equal(h.window.startSimulatedGeneration(node), true);
  assert.equal(first.undoStack.length, nodeInputHistory - 1, "starting a new result retires the superseded title history immediately");
  const pending = h.scheduledTask();
  h.window.undoLastAction();
  assert.equal(first.undoStack.length, nodeInputHistory - 1);
  h.fireTimer(pending.timeoutId);
  assert.equal(first.undoStack.length, 3);
  const generatedResult = node.generatedAsset;
  const inputs = plain({ prompt: node.prompt, assets: node.assets, assetValidationEnabled: node.assetValidationEnabled });
  h.window.undoLastAction();
  assert.equal(other.assetValidationEnabled, otherOriginal);
  h.window.undoLastAction();
  assert.deepEqual({ x: other.x, y: other.y }, { x: 500, y: 20 });
  h.window.undoLastAction();
  assert.equal(first.groups.length, 0);
  assert.equal(first.undoStack.length, 0);
  assert.equal(first.nodes[0], node);
  assert.equal(node.generatedAsset, generatedResult);
  assert.deepEqual(plain({ prompt: node.prompt, assets: node.assets, assetValidationEnabled: node.assetValidationEnabled }), inputs);
});

for (const titleChange of ["rename", "model-default-name"]) {
  test(`a new generation supersedes ${titleChange} history without blocking parameter undo after delete and restore`, (t) => {
    const h = createHarness(t);
    const node = h.node("video", {
      model: "seedance-2", quality: "1080p", duration: "15s", preview: true,
      name: titleChange === "rename" ? "原视频" : "",
      generatedAsset: { id: "old-result", type: "video", url: "https://example.test/old.mp4", aspectRatio: 16 / 9 },
    });
    const first = h.canvas("one", [node]);
    h.install(first);
    const originalAssetValidation = node.assetValidationEnabled;
    h.window.handleAction(node, "asset-validation");
    if (titleChange === "rename") h.window.renameMediaNode(node, "修改后的结果名");
    else h.window.handleAction(node, "model", "seedance-2-fast");
    assert.ok(node.name);
    assert.equal(first.undoStack.length, 2);
    assert.equal(h.window.startSimulatedGeneration(node), true);
    const pending = h.scheduledTask();
    assert.equal(node.name, "");
    assert.equal(first.undoStack.length, titleChange === "rename" ? 1 : 2);
    h.window.setSelection([node.id]);
    h.window.deleteSelectedNodes(true);
    assert.equal(h.timers.has(pending.timeoutId), false);
    h.window.undoLastAction();
    const restored = first.nodes[0];
    assert.equal(restored.generating, false);
    assert.equal(restored.name, "");
    if (titleChange === "model-default-name") {
      h.window.undoLastAction();
      assert.deepEqual({ model: restored.model, quality: restored.quality, duration: restored.duration }, {
        model: "seedance-2", quality: "1080p", duration: "15s",
      });
      assert.equal(restored.name, "", "the mixed model command no longer owns the overwritten title");
    }
    h.window.undoLastAction();
    assert.equal(restored.assetValidationEnabled, originalAssetValidation);
    assert.equal(restored.name, "");
    assert.equal(first.undoStack.length, 0);
  });
}

for (const mode of ["image", "video"]) {
  test(`${mode} material validation is one reversible setting and stays locked during generation`, (t) => {
    const h = createHarness(t);
    const node = h.window.defaultGeneratorNode(10, 20, mode);
    node.id = "generator";
    node.prompt = "森林中的明亮小屋";
    node.advancedSettingsExpanded = true;
    const first = h.canvas("one", [node]);
    h.install(first);
    const { document } = h.window;
    const settings = () => document.querySelector('.canvas-node[data-id="generator"] .advanced-settings');
    const toggle = () => settings().querySelector('[data-action="asset-validation"]');
    assert.equal(node.assetValidationEnabled, false);
    assert.equal(Object.hasOwn(node, "autoLinkEnabled"), false);
    assert.equal(settings().querySelectorAll(".advanced-setting-row").length, 2);
    assert.equal(settings().querySelectorAll('[role="switch"]').length, 1);
    assert.match(settings().textContent, /自动提交尚未审核的图片与视频素材/);
    assert.equal(h.window.getNodeLayout(node).advancedSettingsHeight, 118);
    toggle().click();
    assert.equal(node.assetValidationEnabled, true);
    assert.equal(toggle().getAttribute("aria-checked"), "true");
    assert.equal(first.undoStack.length, 1);
    assert.equal(h.window.createCanvasDocumentSnapshot().canvases[0].nodes[0].assetValidationEnabled, true);
    h.window.normalizeNodeParameters(node);
    assert.equal(node.assetValidationEnabled, true, "normalization must retain a saved image or video preference");
    h.window.undoLastAction();
    assert.equal(node.assetValidationEnabled, false);
    assert.equal(first.undoStack.length, 0);

    assert.equal(h.window.startSimulatedGeneration(node), true);
    const pending = h.scheduledTask();
    assert.equal(settings(), null, "generation closes editable advanced settings");
    h.window.handleAction(node, "asset-validation");
    assert.equal(node.assetValidationEnabled, false);
    assert.equal(first.undoStack.length, 0);
    h.fireTimer(pending.timeoutId);
  });
}

function agentParameterControls(h) {
  const { document } = h.window;
  const trigger = document.querySelector("#agentParamSummary");
  const menu = document.querySelector("#agentParamMenu");
  const click = (action, value) => {
    const control = menu.querySelector(`[data-action="${action}"][data-value="${value}"]`);
    assert.ok(control, `expected the Agent ${action}=${value} control`);
    control.click();
    assert.ok(menu.querySelector(`[data-action="${action}"][data-value="${value}"]`).classList.contains("active"));
  };
  const mode = (value) => {
    document.querySelector("#agentModeBtn").click();
    document.querySelector(`[data-agent-mode="${value}"]`).click();
  };
  const model = (id) => {
    if (h.window.getAgentComposerModel()?.id === id) return;
    document.querySelector("#agentModelBtn").click();
    const selector = `#agentModelMenu [data-agent-model="${id}"]`;
    const option = document.querySelector(selector);
    assert.ok(option, `expected available Agent model ${id}`);
    option.click();
    assert.equal(h.window.getAgentComposerModel()?.id, id);
    assert.equal(document.querySelector("#agentModelMenu").classList.contains("hidden"), true);
    assert.equal(document.activeElement, document.querySelector("#agentModelBtn"));
  };
  const open = () => {
    if (menu.hidden) trigger.click();
    assert.equal(menu.hidden, false);
    assert.equal(trigger.getAttribute("aria-expanded"), "true");
  };
  return { trigger, menu, click, mode, model, open };
}

test("Agent send estimate follows the generation model and parameters and recovers from unknown costs", (t) => {
  const h = createHarness(t);
  h.window.setAgentOpen(true);
  const controls = agentParameterControls(h);
  const { document } = h.window;
  const amount = document.querySelector("#agentCreditValue");
  const send = document.querySelector(".agent-send");
  const assertEstimate = (cost) => {
    assert.equal(amount.textContent, cost === null ? "—" : String(cost));
    const label = cost === null ? "发送；本次消耗待估算" : `发送；本次预计消耗 ${cost} 积分`;
    assert.equal(send.getAttribute("aria-label"), label);
    assert.equal(send.title, label);
  };

  assert.equal(h.window.getAgentComposerModel().id, "seedance-2");
  assertEstimate(12);
  controls.open();
  const duration = controls.menu.querySelector("[data-duration-range]");
  duration.value = "8";
  duration.dispatchEvent(new h.window.Event("input", { bubbles: true }));
  assertEstimate(24);
  controls.click("quality", "1080p");
  assertEstimate(36);

  controls.model("seedance-2-5");
  assertEstimate(24);
  controls.open();
  controls.click("omni-reference-task-type", "edit");
  assertEstimate(null);
  controls.click("omni-reference-task-type", "auto");
  assertEstimate(24);

  controls.model("gpt-image-2");
  assertEstimate(5);
  controls.open();
  controls.click("resolution", "4K");
  assertEstimate(9);
  controls.click("quality", "高");
  assertEstimate(17);
  controls.mode("agent");
  assertEstimate(null);
  controls.mode("generation");
  assertEstimate(17);
  controls.model("seedance-2");
  assertEstimate(36);
});

test("Agent send estimate is independent of account balance and simulated messages do not charge or change canvases", (t) => {
  const h = createHarness(t);
  const first = h.canvas("one", [h.node("shared-id")]);
  const second = h.canvas("two", [h.node("shared-id", { model: "seedance-2-5" })]);
  h.install(first, second);
  h.window.setAgentOpen(true);
  const { document } = h.window;
  const snapshot = plain(h.window.createCanvasDocumentSnapshot());
  const canvases = plain([first, second]);
  const amount = document.querySelector("#agentCreditValue");
  const send = document.querySelector(".agent-send");
  const estimate = { amount: amount.textContent, label: send.getAttribute("aria-label") };

  h.window.chargeCredits(27);
  assert.equal(h.state.account.credits, 2973);
  assert.equal(h.state.account.consumedCredits, 27);
  assert.equal(document.querySelector("#profileCreditValue").textContent, "2,973");
  assert.deepEqual({ amount: amount.textContent, label: send.getAttribute("aria-label") }, estimate);

  const account = plain(h.state.account);
  const conversation = h.window.getConversation();
  const messageCount = conversation.messages.length;
  const input = document.querySelector("#agentInput .prompt-editor-content");
  h.setText(input, "生成一个森林中的视频镜头");
  send.click();
  assert.equal(conversation.messages.length, messageCount + 2, "the local user message and example reply remain available");
  assert.equal(conversation.messages[messageCount].content, "生成一个森林中的视频镜头");
  assert.equal(h.getText(input), "");
  assert.deepEqual(plain(h.state.account), account);
  assert.deepEqual(plain(h.window.createCanvasDocumentSnapshot()), snapshot);
  assert.deepEqual(plain([first, second]), canvases);
  assert.deepEqual({ amount: amount.textContent, label: send.getAttribute("aria-label") }, estimate);
});

test("Agent task and model switches update guidance while preserving the original input and canvas content", (t) => {
  const h = createHarness(t);
  h.install(h.canvas("agent-guidance", [h.node("unrelated")]));
  h.window.setAgentOpen(true);
  const input = h.window.document.querySelector("#agentInput .prompt-editor-content");
  const controls = agentParameterControls(h);
  const guidance = h.window.REELAY_MODEL_CATALOG.find((model) => model.id === "seedance-2-5")
    .capabilities.omniReferenceTaskType.promptPlaceholders;
  assert.ok(guidance?.auto && guidance?.edit && guidance?.extend);
  const generic = "描述你想生成的内容，或输入 @ 引用";
  assert.equal(input.dataset.placeholder, generic);
  const snapshot = plain(h.window.createCanvasDocumentSnapshot());
  controls.model("seedance-2-5");
  assert.equal(input.dataset.placeholder, guidance.auto);
  controls.open();
  controls.click("omni-reference-task-type", "edit");
  assert.equal(input.dataset.placeholder, guidance.edit);
  assert.equal(h.getText(input), "");
  h.window.sendAgentMessage();
  assert.equal(h.getText(input), "", "mode guidance is not message content");

  const prompt = "继续修改画面并保留其余镜头。".repeat(80);
  h.setText(input, prompt);
  h.selectText(input, 7, 20, "backward");
  input.parentElement.scrollTop = 480;
  let editorDocument = h.editorFor(input).view.state.doc;
  function assertEditor(expectedPlaceholder) {
    assert.equal(h.window.document.querySelector("#agentInput .prompt-editor-content"), input);
    assert.equal(input.dataset.placeholder, expectedPlaceholder);
    assert.equal(h.getText(input), prompt);
    assert.equal(input.parentElement.scrollTop, 480);
    assert.deepEqual(h.selection(input), [7, 20, "backward"]);
    assert.equal(h.editorFor(input).view.state.doc, editorDocument);
  }
  controls.click("omni-reference-task-type", "extend");
  assertEditor(guidance.extend);
  controls.model("gpt-image-2");
  assertEditor(generic);
  controls.model("seedance-2-5");
  assertEditor(guidance.extend);
  controls.mode("agent");
  assertEditor(generic);
  controls.mode("generation");
  assertEditor(guidance.extend);
  input.focus();
  h.window.syncAgentComposerControls();
  assert.equal(h.window.document.activeElement, input, "an incidental control sync must retain editing focus");
  assertEditor(guidance.extend);
  assert.deepEqual(plain(h.window.createCanvasDocumentSnapshot()), snapshot);
  assert.equal(h.state.undoStack.length, 0);
});

test("Agent mode removes generation tools and cancels optimization without rewriting the draft", (t) => {
  const h = createHarness(t);
  h.install(h.canvas("agent-tools", [h.node("unrelated")]));
  h.window.setAgentOpen(true);
  const controls = agentParameterControls(h);
  const { document } = h.window;
  const input = document.querySelector("#agentInput .prompt-editor-content");
  const optimize = document.querySelector("#agentPromptOptimizationBtn");
  const advanced = document.querySelector("#agentAdvancedBtn");
  const settings = document.querySelector("#agentAdvancedSettings");
  const snapshot = plain(h.window.createCanvasDocumentSnapshot());
  const account = plain(h.state.account);
  const prompt = "保留这段尚未发送的内容和参考创作意图。";
  h.setText(input, prompt);
  assert.equal(optimize.hidden, false);
  assert.equal(advanced.hidden, false);
  advanced.click();
  assert.equal(settings.classList.contains("hidden"), false);
  optimize.click();
  const task = h.state.agentPromptOptimizationTask;
  assert.ok(task);
  const staleComplete = h.timers.get(task.timeoutId);
  assert.equal(input.getAttribute("contenteditable"), "false");

  controls.mode("agent");
  assert.equal(optimize.hidden, true);
  assert.equal(advanced.hidden, true);
  assert.equal(optimize.disabled, true);
  assert.equal(settings.classList.contains("hidden"), true);
  assert.equal(settings.getAttribute("aria-hidden"), "true");
  assert.equal(advanced.getAttribute("aria-expanded"), "false");
  assert.equal(h.state.agentAdvancedSettingsExpanded, false);
  assert.equal(h.state.agentPromptOptimizationTask, null);
  assert.equal(h.timers.has(task.timeoutId), false);
  assert.equal(input.getAttribute("contenteditable"), "true");
  assert.equal(document.querySelector(".agent-send").disabled, false);
  staleComplete();
  assert.equal(h.getText(input), prompt, "a callback already queued before mode change must not optimize the Agent draft");
  h.window.startAgentPromptOptimization();
  h.window.setAgentAdvancedOpen(true);
  assert.equal(h.state.agentPromptOptimizationTask, null, "programmatic activation follows the same mode boundary");
  assert.equal(settings.classList.contains("hidden"), true);

  controls.mode("generation");
  assert.equal(optimize.hidden, false);
  assert.equal(advanced.hidden, false);
  assert.equal(optimize.disabled, false);
  assert.equal(settings.classList.contains("hidden"), true, "returning does not restore a stale advanced panel");
  assert.equal(h.getText(input), prompt);
  assert.deepEqual(plain(h.window.createCanvasDocumentSnapshot()), snapshot);
  assert.deepEqual(plain(h.state.account), account);
  assert.equal(h.state.undoStack.length, 0);
});

test("generation references accept all media types and send a previewable attachment-only message without canvas or credit writes", (t) => {
  const h = createHarness(t);
  const first = h.canvas("reference-one", [h.node("shared-id")]);
  const second = h.canvas("reference-two", [h.node("shared-id")]);
  h.install(first, second);
  h.window.setAgentOpen(true);
  const { document } = h.window;
  const references = h.window.canvasTest.agentReferences;
  const controls = agentParameterControls(h);
  const input = document.querySelector("#agentInput .prompt-editor-content");
  const shelf = document.querySelector("#agentReferenceShelf");
  const files = document.querySelector("#agentReferenceInput");
  const account = plain(h.state.account);
  const snapshot = plain(h.window.createCanvasDocumentSnapshot());
  const canvases = plain([first, second]);
  const assets = [
    { id: "portrait", type: "image", name: "portrait.png", url: "blob:http://reelay.test/portrait", width: 600, height: 1200 },
    { id: "clip", type: "video", name: "clip.mp4", url: "blob:http://reelay.test/clip", duration: 12 },
    { id: "voice", type: "audio", name: "voice.wav", url: "blob:http://reelay.test/voice", duration: 18 },
  ];
  assert.equal(files.accept, "image/*,video/*,audio/*");
  assert.equal(files.multiple, true);
  assert.equal(references.addAssets(assets).length, 3);
  assert.deepEqual([...shelf.querySelectorAll(".reference-number")].map((label) => label.textContent), ["1", "1", "1"]);
  assert.equal(shelf.hidden, false);
  assert.ok(shelf.querySelector(".agent-reference-card.image img"));
  assert.match(shelf.querySelector(".agent-reference-card.video").getAttribute("aria-label"), /视频1.*clip/);
  assert.match(shelf.querySelector(".agent-reference-card.audio").getAttribute("aria-label"), /音频1.*voice/);
  const draft = plain(references.getAssets());
  controls.mode("agent");
  assert.deepEqual(plain(references.getAssets()), draft, "mode switches preserve the current conversation's references");
  controls.mode("generation");
  assert.deepEqual(plain(references.getAssets()), draft);

  const conversation = h.window.getConversation();
  const before = conversation.messages.length;
  h.setText(input, "");
  document.querySelector(".agent-send").click();
  assert.equal(conversation.messages.length, before + 2);
  const sent = conversation.messages[before];
  assert.equal(sent.role, "user");
  assert.deepEqual(plain(sent.references), draft);
  assert.equal(references.getAssets().length, 0, "successful local send moves references out of the draft");
  assert.equal(shelf.hidden, true);
  assert.equal(h.getText(input), "");
  const rendered = [...document.querySelectorAll(".agent-message.user")].at(-1);
  const sentShelf = rendered.querySelector(".agent-message-reference-shelf");
  assert.ok(sentShelf);
  for (const [index, asset] of assets.entries()) {
    const card = sentShelf.querySelector(`.asset-card.${asset.type}`);
    assert.ok(card, `${asset.type} must remain available to the shared preview controller after sending`);
    assert.equal(card.dataset.referenceKey, `asset:${draft[index].id}`);
    assert.equal(card.tabIndex, 0);
    assert.ok(card.getAttribute("aria-label").includes(asset.name.split(".")[0]));
  }
  references.addAssets([{ ...assets[0], id: "another-portrait", url: "blob:http://reelay.test/another" }]);
  shelf.querySelector("[data-reference-remove]").click();
  assert.deepEqual(plain(sent.references), draft, "editing the next draft must not mutate a sent reference snapshot");
  assert.deepEqual(plain(h.state.account), account);
  assert.deepEqual(plain(h.window.createCanvasDocumentSnapshot()), snapshot);
  assert.deepEqual(plain([first, second]), canvases);
});

test("Agent @ insertion freezes mixed-media references in its message and send resets editor history", (t) => {
  const h = createHarness(t);
  h.install(h.canvas("agent-mentions", [h.node("unrelated")]));
  h.window.setAgentOpen(true);
  const { document } = h.window;
  const references = h.window.canvasTest.agentReferences;
  references.addAssets([
    { id: "portrait", type: "image", name: "幽影人物", url: "/portrait.png", width: 600, height: 1200 },
    { id: "walk", type: "video", name: "行走动作", url: "/walk.mp4", duration: 12 },
    { id: "voice", type: "audio", name: "人物配音", url: "/voice.mp3", duration: 6 },
  ]);
  const entries = references.getEntries();
  const input = document.querySelector("#agentInput .prompt-editor-content");
  h.setText(input, "让"); h.selectText(input, 1);
  const ui = promptInteraction(h, input);
  const conversation = h.window.getConversation();
  const beforeMessages = conversation.messages.length;
  const beforeCanvas = plain(h.window.createCanvasDocumentSnapshot());
  const beforeAccount = plain(h.state.account);
  ui.type("@"); ui.key("Enter");
  assert.equal(conversation.messages.length, beforeMessages, "mention Enter must not send the Agent message");
  ui.type("参考@视频1"); ui.key("Enter");
  ui.type("，使用@音频1"); ui.key("Enter");
  assert.equal(ui.editor.getDocument().content.filter((part) => part.type === "reference").length, 3);
  assert.equal(ui.editor.getText(), "让图片1参考视频1，使用音频1");
  ui.key("Enter");
  assert.equal(conversation.messages.length, beforeMessages + 2);
  const sent = conversation.messages[beforeMessages];
  assert.equal(sent.content, "让图片1参考视频1，使用音频1");
  assert.deepEqual(plain(sent.promptDocument.content.filter((part) => part.type === "reference").map((part) => part.key)), plain(entries.map((entry) => entry.key)));
  assert.deepEqual(plain(sent.referenceSnapshot.map((entry) => entry.label)), ["图片1", "视频1", "音频1"]);
  assert.equal(Object.isFrozen(sent.referenceSnapshot[1].asset), true);
  assert.equal(references.getAssets().length, 0);
  assert.equal(ui.editor.getText(), "");
  assert.equal(ui.editor.undo(), false, "sending starts an empty editing history rather than restoring stale attachment mentions");
  assert.equal(ui.editor.getText(), "");
  const message = [...document.querySelectorAll(".agent-message.user")].at(-1);
  assert.equal(message.querySelectorAll(".agent-message-body [data-reference-key]").length, 3);
  references.addAssets([{ id: "new", type: "image", name: "新人物", url: "/new.png" }]);
  h.setText(input, "新草稿");
  assert.equal(sent.referenceSnapshot[0].asset.url, "/portrait.png");
  assert.equal(sent.content, "让图片1参考视频1，使用音频1");
  assert.deepEqual(plain(h.state.account), beforeAccount);
  assert.deepEqual(plain(h.window.createCanvasDocumentSnapshot()), beforeCanvas);
});

test("Agent modes retain reference atoms and missing references block send without consuming the draft", (t) => {
  const h = createHarness(t);
  h.window.setAgentOpen(true);
  const { document } = h.window;
  const references = h.window.canvasTest.agentReferences;
  references.addAssets([
    { id: "portrait", type: "image", name: "人物", url: "/portrait.png" },
    { id: "voice", type: "audio", name: "声音", url: "/voice.mp3", duration: 5 },
  ]);
  const [image] = references.getEntries();
  const input = document.querySelector("#agentInput .prompt-editor-content");
  const ui = promptInteraction(h, input);
  ui.type("@"); ui.key("Enter");
  const prompt = plain(ui.editor.getDocument());
  const controls = agentParameterControls(h);
  controls.mode("agent");
  assert.deepEqual(plain(ui.editor.getDocument()), prompt);
  ui.type("@");
  assert.equal(document.querySelector(".prompt-reference-menu"), null, "Agent mode does not enable new generation-reference queries");
  controls.mode("generation");
  assert.equal(input.querySelectorAll('[data-reference-key]').length, 1);
  document.querySelector(`#agentReferenceShelf [data-reference-remove="${image.asset.id}"]`).click();
  assert.equal(references.getAssets().length, 1);
  const conversation = h.window.getConversation();
  const count = conversation.messages.length;
  const beforeDraft = plain(conversation.draftPrompt);
  const account = plain(h.state.account);
  document.querySelector(".agent-send").click();
  assert.equal(conversation.messages.length, count);
  assert.deepEqual(plain(conversation.draftPrompt), beforeDraft);
  assert.equal(references.getAssets().length, 1, "invalid send cannot consume the other usable attachment");
  assert.deepEqual(plain(h.state.account), account);
  assert.equal(ui.editor.view.state.selection.node.attrs.key, image.key, "validation points at the missing inline atom");
});

test("Agent structured optimization and local undo preserve references and conversation ownership", (t) => {
  const h = createHarness(t);
  h.window.setAgentOpen(true);
  const references = h.window.canvasTest.agentReferences;
  references.addAssets([{ id: "portrait", type: "image", name: "人物", url: "/portrait.png" }]);
  const input = h.window.document.querySelector("#agentInput .prompt-editor-content");
  const editor = h.editorFor(input);
  const doc = promptDocument("  人物  ", promptReference(references.getEntries()[0].key), "  走进森林  ");
  editor.setDocument(doc, { notify: true });
  const conversation = h.window.getConversation();
  h.window.startAgentPromptOptimization();
  const task = h.state.agentPromptOptimizationTask;
  assert.ok(task);
  h.fireTimer(task.timeoutId);
  assert.notDeepEqual(plain(conversation.draftPrompt), doc);
  assert.deepEqual(plain(editor.getDocument().content.filter((part) => part.type === "reference")), [doc.content[1]]);
  assert.equal(editor.undo(), true);
  assert.deepEqual(plain(conversation.draftPrompt), doc);
  h.window.document.querySelector("#agentNewChatBtn").click();
  const nextConversation = h.window.getConversation();
  const nextInput = h.window.document.querySelector("#agentInput .prompt-editor-content");
  assert.notEqual(nextConversation, conversation);
  assert.equal(h.editorFor(nextInput).getText(), "");
  assert.equal(h.editorFor(nextInput).undo(), false);
  assert.deepEqual(plain(conversation.draftPrompt), doc);
});

test("Agent video edit cost uses draft video duration and removal restores an unknown estimate", (t) => {
  const h = createHarness(t);
  h.window.setAgentOpen(true);
  const controls = agentParameterControls(h);
  const references = h.window.canvasTest.agentReferences;
  const { document } = h.window;
  const amount = document.querySelector("#agentCreditValue");
  controls.model("seedance-2-5");
  controls.open();
  controls.click("omni-reference-task-type", "edit");
  assert.equal(amount.textContent, "—");
  references.addAssets([{ id: "reference-video", type: "video", name: "long.mp4",
    url: "blob:http://reelay.test/long", duration: 20 }]);
  assert.equal(amount.textContent, "40", "480P edit estimates five four-second billing units from the 20-second input");
  assert.match(document.querySelector(".agent-send").getAttribute("aria-label"), /40 积分/);
  controls.mode("agent");
  assert.equal(amount.textContent, "—");
  controls.mode("generation");
  assert.equal(amount.textContent, "40");
  document.querySelector("#agentReferenceShelf [data-reference-remove]").click();
  assert.equal(amount.textContent, "—");
  controls.model("gpt-image-2");
  controls.model("seedance-2-5");
  assert.equal(amount.textContent, "—", "model preferences do not retain removed reference assets");
  assert.equal(h.state.account.credits, 3000);
  assert.equal(h.state.account.consumedCredits, 0);
});

test("Agent add menu imports selected canvas media as independent references", (t) => {
  const h = createHarness(t);
  const assets = [
    { id: "canvas-image", type: "image", name: "image.png", url: "blob:http://reelay.test/canvas-image", width: 600, height: 900 },
    { id: "canvas-video", type: "video", name: "video.mp4", url: "blob:http://reelay.test/canvas-video", duration: 12 },
    { id: "canvas-audio", type: "audio", name: "audio.mp3", url: "blob:http://reelay.test/canvas-audio", duration: 18 },
  ];
  const nodes = assets.map((asset, index) => h.node(`source-${index}`, {
    kind: "asset", assets: [asset], activeAssetId: asset.id,
  }));
  h.install(h.canvas("selected-canvas-media", nodes));
  h.window.setAgentOpen(true);
  const { document } = h.window;
  const add = document.querySelector("#agentAddBtn");
  const menu = document.querySelector("#agentReferenceMenu");
  add.getBoundingClientRect = () => ({ left: 720, top: 550, right: 756, bottom: 586, width: 36, height: 36 });
  menu.getBoundingClientRect = () => ({ left: 0, top: 0, right: 216, bottom: 148, width: 216, height: 148 });
  add.click();
  assert.equal(menu.classList.contains("hidden"), false);
  assert.equal(menu.querySelector('[data-agent-reference-source="canvas"]').disabled, true);
  add.click();
  h.window.setSelection(nodes.map((node) => node.id), nodes[0].id);
  const snapshot = plain(h.window.createCanvasDocumentSnapshot());
  const originalNodes = plain(nodes);
  add.click();
  const canvasChoice = menu.querySelector('[data-agent-reference-source="canvas"]');
  assert.equal(canvasChoice.disabled, false);
  canvasChoice.click();
  const added = h.window.canvasTest.agentReferences.getAssets();
  assert.deepEqual(plain(added.map((asset) => asset.type)), ["image", "video", "audio"]);
  assert.deepEqual(plain(added.map((asset) => asset.url)), assets.map((asset) => asset.url));
  assert.ok(added.every((asset, index) => asset.id !== assets[index].id));
  assert.equal(menu.classList.contains("hidden"), true);
  document.querySelector("#agentReferenceShelf [data-reference-remove]").click();
  assert.deepEqual(plain(nodes), originalNodes);
  assert.deepEqual(plain(h.window.createCanvasDocumentSnapshot()), snapshot);
  assert.equal(h.state.undoStack.length, 0);
});

test("Agent reference drafts follow conversation identity and reject a stale file-picker scope", (t) => {
  const h = createHarness(t);
  h.window.setAgentOpen(true);
  const { document } = h.window;
  const references = h.window.canvasTest.agentReferences;
  const first = h.window.getConversation();
  h.setText(document.querySelector("#agentInput .prompt-editor-content"), "第一段对话");
  h.window.sendAgentMessage();
  const asset = { id: "first-draft", type: "image", name: "first.png", url: "blob:http://reelay.test/first", width: 640, height: 480 };
  references.addAssets([asset]);
  const firstDraft = plain(references.getAssets());
  const staleScope = references.captureScope();
  document.querySelector("#agentNewChatBtn").click();
  assert.notEqual(h.window.getConversation(), first);
  assert.equal(references.getAssets().length, 0, "a new conversation starts with its own empty reference list");
  references.addAssets([{ ...asset, id: "late-file", url: "blob:http://reelay.test/late" }], staleScope);
  assert.equal(references.getAssets().length, 0, "late results from the previous conversation cannot land in the new draft");
  document.querySelector("#agentHistoryBtn").click();
  document.querySelector(`#agentHistoryList [data-chat-id="${first.id}"] [data-history-action="select"]`).click();
  assert.equal(h.window.getConversation(), first);
  assert.deepEqual(plain(references.getAssets()), firstDraft);
  references.addAssets([{ ...asset, id: "late-file", url: "blob:http://reelay.test/late" }], staleScope);
  assert.deepEqual(plain(references.getAssets()), firstDraft, "returning to a conversation does not revive an old picker epoch");
});

for (const operation of ["switch", "add"]) {
  test(`Agent library selection retains its conversation destination after ${operation} canvas`, (t) => {
    const h = createHarness(t);
    const first = h.canvas("library-first", [h.node("first-node")]);
    const second = h.canvas("library-second", [h.node("second-node")]);
    h.install(first, second);
    h.window.setAgentOpen(true);
    const references = h.window.canvasTest.agentReferences;
    const conversation = h.window.getConversation();
    const fixture = { id: "agent-library-portrait", type: "image", name: "agent-library-portrait.png",
      url: "https://example.test/agent-library-portrait.png", width: 600, height: 1200 };
    h.window.registerLibraryAssets([fixture], "personal");
    h.window.switchAssetLibraryContext({ space: "personal", section: "media" });
    h.window.openAssetLibrary(null, { agentScope: references.captureScope() });
    assert.equal(h.state.libraryTarget.kind, "agent");
    if (operation === "switch") h.window.switchCanvas(second.id);
    else h.window.addCanvas();
    assert.equal(h.state.libraryTarget?.kind, "agent");
    assert.equal(h.state.libraryTarget.scope.conversation, conversation);
    assert.equal(h.state.libraryTarget.scope.projectId, h.state.projectId);
    assert.equal(h.window.isAssetLibraryOpen(), true);
    const canvases = plain(h.state.canvases);
    const account = plain(h.state.account);
    h.window.useLibraryAsset(fixture.id, 600, 400);
    assert.deepEqual(plain(references.getAssets().map((asset) => asset.url)), [fixture.url]);
    assert.deepEqual(plain(h.state.canvases), canvases, "choosing a conversation reference must not add or alter canvas nodes");
    assert.deepEqual(plain(h.state.account), account);
    assert.equal(h.window.isAssetLibraryOpen(), false);
  });
}

test("node-directed library closes on canvas changes and directed selection closes on document hydration", (t) => {
  const h = createHarness(t);
  const first = h.canvas("target-first", [h.node("target-node")]);
  const second = h.canvas("target-second", [h.node("another-node")]);
  h.install(first, second);
  h.window.openAssetLibrary("target-node");
  assert.equal(h.state.libraryTarget?.kind, "node");
  h.window.switchCanvas(second.id);
  assert.equal(h.state.libraryTarget, null);
  assert.equal(h.window.isAssetLibraryOpen(), false);

  const references = h.window.canvasTest.agentReferences;
  h.window.openAssetLibrary(null, { agentScope: references.captureScope() });
  assert.equal(h.state.libraryTarget?.kind, "agent");
  const snapshot = h.window.createCanvasDocumentSnapshot();
  assert.equal(h.window.hydrateCanvasDocumentSnapshot(snapshot), true);
  assert.equal(h.state.libraryTarget, null);
  assert.equal(h.window.isAssetLibraryOpen(), false);
  assert.equal(references.getAssets().length, 0);
});

test("Agent image references retain relative and signed external originals and use previews only for supported local media routes", (t) => {
  const h = createHarness(t);
  h.window.setAgentOpen(true);
  const references = h.window.canvasTest.agentReferences;
  const relative = "./assets/home/reference.png";
  const external = "https://signed.example.test/image.png?token=keep%2Fthis&expires=123";
  const local = "/api/workspaces/workspace-one/media-assets/image-one/content?version=2";
  assert.equal(h.window.libraryImagePreviewUrl(relative, "image"), relative);
  assert.equal(h.window.libraryImagePreviewUrl(external, "image"), external);
  assert.equal(h.window.libraryImagePreviewUrl("/api/other/image.png", "image"), "/api/other/image.png");
  assert.equal(h.window.libraryImagePreviewUrl(local, "image"),
    "http://reelay.test/api/workspaces/workspace-one/media-assets/image-one/content?version=2&preview=library");
  assert.equal(h.window.libraryImagePreviewUrl("/api/projects/project-one/asset-references/reference-one/content", "image"),
    "http://reelay.test/api/projects/project-one/asset-references/reference-one/content?preview=library");
  assert.equal(h.window.libraryImagePreviewUrl(local, "video"), "");

  assert.doesNotThrow(() => references.addAssets([
    { id: "relative-image", type: "image", name: "relative.png", url: relative, width: 400, height: 600 },
    { id: "signed-image", type: "image", name: "signed.png", url: external, width: 400, height: 600 },
    { id: "local-image", type: "image", name: "local.png", url: local, width: 400, height: 600 },
  ]));
  const originals = references.getAssets().map((asset) => asset.url);
  assert.deepEqual(plain(originals), [relative, external, local]);
  const images = [...h.window.document.querySelectorAll("#agentReferenceShelf .asset-thumb img")];
  assert.equal(images.length, 3);
  assert.equal(images[0].src, "http://reelay.test/assets/home/reference.png");
  assert.equal(images[1].src, external, "a signed remote URL must not gain an unsupported preview query");
  assert.equal(images[2].src, "http://reelay.test/api/workspaces/workspace-one/media-assets/image-one/content?version=2&preview=library");
});

test("Agent video parameter clicks update the summary and constraints without touching canvas content or undo", (t) => {
  const h = createHarness(t);
  const node = h.node("video", { model: "seedance-2-5" });
  const first = h.canvas("one", [node]);
  const second = h.canvas("two", [h.node("video", { model: "kling-video-3" })]);
  h.install(first, second);
  h.window.setAgentOpen(true);
  const controls = agentParameterControls(h);
  controls.model("seedance-2-5");
  assert.equal(controls.trigger.tagName, "BUTTON");
  controls.open();
  const snapshot = plain(h.window.createCanvasDocumentSnapshot());
  const canvases = plain([first, second]);

  controls.click("aspect", "9:16");
  controls.click("quality", "1080p");
  assert.match(controls.trigger.textContent, /9:16/);
  assert.match(controls.trigger.textContent, /1080P/i);
  const range = controls.menu.querySelector("[data-duration-range]");
  range.value = "12";
  range.dispatchEvent(new h.window.Event("input", { bubbles: true }));
  assert.equal(controls.menu.querySelector("[data-duration-number]").value, "12");
  assert.match(controls.trigger.textContent, /12s/);
  const number = controls.menu.querySelector("[data-duration-number]");
  number.value = "99";
  number.dispatchEvent(new h.window.Event("change", { bubbles: true }));
  assert.equal(number.value, "30");
  assert.equal(controls.menu.querySelector("[data-duration-range]").value, "30");
  assert.match(controls.trigger.textContent, /30s/);
  controls.click("audio", "off");
  controls.click("output-format", "mov");
  controls.click("omni-reference-task-type", "edit");
  assert.equal(controls.menu.querySelector("[data-duration-range]"), null);
  assert.deepEqual([...controls.menu.querySelectorAll('[data-action="aspect"]')].map((button) => button.dataset.value), ["adaptive"]);
  assert.match(controls.trigger.textContent, /视频编辑/);
  assert.doesNotMatch(controls.trigger.textContent, /30s/);
  controls.click("omni-reference-task-type", "extend");
  assert.equal(controls.menu.querySelector("[data-duration-number]"), null);
  assert.match(controls.trigger.textContent, /视频延长/);
  controls.click("omni-reference-task-type", "auto");
  assert.ok(controls.menu.querySelector("[data-duration-range]"));
  assert.deepEqual(plain(h.window.createCanvasDocumentSnapshot()), snapshot);
  assert.deepEqual(plain([first, second]), canvases);
});

test("generation model selection crosses media types and retains independent per-model parameters", (t) => {
  const h = createHarness(t);
  h.window.setAgentOpen(true);
  const controls = agentParameterControls(h);
  controls.model("gpt-image-2");
  controls.open();
  controls.click("aspect", "3:2");
  controls.click("resolution", "4K");
  controls.click("quality", "高");
  assert.match(controls.trigger.textContent, /3:2/);
  assert.match(controls.trigger.textContent, /4K/);
  assert.match(controls.trigger.textContent, /高/);
  assert.equal(controls.menu.querySelector("[data-duration-range]"), null);

  controls.model("seedream-5-lite");
  controls.open();
  controls.click("aspect", "16:9");
  controls.click("resolution", "2K");
  assert.equal(controls.menu.querySelector('[data-action="quality"]'), null);
  controls.model("gpt-image-2");
  controls.open();
  for (const [action, value] of [["aspect", "3:2"], ["resolution", "4K"], ["quality", "高"]]) {
    assert.ok(controls.menu.querySelector(`[data-action="${action}"][data-value="${value}"].active`));
  }

  controls.model("kling-video-3");
  controls.open();
  controls.click("workflow", "first-last-frame");
  controls.click("aspect", "9:16");
  controls.click("quality", "1080p");
  controls.click("audio", "off");
  assert.match(controls.trigger.textContent, /首尾帧/);
  assert.equal(controls.menu.querySelector('[data-action="resolution"]'), null);
  controls.model("gpt-image-2");
  controls.open();
  assert.ok(controls.menu.querySelector('[data-action="aspect"][data-value="3:2"].active'));
  assert.ok(controls.menu.querySelector('[data-action="resolution"][data-value="4K"].active'));
  controls.model("kling-video-3");
  controls.open();
  assert.ok(controls.menu.querySelector('[data-action="workflow"][data-value="first-last-frame"].active'));
  assert.ok(controls.menu.querySelector('[data-action="audio"][data-value="off"].active'));
});

test("generation mode always selects exactly one model across image and video without mutating either canvas", (t) => {
  const h = createHarness(t);
  const first = h.canvas("one", [h.node("image", { mode: "image", model: "gpt-image-2" })]);
  const second = h.canvas("two", [h.node("video", { model: "kling-video-3" })]);
  h.install(first, second);
  h.window.setAgentOpen(true);
  const { document } = h.window;
  const snapshot = plain(h.window.createCanvasDocumentSnapshot());
  const canvases = plain([first, second]);
  const credits = plain(h.state.account);
  const trigger = document.querySelector("#agentModelBtn");
  const menu = document.querySelector("#agentModelMenu");
  const selectedIds = () => [...menu.querySelectorAll("[data-agent-model].active")].map((option) => option.dataset.agentModel);
  assert.deepEqual([...document.querySelectorAll("[data-agent-mode]")].map((option) => option.dataset.agentMode), ["generation", "agent"]);

  for (const id of ["gpt-image-2", "kling-video-3", "kling-video-3", "seedream-5-lite"]) {
    trigger.click();
    assert.equal(menu.querySelector("[data-agent-auto]"), null, "automatic multi-model preferences belong only to Agent mode");
    assert.ok(menu.querySelector('[data-agent-model-section="image"]'));
    assert.ok(menu.querySelector('[data-agent-model-section="video"]'));
    assert.deepEqual(selectedIds(), [h.window.getAgentComposerModel().id]);
    menu.querySelector(`[data-agent-model="${id}"]`).click();
    assert.equal(h.window.getAgentComposerModel().id, id);
    assert.equal(menu.classList.contains("hidden"), true);
    assert.equal(document.activeElement, trigger);
    trigger.click();
    assert.deepEqual(selectedIds(), [id], "reselecting the current model must not clear it or add a second selection");
    trigger.click();
    assert.equal(document.querySelector('[data-agent-mode="generation"]').getAttribute("aria-checked"), "true");
  }

  assert.deepEqual(plain(h.window.createCanvasDocumentSnapshot()), snapshot);
  assert.deepEqual(plain([first, second]), canvases);
  assert.deepEqual(plain(h.state.account), credits);
});

test("Agent multi-model preferences and automatic choice remain independent from the generation model", (t) => {
  const h = createHarness(t);
  h.window.setAgentOpen(true);
  const controls = agentParameterControls(h);
  const { document } = h.window;
  const trigger = document.querySelector("#agentModelBtn");
  const menu = document.querySelector("#agentModelMenu");
  const selectedIds = () => [...menu.querySelectorAll("[data-agent-model].active")].map((option) => option.dataset.agentModel).sort();
  const togglePreference = (id) => menu.querySelector(`[data-agent-model="${id}"]`).click();
  controls.model("kling-video-3");
  controls.mode("agent");
  assert.equal(h.window.getAgentComposerModel(), null);
  assert.equal(controls.trigger.disabled, true);
  assert.equal(trigger.disabled, false, "Agent preferences remain editable");
  trigger.click();
  assert.deepEqual(selectedIds(), ["seedance-2"], "choosing a generation model must not add it to the Agent pool");
  togglePreference("seedance-2");
  assert.deepEqual(selectedIds(), ["seedance-2"], "Agent keeps at least one preferred model");
  togglePreference("gpt-image-2");
  assert.deepEqual(selectedIds(), ["gpt-image-2", "seedance-2"]);
  assert.equal(menu.classList.contains("hidden"), false, "multi-select stays open for another preference");
  togglePreference("seedance-2");
  assert.deepEqual(selectedIds(), ["gpt-image-2"]);
  const auto = menu.querySelector("[data-agent-auto]");
  assert.ok(auto);
  auto.checked = true;
  auto.dispatchEvent(new h.window.Event("change", { bubbles: true }));

  controls.mode("generation");
  assert.equal(menu.classList.contains("hidden"), true);
  assert.equal(h.window.getAgentComposerModel().id, "kling-video-3");
  assert.equal(controls.trigger.disabled, false);
  controls.model("seedream-5-lite");
  controls.mode("agent");
  trigger.click();
  assert.deepEqual(selectedIds(), ["gpt-image-2"]);
  assert.equal(menu.querySelector("[data-agent-auto]").checked, true);
  controls.mode("generation");
  assert.equal(h.window.getAgentComposerModel().id, "seedream-5-lite");
});

test("Agent parameter disclosure closes for competing controls, restores keyboard focus and disables in managed mode", (t) => {
  const h = createHarness(t);
  h.window.setAgentOpen(true);
  const { document } = h.window;
  const controls = agentParameterControls(h);
  controls.open();
  controls.menu.querySelector("button").dispatchEvent(new h.window.KeyboardEvent("keydown", {
    key: "Escape", bubbles: true, cancelable: true,
  }));
  assert.equal(controls.menu.hidden, true);
  assert.equal(document.activeElement, controls.trigger);
  assert.equal(controls.trigger.getAttribute("aria-expanded"), "false");

  controls.open();
  const sendButton = document.querySelector(".agent-send");
  sendButton.focus();
  assert.equal(document.activeElement, sendButton);
  assert.equal(controls.menu.hidden, false, "moving keyboard focus outside the popup leaves it open");
  sendButton.dispatchEvent(new h.window.KeyboardEvent("keydown", {
    key: "Escape", bubbles: true, cancelable: true,
  }));
  assert.equal(controls.menu.hidden, true);
  assert.equal(document.activeElement, controls.trigger);
  assert.equal(controls.trigger.getAttribute("aria-expanded"), "false");

  for (const [buttonId, menuId] of [
    ["agentHistoryBtn", "agentHistoryMenu"], ["agentModeBtn", "agentModeMenu"],
    ["agentModelBtn", "agentModelMenu"], ["agentAdvancedBtn", "agentAdvancedSettings"],
  ]) {
    controls.open();
    document.getElementById(buttonId).click();
    assert.equal(controls.menu.hidden, true, `${buttonId} must close Agent parameters`);
    assert.equal(document.getElementById(menuId).classList.contains("hidden"), false);
    controls.open();
    assert.equal(document.getElementById(menuId).classList.contains("hidden"), true, "opening parameters closes the competing surface");
  }
  document.querySelector("#agentCloseBtn").click();
  assert.equal(controls.menu.hidden, true);
  h.window.setAgentOpen(true);
  controls.mode("agent");
  assert.equal(controls.trigger.disabled, true);
  controls.trigger.click();
  assert.equal(controls.menu.hidden, true);
  controls.mode("generation");
  assert.equal(controls.trigger.disabled, false);
  controls.open();
});


test("audio playhead seeks in screen coordinates without moving the node or writing canvas history", (t) => {
  const h = createHarness(t);
  const asset = { id: "audio-source", name: "sample.wav", type: "audio", url: "https://media.example/audio.wav", duration: 20 };
  const node = Object.assign(h.window.defaultAssetNode(80, 100, asset), { id: "audio-node" });
  h.install(h.canvas("first", [node]), h.canvas("second"));
  const element = h.window.document.querySelector('.canvas-node[data-id="audio-node"]');
  const timeline = element.querySelector("[data-audio-progress]");
  const head = element.querySelector("[data-audio-playhead]");
  const media = element.querySelector("audio");
  Object.defineProperties(media, { duration: { configurable: true, value: 20 }, readyState: { configurable: true, value: 1 } });
  media.dispatchEvent(new h.window.Event("loadedmetadata"));
  assert.equal(element.querySelector(".media-spec"), null, "duration belongs inside the audio player");
  assert.equal(element.querySelector("[data-audio-duration]").textContent, "00:20");
  timeline.getBoundingClientRect = () => ({ left: 100, right: 300, top: 100, bottom: 180, width: 200, height: 80 });
  const before = JSON.stringify(h.window.createCanvasDocumentSnapshot());
  const historyBefore = h.state.canvases[0].undoStack.length;
  const pointer = (type, x) => {
    const event = new h.window.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: 140 });
    Object.defineProperty(event, "pointerId", { value: 72 });
    return event;
  };
  head.dispatchEvent(pointer("pointerdown", 100));
  head.dispatchEvent(pointer("pointermove", 250));
  head.dispatchEvent(pointer("pointerup", 250));
  assert.equal(media.currentTime, 15);
  assert.equal(element.querySelector("[data-audio-current]").textContent, "00:15");
  assert.equal(element.querySelector(".media-content.audio").style.getPropertyValue("--audio-progress"), "75.0000%");
  assert.equal(h.state.action, null);
  assert.equal(JSON.stringify(h.window.createCanvasDocumentSnapshot()), before);
  assert.equal(h.state.canvases[0].undoStack.length, historyBefore);
  head.dispatchEvent(new h.window.KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true }));
  assert.equal(media.currentTime, 0);
  assert.equal(h.state.action, null);
  h.state.isSpaceDown = true;
  timeline.dispatchEvent(pointer("pointerdown", 200));
  assert.equal(h.state.action?.type, "pan", "Space on the waveform continues to pan the canvas");
});

test("audio waveform clicks select and drags move the node without seeking or replacing its player", (t) => {
  const h = createHarness(t);
  const asset = { id: "audio-source", name: "sample.wav", type: "audio", url: "https://media.example/audio.wav", duration: 20 };
  const node = Object.assign(h.window.defaultAssetNode(80, 100, asset), { id: "audio-node" });
  h.install(h.canvas("first", [node]), h.canvas("second"));
  const element = h.window.document.querySelector('.canvas-node[data-id="audio-node"]');
  const timeline = element.querySelector("[data-audio-progress]");
  const media = element.querySelector("audio");
  Object.defineProperties(media, { duration: { configurable: true, value: 20 }, readyState: { configurable: true, value: 1 } });
  media.currentTime = 7;
  media.dispatchEvent(new h.window.Event("loadedmetadata"));
  let pauses = 0;
  media.pause = () => { pauses++; };
  const pointer = (type, x, y) => {
    const event = new h.window.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y });
    Object.defineProperty(event, "pointerId", { value: 73 });
    return event;
  };
  timeline.dispatchEvent(pointer("pointerdown", 200, 140));
  assert.equal(h.state.action?.type, "drag-candidate", "the waveform belongs to the normal node gesture");
  h.window.dispatchEvent(pointer("pointerup", 200, 140));
  assert.equal(h.state.selectedIds.has(node.id), true);
  assert.equal(h.state.canvases[0].undoStack.length, 0, "a selection creates no content history");
  assert.equal(h.window.document.querySelector('.canvas-node[data-id="audio-node"]'), element);
  assert.equal(element.querySelector("audio"), media);
  assert.equal(media.currentTime, 7);
  const origin = { x: node.x, y: node.y };
  const scale = h.state.scale;
  timeline.dispatchEvent(pointer("pointerdown", 200, 140));
  h.window.dispatchEvent(pointer("pointermove", 240, 160));
  h.window.dispatchEvent(pointer("pointerup", 240, 160));
  assert.equal(node.x, origin.x + 40 / scale);
  assert.equal(node.y, origin.y + 20 / scale);
  assert.equal(element.querySelector("audio"), media, "moving keeps the existing audio element");
  assert.equal(media.currentTime, 7, "moving the node leaves playback position unchanged");
  assert.equal(pauses, 0, "selecting or moving must not pause playback");
  assert.equal(h.state.canvases[0].undoStack.length, 1);
  h.window.undoLastAction();
  assert.equal(node.x, origin.x);
  assert.equal(node.y, origin.y);
  assert.equal(media.currentTime, 7);
  node.assets[0].url = "https://media.example/replacement.wav";
  h.window.render();
  const replacement = h.window.document.querySelector('.canvas-node[data-id="audio-node"] audio');
  assert.notEqual(replacement, media, "a changed audio source must replace the old player");
  assert.equal(replacement.getAttribute("src"), node.assets[0].url);
  assert.equal(media.getAttribute("src"), null, "the replaced player releases its decoder");
});

test("audio nodes release playback on canvas switch and read-only timelines remain usable", (t) => {
  const h = createHarness(t);
  const asset = { id: "audio-source", name: "sample.wav", type: "audio", url: "https://media.example/audio.wav", duration: 10 };
  const node = Object.assign(h.window.defaultAssetNode(80, 100, asset), { id: "audio-node" });
  h.install(h.canvas("first", [node]), h.canvas("second"));
  const element = h.window.document.querySelector('.canvas-node[data-id="audio-node"]');
  const media = element.querySelector("audio");
  let pauses = 0;
  media.pause = () => { pauses++; };
  Object.defineProperties(media, { duration: { configurable: true, value: 10 }, readyState: { configurable: true, value: 1 } });
  media.dispatchEvent(new h.window.Event("loadedmetadata"));
  const host = { postMessage() {} };
  Object.defineProperty(h.window, "parent", { configurable: true, value: host });
  const dispatch = (data) => h.window.canvasTest.canvasPersistence.handleHostMessage({
    origin: h.window.location.origin, source: host, data: { source: "reelay-shell", ...data },
  });
  dispatch({ type: "host:init", context: { protocolVersion: 1, projectId: h.state.projectId, canvasId: "first", writable: false } });
  dispatch({ type: "host:document", protocolVersion: 1, document: null, writable: false });
  assert.equal(h.window.canvasTest.canvasPersistence.getAccessMode(), "readonly");
  const head = element.querySelector("[data-audio-playhead]");
  head.dispatchEvent(new h.window.KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true }));
  assert.equal(media.currentTime, 10);
  assert.equal(h.state.canvases[0].undoStack.length, 0);
  h.window.switchCanvas("second");
  assert.ok(pauses > 0, "detached audio must be paused");
  assert.equal(media.getAttribute("src"), null, "detached media must release its decoder");
});
