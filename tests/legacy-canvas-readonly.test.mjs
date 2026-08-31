import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const root = new URL("../", import.meta.url);
const [html, catalog, config, connections, connectionInteraction, connectionFeedbackMotion, connectionFeedbackController, connectionRenderer, layerReconciler, generatorModelPolicy, popoverPlacement, spatialSelection, nodeInteraction, nodePlacement, nodeLayoutTransition, nodePointerController, nodeDragController, groupInteractionController, pointerInteractionController, pointerDispatchController, assetLibraryModel, mediaToolbarView, runtimeStore, commandExecutor, codec, persistenceCoordinator, app] = await Promise.all([
  readFile(new URL("index.html", root), "utf8"),
  readFile(new URL("data/model-catalog.js", root), "utf8"),
  readFile(new URL("src/config/prototype-config.js", root), "utf8"),
  readFile(new URL("src/legacy-canvas/canvas-connections.js", root), "utf8"),
  readFile(new URL("src/legacy-canvas/canvas-connection-interaction.js", root), "utf8"),
  readFile(new URL("src/legacy-canvas/canvas-connection-feedback-motion.js", root), "utf8"),
  readFile(new URL("src/legacy-canvas/canvas-connection-feedback-controller.js", root), "utf8"),
  readFile(new URL("src/legacy-canvas/canvas-connection-renderer.js", root), "utf8"),
  readFile(new URL("src/legacy-canvas/canvas-layer-reconciler.js", root), "utf8"),
  readFile(new URL("src/legacy-canvas/canvas-generator-model-policy.js", root), "utf8"),
  readFile(new URL("src/legacy-canvas/canvas-popover-placement.js", root), "utf8"),
  readFile(new URL("src/legacy-canvas/canvas-spatial-selection.js", root), "utf8"),
  readFile(new URL("src/legacy-canvas/canvas-node-interaction.js", root), "utf8"),
  readFile(new URL("src/legacy-canvas/canvas-node-placement.js", root), "utf8"),
  readFile(new URL("src/legacy-canvas/canvas-node-layout-transition.js", root), "utf8"),
  readFile(new URL("src/legacy-canvas/canvas-node-pointer-controller.js", root), "utf8"),
  readFile(new URL("src/legacy-canvas/canvas-node-drag-controller.js", root), "utf8"),
  readFile(new URL("src/legacy-canvas/canvas-group-interaction-controller.js", root), "utf8"),
  readFile(new URL("src/legacy-canvas/canvas-pointer-interaction-controller.js", root), "utf8"),
  readFile(new URL("src/legacy-canvas/canvas-pointer-dispatch-controller.js", root), "utf8"),
  readFile(new URL("src/legacy-canvas/canvas-asset-library-model.js", root), "utf8"),
  readFile(new URL("src/legacy-canvas/canvas-media-toolbar-view.js", root), "utf8"),
  readFile(new URL("src/legacy-canvas/canvas-runtime-store.js", root), "utf8"),
  readFile(new URL("src/legacy-canvas/canvas-command-executor.js", root), "utf8"),
  readFile(new URL("src/legacy-canvas/canvas-document-codec.js", root), "utf8"),
  readFile(new URL("src/legacy-canvas/canvas-persistence-coordinator.js", root), "utf8"),
  readFile(new URL("app.js", root), "utf8"),
]);

