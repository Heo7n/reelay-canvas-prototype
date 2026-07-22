import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const [appSource, appCss, html] = await Promise.all([
  readFile(new URL("app.js", root), "utf8"),
  readFile(new URL("styles/app.css", root), "utf8"),
  readFile(new URL("index.html", root), "utf8"),
]);

test("a fresh page lifecycle retains the 3000 / 0 credit contract", () => {
  assert.match(
    appSource,
    /account:\s*\{\s*credits:\s*3000,\s*consumedCredits:\s*0,?\s*\}/,
  );
  assert.match(html, /id="avatarCreditBadge"[^>]*>[\s\S]*?data-lucide="sparkles"[\s\S]*?id="avatarCreditValue">3000<\/span>/);
  assert.doesNotMatch(html, /id="avatarCreditBadge"[^>]*(?:role="button"|tabindex=)/);
  assert.doesNotMatch(appSource, /avatarCreditBadge\?\.addEventListener/);
});

test("a successful result locks its generator node to one media modality", () => {
  assert.match(appSource, /lockedMode:\s*null/);
  assert.match(appSource, /function getNodeLockedMode\(node\)/);
  assert.match(appSource, /normalizeGeneratorMode\(node\.generatedAsset\?\.type\)/);
  assert.match(appSource, /node\.lockedMode = outputMode/);
  assert.match(appSource, /if \(!canUseModelForNode\(node, selected\)\)/);
  assert.match(appSource, /const visibleTypes = lockedMode[\s\S]*types\.filter/);
  assert.match(appSource, /disabled aria-disabled="true" title=/);
  assert.match(appSource, /已生成\$\{lockedMode === "image" \? "图片" : "视频"\}，此节点仅可继续使用/);
  assert.doesNotMatch(appSource, /如需切换类型，请新建节点/);
  assert.match(appSource, /class="chip-icon"><i data-lucide="box"/);
  assert.match(appSource, /class="model-icon">\$\{item\.icon\}/);
  assert.match(appSource, /class="agent-model-provider">\$\{escapeHtml\(model\.icon\)\}/);
  assert.match(appSource, /"box":\s*'<path/);
  assert.match(html, /id="agentModelBtn"[\s\S]*?data-lucide="box"/);
  assert.match(appSource, /commitGenerationUndoBoundary\(canvas, node\.id\)/);
  assert.match(appSource, /action\.type === "node-update" && action\.node\?\.id === nodeId/);
  assert.match(appCss, /\.mode-tab:disabled/);
  assert.match(appCss, /\.model-mode-lock/);
});

test("the routed legacy canvas delegates persistence to the versioned document codec", () => {
  assert.match(appSource, /REELAY_CANVAS_DOCUMENT_CODEC/);
  assert.match(appSource, /canvasDocumentCodec\.createSnapshot\(state\)/);
  assert.match(appSource, /canvasDocumentCodec\.restoreSnapshot/);
  assert.match(appSource, /window\.addEventListener\("message", handleHostBridgeMessage\)/);
  assert.match(appSource, /type:\s*"canvas:save"[\s\S]*expectedRevision:\s*canvasPersistence\.revision/);
  assert.match(appSource, /message\.code === "conflict"[\s\S]*canvasPersistence\.blocked = true/);
});

test("background generation completion marks the project document for persistence", () => {
  const functionStart = appSource.indexOf("function completeSimulatedGeneration(taskId)");
  const functionEnd = appSource.indexOf("function syncGenerateButton", functionStart);
  assert.ok(functionStart >= 0 && functionEnd > functionStart);
  const functionSource = appSource.slice(functionStart, functionEnd);
  const node = { id: "node-1", kind: "generator", generationTaskId: "task-1", name: "" };
  const canvas = { id: "background-canvas", nodes: [node] };
  const task = {
    id: "task-1",
    canvasId: canvas.id,
    nodeId: node.id,
    parameterSnapshot: { mode: "image" },
  };
  const state = {
    activeCanvasId: "active-canvas",
    generationTasks: new Map([[task.id, task]]),
  };
  let renderCount = 0;
  let saveScheduleCount = 0;
  const completeGeneration = Function(
    "state",
    "getGenerationTaskTarget",
    "normalizeGeneratorMode",
    "getNodeLockedMode",
    "showActionToast",
    "createGeneratedAsset",
    "defaultGeneratedName",
    "commitGenerationUndoBoundary",
    "render",
    "scheduleCanvasDocumentSave",
    `${functionSource}; return completeSimulatedGeneration;`,
  )(
    state,
    () => ({ canvas, node }),
    (mode) => mode,
    () => null,
    () => undefined,
    () => ({ type: "image", displayName: "result" }),
    () => "result",
    () => undefined,
    () => { renderCount += 1; },
    () => { saveScheduleCount += 1; },
  );

  completeGeneration(task.id);

  assert.equal(renderCount, 0);
  assert.equal(saveScheduleCount, 1);
  assert.equal(node.generatedAsset.displayName, "result");
  assert.equal(state.generationTasks.size, 0);
});

test("save scheduling reports dirty before the debounce elapses", () => {
  const functionStart = appSource.indexOf("function scheduleCanvasDocumentSave(delay = 800)");
  const functionEnd = appSource.indexOf("function handleCanvasSaveResult", functionStart);
  assert.ok(functionStart >= 0 && functionEnd > functionStart);
  const functionSource = appSource.slice(functionStart, functionEnd);
  const dirtyStates = [];
  const canvasPersistence = {
    initialized: true,
    hydrating: false,
    writable: true,
    blocked: false,
    saveTimer: 0,
  };
  const scheduleSave = Function(
    "canvasPersistence",
    "postCanvasDirty",
    "window",
    "flushCanvasDocumentSave",
    `${functionSource}; return scheduleCanvasDocumentSave;`,
  )(
    canvasPersistence,
    (dirty) => dirtyStates.push(dirty),
    { clearTimeout: () => undefined, setTimeout: () => 7 },
    () => undefined,
  );

  scheduleSave();

  assert.deepEqual(dirtyStates, [true]);
  assert.equal(canvasPersistence.saveTimer, 7);
});

test("model data, config and document codec load before the application", () => {
  const catalogIndex = html.indexOf("./data/model-catalog.js");
  const configIndex = html.indexOf("./src/config/prototype-config.js");
  const codecIndex = html.indexOf("./src/legacy-canvas/canvas-document-codec.js");
  const appIndex = html.indexOf("./app.js");
  assert.ok(
    catalogIndex >= 0 &&
    catalogIndex < configIndex &&
    configIndex < codecIndex &&
    codecIndex < appIndex,
  );
});

test("the current prototype still starts with the Agent panel closed", () => {
  assert.match(appSource, /\bsetAgentOpen\(false\);/);
});

test("legacy page exits through the routed host instead of deleted static pages", () => {
  assert.match(appSource, /function requestHostNavigation\(target\)/);
  assert.match(appSource, /requestHostNavigation\("home"\)/);
  assert.match(appSource, /requestHostNavigation\("projects"\)/);
  assert.match(appSource, /requestHostNavigation\("logout"\)/);
  assert.doesNotMatch(appSource, /(?:home|login)\.html/);
});
