import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const root = new URL("../", import.meta.url);
const [html, catalog, config, connections, codec, app] = await Promise.all([
  readFile(new URL("index.html", root), "utf8"),
  readFile(new URL("data/model-catalog.js", root), "utf8"),
  readFile(new URL("src/config/prototype-config.js", root), "utf8"),
  readFile(new URL("src/legacy-canvas/canvas-connections.js", root), "utf8"),
  readFile(new URL("src/legacy-canvas/canvas-document-codec.js", root), "utf8"),
  readFile(new URL("app.js", root), "utf8"),
]);

test("a hosted read-only canvas blocks editing while preserving viewport controls", () => {
  const dom = new JSDOM(html, {
    url: "http://reelay.test/index.html",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const hostWindow = { postMessage() {} };
  Object.defineProperty(window, "parent", { configurable: true, value: hostWindow });
  window.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  });
  window.structuredClone = structuredClone;
  window.requestAnimationFrame = (callback) => {
    callback(0);
    return 1;
  };
  window.cancelAnimationFrame = () => {};
  window.URL.createObjectURL = () => "blob:http://reelay.test/mock";
  window.URL.revokeObjectURL = () => {};
  window.Element.prototype.setPointerCapture = () => {};
  window.Element.prototype.releasePointerCapture = () => {};

  window.eval(catalog);
  window.eval(config);
  window.eval(connections);
  window.eval(codec);
  window.eval(app);

  const content = window.REELAY_CANVAS_DOCUMENT_CODEC.createSnapshot({
    activeCanvasId: "canvas-1",
    lastPreset: { mode: "image", model: "gpt-image-2", aspect: "16:9", resolution: "2K", quality: "high", duration: "4s", count: 1 },
    canvases: [{
      id: "canvas-1",
      name: "主画布",
      tx: 0,
      ty: 0,
      scale: 1,
      zCounter: 2,
      groups: [],
      nodes: [{
        id: "node-1",
        kind: "generator",
        x: 20,
        y: 30,
        z: 1,
        mode: "image",
        model: "gpt-image-2",
        aspect: "16:9",
        resolution: "2K",
        quality: "high",
        duration: "4s",
        count: 1,
        prompt: "原始提示词",
        preview: false,
        name: "",
        generatedAsset: null,
        lockedMode: null,
        assets: [],
        activeAssetId: null,
      }],
    }],
  });
  const dispatchHostMessage = (data) => window.dispatchEvent(new window.MessageEvent("message", {
    data,
    origin: window.location.origin,
    source: hostWindow,
  }));
  dispatchHostMessage({
    source: "reelay-shell",
    type: "host:init",
    context: {
      protocolVersion: 1,
      workspaceId: "workspace-1",
      projectId: "project-1",
      projectName: "只读项目",
      canvasId: "main",
      theme: "light",
      writable: false,
      actor: {
        account: "linjing@reelay.test",
        displayName: "林静",
      },
      workspace: {
        name: "星海视觉工作室",
        role: "admin",
      },
    },
  });
  dispatchHostMessage({
    source: "reelay-shell",
    type: "host:document",
    protocolVersion: 1,
    document: { id: "main", projectId: "project-1", schemaVersion: 1, revision: 1, content },
    writable: false,
  });

  const shell = window.document.querySelector("#canvasShell");
  const node = window.document.querySelector(".canvas-node[data-id='node-1']");
  const media = node.querySelector(".media-frame");
  assert.match(window.document.querySelector("#canvasAccessStatus").textContent, /只读/);
  assert.equal(window.document.querySelector("#profileName").textContent, "林静");
  assert.equal(window.document.querySelector("#profileEmail").textContent, "linjing@reelay.test");
  assert.equal(window.document.querySelector("#profileOrganizationRole").textContent, "管理员");
  assert.equal(window.document.querySelector(".empty-create-main").textContent, "此画布暂无内容");
  assert.equal(window.document.querySelector(".empty-create-sub").textContent, "只读模式下不可新建节点");
  assert.equal(node.querySelector(".prompt-panel"), null);

  shell.dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true, clientX: 400, clientY: 300 }));
  assert.equal(window.document.querySelectorAll(".canvas-node").length, 1);

  node.dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 30, clientY: 40 }));
  window.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, key: "Delete" }));
  assert.equal(window.document.querySelectorAll(".canvas-node").length, 1);

  const stage = window.document.querySelector("#canvasStage");
  const zoom = window.document.querySelector("#zoomSlider");
  zoom.value = "120";
  zoom.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.match(stage.style.transform, /scale\(1\.2\)/);

  const canvasZoom = new window.WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    ctrlKey: true,
    deltaY: -100,
    clientX: 80,
    clientY: 90,
  });
  media.dispatchEvent(canvasZoom);
  assert.equal(canvasZoom.defaultPrevented, true);
  assert.ok(Number(zoom.value) > 120);

  const canvasPan = new window.WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaX: 12,
    deltaY: 34,
  });
  const transformBeforeCanvasPan = stage.style.transform;
  media.dispatchEvent(canvasPan);
  assert.equal(canvasPan.defaultPrevented, true);
  assert.notEqual(stage.style.transform, transformBeforeCanvasPan);

  const scaleBeforeControlWheel = stage.style.transform;
  const controlWheel = new window.WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    ctrlKey: true,
    deltaY: -100,
  });
  zoom.dispatchEvent(controlWheel);
  assert.equal(controlWheel.defaultPrevented, true);
  assert.equal(stage.style.transform, scaleBeforeControlWheel);

  const ordinaryControlWheel = new window.WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaY: 100,
  });
  zoom.dispatchEvent(ordinaryControlWheel);
  assert.equal(ordinaryControlWheel.defaultPrevented, false);
  assert.equal(stage.style.transform, scaleBeforeControlWheel);

  for (const className of [
    "prompt-panel",
    "panel-popover",
    "material-panel",
    "media-edit-toolbar",
    "selection-toolbar",
    "toolbar-dropdown",
    "confirm-dialog",
    "canvas-tool-popover",
  ]) {
    const protectedSurface = window.document.createElement("div");
    protectedSurface.className = className;
    shell.append(protectedSurface);

    const protectedWheel = new window.WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: 100,
    });
    protectedSurface.dispatchEvent(protectedWheel);
    assert.equal(protectedWheel.defaultPrevented, true, className);
    assert.equal(stage.style.transform, scaleBeforeControlWheel, className);

    const ordinaryWheel = new window.WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 100,
    });
    protectedSurface.dispatchEvent(ordinaryWheel);
    assert.equal(ordinaryWheel.defaultPrevented, false, className);
    assert.equal(stage.style.transform, scaleBeforeControlWheel, className);
    protectedSurface.remove();
  }

  for (const configureTarget of [
    (target) => { target.dataset.wheelScope = "local"; },
    (target) => { target.setAttribute("contenteditable", "true"); },
    (target) => { target.setAttribute("role", "slider"); },
  ]) {
    const protectedSurface = window.document.createElement("div");
    configureTarget(protectedSurface);
    shell.append(protectedSurface);
    const protectedWheel = new window.WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaY: 100,
    });
    protectedSurface.dispatchEvent(protectedWheel);
    assert.equal(protectedWheel.defaultPrevented, true);
    assert.equal(stage.style.transform, scaleBeforeControlWheel);
    protectedSurface.remove();
  }

  for (const inertCanvasWheel of [
    { deltaX: 100, deltaY: 0 },
    { deltaX: 0, deltaY: 0.01 },
  ]) {
    const protectedWheel = new window.WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      ...inertCanvasWheel,
    });
    media.dispatchEvent(protectedWheel);
    assert.equal(protectedWheel.defaultPrevented, true);
    assert.equal(stage.style.transform, scaleBeforeControlWheel);
  }

  for (const target of [
    window.document.querySelector("#assetLibrarySearchInput"),
    window.document.querySelector("#agentInput"),
    window.document.querySelector("#railProfileBtn"),
  ]) {
    const protectedWheel = new window.WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      metaKey: true,
      deltaY: 100,
    });
    target.dispatchEvent(protectedWheel);
    assert.equal(protectedWheel.defaultPrevented, true);
    assert.equal(stage.style.transform, scaleBeforeControlWheel);
  }

  const lineModeWheel = new window.WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    ctrlKey: true,
    deltaMode: 1,
    deltaY: -3,
  });
  media.dispatchEvent(lineModeWheel);
  assert.equal(lineModeWheel.defaultPrevented, true);
  assert.notEqual(stage.style.transform, scaleBeforeControlWheel);

  dom.window.close();
});
