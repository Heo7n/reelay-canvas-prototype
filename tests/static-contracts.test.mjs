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
  assert.match(html, /id="avatarCreditBadge"[^>]*>[\s\S]*?<img[^>]*src="\.\/assets\/icons\/credit-prism\.svg"[^>]*>[\s\S]*?id="avatarCreditValue">3000<\/span>/);
  assert.doesNotMatch(html, /id="avatarCreditBadge"[^>]*(?:role="button"|tabindex=)/);
  assert.doesNotMatch(appSource, /avatarCreditBadge\?\.addEventListener/);
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
  assert.match(appSource, /function modelIconMarkup\(model, className\)[\s\S]*?model\?\.iconSrc[\s\S]*?model-brand-mask/);
  assert.doesNotMatch(appSource, /workflow-panel|hasWorkflowControl|workflowPanel/);
  assert.match(appSource, /function workflowParameterSection\(node\)[\s\S]*?data-action="workflow"/);
  assert.match(appSource, /function getParamLabelParts\(node\)[\s\S]*?workflow\?\.label[\s\S]*?aspect:\s*node\.aspect/);
  assert.match(appSource, /placeholder="描述你想生成的内容，或输入 @ 引用"/);
  assert.match(appSource, /modelIconMarkup\(model, "agent-model-provider"\)/);
  assert.match(appSource, /"box":\s*'<path/);
  assert.match(html, /id="agentModelBtn"[\s\S]*?data-lucide="box"/);
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
  const modelPolicyIndex = html.indexOf("./src/legacy-canvas/canvas-generator-model-policy.js");
  const appIndex = html.indexOf("./app.js");
  assert.ok(
    catalogIndex >= 0 &&
    catalogIndex < configIndex &&
    configIndex < modelPolicyIndex &&
    modelPolicyIndex < runtimeStoreIndex &&
    runtimeStoreIndex < commandExecutorIndex &&
    commandExecutorIndex < codecIndex &&
    codecIndex < persistenceIndex &&
    persistenceIndex < appIndex &&
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
  assert.match(html, /styles\.css\?v=20260831-group-surfaces-53/);
  assert.match(html, /app\.js\?v=20260831-group-surfaces-53/);
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
  assert.match(appCss, /\.prompt-panel\s*\{[\s\S]*?width:\s*705px[\s\S]*?height:\s*291px[\s\S]*?border-radius:\s*12px/);
  assert.match(appCss, /\.asset-drop\s*\{[\s\S]*?top:\s*11px[\s\S]*?left:\s*13px[\s\S]*?width:\s*46px[\s\S]*?height:\s*46px/);
  assert.match(appCss, /\.prompt-input\s*\{[\s\S]*?top:\s*var\(--prompt-input-top, 73px\)[\s\S]*?bottom:\s*calc\(var\(--prompt-input-bottom, 51px\) \+ var\(--prompt-advanced-height, 0px\)\)/);
  assert.match(appCss, /\.control-bar\s*\{[\s\S]*?left:\s*12px[\s\S]*?right:\s*9px[\s\S]*?bottom:\s*calc\(6px \+ var\(--prompt-advanced-height, 0px\)\)/);
  assert.match(appCss, /\.prompt-optimization-button,[\s\S]*?\.advanced-settings-chip\s*\{[\s\S]*?flex:\s*0 0 36px[\s\S]*?height:\s*36px/);
  assert.match(appSource, /\$\{isVideoNode \? `[\s\S]*?data-action="prompt-optimization"[\s\S]*?` : ""\}[\s\S]*?data-action="advanced-settings-toggle"/);
  assert.match(appSource, /data-action="prompt-optimization"[\s\S]*?aria-busy="\$\{node\.promptOptimizing\}"[\s\S]*?node\.generating \|\| node\.promptOptimizing \|\| !node\.prompt\.trim\(\)/);
  assert.match(appSource, /class="prompt-optimization-spinner"/);
  assert.match(appSource, /promptInput\?\.addEventListener\("input"[\s\S]*?syncPromptOptimizationButton\(el\.querySelector\("\.prompt-optimization-button"\), node\)/);
  assert.match(appSource, /function syncPromptOptimizationButton\(button, node\)[\s\S]*?button\.disabled = disabled/);
  assert.match(appSource, /function startPromptOptimization\(node\)[\s\S]*?node\.promptOptimizing = true[\s\S]*?promptOptimizationTasks\.set\(task\.id, task\)[\s\S]*?setTimeout\(\(\) => completePromptOptimization\(task\.id\), 900\)/);
  assert.match(appSource, /function completePromptOptimization\(taskId\)[\s\S]*?buildOptimizedPrompt\(task\.sourcePrompt\)[\s\S]*?pushCanvasUndoAction\(canvas,[\s\S]*?scheduleCanvasDocumentSave\(\)/);
  assert.match(appSource, /cancelPromptOptimizationTasks\([\s\S]*?task\.canvasId === activeCanvas\.id && selectedNodeIds\.has\(task\.nodeId\)/);
  assert.match(appSource, /cancelPromptOptimizationTasks\(\(task\) => task\.canvasId === canvasId\)/);
  assert.match(appSource, /cancelPromptOptimizationTasks\(\(task\) => task\.projectId === state\.projectId\)/);
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
  assert.match(appSource, /model\.iconMode === "mask"[\s\S]*?new URL\(model\.iconSrc, document\.baseURI\)\.href[\s\S]*?--model-icon-mask: url/);
  assert.doesNotMatch(appSource, /model\.iconSrc\.startsWith\("\.\/"\)[\s\S]*?\.\.\//);
  assert.match(appCss, /\.model-brand-mask\s*\{[\s\S]*?-webkit-mask:\s*var\(--model-icon-mask\)[\s\S]*?mask:\s*var\(--model-icon-mask\)/);
  assert.doesNotMatch(appCss, /model-logo-(?:seed|nano|kling)[^\{]*img\s*\{[\s\S]*?filter:/);
  assert.match(appSource, /class="model-check" data-lucide="check"/);
  assert.match(appCss, /\.model-option\.active \.model-check\s*\{[\s\S]*?opacity:\s*1/);
  assert.match(appSource, /sourceIcon\?\.classList\?\.forEach\(\(className\) => svg\.classList\.add\(className\)\)/);
  assert.match(appCss, /\.control-chip\.model-chip::after\s*\{[\s\S]*?width:\s*1px[\s\S]*?height:\s*20px/);
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
  assert.match(appCss, /:root\s*\{[\s\S]*?--multi-selection-surface-fill:\s*rgba\([\s\S]*?--multi-selection-boundary:\s*rgba\([\s\S]*?--multi-selection-depth:\s*rgba\(/);
  assert.match(appCss, /html\[data-theme="light"\]\s*\{[\s\S]*?--multi-selection-surface-fill:\s*rgba\([\s\S]*?--multi-selection-boundary:\s*rgba\([\s\S]*?--multi-selection-depth:\s*rgba\(/);
  assert.match(appCss, /\.multi-selection-surface\s*\{[\s\S]*?z-index:\s*1;[\s\S]*?border:\s*1px solid var\(--multi-selection-boundary\)[\s\S]*?border-radius:\s*var\(--multi-selection-surface-radius,[\s\S]*?background:\s*var\(--multi-selection-surface-fill\)[\s\S]*?box-shadow:\s*0 8px 24px var\(--multi-selection-depth\)[\s\S]*?pointer-events:\s*none/);
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
  assert.match(appSource, /function isSelectionFrameDragTarget\(pointer\)[\s\S]*?multiSelectionChrome\.getBoundingClientRect\(\)/);
  assert.match(appSource, /function beginSelectionFrameDrag\(event\)[\s\S]*?interactionSource:\s*"selection-frame"/);
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
