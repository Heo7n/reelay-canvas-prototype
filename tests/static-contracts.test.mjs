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

test("native animation-frame APIs retain their browser receiver", () => {
  assert.match(appSource, /requestFrame:\s*\(callback\)\s*=>\s*window\.requestAnimationFrame\(callback\)/);
  assert.match(appSource, /cancelFrame:\s*\(frameId\)\s*=>\s*window\.cancelAnimationFrame\(frameId\)/);
  assert.doesNotMatch(appSource, /requestFrame:\s*requestAnimationFrame/);
  assert.doesNotMatch(appSource, /cancelFrame:\s*cancelAnimationFrame/);
});

test("connection drag preview delegates to the connection renderer", () => {
  assert.match(
    appSource,
    /function moveConnectionDrag[\s\S]*?canvasConnectionRenderer\.renderPreview\(state\.action, canvasConnections\.getBezierPath\)/,
  );
  assert.doesNotMatch(appSource, /\brenderConnectionPreview\s*\(/);
});

test("node chrome waits for pointer completion instead of opening during drag", async () => {
  const [nodePointerSource, pointerDispatchSource] = await Promise.all([
    readFile(new URL("src/legacy-canvas/canvas-node-pointer-controller.js", root), "utf8"),
    readFile(new URL("src/legacy-canvas/canvas-pointer-dispatch-controller.js", root), "utf8"),
  ]);
  assert.match(nodePointerSource, /type:\s*"drag-candidate"[\s\S]*?revealMediaToolbar,[\s\S]*?revealGeneratorPanel/);
  assert.doesNotMatch(nodePointerSource, /if \(node\.kind === "generator"[\s\S]*?options\.expandGenerator/);
  assert.match(pointerDispatchSource, /action\.type === "drag-candidate"[\s\S]*?finishNodeClick\(action, pointer/);
  assert.match(pointerDispatchSource, /action\.type === "drag-nodes"[\s\S]*?finishNodeDrag\(action,\s*\{\s*render:\s*cancelled\s*\}\)[\s\S]*?finishNodeClick\(action, pointer/);
  assert.match(appSource, /finishNodeClick:[\s\S]*?state\.mediaToolbarNodeId = canReveal && action\.revealMediaToolbar[\s\S]*?if \(canReveal && action\.revealGeneratorPanel\)/);
});

test("connection ports keep their external field while media frames accept body drops", async () => {
  const [interactionSource, rendererSource, connectionStyles] = await Promise.all([
    readFile(new URL("src/legacy-canvas/canvas-connection-interaction.js", root), "utf8"),
    readFile(new URL("src/legacy-canvas/canvas-connection-renderer.js", root), "utf8"),
    readFile(new URL("styles/canvas-connections.css", root), "utf8"),
  ]);
  assert.match(rendererSource, /pointermove[\s\S]*?getPointerPoint\(event\)/);
  assert.match(rendererSource, /connection-cut-handle/);
  assert.match(connectionStyles, /\.node-port-zone\s*\{[\s\S]*?cursor:\s*crosshair/);
  assert.doesNotMatch(connectionStyles, /\.node-port-zone\s*\{[\s\S]*?\bzoom\s*:/);
  assert.match(connectionStyles, /\.node-port-zone\s*\{[\s\S]*?width:\s*var\(--port-zone-outward[\s\S]*?height:\s*var\(--port-zone-height[\s\S]*?pointer-events:\s*none/);
  assert.match(connectionStyles, /\.node-port-zone::before\s*\{[\s\S]*?pointer-events:\s*auto/);
  assert.match(connectionStyles, /\.node-port-zone-input::before\s*\{[\s\S]*?ellipse\(100% 50% at 100% 50%\)/);
  assert.match(connectionStyles, /\.node-port-zone-output::before\s*\{[\s\S]*?ellipse\(100% 50% at 0 50%\)/);
  assert.match(connectionStyles, /--port-size:\s*34px/);
  assert.match(connectionStyles, /--port-stroke:\s*2px/);
  assert.match(connectionStyles, /\.node-port\s*\{[\s\S]*?background:\s*transparent/);
  assert.doesNotMatch(connectionStyles, /html\[data-theme="dark"\] \.node-port/);
  assert.match(connectionStyles, /\.node-port::before,[\s\S]*?width:\s*20px[\s\S]*?height:\s*2\.4px/);
  assert.match(connectionStyles, /\.node-port\.is-valid-target\s*\{[\s\S]*?background:\s*transparent/);
  assert.match(connectionStyles, /\.node-port-input\s*\{[\s\S]*?--port-x:\s*calc\(100% - 38px\)/);
  assert.match(connectionStyles, /\.node-port-output\s*\{[\s\S]*?--port-x:\s*38px/);
  assert.match(interactionSource, /portOffset:\s*38/);
  assert.match(interactionSource, /fieldOutwardRadius:\s*148/);
  assert.match(interactionSource, /fieldVerticalRadius:\s*108/);
  assert.match(interactionSource, /snapOutwardRadius:\s*104/);
  assert.match(interactionSource, /snapVerticalRadius:\s*78/);
  assert.match(interactionSource, /coordinates\.outward >= 0/);
  assert.doesNotMatch(interactionSource, /activationInside/);
  assert.match(connectionStyles, /\.node-port\.is-snap-near/);
  assert.match(connectionStyles, /\.connection-preview\.is-snapped/);
  assert.match(
    connectionStyles,
    /\.canvas-shell\.connecting \.canvas-node\.connection-origin \.node-port\.is-drag-origin\s*\{[\s\S]*?opacity:\s*0[\s\S]*?pointer-events:\s*none/,
  );
  assert.match(connectionStyles, /\.connection-group:hover \.connection-cut-control/);
  assert.match(appSource, /getScaledPortGeometry\(state\.scale\)/);
  assert.match(appSource, /--port-zone-outward/);
  assert.match(appSource, /--port-zone-height/);
  assert.match(appSource, /markConnectionProximity[\s\S]*?setConnectionPortScreenPoint\(entry, candidate\.point\)/);
  assert.match(interactionSource, /function selectNodeBodyCandidate/);
  assert.match(appSource, /targetRect:[\s\S]*?frameRect\.left[\s\S]*?frameRect\.bottom/);
  assert.match(appSource, /canvasConnectionInteraction\.selectNodeBodyCandidate/);
  assert.match(html, /canvas-connections\.css\?v=20260824-node-target-edge-scan-5/);
  assert.match(html, /canvas-connection-interaction\.js\?v=20260824-node-body-target-1/);
  assert.match(html, /id="connectionTargetGlow"/);
  assert.doesNotMatch(html, /connection-target-glow-halo/);
  assert.match(html, /app\.js\?v=20260824-node-target-edge-scan-5/);
  assert.match(appSource, /function showConnectionTargetGlow[\s\S]*?entry\.frameRect\.left - shellRect\.left[\s\S]*?--connection-target-radius/);
  assert.match(appSource, /function hideConnectionTargetGlow/);
  assert.match(appSource, /markConnectionTarget[\s\S]*?showConnectionTargetGlow\(entry\)/);
  assert.match(appSource, /coreWindow = clamp\([\s\S]*?frameWidth \* 0\.62/);
  assert.match(appSource, /coreLayerWidth = frameWidth \+ 1\.6/);
  assert.match(appSource, /coreBackgroundTravel = Math\.max\(1, coreLayerWidth - coreWindow\)/);
  assert.match(appSource, /start: \(-coreWindow \/ coreBackgroundTravel\) \* 100[\s\S]*?end: \(coreLayerWidth \/ coreBackgroundTravel\) \* 100/);
  assert.match(connectionStyles, /\.connection-target-glow::after\s*\{[\s\S]*?padding:\s*1\.1px/);
  assert.match(connectionStyles, /background-size:\s*var\(--connection-target-core-window/);
  assert.match(connectionStyles, /linear-gradient\([\s\S]*?var\(--connection-target-flare-core\) 43%/);
  assert.match(connectionStyles, /html\[data-theme="light"\] \.connection-target-glow/);
  assert.doesNotMatch(connectionStyles, /conic-gradient/);
  assert.match(connectionStyles, /mask-composite:\s*exclude/);
  assert.match(connectionStyles, /\.connection-target-glow\.is-active::after\s*\{[\s\S]*?connection-target-core-scan\s+1500ms/);
  assert.doesNotMatch(connectionStyles, /^\.connection-target-glow::after\s*\{(?:(?!\}).)*animation:/ms);
  assert.match(connectionStyles, /93%, 100% \{[\s\S]*?--connection-target-core-scan-end/);
  assert.match(connectionStyles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.connection-target-glow\.is-active::after\s*\{[\s\S]*?animation:\s*none/);
  assert.doesNotMatch(appSource, /haloWindow|haloSpread|--connection-target-halo/);
  assert.doesNotMatch(connectionStyles, /connection-target-glow-halo|--connection-target-halo|connection-target-halo-scan/);
  assert.doesNotMatch(connectionStyles, /radial-gradient|@property --connection-target-overlay-scan/);
  assert.doesNotMatch(connectionStyles, /\.connection-target \.media-frame\s*\{/);
  assert.doesNotMatch(connectionStyles, /\.connection-target \.media-frame::before/);
  assert.doesNotMatch(connectionStyles, /connection-target-edge-pulse/);
  assert.doesNotMatch(connectionStyles, /connection-body-target|connection-tilt|rotateX|rotateY/);
  assert.match(appSource, /--connection-feedback-scale/);
  assert.doesNotMatch(appSource, /--connection-ui-scale/);
});

test("node selection and connection relationships use one restrained neutral hierarchy", async () => {
  const connectionStyles = await readFile(new URL("styles/canvas-connections.css", root), "utf8");
  assert.match(appCss, /--relation-stroke-soft:\s*rgba\(/);
  assert.match(appCss, /--relation-stroke:\s*rgba\(/);
  assert.match(appCss, /--relation-stroke-strong:\s*rgba\(/);
  assert.match(appCss, /--relation-stroke-ready:\s*rgba\(/);
  assert.match(appCss, /\.canvas-node\.selected \.media-frame\s*\{[\s\S]*?border-color:\s*var\(--selection-stroke\)[\s\S]*?box-shadow:\s*var\(--node-media-shadow\)/);
  assert.match(appCss, /\.asset-node\.image-source \.media-frame\s*\{[\s\S]*?border-color:\s*var\(--node-media-border\)/);
  assert.match(appCss, /\.asset-node\.video-source \.media-frame\s*\{[\s\S]*?border-color:\s*var\(--node-media-border\)/);
  assert.match(appCss, /\.asset-node\.audio-source \.media-frame\s*\{[\s\S]*?border-color:\s*var\(--node-media-border\)/);
  assert.doesNotMatch(appCss, /0 0 0 1px var\(--selection-stroke\)/);
  assert.doesNotMatch(appCss, /0 0 0 5px var\(--selection-soft\)/);
  assert.doesNotMatch(connectionStyles, /#5c7cfa|92 124 250/);
  assert.match(connectionStyles, /\.connection-path\s*\{[\s\S]*?stroke:\s*var\(--relation-stroke-soft\)/);
  assert.match(connectionStyles, /\.connection-group\.is-related \.connection-path\s*\{[\s\S]*?stroke:\s*var\(--relation-stroke-strong\)[\s\S]*?stroke-width:\s*1\.8/);
  assert.match(connectionStyles, /\.connection-group\.is-active \.connection-path\s*\{[\s\S]*?stroke:\s*var\(--relation-stroke-ready\)[\s\S]*?stroke-width:\s*2\.3/);
  assert.match(connectionStyles, /\.connection-preview\.is-snapped\s*\{[\s\S]*?stroke:\s*var\(--relation-stroke-ready\)/);
  assert.match(connectionStyles, /\.node-port\s*\{[\s\S]*?--port-accent:\s*var\(--relation-stroke\)/);
  assert.match(connectionStyles, /\.canvas-shell\.connection-low-detail \.connection-group:not\(\.is-muted\):not\(:hover\):not\(\.is-related\):not\(\.is-active\) \.connection-path/);
  assert.doesNotMatch(connectionStyles, /\.canvas-shell\.connection-low-detail \.connection-layer/);
});

test("media metadata uses bounded screen compensation and stays above the frame", () => {
  assert.match(appSource, /clamp\(Math\.pow\(state\.scale,\s*0\.08\),\s*0\.88,\s*1\.06\)/);
  assert.match(appCss, /\.media-meta\s*\{[\s\S]*?bottom:\s*calc\(100% \+ 2px \+ 5px \* var\(--node-meta-ui-scale/);
  assert.match(appCss, /\.media-meta\s*\{[\s\S]*?height:\s*calc\(18px \* var\(--node-meta-ui-scale/);
  assert.doesNotMatch(appCss, /top:\s*calc\(-27px \* var\(--node-meta-ui-scale/);
});

test("group chrome uses bounded labels, neutral fixed-width framing, and corner resize cues", async () => {
  const connectionStyles = await readFile(new URL("styles/canvas-connections.css", root), "utf8");
  assert.match(appSource, /setProperty\("--group-ui-scale",\s*nodeMetaScale\)/);
  assert.match(appSource, /setProperty\("--group-interaction-scale",\s*inverseCanvasScale\)/);
  assert.match(
    appCss,
    /\.group-title\s*\{[\s\S]*?bottom:\s*calc\(100% \+ 8px \* var\(--group-ui-scale[\s\S]*?transform:\s*scale\(var\(--group-ui-scale/,
  );
  assert.match(
    appCss,
    /\.group-toolbar\s*\{[\s\S]*?bottom:\s*calc\(100% \+ 8px \* var\(--group-ui-scale[\s\S]*?transform:\s*translateX\(-50%\) scale\(var\(--group-ui-scale/,
  );
  assert.match(appSource, /function scheduleGroupChromeLayout\(\)[\s\S]*?titleRect\.right \+ 6 > toolbarRect\.left[\s\S]*?--group-toolbar-lift/);
  assert.match(appCss, /var\(--group-toolbar-lift,\s*0px\)/);
  assert.match(appCss, /\.group-frame\s*\{[\s\S]*?calc\(1px \* var\(--group-interaction-scale[\s\S]*?var\(--group-frame-line\)/);
  assert.match(appCss, /\.group-resize-handle\.east,[\s\S]*?width:\s*calc\(20px \* var\(--group-interaction-scale[\s\S]*?height:\s*calc\(42px \* var\(--group-interaction-scale[\s\S]*?background:\s*transparent/);
  assert.match(appCss, /\.group-resize-handle\.north-east,[\s\S]*?width:\s*calc\(28px \* var\(--group-interaction-scale/);
  assert.match(appCss, /\.group-resize-handle\.north-east::before\s*\{[\s\S]*?border-top-width:[\s\S]*?border-right-width:[\s\S]*?border-top-right-radius:/);
  assert.match(appCss, /\.group-resize-handle\.north-east::before,[\s\S]*?opacity:\s*0;[\s\S]*?transform:\s*scale\(0\.82\)/);
  assert.match(appCss, /\.group-resize-handle\.north-east:hover::before,[\s\S]*?opacity:\s*1;[\s\S]*?transform:\s*scale\(1\)/);
  assert.match(appCss, /\.group-frame\[data-active-resize="ne"\] \.group-resize-handle\.north-east::before/);
  assert.match(appSource, /element\.dataset\.activeResize = activeResizeHandle/);
  assert.match(appSource, /\.group-frame\[data-active-resize\][\s\S]*?delete element\.dataset\.activeResize/);
  assert.match(appSource, /classList\.toggle\("group-editing",\s*Boolean\(state\.activeGroupId\)\)/);
  assert.match(connectionStyles, /\.canvas-shell\.group-editing \.node-port-zone::before\s*\{[\s\S]*?pointer-events:\s*none/);
  assert.doesNotMatch(appCss, /\.group-frame\s*\{[^}]*?(?:transform|scale|zoom)\s*:/s);
  assert.doesNotMatch(appCss, /\.group-(?:title|toolbar)\s*\{[^}]*top:\s*-(?:34|50)px/s);
  assert.match(appCss, /--group-title-font-size:\s*14px/);
  assert.match(appCss, /\.group-title\s*\{[\s\S]*?font-size:\s*var\(--group-title-font-size\)/);
  assert.match(appSource, /data-group-action="download"/);
});

test("node typography follows a shared title, body, control, label, and caption scale", () => {
  assert.match(appCss, /--node-font-caption:\s*11px/);
  assert.match(appCss, /--node-font-label:\s*12px/);
  assert.match(appCss, /--node-font-title:\s*13px/);
  assert.match(appCss, /--node-font-control:\s*13px/);
  assert.match(appCss, /--node-font-body:\s*16px/);
  assert.match(appCss, /\.prompt-input\s*\{[\s\S]*?font-size:\s*var\(--node-font-body\)[\s\S]*?line-height:\s*var\(--node-leading-body\)/);
  assert.match(appCss, /\.prompt-input::placeholder\s*\{[\s\S]*?font-weight:\s*560/);
  assert.match(appCss, /\.control-chip\s*\{[\s\S]*?font-size:\s*var\(--node-font-control\)/);
  assert.match(appCss, /\.mode-tab\s*\{[\s\S]*?font-size:\s*var\(--node-font-control\)/);
});

test("multi-selection uses distinct corner chrome and one aggregate output port", async () => {
  const connectionStyles = await readFile(new URL("styles/canvas-connections.css", root), "utf8");
  assert.match(html, /id="multiSelectionFrame"[\s\S]*?id="multiSelectionPort"/);
  assert.doesNotMatch(html, /multiSelectionPortCount|multi-selection-port-count/);
  assert.doesNotMatch(html, /id="selectionCount"|批量下载（默认）/);
  assert.match(appSource, /getSelectionScreenRect\(bounds,\s*state,\s*14\)/);
  assert.match(appCss, /\.multi-selection-frame::before\s*\{[\s\S]*?linear-gradient/);
  assert.match(appCss, /--multi-selection-fill:\s*rgba/);
  assert.match(appCss, /\.multi-selection-frame\s*\{[\s\S]*?background:\s*var\(--multi-selection-fill\)[\s\S]*?box-shadow:\s*inset 0 0 24px var\(--multi-selection-inner-shadow\)/);
  assert.match(appCss, /\.multi-selection-port\s*\{[\s\S]*?left:\s*calc\(100% \+ 12px\)/);
  assert.match(html, /class="icon-toolbar-button text-button selection-download-trigger"[\s\S]*?aria-expanded="false"/);
  assert.equal((html.match(/data-selection-action="toggle-download"/g) || []).length, 1);
  assert.doesNotMatch(html, /selection-download-main|selection-download-toggle|download-default/);
  assert.match(appCss, /\.selection-download-control\s*\{[\s\S]*?gap:\s*0;[\s\S]*?overflow:\s*visible;[\s\S]*?border-radius:\s*10px/);
  assert.match(appCss, /\.selection-download-trigger\[aria-expanded="true"\] \.selection-download-chevron/);
  assert.match(appSource, /function setSelectionDownloadMenuOpen\(open\)/);
  assert.doesNotMatch(appSource, /bindSelectionToolbarMenuPreview/);
  assert.match(connectionStyles, /\.canvas-shell\.multi-selection-active \.canvas-node\.selected \.node-port-zone/);
  assert.match(appSource, /mode:\s*"selection-output"[\s\S]*?origins/);
  assert.match(appSource, /group-unavailable[\s\S]*?node\.groupId/);
});

test("blank connection drops retain a pending preview for single and selection menus", async () => {
  const connectionStyles = await readFile(new URL("styles/canvas-connections.css", root), "utf8");
  assert.match(appSource, /function createPendingConnectionPreview\(/);
  assert.match(appSource, /state\.connectionDrop\?\.previewAction/);
  assert.match(appSource, /openSelectionConnectionCreateMenu\([\s\S]*?previewAction/);
  assert.match(appSource, /connection-pending-create["'], Boolean\(previewAction\?\.pendingCreate\)/);
  assert.match(connectionStyles, /\.connection-preview\.is-pending-create/);
  assert.match(connectionStyles, /\.canvas-shell\.connection-pending-create \.node-port/);
  assert.match(appCss, /\.canvas-shell\.connection-pending-create \.multi-selection-port/);
  assert.match(connectionStyles, /\.connection-create-menu:not\(\.hidden\)[\s\S]*?connection-create-menu-enter/);
  assert.equal((html.match(/data-connection-create=/g) || []).length, 2);
  assert.match(html, /data-connection-create="image"[\s\S]*?data-lucide="image"/);
  assert.match(html, /data-connection-create="video"[\s\S]*?data-lucide="square-play"/);
  assert.match(connectionStyles, /\.connection-create-menu\s*\{[\s\S]*?width:\s*236px/);
  assert.doesNotMatch(connectionStyles, /\.connection-create-menu\s*\{[^}]*grid-template-columns:\s*repeat\(2/s);
  assert.match(appSource, /connectionCreateMenu\.offsetWidth\s*\|\|\s*236/);
  assert.match(appSource, /connectionCreateMenu\.offsetHeight\s*\|\|\s*160/);
  assert.match(appSource, /const menuEdgeOverlap = 1/);
  assert.match(appSource, /clientX - rect\.left \+ shell\.scrollLeft - state\.tx/);
  assert.match(appSource, /clientY - rect\.top \+ shell\.scrollTop - state\.ty/);
  assert.match(appSource, /left \+ shell\.scrollLeft/);
  assert.match(appSource, /top \+ shell\.scrollTop/);
  assert.match(appSource, /drop\.previewAction\.current = screenToWorld\(anchorClientX, anchorClientY\)/);
  assert.match(appSource, /connectionCreateMenu\.dataset\.placement = placement/);
  assert.match(appSource, /"创建共同下游节点"/);
});

test("the hosted legacy canvas uses its local icon subset instead of the full vendor bundle", () => {
  assert.doesNotMatch(html, /vendor\/lucide/i);
  assert.match(appSource, /const fallbackIconPaths = \{/);
  assert.match(appSource, /function renderFallbackIcons\(\)/);
});

test("the current prototype still starts with the Agent panel closed", () => {
  assert.match(appSource, /\bsetAgentOpen\(false\);/);
});

test("the editable empty canvas invites open-ended creation", () => {
  assert.match(html, /empty-create-secondary">开始自由创作</);
  assert.match(appSource, /emptyCreateSecondary\.textContent = readonly \? "" : "开始自由创作"/);
  assert.doesNotMatch(html, /自由生成节点/);
  assert.doesNotMatch(appSource, /自由生成节点/);
});

test("empty generator media uses a larger centered modality icon", () => {
  assert.match(appSource, /class="upload-icon video-placeholder-icon"/);
  assert.match(appSource, /class="upload-icon image-placeholder-icon"/);
  assert.match(
    appCss,
    /\.upload-icon\s*\{[^}]*display:\s*block;[^}]*width:\s*44px;[^}]*height:\s*44px;[^}]*margin:\s*0 auto;/s,
  );
});

test("legacy page exits through the routed host instead of deleted static pages", () => {
  assert.match(appSource, /function requestHostNavigation\(target\)/);
  assert.match(appSource, /requestHostNavigation\("home"\)/);
  assert.match(appSource, /requestHostNavigation\("projects"\)/);
  assert.match(appSource, /requestHostNavigation\("logout"\)/);
  assert.match(html, />退出账号</);
  assert.doesNotMatch(html, /退出(?:演示账号|登录)/);
  assert.doesNotMatch(appSource, /(?:home|login)\.html/);
});

test("the canvas organization entry exposes a visual management affordance without redundant text", () => {
  assert.match(html, /id="profileOrganization"[^>]*aria-label="进入组织管理界面"/);
  assert.doesNotMatch(html, />所属组织</);
  assert.doesNotMatch(html, /role="tooltip">进入组织管理界面</);
  assert.doesNotMatch(appCss, /\.profile-membership:hover > (?:svg|span)/);
  assert.doesNotMatch(appCss, /\.profile-membership:hover,\s*\.profile-membership:focus-visible\s*\{[^}]*box-shadow/);
});
