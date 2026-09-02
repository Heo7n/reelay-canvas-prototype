import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const [appSource, appCss, canvasChromeCss, assetLibraryViewSource, stylesEntry, html, nodePointerSource, pointerDispatchSource, assetLibraryCss, entityEditorViewSource, entityEditorCss, entityUseModelSource, entityUseViewSource, entityUseCss] = await Promise.all([
  readFile(new URL("app.js", root), "utf8"),
  readFile(new URL("styles/app.css", root), "utf8"),
  readFile(new URL("styles/canvas-chrome.css", root), "utf8"),
  readFile(new URL("src/legacy-canvas/canvas-asset-library-view.js", root), "utf8"),
  readFile(new URL("styles.css", root), "utf8"),
  readFile(new URL("index.html", root), "utf8"),
  readFile(new URL("src/legacy-canvas/canvas-node-pointer-controller.js", root), "utf8"),
  readFile(new URL("src/legacy-canvas/canvas-pointer-dispatch-controller.js", root), "utf8"),
  readFile(new URL("styles/canvas-asset-library.css", root), "utf8"),
  readFile(new URL("src/legacy-canvas/canvas-entity-editor-view.js", root), "utf8"),
  readFile(new URL("styles/canvas-entity-editor.css", root), "utf8"),
  readFile(new URL("src/legacy-canvas/canvas-entity-use-model.js", root), "utf8"),
  readFile(new URL("src/legacy-canvas/canvas-entity-use-view.js", root), "utf8"),
  readFile(new URL("styles/canvas-entity-use.css", root), "utf8"),
]);

test("a fresh page lifecycle retains the 3000 / 0 credit contract", () => {
  assert.match(
    appSource,
    /account:\s*\{\s*credits:\s*3000,\s*consumedCredits:\s*0,?\s*\}/,
  );
  assert.match(html, /data-profile-action="credits"[^>]*>[\s\S]*?<img[^>]*src="\.\/assets\/icons\/credit-prism\.svg"[^>]*>[\s\S]*?id="profileCreditValue">3,000<\/strong>/);
  assert.doesNotMatch(html, /id="avatarCredit(?:Badge|Value)"/);
  assert.match(appSource, /const profileCreditValue = document\.querySelector\("#profileCreditValue"\)/);
  assert.match(appSource, /function syncCreditDisplay\(\)[\s\S]*?new Intl\.NumberFormat\("zh-CN"\)[\s\S]*?profileCreditValue\.textContent = credits[\s\S]*?查看我的积分，当前 \$\{credits\}/);
  assert.doesNotMatch(appSource, /avatarCredit(?:Badge|Value)/);
});

test("generator nodes keep their creation modality and only expose compatible models", () => {
  assert.match(appSource, /const generationMode = mode === "video" \? "video" : "image"/);
  assert.match(appSource, /mode:\s*generationMode,[\s\S]*?model:\s*firstModelId\(generationMode\)/);
  assert.doesNotMatch(appSource, /lockedMode/);
  assert.match(appSource, /function getNodeGenerationMode\(node\)[\s\S]*?generatorModelPolicy\.getNodeModeContract\(node\)/);
  assert.match(appSource, /function getCompatibleModelsForNode\(node\)[\s\S]*?generatorModelPolicy\.getCompatibleModels\(models, node\)/);
  assert.match(appSource, /mediaKind:\s*getNodeGenerationMode\(node\)/);
  assert.match(appSource, /task\.parameterSnapshot\.mediaKind/);
  assert.match(appSource, /generatedAsset\.type !== outputMode/);
  assert.match(appSource, /if \(!canUseModelForNode\(node, selected\)\)/);
  assert.doesNotMatch(appSource, /node\.mode\s*=\s*selected\.type/);
  const modelPanelStart = appSource.indexOf("function modelPanel(node)");
  const modelPanelEnd = appSource.indexOf("function bindModelPanelEvents", modelPanelStart);
  assert.ok(modelPanelStart >= 0 && modelPanelEnd > modelPanelStart);
  const modelPanelSource = appSource.slice(modelPanelStart, modelPanelEnd);
  assert.match(modelPanelSource, /getCompatibleModelsForNode\(node\)/);
  assert.match(modelPanelSource, /仅显示同类型模型/);
  assert.doesNotMatch(modelPanelSource, /mode-tabs|mode-tab|data-model-filter/);
  assert.match(appSource, /modelIconMarkup\(item, "model-icon"\)/);
  assert.match(appSource, /function modelIconMarkup\(model, className\)[\s\S]*?model\?\.iconSrc[\s\S]*?model-brand-monochrome[\s\S]*?<img src="\$\{escapeHtml\(model\.iconSrc\)\}" alt="" \/>/);
  assert.doesNotMatch(appSource, /workflow-panel|hasWorkflowControl|workflowPanel/);
  assert.match(appSource, /function workflowParameterSection\(node\)[\s\S]*?data-action="workflow"/);
  assert.match(appSource, /function getParamLabelParts\(node\)[\s\S]*?workflow\?\.label[\s\S]*?aspect:\s*node\.aspect/);
  assert.match(appSource, /placeholder="描述你想生成的内容，或输入 @ 引用"/);
  assert.match(appSource, /modelIconMarkup\(model, "agent-model-provider"\)/);
  assert.match(appSource, /"box":\s*'<path/);
  assert.match(appSource, /commitGenerationUndoBoundary\(canvas, node\.id\)/);
  assert.match(appSource, /action\.type === "node-update" && action\.node\?\.id === nodeId/);
  assert.match(appCss, /\.model-mode-contract/);
});

test("the routed legacy canvas delegates persistence to the versioned document codec", () => {
  assert.match(appSource, /REELAY_CANVAS_DOCUMENT_CODEC/);
  assert.match(appSource, /REELAY_CANVAS_PERSISTENCE_COORDINATOR/);
  assert.match(appSource, /canvasDocumentCodec\.createSnapshot\(state\)/);
  assert.match(appSource, /canvasDocumentCodec\.restoreSnapshot/);
  assert.match(appSource, /window\.addEventListener\("message", handleHostBridgeMessage\)/);
  assert.match(appSource, /return canvasPersistence\.handleHostMessage\(event\)/);
  assert.match(appSource, /return canvasPersistence\.schedule\(delay\)/);
  assert.match(appSource, /return canvasPersistence\.flush\(\)/);
  assert.match(appSource, /window\.addEventListener\("pagehide", flushCanvasDocumentSave\)/);
  assert.match(appSource, /document\.visibilityState === "hidden"\) flushCanvasDocumentSave\(\)/);
});

test("a home launch intent becomes the first real persisted canvas mutation", () => {
  const functionStart = appSource.indexOf("function consumeHomeLaunchIntent()");
  const functionEnd = appSource.indexOf("function cloneNodeState", functionStart);
  assert.ok(functionStart >= 0 && functionEnd > functionStart);
  const functionSource = appSource.slice(functionStart, functionEnd);
  const node = {};
  const removedKeys = [];
  const scheduledDelays = [];
  let renderCount = 0;
  const consumeLaunchIntent = Function(
    "isCanvasMutationAllowed",
    "sessionStorage",
    "homeLaunchIntentKey",
    "addNodeAt",
    "window",
    "render",
    "scheduleCanvasDocumentSave",
    `${functionSource}; return consumeHomeLaunchIntent;`,
  )(
    () => true,
    {
      getItem: () => "  Create a quiet product shot  ",
      removeItem: (key) => removedKeys.push(key),
    },
    "reelay-home-launch-intent",
    () => node,
    { innerWidth: 1440, innerHeight: 900 },
    () => { renderCount += 1; },
    (delay) => scheduledDelays.push(delay),
  );

  assert.equal(consumeLaunchIntent(), true);
  assert.equal(node.prompt, "Create a quiet product shot");
  assert.equal(node.expanded, true);
  assert.deepEqual(removedKeys, ["reelay-home-launch-intent"]);
  assert.equal(renderCount, 1);
  assert.deepEqual(scheduledDelays, [0]);
});