test("a hosted canvas enforces read-only access, preserves viewport controls, and saves guarded menu renames", () => {
  const dom = new JSDOM(html, {
    url: "http://reelay.test/index.html",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const postedMessages = [];
  const hostWindow = { postMessage(message) { postedMessages.push(message); } };
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
  window.eval(connectionInteraction);
  window.eval(connectionFeedbackMotion);
  window.eval(connectionFeedbackController);
  window.eval(connectionRenderer);
  window.eval(layerReconciler);
  window.eval(generatorModelPolicy);
  window.eval(popoverPlacement);
  window.eval(spatialSelection);
  window.eval(nodeInteraction);
  window.eval(nodePlacement);
  window.eval(nodeLayoutTransition);
  window.eval(nodePointerController);
  window.eval(nodeDragController);
  window.eval(groupInteractionController);
  window.eval(pointerInteractionController);
  window.eval(pointerDispatchController);
  window.eval(assetLibraryModel);
  window.eval(mediaToolbarView);
  window.eval(runtimeStore);
  window.eval(commandExecutor);
  window.eval(codec);
  window.eval(persistenceCoordinator);
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
  const hostContext = {
    protocolVersion: 1,
    capabilities: { accountSections: true },
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
  };
  dispatchHostMessage({
    source: "reelay-shell",
    type: "host:init",
    context: hostContext,
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
  assert.equal(window.document.querySelector("#railProfileBtn").getAttribute("aria-label"), "个人：林静");
  assert.equal(window.document.querySelector("#railProfileBtn").getAttribute("aria-expanded"), "false");
  assert.equal(window.document.querySelector("#profileCreditValue").textContent, "3,000");
  assert.equal(
    window.document.querySelector("[data-profile-action='credits']").getAttribute("aria-label"),
    "查看我的积分，当前 3,000",
  );
  assert.equal(window.document.querySelector(".empty-create-main").textContent, "画布暂无内容");
  assert.equal(window.document.querySelector(".empty-create-sub"), null);
  assert.equal(node.querySelector(".prompt-panel"), null);

  const readonlyProjectName = window.document.querySelector("[data-project-name]");
  readonlyProjectName.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
  assert.notEqual(readonlyProjectName.contentEditable, "true");

  postedMessages.length = 0;
  const homeButtons = [...window.document.querySelectorAll("[data-canvas-home-button]")];
  assert.equal(homeButtons.length, 2);
  homeButtons.forEach((button) => {
    button.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    assert.equal(postedMessages.at(-1).type, "canvas:navigate");
    assert.equal(postedMessages.at(-1).target, "home");
  });

  window.document.querySelector("[data-profile-action='credits']")
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal(postedMessages.at(-1).type, "canvas:open-account");
  assert.equal(postedMessages.at(-1).section, "credits");

  window.document.querySelector("[data-profile-action='account']")
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal(postedMessages.at(-1).type, "canvas:open-account");
  assert.equal(Object.hasOwn(postedMessages.at(-1), "section"), false);

  const profileButton = window.document.querySelector("#railProfileBtn");
  profileButton.getClientRects = () => [{}];
  profileButton.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
  assert.equal(profileButton.getAttribute("aria-expanded"), "true");
  assert.equal(window.document.activeElement, window.document.querySelector("#profileCreditsBtn"));
  window.document.activeElement.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
  assert.equal(profileButton.getAttribute("aria-expanded"), "false");
  assert.equal(window.document.activeElement, profileButton);

  const projectMenuButton = window.document.querySelector(".top-bar [data-project-menu-button]");
  projectMenuButton.getClientRects = () => [{}];
  projectMenuButton.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }));
  assert.equal(projectMenuButton.getAttribute("aria-expanded"), "true");
  assert.equal(window.document.activeElement, window.document.querySelector("[data-project-action='all']"));
  window.document.activeElement.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
  assert.equal(projectMenuButton.getAttribute("aria-expanded"), "false");
  assert.equal(window.document.activeElement, projectMenuButton);

  const canvasMenuButton = window.document.querySelector(".left-rail [data-canvas-menu-button]");
  canvasMenuButton.getClientRects = () => [{}];
  canvasMenuButton.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }));
  assert.equal(canvasMenuButton.getAttribute("aria-expanded"), "true");
  assert.equal(window.document.activeElement, window.document.querySelector(".canvas-menu-switch"));
  const firstCanvasMoreButton = window.document.querySelector("[data-canvas-more]");
  firstCanvasMoreButton.getClientRects = () => [{}];
  firstCanvasMoreButton.focus();
  firstCanvasMoreButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true, detail: 0 }));
  assert.equal(firstCanvasMoreButton.getAttribute("aria-expanded"), "true");
  assert.equal(window.document.activeElement, window.document.querySelector("[data-canvas-more-action='open']"));
  window.document.activeElement.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
  assert.equal(firstCanvasMoreButton.getAttribute("aria-expanded"), "false");
  assert.equal(window.document.activeElement, firstCanvasMoreButton);
  canvasMenuButton.focus();
  canvasMenuButton.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
  assert.equal(canvasMenuButton.getAttribute("aria-expanded"), "false");

  window.document.querySelector("#railLibraryBtn")
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  window.document.querySelector("#agentLauncher")
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const assetWidth = Number.parseFloat(window.document.querySelector(".app-shell").style.getPropertyValue("--asset-panel-width"));
  const agentWidth = Number.parseFloat(window.document.querySelector(".app-shell").style.getPropertyValue("--agent-width"));
  assert.ok(assetWidth + agentWidth <= window.innerWidth - 280);
  window.document.querySelector("#agentCloseBtn")
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  window.document.querySelector("#assetLibraryCloseBtn")
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  const originalInnerWidth = window.innerWidth;
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 900 });
  window.dispatchEvent(new window.Event("resize"));
  window.document.querySelector("#railLibraryBtn")
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  window.document.querySelector("#agentLauncher")
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal(window.document.querySelector("#assetLibraryPanel").classList.contains("hidden"), true);
  assert.equal(window.document.querySelector("#agentDock").classList.contains("open"), true);
  window.document.querySelector("#agentCloseBtn")
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  Object.defineProperty(window, "innerWidth", { configurable: true, value: originalInnerWidth });
  window.dispatchEvent(new window.Event("resize"));

  window.document.querySelector(".left-rail [data-canvas-menu-button]")
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  window.document.querySelector("[data-canvas-more]")
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const readonlyRename = window.document.querySelector("[data-canvas-more-action='rename']");
  assert.equal(readonlyRename.disabled, true);
  readonlyRename.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal(window.document.querySelector("input.canvas-menu-name.editing"), null);
  assert.equal(postedMessages.some((message) => message.type === "canvas:save"), false);

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
    "canvas-tools",
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

  dispatchHostMessage({
    source: "reelay-shell",
    type: "host:init",
    context: { ...hostContext, writable: true },
  });
  dispatchHostMessage({
    source: "reelay-shell",
    type: "host:document",
    protocolVersion: 1,
    document: { id: "main", projectId: "project-1", schemaVersion: 1, revision: 1, content },
    writable: true,
  });

  const projectMenuTrigger = window.document.querySelector("[data-project-menu-button]");
  projectMenuTrigger.focus();
  projectMenuTrigger.dispatchEvent(new window.MouseEvent("click", { bubbles: true, detail: 1 }));
  assert.equal(window.document.querySelector("#projectMenu").classList.contains("hidden"), false);
  projectMenuTrigger.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }));
  assert.equal(window.document.querySelector("#projectMenu").classList.contains("hidden"), false);
  assert.equal(window.document.activeElement, window.document.querySelector("#projectMenu [role='menuitem']"));
  window.document.activeElement.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
  assert.equal(window.document.querySelector("#projectMenu").classList.contains("hidden"), true);
  assert.equal(window.document.activeElement, projectMenuTrigger);

  const canvasMenuTrigger = window.document.querySelector(".left-rail [data-canvas-menu-button]");
  canvasMenuTrigger.focus();
  canvasMenuTrigger.dispatchEvent(new window.MouseEvent("click", { bubbles: true, detail: 1 }));
  assert.equal(window.document.querySelector("#canvasMenu").classList.contains("hidden"), false);
  canvasMenuTrigger.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }));
  assert.equal(window.document.querySelector("#canvasMenu").classList.contains("hidden"), false);
  assert.equal(window.document.activeElement, window.document.querySelector("#canvasMenu [role='menuitem']"));
  window.document.activeElement.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
  assert.equal(window.document.querySelector("#canvasMenu").classList.contains("hidden"), true);
  assert.equal(window.document.activeElement, canvasMenuTrigger);

  const beginMenuRename = () => {
    window.document.querySelector("#canvasMenu").classList.add("hidden");
    window.document.querySelector("#canvasMoreMenu").classList.add("hidden");
    window.document.querySelector(".left-rail [data-canvas-menu-button]")
      .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    window.document.querySelector("[data-canvas-more]")
      .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    window.document.querySelector("[data-canvas-more-action='rename']")
      .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    return window.document.querySelector("input.canvas-menu-name.editing");
  };

  postedMessages.length = 0;
  const cancelledRename = beginMenuRename();
  assert.ok(cancelledRename);
  cancelledRename.value = "不应保存";
  cancelledRename.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
  assert.equal(postedMessages.some((message) => message.type === "canvas:dirty"), false);
  assert.match(window.document.querySelector("[data-canvas-name]").textContent, /主画布/);
  assert.equal(window.document.activeElement, window.document.querySelector(".canvas-menu-switch"));

  postedMessages.length = 0;
  const unchangedRename = beginMenuRename();
  assert.equal(unchangedRename.value, "主画布");
  unchangedRename.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
  assert.equal(postedMessages.some((message) => message.type === "canvas:dirty"), false);
  assert.equal(window.document.activeElement, window.document.querySelector(".canvas-menu-switch"));

  postedMessages.length = 0;
  const committedRename = beginMenuRename();
  committedRename.value = "分镜画布";
  committedRename.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
  assert.equal(postedMessages.some((message) => message.type === "canvas:dirty" && message.dirty), true);
  assert.equal(window.document.activeElement, window.document.querySelector(".canvas-menu-switch"));
  dispatchHostMessage({ source: "reelay-shell", type: "host:flush", protocolVersion: 1 });
  const renameSave = postedMessages.findLast((message) => message.type === "canvas:save");
  assert.ok(renameSave);
  const savedRenameContent = typeof renameSave.content === "string"
    ? JSON.parse(renameSave.content)
    : renameSave.content;
  assert.equal(savedRenameContent.canvases[0].name, "分镜画布");

  const tabRename = beginMenuRename();
  const tabMoreButton = window.document.querySelector("[data-canvas-more]");
  tabRename.dispatchEvent(new window.KeyboardEvent("keydown", { bubbles: true, key: "Tab" }));
  assert.equal(window.document.activeElement, tabMoreButton);
  assert.equal(window.document.querySelector("[data-canvas-more]"), tabMoreButton);

  const blurredRename = beginMenuRename();
  const preservedMoreButton = window.document.querySelector("[data-canvas-more]");
  preservedMoreButton.focus();
  assert.equal(blurredRename.isConnected, false);
  assert.equal(window.document.querySelector("[data-canvas-more]"), preservedMoreButton);
  preservedMoreButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal(window.document.querySelector("#canvasMoreMenu").classList.contains("hidden"), false);

  const { capabilities: _capabilities, ...legacyHostContext } = hostContext;
  dispatchHostMessage({
    source: "reelay-shell",
    type: "host:init",
    context: legacyHostContext,
  });
  postedMessages.length = 0;
  window.document.querySelector("[data-profile-action='credits']")
    .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal(postedMessages.at(-1).type, "canvas:open-account");
  assert.equal(Object.hasOwn(postedMessages.at(-1), "section"), false);

  dom.window.close();
});
