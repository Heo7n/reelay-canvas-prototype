const appShell = document.querySelector(".app-shell");
const topBar = document.querySelector(".top-bar");
const leftRail = document.querySelector(".left-rail");
const topActions = document.querySelector("#topActions");
const shell = document.querySelector("#canvasShell");
const appFavicon = document.querySelector("#appFavicon");
const canvasGrid = document.querySelector("#canvasGrid");
const stage = document.querySelector("#canvasStage");
const nodeLayer = document.querySelector("#nodeLayer");
const connectionLayer = document.querySelector("#connectionLayer");
const connectionPaths = document.querySelector("#connectionPaths");
const batchConnectionPreviewPaths = document.querySelector("#batchConnectionPreviewPaths");
const connectionPreview = document.querySelector("#connectionPreview");
const connectionPreviewEndpoint = document.querySelector("#connectionPreviewEndpoint");
const connectionTargetGlow = document.querySelector("#connectionTargetGlow");
const connectionCreateMenu = document.querySelector("#connectionCreateMenu");
const nodeCreateMenu = document.querySelector("#nodeCreateMenu");
const canvasTools = document.querySelector("#canvasTools");
const canvasToolButtons = document.querySelectorAll("[data-canvas-tool]");
const canvasToolPopovers = document.querySelectorAll("[data-canvas-popover]");
const minimapSurface = document.querySelector("#minimapSurface");
const zoomSlider = document.querySelector("#zoomSlider");
const zoomControl = document.querySelector(".canvas-zoom-control");
const zoomValueTip = document.querySelector("#zoomValueTip");
const projectNameEls = document.querySelectorAll("[data-project-name]");
const canvasNameEls = document.querySelectorAll("[data-canvas-name]");
const projectMenu = document.querySelector("#projectMenu");
const projectMenuSearch = document.querySelector("#projectMenuSearch");
const projectMenuList = document.querySelector("#projectMenuList");
const projectMenuEmpty = document.querySelector("#projectMenuEmpty");
const canvasMenu = document.querySelector("#canvasMenu");
const canvasMenuList = document.querySelector("#canvasMenuList");
const canvasMoreMenu = document.querySelector("#canvasMoreMenu");
const canvasHomeButtons = document.querySelectorAll("#canvasHomeBtn, [data-canvas-home-button]");
const railLibraryBtn = document.querySelector("#railLibraryBtn");
const railProfileBtn = document.querySelector("#railProfileBtn");
const profileAnchor = document.querySelector(".profile-anchor");
const shareProjectBtn = document.querySelector("#shareProjectBtn");
const profileMenu = document.querySelector("#profileMenu");
const profileHelpFlyout = profileMenu?.querySelector(".profile-help-flyout");
const profileHelpTrigger = profileHelpFlyout?.querySelector(".profile-help-trigger");
const profileShortcutTrigger = profileHelpFlyout?.querySelector("#profileShortcutTrigger");
const profileShortcutSheet = profileHelpFlyout?.querySelector("#profileShortcutSheet");
const assetLibraryPanel = document.querySelector("#assetLibraryPanel");
const assetLibraryCloseBtn = document.querySelector("#assetLibraryCloseBtn");
const assetLibraryGrid = document.querySelector("#assetLibraryGrid");
const assetLibraryCount = document.querySelector("#assetLibraryCount");
const assetLibrarySearchInput = document.querySelector("#assetLibrarySearchInput");
const assetLibraryPlatformCommandAnchor = document.querySelector("#assetLibraryPlatformCommandAnchor");
const assetLibrarySectionTabs = document.querySelector("#assetLibrarySectionTabs");
const assetLibraryMediaTab = document.querySelector("#assetLibraryMediaTab");
const assetLibraryEntityTab = document.querySelector("#assetLibraryEntityTab");
const assetLibrarySpaceButton = document.querySelector("#assetLibrarySpaceButton");
const assetLibrarySpaceLabel = document.querySelector("#assetLibrarySpaceLabel");
const assetLibrarySpaceMenu = document.querySelector("#assetLibrarySpaceMenu");
const assetLibraryDirectoryName = document.querySelector("#assetLibraryDirectoryName");
const assetLibraryDirectoryButton = document.querySelector("#assetLibraryDirectoryButton");
const assetLibraryDirectoryTreePopover = document.querySelector("#assetLibraryDirectoryTreePopover");
const assetLibraryCreateFolderBtn = document.querySelector("#assetLibraryCreateFolderBtn");
const assetLibraryCommandBar = document.querySelector("#assetLibraryCommandBar");
const assetLibraryOverlayLayer = document.querySelector("#assetLibraryOverlayLayer");
const assetLibraryUploadInput = document.querySelector("#assetLibraryUploadInput");
const assetLibraryResizeHandle = document.querySelector("#assetLibraryResizeHandle");
const entityUseDetailPortal = document.querySelector("#entityUseDetailPortal");
const entityUsePickerPortal = document.querySelector("#entityUsePickerPortal");
const assetLibraryPreviewDialog = document.querySelector("#assetLibraryPreviewDialog");
const assetLibraryPreviewTitle = document.querySelector("#assetLibraryPreviewTitle");
const assetLibraryPreviewKicker = document.querySelector("#assetLibraryPreviewKicker");
const assetLibraryPreviewBody = document.querySelector("#assetLibraryPreviewBody");
const assetLibraryPreviewMeta = document.querySelector("#assetLibraryPreviewMeta");
const assetLibraryPreviewUse = document.querySelector("#assetLibraryPreviewUse");
const canvasEntityEditorHost = document.querySelector("#canvasEntityEditorHost");
const canvasEntityPickerHost = document.querySelector("#canvasEntityPickerHost");
const canvasEntityEditorUploadInput = document.querySelector("#canvasEntityEditorUploadInput");
const themeModeIcon = document.querySelector("#themeModeIcon");
const themeInlineSwitch = document.querySelector("[data-theme-inline-switch]");
const themeCurrentLabel = document.querySelector("#themeCurrentLabel");
const profileCreditValue = document.querySelector("#profileCreditValue");
const profileAvatar = document.querySelector("#profileAvatar");
const profileName = document.querySelector("#profileName");
const profileEmail = document.querySelector("#profileEmail");
const profileOrganizationRole = document.querySelector("#profileOrganizationRole");
const emptyState = document.querySelector("#emptyState");
const emptyCreateMain = document.querySelector(".empty-create-main");
const emptyCreateSecondary = document.querySelector(".empty-create-secondary");
const localAssetInput = document.querySelector("#localAssetInput");
const selectionBox = document.querySelector("#selectionBox");
const groupResizeOverlay = document.querySelector("#groupResizeOverlay");
const multiSelectionSurface = document.querySelector("#multiSelectionSurface");
const multiSelectionChrome = document.querySelector("#multiSelectionChrome");
const multiSelectionPort = document.querySelector("#multiSelectionPort");
const selectionToolbar = document.querySelector("#selectionToolbar");
let projectMenuTrigger = null;
let canvasMenuTrigger = null;
let canvasMoreMenuTrigger = null;
let themeFeedbackTimer = null;
let selectionSurfaceRadiusWorld = 20;
const selectionDownloadMenu = document.querySelector("#selectionDownloadMenu");
const selectionDownloadTrigger = document.querySelector(".selection-download-trigger");
const agentDock = document.querySelector("#agentDock");
const agentLauncher = document.querySelector("#agentLauncher");
const agentPanel = document.querySelector("#agentPanel");
const agentResizeHandle = document.querySelector("#agentResizeHandle");
const agentTopResizeHandle = document.querySelector("#agentTopResizeHandle");
const agentBottomResizeHandle = document.querySelector("#agentBottomResizeHandle");
const agentCloseBtn = document.querySelector("#agentCloseBtn");
const agentNewChatBtn = document.querySelector("#agentNewChatBtn");
const agentHistoryBtn = document.querySelector("#agentHistoryBtn");
const agentHistoryMenu = document.querySelector("#agentHistoryMenu");
const agentHistoryList = document.querySelector("#agentHistoryList");
const agentHistorySearch = document.querySelector("#agentHistorySearch");
const agentConversationTitle = document.querySelector("#agentConversationTitle");
const agentMessages = document.querySelector("#agentMessages");
const agentComposer = document.querySelector("#agentComposer");
const agentInput = document.querySelector("#agentInput");
const agentSendButton = document.querySelector(".agent-send");
const agentAddBtn = document.querySelector("#agentAddBtn");
const agentPromptOptimizationBtn = document.querySelector("#agentPromptOptimizationBtn");
const agentAdvancedBtn = document.querySelector("#agentAdvancedBtn");
const agentAdvancedSettings = document.querySelector("#agentAdvancedSettings");
const agentAutoLinkBtn = document.querySelector("#agentAutoLinkBtn");
const agentModeBtn = document.querySelector("#agentModeBtn");
const agentModeMenu = document.querySelector("#agentModeMenu");
const agentModelBtn = document.querySelector("#agentModelBtn");
const agentModelMenu = document.querySelector("#agentModelMenu");
const agentParamSummary = document.querySelector("#agentParamSummary");
const agentCreditValue = document.querySelector("#agentCreditValue");
const canvasAccessStatus = document.querySelector("#canvasAccessStatus");
const systemThemeQuery = window.matchMedia("(prefers-color-scheme: light)");
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const narrowViewportQuery = window.matchMedia("(max-width: 480px)");
const narrowViewportInertState = new Map();
const entityUsePickerBackgroundInertState = new Map();
const homeLaunchIntentKey = "reelay-home-launch-intent";

function syncFaviconContrast() {
  if (!appFavicon) return;
  const source = new Image();
  source.onload = () => {
    const canvas = document.createElement("canvas");
    const size = 64;
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, size, size);
    context.beginPath();
    context.arc(size / 2, size / 2, 28, 0, Math.PI * 2);
    context.fillStyle = "#ffffff";
    context.fill();
    context.lineWidth = 4;
    context.strokeStyle = "#15171b";
    context.stroke();
    context.drawImage(source, 10, 10, 44, 44);
    try {
      appFavicon.href = canvas.toDataURL("image/png");
    } catch {
      appFavicon.href = "./assets/reelay-logo.png";
    }
  };
  source.src = "./assets/reelay-logo.png";
}

const models = window.REELAY_MODEL_CATALOG || [];
const prototypeConfig = window.REELAY_PROTOTYPE_CONFIG || {};
const {
  imageResolutionCost = {},
  imageQualityMultiplier = {},
  videoQualityCost = {},
  simulationAssets = {},
  assetLibrarySeed = {},
  mediaToolDefinitions = {},
  mediaToolsByType = { image: [], video: [], audio: [] },
  defaultMediaToolPreferences = { image: { tools: [], showLabels: true }, video: { tools: [], showLabels: true }, audio: { tools: [], showLabels: true } },
  generationWorkflows = { image: [], video: [] },
  agentConversations: seedAgentConversations = [{ id: "new", title: "新对话", messages: [] }],
  layoutRules = {},
  canvasScaleLimits = { min: 0.2, max: 2 },
  groupFrameRules = {},
} = prototypeConfig;
const generatorModelPolicy = window.REELAY_CANVAS_GENERATOR_MODEL_POLICY;
if (!generatorModelPolicy) throw new Error("Canvas generator model policy is unavailable.");
const canvasPopoverPlacement = window.REELAY_CANVAS_POPOVER_PLACEMENT;
if (!canvasPopoverPlacement) throw new Error("Canvas popover placement helper is unavailable.");
const agentConversations = structuredClone(seedAgentConversations);

function loadMediaToolPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem("reelay-media-tools") || "null");
    if (saved && typeof saved === "object") {
      return Object.fromEntries(
        Object.entries(defaultMediaToolPreferences).map(([type, fallback]) => {
          const candidate = saved[type];
          const validTools = Array.isArray(candidate?.tools)
            ? candidate.tools.filter((tool) => mediaToolsByType[type].includes(tool))
            : fallback.tools;
          return [
            type,
            {
              tools: validTools.length ? validTools : fallback.tools,
              showLabels: candidate?.showLabels !== false,
            },
          ];
        }),
      );
    }
  } catch {
    // Invalid customization state falls back to the curated defaults.
  }
  return structuredClone(defaultMediaToolPreferences);
}

function normalizeThemeMode(mode) {
  if (mode === "light" || mode === "dark") return mode;
  if (mode === "system") return systemThemeQuery.matches ? "light" : "dark";
  return "light";
}

function loadThemeMode() {
  try {
    const savedMode = localStorage.getItem("reelay-theme-mode");
    return normalizeThemeMode(savedMode);
  } catch {
    return "light";
  }
}

const state = {
  selectedIds: new Set(),
  activeGroupId: null,
  activeId: null,
  activeConnectionId: null,
  connectionFeedbacks: new Map(),
  connectionDrop: null,
  lastPreset: {
    mode: "image",
    model: firstModelId("image"),
    aspect: "16:9",
    resolution: "2K",
    quality: "480p",
    duration: "4s",
    outputFormat: "",
    count: 1,
    workflow: "",
    omniReferenceTaskType: "",
    audioEnabled: false,
  },
  action: null,
  pendingUploadNodeId: null,
  pendingCanvasUploadPoint: null,
  nodeCreatePoint: null,
  isSpaceDown: false,
  generationTasks: new Map(),
  promptOptimizationTasks: new Map(),
  agentOpen: false,
  agentWidth: 560,
  agentTopInset: 0,
  agentBottomInset: 0,
  zoomTipTimer: 0,
  projectId: crypto.randomUUID(),
  projectName: "Untitled",
  projects: [],
  projectSearch: "",
  canvasMoreTargetId: null,
  activeConversationId: "new",
  agentComposerMode: "video",
  agentAdvancedSettingsExpanded: false,
  agentAutoLinkEnabled: true,
  agentPromptOptimizationTask: null,
  agentModelId: "seedance-2",
  agentModelIds: ["seedance-2"],
  agentModelTab: "video",
  agentModelAuto: false,
  account: {
    credits: 3000,
    consumedCredits: 0,
  },
  identity: {
    account: "",
    displayName: "Reelay 用户",
    workspaceName: "组织空间",
    workspaceRole: "member",
  },
  hostCapabilities: {
    hostWritable: false,
    accountSections: false,
    projectSwitcher: false,
    assetPersistence: false,
    entityPersistence: false,
  },
  mediaToolPreferences: loadMediaToolPreferences(),
  mediaToolbarNodeId: null,
  librarySection: "media",
  librarySearch: "",
  libraryFilter: "all",
  librarySpace: "personal",
  libraryFolderId: null,
  libraryDirectoryMenuOpen: false,
  libraryDirectoryRootExpanded: true,
  libraryExpandedFolderIds: new Set(),
  libraryTargetNodeId: null,
  libraryDisplay: "grid",
  librarySelectionMode: false,
  librarySelectedIds: new Set(),
  libraryMenuTarget: null,
  libraryToolbarMenu: null,
  libraryRenameTarget: null,
  libraryMoveItems: [],
  libraryMoveFolderId: null,
  libraryPreviewTarget: null,
  entityUseDetailId: null,
  entityUseDetailPinned: false,
  entityUseDetailAnchorId: null,
  entityUseDetailOpenTimer: 0,
  entityUseDetailCloseTimer: 0,
  entityUsePickerTargetNodeId: null,
  entityUsePickerSpace: "personal",
  entityUsePickerQuery: "",
  entityUsePickerSelectedIds: new Set(),
  entityUsePickerSelectedSpaces: new Map(),
  entityUsePickerComposing: false,
  entityUsePickerSelectionStart: null,
  entityUsePickerSelectionEnd: null,
  entityUsePickerReturnFocus: null,
  librarySearchByContext: {},
  libraryFilterByContext: {},
  assetLibraryPreferredWidth: 550,
  assetLibraryWidth: 550,
  themeMode: loadThemeMode(),
  canvasPanel: null,
  overlaySyncTimer: null,
  nodePopoverFrame: 0,
  groupChromeFrame: 0,
};

const canvasDocumentCodec = window.REELAY_CANVAS_DOCUMENT_CODEC;
if (!canvasDocumentCodec) throw new Error("Canvas document codec is unavailable.");
const canvasRuntimeStoreFactory = window.REELAY_CANVAS_RUNTIME_STORE;
if (!canvasRuntimeStoreFactory) throw new Error("Canvas runtime store is unavailable.");
const canvasRuntimeStore = canvasRuntimeStoreFactory.createCanvasRuntimeStore({
  onMutation: () => scheduleCanvasDocumentSave(0),
});
canvasRuntimeStore.attachStateFacade(state);
const canvasPersistenceCoordinatorFactory = window.REELAY_CANVAS_PERSISTENCE_COORDINATOR;
if (!canvasPersistenceCoordinatorFactory) throw new Error("Canvas persistence coordinator is unavailable.");
const canvasConnections = window.REELAY_CANVAS_CONNECTIONS;
if (!canvasConnections) throw new Error("Canvas connection helpers are unavailable.");
const canvasCommandExecutorFactory = window.REELAY_CANVAS_COMMAND_EXECUTOR;
if (!canvasCommandExecutorFactory) throw new Error("Canvas command executor is unavailable.");
const canvasCommandExecutor = canvasCommandExecutorFactory.createCanvasCommandExecutor({
  getCanvas: (canvasId) => canvasRuntimeStore.getCanvas(canvasId),
  normalize(collection, records, context) {
    if (collection !== "connections") return records;
    return canvasConnections.normalizeConnections(records, context.canvas.nodes);
  },
  validateTransition({ command }) {
    const unsupported = command.changes.find((change) => change.collection !== "connections");
    return unsupported
      ? {
        code: "unsupported-content-command",
        message: `Canvas command collection ${unsupported.collection} has no field-level transition contract yet.`,
      }
      : null;
  },
  undoLimit: 50,
  onCommit: () => scheduleCanvasDocumentSave(),
});
const canvasConnectionInteraction = window.REELAY_CANVAS_CONNECTION_INTERACTION;
if (!canvasConnectionInteraction) throw new Error("Canvas connection interaction helpers are unavailable.");
const canvasNodeInteraction = window.REELAY_CANVAS_NODE_INTERACTION;
if (!canvasNodeInteraction) throw new Error("Canvas node interaction helpers are unavailable.");
const canvasNodePlacement = window.REELAY_CANVAS_NODE_PLACEMENT;
if (!canvasNodePlacement) throw new Error("Canvas node placement helpers are unavailable.");
const canvasNodeLayoutTransitionFactory = window.REELAY_CANVAS_NODE_LAYOUT_TRANSITION;
if (!canvasNodeLayoutTransitionFactory) throw new Error("Canvas node layout transition helper is unavailable.");
const canvasSpatialSelection = window.REELAY_CANVAS_SPATIAL_SELECTION;
if (!canvasSpatialSelection) throw new Error("Canvas spatial selection helpers are unavailable.");
const canvasNodePointerControllerFactory = window.REELAY_CANVAS_NODE_POINTER_CONTROLLER;
if (!canvasNodePointerControllerFactory) throw new Error("Canvas node pointer controller is unavailable.");
const canvasNodeDragControllerFactory = window.REELAY_CANVAS_NODE_DRAG_CONTROLLER;
if (!canvasNodeDragControllerFactory) throw new Error("Canvas node drag controller is unavailable.");
const canvasGroupInteractionControllerFactory = window.REELAY_CANVAS_GROUP_INTERACTION_CONTROLLER;
if (!canvasGroupInteractionControllerFactory) throw new Error("Canvas group interaction controller is unavailable.");
const canvasPointerInteractionControllerFactory = window.REELAY_CANVAS_POINTER_INTERACTION_CONTROLLER;
if (!canvasPointerInteractionControllerFactory) throw new Error("Canvas pointer interaction controller is unavailable.");
const canvasPointerDispatchControllerFactory = window.REELAY_CANVAS_POINTER_DISPATCH_CONTROLLER;
if (!canvasPointerDispatchControllerFactory) throw new Error("Canvas pointer dispatch controller is unavailable.");
const canvasAgentPanelGeometry = window.REELAY_CANVAS_AGENT_PANEL_GEOMETRY;
if (!canvasAgentPanelGeometry) throw new Error("Canvas Agent panel geometry is unavailable.");
const canvasConnectionRendererFactory = window.REELAY_CANVAS_CONNECTION_RENDERER;
if (!canvasConnectionRendererFactory) throw new Error("Canvas connection renderer is unavailable.");
const canvasConnectionFeedbackControllerFactory = window.REELAY_CANVAS_CONNECTION_FEEDBACK_CONTROLLER;
if (!canvasConnectionFeedbackControllerFactory) throw new Error("Canvas connection feedback controller is unavailable.");
const canvasConnectionFeedbackMotion = window.REELAY_CANVAS_CONNECTION_FEEDBACK_MOTION;
if (!canvasConnectionFeedbackMotion) throw new Error("Canvas connection feedback motion is unavailable.");
const canvasLayerReconcilerFactory = window.REELAY_CANVAS_LAYER_RECONCILER;
if (!canvasLayerReconcilerFactory) throw new Error("Canvas layer reconciler is unavailable.");
const canvasAssetLibraryModel = window.REELAY_CANVAS_ASSET_LIBRARY_MODEL;
if (!canvasAssetLibraryModel) throw new Error("Canvas asset library model is unavailable.");
const canvasAssetLibraryView = window.REELAY_CANVAS_ASSET_LIBRARY_VIEW;
if (!canvasAssetLibraryView) throw new Error("Canvas asset library view is unavailable.");
const runtimeAssetLibrarySeed = window.parent === window
  ? assetLibrarySeed
  : {
      ...assetLibrarySeed,
      folders: Array.from(assetLibrarySeed.folders || []).filter((folder) => folder?.space !== "personal"),
      placements: Array.from(assetLibrarySeed.placements || []).filter((placement) => placement?.space !== "personal"),
    };
const assetLibraryStore = canvasAssetLibraryModel.createAssetLibraryStore(runtimeAssetLibrarySeed);
const hostPersonalMediaIds = new Set();
const canvasMediaToolbarView = window.REELAY_CANVAS_MEDIA_TOOLBAR_VIEW;
if (!canvasMediaToolbarView) throw new Error("Canvas media toolbar view is unavailable.");
const canvasNodeLayoutTransition = canvasNodeLayoutTransitionFactory.createNodeLayoutTransitionController({
  now: () => performance.now(),
  requestFrame: (callback) => window.requestAnimationFrame(callback),
  cancelFrame: (frameId) => window.cancelAnimationFrame(frameId),
  shouldReduceMotion: () => reducedMotionQuery.matches,
  onFrame: renderNodeLayoutTransitionFrame,
  onFinish: renderNodeLayoutTransitionFrame,
});
let canvasAccessNoticeTimer = 0;
const canvasInstanceId = crypto.randomUUID();
const canvasPersistence = canvasPersistenceCoordinatorFactory.createCanvasPersistenceCoordinator({
  instanceId: canvasInstanceId,
  serialize: serializeCanvasDocumentSnapshot,
  hydrate: hydrateCanvasDocumentSnapshot,
  makeRequestId: () => crypto.randomUUID(),
  postMessage: (message) => window.parent.postMessage(message, window.location.origin),
  setTimer: (callback, delay) => window.setTimeout(callback, delay),
  clearTimer: (timerId) => window.clearTimeout(timerId),
  isHosted: () => window.parent !== window,
  getExpectedOrigin: () => window.location.origin,
  getExpectedSource: () => window.parent,
  onAccessChange: applyCanvasAccessMode,
  onContext(context) {
    state.projectId = String(context.projectId || state.projectId);
    state.projectName = String(context.projectName || state.projectName);
    state.hostCapabilities.hostWritable = context.writable === true;
    state.hostCapabilities.accountSections = context.capabilities?.accountSections === true;
    state.hostCapabilities.projectSwitcher = context.capabilities?.projectSwitcher === true;
    state.hostCapabilities.assetPersistence = context.capabilities?.assetPersistence === true;
    state.hostCapabilities.entityPersistence = context.capabilities?.entityPersistence === true;
    state.projects = normalizeProjectOptions(context.projects);
    state.projectSearch = "";
    if (projectMenuSearch) projectMenuSearch.value = "";
    syncHostedIdentity(context);
    applyCanvasAccessMode("loading");
    syncProjectNavigation();
    renderProjectMenu();
  },
  onDocumentReady({ writable }) {
    state.hostCapabilities.hostWritable = writable === true;
    if (writable) {
      consumeHomeLaunchIntent();
    } else {
      showActionToast("当前项目为只读，可浏览但不能修改");
    }
  },
  onNotice(notice) {
    const messages = {
      "unsupported-document": "此画布数据版本暂不支持，已停止自动保存",
      conflict: "画布已在其他窗口更新，请重新进入项目后继续",
      forbidden: "当前项目为只读，可浏览但不能修改",
      missing: "项目已删除或无法访问，当前画布已停止保存",
      network: "画布暂时保存失败，正在等待重试",
    };
    showActionToast(messages[notice] || "画布状态已更新");
  },
});
const canvasMediaAssetCoordinatorFactory = window.REELAY_CANVAS_MEDIA_ASSET_COORDINATOR;
if (!canvasMediaAssetCoordinatorFactory) throw new Error("Canvas media asset coordinator is unavailable.");
const canvasMediaAssets = canvasMediaAssetCoordinatorFactory.createCanvasMediaAssetCoordinator({
  instanceId: canvasInstanceId,
  makeRequestId: () => crypto.randomUUID(),
  postMessage: (message) => window.parent.postMessage(message, window.location.origin),
  checksumFile: async (file) => {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  },
  uploadFile: async ({ url, method, headers, file }) => {
    const response = await fetch(url, { method, headers, body: file, credentials: "include" });
    if (!response.ok) throw new Error(`媒体上传失败（${response.status}）`);
  },
  getBaseUrl: () => window.location.href,
  setTimer: (callback, delay) => window.setTimeout(callback, delay),
  clearTimer: (timerId) => window.clearTimeout(timerId),
  isHosted: () => window.parent !== window,
  getExpectedOrigin: () => window.location.origin,
  getExpectedSource: () => window.parent,
});
const canvasEntityAssetCoordinatorFactory = window.REELAY_CANVAS_ENTITY_ASSET_COORDINATOR;
if (!canvasEntityAssetCoordinatorFactory) throw new Error("Canvas Entity asset coordinator is unavailable.");
const canvasEntityAssets = canvasEntityAssetCoordinatorFactory.createCanvasEntityAssetCoordinator({
  instanceId: canvasInstanceId,
  makeRequestId: () => crypto.randomUUID(),
  postMessage: (message) => window.parent.postMessage(message, window.location.origin),
  setTimer: (callback, delay) => window.setTimeout(callback, delay),
  clearTimer: (timerId) => window.clearTimeout(timerId),
  isHosted: () => window.parent !== window,
  getExpectedOrigin: () => window.location.origin,
  getExpectedSource: () => window.parent,
  onCatalog: registerHostWorkspaceAssetCatalog,
});
const canvasEntityEditorModel = window.REELAY_CANVAS_ENTITY_EDITOR_MODEL;
const canvasEntityEditorView = window.REELAY_CANVAS_ENTITY_EDITOR_VIEW;
const canvasEntityEditorControllerFactory = window.REELAY_CANVAS_ENTITY_EDITOR_CONTROLLER;
if (!canvasEntityEditorModel || !canvasEntityEditorView || !canvasEntityEditorControllerFactory) {
  throw new Error("Canvas Entity editor dependencies are unavailable.");
}
const canvasEntityUseModel = window.REELAY_CANVAS_ENTITY_USE_MODEL;
const canvasEntityUseView = window.REELAY_CANVAS_ENTITY_USE_VIEW;
if (!canvasEntityUseModel || !canvasEntityUseView) {
  throw new Error("Canvas Entity use dependencies are unavailable.");
}
let reopenAssetLibraryAfterEntityEditor = false;
const canvasEntityEditor = canvasEntityEditorControllerFactory.createCanvasEntityEditorController({
  host: canvasEntityEditorHost,
  pickerHost: canvasEntityPickerHost,
  uploadInput: canvasEntityEditorUploadInput,
  model: canvasEntityEditorModel,
  view: canvasEntityEditorView,
  getAvailableMedia: () => assetLibraryStore
    .listItems({ space: "personal", kind: "media" })
    .filter((media) => window.parent === window || hostPersonalMediaIds.has(media.id)),
  persistFiles: persistEntityEditorFiles,
  renameMedia: async ({ mediaId, displayName }) => {
    if (window.parent === window) {
      return assetLibraryStore.renameItem({
        item: { kind: "media", id: mediaId },
        name: displayName,
        space: "personal",
      });
    }
    if (!canPersistLibraryMedia()) throw new Error("当前项目尚未接入素材持久化");
    const workspaceAsset = await canvasMediaAssets.renameMedia(mediaId, displayName);
    const updated = assetLibraryStore.syncPersistedMedia(workspaceAssetToLibraryMedia(workspaceAsset));
    renderAssetLibrary();
    return updated;
  },
  saveEntity: saveEntityEditorDraft,
  confirmDiscard: confirmEntityEditorDiscard,
  onVisibilityChange: setEntityEditorOpen,
  onSaved(entity) {
    if (window.parent !== window) syncHostEntity(entity);
    reopenAssetLibraryAfterEntityEditor = true;
    state.librarySpace = "personal";
    state.librarySection = "entity";
    state.libraryFolderId = null;
    state.librarySearch = "";
    state.libraryFilter = "all";
    showActionToast("主体已保存");
  },
  onError(error) {
    showActionToast(error?.message || "主体保存失败");
  },
  refreshIcons,
});
const canvasConnectionRenderer = canvasConnectionRendererFactory.createConnectionRenderer({
  paths: connectionPaths,
  batchPreviewPaths: batchConnectionPreviewPaths,
  preview: connectionPreview,
  previewEndpoint: connectionPreviewEndpoint,
  onSelect(connectionId) {
    setSelection([], null, { keepConnection: true });
    state.activeConnectionId = connectionId;
    render();
  },
  onRemove: removeConnection,
});
if (!canvasConnectionRenderer) throw new Error("Canvas connection renderer could not initialize.");
const canvasConnectionFeedback = canvasConnectionFeedbackControllerFactory.createConnectionFeedbackController({
  records: state.connectionFeedbacks,
  now: () => performance.now(),
  setTimer: (callback, delay) => window.setTimeout(callback, delay),
  clearTimer: (timerId) => window.clearTimeout(timerId),
  onChange: renderConnections,
});
reducedMotionQuery.addEventListener?.("change", (event) => {
  if (event.matches) canvasConnectionFeedback.clear();
});
const canvasLayerReconciler = canvasLayerReconcilerFactory.createLayerReconciler({
  layer: nodeLayer,
  groups: {
    getId: (group) => group.id,
    getSignature: getGroupRenderSignature,
    createElement: createGroupFrameElement,
    syncElement: syncGroupFrameElement,
  },
  nodes: {
    getId: (node) => node.id,
    getSignature: getNodeRenderSignature,
    createElement: createNodeElement,
    syncElement: syncCanvasNodeElement,
    prepareItem(node) {
      if (node.kind !== "generator") return;
      normalizeNodeParameters(node);
      node.credits = getCost(node) ?? 0;
    },
  },
});
if (!canvasLayerReconciler) throw new Error("Canvas layer reconciler could not initialize.");

function isCanvasMutationAllowed() {
  return canvasPersistence.canMutate();
}

function syncCanvasAccessUi() {
  const mode = canvasPersistence.getAccessMode();
  appShell?.setAttribute("data-canvas-access", mode);
  const locked = !isCanvasMutationAllowed();
  document.querySelectorAll("[data-canvas-mutation]").forEach((control) => {
    if (!(control instanceof HTMLButtonElement || control instanceof HTMLInputElement)) return;
    if (locked) {
      if (!control.disabled) control.dataset.accessDisabled = "true";
      control.disabled = true;
      control.setAttribute("aria-disabled", "true");
    } else if (control.dataset.accessDisabled === "true") {
      control.disabled = false;
      control.removeAttribute("aria-disabled");
      delete control.dataset.accessDisabled;
    }
  });
  nodeLayer.querySelectorAll("[data-node-prompt-input]").forEach((input) => {
    if (!(input instanceof HTMLTextAreaElement)) return;
    input.readOnly = locked;
    input.setAttribute("aria-readonly", String(locked));
  });
  if (emptyCreateMain) {
    const readonly = mode === "readonly";
    emptyCreateMain.textContent = readonly ? "画布暂无内容" : "双击画布";
    if (emptyCreateSecondary) {
      emptyCreateSecondary.textContent = readonly ? "" : "开始自由创作";
    }
  }
  if (!canvasAccessStatus) return;
  const labels = {
    loading: "正在加载项目画布",
    readonly: "只读 · 可浏览和下载，不能编辑",
    blocked: "画布已锁定 · 请重新加载后继续",
  };
  const label = labels[mode];
  canvasAccessStatus.hidden = !label;
  canvasAccessStatus.textContent = label || "";
}

function applyCanvasAccessMode(mode) {
  if (!isCanvasMutationAllowed()) {
    state.action = null;
    shell?.classList.remove("dragging");
  }
  syncCanvasAccessUi();
  if (state.entityUsePickerTargetNodeId) renderEntityUsePicker();
  if (state.entityUseDetailId) renderEntityUseDetail();
}

function syncHostedIdentity(context) {
  const displayName = String(context?.actor?.displayName || "Reelay 用户").trim() || "Reelay 用户";
  const account = String(context?.actor?.account || "").trim();
  const workspaceName = String(context?.workspace?.name || "组织空间").trim() || "组织空间";
  const workspaceRole = ["owner", "admin", "member"].includes(context?.workspace?.role)
    ? context.workspace.role
    : "member";
  const roleLabels = { owner: "主账户", admin: "管理员", member: "成员" };
  const initial = Array.from(displayName)[0]?.toUpperCase() || "R";

  state.identity = { account, displayName, workspaceName, workspaceRole };
  railProfileBtn?.setAttribute("data-initial", initial);
  railProfileBtn?.setAttribute("aria-label", `个人：${displayName}`);
  if (profileAvatar) profileAvatar.textContent = initial;
  if (profileName) profileName.textContent = displayName;
  if (profileEmail) profileEmail.textContent = account || "演示画布";
  if (profileOrganizationRole) profileOrganizationRole.textContent = roleLabels[workspaceRole];
}

function requireCanvasMutation({ notify = true } = {}) {
  if (isCanvasMutationAllowed()) return true;
  if (!notify || canvasAccessNoticeTimer) return false;
  const messages = {
    loading: "项目画布仍在加载，暂时不能编辑",
    readonly: "当前为只读项目，可浏览但不能修改",
    blocked: "画布当前不可编辑，请重新加载后继续",
  };
  showActionToast(messages[canvasPersistence.getAccessMode()] || "当前画布不可编辑");
  canvasAccessNoticeTimer = window.setTimeout(() => {
    canvasAccessNoticeTimer = 0;
  }, 1200);
  return false;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

const panelWidthRules = Object.freeze({
  edgeInset: 8,
  assetMin: 380,
  assetMax: 780,
  agentMin: 340,
  agentMax: 640,
  canvasCorridor: 280,
});

const agentPanelHeightRules = Object.freeze({
  minHeight: 420,
  keyboardStep: 16,
  coarseKeyboardStep: 64,
});

function isAssetLibraryOpen() {
  return Boolean(assetLibraryPanel && !assetLibraryPanel.classList.contains("hidden"));
}

function canShowAssetAndAgent() {
  return window.innerWidth >= panelWidthRules.assetMin
    + panelWidthRules.agentMin
    + panelWidthRules.canvasCorridor
    + panelWidthRules.edgeInset * 2;
}

function clampPanelWidth(width, minWidth, maxWidth) {
  const safeMax = Math.max(0, maxWidth);
  return clamp(width, Math.min(minWidth, safeMax), safeMax);
}

function getAssetLibraryWidthBounds() {
  const viewportMax = Math.max(0, Math.min(panelWidthRules.assetMax, window.innerWidth - panelWidthRules.edgeInset * 2));
  const opposingWidth = state.agentOpen ? state.agentWidth : 0;
  const coupledMax = state.agentOpen && isAssetLibraryOpen()
    ? Math.min(viewportMax, window.innerWidth - panelWidthRules.edgeInset * 2 - panelWidthRules.canvasCorridor - opposingWidth)
    : viewportMax;
  const max = Math.max(0, coupledMax);
  return {
    min: Math.min(panelWidthRules.assetMin, max),
    max,
  };
}

function syncAssetLibraryResizeSemantics(bounds = getAssetLibraryWidthBounds()) {
  if (!assetLibraryResizeHandle) return;
  const width = Math.round(state.assetLibraryWidth);
  assetLibraryResizeHandle.setAttribute("aria-valuemin", String(Math.round(bounds.min)));
  assetLibraryResizeHandle.setAttribute("aria-valuemax", String(Math.round(bounds.max)));
  assetLibraryResizeHandle.setAttribute("aria-valuenow", String(width));
  assetLibraryResizeHandle.setAttribute("aria-valuetext", `资产库宽度 ${width} 像素`);
}

function applyAssetLibraryWidth(width) {
  state.assetLibraryWidth = width;
  appShell?.style.setProperty("--asset-panel-width", `${Math.round(width)}px`);
  syncAssetLibraryResizeSemantics();
}

function applyAgentWidth(width) {
  state.agentWidth = width;
  agentDock?.style.setProperty("--agent-width", `${width}px`);
  appShell?.style.setProperty("--agent-width", `${width}px`);
  syncAssetLibraryResizeSemantics();
}

function getAgentVerticalGeometry({
  top = state.agentTopInset,
  bottom = state.agentBottomInset,
  preferredEdge = "top",
} = {}) {
  return canvasAgentPanelGeometry.normalizeInsets({
    top,
    bottom,
    viewportHeight: window.innerHeight,
    minHeight: agentPanelHeightRules.minHeight,
    preferredEdge,
  });
}

function syncAgentVerticalResizeSemantics(geometry = getAgentVerticalGeometry()) {
  const availableInset = Math.max(0, window.innerHeight - agentPanelHeightRules.minHeight);
  const topMax = Math.max(0, availableInset - geometry.bottom);
  const bottomMax = Math.max(0, availableInset - geometry.top);
  const syncHandle = (handle, edge, value, max) => {
    if (!handle) return;
    const roundedValue = Math.round(value);
    handle.setAttribute("aria-valuemin", "0");
    handle.setAttribute("aria-valuemax", String(Math.round(max)));
    handle.setAttribute("aria-valuenow", String(roundedValue));
    handle.setAttribute(
      "aria-valuetext",
      roundedValue === 0 ? `Agent ${edge}贴合屏幕` : `Agent ${edge}内缩 ${roundedValue} 像素`,
    );
  };
  syncHandle(agentTopResizeHandle, "顶部", geometry.top, topMax);
  syncHandle(agentBottomResizeHandle, "底部", geometry.bottom, bottomMax);
}

function applyAgentVerticalGeometry(geometry) {
  state.agentTopInset = geometry.top;
  state.agentBottomInset = geometry.bottom;
  agentDock?.style.setProperty("--agent-top-inset", `${Math.round(geometry.top)}px`);
  agentDock?.style.setProperty("--agent-bottom-inset", `${Math.round(geometry.bottom)}px`);
  agentDock?.classList.toggle("is-inset-top", geometry.top > 0.5);
  agentDock?.classList.toggle("is-inset-bottom", geometry.bottom > 0.5);
  syncAgentVerticalResizeSemantics(geometry);
  scheduleNodePopoverLayouts();
}

function setAgentTopInset(top) {
  applyAgentVerticalGeometry(getAgentVerticalGeometry({ top, preferredEdge: "top" }));
}

function setAgentBottomInset(bottom) {
  applyAgentVerticalGeometry(getAgentVerticalGeometry({ bottom, preferredEdge: "bottom" }));
}

function reconcileAgentVerticalInsets(preferredEdge = "top") {
  applyAgentVerticalGeometry(getAgentVerticalGeometry({ preferredEdge }));
}

function reconcileDualPanelWidths(preferredPanel) {
  if (!state.agentOpen || !isAssetLibraryOpen() || !canShowAssetAndAgent()) return;
  const capacity = window.innerWidth - panelWidthRules.edgeInset * 2 - panelWidthRules.canvasCorridor;
  let nextAssetWidth;
  let nextAgentWidth;
  if (preferredPanel === "asset") {
    nextAssetWidth = clampPanelWidth(
      state.assetLibraryPreferredWidth,
      panelWidthRules.assetMin,
      Math.min(panelWidthRules.assetMax, capacity - panelWidthRules.agentMin),
    );
    nextAgentWidth = clampPanelWidth(
      state.agentWidth,
      panelWidthRules.agentMin,
      Math.min(panelWidthRules.agentMax, capacity - nextAssetWidth),
    );
  } else {
    nextAgentWidth = clampPanelWidth(
      state.agentWidth,
      panelWidthRules.agentMin,
      Math.min(panelWidthRules.agentMax, capacity - panelWidthRules.assetMin),
    );
    nextAssetWidth = clampPanelWidth(
      state.assetLibraryPreferredWidth,
      panelWidthRules.assetMin,
      Math.min(panelWidthRules.assetMax, capacity - nextAgentWidth),
    );
  }
  applyAgentWidth(nextAgentWidth);
  applyAssetLibraryWidth(nextAssetWidth);
}

function setAssetLibraryWidth(width, { remember = true } = {}) {
  const preferredWidth = clamp(width, panelWidthRules.assetMin, panelWidthRules.assetMax);
  if (remember) state.assetLibraryPreferredWidth = preferredWidth;
  const bounds = getAssetLibraryWidthBounds();
  applyAssetLibraryWidth(clampPanelWidth(preferredWidth, bounds.min, bounds.max));
  renderSelectionToolbar();
  renderMinimap();
  scheduleNodePopoverLayouts();
}

function finishAssetLibraryResize() {
  assetLibraryPanel?.classList.remove("resizing");
  syncPromptPanelLayouts();
}

function firstModelId(type) {
  return models.find((item) => item.type === type)?.id || "";
}

function normalizeGeneratorMode(mode) {
  return mode === "image" || mode === "video" ? mode : null;
}

function canUseModelForNode(node, model) {
  return generatorModelPolicy.canUseModel(models, node, model);
}

function getNodeGenerationMode(node) {
  return generatorModelPolicy.getNodeModeContract(node);
}

function getCompatibleModelsForNode(node) {
  return generatorModelPolicy.getCompatibleModels(models, node);
}

function createCanvasRecord(name = `画布 ${state.canvases.length + 1}`) {
  return {
    id: crypto.randomUUID(),
    name,
    nodes: [],
    connections: [],
    groups: [],
    tx: 0,
    ty: 0,
    scale: 1,
    zCounter: 1,
    undoStack: [],
  };
}

function getActiveCanvas() {
  return canvasRuntimeStore.getActiveCanvas();
}

function resetActiveCanvasSession(canvas) {
  if (!canvas) return;
  clearRecentConnectionFeedback();
  canvas.connections = canvasConnections.normalizeConnections(canvas.connections, canvas.nodes);
  state.selectedIds = new Set();
  state.activeId = null;
  state.activeConnectionId = null;
  state.connectionDrop = null;
  state.activeGroupId = null;
  state.mediaToolbarNodeId = null;
  state.libraryTargetNodeId = null;
  closeCanvasPanel();
  closeMediaToolbarState();
  applyTransform();
  render();
}

function syncProjectNavigation() {
  const canvas = getActiveCanvas();
  projectNameEls.forEach((element) => {
    if (element.textContent !== state.projectName) element.textContent = state.projectName;
    element.setAttribute("aria-label", `项目名称 ${state.projectName}，按 Enter 重命名`);
  });
  canvasNameEls.forEach((element) => {
    const nextName = canvas?.name || "画布 1";
    if (element.textContent !== nextName) element.textContent = nextName;
  });
  document.title = `${state.projectName} · Reelay Canvas`;
}

function normalizeProjectOptions(projects) {
  const normalized = Array.isArray(projects)
    ? projects
      .filter((project) => project && typeof project.id === "string" && typeof project.name === "string")
      .map((project) => ({
        id: project.id,
        name: project.name.trim() || "未命名项目",
        coverUrl: typeof project.coverUrl === "string" && project.coverUrl ? project.coverUrl : null,
      }))
    : [];
  if (normalized.some((project) => project.id === state.projectId)) return normalized;
  return [{ id: state.projectId, name: state.projectName, coverUrl: null }, ...normalized];
}

function getProjectMenuOptions() {
  return state.projects.length
    ? state.projects
    : [{ id: state.projectId, name: state.projectName, coverUrl: null }];
}

function getProjectMenuSeed(projectId) {
  return [...String(projectId)].reduce((total, character) => total + character.codePointAt(0), 0) % 4;
}

function renderProjectMenu() {
  if (!projectMenuList) return;
  const query = state.projectSearch.trim().toLocaleLowerCase("zh-CN");
  const projects = getProjectMenuOptions().filter(
    (project) => !query || project.name.toLocaleLowerCase("zh-CN").includes(query),
  );
  projectMenuList.innerHTML = projects
    .map((project) => {
      const active = project.id === state.projectId;
      const thumbnail = project.coverUrl
        ? `<img class="project-menu-thumbnail" src="${escapeHtml(project.coverUrl)}" alt="" />`
        : `<span class="project-menu-thumbnail project-menu-thumbnail-placeholder" data-project-seed="${getProjectMenuSeed(project.id)}" aria-hidden="true"><i data-lucide="panels-top-left"></i></span>`;
      return `
        <button class="project-menu-option${active ? " active" : ""}" type="button" data-project-id="${escapeHtml(project.id)}"${active ? ' aria-current="page"' : ""}>
          ${thumbnail}
          <span class="project-menu-option-name" title="${escapeHtml(project.name)}">${escapeHtml(project.name)}</span>
          <span class="project-menu-check" aria-hidden="true">${active ? '<i data-lucide="check"></i>' : ""}</span>
        </button>
      `;
    })
    .join("");
  if (projectMenuEmpty) projectMenuEmpty.hidden = projects.length > 0;
  refreshIcons();
}

function initializeCanvases() {
  const initialCanvas = createCanvasRecord("画布 1");
  canvasRuntimeStore.replaceCanvases([initialCanvas], initialCanvas.id);
  syncProjectNavigation();
}

function createCanvasDocumentSnapshot() {
  return canvasDocumentCodec.createSnapshot(state);
}

function serializeCanvasDocumentSnapshot() {
  return JSON.stringify(createCanvasDocumentSnapshot());
}

function hydrateCanvasDocumentSnapshot(content) {
  const restored = canvasDocumentCodec.restoreSnapshot(content, {
    minScale: canvasScaleLimits.min,
    maxScale: canvasScaleLimits.max,
  });
  if (!restored) return false;
  canvasRuntimeStore.replaceCanvases(restored.canvases, restored.activeCanvasId);
  state.canvases.forEach((canvas) => {
    canvas.connections = canvasConnections.normalizeConnections(canvas.connections, canvas.nodes);
    canvas.nodes.forEach((node) => {
      if (node.kind !== "generator") return;
      normalizeNodeParameters(node);
      if (
        node.generatedAsset?.type === "video"
        && (!Number.isFinite(node.generatedAsset.duration) || node.generatedAsset.duration <= 0)
      ) {
        hydrateAssetMetadata(node.generatedAsset, node.id);
      }
    });
  });
  const hydratedPreset = {
    mode: restored.lastPreset.mode,
    model: restored.lastPreset.model || state.lastPreset.model,
    aspect: restored.lastPreset.aspect || state.lastPreset.aspect,
    resolution: restored.lastPreset.resolution || state.lastPreset.resolution,
    quality: restored.lastPreset.quality || state.lastPreset.quality,
    duration: restored.lastPreset.duration || state.lastPreset.duration,
    outputFormat: restored.lastPreset.outputFormat || "",
    count: clamp(restored.lastPreset.count, 1, 4),
    workflow: restored.lastPreset.workflow || state.lastPreset.workflow,
    omniReferenceTaskType: restored.lastPreset.omniReferenceTaskType || "",
    audioEnabled: restored.lastPreset.audioEnabled === true,
  };
  normalizeNodeParameters(Object.assign(hydratedPreset, { kind: "generator" }));
  state.lastPreset = presetFrom(hydratedPreset);
  state.libraryTargetNodeId = null;
  clearAssetLibrarySelection();
  resetActiveCanvasSession(getActiveCanvas());
  return true;
}

function requestHostNavigation(target) {
  if (window.parent === window) {
    showActionToast("请从 Reelay 应用主页进入此画布");
    return;
  }
  canvasPersistence.post("canvas:navigate", { target });
}

function requestHostProjectNavigation(projectId) {
  if (projectId === state.projectId) return;
  if (window.parent === window) {
    showActionToast("请从 Reelay 应用主页进入此画布");
    return;
  }
  if (!state.hostCapabilities.projectSwitcher) {
    requestHostNavigation("projects");
    return;
  }
  canvasPersistence.post("canvas:open-project", { projectId });
}

function requestHostProjectCreation() {
  if (window.parent === window) {
    showActionToast("请从 Reelay 应用主页创建项目");
    return;
  }
  if (!state.hostCapabilities.projectSwitcher) {
    requestHostNavigation("projects");
    return;
  }
  canvasPersistence.post("canvas:create-project");
}

function requestHostAccountSettings(section = "profile") {
  if (window.parent === window) {
    showActionToast("请从 Reelay 应用主页进入账号设置");
    return;
  }
  const nextSection = section === "credits" ? "credits" : "profile";
  const payload = nextSection === "credits" && state.hostCapabilities.accountSections
    ? { section: "credits" }
    : {};
  canvasPersistence.post("canvas:open-account", payload);
}

function flushCanvasDocumentSave() {
  return canvasPersistence.flush();
}

function scheduleCanvasDocumentSave(delay = 800) {
  return canvasPersistence.schedule(delay);
}

function handleHostBridgeMessage(event) {
  return canvasPersistence.handleHostMessage(event)
    || canvasMediaAssets.handleHostMessage(event)
    || canvasEntityAssets.handleHostMessage(event);
}

function screenToWorld(clientX, clientY) {
  const rect = shell.getBoundingClientRect();
  return {
    x: (clientX - rect.left + shell.scrollLeft - state.tx) / state.scale,
    y: (clientY - rect.top + shell.scrollTop - state.ty) / state.scale,
  };
}

function updateCanvasGrid() {
  if (!canvasGrid) return;

  const baseSize = 24;
  const size = baseSize * state.scale;
  const fade = clamp((state.scale - 0.62) / 0.68, 0, 1);
  const opacity = fade * clamp((state.scale - 0.38) / 0.52, 0, 1) * 0.72;
  const offsetX = ((state.tx % size) + size) % size;
  const offsetY = ((state.ty % size) + size) % size;

  canvasGrid.style.setProperty("--grid-size", `${size.toFixed(2)}px`);
  canvasGrid.style.setProperty("--grid-x", `${offsetX.toFixed(2)}px`);
  canvasGrid.style.setProperty("--grid-y", `${offsetY.toFixed(2)}px`);
  canvasGrid.style.setProperty("--grid-opacity", opacity.toFixed(3));
}

function syncZoomControl() {
  const zoomValue = String(Math.round(state.scale * 100));
  if (zoomSlider) {
    zoomSlider.value = zoomValue;
    zoomSlider.setAttribute("aria-valuetext", `${zoomValue}%`);
  }
  if (zoomValueTip) {
    zoomValueTip.textContent = `${zoomValue}%`;
  }
}

function showZoomValueTip() {
  if (!zoomControl) return;
  syncZoomControl();
  zoomControl.classList.add("value-visible");
  window.clearTimeout(state.zoomTipTimer);
  state.zoomTipTimer = window.setTimeout(() => {
    zoomControl.classList.remove("value-visible");
  }, 900);
}

function syncSelectionOverlayProjection(
  portField = canvasConnectionInteraction.getScaledPortGeometry(state.scale),
) {
  shell.style.setProperty("--multi-selection-port-scale", state.scale.toFixed(4));
  shell.style.setProperty("--multi-selection-port-offset", `${portField.portOffset.toFixed(2)}px`);
  shell.style.setProperty(
    "--multi-selection-port-visual-size",
    `${(portField.portMinOutside * 2).toFixed(2)}px`,
  );
  shell.style.setProperty(
    "--multi-selection-surface-radius",
    `${(selectionSurfaceRadiusWorld * state.scale).toFixed(2)}px`,
  );
}

function applyTransform() {
  stage.style.transform = `translate(${state.tx}px, ${state.ty}px) scale(${state.scale})`;
  const inverseCanvasScale = (1 / state.scale).toFixed(4);
  const nodeMetaScreenScale = clamp(Math.pow(state.scale, 0.08), 0.88, 1.06);
  const nodeMetaScale = (nodeMetaScreenScale / state.scale).toFixed(4);
  const portField = canvasConnectionInteraction.getScaledPortGeometry(state.scale);
  shell.style.setProperty("--connection-feedback-scale", inverseCanvasScale);
  syncSelectionOverlayProjection(portField);
  shell.style.setProperty("--node-meta-ui-scale", nodeMetaScale);
  shell.style.setProperty("--group-ui-scale", nodeMetaScale);
  shell.style.setProperty("--group-interaction-scale", inverseCanvasScale);
  shell.style.setProperty(
    "--port-zone-outward",
    `${(portField.fieldOutwardRadius / state.scale).toFixed(2)}px`,
  );
  shell.style.setProperty(
    "--port-zone-height",
    `${((portField.fieldVerticalRadius * 2) / state.scale).toFixed(2)}px`,
  );
  scheduleGroupChromeLayout();
  updateCanvasGrid();
  syncPromptPanelLayouts();
  window.clearTimeout(state.overlaySyncTimer);
  state.overlaySyncTimer = window.setTimeout(syncPromptPanelLayouts, 100);
  syncZoomControl();
  renderConnections();
  renderGroupResizeOverlay();
  renderSelectionToolbar();
  renderMinimap();
  scheduleCanvasDocumentSave();
}

function syncNodeVisualLayout(
  node,
  element = nodeLayer.querySelector(`[data-id="${node.id}"]`),
  presentation = getNodePresentation(node),
) {
  if (!element) return;
  const { y, layout } = presentation;
  const canonicalLayout = getNodeLayout(node);
  const isTransitioning = canvasNodeLayoutTransition.isActive(getNodeLayoutTransitionId(node));
  element.style.left = `${node.x}px`;
  element.style.top = `${node.y}px`;
  element.style.width = `${canonicalLayout.nodeWidth}px`;
  element.style.height = `${canonicalLayout.nodeHeight}px`;
  element.classList.toggle("node-layout-transitioning", isTransitioning);
  const mediaFrame = element.querySelector(".media-frame");
  if (mediaFrame) {
    mediaFrame.style.width = `${layout.mediaWidth}px`;
    mediaFrame.style.height = `${layout.mediaHeight}px`;
    mediaFrame.style.transform = `translateY(${(y - node.y).toFixed(3)}px)`;
  }
  const mediaToolbar = element.querySelector("[data-media-toolbar]");
  if (mediaToolbar && !isTransitioning) {
    mediaToolbar.style.setProperty("--toolbar-scale", canonicalLayout.toolbarScale.toFixed(4));
    mediaToolbar.style.setProperty("--toolbar-nudge", "0px");
    const toolbarRect = mediaToolbar.getBoundingClientRect();
    const nudge = toolbarRect.top < 8 ? (8 - toolbarRect.top) / state.scale : 0;
    mediaToolbar.style.setProperty("--toolbar-nudge", `${nudge.toFixed(2)}px`);
  }
  const promptPanel = element.querySelector(".prompt-panel");
  if (!promptPanel) return;
  promptPanel.style.top = `${canonicalLayout.mediaHeight + layoutRules.panelGap}px`;
  if (isTransitioning) return;
  promptPanel.style.width = `${canonicalLayout.panelWidth}px`;
  promptPanel.style.height = `${canonicalLayout.panelHeight}px`;
  promptPanel.style.setProperty("--prompt-scale", canonicalLayout.promptScale.toFixed(4));
  promptPanel.style.setProperty("--prompt-extra-height", `${(canonicalLayout.panelHeight * (canonicalLayout.promptScale - 1)).toFixed(2)}px`);
  promptPanel.style.setProperty("--prompt-composer-height", `${canonicalLayout.composerHeight}px`);
  promptPanel.style.setProperty("--prompt-advanced-height", `${canonicalLayout.advancedSettingsHeight}px`);
  promptPanel.style.setProperty("--prompt-input-top", `${layoutRules.promptInputTop}px`);
  promptPanel.style.setProperty("--prompt-input-bottom", `${layoutRules.promptInputBottom}px`);
}

function syncNodeAspectUi(node, element) {
  if (node.kind !== "generator") return;
  const aspectLabel = element.querySelector("[data-param-aspect]");
  if (aspectLabel) aspectLabel.textContent = getCapabilityDisplayLabel(node, "aspect", node.aspect);
  element.querySelectorAll('[data-action="aspect"]').forEach((button) => {
    const active = button.dataset.value === node.aspect;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function renderNodeLayoutTransitionFrame(transitionIds = []) {
  const activeIds = new Set(transitionIds);
  for (const node of state.nodes) {
    if (!activeIds.has(getNodeLayoutTransitionId(node))) continue;
    const element = nodeLayer.querySelector(`[data-id="${node.id}"]`);
    if (element) syncNodeVisualLayout(node, element);
  }
  renderConnections();
  renderSelectionToolbar();
  renderMinimap();
}

function syncPromptPanelContentHeight(node, element) {
  if (!node || node.kind !== "generator" || !node.expanded || !element) return false;
  const promptInput = element.querySelector(".prompt-input");
  if (!promptInput) return false;

  const previousHeight = promptInput.style.height;
  const previousBottom = promptInput.style.bottom;
  const previousOverflow = promptInput.style.overflowY;
  promptInput.style.height = "0px";
  promptInput.style.bottom = "auto";
  promptInput.style.overflowY = "hidden";
  const contentHeight = promptInput.scrollHeight;
  promptInput.style.height = previousHeight;
  promptInput.style.bottom = previousBottom;
  promptInput.style.overflowY = previousOverflow;

  const nextHeight = clamp(
    Math.ceil(layoutRules.promptInputTop + contentHeight + layoutRules.promptInputBottom),
    layoutRules.compactPanelHeight,
    layoutRules.normalPanelHeight,
  );
  const previousPanelHeight = Number(node.promptPanelHeight) || layoutRules.compactPanelHeight;
  const availableInputHeight = nextHeight - layoutRules.promptInputTop - layoutRules.promptInputBottom;
  promptInput.style.overflowY = contentHeight > availableInputHeight ? "auto" : "hidden";
  if (nextHeight === previousPanelHeight) return false;

  node.promptPanelHeight = nextHeight;
  syncNodeVisualLayout(node, element);
  renderSelectionToolbar();
  renderMinimap();
  scheduleGroupChromeLayout();
  scheduleNodePopoverLayouts();
  return true;
}

function syncPromptPanelLayouts() {
  for (const node of state.nodes) {
    syncNodeVisualLayout(node);
  }
  scheduleNodePopoverLayouts();
}

function getNodePopoverBoundary() {
  const shellRect = shell.getBoundingClientRect();
  const topRect = topBar?.getBoundingClientRect();
  const libraryRect = assetLibraryPanel && !assetLibraryPanel.classList.contains("hidden")
    ? assetLibraryPanel.getBoundingClientRect()
    : null;
  const agentRect = state.agentOpen ? agentPanel?.getBoundingClientRect() : null;
  return {
    left: Math.max(shellRect.left, libraryRect?.right || shellRect.left),
    top: Math.max(shellRect.top, topRect?.bottom || shellRect.top),
    right: Math.min(shellRect.right, agentRect?.left || shellRect.right),
    bottom: shellRect.bottom,
  };
}

function getNodePopoverPlacements(anchorAction) {
  if (anchorAction === "material-panel") {
    return ["left-start", "right-start", "top-start", "bottom-start"];
  }
  if (anchorAction === "model-panel") {
    return ["top-start"];
  }
  if (anchorAction === "param-panel") {
    return ["top-start"];
  }
  return ["bottom", "top", "bottom-start", "bottom-end", "top-start", "top-end"];
}

function getNodePopoverGap(anchorAction) {
  if (anchorAction === "param-panel") return 8;
  if (anchorAction === "model-panel") return 6;
  return 8;
}

function syncNodePopoverLayout(element) {
  const promptPanel = element?.querySelector(".prompt-panel");
  const popover = promptPanel?.querySelector("[data-node-popover]");
  if (!promptPanel || !popover) return;
  if (popover.classList.contains("is-task-type-transitioning")) return;
  const anchorAction = popover.dataset.anchorAction;
  const anchor = promptPanel.querySelector(`[data-action="${anchorAction}"]`)
    || promptPanel.querySelector(".control-bar");
  if (!anchor) return;
  const boundary = getNodePopoverBoundary();
  const promptRect = promptPanel.getBoundingClientRect();
  const anchorRect = anchor.getBoundingClientRect();
  const compositeScale = promptPanel.offsetWidth > 0 ? promptRect.width / promptPanel.offsetWidth : 1;
  if (!compositeScale) return;

  popover.style.removeProperty("max-height");
  popover.style.removeProperty("overflow-y");
  const popoverWidth = popover.offsetWidth * compositeScale;
  const popoverHeight = popover.offsetHeight * compositeScale;
  if (!popoverWidth || !popoverHeight) return;
  const placement = canvasPopoverPlacement.placeAnchoredPopover({
    anchor: anchorRect,
    floating: { width: popoverWidth, height: popoverHeight },
    boundary,
    placements: getNodePopoverPlacements(anchorAction),
    gap: getNodePopoverGap(anchorAction),
    padding: 12,
  });
  if (!placement) return;
  popover.style.left = `${((placement.left - promptRect.left) / compositeScale).toFixed(2)}px`;
  popover.style.top = `${((placement.top - promptRect.top) / compositeScale).toFixed(2)}px`;
  popover.style.visibility = "visible";
  popover.dataset.placement = placement.placement;
}

function syncAdvancedSettingTooltipLayout(trigger) {
  const promptPanel = trigger?.closest(".prompt-panel");
  const tooltip = trigger?.querySelector(".advanced-setting-tooltip");
  if (!promptPanel || !tooltip) return;

  const promptRect = promptPanel.getBoundingClientRect();
  const triggerRect = trigger.getBoundingClientRect();
  const compositeScale = promptPanel.offsetWidth > 0 ? promptRect.width / promptPanel.offsetWidth : 1;
  if (!compositeScale) return;

  const tooltipWidth = tooltip.offsetWidth * compositeScale;
  const tooltipHeight = tooltip.offsetHeight * compositeScale;
  if (!tooltipWidth || !tooltipHeight) return;

  const placement = canvasPopoverPlacement.placeAnchoredPopover({
    anchor: triggerRect,
    floating: { width: tooltipWidth, height: tooltipHeight },
    boundary: getNodePopoverBoundary(),
    placements: ["top-start", "bottom-start"],
    gap: 8,
    padding: 12,
  });
  if (!placement) return;

  tooltip.style.left = `${((placement.left - triggerRect.left) / compositeScale).toFixed(2)}px`;
  tooltip.style.top = `${((placement.top - triggerRect.top) / compositeScale).toFixed(2)}px`;
  tooltip.style.bottom = "auto";
  tooltip.style.setProperty(
    "--tooltip-arrow-left",
    `${clamp((triggerRect.left + triggerRect.width / 2 - placement.left) / compositeScale, 12, tooltip.offsetWidth - 12).toFixed(2)}px`,
  );
  tooltip.dataset.placement = placement.placement;
}

function syncVisibleAdvancedSettingTooltips() {
  nodeLayer.querySelectorAll(
    ".advanced-setting-info:hover, .advanced-setting-info:focus-visible, .advanced-setting-info:focus-within",
  ).forEach(syncAdvancedSettingTooltipLayout);
}

function scheduleNodePopoverLayouts() {
  cancelAnimationFrame(state.nodePopoverFrame);
  state.nodePopoverFrame = requestAnimationFrame(() => {
    state.nodePopoverFrame = 0;
    nodeLayer.querySelectorAll(".canvas-node").forEach(syncNodePopoverLayout);
    syncVisibleAdvancedSettingTooltips();
  });
}

function getTaskTypeSelectionOffset(segmented, fallbackIndex) {
  const transform = getComputedStyle(segmented, "::before").transform;
  if (transform && transform !== "none") {
    try {
      const offset = new DOMMatrixReadOnly(transform).m41;
      if (Number.isFinite(offset)) return offset;
    } catch {
      // Fall back to the semantic index if the browser returns an unsupported transform format.
    }
  }
  const columns = Math.max(
    1,
    Number.parseInt(getComputedStyle(segmented).getPropertyValue("--option-columns"), 10) || 1,
  );
  return Math.max(0, fallbackIndex) * Math.max(0, segmented.clientWidth - 4) / columns;
}

function captureTaskTypeParameterTransition(node, nextTaskType) {
  if (node?.panel !== "params") return null;
  const capability = getOmniReferenceTaskTypeCapability(node);
  const values = Array.isArray(capability?.uiValues) ? capability.uiValues : [];
  const fromIndex = values.indexOf(node.omniReferenceTaskType);
  const toIndex = values.indexOf(nextTaskType);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return null;
  const element = nodeLayer.querySelector(`[data-id="${node.id}"]`);
  const panel = element?.querySelector(".param-panel");
  const currentDetails = panel?.querySelector(
    ".parameter-task-details:not(.parameter-task-details-outgoing)",
  );
  const detailLayers = currentDetails ? [currentDetails] : [];
  const segmented = panel?.querySelector(".omni-reference-task-type-segmented");
  if (!panel) return null;

  const restoreFocus = panel.contains(document.activeElement)
    && document.activeElement?.matches?.('[data-action="omni-reference-task-type"]');
  if (reducedMotionQuery.matches || !panel.offsetHeight || !detailLayers.length || !segmented) {
    return { fromIndex, toIndex, restoreFocus, shouldAnimate: false };
  }

  const panelRect = panel.getBoundingClientRect();
  const compositeScale = panel.offsetWidth > 0 ? panelRect.width / panel.offsetWidth : 1;
  if (!compositeScale) {
    return { fromIndex, toIndex, restoreFocus, shouldAnimate: false };
  }

  const outgoingDetails = detailLayers.map((details) => {
    const detailsRect = details.getBoundingClientRect();
    const clone = details.cloneNode(true);
    clone.classList.add("parameter-task-details-outgoing");
    clone.setAttribute("aria-hidden", "true");
    clone.inert = true;
    [clone, ...clone.querySelectorAll("[id]")]
      .forEach((item) => item.removeAttribute("id"));
    return {
      element: clone,
      top: (detailsRect.top - panelRect.top) / compositeScale - panel.clientTop,
      left: (detailsRect.left - panelRect.left) / compositeScale - panel.clientLeft,
      width: detailsRect.width / compositeScale,
      opacity: getComputedStyle(details).opacity,
    };
  });

  return {
    fromHeight: panelRect.height / compositeScale,
    fromLeft: panelRect.left,
    fromBottom: panelRect.bottom,
    fromSelectionOffset: getTaskTypeSelectionOffset(segmented, fromIndex),
    fromIndex,
    toIndex,
    direction: Math.sign(toIndex - fromIndex) || 1,
    restoreFocus,
    shouldAnimate: true,
    fromDetailsSignature: currentDetails.innerHTML,
    outgoingDetails,
  };
}

function animateTaskTypeParameterTransition(node, transition) {
  if (!transition) return;
  const element = nodeLayer.querySelector(`[data-id="${node.id}"]`);
  const panel = element?.querySelector(".param-panel");
  const details = panel?.querySelector(
    ".parameter-task-details:not(.parameter-task-details-outgoing)",
  );
  const segmented = panel?.querySelector(".omni-reference-task-type-segmented");
  if (!element || !panel || !details || !segmented) return;

  syncNodeVisualLayout(node, element);
  syncNodePopoverLayout(element);
  const buttons = [...segmented.querySelectorAll('[data-action="omni-reference-task-type"]')];
  const targetButton = buttons[transition.toIndex];
  if (transition.restoreFocus) targetButton?.focus({ preventScroll: true });
  if (!transition.shouldAnimate || reducedMotionQuery.matches) return;

  const targetHeight = panel.offsetHeight;
  const targetRect = panel.getBoundingClientRect();
  const compositeScale = panel.offsetWidth > 0 ? targetRect.width / panel.offsetWidth : 1;
  if (!targetHeight || !compositeScale) return;

  const detailsChanging = transition.fromDetailsSignature !== details.innerHTML;
  const startTranslateX = (transition.fromLeft - targetRect.left) / compositeScale;
  const startTranslateY = (transition.fromBottom - targetRect.bottom) / compositeScale
    + targetHeight - transition.fromHeight;
  const outgoingDetails = detailsChanging ? transition.outgoingDetails : [];
  outgoingDetails.forEach((outgoing) => {
    outgoing.element.style.top = `${outgoing.top}px`;
    outgoing.element.style.left = `${outgoing.left}px`;
    outgoing.element.style.width = `${outgoing.width}px`;
    outgoing.element.style.setProperty("--task-type-outgoing-start-opacity", outgoing.opacity);
    outgoing.element.style.setProperty(
      "--task-type-exit-offset",
      `${transition.direction * -5}px`,
    );
    panel.append(outgoing.element);
  });

  panel.classList.add("is-task-type-transitioning", "is-task-type-preparing");
  if (detailsChanging) panel.classList.add("is-task-type-details-changing");
  panel.style.height = `${transition.fromHeight}px`;
  panel.style.transform = `translate(${startTranslateX}px, ${startTranslateY}px)`;
  if (detailsChanging) {
    details.style.setProperty("--task-type-enter-offset", `${transition.direction * 7}px`);
  }
  segmented.style.setProperty(
    "--task-type-selection-offset",
    `${transition.fromSelectionOffset}px`,
  );
  panel.getBoundingClientRect();

  let finished = false;
  let fallbackTimer = 0;
  const finish = () => {
    if (finished) return;
    finished = true;
    window.clearTimeout(fallbackTimer);
    panel.classList.remove(
      "is-task-type-transitioning",
      "is-task-type-preparing",
      "is-task-type-entered",
      "is-task-type-details-changing",
    );
    panel.style.removeProperty("height");
    panel.style.removeProperty("transform");
    details.style.removeProperty("--task-type-enter-offset");
    segmented.style.removeProperty("--task-type-selection-offset");
    outgoingDetails.forEach((outgoing) => outgoing.element.remove());
    if (panel.isConnected) scheduleNodePopoverLayouts();
  };
  const onTransitionEnd = (event) => {
    if (event.target !== panel || event.propertyName !== "height") return;
    panel.removeEventListener("transitionend", onTransitionEnd);
    finish();
  };
  panel.addEventListener("transitionend", onTransitionEnd);

  requestAnimationFrame(() => {
    if (!panel.isConnected) {
      finish();
      return;
    }
    panel.classList.remove("is-task-type-preparing");
    panel.classList.add("is-task-type-entered");
    panel.style.height = `${targetHeight}px`;
    panel.style.transform = "translate(0, 0)";
    segmented.style.removeProperty("--task-type-selection-offset");
    fallbackTimer = window.setTimeout(finish, 360);
  });
}

function setCanvasZoom(nextScale, anchorClientX, anchorClientY) {
  const rect = shell.getBoundingClientRect();
  const clientX = Number.isFinite(anchorClientX) ? anchorClientX : rect.left + rect.width / 2;
  const clientY = Number.isFinite(anchorClientY) ? anchorClientY : rect.top + rect.height / 2;
  const before = screenToWorld(clientX, clientY);

  state.scale = clamp(nextScale, canvasScaleLimits.min, canvasScaleLimits.max);
  state.tx = clientX - rect.left - before.x * state.scale;
  state.ty = clientY - rect.top - before.y * state.scale;
  applyTransform();
  showZoomValueTip();
}

function getCanvasFitFrame() {
  const rect = shell.getBoundingClientRect();
  const libraryRect = isAssetLibraryOpen() ? assetLibraryPanel?.getBoundingClientRect() : null;
  const agentRect = state.agentOpen ? agentPanel?.getBoundingClientRect() : null;
  const leftInset = Math.max(0, (libraryRect?.right || rect.left) - rect.left);
  const rightInset = Math.max(0, rect.right - (agentRect?.left || rect.right));
  const padding = 72;
  return {
    leftInset,
    padding,
    availableWidth: Math.max(240, rect.width - leftInset - rightInset - padding * 2),
    availableHeight: Math.max(180, rect.height - padding * 2),
  };
}

function applyFitBounds(bounds, options = {}) {
  if (!bounds) return;
  const frame = getCanvasFitFrame();
  const fitScale = Math.min(
    frame.availableWidth / Math.max(bounds.width, 1),
    frame.availableHeight / Math.max(bounds.height, 1),
  );
  const minScale = Number.isFinite(options.minScale) ? options.minScale : canvasScaleLimits.min;
  const nextScale = clamp(Math.max(fitScale, minScale), canvasScaleLimits.min, canvasScaleLimits.max);

  state.scale = nextScale;
  state.tx = frame.leftInset + frame.padding + (frame.availableWidth - bounds.width * nextScale) / 2 - bounds.left * nextScale;
  state.ty = frame.padding + (frame.availableHeight - bounds.height * nextScale) / 2 - bounds.top * nextScale;
  applyTransform();
}

function getBoundsFitScale(bounds) {
  if (!bounds) return canvasScaleLimits.max;
  const frame = getCanvasFitFrame();
  return Math.min(
    frame.availableWidth / Math.max(bounds.width, 1),
    frame.availableHeight / Math.max(bounds.height, 1),
  );
}

function distanceBetweenBounds(a, b) {
  const gapX = Math.max(0, Math.max(a.left - b.right, b.left - a.right));
  const gapY = Math.max(0, Math.max(a.top - b.bottom, b.top - a.bottom));
  return Math.hypot(gapX, gapY);
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function getPrimaryContentCluster(nodes) {
  if (nodes.length <= 2) return nodes;
  const entries = nodes.map((node) => ({ node, bounds: getNodeBounds(node) }));
  const medianSpan = median(entries.map(({ bounds }) => Math.max(bounds.width, bounds.height)));
  const joinDistance = clamp(medianSpan * 2.6, 520, 1600);
  const visited = new Set();
  const clusters = [];

  entries.forEach((entry, index) => {
    if (visited.has(index)) return;
    const stack = [index];
    const cluster = [];
    visited.add(index);
    while (stack.length) {
      const currentIndex = stack.pop();
      const current = entries[currentIndex];
      cluster.push(current);
      entries.forEach((candidate, candidateIndex) => {
        if (visited.has(candidateIndex)) return;
        if (distanceBetweenBounds(current.bounds, candidate.bounds) > joinDistance) return;
        visited.add(candidateIndex);
        stack.push(candidateIndex);
      });
    }
    clusters.push(cluster);
  });

  clusters.sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    const aBounds = getNodesContentBounds(a.map((entry) => entry.node));
    const bBounds = getNodesContentBounds(b.map((entry) => entry.node));
    const aArea = (aBounds?.width || 0) * (aBounds?.height || 0);
    const bArea = (bBounds?.width || 0) * (bBounds?.height || 0);
    if (bArea !== aArea) return bArea - aArea;
    return Math.max(...b.map((entry) => entry.node.z || 0)) - Math.max(...a.map((entry) => entry.node.z || 0));
  });
  return clusters[0]?.map((entry) => entry.node) || nodes;
}

function getSmartFitNodes() {
  const selectedNodes = state.nodes.filter((node) => state.selectedIds.has(node.id));
  if (selectedNodes.length) return selectedNodes;
  const allBounds = getNodesContentBounds(state.nodes);
  const readableScale = 0.32;
  if (!allBounds || getBoundsFitScale(allBounds) >= readableScale || state.nodes.length <= 2) return state.nodes;
  return getPrimaryContentCluster(state.nodes);
}

function fitCanvasToContent() {
  closeCanvasPanel();
  if (!state.nodes.length) {
    state.scale = 1;
    state.tx = 0;
    state.ty = 0;
    applyTransform();
    return;
  }

  const targetNodes = getSmartFitNodes();
  const bounds = getNodesContentBounds(targetNodes);
  const selectedActive = state.selectedIds.size > 0;
  applyFitBounds(bounds, {
    minScale: selectedActive || targetNodes.length === state.nodes.length ? canvasScaleLimits.min : 0.32,
  });
}

function centerCanvasOnWorld(worldX, worldY) {
  const rect = shell.getBoundingClientRect();
  state.tx = rect.width / 2 - worldX * state.scale;
  state.ty = rect.height / 2 - worldY * state.scale;
  applyTransform();
}

function nextZ() {
  const currentTop = Math.max(state.zCounter, ...state.nodes.map((node) => node.z || 0));
  state.zCounter = currentTop + 1;
  return state.zCounter;
}

function defaultGeneratorNode(x = 440, y = 210, mode = "image") {
  const generationMode = mode === "video" ? "video" : "image";
  const node = {
    id: crypto.randomUUID(),
    kind: "generator",
    x,
    y,
    mode: generationMode,
    model: firstModelId(generationMode),
    aspect: "",
    resolution: "",
    quality: "",
    duration: "",
    outputFormat: "",
    count: 1,
    workflow: "",
    omniReferenceTaskType: "",
    audioEnabled: generationMode === "video",
    promptOptimizing: false,
    autoLinkEnabled: true,
    assetValidationEnabled: false,
    credits: 0,
    prompt: "",
    preview: false,
    generating: false,
    generatedAsset: null,
    expanded: true,
    advancedSettingsExpanded: false,
    mediaMenuOpen: false,
    panel: null,
    modelFilter: generationMode,
    z: nextZ(),
    assets: [],
    activeAssetId: null,
  };
  normalizeNodeParameters(node);
  return node;
}

function defaultAssetNode(x, y, asset) {
  return {
    id: crypto.randomUUID(),
    kind: "asset",
    x,
    y,
    mode: asset.type,
    z: nextZ(),
    assets: [asset],
    activeAssetId: asset.id,
    expanded: false,
    panel: null,
    mediaMenuOpen: false,
  };
}

function getModel(node) {
  return generatorModelPolicy.resolveModel(models, node);
}

function canNodeUseEntityReferences(node) {
  return generatorModelPolicy.canUseEntityReferences(models, node);
}

function getModelCapabilities(node) {
  return getModel(node)?.capabilities || {};
}

function getCapabilityValues(node, key) {
  const capabilities = getModelCapabilities(node);
  return capabilities[key] || [];
}

function getCapabilityDisplayLabel(node, action, value) {
  const labels = getModelCapabilities(node)[`${action}Labels`];
  const label = labels && typeof labels === "object" ? labels[value] : null;
  return typeof label === "string" && label ? label : String(value ?? "");
}

function getDurationCapability(node, quality = node?.quality) {
  const capabilities = getModelCapabilities(node);
  const candidate = capabilities.durationRangesByQuality?.[quality] || capabilities.durationRange;
  if (!candidate || typeof candidate !== "object") return null;
  const min = Math.max(1, Math.round(Number(candidate.min)));
  const max = Math.max(min, Math.round(Number(candidate.max)));
  const step = Math.max(1, Math.round(Number(candidate.step) || 1));
  const rawMarks = Array.isArray(candidate.marks) ? candidate.marks : [min, max];
  const marks = [...new Set(rawMarks
    .map((value) => Math.round(Number(value)))
    .filter((value) => Number.isFinite(value) && value >= min && value <= max))];
  if (!marks.includes(min)) marks.unshift(min);
  if (!marks.includes(max)) marks.push(max);
  return { min, max, step, marks: marks.sort((a, b) => a - b) };
}

function getNormalizedDurationSeconds(node, value = node?.duration) {
  const range = getDurationCapability(node);
  if (!range) return null;
  const defaultSeconds = Number.parseInt(getModel(node)?.defaults?.duration, 10);
  const requested = Number.parseInt(value, 10);
  const base = Number.isFinite(requested)
    ? requested
    : Number.isFinite(defaultSeconds) ? defaultSeconds : range.min;
  const stepped = range.min + Math.round((base - range.min) / range.step) * range.step;
  return clamp(stepped, range.min, range.max);
}

function getWorkflowDefinitions(node) {
  const mode = getNodeGenerationMode(node) || "image";
  const definitions = Array.isArray(generationWorkflows[mode]) ? generationWorkflows[mode] : [];
  const supportedIds = getModelCapabilities(node).workflows;
  if (!Array.isArray(supportedIds) || !supportedIds.length) return definitions;
  return supportedIds
    .map((workflowId) => definitions.find((workflow) => workflow.id === workflowId))
    .filter(Boolean);
}

function getWorkflowDefinition(node) {
  const workflows = getWorkflowDefinitions(node);
  return workflows.find((workflow) => workflow.id === node.workflow) || workflows[0] || null;
}

function getOmniReferenceTaskTypeCapability(node) {
  const capability = getModelCapabilities(node).omniReferenceTaskType;
  return capability && typeof capability === "object" && Array.isArray(capability.values)
    ? capability
    : null;
}

function getOmniReferenceTaskTypeConstraint(node) {
  const capability = getOmniReferenceTaskTypeCapability(node);
  if (!capability) return null;
  const constraint = capability.constraints?.[node.omniReferenceTaskType];
  return constraint && typeof constraint === "object" ? constraint : {};
}

function getOmniReferenceTaskTypeLabel(node, value = node?.omniReferenceTaskType) {
  const capability = getOmniReferenceTaskTypeCapability(node);
  const label = capability?.labels?.[value];
  return typeof label === "string" && label ? label : String(value ?? "");
}

function getReferenceVideoAssets(node) {
  if (!node || node.kind !== "generator") return [];
  const directAssets = (Array.isArray(node.assets) ? node.assets : [])
    .map((asset) => ({ asset, sourceNodeId: null }));
  const linkedAssets = getIncomingConnections(node.id)
    .map((connection) => {
      const source = state.nodes.find((item) => item.id === connection.sourceNodeId);
      return source ? { asset: getEditableMedia(source), sourceNodeId: source.id } : null;
    })
    .filter(Boolean);
  return [...directAssets, ...linkedAssets].flatMap(({ asset, sourceNodeId }) => {
    const url = typeof asset?.url === "string" ? asset.url.trim() : "";
    if (asset?.type !== "video" || !url) return [];
    const duration = Number(asset.duration);
    return [{
      assetId: typeof asset.id === "string" ? asset.id : null,
      sourceNodeId,
      url,
      duration: Number.isFinite(duration) && duration > 0 ? duration : null,
    }];
  });
}

function getOmniReferenceTaskTypeIssue(node) {
  const constraint = getOmniReferenceTaskTypeConstraint(node);
  if (!constraint?.referenceVideoRequired) return "";
  const label = getOmniReferenceTaskTypeLabel(node) || "当前任务";
  const referenceVideos = getReferenceVideoAssets(node);
  if (!referenceVideos.length) return `${label}需要至少添加一个参考视频`;

  const durationRange = constraint.referenceVideoDurationRange;
  if (!durationRange) return "";
  const durations = referenceVideos.map((asset) => Number(asset.duration));
  if (durations.some((duration) => !Number.isFinite(duration) || duration <= 0)) {
    return "请等待参考视频时长读取完成";
  }
  if (durations.some((duration) => duration < durationRange.min || duration > durationRange.max)) {
    return `${label}的参考视频时长须为 ${durationRange.min}–${durationRange.max} 秒`;
  }
  return "";
}

function getGenerationOutputDurationSeconds(node, referenceVideos) {
  const taskConstraint = getOmniReferenceTaskTypeConstraint(node);
  if (taskConstraint?.duration !== -1) return getNormalizedDurationSeconds(node);
  const resolvedReferences = Array.isArray(referenceVideos)
    ? referenceVideos
    : getReferenceVideoAssets(node);
  const durations = resolvedReferences.map((asset) => Number(asset.duration));
  if (!durations.length || durations.some((duration) => !Number.isFinite(duration) || duration <= 0)) return null;
  return Math.max(...durations);
}

function normalizeNodeParameters(node) {
  if (!node || node.kind !== "generator") return node;
  const legacyWorkflow = node.workflow;
  const model = generatorModelPolicy.normalizeModelState(models, node);
  const expectedMode = getNodeGenerationMode(node) || "image";
  const taskTypeCapability = getOmniReferenceTaskTypeCapability(node);
  if (taskTypeCapability) {
    const legacyTaskType = legacyWorkflow === "video-edit"
      ? "edit"
      : legacyWorkflow === "video-extend" ? "extend" : "";
    const defaultTaskType = model?.defaults?.omniReferenceTaskType;
    node.omniReferenceTaskType = taskTypeCapability.values.includes(legacyTaskType)
      ? legacyTaskType
      : taskTypeCapability.values.includes(node.omniReferenceTaskType)
        ? node.omniReferenceTaskType
        : taskTypeCapability.values.includes(defaultTaskType)
          ? defaultTaskType
          : taskTypeCapability.values[0] || "";
  } else {
    delete node.omniReferenceTaskType;
  }
  const workflows = getWorkflowDefinitions(node);
  if (!workflows.some((workflow) => workflow.id === node.workflow)) {
    const defaultWorkflow = model?.defaults?.workflow;
    node.workflow = workflows.some((workflow) => workflow.id === defaultWorkflow)
      ? defaultWorkflow
      : workflows[0]?.id || "";
  }
  const isVideoNode = expectedMode === "video";
  node.audioEnabled = isVideoNode && node.audioEnabled !== false;
  node.promptOptimizing = isVideoNode && node.promptOptimizing === true;
  node.autoLinkEnabled = node.autoLinkEnabled !== false;
  node.assetValidationEnabled = isVideoNode && node.assetValidationEnabled === true;
  node.advancedSettingsExpanded = node.advancedSettingsExpanded === true;

  const fieldMap = {
    aspect: "aspects",
    resolution: "resolutions",
    quality: "qualities",
    outputFormat: "outputFormats",
  };
  if (node.aspect === "Auto" && getCapabilityValues(node, "aspects").includes("adaptive")) {
    node.aspect = "adaptive";
  }
  for (const [field, capabilityKey] of Object.entries(fieldMap)) {
    const values = getCapabilityValues(node, capabilityKey);
    if (!values.length) {
      delete node[field];
      continue;
    }
    if (!values.includes(node[field])) {
      const defaultValue = model?.defaults?.[field];
      node[field] = values.includes(defaultValue) ? defaultValue : values[0];
    }
  }

  const constrainedAspect = getOmniReferenceTaskTypeConstraint(node)?.aspect;
  if (constrainedAspect && getCapabilityValues(node, "aspects").includes(constrainedAspect)) {
    node.aspect = constrainedAspect;
  }

  const durationSeconds = getNormalizedDurationSeconds(node);
  if (durationSeconds === null) delete node.duration;
  else node.duration = `${durationSeconds}s`;

  const counts = getCapabilityValues(node, "counts");
  if (counts.length && !counts.includes(node.count)) {
    node.count = counts[0];
  }
  return node;
}

function getCost(node) {
  if (node.kind !== "generator") return 0;
  const model = getModel(node);
  const capabilities = model?.capabilities || {};
  const counts = capabilities.counts || [];
  const count = counts.includes(node.count) ? node.count : counts[0] || 1;

  if (model?.type === "image") {
    const resolutions = capabilities.resolutions || [];
    const resolution = resolutions.includes(node.resolution) ? node.resolution : resolutions[0];
    const baseCost = Number(imageResolutionCost[resolution]);
    if (!resolution || !Number.isFinite(baseCost)) return null;

    const qualities = capabilities.qualities || [];
    const quality = qualities.includes(node.quality) ? node.quality : qualities[0];
    const configuredMultiplier = quality ? Number(imageQualityMultiplier[quality]) : 1;
    const qualityMultiplier = Number.isFinite(configuredMultiplier) ? configuredMultiplier : 1;
    return Math.ceil(baseCost * qualityMultiplier) * count;
  }

  const qualities = capabilities.qualities || [];
  const quality = qualities.includes(node.quality) ? node.quality : qualities[0];
  const baseCost = Number(videoQualityCost[quality]);
  if (!quality || !Number.isFinite(baseCost)) return null;
  const seconds = getGenerationOutputDurationSeconds(node);
  if (!Number.isFinite(seconds)) return null;
  const durationMultiplier = Math.ceil(seconds / 4);
  return baseCost * durationMultiplier * count;
}

function getGenerationAvailability(node) {
  const taskTypeIssue = getOmniReferenceTaskTypeIssue(node);
  const cost = getCost(node);
  const hasValidPrice = Number.isFinite(cost) && cost > 0;
  const hasPrompt = Boolean(node.prompt.trim());
  const canGenerate = hasPrompt && !node.generating && !node.promptOptimizing && hasValidPrice && !taskTypeIssue;
  return {
    cost,
    hasValidPrice,
    taskTypeIssue,
    canGenerate,
    tooltip: canGenerate
      ? "生成"
      : taskTypeIssue
        ? taskTypeIssue
        : !hasValidPrice
        ? "当前模型暂不可计价"
        : node.promptOptimizing
          ? "正在优化提示词"
          : hasPrompt
            ? "生成中"
            : "请输入提示词",
  };
}

function getParamLabel(node) {
  const parts = getParamLabelParts(node);
  return `${parts.beforeAspect}${parts.aspect}${parts.afterAspect}`;
}

function getParamLabelParts(node) {
  if (getNodeGenerationMode(node) === "video") {
    const taskTypeCapability = getOmniReferenceTaskTypeCapability(node);
    const taskTypeConstraint = getOmniReferenceTaskTypeConstraint(node);
    const workflows = getWorkflowDefinitions(node);
    const workflow = getWorkflowDefinition(node);
    const modeLabel = taskTypeCapability
      ? getOmniReferenceTaskTypeLabel(node)
      : workflows.length > 1 ? workflow?.label : "";
    const aspect = getCapabilityDisplayLabel(node, "aspect", node.aspect);
    const quality = getCapabilityDisplayLabel(node, "quality", node.quality);
    const duration = taskTypeConstraint?.duration === -1
      ? "跟随原视频"
      : node.duration;
    return {
      beforeAspect: modeLabel ? `${modeLabel} · ` : "",
      aspect,
      afterAspect: ` · ${quality}${taskTypeConstraint?.hideDuration ? "" : ` · ${duration}`}`,
    };
  }
  const quality = getCapabilityValues(node, "qualities").length ? ` · ${node.quality}` : "";
  return {
    beforeAspect: "",
    aspect: node.aspect,
    afterAspect: ` · ${node.resolution}${quality}`,
  };
}

function getParamLabelMarkup(node) {
  const parts = getParamLabelParts(node);
  return `<span class="param-summary-before">${escapeHtml(parts.beforeAspect)}</span><span class="param-summary-aspect" data-param-aspect>${escapeHtml(parts.aspect)}</span><span class="param-summary-after">${escapeHtml(parts.afterAspect)}</span>`;
}

function aspectStringToRatio(aspect) {
  const [width, height] = String(aspect).split(":").map(Number);
  if (!width || !height) return layoutRules.defaultRatio;
  return width / height;
}

function getActiveAsset(node) {
  return node.assets?.find((asset) => asset.id === node.activeAssetId) || node.assets?.[0] || null;
}

function getMediaRatio(node) {
  if (node.kind === "asset") {
    const asset = getActiveAsset(node);
    if (asset?.type === "audio") return layoutRules.audioRatio;
    if (asset?.aspectRatio) return asset.aspectRatio;
    return layoutRules.defaultRatio;
  }

  return aspectStringToRatio(node.aspect);
}

function getMediaSize(ratio) {
  let mediaWidth;
  let mediaHeight;

  if (ratio > 1.15) {
    mediaWidth = layoutRules.landscapeWidth;
    mediaHeight = mediaWidth / ratio;
  } else if (ratio < 0.86) {
    mediaHeight = layoutRules.portraitHeight;
    mediaWidth = mediaHeight * ratio;
  } else {
    mediaWidth = layoutRules.squareSize;
    mediaHeight = layoutRules.squareSize;
  }

  if (mediaWidth > layoutRules.maxWidth) {
    mediaWidth = layoutRules.maxWidth;
    mediaHeight = mediaWidth / ratio;
  }
  if (mediaHeight > layoutRules.maxHeight) {
    mediaHeight = layoutRules.maxHeight;
    mediaWidth = mediaHeight * ratio;
  }

  return {
    mediaWidth: Math.max(layoutRules.minMediaWidth, Math.round(mediaWidth)),
    mediaHeight: Math.max(layoutRules.minMediaHeight, Math.round(mediaHeight)),
  };
}

function getNodeLayout(node) {
  const ratio = getMediaRatio(node);
  const { mediaWidth, mediaHeight } = getMediaSize(ratio);
  const toolbarScale = clamp(1 / state.scale, 0.5, 4);

  if (node.kind === "asset") {
    return {
      mediaWidth,
      mediaHeight,
      panelWidth: 0,
      panelHeight: 0,
      nodeWidth: mediaWidth,
      nodeHeight: mediaHeight,
      toolbarScale,
    };
  }

  const panelWidth = layoutRules.normalPanelWidth;
  const composerHeight = clamp(
    Number(node.promptPanelHeight) || layoutRules.compactPanelHeight,
    layoutRules.compactPanelHeight,
    layoutRules.normalPanelHeight,
  );
  const advancedSettingsHeight = node.advancedSettingsExpanded
    ? layoutRules.advancedSettingsHeightByMode[getNodeGenerationMode(node)]
    : 0;
  const panelHeight = composerHeight + advancedSettingsHeight;
  const viewportWidth = shell.clientWidth || window.innerWidth || layoutRules.promptTargetScreenWidth;
  const targetScreenWidth = Math.min(
    layoutRules.promptTargetScreenWidth,
    Math.max(320, viewportWidth - layoutRules.promptScreenMargin),
  );
  const promptScale = clamp(
    targetScreenWidth / (panelWidth * state.scale),
    layoutRules.promptScaleMin,
    layoutRules.promptScaleMax,
  );
  const nodeWidth = Math.max(mediaWidth, panelWidth);
  const nodeHeight = mediaHeight + (node.expanded ? layoutRules.panelGap + panelHeight * promptScale : 0);

  return {
    mediaWidth,
    mediaHeight,
    panelWidth,
    panelHeight,
    composerHeight,
    advancedSettingsHeight,
    promptScale,
    toolbarScale,
    nodeWidth,
    nodeHeight,
  };
}

function getNodeLayoutTransitionId(node) {
  return `${state.projectId}:${state.activeCanvasId}:${node.id}`;
}

function getNodePresentation(node) {
  const layout = getNodeLayout(node);
  const transition = canvasNodeLayoutTransition.get(getNodeLayoutTransitionId(node));
  if (!transition) return { x: node.x, y: node.y, layout };
  return {
    x: transition.x,
    y: transition.y,
    layout: {
      ...layout,
      nodeWidth: transition.nodeWidth,
      nodeHeight: transition.nodeHeight,
      mediaWidth: transition.mediaWidth,
      mediaHeight: transition.mediaHeight,
    },
  };
}

function toNodeTransitionGeometry(presentation) {
  return {
    x: presentation.x,
    y: presentation.y,
    nodeWidth: presentation.layout.nodeWidth,
    nodeHeight: presentation.layout.nodeHeight,
    mediaWidth: presentation.layout.mediaWidth,
    mediaHeight: presentation.layout.mediaHeight,
  };
}

function applyNodeAspect(node, aspect) {
  if (node.aspect === aspect) return false;
  const from = getNodePresentation(node);
  node.aspect = aspect;
  normalizeNodeParameters(node);
  const nextLayout = getNodeLayout(node);
  const nextPosition = canvasNodePlacement.getBottomCenterAnchoredPosition({
    position: { x: from.x, y: from.y },
    currentLayout: from.layout,
    nextLayout,
  });
  if (!nextPosition) return false;

  node.x = nextPosition.x;
  node.y = nextPosition.y;
  canvasNodeLayoutTransition.start({
    id: getNodeLayoutTransitionId(node),
    from: toNodeTransitionGeometry(from),
    to: toNodeTransitionGeometry({ x: node.x, y: node.y, layout: nextLayout }),
  });
  return true;
}

function getNodeBounds(node) {
  const { x, y, layout } = getNodePresentation(node);
  const promptOverflow =
    node.kind === "generator" && node.expanded
      ? Math.max(0, (layout.panelWidth * layout.promptScale - layout.nodeWidth) / 2)
      : 0;
  return {
    left: x - promptOverflow,
    top: y,
    right: x + layout.nodeWidth + promptOverflow,
    bottom: y + layout.nodeHeight,
    width: layout.nodeWidth + promptOverflow * 2,
    height: layout.nodeHeight,
  };
}

function getNodeVisualBounds(node) {
  const { x, y, layout } = getNodePresentation(node);
  const mediaLeft = x + (layout.nodeWidth - layout.mediaWidth) / 2;
  let left = mediaLeft;
  let right = mediaLeft + layout.mediaWidth;
  let bottom = y + layout.mediaHeight;
  if (node.kind === "generator" && node.expanded) {
    const promptWidth = layout.panelWidth * layout.promptScale;
    const promptLeft = x + (layout.nodeWidth - promptWidth) / 2;
    left = Math.min(left, promptLeft);
    right = Math.max(right, promptLeft + promptWidth);
    bottom += layoutRules.panelGap + layout.panelHeight * layout.promptScale;
  }
  return {
    left,
    top: y,
    right,
    bottom,
    width: right - left,
    height: bottom - y,
  };
}

function getNodeMembershipBounds(node) {
  const { x, y, layout } = getNodePresentation(node);
  const left = x + (layout.nodeWidth - layout.mediaWidth) / 2;
  const top = y;
  return {
    left,
    top,
    right: left + layout.mediaWidth,
    bottom: top + layout.mediaHeight,
    width: layout.mediaWidth,
    height: layout.mediaHeight,
  };
}

function getGroupById(groupId) {
  return state.groups.find((group) => group.id === groupId) || null;
}

function getGroupNodes(group) {
  if (!group) return [];
  return group.nodeIds.map((id) => state.nodes.find((node) => node.id === id)).filter(Boolean);
}

function getNodesContentBounds(nodes) {
  if (!nodes.length) return null;
  const contentBounds = nodes.reduce(
    (bounds, node) => {
      const nodeBounds = getNodeMembershipBounds(node);
      return {
        left: Math.min(bounds.left, nodeBounds.left),
        top: Math.min(bounds.top, nodeBounds.top),
        right: Math.max(bounds.right, nodeBounds.right),
        bottom: Math.max(bounds.bottom, nodeBounds.bottom),
      };
    },
    { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
  );
  return {
    ...contentBounds,
    width: contentBounds.right - contentBounds.left,
    height: contentBounds.bottom - contentBounds.top,
  };
}

function getDefaultGroupBounds(nodes) {
  const contentBounds = getNodesContentBounds(nodes);
  if (!contentBounds) return null;
  const left = contentBounds.left - groupFrameRules.paddingX;
  const top = contentBounds.top - groupFrameRules.paddingTop;
  const width = Math.max(
    groupFrameRules.minWidth,
    contentBounds.width + groupFrameRules.paddingX * 2,
  );
  const height = Math.max(
    groupFrameRules.minHeight,
    contentBounds.height + groupFrameRules.paddingTop + groupFrameRules.paddingBottom,
  );
  return { left, top, right: left + width, bottom: top + height, width, height };
}

function normalizeGroupFrame(group) {
  if (!group) return null;
  if (
    !Number.isFinite(group.x) ||
    !Number.isFinite(group.y) ||
    !Number.isFinite(group.width) ||
    !Number.isFinite(group.height)
  ) {
    const fallback = getDefaultGroupBounds(getGroupNodes(group));
    if (!fallback) return null;
    group.x = fallback.left;
    group.y = fallback.top;
    group.width = fallback.width;
    group.height = fallback.height;
  }

  group.width = Math.max(groupFrameRules.minWidth, group.width);
  group.height = Math.max(groupFrameRules.minHeight, group.height);
  return group;
}

function getGroupBounds(group) {
  const normalized = normalizeGroupFrame(group);
  if (!normalized) return null;
  return {
    left: normalized.x,
    top: normalized.y,
    right: normalized.x + normalized.width,
    bottom: normalized.y + normalized.height,
    width: normalized.width,
    height: normalized.height,
  };
}

function syncGroups() {
  state.groups = state.groups
    .map((group) => ({
      ...group,
      nodeIds: group.nodeIds.filter((id) => {
        const node = state.nodes.find((item) => item.id === id);
        return node && node.groupId === group.id;
      }),
    }));
  const validGroupIds = new Set(state.groups.map((group) => group.id));
  for (const node of state.nodes) {
    if (node.groupId && !validGroupIds.has(node.groupId)) {
      delete node.groupId;
    }
  }
  if (state.activeGroupId && !validGroupIds.has(state.activeGroupId)) {
    state.activeGroupId = null;
  }
}

function setActiveGroup(groupId) {
  state.activeGroupId = groupId;
  setSelection([], null, { keepGroup: true });
  collapseAllGeneratorPanels();
}

function getViewportWorldBounds() {
  const rect = shell.getBoundingClientRect();
  return {
    left: -state.tx / state.scale,
    top: -state.ty / state.scale,
    right: (rect.width - state.tx) / state.scale,
    bottom: (rect.height - state.ty) / state.scale,
  };
}

function getMinimapWorldBounds() {
  const viewport = getViewportWorldBounds();
  const bounds = state.nodes.reduce(
    (acc, node) => {
      const nodeBounds = getNodeBounds(node);
      return {
        left: Math.min(acc.left, nodeBounds.left),
        top: Math.min(acc.top, nodeBounds.top),
        right: Math.max(acc.right, nodeBounds.right),
        bottom: Math.max(acc.bottom, nodeBounds.bottom),
      };
    },
    { ...viewport },
  );

  const width = Math.max(1, bounds.right - bounds.left);
  const height = Math.max(1, bounds.bottom - bounds.top);
  const padding = Math.max(240, Math.max(width, height) * 0.12);

  return {
    left: bounds.left - padding,
    top: bounds.top - padding,
    right: bounds.right + padding,
    bottom: bounds.bottom + padding,
  };
}

function getMinimapMetrics() {
  if (!minimapSurface) return null;
  const rect = minimapSurface.getBoundingClientRect();
  const width = Math.max(1, rect.width || 236);
  const height = Math.max(1, rect.height || 136);
  const world = getMinimapWorldBounds();
  const worldWidth = Math.max(1, world.right - world.left);
  const worldHeight = Math.max(1, world.bottom - world.top);
  const scale = Math.min(width / worldWidth, height / worldHeight);
  const contentWidth = worldWidth * scale;
  const contentHeight = worldHeight * scale;

  return {
    width,
    height,
    world,
    scale,
    contentWidth,
    contentHeight,
    offsetX: (width - contentWidth) / 2,
    offsetY: (height - contentHeight) / 2,
  };
}

function worldRectToMinimapRect(bounds, metrics) {
  const { world, scale, offsetX, offsetY } = metrics;
  return {
    left: offsetX + (bounds.left - world.left) * scale,
    top: offsetY + (bounds.top - world.top) * scale,
    width: Math.max(3, (bounds.right - bounds.left) * scale),
    height: Math.max(3, (bounds.bottom - bounds.top) * scale),
  };
}

function minimapPointToWorld(event, metrics) {
  const rect = minimapSurface.getBoundingClientRect();
  const localX = clamp(event.clientX - rect.left - metrics.offsetX, 0, metrics.contentWidth);
  const localY = clamp(event.clientY - rect.top - metrics.offsetY, 0, metrics.contentHeight);
  return {
    x: metrics.world.left + localX / metrics.scale,
    y: metrics.world.top + localY / metrics.scale,
  };
}

function getMinimapNodeType(node) {
  if (node.kind === "asset") return getActiveAsset(node)?.type || "media";
  return node.mode || "media";
}

function renderMinimap() {
  if (!minimapSurface || state.canvasPanel !== "minimap") return;
  const metrics = getMinimapMetrics();
  if (!metrics) return;

  const nodeMarkers = state.nodes
    .map((node) => {
      const rect = worldRectToMinimapRect(getNodeBounds(node), metrics);
      const type = getMinimapNodeType(node);
      return `<span class="minimap-node ${type}" style="left:${rect.left.toFixed(2)}px;top:${rect.top.toFixed(2)}px;width:${rect.width.toFixed(2)}px;height:${rect.height.toFixed(2)}px"></span>`;
    })
    .join("");
  const viewportRect = worldRectToMinimapRect(getViewportWorldBounds(), metrics);

  minimapSurface.innerHTML = `
    ${nodeMarkers}
    <span class="minimap-view" data-minimap-view="true" style="left:${viewportRect.left.toFixed(2)}px;top:${viewportRect.top.toFixed(2)}px;width:${viewportRect.width.toFixed(2)}px;height:${viewportRect.height.toFixed(2)}px"></span>
  `;
}

function setCanvasPanel(panel) {
  state.canvasPanel = state.canvasPanel === panel ? null : panel;
  canvasToolButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.canvasTool === state.canvasPanel);
  });
  canvasToolPopovers.forEach((popover) => {
    popover.classList.toggle("hidden", popover.dataset.canvasPopover !== state.canvasPanel);
  });
  renderMinimap();
}

function closeCanvasPanel() {
  if (!state.canvasPanel) return;
  state.canvasPanel = null;
  canvasToolButtons.forEach((button) => button.classList.remove("active"));
  canvasToolPopovers.forEach((popover) => popover.classList.add("hidden"));
}

function closeGroupLayoutMenus() {
  if (!state.groups.some((group) => group.layoutMenuOpen)) return;
  state.groups.forEach((group) => {
    group.layoutMenuOpen = false;
  });
  render();
}

function presetFrom(node) {
  return {
    mode: node.mode,
    model: node.model,
    aspect: node.aspect,
    resolution: node.resolution,
    quality: node.quality,
    duration: node.duration,
    outputFormat: node.outputFormat,
    count: node.count,
    workflow: node.workflow,
    omniReferenceTaskType: node.omniReferenceTaskType,
    audioEnabled: node.audioEnabled,
  };
}

function rememberPreset(node) {
  if (node?.kind !== "generator") return;
  state.lastPreset = presetFrom(node);
}

function applyPreset(node, preset) {
  node.mode = preset.mode === "video" ? "video" : "image";
  node.model = preset.model;
  node.aspect = preset.aspect;
  node.resolution = preset.resolution;
  node.quality = preset.quality;
  node.duration = preset.duration;
  node.outputFormat = preset.outputFormat;
  node.count = preset.count;
  node.workflow = preset.workflow;
  node.omniReferenceTaskType = preset.omniReferenceTaskType;
  node.audioEnabled = preset.audioEnabled;
  normalizeNodeParameters(node);
  node.modelFilter = node.mode;
}

function cloneNode(source) {
  const assets = (source.assets || []).map((asset) => ({ ...asset, id: crypto.randomUUID() }));
  const activeAssetIndex = (source.assets || []).findIndex((asset) => asset.id === source.activeAssetId);
  const clone = {
    ...source,
    id: crypto.randomUUID(),
    x: source.x,
    y: source.y,
    assets,
    activeAssetId: assets[activeAssetIndex]?.id || assets[0]?.id || null,
    generatedAsset: source.generatedAsset ? { ...source.generatedAsset, id: crypto.randomUUID() } : null,
    generating: false,
    expanded: source.kind === "generator" ? source.expanded : false,
    panel: null,
    modelFilter: source.kind === "generator" ? source.mode : undefined,
    groupId: undefined,
    z: nextZ(),
  };
  delete clone.generationTaskId;
  return clone;
}

function getActiveNode() {
  return state.nodes.find((node) => node.id === state.activeId) || null;
}

function setSelection(ids, activeId = null, options = {}) {
  const uniqueIds = ids.filter((id, index) => ids.indexOf(id) === index);
  state.selectedIds = new Set(uniqueIds);
  state.activeId = activeId && state.selectedIds.has(activeId) ? activeId : uniqueIds[uniqueIds.length - 1] || null;
  if (uniqueIds.length !== 1 || !state.selectedIds.has(state.mediaToolbarNodeId)) {
    state.mediaToolbarNodeId = null;
  }
  state.nodes.forEach((node) => {
    if (uniqueIds.length !== 1 || node.id !== state.activeId) {
      node.mediaMenuOpen = false;
    }
  });
  if (!options.keepGroup) {
    state.activeGroupId = null;
  }
  if (!options.keepConnection) {
    state.activeConnectionId = null;
  }
}

function clearSelection() {
  setSelection([]);
}

function bringNodesToFront(nodes) {
  for (const node of nodes) {
    node.z = nextZ();
  }
}

function collapseInactiveNodes(activeId) {
  for (const node of state.nodes) {
    if (node.kind !== "generator") continue;
    if (node.id !== activeId) {
      node.expanded = false;
      node.panel = null;
      node.advancedSettingsExpanded = false;
    }
  }
}

function collapseAllGeneratorPanels() {
  for (const node of state.nodes) {
    if (node.kind !== "generator") continue;
    node.expanded = false;
    node.panel = null;
    node.advancedSettingsExpanded = false;
  }
}

function closeMediaToolbarState() {
  let changed = Boolean(state.mediaToolbarNodeId);
  state.mediaToolbarNodeId = null;
  state.nodes.forEach((node) => {
    if (node.mediaMenuOpen) changed = true;
    node.mediaMenuOpen = false;
  });
  return changed;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function sanitizeRuntimeMediaUrl(value) {
  const url = String(value ?? "").trim().slice(0, 2_048);
  if (!url || /[\u0000-\u001f\u007f<>"'`]/.test(url)) return "";
  const compact = url.replace(/[\u0000-\u0020]+/g, "");
  const scheme = compact.match(/^([a-z][a-z\d+.-]*):/i)?.[1]?.toLowerCase();
  if (scheme && !["http", "https", "blob"].includes(scheme)) {
    const safeDataMedia = /^data:(?:image\/(?:avif|gif|jpe?g|png|webp)|video\/(?:mp4|ogg|webm)|audio\/(?:aac|mpeg|ogg|wav|webm))(?:;|,)/i;
    if (!safeDataMedia.test(compact)) return "";
  }
  if (!scheme && !/^\/(?!\/)/.test(url) && !/^\.\.?\//.test(url)) return "";
  return url;
}

function safeMediaAttributeUrl(value) {
  return escapeHtml(sanitizeRuntimeMediaUrl(value));
}

const fallbackIconPaths = {
  "align-horizontal-space-around": '<path d="M4 18V6"/><path d="M20 18V6"/><path d="M8 12h8"/><path d="m14 9 3 3-3 3"/><path d="m10 9-3 3 3 3"/>',
  "align-vertical-space-around": '<path d="M6 4h12"/><path d="M6 20h12"/><path d="M12 8v8"/><path d="m9 14 3 3 3-3"/><path d="m9 10 3-3 3 3"/>',
  "archive": '<path d="M4 7h16"/><path d="M6 7v12h12V7"/><path d="M4 4h16v3H4z"/><path d="M9 11h6"/>',
  "arrow-right-from-line": '<path d="M3 5v14"/><path d="M21 12H7"/><path d="m15 18 6-6-6-6"/>',
  "arrow-up": '<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>',
  "audio-lines": '<path d="M4 10v4"/><path d="M8 8v8"/><path d="M12 5v14"/><path d="M16 8v8"/><path d="M20 10v4"/>',
  "audio-waveform": '<path d="M3 12h2"/><path d="M7 9v6"/><path d="M11 5v14"/><path d="M15 8v8"/><path d="M19 10v4"/><path d="M21 12h-1"/>',
  "badge-check": '<path d="M12 3 14.1 5.1 17 4.4 17.8 7.2 20.6 8 19.9 10.9 22 13 19.9 15.1 20.6 18 17.8 18.8 17 21.6 14.1 20.9 12 23 9.9 20.9 7 21.6 6.2 18.8 3.4 18 4.1 15.1 2 13 4.1 10.9 3.4 8 6.2 7.2 7 4.4 9.9 5.1z"/><path d="m8.5 12.5 2.3 2.3 4.9-5"/>',
  "badge-hd": '<path d="M5 7h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z"/><path d="M7 10v4"/><path d="M10 10v4"/><path d="M7 12h3"/><path d="M14 10v4h2.2a2 2 0 0 0 0-4z"/>',
  "book-open": '<path d="M12 6.5A5 5 0 0 0 7 4H4v15h3a5 5 0 0 1 5 3z"/><path d="M12 6.5A5 5 0 0 1 17 4h3v15h-3a5 5 0 0 0-5 3z"/><path d="M12 6.5V22"/>',
  "book-open-check": '<path d="M12 6.5A5 5 0 0 0 7 4H4v15h3a5 5 0 0 1 5 3z"/><path d="M12 6.5A5 5 0 0 1 17 4h3v8"/><path d="M12 6.5V22"/><path d="m15 18 2 2 4-5"/>',
  "bot": '<path d="M12 8V4"/><path d="M8 4h8"/><rect x="5" y="8" width="14" height="10" rx="3"/><path d="M9 13h.01"/><path d="M15 13h.01"/><path d="M9 17h6"/>',
  "box": '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  "building-2": '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18"/><path d="M4 22h16"/><path d="M9 6h1"/><path d="M14 6h1"/><path d="M9 10h1"/><path d="M14 10h1"/><path d="M9 14h1"/><path d="M14 14h1"/>',
  "calendar-days": '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4"/><path d="M8 3v4"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/>',
  "check": '<path d="m5 12 4 4 10-10"/>',
  "chevron-down": '<path d="m6 9 6 6 6-6"/>',
  "chevron-left": '<path d="m15 18-6-6 6-6"/>',
  "chevron-right": '<path d="m9 6 6 6-6 6"/>',
  "circle": '<circle cx="12" cy="12" r="8"/>',
  "circle-dollar-sign": '<circle cx="12" cy="12" r="9"/><path d="M12 6v12"/><path d="M15.5 8.5c-.8-.6-1.8-1-3.1-1-1.7 0-3 .8-3 2.1 0 3 6.1 1.5 6.1 4.8 0 1.4-1.4 2.3-3.2 2.3-1.4 0-2.6-.4-3.6-1.2"/>',
  "circle-help": '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.6-3 4"/><path d="M12 17h.01"/>',
  "circle-play": '<circle cx="12" cy="12" r="10"/><path d="m10 8 6 4-6 4z"/>',
  "combine": '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/><path d="M11 7h4a2 2 0 0 1 2 2v4"/><path d="M13 17H9a2 2 0 0 1-2-2v-4"/>',
  "crop": '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M2 6h14a2 2 0 0 1 2 2v14"/><path d="M14 14 20 8"/>',
  "download": '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  "ellipsis": '<path d="M5 12h.01"/><path d="M12 12h.01"/><path d="M19 12h.01"/>',
  "ellipsis-vertical": '<path d="M12 5h.01"/><path d="M12 12h.01"/><path d="M12 19h.01"/>',
  "eraser": '<path d="m7 21-4-4 9.5-9.5a3 3 0 0 1 4.2 0l1.8 1.8a3 3 0 0 1 0 4.2L11 21z"/><path d="m9 12 6 6"/><path d="M7 21h12"/>',
  "eye": '<path d="M2.1 12s3.6-7 9.9-7 9.9 7 9.9 7-3.6 7-9.9 7-9.9-7-9.9-7"/><circle cx="12" cy="12" r="3"/>',
  "filter-x": '<path d="M4 5h16l-6 7v5l-4 2v-7z"/><path d="m16 16 4 4"/><path d="m20 16-4 4"/>',
  "focus": '<circle cx="12" cy="12" r="3"/><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>',
  "folder": '<path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z"/>',
  "folder-input": '<path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z"/><path d="M12 9v7"/><path d="m9 13 3 3 3-3"/>',
  "folder-plus": '<path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z"/><path d="M12 10v6"/><path d="M9 13h6"/>',
  "folders": '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v1"/><path d="M5 10a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/>',
  "gauge": '<path d="M4 14a8 8 0 0 1 16 0"/><path d="M12 14 16 9"/><path d="M5 20h14"/>',
  "grid-3x3": '<path d="M4 4h16v16H4z"/><path d="M4 9.3h16"/><path d="M4 14.7h16"/><path d="M9.3 4v16"/><path d="M14.7 4v16"/>',
  "grid-2x2": '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  "house": '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>',
  "image": '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="m21 16-5-5-4 4-2-2-5 5"/>',
  "images": '<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M3 17V7a4 4 0 0 1 4-4h10"/><path d="m19 15-4-4-3 3-1.5-1.5L7 16"/>',
  "keyboard": '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01"/><path d="M11 10h.01"/><path d="M15 10h.01"/><path d="M7 14h10"/>',
  "layers-3": '<path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
  "layout-grid": '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
  "list": '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
  "list-checks": '<path d="M13 5h8"/><path d="M13 12h8"/><path d="M13 19h8"/><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/>',
  "list-filter": '<path d="M3 6h18"/><path d="M6 12h12"/><path d="M10 18h4"/>',
  "log-out": '<path d="M10 17v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v2"/><path d="M15 17l5-5-5-5"/><path d="M20 12H9"/>',
  "map": '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15"/><path d="M15 6v15"/>',
  "message-square-plus": '<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/><path d="M12 8v6"/><path d="M9 11h6"/>',
  "maximize-2": '<path d="M15 3h6v6"/><path d="m14 10 7-7"/><path d="M9 21H3v-6"/><path d="m10 14-7 7"/>',
  "minimize-2": '<path d="M4 14h6v6"/><path d="m10 14-7 7"/><path d="M20 10h-6V4"/><path d="m14 10 7-7"/>',
  "monitor": '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8"/><path d="M12 16v4"/>',
  "moon": '<path d="M21 13.2A7.5 7.5 0 1 1 10.8 3 6 6 0 0 0 21 13.2z"/>',
  "more-horizontal": '<path d="M5 12h.01"/><path d="M12 12h.01"/><path d="M19 12h.01"/>',
  "mouse-pointer-click": '<path d="m4 4 7 17 2-7 7-2z"/><path d="M15 4h5"/><path d="M18 2v5"/>',
  "mouse-pointer-2": '<path d="M4 4l7.1 17 2.5-7.4L21 11z"/>',
  "panel-left-close": '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path d="m16 9-3 3 3 3"/>',
  "panel-right-close": '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/><path d="m8 9 3 3-3 3"/>',
  "panels-top-left": '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 9v12"/>',
  "paperclip": '<path d="m21 8.5-9.5 9.5a5 5 0 0 1-7.1-7.1l10-10a3.3 3.3 0 0 1 4.7 4.7L9.5 15a1.7 1.7 0 0 1-2.4-2.4L16 3.8"/>',
  "pause": '<path d="M8 5v14"/><path d="M16 5v14"/>',
  "pencil": '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"/>',
  "pin": '<path d="M12 17v5"/><path d="M6 17h12"/><path d="m8 3 8 8"/><path d="M9 3h6l-1 5 4 4-3 3-4-4-5 1z"/>',
  "pin-off": '<path d="m2 2 20 20"/><path d="M12 17v5"/><path d="M6 17h12"/><path d="M9 3h6l-1 5 4 4-2 2"/><path d="M8 12l-2 .5 5-5"/>',
  "play": '<path d="m8 5 12 7-12 7z"/>',
  "play-square": '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m10 8 6 4-6 4z"/>',
  "square-play": '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m10 8 6 4-6 4z"/>',
  "plus": '<path d="M12 5v14"/><path d="M5 12h14"/>',
  "rotate-cw": '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
  "scan": '<path d="M7 3H5a2 2 0 0 0-2 2v2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M8 12h8"/>',
  "scan-search": '<path d="M7 3H5a2 2 0 0 0-2 2v2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="11" cy="11" r="3"/><path d="m14 14 3 3"/>',
  "scissors": '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.6 8.6 19 19"/><path d="M8.6 15.4 19 5"/>',
  "search": '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  "search-x": '<circle cx="10.5" cy="10.5" r="7"/><path d="m20 20-4.5-4.5"/><path d="m8 8 5 5"/><path d="m13 8-5 5"/>',
  "send-horizontal": '<path d="M3 12 21 4l-5 16-4-7z"/><path d="M12 13 21 4"/>',
  "settings": '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 0 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 1 1 7.1 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1z"/>',
  "settings-2": '<path d="M4 7h10"/><path d="M18 7h2"/><circle cx="16" cy="7" r="2"/><path d="M4 17h2"/><path d="M10 17h10"/><circle cx="8" cy="17" r="2"/>',
  "share-2": '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4"/><path d="m8.6 13.5 6.8 4"/>',
  "shield-check": '<path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3z"/><path d="m9 12 2 2 4-4"/>',
  "sliders-horizontal": '<path d="M4 6h9"/><path d="M17 6h3"/><circle cx="15" cy="6" r="2"/><path d="M4 12h3"/><path d="M11 12h9"/><circle cx="9" cy="12" r="2"/><path d="M4 18h11"/><path d="M19 18h1"/><circle cx="17" cy="18" r="2"/>',
  "sparkles": '<path d="m12 3 1.7 5.1L19 10l-5.3 1.9L12 17l-1.7-5.1L5 10l5.3-1.9z"/><path d="M5 3v4"/><path d="M3 5h4"/><path d="M19 17v4"/><path d="M17 19h4"/>',
  "notepad-text-dashed": '<path d="M5 3h14v18H5z"/><path d="M9 3v3"/><path d="M15 3v3"/><path d="M8 10h8"/><path d="M8 14h5"/>',
  "square-plus": '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8"/><path d="M8 12h8"/>',
  "square": '<rect x="4" y="4" width="16" height="16" rx="2"/>',
  "square-check-big": '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m8 12 3 3 6-6"/>',
  "copy-check": '<path d="m12 15 2 2 4-4"/><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  "sun": '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.9 4.9 1.4 1.4"/><path d="m17.7 17.7 1.4 1.4"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m4.9 19.1 1.4-1.4"/><path d="m17.7 6.3 1.4-1.4"/>',
  "timer": '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2"/><path d="M9 2h6"/>',
  "type": '<path d="M4 5h16"/><path d="M10 5v14"/><path d="M14 5v14"/><path d="M8 19h8"/>',
  "trash-2": '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/>',
  "ungroup": '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><path d="M14 4h3a3 3 0 0 1 3 3v3"/><path d="M10 20H7a3 3 0 0 1-3-3v-3"/>',
  "upload": '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14a2 2 0 0 0 2-2v-3"/><path d="M3 15v3a2 2 0 0 0 2 2"/>',
  "user-round": '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  "user-round-plus": '<circle cx="10" cy="8" r="4"/><path d="M2 21a8 8 0 0 1 14-5"/><path d="M19 14v6"/><path d="M16 17h6"/>',
  "users": '<path d="M16 21a6 6 0 0 0-12 0"/><circle cx="10" cy="8" r="4"/><path d="M22 21a5 5 0 0 0-5-5"/><path d="M17 4.5a3.5 3.5 0 0 1 0 7"/>',
  "users-round": '<path d="M16 21a6 6 0 0 0-12 0"/><circle cx="10" cy="8" r="4"/><path d="M22 21a5 5 0 0 0-5-5"/><path d="M17 4.5a3.5 3.5 0 0 1 0 7"/>',
  "video": '<path d="M15 10.5 21 7v10l-6-3.5z"/><rect x="3" y="6" width="12" height="12" rx="2"/>',
  "volume-2": '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15 9a4 4 0 0 1 0 6"/><path d="M18 6a8 8 0 0 1 0 12"/>',
  "volume-x": '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="m17 10 4 4"/><path d="m21 10-4 4"/>',
  "x": '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
};

function createFallbackIcon(name, sourceIcon) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", sourceIcon?.getAttribute("aria-hidden") || "true");
  svg.classList.add("lucide", `lucide-${name}`);
  sourceIcon?.classList?.forEach((className) => svg.classList.add(className));
  svg.dataset.fallbackIcon = name;
  svg.innerHTML = fallbackIconPaths[name] || fallbackIconPaths.circle;
  return svg;
}

function renderFallbackIcons() {
  document.querySelectorAll("i[data-lucide]").forEach((icon) => {
    icon.replaceWith(createFallbackIcon(icon.dataset.lucide || "circle", icon));
  });
}

function renderCustomFallbackIcons() {
  document.querySelectorAll('i[data-lucide="badge-hd"]').forEach((icon) => {
    icon.replaceWith(createFallbackIcon("badge-hd", icon));
  });
}

function refreshIcons() {
  renderCustomFallbackIcons();
  if (window.lucide) {
    try {
      window.lucide.createIcons({
        attrs: {
          "stroke-width": 1.8,
        },
      });
    } catch {
      renderFallbackIcons();
      return;
    }
  }
  renderFallbackIcons();
}

function formatCredit(value) {
  return new Intl.NumberFormat("zh-CN", { useGrouping: false }).format(Math.max(0, Math.round(value || 0)));
}

function syncCreditDisplay() {
  const credits = new Intl.NumberFormat("zh-CN").format(Math.max(0, Math.round(state.account.credits || 0)));
  if (profileCreditValue) {
    profileCreditValue.textContent = credits;
    profileCreditValue.closest("[data-profile-action='credits']")
      ?.setAttribute("aria-label", `查看我的积分，当前 ${credits}`);
  }
  if (agentCreditValue) agentCreditValue.textContent = credits;
  if (agentSendButton) {
    const label = `发送；当前可用积分 ${credits}`;
    agentSendButton.title = label;
    agentSendButton.setAttribute("aria-label", label);
  }
}

function hasEnoughCredits(cost) {
  return state.account.credits >= cost;
}

function chargeCredits(cost) {
  const amount = Math.max(0, Math.round(cost || 0));
  state.account.credits = Math.max(0, state.account.credits - amount);
  state.account.consumedCredits += amount;
  syncCreditDisplay();
}

function getAssetType(file) {
  const mime = file.type || "";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";

  const name = file.name.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|avif|svg)$/.test(name)) return "image";
  if (/\.(mp4|mov|webm|m4v|avi|mkv)$/.test(name)) return "video";
  if (/\.(mp3|wav|m4a|aac|ogg|flac)$/.test(name)) return "audio";
  return null;
}

function assetTypeLabel(type) {
  if (type === "video") return "视频";
  if (type === "audio") return "音频";
  return "图片";
}

function mediaIconName(type) {
  if (type === "video") return "play-square";
  if (type === "audio") return "audio-lines";
  return "image";
}

function fileDisplayName(name, fallback = "未命名素材") {
  const cleaned = String(name || "").trim();
  if (!cleaned) return fallback;
  return cleaned.replace(/\.[^/.]+$/, "") || fallback;
}

function getAssetDisplayName(asset) {
  if (!asset) return "";
  return asset.displayName || fileDisplayName(asset.name, `${assetTypeLabel(asset.type)}素材`);
}

function defaultGeneratedName(node) {
  return node.mode === "video" ? "未命名视频" : "未命名图片";
}

function getGeneratedResolution(node) {
  if (node.model === "gpt-image-2") {
    const targetPixels = {
      "1K": 1024 * 1024,
      "2K": 2048 * 2048,
      "4K": 3840 * 2160,
    };
    const ratio = aspectStringToRatio(node.aspect);
    const area = targetPixels[node.resolution] || targetPixels["2K"];
    let width = Math.sqrt(area * ratio);
    let height = Math.sqrt(area / ratio);
    const edgeScale = Math.min(1, 3840 / Math.max(width, height));
    width = Math.max(16, Math.floor((width * edgeScale) / 16) * 16);
    height = Math.max(16, Math.floor((height * edgeScale) / 16) * 16);
    return { width, height };
  }
  const longEdgeByResolution = {
    "1024px": 1024,
    "1K": 1024,
    "2K": 2048,
    "4K": 4096,
  };
  const longEdge = longEdgeByResolution[node.resolution] || 2048;
  const ratio = aspectStringToRatio(node.aspect);
  if (ratio >= 1) {
    return {
      width: longEdge,
      height: Math.round(longEdge / ratio),
    };
  }
  return {
    width: Math.round(longEdge * ratio),
    height: longEdge,
  };
}

function formatMediaSize(width, height) {
  if (!width || !height) return "";
  return `${Math.round(width)} x ${Math.round(height)}`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const totalSeconds = Math.round(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const rest = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

function getMediaTitle(node, asset = getActiveAsset(node)) {
  if (node.kind === "asset") return getAssetDisplayName(asset);
  if (!node.preview) return "";
  if (node.generatedAsset?.displayName) return node.name || node.generatedAsset.displayName;
  return node.name || defaultGeneratedName(node);
}

function getMediaSpec(node, asset = getActiveAsset(node)) {
  if (node.kind === "asset") {
    if (!asset) return "";
    if (asset.type === "audio") return formatDuration(asset.duration);
    return formatMediaSize(asset.width, asset.height);
  }

  if (!node.preview) return "";
  if (node.mode === "video") return getCapabilityDisplayLabel(node, "quality", node.quality);
  if (node.generatedAsset?.width && node.generatedAsset?.height) return formatMediaSize(node.generatedAsset.width, node.generatedAsset.height);
  const size = getGeneratedResolution(node);
  return formatMediaSize(size.width, size.height);
}

function mediaMeta(node) {
  const asset = getActiveAsset(node);
  const type = node.kind === "asset" ? asset?.type : node.mode;
  const title = getMediaTitle(node, asset);
  const typeLabel = node.kind === "generator" && !title
    ? node.mode === "video" ? "Video" : "Image"
    : "";
  const displayTitle = title || typeLabel;
  const spec = getMediaSpec(node, asset);
  if (!displayTitle && !spec) return "";
  if (typeLabel && !spec) {
    return `
      <div class="media-meta generator-type-meta">
        <div class="media-title">
          <i data-lucide="${mediaIconName(type)}" aria-hidden="true"></i>
          <span class="media-name">${escapeHtml(typeLabel)}</span>
        </div>
      </div>
    `;
  }

  return `
    <div class="media-meta ${typeLabel ? "generator-type-meta" : ""}">
      ${
        displayTitle
          ? `<div class="media-title" data-title-shell="true" role="button" tabindex="0" title="双击重命名">
              <i data-lucide="${mediaIconName(type)}" aria-hidden="true"></i>
              <span class="media-name" data-media-title="true">${escapeHtml(displayTitle)}</span>
            </div>`
          : ""
      }
      ${spec ? `<div class="media-spec">${escapeHtml(spec)}</div>` : ""}
    </div>
  `;
}

function getEditableMedia(node) {
  if (node.kind === "asset") return getActiveAsset(node);
  return node.generatedAsset || null;
}

function cloneConnectionState(connection) {
  return { ...connection };
}

function executeConnectionCommand(type, changes, { recordUndo = true } = {}) {
  const canvas = getActiveCanvas();
  if (!canvas) {
    return { ok: false, error: { code: "canvas-not-found", message: "Active canvas was not found." } };
  }
  const result = canvasCommandExecutor.execute({
    id: crypto.randomUUID(),
    type,
    canvasId: canvas.id,
    changes,
  }, { recordUndo });
  if (!result.ok) {
    console.error("Canvas connection command was rejected.", result.error);
    showActionToast("画布内容已变化，请重试连接操作");
  } else if (result.effectError) {
    console.error("Canvas connection command committed but its save effect failed.", result.effectError);
  }
  return result;
}

function getIncomingConnections(nodeId) {
  return state.connections.filter((connection) => connection.targetNodeId === nodeId);
}

function getConnectionPortPoint(node, side) {
  const { x, y, layout } = getNodePresentation(node);
  const mediaLeft = x + (layout.nodeWidth - layout.mediaWidth) / 2;
  return {
    x: side === "input" ? mediaLeft : mediaLeft + layout.mediaWidth,
    y: y + layout.mediaHeight / 2,
  };
}

function getConnectionPortId(nodeId, side) {
  return `${nodeId}:${side}`;
}

function nodePortMarkup(node) {
  const input = node.kind === "generator"
    ? '<span class="node-port-zone node-port-zone-input" data-node-port-zone="input"><button class="node-port node-port-input" data-node-port="input" data-port-ratio="0.5" type="button" aria-label="连接上游素材"></button></span>'
    : "";
  const output = node.kind === "generator" || getEditableMedia(node)
    ? '<span class="node-port-zone node-port-zone-output" data-node-port-zone="output"><button class="node-port node-port-output" data-node-port="output" data-port-ratio="0.5" type="button" aria-label="连接到下游节点"></button></span>'
    : "";
  return `${input}${output}`;
}

function getConnectionContext() {
  const selected = new Set(state.selectedIds);
  const incomingNodeIds = new Set();
  const outgoingNodeIds = new Set();
  const relatedConnectionIds = new Set();
  state.connections.forEach((connection) => {
    incomingNodeIds.add(connection.targetNodeId);
    outgoingNodeIds.add(connection.sourceNodeId);
    if (selected.has(connection.sourceNodeId) || selected.has(connection.targetNodeId)) {
      relatedConnectionIds.add(connection.id);
    }
  });
  return {
    incomingNodeIds,
    outgoingNodeIds,
    relatedConnectionIds,
  };
}

function syncConnectionContextClasses(context) {
  nodeLayer.querySelectorAll(".canvas-node").forEach((element) => {
    const nodeId = element.dataset.id;
    const inputPort = element.querySelector(".node-port-input");
    const outputPort = element.querySelector(".node-port-output");
    inputPort?.classList.toggle("is-connected", context.incomingNodeIds.has(nodeId));
    outputPort?.classList.toggle("is-connected", context.outgoingNodeIds.has(nodeId));
  });
}

function resolveConnectionPoints(connection) {
  const source = state.nodes.find((node) => node.id === connection.sourceNodeId);
  const target = state.nodes.find((node) => node.id === connection.targetNodeId);
  if (!source || !target) return null;
  return {
    source: getConnectionPortPoint(source, "output"),
    target: getConnectionPortPoint(target, "input"),
  };
}

function renderConnections() {
  if (!connectionPaths || !connectionPreview) return;

  const context = getConnectionContext();
  const hasFocusedContext = Boolean(state.activeConnectionId || state.selectedIds.size);
  canvasConnectionRenderer.renderConnections({
    connections: state.connections,
    activeConnectionId: state.activeConnectionId,
    relatedConnectionIds: context.relatedConnectionIds,
    connectionFeedbacks: state.connectionFeedbacks,
    onFeedbackStart: (connectionId, token) => canvasConnectionFeedback.start(connectionId, token),
    onFeedbackComplete: (connectionId, token) => canvasConnectionFeedback.complete(connectionId, token),
    hasFocusedContext,
    controlScale: clamp(1 / state.scale, 0.72, 2.4),
    getPath: canvasConnections.getBezierPath,
    resolvePoints: resolveConnectionPoints,
  });
  const previewAction = state.action || state.connectionDrop?.previewAction || null;
  canvasConnectionRenderer.renderPreview(previewAction, canvasConnections.getBezierPath);
  shell.classList.toggle("connection-pending-create", Boolean(previewAction?.pendingCreate));
  syncConnectionContextClasses(context);
  shell.classList.toggle("connection-compact-detail", state.scale >= 0.34 && state.scale < 0.56);
  shell.classList.toggle("connection-low-detail", state.scale < 0.34);
}

function createConnection(
  sourceNodeId,
  targetNodeId,
  {
    recordUndo = true,
    sourceRatio = 0.5,
    targetRatio = 0.5,
    feedbackDirection = "forward",
  } = {},
) {
  if (!requireCanvasMutation()) return null;
  const result = canvasConnections.canConnect(state.connections, state.nodes, sourceNodeId, targetNodeId);
  if (!result.ok) return null;
  const source = state.nodes.find((node) => node.id === sourceNodeId);
  if (!source || (source.kind !== "generator" && !getEditableMedia(source))) return null;
  const connection = {
    id: crypto.randomUUID(),
    sourceNodeId,
    targetNodeId,
    mediaType: getNodeMediaType(source),
    sourcePortId: getConnectionPortId(sourceNodeId, "output"),
    targetPortId: getConnectionPortId(targetNodeId, "input"),
    sourceRatio: clamp(sourceRatio, 0.08, 0.92),
    targetRatio: clamp(targetRatio, 0.08, 0.92),
  };
  const commandResult = executeConnectionCommand("connection-create", [{
    collection: "connections",
    id: connection.id,
    before: { record: null },
    after: { record: connection, index: state.connections.length },
  }], { recordUndo });
  if (!commandResult.ok) return null;
  setConnectionFeedback([connection], feedbackDirection);
  return connection;
}

function clearRecentConnectionFeedback(connectionIds = state.connectionFeedbacks) {
  canvasConnectionFeedback.clear(connectionIds);
}

function setConnectionFeedback(connections, direction = "forward") {
  if (reducedMotionQuery.matches) return [];
  const cohortSize = connections.length;
  const entries = connections.map((connection) => ({
    id: connection.id,
    direction,
    profile: canvasConnectionFeedbackMotion.createFeedbackProfile({ cohortSize }),
  }));
  return canvasConnectionFeedback.add(entries);
}

function createConnectionsBatch(sourceNodeIds, targetNodeId) {
  const plan = canvasConnections.planBatchConnections(
    state.connections,
    state.nodes,
    sourceNodeIds,
    targetNodeId,
  );
  const created = plan.validSourceIds
    .map((sourceNodeId) => {
      const source = state.nodes.find((node) => node.id === sourceNodeId);
      if (!source || (source.kind !== "generator" && !getEditableMedia(source))) return null;
      return {
        id: crypto.randomUUID(),
        sourceNodeId,
        targetNodeId,
        mediaType: getNodeMediaType(source),
        sourcePortId: getConnectionPortId(sourceNodeId, "output"),
        targetPortId: getConnectionPortId(targetNodeId, "input"),
        sourceRatio: 0.5,
        targetRatio: 0.5,
      };
    })
    .filter(Boolean);
  if (created.length) {
    const startIndex = state.connections.length;
    const commandResult = executeConnectionCommand(
      "connections-create-batch",
      created.map((connection, index) => ({
        collection: "connections",
        id: connection.id,
        before: { record: null },
        after: { record: connection, index: startIndex + index },
      })),
    );
    if (!commandResult.ok) return { created: [], rejected: plan.rejected };
    setConnectionFeedback(created);
  }
  return { created, rejected: plan.rejected };
}

function removeConnection(connectionId, { recordUndo = true } = {}) {
  if (!requireCanvasMutation()) return false;
  const connectionIndex = state.connections.findIndex((item) => item.id === connectionId);
  if (connectionIndex === -1) return false;
  const connection = state.connections[connectionIndex];
  const commandResult = executeConnectionCommand("connection-remove", [{
    collection: "connections",
    id: connection.id,
    before: { record: connection, index: connectionIndex },
    after: { record: null },
  }], { recordUndo });
  if (!commandResult.ok) return false;
  clearRecentConnectionFeedback([connectionId]);
  if (state.activeConnectionId === connectionId) state.activeConnectionId = null;
  render();
  return true;
}

function getNodeMediaType(node) {
  return getEditableMedia(node)?.type || node.mode || "image";
}

function shouldShowMediaEditToolbar(node) {
  return Boolean(
    getEditableMedia(node) &&
      state.selectedIds.size === 1 &&
      state.selectedIds.has(node.id) &&
      state.mediaToolbarNodeId === node.id,
  );
}

function getMediaToolLabel(toolId, type) {
  if (toolId !== "enhance") return mediaToolDefinitions[toolId]?.label || toolId;
  if (type === "audio") return "音质增强";
  return type === "video" ? "画质增强" : "HD 放大";
}

function getMediaToolPresentation(toolId, type) {
  const definition = mediaToolDefinitions[toolId];
  if (!definition) return null;
  return { id: toolId, icon: definition.icon, label: getMediaToolLabel(toolId, type) };
}

function mediaEditToolbar(node, layout) {
  const asset = getEditableMedia(node);
  if (!asset || !shouldShowMediaEditToolbar(node)) return "";
  const type = getNodeMediaType(node);
  const preference = state.mediaToolPreferences[type] || defaultMediaToolPreferences[type];
  const showLabels = preference.showLabels && layout.mediaWidth >= 440;
  const unpinned = mediaToolsByType[type].filter((tool) => !preference.tools.includes(tool));
  return canvasMediaToolbarView.renderMediaToolbar({
    visible: true,
    toolbarScale: layout.toolbarScale,
    showLabels,
    menuOpen: node.mediaMenuOpen,
    pinnedTools: preference.tools.map((tool) => getMediaToolPresentation(tool, type)).filter(Boolean),
    unpinnedTools: unpinned.map((tool) => getMediaToolPresentation(tool, type)).filter(Boolean),
  });
}

function assetPreview(asset) {
  const safeUrl = safeMediaAttributeUrl(asset.url);
  if (!safeUrl) {
    if (asset.type === "video") return `<span class="asset-glyph">▣</span>`;
    if (asset.type === "audio") return `<span class="asset-glyph">♬</span>`;
    return `<span class="asset-glyph">▧</span>`;
  }
  if (asset.type === "image") {
    return `<img src="${safeUrl}" alt="" draggable="false" />`;
  }
  if (asset.type === "video") {
    return `
      <video src="${safeUrl}" muted playsinline preload="metadata" draggable="false"></video>
      <span class="video-play">▶</span>
    `;
  }
  return `
    <span class="audio-wave" aria-hidden="true">
      <i></i><i></i><i></i><i></i><i></i>
    </span>
  `;
}

function createAssetsFromFiles(files) {
  return Array.from(files)
    .map((file) => {
      const type = getAssetType(file);
      if (!type) return null;
      return {
        id: crypto.randomUUID(),
        type,
        name: file.name || assetTypeLabel(type),
        displayName: fileDisplayName(file.name, assetTypeLabel(type)),
        url: URL.createObjectURL(file),
        aspectRatio: type === "audio" ? layoutRules.audioRatio : null,
        source: "local",
      };
    })
    .filter(Boolean);
}

async function createPersistedAssetsFromFiles(files) {
  if (window.parent === window) return createAssetsFromFiles(files);
  if (!state.hostCapabilities.assetPersistence) {
    showActionToast("当前项目尚未接入资产持久化，无法添加本地文件");
    return [];
  }
  const accepted = Array.from(files || [])
    .map((file) => ({ file, mediaKind: getAssetType(file) }))
    .filter((entry) => entry.mediaKind);
  if (!accepted.length) return [];
  try {
    return await Promise.all(accepted.map(async ({ file, mediaKind }) => {
      const projectAsset = await canvasMediaAssets.persistFile(file, {
        mediaKind,
        displayName: fileDisplayName(file.name, assetTypeLabel(mediaKind)),
        contentType: file.type || defaultUploadContentType(mediaKind),
      });
      return projectAssetToLibraryMedia(projectAsset);
    }));
  } catch (error) {
    showActionToast(error?.message || "媒体上传失败");
    return [];
  }
}

function cloneAsset(asset, source = asset.source) {
  const librarySourceId = asset.librarySourceId
    || asset.workspaceAssetId
    || asset.platformSourceId
    || asset.sourceId
    || asset.id;
  return {
    ...asset,
    id: crypto.randomUUID(),
    ...(librarySourceId ? { librarySourceId } : {}),
    source,
  };
}

function getCanvasLibraryAssets() {
  const assets = state.nodes.flatMap((node) => {
    const attached = node.assets || [];
    return node.generatedAsset ? [...attached, node.generatedAsset] : attached;
  });
  const unique = new Map();
  for (const asset of assets) {
    if (!asset) continue;
    unique.set(asset.url || asset.id, asset);
  }
  return [...unique.values()];
}

const assetLibrarySpaceDetails = Object.freeze({
  personal: { label: "个人空间", shortLabel: "个人" },
  organization: { label: "组织空间", shortLabel: "组织" },
  platform: { label: "平台空间", shortLabel: "平台" },
});

function getAssetLibraryContextKey(space = state.librarySpace, section = state.librarySection) {
  return `${space}:${section}`;
}

function rememberAssetLibraryContext() {
  const key = getAssetLibraryContextKey();
  state.librarySearchByContext[key] = state.librarySearch;
  state.libraryFilterByContext[key] = state.librarySection === "media" ? state.libraryFilter : "all";
}

function restoreAssetLibraryContext() {
  const key = getAssetLibraryContextKey();
  state.librarySearch = state.librarySearchByContext[key] || "";
  state.libraryFilter = state.librarySection === "media"
    ? state.libraryFilterByContext[key] || "all"
    : "all";
}

function clearAssetLibrarySelection({ keepMode = false } = {}) {
  state.librarySelectedIds.clear();
  if (!keepMode) state.librarySelectionMode = false;
  state.libraryToolbarMenu = null;
  state.libraryMenuTarget = null;
  state.libraryMoveItems = [];
  state.libraryMoveFolderId = null;
}

function switchAssetLibraryContext({ space = state.librarySpace, section = state.librarySection } = {}) {
  closeEntityUseDetail();
  rememberAssetLibraryContext();
  state.librarySpace = canvasAssetLibraryModel.normalizeSpace(space);
  state.librarySection = state.librarySpace === "platform"
    ? "media"
    : section === "entity" ? "entity" : "media";
  state.libraryFolderId = null;
  state.libraryDirectoryMenuOpen = false;
  state.libraryDirectoryRootExpanded = true;
  state.libraryExpandedFolderIds.clear();
  state.libraryRenameTarget = null;
  clearAssetLibrarySelection();
  restoreAssetLibraryContext();
  renderAssetLibrary();
}

function isAssetLibraryMutable() {
  return canvasAssetLibraryModel.isMutableSpace(state.librarySpace)
    && (window.parent === window || state.hostCapabilities.hostWritable);
}

function canPersistLibraryMedia() {
  return window.parent === window || (
    state.hostCapabilities.hostWritable
    && state.hostCapabilities.assetPersistence
  );
}

function canPersistLibraryEntities() {
  return window.parent === window || (
    state.hostCapabilities.hostWritable
    && state.hostCapabilities.entityPersistence
  );
}

function getAssetLibraryItemRef(id, kind = state.librarySection) {
  return { kind: kind === "entity" ? "entity" : "media", id: String(id || "") };
}

function getSelectedAssetLibraryRefs() {
  return [...state.librarySelectedIds].map((id) => getAssetLibraryItemRef(id));
}

function getAssetLibraryOriginLabel(asset) {
  if (!asset) return "";
  const sourceLabels = {
    local: "本地上传",
    upload: "本地上传",
    generated: "生成结果",
    "generation-result": "生成结果",
    "team-shared": "团队共享",
    platform: "平台内容",
    library: "资产引用",
  };
  return sourceLabels[asset.source] || assetLibrarySpaceDetails[state.librarySpace]?.label || "素材";
}

function getAssetLibraryFolder() {
  if (!state.libraryFolderId) return null;
  const folder = assetLibraryStore.getFolder(state.libraryFolderId);
  return folder?.space === state.librarySpace && folder?.kind === state.librarySection ? folder : null;
}

function getAssetLibraryFolders() {
  return assetLibraryStore.listFolders({ space: state.librarySpace, kind: state.librarySection });
}

function getAssetLibraryFolderPath(folderId = state.libraryFolderId) {
  if (!folderId) return [];
  try {
    return assetLibraryStore.getFolderPath({
      folderId,
      space: state.librarySpace,
      kind: state.librarySection,
    });
  } catch {
    return [];
  }
}

function ensureCurrentAssetLibraryPathExpanded() {
  state.libraryDirectoryRootExpanded = true;
  getAssetLibraryFolderPath().forEach((folder) => state.libraryExpandedFolderIds.add(folder.id));
}

function setAssetLibraryDirectoryMenuOpen(open) {
  state.libraryDirectoryMenuOpen = Boolean(open);
  if (state.libraryDirectoryMenuOpen) ensureCurrentAssetLibraryPathExpanded();
}

function selectAssetLibraryDirectory(folderId) {
  const normalizedFolderId = folderId == null || folderId === "" ? null : String(folderId);
  if (normalizedFolderId) {
    const folder = assetLibraryStore.getFolder(normalizedFolderId);
    if (!folder || folder.space !== state.librarySpace || folder.kind !== state.librarySection) return;
  }
  state.libraryFolderId = normalizedFolderId;
  state.libraryDirectoryMenuOpen = false;
  state.libraryRenameTarget = null;
  clearAssetLibrarySelection();
  renderAssetLibrary();
}

function getAssetLibraryFolderDescendantIds(folderId) {
  if (!folderId) return [];
  return getAssetLibraryFolders()
    .filter((folder) => getAssetLibraryFolderPath(folder.id).some((ancestor) => ancestor.id === folderId))
    .map((folder) => folder.id);
}

function getVisibleAssetLibraryContent() {
  const kind = state.librarySection;
  const query = state.librarySearch;
  const mediaKind = kind === "media" ? state.libraryFilter : "all";
  const flatPlatformResults = state.librarySpace === "platform";
  const itemScope = {
    space: state.librarySpace,
    kind,
    ...(flatPlatformResults ? {} : { folderId: state.libraryFolderId }),
  };
  const folders = flatPlatformResults ? [] : assetLibraryStore.listFolders({
    space: state.librarySpace,
    kind,
    parentId: state.libraryFolderId,
    query,
  });
  const allItems = assetLibraryStore.listItems({
    ...itemScope,
  });
  const items = assetLibraryStore.listItems({
    ...itemScope,
    query,
    mediaKind,
  });
  return { folders, allItems, items };
}

function renderAssetLibrary() {
  if (!assetLibraryGrid || !canvasAssetLibraryView) return;
  const mutable = isAssetLibraryMutable();
  const space = state.librarySpace;
  const platform = space === "platform";
  const section = state.librarySection;
  const display = state.libraryDisplay;
  const canCreateEntity = mutable && space === "personal" && section === "entity" && canPersistLibraryEntities();
  const canUploadMedia = mutable && space === "personal" && section === "media" && canPersistLibraryMedia();
  const canManageFolders = mutable;
  if (!canManageFolders) state.libraryDirectoryMenuOpen = false;
  const folder = getAssetLibraryFolder();
  const folderPath = getAssetLibraryFolderPath();
  const allFolders = getAssetLibraryFolders();
  const { folders, allItems, items } = getVisibleAssetLibraryContent();
  const selectedCount = state.librarySelectedIds.size;
  const reviewableSelection = selectedCount === 0 || getSelectedAssetLibraryRefs().every((ref) => {
    if (ref.kind !== "media") return true;
    return assetLibraryStore.getMedia(ref)?.mediaKind !== "audio";
  });
  const menuKey = state.libraryMenuTarget
    ? `${state.libraryMenuTarget.kind}:${state.libraryMenuTarget.id}`
    : "";
  const renameKey = state.libraryRenameTarget
    ? `${state.libraryRenameTarget.kind}:${state.libraryRenameTarget.id}`
    : "";

  assetLibraryPanel?.setAttribute("data-library-space", space);
  assetLibraryPanel?.setAttribute("data-library-section", section);
  assetLibraryPanel?.setAttribute("data-library-display", state.libraryDisplay);
  assetLibraryPanel?.setAttribute("data-library-folder-capability", canManageFolders ? "true" : "false");
  if (assetLibrarySpaceLabel) {
    assetLibrarySpaceLabel.textContent = assetLibrarySpaceDetails[space]?.label || "个人空间";
  }
  assetLibrarySpaceMenu?.querySelectorAll("[data-library-space]").forEach((button) => {
    button.setAttribute("aria-checked", button.dataset.librarySpace === space ? "true" : "false");
  });
  const platformResults = platform;
  const assetLibraryDirectoryBar = assetLibraryDirectoryButton?.closest(".asset-library-directorybar");
  if (assetLibraryCommandBar) {
    const commandHost = platformResults ? assetLibraryPlatformCommandAnchor : assetLibraryDirectoryBar;
    if (commandHost && assetLibraryCommandBar.parentElement !== commandHost) commandHost.append(assetLibraryCommandBar);
  }
  if (assetLibrarySectionTabs) {
    assetLibrarySectionTabs.setAttribute("aria-label", platformResults ? "平台灵感搜索" : "资产类型");
  }
  if (assetLibraryMediaTab) assetLibraryMediaTab.textContent = platformResults ? "灵感搜索" : "素材";
  if (assetLibraryEntityTab) {
    assetLibraryEntityTab.hidden = platformResults;
    assetLibraryEntityTab.disabled = platformResults;
    assetLibraryEntityTab.setAttribute("aria-hidden", platformResults ? "true" : "false");
    assetLibraryEntityTab.tabIndex = platformResults ? -1 : 0;
  }
  assetLibrarySectionTabs?.querySelectorAll("[data-library-section]").forEach((button) => {
    const active = button.dataset.librarySection === section;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  assetLibrarySectionTabs?.classList.toggle("platform-inspiration", platform);
  assetLibraryGrid.setAttribute(
    "aria-labelledby",
    section === "media" ? "assetLibraryMediaTab" : "assetLibraryEntityTab",
  );
  assetLibraryGrid.className = `asset-library-grid ${display === "list" ? "list-view" : "grid-view"}`;
  if (assetLibrarySearchInput && assetLibrarySearchInput.value !== state.librarySearch) {
    assetLibrarySearchInput.value = state.librarySearch;
  }
  if (assetLibrarySearchInput) assetLibrarySearchInput.placeholder = "搜索";
  if (assetLibraryDirectoryName) {
    assetLibraryDirectoryName.textContent = folder?.name || "默认目录";
    assetLibraryDirectoryName.title = ["默认目录", ...folderPath.map((entry) => entry.name)].join(" / ");
  }
  if (assetLibraryDirectoryButton) {
    assetLibraryDirectoryButton.disabled = !canManageFolders;
    assetLibraryDirectoryButton.setAttribute("aria-disabled", canManageFolders ? "false" : "true");
    assetLibraryDirectoryButton.setAttribute("aria-expanded", state.libraryDirectoryMenuOpen ? "true" : "false");
  }
  if (assetLibraryCreateFolderBtn) {
    const currentLevel = folderPath.length + 1;
    const atMaximumDepth = currentLevel >= canvasAssetLibraryModel.MAX_DIRECTORY_LEVELS;
    assetLibraryCreateFolderBtn.hidden = !canManageFolders;
    assetLibraryCreateFolderBtn.disabled = !canManageFolders || atMaximumDepth;
    assetLibraryCreateFolderBtn.setAttribute("aria-disabled", (!canManageFolders || atMaximumDepth) ? "true" : "false");
    assetLibraryCreateFolderBtn.title = atMaximumDepth
      ? `最多支持 ${canvasAssetLibraryModel.MAX_DIRECTORY_LEVELS} 层目录`
      : "在当前目录中新建文件夹";
  }
  if (assetLibraryDirectoryTreePopover) {
    assetLibraryDirectoryTreePopover.classList.toggle("hidden", !state.libraryDirectoryMenuOpen);
    assetLibraryDirectoryTreePopover.innerHTML = state.libraryDirectoryMenuOpen
      ? canvasAssetLibraryView.renderDirectoryTree({
          folders: allFolders,
          currentFolderId: state.libraryFolderId,
          expandedFolderIds: [...state.libraryExpandedFolderIds],
          rootExpanded: state.libraryDirectoryRootExpanded,
        })
      : "";
  }

  if (assetLibraryCommandBar) {
    assetLibraryCommandBar.innerHTML = canvasAssetLibraryView.renderCommandBar({
      mutable,
      space,
      section,
      canCreateEntity,
      canUploadMedia,
      allowedBatchActions: platformResults
        ? ["add-canvas", "save-personal"]
        : undefined,
      canImportPlatformAssets: false,
      selectionMode: state.librarySelectionMode,
      selectedCount,
      reviewableSelection,
      filter: section === "media" ? state.libraryFilter : "all",
      display: state.libraryDisplay,
      menu: state.libraryToolbarMenu,
    });
  }

  const folderMarkup = folders
    .map((item) => canvasAssetLibraryView.renderFolderCard({
      folder: item,
      renaming: renameKey === `folder:${item.id}`,
      menuOpen: menuKey === `folder:${item.id}`,
      mutable: canManageFolders,
      space,
    }))
    .join("");
  const itemMarkup = items
    .map((item) => {
      const itemKey = `${item.kind}:${item.id}`;
      const common = {
        selected: state.librarySelectedIds.has(item.id),
        selectionMode: state.librarySelectionMode,
        menuOpen: menuKey === itemKey,
        renaming: renameKey === itemKey,
        mutable,
        space,
      };
      if (item.kind === "entity") {
        const entityMedia = assetLibraryStore.getEntityMedia({ kind: "entity", id: item.id });
        const coverMedia = item.coverMediaId
          ? entityMedia.find((media) => media.id === item.coverMediaId)
          : null;
        const coverPreview = coverMedia && (coverMedia.mediaKind || coverMedia.type) === "image"
          ? coverMedia
          : entityMedia.find((media) => (media.mediaKind || media.type) === "image") || null;
        return canvasAssetLibraryView.renderEntityCard({
          ...common,
          entity: item,
          name: item.name || "未命名主体",
          mediaPreviews: entityMedia.slice(0, 4),
          coverPreview: entityMedia.find((media) => media.id === item.coverMediaId) || null,
        });
      }
      return canvasAssetLibraryView.renderMediaCard({
        ...common,
        media: item,
        name: getAssetDisplayName(item),
        meta: `${assetTypeLabel(item.mediaKind || item.type)} · ${getAssetLibraryOriginLabel(item)}`,
      });
    })
    .join("");

  assetLibraryGrid.innerHTML = folderMarkup + itemMarkup || canvasAssetLibraryView.renderEmptyState({
    section,
    space,
    hasQuery: Boolean(state.librarySearch || (section === "media" && state.libraryFilter !== "all")),
    mutable,
    canCreateEntity,
    canUploadMedia,
  });

  if (assetLibraryCount) {
    if (platform) {
      assetLibraryCount.textContent = `共 ${items.length} 个结果`;
    } else {
    const noun = section === "entity" ? "个主体" : "个素材";
    const filtered = Boolean(state.librarySearch || (section === "media" && state.libraryFilter !== "all"));
    assetLibraryCount.textContent = filtered
      ? `显示 ${items.length} / 共 ${allItems.length} ${noun}`
      : `共 ${allItems.length} ${noun}`;
    }
  }

  if (assetLibraryOverlayLayer) {
    const movingFolder = state.libraryMoveFolderId ? assetLibraryStore.getFolder(state.libraryMoveFolderId) : null;
    assetLibraryOverlayLayer.innerHTML = state.libraryMoveItems.length || movingFolder
      ? canvasAssetLibraryView.renderMovePopover({
          folders: allFolders,
          currentFolderId: movingFolder ? movingFolder.parentId : state.libraryFolderId,
          excludedFolderIds: movingFolder ? getAssetLibraryFolderDescendantIds(movingFolder.id) : [],
          mutable,
          space,
        })
      : "";
  }
  refreshIcons();
  if (state.libraryRenameTarget) {
    window.requestAnimationFrame(() => {
      const input = assetLibraryGrid.querySelector("[data-library-rename-input]");
      input?.focus();
      input?.select();
    });
  }
  if (state.entityUseDetailId) {
    const entityStillVisible = section === "entity"
      && !state.librarySelectionMode
      && !state.libraryMenuTarget
      && items.some((item) => item.kind === "entity" && item.id === state.entityUseDetailId);
    if (!entityStillVisible) closeEntityUseDetail();
    else window.requestAnimationFrame(() => renderEntityUseDetail());
  }
}

function findLibraryAsset(assetId) {
  return assetLibraryStore.getMedia({ kind: "media", id: assetId })
    || getCanvasLibraryAssets().find((asset) => asset.id === assetId)
    || null;
}

function registerLibraryAssets(assets, scope = state.librarySpace) {
  const space = scope === "organization" ? "organization" : "personal";
  for (const asset of assets || []) {
    assetLibraryStore.registerMedia({ media: asset, space, folderId: null });
  }
  renderAssetLibrary();
}

function findRegisteredLibraryMedia(asset) {
  if (!asset) return null;
  const sourceId = asset.librarySourceId || asset.id;
  return assetLibraryStore.listAllMedia().find(
    (item) => item.id === sourceId
      || item.librarySourceId === sourceId
      || (asset.url && item.url === asset.url),
  ) || null;
}

function hasPersonalLibraryPlacement(media) {
  return Boolean(
    media && assetLibraryStore.hasPlacement({ kind: "media", id: media.id }, "personal"),
  );
}

function getAssetLibraryEntityCard(entityId = state.entityUseDetailAnchorId || state.entityUseDetailId) {
  if (!entityId || !assetLibraryGrid) return null;
  return [...assetLibraryGrid.querySelectorAll("[data-library-entity]")]
    .find((element) => element.dataset.libraryEntity === entityId) || null;
}

function clearEntityUseDetailTimers() {
  if (state.entityUseDetailOpenTimer) window.clearTimeout(state.entityUseDetailOpenTimer);
  if (state.entityUseDetailCloseTimer) window.clearTimeout(state.entityUseDetailCloseTimer);
  state.entityUseDetailOpenTimer = 0;
  state.entityUseDetailCloseTimer = 0;
}

function getEntityUseDetailPayload(entityId = state.entityUseDetailId) {
  const entity = entityId
    ? assetLibraryStore.getEntity({ kind: "entity", id: entityId })
    : null;
  if (!entity) return null;
  const space = state.librarySpace;
  if (!assetLibraryStore.hasPlacement({ kind: "entity", id: entity.id }, space)) return null;
  const media = assetLibraryStore
    .getEntityMedia({ kind: "entity", id: entity.id })
    .filter((item) => assetLibraryStore.hasPlacement({ kind: "media", id: item.id }, space));
  return { ...entity, media };
}

function getEntityUseDetailPlacement(anchor) {
  const anchorRect = anchor.getBoundingClientRect();
  const avoidRects = [];
  if (state.agentOpen && agentDock) avoidRects.push(agentDock.getBoundingClientRect());
  return canvasEntityUseView.computeDetailPlacement({
    viewportRect: { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight },
    anchorRect,
    sourceRect: anchorRect,
    avoidRects,
    panelWidth: 340,
    panelHeight: 454,
    gap: 10,
    margin: 12,
  });
}

function renderEntityUseDetail() {
  if (!entityUseDetailPortal || !state.entityUseDetailId) return;
  const anchor = getAssetLibraryEntityCard();
  const entity = getEntityUseDetailPayload();
  const eligible = isAssetLibraryOpen()
    && state.librarySection === "entity"
    && !state.librarySelectionMode
    && !state.libraryMenuTarget
    && !state.libraryRenameTarget
    && anchor
    && entity;
  if (!eligible) {
    closeEntityUseDetail();
    return;
  }
  const placement = getEntityUseDetailPlacement(anchor);
  entityUseDetailPortal.innerHTML = canvasEntityUseView.renderEntityDetail({
    entity,
    media: entity.media,
    pinned: state.entityUseDetailPinned,
    placement,
    canAdd: isCanvasMutationAllowed(),
  });
  canvasEntityUseView.syncEntityDetailPortal(entityUseDetailPortal, {
    visible: true,
    pinned: state.entityUseDetailPinned,
    placement,
  });
  refreshIcons();
}

function openEntityUseDetail(entityId, { pinned = false, delay = 0 } = {}) {
  if (!entityId || state.librarySelectionMode || state.libraryMenuTarget || state.libraryRenameTarget) return;
  if (!isAssetLibraryOpen() || state.librarySection !== "entity") return;
  if (state.entityUseDetailPinned && !pinned) return;
  clearEntityUseDetailTimers();
  const open = () => {
    state.entityUseDetailOpenTimer = 0;
    state.entityUseDetailId = entityId;
    state.entityUseDetailAnchorId = entityId;
    state.entityUseDetailPinned = Boolean(pinned);
    renderEntityUseDetail();
  };
  if (delay > 0) state.entityUseDetailOpenTimer = window.setTimeout(open, delay);
  else open();
}

function scheduleEntityUseDetailClose(delay = 170) {
  if (state.entityUseDetailOpenTimer) window.clearTimeout(state.entityUseDetailOpenTimer);
  state.entityUseDetailOpenTimer = 0;
  if (state.entityUseDetailPinned) return;
  if (state.entityUseDetailCloseTimer) window.clearTimeout(state.entityUseDetailCloseTimer);
  state.entityUseDetailCloseTimer = window.setTimeout(() => {
    state.entityUseDetailCloseTimer = 0;
    if (!state.entityUseDetailPinned) closeEntityUseDetail();
  }, delay);
}

function closeEntityUseDetail({ restoreFocus = false } = {}) {
  const entityId = state.entityUseDetailAnchorId || state.entityUseDetailId;
  clearEntityUseDetailTimers();
  state.entityUseDetailId = null;
  state.entityUseDetailAnchorId = null;
  state.entityUseDetailPinned = false;
  if (entityUseDetailPortal) {
    canvasEntityUseView.syncEntityDetailPortal(entityUseDetailPortal, { visible: false });
    entityUseDetailPortal.innerHTML = "";
  }
  if (restoreFocus && entityId) {
    window.requestAnimationFrame(() => getAssetLibraryEntityCard(entityId)?.querySelector(".asset-library-card-preview")?.focus({ preventScroll: true }));
  }
}

function getEntityUsePickerEntities() {
  const entitiesById = new Map();
  for (const space of ["personal", "organization"]) {
    const entities = assetLibraryStore.listItems({ space, kind: "entity" });
    for (const entity of entities) {
      const existing = entitiesById.get(entity.id);
      if (existing) {
        if (!existing.spaces.includes(space)) existing.spaces.push(space);
        continue;
      }
      const { kind: _kind, placement: _placement, ...record } = entity;
      entitiesById.set(entity.id, {
        ...record,
        spaces: [space],
        media: assetLibraryStore.getEntityMedia({ kind: "entity", id: entity.id }),
      });
    }
  }
  return [...entitiesById.values()];
}

function setEntityUsePickerBackgroundIsolation(active) {
  if (!appShell) return;
  if (active) {
    if (entityUsePickerBackgroundInertState.has(appShell)) return;
    entityUsePickerBackgroundInertState.set(appShell, {
      inert: appShell.inert,
      ariaHidden: appShell.getAttribute("aria-hidden"),
    });
    appShell.inert = true;
    appShell.setAttribute("aria-hidden", "true");
    return;
  }
  for (const [element, previous] of entityUsePickerBackgroundInertState) {
    element.inert = previous.inert;
    if (previous.ariaHidden == null) element.removeAttribute("aria-hidden");
    else element.setAttribute("aria-hidden", previous.ariaHidden);
  }
  entityUsePickerBackgroundInertState.clear();
}

function renderEntityUsePicker({ focusSearch = false } = {}) {
  if (!entityUsePickerPortal || !state.entityUsePickerTargetNodeId) return;
  const node = state.nodes.find((item) => item.id === state.entityUsePickerTargetNodeId);
  if (!node || node.kind !== "generator" || !canNodeUseEntityReferences(node)) {
    closeEntityUsePicker({ restoreFocus: false });
    return;
  }
  const canAdd = isCanvasMutationAllowed() && !node.generating;
  entityUsePickerPortal.innerHTML = canvasEntityUseView.renderEntityPicker({
    entities: getEntityUsePickerEntities(),
    space: state.entityUsePickerSpace,
    query: state.entityUsePickerQuery,
    selectedIds: state.entityUsePickerSelectedIds,
    canAdd,
  });
  canvasEntityUseView.syncEntityPickerPortal(entityUsePickerPortal, { visible: true });
  refreshIcons();
  if (focusSearch) {
    window.requestAnimationFrame(() => {
      const input = entityUsePickerPortal.querySelector("[data-entity-use-search]");
      if (!(input instanceof HTMLInputElement)) return;
      input.focus({ preventScroll: true });
      const valueLength = input.value.length;
      const start = Number.isInteger(state.entityUsePickerSelectionStart)
        ? Math.min(state.entityUsePickerSelectionStart, valueLength)
        : valueLength;
      const end = Number.isInteger(state.entityUsePickerSelectionEnd)
        ? Math.min(state.entityUsePickerSelectionEnd, valueLength)
        : start;
      input.setSelectionRange(start, end);
    });
  }
}

function openEntityUsePicker(nodeId) {
  if (!requireCanvasMutation()) return;
  const node = state.nodes.find((item) => item.id === nodeId);
  if (!node || node.kind !== "generator" || node.generating || !canNodeUseEntityReferences(node)) return;
  closeEntityUseDetail();
  state.entityUsePickerTargetNodeId = node.id;
  state.entityUsePickerSpace = "personal";
  state.entityUsePickerQuery = "";
  state.entityUsePickerSelectedIds.clear();
  state.entityUsePickerSelectedSpaces.clear();
  state.entityUsePickerComposing = false;
  state.entityUsePickerSelectionStart = 0;
  state.entityUsePickerSelectionEnd = 0;
  state.entityUsePickerReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  setEntityUsePickerBackgroundIsolation(true);
  renderEntityUsePicker({ focusSearch: true });
}

function closeEntityUsePicker({ restoreFocus = true } = {}) {
  const nodeId = state.entityUsePickerTargetNodeId;
  const previousFocus = state.entityUsePickerReturnFocus;
  state.entityUsePickerTargetNodeId = null;
  state.entityUsePickerQuery = "";
  state.entityUsePickerSelectedIds.clear();
  state.entityUsePickerSelectedSpaces.clear();
  state.entityUsePickerComposing = false;
  state.entityUsePickerSelectionStart = null;
  state.entityUsePickerSelectionEnd = null;
  state.entityUsePickerReturnFocus = null;
  if (entityUsePickerPortal) {
    canvasEntityUseView.syncEntityPickerPortal(entityUsePickerPortal, { visible: false });
    entityUsePickerPortal.innerHTML = "";
  }
  setEntityUsePickerBackgroundIsolation(false);
  if (!restoreFocus) return;
  window.requestAnimationFrame(() => {
    const currentTrigger = nodeId
      ? nodeLayer.querySelector(`[data-id="${CSS.escape(nodeId)}"] .entity-drop`)
      : null;
    if (currentTrigger instanceof HTMLElement) currentTrigger.focus({ preventScroll: true });
    else if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  });
}

function createEntityUseMediaPlan(entityIds, existingMedia, selectedSpaces) {
  const entities = entityIds
    .map((entityId) => assetLibraryStore.getEntity({ kind: "entity", id: entityId }))
    .filter(Boolean);
  return canvasEntityUseModel.createEntityMediaPlan({
    entities,
    media: assetLibraryStore.listAllMedia(),
    existingMedia,
    isMediaVisible(media, entity) {
      const space = selectedSpaces.get(entity.id) || "personal";
      return assetLibraryStore.hasPlacement({ kind: "media", id: media.id }, space);
    },
  });
}

function addSelectedEntitiesToGenerator() {
  if (!requireCanvasMutation()) return;
  const node = state.nodes.find((item) => item.id === state.entityUsePickerTargetNodeId);
  if (!node || node.kind !== "generator" || node.generating || !canNodeUseEntityReferences(node)) {
    closeEntityUsePicker({ restoreFocus: false });
    showActionToast("当前生成节点已不可用");
    return;
  }
  const entityIds = [...state.entityUsePickerSelectedIds];
  const plan = createEntityUseMediaPlan(entityIds, node.assets || [], state.entityUsePickerSelectedSpaces);
  if (!plan.entries.length) {
    closeEntityUsePicker();
    showActionToast(plan.skipped.some((item) => item.reason === "existing")
      ? "所选主体素材已在参考区"
      : "所选主体没有可添加的素材");
    return;
  }
  const before = cloneNodeState(node);
  const additions = plan.entries.map((entry) => cloneAsset({
    ...entry.media,
    librarySourceId: entry.sourceMediaId || entry.mediaId,
  }, "library"));
  pushUndoAction({ type: "node-update", node: before });
  node.assets.push(...additions);
  node.activeAssetId = additions[0].id;
  node.expanded = true;
  node.panel = null;
  additions.forEach((asset) => hydrateAssetMetadata(asset, node.id));
  bringNodesToFront([node]);
  setSelection([node.id], node.id);
  closeEntityUsePicker({ restoreFocus: false });
  render();
  window.requestAnimationFrame(() => nodeLayer.querySelector(`[data-id="${CSS.escape(node.id)}"] .entity-drop`)?.focus({ preventScroll: true }));
  const skippedExisting = plan.skipped.filter((item) => item.reason === "existing" || item.reason === "duplicate").length;
  showActionToast(skippedExisting
    ? `已添加 ${additions.length} 个参考素材，跳过 ${skippedExisting} 个重复项`
    : `已添加 ${additions.length} 个参考素材`);
}

function getAvailableCanvasPlacementViewport() {
  const shellRect = shell.getBoundingClientRect();
  let left = shellRect.left;
  let right = shellRect.right;
  if (isAssetLibraryOpen() && assetLibraryPanel) {
    left = Math.max(left, assetLibraryPanel.getBoundingClientRect().right + 12);
  }
  if (state.agentOpen && agentDock) {
    right = Math.min(right, agentDock.getBoundingClientRect().left - 12);
  }
  if (right - left < 280) {
    left = shellRect.left;
    right = shellRect.right;
  }
  const top = shellRect.top;
  const bottom = shellRect.bottom;
  const center = screenToWorld((left + right) / 2, (top + bottom) / 2);
  return {
    centerX: center.x,
    centerY: center.y,
    viewportWidth: Math.max(1, (right - left) / state.scale),
    viewportHeight: Math.max(1, (bottom - top) / state.scale),
  };
}

function addEntityToCanvas(entityId) {
  if (!requireCanvasMutation()) return [];
  const selectedSpaces = new Map([[entityId, state.librarySpace]]);
  const plan = createEntityUseMediaPlan([entityId], getCanvasLibraryAssets(), selectedSpaces);
  if (!plan.entries.length) {
    showActionToast(plan.skipped.some((item) => item.reason === "existing")
      ? "这个主体的素材已在画布中"
      : "这个主体没有可添加的素材");
    return [];
  }
  const createdNodes = plan.entries.map((entry) => {
    const asset = cloneAsset({
      ...entry.media,
      librarySourceId: entry.sourceMediaId || entry.mediaId,
    }, "library");
    const node = defaultAssetNode(0, 0, asset);
    hydrateAssetMetadata(asset, node.id);
    return node;
  });
  const layoutEntries = plan.entries.map((entry, index) => {
    const layout = getNodeLayout(createdNodes[index]);
    return { ...entry, layoutWidth: layout.nodeWidth, layoutHeight: layout.nodeHeight };
  });
  const viewport = getAvailableCanvasPlacementViewport();
  const layoutPlan = canvasEntityUseModel.createCenteredGridPlan(layoutEntries, {
    ...viewport,
    padding: 36 / state.scale,
    gapX: 30 / state.scale,
    gapY: 30 / state.scale,
  });
  layoutPlan.items.forEach((item, index) => {
    createdNodes[index].x = item.x;
    createdNodes[index].y = item.y;
  });
  collapseAllGeneratorPanels();
  pushUndoAction({ type: "create", nodeIds: createdNodes.map((node) => node.id) });
  state.nodes.push(...createdNodes);
  bringNodesToFront(createdNodes);
  setSelection(createdNodes.map((node) => node.id), createdNodes[0].id);
  closeEntityUseDetail();
  const createdBounds = getNodesContentBounds(createdNodes);
  const shouldFitCreatedNodes = createdBounds && getBoundsFitScale(createdBounds) < state.scale;
  render();
  if (shouldFitCreatedNodes) applyFitBounds(createdBounds);
  const skippedExisting = plan.skipped.filter((item) => item.reason === "existing" || item.reason === "duplicate").length;
  showActionToast(skippedExisting
    ? `已添加 ${createdNodes.length} 个素材，跳过 ${skippedExisting} 个重复项`
    : `已添加 ${createdNodes.length} 个素材到画布`);
  return createdNodes;
}

function openAssetLibraryPreview(id) {
  const item = assetLibraryStore.getMedia({ kind: "media", id });
  if (!item || !assetLibraryPreviewDialog || !assetLibraryPreviewBody) return;
  state.libraryPreviewTarget = { kind: "media", id };
  const name = getAssetDisplayName(item);
  if (assetLibraryPreviewTitle) assetLibraryPreviewTitle.textContent = name;
  if (assetLibraryPreviewKicker) {
    assetLibraryPreviewKicker.textContent = `${assetTypeLabel(item.mediaKind || item.type)}预览`;
  }
  const url = safeMediaAttributeUrl(item.url);
  if (item.mediaKind === "image" || item.type === "image") {
    assetLibraryPreviewBody.innerHTML = url ? `<img src="${url}" alt="${escapeHtml(name)}" />` : assetPreview(item);
  } else if (item.mediaKind === "video" || item.type === "video") {
    assetLibraryPreviewBody.innerHTML = url ? `<video src="${url}" controls autoplay playsinline></video>` : assetPreview(item);
  } else {
    assetLibraryPreviewBody.innerHTML = url ? `<audio src="${url}" controls autoplay></audio>` : assetPreview(item);
  }
  if (assetLibraryPreviewMeta) {
    assetLibraryPreviewMeta.textContent = `${assetTypeLabel(item.mediaKind || item.type)} · ${getAssetLibraryOriginLabel(item)}`;
  }
  if (assetLibraryPreviewUse) {
    assetLibraryPreviewUse.hidden = false;
    assetLibraryPreviewUse.querySelector("span").textContent = state.libraryTargetNodeId ? "引用到当前节点" : "添加到画布";
  }
  refreshIcons();
  if (!assetLibraryPreviewDialog.open) assetLibraryPreviewDialog.showModal();
}

function closeAssetLibraryPreview() {
  state.libraryPreviewTarget = null;
  assetLibraryPreviewDialog?.close?.();
  if (assetLibraryPreviewBody) assetLibraryPreviewBody.innerHTML = "";
}

function focusWorldBounds(bounds) {
  if (!bounds) return;
  const rect = shell.getBoundingClientRect();
  const libraryRect = isAssetLibraryOpen() ? assetLibraryPanel?.getBoundingClientRect() : null;
  const agentRect = state.agentOpen ? agentPanel?.getBoundingClientRect() : null;
  const leftInset = Math.max(0, (libraryRect?.right || rect.left) - rect.left);
  const rightInset = Math.max(0, rect.right - (agentRect?.left || rect.right));
  const viewWidth = Math.max(260, rect.width - leftInset - rightInset);
  const centerX = (bounds.left + bounds.right) / 2;
  const centerY = (bounds.top + bounds.bottom) / 2;
  state.tx = leftInset + viewWidth / 2 - centerX * state.scale;
  state.ty = rect.height / 2 - centerY * state.scale;
  applyTransform();
}

function focusCanvasLibraryItem(id, kind = "node") {
  if (kind === "group") {
    const group = getGroupById(id);
    const bounds = getGroupBounds(group);
    if (!group || !bounds) return;
    setActiveGroup(group.id);
    focusWorldBounds(bounds);
    render();
    return;
  }

  const node = state.nodes.find((item) => item.id === id);
  if (!node) return;
  collapseInactiveNodes(node.id);
  bringNodesToFront([node]);
  setSelection([node.id], node.id);
  focusWorldBounds(getNodeBounds(node));
  render();
}

function setNarrowViewportInertTargets(targets) {
  const nextTargets = new Set(targets.filter(Boolean));
  for (const [element, previousInert] of narrowViewportInertState) {
    if (nextTargets.has(element)) continue;
    element.inert = previousInert;
    narrowViewportInertState.delete(element);
  }
  for (const element of nextTargets) {
    if (!narrowViewportInertState.has(element)) {
      narrowViewportInertState.set(element, element.inert);
    }
    element.inert = true;
  }
}

function focusNarrowViewportPanel(mode) {
  const activeElement = document.activeElement;
  if (mode === "asset") {
    const assetLayerElements = [assetLibraryPanel, projectMenu, canvasMenu, canvasMoreMenu];
    if (assetLayerElements.some((element) => element?.contains(activeElement))) return;
    const target = [assetLibrarySearchInput, assetLibraryCloseBtn].find(
      (element) => element && !element.disabled && element.getClientRects().length,
    );
    target?.focus();
    return;
  }
  if (mode === "agent" && !agentDock?.contains(activeElement)) {
    agentInput?.focus();
  }
}

function syncNarrowViewportIsolation({ focusPanel = false } = {}) {
  const assetOpen = Boolean(assetLibraryPanel && !assetLibraryPanel.classList.contains("hidden"));
  const agentOpen = Boolean(state.agentOpen && agentDock?.classList.contains("open"));
  if (!narrowViewportQuery.matches || (!assetOpen && !agentOpen)) {
    setNarrowViewportInertTargets([]);
    return;
  }

  const mode = assetOpen ? "asset" : "agent";
  const targets = mode === "asset"
    ? [topBar, leftRail, topActions, shell, agentDock]
    : [topBar, leftRail, topActions, shell, assetLibraryPanel, projectMenu, canvasMenu, canvasMoreMenu];
  setNarrowViewportInertTargets(targets);
  if (focusPanel) focusNarrowViewportPanel(mode);
}

function openAssetLibrary(targetNodeId = null, { focus = false } = {}) {
  if (state.agentOpen && !canShowAssetAndAgent()) setAgentOpen(false);
  state.libraryTargetNodeId = targetNodeId;
  if (targetNodeId) {
    state.librarySection = "media";
    state.libraryFolderId = null;
  }
  assetLibraryPanel?.classList.remove("hidden");
  if (assetLibraryPanel) {
    assetLibraryPanel.inert = false;
    assetLibraryPanel.setAttribute("aria-hidden", "false");
  }
  appShell?.classList.add("asset-library-open");
  if (leftRail) {
    leftRail.inert = true;
    leftRail.setAttribute("aria-hidden", "true");
  }
  setAssetLibraryWidth(state.assetLibraryPreferredWidth, { remember: false });
  if (state.agentOpen) reconcileDualPanelWidths("asset");
  railLibraryBtn?.classList.add("active");
  railLibraryBtn?.setAttribute("aria-expanded", "true");
  closeProfileMenu();
  renderAssetLibrary();
  scheduleNodePopoverLayouts();
  syncNarrowViewportIsolation({ focusPanel: narrowViewportQuery.matches });
  if (focus && !narrowViewportQuery.matches) {
    window.requestAnimationFrame(() => assetLibrarySearchInput?.focus());
  }
}

function closeAssetLibrary({ restoreFocus = true } = {}) {
  const shouldRestoreFocus = restoreFocus && Boolean(assetLibraryPanel?.contains(document.activeElement));
  closeEntityUseDetail();
  state.libraryTargetNodeId = null;
  state.libraryDirectoryMenuOpen = false;
  state.libraryRenameTarget = null;
  clearAssetLibrarySelection();
  closeAssetLibraryPreview();
  assetLibraryPanel?.classList.add("hidden");
  if (assetLibraryPanel) {
    assetLibraryPanel.inert = true;
    assetLibraryPanel.setAttribute("aria-hidden", "true");
  }
  appShell?.classList.remove("asset-library-open");
  if (leftRail) {
    leftRail.inert = false;
    leftRail.removeAttribute("aria-hidden");
  }
  railLibraryBtn?.classList.remove("active");
  railLibraryBtn?.setAttribute("aria-expanded", "false");
  syncNarrowViewportIsolation();
  scheduleNodePopoverLayouts();
  if (shouldRestoreFocus) railLibraryBtn?.focus();
}

function addAssetToGeneratorNode(node, sourceAsset) {
  if (!requireCanvasMutation()) return;
  if (!node || node.kind !== "generator" || node.generating || !sourceAsset) return;
  const asset = cloneAsset(sourceAsset, "library");
  node.assets.push(asset);
  node.activeAssetId = asset.id;
  node.expanded = true;
  node.panel = null;
  hydrateAssetMetadata(asset, node.id);
  bringNodesToFront([node]);
  setSelection([node.id], node.id);
  render();
}

function addLibraryAssetToCanvas(sourceAsset, clientX, clientY) {
  if (!requireCanvasMutation()) return null;
  if (!sourceAsset) return null;
  const rect = shell.getBoundingClientRect();
  const x = Number.isFinite(clientX) ? clientX : rect.left + rect.width / 2;
  const y = Number.isFinite(clientY) ? clientY : rect.top + rect.height / 2;
  const asset = cloneAsset(sourceAsset, "library");
  const world = screenToWorld(x, y);
  const node = defaultAssetNode(0, 0, asset);
  const layout = getNodeLayout(node);
  node.x = world.x - layout.nodeWidth / 2;
  node.y = world.y - layout.mediaHeight / 2;
  hydrateAssetMetadata(asset, node.id);
  collapseAllGeneratorPanels();
  state.nodes.push(node);
  bringNodesToFront([node]);
  setSelection([node.id], node.id);
  render();
  return node;
}

function useLibraryAsset(assetId, clientX, clientY) {
  const sourceAsset = findLibraryAsset(assetId);
  if (!sourceAsset) return;
  const targetNode = state.nodes.find((node) => node.id === state.libraryTargetNodeId);
  if (targetNode?.kind === "generator") {
    addAssetToGeneratorNode(targetNode, sourceAsset);
    closeAssetLibrary();
    return;
  }
  addLibraryAssetToCanvas(sourceAsset, clientX, clientY);
}

function readAssetMetadata(asset) {
  const safeUrl = sanitizeRuntimeMediaUrl(asset.url);
  if (!safeUrl) return Promise.resolve({});
  const mediaType = asset.type || asset.mediaKind;

  return new Promise((resolve) => {
    let settled = false;
    let timeoutId = 0;
    const finish = (metadata = {}) => {
      if (settled) return;
      settled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      resolve(metadata);
    };
    timeoutId = window.setTimeout(() => finish(), 4000);

    if (mediaType === "image") {
      const image = new Image();
      image.onload = () => finish(image.naturalWidth && image.naturalHeight
        ? {
            width: image.naturalWidth,
            height: image.naturalHeight,
            aspectRatio: image.naturalWidth / image.naturalHeight,
          }
        : {});
      image.onerror = () => finish();
      image.src = safeUrl;
      return;
    }

    if (mediaType === "audio") {
      const audio = document.createElement("audio");
      audio.preload = "metadata";
      audio.onloadedmetadata = () => finish(Number.isFinite(audio.duration) ? { duration: audio.duration } : {});
      audio.onerror = () => finish();
      audio.src = safeUrl;
      return;
    }

    if (mediaType !== "video") {
      finish();
      return;
    }

    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => finish(video.videoWidth && video.videoHeight
      ? {
          width: video.videoWidth,
          height: video.videoHeight,
          duration: Number.isFinite(video.duration) ? video.duration : 0,
          aspectRatio: video.videoWidth / video.videoHeight,
        }
      : {});
    video.onerror = () => finish();
    video.src = safeUrl;
  });
}

function hydrateAssetMetadata(asset, nodeId) {
  readAssetMetadata(asset).then((metadata) => {
    if (!Object.keys(metadata).length) return;
    Object.assign(asset, metadata);
    if (!nodeId || state.nodes.some((node) => node.id === nodeId)) render();
  });
}

function audioWaveformBars(repeat = 1) {
  const heights = [6, 14, 18, 24, 36, 20, 12, 22, 18, 28, 8, 20, 16, 24, 18, 26, 10, 72, 118, 96, 34, 108, 72, 18, 88, 22, 28, 18, 16, 26, 10, 58, 28, 12, 8];
  return Array.from({ length: repeat })
    .flatMap(() => heights)
    .map((height, index) => `<i style="--h: ${height}px; --d: ${index * 36}ms"></i>`)
    .join("");
}

function createGenerationParameterSnapshot(node) {
  const taskTypeCapability = getOmniReferenceTaskTypeCapability(node);
  const taskTypeConstraint = getOmniReferenceTaskTypeConstraint(node);
  const requestAspect = taskTypeConstraint?.aspect || node.aspect;
  const hasFixedDuration = Boolean(taskTypeConstraint && Object.hasOwn(taskTypeConstraint, "duration"));
  const requestDuration = hasFixedDuration ? taskTypeConstraint.duration : node.duration;
  const referenceVideos = getReferenceVideoAssets(node);
  const outputDuration = getGenerationOutputDurationSeconds(node, referenceVideos);
  const snapshot = {
    mediaKind: getNodeGenerationMode(node),
    model: node.model,
    prompt: node.prompt,
    aspect: requestAspect,
    resolution: node.resolution,
    quality: node.quality,
    duration: requestDuration,
    outputDuration,
    outputFormat: node.outputFormat,
    count: node.count,
    workflow: node.workflow,
    audioEnabled: node.audioEnabled,
    autoLinkEnabled: node.autoLinkEnabled,
    assetValidationEnabled: node.assetValidationEnabled,
    assetIds: (node.assets || []).map((asset) => asset.id),
    referenceVideos: referenceVideos.map(({ assetId, sourceNodeId, url, duration }) => ({
      assetId,
      sourceNodeId,
      url,
      duration,
    })),
  };
  if (taskTypeCapability) {
    const parameter = taskTypeCapability.parameter || "omni_reference_task_type";
    snapshot.omniReferenceTaskType = node.omniReferenceTaskType;
    snapshot.providerParameters = {
      [parameter]: node.omniReferenceTaskType,
      ratio: requestAspect,
      duration: hasFixedDuration ? taskTypeConstraint.duration : getNormalizedDurationSeconds(node),
    };
  }
  return snapshot;
}

function createGeneratedAsset(parameterSnapshot) {
  const mediaKind = normalizeGeneratorMode(parameterSnapshot.mediaKind) || "image";
  const base = simulationAssets[mediaKind] || simulationAssets.image;
  const generated = {
    ...base,
    id: crypto.randomUUID(),
    displayName: mediaKind === "video" ? "Generated video" : "Generated image",
  };

  if (mediaKind === "image") {
    const size = getGeneratedResolution(parameterSnapshot);
    generated.width = size.width;
    generated.height = size.height;
    generated.aspectRatio = aspectStringToRatio(parameterSnapshot.aspect);
    generated.url = `https://picsum.photos/seed/${encodeURIComponent(parameterSnapshot.id)}/${size.width}/${size.height}`;
  }

  if (mediaKind === "video") {
    generated.aspectRatio = aspectStringToRatio(parameterSnapshot.aspect);
    if (Number.isFinite(parameterSnapshot.outputDuration) && parameterSnapshot.outputDuration > 0) {
      generated.duration = parameterSnapshot.outputDuration;
    }
  }

  return generated;
}

function generatorMediaContent(node) {
  if (node.generating) {
    return `
      <div class="media-content generating-preview">
        <div class="generating-orbit" aria-hidden="true"></div>
        <div class="generating-label">生成中</div>
      </div>
    `;
  }

  if (node.generatedAsset) {
    return assetMediaContent(node.generatedAsset);
  }

  if (node.preview) {
    return `
      <div class="media-content generated-preview">
        <div class="generated-glow" aria-hidden="true"></div>
      </div>
    `;
  }

  const placeholderIcon =
    node.mode === "video"
      ? `
        <svg class="upload-icon video-placeholder-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="4" y="5" width="16" height="14" rx="3" stroke="currentColor" stroke-width="2"/>
          <path d="M10 9.2L15.2 12 10 14.8V9.2Z" fill="currentColor"/>
        </svg>
      `
      : `
        <svg class="upload-icon image-placeholder-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="4" y="5" width="16" height="14" rx="3" stroke="currentColor" stroke-width="2"/>
          <path d="M7 16l3.2-3.2 2.3 2.2 2.2-2.7L18 16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="16.5" cy="8.5" r="1.3" fill="currentColor"/>
        </svg>
      `;

  return `
    <div class="upload-stack">
      <div class="media-placeholder">
        ${placeholderIcon}
      </div>
    </div>
  `;
}

function assetMediaContent(asset) {
  if (!asset) {
    return `
      <div class="media-content empty-image">
        <span class="asset-glyph">▧</span>
      </div>
    `;
  }

  const safeUrl = safeMediaAttributeUrl(asset.url);

  if (asset.type === "image" && safeUrl) {
    return `<div class="media-content image"><img class="frame-media" src="${safeUrl}" alt="" draggable="false" /></div>`;
  }

  if (asset.type === "video" && safeUrl) {
    return `
      <div class="media-content video">
        <video class="frame-media" src="${safeUrl}" controls playsinline preload="metadata" draggable="false"></video>
      </div>
    `;
  }

  if (asset.type === "audio") {
    return `
      <div class="media-content audio">
        <div class="audio-waveform" data-audio-waveform data-wheel-scope="local" aria-hidden="true">
          <div class="audio-track" data-audio-track>
            ${audioWaveformBars(3)}
          </div>
          <span class="audio-playhead"></span>
        </div>
        <div class="audio-controls">
          <button class="audio-play-button" data-audio-toggle="true" type="button" title="播放/暂停">
            <i data-lucide="play" aria-hidden="true"></i>
          </button>
          <div class="audio-progress" data-audio-progress role="slider" aria-label="音频进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0">
            <span class="audio-progress-fill" data-audio-progress-fill></span>
          </div>
        </div>
        ${safeUrl ? `<audio class="frame-audio" src="${safeUrl}" preload="metadata"></audio>` : ""}
      </div>
    `;
  }

  return `
    <div class="media-content empty-${asset.type}">
      <span class="asset-glyph">${asset.type === "video" ? "▣" : "▧"}</span>
      <span class="media-empty-label">${assetTypeLabel(asset.type)}素材</span>
    </div>
  `;
}

function assetShelf(node) {
  const assets = (node.assets || [])
    .map(
      (asset) => `
        <div class="asset-card ${asset.type} ${node.activeAssetId === asset.id ? "active" : ""}" data-action="focus-asset" data-value="${asset.id}" role="button" tabindex="0">
          <div class="asset-thumb">${assetPreview(asset)}</div>
          <div class="asset-meta">
            <span>${escapeHtml(getAssetDisplayName(asset))}</span>
            <small>${assetTypeLabel(asset.type)}</small>
          </div>
        <button class="asset-remove" data-action="remove-material" data-value="${asset.id}" data-canvas-mutation type="button" title="移除">×</button>
        </div>
      `,
    )
    .join("");
  const linkedReferences = getIncomingConnections(node.id)
    .map((connection) => {
      const source = state.nodes.find((item) => item.id === connection.sourceNodeId);
      const asset = source ? getEditableMedia(source) : null;
      if (!source || !asset) return "";
      return `
        <div class="asset-card linked-reference ${asset.type}" data-action="focus-linked-source" data-value="${connection.id}" role="button" tabindex="0">
          <div class="asset-thumb">${assetPreview(asset)}</div>
          <div class="asset-meta">
            <span>${escapeHtml(getMediaTitle(source, asset) || getAssetDisplayName(asset))}</span>
            <small><i data-lucide="link-2" aria-hidden="true"></i>画布引用 · ${assetTypeLabel(asset.type)}</small>
          </div>
          <button class="asset-remove" data-action="remove-linked-source" data-value="${connection.id}" data-canvas-mutation type="button" title="断开连接" aria-label="断开连接">×</button>
        </div>
      `;
    })
    .join("");
  if (!assets && !linkedReferences) return "";
  return `<div class="asset-shelf">${linkedReferences}${assets}</div>`;
}

async function addFilesToGeneratorNode(node, files) {
  if (!requireCanvasMutation()) return;
  if (node.kind !== "generator" || node.generating) return;
  const accepted = await createPersistedAssetsFromFiles(files);
  if (!accepted.length) return;

  registerLibraryAssets(accepted, "project");
  node.assets.push(...accepted);
  node.activeAssetId = accepted[0].id;
  accepted.forEach((asset) => hydrateAssetMetadata(asset, node.id));
  node.expanded = true;
  node.panel = null;
  bringNodesToFront([node]);
  setSelection([node.id], node.id);
  render();
}

async function addMediaNodesFromFiles(files, clientX, clientY) {
  if (!requireCanvasMutation()) return [];
  const accepted = await createPersistedAssetsFromFiles(files);
  if (!accepted.length) return [];

  registerLibraryAssets(accepted, "project");
  const world = screenToWorld(clientX, clientY);
  const createdNodes = accepted.map((asset, index) => {
    const node = defaultAssetNode(0, 0, asset);
    const layout = getNodeLayout(node);
    node.x = world.x - layout.nodeWidth / 2 + index * 34;
    node.y = world.y - layout.mediaHeight / 2 + index * 34;
    hydrateAssetMetadata(asset, node.id);
    return node;
  });

  collapseAllGeneratorPanels();
  state.nodes.push(...createdNodes);
  bringNodesToFront(createdNodes);
  setSelection(createdNodes.map((node) => node.id), createdNodes[0].id);
  render();
  return createdNodes;
}

function addVirtualAsset(node, source) {
  if (!requireCanvasMutation()) return;
  if (node.kind !== "generator" || node.generating) return;
  const type = source === "canvas" ? "video" : "image";
  const name = source === "canvas" ? "画布素材" : "资产库素材";
  const asset = {
    id: crypto.randomUUID(),
    type,
    name,
    displayName: name,
    url: "",
    aspectRatio: type === "video" ? layoutRules.defaultRatio : null,
    source,
  };
  node.assets.push(asset);
  node.activeAssetId = asset.id;
  node.expanded = true;
  node.panel = null;
  bringNodesToFront([node]);
  setSelection([node.id], node.id);
  render();
}

function openLocalAssetPicker(node) {
  if (!requireCanvasMutation()) return;
  if (node.kind !== "generator" || node.generating) return;
  state.pendingUploadNodeId = node.id;
  state.pendingCanvasUploadPoint = null;
  localAssetInput.value = "";
  localAssetInput.click();
}

function getNodeFromElement(target) {
  if (!(target instanceof Element)) return null;
  const nodeEl = target.closest(".canvas-node");
  return nodeEl ? state.nodes.find((node) => node.id === nodeEl.dataset.id) || null : null;
}

function hasDraggedFiles(event) {
  return Array.from(event.dataTransfer?.types || []).includes("Files");
}

function hasDraggedLibraryAsset(event) {
  return Array.from(event.dataTransfer?.types || []).includes("application/x-reelay-asset");
}

function isCanvasDropTarget(target) {
  return target instanceof Element && Boolean(target.closest("#canvasShell"));
}

function render() {
  if (state.entityUsePickerTargetNodeId) {
    const pickerTarget = state.nodes.find((node) => node.id === state.entityUsePickerTargetNodeId);
    if (!pickerTarget || pickerTarget.kind !== "generator" || pickerTarget.generating || !canNodeUseEntityReferences(pickerTarget)) {
      closeEntityUsePicker({ restoreFocus: false });
    }
  }
  syncGroups();
  canvasNodeLayoutTransition.prune(new Set(state.nodes.map(getNodeLayoutTransitionId)));
  canvasLayerReconciler.reconcile({ groups: state.groups, nodes: state.nodes });
  shell.classList.toggle("group-editing", Boolean(state.activeGroupId));
  renderGroupResizeOverlay();
  renderConnections();
  updateEmptyState();
  syncProjectNavigation();
  renderSelectionToolbar();
  renderMinimap();
  renderAssetLibrary();
  refreshIcons();
  syncCanvasAccessUi();
  scheduleGroupChromeLayout();
  requestAnimationFrame(syncPromptPanelLayouts);
  scheduleCanvasDocumentSave();
}

function getNodeRenderSignature(node) {
  const renderState = Object.fromEntries(
    Object.entries(node).filter(([key]) => !["x", "y", "z", "groupId", "aspect"].includes(key)),
  );
  renderState.mediaToolbarVisible = shouldShowMediaEditToolbar(node);
  renderState.linkedReferences = getIncomingConnections(node.id).map((connection) => {
    const source = state.nodes.find((item) => item.id === connection.sourceNodeId);
    const asset = source ? getEditableMedia(source) : null;
    return {
      id: connection.id,
      sourceNodeId: connection.sourceNodeId,
      type: asset?.type || null,
      url: asset?.url || null,
      name: source && asset ? getMediaTitle(source, asset) || getAssetDisplayName(asset) : null,
    };
  });
  return JSON.stringify(renderState);
}

function getGroupRenderSignature(group) {
  const renderState = Object.fromEntries(
    Object.entries(group).filter(([key]) => !["x", "y", "width", "height", "z", "nodeIds"].includes(key)),
  );
  return JSON.stringify(renderState);
}

function syncCanvasNodeElement(element, node) {
  element.style.zIndex = String(node.z);
  element.classList.toggle("selected", state.selectedIds.has(node.id));
  element.classList.toggle("grouped", Boolean(node.groupId));
  syncNodeVisualLayout(node, element);
  syncNodeAspectUi(node, element);
}

function syncGroupFrameElement(element, group) {
  const bounds = getGroupBounds(group);
  const nodes = getGroupNodes(group);
  if (!bounds) return;
  element.style.left = `${bounds.left}px`;
  element.style.top = `${bounds.top}px`;
  element.style.width = `${bounds.width}px`;
  element.style.height = `${bounds.height}px`;
  element.style.zIndex = String(
    nodes.length ? Math.max(0, Math.min(...nodes.map((node) => node.z || 1)) - 1) : group.z || 1,
  );
  element.classList.toggle("selected", state.activeGroupId === group.id);
}

function scheduleGroupChromeLayout() {
  window.cancelAnimationFrame(state.groupChromeFrame);
  state.groupChromeFrame = window.requestAnimationFrame(() => {
    state.groupChromeFrame = 0;
    const frame = nodeLayer.querySelector(".group-frame.selected");
    if (!frame) return;
    const title = frame.querySelector(".group-title");
    const toolbar = frame.querySelector(".group-toolbar");
    if (!title || !toolbar) return;
    frame.style.removeProperty("--group-toolbar-lift");
    const titleRect = title.getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();
    const overlap = titleRect.right + 6 > toolbarRect.left
      && toolbarRect.right + 6 > titleRect.left;
    if (!overlap) return;
    const liftScreen = titleRect.height + 6;
    frame.style.setProperty(
      "--group-toolbar-lift",
      `${(liftScreen / state.scale).toFixed(2)}px`,
    );
  });
}

function createGroupFrameElement(group) {
  const bounds = getGroupBounds(group);
  const nodes = getGroupNodes(group);
  if (!bounds) return null;
  const selected = state.activeGroupId === group.id;
  const el = document.createElement("section");
  el.className = `group-frame ${selected ? "selected" : ""}`;
  el.style.left = `${bounds.left}px`;
  el.style.top = `${bounds.top}px`;
  el.style.width = `${bounds.width}px`;
  el.style.height = `${bounds.height}px`;
  el.style.zIndex = String(
    nodes.length ? Math.max(0, Math.min(...nodes.map((node) => node.z || 1)) - 1) : group.z || 1,
  );
  el.dataset.groupId = group.id;
  el.innerHTML = `
    <div class="group-title">${escapeHtml(group.name || "新建组")}</div>
    <div class="group-toolbar">
      <div class="toolbar-menu-wrap">
      <button class="icon-toolbar-button" type="button" data-group-action="toggle-layout" data-canvas-mutation aria-label="布局">
          <i data-lucide="layout-grid" aria-hidden="true"></i>
          <i data-lucide="chevron-down" aria-hidden="true"></i>
          <span class="toolbar-tip">布局</span>
        </button>
        <div class="toolbar-dropdown group-layout-menu ${group.layoutMenuOpen ? "" : "hidden"}">
          <button type="button" data-group-layout="grid" data-canvas-mutation><i data-lucide="grid-3x3" aria-hidden="true"></i><span>宫格布局</span></button>
          <button type="button" data-group-layout="horizontal" data-canvas-mutation><i data-lucide="align-horizontal-space-around" aria-hidden="true"></i><span>水平布局</span></button>
          <button type="button" data-group-layout="vertical" data-canvas-mutation><i data-lucide="align-vertical-space-around" aria-hidden="true"></i><span>垂直布局</span></button>
        </div>
      </div>
      <button class="icon-toolbar-button primary" type="button" data-group-action="run" data-canvas-mutation aria-label="整组执行">
        <i data-lucide="play" aria-hidden="true"></i>
        <span class="toolbar-tip">整组执行</span>
      </button>
      <button class="icon-toolbar-button" type="button" data-group-action="ungroup" data-canvas-mutation aria-label="解组">
        <i data-lucide="ungroup" aria-hidden="true"></i>
        <span class="toolbar-tip">解组</span>
      </button>
      <button class="icon-toolbar-button" type="button" data-group-action="download" aria-label="下载组内素材">
        <i data-lucide="download" aria-hidden="true"></i>
        <span class="toolbar-tip">下载</span>
      </button>
    </div>
  `;
  bindGroupFrameEvents(el);
  return el;
}

function bindGroupFrameEvents(el) {
  el.addEventListener("pointerdown", (event) => {
    const liveGroup = getGroupById(el.dataset.groupId);
    if (!liveGroup) return;
    if (event.button === 1 || (event.button === 0 && state.isSpaceDown)) {
      event.preventDefault();
      event.stopPropagation();
      beginPan(event);
      return;
    }

    if (event.button !== 0) return;
    event.stopPropagation();
    if (event.target.closest("button, .toolbar-dropdown")) {
      setActiveGroup(liveGroup.id);
      return;
    }
    if (!isCanvasMutationAllowed()) {
      setActiveGroup(liveGroup.id);
      render();
      return;
    }

    canvasGroupInteractionController.beginDrag(liveGroup, event, shell);
  });

  el.addEventListener("click", (event) => {
    event.stopPropagation();
    const groupId = el.dataset.groupId;
    const activeGroup = getGroupById(groupId);
    if (!activeGroup) return;

    const layout = event.target.closest("[data-group-layout]")?.dataset.groupLayout;
    if (layout) {
      arrangeGroup(activeGroup, layout);
      return;
    }

    const action = event.target.closest("[data-group-action]")?.dataset.groupAction;
    if (action === "toggle-layout") {
      activeGroup.layoutMenuOpen = !activeGroup.layoutMenuOpen;
      setActiveGroup(activeGroup.id);
      render();
      const menu = nodeLayer.querySelector(`[data-group-id="${activeGroup.id}"] .group-layout-menu`);
      menu?.classList.toggle("hidden", !activeGroup.layoutMenuOpen);
      return;
    }
    if (action === "run") {
      requestRunGroup(activeGroup);
      return;
    }
    if (action === "ungroup") {
      ungroup(activeGroup.id);
      return;
    }
    if (action === "download") {
      downloadNodesMedia(getGroupNodes(activeGroup));
    }
  });
}

function renderGroupResizeOverlay() {
  if (!groupResizeOverlay) return;
  const group = getGroupById(state.activeGroupId);
  const bounds = getGroupBounds(group);
  if (!group || !bounds || !isCanvasMutationAllowed()) {
    groupResizeOverlay.classList.add("hidden");
    delete groupResizeOverlay.dataset.groupId;
    delete groupResizeOverlay.dataset.activeResize;
    return;
  }
  const screenRect = canvasSpatialSelection.getSelectionScreenRect(bounds, state, 0);
  if (!screenRect) {
    groupResizeOverlay.classList.add("hidden");
    return;
  }
  groupResizeOverlay.dataset.groupId = group.id;
  groupResizeOverlay.style.left = `${screenRect.left}px`;
  groupResizeOverlay.style.top = `${screenRect.top}px`;
  groupResizeOverlay.style.width = `${screenRect.width}px`;
  groupResizeOverlay.style.height = `${screenRect.height}px`;
  groupResizeOverlay.classList.remove("hidden");
  if (state.action?.type === "resize-group" && state.action.groupId === group.id) {
    groupResizeOverlay.dataset.activeResize = state.action.handle;
  } else {
    delete groupResizeOverlay.dataset.activeResize;
  }
}

function getSelectedNodes() {
  return state.nodes.filter((node) => state.selectedIds.has(node.id));
}

function getExactSelectionGroup(selectedNodes = getSelectedNodes()) {
  return canvasSpatialSelection.getExactSelectionGroup(selectedNodes, state.groups);
}

function isSelectionFrameDragAction(action = state.action) {
  return action?.interactionSource === "selection-frame"
    && (action.type === "drag-candidate" || action.type === "drag-nodes");
}

function updateEmptyState() {
  if (!emptyState) return;
  emptyState.classList.toggle("hidden", state.nodes.length > 0);
}

function getSelectionVisualBounds() {
  const selectedNodes = getSelectedNodes();
  if (selectedNodes.length < 2) return null;
  const bounds = selectedNodes.reduce(
    (result, node) => {
      const nodeBounds = getNodeVisualBounds(node);
      return {
        left: Math.min(result.left, nodeBounds.left),
        top: Math.min(result.top, nodeBounds.top),
        right: Math.max(result.right, nodeBounds.right),
        bottom: Math.max(result.bottom, nodeBounds.bottom),
      };
    },
    { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
  );
  return {
    ...bounds,
    width: bounds.right - bounds.left,
    height: bounds.bottom - bounds.top,
  };
}

function renderSelectionToolbar() {
  if (!selectionToolbar || !multiSelectionSurface || !multiSelectionChrome) return;
  const selectedNodes = getSelectedNodes();
  const exactSelectionGroup = getExactSelectionGroup(selectedNodes);
  const bounds = getSelectionVisualBounds();
  const screenRect = canvasSpatialSelection.getSelectionScreenRect(bounds, state, 0);
  if (!screenRect) {
    shell.classList.remove(
      "multi-selection-active",
      "selection-frame-hover",
      "selection-frame-pressed",
    );
    multiSelectionSurface.classList.add("hidden");
    multiSelectionChrome.classList.add("hidden");
    multiSelectionChrome.classList.remove("is-connecting");
    multiSelectionPort?.removeAttribute("style");
    selectionToolbar.classList.add("hidden");
    setSelectionDownloadMenuOpen(false);
    return;
  }

  shell.classList.add("multi-selection-active");
  if (exactSelectionGroup) {
    shell.classList.remove("selection-frame-hover", "selection-frame-pressed");
  }

  const isSelectionConnecting = state.action?.type === "connect"
    && state.action.mode === "selection-output"
    || state.connectionDrop?.kind === "selection";
  [multiSelectionSurface, multiSelectionChrome].forEach((element) => {
    element.style.left = `${screenRect.left}px`;
    element.style.top = `${screenRect.top}px`;
    element.style.width = `${screenRect.width}px`;
    element.style.height = `${screenRect.height}px`;
  });
  multiSelectionChrome.classList.remove("hidden");
  multiSelectionSurface.classList.toggle("hidden", Boolean(exactSelectionGroup));
  multiSelectionChrome.classList.toggle("is-connecting", isSelectionConnecting);
  if (!isSelectionConnecting) multiSelectionPort?.removeAttribute("style");
  if (isSelectionConnecting) {
    selectionToolbar.classList.add("hidden");
    return;
  }

  selectionToolbar.classList.toggle(
    "group-unavailable",
    selectedNodes.some((node) => Boolean(node.groupId)),
  );
  selectionToolbar.classList.remove("hidden");
  const toolbarWidth = selectionToolbar.offsetWidth || 260;
  const toolbarHeight = selectionToolbar.offsetHeight || 42;
  const viewportPadding = 12;
  const visibleLeft = Math.max(viewportPadding, screenRect.left);
  const visibleRight = Math.min(shell.clientWidth - viewportPadding, screenRect.right);
  const preferredCenter = visibleLeft <= visibleRight
    ? (visibleLeft + visibleRight) / 2
    : screenRect.centerX;
  const toolbarX = clamp(
    preferredCenter,
    viewportPadding + toolbarWidth / 2,
    shell.clientWidth - viewportPadding - toolbarWidth / 2,
  );
  const spaceAbove = screenRect.top - 12;
  const toolbarY = spaceAbove - toolbarHeight >= 70
    ? spaceAbove - toolbarHeight
    : Math.min(shell.clientHeight - toolbarHeight - viewportPadding, screenRect.bottom + 12);
  selectionToolbar.style.left = `${toolbarX}px`;
  selectionToolbar.style.top = `${Math.max(70, toolbarY)}px`;
}

function createNodeElement(node) {
  return node.kind === "asset" ? createAssetNodeElement(node) : createGeneratorNodeElement(node);
}

function createAssetNodeElement(node) {
  const layout = getNodeLayout(node);
  const asset = getActiveAsset(node);
  const selected = state.selectedIds.has(node.id);
  const el = document.createElement("article");
  el.className = `canvas-node generator-node asset-node ${asset?.type || "media"}-source ${selected ? "selected" : ""} ${node.groupId ? "grouped" : ""}`;
  el.style.left = `${node.x}px`;
  el.style.top = `${node.y}px`;
  el.style.width = `${layout.nodeWidth}px`;
  el.style.zIndex = String(node.z);
  el.dataset.id = node.id;

  el.innerHTML = `
    <section class="media-frame source-frame ${asset ? `has-asset ${asset.type}-asset` : ""}" style="width: ${layout.mediaWidth}px; height: ${layout.mediaHeight}px;" data-drag-handle="true">
      ${mediaEditToolbar(node, layout)}
      ${mediaMeta(node)}
      ${assetMediaContent(asset)}
      ${nodePortMarkup(node)}
    </section>
  `;

  bindNodeEvents(el, node);
  return el;
}

function entityEntryIconMarkup() {
  return `
    <span class="entity-entry-glyph" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="4.5" y="3.5" width="15" height="17" rx="2.5"/>
        <circle cx="12" cy="9.25" r="2.1" fill="currentColor" stroke="none"/>
        <path d="M8.4 16.4c.45-2.2 1.7-3.3 3.6-3.3s3.15 1.1 3.6 3.3"/>
      </svg>
    </span>
  `;
}

function createGeneratorNodeElement(node) {
  const model = getModel(node);
  const layout = getNodeLayout(node);
  const isVideoNode = getNodeGenerationMode(node) === "video";
  const supportsEntityReferences = canNodeUseEntityReferences(node);
  const selected = state.selectedIds.has(node.id);
  const generationAvailability = getGenerationAvailability(node);
  const el = document.createElement("article");
  el.className = `canvas-node generator-node ${node.mode}-mode ${selected ? "selected" : ""} ${node.groupId ? "grouped" : ""}`;
  el.style.left = `${node.x}px`;
  el.style.top = `${node.y}px`;
  el.style.width = `${layout.nodeWidth}px`;
  el.style.zIndex = String(node.z);
  el.dataset.id = node.id;
  const generationInputsDisabled = node.generating ? "disabled" : "";
  const promptInputDisabled = node.generating || node.promptOptimizing ? "disabled" : "";

  const promptPanel = node.expanded
    ? `
      <section class="prompt-panel prompt-composer-surface prompt-composer-layout ${supportsEntityReferences ? "has-entity-entry" : ""} ${node.advancedSettingsExpanded ? "has-advanced-settings" : ""} ${node.promptOptimizing ? "prompt-is-optimizing" : ""}" style="width: ${layout.panelWidth}px; height: ${layout.panelHeight}px; --prompt-scale: ${layout.promptScale}; --prompt-extra-height: ${(layout.panelHeight * (layout.promptScale - 1)).toFixed(2)}px; --prompt-composer-height: ${layout.composerHeight}px; --prompt-advanced-height: ${layout.advancedSettingsHeight}px; --prompt-input-top: ${layoutRules.promptInputTop}px; --prompt-input-bottom: ${layoutRules.promptInputBottom}px;">
        ${supportsEntityReferences ? `<button class="entity-drop" data-action="entity-picker" data-canvas-mutation type="button" aria-label="添加主体" title="添加主体" ${generationInputsDisabled}>${entityEntryIconMarkup()}</button>` : ""}
        <button class="asset-drop ${node.panel === "material" ? "active" : ""}" data-action="material-panel" data-canvas-mutation type="button" aria-label="添加参考素材" title="添加参考素材" ${generationInputsDisabled}><i data-lucide="plus" aria-hidden="true"></i></button>
        ${assetShelf(node)}
        <textarea class="prompt-input" data-node-prompt-input placeholder="描述你想生成的内容，或输入 @ 引用" ${promptInputDisabled}>${escapeHtml(node.prompt)}</textarea>
        <div class="control-bar">
          <button class="control-chip model-chip has-divider ${node.panel === "model" ? "active" : ""}" data-action="model-panel" type="button" ${generationInputsDisabled}>
            ${modelIconMarkup(model, "model-chip-glyph")}
            <span class="control-chip-label">${escapeHtml(model?.name || "暂无可用模型")}</span>
          </button>
          <button class="control-chip param-chip ${node.panel === "params" ? "active" : ""}" data-action="param-panel" type="button" ${generationInputsDisabled}>
            <span class="control-chip-label param-chip-label">${getParamLabelMarkup(node)}</span>
            ${getNodeGenerationMode(node) === "video" ? `<span class="control-chip-audio-separator" aria-hidden="true">·</span><i data-lucide="${node.audioEnabled ? "volume-2" : "volume-x"}" aria-label="${node.audioEnabled ? "音频开启" : "音频关闭"}"></i>` : ""}
          </button>
          <div class="control-spacer"></div>
          ${isVideoNode ? `
            <button class="control-chip composer-tool-button prompt-optimization-button ${node.promptOptimizing ? "is-processing" : ""}" data-action="prompt-optimization" data-canvas-mutation type="button" title="${node.promptOptimizing ? "正在优化提示词" : node.prompt.trim() ? "优化提示词" : "输入提示词后优化"}" aria-label="${node.promptOptimizing ? "正在优化提示词" : "提示词优化"}" aria-busy="${node.promptOptimizing}" ${node.generating || node.promptOptimizing || !node.prompt.trim() ? "disabled" : ""}>
              <svg class="prompt-optimization-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 3.75h7.4l3.1 3.1v10.9a2 2 0 0 1-2 2H7.5a2 2 0 0 1-2-2v-12a2 2 0 0 1 2-2Z"/><path d="M14.6 3.9v3.4h3.3M8.5 11h4.2M8.5 14.2h3"/><path class="prompt-sparkle" d="M18.25 10.6c.2 1.15.95 1.9 2.1 2.1-1.15.2-1.9.95-2.1 2.1-.2-1.15-.95-1.9-2.1-2.1 1.15-.2 1.9-.95 2.1-2.1Z"/></svg>
              <span class="prompt-optimization-spinner" aria-hidden="true"></span>
            </button>
          ` : ""}
          <button class="control-chip composer-tool-button advanced-settings-chip ${node.advancedSettingsExpanded ? "active" : ""}" data-action="advanced-settings-toggle" type="button" title="高级设置" aria-label="高级设置" aria-expanded="${node.advancedSettingsExpanded}" aria-controls="advanced-settings-${escapeHtml(node.id)}" ${generationInputsDisabled}>
            <svg class="advanced-settings-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5h11M4 11.5h8M4 16.5h5"/><circle cx="17" cy="15.5" r="3.1"/><path d="M17 10.8v1.2M17 19v1.2M12.3 15.5h1.2M20.5 15.5h1.2M13.7 12.2l.85.85M19.45 17.95l.85.85M20.3 12.2l-.85.85M14.55 17.95l-.85.85"/></svg>
          </button>
          <button class="generate-button ${generationAvailability.canGenerate ? "" : "disabled"}" data-action="generate" data-canvas-mutation data-tooltip="${generationAvailability.tooltip}" aria-disabled="${generationAvailability.canGenerate ? "false" : "true"}" type="button">
            <span class="credit-mark"><img class="credit-semantic-icon" src="./assets/icons/credit-prism.svg" alt="" aria-hidden="true" /><span>${node.credits}</span></span>
            <span class="send-arrow"><svg class="send-arrow-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M10.25 20.6V9.45L6.7 13q-.95.95-1.9 0l-.75-.75q-.95-.95 0-1.9l6.5-6.5q1.45-1.45 2.9 0l6.5 6.5q.95.95 0 1.9l-.75.75q-.95.95-1.9 0l-3.55-3.55V20.6q0 1.4-1.4 1.4h-.7q-1.4 0-1.4-1.4Z" /></svg></span>
          </button>
        </div>
        ${node.panel === "material" ? materialPanel() : ""}
        ${node.panel === "model" ? modelPanel(node) : ""}
        ${node.panel === "params" ? paramPanel(node) : ""}
        ${node.advancedSettingsExpanded ? advancedSettingsPanel(node) : ""}
      </section>
    `
    : "";

  el.innerHTML = `
    <section class="media-frame generator-frame ${node.preview ? "has-preview" : ""}" style="width: ${layout.mediaWidth}px; height: ${layout.mediaHeight}px;" data-drag-handle="true">
      ${mediaEditToolbar(node, layout)}
      ${mediaMeta(node)}
      ${generatorMediaContent(node)}
      ${nodePortMarkup(node)}
    </section>
    ${promptPanel}
  `;

  bindNodeEvents(el, node);
  const promptInput = el.querySelector(".prompt-input");
  promptInput?.addEventListener("input", (event) => {
    if (!requireCanvasMutation()) {
      event.currentTarget.value = node.prompt;
      return;
    }
    node.prompt = event.currentTarget.value;
    syncPromptPanelContentHeight(node, el);
    syncPromptOptimizationButton(el.querySelector(".prompt-optimization-button"), node);
    syncGenerateButton(el.querySelector(".generate-button"), node);
    scheduleCanvasDocumentSave();
  });

  const durationRange = el.querySelector("[data-duration-range]");
  const durationNumber = el.querySelector("[data-duration-number]");
  durationRange?.addEventListener("input", (event) => {
    const seconds = normalizeDurationControlSeconds(event.currentTarget, event.currentTarget.value);
    syncDurationRangeControl(event.currentTarget, seconds);
    if (durationNumber) durationNumber.value = String(seconds);
  });
  durationRange?.addEventListener("change", (event) => {
    const seconds = normalizeDurationControlSeconds(event.currentTarget, event.currentTarget.value);
    syncDurationRangeControl(event.currentTarget, seconds);
    if (durationNumber) durationNumber.value = String(seconds);
    handleAction(node, "duration", `${seconds}s`);
  });
  durationNumber?.addEventListener("input", (event) => {
    if (!durationRange || event.currentTarget.value === "") return;
    const seconds = normalizeDurationControlSeconds(durationRange, event.currentTarget.value);
    syncDurationRangeControl(durationRange, seconds);
  });
  durationNumber?.addEventListener("change", (event) => {
    if (!durationRange) return;
    const seconds = normalizeDurationControlSeconds(durationRange, event.currentTarget.value);
    event.currentTarget.value = String(seconds);
    syncDurationRangeControl(durationRange, seconds);
    handleAction(node, "duration", `${seconds}s`);
  });
  durationNumber?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.currentTarget.blur();
  });

  el.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      handleAction(node, event.currentTarget.dataset.action, event.currentTarget.dataset.value);
    });
  });
  el.querySelectorAll("[data-setting-info]").forEach((trigger) => {
    trigger.addEventListener("pointerdown", (event) => event.stopPropagation());
    trigger.addEventListener("click", (event) => event.stopPropagation());
    trigger.addEventListener("pointerenter", () => requestAnimationFrame(() => syncAdvancedSettingTooltipLayout(trigger)));
    trigger.addEventListener("focus", () => requestAnimationFrame(() => syncAdvancedSettingTooltipLayout(trigger)));
  });
  bindModelPanelEvents(el, node);
  requestAnimationFrame(() => {
    const resized = syncPromptPanelContentHeight(node, el);
    if (!resized) syncNodePopoverLayout(el);
  });

  return el;
}

function bindNodeEvents(el, node) {
  el.addEventListener("pointerdown", (event) => handleNodePointerDown(event, node.id));
  el.addEventListener("dragstart", (event) => event.preventDefault());
  bindMediaTitleEvents(el, node);
  bindAudioEvents(el);
  bindMediaToolbarEvents(el, node);
  el.querySelectorAll("[data-node-port-zone]").forEach((zone) => {
    const side = zone.dataset.nodePortZone;
    zone.addEventListener("pointermove", (event) => {
      if (state.action?.type === "connect") return;
      positionNodePortAtPointer(zone, event.clientX, event.clientY);
    });
    zone.addEventListener("pointerleave", () => {
      if (state.action?.type === "connect") return;
      resetNodePortPosition(zone);
    });
    zone.addEventListener("pointerdown", (event) => {
      if (event.button === 1 || (event.button === 0 && state.isSpaceDown)) {
        event.preventDefault();
        event.stopPropagation();
        beginPan(event);
        return;
      }
      positionNodePortAtPointer(zone, event.clientX, event.clientY);
      beginConnectionDrag(event, node.id, side);
    });
  });
}

function showActionToast(message) {
  document.querySelector(".action-toast")?.remove();
  const toast = document.createElement("div");
  toast.className = "action-toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("visible"));
  window.setTimeout(() => {
    toast.classList.remove("visible");
    window.setTimeout(() => toast.remove(), 180);
  }, 2200);
}

function persistMediaToolPreferences() {
  localStorage.setItem("reelay-media-tools", JSON.stringify(state.mediaToolPreferences));
}

async function downloadMediaAsset(node) {
  const asset = getEditableMedia(node);
  if (!asset?.url) {
    showActionToast("当前媒体暂无可下载内容");
    return;
  }
  const fileName = `${getMediaTitle(node, asset) || `reelay-${asset.type}`}.${getAssetDownloadExtension(asset)}`;
  await downloadAssetFile(asset, fileName);
}

function getAssetDownloadExtension(asset) {
  if (asset.type === "image") return "jpg";
  if (asset.type === "video") return "mp4";
  return "mp3";
}

async function downloadAssetFile(asset, fileName = `${getAssetDisplayName(asset) || `reelay-${asset.type}`}.${getAssetDownloadExtension(asset)}`) {
  const safeUrl = sanitizeRuntimeMediaUrl(asset?.url);
  if (!safeUrl) return false;
  try {
    const response = await fetch(safeUrl);
    if (!response.ok) throw new Error("Download failed");
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch {
    const anchor = document.createElement("a");
    anchor.href = safeUrl;
    anchor.target = "_blank";
    anchor.rel = "noopener";
    anchor.click();
  }
  return true;
}

function addEditableMediaToLibrary(node) {
  const asset = getEditableMedia(node);
  if (!asset) return;
  const sourceId = asset.librarySourceId || asset.id;
  const registered = findRegisteredLibraryMedia(asset);
  if (hasPersonalLibraryPlacement(registered)) {
    showActionToast("该媒体已在个人素材中");
    return;
  }
  if (window.parent !== window && !asset.workspaceAssetId && !registered?.workspaceAssetId) {
    showActionToast("该媒体尚未持久化，当前不能加入云端素材库");
    return;
  }
  registerLibraryAssets(
    [
      registered || {
        ...cloneAsset(asset, "generated"),
        librarySourceId: sourceId,
      },
    ],
    "project",
  );
  showActionToast("已加入个人素材");
}

function enhanceEditableMedia(node) {
  if (!requireCanvasMutation()) return;
  const asset = getEditableMedia(node);
  if (!asset) return;
  if (!asset.enhanced) {
    if (asset.width && asset.height) {
      asset.width *= 2;
      asset.height *= 2;
    }
    asset.enhanced = true;
  }
  node.mediaMenuOpen = false;
  render();
  showActionToast(asset.type === "audio" ? "已应用音质增强模拟" : "已应用 HD 增强模拟");
}

function showMediaEditPreview(node, toolId) {
  const type = getNodeMediaType(node);
  const label = getMediaToolLabel(toolId, type);
  node.mediaMenuOpen = false;
  render();
  showConfirmDialog({
    title: label,
    body: `已打开「${label}」编辑入口。\n当前前端原型保留操作结构，后续接入媒体处理服务后会在这里显示实时预览与可撤销参数。`,
    confirmText: "知道了",
    showCancel: false,
  });
}

function showMediaToolbarSettings(node) {
  document.querySelector(".media-customize-layer")?.remove();
  const type = getNodeMediaType(node);
  const preference = state.mediaToolPreferences[type] || defaultMediaToolPreferences[type];
  const selectedTools = new Set(preference.tools);
  let showLabels = preference.showLabels;
  const layer = document.createElement("div");
  layer.className = "media-customize-layer";

  const renderDialog = () => {
    const orderedSelection = mediaToolsByType[type].filter((tool) => selectedTools.has(tool));
    layer.innerHTML = `
      <section class="media-customize-dialog" role="dialog" aria-modal="true" aria-label="自定义工具栏">
        <header class="media-customize-header">
          <div>
            <div class="media-customize-title">自定义工具栏</div>
            <div class="media-customize-subtitle">选择常用工具，更多功能仍保留在扩展菜单中</div>
          </div>
          <button class="media-customize-close" type="button" data-customize-action="close" title="关闭" aria-label="关闭">
            <i data-lucide="x" aria-hidden="true"></i>
          </button>
        </header>
        <div class="media-customize-preview">
          ${orderedSelection
            .map(
              (tool) => `
                <span>
                  <i data-lucide="${mediaToolDefinitions[tool].icon}" aria-hidden="true"></i>
                  ${showLabels ? `<b>${getMediaToolLabel(tool, type)}</b>` : ""}
                </span>
              `,
            )
            .join("")}
          <span><i data-lucide="ellipsis" aria-hidden="true"></i></span>
          <span><i data-lucide="download" aria-hidden="true"></i></span>
        </div>
        <div class="media-customize-options">
          ${mediaToolsByType[type]
            .map((tool) => {
              const selected = selectedTools.has(tool);
              return `
                <button class="media-customize-option ${selected ? "selected" : ""}" type="button" data-customize-tool="${tool}">
                  <i data-lucide="${mediaToolDefinitions[tool].icon}" aria-hidden="true"></i>
                  <span>${getMediaToolLabel(tool, type)}</span>
                  <i data-lucide="${selected ? "pin" : "pin-off"}" aria-hidden="true"></i>
                </button>
              `;
            })
            .join("")}
        </div>
        <footer class="media-customize-footer">
          <button class="media-label-toggle ${showLabels ? "active" : ""}" type="button" data-customize-action="labels" role="switch" aria-checked="${showLabels}">
            <span class="media-toggle-track"><i></i></span>
            <span>显示工具名称</span>
          </button>
          <div>
            <button class="media-customize-cancel" type="button" data-customize-action="close">取消</button>
            <button class="media-customize-save" type="button" data-customize-action="save">保存</button>
          </div>
        </footer>
      </section>
    `;
    refreshIcons();
  };

  layer.addEventListener("click", (event) => {
    if (event.target === layer || event.target.closest("[data-customize-action='close']")) {
      layer.remove();
      return;
    }
    const toolButton = event.target.closest("[data-customize-tool]");
    if (toolButton) {
      const tool = toolButton.dataset.customizeTool;
      if (selectedTools.has(tool)) {
        if (selectedTools.size > 1) selectedTools.delete(tool);
      } else {
        selectedTools.add(tool);
      }
      renderDialog();
      return;
    }
    const action = event.target.closest("[data-customize-action]")?.dataset.customizeAction;
    if (action === "labels") {
      showLabels = !showLabels;
      renderDialog();
    }
    if (action === "save") {
      state.mediaToolPreferences[type] = {
        tools: mediaToolsByType[type].filter((tool) => selectedTools.has(tool)),
        showLabels,
      };
      persistMediaToolPreferences();
      node.mediaMenuOpen = false;
      layer.remove();
      render();
      showActionToast("工具栏设置已保存");
    }
  });

  document.body.appendChild(layer);
  renderDialog();
}

function handleMediaToolAction(node, action) {
  if (action === "toggle-more") {
    node.mediaMenuOpen = !node.mediaMenuOpen;
    render();
    return;
  }
  if (action === "download") {
    downloadMediaAsset(node);
    return;
  }
  if (action === "add-library") {
    if (!requireCanvasMutation()) return;
    node.mediaMenuOpen = false;
    addEditableMediaToLibrary(node);
    render();
    return;
  }
  if (action === "enhance") {
    if (!requireCanvasMutation()) return;
    enhanceEditableMedia(node);
    return;
  }
  if (action === "customize") {
    showMediaToolbarSettings(node);
    return;
  }
  showMediaEditPreview(node, action);
}

function bindMediaToolbarEvents(element, node) {
  const toolbar = element.querySelector("[data-media-toolbar]");
  if (!toolbar) return;
  toolbar.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  toolbar.addEventListener("click", (event) => {
    const button = event.target.closest("[data-media-tool]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    handleMediaToolAction(node, button.dataset.mediaTool);
  });
}

function selectElementText(element) {
  const range = document.createRange();
  range.selectNodeContents(element);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function renameMediaNode(node, value) {
  if (!requireCanvasMutation()) return;
  const before = cloneNodeState(node);
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (node.kind === "asset") {
    const asset = getActiveAsset(node);
    if (asset) {
      asset.displayName = cleaned || getAssetDisplayName(asset);
    }
  } else if (node.preview) {
    node.name = cleaned || defaultGeneratedName(node);
  }

  if (JSON.stringify(before) !== JSON.stringify(node)) {
    before.panel = null;
    pushUndoAction({ type: "node-update", node: before });
  }
}

function bindMediaTitleEvents(el, node) {
  const titleShell = el.querySelector("[data-title-shell]");
  const title = el.querySelector("[data-media-title]");
  if (!titleShell || !title) return;

  let beforeEdit = title.textContent;

  const finish = (commit = true) => {
    if (title.contentEditable !== "true") return;
    if (commit) {
      renameMediaNode(node, title.textContent || "");
    } else {
      title.textContent = beforeEdit;
    }
    title.contentEditable = "false";
    title.classList.remove("editing");
    title.blur();
  };

  const start = (event) => {
    if (!requireCanvasMutation()) return;
    event.preventDefault();
    event.stopPropagation();
    beforeEdit = title.textContent;
    title.contentEditable = "true";
    title.classList.add("editing");
    title.focus();
    selectElementText(title);
  };

  titleShell.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  titleShell.addEventListener("dblclick", start);
  titleShell.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      finish(true);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      finish(false);
    }
  });
  title.addEventListener("blur", () => finish(true));
}

function bindAudioEvents(el) {
  const audio = el.querySelector(".frame-audio");
  const button = el.querySelector("[data-audio-toggle]");
  const audioContent = el.querySelector(".media-content.audio");
  const waveform = el.querySelector("[data-audio-waveform]");
  const track = el.querySelector("[data-audio-track]");
  const progress = el.querySelector("[data-audio-progress]");
  const progressFill = el.querySelector("[data-audio-progress-fill]");
  if (!audio || !button || !audioContent) return;

  let animationFrameId = null;
  let progressSeekTarget = null;
  let waveformDragState = null;

  const getProgress = () => {
    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
    return duration ? clamp(audio.currentTime / duration, 0, 1) : 0;
  };

  const updateAudioProgress = () => {
    const value = getProgress();
    if (waveform && track) {
      const maxOffset = Math.max(0, track.scrollWidth - waveform.clientWidth);
      track.style.setProperty("--audio-offset", `${(-value * maxOffset).toFixed(2)}px`);
    }
    if (progressFill) {
      progressFill.style.width = `${(value * 100).toFixed(2)}%`;
    }
    progress?.setAttribute("aria-valuenow", String(Math.round(value * 100)));
  };

  const stopProgressLoop = () => {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    updateAudioProgress();
  };

  const startProgressLoop = () => {
    stopProgressLoop();
    const tick = () => {
      updateAudioProgress();
      if (!audio.paused && !audio.ended) {
        animationFrameId = requestAnimationFrame(tick);
      }
    };
    tick();
  };

  const setPlaying = (playing) => {
    audioContent.classList.toggle("playing", playing);
    button.innerHTML = `<i data-lucide="${playing ? "pause" : "play"}" aria-hidden="true"></i>`;
    refreshIcons();
  };

  const setAudioProgress = (value) => {
    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
    if (!duration) return;
    audio.currentTime = clamp(value, 0, 1) * duration;
    updateAudioProgress();
  };

  const seekProgressFromPointer = (event, target) => {
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const value = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    setAudioProgress(value);
  };

  const beginProgressSeek = (event) => {
    event.preventDefault();
    event.stopPropagation();
    progressSeekTarget = progress;
    seekProgressFromPointer(event, progress);
    progress?.setPointerCapture?.(event.pointerId);
  };

  const moveProgressSeek = (event) => {
    if (!progressSeekTarget) return;
    event.preventDefault();
    seekProgressFromPointer(event, progressSeekTarget);
  };

  const endProgressSeek = (event) => {
    if (!progressSeekTarget) return;
    progressSeekTarget.releasePointerCapture?.(event.pointerId);
    progressSeekTarget = null;
  };

  const beginWaveformDrag = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
    if (!duration || !waveform) return;
    const rawScrollableWidth = track ? track.scrollWidth - waveform.clientWidth : 0;
    const scrollableWidth = Math.max(waveform.clientWidth || 1, rawScrollableWidth);
    waveformDragState = {
      startX: event.clientX,
      startOffset: getProgress() * scrollableWidth,
      scrollableWidth,
    };
    audioContent.classList.add("scrubbing");
    waveform.setPointerCapture?.(event.pointerId);
  };

  const moveWaveformDrag = (event) => {
    if (!waveformDragState) return;
    event.preventDefault();
    const deltaX = event.clientX - waveformDragState.startX;
    const nextOffset = waveformDragState.startOffset - deltaX;
    setAudioProgress(nextOffset / waveformDragState.scrollableWidth);
  };

  const endWaveformDrag = (event) => {
    if (!waveformDragState) return;
    waveform?.releasePointerCapture?.(event.pointerId);
    waveformDragState = null;
    audioContent.classList.remove("scrubbing");
  };

  button.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (audio.paused) {
      if (audio.ended) audio.currentTime = 0;
      audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  });
  waveform?.addEventListener("pointerdown", beginWaveformDrag);
  waveform?.addEventListener("pointermove", moveWaveformDrag);
  waveform?.addEventListener("pointerup", endWaveformDrag);
  waveform?.addEventListener("pointercancel", endWaveformDrag);
  progress?.addEventListener("pointerdown", beginProgressSeek);
  progress?.addEventListener("pointermove", moveProgressSeek);
  progress?.addEventListener("pointerup", endProgressSeek);
  progress?.addEventListener("pointercancel", endProgressSeek);
  progress?.addEventListener("keydown", (event) => {
    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
    if (!duration) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      audio.currentTime = clamp(audio.currentTime + direction * 5, 0, duration);
      updateAudioProgress();
    }
  });
  audio.addEventListener("loadedmetadata", updateAudioProgress);
  audio.addEventListener("timeupdate", updateAudioProgress);
  audio.addEventListener("seeked", updateAudioProgress);
  audio.addEventListener("play", () => {
    setPlaying(true);
    startProgressLoop();
  });
  audio.addEventListener("pause", () => {
    setPlaying(false);
    stopProgressLoop();
  });
  audio.addEventListener("ended", () => {
    setPlaying(false);
    audio.currentTime = 0;
    stopProgressLoop();
  });
  updateAudioProgress();
}

function getGenerationTaskTarget(task) {
  if (!task || task.projectId !== state.projectId) return null;
  const canvas = canvasRuntimeStore.getCanvas(task.canvasId);
  if (!canvas) return null;
  const node = canvas.nodes.find((item) => item.id === task.nodeId);
  return node ? { canvas, node } : null;
}

function cancelGenerationTask(taskId, resetNode = true) {
  const task = state.generationTasks.get(taskId);
  if (!task) return;
  window.clearTimeout(task.timeoutId);
  if (resetNode) {
    const target = getGenerationTaskTarget(task);
    if (target?.node.generationTaskId === task.id) {
      target.node.generating = false;
      delete target.node.generationTaskId;
      scheduleCanvasDocumentSave();
    }
  }
  state.generationTasks.delete(taskId);
}

function cancelGenerationTasks(predicate, resetNodes = true) {
  for (const task of [...state.generationTasks.values()]) {
    if (predicate(task)) cancelGenerationTask(task.id, resetNodes);
  }
}

function getPromptOptimizationTaskTarget(task) {
  if (!task || task.projectId !== state.projectId) return null;
  const canvas = canvasRuntimeStore.getCanvas(task.canvasId);
  if (!canvas) return null;
  const node = canvas.nodes.find((item) => item.id === task.nodeId);
  return node ? { canvas, node } : null;
}

function buildOptimizedPrompt(prompt) {
  const normalized = String(prompt || "")
    .trim()
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n");
  if (!normalized) return "";

  const chineseGuidance = "镜头运动自然连贯，主体动作清晰，光影层次细腻，画面节奏流畅。";
  const englishGuidance = "Keep the camera movement coherent, the subject action clear, and the lighting and pacing visually refined.";
  const mostlyLatin = (normalized.match(/[A-Za-z]/g)?.length || 0) > (normalized.match(/[\u3400-\u9fff]/g)?.length || 0) * 2;
  const guidance = mostlyLatin ? englishGuidance : chineseGuidance;
  if (normalized.includes(guidance)) return normalized;
  const separator = mostlyLatin || /[。！？.!?]$/.test(normalized) ? "\n" : "。\n";
  return `${normalized}${separator}${guidance}`;
}

function pushCanvasUndoAction(canvas, action) {
  if (!canvas || !action) return;
  const undoStack = Array.isArray(canvas.undoStack) ? canvas.undoStack : [];
  undoStack.push(action);
  if (undoStack.length > 50) undoStack.shift();
  canvas.undoStack = undoStack;
}

function cancelPromptOptimizationTask(taskId, resetNode = true) {
  const task = state.promptOptimizationTasks.get(taskId);
  if (!task) return;
  window.clearTimeout(task.timeoutId);
  if (resetNode) {
    const target = getPromptOptimizationTaskTarget(task);
    if (target?.node.promptOptimizing) target.node.promptOptimizing = false;
  }
  state.promptOptimizationTasks.delete(taskId);
}

function cancelPromptOptimizationTasks(predicate, resetNodes = true) {
  for (const task of [...state.promptOptimizationTasks.values()]) {
    if (predicate(task)) cancelPromptOptimizationTask(task.id, resetNodes);
  }
}

function completePromptOptimization(taskId) {
  const task = state.promptOptimizationTasks.get(taskId);
  if (!task) return;
  state.promptOptimizationTasks.delete(taskId);
  const target = getPromptOptimizationTaskTarget(task);
  if (!target) return;
  const { canvas, node } = target;
  if (node.kind !== "generator" || !node.promptOptimizing) return;

  node.promptOptimizing = false;
  if (node.prompt === task.sourcePrompt) {
    const optimizedPrompt = buildOptimizedPrompt(task.sourcePrompt);
    if (optimizedPrompt && optimizedPrompt !== node.prompt) {
      node.prompt = optimizedPrompt;
      pushCanvasUndoAction(canvas, {
        type: "node-update",
        node: cloneUndoNodeState(task.beforeNode),
      });
    }
  }

  if (canvas.id === state.activeCanvasId) render();
  scheduleCanvasDocumentSave();
}

function startPromptOptimization(node) {
  if (!requireCanvasMutation()) return false;
  if (
    node?.kind !== "generator"
    || getNodeGenerationMode(node) !== "video"
    || node.generating
    || node.promptOptimizing
  ) return false;
  const sourcePrompt = node.prompt.trim();
  if (!sourcePrompt) return false;
  const canvas = getActiveCanvas();
  if (!canvas || !canvas.nodes.includes(node)) return false;

  const staleTask = [...state.promptOptimizationTasks.values()]
    .find((task) => task.canvasId === canvas.id && task.nodeId === node.id);
  if (staleTask) cancelPromptOptimizationTask(staleTask.id, false);

  const beforeNode = cloneUndoNodeState(node);
  beforeNode.panel = null;
  beforeNode.promptOptimizing = false;
  const task = {
    id: crypto.randomUUID(),
    projectId: state.projectId,
    canvasId: canvas.id,
    nodeId: node.id,
    sourcePrompt,
    beforeNode,
    timeoutId: 0,
  };
  node.prompt = sourcePrompt;
  node.promptOptimizing = true;
  node.panel = null;
  state.promptOptimizationTasks.set(task.id, task);
  render();
  task.timeoutId = window.setTimeout(() => completePromptOptimization(task.id), 900);
  return true;
}

function commitGenerationUndoBoundary(canvas, nodeId) {
  if (!canvas || !nodeId) return;
  const nextUndoStack = (canvas.undoStack || []).filter(
    (action) => !(action.type === "node-update" && action.node?.id === nodeId),
  );
  canvas.undoStack = nextUndoStack;
}

function completeSimulatedGeneration(taskId) {
  const task = state.generationTasks.get(taskId);
  if (!task) return;
  state.generationTasks.delete(taskId);
  const target = getGenerationTaskTarget(task);
  if (!target) return;
  const { canvas, node } = target;
  if (node.kind !== "generator" || node.generationTaskId !== task.id) return;
  node.generating = false;
  delete node.generationTaskId;
  const outputMode = normalizeGeneratorMode(task.parameterSnapshot.mediaKind);
  const taskModel = models.find((model) => model.id === task.parameterSnapshot.model);
  const nodeMode = getNodeGenerationMode(node);
  if (
    !outputMode
    || outputMode !== nodeMode
    || taskModel?.type !== outputMode
  ) {
    if (canvas.id === state.activeCanvasId) {
      showActionToast("生成结果类型与节点类型不一致，本次结果未写入");
      render();
    }
    scheduleCanvasDocumentSave();
    return;
  }
  const generatedAsset = createGeneratedAsset({ id: node.id, ...task.parameterSnapshot });
  if (generatedAsset.type !== outputMode) {
    if (canvas.id === state.activeCanvasId) {
      showActionToast("生成结果类型与节点类型不一致，本次结果未写入");
      render();
    }
    scheduleCanvasDocumentSave();
    return;
  }
  node.preview = true;
  node.generatedAsset = generatedAsset;
  node.name = node.name || node.generatedAsset.displayName || defaultGeneratedName(node);
  commitGenerationUndoBoundary(canvas, node.id);
  if (canvas.id === state.activeCanvasId) render();
  scheduleCanvasDocumentSave();
}

function syncGenerateButton(button, node) {
  if (!button || !node) return;
  const availability = getGenerationAvailability(node);
  button.classList.toggle("disabled", !availability.canGenerate);
  button.setAttribute("aria-disabled", availability.canGenerate ? "false" : "true");
  button.dataset.tooltip = availability.tooltip;
}

function syncPromptOptimizationButton(button, node) {
  if (!button || !node) return;
  const hasPrompt = Boolean(node.prompt.trim());
  const disabled = node.generating || node.promptOptimizing || !hasPrompt;
  button.disabled = disabled;
  button.title = node.promptOptimizing
    ? "正在优化提示词"
    : hasPrompt
      ? "优化提示词"
      : "输入提示词后优化";
}

function startSimulatedGeneration(node, options = {}) {
  if (!requireCanvasMutation()) return false;
  const { charge = true } = options;
  if (node.generating || node.promptOptimizing) return false;
  normalizeNodeParameters(node);
  if (!node.prompt.trim()) {
    showConfirmDialog({
      title: "缺少提示词",
      body: "请先填写提示词，再执行生成。",
      confirmText: "知道了",
      showCancel: false,
    });
    return false;
  }

  const taskTypeIssue = getOmniReferenceTaskTypeIssue(node);
  if (taskTypeIssue) {
    showConfirmDialog({
      title: "任务参数不完整",
      body: taskTypeIssue,
      confirmText: "知道了",
      showCancel: false,
    });
    return false;
  }

  const cost = getCost(node);
  if (!Number.isFinite(cost) || cost <= 0) {
    showConfirmDialog({
      title: "当前模型暂不可用",
      body: "该模型的参数或积分价格配置不完整，请选择其他模型或联系管理员。",
      confirmText: "知道了",
      showCancel: false,
    });
    return false;
  }
  if (charge && !hasEnoughCredits(cost)) {
    showConfirmDialog({
      title: "积分不足",
      body: `当前可用积分为 ${formatCredit(state.account.credits)}，本次生成预计需要 ${formatCredit(cost)} 积分。`,
      confirmText: "知道了",
      showCancel: false,
    });
    return false;
  }

  const canvas = getActiveCanvas();
  if (!canvas) return false;
  if (charge) chargeCredits(cost);
  if (node.generationTaskId) cancelGenerationTask(node.generationTaskId);
  const task = {
    id: crypto.randomUUID(),
    projectId: state.projectId,
    canvasId: canvas.id,
    nodeId: node.id,
    parameterSnapshot: createGenerationParameterSnapshot(node),
    cost,
    timeoutId: 0,
  };
  node.generating = true;
  node.generationTaskId = task.id;
  node.preview = false;
  node.generatedAsset = null;
  node.panel = null;
  node.expanded = false;
  node.name = "";
  render();
  state.generationTasks.set(task.id, task);
  task.timeoutId = window.setTimeout(
    () => completeSimulatedGeneration(task.id),
    900 + Math.round(Math.random() * 700),
  );
  return true;
}

function modelPanel(node) {
  const mode = getNodeGenerationMode(node) || "image";
  const options = getCompatibleModelsForNode(node)
    .map(
      (item) => `
        <button class="model-option ${node.model === item.id ? "active" : ""}" data-action="model" data-value="${item.id}" data-canvas-mutation aria-pressed="${node.model === item.id ? "true" : "false"}" type="button">
          ${modelIconMarkup(item, "model-icon")}
          <span>
            <span class="model-name">${escapeHtml(item.name)}</span>
            <span class="model-desc">${escapeHtml(item.desc)}</span>
          </span>
          <i class="model-check" data-lucide="check" aria-hidden="true"></i>
        </button>
      `,
    )
    .join("");
  return `
    <div class="panel-popover model-panel" data-node-popover data-anchor-action="model-panel" aria-label="${mode === "video" ? "视频" : "图片"}模型">
      <p class="model-mode-contract sr-only">当前为${mode === "video" ? "视频" : "图片"}节点，仅显示同类型模型</p>
      <div class="model-list">${options || `<p class="model-list-empty">当前没有可用的${mode === "video" ? "视频" : "图片"}模型</p>`}</div>
    </div>
  `;
}

function modelIconMarkup(model, className) {
  if (model?.iconSrc) {
    const modeClass = model.iconMode === "mask" ? " model-brand-monochrome" : "";
    const classes = `${className} model-brand-icon model-logo-${model.id}${modeClass}`;
    return `<span class="${classes}" aria-hidden="true"><img src="${escapeHtml(model.iconSrc)}" alt="" /></span>`;
  }
  return `<span class="${className}" aria-hidden="true">${escapeHtml(model?.icon || "—")}</span>`;
}

function bindModelPanelEvents(element, node) {
  if (!element.querySelector(".model-panel")) return;
  node.modelFilter = getNodeGenerationMode(node);
}

function materialPanel() {
  return `
    <div class="material-panel" data-node-popover data-anchor-action="material-panel">
      <button class="material-option" data-action="material" data-value="local" data-canvas-mutation type="button">
        <span class="material-icon">↑</span><span>从本地上传</span>
      </button>
      <button class="material-option" data-action="material" data-value="library" data-canvas-mutation type="button">
        <span class="material-icon">◇</span><span>从资产库添加</span>
      </button>
      <button class="material-option" data-action="material" data-value="canvas" data-canvas-mutation type="button">
        <span class="material-icon">⌖</span><span>从画布中选择</span>
      </button>
    </div>
  `;
}

function paramPanel(node) {
  normalizeNodeParameters(node);
  const mode = getNodeGenerationMode(node) || "image";
  const taskTypeConstraint = getOmniReferenceTaskTypeConstraint(node);
  const constrainedAspect = taskTypeConstraint?.aspect;
  const aspectValues = constrainedAspect && getCapabilityValues(node, "aspects").includes(constrainedAspect)
    ? [constrainedAspect]
    : getCapabilityValues(node, "aspects");
  const modeSections = [
    mode === "video" ? omniReferenceTaskTypeParameterSection(node) : "",
    mode === "video" ? workflowParameterSection(node) : "",
  ];
  const outputFormatSection = mode === "video" ? outputFormatParameterSection(node) : "";
  const audioSection = mode === "video" ? `
    <section class="parameter-group parameter-audio">
      <div class="param-heading">音频</div>
      <div class="segmented audio-segmented" style="--option-columns: 2">
        <button class="${node.audioEnabled ? "active" : ""}" data-action="audio" data-value="on" data-canvas-mutation type="button">开启</button>
        <button class="${node.audioEnabled ? "" : "active"}" data-action="audio" data-value="off" data-canvas-mutation type="button">关闭</button>
      </div>
    </section>
  ` : "";
  const detailSections = [
    parameterSection(node, "比例", "aspect", aspectValues),
    mode === "video"
      ? parameterSection(node, "分辨率", "quality", getCapabilityValues(node, "qualities"))
      : parameterSection(node, "分辨率", "resolution", getCapabilityValues(node, "resolutions")),
    mode === "image" && getCapabilityValues(node, "qualities").length
      ? parameterSection(node, "生成质量", "quality", getCapabilityValues(node, "qualities"))
      : "",
    mode === "video" && !taskTypeConstraint?.hideDuration ? durationParameterSection(node) : "",
    mode === "video" ? `
      <div class="parameter-footer-grid ${outputFormatSection ? "has-output-format" : ""}">
        ${audioSection}
        ${outputFormatSection}
      </div>
    ` : "",
  ];
  const taskType = taskTypeCapabilityValue(node);
  return `
    <section class="panel-popover param-panel ${taskTypeConstraint?.hideDuration ? "is-task-type-compact" : ""}" data-node-popover data-anchor-action="param-panel" data-omni-reference-task-type="${escapeHtml(taskType)}" aria-label="综合参数">
      <div class="param-section">
        ${modeSections.join("")}
        <div class="parameter-task-details">${detailSections.join("")}</div>
      </div>
    </section>
  `;
}

function taskTypeCapabilityValue(node) {
  return getOmniReferenceTaskTypeCapability(node) ? node.omniReferenceTaskType || "" : "";
}

function omniReferenceTaskTypeParameterSection(node) {
  const capability = getOmniReferenceTaskTypeCapability(node);
  const values = Array.isArray(capability?.uiValues) ? capability.uiValues : [];
  if (!values.length) return "";
  const activeIndex = Math.max(0, values.indexOf(node.omniReferenceTaskType));
  return `
    <section class="parameter-group parameter-omni-reference-task-type">
      <div class="param-heading">模式</div>
      <div class="segmented omni-reference-task-type-segmented" style="--option-columns: ${values.length}; --task-type-selection-index: ${activeIndex}">
        ${values.map((value) => `
          <button class="${node.omniReferenceTaskType === value ? "active" : ""}" data-action="omni-reference-task-type" data-value="${escapeHtml(value)}" data-canvas-mutation type="button" aria-pressed="${node.omniReferenceTaskType === value}">${escapeHtml(getOmniReferenceTaskTypeLabel(node, value))}</button>
        `).join("")}
      </div>
    </section>
  `;
}

function workflowParameterSection(node) {
  const workflows = getWorkflowDefinitions(node);
  if (workflows.length <= 1) return "";
  return `
    <section class="parameter-group parameter-workflow">
      <div class="param-heading">模式</div>
      <div class="segmented workflow-segmented" style="--option-columns: ${workflows.length}">
        ${workflows.map((workflow) => `
          <button class="${node.workflow === workflow.id ? "active" : ""}" data-action="workflow" data-value="${workflow.id}" data-canvas-mutation type="button">${escapeHtml(workflow.label)}</button>
        `).join("")}
      </div>
    </section>
  `;
}

function durationParameterSection(node) {
  const range = getDurationCapability(node);
  const seconds = getNormalizedDurationSeconds(node);
  if (!range || !Number.isFinite(seconds)) return "";
  const progress = range.max > range.min
    ? ((seconds - range.min) / (range.max - range.min)) * 100
    : 100;
  return `
    <section class="parameter-group parameter-duration">
      <div class="param-heading">时长</div>
      <div class="duration-control-row">
        <input class="duration-range-input" data-duration-range type="range" min="${range.min}" max="${range.max}" step="${range.step}" value="${seconds}" style="--duration-progress: ${progress}%" aria-label="时长（秒）" aria-valuemin="${range.min}" aria-valuetext="${seconds} 秒" />
        <input class="duration-number-input" data-duration-number type="number" min="${range.min}" max="${range.max}" step="${range.step}" value="${seconds}" inputmode="numeric" aria-label="时长（秒）" />
        <span class="duration-unit" aria-hidden="true">s</span>
      </div>
    </section>
  `;
}

function outputFormatParameterSection(node) {
  const values = getCapabilityValues(node, "outputFormats");
  if (!values.length) return "";
  return `
    <section class="parameter-group parameter-output-format">
      <div class="param-heading">输出格式</div>
      <div class="segmented output-format-segmented" style="--option-columns: ${values.length}">
        ${values.map((value) => `
          <button class="${node.outputFormat === value ? "active" : ""}" data-action="output-format" data-value="${escapeHtml(value)}" data-canvas-mutation type="button" aria-pressed="${node.outputFormat === value}">${escapeHtml(getCapabilityDisplayLabel(node, "outputFormat", value))}</button>
        `).join("")}
      </div>
    </section>
  `;
}

function normalizeDurationControlSeconds(input, value) {
  const min = Number(input.min);
  const max = Number(input.max);
  const step = Math.max(1, Number(input.step) || 1);
  const requested = Number(value);
  const fallback = Number(input.value);
  const base = Number.isFinite(requested) ? requested : Number.isFinite(fallback) ? fallback : min;
  return clamp(min + Math.round((base - min) / step) * step, min, max);
}

function syncDurationRangeControl(input, seconds) {
  const min = Number(input.min);
  const max = Number(input.max);
  const progress = max > min ? ((seconds - min) / (max - min)) * 100 : 100;
  input.value = String(seconds);
  input.style.setProperty("--duration-progress", `${progress}%`);
  input.setAttribute("aria-valuetext", `${seconds} 秒`);
}

const advancedSettingHints = Object.freeze({
  autoLink: "自动匹配参考素材名称，一键 AutoLink，省去手动@麻烦",
  assetValidation: "开启后自动校验素材合规性，提升真人视频生成成功率；非真人生成可关闭，跳过检测节省耗时。",
  schedule: "可定时设置生成任务，到点自动执行",
});

function advancedSettingInfo(node, key, label) {
  const tooltipId = `advanced-setting-${key}-${node.id}`;
  return `
    <button class="advanced-setting-info" data-setting-info type="button" aria-label="${escapeHtml(label)}说明" aria-describedby="${escapeHtml(tooltipId)}">
      <span aria-hidden="true">i</span>
      <span class="advanced-setting-tooltip" id="${escapeHtml(tooltipId)}" role="tooltip">${escapeHtml(advancedSettingHints[key])}</span>
    </button>
  `;
}

function advancedSettingsPanel(node) {
  const assetValidationSetting = getNodeGenerationMode(node) === "video"
    ? `
      <div class="advanced-setting-row">
        <div class="advanced-setting-label"><span>自动校验素材</span>${advancedSettingInfo(node, "assetValidation", "自动校验素材")}</div>
        <button class="advanced-setting-switch ${node.assetValidationEnabled ? "is-on" : ""}" data-action="asset-validation" data-canvas-mutation type="button" role="switch" aria-label="自动校验素材" aria-checked="${node.assetValidationEnabled}" ${node.generating ? "disabled" : ""}><span></span></button>
      </div>
    `
    : "";
  return `
    <section class="advanced-settings" id="advanced-settings-${escapeHtml(node.id)}" aria-label="高级设置">
      <div class="advanced-settings-title">高级设置</div>
      <div class="advanced-setting-row">
        <div class="advanced-setting-label"><span>智能引用 AutoLink</span>${advancedSettingInfo(node, "autoLink", "智能引用 AutoLink")}</div>
        <button class="advanced-setting-switch ${node.autoLinkEnabled ? "is-on" : ""}" data-action="auto-link" data-canvas-mutation type="button" role="switch" aria-label="智能引用 AutoLink" aria-checked="${node.autoLinkEnabled}" ${node.generating ? "disabled" : ""}><span></span></button>
      </div>
      ${assetValidationSetting}
      <div class="advanced-setting-row advanced-setting-schedule">
        <div class="advanced-setting-label"><span>定时任务</span>${advancedSettingInfo(node, "schedule", "定时任务")}</div>
        <button class="advanced-schedule-button" type="button" disabled aria-disabled="true" aria-label="定时任务暂未开放" title="定时任务暂未开放"><svg class="advanced-schedule-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="15" rx="2"/><path d="M7.5 3.5v4M16.5 3.5v4M3.5 9.5h17M7.5 13h2M11 13h2M14.5 13h2M7.5 16.5h2M11 16.5h2"/></svg></button>
      </div>
    </section>
  `;
}

function parameterSection(node, label, action, values) {
  if (!values?.length) return "";
  const columns = values.length > 7 ? Math.ceil(values.length / 2) : values.length;
  return `
    <section class="parameter-group parameter-${action}">
      <div class="param-heading">${label}</div>
      <div class="segmented ${action}-segmented" style="--option-columns: ${columns}">
      ${values.map((value) => paramButton(node, action, value)).join("")}
      </div>
    </section>
  `;
}

function paramButton(node, action, value) {
  const aspectIcon = action === "aspect" ? renderAspectIcon(value) : "";
  const pressed = action === "aspect" ? ` aria-pressed="${node[action] === value}"` : "";
  const displayLabel = getCapabilityDisplayLabel(node, action, value);
  const constrainedAspect = action === "aspect" ? getOmniReferenceTaskTypeConstraint(node)?.aspect : "";
  const disabled = Boolean(constrainedAspect && value !== constrainedAspect);
  const disabledAttributes = disabled
    ? ` disabled aria-disabled="true" title="当前任务类型仅支持 ${escapeHtml(getCapabilityDisplayLabel(node, "aspect", constrainedAspect))} 比例"`
    : "";
  return `<button class="${action === "aspect" ? "aspect-option " : ""}${node[action] === value ? "active" : ""}" data-action="${action}" data-value="${escapeHtml(value)}" data-canvas-mutation type="button"${pressed}${disabledAttributes}>${aspectIcon}<span>${escapeHtml(displayLabel)}</span></button>`;
}

function renderAspectIcon(value) {
  if (["auto", "adaptive"].includes(String(value).toLowerCase())) {
    return `<svg class="aspect-option-icon aspect-option-icon-auto" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 2H2v4M10 2h4v4M14 10v4h-4M6 14H2v-4" /></svg>`;
  }
  const ratio = aspectStringToRatio(value);
  const width = ratio >= 1 ? 16 : Math.max(6, Math.round(16 * ratio));
  const height = ratio >= 1 ? Math.max(6, Math.round(16 / ratio)) : 16;
  return `<i class="aspect-option-icon" style="--aspect-width: ${width}px; --aspect-height: ${height}px" aria-hidden="true"></i>`;
}

const generationLockedActions = new Set([
  "entity-picker",
  "material-panel",
  "material",
  "remove-material",
  "remove-linked-source",
  "focus-asset",
  "model-panel",
  "param-panel",
  "model",
  "workflow",
  "omni-reference-task-type",
  "audio",
  "output-format",
  "prompt-optimization",
  "auto-link",
  "asset-validation",
  "aspect",
  "duration",
  "quality",
  "resolution",
]);

function handleAction(node, action, value) {
  if (action !== "aspect" && action !== "omni-reference-task-type") {
    canvasNodeLayoutTransition.finishAll();
  }
  if (action === "focus-linked-source") {
    const connection = state.connections.find((item) => item.id === value);
    const source = connection && state.nodes.find((item) => item.id === connection.sourceNodeId);
    if (!source) return;
    collapseInactiveNodes(source.id);
    bringNodesToFront([source]);
    setSelection([source.id], source.id);
    render();
    return;
  }
  if (action === "remove-linked-source") {
    if (node.generating) return;
    removeConnection(value);
    return;
  }
  if (node.kind !== "generator") return;
  const persistentActions = new Set([
    "material",
    "remove-material",
    "generate",
    "model",
    "workflow",
    "omni-reference-task-type",
    "audio",
    "output-format",
    "auto-link",
    "asset-validation",
    "aspect",
    "duration",
    "quality",
    "resolution",
  ]);
  if (persistentActions.has(action) && !requireCanvasMutation()) return;
  if (node.generating && generationLockedActions.has(action)) return;
  const undoableActions = new Set([
    "model",
    "workflow",
    "omni-reference-task-type",
    "audio",
    "output-format",
    "auto-link",
    "asset-validation",
    "aspect",
    "duration",
    "quality",
    "resolution",
  ]);
  const before = undoableActions.has(action) ? cloneNodeState(node) : null;
  let taskTypeTransition = null;

  switch (action) {
    case "entity-picker":
      if (!canNodeUseEntityReferences(node)) return;
      node.expanded = true;
      node.panel = null;
      node.advancedSettingsExpanded = false;
      render();
      openEntityUsePicker(node.id);
      return;
    case "material-panel":
      node.expanded = true;
      node.panel = node.panel === "material" ? null : "material";
      if (node.panel) node.advancedSettingsExpanded = false;
      break;
    case "material":
      if (value === "local") {
        node.panel = null;
        openLocalAssetPicker(node);
        render();
        return;
      }
      if (value === "library") {
        node.panel = null;
        openAssetLibrary(node.id);
        render();
        return;
      }
      addVirtualAsset(node, value);
      return;
    case "remove-material":
      node.assets = node.assets.filter((asset) => asset.id !== value);
      if (node.activeAssetId === value) {
        node.activeAssetId = node.assets[0]?.id || null;
      }
      node.panel = null;
      break;
    case "focus-asset":
      node.activeAssetId = value;
      node.expanded = true;
      node.panel = null;
      break;
    case "model-panel":
      node.expanded = true;
      node.modelFilter = getNodeGenerationMode(node);
      node.panel = node.panel === "model" ? null : "model";
      if (node.panel) node.advancedSettingsExpanded = false;
      break;
    case "param-panel":
      node.expanded = true;
      node.panel = node.panel === "params" ? null : "params";
      if (node.panel) node.advancedSettingsExpanded = false;
      break;
    case "advanced-settings-toggle":
      node.expanded = true;
      node.advancedSettingsExpanded = !node.advancedSettingsExpanded;
      if (node.advancedSettingsExpanded) node.panel = null;
      break;
    case "generate":
      if (!node.prompt.trim() || node.generating) return;
      startSimulatedGeneration(node);
      break;
    case "model": {
      const selected = models.find((item) => item.id === value);
      if (!selected) return;
      if (!canUseModelForNode(node, selected)) {
        const mode = getNodeGenerationMode(node);
        showActionToast(`当前为${mode === "video" ? "视频" : "图片"}节点，请新建${selected.type === "video" ? "视频" : "图片"}节点使用该模型`);
        return;
      }
      const previousDefaultName = defaultGeneratedName(node);
      node.model = selected.id;
      node.duration = selected.defaults?.duration || "";
      normalizeNodeParameters(node);
      if (node.preview && (!node.name || node.name === previousDefaultName)) {
        node.name = defaultGeneratedName(node);
      }
      node.modelFilter = getNodeGenerationMode(node);
      node.panel = null;
      rememberPreset(node);
      break;
    }
    case "workflow":
      if (!getWorkflowDefinitions(node).some((workflow) => workflow.id === value)) return;
      node.workflow = value;
      node.panel = "params";
      rememberPreset(node);
      break;
    case "omni-reference-task-type": {
      const taskTypeCapability = getOmniReferenceTaskTypeCapability(node);
      if (!taskTypeCapability?.uiValues?.includes(value)) return;
      if (node.omniReferenceTaskType === value) return;
      taskTypeTransition = captureTaskTypeParameterTransition(node, value);
      node.omniReferenceTaskType = value;
      const constrainedAspect = taskTypeCapability.constraints?.[value]?.aspect;
      if (constrainedAspect && node.aspect !== constrainedAspect) {
        applyNodeAspect(node, constrainedAspect);
      } else {
        normalizeNodeParameters(node);
      }
      node.panel = "params";
      rememberPreset(node);
      break;
    }
    case "audio":
      if (getNodeGenerationMode(node) !== "video") return;
      node.audioEnabled = value !== "off";
      rememberPreset(node);
      break;
    case "output-format":
      if (!getCapabilityValues(node, "outputFormats").includes(value)) return;
      node.outputFormat = value;
      rememberPreset(node);
      break;
    case "prompt-optimization":
      if (getNodeGenerationMode(node) !== "video") return;
      startPromptOptimization(node);
      return;
    case "auto-link":
      node.autoLinkEnabled = !node.autoLinkEnabled;
      break;
    case "asset-validation":
      if (getNodeGenerationMode(node) !== "video") return;
      node.assetValidationEnabled = !node.assetValidationEnabled;
      break;
    case "aspect":
      applyNodeAspect(node, value);
      rememberPreset(node);
      break;
    case "duration":
    case "quality":
    case "resolution":
      node[action] = value;
      normalizeNodeParameters(node);
      rememberPreset(node);
      break;
    default:
      return;
  }
  if (before && JSON.stringify(before) !== JSON.stringify(node)) {
    before.panel = null;
    pushUndoAction({ type: "node-update", node: before });
  }
  render();
  if (taskTypeTransition) animateTaskTypeParameterTransition(node, taskTypeTransition);
}

function closeConnectionCreateMenu() {
  if (!connectionCreateMenu) return;
  const hadPreview = Boolean(state.connectionDrop?.previewAction);
  connectionCreateMenu.classList.add("hidden");
  connectionCreateMenu.querySelectorAll("[data-connection-create]")
    .forEach((button) => button.classList.remove("is-preview"));
  delete connectionCreateMenu.dataset.placement;
  state.connectionDrop = null;
  if (hadPreview) {
    renderConnections();
    renderSelectionToolbar();
  }
}

function closeNodeCreateMenu(options = {}) {
  if (nodeCreateMenu) {
    nodeCreateMenu.classList.add("hidden");
    nodeCreateMenu.querySelectorAll("[data-node-create]").forEach((button) => button.classList.remove("is-preview"));
  }
  state.nodeCreatePoint = null;
  if (!options.keepUploadPoint) state.pendingCanvasUploadPoint = null;
}

function closeCanvasCreateMenus() {
  closeConnectionCreateMenu();
  closeNodeCreateMenu();
}

function openNodeCreateMenu(clientX, clientY) {
  if (!nodeCreateMenu || !requireCanvasMutation()) return;
  closeConnectionCreateMenu();
  const shellRect = shell.getBoundingClientRect();
  const menuWidth = 236;
  const menuHeight = 202;
  const left = clamp(clientX - shellRect.left + 12, 12, shellRect.width - menuWidth - 12);
  const top = clamp(clientY - shellRect.top + 12, 72, shellRect.height - menuHeight - 12);
  state.nodeCreatePoint = { clientX, clientY };
  state.pendingCanvasUploadPoint = null;
  nodeCreateMenu.style.left = `${left}px`;
  nodeCreateMenu.style.top = `${top}px`;
  nodeCreateMenu.classList.remove("hidden");
  setNodeCreatePreview(nodeCreateMenu.querySelector("[data-node-create]"));
  refreshIcons();
  window.getSelection()?.removeAllRanges();
  nodeCreateMenu.focus({ preventScroll: true });
}

function setNodeCreatePreview(button) {
  if (!nodeCreateMenu) return;
  nodeCreateMenu.querySelectorAll("[data-node-create]").forEach((item) => {
    item.classList.toggle("is-preview", item === button);
  });
}

function setConnectionCreatePreview(button) {
  if (!connectionCreateMenu) return;
  connectionCreateMenu.querySelectorAll("[data-connection-create]").forEach((item) => {
    item.classList.toggle("is-preview", item === button);
  });
}

function showConnectionCreateMenu(drop, labelText) {
  if (!connectionCreateMenu) return;
  const shellRect = shell.getBoundingClientRect();
  const viewportPadding = 12;
  const viewportTop = 72;
  const menuEdgeOverlap = 1;
  const label = connectionCreateMenu.querySelector(".connection-create-label");
  if (label) label.textContent = labelText;

  connectionCreateMenu.style.visibility = "hidden";
  connectionCreateMenu.classList.remove("hidden");
  const menuWidth = connectionCreateMenu.offsetWidth || 236;
  const menuHeight = connectionCreateMenu.offsetHeight || 160;
  const localX = drop.clientX - shellRect.left;
  const localY = drop.clientY - shellRect.top;
  const canPlaceBelow = localY + menuHeight <= shellRect.height - viewportPadding;
  const canPlaceAbove = localY - menuHeight >= viewportTop;
  const placement = canPlaceBelow || !canPlaceAbove ? "below" : "above";
  const left = clamp(
    localX - menuWidth / 2,
    viewportPadding,
    shellRect.width - menuWidth - viewportPadding,
  );
  const top = clamp(
    placement === "below" ? localY : localY - menuHeight,
    viewportTop,
    shellRect.height - menuHeight - viewportPadding,
  );
  const anchorClientX = shellRect.left + clamp(localX, left + 12, left + menuWidth - 12);
  const anchorClientY = shellRect.top + (
    placement === "below"
      ? top + menuEdgeOverlap
      : top + menuHeight - menuEdgeOverlap
  );
  if (drop.previewAction) {
    drop.previewAction.current = screenToWorld(anchorClientX, anchorClientY);
  }
  state.connectionDrop = drop;
  connectionCreateMenu.style.left = `${left + shell.scrollLeft}px`;
  connectionCreateMenu.style.top = `${top + shell.scrollTop}px`;
  connectionCreateMenu.dataset.placement = placement;
  connectionCreateMenu.style.removeProperty("visibility");
  setConnectionCreatePreview(connectionCreateMenu.querySelector("[data-connection-create]"));
  refreshIcons();
  renderConnections();
  renderSelectionToolbar();
  connectionCreateMenu.focus({ preventScroll: true });
}

function openConnectionCreateMenu(originNodeId, originSide, originRatio, clientX, clientY, previewAction = null) {
  showConnectionCreateMenu(
    { kind: "single", originNodeId, originSide, originRatio, clientX, clientY, previewAction },
    originSide === "input" ? "创建上游节点" : "创建下游节点",
  );
}

function openSelectionConnectionCreateMenu(originNodeIds, clientX, clientY, previewAction = null) {
  showConnectionCreateMenu(
    { kind: "selection", originNodeIds: [...originNodeIds], clientX, clientY, previewAction },
    "创建共同下游节点",
  );
}

function getConnectionPortDomEntry(zone) {
  const nodeElement = zone?.closest(".canvas-node");
  const mediaFrame = zone?.closest(".media-frame");
  const side = zone?.dataset.nodePortZone;
  const port = zone?.querySelector(".node-port");
  const nodeId = nodeElement?.dataset.id;
  if (!nodeElement || !mediaFrame || !port || !nodeId || !["input", "output"].includes(side)) {
    return null;
  }
  const frameRect = mediaFrame.getBoundingClientRect();
  const interactionSide = side === "input" ? "left" : "right";
  return {
    id: getConnectionPortId(nodeId, side),
    nodeId,
    side,
    interactionSide,
    nodeElement,
    mediaFrame,
    zone,
    port,
    frameRect,
    definition: {
      id: getConnectionPortId(nodeId, side),
      nodeId,
      side: interactionSide,
      anchor: {
        x: interactionSide === "left" ? frameRect.left : frameRect.right,
        y: frameRect.top + frameRect.height / 2,
      },
      targetRect: {
        left: frameRect.left,
        right: frameRect.right,
        top: frameRect.top,
        bottom: frameRect.bottom,
      },
      targetInset: clamp(14 * state.scale, 8, 20),
      targetPriority: Number(nodeElement.style.zIndex) || 0,
      options: canvasConnectionInteraction.getScaledPortGeometry(state.scale),
    },
  };
}

function buildConnectionPortRegistry() {
  const elements = new Map();
  const definitions = [];
  nodeLayer.querySelectorAll("[data-node-port-zone]").forEach((zone) => {
    const entry = getConnectionPortDomEntry(zone);
    if (!entry) return;
    elements.set(entry.id, entry);
    definitions.push(entry.definition);
  });
  return {
    ports: canvasConnectionInteraction.buildPortRegistry(definitions),
    elements,
  };
}

function setConnectionPortScreenPoint(entry, point) {
  if (!entry || !point) return 0.5;
  const zoneRect = entry.zone.getBoundingClientRect();
  const localX = clamp(point.x - zoneRect.left, 0, zoneRect.width);
  const localY = clamp(point.y - zoneRect.top, 0, zoneRect.height);
  entry.port.dataset.portRatio = "0.5";
  entry.port.style.setProperty("--port-x", `${((localX / zoneRect.width) * 100).toFixed(2)}%`);
  entry.port.style.setProperty("--port-y", `${((localY / zoneRect.height) * 100).toFixed(2)}%`);
  return 0.5;
}

function positionNodePortAtPointer(zone, clientX, clientY) {
  const entry = getConnectionPortDomEntry(zone);
  if (!entry) return 0.5;
  const registry = canvasConnectionInteraction.buildPortRegistry([entry.definition]);
  const point = canvasConnectionInteraction.clampPointerToPort({ x: clientX, y: clientY }, registry[0]);
  return point ? setConnectionPortScreenPoint(entry, point) : 0.5;
}

function resetNodePortPosition(zone) {
  const port = zone?.querySelector(".node-port");
  if (!port) return;
  port.dataset.portRatio = "0.5";
  port.style.removeProperty("--port-x");
  port.style.removeProperty("--port-y");
}

function hideConnectionTargetGlow() {
  if (!connectionTargetGlow) return;
  connectionTargetGlow.classList.remove("is-active");
  delete connectionTargetGlow.dataset.targetPortId;
}

function showConnectionTargetGlow(entry) {
  if (!connectionTargetGlow || !entry?.mediaFrame || !entry?.frameRect) return;
  const targetChanged = connectionTargetGlow.dataset.targetPortId !== entry.id;
  if (targetChanged) {
    connectionTargetGlow.classList.remove("is-active");
    connectionTargetGlow.dataset.targetPortId = entry.id;
  }
  const shellRect = shell.getBoundingClientRect();
  const computed = window.getComputedStyle(entry.mediaFrame);
  const worldRadius = Number.parseFloat(computed.borderTopLeftRadius) || 0;
  const screenRadius = Math.max(4, worldRadius * state.scale);
  const frameWidth = entry.frameRect.width;
  const sweepWindow = clamp(
    frameWidth * 0.28,
    Math.min(78, frameWidth * 0.32),
    Math.min(180, frameWidth * 0.36),
  );
  const sweepLayerWidth = frameWidth + 1.6;
  const sweepBackgroundTravel = Math.max(1, sweepLayerWidth - sweepWindow);
  const sweepRange = {
    start: (-sweepWindow / sweepBackgroundTravel) * 100,
    end: (sweepLayerWidth / sweepBackgroundTravel) * 100,
  };
  const sweepDuration = clamp(740 + frameWidth * 0.38, 820, 1020);
  connectionTargetGlow.style.left = `${entry.frameRect.left - shellRect.left + shell.scrollLeft}px`;
  connectionTargetGlow.style.top = `${entry.frameRect.top - shellRect.top + shell.scrollTop}px`;
  connectionTargetGlow.style.width = `${entry.frameRect.width}px`;
  connectionTargetGlow.style.height = `${entry.frameRect.height}px`;
  connectionTargetGlow.style.setProperty("--connection-target-radius", `${screenRadius}px`);
  connectionTargetGlow.style.setProperty("--connection-target-sweep-window", `${sweepWindow}px`);
  connectionTargetGlow.style.setProperty("--connection-target-sweep-start", `${sweepRange.start}%`);
  connectionTargetGlow.style.setProperty("--connection-target-sweep-end", `${sweepRange.end}%`);
  connectionTargetGlow.style.setProperty("--connection-target-sweep-duration", `${Math.round(sweepDuration)}ms`);
  connectionTargetGlow.style.setProperty(
    "--connection-target-scan-direction",
    entry.interactionSide === "right" ? "-1" : "1",
  );
  if (targetChanged) void connectionTargetGlow.offsetWidth;
  connectionTargetGlow.classList.add("is-active");
}

function clearConnectionTarget(action = state.action) {
  const targetEntry = action?.portElements?.get(action.targetPortId);
  if (targetEntry) {
    targetEntry.nodeElement.classList.remove("connection-target");
    targetEntry.port.classList.remove("is-valid-target");
    resetNodePortPosition(targetEntry.zone);
  }
  hideConnectionTargetGlow();
  if (action?.type === "connect") action.targetPortId = null;
}

function clearConnectionOrigin(action = state.action) {
  const originEntry = action?.portElements?.get(action.originPortId);
  originEntry?.nodeElement.classList.remove("connection-origin");
  originEntry?.port.classList.remove("is-drag-origin");
}

function syncConnectionCandidatePorts(action, visible) {
  if (!action?.portElements || !action.validPortIds) return;
  action.validPortIds.forEach((portId) => {
    action.portElements.get(portId)?.port.classList.toggle("is-connectable-target", visible);
  });
}

function clearConnectionProximity(action = state.action) {
  const entry = action?.portElements?.get(action.nearPortId);
  entry?.nodeElement.classList.remove("connection-near");
  entry?.port.classList.remove("is-snap-near");
  if (entry) resetNodePortPosition(entry.zone);
  if (action?.type === "connect") action.nearPortId = null;
}

function markConnectionProximity(action, candidate) {
  if (action.nearPortId && action.nearPortId !== candidate?.targetPortId) {
    clearConnectionProximity(action);
  }
  if (!candidate || action.targetPortId) return;
  const entry = action.portElements.get(candidate.targetPortId);
  if (!entry) return;
  action.nearPortId = candidate.targetPortId;
  setConnectionPortScreenPoint(entry, candidate.point);
  entry.nodeElement.classList.add("connection-near");
  entry.port.classList.add("is-snap-near");
}

function markConnectionTarget(action, candidate) {
  if (action.targetPortId && action.targetPortId !== candidate?.targetPortId) {
    clearConnectionTarget(action);
  }
  if (!candidate) return;
  const entry = action.portElements.get(candidate.targetPortId);
  if (!entry) return;
  action.targetPortId = candidate.targetPortId;
  setConnectionPortScreenPoint(entry, candidate.point);
  showConnectionTargetGlow(entry);
  action.targetRatio = 0.5;
  entry.nodeElement.classList.add("connection-target");
  entry.port.classList.add("is-valid-target");
}

function getSelectionConnectionOrigins() {
  return getSelectedNodes()
    .filter((node) => node.kind === "generator" || getEditableMedia(node))
    .map((node) => ({
      nodeId: node.id,
      start: getConnectionPortPoint(node, "output"),
    }));
}

function positionMultiSelectionPort(clientX, clientY) {
  if (!multiSelectionChrome || !multiSelectionPort) return;
  const frameRect = multiSelectionChrome.getBoundingClientRect();
  multiSelectionPort.style.left = `${clientX - frameRect.left}px`;
  multiSelectionPort.style.top = `${clientY - frameRect.top}px`;
}

function resetMultiSelectionPort() {
  multiSelectionPort?.removeAttribute("style");
}

function beginSelectionConnectionDrag(event) {
  if (event.button !== 0 || !requireCanvasMutation()) return;
  const origins = getSelectionConnectionOrigins();
  if (origins.length < 2 || origins.length !== state.selectedIds.size) return;
  const frameRect = multiSelectionChrome?.getBoundingClientRect();
  if (!frameRect) return;
  const registry = buildConnectionPortRegistry();
  const targetPlans = new Map();
  registry.ports.forEach((port) => {
    if (port.side !== "left") return;
    const plan = canvasConnections.planBatchConnections(
      state.connections,
      state.nodes,
      origins.map((origin) => origin.nodeId),
      port.nodeId,
    );
    if (plan.validSourceIds.length === origins.length) targetPlans.set(port.id, {
      targetNodeId: port.nodeId,
      ...plan,
    });
  });
  const anchor = {
    x: frameRect.right,
    y: frameRect.top + frameRect.height / 2,
  };
  const originPort = canvasConnectionInteraction.buildPortRegistry([{
    id: "selection:output",
    nodeId: "__selection__",
    side: "right",
    anchor,
    options: canvasConnectionInteraction.getScaledPortGeometry(state.scale),
  }])[0];
  if (!originPort) return;

  event.preventDefault();
  event.stopPropagation();
  closeCanvasCreateMenus();
  state.action = {
    type: "connect",
    mode: "selection-output",
    pointerId: event.pointerId,
    originNodeIds: origins.map((origin) => origin.nodeId),
    origins,
    originSide: "output",
    originPortId: originPort.id,
    originPort,
    portRegistry: registry.ports,
    portElements: registry.elements,
    validPortIds: new Set(targetPlans.keys()),
    targetPlans,
    current: screenToWorld(event.clientX, event.clientY),
    startClientX: event.clientX,
    startClientY: event.clientY,
    targetNodeId: null,
    targetPortId: null,
    nearPortId: null,
    targetRatio: 0.5,
  };
  state.activeConnectionId = null;
  shell.classList.add("connecting", "connecting-from-output", "connecting-selection");
  syncConnectionCandidatePorts(state.action, true);
  positionMultiSelectionPort(event.clientX, event.clientY);
  renderSelectionToolbar();
  try {
    shell.setPointerCapture(event.pointerId);
  } catch {
    // Window listeners keep the drag alive when pointer capture is unavailable.
  }
  renderConnections();
}

function beginConnectionDrag(event, originNodeId, originSide = "output") {
  if (event.button !== 0 || !requireCanvasMutation()) return;
  const origin = state.nodes.find((node) => node.id === originNodeId);
  const canStartFromInput = originSide === "input" && origin?.kind === "generator";
  const canStartFromOutput = originSide === "output"
    && (origin?.kind === "generator" || getEditableMedia(origin));
  if (!origin || (!canStartFromInput && !canStartFromOutput)) return;
  const registry = buildConnectionPortRegistry();
  const originPortId = getConnectionPortId(originNodeId, originSide);
  const originPort = registry.ports.find((port) => port.id === originPortId);
  const originEntry = registry.elements.get(originPortId);
  if (!originPort || !originEntry) return;
  const originScreenPoint = canvasConnectionInteraction.clampPointerToPort(
    { x: event.clientX, y: event.clientY },
    originPort,
  );
  if (!originScreenPoint) return;
  event.preventDefault();
  event.stopPropagation();
  closeCanvasCreateMenus();
  setConnectionPortScreenPoint(originEntry, originScreenPoint);
  const originRatio = 0.5;
  const start = screenToWorld(originPort.anchor.x, originPort.anchor.y);
  const validPortIds = new Set();
  registry.ports.forEach((port) => {
    const direction = canvasConnectionInteraction.resolveConnectionDirection(originPort, port);
    if (!direction) return;
    if (canvasConnections.canConnect(
      state.connections,
      state.nodes,
      direction.sourceNodeId,
      direction.targetNodeId,
    ).ok) validPortIds.add(port.id);
  });
  state.action = {
    type: "connect",
    pointerId: event.pointerId,
    originNodeId,
    originSide,
    originPortId,
    originPort,
    originRatio,
    portRegistry: registry.ports,
    portElements: registry.elements,
    validPortIds,
    start,
    current: start,
    startClientX: event.clientX,
    startClientY: event.clientY,
    sourceNodeId: null,
    targetNodeId: null,
    targetPortId: null,
    nearPortId: null,
    targetRatio: 0.5,
  };
  state.activeConnectionId = null;
  shell.classList.add("connecting");
  shell.classList.toggle("connecting-from-input", originSide === "input");
  shell.classList.toggle("connecting-from-output", originSide === "output");
  originEntry.nodeElement.classList.add("connection-origin");
  originEntry.port.classList.add("is-drag-origin");
  syncConnectionCandidatePorts(state.action, true);
  try {
    shell.setPointerCapture(event.pointerId);
  } catch {
    // Pointer capture is an enhancement; the window listeners keep the drag alive.
  }
  renderConnections();
}

function moveConnectionDrag(event) {
  const action = state.action;
  if (action?.type !== "connect") return;
  event.preventDefault?.();
  action.current = screenToWorld(event.clientX, event.clientY);
  const pointer = { x: event.clientX, y: event.clientY };
  const canUsePort = (_direction, port) => action.validPortIds.has(port.id);
  const bodyCandidate = canvasConnectionInteraction.selectNodeBodyCandidate({
    pointer,
    origin: action.originPort,
    registry: action.portRegistry,
    canConnect: canUsePort,
  });
  const portCandidate = bodyCandidate ? null : canvasConnectionInteraction.selectSnapCandidate({
    pointer,
    origin: action.originPort,
    registry: action.portRegistry,
    previousTargetId: action.targetPortId,
    canConnect: canUsePort,
  });
  const candidate = bodyCandidate || portCandidate;
  const proximityCandidate = candidate
    ? null
    : canvasConnectionInteraction.selectSnapProximity({
        pointer,
        origin: action.originPort,
        registry: action.portRegistry,
        canConnect: canUsePort,
      });
  if (candidate) {
    clearConnectionProximity(action);
    markConnectionTarget(action, candidate);
  } else {
    clearConnectionTarget(action);
    markConnectionProximity(action, proximityCandidate);
  }
  if (action.mode === "selection-output") {
    const targetPlan = candidate ? action.targetPlans.get(candidate.targetPortId) : null;
    action.targetNodeId = targetPlan?.targetNodeId || null;
    action.targetPlan = targetPlan || null;
    if (candidate) {
      const targetPort = action.portRegistry.find((port) => port.id === candidate.targetPortId);
      if (targetPort) {
        const targetPoint = candidate.connectionPoint || targetPort.anchor;
        action.current = screenToWorld(targetPoint.x, targetPoint.y);
        positionMultiSelectionPort(targetPoint.x, targetPoint.y);
      }
    } else {
      positionMultiSelectionPort(event.clientX, event.clientY);
    }
    canvasConnectionRenderer.renderPreview(action, canvasConnections.getBezierPath);
    return;
  }
  action.sourceNodeId = candidate?.direction.sourceNodeId || null;
  action.targetNodeId = candidate?.direction.targetNodeId || null;
  if (candidate) {
    const targetPort = action.portRegistry.find((port) => port.id === candidate.targetPortId);
    if (targetPort) {
      const targetPoint = candidate.connectionPoint || targetPort.anchor;
      action.current = screenToWorld(targetPoint.x, targetPoint.y);
    }
  }
  canvasConnectionRenderer.renderPreview(state.action, canvasConnections.getBezierPath);
}

function createPendingConnectionPreview(action, clientX, clientY) {
  const current = screenToWorld(clientX, clientY);
  if (action.mode === "selection-output") {
    return {
      type: "connect",
      mode: "selection-output",
      originSide: "output",
      origins: action.origins.map((origin) => ({
        nodeId: origin.nodeId,
        start: { ...origin.start },
      })),
      current,
      pendingCreate: true,
      nearPortId: null,
      targetPortId: null,
    };
  }
  return {
    type: "connect",
    originSide: action.originSide,
    start: { ...action.start },
    current,
    pendingCreate: true,
    nearPortId: null,
    targetPortId: null,
  };
}

function finishConnectionDrag(event, options = {}) {
  const action = state.action;
  if (action?.type !== "connect") return;
  const moved = Math.hypot(
    event.clientX - action.startClientX,
    event.clientY - action.startClientY,
  ) >= 8;
  clearConnectionProximity(action);
  clearConnectionTarget(action);
  clearConnectionOrigin(action);
  syncConnectionCandidatePorts(action, false);
  shell.classList.remove("connecting");
  shell.classList.remove("connecting-from-input", "connecting-from-output", "connecting-selection");
  state.action = null;
  resetMultiSelectionPort();
  action.portElements.forEach((entry) => resetNodePortPosition(entry.zone));
  try {
    shell.releasePointerCapture(event.pointerId);
  } catch {
    // The browser may release capture before the window pointerup event.
  }

  if (!options.cancelled && action.mode === "selection-output" && action.targetNodeId) {
    createConnectionsBatch(action.originNodeIds, action.targetNodeId);
    render();
    return;
  }

  if (!options.cancelled && action.targetNodeId) {
    const connection = createConnection(action.sourceNodeId, action.targetNodeId, {
      sourceRatio: action.originSide === "input" ? action.targetRatio : action.originRatio,
      targetRatio: action.originSide === "input" ? action.originRatio : action.targetRatio,
      feedbackDirection: action.originSide === "input" ? "reverse" : "forward",
    });
    if (connection) {
      render();
      return;
    }
  }
  const shouldOpenCreateMenu = !options.cancelled
    && moved
    && isConnectionDropSurface(document.elementFromPoint(event.clientX, event.clientY));
  if (shouldOpenCreateMenu) {
    const previewAction = createPendingConnectionPreview(
      action,
      event.clientX,
      event.clientY,
    );
    if (action.mode === "selection-output") {
      openSelectionConnectionCreateMenu(
        action.originNodeIds,
        event.clientX,
        event.clientY,
        previewAction,
      );
      return;
    }
    openConnectionCreateMenu(
      action.originNodeId,
      action.originSide,
      action.originRatio,
      event.clientX,
      event.clientY,
      previewAction,
    );
    return;
  }
  renderConnections();
  renderSelectionToolbar();
}

const canvasNodePointerController = canvasNodePointerControllerFactory.createCanvasNodePointerController({
  interaction: canvasNodeInteraction,
  isSpaceDown: () => state.isSpaceDown,
  beginPan,
  getNode: (nodeId) => state.nodes.find((item) => item.id === nodeId),
  getSelectedIds: () => [...state.selectedIds],
  getSelectedNodes: () => state.nodes.filter((item) => state.selectedIds.has(item.id)),
  getGroupSnapshots: () => state.groups.map((group) => cloneGroupState(group)),
  canMutate: isCanvasMutationAllowed,
  isEditableMedia: (node) => Boolean(getEditableMedia(node)),
  handleControlPointer: ({ target, node }) => {
    state.activeId = node.id;
    const hadMediaToolbar = state.mediaToolbarNodeId === node.id;
    if (target.closest(".media-spec") && getEditableMedia(node)) {
      state.mediaToolbarNodeId = node.id;
    }
    if (isCanvasMutationAllowed()) bringNodesToFront([node]);
    const nodeElement = target.closest(".canvas-node");
    if (nodeElement) nodeElement.style.zIndex = String(node.z);
    if (!hadMediaToolbar && state.mediaToolbarNodeId === node.id && !target.closest(".media-edit-toolbar")) {
      render();
    }
  },
  applySelection: (nextSelection, node) => {
    setSelection(nextSelection, node.id);
    collapseInactiveNodes(node.id);
  },
  setMediaToolbarNodeId: (nodeId) => {
    state.mediaToolbarNodeId = nodeId;
  },
  promoteNodes: bringNodesToFront,
  setAction: (action) => {
    state.action = action;
  },
  capturePointer: (pointerId) => shell.setPointerCapture(pointerId),
  render,
});

function handleNodePointerDown(event, nodeId) {
  canvasNodePointerController.handlePointerDown(event, nodeId);
}

function addNodeAt(clientX, clientY, mode = "image", options = {}) {
  if (!requireCanvasMutation()) return null;
  const world = screenToWorld(clientX, clientY);
  const useLastPreset = options.useLastPreset !== false;
  const node = defaultGeneratorNode(0, 0, useLastPreset ? state.lastPreset.mode || mode : mode);
  if (useLastPreset) applyPreset(node, state.lastPreset);
  const layout = getNodeLayout(node);
  const position = canvasNodePlacement.getNodePosition({
    world,
    layout,
    anchor: options.anchor,
  });
  if (!position) return null;
  node.x = position.x;
  node.y = position.y;
  collapseAllGeneratorPanels();
  state.nodes.push(node);
  bringNodesToFront([node]);
  setSelection([node.id], node.id);
  render();
  return node;
}

function consumeHomeLaunchIntent() {
  if (!isCanvasMutationAllowed()) return false;
  let prompt = "";
  try {
    prompt = sessionStorage.getItem(homeLaunchIntentKey)?.trim() || "";
  } catch {
    return false;
  }
  if (!prompt) return false;
  const node = addNodeAt(window.innerWidth / 2, window.innerHeight / 2);
  if (!node) return false;
  node.prompt = prompt;
  node.expanded = true;
  try {
    sessionStorage.removeItem(homeLaunchIntentKey);
  } catch {
    // The node is already created; storage cleanup can safely fail.
  }
  render();
  scheduleCanvasDocumentSave(0);
  return true;
}

function cloneNodeState(node) {
  return {
    ...node,
    assets: (node.assets || []).map((asset) => ({ ...asset })),
    generatedAsset: node.generatedAsset ? { ...node.generatedAsset } : null,
  };
}

function cloneUndoNodeState(node) {
  const snapshot = cloneNodeState(node);
  snapshot.generating = false;
  snapshot.promptOptimizing = false;
  delete snapshot.generationTaskId;
  return snapshot;
}

function cloneGroupState(group) {
  return {
    ...group,
    nodeIds: [...group.nodeIds],
    layoutMenuOpen: false,
  };
}

function cloneCanvasContent(source) {
  const nodeIdMap = new Map(source.nodes.map((node) => [node.id, crypto.randomUUID()]));
  const groupIdMap = new Map(source.groups.map((group) => [group.id, crypto.randomUUID()]));
  const nodes = source.nodes.map((sourceNode) => {
    const node = cloneNodeState(sourceNode);
    const assetIdMap = new Map();
    node.id = nodeIdMap.get(sourceNode.id);
    node.assets = (sourceNode.assets || []).map((asset) => {
      const id = crypto.randomUUID();
      assetIdMap.set(asset.id, id);
      return { ...asset, id };
    });
    node.activeAssetId = assetIdMap.get(sourceNode.activeAssetId) || node.assets[0]?.id || null;
    node.generatedAsset = sourceNode.generatedAsset
      ? { ...sourceNode.generatedAsset, id: crypto.randomUUID() }
      : null;
    const groupId = groupIdMap.get(sourceNode.groupId);
    if (groupId) {
      node.groupId = groupId;
    } else {
      delete node.groupId;
    }
    node.generating = false;
    node.promptOptimizing = false;
    delete node.generationTaskId;
    node.panel = null;
    node.mediaMenuOpen = false;
    return node;
  });
  const groups = source.groups.map((sourceGroup) => ({
    ...cloneGroupState(sourceGroup),
    id: groupIdMap.get(sourceGroup.id),
    nodeIds: sourceGroup.nodeIds.map((id) => nodeIdMap.get(id)).filter(Boolean),
  }));
  const connections = (source.connections || []).map((connection) => ({
    ...cloneConnectionState(connection),
    id: crypto.randomUUID(),
    sourceNodeId: nodeIdMap.get(connection.sourceNodeId),
    targetNodeId: nodeIdMap.get(connection.targetNodeId),
  })).filter((connection) => connection.sourceNodeId && connection.targetNodeId);
  return { nodes, groups, connections };
}

function pushUndoAction(action) {
  pushCanvasUndoAction(getActiveCanvas(), action);
}

function deleteSelectedNodes(confirmed = false) {
  if (!requireCanvasMutation()) return;
  if (state.activeGroupId && !state.selectedIds.size) {
    const group = getGroupById(state.activeGroupId);
    if (!group) return;
    showConfirmDialog({
      title: "解组确认",
      body: `将取消「${group.name || "新建组"}」的组框，但保留组内所有节点。\n可通过 Ctrl+Z 恢复最近一次解组。`,
      confirmText: "解组",
      onConfirm: () => ungroup(group.id),
    });
    return;
  }

  if (!state.selectedIds.size) return;
  const fullGroups = state.groups.filter((group) => group.nodeIds.length && group.nodeIds.every((id) => state.selectedIds.has(id)));
  if (!confirmed && fullGroups.length) {
    showConfirmDialog({
      title: "删除组内内容",
      body: `当前选择包含 ${fullGroups.length} 个完整组，共 ${state.selectedIds.size} 个节点。\n删除会移除组框以及组内内容，可通过撤销恢复最近一次删除。`,
      confirmText: "删除",
      danger: true,
      onConfirm: () => deleteSelectedNodes(true),
    });
    return;
  }

  const activeCanvas = getActiveCanvas();
  const selectedNodeIds = new Set(state.selectedIds);
  if (activeCanvas) {
    cancelGenerationTasks(
      (task) => task.canvasId === activeCanvas.id && selectedNodeIds.has(task.nodeId),
    );
    cancelPromptOptimizationTasks(
      (task) => task.canvasId === activeCanvas.id && selectedNodeIds.has(task.nodeId),
    );
  }

  const deleted = state.nodes
    .map((node, index) => ({ node, index }))
    .filter((item) => state.selectedIds.has(item.node.id))
    .map((item) => ({ index: item.index, node: cloneNodeState(item.node) }));
  const deletedGroups = state.groups
    .filter((group) => group.nodeIds.some((id) => state.selectedIds.has(id)))
    .map((group) => cloneGroupState(group));
  const deletedConnections = state.connections
    .filter((connection) => selectedNodeIds.has(connection.sourceNodeId) || selectedNodeIds.has(connection.targetNodeId))
    .map(cloneConnectionState);

  if (!deleted.length) return;
  pushUndoAction({ type: "delete", deleted, deletedGroups, deletedConnections });
  state.nodes = state.nodes.filter((node) => !state.selectedIds.has(node.id));
  state.connections = state.connections.filter(
    (connection) => !selectedNodeIds.has(connection.sourceNodeId) && !selectedNodeIds.has(connection.targetNodeId),
  );
  clearRecentConnectionFeedback(deletedConnections.map((connection) => connection.id));
  state.groups = state.groups.filter((group) => !deletedGroups.some((item) => item.id === group.id));
  clearSelection();
  state.activeGroupId = null;
  render();
}

function restoreGroupSnapshot(groups) {
  state.groups = (groups || []).map((group) => cloneGroupState(group));
  const membership = new Map();
  state.groups.forEach((group) => {
    group.nodeIds.forEach((nodeId) => membership.set(nodeId, group.id));
  });
  state.nodes.forEach((node) => {
    const groupId = membership.get(node.id);
    if (groupId) {
      node.groupId = groupId;
    } else {
      delete node.groupId;
    }
  });
}

function undoLastAction() {
  if (!requireCanvasMutation()) return;
  canvasNodeLayoutTransition.finishAll();
  const pendingAction = state.undoStack[state.undoStack.length - 1];
  if (pendingAction?.kind === "canvas-command") {
    const result = canvasCommandExecutor.undoLast(state.activeCanvasId);
    if (!result.ok) {
      console.error("Canvas command undo was rejected.", result.error);
      showActionToast("画布内容已变化，无法安全撤销");
      return;
    }
    if (result.effectError) {
      console.error("Canvas command undo committed but its save effect failed.", result.effectError);
    }
    state.activeConnectionId = null;
    clearRecentConnectionFeedback();
    render();
    return;
  }
  const action = state.undoStack.pop();
  if (!action) return;

  if (action.type === "node-update") {
    const liveNode = state.nodes.find((node) => node.id === action.node.id);
    if (liveNode?.generating) {
      state.undoStack.push(action);
      showActionToast("生成中的节点暂不能撤销参数");
      return;
    }
    if (liveNode?.promptOptimizing) {
      state.undoStack.push(action);
      showActionToast("提示词正在优化，完成后可撤销");
      return;
    }
  }

  if (action.type === "create") {
    const createdNodeIds = new Set(Array.isArray(action.nodeIds) ? action.nodeIds : []);
    if (createdNodeIds.size) {
      const removedConnectionIds = state.connections
        .filter((connection) => createdNodeIds.has(connection.sourceNodeId) || createdNodeIds.has(connection.targetNodeId))
        .map((connection) => connection.id);
      state.nodes = state.nodes.filter((node) => !createdNodeIds.has(node.id));
      state.connections = state.connections.filter(
        (connection) => !createdNodeIds.has(connection.sourceNodeId) && !createdNodeIds.has(connection.targetNodeId),
      );
      state.groups = state.groups
        .map((group) => ({ ...group, nodeIds: group.nodeIds.filter((nodeId) => !createdNodeIds.has(nodeId)) }))
        .filter((group) => group.nodeIds.length);
      clearRecentConnectionFeedback(removedConnectionIds);
      clearSelection();
      state.activeGroupId = null;
    }
  }

  if (action.type === "delete") {
    const restored = action.deleted
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((item) => cloneUndoNodeState(item.node));
    for (const item of action.deleted.slice().sort((a, b) => a.index - b.index)) {
      state.nodes.splice(Math.min(item.index, state.nodes.length), 0, cloneUndoNodeState(item.node));
    }
    const restoredGroups = (action.deletedGroups || []).map((group) => cloneGroupState(group));
    const restoredGroupIds = new Set(restoredGroups.map((group) => group.id));
    state.groups = state.groups.filter((group) => !restoredGroupIds.has(group.id));
    state.groups.push(...restoredGroups);
    state.connections.push(...(action.deletedConnections || []).map(cloneConnectionState));
    state.connections = canvasConnections.normalizeConnections(state.connections, state.nodes);
    setSelection(restored.map((node) => node.id), restored[0]?.id || null);
  }

  if (action.type === "connections") {
    state.connections = canvasConnections.normalizeConnections(action.connections, state.nodes);
    state.activeConnectionId = null;
  }

  if (action.type === "move") {
    action.positions.forEach((position) => {
      const node = state.nodes.find((item) => item.id === position.id);
      if (!node) return;
      node.x = position.x;
      node.y = position.y;
    });
    restoreGroupSnapshot(action.groups);
    setSelection(action.positions.map((position) => position.id), action.positions[0]?.id || null);
  }

  if (action.type === "group-update") {
    restoreGroupSnapshot(action.groups);
    setActiveGroup(action.activeGroupId || null);
  }

  if (action.type === "node-update") {
    const index = state.nodes.findIndex((node) => node.id === action.node.id);
    if (index !== -1) {
      state.nodes[index] = cloneUndoNodeState(action.node);
      setSelection([action.node.id], action.node.id);
    }
  }

  render();
}

function canRestoreDialogFocus(element) {
  return Boolean(
    element instanceof HTMLElement &&
    element.isConnected &&
    !element.disabled &&
    !element.closest("[inert], .hidden") &&
    element.getClientRects().length,
  );
}

function getDialogFocusFallback(previousFocus) {
  if (!(previousFocus instanceof Element)) return null;
  let selector = null;
  if (previousFocus.closest("#projectMenu")) selector = "[data-project-menu-button]";
  if (previousFocus.closest("#canvasMenu, #canvasMoreMenu")) selector = "[data-canvas-menu-button]";
  if (previousFocus.closest("#profileMenu")) return railProfileBtn;
  if (!selector) return null;
  return [...document.querySelectorAll(selector)].find(canRestoreDialogFocus) || null;
}

function showConfirmDialog({ title, body, confirmText = "确认", cancelText = "取消", danger = false, showCancel = true, onConfirm, onCancel }) {
  const existingLayer = document.querySelector(".confirm-layer");
  if (existingLayer) {
    if (typeof existingLayer.closeConfirmDialog === "function") {
      existingLayer.closeConfirmDialog(false);
    } else {
      existingLayer.remove();
    }
  }

  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const fallbackFocus = getDialogFocusFallback(previousFocus);
  const titleId = `confirm-title-${crypto.randomUUID()}`;
  const layer = document.createElement("dialog");
  layer.className = "confirm-layer";
  layer.setAttribute("aria-modal", "true");
  layer.setAttribute("aria-labelledby", titleId);
  Object.assign(layer.style, {
    width: "100vw",
    height: "100vh",
    maxWidth: "none",
    maxHeight: "none",
    margin: "0",
    padding: "0",
    border: "0",
    color: "inherit",
  });
  layer.innerHTML = `
    <div class="confirm-dialog">
      <div class="confirm-title" id="${titleId}">${escapeHtml(title)}</div>
      <div class="confirm-body">${escapePlainText(body)}</div>
      <div class="confirm-actions">
        ${showCancel ? `<button class="confirm-cancel" type="button" autofocus>${escapeHtml(cancelText)}</button>` : ""}
        <button class="confirm-ok ${danger ? "danger" : ""}" type="button" ${showCancel ? "" : "autofocus"}>${escapeHtml(confirmText)}</button>
      </div>
    </div>
  `;
  document.body.appendChild(layer);

  let closed = false;
  const close = (restoreFocus = true, confirmed = false) => {
    if (closed) return;
    closed = true;
    if (layer.open) layer.close();
    layer.remove();
    if (!confirmed) onCancel?.();
    if (restoreFocus) {
      window.requestAnimationFrame(() => {
        if (document.querySelector(".confirm-layer")) return;
        const target = [previousFocus, fallbackFocus].find(canRestoreDialogFocus);
        target?.focus();
      });
    }
  };
  layer.closeConfirmDialog = close;
  layer.querySelector(".confirm-cancel")?.addEventListener("click", close);
  layer.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  layer.addEventListener("pointerdown", (event) => {
    if (event.target === layer) close();
  });
  layer.querySelector(".confirm-ok")?.addEventListener("click", () => {
    close(true, true);
    onConfirm?.();
  });
  layer.showModal();
  (layer.querySelector("[autofocus]") || layer.querySelector("button"))?.focus();
}

function escapePlainText(value) {
  return escapeHtml(String(value)).replaceAll("\n", "<br>");
}

function getConversation(id) {
  return agentConversations.find((item) => item.id === id) || agentConversations[0];
}

function renderAgentHistory() {
  if (!agentHistoryList) return;
  agentHistoryList.innerHTML = agentConversations
    .map(
      (conversation) => `
        <button class="history-item ${conversation.id === state.activeConversationId ? "active" : ""}" type="button" data-chat-id="${escapeHtml(conversation.id)}">
          ${escapeHtml(conversation.title)}
        </button>
      `,
    )
    .join("");
}

function renderAgentMessages(conversation = getConversation(state.activeConversationId)) {
  if (!agentMessages) return;
  if (!conversation.messages.length) {
    agentMessages.replaceChildren();
    return;
  }

  agentMessages.innerHTML = `
    <div class="agent-message-list">
      ${conversation.messages
        .map(
          (message) => `
            <div class="agent-message ${message.role}">
              <div class="agent-message-role">${message.role === "user" ? "你" : "Reelay Agent"}</div>
              <div class="agent-message-body">${escapePlainText(message.content)}</div>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
  agentMessages.scrollTop = agentMessages.scrollHeight;
}

const agentComposerModes = {
  image: { label: "图片生成", icon: "image" },
  video: { label: "视频生成", icon: "play-square" },
  agent: { label: "Agent 托管", icon: "bot" },
};

function setAgentHistoryOpen(open, { focus = false } = {}) {
  const shouldOpen = Boolean(open);
  if (shouldOpen) {
    setAgentModeMenuOpen(false);
    setAgentModelMenuOpen(false);
  }
  agentHistoryMenu?.classList.toggle("hidden", !shouldOpen);
  agentHistoryBtn?.setAttribute("aria-expanded", String(shouldOpen));
  if (shouldOpen && focus) window.requestAnimationFrame(() => agentHistorySearch?.focus());
}

function setAgentModeMenuOpen(open, { focus = false } = {}) {
  const shouldOpen = Boolean(open);
  if (shouldOpen) {
    setAgentHistoryOpen(false);
    setAgentModelMenuOpen(false);
  }
  agentModeMenu?.classList.toggle("hidden", !shouldOpen);
  agentModeBtn?.classList.toggle("active", shouldOpen);
  agentModeBtn?.setAttribute("aria-expanded", String(shouldOpen));
  if (shouldOpen && focus) {
    window.requestAnimationFrame(() => agentModeMenu?.querySelector('[aria-checked="true"]')?.focus());
  }
}

function setAgentModelMenuOpen(open, { focus = false } = {}) {
  const shouldOpen = Boolean(open) && !agentModelBtn?.disabled;
  if (shouldOpen) {
    setAgentHistoryOpen(false);
    setAgentModeMenuOpen(false);
    renderAgentModelMenu();
  }
  agentModelMenu?.classList.toggle("hidden", !shouldOpen);
  agentModelBtn?.classList.toggle("active", shouldOpen);
  agentModelBtn?.setAttribute("aria-expanded", String(shouldOpen));
  if (shouldOpen && focus) {
    window.requestAnimationFrame(() => agentModelMenu?.querySelector(".agent-model-option.active")?.focus());
  }
}

function closeAgentPopovers() {
  setAgentHistoryOpen(false);
  setAgentModeMenuOpen(false);
  setAgentModelMenuOpen(false);
}

function setAgentAdvancedOpen(open) {
  const shouldOpen = Boolean(open);
  state.agentAdvancedSettingsExpanded = shouldOpen;
  agentAdvancedSettings?.classList.toggle("hidden", !shouldOpen);
  agentAdvancedSettings?.setAttribute("aria-hidden", String(!shouldOpen));
  agentAdvancedBtn?.classList.toggle("active", shouldOpen);
  agentAdvancedBtn?.setAttribute("aria-expanded", String(shouldOpen));
  agentComposer?.classList.toggle("advanced-open", shouldOpen);
}

function setAgentAutoLinkEnabled(enabled) {
  state.agentAutoLinkEnabled = Boolean(enabled);
  agentAutoLinkBtn?.setAttribute("aria-checked", String(state.agentAutoLinkEnabled));
  agentAutoLinkBtn?.classList.toggle("is-on", state.agentAutoLinkEnabled);
}

function setAgentConversation(id) {
  cancelAgentPromptOptimization();
  const conversation = getConversation(id);
  state.activeConversationId = conversation.id;
  if (agentConversationTitle) {
    agentConversationTitle.textContent = conversation.title;
  }
  agentHistoryList?.querySelectorAll(".history-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.chatId === conversation.id);
  });
  renderAgentMessages(conversation);
  setAgentHistoryOpen(false);
}

function filterAgentHistory(keyword = "") {
  const normalizedKeyword = keyword.trim().toLowerCase();
  agentHistoryList?.querySelectorAll(".history-item").forEach((item) => {
    const visible = !normalizedKeyword || item.textContent.toLowerCase().includes(normalizedKeyword);
    item.classList.toggle("hidden", !visible);
  });
}

function syncAgentPromptOptimizationControl() {
  const busy = Boolean(state.agentPromptOptimizationTask);
  const hasPrompt = Boolean(agentInput?.value.trim());
  if (agentPromptOptimizationBtn) {
    agentPromptOptimizationBtn.disabled = busy || !hasPrompt;
    agentPromptOptimizationBtn.classList.toggle("is-processing", busy);
    agentPromptOptimizationBtn.setAttribute("aria-busy", String(busy));
    agentPromptOptimizationBtn.setAttribute("aria-label", busy ? "正在优化提示词" : "提示词优化");
    agentPromptOptimizationBtn.title = busy
      ? "正在优化提示词"
      : hasPrompt
        ? "优化提示词"
        : "输入提示词后优化";
  }
  if (agentInput) {
    agentInput.readOnly = busy;
    agentInput.setAttribute("aria-busy", String(busy));
    agentInput.setAttribute("aria-readonly", String(busy));
  }
  if (agentSendButton) {
    agentSendButton.disabled = busy;
    agentSendButton.classList.toggle("disabled", busy);
    agentSendButton.setAttribute("aria-disabled", String(busy));
  }
}

function cancelAgentPromptOptimization() {
  const task = state.agentPromptOptimizationTask;
  if (task?.timeoutId) window.clearTimeout(task.timeoutId);
  state.agentPromptOptimizationTask = null;
  syncAgentPromptOptimizationControl();
}

function completeAgentPromptOptimization() {
  const task = state.agentPromptOptimizationTask;
  if (!task) return;
  const optimizedPrompt = buildOptimizedPrompt(task.sourcePrompt);
  state.agentPromptOptimizationTask = null;
  if (agentInput && optimizedPrompt) agentInput.value = optimizedPrompt;
  syncAgentPromptOptimizationControl();
  if (agentInput) {
    agentInput.focus();
    agentInput.setSelectionRange(agentInput.value.length, agentInput.value.length);
  }
}

function startAgentPromptOptimization() {
  const sourcePrompt = agentInput?.value.trim();
  if (!sourcePrompt || state.agentPromptOptimizationTask) return;
  const task = {
    conversationId: state.activeConversationId,
    sourcePrompt,
    timeoutId: 0,
  };
  state.agentPromptOptimizationTask = task;
  syncAgentPromptOptimizationControl();
  task.timeoutId = window.setTimeout(() => {
    if (state.agentPromptOptimizationTask === task) completeAgentPromptOptimization();
  }, 900);
}

function sendAgentMessage() {
  if (state.agentPromptOptimizationTask) return;
  const content = agentInput?.value.trim();
  if (!content) return;
  const conversation = getConversation(state.activeConversationId);
  conversation.messages.push({ role: "user", content });
  conversation.messages.push({
    role: "agent",
    content: "我已收到。后续可以把这条需求拆成画布节点、素材输入和生成参数。",
  });
  agentInput.value = "";
  syncAgentPromptOptimizationControl();
  renderAgentMessages(conversation);
}

function getSelectedAgentModelIds() {
  const ids = Array.isArray(state.agentModelIds) && state.agentModelIds.length
    ? state.agentModelIds
    : [state.agentModelId || "gpt-image-2"];
  return ids.filter((id, index) => ids.indexOf(id) === index && models.some((model) => model.id === id));
}

function getSelectedAgentModels() {
  const selectedIds = getSelectedAgentModelIds();
  return selectedIds.map((id) => models.find((model) => model.id === id)).filter(Boolean);
}

function getAgentComposerModel(mode = state.agentComposerMode) {
  if (mode !== "image" && mode !== "video") return null;
  const active = models.find((model) => model.id === state.agentModelId && model.type === mode);
  if (active) return active;
  const preferred = getSelectedAgentModels().find((model) => model.type === mode);
  if (preferred) return preferred;
  const fallbackId = mode === "video" ? "seedance-2" : "gpt-image-2";
  return models.find((model) => model.id === fallbackId)
    || models.find((model) => model.type === mode)
    || null;
}

function getAgentComposerParameterParts(model) {
  if (!model) {
    return { beforeAspect: "自动规划模型与参数", aspect: "", afterAspect: "" };
  }
  const defaults = model.defaults || {};
  if (model.type === "video") {
    const workflow = generationWorkflows.video?.find((item) => item.id === defaults.workflow);
    const after = [defaults.quality, defaults.duration].filter(Boolean).join(" · ");
    return {
      beforeAspect: workflow?.label ? `${workflow.label} · ` : "",
      aspect: defaults.aspect || "自动",
      afterAspect: after ? ` · ${after}` : "",
    };
  }
  const after = [defaults.resolution, defaults.quality].filter(Boolean).join(" · ");
  return {
    beforeAspect: "",
    aspect: defaults.aspect || "自动",
    afterAspect: after ? ` · ${after}` : "",
  };
}

function getAgentComposerParameterSummary(model) {
  const parts = getAgentComposerParameterParts(model);
  return `${parts.beforeAspect}${parts.aspect}${parts.afterAspect}`;
}

function getAgentComposerParameterMarkup(model) {
  const parts = getAgentComposerParameterParts(model);
  if (!parts.aspect) return `<span class="param-summary-before">${escapeHtml(parts.beforeAspect)}</span>`;
  return `<span class="param-summary-before">${escapeHtml(parts.beforeAspect)}</span><span class="param-summary-aspect">${escapeHtml(parts.aspect)}</span><span class="param-summary-after">${escapeHtml(parts.afterAspect)}</span>`;
}

function syncAgentComposerControls() {
  const mode = agentComposerModes[state.agentComposerMode] ? state.agentComposerMode : "video";
  const definition = agentComposerModes[mode];
  if (agentModeBtn) {
    agentModeBtn.innerHTML = `<i data-agent-mode-icon data-lucide="${definition.icon}" aria-hidden="true"></i><span class="control-chip-label" data-agent-mode-label>${definition.label}</span>`;
    agentModeBtn.title = `生成模式：${definition.label}`;
    agentModeBtn.setAttribute("aria-label", `生成模式：${definition.label}`);
  }
  agentModeMenu?.querySelectorAll("[data-agent-mode]").forEach((button) => {
    const active = button.dataset.agentMode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-checked", String(active));
  });
  syncAgentModelButton();
}

function setAgentComposerMode(mode, { focusInput = false } = {}) {
  const nextMode = agentComposerModes[mode] ? mode : "video";
  state.agentComposerMode = nextMode;
  if (nextMode === "image" || nextMode === "video") {
    const model = getAgentComposerModel(nextMode);
    if (model) {
      state.agentModelId = model.id;
      if (!getSelectedAgentModelIds().includes(model.id)) {
        state.agentModelIds = [...getSelectedAgentModelIds(), model.id];
      }
    }
    state.agentModelTab = nextMode;
  }
  setAgentModeMenuOpen(false);
  syncAgentComposerControls();
  if (focusInput) agentInput?.focus();
}

function syncAgentModelButton() {
  const selectedModels = getSelectedAgentModels();
  const names = selectedModels.map((model) => model.name);
  const preferenceLabel =
    names.length > 2
      ? `已选模型：${names.slice(0, 2).join("、")} 等 ${names.length} 个`
      : `已选模型：${names.join("、") || "未选择"}`;
  const model = getAgentComposerModel();
  const agentManaged = state.agentComposerMode === "agent";
  if (agentModelBtn) {
    agentModelBtn.disabled = agentManaged;
    agentModelBtn.classList.toggle("agent-managed", agentManaged);
    agentModelBtn.innerHTML = agentManaged
      ? '<i data-lucide="bot" aria-hidden="true"></i><span class="agent-model-button-label control-chip-label">自动编排</span>'
      : `${modelIconMarkup(model, "model-chip-glyph agent-composer-model-icon")}<span class="agent-model-button-label control-chip-label">${escapeHtml(model?.name || "选择模型")}</span>`;
    const label = agentManaged ? "Agent 托管将自动编排模型" : `${preferenceLabel}；当前 ${model?.name || "未选择"}`;
    agentModelBtn.title = label;
    agentModelBtn.setAttribute("aria-label", label);
  }
  if (agentParamSummary) {
    const summary = getAgentComposerParameterSummary(model);
    agentParamSummary.innerHTML = `<span class="control-chip-label param-chip-label">${getAgentComposerParameterMarkup(model)}</span>${model?.type === "video" ? '<span class="control-chip-audio-separator" aria-hidden="true">·</span><i data-lucide="volume-2" aria-label="音频开启"></i>' : ""}`;
    agentParamSummary.setAttribute("aria-label", `当前生成参数：${summary}`);
  }
  refreshIcons();
}

function renderAgentModelMenu() {
  if (!agentModelMenu) return;
  const activeTab = state.agentModelTab === "video" ? "video" : "image";
  const selectedIds = new Set(getSelectedAgentModelIds());
  const imageModels = models.filter((model) => model.type === "image");
  const videoModels = models.filter((model) => model.type === "video");
  const renderOption = (model) => {
    const active = selectedIds.has(model.id);
    return `
      <button class="agent-model-option ${active ? "active" : ""}" type="button" data-agent-model="${model.id}" aria-pressed="${active}">
        ${modelIconMarkup(model, "agent-model-provider")}
        <span class="agent-model-copy">
          <span class="agent-model-title">${escapeHtml(model.name)}</span>
          <span class="agent-model-detail">${escapeHtml(model.desc)}</span>
          <span class="agent-model-badge">${escapeHtml(model.badge || "30s")}</span>
        </span>
        <i class="agent-model-check" data-lucide="check" aria-hidden="true"></i>
      </button>
    `;
  };

  agentModelMenu.innerHTML = `
    <div class="agent-model-fixed">
      <div class="agent-model-menu-head">
        <div class="agent-model-menu-title">模型偏好</div>
        <label class="agent-auto-toggle">
          <span>自动</span>
          <input type="checkbox" data-agent-auto ${state.agentModelAuto ? "checked" : ""} />
          <i aria-hidden="true"></i>
        </label>
      </div>
      <div class="agent-model-tabs" style="--active-index: ${activeTab === "video" ? 1 : 0}" role="tablist" aria-label="模型类型">
        <span class="agent-model-tab-indicator" aria-hidden="true"></span>
        <button class="${activeTab === "image" ? "active" : ""}" type="button" data-agent-model-tab="image">图片</button>
        <button class="${activeTab === "video" ? "active" : ""}" type="button" data-agent-model-tab="video">视频</button>
      </div>
    </div>
    <div class="agent-model-scroll">
      <div class="agent-model-section" data-agent-model-section="image">
        <div class="agent-model-section-label">图片模型</div>
        <div class="agent-model-list">${imageModels.map(renderOption).join("")}</div>
      </div>
      <div class="agent-model-section" data-agent-model-section="video">
        <div class="agent-model-section-label">视频模型</div>
        <div class="agent-model-list">${videoModels.map(renderOption).join("")}</div>
      </div>
    </div>
  `;
  const scroll = agentModelMenu.querySelector(".agent-model-scroll");
  scroll?.addEventListener("scroll", syncAgentModelTabFromScroll, { passive: true });
  scroll?.addEventListener("wheel", () => requestAnimationFrame(syncAgentModelTabFromScroll), { passive: true });
  updateAgentModelTabUi(activeTab);
  refreshIcons();
}

function toggleAgentModel(modelId) {
  const selected = models.find((item) => item.id === modelId);
  if (!selected) return;
  const scrollTop = agentModelMenu?.querySelector(".agent-model-scroll")?.scrollTop || 0;
  const selectedIds = getSelectedAgentModelIds();
  const exists = selectedIds.includes(selected.id);
  const isActiveGenerationType = selected.type === state.agentComposerMode;
  const sameTypeCount = selectedIds
    .map((id) => models.find((model) => model.id === id))
    .filter((model) => model?.type === selected.type).length;
  if (exists && selectedIds.length > 1 && (!isActiveGenerationType || sameTypeCount > 1)) {
    state.agentModelIds = selectedIds.filter((id) => id !== selected.id);
    if (state.agentModelId === selected.id) {
      state.agentModelId = state.agentModelIds
        .map((id) => models.find((model) => model.id === id))
        .find((model) => model?.type === state.agentComposerMode)?.id
        || state.agentModelIds[0];
    }
  } else if (!exists) {
    state.agentModelIds = [...selectedIds, selected.id];
    if (isActiveGenerationType) state.agentModelId = selected.id;
  } else {
    state.agentModelIds = selectedIds;
  }
  syncAgentModelButton();
  renderAgentModelMenu();
  const nextScroll = agentModelMenu?.querySelector(".agent-model-scroll");
  if (nextScroll) nextScroll.scrollTop = scrollTop;
}

function setAgentModelTab(tab) {
  if (!agentModelMenu) return;
  state.agentModelTab = tab === "video" ? "video" : "image";
  const scroll = agentModelMenu.querySelector(".agent-model-scroll");
  const section = agentModelMenu.querySelector(`[data-agent-model-section="${state.agentModelTab}"]`);
  updateAgentModelTabUi(state.agentModelTab);
  if (scroll && section) {
    scroll.scrollTo({
      top: section.offsetTop - scroll.offsetTop,
      behavior: "smooth",
    });
  }
}

function updateAgentModelTabUi(tab = state.agentModelTab) {
  if (!agentModelMenu) return;
  const nextTab = tab === "video" ? "video" : "image";
  state.agentModelTab = nextTab;
  agentModelMenu.querySelector(".agent-model-tabs")?.style.setProperty("--active-index", nextTab === "video" ? "1" : "0");
  agentModelMenu.querySelectorAll("[data-agent-model-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.agentModelTab === nextTab);
  });
}

function syncAgentModelTabFromScroll() {
  if (!agentModelMenu) return;
  const scroll = agentModelMenu.querySelector(".agent-model-scroll");
  const videoSection = agentModelMenu.querySelector('[data-agent-model-section="video"]');
  if (!scroll || !videoSection) return;
  const scrollRect = scroll.getBoundingClientRect();
  const videoRect = videoSection.getBoundingClientRect();
  const switchLine = scrollRect.top + Math.min(96, scrollRect.height * 0.34);
  updateAgentModelTabUi(videoRect.top <= switchLine ? "video" : "image");
}

function getResolvedTheme(mode = state.themeMode) {
  return normalizeThemeMode(mode);
}

function showThemeSwitchFeedback() {
  if (!themeInlineSwitch) return;
  window.clearTimeout(themeFeedbackTimer);
  themeInlineSwitch.classList.add("is-visible");
  themeFeedbackTimer = window.setTimeout(() => {
    themeInlineSwitch.classList.remove("is-visible");
  }, 1100);
}

function applyTheme(mode = state.themeMode, options = {}) {
  const nextMode = normalizeThemeMode(mode);
  state.themeMode = nextMode;
  try {
    localStorage.setItem("reelay-theme-mode", nextMode);
  } catch {
    // A blocked storage API should not prevent theme changes in the current session.
  }
  document.documentElement.dataset.theme = getResolvedTheme(nextMode);
  document.documentElement.dataset.themeMode = nextMode;
  const configuredNodeRadius = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue("--node-media-radius"),
  );
  if (Number.isFinite(configuredNodeRadius)) selectionSurfaceRadiusWorld = configuredNodeRadius;
  syncSelectionOverlayProjection();
  renderSelectionToolbar();
  const themeLabels = {
    light: "浅色模式",
    dark: "深色模式",
  };
  const themeIcons = {
    light: "sun",
    dark: "moon",
  };
  const themeIndexes = {
    light: 0,
    dark: 1,
  };
  if (themeCurrentLabel) themeCurrentLabel.textContent = themeLabels[nextMode] || "深色模式";
  if (themeModeIcon) {
    themeModeIcon.innerHTML = `<i data-lucide="${themeIcons[nextMode] || "moon"}" aria-hidden="true"></i>`;
  }
  if (themeInlineSwitch) {
    themeInlineSwitch.style.setProperty("--theme-index", themeIndexes[nextMode] ?? 1);
  }
  refreshIcons();
  if (options.flash) showThemeSwitchFeedback();
}

function setAgentWidth(width) {
  const opposingWidth = isAssetLibraryOpen() ? state.assetLibraryWidth : 0;
  const viewportMax = Math.min(panelWidthRules.agentMax, window.innerWidth - panelWidthRules.edgeInset * 2);
  const maxWidth = state.agentOpen && isAssetLibraryOpen()
    ? Math.min(viewportMax, window.innerWidth - panelWidthRules.edgeInset * 2 - panelWidthRules.canvasCorridor - opposingWidth)
    : viewportMax;
  applyAgentWidth(clampPanelWidth(width, panelWidthRules.agentMin, maxWidth));
  renderSelectionToolbar();
  scheduleNodePopoverLayouts();
}

function setAgentOpen(open) {
  if (open && isAssetLibraryOpen() && !canShowAssetAndAgent()) {
    closeAssetLibrary();
  }
  state.agentOpen = open;
  if (!agentDock) return;
  const shouldMoveFocusIntoPanel = open && document.activeElement === agentLauncher;
  const shouldRestoreLauncherFocus = !open && Boolean(agentPanel?.contains(document.activeElement));
  appShell?.classList.toggle("agent-open", open);
  agentDock.classList.toggle("collapsed", !open);
  agentDock.classList.toggle("open", open);
  if (open && isAssetLibraryOpen()) reconcileDualPanelWidths("agent");
  else if (!open && isAssetLibraryOpen()) {
    setAssetLibraryWidth(state.assetLibraryPreferredWidth, { remember: false });
  } else {
    syncAssetLibraryResizeSemantics();
  }
  if (agentPanel) {
    agentPanel.inert = !open;
    agentPanel.setAttribute("aria-hidden", String(!open));
  }
  if (agentLauncher) {
    agentLauncher.inert = open;
    agentLauncher.setAttribute("aria-hidden", String(open));
    agentLauncher.setAttribute("aria-expanded", String(open));
  }
  if (!open) {
    cancelAgentPromptOptimization();
    closeAgentPopovers();
    setAgentAdvancedOpen(false);
  }
  syncNarrowViewportIsolation({ focusPanel: narrowViewportQuery.matches && open });
  scheduleNodePopoverLayouts();
  if (shouldMoveFocusIntoPanel) window.requestAnimationFrame(() => agentInput?.focus());
  if (shouldRestoreLauncherFocus) window.requestAnimationFrame(() => agentLauncher?.focus());
}

function getProjectShareUrl() {
  const { href, protocol } = window.location;
  if (protocol === "http:" || protocol === "https:") return href;
  return "https://github.com/Heo7n/reelay-canvas-prototype";
}

function canNativeShare(shareData) {
  if (typeof navigator.share !== "function") return false;
  if (typeof navigator.canShare !== "function") return true;
  try {
    return navigator.canShare(shareData);
  } catch {
    return false;
  }
}

function copyTextFallback(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-999px";
  textarea.style.left = "-999px";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

async function copyShareLink(url) {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      // Fall through to the textarea fallback for local prototype environments.
    }
  }
  return copyTextFallback(url);
}

async function shareProject(event) {
  event?.preventDefault();
  event?.stopPropagation();
  const shareData = {
    title: `${state.projectName} · Reelay Canvas`,
    text: "查看这个 Reelay Canvas 创作项目",
    url: getProjectShareUrl(),
  };
  if (canNativeShare(shareData)) {
    try {
      await navigator.share(shareData);
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }
  const copied = await copyShareLink(shareData.url);
  showActionToast(copied ? "分享链接已复制" : "暂时无法复制分享链接");
}

function selectEditableText(element) {
  const range = document.createRange();
  range.selectNodeContents(element);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function beginInlineRename(element) {
  if (!requireCanvasMutation()) return;
  if (!element) return;
  element.dataset.beforeEdit = element.textContent || "";
  element.contentEditable = "true";
  element.classList.add("editing");
  element.focus();
  selectEditableText(element);
}

function finishInlineRename(element, commit = true) {
  if (!element || element.contentEditable !== "true") return;
  const type = element.dataset.projectName !== undefined ? "project" : "canvas";
  const previousText = element.dataset.beforeEdit || "";
  const nextText = commit ? element.textContent.trim() : previousText;
  if (type === "project") {
    commitProjectRename(nextText || "Untitled");
  } else {
    commitCanvasRename(nextText || getActiveCanvas()?.name || "画布 1");
  }
  element.contentEditable = "false";
  element.classList.remove("editing");
  delete element.dataset.beforeEdit;
  element.blur();
  syncProjectNavigation();
}

function commitProjectRename(nextName) {
  if (!requireCanvasMutation()) return;
  state.projectName = String(nextName || "Untitled").trim() || "Untitled";
  state.projects = getProjectMenuOptions().map((project) => (
    project.id === state.projectId ? { ...project, name: state.projectName } : project
  ));
  syncProjectNavigation();
  renderProjectMenu();
}

function commitCanvasRename(nextName, canvasId = state.activeCanvasId, { renderMenu = true } = {}) {
  if (!requireCanvasMutation()) return false;
  const canvas = canvasRuntimeStore.getCanvas(canvasId);
  if (!canvas) return false;
  const normalizedName = String(nextName || canvas.name || "画布 1").trim() || "画布 1";
  if (normalizedName === canvas.name) {
    syncProjectNavigation();
    if (renderMenu) renderCanvasMenu();
    return true;
  }
  canvas.name = normalizedName;
  syncProjectNavigation();
  if (renderMenu) renderCanvasMenu();
  scheduleCanvasDocumentSave();
  return true;
}

function positionMenu(menu, anchor, options = {}) {
  if (!menu || !anchor) return;
  const rect = anchor.getBoundingClientRect();
  const width = options.width || menu.offsetWidth || 190;
  if (options.placement === "right") {
    const height = menu.offsetHeight || 60;
    const left = clamp(rect.right + (options.gap ?? 8), 8, window.innerWidth - width - 8);
    const top = clamp(rect.top, 8, window.innerHeight - height - 8);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.right = "auto";
    menu.style.bottom = "auto";
    return;
  }
  const left = clamp(options.alignRight ? rect.right - width : rect.left, 8, window.innerWidth - width - 8);
  const top = clamp(rect.bottom + (options.gap ?? 8), 8, window.innerHeight - 60);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.style.right = "auto";
  menu.style.bottom = "auto";
}

function positionProjectMenu(anchor) {
  if (!projectMenu || !anchor) return;
  const surface = anchor.closest(".project-nav") || anchor;
  const rect = surface.getBoundingClientRect();
  const width = Math.min(360, Math.max(0, window.innerWidth - 16));
  const left = clamp(rect.left, 8, window.innerWidth - width - 8);
  const top = clamp(rect.bottom + 8, 8, window.innerHeight - 180);
  projectMenu.style.width = `${width}px`;
  projectMenu.style.maxHeight = `${Math.max(172, window.innerHeight - top - 8)}px`;
  projectMenu.style.left = `${left}px`;
  projectMenu.style.top = `${top}px`;
  projectMenu.style.right = "auto";
  projectMenu.style.bottom = "auto";
}

function setMenuTriggerExpanded(selector, activeTrigger = null) {
  document.querySelectorAll(selector).forEach((trigger) => {
    trigger.setAttribute("aria-expanded", String(trigger === activeTrigger));
  });
}

function focusFirstMenuControl(menu) {
  window.requestAnimationFrame(() => {
    menu?.querySelector('[role="menuitem"]:not([disabled]), button:not([disabled]), input:not([disabled])')?.focus();
  });
}

function closeCanvasMoreMenu({ returnFocus = false } = {}) {
  const focusTarget = canvasMoreMenuTrigger;
  canvasMoreMenu?.classList.add("hidden");
  canvasMoreMenuTrigger?.setAttribute("aria-expanded", "false");
  canvasMoreMenuTrigger = null;
  if (returnFocus && canRestoreDialogFocus(focusTarget)) {
    window.requestAnimationFrame(() => focusTarget.focus());
  }
}

function closeProjectMenus({ returnFocus = false } = {}) {
  const projectWasOpen = Boolean(projectMenu && !projectMenu.classList.contains("hidden"));
  const canvasWasOpen = Boolean(canvasMenu && !canvasMenu.classList.contains("hidden"));
  const focusTarget = projectWasOpen ? projectMenuTrigger : canvasWasOpen ? canvasMenuTrigger : null;
  projectMenu?.classList.add("hidden");
  canvasMenu?.classList.add("hidden");
  closeCanvasMoreMenu();
  setMenuTriggerExpanded("[data-project-menu-button]");
  setMenuTriggerExpanded("[data-canvas-menu-button]");
  projectMenuTrigger = null;
  canvasMenuTrigger = null;
  if (projectWasOpen) {
    state.projectSearch = "";
    if (projectMenuSearch) projectMenuSearch.value = "";
  }
  if (returnFocus && canRestoreDialogFocus(focusTarget)) {
    window.requestAnimationFrame(() => focusTarget.focus());
  }
}

function renderCanvasMenu() {
  if (!canvasMenuList) return;
  const activeId = state.activeCanvasId;
  canvasMenuList.innerHTML = state.canvases
    .map(
      (canvas) => `
        <div class="canvas-menu-row ${canvas.id === activeId ? "active" : ""}" role="none" data-canvas-id="${canvas.id}">
          <button class="canvas-menu-switch" type="button" role="menuitem" data-canvas-switch="${canvas.id}">
            <span class="canvas-menu-name">${escapeHtml(canvas.name)}</span>
            ${canvas.id === activeId ? `<i data-lucide="check" aria-hidden="true"></i>` : ""}
          </button>
          <button class="canvas-menu-more-button" type="button" role="menuitem" data-canvas-more="${canvas.id}" title="画布操作" aria-label="画布操作" aria-controls="canvasMoreMenu" aria-expanded="false" aria-haspopup="menu">
            <i data-lucide="more-horizontal" aria-hidden="true"></i>
          </button>
        </div>
      `,
    )
    .join("");
  refreshIcons();
}

function openProjectMenu(anchor, { focusMenu = false } = {}) {
  const wasOpen = projectMenuTrigger === anchor && !projectMenu?.classList.contains("hidden");
  closeCanvasPanel();
  if (wasOpen && focusMenu) {
    focusFirstMenuControl(projectMenu);
    return;
  }
  closeProjectMenus();
  if (wasOpen || !projectMenu) return;
  renderProjectMenu();
  projectMenuTrigger = anchor;
  projectMenu.classList.remove("hidden");
  setMenuTriggerExpanded("[data-project-menu-button]", anchor);
  positionProjectMenu(anchor);
  if (focusMenu) focusFirstMenuControl(projectMenu);
}

function openCanvasMenu(anchor, { focusMenu = false } = {}) {
  const wasOpen = canvasMenuTrigger === anchor && !canvasMenu?.classList.contains("hidden");
  closeCanvasPanel();
  if (wasOpen && focusMenu) {
    focusFirstMenuControl(canvasMenu);
    return;
  }
  closeProjectMenus();
  if (wasOpen || !canvasMenu) return;
  renderCanvasMenu();
  canvasMenuTrigger = anchor;
  canvasMenu.classList.remove("hidden");
  setMenuTriggerExpanded("[data-canvas-menu-button]", anchor);
  positionMenu(canvasMenu, anchor, anchor.closest(".left-rail")
    ? { width: 220, placement: "right", gap: 10 }
    : { width: 220 });
  if (focusMenu) focusFirstMenuControl(canvasMenu);
}

function beginCanvasMenuRename(canvasId) {
  if (!requireCanvasMutation()) return;
  const canvas = canvasRuntimeStore.getCanvas(canvasId);
  if (!canvas || !canvasMenuList) return;
  closeCanvasMoreMenu();
  renderCanvasMenu();
  canvasMenu?.classList.remove("hidden");
  const row = [...canvasMenuList.querySelectorAll("[data-canvas-id]")]
    .find((element) => element.dataset.canvasId === canvasId);
  const switchButton = row?.querySelector(".canvas-menu-switch");
  if (!switchButton) return;
  const nameInput = document.createElement("input");
  nameInput.className = "canvas-menu-name editing";
  nameInput.type = "text";
  nameInput.value = canvas.name;
  nameInput.setAttribute("aria-label", "重命名画布");
  switchButton.replaceWith(nameInput);
  nameInput.focus();
  nameInput.select();

  let finished = false;
  const finish = (commit, { focusTarget = null } = {}) => {
    if (finished) return;
    finished = true;
    const previousName = canvas.name;
    const nextName = commit ? nameInput.value.trim() : previousName;
    if (commit) {
      commitCanvasRename(nextName || previousName, canvasId, { renderMenu: false });
    }
    const resolvedName = canvasRuntimeStore.getCanvas(canvasId)?.name || previousName;
    const restoredName = switchButton.querySelector(".canvas-menu-name");
    if (restoredName) restoredName.textContent = resolvedName;
    if (nameInput.isConnected) nameInput.replaceWith(switchButton);
    if (focusTarget?.isConnected) {
      focusTarget.focus({ preventScroll: true });
    }
  };
  nameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      finish(true, { focusTarget: switchButton });
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      finish(false, { focusTarget: switchButton });
    } else if (event.key === "Tab") {
      const controls = [...canvasMenu.querySelectorAll("button:not([disabled]), input:not([disabled])")];
      const currentIndex = controls.indexOf(nameInput);
      const nextIndex = currentIndex + (event.shiftKey ? -1 : 1);
      const focusTarget = controls[nextIndex] || canvasMenuTrigger;
      event.preventDefault();
      event.stopPropagation();
      finish(true, { focusTarget });
    }
  });
  nameInput.addEventListener("blur", () => finish(true), { once: true });
}

function addCanvas() {
  if (!requireCanvasMutation()) return;
  const canvas = createCanvasRecord(`画布 ${state.canvases.length + 1}`);
  canvasRuntimeStore.addCanvas(canvas, { activate: true });
  resetActiveCanvasSession(canvas);
  showActionToast("已添加画布");
}

function switchCanvas(canvasId) {
  if (canvasId === state.activeCanvasId) return;
  const nextCanvas = canvasRuntimeStore.activateCanvas(canvasId);
  if (!nextCanvas) return;
  resetActiveCanvasSession(nextCanvas);
}

function duplicateCanvas(canvasId) {
  if (!requireCanvasMutation()) return;
  const source = canvasRuntimeStore.getCanvas(canvasId);
  if (!source) return;
  const content = cloneCanvasContent(source);
  const duplicate = {
    id: crypto.randomUUID(),
    name: `${source.name} 副本`,
    nodes: content.nodes,
    groups: content.groups,
    connections: content.connections,
    tx: source.tx,
    ty: source.ty,
    scale: source.scale,
    zCounter: source.zCounter,
    undoStack: [],
  };
  canvasRuntimeStore.addCanvas(duplicate, { activate: true });
  resetActiveCanvasSession(duplicate);
  showActionToast("已复制画布");
}

function deleteCanvas(canvasId) {
  if (!requireCanvasMutation()) return;
  if (state.canvases.length <= 1) {
    showActionToast("至少保留一个画布");
    return;
  }
  const canvas = state.canvases.find((item) => item.id === canvasId);
  if (!canvas) return;
  showConfirmDialog({
    title: "删除画布",
    body: `将删除「${canvas.name}」及其中的节点。此操作当前原型不可撤销。`,
    confirmText: "删除",
    danger: true,
    onConfirm: () => {
      cancelGenerationTasks((task) => task.canvasId === canvasId);
      cancelPromptOptimizationTasks((task) => task.canvasId === canvasId);
      const removal = canvasRuntimeStore.removeCanvas(canvasId);
      if (!removal) return;
      if (removal.activeChanged) {
        resetActiveCanvasSession(removal.activeCanvas);
      } else {
        renderCanvasMenu();
      }
      showActionToast("画布已删除");
    },
  });
}

function handleProjectMenuAction(action) {
  closeProjectMenus();
  if (action === "create") requestHostProjectCreation();
}

function handleCanvasMoreAction(action) {
  const canvasId = state.canvasMoreTargetId || state.activeCanvasId;
  if (action === "rename") {
    switchCanvas(canvasId);
    requestAnimationFrame(() => beginCanvasMenuRename(canvasId));
    return;
  }
  closeProjectMenus();
  if (action === "open") {
    showActionToast("多窗口画布将在正式工作台中打开");
    return;
  }
  if (action === "duplicate") {
    duplicateCanvas(canvasId);
    return;
  }
  if (action === "delete") {
    deleteCanvas(canvasId);
  }
}

function groupSelectedNodes() {
  if (!requireCanvasMutation()) return;
  const selectedNodes = getSelectedNodes();
  if (selectedNodes.length < 2) return;
  if (selectedNodes.some((node) => Boolean(node.groupId))) {
    showActionToast("组内节点不能再次打组，请先解组或选择未分组节点");
    return;
  }
  const groupId = crypto.randomUUID();
  const bounds = getDefaultGroupBounds(selectedNodes);
  if (!bounds) return;
  state.groups = state.groups.filter((group) => !group.nodeIds.every((id) => state.selectedIds.has(id)));
  selectedNodes.forEach((node) => {
    node.groupId = groupId;
  });
  state.groups.push({
    id: groupId,
    name: "新建组",
    nodeIds: selectedNodes.map((node) => node.id),
    x: bounds.left,
    y: bounds.top,
    width: bounds.width,
    height: bounds.height,
    z: nextZ(),
    layoutMenuOpen: false,
  });
  setActiveGroup(groupId);
  render();
}

function arrangeNodes(nodes, layout = "grid") {
  const ordered = nodes.slice().sort((a, b) => a.y - b.y || a.x - b.x);
  if (ordered.length < 2) return;

  const bounds = ordered.reduce(
    (acc, node) => {
      const nodeBounds = getNodeBounds(node);
      return {
        left: Math.min(acc.left, nodeBounds.left),
        top: Math.min(acc.top, nodeBounds.top),
      };
    },
    { left: Infinity, top: Infinity },
  );
  const gap = 28;
  const layouts = ordered.map((node) => ({ node, layout: getNodeLayout(node) }));

  if (layout === "horizontal") {
    let cursorX = bounds.left;
    const top = bounds.top;
    for (const item of layouts) {
      item.node.x = cursorX;
      item.node.y = top;
      cursorX += item.layout.nodeWidth + gap;
    }
  } else if (layout === "vertical") {
    const left = bounds.left;
    let cursorY = bounds.top;
    for (const item of layouts) {
      item.node.x = left;
      item.node.y = cursorY;
      cursorY += item.layout.nodeHeight + gap;
    }
  } else {
    const columns = Math.ceil(Math.sqrt(layouts.length));
    const cellWidth = Math.max(...layouts.map((item) => item.layout.nodeWidth)) + gap;
    const cellHeight = Math.max(...layouts.map((item) => item.layout.nodeHeight)) + gap;
    layouts.forEach((item, index) => {
      item.node.x = bounds.left + (index % columns) * cellWidth;
      item.node.y = bounds.top + Math.floor(index / columns) * cellHeight;
    });
  }
}

function sortSelectedNodes(layout = "grid") {
  if (!requireCanvasMutation()) return;
  const selectedNodes = getSelectedNodes();
  if (selectedNodes.length < 2) return;
  arrangeNodes(selectedNodes, layout);
  bringNodesToFront(selectedNodes);
  render();
}

function getMediaEntriesForNodes(nodes) {
  return nodes
    .map((node) => ({ node, asset: getEditableMedia(node) }))
    .filter((entry) => entry.asset);
}

function getSelectedMediaEntries() {
  return getMediaEntriesForNodes(getSelectedNodes());
}

function sanitizeFileName(value) {
  return String(value || "reelay-media")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 96) || "reelay-media";
}

function addSelectedMediaToLibrary() {
  if (!requireCanvasMutation()) return;
  const entries = getSelectedMediaEntries();
  if (!entries.length) {
    showActionToast("选中的节点还没有可保存素材");
    return;
  }
  const additions = [];
  for (const { asset } of entries) {
    const sourceId = asset.librarySourceId || asset.id;
    const registered = findRegisteredLibraryMedia(asset);
    if (hasPersonalLibraryPlacement(registered)) continue;
    if (window.parent !== window && !asset.workspaceAssetId && !registered?.workspaceAssetId) continue;
    const candidate = registered || {
      ...cloneAsset(asset, asset.source || "library"),
      librarySourceId: sourceId,
    };
    if (additions.some((item) => item.id === candidate.id || (item.url && item.url === candidate.url))) continue;
    additions.push(candidate);
  }
  if (!additions.length) {
    showActionToast(window.parent !== window ? "选中素材尚未持久化或已在个人素材中" : "选中素材已在个人素材中");
    return;
  }
  registerLibraryAssets(additions, "project");
  showActionToast(`已保存 ${additions.length} 个素材`);
}

async function downloadNodesMedia(nodes, packageMode = false) {
  const entries = getMediaEntriesForNodes(nodes).filter(({ asset }) => asset?.url);
  if (!entries.length) {
    showActionToast("选中的节点暂无可下载内容");
    return;
  }
  for (const [index, { node, asset }] of entries.entries()) {
    const title = sanitizeFileName(getMediaTitle(node, asset) || getAssetDisplayName(asset) || `reelay-${index + 1}`);
    await downloadAssetFile(asset, `${title}.${getAssetDownloadExtension(asset)}`);
  }
  showActionToast(packageMode ? "原型中以逐个文件模拟打包下载" : `已开始下载 ${entries.length} 个素材`);
}

async function downloadSelectedMedia(packageMode = false) {
  return downloadNodesMedia(getSelectedNodes(), packageMode);
}

function arrangeGroup(group, layout = "grid") {
  if (!requireCanvasMutation()) return;
  const groupNodes = getGroupNodes(group);
  if (groupNodes.length < 2) return;
  group.layoutMenuOpen = false;
  arrangeNodes(groupNodes, layout);
  bringNodesToFront(groupNodes);
  setActiveGroup(group.id);
  render();
}

function ungroup(groupId) {
  if (!requireCanvasMutation()) return;
  const group = getGroupById(groupId);
  if (!group) return;
  const groupsBefore = state.groups.map((item) => cloneGroupState(item));
  for (const node of getGroupNodes(group)) {
    if (node.groupId === groupId) delete node.groupId;
  }
  state.groups = state.groups.filter((item) => item.id !== groupId);
  state.activeGroupId = null;
  pushUndoAction({ type: "group-update", groups: groupsBefore, activeGroupId: groupId });
  render();
}

function requestRunGroup(group) {
  if (!requireCanvasMutation()) return;
  const groupGenerators = getGroupNodes(group).filter((node) => node.kind === "generator");
  if (!groupGenerators.length) {
    showConfirmDialog({
      title: "无法整组执行",
      body: "当前组内没有生成节点。请先把图片生成或视频生成节点放入组内。",
      confirmText: "知道了",
      showCancel: false,
    });
    return;
  }

  const generators = groupGenerators.filter((node) => !node.generating);
  if (!generators.length) {
    showConfirmDialog({
      title: "组内任务正在生成",
      body: "当前组内的生成节点都已在运行，本次不会重复启动或扣除积分。",
      confirmText: "知道了",
      showCancel: false,
    });
    return;
  }

  const missingPrompts = generators.filter((node) => !node.prompt.trim());
  if (missingPrompts.length) {
    showConfirmDialog({
      title: "缺少提示词",
      body: `组内有 ${missingPrompts.length} 个生成节点还没有填写提示词。\n请补齐提示词后再执行整组生成。`,
      confirmText: "知道了",
      showCancel: false,
    });
    return;
  }

  generators.forEach((node) => normalizeNodeParameters(node));
  const taskTypeIssues = generators.map((node) => getOmniReferenceTaskTypeIssue(node)).filter(Boolean);
  if (taskTypeIssues.length) {
    showConfirmDialog({
      title: "组内任务参数不完整",
      body: taskTypeIssues[0],
      confirmText: "知道了",
      showCancel: false,
    });
    return;
  }

  const generationCosts = generators.map((node) => getCost(node));
  if (generationCosts.some((cost) => !Number.isFinite(cost) || cost <= 0)) {
    showConfirmDialog({
      title: "组内存在不可用模型",
      body: "至少一个生成节点的参数或积分价格配置不完整，请调整后再执行。",
      confirmText: "知道了",
      showCancel: false,
    });
    return;
  }
  const totalCredits = generationCosts.reduce((sum, cost) => sum + cost, 0);
  if (!hasEnoughCredits(totalCredits)) {
    showConfirmDialog({
      title: "积分不足",
      body: `当前可用积分为 ${formatCredit(state.account.credits)}，整组执行预计需要 ${formatCredit(totalCredits)} 积分。`,
      confirmText: "知道了",
      showCancel: false,
    });
    return;
  }

  showConfirmDialog({
    title: "整组执行生成",
    body: `即将运行「${group.name || "新建组"}」内的 ${generators.length} 个生成节点。\n预计消耗 ${formatCredit(totalCredits)} 积分。`,
    confirmText: "运行",
    onConfirm: () => {
      let actualCredits = 0;
      generators.forEach((node, index) => {
        if (node.generating) return;
        if (startSimulatedGeneration(node, { charge: false })) {
          actualCredits += generationCosts[index];
        }
      });
      if (actualCredits > 0) chargeCredits(actualCredits);
      setActiveGroup(group.id);
      render();
    },
  });
}

function isCanvasSurface(target) {
  return target === shell || target === stage || target === nodeLayer || target === connectionLayer;
}

function isSelectionFrameDragTarget(pointer) {
  if (
    !multiSelectionChrome
    || multiSelectionChrome.classList.contains("hidden")
    || state.selectedIds.size < 2
    || getExactSelectionGroup()
    || !isCanvasMutationAllowed()
    || !isCanvasSurface(pointer?.target)
    || state.action
    || state.connectionDrop
    || !Number.isFinite(pointer?.clientX)
    || !Number.isFinite(pointer?.clientY)
  ) return false;

  const rect = multiSelectionChrome.getBoundingClientRect();
  return pointer.clientX >= rect.left
    && pointer.clientX <= rect.right
    && pointer.clientY >= rect.top
    && pointer.clientY <= rect.bottom;
}

function syncSelectionFramePointerFeedback(pointer) {
  const pressed = isSelectionFrameDragAction();
  shell.classList.toggle("selection-frame-pressed", pressed);
  shell.classList.toggle(
    "selection-frame-hover",
    !pressed && isSelectionFrameDragTarget(pointer),
  );
}

function isConnectionDropSurface(target) {
  if (!(target instanceof Element) || !shell.contains(target)) return false;
  return !target.closest(
    [
      ".canvas-node",
      ".connection-group",
      ".connection-create-menu",
      ".node-create-menu",
      ".selection-toolbar",
      ".group-toolbar",
      ".canvas-controls",
      ".canvas-tools",
      ".left-rail",
      ".top-bar",
      ".top-actions",
      ".asset-library-panel",
      ".agent-dock",
      ".agent-panel",
      ".profile-menu",
      ".confirm-layer",
      "button",
      "input",
      "textarea",
      "select",
      "audio",
      "video",
    ].join(", "),
  );
}

function shouldBypassCanvasWheel(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      [
        "[data-wheel-scope='local']",
        "[contenteditable='true']",
        "[role='slider']",
        ".panel-popover",
        ".material-panel",
        ".asset-library-panel",
        ".top-bar",
        ".top-actions",
        ".left-rail",
        ".agent-dock",
        ".prompt-panel",
        ".asset-shelf",
        ".media-edit-toolbar",
        ".media-tool-menu",
        ".media-customize-dialog",
        ".agent-panel",
        ".agent-history-menu",
        ".agent-model-menu",
        ".profile-menu",
        ".profile-help-flyout-panel",
        ".canvas-tools",
        ".canvas-tool-popover",
        ".toolbar-dropdown",
        ".selection-toolbar",
        ".group-toolbar",
        ".connection-create-menu",
        ".node-create-menu",
        ".confirm-dialog",
        "input",
        "textarea",
        "select",
        "button",
        "audio",
        "video",
      ].join(", "),
    ),
  );
}

function getNormalizedWheelDeltaY(event) {
  const unit = event.deltaMode === 1
    ? 16
    : event.deltaMode === 2
      ? Math.max(shell.clientHeight || window.innerHeight || 1, 1)
      : 1;
  return event.deltaY * unit;
}

function beginPan(event) {
  canvasPointerInteractionController.beginPan(event, shell);
}

function beginMarquee(event) {
  canvasPointerInteractionController.beginMarquee(event, shell);
}

function beginSelectionFrameDrag(event) {
  const selectedNodes = getSelectedNodes();
  if (selectedNodes.length < 2 || getExactSelectionGroup(selectedNodes)) return false;
  const activeId = selectedNodes.some((node) => node.id === state.activeId)
    ? state.activeId
    : selectedNodes[0].id;
  const result = canvasNodePointerController.handlePointerDown(event, activeId, {
    interactionSource: "selection-frame",
  });
  if (result !== "drag-candidate" || !isSelectionFrameDragAction()) return false;
  shell.classList.remove("selection-frame-hover");
  shell.classList.add("selection-frame-pressed");
  return true;
}

function beginMinimapDrag(event) {
  if (!minimapSurface) return;
  const metrics = getMinimapMetrics();
  if (!metrics) return;
  event.preventDefault();
  event.stopPropagation();

  const pointerWorld = minimapPointToWorld(event, metrics);
  const viewport = getViewportWorldBounds();
  const viewportCenter = {
    x: (viewport.left + viewport.right) / 2,
    y: (viewport.top + viewport.bottom) / 2,
  };
  const isDraggingViewport = event.target instanceof Element && Boolean(event.target.closest("[data-minimap-view]"));

  state.action = {
    type: "minimap-drag",
    pointerId: event.pointerId,
    metrics,
    offsetX: isDraggingViewport ? viewportCenter.x - pointerWorld.x : 0,
    offsetY: isDraggingViewport ? viewportCenter.y - pointerWorld.y : 0,
    captureTarget: minimapSurface,
  };
  minimapSurface.setPointerCapture?.(event.pointerId);
  moveMinimapDrag(event);
}

function moveMinimapDrag(event) {
  const action = state.action;
  if (action?.type !== "minimap-drag") return;
  event.preventDefault();
  const pointerWorld = minimapPointToWorld(event, action.metrics);
  centerCanvasOnWorld(pointerWorld.x + action.offsetX, pointerWorld.y + action.offsetY);
}

const canvasNodeDragController = canvasNodeDragControllerFactory.createCanvasNodeDragController({
  interaction: canvasNodeInteraction,
  getScale: () => state.scale,
  getNode: (nodeId) => state.nodes.find((node) => node.id === nodeId),
  cloneNode,
  addNodes: (nodes) => state.nodes.push(...nodes),
  selectNodes: setSelection,
  promoteNodes: bringNodesToFront,
  setAction: (action) => {
    state.action = action;
  },
  setDragging: (dragging) => shell.classList.toggle("dragging", dragging),
  applyNodePosition: (position) => {
    const node = state.nodes.find((item) => item.id === position.id);
    if (!node) return;
    node.x = position.x;
    node.y = position.y;
    const nodeElement = nodeLayer.querySelector(`[data-id="${node.id}"]`);
    if (nodeElement) {
      nodeElement.style.left = `${node.x}px`;
      nodeElement.style.top = `${node.y}px`;
      nodeElement.style.zIndex = String(node.z);
    }
  },
  renderMovement: () => {
    renderConnections();
    renderSelectionToolbar();
    renderMinimap();
  },
  updateGroupMembership: updateDraggedNodeGroupMembership,
  pushUndoAction,
  render,
});

const canvasGroupInteractionController = canvasGroupInteractionControllerFactory.createCanvasGroupInteractionController({
  getScale: () => state.scale,
  getGroup: getGroupById,
  getGroupBounds,
  getGroupNodes,
  getGroupSnapshots: () => state.groups.map((group) => cloneGroupState(group)),
  setActiveGroup,
  setAction: (action) => {
    state.action = action;
  },
  setDragging: (dragging) => shell.classList.toggle("dragging", dragging),
  capturePointer: (target, pointerId) => target.setPointerCapture(pointerId),
  applyGroupFrame: (groupId, frame) => {
    const group = getGroupById(groupId);
    if (group) Object.assign(group, frame);
  },
  applyNodePosition: (nodeId, position) => {
    const node = state.nodes.find((item) => item.id === nodeId);
    if (node) Object.assign(node, position);
  },
  minWidth: groupFrameRules.minWidth,
  minHeight: groupFrameRules.minHeight,
  pushUndoAction,
  render,
});

const canvasPointerInteractionController = canvasPointerInteractionControllerFactory.createCanvasPointerInteractionController({
  interaction: canvasNodeInteraction,
  requestFrame: (callback) => window.requestAnimationFrame(callback),
  cancelFrame: (frameId) => window.cancelAnimationFrame(frameId),
  getAction: () => state.action,
  getViewport: () => ({ tx: state.tx, ty: state.ty }),
  setAction: (action) => {
    state.action = action;
  },
  setDragging: (dragging) => shell.classList.toggle("dragging", dragging),
  capturePointer: (target, pointer) => {
    try {
      target.setPointerCapture(pointer.pointerId);
    } catch {
      try {
        pointer.currentTarget?.setPointerCapture?.(pointer.pointerId);
      } catch {
        // Synthetic pointer events and some browsers cannot always capture here.
      }
    }
  },
  applyViewport: ({ tx, ty }) => {
    state.tx = tx;
    state.ty = ty;
    applyTransform();
  },
  getShellRect: () => shell.getBoundingClientRect(),
  getSelection: () => state.selectedIds,
  getNodes: () => state.nodes,
  getNodeBounds,
  screenToWorld,
  showMarquee: (rect) => {
    selectionBox.style.left = `${rect.left}px`;
    selectionBox.style.top = `${rect.top}px`;
    selectionBox.style.width = `${rect.width}px`;
    selectionBox.style.height = `${rect.height}px`;
    selectionBox.classList.remove("hidden");
  },
  hideMarquee: () => selectionBox.classList.add("hidden"),
  setSelection,
  clearSelection,
  collapseGeneratorPanels: collapseAllGeneratorPanels,
  render,
});

const canvasPointerDispatchController = canvasPointerDispatchControllerFactory.createCanvasPointerDispatchController({
  getAction: () => state.action,
  schedule: (action, pointer, move) => canvasPointerInteractionController.schedule(action, pointer, move),
  flush: (action, pointer, move) => canvasPointerInteractionController.flush(action, pointer, move),
  hasCrossedDragThreshold: canvasNodeInteraction.hasCrossedDragThreshold,
  moveConnection: (_action, pointer) => moveConnectionDrag(pointer),
  finishConnection: finishConnectionDrag,
  promoteNodeDrag: promoteDragCandidate,
  promoteGroupDrag,
  moveGroup: moveGroupNodes,
  resizeGroup: resizeGroupFrame,
  moveNodes: moveDraggedNodes,
  moveMarquee: moveMarqueeSelection,
  movePan: moveCanvasPan,
  moveMinimap: moveMinimapDrag,
  resizeAssetLibrary: setAssetLibraryWidth,
  resizeAgent: setAgentWidth,
  resizeAgentTop: setAgentTopInset,
  resizeAgentBottom: setAgentBottomInset,
  finishMarquee: (action) => canvasPointerInteractionController.finishMarquee(action),
  finishNodeDrag: (action, options) => canvasNodeDragController.finish(action, options),
  finishNodeClick: (action, _pointer, options = {}) => {
    if (options.cancelled) return;
    const node = state.nodes.find((item) => item.id === action.activeId);
    const canReveal = node && state.selectedIds.has(node.id) && state.selectedIds.size === 1;
    state.mediaToolbarNodeId = canReveal && action.revealMediaToolbar ? node.id : null;
    if (canReveal && action.revealGeneratorPanel) {
      node.expanded = true;
      node.panel = null;
      rememberPreset(node);
    }
    render();
  },
  finishGroup: (action, options = {}) => {
    if (!options.cancelled && action.type === "resize-group" && action.moved) {
      reconcileGroupFrameMembership(action.groupId);
    }
    canvasGroupInteractionController.finish(action, options);
  },
  finishAssetLibraryResize,
  clearAction: () => {
    state.action = null;
    if (groupResizeOverlay) delete groupResizeOverlay.dataset.activeResize;
    agentDock?.classList.remove("resizing-vertical");
    shell.classList.remove("selection-frame-pressed");
  },
  setDragging: (dragging) => shell.classList.toggle("dragging", dragging),
  releasePointer: (target, pointer) => {
    try {
      (target || shell).releasePointerCapture(pointer.pointerId);
    } catch {
      // Pointer capture may already be released by the browser.
    }
  },
  isCanvasSurface,
  isSelectionFrameDragTarget,
  beginSelectionFrameDrag,
  closeConnectionCreateMenu: closeCanvasCreateMenus,
  isSpaceDown: () => state.isSpaceDown,
  beginPan,
  getActiveNode,
  closeNodePanel: (node) => {
    node.panel = null;
  },
  beginMarquee,
  render,
});

function promoteDragCandidate(action, event) {
  return canvasNodeDragController.promote(action, event);
}

function moveDraggedNodes(action, event) {
  canvasNodeDragController.move(action, event);
}

function promoteGroupDrag(action, event) {
  return canvasGroupInteractionController.promoteDrag(action, event);
}

function moveGroupNodes(action, event) {
  canvasGroupInteractionController.move(action, event);
}

function moveCanvasPan(action, event) {
  canvasPointerInteractionController.movePan(action, event);
}

function moveMarqueeSelection(action, event) {
  canvasPointerInteractionController.moveMarquee(action, event);
}

function resizeGroupFrame(action, event) {
  canvasGroupInteractionController.resize(action, event);
}

function removeNodeFromGroup(node, groupId) {
  const group = getGroupById(groupId);
  if (group) {
    group.nodeIds = group.nodeIds.filter((id) => id !== node.id);
  }
  if (node.groupId === groupId) {
    delete node.groupId;
  }
}

function addNodeToGroup(node, groupId) {
  const group = getGroupById(groupId);
  if (!group) return;
  if (node.groupId && node.groupId !== groupId) {
    removeNodeFromGroup(node, node.groupId);
  }
  node.groupId = groupId;
  if (!group.nodeIds.includes(node.id)) {
    group.nodeIds.push(node.id);
  }
}

function findGroupForNode(node) {
  const groupId = canvasSpatialSelection.resolveNodeGroup({
    nodeBounds: getNodeMembershipBounds(node),
    currentGroupId: node.groupId || null,
    groups: state.groups.map((group) => ({ id: group.id, bounds: getGroupBounds(group) })),
  });
  return getGroupById(groupId);
}

function updateDraggedNodeGroupMembership(ids) {
  let changed = false;
  for (const id of ids) {
    const node = state.nodes.find((item) => item.id === id);
    if (!node) continue;
    const targetGroup = findGroupForNode(node);
    if (targetGroup?.id === node.groupId) continue;

    if (node.groupId) {
      removeNodeFromGroup(node, node.groupId);
      changed = true;
    }
    if (targetGroup) {
      addNodeToGroup(node, targetGroup.id);
      changed = true;
    }
  }
  if (changed) syncGroups();
  return changed;
}

function reconcileGroupFrameMembership(groupId) {
  const group = getGroupById(groupId);
  const bounds = getGroupBounds(group);
  if (!group || !bounds) return false;
  let changed = false;
  for (const node of state.nodes) {
    if (node.groupId && node.groupId !== groupId) continue;
    const nextGroupId = canvasSpatialSelection.resolveNodeGroup({
      nodeBounds: getNodeMembershipBounds(node),
      currentGroupId: node.groupId || null,
      groups: [{ id: groupId, bounds }],
    });
    if (nextGroupId === node.groupId) continue;
    if (node.groupId === groupId) {
      removeNodeFromGroup(node, groupId);
      changed = true;
    } else if (!node.groupId && nextGroupId === groupId) {
      addNodeToGroup(node, groupId);
      changed = true;
    }
  }
  if (changed) syncGroups();
  return changed;
}

function handlePointerMove(event) {
  canvasPointerDispatchController.handleMove(event);
  syncSelectionFramePointerFeedback(event);
}

function finishPointerInteraction(event) {
  canvasPointerDispatchController.finish(event);
  syncSelectionFramePointerFeedback(event);
}

shell.addEventListener("pointerdown", (event) => {
  if (event.target instanceof Element && event.target.closest('[data-action="aspect"]')) return;
  canvasNodeLayoutTransition.finishAll();
}, true);

shell.addEventListener("pointerdown", (event) => {
  canvasPointerDispatchController.handleSurfacePointerDown(event);
});

window.addEventListener("pointermove", handlePointerMove);
shell.addEventListener("pointerup", finishPointerInteraction);
window.addEventListener("pointerup", finishPointerInteraction);
window.addEventListener("pointercancel", finishPointerInteraction);

shell.addEventListener("dblclick", (event) => {
  if (event.target instanceof Element && event.target.closest(".canvas-node, .connection-create-menu, .node-create-menu")) return;
  event.preventDefault();
  window.getSelection()?.removeAllRanges();
  openNodeCreateMenu(event.clientX, event.clientY);
});

nodeCreateMenu?.addEventListener("pointerdown", (event) => {
  event.stopPropagation();
});

nodeCreateMenu?.addEventListener("pointerover", (event) => {
  const button = event.target instanceof Element ? event.target.closest("[data-node-create]") : null;
  if (button) setNodeCreatePreview(button);
});

nodeCreateMenu?.addEventListener("pointerleave", () => {
  setNodeCreatePreview(nodeCreateMenu.querySelector("[data-node-create]"));
});

nodeCreateMenu?.addEventListener("focusin", (event) => {
  const button = event.target instanceof Element ? event.target.closest("[data-node-create]") : null;
  if (button) setNodeCreatePreview(button);
});

nodeCreateMenu?.addEventListener("keydown", (event) => {
  const buttons = [...nodeCreateMenu.querySelectorAll("[data-node-create]")];
  if (!buttons.length) return;
  const currentIndex = buttons.findIndex((button) => button.classList.contains("is-preview"));
  let nextIndex = currentIndex < 0 ? 0 : currentIndex;

  if (event.key === "ArrowDown") nextIndex = (nextIndex + 1) % buttons.length;
  else if (event.key === "ArrowUp") nextIndex = (nextIndex - 1 + buttons.length) % buttons.length;
  else if (event.key === "Home") nextIndex = 0;
  else if (event.key === "End") nextIndex = buttons.length - 1;
  else if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    event.stopPropagation();
    buttons[nextIndex].click();
    return;
  } else {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  setNodeCreatePreview(buttons[nextIndex]);
  buttons[nextIndex].focus({ preventScroll: true });
});

nodeCreateMenu?.addEventListener("click", (event) => {
  const button = event.target instanceof Element ? event.target.closest("[data-node-create]") : null;
  const point = state.nodeCreatePoint;
  if (!button || !point) return;
  event.preventDefault();
  event.stopPropagation();

  if (button.dataset.nodeCreate === "upload") {
    state.pendingUploadNodeId = null;
    state.pendingCanvasUploadPoint = point;
    localAssetInput.value = "";
    closeNodeCreateMenu({ keepUploadPoint: true });
    localAssetInput.click();
    return;
  }

  const mode = button.dataset.nodeCreate === "video" ? "video" : "image";
  closeNodeCreateMenu();
  addNodeAt(point.clientX, point.clientY, mode, { useLastPreset: false });
});

document.addEventListener("pointerdown", (event) => {
  if (nodeCreateMenu?.classList.contains("hidden")) return;
  if (event.target instanceof Element && event.target.closest("#nodeCreateMenu")) return;
  closeNodeCreateMenu();
});

connectionCreateMenu?.addEventListener("pointerdown", (event) => {
  event.stopPropagation();
});

connectionCreateMenu?.addEventListener("pointerover", (event) => {
  const button = event.target instanceof Element ? event.target.closest("[data-connection-create]") : null;
  if (button) setConnectionCreatePreview(button);
});

connectionCreateMenu?.addEventListener("pointerleave", () => {
  setConnectionCreatePreview(connectionCreateMenu.querySelector("[data-connection-create]"));
});

connectionCreateMenu?.addEventListener("focusin", (event) => {
  const button = event.target instanceof Element ? event.target.closest("[data-connection-create]") : null;
  if (button) setConnectionCreatePreview(button);
});

connectionCreateMenu?.addEventListener("keydown", (event) => {
  const buttons = [...connectionCreateMenu.querySelectorAll("[data-connection-create]")];
  if (!buttons.length) return;
  const currentIndex = buttons.findIndex((button) => button.classList.contains("is-preview"));
  let nextIndex = currentIndex < 0 ? 0 : currentIndex;

  if (event.key === "ArrowDown") nextIndex = (nextIndex + 1) % buttons.length;
  else if (event.key === "ArrowUp") nextIndex = (nextIndex - 1 + buttons.length) % buttons.length;
  else if (event.key === "Home") nextIndex = 0;
  else if (event.key === "End") nextIndex = buttons.length - 1;
  else if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    event.stopPropagation();
    buttons[nextIndex].click();
    return;
  } else {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  setConnectionCreatePreview(buttons[nextIndex]);
  buttons[nextIndex].focus({ preventScroll: true });
});

connectionCreateMenu?.addEventListener("click", (event) => {
  const button = event.target instanceof Element ? event.target.closest("[data-connection-create]") : null;
  const drop = state.connectionDrop;
  if (!button || !drop) return;
  event.preventDefault();
  event.stopPropagation();
  const mode = button.dataset.connectionCreate === "video" ? "video" : "image";
  if (drop.kind === "selection") {
    const node = addNodeAt(drop.clientX, drop.clientY, mode, {
      useLastPreset: false,
      anchor: "input",
    });
    closeConnectionCreateMenu();
    if (!node) return;
    const result = createConnectionsBatch(drop.originNodeIds, node.id);
    node.expanded = true;
    setSelection([node.id], node.id, { keepConnection: true });
    render();
    if (result.rejected.length) {
      showActionToast(`已连接 ${result.created.length} 个来源，跳过 ${result.rejected.length} 个无效连接`);
    }
    return;
  }
  const originNodeId = drop.originNodeId;
  const node = addNodeAt(drop.clientX, drop.clientY, mode, {
    useLastPreset: false,
    anchor: drop.originSide === "input" ? "output" : "input",
  });
  closeConnectionCreateMenu();
  if (!node) return;
  if (drop.originSide === "input") {
    createConnection(node.id, originNodeId, {
      sourceRatio: 0.5,
      targetRatio: drop.originRatio,
      feedbackDirection: "reverse",
    });
  } else {
    createConnection(originNodeId, node.id, {
      sourceRatio: drop.originRatio,
      targetRatio: 0.5,
      feedbackDirection: "forward",
    });
  }
  node.expanded = true;
  setSelection([node.id], node.id, { keepConnection: true });
  render();
});

window.addEventListener(
  "wheel",
  (event) => {
    if (event.ctrlKey || event.metaKey) event.preventDefault();
  },
  { passive: false, capture: true },
);

shell.addEventListener(
  "wheel",
  (event) => {
    const shouldBypass = shouldBypassCanvasWheel(event.target);
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      if (shouldBypass) return;
      const deltaY = getNormalizedWheelDeltaY(event);
      if (Math.abs(deltaY) < 0.5) return;
      const zoomFactor = Math.exp(-clamp(deltaY, -120, 120) * 0.0008);
      setCanvasZoom(state.scale * zoomFactor, event.clientX, event.clientY);
      return;
    }
    if (shouldBypass) return;
    event.preventDefault();

    const horizontalDelta = event.shiftKey && Math.abs(event.deltaX) < 1 ? event.deltaY : event.deltaX;
    const verticalDelta = event.shiftKey && Math.abs(event.deltaX) < 1 ? 0 : event.deltaY;
    state.tx -= horizontalDelta;
    state.ty -= verticalDelta;
    applyTransform();
  },
  { passive: false },
);

window.addEventListener("keydown", (event) => {
  if (document.querySelector(".confirm-layer")) return;
  if (state.entityUsePickerTargetNodeId) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeEntityUsePicker();
    }
    return;
  }
  if (event.key === "Escape" && state.entityUseDetailPinned) {
    event.preventDefault();
    closeEntityUseDetail({ restoreFocus: true });
    return;
  }
  if (canvasEntityEditor.isOpen()) return;
  const target = event.target;
  const isTyping = target instanceof Element && target.closest("input, textarea, [contenteditable='true']");
  if (isTyping) return;
  if (event.key === "Escape" && state.libraryDirectoryMenuOpen && isAssetLibraryOpen()) {
    event.preventDefault();
    setAssetLibraryDirectoryMenuOpen(false);
    renderAssetLibrary();
    assetLibraryDirectoryButton?.focus({ preventScroll: true });
    return;
  }
  if (event.key === "Escape" && (state.libraryMoveItems.length || state.libraryMoveFolderId)) {
    event.preventDefault();
    state.libraryMoveItems = [];
    state.libraryMoveFolderId = null;
    renderAssetLibrary();
    return;
  }
  if (event.key === "Escape" && (state.libraryToolbarMenu || state.libraryMenuTarget) && isAssetLibraryOpen()) {
    event.preventDefault();
    state.libraryToolbarMenu = null;
    state.libraryMenuTarget = null;
    renderAssetLibrary();
    return;
  }
  if (event.key === "Escape" && state.librarySelectionMode && isAssetLibraryOpen()) {
    event.preventDefault();
    clearAssetLibrarySelection();
    renderAssetLibrary();
    return;
  }
  if (event.key === "Escape" && !nodeCreateMenu?.classList.contains("hidden")) {
    event.preventDefault();
    closeNodeCreateMenu();
    return;
  }
  if (event.key === "Escape" && !connectionCreateMenu?.classList.contains("hidden")) {
    event.preventDefault();
    closeConnectionCreateMenu();
    return;
  }
  if (event.key === "Escape" && !selectionDownloadMenu?.classList.contains("hidden")) {
    event.preventDefault();
    setSelectionDownloadMenuOpen(false);
    selectionDownloadTrigger?.focus({ preventScroll: true });
    return;
  }
  if (event.key === "Escape") {
    const openNodePanel = state.nodes.find((node) => node.kind === "generator" && node.panel);
    if (openNodePanel) {
      event.preventDefault();
      openNodePanel.panel = null;
      render();
      return;
    }
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    undoLastAction();
    return;
  }

  if (event.code === "Space") {
    state.isSpaceDown = true;
    shell.classList.add("space-pan");
  }

  if ((event.key === "Delete" || event.key === "Backspace") && state.activeConnectionId && !state.selectedIds.size && !state.activeGroupId) {
    event.preventDefault();
    removeConnection(state.activeConnectionId);
    return;
  }

  if ((event.key === "Delete" || event.key === "Backspace") && (state.selectedIds.size || state.activeGroupId)) {
    event.preventDefault();
    deleteSelectedNodes();
  }
});

window.addEventListener("keyup", (event) => {
  if (event.code !== "Space") return;
  state.isSpaceDown = false;
  shell.classList.remove("space-pan");
});

document.addEventListener("dragstart", (event) => {
  if (event.target instanceof Element && event.target.closest(".canvas-node")) {
    event.preventDefault();
  }
});

localAssetInput.addEventListener("change", (event) => {
  const files = event.currentTarget.files || [];
  const node = state.nodes.find((item) => item.id === state.pendingUploadNodeId);
  const canvasPoint = state.pendingCanvasUploadPoint;
  if (node) {
    void addFilesToGeneratorNode(node, files);
  } else if (canvasPoint && files.length) {
    void addMediaNodesFromFiles(files, canvasPoint.clientX, canvasPoint.clientY);
  }
  state.pendingUploadNodeId = null;
  state.pendingCanvasUploadPoint = null;
});

window.addEventListener("dragover", (event) => {
  if (!hasDraggedFiles(event) && !hasDraggedLibraryAsset(event)) return;
  event.preventDefault();
  if (!isCanvasDropTarget(event.target)) {
    if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
    shell.classList.remove("file-dragging");
    return;
  }
  shell.classList.add("file-dragging");
});

window.addEventListener("dragleave", (event) => {
  if (event.clientX !== 0 && event.clientY !== 0) return;
  shell.classList.remove("file-dragging");
});

window.addEventListener("drop", (event) => {
  const hasSupportedPayload = hasDraggedFiles(event) || hasDraggedLibraryAsset(event);
  if (hasSupportedPayload && !isCanvasDropTarget(event.target)) {
    event.preventDefault();
    shell.classList.remove("file-dragging");
    return;
  }
  const libraryAssetId = event.dataTransfer?.getData("application/x-reelay-asset");
  if (libraryAssetId) {
    event.preventDefault();
    shell.classList.remove("file-dragging");
    const sourceAsset = findLibraryAsset(libraryAssetId);
    const targetNode = getNodeFromElement(event.target);
    if (targetNode?.kind === "generator") {
      addAssetToGeneratorNode(targetNode, sourceAsset);
    } else {
      addLibraryAssetToCanvas(sourceAsset, event.clientX, event.clientY);
    }
    return;
  }

  const files = event.dataTransfer?.files;
  if (!files?.length) return;
  event.preventDefault();
  shell.classList.remove("file-dragging");

  const targetNode = getNodeFromElement(event.target);
  if (targetNode?.kind === "generator") {
    void addFilesToGeneratorNode(targetNode, files);
    return;
  }

  void addMediaNodesFromFiles(files, event.clientX, event.clientY);
});

function setAssetLibrarySelectionMode(enabled) {
  closeEntityUseDetail();
  state.librarySelectionMode = Boolean(enabled);
  state.librarySelectedIds.clear();
  state.libraryToolbarMenu = null;
  state.libraryMenuTarget = null;
  state.libraryMoveItems = [];
  state.libraryMoveFolderId = null;
  renderAssetLibrary();
}

function toggleAssetLibrarySelection(id) {
  if (!state.librarySelectionMode) return;
  if (state.librarySelectedIds.has(id)) state.librarySelectedIds.delete(id);
  else state.librarySelectedIds.add(id);
  state.libraryToolbarMenu = null;
  renderAssetLibrary();
}

function selectAllVisibleAssetLibraryItems() {
  const { items } = getVisibleAssetLibraryContent();
  const allSelected = items.length > 0 && items.every((item) => state.librarySelectedIds.has(item.id));
  state.librarySelectedIds.clear();
  if (!allSelected) items.forEach((item) => state.librarySelectedIds.add(item.id));
  renderAssetLibrary();
}

function startAssetLibraryRename(kind, id) {
  if (!isAssetLibraryMutable()) return;
  if (kind === "entity" && !canPersistLibraryEntities()) return;
  state.libraryRenameTarget = { kind, id };
  state.libraryMenuTarget = null;
  state.libraryToolbarMenu = null;
  renderAssetLibrary();
}

async function finishAssetLibraryRename(input, { cancel = false } = {}) {
  const target = state.libraryRenameTarget;
  if (!target) return;
  state.libraryRenameTarget = null;
  if (cancel) {
    renderAssetLibrary();
    return;
  }
  const name = String(input?.value || "").trim();
  if (!name) {
    showActionToast("名称不能为空");
    renderAssetLibrary();
    return;
  }
  try {
    if (target.kind === "folder") {
      assetLibraryStore.renameFolder({ folderId: target.id, name, space: state.librarySpace });
    } else if (target.kind === "entity" && window.parent !== window) {
      const entity = assetLibraryStore.getEntity({ kind: "entity", id: target.id });
      if (!entity || !Number.isInteger(entity.version) || !canPersistLibraryEntities()) {
        throw new Error("当前主体尚未接入持久化重命名");
      }
      const updated = await canvasEntityAssets.updateEntity({
        entityId: entity.id,
        expectedVersion: entity.version,
        name,
        description: entity.description || "",
        mediaRefs: entity.mediaRefs,
        coverMediaId: entity.coverMediaId || null,
      });
      syncHostEntity(updated);
    } else {
      assetLibraryStore.renameItem({ item: getAssetLibraryItemRef(target.id, target.kind), name, space: state.librarySpace });
    }
  } catch (error) {
    showActionToast(error?.message || "重命名失败");
  }
  renderAssetLibrary();
}

function createAssetLibraryFolder() {
  if (!isAssetLibraryMutable()) return;
  if (getAssetLibraryFolderPath().length + 1 >= canvasAssetLibraryModel.MAX_DIRECTORY_LEVELS) {
    showActionToast(`最多支持 ${canvasAssetLibraryModel.MAX_DIRECTORY_LEVELS} 层目录`);
    return;
  }
  const siblingNames = new Set(
    assetLibraryStore.listFolders({
      space: state.librarySpace,
      kind: state.librarySection,
      parentId: state.libraryFolderId,
    }).map((folder) => canvasAssetLibraryModel.normalizeSearch(folder.name)),
  );
  let sequence = 1;
  let name = "新建文件夹";
  while (siblingNames.has(canvasAssetLibraryModel.normalizeSearch(name))) {
    sequence += 1;
    name = `新建文件夹 ${sequence}`;
  }
  try {
    const folder = assetLibraryStore.createFolder({
      id: crypto.randomUUID(),
      name,
      space: state.librarySpace,
      kind: state.librarySection,
      parentId: state.libraryFolderId,
    });
    if (state.libraryFolderId) state.libraryExpandedFolderIds.add(state.libraryFolderId);
    else state.libraryDirectoryRootExpanded = true;
    state.libraryDirectoryMenuOpen = false;
    state.librarySearch = "";
    state.librarySearchByContext[getAssetLibraryContextKey()] = "";
    clearAssetLibrarySelection();
    state.libraryRenameTarget = { kind: "folder", id: folder.id };
  } catch (error) {
    showActionToast(error?.message || "新建文件夹失败");
  }
  renderAssetLibrary();
}

function projectAssetToLibraryMedia(projectAsset) {
  const contentUrl = new URL(projectAsset.contentUrl, window.location.href);
  if (contentUrl.origin !== window.location.origin) throw new Error("资产内容地址不属于当前 Reelay 服务");
  const url = sanitizeRuntimeMediaUrl(contentUrl.href);
  if (!url) throw new Error("资产内容地址无效");
  return {
    id: projectAsset.assetId,
    workspaceAssetId: projectAsset.assetId,
    projectAssetReferenceId: projectAsset.referenceId,
    librarySourceId: projectAsset.assetId,
    assetVersion: projectAsset.assetVersion,
    mediaKind: projectAsset.mediaKind,
    type: projectAsset.mediaKind,
    name: projectAsset.displayName,
    displayName: projectAsset.displayName,
    contentType: projectAsset.contentType,
    byteSize: projectAsset.byteSize,
    checksumSha256: projectAsset.checksumSha256,
    url,
    source: "workspace",
  };
}

function workspaceAssetToLibraryMedia(workspaceAsset) {
  const contentUrl = new URL(workspaceAsset.contentUrl, window.location.href);
  if (contentUrl.origin !== window.location.origin) throw new Error("资产内容地址不属于当前 Reelay 服务");
  const url = sanitizeRuntimeMediaUrl(contentUrl.href);
  if (!url) throw new Error("资产内容地址无效");
  return {
    id: workspaceAsset.assetId,
    workspaceAssetId: workspaceAsset.assetId,
    librarySourceId: workspaceAsset.assetId,
    assetVersion: workspaceAsset.assetVersion,
    mediaKind: workspaceAsset.mediaKind,
    type: workspaceAsset.mediaKind,
    name: workspaceAsset.displayName,
    displayName: workspaceAsset.displayName,
    contentType: workspaceAsset.contentType,
    byteSize: workspaceAsset.byteSize,
    checksumSha256: workspaceAsset.checksumSha256,
    url,
    source: "workspace",
  };
}

function registerHostWorkspaceAssetCatalog({ assets = [], entities = [] } = {}) {
  try {
    const media = assets.map(workspaceAssetToLibraryMedia);
    media.forEach((asset) => {
      assetLibraryStore.registerMedia({ media: asset, space: "personal", folderId: null });
      hydrateAssetMetadata(asset, null);
    });
    assetLibraryStore.syncPersistedEntities({ entities });
    hostPersonalMediaIds.clear();
    media.forEach((asset) => hostPersonalMediaIds.add(asset.id));
    renderAssetLibrary();
  } catch (error) {
    showActionToast(error?.message || "个人资产目录同步失败");
  }
}

function syncHostEntity(entity) {
  const result = assetLibraryStore.registerPersistedEntity({ entity });
  renderAssetLibrary();
  return result.entity;
}

async function persistEntityEditorFiles(files) {
  const accepted = Array.from(files || [])
    .map((file) => ({ file, mediaKind: getAssetType(file) }))
    .filter((entry) => entry.mediaKind);
  if (!accepted.length) throw new Error("请选择图片、视频或音频文件");
  if (!canPersistLibraryMedia()) {
    throw new Error("当前项目尚未接入素材持久化");
  }
  const media = window.parent === window
    ? createAssetsFromFiles(accepted.map((entry) => entry.file)).map((asset) => ({
        ...asset,
        displayName: asset.name || asset.displayName,
      }))
    : await Promise.all(accepted.map(async ({ file, mediaKind }) => {
        const workspaceAsset = await canvasMediaAssets.persistFile(file, {
          target: "personal",
          mediaKind,
          displayName: fileDisplayName(file.name, assetTypeLabel(mediaKind)),
          contentType: file.type || defaultUploadContentType(mediaKind),
        });
        return workspaceAssetToLibraryMedia(workspaceAsset);
      }));
  const registered = media.map((asset) => assetLibraryStore.registerMedia({
    media: asset,
    space: "personal",
    folderId: null,
  }).media);
  registered.forEach((asset) => hostPersonalMediaIds.add(asset.id));
  registered.forEach((asset) => hydrateAssetMetadata(asset, null));
  renderAssetLibrary();
  return registered;
}

async function saveEntityEditorDraft(payload) {
  if (window.parent !== window) {
    if (!canPersistLibraryEntities()) {
      throw new Error("当前项目尚未接入主体持久化");
    }
    return payload.mode === "edit"
      ? canvasEntityAssets.updateEntity(payload)
      : canvasEntityAssets.createEntity(payload);
  }
  if (payload.mode === "create") {
    return assetLibraryStore.registerPersistedEntity({
      entity: {
        id: crypto.randomUUID(),
        name: payload.name,
        description: payload.description,
        mediaRefs: payload.mediaRefs,
        coverMediaId: payload.coverMediaId,
        version: 1,
      },
    }).entity;
  }
  const updated = assetLibraryStore.updateEntity({
    entityId: payload.entityId,
    expectedVersion: payload.expectedVersion,
    name: payload.name,
    description: payload.description,
    mediaRefs: payload.mediaRefs,
    coverMediaId: payload.coverMediaId,
  });
  return updated?.entity || updated;
}

function confirmEntityEditorDiscard() {
  return new Promise((resolve) => {
    showConfirmDialog({
      title: "放弃未保存的修改？",
      body: "主体名称、描述和素材调整都不会保留。",
      confirmText: "放弃修改",
      danger: true,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
}

function setEntityEditorOpen(open) {
  document.body.classList.toggle("entity-editor-open", open);
  if (open) {
    closeAssetLibrary();
    setAgentOpen(false);
    closeProfileMenu();
    closeProjectMenus();
    if (topBar) topBar.inert = true;
    shell?.setAttribute("inert", "");
    shell?.setAttribute("aria-hidden", "true");
    if (leftRail) {
      leftRail.inert = true;
      leftRail.setAttribute("aria-hidden", "true");
    }
    if (topActions) {
      topActions.inert = true;
      topActions.setAttribute("aria-hidden", "true");
    }
    return;
  }
  if (topBar) topBar.inert = false;
  shell?.removeAttribute("inert");
  shell?.removeAttribute("aria-hidden");
  if (topActions) {
    topActions.inert = false;
    topActions.removeAttribute("aria-hidden");
  }
  const shouldReopenLibrary = reopenAssetLibraryAfterEntityEditor;
  reopenAssetLibraryAfterEntityEditor = false;
  if (shouldReopenLibrary) {
    state.librarySpace = "personal";
    state.librarySection = "entity";
    state.libraryFolderId = null;
    openAssetLibrary();
  } else if (leftRail) {
    leftRail.inert = false;
    leftRail.removeAttribute("aria-hidden");
  }
}

function openEntityEditorCreate() {
  if (state.librarySpace !== "personal" || !isAssetLibraryMutable()) {
    showActionToast("首个主体切片仅支持个人空间");
    return;
  }
  if (!canPersistLibraryEntities()) {
    showActionToast("当前项目尚未接入主体持久化");
    return;
  }
  reopenAssetLibraryAfterEntityEditor = isAssetLibraryOpen();
  canvasEntityEditor.open({
    mode: "create",
    media: [],
    mutable: true,
    canAddFromLibrary: true,
    canUpload: canPersistLibraryMedia(),
  });
}

function openEntityEditorEdit(entityId) {
  const entity = assetLibraryStore.getEntity({ kind: "entity", id: entityId });
  if (!entity) return;
  const isPersonal = assetLibraryStore.hasPlacement({ kind: "entity", id: entityId }, "personal");
  if (!isPersonal || state.librarySpace !== "personal") {
    openAssetLibraryPreview("entity", entityId);
    return;
  }
  if (!canPersistLibraryEntities()) {
    openAssetLibraryPreview("entity", entityId);
    return;
  }
  if (!Number.isInteger(entity.version)) {
    openAssetLibraryPreview("entity", entityId);
    showActionToast("示例主体仅供预览；新建主体可完整编辑");
    return;
  }
  reopenAssetLibraryAfterEntityEditor = isAssetLibraryOpen();
  canvasEntityEditor.open({
    mode: "edit",
    entity,
    media: assetLibraryStore.getEntityMedia({ kind: "entity", id: entityId }),
    expectedVersion: entity.version,
    mutable: true,
    canAddFromLibrary: true,
    canUpload: canPersistLibraryMedia(),
  });
}

function defaultUploadContentType(mediaKind) {
  if (mediaKind === "video") return "video/mp4";
  if (mediaKind === "audio") return "audio/mpeg";
  return "image/jpeg";
}

async function persistAssetLibraryFiles(files, { space = state.librarySpace, folderId = null } = {}) {
  const accepted = Array.from(files || [])
    .map((file) => ({ file, mediaKind: getAssetType(file) }))
    .filter((entry) => entry.mediaKind);
  if (!accepted.length) {
    throw new Error("请选择图片、视频或音频文件");
  }
  if (!canPersistLibraryMedia()) {
    showActionToast("当前项目尚未接入资产持久化");
    return;
  }
  if (window.parent !== window && space !== "personal") {
    throw new Error("首个持久化切片仅支持上传到个人空间");
  }
  showActionToast(`正在上传 ${accepted.length} 个素材…`);
  const settled = window.parent === window
    ? createAssetsFromFiles(accepted.map((entry) => entry.file)).map((asset) => ({
        status: "fulfilled",
        value: {
          ...asset,
          displayName: asset.name || asset.displayName,
        },
      }))
    : await Promise.allSettled(accepted.map(async ({ file, mediaKind }) => {
        const projectAsset = await canvasMediaAssets.persistFile(file, {
          mediaKind,
          displayName: fileDisplayName(file.name, assetTypeLabel(mediaKind)),
          contentType: file.type || defaultUploadContentType(mediaKind),
        });
        return projectAssetToLibraryMedia(projectAsset);
      }));
  const uploaded = settled
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
  const failures = settled.filter((result) => result.status === "rejected");
  const hydrated = await Promise.all(uploaded.map(async (asset) => ({
    ...asset,
    ...await readAssetMetadata(asset),
  })));
  const media = hydrated.map((asset) => assetLibraryStore.registerMedia({
    media: asset,
    space,
    folderId,
  }).media);
  if (window.parent !== window && space === "personal") {
    media.forEach((asset) => hostPersonalMediaIds.add(asset.id));
  }
  if (!media.length && failures.length) {
    throw failures[0].reason instanceof Error ? failures[0].reason : new Error("素材上传失败");
  }
  return { media, failedCount: failures.length };
}

async function addFilesToAssetLibrary(files) {
  if (!isAssetLibraryMutable() || state.librarySection !== "media") return;
  try {
    const { media, failedCount } = await persistAssetLibraryFiles(files, {
      space: state.librarySpace,
      folderId: state.libraryFolderId,
    });
    showActionToast(failedCount
      ? `已上传 ${media.length} 个素材，${failedCount} 个失败`
      : `已上传 ${media.length} 个素材`);
  } catch (error) {
    showActionToast(error?.message || "资产写入失败");
  }
  renderAssetLibrary();
}

function deleteAssetLibraryItems(items) {
  if (!items.length) return;
  const noun = state.librarySection === "entity" ? "主体" : "素材";
  showConfirmDialog({
    title: `删除${items.length > 1 ? ` ${items.length} 个` : ""}${noun}`,
    body: state.librarySection === "entity"
      ? "删除主体不会删除它引用的素材。"
      : "仍被主体引用的素材不会被删除。",
    confirmText: "删除",
    danger: true,
    onConfirm: () => {
      try {
        assetLibraryStore.removePlacements({ items, space: state.librarySpace });
        clearAssetLibrarySelection();
        showActionToast(`已删除 ${items.length} 个${noun}`);
      } catch (error) {
        showActionToast(error?.message || "删除失败");
      }
      renderAssetLibrary();
    },
  });
}

function addPlatformMediaToCanvas(items) {
  const assets = items.map((item) => {
    if (item.kind !== "media" || !assetLibraryStore.hasPlacement(item, "platform")) {
      throw new Error("平台批量操作仅支持当前搜索结果中的素材");
    }
    const media = assetLibraryStore.getMedia(item);
    if (!media) throw new Error(`平台素材已不可用：${item.id}`);
    return media;
  });
  if (!requireCanvasMutation()) return 0;

  const targetNode = state.nodes.find((node) => node.id === state.libraryTargetNodeId);
  if (targetNode?.kind === "generator") {
    assets.forEach((asset) => addAssetToGeneratorNode(targetNode, asset));
  } else {
    const rect = shell.getBoundingClientRect();
    const columns = Math.max(1, Math.ceil(Math.sqrt(assets.length)));
    const rows = Math.ceil(assets.length / columns);
    assets.forEach((asset, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      addLibraryAssetToCanvas(
        asset,
        rect.left + rect.width / 2 + (column - (columns - 1) / 2) * 320,
        rect.top + rect.height / 2 + (row - (rows - 1) / 2) * 240,
      );
    });
  }
  clearAssetLibrarySelection();
  showActionToast(`已添加 ${assets.length} 个平台素材到画布`);
  return assets.length;
}

function runAssetLibraryAction(action, items) {
  if (!items.length) {
    showActionToast("请先选择资产");
    return;
  }
  if (state.librarySpace === "platform") {
    state.libraryToolbarMenu = null;
    state.libraryMenuTarget = null;
    try {
      if (action === "add-canvas") {
        addPlatformMediaToCanvas(items);
      } else if (action === "save-personal") {
        showActionToast("保存平台素材到个人素材库尚未接入");
      } else {
        throw new Error("平台空间不支持此操作");
      }
    } catch (error) {
      showActionToast(error?.message || "平台素材操作失败");
    }
    renderAssetLibrary();
    return;
  }
  const includesPersistedEntity = window.parent !== window && items.some((item) => {
    if (item.kind !== "entity") return false;
    return Number.isInteger(assetLibraryStore.getEntity(item)?.version);
  });
  if (includesPersistedEntity && ["move", "share-organization", "delete"].includes(action)) {
    showActionToast("主体的移动、共享与删除将在对应持久化切片接入；本次未执行");
    return;
  }
  state.libraryToolbarMenu = null;
  state.libraryMenuTarget = null;
  try {
    if (action === "review") {
      assetLibraryStore.submitReview({ items, space: state.librarySpace, targetSpace: "platform" });
      showActionToast(`已提交 ${items.length} 项 Seedance 合规审核`);
      clearAssetLibrarySelection();
    } else if (action === "move") {
      state.libraryMoveFolderId = null;
      state.libraryMoveItems = items;
    } else if (action === "share-organization") {
      assetLibraryStore.shareToOrganization({ items, fromSpace: state.librarySpace });
      showActionToast(`已共享 ${items.length} 项到组织空间`);
      clearAssetLibrarySelection();
    } else if (action === "delete") {
      deleteAssetLibraryItems(items);
      return;
    }
  } catch (error) {
    showActionToast(error?.message || "操作失败");
  }
  renderAssetLibrary();
}

function deleteAssetLibraryFolder(folderId) {
  const folder = assetLibraryStore.getFolder(folderId);
  if (!folder) return;
  showConfirmDialog({
    title: `删除文件夹“${folder.name}”`,
    body: "该文件夹及其子目录中的资产会从当前空间移除；仍被主体引用的素材不会被误删。",
    confirmText: "删除",
    danger: true,
    onConfirm: () => {
      try {
        const result = assetLibraryStore.removeFolder({ folderId, space: state.librarySpace });
        state.libraryMenuTarget = null;
        state.libraryMoveFolderId = null;
        showActionToast(`已删除 ${result.folders.length} 个目录`);
      } catch (error) {
        showActionToast(error?.message || "删除文件夹失败");
      }
      renderAssetLibrary();
    },
  });
}

function runAssetLibraryFolderAction(action, folderId) {
  const folder = assetLibraryStore.getFolder(folderId);
  if (!folder || folder.space !== state.librarySpace || folder.kind !== state.librarySection) return;
  state.libraryToolbarMenu = null;
  state.libraryMenuTarget = null;
  if (action === "rename") {
    startAssetLibraryRename("folder", folderId);
    return;
  }
  if (action === "move") {
    state.libraryMoveItems = [];
    state.libraryMoveFolderId = folderId;
  } else if (action === "share-organization") {
    try {
      const result = assetLibraryStore.copyFolderToOrganization({
        folderId,
        fromSpace: state.librarySpace,
      });
      showActionToast(`已共享 ${result.folderCount} 个目录和 ${result.itemCount} 项资产到组织空间`);
    } catch (error) {
      showActionToast(error?.message || "共享文件夹失败");
    }
  } else if (action === "delete") {
    deleteAssetLibraryFolder(folderId);
    return;
  }
  renderAssetLibrary();
}

railLibraryBtn?.addEventListener("click", (event) => {
  if (assetLibraryPanel?.classList.contains("hidden")) {
    openAssetLibrary(null, { focus: event.detail === 0 });
  } else {
    closeAssetLibrary();
  }
});

assetLibraryCloseBtn?.addEventListener("click", closeAssetLibrary);
assetLibraryResizeHandle?.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  closeEntityUseDetail();
  event.preventDefault();
  event.stopPropagation();
  state.action = {
    type: "resize-asset-library",
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startWidth: assetLibraryPanel?.getBoundingClientRect().width || state.assetLibraryWidth,
    captureTarget: assetLibraryResizeHandle,
  };
  assetLibraryPanel?.classList.add("resizing");
  assetLibraryResizeHandle.setPointerCapture(event.pointerId);
});
assetLibraryResizeHandle?.addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const bounds = getAssetLibraryWidthBounds();
  const step = event.shiftKey ? 64 : 16;
  if (event.key === "Home") setAssetLibraryWidth(bounds.min);
  else if (event.key === "End") setAssetLibraryWidth(bounds.max);
  else setAssetLibraryWidth(state.assetLibraryWidth + (event.key === "ArrowRight" ? step : -step));
});
assetLibraryPanel?.addEventListener("pointerdown", (event) => {
  event.stopPropagation();
});
assetLibraryGrid?.addEventListener("pointerover", (event) => {
  const card = event.target instanceof Element ? event.target.closest("[data-library-entity]") : null;
  if (!card || (event.relatedTarget instanceof Node && card.contains(event.relatedTarget))) return;
  openEntityUseDetail(card.dataset.libraryEntity, { delay: 130 });
});
assetLibraryGrid?.addEventListener("pointerout", (event) => {
  const card = event.target instanceof Element ? event.target.closest("[data-library-entity]") : null;
  if (!card || (event.relatedTarget instanceof Node && card.contains(event.relatedTarget))) return;
  if (event.relatedTarget instanceof Node && entityUseDetailPortal?.contains(event.relatedTarget)) return;
  scheduleEntityUseDetailClose();
});
assetLibraryGrid?.addEventListener("focusin", (event) => {
  const card = event.target instanceof Element ? event.target.closest("[data-library-entity]") : null;
  if (card) openEntityUseDetail(card.dataset.libraryEntity);
});
assetLibraryGrid?.addEventListener("focusout", (event) => {
  const card = event.target instanceof Element ? event.target.closest("[data-library-entity]") : null;
  if (!card) return;
  if (event.relatedTarget instanceof Node && (card.contains(event.relatedTarget) || entityUseDetailPortal?.contains(event.relatedTarget))) return;
  scheduleEntityUseDetailClose();
});
assetLibraryGrid?.addEventListener("scroll", () => {
  if (!state.entityUseDetailId) return;
  if (state.entityUseDetailPinned) renderEntityUseDetail();
  else closeEntityUseDetail();
}, { passive: true });
entityUseDetailPortal?.addEventListener("pointerenter", () => {
  if (state.entityUseDetailCloseTimer) window.clearTimeout(state.entityUseDetailCloseTimer);
  state.entityUseDetailCloseTimer = 0;
});
entityUseDetailPortal?.addEventListener("pointerleave", () => scheduleEntityUseDetailClose());
entityUseDetailPortal?.addEventListener("focusin", () => {
  if (state.entityUseDetailCloseTimer) window.clearTimeout(state.entityUseDetailCloseTimer);
  state.entityUseDetailCloseTimer = 0;
});
entityUseDetailPortal?.addEventListener("focusout", (event) => {
  if (!(event.relatedTarget instanceof Node) || !entityUseDetailPortal.contains(event.relatedTarget)) scheduleEntityUseDetailClose();
});
entityUseDetailPortal?.addEventListener("pointerdown", (event) => event.stopPropagation());
entityUseDetailPortal?.addEventListener("click", (event) => {
  event.stopPropagation();
  if (event.target.closest("[data-entity-use-detail-close]")) {
    closeEntityUseDetail({ restoreFocus: true });
    return;
  }
  const addButton = event.target.closest("[data-entity-use-add-canvas]");
  if (addButton) addEntityToCanvas(addButton.dataset.entityUseAddCanvas);
});
entityUseDetailPortal?.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  event.preventDefault();
  event.stopPropagation();
  closeEntityUseDetail({ restoreFocus: true });
});
entityUsePickerPortal?.addEventListener("pointerdown", (event) => event.stopPropagation());
entityUsePickerPortal?.addEventListener("click", (event) => {
  event.stopPropagation();
  if (event.target.matches("[data-entity-use-picker-backdrop]")) {
    closeEntityUsePicker();
    return;
  }
  const action = event.target.closest("[data-entity-use-action]")?.dataset.entityUseAction;
  if (!action) return;
  if (action === "close-picker" || action === "cancel-picker") {
    closeEntityUsePicker();
    return;
  }
  if (action === "change-space") {
    const space = event.target.closest("[data-entity-use-space]")?.dataset.entityUseSpace;
    state.entityUsePickerSpace = space === "organization" ? "organization" : "personal";
    renderEntityUsePicker();
    return;
  }
  if (action === "clear-search") {
    state.entityUsePickerQuery = "";
    state.entityUsePickerSelectionStart = 0;
    state.entityUsePickerSelectionEnd = 0;
    renderEntityUsePicker({ focusSearch: true });
    return;
  }
  if (action === "toggle-entity") {
    const entityId = event.target.closest("[data-entity-use-toggle]")?.dataset.entityUseToggle;
    if (!entityId) return;
    if (state.entityUsePickerSelectedIds.has(entityId)) {
      state.entityUsePickerSelectedIds.delete(entityId);
      state.entityUsePickerSelectedSpaces.delete(entityId);
    } else {
      state.entityUsePickerSelectedIds.add(entityId);
      state.entityUsePickerSelectedSpaces.set(entityId, state.entityUsePickerSpace);
    }
    renderEntityUsePicker();
    return;
  }
  if (action === "add-entities") addSelectedEntitiesToGenerator();
});
entityUsePickerPortal?.addEventListener("input", (event) => {
  if (!event.target.matches("[data-entity-use-search]")) return;
  state.entityUsePickerQuery = event.target.value;
  state.entityUsePickerSelectionStart = event.target.selectionStart;
  state.entityUsePickerSelectionEnd = event.target.selectionEnd;
  if (!event.isComposing && !state.entityUsePickerComposing) renderEntityUsePicker({ focusSearch: true });
});
entityUsePickerPortal?.addEventListener("compositionstart", (event) => {
  if (event.target.matches("[data-entity-use-search]")) state.entityUsePickerComposing = true;
});
entityUsePickerPortal?.addEventListener("compositionend", (event) => {
  if (!event.target.matches("[data-entity-use-search]")) return;
  state.entityUsePickerComposing = false;
  state.entityUsePickerQuery = event.target.value;
  state.entityUsePickerSelectionStart = event.target.selectionStart;
  state.entityUsePickerSelectionEnd = event.target.selectionEnd;
  renderEntityUsePicker({ focusSearch: true });
});
entityUsePickerPortal?.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    closeEntityUsePicker();
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = [...entityUsePickerPortal.querySelectorAll("button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex='-1'])")]
    .filter((element) => element.getClientRects().length);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});
assetLibrarySearchInput?.addEventListener("input", (event) => {
  closeEntityUseDetail();
  state.librarySearch = event.currentTarget.value;
  state.librarySearchByContext[getAssetLibraryContextKey()] = state.librarySearch;
  state.librarySelectedIds.clear();
  renderAssetLibrary();
});
assetLibraryPanel?.addEventListener("click", (event) => {
  if (event.target.closest("#assetLibrarySpaceButton")) {
    const willOpen = assetLibrarySpaceMenu?.classList.contains("hidden");
    assetLibrarySpaceMenu?.classList.toggle("hidden", !willOpen);
    assetLibrarySpaceButton?.setAttribute("aria-expanded", willOpen ? "true" : "false");
    return;
  }
  const space = event.target.closest("#assetLibrarySpaceMenu [data-library-space]")?.dataset.librarySpace;
  if (space) {
    assetLibrarySpaceMenu?.classList.add("hidden");
    assetLibrarySpaceButton?.setAttribute("aria-expanded", "false");
    switchAssetLibraryContext({ space });
    return;
  }
  const section = event.target.closest("#assetLibrarySectionTabs [data-library-section]")?.dataset.librarySection;
  if (section) {
    switchAssetLibraryContext({ section });
    return;
  }
  if (event.target.closest("#assetLibraryDirectoryButton")) {
    setAssetLibraryDirectoryMenuOpen(!state.libraryDirectoryMenuOpen);
    state.libraryToolbarMenu = null;
    state.libraryMenuTarget = null;
    renderAssetLibrary();
    return;
  }
  if (event.target.closest("[data-library-directory-root-toggle]")) {
    state.libraryDirectoryRootExpanded = !state.libraryDirectoryRootExpanded;
    renderAssetLibrary();
    return;
  }
  const directoryToggle = event.target.closest("[data-library-directory-toggle]");
  if (directoryToggle) {
    const folderId = directoryToggle.dataset.libraryDirectoryToggle;
    if (state.libraryExpandedFolderIds.has(folderId)) state.libraryExpandedFolderIds.delete(folderId);
    else state.libraryExpandedFolderIds.add(folderId);
    renderAssetLibrary();
    return;
  }
  const directorySelect = event.target.closest("[data-library-directory-select]");
  if (directorySelect) {
    selectAssetLibraryDirectory(directorySelect.dataset.libraryDirectorySelect || null);
    return;
  }
  if (event.target.closest("[data-library-create-entity]")) {
    openEntityEditorCreate();
    return;
  }
  if (event.target.closest("[data-library-upload]")) {
    assetLibraryUploadInput?.click();
    return;
  }
  if (event.target.closest("[data-library-selection-toggle]")) {
    setAssetLibrarySelectionMode(!state.librarySelectionMode);
    return;
  }
  if (event.target.closest("[data-library-selection-cancel]")) {
    setAssetLibrarySelectionMode(false);
    return;
  }
  if (event.target.closest("[data-library-select-all]")) {
    selectAllVisibleAssetLibraryItems();
    return;
  }
  if (event.target.closest("[data-library-filter-toggle]")) {
    state.libraryToolbarMenu = state.libraryToolbarMenu === "filter" ? null : "filter";
    renderAssetLibrary();
    return;
  }
  const filter = event.target.closest("[data-library-filter]")?.dataset.libraryFilter;
  if (filter) {
    state.libraryFilter = ["all", "image", "video", "audio"].includes(filter) ? filter : "all";
    state.libraryFilterByContext[getAssetLibraryContextKey()] = state.libraryFilter;
    state.librarySelectedIds.clear();
    state.libraryToolbarMenu = null;
    renderAssetLibrary();
    return;
  }
  if (event.target.closest("#assetLibraryCommandBar button[data-library-display]")) {
    state.libraryDisplay = state.libraryDisplay === "grid" ? "list" : "grid";
    state.libraryToolbarMenu = null;
    renderAssetLibrary();
    return;
  }
  if (event.target.closest("[data-library-clear-query], [data-library-clear-filter]")) {
    state.librarySearch = "";
    state.libraryFilter = "all";
    state.librarySearchByContext[getAssetLibraryContextKey()] = "";
    state.libraryFilterByContext[getAssetLibraryContextKey()] = "all";
    state.librarySelectedIds.clear();
    state.libraryToolbarMenu = null;
    renderAssetLibrary();
    return;
  }
  if (event.target.closest("[data-library-batch-toggle]")) {
    if (state.librarySelectedIds.size === 0) {
      state.libraryToolbarMenu = null;
      renderAssetLibrary();
      return;
    }
    state.libraryToolbarMenu = state.libraryToolbarMenu === "batch" ? null : "batch";
    renderAssetLibrary();
    return;
  }
  const batchAction = event.target.closest("[data-library-batch-action]")?.dataset.libraryBatchAction;
  if (batchAction) {
    runAssetLibraryAction(batchAction, getSelectedAssetLibraryRefs());
    return;
  }
  const moveTarget = event.target.closest("[data-library-move-target]");
  if (moveTarget) {
    const folderId = moveTarget.dataset.libraryMoveTarget || null;
    try {
      if (state.libraryMoveFolderId) {
        assetLibraryStore.moveFolder({
          folderId: state.libraryMoveFolderId,
          parentId: folderId,
          space: state.librarySpace,
        });
        if (folderId) state.libraryExpandedFolderIds.add(folderId);
        else state.libraryDirectoryRootExpanded = true;
        showActionToast("已移动文件夹");
      } else {
        assetLibraryStore.moveItems({ items: state.libraryMoveItems, space: state.librarySpace, folderId });
        showActionToast("已移动资产");
      }
    } catch (error) {
      showActionToast(error?.message || "移动失败");
    }
    state.libraryMoveItems = [];
    state.libraryMoveFolderId = null;
    clearAssetLibrarySelection();
    renderAssetLibrary();
    return;
  }
  if (event.target.closest("[data-library-move-close]")) {
    state.libraryMoveItems = [];
    state.libraryMoveFolderId = null;
    renderAssetLibrary();
    return;
  }
  const selection = event.target.closest("[data-library-select]")?.dataset.librarySelect;
  if (selection) {
    toggleAssetLibrarySelection(selection);
    return;
  }
  const menuToggle = event.target.closest("[data-library-menu-toggle]");
  if (menuToggle) {
    closeEntityUseDetail();
    const card = menuToggle.closest("[data-library-folder], [data-library-media], [data-library-entity]");
    const kind = card?.hasAttribute("data-library-folder")
      ? "folder"
      : card?.hasAttribute("data-library-entity")
        ? "entity"
        : "media";
    const id = card?.dataset.libraryFolder || card?.dataset.libraryEntity || card?.dataset.libraryMedia;
    if (!id) return;
    const currentKey = state.libraryMenuTarget ? `${state.libraryMenuTarget.kind}:${state.libraryMenuTarget.id}` : "";
    state.libraryMenuTarget = currentKey === `${kind}:${id}` ? null : { kind, id };
    state.libraryToolbarMenu = null;
    renderAssetLibrary();
    return;
  }
  const itemActionButton = event.target.closest("[data-library-menu-item]");
  if (itemActionButton) {
    closeEntityUseDetail();
    const itemAction = itemActionButton.dataset.libraryMenuItem;
    const card = itemActionButton.closest("[data-library-folder], [data-library-media], [data-library-entity]");
    const kind = itemActionButton.dataset.libraryItemKind
      || (card?.hasAttribute("data-library-folder") ? "folder" : card?.hasAttribute("data-library-entity") ? "entity" : "media");
    const id = itemActionButton.dataset.libraryItemId
      || card?.dataset.libraryFolder
      || card?.dataset.libraryEntity
      || card?.dataset.libraryMedia;
    if (!id) return;
    if (kind === "folder") runAssetLibraryFolderAction(itemAction, id);
    else if (kind === "entity" && itemAction === "edit") openEntityEditorEdit(id);
    else if (itemAction === "rename") startAssetLibraryRename(kind, id);
    else runAssetLibraryAction(itemAction, [getAssetLibraryItemRef(id, kind)]);
    return;
  }
  const listRowCard = state.libraryDisplay === "list"
    && event.detail < 2
    && !event.target.closest("button, input, textarea, select, a, [contenteditable='true'], [role='menu']")
    ? event.target.closest(".asset-library-card")
    : null;
  const folderOpen = event.target.closest("[data-library-folder-open]");
  const folderCard = folderOpen?.closest("[data-library-folder]")
    || (listRowCard?.matches("[data-library-folder]") ? listRowCard : null);
  if (folderCard) {
    selectAssetLibraryDirectory(folderCard.dataset.libraryFolder);
    return;
  }
  const previewButton = event.target.closest("[data-library-preview]");
  const itemCard = previewButton?.closest("[data-library-media], [data-library-entity]")
    || (listRowCard?.matches("[data-library-media], [data-library-entity]") ? listRowCard : null);
  if (itemCard) {
    const kind = itemCard.hasAttribute("data-library-entity") ? "entity" : "media";
    const id = itemCard.dataset.libraryEntity || itemCard.dataset.libraryMedia;
    if (state.librarySelectionMode) toggleAssetLibrarySelection(id);
    else if (kind === "entity") openEntityEditorEdit(id);
    else openAssetLibraryPreview(kind, id);
  }
});
assetLibraryUploadInput?.addEventListener("change", (event) => {
  void addFilesToAssetLibrary(event.currentTarget.files);
  event.currentTarget.value = "";
});
assetLibraryCreateFolderBtn?.addEventListener("click", createAssetLibraryFolder);
assetLibraryGrid?.addEventListener("focusout", (event) => {
  if (event.target.matches("[data-library-rename-input]")) void finishAssetLibraryRename(event.target);
});
assetLibraryGrid?.addEventListener("keydown", (event) => {
  if (event.target.matches("[data-library-rename-input]")) {
    if (event.key === "Enter") {
      event.preventDefault();
      void finishAssetLibraryRename(event.target);
    } else if (event.key === "Escape") {
      event.preventDefault();
      void finishAssetLibraryRename(event.target, { cancel: true });
    }
    return;
  }
  const renameTarget = event.target.closest("[data-library-rename]");
  if (renameTarget && (event.key === "Enter" || event.key === "F2")) {
    event.preventDefault();
    const folder = renameTarget.closest("[data-library-folder]");
    if (folder) {
      startAssetLibraryRename("folder", folder.dataset.libraryFolder);
      return;
    }
    const card = renameTarget.closest("[data-library-media], [data-library-entity]");
    if (card) {
      const kind = card.hasAttribute("data-library-entity") ? "entity" : "media";
      startAssetLibraryRename(kind, card.dataset.libraryEntity || card.dataset.libraryMedia);
    }
    return;
  }
});
assetLibraryGrid?.addEventListener("dragstart", (event) => {
  const assetId = event.target.closest("[data-library-media]")?.dataset.libraryMedia;
  if (!assetId || !event.dataTransfer) return;
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData("application/x-reelay-asset", assetId);
  event.dataTransfer.setData("text/plain", assetId);
});
assetLibraryPreviewDialog?.addEventListener("click", (event) => {
  if (event.target === assetLibraryPreviewDialog || event.target.closest("[data-library-preview-close]")) {
    closeAssetLibraryPreview();
  }
});
assetLibraryPreviewDialog?.addEventListener("close", () => {
  state.libraryPreviewTarget = null;
  if (assetLibraryPreviewBody) assetLibraryPreviewBody.innerHTML = "";
});
assetLibraryPreviewUse?.addEventListener("click", () => {
  if (state.libraryPreviewTarget?.kind !== "media") return;
  useLibraryAsset(state.libraryPreviewTarget.id);
  closeAssetLibraryPreview();
});

shareProjectBtn?.addEventListener("click", shareProject);
canvasHomeButtons.forEach((button) => {
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    requestHostNavigation("home");
  });
});

let profileHelpCloseTimer = null;
let profileShortcutCloseTimer = null;

function clearProfileHelpCloseTimer() {
  if (profileHelpCloseTimer === null) return;
  window.clearTimeout(profileHelpCloseTimer);
  profileHelpCloseTimer = null;
}

function setProfileShortcutOpen(open) {
  if (profileShortcutCloseTimer !== null) {
    window.clearTimeout(profileShortcutCloseTimer);
    profileShortcutCloseTimer = null;
  }
  profileShortcutTrigger?.setAttribute("aria-expanded", String(open));
  profileShortcutSheet?.classList.toggle("open", open);
}

function scheduleProfileShortcutClose() {
  if (profileShortcutCloseTimer !== null) window.clearTimeout(profileShortcutCloseTimer);
  profileShortcutCloseTimer = window.setTimeout(() => {
    profileShortcutCloseTimer = null;
    const keepsShortcutOpen =
      profileShortcutTrigger?.matches(":hover, :focus") ||
      profileShortcutSheet?.matches(":hover") ||
      profileShortcutSheet?.contains(document.activeElement);
    if (!keepsShortcutOpen) setProfileShortcutOpen(false);
  }, 180);
}

function setProfileHelpOpen(open) {
  if (open) clearProfileHelpCloseTimer();
  profileHelpFlyout?.classList.toggle("open", open);
  profileHelpTrigger?.setAttribute("aria-expanded", String(open));
  if (!open) setProfileShortcutOpen(false);
}

function scheduleProfileHelpClose() {
  clearProfileHelpCloseTimer();
  profileHelpCloseTimer = window.setTimeout(() => {
    profileHelpCloseTimer = null;
    const helpPanel = profileHelpFlyout?.querySelector(".profile-help-flyout-panel");
    const keepsHelpOpen =
      profileHelpTrigger?.matches(":hover, :focus") ||
      helpPanel?.matches(":hover") ||
      profileShortcutSheet?.matches(":hover") ||
      profileHelpFlyout?.contains(document.activeElement);
    if (!keepsHelpOpen) setProfileHelpOpen(false);
  }, 180);
}

function toggleProfileHelpOpen() {
  const isOpen = profileHelpFlyout?.classList.contains("open");
  setProfileHelpOpen(!isOpen);
}

function openProfileMenu({ focusMenu = false } = {}) {
  profileMenu?.classList.remove("hidden");
  railProfileBtn?.classList.add("active");
  railProfileBtn?.setAttribute("aria-expanded", "true");
  if (focusMenu) focusFirstMenuControl(profileMenu);
}

function closeProfileMenu({ returnFocus = false } = {}) {
  profileMenu?.classList.add("hidden");
  railProfileBtn?.classList.remove("active");
  railProfileBtn?.setAttribute("aria-expanded", "false");
  setProfileHelpOpen(false);
  if (returnFocus && canRestoreDialogFocus(railProfileBtn)) {
    window.requestAnimationFrame(() => railProfileBtn.focus());
  }
}

railProfileBtn?.addEventListener("click", (event) => {
  event.stopPropagation();
  if (profileMenu?.classList.contains("hidden")) {
    openProfileMenu({ focusMenu: event.detail === 0 });
  } else {
    closeProfileMenu();
  }
});

railProfileBtn?.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !profileMenu?.classList.contains("hidden")) {
    event.preventDefault();
    event.stopPropagation();
    closeProfileMenu({ returnFocus: true });
    return;
  }
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    event.stopPropagation();
    openProfileMenu({ focusMenu: true });
  }
});

profileMenu?.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  event.preventDefault();
  event.stopPropagation();
  closeProfileMenu({ returnFocus: true });
});

profileAnchor?.addEventListener("focusout", () => {
  window.setTimeout(() => {
    if (!profileAnchor.contains(document.activeElement)) closeProfileMenu();
  }, 0);
});

profileMenu?.addEventListener("pointerdown", (event) => {
  event.stopPropagation();
});

profileHelpFlyout?.addEventListener("pointerenter", () => {
  setProfileHelpOpen(true);
});

profileHelpFlyout?.addEventListener("pointerleave", () => {
  scheduleProfileHelpClose();
});

profileHelpFlyout?.querySelector(".profile-help-flyout-panel")?.addEventListener("pointerenter", () => {
  setProfileHelpOpen(true);
});

profileHelpFlyout?.addEventListener("focusout", () => {
  window.setTimeout(() => {
    if (!profileHelpFlyout.contains(document.activeElement)) setProfileHelpOpen(false);
  }, 0);
});

profileHelpTrigger?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  event.stopPropagation();
  toggleProfileHelpOpen();
});

profileShortcutTrigger?.addEventListener("pointerenter", () => {
  setProfileShortcutOpen(true);
});

profileShortcutTrigger?.addEventListener("pointerleave", scheduleProfileShortcutClose);

profileShortcutTrigger?.addEventListener("focus", () => {
  setProfileShortcutOpen(true);
});

profileShortcutTrigger?.addEventListener("blur", scheduleProfileShortcutClose);

profileShortcutTrigger?.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  setProfileShortcutOpen(true);
});

profileShortcutSheet?.addEventListener("pointerenter", () => {
  setProfileHelpOpen(true);
  setProfileShortcutOpen(true);
});

profileShortcutSheet?.addEventListener("pointerleave", scheduleProfileShortcutClose);

profileMenu?.addEventListener("click", (event) => {
  const helpTrigger = event.target.closest(".profile-help-trigger");
  if (helpTrigger) {
    event.preventDefault();
    event.stopPropagation();
    setProfileHelpOpen(true);
    return;
  }
  const actionItem = event.target.closest("[data-profile-action]");
  const action = actionItem?.dataset.profileAction;
  if (action === "appearance") {
    event.preventDefault();
    event.stopPropagation();
    applyTheme(state.themeMode === "light" ? "dark" : "light", { flash: true });
    return;
  }
  if (action === "account" || action === "profile") {
    event.preventDefault();
    event.stopPropagation();
    closeProfileMenu();
    requestHostAccountSettings("profile");
    return;
  }
  if (action === "credits") {
    event.preventDefault();
    event.stopPropagation();
    closeProfileMenu();
    requestHostAccountSettings("credits");
    return;
  }
  if (action === "logout") {
    showConfirmDialog({
      title: "退出当前账号",
      body: "退出后将结束当前本地演示会话，并返回账户密码登录页。",
      confirmText: "退出账号",
      onConfirm: () => requestHostNavigation("logout"),
    });
    return;
  }
  if (action === "organization") {
    closeProfileMenu();
    requestHostNavigation("organization");
    return;
  }
  if (action) {
    showConfirmDialog({
      title: "功能占位",
      body: "这个入口会在账号与组织系统接入后继续完善。",
      confirmText: "知道了",
      showCancel: false,
    });
  }
});

function setSelectionDownloadMenuOpen(open) {
  const nextOpen = Boolean(open && selectionDownloadMenu && selectionDownloadTrigger);
  selectionDownloadMenu?.classList.toggle("hidden", !nextOpen);
  selectionDownloadTrigger?.setAttribute("aria-expanded", String(nextOpen));
  selectionDownloadTrigger?.classList.toggle("active", nextOpen);
}

selectionToolbar?.addEventListener("pointerdown", (event) => {
  event.stopPropagation();
});

groupResizeOverlay?.addEventListener("pointerdown", (event) => {
  const handle = event.target.closest("[data-group-resize]");
  const group = getGroupById(groupResizeOverlay.dataset.groupId);
  if (!handle || !group || event.button !== 0 || !requireCanvasMutation()) return;
  event.preventDefault();
  event.stopPropagation();
  canvasGroupInteractionController.beginResize(group, event, handle.dataset.groupResize, shell);
});

multiSelectionPort?.addEventListener("pointerdown", beginSelectionConnectionDrag);
multiSelectionPort?.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
});

selectionToolbar?.addEventListener("click", (event) => {
  event.stopPropagation();
  const layout = event.target.closest("[data-sort-layout]")?.dataset.sortLayout;
  if (layout) {
    sortSelectedNodes(layout);
    return;
  }
  const downloadAction = event.target.closest("[data-download-action]")?.dataset.downloadAction;
  if (downloadAction) {
    setSelectionDownloadMenuOpen(false);
    downloadSelectedMedia(downloadAction === "archive");
    return;
  }
  const action = event.target.closest("[data-selection-action]")?.dataset.selectionAction;
  if (action === "group") {
    if (getSelectedNodes().some((node) => Boolean(node.groupId))) return;
    groupSelectedNodes();
    return;
  }
  if (action === "add-library") {
    addSelectedMediaToLibrary();
    return;
  }
  if (action === "delete") {
    deleteSelectedNodes();
    return;
  }
  if (action === "toggle-download") {
    setSelectionDownloadMenuOpen(selectionDownloadMenu?.classList.contains("hidden"));
  }
});

canvasTools?.addEventListener("pointerdown", (event) => {
  event.stopPropagation();
});

canvasToolButtons.forEach((button) => {
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    if (button.dataset.canvasTool === "fit") {
      fitCanvasToContent();
      return;
    }
    setCanvasPanel(button.dataset.canvasTool);
  });
});

minimapSurface?.addEventListener("pointerdown", beginMinimapDrag);

zoomSlider?.addEventListener("pointerdown", (event) => {
  event.stopPropagation();
});

zoomSlider?.addEventListener("click", (event) => {
  event.stopPropagation();
});

zoomSlider?.addEventListener("input", (event) => {
  event.stopPropagation();
  closeCanvasPanel();
  const nextValue = Number(event.currentTarget.value) / 100;
  setCanvasZoom(nextValue);
});

document.querySelectorAll("[data-project-menu-button]").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    openProjectMenu(button, { focusMenu: event.detail === 0 });
  });
  button.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openProjectMenu(button, { focusMenu: true });
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeProjectMenus({ returnFocus: true });
    }
  });
});

document.querySelectorAll("[data-canvas-menu-button]").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    openCanvasMenu(button, { focusMenu: event.detail === 0 });
  });
  button.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openCanvasMenu(button, { focusMenu: true });
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeProjectMenus({ returnFocus: true });
    }
  });
});

projectNameEls.forEach((element) => {
  element.addEventListener("dblclick", (event) => {
    event.stopPropagation();
    beginInlineRename(element);
  });
  element.addEventListener("keydown", (event) => {
    if (element.contentEditable !== "true" && (event.key === "Enter" || event.key === "F2")) {
      event.preventDefault();
      beginInlineRename(element);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      finishInlineRename(element, true);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      finishInlineRename(element, false);
    }
  });
  element.addEventListener("blur", () => finishInlineRename(element, true));
});

[projectMenu, canvasMenu, canvasMoreMenu].forEach((menu) => {
  menu?.addEventListener("pointerdown", (event) => event.stopPropagation());
});

projectMenu?.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    closeProjectMenus({ returnFocus: true });
    return;
  }
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  const controls = [
    projectMenuSearch,
    ...projectMenu.querySelectorAll(".project-menu-option, .project-menu-create"),
  ].filter((control) => control && !control.disabled && control.getClientRects().length);
  const currentIndex = controls.indexOf(document.activeElement);
  if (currentIndex < 0) return;
  event.preventDefault();
  const direction = event.key === "ArrowDown" ? 1 : -1;
  controls[(currentIndex + direction + controls.length) % controls.length]?.focus();
});

projectMenuSearch?.addEventListener("input", (event) => {
  state.projectSearch = event.currentTarget.value;
  renderProjectMenu();
});

canvasMenu?.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || event.target.closest("input.canvas-menu-name.editing")) return;
  event.preventDefault();
  event.stopPropagation();
  closeProjectMenus({ returnFocus: true });
});

canvasMoreMenu?.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  event.preventDefault();
  event.stopPropagation();
  closeCanvasMoreMenu({ returnFocus: true });
});

projectMenu?.addEventListener("click", (event) => {
  event.stopPropagation();
  const projectId = event.target.closest("[data-project-id]")?.dataset.projectId;
  if (projectId) {
    closeProjectMenus();
    requestHostProjectNavigation(projectId);
    return;
  }
  const action = event.target.closest("[data-project-action]")?.dataset.projectAction;
  if (action) handleProjectMenuAction(action);
});

canvasMenu?.addEventListener("click", (event) => {
  event.stopPropagation();
  const addAction = event.target.closest("[data-canvas-action='add']");
  if (addAction) {
    addCanvas();
    renderCanvasMenu();
    return;
  }
  const moreButton = event.target.closest("[data-canvas-more]");
  if (moreButton) {
    const wasOpen = canvasMoreMenuTrigger === moreButton && !canvasMoreMenu?.classList.contains("hidden");
    closeCanvasMoreMenu();
    if (wasOpen) return;
    state.canvasMoreTargetId = moreButton.dataset.canvasMore;
    canvasMoreMenuTrigger = moreButton;
    moreButton.setAttribute("aria-expanded", "true");
    canvasMoreMenu?.classList.remove("hidden");
    if (!canvasMoreMenu?.classList.contains("hidden")) {
      positionMenu(canvasMoreMenu, moreButton, { width: 178, gap: 4 });
      if (event.detail === 0) focusFirstMenuControl(canvasMoreMenu);
    }
    return;
  }
  const switchButton = event.target.closest("[data-canvas-switch]");
  if (switchButton) {
    switchCanvas(switchButton.dataset.canvasSwitch);
    closeProjectMenus();
  }
});

canvasMoreMenu?.addEventListener("click", (event) => {
  event.stopPropagation();
  const action = event.target.closest("[data-canvas-more-action]")?.dataset.canvasMoreAction;
  if (action) handleCanvasMoreAction(action);
});

agentLauncher?.addEventListener("click", (event) => {
  event.stopPropagation();
  setAgentOpen(true);
});
agentLauncher?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  setAgentOpen(true);
});
agentCloseBtn?.addEventListener("click", () => setAgentOpen(false));
agentNewChatBtn?.addEventListener("click", () => {
  setAgentConversation("new");
  agentInput?.focus();
});
agentHistoryBtn?.addEventListener("click", (event) => {
  event.stopPropagation();
  setAgentHistoryOpen(agentHistoryMenu?.classList.contains("hidden"), { focus: true });
});
agentHistoryMenu?.addEventListener("pointerdown", (event) => {
  event.stopPropagation();
});
agentHistoryList?.addEventListener("click", (event) => {
  const item = event.target.closest("[data-chat-id]");
  if (!item) return;
  setAgentConversation(item.dataset.chatId);
});
agentHistorySearch?.addEventListener("input", (event) => {
  filterAgentHistory(event.currentTarget.value);
});
agentSendButton?.addEventListener("click", sendAgentMessage);
agentInput?.addEventListener("input", syncAgentPromptOptimizationControl);
agentInput?.addEventListener("keydown", (event) => {
  if (event.isComposing) return;
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendAgentMessage();
  }
});
agentAddBtn?.addEventListener("click", () => {
  showActionToast("附件能力将在 Agent 任务接入后开放");
});
agentPromptOptimizationBtn?.addEventListener("click", startAgentPromptOptimization);
agentAdvancedBtn?.addEventListener("click", () => {
  setAgentAdvancedOpen(!state.agentAdvancedSettingsExpanded);
});
agentAutoLinkBtn?.addEventListener("click", () => {
  setAgentAutoLinkEnabled(!state.agentAutoLinkEnabled);
});
agentModeBtn?.addEventListener("click", (event) => {
  event.stopPropagation();
  setAgentModeMenuOpen(agentModeMenu?.classList.contains("hidden"), { focus: true });
});
agentModeMenu?.addEventListener("pointerdown", (event) => {
  event.stopPropagation();
});
agentModeMenu?.addEventListener("click", (event) => {
  event.stopPropagation();
  const option = event.target.closest("[data-agent-mode]");
  if (!option) return;
  setAgentComposerMode(option.dataset.agentMode, { focusInput: true });
});
agentModelBtn?.addEventListener("click", (event) => {
  event.stopPropagation();
  setAgentModelMenuOpen(agentModelMenu?.classList.contains("hidden"), { focus: true });
});
agentModelMenu?.addEventListener("pointerdown", (event) => {
  event.stopPropagation();
});
agentModelMenu?.addEventListener("click", (event) => {
  event.stopPropagation();
  const tab = event.target.closest("[data-agent-model-tab]");
  if (tab) {
    setAgentModelTab(tab.dataset.agentModelTab);
    return;
  }
  const option = event.target.closest("[data-agent-model]");
  if (!option) return;
  toggleAgentModel(option.dataset.agentModel);
});
agentModelMenu?.addEventListener("change", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const autoInput = target?.closest("[data-agent-auto]");
  if (!autoInput) return;
  state.agentModelAuto = autoInput.checked;
});
agentPanel?.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!agentHistoryMenu?.classList.contains("hidden")) {
    event.preventDefault();
    event.stopPropagation();
    setAgentHistoryOpen(false);
    agentHistoryBtn?.focus();
    return;
  }
  if (!agentModeMenu?.classList.contains("hidden")) {
    event.preventDefault();
    event.stopPropagation();
    setAgentModeMenuOpen(false);
    agentModeBtn?.focus();
    return;
  }
  if (!agentModelMenu?.classList.contains("hidden")) {
    event.preventDefault();
    event.stopPropagation();
    setAgentModelMenuOpen(false);
    agentModelBtn?.focus();
    return;
  }
  if (state.agentAdvancedSettingsExpanded) {
    event.preventDefault();
    event.stopPropagation();
    setAgentAdvancedOpen(false);
    agentAdvancedBtn?.focus();
  }
});
agentResizeHandle?.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  state.action = {
    type: "resize-agent",
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startWidth: state.agentWidth,
    captureTarget: agentResizeHandle,
  };
  agentResizeHandle.setPointerCapture(event.pointerId);
});

function bindAgentHeightResizeHandle(handle, edge) {
  if (!handle) return;
  const isTop = edge === "top";
  const setInset = isTop ? setAgentTopInset : setAgentBottomInset;
  const getInset = () => isTop ? state.agentTopInset : state.agentBottomInset;

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    state.action = {
      type: isTop ? "resize-agent-top" : "resize-agent-bottom",
      pointerId: event.pointerId,
      startClientY: event.clientY,
      startInset: getInset(),
      captureTarget: handle,
    };
    agentDock?.classList.add("resizing-vertical");
    handle.setPointerCapture(event.pointerId);
  });

  handle.addEventListener("keydown", (event) => {
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Home") {
      setInset(0);
      return;
    }
    if (event.key === "End") {
      setInset(Number(handle.getAttribute("aria-valuemax")) || 0);
      return;
    }
    const step = event.shiftKey
      ? agentPanelHeightRules.coarseKeyboardStep
      : agentPanelHeightRules.keyboardStep;
    const direction = isTop
      ? (event.key === "ArrowDown" ? 1 : -1)
      : (event.key === "ArrowUp" ? 1 : -1);
    setInset(getInset() + direction * step);
  });

  handle.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setInset(0);
  });
}

bindAgentHeightResizeHandle(agentTopResizeHandle, "top");
bindAgentHeightResizeHandle(agentBottomResizeHandle, "bottom");

document.addEventListener("focusin", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const projectOpen = Boolean(projectMenu && !projectMenu.classList.contains("hidden"));
  const canvasOpen = Boolean(canvasMenu && !canvasMenu.classList.contains("hidden"));
  if (projectOpen && !projectMenu.contains(target) && target !== projectMenuTrigger) {
    closeProjectMenus();
    return;
  }
  if (
    canvasOpen
    && !canvasMenu.contains(target)
    && !canvasMoreMenu?.contains(target)
    && target !== canvasMenuTrigger
  ) {
    closeProjectMenus();
  }
});

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const eventPath = typeof event.composedPath === "function" ? event.composedPath() : [];
  const pathMatches = (selector) => eventPath.some(
    (entry) => entry instanceof Element && entry.matches(selector),
  );
  if (!target?.closest(".agent-actions, .agent-history-menu, .agent-mode-wrap, .agent-model-wrap")) {
    closeAgentPopovers();
  }
  if (!target?.closest(".top-actions")) {
    closeProfileMenu();
  }
  if (!target?.closest(".project-nav, .project-menu, .canvas-menu, .canvas-more-menu")) {
    closeProjectMenus();
  }
  if (!target?.closest(".asset-library-space-switcher")) {
    assetLibrarySpaceMenu?.classList.add("hidden");
    assetLibrarySpaceButton?.setAttribute("aria-expanded", "false");
  }
  let shouldRenderLibrary = false;
  if (!pathMatches(".asset-library-directory-shell") && state.libraryDirectoryMenuOpen) {
    state.libraryDirectoryMenuOpen = false;
    shouldRenderLibrary = true;
  }
  if (!pathMatches("#assetLibraryCommandBar, .asset-library-item-menu, [data-library-menu-toggle]")) {
    shouldRenderLibrary ||= Boolean(state.libraryToolbarMenu || state.libraryMenuTarget);
    state.libraryToolbarMenu = null;
    state.libraryMenuTarget = null;
  }
  if (!pathMatches("#assetLibraryOverlayLayer, [data-library-menu-item='move'], [data-library-batch-action='move']")) {
    shouldRenderLibrary ||= state.libraryMoveItems.length > 0 || Boolean(state.libraryMoveFolderId);
    state.libraryMoveItems = [];
    state.libraryMoveFolderId = null;
  }
  if (shouldRenderLibrary && isAssetLibraryOpen()) renderAssetLibrary();
  if (!target?.closest("#canvasTools")) {
    closeCanvasPanel();
  }
  if (!target?.closest("#selectionToolbar")) {
    setSelectionDownloadMenuOpen(false);
  }
  if (!target?.closest(".group-frame")) {
    closeGroupLayoutMenus();
  }
  if (!target?.closest(".media-edit-toolbar, .media-frame")) {
    if (closeMediaToolbarState()) {
      render();
    }
  }
});

window.addEventListener("resize", () => {
  if (projectMenuTrigger && !projectMenu?.classList.contains("hidden")) {
    positionProjectMenu(projectMenuTrigger);
  }
  if (state.agentOpen && isAssetLibraryOpen() && !canShowAssetAndAgent()) {
    if (agentDock?.contains(document.activeElement)) {
      closeAssetLibrary();
    } else {
      setAgentOpen(false);
    }
  }
  if (state.agentOpen && isAssetLibraryOpen()) {
    reconcileDualPanelWidths(assetLibraryPanel?.contains(document.activeElement) ? "asset" : "agent");
  }
  setAssetLibraryWidth(state.assetLibraryPreferredWidth, { remember: false });
  setAgentWidth(state.agentWidth);
  reconcileAgentVerticalInsets("top");
  syncPromptPanelLayouts();
  renderSelectionToolbar();
  renderMinimap();
  syncNarrowViewportIsolation({ focusPanel: narrowViewportQuery.matches });
});

window.addEventListener("message", handleHostBridgeMessage);
window.addEventListener("beforeunload", flushCanvasDocumentSave);
window.addEventListener("pagehide", flushCanvasDocumentSave);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushCanvasDocumentSave();
});

setAssetLibraryWidth(state.assetLibraryPreferredWidth, { remember: false });
setAgentWidth(state.agentWidth);
reconcileAgentVerticalInsets("top");
setAgentOpen(false);
renderAgentHistory();
setAgentConversation(state.activeConversationId);
setAgentAdvancedOpen(state.agentAdvancedSettingsExpanded);
setAgentAutoLinkEnabled(state.agentAutoLinkEnabled);
syncAgentComposerControls();
syncAgentPromptOptimizationControl();
syncCreditDisplay();
applyTheme(state.themeMode);
syncFaviconContrast();
assetLibraryStore.listAllMedia().forEach((asset) => hydrateAssetMetadata(asset, null));
initializeCanvases();
applyTransform();
consumeHomeLaunchIntent();
render();
window.REELAY_CANVAS_LAYOUT_TUNER_BOOTSTRAP?.({
  getRuntimeValues: () => ({
    assetWidth: state.assetLibraryWidth,
    agentWidth: state.agentWidth,
    agentTopInset: state.agentTopInset,
    agentBottomInset: state.agentBottomInset,
  }),
  setRuntimeValue: (key, value) => {
    if (key === "assetWidth") setAssetLibraryWidth(value);
    else if (key === "agentWidth") setAgentWidth(value);
    else if (key === "agentTopInset") setAgentTopInset(value);
    else if (key === "agentBottomInset") setAgentBottomInset(value);
    return {
      assetWidth: state.assetLibraryWidth,
      agentWidth: state.agentWidth,
      agentTopInset: state.agentTopInset,
      agentBottomInset: state.agentBottomInset,
    }[key];
  },
});
canvasPersistence.post("canvas:ready");