test("background generation completion marks the project document for persistence", () => {
  const functionStart = appSource.indexOf("function completeSimulatedGeneration(taskId)");
  const functionEnd = appSource.indexOf("function syncGenerateButton", functionStart);
  assert.ok(functionStart >= 0 && functionEnd > functionStart);
  const functionSource = appSource.slice(functionStart, functionEnd);
  const node = {
    id: "node-1",
    kind: "generator",
    mode: "image",
    model: "image-model",
    generationTaskId: "task-1",
    name: "",
  };
  const canvas = { id: "background-canvas", nodes: [node] };
  const task = {
    id: "task-1",
    canvasId: canvas.id,
    nodeId: node.id,
    parameterSnapshot: { mediaKind: "image", model: "image-model" },
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
    "models",
    "getNodeGenerationMode",
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
    [{ id: "image-model", type: "image" }],
    (targetNode) => targetNode.mode,
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

test("model data, config and document codec load before the application", () => {
  const catalogIndex = html.indexOf("./data/model-catalog.js");
  const configIndex = html.indexOf("./src/config/prototype-config.js");
  const runtimeStoreIndex = html.indexOf("./src/legacy-canvas/canvas-runtime-store.js");
  const commandExecutorIndex = html.indexOf("./src/legacy-canvas/canvas-command-executor.js");
  const codecIndex = html.indexOf("./src/legacy-canvas/canvas-document-codec.js");
  const persistenceIndex = html.indexOf("./src/legacy-canvas/canvas-persistence-coordinator.js");
  const mediaAssetCoordinatorIndex = html.indexOf("./src/legacy-canvas/canvas-media-asset-coordinator.js");
  const modelPolicyIndex = html.indexOf("./src/legacy-canvas/canvas-generator-model-policy.js");
  const assetLibraryModelIndex = html.indexOf("./src/legacy-canvas/canvas-asset-library-model.js");
  const assetLibraryViewIndex = html.indexOf("./src/legacy-canvas/canvas-asset-library-view.js");
  const entityEditorModelIndex = html.indexOf("./src/legacy-canvas/canvas-entity-editor-model.js");
  const entityEditorViewIndex = html.indexOf("./src/legacy-canvas/canvas-entity-editor-view.js");
  const entityUseModelIndex = html.indexOf("./src/legacy-canvas/canvas-entity-use-model.js");
  const entityUseViewIndex = html.indexOf("./src/legacy-canvas/canvas-entity-use-view.js");
  const appIndex = html.indexOf("./app.js");
  assert.ok(
    catalogIndex >= 0 &&
    catalogIndex < configIndex &&
    configIndex < modelPolicyIndex &&
    modelPolicyIndex < assetLibraryModelIndex &&
    assetLibraryModelIndex < assetLibraryViewIndex &&
    assetLibraryViewIndex < entityEditorModelIndex &&
    entityEditorModelIndex < entityEditorViewIndex &&
    entityEditorViewIndex < entityUseModelIndex &&
    entityUseModelIndex < entityUseViewIndex &&
    entityUseViewIndex < runtimeStoreIndex &&
    runtimeStoreIndex < commandExecutorIndex &&
    commandExecutorIndex < codecIndex &&
    codecIndex < persistenceIndex &&
    persistenceIndex < mediaAssetCoordinatorIndex &&
    mediaAssetCoordinatorIndex < appIndex &&
    appIndex >= 0,
  );
});

test("active canvas content has one runtime owner instead of render-time mirror copies", () => {
  assert.match(appSource, /canvasRuntimeStore\.attachStateFacade\(state\)/);
  assert.match(
    appSource,
    /createCanvasRuntimeStore\(\{\s*onMutation:\s*\(\)\s*=>\s*scheduleCanvasDocumentSave\(0\)/,
  );
  assert.match(appSource, /function getActiveCanvas\(\) \{\s*return canvasRuntimeStore\.getActiveCanvas\(\);\s*\}/);
  assert.doesNotMatch(appSource, /saveActiveCanvasState|loadCanvasState/);
  assert.doesNotMatch(appSource, /state\.canvases\.(?:push|splice)/);
  assert.doesNotMatch(appSource, /state\.activeCanvasId\s*=/);
  assert.doesNotMatch(
    appSource,
    /canvas\.(?:nodes|connections|groups|tx|ty|scale|zCounter|undoStack)\s*=\s*state\.|state\.(?:nodes|connections|groups|tx|ty|scale|zCounter|undoStack)\s*=\s*canvas\./,
  );
});

test("connection mutations commit through the bounded atomic command boundary", () => {
  assert.match(appSource, /REELAY_CANVAS_COMMAND_EXECUTOR/);
  assert.match(
    appSource,
    /createCanvasCommandExecutor\(\{[\s\S]*?validateTransition\(\{ command \}\)[\s\S]*?undoLimit:\s*50/,
  );
  assert.match(
    appSource,
    /function createConnection\([\s\S]*?executeConnectionCommand\("connection-create"/,
  );
  assert.match(
    appSource,
    /function createConnectionsBatch\([\s\S]*?"connections-create-batch"/,
  );
  assert.match(
    appSource,
    /function removeConnection\([\s\S]*?executeConnectionCommand\("connection-remove"/,
  );
  assert.match(
    appSource,
    /function undoLastAction\(\)[\s\S]*?pendingAction\?\.kind === "canvas-command"[\s\S]*?canvasCommandExecutor\.undoLast/,
  );
  const renderConnectionsStart = appSource.indexOf("function renderConnections()");
  const renderConnectionsEnd = appSource.indexOf("function createConnection(", renderConnectionsStart);
  assert.ok(renderConnectionsStart >= 0 && renderConnectionsEnd > renderConnectionsStart);
  assert.doesNotMatch(
    appSource.slice(renderConnectionsStart, renderConnectionsEnd),
    /state\.connections\s*=\s*canvasConnections\.normalizeConnections/,
  );
});

test("native animation-frame APIs retain their browser receiver", () => {
  assert.match(appSource, /requestFrame:\s*\(callback\)\s*=>\s*window\.requestAnimationFrame\(callback\)/);
  assert.match(appSource, /cancelFrame:\s*\(frameId\)\s*=>\s*window\.cancelAnimationFrame\(frameId\)/);
  assert.doesNotMatch(appSource, /requestFrame:\s*requestAnimationFrame/);
  assert.doesNotMatch(appSource, /cancelFrame:\s*cancelAnimationFrame/);
});

test("blank-canvas creation anchors the media frame instead of the expanded prompt workspace", () => {
  const placementIndex = html.indexOf("./src/legacy-canvas/canvas-node-placement.js");
  const appIndex = html.indexOf("./app.js");
  assert.ok(placementIndex >= 0 && placementIndex < appIndex);
  assert.match(appSource, /const canvasNodePlacement = window\.REELAY_CANVAS_NODE_PLACEMENT/);
  assert.match(appSource, /function addNodeAt[\s\S]*?canvasNodePlacement\.getNodePosition\(\{[\s\S]*?world,[\s\S]*?layout,[\s\S]*?anchor:\s*options\.anchor/);
  assert.doesNotMatch(appSource, /function addNodeAt[\s\S]*?world\.y - (?:layout\.)?nodeHeight \/ 2/);
});

test("connection drag preview delegates to the connection renderer", () => {
  assert.match(
    appSource,
    /function moveConnectionDrag[\s\S]*?canvasConnectionRenderer\.renderPreview\(state\.action, canvasConnections\.getBezierPath\)/,
  );
  assert.doesNotMatch(appSource, /\brenderConnectionPreview\s*\(/);
});

test("connecting existing nodes does not open or select the destination workspace", () => {
  const finishStart = appSource.indexOf("function finishConnectionDrag(event, options = {})");
  const finishEnd = appSource.indexOf("const canvasNodePointerController", finishStart);
  assert.ok(finishStart >= 0 && finishEnd > finishStart);
  const finishSource = appSource.slice(finishStart, finishEnd);
  assert.match(finishSource, /createConnectionsBatch\(action\.originNodeIds, action\.targetNodeId\)[\s\S]*?render\(\)/);
  assert.match(finishSource, /createConnection\(action\.sourceNodeId, action\.targetNodeId,[\s\S]*?render\(\)/);
  assert.doesNotMatch(finishSource, /target\.expanded|target\.panel|bringNodesToFront\(\[target\]\)|setSelection\(\[target\.id\]/);
  assert.match(appSource, /connectionCreateMenu\?\.addEventListener\("click"[\s\S]*?node\.expanded = true/);
});

test("node chrome waits for pointer completion instead of opening during drag", async () => {
  const [nodePointerSource, pointerDispatchSource] = await Promise.all([
    readFile(new URL("src/legacy-canvas/canvas-node-pointer-controller.js", root), "utf8"),
    readFile(new URL("src/legacy-canvas/canvas-pointer-dispatch-controller.js", root), "utf8"),
  ]);
  assert.match(nodePointerSource, /type:\s*"drag-candidate"[\s\S]*?revealMediaToolbar,[\s\S]*?revealGeneratorPanel/);
  assert.doesNotMatch(nodePointerSource, /if \(node\.kind === "generator"[\s\S]*?options\.expandGenerator/);
  assert.match(pointerDispatchSource, /action\.type === "drag-candidate"[\s\S]*?finishNodeClick\(action, pointer/);
  assert.match(pointerDispatchSource, /action\.type === "drag-nodes"[\s\S]*?finishNodeDrag\(action,\s*\{\s*cancelled,\s*render:\s*cancelled\s*\}\)[\s\S]*?finishNodeClick\(action, pointer/);
  assert.match(appSource, /finishNodeClick:[\s\S]*?state\.mediaToolbarNodeId = canReveal && action\.revealMediaToolbar[\s\S]*?if \(canReveal && action\.revealGeneratorPanel\)/);
});

test("connection ports keep their external field while media frames accept body drops", async () => {
  const [interactionSource, motionSource, feedbackControllerSource, rendererSource, connectionStyles] = await Promise.all([
    readFile(new URL("src/legacy-canvas/canvas-connection-interaction.js", root), "utf8"),
    readFile(new URL("src/legacy-canvas/canvas-connection-feedback-motion.js", root), "utf8"),
    readFile(new URL("src/legacy-canvas/canvas-connection-feedback-controller.js", root), "utf8"),
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
  assert.match(appCss, /--connection-port-size:\s*34px/);
  assert.match(appCss, /--connection-port-stroke:\s*2px/);
  assert.match(connectionStyles, /--port-size:\s*var\(--connection-port-size\)/);
  assert.match(connectionStyles, /--port-stroke:\s*var\(--connection-port-stroke\)/);
  assert.match(connectionStyles, /\.node-port\s*\{[\s\S]*?background:\s*transparent/);
  assert.doesNotMatch(connectionStyles, /html\[data-theme="dark"\] \.node-port/);
  assert.match(connectionStyles, /\.node-port::before,[\s\S]*?width:\s*var\(--connection-port-mark-width\)[\s\S]*?height:\s*var\(--connection-port-mark-height\)/);
  assert.match(connectionStyles, /\.node-port\.is-valid-target\s*\{[\s\S]*?background:\s*transparent/);
  assert.match(connectionStyles, /\.node-port-input\s*\{[\s\S]*?--port-x:\s*calc\(100% - 38px - var\(--node-media-border-width\)\)/);
  assert.match(connectionStyles, /\.node-port-output\s*\{[\s\S]*?--port-x:\s*calc\(38px \+ var\(--node-media-border-width\)\)/);
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
  assert.match(html, /canvas-connections\.css\?v=20260827-connection-confirm-46/);
  assert.match(html, /canvas-connection-feedback-motion\.js\?v=20260827-connection-confirm-46/);
  assert.match(html, /canvas-connection-feedback-controller\.js\?v=20260827-connection-confirm-46/);
  assert.match(html, /canvas-connection-renderer\.js\?v=20260827-connection-confirm-46/);
  assert.match(html, /canvas-connection-interaction\.js\?v=20260824-node-body-target-1/);
  assert.match(html, /id="connectionTargetGlow"/);
  assert.doesNotMatch(html, /connection-target-glow-halo/);
  assert.match(html, /styles\.css\?v=20260902-canvas-integration-59/);
  assert.match(html, /app\.js\?v=20260902-canvas-integration-59/);
  assert.match(appSource, /function showConnectionTargetGlow[\s\S]*?entry\.frameRect\.left - shellRect\.left[\s\S]*?--connection-target-radius/);
  assert.match(appSource, /function hideConnectionTargetGlow/);
  assert.match(appSource, /markConnectionTarget[\s\S]*?showConnectionTargetGlow\(entry\)/);
  assert.match(appSource, /sweepWindow = clamp\([\s\S]*?frameWidth \* 0\.28/);
  assert.match(appSource, /sweepLayerWidth = frameWidth \+ 1\.6/);
  assert.match(appSource, /sweepBackgroundTravel = Math\.max\(1, sweepLayerWidth - sweepWindow\)/);
  assert.match(appSource, /start: \(-sweepWindow \/ sweepBackgroundTravel\) \* 100[\s\S]*?end: \(sweepLayerWidth \/ sweepBackgroundTravel\) \* 100/);
  assert.match(appSource, /sweepDuration = clamp\(740 \+ frameWidth \* 0\.38, 820, 1020\)/);
  assert.match(connectionStyles, /\.connection-target-glow::after\s*\{[\s\S]*?padding:\s*1\.1px/);
  assert.match(connectionStyles, /\.connection-target-glow::before\s*\{[\s\S]*?clip-path:\s*inset\(0 72% 0 0/);
  assert.match(connectionStyles, /background-size:[\s\S]*?var\(--connection-target-sweep-window/);
  assert.match(connectionStyles, /linear-gradient\([\s\S]*?var\(--connection-target-flare-core\) 72%/);
  assert.match(connectionStyles, /--connection-target-flare-peak:\s*rgb\(255 255 255 \/ 100%\)/);
  assert.match(connectionStyles, /html\[data-theme="light"\] \.connection-target-glow\s*\{[\s\S]*?--connection-target-flare-peak:\s*rgb\(18 30 47 \/ 100%\)/);
  assert.doesNotMatch(connectionStyles, /conic-gradient/);
  assert.match(connectionStyles, /mask-composite:\s*exclude/);
  assert.match(connectionStyles, /\.connection-target-glow\.is-active::after\s*\{[\s\S]*?connection-target-edge-sweep var\(--connection-target-sweep-duration/);
  assert.match(connectionStyles, /\.connection-target-glow\.is-active::before\s*\{[\s\S]*?connection-target-edge-capture\s+250ms/);
  assert.doesNotMatch(connectionStyles, /^\.connection-target-glow::after\s*\{(?:(?!\}).)*animation:/ms);
  assert.match(connectionStyles, /74%, 100% \{[\s\S]*?--connection-target-sweep-end/);
  assert.match(connectionStyles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.connection-target-glow\.is-active::after\s*\{[\s\S]*?animation:\s*none/);
  assert.match(rendererSource, /function createConfirmationElements[\s\S]*?connection-confirmation-path[\s\S]*?connection-confirmation-endpoint/);
  assert.match(rendererSource, /function startConfirmationAnimations[\s\S]*?elements\.path[\s\S]*?elements\.marker/);
  assert.doesNotMatch(rendererSource, /strokeDashoffset/);
  assert.match(rendererSource, /Promise\.all\(animations\.map\([\s\S]*?onComplete/);
  assert.match(connectionStyles, /\.connection-confirmation-path\s*\{[\s\S]*?stroke-width:\s*2\.7/);
  assert.match(connectionStyles, /\.connection-confirmation-endpoint\s*\{[\s\S]*?transform-origin:\s*center/);
  assert.doesNotMatch(connectionStyles, /connection-settle-|is-settling/);
  assert.doesNotMatch(connectionStyles, /\.connection-group\.is-confirming \.connection-path/);
  assert.match(motionSource, /const CONFIRM_MS = 240/);
  assert.match(motionSource, /const confirmMs = CONFIRM_MS;[\s\S]*?const totalMs = confirmMs;/);
  assert.match(motionSource, /const overlayOpacity = clamp\(1 - Math\.max\(0, safeCohortSize - 4\) \* 0\.04, 0\.72, 1\)/);
  assert.match(feedbackControllerSource, /record\.startedAt \+ getDuration\(record\.profile\)/);
  assert.match(feedbackControllerSource, /Number\.isFinite\(profile\?\.safetyMs\)/);
  assert.match(feedbackControllerSource, /completionNotificationQueued[\s\S]*?enqueueMicrotask/);
  assert.doesNotMatch(feedbackControllerSource, /duration\s*=\s*520/);
  assert.match(appSource, /connectionFeedbacks:\s*new Map\(\)/);
  assert.doesNotMatch(appSource, /getBezierLength/);
  assert.match(appSource, /const cohortSize = connections\.length;[\s\S]*?createFeedbackProfile\(\{ cohortSize \}\)/);
  assert.match(appSource, /reducedMotionQuery\.addEventListener\?\.\("change"[\s\S]*?canvasConnectionFeedback\.clear\(\)/);
  assert.match(appSource, /createConnectionsBatch[\s\S]*?setConnectionFeedback\(created\)/);
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
  assert.match(appCss, /\.app-shell \.canvas-shell\.multi-selection-active \.canvas-node\.selected \.media-frame\s*\{[\s\S]*?border-color:\s*var\(--node-media-border\)[\s\S]*?box-shadow:\s*var\(--node-media-shadow\)/);
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
  assert.match(appCss, /\.group-frame\s*\{[\s\S]*?calc\(1px \* var\(--group-interaction-scale[\s\S]*?var\(--group-frame-boundary\)/);
  assert.match(appCss, /\.group-frame:hover\s*\{[\s\S]*?var\(--group-frame-fill-hover\)[\s\S]*?var\(--group-frame-boundary-hover\)/);
  assert.match(appCss, /\.group-frame\.selected\s*\{[\s\S]*?calc\(1px \* var\(--group-interaction-scale[\s\S]*?var\(--group-frame-boundary-active\)/);
  assert.doesNotMatch(appCss, /calc\(1\.35px \* var\(--group-interaction-scale/);
  assert.match(html, /id="groupResizeOverlay"[\s\S]*?data-group-resize="ne"[\s\S]*?data-group-resize="se"[\s\S]*?data-group-resize="sw"[\s\S]*?data-group-resize="nw"/);
  assert.match(appCss, /\.group-resize-overlay\s*\{[\s\S]*?z-index:\s*31;[\s\S]*?pointer-events:\s*none/);
  assert.match(appCss, /\.group-corner-handle\s*\{[\s\S]*?width:\s*26px;[\s\S]*?height:\s*26px;[\s\S]*?pointer-events:\s*auto/);
  assert.match(appCss, /\.group-corner-handle::before\s*\{[\s\S]*?opacity:\s*0;[\s\S]*?transform:\s*scale\(0\.82\)/);
  assert.match(appCss, /\.group-corner-handle:hover::before,[\s\S]*?opacity:\s*1;[\s\S]*?transform:\s*scale\(1\)/);
  assert.match(appCss, /\.group-resize-overlay\[data-active-resize="ne"\] \.group-corner-handle\.north-east::before/);
  assert.match(appSource, /function renderGroupResizeOverlay\(\)[\s\S]*?getSelectionScreenRect\(bounds, state, 0\)/);
  assert.match(appSource, /function bindGroupFrameEvents\(el\)[\s\S]*?const liveGroup = getGroupById\(el\.dataset\.groupId\)/);
  assert.match(appSource, /function getNodeMembershipBounds\(node\)/);
  assert.match(appSource, /function findGroupForNode\(node\)[\s\S]*?nodeBounds: getNodeMembershipBounds\(node\)/);
  assert.doesNotMatch(appCss, /\.group-resize-handle/);
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
  assert.match(appCss, /--node-font-body:\s*14px/);
  assert.match(appCss, /\.prompt-input\s*\{[\s\S]*?font-size:\s*var\(--node-font-body\)[\s\S]*?line-height:\s*var\(--node-leading-body\)/);
  assert.match(appCss, /\.prompt-input::placeholder\s*\{[\s\S]*?font-weight:\s*480/);
  assert.match(appCss, /\.control-chip\s*\{[\s\S]*?font-size:\s*var\(--node-font-control\)/);
});

test("prompt workspace keeps the reference width while content drives height and controls", () => {
  assert.match(appSource, /const panelWidth = layoutRules\.normalPanelWidth/);
  assert.match(appSource, /Number\(node\.promptPanelHeight\) \|\| layoutRules\.compactPanelHeight/);
  assert.match(appSource, /const advancedSettingsHeight = node\.advancedSettingsExpanded[\s\S]*?layoutRules\.advancedSettingsHeightByMode\[getNodeGenerationMode\(node\)\]/);
  assert.match(appSource, /function syncPromptPanelContentHeight\(node, element\)/);
  assert.match(appCss, /\.prompt-composer-surface\s*\{[\s\S]*?border-radius:\s*12px[\s\S]*?background:\s*var\(--node-panel-bg\)[\s\S]*?box-shadow:\s*var\(--node-panel-shadow\)/);
  assert.match(appCss, /\.prompt-panel\s*\{[\s\S]*?width:\s*705px[\s\S]*?height:\s*291px/);
  assert.match(appCss, /\.asset-drop\s*\{[\s\S]*?top:\s*11px[\s\S]*?left:\s*13px[\s\S]*?width:\s*46px[\s\S]*?height:\s*46px/);
  assert.match(appCss, /\.prompt-input\s*\{[\s\S]*?top:\s*var\(--prompt-input-top, 73px\)[\s\S]*?bottom:\s*calc\(var\(--prompt-input-bottom, 51px\) \+ var\(--prompt-advanced-height, 0px\)\)/);
  assert.match(appCss, /\.control-bar\s*\{[\s\S]*?left:\s*12px[\s\S]*?right:\s*9px[\s\S]*?bottom:\s*calc\(6px \+ var\(--prompt-advanced-height, 0px\)\)/);
  assert.match(appCss, /\.composer-tool-button\s*\{[\s\S]*?flex:\s*0 0 36px[\s\S]*?height:\s*36px/);
  assert.match(appSource, /\$\{isVideoNode \? `[\s\S]*?data-action="prompt-optimization"[\s\S]*?` : ""\}[\s\S]*?data-action="advanced-settings-toggle"/);
  assert.match(appSource, /data-action="prompt-optimization"[\s\S]*?aria-busy="\$\{node\.promptOptimizing\}"[\s\S]*?node\.generating \|\| node\.promptOptimizing \|\| !node\.prompt\.trim\(\)/);
  assert.match(appSource, /class="prompt-optimization-spinner"/);
  assert.match(appSource, /promptInput\?\.addEventListener\("input"[\s\S]*?syncPromptOptimizationButton\(el\.querySelector\("\.prompt-optimization-button"\), node\)/);
  assert.match(appSource, /function syncPromptOptimizationButton\(button, node\)[\s\S]*?button\.disabled = disabled/);
  assert.match(appSource, /function startPromptOptimization\(node\)[\s\S]*?node\.promptOptimizing = true[\s\S]*?promptOptimizationTasks\.set\(task\.id, task\)[\s\S]*?setTimeout\(\(\) => completePromptOptimization\(task\.id\), 900\)/);
  assert.match(appSource, /function completePromptOptimization\(taskId\)[\s\S]*?buildOptimizedPrompt\(task\.sourcePrompt\)[\s\S]*?pushCanvasUndoAction\(canvas,[\s\S]*?scheduleCanvasDocumentSave\(\)/);
  assert.match(appSource, /cancelPromptOptimizationTasks\([\s\S]*?task\.canvasId === activeCanvas\.id && selectedNodeIds\.has\(task\.nodeId\)/);
  assert.match(appSource, /cancelPromptOptimizationTasks\(\(task\) => task\.canvasId === canvasId\)/);
  assert.doesNotMatch(appSource, /promptOptimization:\s*(?:true|false)/);
  assert.match(appCss, /\.prompt-optimization-button\.is-processing \.prompt-optimization-spinner\s*\{[\s\S]*?animation:\s*promptOptimizationSpin 720ms linear infinite/);
  assert.match(appSource, /function advancedSettingsPanel\(node\)[\s\S]*?getNodeGenerationMode\(node\) === "video"[\s\S]*?自动校验素材[\s\S]*?智能引用 AutoLink[\s\S]*?assetValidationSetting[\s\S]*?定时任务/);
  assert.match(appSource, /自动匹配参考素材名称，一键 AutoLink，省去手动@麻烦/);
  assert.match(appSource, /开启后自动校验素材合规性，提升真人视频生成成功率；非真人生成可关闭，跳过检测节省耗时。/);
  assert.match(appSource, /可定时设置生成任务，到点自动执行/);
  assert.match(appCss, /\.advanced-settings\s*\{[\s\S]*?height:\s*var\(--prompt-advanced-height, 154px\)[\s\S]*?border-top:/);
  assert.match(appCss, /\.advanced-setting-switch\.is-on > span\s*\{[\s\S]*?translateX\(18px\)/);
  assert.match(appCss, /\.advanced-setting-info:hover \.advanced-setting-tooltip,[\s\S]*?\.advanced-setting-info:focus-visible \.advanced-setting-tooltip/);
  assert.match(appSource, /function syncAdvancedSettingTooltipLayout\(trigger\)[\s\S]*?placements:\s*\["top-start", "bottom-start"\]/);
  assert.match(appSource, /case "model-panel":[\s\S]*?if \(node\.panel\) node\.advancedSettingsExpanded = false/);
  assert.match(appSource, /case "param-panel":[\s\S]*?if \(node\.panel\) node\.advancedSettingsExpanded = false/);
  assert.match(appSource, /case "advanced-settings-toggle":[\s\S]*?if \(node\.advancedSettingsExpanded\) node\.panel = null/);
  assert.match(appCss, /\.advanced-setting-tooltip\[data-placement\^="bottom"\]::after/);
  assert.doesNotMatch(appSource, /settingsPanel\(|settings-panel|settings-utilities/);
  assert.match(appCss, /\.generate-button\s*\{[\s\S]*?flex:\s*0 0 106px[\s\S]*?height:\s*36px/);
  assert.match(appSource, /class="credit-semantic-icon" src="\.\/assets\/icons\/credit-prism\.svg"/);
  assert.match(appSource, /class="send-arrow-icon"[\s\S]*?<path d="M10\.25 20\.6V9\.45/);
  assert.match(appCss, /\.generate-button\s*\{[\s\S]*?background:\s*var\(--node-chip-strong-bg\)[\s\S]*?box-shadow:\s*inset/);
  assert.match(appCss, /html\[data-theme="light"\]\s*\{[\s\S]*?--node-chip-strong-bg:\s*#f4f4f4[\s\S]*?--node-send-bg:\s*#ffffff[\s\S]*?--node-send-text:\s*#111111[\s\S]*?--node-send-disabled-text:\s*#a5a5aa/);
  assert.match(appCss, /\.credit-mark\s*\{[\s\S]*?font-size:\s*16px[\s\S]*?font-variant-numeric:\s*tabular-nums/);
  assert.match(appCss, /\.credit-mark \.credit-semantic-icon\s*\{[\s\S]*?width:\s*22px[\s\S]*?height:\s*20px/);
  assert.match(appCss, /\.send-arrow\s*\{[\s\S]*?width:\s*32px[\s\S]*?height:\s*32px/);
  assert.match(appCss, /\.generate-button\.disabled \.credit-mark\s*\{[\s\S]*?opacity:\s*1/);
  assert.match(appCss, /\.generate-button\.disabled \.send-arrow,[\s\S]*?background:\s*var\(--node-send-disabled-bg\)[\s\S]*?color:\s*var\(--node-send-disabled-text\)/);
  assert.match(appCss, /\.send-arrow-icon\s*\{[\s\S]*?fill:\s*currentColor/);
  assert.match(appCss, /\.control-chip\.model-chip\s*\{[\s\S]*?flex:\s*0 1 auto[\s\S]*?width:\s*max-content/);
  assert.match(appCss, /\.param-chip\s*\{[\s\S]*?flex:\s*0 1 auto[\s\S]*?background:\s*transparent/);
  assert.match(appSource, /class="control-chip param-chip/);
  assert.match(appSource, /function durationParameterSection\(node\)[\s\S]*?data-duration-range/);
  assert.match(appSource, /data-duration-min="\$\{range\.min\}" type="range" min="0" max="\$\{range\.max\}" step="\$\{range\.step\}"/);
  assert.match(appSource, /aria-valuemin="\$\{range\.min\}"/);
  assert.match(appSource, /const usesCompactScale = range\.max <= 15/);
  assert.match(appSource, /const compactGuide = declaredMarks\.reduce/);
  assert.match(appSource, /const scaleLabels = usesCompactScale[\s\S]*?\[0, range\.min, compactGuide, range\.max\][\s\S]*?\[0, \.\.\.declaredMarks, range\.max\]/);
  assert.match(appSource, /const progress = range\.max > 0[\s\S]*?seconds \/ range\.max/);
  assert.match(appSource, /durationRange\?\.addEventListener\("input"[\s\S]*?dataset\.durationMin[\s\S]*?event\.currentTarget\.value = String\(seconds\)/);
  assert.match(appSource, /node\.model = selected\.id;[\s\S]*?node\.duration = selected\.defaults\?\.duration \|\| "";[\s\S]*?normalizeNodeParameters\(node\)/);
  assert.match(appSource, /duration-scale \$\{usesCompactScale \? "is-compact-range" : "is-wide-range"\}/);
  assert.match(appSource, /class="duration-scale-tick\$\{scaleLabels\.includes\(value\) \? " is-major" : ""\}"/);
  assert.match(appSource, /class="duration-scale-label\$\{index === 0 \? " is-start"/);
  assert.match(appCss, /\.duration-scale-tick\.is-major\s*\{[\s\S]*?height:\s*5px/);
  assert.match(appCss, /\.duration-scale-label\s*\{[\s\S]*?font-variant-numeric:\s*tabular-nums/);
  assert.match(appCss, /html\[data-theme="light"\] \.duration-scale-tick\.is-major/);
  assert.doesNotMatch(appSource, /data-duration-offset|data-duration-values/);
  assert.match(appSource, /parameterSection\(node, "分辨率", "quality"/);
  assert.match(appSource, /anchorAction === "model-panel"[\s\S]*?return \["top-start"\]/);
  assert.match(appSource, /anchorAction === "param-panel"[\s\S]*?return \["top-start"\]/);
  assert.match(appSource, /anchorAction === "param-panel"\) return 8/);
  assert.match(appSource, /const popoverWidth = popover\.offsetWidth \* compositeScale[\s\S]*?const popoverHeight = popover\.offsetHeight \* compositeScale/);
  assert.match(appCss, /\.model-panel\s*\{[\s\S]*?width:\s*320px/);
  assert.match(appCss, /\.param-panel\s*\{[\s\S]*?width:\s*348px[\s\S]*?border-radius:\s*12px/);
  assert.match(appSource, /<section class="panel-popover param-panel"/);
  assert.doesNotMatch(appSource, /class="settings-card param-panel"/);
  assert.match(appCss, /\.panel-popover\s*\{[\s\S]*?background:\s*#151618/);
  assert.doesNotMatch(appCss, /@keyframes nodePopoverIn\s*\{[\s\S]*?scale:/);
  assert.match(appCss, /\[data-node-popover\]\[data-placement\]\.param-panel\s*\{[\s\S]*?animation:\s*none/);
  assert.match(appCss, /\.model-option:hover \.model-desc,[\s\S]*?\.model-option\.active \.model-desc,[\s\S]*?\.model-option:focus-visible \.model-desc/);
  assert.match(appCss, /\.model-desc\s*\{[\s\S]*?text-overflow:\s*ellipsis[\s\S]*?white-space:\s*nowrap/);
  assert.match(appSource, /class="model-option \$\{node\.model === item\.id \? "active" : ""\}"[\s\S]*?aria-pressed="\$\{node\.model === item\.id \? "true" : "false"\}"/);
  assert.match(appCss, /\.model-chip-glyph\s*\{[\s\S]*?flex:\s*0 0 24px[\s\S]*?width:\s*24px/);
  assert.match(appCss, /\.model-option\s*\{[\s\S]*?grid-template-columns:\s*34px minmax\(0, 1fr\) 18px/);
  assert.match(appCss, /\.model-icon\s*\{[\s\S]*?width:\s*34px[\s\S]*?height:\s*34px/);
  assert.match(appSource, /model\.iconMode === "mask" \? " model-brand-monochrome" : ""/);
  assert.match(appCss, /\.model-brand-icon img\s*\{[\s\S]*?object-fit:\s*contain/);
  assert.match(appCss, /\.model-brand-monochrome img\s*\{[\s\S]*?filter:\s*brightness\(0\)/);
  assert.match(appCss, /html:not\(\[data-theme="light"\]\) \.model-brand-monochrome img\s*\{[\s\S]*?filter:\s*brightness\(0\) invert\(1\)/);
  assert.doesNotMatch(appSource, /new URL\(model\.iconSrc|--model-icon-mask/);
  assert.doesNotMatch(appCss, /\.model-brand-mask|--model-icon-mask/);
  assert.doesNotMatch(appCss, /model-logo-(?:seed|nano|kling)[^\{]*img\s*\{[\s\S]*?filter:/);
  assert.match(appSource, /class="model-check" data-lucide="check"/);
  assert.match(appCss, /\.model-option\.active \.model-check\s*\{[\s\S]*?opacity:\s*1/);
  assert.match(appSource, /sourceIcon\?\.classList\?\.forEach\(\(className\) => svg\.classList\.add\(className\)\)/);
  assert.match(appCss, /\.control-chip\.has-divider::after\s*\{[\s\S]*?width:\s*1px[\s\S]*?height:\s*20px/);
  assert.doesNotMatch(appCss, /promptPanelReveal|\.generator-node\.selected \.prompt-panel\s*\{[\s\S]*?animation:/);
  assert.doesNotMatch(appSource, /toggle-large|promptLarge|promptInputHeight|expand-corner/);
});

test("aspect changes preserve node identity and isolate the prompt workspace from media layout", () => {
  assert.match(html, /canvas-node-layout-transition\.js\?v=20260827-aspect-layout-41/);
  assert.match(
    appSource,
    /function getNodeRenderSignature\(node\)[\s\S]*?!\["x", "y", "z", "groupId", "aspect"\]\.includes\(key\)/,
  );
  assert.match(
    appSource,
    /function applyNodeAspect\(node, aspect\)[\s\S]*?getBottomCenterAnchoredPosition[\s\S]*?canvasNodeLayoutTransition\.start/,
  );
  assert.match(
    appSource,
    /function syncNodeVisualLayout[\s\S]*?element\.style\.top = `\$\{node\.y\}px`[\s\S]*?mediaFrame\.style\.height[\s\S]*?mediaFrame\.style\.transform = `translateY/,
  );
  assert.match(appSource, /promptPanel\.style\.top = `\$\{canonicalLayout\.mediaHeight \+ layoutRules\.panelGap\}px`[\s\S]*?if \(isTransitioning\) return/);
  assert.match(appCss, /\.prompt-panel\s*\{[\s\S]*?position:\s*absolute[\s\S]*?left:\s*50%[\s\S]*?translate:\s*-50% 0/);
  assert.match(appSource, /class="control-chip-label param-chip-label"[\s\S]*?getParamLabelMarkup\(node\)/);
  assert.match(appCss, /\.param-summary-aspect\s*\{[\s\S]*?flex:\s*0 0 4ch[\s\S]*?font-variant-numeric:\s*tabular-nums/);
  assert.match(appSource, /function getConnectionPortPoint\(node, side\)[\s\S]*?getNodePresentation\(node\)/);
  assert.match(appSource, /function renderNodeLayoutTransitionFrame\(transitionIds = \[\]\)[\s\S]*?renderConnections\(\)[\s\S]*?renderSelectionToolbar\(\)[\s\S]*?renderMinimap\(\)/);
  assert.match(appSource, /querySelectorAll\('\[data-action="aspect"\]'\)[\s\S]*?aria-pressed/);
});

test("multi-selection uses a quiet shared container and one aggregate output port", async () => {
  const connectionStyles = await readFile(new URL("styles/canvas-connections.css", root), "utf8");
  assert.match(html, /id="canvasGrid"[\s\S]*?id="multiSelectionSurface"[\s\S]*?id="canvasStage"/);
  assert.match(html, /id="multiSelectionChrome"[\s\S]*?id="multiSelectionPort"/);
  assert.doesNotMatch(html, /multiSelectionPortCount|multi-selection-port-count/);
  assert.doesNotMatch(html, /id="selectionCount"|批量下载（默认）/);
  assert.match(appSource, /function renderSelectionToolbar\(\)[\s\S]*?getSelectionScreenRect\(bounds,\s*state,\s*0\)/);
  assert.match(appSource, /function getDefaultGroupBounds\(nodes\)[\s\S]*?groupFrameRules\.paddingX[\s\S]*?groupFrameRules\.paddingTop[\s\S]*?groupFrameRules\.paddingBottom/);
  assert.match(appCss, /:root\s*\{[\s\S]*?--multi-selection-surface-fill:\s*rgba\(205, 214, 228, 0\.085\)[\s\S]*?--multi-selection-boundary:\s*rgba\(225, 232, 242, 0\.18\)[\s\S]*?--multi-selection-depth:\s*rgba\(/);
  assert.match(appCss, /html\[data-theme="light"\]\s*\{[\s\S]*?--multi-selection-surface-fill:\s*rgba\(45, 59, 80, 0\.034\)[\s\S]*?--multi-selection-boundary:\s*rgba\(37, 49, 68, 0\.055\)[\s\S]*?--multi-selection-depth:\s*rgba\(/);
  assert.match(appCss, /\.multi-selection-surface\s*\{[\s\S]*?z-index:\s*1;[\s\S]*?border:\s*1px solid var\(--multi-selection-boundary\)[\s\S]*?border-radius:\s*var\(--multi-selection-surface-radius,[\s\S]*?background:\s*var\(--multi-selection-surface-fill\)[\s\S]*?box-shadow:\s*0 6px 18px var\(--multi-selection-depth\)[\s\S]*?pointer-events:\s*none/);
  assert.match(appCss, /\.canvas-stage\s*\{[\s\S]*?z-index:\s*2;/);
  assert.match(appCss, /\.multi-selection-chrome\s*\{[\s\S]*?z-index:\s*30;[\s\S]*?pointer-events:\s*none/);
  assert.doesNotMatch(appCss, /\.multi-selection-chrome\s*\{[^}]*(?:border|background|box-shadow)\s*:/);
  assert.match(appCss, /\.canvas-shell\.selection-frame-hover \.multi-selection-surface\s*\{[\s\S]*?--multi-selection-boundary-hover[\s\S]*?--multi-selection-surface-fill-hover/);
  assert.match(appCss, /\.canvas-shell\.selection-frame-pressed \.multi-selection-surface\s*\{[\s\S]*?--multi-selection-boundary-active[\s\S]*?--multi-selection-surface-fill-active[\s\S]*?--multi-selection-depth-active/);
  assert.match(appCss, /\.multi-selection-chrome\.is-connecting \.multi-selection-port/);
  assert.doesNotMatch(appCss, /\.multi-selection-surface\.is-connecting/);
  assert.doesNotMatch(appCss, /--multi-selection-shadow-near|--multi-selection-shadow-far|--multi-selection-highlight/);
  assert.match(appCss, /\.canvas-shell\.selection-frame-hover[\s\S]*?cursor:\s*grab/);
  assert.match(appCss, /\.canvas-shell\.selection-frame-pressed[\s\S]*?cursor:\s*grabbing/);
  assert.match(appCss, /\.selection-toolbar \.icon-toolbar-button\s*\{[\s\S]*?background:\s*transparent/);
  assert.match(appSource, /--multi-selection-port-scale[\s\S]*?--multi-selection-port-offset[\s\S]*?portField\.portOffset[\s\S]*?--multi-selection-port-visual-size[\s\S]*?portField\.portMinOutside \* 2/);
  assert.match(appSource, /function syncSelectionOverlayProjection[\s\S]*?--multi-selection-surface-radius[\s\S]*?selectionSurfaceRadiusWorld \* state\.scale/);
  assert.match(appSource, /function applyTheme[\s\S]*?--node-media-radius[\s\S]*?syncSelectionOverlayProjection\(\)[\s\S]*?renderSelectionToolbar\(\)/);
  assert.match(appSource, /\[multiSelectionSurface, multiSelectionChrome\]\.forEach[\s\S]*?screenRect\.left[\s\S]*?screenRect\.height/);
  assert.match(appSource, /multiSelectionSurface\.classList\.add\("hidden"\)[\s\S]*?multiSelectionChrome\.classList\.add\("hidden"\)/);
  assert.match(appSource, /function getExactSelectionGroup\(selectedNodes = getSelectedNodes\(\)\)[\s\S]*?canvasSpatialSelection\.getExactSelectionGroup\(selectedNodes, state\.groups\)/);
  assert.match(appSource, /function renderSelectionToolbar\(\)[\s\S]*?getExactSelectionGroup\(selectedNodes\)[\s\S]*?multiSelectionChrome\.classList\.remove\("hidden"\)[\s\S]*?multiSelectionSurface\.classList\.toggle\("hidden", Boolean\(exactSelectionGroup\)\)/);
  assert.match(appCss, /\.multi-selection-port\s*\{[\s\S]*?left:\s*calc\(100% \+ var\(--multi-selection-port-offset,[\s\S]*?width:\s*max\(44px, var\(--multi-selection-port-visual-size/);
  assert.doesNotMatch(appCss, /--multi-selection-frame-border-width/);
  assert.match(appCss, /\.multi-selection-port::before\s*\{[\s\S]*?width:\s*var\(--connection-port-size\)[\s\S]*?border:\s*var\(--connection-port-stroke\)[\s\S]*?scale:\s*var\(--multi-selection-port-scale/);
  assert.match(appCss, /\.multi-selection-port-mark\s*\{[\s\S]*?width:\s*var\(--connection-port-mark-width\)[\s\S]*?height:\s*var\(--connection-port-mark-height\)[\s\S]*?scale:\s*var\(--multi-selection-port-scale/);
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
  assert.match(appSource, /function isSelectionFrameDragTarget\(pointer\)[\s\S]*?getExactSelectionGroup\(\)[\s\S]*?multiSelectionChrome\.getBoundingClientRect\(\)/);
  assert.match(appSource, /function beginSelectionFrameDrag\(event\)[\s\S]*?getExactSelectionGroup\(selectedNodes\)[\s\S]*?interactionSource:\s*"selection-frame"/);
  assert.match(appSource, /function handlePointerMove\(event\)[\s\S]*?syncSelectionFramePointerFeedback\(event\)/);
  assert.match(appSource, /isSelectionFrameDragTarget,[\s\S]*?beginSelectionFrameDrag,/);
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

test("the Agent composer keeps its icon, disclosure, and accessibility contracts", () => {
  const agentStart = html.indexOf('<aside class="agent-dock');
  const agentEnd = html.indexOf("</aside>", agentStart);
  assert.ok(agentStart >= 0 && agentEnd > agentStart);
  const agentMarkup = html.slice(agentStart, agentEnd);

  assert.match(
    agentMarkup,
    /id="agentNewChatBtn"[^>]*aria-label="新建对话"[^>]*>[\s\S]*?data-lucide="message-square-plus" aria-hidden="true"/,
  );
  assert.match(
    agentMarkup,
    /id="agentCloseBtn"[^>]*aria-label="收起 Reelay Agent"[^>]*>[\s\S]*?data-lucide="arrow-right-from-line" aria-hidden="true"/,
  );
  assert.match(appSource, /"message-square-plus":\s*'<path/);
  assert.match(appSource, /"arrow-right-from-line":\s*'<path/);

  assert.match(appCss, /\.agent-icon-button\s*\{[^}]*width:\s*36px;[^}]*height:\s*36px;/);
  assert.match(appCss, /\.agent-icon-button \.lucide\s*\{[^}]*width:\s*20px;[^}]*height:\s*20px;/);
  assert.doesNotMatch(appCss, /\.agent-icon-button \.lucide\s*\{[^}]*\b(?:width|height):\s*48px/);

  assert.match(agentMarkup, /<textarea[^>]*id="agentInput"[^>]*aria-label="给 Reelay Agent 的消息"/);
  assert.match(agentMarkup, /class="agent-composer prompt-composer-surface" id="agentComposer"/);
  assert.match(agentMarkup, /class="agent-composer-stage prompt-composer-layout"/);
  assert.match(appCss, /\.agent-composer\.prompt-composer-surface\s*\{[\s\S]*?--node-panel-bg:\s*var\(--agent-panel-bg\);[\s\S]*?--node-panel-line:\s*var\(--agent-panel-line\);/);
  assert.match(appSource, /class="prompt-panel prompt-composer-surface prompt-composer-layout/);
  assert.match(appSource, /data-node-prompt-input/);
  assert.match(appSource, /nodeLayer\.querySelectorAll\("\[data-node-prompt-input\]"\)/);
  assert.doesNotMatch(appCss, /\.agent-composer textarea/);
  assert.doesNotMatch(appCss, /\.agent-composer-bar\s*\{[^}]*\bposition:/);
  assert.match(
    agentMarkup,
    /id="agentHistoryBtn"[^>]*aria-controls="agentHistoryMenu"[^>]*aria-expanded="false"/,
  );
  assert.match(
    agentMarkup,
    /id="agentModeBtn"[^>]*aria-controls="agentModeMenu"[^>]*aria-haspopup="menu"[^>]*aria-expanded="false"/,
  );
  assert.match(
    agentMarkup,
    /id="agentModelBtn"[^>]*aria-controls="agentModelMenu"[^>]*aria-haspopup="dialog"[^>]*aria-expanded="false"/,
  );

  const modeMenuStart = agentMarkup.indexOf('id="agentModeMenu"');
  const modelWrapStart = agentMarkup.indexOf('class="agent-model-wrap"', modeMenuStart);
  assert.ok(modeMenuStart >= 0 && modelWrapStart > modeMenuStart);
  const modeMenuMarkup = agentMarkup.slice(modeMenuStart, modelWrapStart);
  assert.equal((modeMenuMarkup.match(/role="menuitemradio"/g) || []).length, 3);
  assert.match(modeMenuMarkup, /role="menuitemradio" data-agent-mode="image" aria-checked="false"/);
  assert.match(modeMenuMarkup, /role="menuitemradio" data-agent-mode="video" aria-checked="true"/);
  assert.match(modeMenuMarkup, /role="menuitemradio" data-agent-mode="agent" aria-checked="false"/);

  assert.match(
    agentMarkup,
    /class="agent-advanced-settings hidden" id="agentAdvancedSettings" aria-label="高级设置" aria-hidden="true"/,
  );
  assert.match(
    agentMarkup,
    /id="agentAdvancedBtn"[^>]*aria-controls="agentAdvancedSettings"[^>]*aria-expanded="false"/,
  );
  assert.match(
    agentMarkup,
    /id="agentScheduleBtn"[^>]*aria-label="定时任务暂未开放"[^>]*aria-disabled="true" disabled/,
  );
  assert.match(
    agentMarkup,
    /id="agentAutoLinkBtn"[^>]*role="switch"[^>]*aria-label="智能引用 AutoLink"[^>]*aria-checked="true"/,
  );
  const promptOptimizationStart = agentMarkup.indexOf('id="agentPromptOptimizationBtn"');
  const advancedSettingsStart = agentMarkup.indexOf('id="agentAdvancedBtn"');
  assert.ok(promptOptimizationStart >= 0 && advancedSettingsStart > promptOptimizationStart);
  assert.match(
    agentMarkup,
    /class="agent-prompt-optimization-button control-chip composer-tool-button prompt-optimization-button" id="agentPromptOptimizationBtn"[^>]*title="输入提示词后优化"[^>]*aria-label="提示词优化"[^>]*aria-busy="false" disabled>[\s\S]*?class="prompt-optimization-icon"[\s\S]*?class="prompt-optimization-spinner"/,
  );
  assert.match(appSource, /function startAgentPromptOptimization\(\)[\s\S]*?state\.agentPromptOptimizationTask = task[\s\S]*?window\.setTimeout\(\(\) => \{[\s\S]*?completeAgentPromptOptimization\(\);[\s\S]*?\}, 900\)/);
  assert.match(appSource, /function completeAgentPromptOptimization\(\)[\s\S]*?buildOptimizedPrompt\(task\.sourcePrompt\)[\s\S]*?agentInput\.value = optimizedPrompt/);
  const agentOptimizationStart = appSource.indexOf("function syncAgentPromptOptimizationControl");
  const agentOptimizationEnd = appSource.indexOf("function sendAgentMessage", agentOptimizationStart);
  assert.ok(agentOptimizationStart >= 0 && agentOptimizationEnd > agentOptimizationStart);
  const agentOptimizationSource = appSource.slice(agentOptimizationStart, agentOptimizationEnd);
  assert.doesNotMatch(agentOptimizationSource, /scheduleCanvasDocumentSave|pushCanvasUndoAction|GenerationTask|account\.credits/);
  assert.doesNotMatch(agentMarkup, /agentReferenceBtn|agent-reference-icon|插入画布引用/);
  assert.doesNotMatch(appSource, /agentReferenceBtn|setRangeText\("@"/);
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
    /\.upload-icon\s*\{[^}]*display:\s*block;[^}]*width:\s*64px;[^}]*height:\s*64px;[^}]*margin:\s*0 auto;/s,
  );
});

test("legacy page exits through the routed host instead of deleted static pages", () => {
  assert.match(appSource, /function requestHostNavigation\(target\)/);
  assert.equal((html.match(/data-canvas-home-button/g) || []).length, 1);
  assert.match(appSource, /document\.querySelectorAll\("#canvasHomeBtn, \[data-canvas-home-button\]"\)/);
  assert.match(appSource, /canvasHomeButtons\.forEach\([\s\S]*?requestHostNavigation\("home"\)/);
  assert.match(appSource, /requestHostNavigation\("home"\)/);
  assert.match(appSource, /requestHostNavigation\("projects"\)/);
  assert.match(appSource, /requestHostNavigation\("logout"\)/);
  assert.match(html, />退出账号</);
  assert.doesNotMatch(html, /(?:title|aria-label)="切换项目"/);
  assert.doesNotMatch(html, /退出(?:演示账号|登录)/);
  assert.doesNotMatch(appSource, /(?:home|login)\.html/);
});

test("canvas chrome controls expose keyboard-operable names and expanded state", () => {
  assert.match(html, /id="railProfileBtn"[^>]*aria-label="个人：Reelay 用户"[^>]*aria-controls="profileMenu"[^>]*aria-expanded="false"/);
  assert.match(appSource, /function syncHostedIdentity[\s\S]*?setAttribute\("aria-label", `个人：\$\{displayName\}`\)/);
  assert.match(appSource, /function openProfileMenu[\s\S]*?setAttribute\("aria-expanded", "true"\)/);
  assert.match(appSource, /function closeProfileMenu[\s\S]*?setAttribute\("aria-expanded", "false"\)/);
  assert.match(appSource, /railProfileBtn\?\.addEventListener\("click"[\s\S]*?profileMenu\?\.classList\.contains\("hidden"\)[\s\S]*?openProfileMenu[\s\S]*?closeProfileMenu/);
  assert.doesNotMatch(appSource, /profileAnchor\?\.addEventListener\("pointerenter"[\s\S]*?openProfileMenu|scheduleCloseProfileMenu|profilePointerInside/);
  assert.match(html, /data-project-name[^>]*tabindex="0"[^>]*aria-label="项目名称 Untitled，按 Enter 重命名"/);
  assert.match(appSource, /element\.contentEditable !== "true"[\s\S]*?event\.key === "Enter"[\s\S]*?event\.key === "F2"[\s\S]*?beginInlineRename\(element\)/);
  assert.match(appSource, /state\.hostCapabilities\.accountSections = context\.capabilities\?\.accountSections === true/);
  assert.match(appSource, /nextSection === "credits" && state\.hostCapabilities\.accountSections[\s\S]*?\{ section: "credits" \}[\s\S]*?canvasPersistence\.post\("canvas:open-account", payload\)/);
  assert.match(assetLibraryViewSource, /const renameKeyboardAttrs = mutable && !renaming[\s\S]*?tabindex="0"[\s\S]*?按 Enter 或 F2 重命名/);
  assert.match(assetLibraryViewSource, /data-library-rename="\$\{safeId\}"[\s\S]*?\$\{renameKeyboardAttrs\}/);
  assert.match(appSource, /const renameTarget = event\.target\.closest\("\[data-library-rename\]"\)[\s\S]*?event\.key === "Enter"[\s\S]*?event\.key === "F2"[\s\S]*?startAssetLibraryRename/);
});

test("canvas chrome keeps four floating zones without coupling to group surfaces", () => {
  assert.match(stylesEntry, /styles\/app\.css\?v=20260902-canvas-integration-59/);
  assert.match(stylesEntry, /styles\/canvas-chrome\.css\?v=20260901-asset-grid-24/);
  assert.match(stylesEntry, /styles\/canvas-asset-library\.css\?v=20260901-platform-space-27/);
  assert.match(stylesEntry, /styles\/canvas-entity-editor\.css\?v=20260901-platform-space-27/);
  assert.match(html, /class="top-bar"[\s\S]*?data-canvas-home-button[\s\S]*?data-project-name[\s\S]*?data-project-menu-button/);
  assert.match(html, /class="left-rail"[\s\S]*?data-canvas-menu-button[\s\S]*?id="railLibraryBtn"[\s\S]*?id="shareProjectBtn"[\s\S]*?id="railProfileBtn"/);
  assert.doesNotMatch(html, /class="share-reveal"/);
  assert.match(html, /data-canvas-tool="minimap"[\s\S]*?data-canvas-tool="fit"[\s\S]*?data-canvas-tool="organize"[^>]*aria-disabled="true"[^>]*disabled>[\s\S]*?data-lucide="layout-grid"[\s\S]*?id="zoomSlider"/);
  assert.doesNotMatch(html, /class="rail-button canvas-switch-trigger"[^>]*title=|id="railProfileBtn"[^>]*title=/);
  assert.match(html, /class="agent-dock collapsed"[\s\S]*?class="agent-launcher"/);
  assert.match(html, /id="projectMenu"[^>]*role="dialog"[\s\S]*?id="projectMenuSearch"[^>]*placeholder="搜索项目"[\s\S]*?id="projectMenuList"[\s\S]*?data-project-action="create"[\s\S]*?>新建项目</);
  assert.doesNotMatch(html, /data-project-action="(?:home|delete)"/);
  assert.doesNotMatch(appSource, /function resetPrototypeProject/);
  const projectActionStart = appSource.indexOf("function handleProjectMenuAction");
  const projectActionEnd = appSource.indexOf("function handleCanvasMoreAction", projectActionStart);
  const projectActionSource = appSource.slice(projectActionStart, projectActionEnd);
  assert.match(projectActionSource, /action === "create"[\s\S]*?requestHostProjectCreation\(\)/);
  assert.doesNotMatch(projectActionSource, /action === "(?:home|delete)"/);
  assert.match(appSource, /state\.hostCapabilities\.projectSwitcher = context\.capabilities\?\.projectSwitcher === true;[\s\S]*?state\.projects = normalizeProjectOptions\(context\.projects\)/);
  assert.match(appSource, /function renderProjectMenu\(\)[\s\S]*?data-project-id=[\s\S]*?aria-current=[\s\S]*?data-lucide="check"/);
  assert.match(appSource, /function requestHostProjectNavigation\(projectId\)[\s\S]*?canvasPersistence\.post\("canvas:open-project", \{ projectId \}\)/);
  assert.match(appSource, /function requestHostProjectCreation\(\)[\s\S]*?canvasPersistence\.post\("canvas:create-project"\)/);
  assert.match(canvasChromeCss, /--canvas-edge-bar-width:\s*248px/);
  assert.match(canvasChromeCss, /--canvas-project-bar-height:\s*40px/);
  assert.match(canvasChromeCss, /--canvas-viewport-toolbar-height:\s*44px/);
  assert.match(canvasChromeCss, /--canvas-chrome-panel-gap:\s*8px/);
  assert.match(canvasChromeCss, /\.top-bar \.canvas-project-switcher\s*\{[\s\S]*?width:\s*min\(var\(--canvas-edge-bar-width\), calc\(100vw - 96px\)\)/);
  assert.match(canvasChromeCss, /\.top-bar \.project-nav-name\[contenteditable="true"\]\s*\{[\s\S]*?outline:\s*0;[\s\S]*?background:\s*color-mix\(in srgb, var\(--text\) 7%, transparent\);[\s\S]*?box-shadow:\s*none;/);
  assert.match(canvasChromeCss, /\.left-rail\s*\{[\s\S]*?top:\s*50%[\s\S]*?transform:\s*translateY\(-50%\)/);
  assert.match(canvasChromeCss, /\.left-rail\s*\{[\s\S]*?width:\s*52px/);
  assert.match(canvasChromeCss, /\.left-rail \.rail-button,[\s\S]*?width:\s*42px;[\s\S]*?height:\s*42px/);
  assert.match(canvasChromeCss, /\.left-rail \.avatar-button\.active \+ \.profile-button-tip\s*\{[\s\S]*?visibility:\s*hidden;[\s\S]*?opacity:\s*0;/);
  assert.match(canvasChromeCss, /\.left-rail \.rail-button\s*\{[\s\S]*?box-shadow:\s*none;[\s\S]*?backdrop-filter:\s*none;/);
  assert.match(canvasChromeCss, /\.left-rail \.profile-menu\s*\{[\s\S]*?top:\s*auto;[\s\S]*?bottom:\s*-5px;[\s\S]*?left:\s*calc\(100% \+ 12px\)/);
  assert.match(appCss, /\.profile-help-flyout\s*\{[\s\S]*?position:\s*static/);
  assert.match(appCss, /\.profile-help-flyout-panel\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?bottom:\s*-1px;[\s\S]*?left:\s*calc\(100% \+ 8px\);[\s\S]*?width:\s*168px/);
  assert.match(appCss, /\.profile-shortcut-sheet\s*\{[\s\S]*?top:\s*calc\(100% \+ 8px\);[\s\S]*?left:\s*-1px;[\s\S]*?width:\s*min\(620px, calc\(100vw - 368px\)\)/);
  assert.match(canvasChromeCss, /\.project-menu\s*\{[\s\S]*?display:\s*flex;[\s\S]*?border-radius:\s*16px/);
  assert.match(canvasChromeCss, /\.project-menu-list\s*\{[\s\S]*?max-height:\s*min\(336px,[\s\S]*?overflow-y:\s*auto/);
  assert.match(canvasChromeCss, /\.project-menu \.project-menu-option\s*\{[\s\S]*?grid-template-columns:\s*42px minmax\(0, 1fr\) 20px/);
  assert.match(appSource, /function scheduleProfileHelpClose\(\)[\s\S]*?helpPanel\?\.matches\(":hover"\)[\s\S]*?180/);
  assert.match(appSource, /profileHelpFlyout\?\.addEventListener\("pointerenter"[\s\S]*?setProfileHelpOpen\(true\)[\s\S]*?profileHelpFlyout\?\.addEventListener\("pointerleave"[\s\S]*?scheduleProfileHelpClose\(\)/);
  assert.doesNotMatch(`${html}\n${appSource}\n${appCss}`, /profile-help-inline|profileHelpInline/);
  assert.doesNotMatch(appCss, /\.profile-help-trigger\s*>\s*\.lucide:last-child[\s\S]*?transform/);
  assert.doesNotMatch(canvasChromeCss, /\.share-reveal/);
  assert.match(canvasChromeCss, /\.canvas-tools\s*\{[\s\S]*?left:\s*12px[\s\S]*?bottom:\s*12px/);
  assert.match(canvasChromeCss, /\.canvas-tool-row\s*\{[\s\S]*?height:\s*var\(--canvas-viewport-toolbar-height\);[\s\S]*?padding:\s*4px/);
  assert.match(canvasChromeCss, /\.canvas-tool-button\s*\{[\s\S]*?width:\s*34px;[\s\S]*?height:\s*34px/);
  assert.match(canvasChromeCss, /\.canvas-zoom-control:hover,[\s\S]*?\.canvas-zoom-control\.value-visible\s*\{[\s\S]*?width:\s*168px/);
  assert.match(canvasChromeCss, /\.canvas-zoom-value\s*\{[\s\S]*?position:\s*static[\s\S]*?width:\s*0[\s\S]*?transform:\s*translateX\(-4px\)/);
  assert.match(canvasChromeCss, /\.canvas-zoom-control\.value-visible \.canvas-zoom-value\s*\{[\s\S]*?width:\s*38px[\s\S]*?margin-left:\s*8px/);
  assert.match(assetLibraryCss, /top:\s*calc\(12px \+ var\(--canvas-project-bar-height,\s*40px\) \+ var\(--canvas-chrome-panel-gap,\s*8px\)\)/);
  assert.match(assetLibraryCss, /bottom:\s*calc\(12px \+ var\(--canvas-viewport-toolbar-height,\s*44px\) \+ var\(--canvas-chrome-panel-gap,\s*8px\)\)/);
  assert.match(entityEditorCss, /\.canvas-entity-editor\s*\{[\s\S]*?top:\s*calc\(12px \+ var\(--canvas-project-bar-height,\s*40px\) \+ var\(--canvas-chrome-panel-gap,\s*8px\)\)[\s\S]*?bottom:\s*calc\(12px \+ var\(--canvas-viewport-toolbar-height,\s*44px\) \+ var\(--canvas-chrome-panel-gap,\s*8px\)\)/);
  assert.match(canvasChromeCss, /\.agent-launcher\s*\{[\s\S]*?top:\s*18px[\s\S]*?right:\s*18px/);
  assert.doesNotMatch(canvasChromeCss, /group-frame|group-resize|multi-selection|selection-toolbar/);
});

test("asset library actions stay scoped to their real controls and canvas drop target", () => {
  const renderAssetLibraryStart = appSource.indexOf("function renderAssetLibrary()");
  const renderAssetLibraryEnd = appSource.indexOf("\nfunction findLibraryAsset", renderAssetLibraryStart);
  const renderAssetLibrarySource = appSource.slice(renderAssetLibraryStart, renderAssetLibraryEnd);
  const createFolderStart = appSource.indexOf("function createAssetLibraryFolder()");
  const createFolderEnd = appSource.indexOf("\nfunction projectAssetToLibraryMedia", createFolderStart);
  const createFolderSource = appSource.slice(createFolderStart, createFolderEnd);
  const runLibraryActionStart = appSource.indexOf("function runAssetLibraryAction(action, items)");
  const runLibraryActionEnd = appSource.indexOf("\nfunction deleteAssetLibraryFolder", runLibraryActionStart);
  const runLibraryActionSource = appSource.slice(runLibraryActionStart, runLibraryActionEnd);

  assert.match(html, /styles\.css\?v=20260902-canvas-integration-59/);
  assert.match(html, /prototype-config\.js\?v=20260901-entity-use-43/);
  assert.match(html, /canvas-asset-library-model\.js\?v=20260901-platform-space-27/);
  assert.match(html, /canvas-asset-library-view\.js\?v=20260901-platform-space-27/);
  assert.match(html, /canvas-entity-use-model\.js\?v=20260901-entity-use-43/);
  assert.match(html, /canvas-entity-use-view\.js\?v=20260901-entity-use-43/);
  assert.match(html, /canvas-media-asset-coordinator\.js\?v=20260901-platform-space-27/);
  assert.match(html, /app\.js\?v=20260902-canvas-integration-59/);
  assert.match(html, /class="asset-library-command-slot" id="assetLibraryCommandBar"/);
  assert.match(html, /class="asset-library-search-row"[\s\S]*?id="assetLibrarySearchInput"[\s\S]*?id="assetLibraryPlatformCommandAnchor"/);
  assert.doesNotMatch(html, /class="asset-library-commandbar" id="assetLibraryCommandBar"/);

  assert.match(html, /id="canvasEntityEditorHost" hidden inert aria-hidden="true"/);
  assert.match(html, /id="canvasEntityPickerHost" hidden inert aria-hidden="true"/);
  assert.match(html, /id="canvasEntityEditorUploadInput"[^>]*hidden/);
  assert.doesNotMatch(html, /id="assetEntityEditor"|id="assetEntityEditorContent"|id="assetEntityUploadInput"/);
  assert.match(appSource, /createCanvasEntityEditorController\(\{[\s\S]*?saveEntity:\s*saveEntityEditorDraft/);
  assert.match(appSource, /function openEntityEditorCreate\(\)[\s\S]*?canvasEntityEditor\.open\(\{[\s\S]*?mode:\s*"create"/);
  assert.match(appSource, /function openEntityEditorEdit\(entityId\)[\s\S]*?expectedVersion:\s*entity\.version/);
  assert.doesNotMatch(appSource, /createEntityFromMedia|importPlatformMediaToPersonal|function saveAssetEntityEditor/);

  assert.match(html, /id="entityUseDetailPortal"[^>]*aria-hidden="true"[^>]*inert[^>]*hidden/);
  assert.match(html, /id="entityUsePickerPortal"[^>]*aria-hidden="true"[^>]*inert[^>]*hidden/);
  assert.match(entityUseModelSource, /function createEntityMediaPlan/);
  assert.match(entityUseModelSource, /function createCenteredGridPlan/);
  assert.match(entityUseViewSource, /data-entity-use-action="add-entities"/);
  assert.match(entityUseViewSource, /data-entity-use-add-canvas/);
  assert.match(appSource, /function addEntityToCanvas\(entityId\)[\s\S]*?pushUndoAction\(\{ type: "create"/);
  assert.match(appSource, /function openEntityUsePicker\(nodeId\)[\s\S]*?!canNodeUseEntityReferences\(node\)/);
  assert.match(appSource, /function addSelectedEntitiesToGenerator\(\)[\s\S]*?const before = cloneNodeState\(node\)[\s\S]*?node\.assets\.push\(\.\.\.additions\)/);
  assert.match(appSource, /entityUsePickerPortal\?\.addEventListener\("click"[\s\S]*?action === "toggle-entity"[\s\S]*?action === "add-entities"/);
  assert.match(appSource, /entityUsePickerPortal\?\.addEventListener\("input"[\s\S]*?renderEntityUsePicker\(\{ focusSearch: true \}\)/);
  assert.match(appSource, /case "entity-picker":[\s\S]*?if \(!canNodeUseEntityReferences\(node\)\) return/);

  assert.match(appSource, /closest\("#assetLibrarySpaceMenu \[data-library-space\]"\)/);
  assert.match(appSource, /closest\("#assetLibrarySectionTabs \[data-library-section\]"\)/);
  assert.match(appSource, /closest\("#assetLibraryCommandBar button\[data-library-display\]"\)/);
  assert.match(appSource, /const eventPath = typeof event\.composedPath === "function"/);
  assert.match(appSource, /function isCanvasDropTarget\(target\)[\s\S]*?closest\("#canvasShell"\)/);
  assert.match(appSource, /hasSupportedPayload && !isCanvasDropTarget\(event\.target\)/);
  assert.doesNotMatch(appSource, /window\.prompt\("新建文件夹名称"/);
  assert.match(appSource, /window\.parent !== window && space !== "personal"[\s\S]*?仅支持上传到个人空间/);
  assert.match(appSource, /event\.target\.closest\("\[data-library-batch-toggle\]"\)[\s\S]*?state\.librarySelectedIds\.size === 0[\s\S]*?state\.libraryToolbarMenu = null/);

  assert.match(appSource, /state\.librarySpace === "platform"[\s\S]*?\? "media"/);
  assert.match(appSource, /flatPlatformResults = state\.librarySpace === "platform"[\s\S]*?flatPlatformResults \? \[\]/);
  assert.match(renderAssetLibrarySource, /const canManageFolders = mutable;[\s\S]*?data-library-folder-capability", canManageFolders \? "true" : "false"/);
  assert.doesNotMatch(renderAssetLibrarySource, /canManageFolders\s*=\s*mutable\s*&&\s*section\s*===\s*"media"/);
  assert.match(createFolderSource, /MAX_DIRECTORY_LEVELS[\s\S]*?kind:\s*state\.librarySection/);
  assert.doesNotMatch(createFolderSource, /state\.librarySection === "entity"/);
  assert.match(renderAssetLibrarySource, /allowedBatchActions:\s*platformResults\s*\?\s*\["add-canvas", "save-personal"\]\s*:\s*undefined/);
  assert.doesNotMatch(renderAssetLibrarySource, /section === "entity"\s*\?\s*\[\]/);
  assert.doesNotMatch(renderAssetLibrarySource, /allowedActions:/);
  assert.match(runLibraryActionSource, /if \(includesPersistedEntity && \["move", "share-organization", "delete"\]\.includes\(action\)\) \{\s*showActionToast\("主体的移动、共享与删除将在对应持久化切片接入；本次未执行"\);\s*return;\s*\}/);
  assert.match(appSource, /function addPlatformMediaToCanvas\(items\)[\s\S]*?hasPlacement\(item, "platform"\)[\s\S]*?addLibraryAssetToCanvas/);
  assert.match(appSource, /action === "save-personal"[\s\S]*?保存平台素材到个人素材库尚未接入/);
  assert.doesNotMatch(appSource, /savePlatformMediaToPersonal|savePlatformSelectionToPersonal|save-material/);
  assert.match(assetLibraryViewSource, /PLATFORM_BATCH_ACTIONS[\s\S]*?add-canvas[\s\S]*?save-personal/);
  assert.match(assetLibraryCss, /\.asset-library-content\s*\{[\s\S]*?overflow:\s*hidden/);
  assert.match(assetLibraryCss, /\.asset-library-grid\s*\{[\s\S]*?overflow-y:\s*auto[\s\S]*?flex:\s*1 1 0/);
  assert.match(assetLibraryCss, /\.asset-library-resize-handle::after\s*\{[\s\S]*?height:\s*36px;[\s\S]*?opacity:\s*0/);
  assert.match(entityUseCss, /\.entity-use-picker-portal\s*\{[\s\S]*?z-index:\s*120/);
});
test("shortcut help mirrors the implemented canvas gestures", () => {
  const wheelHandlerStart = appSource.indexOf('shell.addEventListener(\n  "wheel"');
  const wheelHandlerEnd = appSource.indexOf('window.addEventListener("keydown"', wheelHandlerStart);
  const wheelHandlerSource = appSource.slice(wheelHandlerStart, wheelHandlerEnd);
  const canvasKeydownHandlerEnd = appSource.indexOf('window.addEventListener("keyup"', wheelHandlerEnd);
  const canvasKeyupHandlerEnd = appSource.indexOf('document.addEventListener("dragstart"', canvasKeydownHandlerEnd);
  const canvasKeydownHandlerSource = appSource.slice(wheelHandlerEnd, canvasKeydownHandlerEnd);
  const canvasKeyupHandlerSource = appSource.slice(canvasKeydownHandlerEnd, canvasKeyupHandlerEnd);
  const nodePointerConfigStart = appSource.indexOf("createCanvasNodePointerController({");
  const nodePointerConfigEnd = appSource.indexOf("\n});", nodePointerConfigStart);
  const pointerDispatchConfigStart = appSource.indexOf("createCanvasPointerDispatchController({");
  const pointerDispatchConfigEnd = appSource.indexOf("\n});", pointerDispatchConfigStart);
  const nodePointerConfigSource = appSource.slice(nodePointerConfigStart, nodePointerConfigEnd);
  const pointerDispatchConfigSource = appSource.slice(pointerDispatchConfigStart, pointerDispatchConfigEnd);

  assert.notEqual(wheelHandlerStart, -1);
  assert.notEqual(wheelHandlerEnd, -1);
  assert.notEqual(canvasKeydownHandlerEnd, -1);
  assert.notEqual(canvasKeyupHandlerEnd, -1);
  assert.notEqual(nodePointerConfigStart, -1);
  assert.notEqual(nodePointerConfigEnd, -1);
  assert.notEqual(pointerDispatchConfigStart, -1);
  assert.notEqual(pointerDispatchConfigEnd, -1);
  assert.match(html, /id="profileShortcutTrigger"[^>]*aria-expanded="false"[^>]*aria-controls="profileShortcutSheet"/);
  assert.match(html, /id="profileShortcutSheet"[^>]*role="region"[^>]*aria-label="快捷键"/);
  assert.match(html, /<h3>画布操作<\/h3>[\s\S]*?<h3>节点操作<\/h3>/);
  assert.match(html, /<dt>移动视图<\/dt>[\s\S]*?profile-shortcut-key">中键拖动<\/span>[\s\S]*?profile-shortcut-key">空格 \+ 拖动<\/span>/);
  assert.match(html, /<dt>缩放视图<\/dt>[\s\S]*?profile-shortcut-key">Ctrl \/ Cmd \+ 滚轮<\/span>/);
  assert.match(html, /<dt>滚动平移<\/dt>[\s\S]*?profile-shortcut-key">Shift \+ 滚轮<\/span>/);
  assert.match(html, /<dt>多选 \/ 框选<\/dt>[\s\S]*?profile-shortcut-key">拖动空白<\/span>[\s\S]*?profile-shortcut-key">Shift \+ 单击<\/span>/);
  assert.match(html, /<dt>添加节点<\/dt>[\s\S]*?profile-shortcut-key">双击空白<\/span>/);
  assert.match(html, /<dt>删除节点<\/dt>[\s\S]*?profile-shortcut-key">Delete<\/span>[\s\S]*?profile-shortcut-key">Backspace<\/span>/);
  assert.match(html, /<dt>复制并拖动<\/dt>[\s\S]*?profile-shortcut-key">Alt \+ 拖动<\/span>/);
  assert.match(html, /<dt>撤销上一步<\/dt>[\s\S]*?profile-shortcut-key">Ctrl \/ Cmd \+ Z<\/span>/);
  assert.match(html, /<dt>关闭当前浮层<\/dt>[\s\S]*?profile-shortcut-key">Esc<\/span>/);

  assert.match(pointerDispatchSource, /pointer\.button === 1 \|\| options\.isSpaceDown\(\)/);
  assert.match(nodePointerSource, /event\.button === 1 \|\| \(event\.button === 0 && options\.isSpaceDown\(\)\)/);
  assert.match(nodePointerConfigSource, /isSpaceDown:\s*\(\) => state\.isSpaceDown/);
  assert.match(pointerDispatchConfigSource, /isSpaceDown:\s*\(\) => state\.isSpaceDown/);
  assert.match(canvasKeydownHandlerSource, /if \(event\.code === "Space"\)\s*\{[\s\S]*?state\.isSpaceDown = true;[\s\S]*?shell\.classList\.add\("space-pan"\)/);
  assert.match(canvasKeyupHandlerSource, /if \(event\.code !== "Space"\) return;[\s\S]*?state\.isSpaceDown = false;[\s\S]*?shell\.classList\.remove\("space-pan"\)/);
  assert.match(wheelHandlerSource, /if \(event\.ctrlKey \|\| event\.metaKey\)[\s\S]*?setCanvasZoom\(state\.scale \* zoomFactor, event\.clientX, event\.clientY\)/);
  assert.match(wheelHandlerSource, /event\.shiftKey && Math\.abs\(event\.deltaX\) < 1[\s\S]*?state\.tx -= horizontalDelta/);
  assert.match(appSource, /shell\.addEventListener\("dblclick"[\s\S]*?openNodeCreateMenu/);
  assert.match(nodePointerSource, /shiftKey:\s*event\.shiftKey/);
  assert.match(nodePointerSource, /altKey:\s*event\.altKey/);
  assert.match(appSource, /event\.key === "Delete" \|\| event\.key === "Backspace"/);
  assert.match(appSource, /\(event\.ctrlKey \|\| event\.metaKey\) && event\.key\.toLowerCase\(\) === "z"/);
  assert.doesNotMatch(html, /data-help-action="shortcuts"/);
  assert.doesNotMatch(html, /<kbd>/);
  assert.doesNotMatch(appCss, /(?:^|\n)\.shortcut-(?:list|row)\b/m);
  assert.match(appCss, /\.profile-shortcut-groups\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);[\s\S]*?gap:\s*0/);
  assert.doesNotMatch(appCss, /\.profile-shortcut-columns\s*\{/);
  assert.match(appCss, /\.profile-shortcut-group \+ \.profile-shortcut-group\s*\{[\s\S]*?border-left:\s*1px solid/);
  assert.match(appCss, /\.profile-help-shortcuts::before\s*\{[\s\S]*?top:\s*100%;[\s\S]*?height:\s*18px/);
  assert.match(html, /<span>使用教程<\/span>[\s\S]*?<span>反馈问题<\/span>[\s\S]*?id="profileShortcutTrigger"[\s\S]*?<span>快捷键<\/span>/);
  assert.match(html, /id="profileShortcutTrigger"[\s\S]*?data-lucide="chevron-down"/);
  assert.match(appCss, /\.profile-help-shortcuts\[aria-expanded="true"\] > \.lucide:last-child\s*\{[\s\S]*?transform:\s*rotate\(180deg\)/);
  assert.match(appCss, /\.profile-shortcut-sheet\.open\s*\{[\s\S]*?display:\s*grid/);
  assert.match(appSource, /function setProfileShortcutOpen\(open\)[\s\S]*?profileShortcutTrigger\?\.setAttribute\("aria-expanded", String\(open\)\)[\s\S]*?profileShortcutSheet\?\.classList\.toggle\("open", open\)/);
  assert.match(appSource, /profileShortcutTrigger\?\.addEventListener\("pointerenter"[\s\S]*?profileShortcutTrigger\?\.addEventListener\("click"[\s\S]*?profileShortcutSheet\?\.addEventListener\("pointerenter"/);
  assert.doesNotMatch(appCss, /\.profile-help-shortcuts:(?:hover|focus-visible)\s*~\s*\.profile-shortcut-sheet/);
});

test("canvas switch buttons only open the menu and menu rows own rename editing", () => {
  const triggerStart = appSource.indexOf('document.querySelectorAll("[data-canvas-menu-button]")');
  const triggerEnd = appSource.indexOf("projectNameEls.forEach", triggerStart);
  assert.ok(triggerStart >= 0 && triggerEnd > triggerStart);
  const triggerSource = appSource.slice(triggerStart, triggerEnd);
  assert.match(triggerSource, /addEventListener\("click"[\s\S]*?openCanvasMenu\(button, \{ focusMenu: event\.detail === 0 \}\)/);
  assert.doesNotMatch(triggerSource, /dblclick|beginInlineRename/);

  const renameStart = appSource.indexOf("function beginCanvasMenuRename");
  const renameEnd = appSource.indexOf("function addCanvas", renameStart);
  assert.ok(renameStart >= 0 && renameEnd > renameStart);
  const renameSource = appSource.slice(renameStart, renameEnd);
  assert.match(renameSource, /if \(!requireCanvasMutation\(\)\) return/);
  assert.match(renameSource, /event\.key === "Enter"/);
  assert.match(renameSource, /event\.key === "Escape"/);
  assert.match(renameSource, /event\.key === "Tab"[\s\S]*?controls\[nextIndex\] \|\| canvasMenuTrigger/);
  assert.match(renameSource, /commitCanvasRename\(nextName \|\| previousName, canvasId, \{ renderMenu: false \}\)/);
  assert.match(renameSource, /nameInput\.replaceWith\(switchButton\)/);

  const commitStart = appSource.indexOf("function commitCanvasRename");
  const commitEnd = appSource.indexOf("function positionMenu", commitStart);
  const commitSource = appSource.slice(commitStart, commitEnd);
  assert.match(commitSource, /\{ renderMenu = true \} = \{\}/);
  assert.match(commitSource, /if \(normalizedName === canvas\.name\)[\s\S]*?return true/);
  assert.ok(commitSource.indexOf("scheduleCanvasDocumentSave()") > commitSource.indexOf("if (normalizedName === canvas.name)"));
});

test("the canvas organization entry exposes a visual management affordance without redundant text", () => {
  assert.match(html, /class="profile-menu-list"[\s\S]*?id="profileCreditsBtn"[\s\S]*?id="profileOrganization"/);
  assert.match(html, /id="profileOrganization"[^>]*aria-label="进入组织中心"[\s\S]*?>[\s\S]*?<span>组织中心<\/span>/);
  assert.doesNotMatch(appSource, /\bprofileOrganization\b/);
  assert.doesNotMatch(`${html}\n${appCss}`, /avatar-credit-badge/);
  assert.doesNotMatch(`${html}\n${appCss}`, /share-button|action-tip/);
  assert.doesNotMatch(appCss, /\.profile-anchor\s+\.profile-menu/);
  assert.doesNotMatch(appCss, /\.profile-menu-item\.active/);
  assert.doesNotMatch(html, /class="profile-menu-item danger"[^>]*data-profile-action="logout"/);
  assert.doesNotMatch(appCss, /\.profile-menu-item\.danger/);
  assert.doesNotMatch(html, />所属组织</);
  assert.doesNotMatch(html, /role="tooltip">进入组织管理界面</);
  assert.doesNotMatch(appCss, /\.profile-membership:hover > (?:svg|span)/);
  assert.doesNotMatch(appCss, /\.profile-membership:hover,\s*\.profile-membership:focus-visible\s*\{[^}]*box-shadow/);
  assert.match(appCss, /\.profile-membership\s*\{[\s\S]*?background:\s*transparent/);
  assert.match(html, /data-profile-action="organization"[\s\S]*?data-profile-action="appearance"[\s\S]*?data-profile-action="account"/);
});
