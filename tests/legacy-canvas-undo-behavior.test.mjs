import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const root = new URL("../", import.meta.url);
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
  window.setTimeout = (callback, delay) => {
    const id = ++nextTimerId;
    timers.set(id, callback);
    timerDelays.set(id, delay);
    return id;
  };
  window.clearTimeout = (id) => timers.delete(id);
  window.URL.createObjectURL = () => "blob:http://reelay.test/mock";
  window.URL.revokeObjectURL = () => {};
  window.Element.prototype.setPointerCapture = () => {};
  window.Element.prototype.releasePointerCapture = () => {};
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  for (const { path, source } of scripts) {
    window.eval(source + (path === "./app.js"
      ? "\nwindow.canvasTest = { state, canvasRuntimeStore, canvasNodeDragController, canvasGroupInteractionController, canvasCommandExecutor, canvasContentCommands, canvasEntityUse, canvasNodeTasks, canvasPersistence };"
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
  return { window, state, node, canvas, install, fireTimer, moveNode, resizeGroup, pointerGesture, timers, scheduledTask, metadataImages };
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
  assert.equal(h.window.libraryImagePreviewUrl("http://reelay.test/api/assets/1/content", "image"), "http://reelay.test/api/assets/1/content?preview=library");
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
  const input = h.window.document.querySelector('[data-id="editing"] [data-node-prompt-input]');
  input.focus();
  input.setSelectionRange(2, 6);
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
  assert.equal(h.window.document.querySelector('[data-id="editing"] [data-node-prompt-input]'), input);
  assert.equal(input.selectionStart, 2);
  assert.equal(input.selectionEnd, 6);
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
    contentUrl: `/api/catalog-images/${index}/content`,
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
  const input = element.querySelector("[data-node-prompt-input]");
  const media = element.querySelector(".media-frame");
  const prompt = "镜头缓慢推进，保持玻璃材质与光影连续。".repeat(120);
  input.value = prompt;
  input.dispatchEvent(new h.window.Event("input", { bubbles: true }));
  input.setSelectionRange(12, 26, "backward");
  input.scrollTop = 640;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    element.querySelector('[data-action="advanced-settings-toggle"]').click();
    assert.equal(node.advancedSettingsExpanded, iteration % 2 === 0, "one click toggles once");
    assert.equal(h.window.document.querySelector('[data-id="reading-position"]'), element);
    assert.equal(element.querySelector(".prompt-panel"), panel);
    assert.equal(element.querySelector("[data-node-prompt-input]"), input);
    assert.equal(element.querySelector(".media-frame"), media);
    assert.equal(input.scrollTop, 640);
    assert.equal(input.value, prompt);
    assert.deepEqual([input.selectionStart, input.selectionEnd, input.selectionDirection], [12, 26, "backward"]);
  }
  input.focus();
  h.window.render();
  assert.equal(h.window.document.activeElement, input, "unrelated redraw does not leave text editing");
  element.querySelector('[data-action="advanced-settings-toggle"]').click();
  const beforeValidation = node.assetValidationEnabled;
  element.querySelector('[data-action="asset-validation"]').click();
  assert.equal(node.assetValidationEnabled, !beforeValidation);
  assert.equal(input.scrollTop, 640);
  h.window.handleAction(node, "param-panel");
  assert.equal(element.querySelector("[data-node-prompt-input]"), input);
  const range = element.querySelector("[data-duration-range]");
  const number = element.querySelector("[data-duration-number]");
  range.value = "12";
  range.dispatchEvent(new h.window.Event("input", { bubbles: true }));
  assert.equal(number.value, "12");
  range.dispatchEvent(new h.window.Event("change", { bubbles: true }));
  assert.equal(node.duration, "12s");
  assert.equal(element.querySelector("[data-node-prompt-input]"), input);
  input.value += "继续编辑";
  input.dispatchEvent(new h.window.Event("input", { bubbles: true }));
  assert.equal(node.prompt, input.value, "retained listener still edits the live node");
  node.prompt = "外部更新后的提示词";
  h.window.render();
  assert.equal(input.value, node.prompt);
  input.focus();
  input.dispatchEvent(new h.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.notEqual(h.window.document.activeElement, input);
  assert.equal(node.expanded, true);

  const replacement = h.node(node.id, { expanded: true, prompt: node.prompt });
  h.install(h.canvas("another-reading", [replacement]));
  const replacementInput = h.window.document.querySelector("[data-node-prompt-input]");
  assert.notEqual(replacementInput, input, "same ID in another canvas has its own editor");
  replacementInput.value = "只属于新画布";
  replacementInput.dispatchEvent(new h.window.Event("input", { bubbles: true }));
  assert.equal(replacement.prompt, "只属于新画布");
  assert.equal(node.prompt, "外部更新后的提示词");
});

test("prompt scrolling follows editing focus instead of interrupting canvas navigation on hover", (t) => {
  const h = createHarness(t);
  const node = h.node("scroll-editor", { expanded: true });
  h.install(h.canvas("scrolling", [node]));
  const input = h.window.document.querySelector("[data-node-prompt-input]");
  const panel = input.closest(".prompt-panel");
  const shell = h.window.document.querySelector("#canvasShell");
  const originalPrompt = node.prompt;
  Object.defineProperties(input, {
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
    input.scrollTop = scrollTop;
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
  Object.defineProperty(input, "scrollHeight", { configurable: true, value: 100 });
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
  const promptInput = h.window.document.querySelector('.canvas-node[data-id="video"] .prompt-input');
  promptInput.value = "手动修改的提示词";
  promptInput.dispatchEvent(new h.window.Event("input", { bubbles: true }));
  h.window.undoLastAction();
  assert.equal(node.prompt, "手动修改的提示词");
  assert.equal(first.undoStack.length, 1);
  assert.deepEqual({ x: node.x, y: node.y }, { x: 110, y: 120 });
  h.window.undoLastAction();
  assert.equal(node.prompt, "手动修改的提示词");
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
  const prompt = h.window.document.querySelector('.canvas-node[data-id="edited"] .prompt-input');
  prompt.value = "参数修改之后的新提示词";
  prompt.dispatchEvent(new h.window.Event("input", { bubbles: true }));
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
  assert.equal(node.prompt, prompt.value);
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
