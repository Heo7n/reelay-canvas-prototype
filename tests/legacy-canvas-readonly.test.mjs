import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const root = new URL("../", import.meta.url);
const [html, catalog, config, codec, app] = await Promise.all([
  readFile(new URL("index.html", root), "utf8"),
  readFile(new URL("data/model-catalog.js", root), "utf8"),
  readFile(new URL("src/config/prototype-config.js", root), "utf8"),
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
  const prompt = node.querySelector(".prompt-input");
  const generate = node.querySelector("[data-action='generate']");
  assert.match(window.document.querySelector("#canvasAccessStatus").textContent, /只读/);
  assert.equal(window.document.querySelector("#profileName").textContent, "林静");
  assert.equal(window.document.querySelector("#profileEmail").textContent, "linjing@reelay.test");
  assert.equal(window.document.querySelector("#profileOrganizationRole").textContent, "管理员");
  assert.equal(window.document.querySelector(".empty-create-main").textContent, "此画布暂无内容");
  assert.equal(window.document.querySelector(".empty-create-sub").textContent, "只读模式下不可新建节点");
  assert.equal(prompt.readOnly, true);
  assert.equal(generate.disabled, true);

  shell.dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true, clientX: 400, clientY: 300 }));
  assert.equal(window.document.querySelectorAll(".canvas-node").length, 1);

  prompt.value = "不应写入";
  prompt.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.equal(prompt.value, "原始提示词");

  node.dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 30, clientY: 40 }));
  window.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, key: "Delete" }));
  assert.equal(window.document.querySelectorAll(".canvas-node").length, 1);

  const stage = window.document.querySelector("#canvasStage");
  const zoom = window.document.querySelector("#zoomSlider");
  zoom.value = "120";
  zoom.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.match(stage.style.transform, /scale\(1\.2\)/);

  dom.window.close();
});
