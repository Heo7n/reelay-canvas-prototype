const appShell = document.querySelector(".app-shell");
const shell = document.querySelector("#canvasShell");
const appFavicon = document.querySelector("#appFavicon");
const canvasGrid = document.querySelector("#canvasGrid");
const stage = document.querySelector("#canvasStage");
const nodeLayer = document.querySelector("#nodeLayer");
const canvasTools = document.querySelector("#canvasTools");
const canvasToolButtons = document.querySelectorAll("[data-canvas-tool]");
const canvasToolPopovers = document.querySelectorAll("[data-canvas-popover]");
const minimapSurface = document.querySelector("#minimapSurface");
const zoomPanel = document.querySelector("#zoomPanel");
const zoomChip = document.querySelector("#zoomChip");
const projectTitle = document.querySelector("#projectTitle");
const railLibraryBtn = document.querySelector("#railLibraryBtn");
const railProfileBtn = document.querySelector("#railProfileBtn");
const shareProjectBtn = document.querySelector("#shareProjectBtn");
const profileMenu = document.querySelector("#profileMenu");
const assetLibraryPanel = document.querySelector("#assetLibraryPanel");
const assetLibraryCloseBtn = document.querySelector("#assetLibraryCloseBtn");
const assetLibraryUploadBtn = document.querySelector("#assetLibraryUploadBtn");
const assetLibraryGrid = document.querySelector("#assetLibraryGrid");
const assetLibraryCount = document.querySelector("#assetLibraryCount");
const assetLibraryContext = document.querySelector("#assetLibraryContext");
const themeSubmenu = document.querySelector("#themeSubmenu");
const themeCurrentLabel = document.querySelector("#themeCurrentLabel");
const avatarCreditBadge = document.querySelector("#avatarCreditBadge");
const profileCreditAvailable = document.querySelector("#profileCreditAvailable");
const profileCreditConsumed = document.querySelector("#profileCreditConsumed");
const emptyState = document.querySelector("#emptyState");
const emptyCreateBtn = document.querySelector("#emptyCreateBtn");
const localAssetInput = document.querySelector("#localAssetInput");
const selectionBox = document.querySelector("#selectionBox");
const selectionToolbar = document.querySelector("#selectionToolbar");
const selectionSortMenu = document.querySelector("#selectionSortMenu");
const agentDock = document.querySelector("#agentDock");
const agentLauncher = document.querySelector("#agentLauncher");
const agentPanel = document.querySelector("#agentPanel");
const agentResizeHandle = document.querySelector("#agentResizeHandle");
const agentCloseBtn = document.querySelector("#agentCloseBtn");
const agentNewChatBtn = document.querySelector("#agentNewChatBtn");
const agentHistoryBtn = document.querySelector("#agentHistoryBtn");
const agentHistoryMenu = document.querySelector("#agentHistoryMenu");
const agentHistoryList = document.querySelector("#agentHistoryList");
const agentHistorySearch = document.querySelector("#agentHistorySearch");
const agentConversationTitle = document.querySelector("#agentConversationTitle");
const agentMessages = document.querySelector("#agentMessages");
const agentInput = document.querySelector("#agentInput");
const agentSendButton = document.querySelector(".agent-send");
const agentModelBtn = document.querySelector("#agentModelBtn");
const agentModelMenu = document.querySelector("#agentModelMenu");
const undoToast = document.querySelector("#undoToast");
const undoDeleteBtn = document.querySelector("#undoDeleteBtn");
const systemThemeQuery = window.matchMedia("(prefers-color-scheme: light)");

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
    appFavicon.href = canvas.toDataURL("image/png");
  };
  source.src = "./assets/reelay-logo.png";
}

const models = window.REELAY_MODEL_CATALOG || [];

const imageResolutionCost = {
  "1024px": 3,
  "1K": 3,
  "2K": 5,
  "4K": 9,
};

const imageQualityMultiplier = {
  低: 0.7,
  中: 1,
  高: 1.8,
};

const videoQualityCost = {
  "480p": 8,
  "720p": 12,
  "1080p": 18,
  "4K": 36,
};

const simulationAssets = {
  image: {
    type: "image",
    name: "Reelay simulated image",
    displayName: "Generated image",
    url: "https://picsum.photos/seed/reelay-canvas/1280/720",
    width: 1280,
    height: 720,
    aspectRatio: 16 / 9,
  },
  video: {
    type: "video",
    name: "Reelay simulated video",
    displayName: "Generated video",
    url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
    width: 1280,
    height: 720,
    aspectRatio: 16 / 9,
  },
  audio: {
    type: "audio",
    name: "Reelay simulated audio",
    displayName: "Generated audio",
    url: "https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3",
    duration: 0,
    aspectRatio: 16 / 9,
  },
};

const officialLibraryAssets = [
  {
    id: "official-sfx-roar",
    type: "audio",
    name: "Cinematic creature roar.mp3",
    displayName: "电影感生物低吼",
    url: "https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3",
    duration: 0,
    aspectRatio: 16 / 9,
    source: "official",
  },
];

const mediaToolDefinitions = {
  enhance: { icon: "badge-hd", label: "HD 增强" },
  crop: { icon: "crop", label: "裁剪" },
  "remove-bg": { icon: "scan", label: "去背景" },
  eraser: { icon: "eraser", label: "橡皮擦" },
  adjust: { icon: "sliders-horizontal", label: "调整" },
  rotate: { icon: "rotate-cw", label: "旋转" },
  trim: { icon: "scissors", label: "裁剪片段" },
  interpolate: { icon: "gauge", label: "提升帧率" },
  denoise: { icon: "audio-waveform", label: "降噪" },
  "add-library": { icon: "folder-plus", label: "加入资产库" },
};

const mediaToolsByType = {
  image: ["enhance", "crop", "remove-bg", "eraser", "adjust", "rotate", "add-library"],
  video: ["enhance", "trim", "interpolate", "remove-bg", "adjust", "rotate", "add-library"],
  audio: ["enhance", "trim", "denoise", "adjust", "add-library"],
};

const defaultMediaToolPreferences = {
  image: { tools: ["enhance", "crop", "remove-bg", "add-library"], showLabels: true },
  video: { tools: ["enhance", "trim", "interpolate", "add-library"], showLabels: true },
  audio: { tools: ["enhance", "trim", "denoise", "add-library"], showLabels: true },
};

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

const agentConversations = [
  {
    id: "new",
    title: "新对话",
    messages: [],
  },
  {
    id: "seedance",
    title: "你有多了解 Seedance2.0 创作视频...",
    messages: [
      {
        role: "user",
        content: "我想把一个图片节点做成 4 秒的动态短片。",
      },
      {
        role: "agent",
        content: "可以先选择视频模型，再把图片素材拖进生成节点上方素材列。我会建议锁定比例、时长和镜头运动。",
      },
    ],
  },
  {
    id: "assets",
    title: "素材整理与生成节点规划",
    messages: [
      {
        role: "user",
        content: "帮我整理画布里的图片、视频和音频素材。",
      },
      {
        role: "agent",
        content: "可以按素材类型建立输入区，再用生成节点衔接输出。后续适合加素材筛选、引用关系和批量操作。",
      },
    ],
  },
];

const layoutRules = {
  defaultRatio: 16 / 9,
  audioRatio: 16 / 9,
  landscapeWidth: 620,
  squareSize: 460,
  portraitHeight: 520,
  maxWidth: 660,
  maxHeight: 520,
  minMediaWidth: 300,
  minMediaHeight: 220,
  normalPanelMinWidth: 560,
  normalPanelMaxWidth: 760,
  normalPanelHeight: 222,
  largePanelMinHeight: 320,
  largePanelMaxHeight: 480,
  largePromptMinHeight: 180,
  largePromptMaxHeight: 340,
  panelGap: 10,
};

const canvasScaleLimits = {
  min: 0.38,
  max: 2,
};

const groupFrameRules = {
  paddingX: 46,
  paddingTop: 58,
  paddingBottom: 46,
  minWidth: 280,
  minHeight: 180,
};

const state = {
  tx: 0,
  ty: 0,
  scale: 1,
  nodes: [],
  groups: [],
  selectedIds: new Set(),
  activeGroupId: null,
  activeId: null,
  zCounter: 1,
  lastPreset: {
    mode: "image",
    model: firstModelId("image"),
    aspect: "16:9",
    resolution: "2K",
    quality: "480p",
    duration: "4s",
    count: 1,
  },
  action: null,
  pendingUploadNodeId: null,
  pendingUploadMode: null,
  isSpaceDown: false,
  undoStack: [],
  agentOpen: false,
  agentWidth: 420,
  projectName: "Untitled",
  activeConversationId: "new",
  agentModelId: "gpt-image-2",
  agentModelIds: ["gpt-image-2"],
  agentModelTab: "image",
  account: {
    credits: 3000,
    consumedCredits: 0,
  },
  mediaToolPreferences: loadMediaToolPreferences(),
  libraryAssets: [],
  personalLibraryAssets: [],
  organizationLibraryAssets: [],
  libraryFilter: "all",
  libraryScope: "project",
  libraryTargetNodeId: null,
  themeMode: localStorage.getItem("reelay-theme-mode") || "dark",
  canvasPanel: null,
  overlaySyncTimer: null,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function firstModelId(type) {
  return models.find((item) => item.type === type)?.id || models[0].id;
}

function screenToWorld(clientX, clientY) {
  const rect = shell.getBoundingClientRect();
  return {
    x: (clientX - rect.left - state.tx) / state.scale,
    y: (clientY - rect.top - state.ty) / state.scale,
  };
}

function worldToScreen(x, y) {
  const rect = shell.getBoundingClientRect();
  return {
    x: rect.left + state.tx + x * state.scale,
    y: rect.top + state.ty + y * state.scale,
  };
}

function updateCanvasGrid() {
  if (!canvasGrid) return;

  const baseSize = 24;
  const size = baseSize * state.scale;
  const fade = clamp((state.scale - 0.62) / 0.68, 0, 1);
  const opacity = fade * clamp((state.scale - 0.38) / 0.52, 0, 1) * 0.58;
  const offsetX = ((state.tx % size) + size) % size;
  const offsetY = ((state.ty % size) + size) % size;

  canvasGrid.style.setProperty("--grid-size", `${size.toFixed(2)}px`);
  canvasGrid.style.setProperty("--grid-x", `${offsetX.toFixed(2)}px`);
  canvasGrid.style.setProperty("--grid-y", `${offsetY.toFixed(2)}px`);
  canvasGrid.style.setProperty("--grid-opacity", opacity.toFixed(3));
}

function applyTransform() {
  stage.style.transform = `translate(${state.tx}px, ${state.ty}px) scale(${state.scale})`;
  updateCanvasGrid();
  syncPromptPanelLayouts();
  window.clearTimeout(state.overlaySyncTimer);
  state.overlaySyncTimer = window.setTimeout(syncPromptPanelLayouts, 100);
  if (zoomChip) zoomChip.textContent = `${Math.round(state.scale * 100)}%`;
  renderSelectionToolbar();
  renderMinimap();
}

function syncNodeVisualLayout(node, element = nodeLayer.querySelector(`[data-id="${node.id}"]`)) {
  if (!element) return;
  const layout = getNodeLayout(node);
  element.style.width = `${layout.nodeWidth}px`;
  const mediaToolbar = element.querySelector("[data-media-toolbar]");
  if (mediaToolbar) {
    mediaToolbar.style.setProperty("--toolbar-scale", layout.toolbarScale.toFixed(4));
    mediaToolbar.style.setProperty("--toolbar-nudge", "0px");
    const toolbarRect = mediaToolbar.getBoundingClientRect();
    const nudge = toolbarRect.top < 8 ? (8 - toolbarRect.top) / state.scale : 0;
    mediaToolbar.style.setProperty("--toolbar-nudge", `${nudge.toFixed(2)}px`);
  }
  const promptPanel = element.querySelector(".prompt-panel");
  if (!promptPanel) return;
  promptPanel.style.width = `${layout.panelWidth}px`;
  promptPanel.style.height = `${layout.panelHeight}px`;
  promptPanel.style.setProperty("--prompt-scale", layout.promptScale.toFixed(4));
  promptPanel.style.setProperty("--prompt-extra-height", `${(layout.panelHeight * (layout.promptScale - 1)).toFixed(2)}px`);
}

function syncPromptPanelLayouts() {
  for (const node of state.nodes) {
    syncNodeVisualLayout(node);
  }
}

function resizePromptTextarea(textarea, node) {
  if (!textarea || !node.promptLarge) return;
  textarea.style.height = "auto";
  const nextHeight = clamp(
    textarea.scrollHeight,
    layoutRules.largePromptMinHeight,
    layoutRules.largePromptMaxHeight,
  );
  node.promptInputHeight = nextHeight;
  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY = textarea.scrollHeight > layoutRules.largePromptMaxHeight ? "auto" : "hidden";
  syncNodeVisualLayout(node, textarea.closest(".canvas-node"));
  renderSelectionToolbar();
  renderMinimap();
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
  const node = {
    id: crypto.randomUUID(),
    kind: "generator",
    x,
    y,
    mode,
    model: firstModelId(mode),
    aspect: "16:9",
    resolution: "2K",
    quality: "480p",
    duration: "4s",
    count: 1,
    credits: 0,
    prompt: "",
    preview: false,
    generating: false,
    generatedAsset: null,
    expanded: true,
    promptLarge: false,
    promptInputHeight: layoutRules.largePromptMinHeight,
    mediaMenuOpen: false,
    panel: null,
    modelFilter: mode,
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
  return models.find((item) => item.id === node.model) || models[0];
}

function getModelCapabilities(node) {
  return getModel(node)?.capabilities || {};
}

function getCapabilityValues(node, key) {
  const capabilities = getModelCapabilities(node);
  if (key === "durations" && capabilities.durationsByQuality?.[node.quality]) {
    return capabilities.durationsByQuality[node.quality];
  }
  return capabilities[key] || [];
}

function normalizeNodeParameters(node) {
  if (!node || node.kind !== "generator") return node;
  let model = models.find((item) => item.id === node.model);
  if (!model || model.type !== node.mode) {
    node.model = firstModelId(node.mode);
    model = getModel(node);
  }
  node.mode = model.type;

  const fieldMap = {
    aspect: "aspects",
    resolution: "resolutions",
    quality: "qualities",
    duration: "durations",
  };
  for (const [field, capabilityKey] of Object.entries(fieldMap)) {
    const values = getCapabilityValues(node, capabilityKey);
    if (values.length && !values.includes(node[field])) {
      node[field] = model.defaults?.[field] || values[0];
    }
  }

  const counts = getCapabilityValues(node, "counts");
  if (counts.length && !counts.includes(node.count)) {
    node.count = counts[0];
  }
  return node;
}

function getCost(node) {
  if (node.kind !== "generator") return 0;
  if (node.mode === "image") {
    const qualityMultiplier = imageQualityMultiplier[node.quality] || 1;
    return Math.ceil((imageResolutionCost[node.resolution] || 5) * qualityMultiplier) * node.count;
  }
  if (node.mode === "audio") {
    const seconds = Number.parseInt(node.duration, 10) || 30;
    return Math.max(3, Math.ceil(seconds / 30) * 5) * node.count;
  }

  const seconds = Number.parseInt(node.duration, 10) || 4;
  const durationMultiplier = Math.ceil(seconds / 4);
  return (videoQualityCost[node.quality] || 8) * durationMultiplier * node.count;
}

function getParamLabel(node) {
  if (node.mode === "audio") {
    return node.duration;
  }
  if (node.mode === "video") {
    return `${node.aspect} · ${node.quality} · ${node.duration}`;
  }
  const quality = getCapabilityValues(node, "qualities").length ? ` · ${node.quality}` : "";
  return `${node.aspect} · ${node.resolution}${quality}`;
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

  if (node.mode === "audio") return layoutRules.audioRatio;
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
  const toolbarScale = clamp(1 / state.scale, 0.5, 2.2);

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

  const panelWidth = clamp(mediaWidth + 72, layoutRules.normalPanelMinWidth, layoutRules.normalPanelMaxWidth);
  const panelHeight = node.promptLarge
    ? clamp(
        (node.promptInputHeight || layoutRules.largePromptMinHeight) + 136,
        layoutRules.largePanelMinHeight,
        layoutRules.largePanelMaxHeight,
      )
    : layoutRules.normalPanelHeight;
  const targetScreenWidth = clamp(mediaWidth * state.scale + 72, 500, 760);
  const promptScale = clamp(targetScreenWidth / (panelWidth * state.scale), 0.5, 2.2);
  const nodeWidth = Math.max(mediaWidth, panelWidth);
  const nodeHeight = mediaHeight + (node.expanded ? layoutRules.panelGap + panelHeight * promptScale : 0);

  return {
    mediaWidth,
    mediaHeight,
    panelWidth,
    panelHeight,
    promptScale,
    toolbarScale,
    nodeWidth,
    nodeHeight,
  };
}

function getNodeBounds(node) {
  const layout = getNodeLayout(node);
  const promptOverflow =
    node.kind === "generator" && node.expanded
      ? Math.max(0, (layout.panelWidth * layout.promptScale - layout.nodeWidth) / 2)
      : 0;
  return {
    left: node.x - promptOverflow,
    top: node.y,
    right: node.x + layout.nodeWidth + promptOverflow,
    bottom: node.y + layout.nodeHeight,
    width: layout.nodeWidth + promptOverflow * 2,
    height: layout.nodeHeight,
  };
}

function rectsIntersect(a, b) {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
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
      const nodeBounds = getNodeBounds(node);
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

function getActiveGroup() {
  return getGroupById(state.activeGroupId);
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
    count: node.count,
  };
}

function rememberPreset(node) {
  if (node?.kind !== "generator") return;
  state.lastPreset = presetFrom(node);
}

function applyPreset(node, preset) {
  node.mode = preset.mode;
  node.model = preset.model;
  node.aspect = preset.aspect;
  node.resolution = preset.resolution;
  node.quality = preset.quality;
  node.duration = preset.duration;
  node.count = preset.count;
  node.modelFilter = preset.mode;
  normalizeNodeParameters(node);
}

function cloneNode(source) {
  const assets = (source.assets || []).map((asset) => ({ ...asset, id: crypto.randomUUID() }));
  const activeAssetIndex = (source.assets || []).findIndex((asset) => asset.id === source.activeAssetId);
  return {
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
}

function getActiveNode() {
  return state.nodes.find((node) => node.id === state.activeId) || null;
}

function setSelection(ids, activeId = null, options = {}) {
  const uniqueIds = ids.filter((id, index) => ids.indexOf(id) === index);
  state.selectedIds = new Set(uniqueIds);
  state.activeId = activeId && state.selectedIds.has(activeId) ? activeId : uniqueIds[uniqueIds.length - 1] || null;
  state.nodes.forEach((node) => {
    if (uniqueIds.length !== 1 || node.id !== state.activeId) {
      node.mediaMenuOpen = false;
    }
  });
  if (!options.keepGroup) {
    state.activeGroupId = null;
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
    }
  }
}

function collapseAllGeneratorPanels() {
  for (const node of state.nodes) {
    if (node.kind !== "generator") continue;
    node.expanded = false;
    node.panel = null;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function refreshIcons() {
  if (!window.lucide) return;
  window.lucide.createIcons({
    attrs: {
      "stroke-width": 1.8,
    },
  });
}

function formatCredit(value) {
  return new Intl.NumberFormat("zh-CN", { useGrouping: false }).format(Math.max(0, Math.round(value || 0)));
}

function syncCreditDisplay() {
  const credits = formatCredit(state.account.credits);
  if (avatarCreditBadge) avatarCreditBadge.textContent = credits;
  if (profileCreditAvailable) profileCreditAvailable.textContent = credits;
  if (profileCreditConsumed) profileCreditConsumed.textContent = formatCredit(state.account.consumedCredits);
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
  if (node.mode === "audio") return "未命名音频";
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
  if (node.generatedAsset?.type === "audio") return formatDuration(node.generatedAsset.duration);
  if (node.mode === "video") return node.quality;
  if (node.generatedAsset?.width && node.generatedAsset?.height) return formatMediaSize(node.generatedAsset.width, node.generatedAsset.height);
  const size = getGeneratedResolution(node);
  return formatMediaSize(size.width, size.height);
}

function mediaMeta(node) {
  const asset = getActiveAsset(node);
  const type = node.kind === "asset" ? asset?.type : node.mode;
  const title = getMediaTitle(node, asset);
  const spec = getMediaSpec(node, asset);
  if (!title && !spec) return "";

  return `
    <div class="media-meta">
      ${
        title
          ? `<div class="media-title" data-title-shell="true" role="button" tabindex="0" title="双击重命名">
              <i data-lucide="${mediaIconName(type)}" aria-hidden="true"></i>
              <span class="media-name" data-media-title="true">${escapeHtml(title)}</span>
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

function getNodeMediaType(node) {
  return getEditableMedia(node)?.type || node.mode || "image";
}

function getMediaToolLabel(toolId, type) {
  if (toolId !== "enhance") return mediaToolDefinitions[toolId]?.label || toolId;
  if (type === "audio") return "音质增强";
  return type === "video" ? "画质增强" : "HD 放大";
}

function mediaToolButton(toolId, type, showLabel) {
  const definition = mediaToolDefinitions[toolId];
  if (!definition) return "";
  const label = getMediaToolLabel(toolId, type);
  return `
    <button class="media-tool-button ${showLabel ? "with-label" : ""}" type="button" data-media-tool="${toolId}" title="${label}" aria-label="${label}">
      <i data-lucide="${definition.icon}" aria-hidden="true"></i>
      ${showLabel ? `<span>${label}</span>` : ""}
    </button>
  `;
}

function mediaEditToolbar(node, layout) {
  const asset = getEditableMedia(node);
  if (!asset || state.selectedIds.size !== 1 || !state.selectedIds.has(node.id)) return "";
  const type = getNodeMediaType(node);
  const preference = state.mediaToolPreferences[type] || defaultMediaToolPreferences[type];
  const showLabels = preference.showLabels && layout.mediaWidth >= 440;
  const unpinned = mediaToolsByType[type].filter((tool) => !preference.tools.includes(tool));
  return `
    <div class="media-edit-toolbar ${showLabels ? "show-labels" : "compact"}" data-media-toolbar="true" style="--toolbar-scale: ${layout.toolbarScale}">
      <div class="media-tool-primary">
        ${preference.tools.map((tool) => mediaToolButton(tool, type, showLabels)).join("")}
      </div>
      <div class="media-tool-actions">
        <button class="media-tool-button" type="button" data-media-tool="toggle-more" title="更多工具" aria-label="更多工具">
          <i data-lucide="ellipsis" aria-hidden="true"></i>
        </button>
        <span class="media-tool-separator" aria-hidden="true"></span>
        <button class="media-tool-button" type="button" data-media-tool="download" title="下载" aria-label="下载">
          <i data-lucide="download" aria-hidden="true"></i>
        </button>
      </div>
      ${
        node.mediaMenuOpen
          ? `
            <div class="media-tool-menu">
              ${unpinned
                .map(
                  (tool) => `
                    <button type="button" data-media-tool="${tool}">
                      <i data-lucide="${mediaToolDefinitions[tool].icon}" aria-hidden="true"></i>
                      <span>${getMediaToolLabel(tool, type)}</span>
                    </button>
                  `,
                )
                .join("")}
              <div class="media-tool-menu-separator"></div>
              <button type="button" data-media-tool="customize">
                <i data-lucide="settings-2" aria-hidden="true"></i>
                <span>自定义工具栏</span>
                <i data-lucide="chevron-right" aria-hidden="true"></i>
              </button>
            </div>
          `
          : ""
      }
    </div>
  `;
}

function assetPreview(asset) {
  if (!asset.url) {
    if (asset.type === "video") return `<span class="asset-glyph">▣</span>`;
    if (asset.type === "audio") return `<span class="asset-glyph">♬</span>`;
    return `<span class="asset-glyph">▧</span>`;
  }
  if (asset.type === "image") {
    return `<img src="${asset.url}" alt="" draggable="false" />`;
  }
  if (asset.type === "video") {
    return `
      <video src="${asset.url}" muted playsinline preload="metadata" draggable="false"></video>
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

function cloneAsset(asset, source = asset.source) {
  return {
    ...asset,
    id: crypto.randomUUID(),
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

function getLibraryAssetsForScope(scope = state.libraryScope) {
  if (scope === "canvas") return getCanvasLibraryAssets();
  if (scope === "personal") return state.personalLibraryAssets;
  if (scope === "official") return officialLibraryAssets;
  if (scope === "organization") return state.organizationLibraryAssets;
  return state.libraryAssets;
}

function findLibraryAsset(assetId) {
  const pools = [
    state.libraryAssets,
    state.personalLibraryAssets,
    officialLibraryAssets,
    state.organizationLibraryAssets,
    getCanvasLibraryAssets(),
  ];
  return pools.flat().find((asset) => asset.id === assetId) || null;
}

function registerLibraryAssets(assets, scope = state.libraryScope) {
  const target =
    scope === "personal"
      ? state.personalLibraryAssets
      : scope === "organization"
        ? state.organizationLibraryAssets
        : state.libraryAssets;
  for (const asset of assets) {
    if (!target.some((item) => item.id === asset.id)) {
      target.push(asset);
    }
  }
  renderAssetLibrary();
}

function renderAssetLibrary() {
  if (!assetLibraryGrid) return;
  const scopeAssets = getLibraryAssetsForScope();
  const visibleAssets = scopeAssets.filter(
    (asset) => state.libraryFilter === "all" || asset.type === state.libraryFilter,
  );
  const targetNode = state.nodes.find((node) => node.id === state.libraryTargetNodeId && node.kind === "generator");
  const scopeMeta = {
    project: ["项目素材", "当前项目中沉淀的可复用资产"],
    canvas: ["画布文件", "当前画布上的全部媒体文件"],
    personal: ["个人资产", "跨项目使用的个人全局资产"],
    official: ["官方公用库", "由 Reelay 提供的公共音效资产"],
    organization: ["组织空间", "同一组织成员共享的资产"],
  };
  const [scopeTitle, scopeContext] = scopeMeta[state.libraryScope] || scopeMeta.project;

  if (assetLibraryCount) assetLibraryCount.textContent = `${visibleAssets.length} 项`;
  if (assetLibraryContext) {
    assetLibraryContext.textContent = targetNode ? "选择资产引用到当前生成节点" : scopeContext;
  }
  const title = assetLibraryPanel?.querySelector(".asset-library-title");
  if (title) title.textContent = scopeTitle;
  document.querySelectorAll("[data-library-scope]").forEach((button) => {
    button.classList.toggle("active", button.dataset.libraryScope === state.libraryScope);
  });
  document.querySelectorAll("[data-library-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.libraryFilter === state.libraryFilter);
  });
  if (assetLibraryUploadBtn) {
    assetLibraryUploadBtn.classList.toggle("hidden", ["canvas", "official"].includes(state.libraryScope));
  }

  if (!visibleAssets.length) {
    assetLibraryGrid.innerHTML = `
      <div class="asset-library-empty">
        <div>
          <i data-lucide="images" aria-hidden="true"></i>
          <strong>${scopeAssets.length ? "此分类暂无资产" : "这里还没有资产"}</strong>
          <span>${scopeAssets.length ? "切换分类查看其他资产" : state.libraryScope === "canvas" ? "拖入媒体或完成一次生成后会出现在这里" : "上传图片、视频或音频，随后可加入画布或生成节点"}</span>
        </div>
      </div>
    `;
    refreshIcons();
    return;
  }

  assetLibraryGrid.innerHTML = visibleAssets
    .map(
      (asset) => `
        <article class="library-item" data-library-asset="${asset.id}" tabindex="0" draggable="true" title="双击${targetNode ? "引用到生成节点" : "添加到画布"}">
          <div class="library-item-preview">${assetPreview(asset)}</div>
          <div class="library-item-info">
            <span class="library-item-name">${escapeHtml(getAssetDisplayName(asset))}</span>
            <span class="library-item-kind">${assetTypeLabel(asset.type)}</span>
          </div>
          <button class="library-item-add" type="button" data-library-add="${asset.id}" title="${targetNode ? "引用到生成节点" : "添加到画布"}" aria-label="${targetNode ? "引用到生成节点" : "添加到画布"}">
            <i data-lucide="${targetNode ? "paperclip" : "plus"}" aria-hidden="true"></i>
          </button>
        </article>
      `,
    )
    .join("");
  refreshIcons();
}

function openAssetLibrary(targetNodeId = null) {
  state.libraryTargetNodeId = targetNodeId;
  assetLibraryPanel?.classList.remove("hidden");
  appShell?.classList.add("asset-library-open");
  railLibraryBtn?.classList.add("active");
  profileMenu?.classList.add("hidden");
  themeSubmenu?.classList.add("hidden");
  railProfileBtn?.classList.remove("active");
  renderAssetLibrary();
}

function closeAssetLibrary() {
  state.libraryTargetNodeId = null;
  assetLibraryPanel?.classList.add("hidden");
  appShell?.classList.remove("asset-library-open");
  railLibraryBtn?.classList.remove("active");
}

function addAssetToGeneratorNode(node, sourceAsset) {
  if (!node || node.kind !== "generator" || !sourceAsset) return;
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

function hydrateAssetMetadata(asset, nodeId) {
  if (!asset.url) return;

  if (asset.type === "image") {
    const image = new Image();
    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) return;
      asset.width = image.naturalWidth;
      asset.height = image.naturalHeight;
      asset.aspectRatio = image.naturalWidth / image.naturalHeight;
      if (!nodeId || state.nodes.some((node) => node.id === nodeId)) render();
    };
    image.src = asset.url;
    return;
  }

  if (asset.type === "audio") {
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      asset.duration = audio.duration;
      if (!nodeId || state.nodes.some((node) => node.id === nodeId)) render();
    };
    audio.src = asset.url;
    return;
  }

  if (asset.type !== "video") return;

  const video = document.createElement("video");
  video.preload = "metadata";
  video.onloadedmetadata = () => {
    if (!video.videoWidth || !video.videoHeight) return;
    asset.width = video.videoWidth;
    asset.height = video.videoHeight;
    asset.duration = video.duration;
    asset.aspectRatio = video.videoWidth / video.videoHeight;
    if (!nodeId || state.nodes.some((node) => node.id === nodeId)) render();
  };
  video.src = asset.url;
}

function audioWaveformBars(repeat = 1) {
  const heights = [6, 14, 18, 24, 36, 20, 12, 22, 18, 28, 8, 20, 16, 24, 18, 26, 10, 72, 118, 96, 34, 108, 72, 18, 88, 22, 28, 18, 16, 26, 10, 58, 28, 12, 8];
  return Array.from({ length: repeat })
    .flatMap(() => heights)
    .map((height, index) => `<i style="--h: ${height}px; --d: ${index * 36}ms"></i>`)
    .join("");
}

function createGeneratedAsset(node) {
  const base = simulationAssets[node.mode] || simulationAssets.image;
  const generated = {
    ...base,
    id: crypto.randomUUID(),
    displayName: node.mode === "video" ? "Generated video" : node.mode === "audio" ? "Generated audio" : "Generated image",
  };

  if (node.mode === "image") {
    const size = getGeneratedResolution(node);
    generated.width = size.width;
    generated.height = size.height;
    generated.aspectRatio = aspectStringToRatio(node.aspect);
    generated.url = `https://picsum.photos/seed/${encodeURIComponent(node.id)}/${size.width}/${size.height}`;
  }

  if (node.mode === "video") {
    generated.aspectRatio = aspectStringToRatio(node.aspect);
  }

  if (node.mode === "audio") {
    generated.duration = Number.parseInt(node.duration, 10) || 4;
    generated.aspectRatio = layoutRules.audioRatio;
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

  return `
    <div class="upload-stack">
      <div class="media-placeholder">
        <svg class="upload-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="4" y="5" width="16" height="14" rx="3" stroke="currentColor" stroke-width="2"/>
          <path d="M7 16l3.2-3.2 2.3 2.2 2.2-2.7L18 16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="16.5" cy="8.5" r="1.3" fill="currentColor"/>
        </svg>
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

  if (asset.type === "image" && asset.url) {
    return `<div class="media-content image"><img class="frame-media" src="${asset.url}" alt="" draggable="false" /></div>`;
  }

  if (asset.type === "video" && asset.url) {
    return `
      <div class="media-content video">
        <video class="frame-media" src="${asset.url}" controls playsinline preload="metadata" draggable="false"></video>
      </div>
    `;
  }

  if (asset.type === "audio") {
    return `
      <div class="media-content audio">
        <div class="audio-waveform" data-audio-waveform aria-hidden="true">
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
        ${asset.url ? `<audio class="frame-audio" src="${asset.url}" preload="metadata"></audio>` : ""}
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
  if (!node.assets?.length) return "";
  const assets = node.assets
    .map(
      (asset) => `
        <div class="asset-card ${asset.type} ${node.activeAssetId === asset.id ? "active" : ""}" data-action="focus-asset" data-value="${asset.id}" role="button" tabindex="0">
          <div class="asset-thumb">${assetPreview(asset)}</div>
          <div class="asset-meta">
            <span>${escapeHtml(getAssetDisplayName(asset))}</span>
            <small>${assetTypeLabel(asset.type)}</small>
          </div>
          <button class="asset-remove" data-action="remove-material" data-value="${asset.id}" type="button" title="移除">×</button>
        </div>
      `,
    )
    .join("");
  return `<div class="asset-shelf">${assets}</div>`;
}

function addFilesToGeneratorNode(node, files) {
  if (node.kind !== "generator") return;
  const accepted = createAssetsFromFiles(files);
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

function addMediaNodesFromFiles(files, clientX, clientY) {
  const accepted = createAssetsFromFiles(files);
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
  if (node.kind !== "generator") return;
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
  if (node.kind !== "generator") return;
  state.pendingUploadNodeId = node.id;
  state.pendingUploadMode = "generator";
  localAssetInput.value = "";
  localAssetInput.click();
}

function openLibraryUploadPicker() {
  state.pendingUploadNodeId = null;
  state.pendingUploadMode = "library";
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

function render() {
  syncGroups();
  nodeLayer.innerHTML = "";
  for (const group of state.groups) {
    const frame = createGroupFrameElement(group);
    if (frame) nodeLayer.appendChild(frame);
  }
  for (const node of state.nodes) {
    if (node.kind === "generator") {
      node.credits = getCost(node);
    }
    nodeLayer.appendChild(createNodeElement(node));
  }
  updateEmptyState();
  renderSelectionToolbar();
  renderMinimap();
  renderAssetLibrary();
  refreshIcons();
  requestAnimationFrame(syncPromptPanelLayouts);
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
        <button class="icon-toolbar-button" type="button" data-group-action="toggle-layout" aria-label="布局">
          <i data-lucide="layout-grid" aria-hidden="true"></i>
          <i data-lucide="chevron-down" aria-hidden="true"></i>
          <span class="toolbar-tip">布局</span>
        </button>
        <div class="toolbar-dropdown group-layout-menu ${group.layoutMenuOpen ? "" : "hidden"}">
          <button type="button" data-group-layout="grid"><i data-lucide="grid-3x3" aria-hidden="true"></i><span>宫格布局</span></button>
          <button type="button" data-group-layout="horizontal"><i data-lucide="align-horizontal-space-around" aria-hidden="true"></i><span>水平布局</span></button>
          <button type="button" data-group-layout="vertical"><i data-lucide="align-vertical-space-around" aria-hidden="true"></i><span>垂直布局</span></button>
        </div>
      </div>
      <button class="icon-toolbar-button primary" type="button" data-group-action="run" aria-label="整组执行">
        <i data-lucide="play" aria-hidden="true"></i>
        <span class="toolbar-tip">整组执行</span>
      </button>
      <button class="icon-toolbar-button" type="button" data-group-action="ungroup" aria-label="解组">
        <i data-lucide="ungroup" aria-hidden="true"></i>
        <span class="toolbar-tip">解组</span>
      </button>
    </div>
    <span class="group-resize-handle north" data-group-resize="n"></span>
    <span class="group-resize-handle east" data-group-resize="e"></span>
    <span class="group-resize-handle south" data-group-resize="s"></span>
    <span class="group-resize-handle west" data-group-resize="w"></span>
    <span class="group-resize-handle north-east" data-group-resize="ne"></span>
    <span class="group-resize-handle south-east" data-group-resize="se"></span>
    <span class="group-resize-handle south-west" data-group-resize="sw"></span>
    <span class="group-resize-handle north-west" data-group-resize="nw"></span>
  `;
  bindGroupFrameEvents(el, group);
  return el;
}

function bindGroupFrameEvents(el, group) {
  el.addEventListener("pointerdown", (event) => {
    if (event.button === 1 || (event.button === 0 && state.isSpaceDown)) {
      event.preventDefault();
      event.stopPropagation();
      beginPan(event);
      return;
    }

    if (event.button !== 0) return;
    event.stopPropagation();
    if (event.target.closest("button, .toolbar-dropdown")) {
      setActiveGroup(group.id);
      return;
    }

    const resizeHandle = event.target.closest("[data-group-resize]");
    if (resizeHandle) {
      const bounds = getGroupBounds(group);
      if (!bounds) return;
      state.action = {
        type: "resize-group",
        pointerId: event.pointerId,
        groupId: group.id,
        handle: resizeHandle.dataset.groupResize,
        startClientX: event.clientX,
        startClientY: event.clientY,
        origin: {
          x: bounds.left,
          y: bounds.top,
          width: bounds.width,
          height: bounds.height,
        },
        captureTarget: shell,
      };
      setActiveGroup(group.id);
      shell.setPointerCapture(event.pointerId);
      render();
      return;
    }

    const nodes = getGroupNodes(group);
    const bounds = getGroupBounds(group);
    setActiveGroup(group.id);
    state.action = {
      type: "group-drag-candidate",
      pointerId: event.pointerId,
      groupId: group.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      groupOrigin: bounds ? { x: bounds.left, y: bounds.top } : { x: group.x || 0, y: group.y || 0 },
      origins: nodes.map((node) => ({ id: node.id, x: node.x, y: node.y })),
    };
    shell.setPointerCapture(event.pointerId);
    render();
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
    }
  });
}

function getSelectedNodes() {
  return state.nodes.filter((node) => state.selectedIds.has(node.id));
}

function updateEmptyState() {
  if (!emptyState) return;
  emptyState.classList.toggle("hidden", state.nodes.length > 0);
}

function getSelectionBounds() {
  const selectedNodes = getSelectedNodes();
  if (selectedNodes.length < 2) return null;
  return selectedNodes.reduce(
    (bounds, node) => {
      const nodeBounds = getNodeBounds(node);
      return {
        left: Math.min(bounds.left, nodeBounds.left),
        top: Math.min(bounds.top, nodeBounds.top),
        right: Math.max(bounds.right, nodeBounds.right),
        bottom: Math.max(bounds.bottom, nodeBounds.bottom),
      };
    },
    { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
  );
}

function renderSelectionToolbar() {
  if (!selectionToolbar) return;
  const bounds = getSelectionBounds();
  if (!bounds) {
    selectionToolbar.classList.add("hidden");
    selectionSortMenu?.classList.add("hidden");
    return;
  }

  const shellRect = shell.getBoundingClientRect();
  const topLeft = worldToScreen(bounds.left, bounds.top);
  const topRight = worldToScreen(bounds.right, bounds.top);
  const toolbarX = (topLeft.x + topRight.x) / 2 - shellRect.left;
  const toolbarY = topLeft.y - shellRect.top - 44;
  selectionToolbar.style.left = `${toolbarX}px`;
  selectionToolbar.style.top = `${Math.max(74, toolbarY)}px`;
  selectionToolbar.classList.remove("hidden");
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
    </section>
  `;

  bindNodeEvents(el, node);
  return el;
}

function createGeneratorNodeElement(node) {
  const model = getModel(node);
  const layout = getNodeLayout(node);
  const selected = state.selectedIds.has(node.id);
  const el = document.createElement("article");
  el.className = `canvas-node generator-node ${node.mode}-mode ${selected ? "selected" : ""} ${node.groupId ? "grouped" : ""}`;
  el.style.left = `${node.x}px`;
  el.style.top = `${node.y}px`;
  el.style.width = `${layout.nodeWidth}px`;
  el.style.zIndex = String(node.z);
  el.dataset.id = node.id;
  const canGenerate = Boolean(node.prompt.trim()) && !node.generating;

  const promptPanel = node.expanded
    ? `
      <section class="prompt-panel ${node.promptLarge ? "large" : ""}" style="width: ${layout.panelWidth}px; height: ${layout.panelHeight}px; --prompt-scale: ${layout.promptScale}; --prompt-extra-height: ${(layout.panelHeight * (layout.promptScale - 1)).toFixed(2)}px;">
        <button class="asset-drop ${node.panel === "material" ? "active" : ""}" data-action="material-panel" type="button"><span>+</span><span>素材</span></button>
        <button class="expand-corner ${node.promptLarge ? "active" : ""}" data-action="toggle-large" type="button" title="${node.promptLarge ? "收起输入区" : "展开输入区"}">
          <i data-lucide="${node.promptLarge ? "minimize-2" : "maximize-2"}" aria-hidden="true"></i>
        </button>
        ${assetShelf(node)}
        <textarea class="prompt-input" style="${node.promptLarge ? `height: ${node.promptInputHeight}px;` : ""}" placeholder="描述你想生成的画面，也可以先添加参考素材">${escapeHtml(node.prompt)}</textarea>
        <div class="control-bar">
          <button class="control-chip model-chip ${node.panel === "model" ? "active" : ""}" data-action="model-panel" type="button">
            <span class="chip-icon">${model.icon}</span><span>${model.name}</span><span>⌃</span>
          </button>
          <button class="control-chip param-chip ${node.panel === "params" ? "active" : ""}" data-action="param-panel" type="button">${getParamLabel(node)} ⌃</button>
          <div class="control-spacer"></div>
          <button class="control-chip count-chip" data-action="count" type="button">${node.count}x</button>
          <button class="generate-button ${canGenerate ? "" : "disabled"}" data-action="generate" data-tooltip="${canGenerate ? "生成" : "请输入提示词"}" aria-disabled="${canGenerate ? "false" : "true"}" type="button">
            <span class="credit-mark">▰ ${node.credits}</span>
            <span class="send-arrow"><i data-lucide="arrow-up" aria-hidden="true"></i></span>
          </button>
        </div>
        ${node.panel === "material" ? materialPanel() : ""}
        ${node.panel === "model" ? modelPanel(node) : ""}
        ${node.panel === "params" ? paramPanel(node) : ""}
      </section>
    `
    : "";

  el.innerHTML = `
    <section class="media-frame generator-frame ${node.preview ? "has-preview" : ""}" style="width: ${layout.mediaWidth}px; height: ${layout.mediaHeight}px;" data-drag-handle="true">
      ${mediaEditToolbar(node, layout)}
      ${mediaMeta(node)}
      ${generatorMediaContent(node)}
    </section>
    ${promptPanel}
  `;

  bindNodeEvents(el, node);
  const promptInput = el.querySelector(".prompt-input");
  promptInput?.addEventListener("input", (event) => {
    node.prompt = event.currentTarget.value;
    syncGenerateButton(el.querySelector(".generate-button"), node);
    resizePromptTextarea(event.currentTarget, node);
  });
  if (node.promptLarge && promptInput) {
    requestAnimationFrame(() => resizePromptTextarea(promptInput, node));
  }

  el.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      handleAction(node, event.currentTarget.dataset.action, event.currentTarget.dataset.value);
    });
  });
  bindModelPanelEvents(el, node);

  return el;
}

function bindNodeEvents(el, node) {
  el.addEventListener("pointerdown", (event) => handleNodePointerDown(event, node.id));
  el.addEventListener("dragstart", (event) => event.preventDefault());
  bindMediaTitleEvents(el, node);
  bindAudioEvents(el);
  bindMediaToolbarEvents(el, node);
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
  const fileName = `${getMediaTitle(node, asset) || `reelay-${asset.type}`}.${asset.type === "image" ? "jpg" : asset.type === "video" ? "mp4" : "mp3"}`;
  try {
    const response = await fetch(asset.url);
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
    anchor.href = asset.url;
    anchor.target = "_blank";
    anchor.rel = "noopener";
    anchor.click();
  }
}

function addEditableMediaToLibrary(node) {
  const asset = getEditableMedia(node);
  if (!asset) return;
  const sourceId = asset.librarySourceId || asset.id;
  const exists = state.libraryAssets.some(
    (item) => item.id === sourceId || item.librarySourceId === sourceId,
  );
  if (exists) {
    showActionToast("该媒体已在项目资产中");
    return;
  }
  registerLibraryAssets(
    [
      {
        ...cloneAsset(asset, "generated"),
        librarySourceId: sourceId,
      },
    ],
    "project",
  );
  showActionToast("已加入项目资产");
}

function enhanceEditableMedia(node) {
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
    node.mediaMenuOpen = false;
    addEditableMediaToLibrary(node);
    render();
    return;
  }
  if (action === "enhance") {
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
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (node.kind === "asset") {
    const asset = getActiveAsset(node);
    if (asset) {
      asset.displayName = cleaned || getAssetDisplayName(asset);
    }
    return;
  }

  if (node.preview) {
    node.name = cleaned || defaultGeneratedName(node);
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

function completeSimulatedGeneration(nodeId) {
  const node = state.nodes.find((item) => item.id === nodeId);
  if (!node || node.kind !== "generator") return;
  node.generating = false;
  node.preview = true;
  node.generatedAsset = createGeneratedAsset(node);
  node.name = node.name || node.generatedAsset.displayName || defaultGeneratedName(node);
  render();
}

function syncGenerateButton(button, node) {
  if (!button || !node) return;
  const canGenerate = Boolean(node.prompt.trim()) && !node.generating;
  button.classList.toggle("disabled", !canGenerate);
  button.setAttribute("aria-disabled", canGenerate ? "false" : "true");
  button.dataset.tooltip = canGenerate ? "生成" : "请输入提示词";
}

function startSimulatedGeneration(node, options = {}) {
  const { charge = true } = options;
  if (!node.prompt.trim()) {
    showConfirmDialog({
      title: "缺少提示词",
      body: "请先填写提示词，再执行生成。",
      confirmText: "知道了",
      showCancel: false,
    });
    return false;
  }

  const cost = getCost(node);
  if (charge && !hasEnoughCredits(cost)) {
    showConfirmDialog({
      title: "积分不足",
      body: `当前可用积分为 ${formatCredit(state.account.credits)}，本次生成预计需要 ${formatCredit(cost)} 积分。`,
      confirmText: "知道了",
      showCancel: false,
    });
    return false;
  }

  if (charge) chargeCredits(cost);
  node.generating = true;
  node.preview = false;
  node.generatedAsset = null;
  node.panel = null;
  node.expanded = false;
  node.name = "";
  render();
  window.setTimeout(() => completeSimulatedGeneration(node.id), 900 + Math.round(Math.random() * 700));
  return true;
}

function modelPanel(node) {
  const types = [
    { id: "image", label: "图片" },
    { id: "video", label: "视频" },
    { id: "audio", label: "音频" },
  ];
  const activeType = node.modelFilter || node.mode;
  const activeIndex = Math.max(0, types.findIndex((type) => type.id === activeType));
  const sections = types
    .map((type) => {
      const options = models
        .filter((item) => item.type === type.id)
        .map(
          (item) => `
            <button class="model-option ${node.model === item.id ? "active" : ""}" data-action="model" data-value="${item.id}" type="button">
              <span class="model-icon">${item.icon}</span>
              <span>
                <span class="model-name">${item.name}</span>
                <span class="model-desc">${item.desc}</span>
              </span>
              <span class="checkmark">${node.model === item.id ? "✓" : ""}</span>
            </button>
          `,
        )
        .join("");
      return `
        <section class="model-section" data-model-section="${type.id}">
          <div class="model-section-title">${type.label}模型</div>
          ${options}
        </section>
      `;
    })
    .join("");

  return `
    <div class="panel-popover model-panel">
      <div class="panel-title">选择模型</div>
      <div class="mode-tabs" style="--active-index: ${activeIndex}">
        <span class="mode-tab-indicator" aria-hidden="true"></span>
        ${types
          .map(
            (type) =>
              `<button class="mode-tab ${activeType === type.id ? "active" : ""}" data-model-jump="${type.id}" type="button">${type.label}</button>`,
          )
          .join("")}
      </div>
      <div class="model-list">${sections}</div>
    </div>
  `;
}

function bindModelPanelEvents(element, node) {
  const panel = element.querySelector(".model-panel");
  const list = panel?.querySelector(".model-list");
  const tabs = panel?.querySelector(".mode-tabs");
  if (!panel || !list || !tabs) return;

  const types = ["image", "video", "audio"];
  const setActiveType = (type) => {
    const index = Math.max(0, types.indexOf(type));
    node.modelFilter = types[index];
    tabs.style.setProperty("--active-index", String(index));
    tabs.querySelectorAll("[data-model-jump]").forEach((button) => {
      button.classList.toggle("active", button.dataset.modelJump === node.modelFilter);
    });
  };

  const jumpTo = (type, smooth = true) => {
    const section = list.querySelector(`[data-model-section="${type}"]`);
    if (!section) return;
    setActiveType(type);
    list.scrollTo({
      top: Math.max(0, section.offsetTop - list.offsetTop - 8),
      behavior: smooth ? "smooth" : "auto",
    });
  };

  tabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-model-jump]");
    if (!button) return;
    event.stopPropagation();
    jumpTo(button.dataset.modelJump);
  });

  list.addEventListener("scroll", () => {
    const marker = list.scrollTop + Math.min(160, list.clientHeight * 0.48);
    let visibleType = types[0];
    for (const type of types) {
      const section = list.querySelector(`[data-model-section="${type}"]`);
      if (section && section.offsetTop - list.offsetTop <= marker) visibleType = type;
    }
    if (visibleType !== node.modelFilter) setActiveType(visibleType);
  });

  requestAnimationFrame(() => jumpTo(node.mode, false));
}

function materialPanel() {
  return `
    <div class="material-panel">
      <button class="material-option" data-action="material" data-value="local" type="button">
        <span class="material-icon">↑</span><span>从本地上传</span>
      </button>
      <button class="material-option" data-action="material" data-value="library" type="button">
        <span class="material-icon">◇</span><span>从资产库添加</span>
      </button>
      <button class="material-option" data-action="material" data-value="canvas" type="button">
        <span class="material-icon">⌖</span><span>从画布中选择</span>
      </button>
    </div>
  `;
}

function paramPanel(node) {
  normalizeNodeParameters(node);
  const sections =
    node.mode === "audio"
      ? [parameterSection(node, "时长", "duration", getCapabilityValues(node, "durations"))]
      : [
          parameterSection(node, "比例", "aspect", getCapabilityValues(node, "aspects")),
          node.mode === "video"
            ? parameterSection(node, "画质", "quality", getCapabilityValues(node, "qualities"))
            : parameterSection(node, "分辨率", "resolution", getCapabilityValues(node, "resolutions")),
          node.mode === "image" && getCapabilityValues(node, "qualities").length
            ? parameterSection(node, "生成质量", "quality", getCapabilityValues(node, "qualities"))
            : "",
          node.mode === "video"
            ? parameterSection(node, "时长", "duration", getCapabilityValues(node, "durations"))
            : "",
        ];
  return `
    <div class="panel-popover param-panel">
      <div class="panel-title">参数</div>
      <div class="param-section">${sections.join("")}</div>
    </div>
  `;
}

function parameterSection(node, label, action, values) {
  if (!values?.length) return "";
  return `
    <div class="param-heading">${label}</div>
    <div class="segmented" style="grid-template-columns: repeat(${Math.min(values.length, 5)}, minmax(0, 1fr))">
      ${values.map((value) => paramButton(node, action, value)).join("")}
    </div>
  `;
}

function paramButton(node, action, value) {
  return `<button class="${node[action] === value ? "active" : ""}" data-action="${action}" data-value="${value}" type="button">${value}</button>`;
}

function handleAction(node, action, value) {
  if (node.kind !== "generator") return;

  switch (action) {
    case "toggle-large":
      node.promptLarge = !node.promptLarge;
      node.panel = null;
      break;
    case "material-panel":
      node.expanded = true;
      node.panel = node.panel === "material" ? null : "material";
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
      node.modelFilter = node.mode;
      node.panel = node.panel === "model" ? null : "model";
      break;
    case "param-panel":
      node.expanded = true;
      node.panel = node.panel === "params" ? null : "params";
      break;
    case "generate":
      if (!node.prompt.trim() || node.generating) return;
      startSimulatedGeneration(node);
      break;
    case "count":
      {
        const counts = getCapabilityValues(node, "counts");
        const currentIndex = counts.indexOf(node.count);
        node.count = counts[(currentIndex + 1) % counts.length] || 1;
      }
      rememberPreset(node);
      break;
    case "model": {
      const selected = models.find((item) => item.id === value);
      if (!selected) return;
      const previousDefaultName = defaultGeneratedName(node);
      node.model = selected.id;
      node.mode = selected.type;
      normalizeNodeParameters(node);
      if (node.preview && (!node.name || node.name === previousDefaultName)) {
        node.name = defaultGeneratedName(node);
      }
      node.modelFilter = selected.type;
      node.panel = null;
      rememberPreset(node);
      break;
    }
    case "aspect":
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
  render();
}

function handleNodePointerDown(event, nodeId) {
  if (event.button === 1 || (event.button === 0 && state.isSpaceDown)) {
    event.preventDefault();
    event.stopPropagation();
    beginPan(event);
    return;
  }

  if (event.button !== 0) return;
  event.stopPropagation();

  const target = event.target;
  const node = state.nodes.find((item) => item.id === nodeId);
  if (!node) return;

  const isControl = target.closest("button, textarea, input, [contenteditable='true'], .panel-popover, .material-panel, .asset-card, audio, .media-title, .media-spec");
  if (isControl) {
    state.activeId = nodeId;
    bringNodesToFront([node]);
    const nodeElement = target.closest(".canvas-node");
    if (nodeElement) nodeElement.style.zIndex = String(node.z);
    return;
  }

  const wasSelected = state.selectedIds.has(nodeId);
  let nextSelection = [...state.selectedIds];

  if (event.shiftKey) {
    if (wasSelected && state.selectedIds.size > 1) {
      nextSelection = nextSelection.filter((id) => id !== nodeId);
    } else if (!wasSelected) {
      nextSelection.push(nodeId);
    }
  } else if (!wasSelected || state.selectedIds.size <= 1) {
    nextSelection = [nodeId];
  }

  setSelection(nextSelection, nodeId);
  collapseInactiveNodes(nodeId);

  if (node.kind === "generator" && target.closest(".media-frame")) {
    node.expanded = true;
    node.panel = null;
    rememberPreset(node);
  }

  const selectedNodes = state.nodes.filter((item) => state.selectedIds.has(item.id));
  const activeNode = selectedNodes.find((item) => item.id === nodeId);
  const nodesToPromote = selectedNodes.filter((item) => item.id !== nodeId);
  if (activeNode) nodesToPromote.push(activeNode);
  bringNodesToFront(nodesToPromote);

  state.action = {
    type: "drag-candidate",
    pointerId: event.pointerId,
    ids: selectedNodes.map((item) => item.id),
    activeId: nodeId,
    altKey: event.altKey,
    startClientX: event.clientX,
    startClientY: event.clientY,
    origins: selectedNodes.map((item) => ({ id: item.id, x: item.x, y: item.y })),
  };
  shell.setPointerCapture(event.pointerId);
  render();
}

function addNodeAt(clientX, clientY, mode = "image") {
  const world = screenToWorld(clientX, clientY);
  const node = defaultGeneratorNode(0, 0, state.lastPreset.mode || mode);
  applyPreset(node, state.lastPreset);
  const layout = getNodeLayout(node);
  const totalHeight = layout.mediaHeight + layout.panelGap + layout.panelHeight;
  node.x = world.x - layout.nodeWidth / 2;
  node.y = world.y - totalHeight / 2;
  collapseAllGeneratorPanels();
  state.nodes.push(node);
  bringNodesToFront([node]);
  setSelection([node.id], node.id);
  render();
  return node;
}

function cloneNodeState(node) {
  return {
    ...node,
    assets: (node.assets || []).map((asset) => ({ ...asset })),
    generatedAsset: node.generatedAsset ? { ...node.generatedAsset } : null,
  };
}

function cloneGroupState(group) {
  return {
    ...group,
    nodeIds: [...group.nodeIds],
    layoutMenuOpen: false,
  };
}

function deleteSelectedNodes(confirmed = false) {
  if (state.activeGroupId && !state.selectedIds.size) {
    ungroup(state.activeGroupId);
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

  const deleted = state.nodes
    .map((node, index) => ({ node, index }))
    .filter((item) => state.selectedIds.has(item.node.id))
    .map((item) => ({ index: item.index, node: cloneNodeState(item.node) }));
  const deletedGroups = state.groups
    .filter((group) => group.nodeIds.some((id) => state.selectedIds.has(id)))
    .map((group) => cloneGroupState(group));

  if (!deleted.length) return;
  state.undoStack.push({ type: "delete", deleted, deletedGroups });
  state.nodes = state.nodes.filter((node) => !state.selectedIds.has(node.id));
  state.groups = state.groups.filter((group) => !deletedGroups.some((item) => item.id === group.id));
  clearSelection();
  state.activeGroupId = null;
  render();
  showUndoToast();
}

function undoLastDelete() {
  const lastDeleteIndex = state.undoStack.map((item) => item.type).lastIndexOf("delete");
  if (lastDeleteIndex === -1) return;
  const action = state.undoStack.splice(lastDeleteIndex, 1)[0];
  const restored = action.deleted
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((item) => cloneNodeState(item.node));

  for (const item of action.deleted.slice().sort((a, b) => a.index - b.index)) {
    state.nodes.splice(Math.min(item.index, state.nodes.length), 0, cloneNodeState(item.node));
  }
  const restoredGroups = (action.deletedGroups || []).map((group) => cloneGroupState(group));
  const restoredGroupIds = new Set(restoredGroups.map((group) => group.id));
  state.groups = state.groups.filter((group) => !restoredGroupIds.has(group.id));
  state.groups.push(...restoredGroups);
  setSelection(restored.map((node) => node.id), restored[0]?.id || null);
  hideUndoToast();
  render();
}

function showUndoToast() {
  if (!undoToast) return;
  undoToast.classList.remove("hidden");
  window.clearTimeout(showUndoToast.timeoutId);
  showUndoToast.timeoutId = window.setTimeout(() => {
    undoToast.classList.add("hidden");
  }, 4200);
}

function hideUndoToast() {
  if (!undoToast) return;
  undoToast.classList.add("hidden");
  window.clearTimeout(showUndoToast.timeoutId);
}

function showConfirmDialog({ title, body, confirmText = "确认", cancelText = "取消", danger = false, showCancel = true, onConfirm }) {
  document.querySelector(".confirm-layer")?.remove();
  const layer = document.createElement("div");
  layer.className = "confirm-layer";
  layer.innerHTML = `
    <div class="confirm-dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <div class="confirm-title">${escapeHtml(title)}</div>
      <div class="confirm-body">${escapePlainText(body)}</div>
      <div class="confirm-actions">
        ${showCancel ? `<button class="confirm-cancel" type="button">${escapeHtml(cancelText)}</button>` : ""}
        <button class="confirm-ok ${danger ? "danger" : ""}" type="button">${escapeHtml(confirmText)}</button>
      </div>
    </div>
  `;
  document.body.appendChild(layer);

  const close = () => layer.remove();
  layer.querySelector(".confirm-cancel")?.addEventListener("click", close);
  layer.addEventListener("pointerdown", (event) => {
    if (event.target === layer) close();
  });
  layer.querySelector(".confirm-ok")?.addEventListener("click", () => {
    close();
    onConfirm?.();
  });
}

function escapePlainText(value) {
  return escapeHtml(String(value)).replaceAll("\n", "<br>");
}

function getConversation(id) {
  return agentConversations.find((item) => item.id === id) || agentConversations[0];
}

function renderAgentMessages(conversation = getConversation(state.activeConversationId)) {
  if (!agentMessages) return;
  if (!conversation.messages.length) {
    agentMessages.innerHTML = `
      <div class="agent-start-state">
        <div class="agent-start-brand">Reelay 立画</div>
        <div class="agent-start-title">开始创作</div>
        <div class="agent-start-subtitle">描述你想要生成的内容</div>
      </div>
    `;
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

function setAgentConversation(id) {
  const conversation = getConversation(id);
  state.activeConversationId = conversation.id;
  if (agentConversationTitle) {
    agentConversationTitle.textContent = conversation.title;
  }
  agentHistoryList?.querySelectorAll(".history-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.chatId === conversation.id);
  });
  renderAgentMessages(conversation);
  agentHistoryMenu?.classList.add("hidden");
}

function filterAgentHistory(keyword = "") {
  const normalizedKeyword = keyword.trim().toLowerCase();
  agentHistoryList?.querySelectorAll(".history-item").forEach((item) => {
    const visible = !normalizedKeyword || item.textContent.toLowerCase().includes(normalizedKeyword);
    item.classList.toggle("hidden", !visible);
  });
}

function sendAgentMessage() {
  const content = agentInput?.value.trim();
  if (!content) return;
  const conversation = getConversation(state.activeConversationId);
  conversation.messages.push({ role: "user", content });
  conversation.messages.push({
    role: "agent",
    content: "我已收到。后续可以把这条需求拆成画布节点、素材输入和生成参数。",
  });
  agentInput.value = "";
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

function getAgentModel() {
  return getSelectedAgentModels()[0] || models[0];
}

function syncAgentModelButton() {
  if (!agentModelBtn) return;
  const selectedModels = getSelectedAgentModels();
  const names = selectedModels.map((model) => model.name);
  const label =
    names.length > 2
      ? `已选模型：${names.slice(0, 2).join("、")} 等 ${names.length} 个`
      : `已选模型：${names.join("、") || "未选择"}`;
  agentModelBtn.title = label;
  agentModelBtn.setAttribute("aria-label", label);
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
        <span class="agent-model-provider"><i data-lucide="aperture" aria-hidden="true"></i></span>
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
          <input type="checkbox" />
          <i aria-hidden="true"></i>
        </label>
      </div>
      <div class="agent-model-tabs" role="tablist" aria-label="模型类型">
        <button class="${activeTab === "image" ? "active" : ""}" type="button" data-agent-model-tab="image">Image</button>
        <button class="${activeTab === "video" ? "active" : ""}" type="button" data-agent-model-tab="video">Video</button>
      </div>
    </div>
    <div class="agent-model-scroll">
      <div class="agent-model-section ${activeTab === "image" ? "" : "hidden"}" data-agent-model-section="image">
        <div class="agent-model-section-label">Image</div>
        <div class="agent-model-list">${imageModels.map(renderOption).join("")}</div>
      </div>
      <div class="agent-model-section ${activeTab === "video" ? "" : "hidden"}" data-agent-model-section="video">
        <div class="agent-model-section-label">Video</div>
        <div class="agent-model-list">${videoModels.map(renderOption).join("")}</div>
      </div>
    </div>
  `;
  refreshIcons();
}

function toggleAgentModel(modelId) {
  const selected = models.find((item) => item.id === modelId);
  if (!selected) return;
  const scrollTop = agentModelMenu?.querySelector(".agent-model-scroll")?.scrollTop || 0;
  const selectedIds = getSelectedAgentModelIds();
  const exists = selectedIds.includes(selected.id);
  if (exists && selectedIds.length > 1) {
    state.agentModelIds = selectedIds.filter((id) => id !== selected.id);
  } else if (!exists) {
    state.agentModelIds = [...selectedIds, selected.id];
  } else {
    state.agentModelIds = selectedIds;
  }
  state.agentModelId = state.agentModelIds[0] || selected.id;
  syncAgentModelButton();
  renderAgentModelMenu();
  const nextScroll = agentModelMenu?.querySelector(".agent-model-scroll");
  if (nextScroll) nextScroll.scrollTop = scrollTop;
}

function setAgentModelTab(tab) {
  if (!agentModelMenu) return;
  state.agentModelTab = tab === "video" ? "video" : "image";
  agentModelMenu.querySelectorAll("[data-agent-model-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.agentModelTab === state.agentModelTab);
  });
  agentModelMenu.querySelectorAll("[data-agent-model-section]").forEach((section) => {
    section.classList.toggle("hidden", section.dataset.agentModelSection !== state.agentModelTab);
  });
  const scroll = agentModelMenu.querySelector(".agent-model-scroll");
  if (scroll) scroll.scrollTop = 0;
}

function getResolvedTheme(mode = state.themeMode) {
  if (mode === "system") {
    return systemThemeQuery.matches ? "light" : "dark";
  }
  return mode === "light" ? "light" : "dark";
}

function applyTheme(mode = state.themeMode) {
  state.themeMode = mode;
  localStorage.setItem("reelay-theme-mode", mode);
  document.documentElement.dataset.theme = getResolvedTheme(mode);
  document.documentElement.dataset.themeMode = mode;
  const themeLabels = {
    light: "浅色",
    dark: "深色",
    system: "跟随系统",
  };
  if (themeCurrentLabel) themeCurrentLabel.textContent = themeLabels[mode] || "深色";
  themeSubmenu?.querySelectorAll("[data-theme-choice]").forEach((button) => {
    button.classList.toggle("active", button.dataset.themeChoice === mode);
  });
}

function positionThemeSubmenu() {
  const trigger = profileMenu?.querySelector("[data-profile-action='appearance']");
  if (!trigger || !themeSubmenu) return;
  const rect = trigger.getBoundingClientRect();
  themeSubmenu.style.left = `${Math.max(8, rect.left - 162)}px`;
  themeSubmenu.style.top = `${rect.top - 2}px`;
  themeSubmenu.style.bottom = "auto";
}

function setAgentWidth(width) {
  state.agentWidth = clamp(width, 340, 640);
  agentDock?.style.setProperty("--agent-width", `${state.agentWidth}px`);
  appShell?.style.setProperty("--agent-width", `${state.agentWidth}px`);
}

function setAgentOpen(open) {
  state.agentOpen = open;
  if (!agentDock) return;
  appShell?.classList.toggle("agent-open", open);
  agentDock.classList.toggle("collapsed", !open);
  agentDock.classList.toggle("open", open);
  if (!open) {
    agentHistoryMenu?.classList.add("hidden");
  }
}

function addNodeAtViewportCenter() {
  const rect = shell.getBoundingClientRect();
  return addNodeAt(rect.left + rect.width / 2, rect.top + rect.height / 2);
}

async function shareProject() {
  const shareData = {
    title: `${state.projectName} · Reelay Canvas`,
    text: "查看这个 Reelay Canvas 创作项目",
    url: window.location.href,
  };
  if (navigator.share) {
    try {
      await navigator.share(shareData);
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(shareData.url);
    showActionToast("分享链接已复制");
  } catch {
    showActionToast("暂时无法复制分享链接");
  }
}

function beginProjectRename() {
  if (!projectTitle) return;
  projectTitle.contentEditable = "true";
  projectTitle.classList.add("editing");
  projectTitle.focus();
  const range = document.createRange();
  range.selectNodeContents(projectTitle);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function commitProjectRename() {
  if (!projectTitle || projectTitle.contentEditable !== "true") return;
  const nextName = projectTitle.textContent.trim() || "Untitled";
  state.projectName = nextName;
  projectTitle.textContent = nextName;
  projectTitle.contentEditable = "false";
  projectTitle.classList.remove("editing");
  document.title = `${nextName} · Reelay Canvas`;
}

function groupSelectedNodes() {
  const selectedNodes = getSelectedNodes();
  if (selectedNodes.length < 2) return;
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
  const selectedNodes = getSelectedNodes();
  if (selectedNodes.length < 2) return;
  arrangeNodes(selectedNodes, layout);
  bringNodesToFront(selectedNodes);
  render();
}

function arrangeGroup(group, layout = "grid") {
  const groupNodes = getGroupNodes(group);
  if (groupNodes.length < 2) return;
  group.layoutMenuOpen = false;
  arrangeNodes(groupNodes, layout);
  bringNodesToFront(groupNodes);
  setActiveGroup(group.id);
  render();
}

function ungroup(groupId) {
  const group = getGroupById(groupId);
  if (!group) return;
  for (const node of getGroupNodes(group)) {
    if (node.groupId === groupId) delete node.groupId;
  }
  state.groups = state.groups.filter((item) => item.id !== groupId);
  state.activeGroupId = null;
  render();
}

function requestRunGroup(group) {
  const generators = getGroupNodes(group).filter((node) => node.kind === "generator");
  if (!generators.length) {
    showConfirmDialog({
      title: "无法整组执行",
      body: "当前组内没有生成节点。请先把图片生成或视频生成节点放入组内。",
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

  const totalCredits = generators.reduce((sum, node) => sum + getCost(node), 0);
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
      chargeCredits(totalCredits);
      generators.forEach((node) => startSimulatedGeneration(node, { charge: false }));
      setActiveGroup(group.id);
      render();
    },
  });
}

function isCanvasSurface(target) {
  return target === shell || target === stage || target === nodeLayer;
}

function shouldBypassCanvasWheel(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      [
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
        ".theme-popover",
        ".canvas-tool-popover",
        ".toolbar-dropdown",
        ".selection-toolbar",
        ".group-toolbar",
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

function beginPan(event) {
  state.action = {
    type: "pan",
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    tx: state.tx,
    ty: state.ty,
  };
  shell.classList.add("dragging");
  try {
    shell.setPointerCapture(event.pointerId);
  } catch {
    try {
      event.currentTarget?.setPointerCapture?.(event.pointerId);
    } catch {
      // Some synthetic or browser-specific pointer events cannot be captured.
    }
  }
}

function beginMarquee(event) {
  const rect = shell.getBoundingClientRect();
  state.action = {
    type: "marquee",
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    localStartX: event.clientX - rect.left,
    localStartY: event.clientY - rect.top,
    additive: event.shiftKey,
    baseSelection: new Set(state.selectedIds),
    moved: false,
  };
  shell.setPointerCapture(event.pointerId);
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

function updateSelectionBox(action, event) {
  const rect = shell.getBoundingClientRect();
  const localX = event.clientX - rect.left;
  const localY = event.clientY - rect.top;
  const left = Math.min(action.localStartX, localX);
  const top = Math.min(action.localStartY, localY);
  const width = Math.abs(localX - action.localStartX);
  const height = Math.abs(localY - action.localStartY);

  selectionBox.style.left = `${left}px`;
  selectionBox.style.top = `${top}px`;
  selectionBox.style.width = `${width}px`;
  selectionBox.style.height = `${height}px`;
  selectionBox.classList.remove("hidden");
}

function selectNodesInMarquee(action, event) {
  const a = screenToWorld(action.startClientX, action.startClientY);
  const b = screenToWorld(event.clientX, event.clientY);
  const marquee = {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    right: Math.max(a.x, b.x),
    bottom: Math.max(a.y, b.y),
  };
  const hitIds = state.nodes.filter((node) => rectsIntersect(marquee, getNodeBounds(node))).map((node) => node.id);
  const selectedIds = action.additive ? [...action.baseSelection, ...hitIds] : hitIds;
  setSelection(selectedIds);
  collapseAllGeneratorPanels();
}

function promoteDragCandidate(action, event) {
  const sourceNodes = action.ids
    .map((id) => state.nodes.find((node) => node.id === id))
    .filter(Boolean);
  if (!sourceNodes.length) {
    state.action = null;
    return;
  }

  let draggedNodes = sourceNodes;
  let origins = action.origins;

  if (action.altKey) {
    draggedNodes = sourceNodes.map((node) => cloneNode(node));
    state.nodes.push(...draggedNodes);
    origins = draggedNodes.map((node) => ({ id: node.id, x: node.x, y: node.y }));
    setSelection(draggedNodes.map((node) => node.id), draggedNodes.find((node) => node.kind === "generator")?.id || draggedNodes[0].id);
    render();
  }

  bringNodesToFront(draggedNodes);
  state.action = {
    type: "drag-nodes",
    pointerId: action.pointerId,
    ids: draggedNodes.map((node) => node.id),
    startClientX: action.startClientX,
    startClientY: action.startClientY,
    origins,
  };
  shell.classList.add("dragging");
  moveDraggedNodes(state.action, event);
}

function moveDraggedNodes(action, event) {
  const dx = (event.clientX - action.startClientX) / state.scale;
  const dy = (event.clientY - action.startClientY) / state.scale;

  for (const origin of action.origins) {
    const node = state.nodes.find((item) => item.id === origin.id);
    if (!node) continue;
    node.x = origin.x + dx;
    node.y = origin.y + dy;
    const nodeElement = nodeLayer.querySelector(`[data-id="${node.id}"]`);
    if (nodeElement) {
      nodeElement.style.left = `${node.x}px`;
      nodeElement.style.top = `${node.y}px`;
      nodeElement.style.zIndex = String(node.z);
    }
  }
  renderSelectionToolbar();
  renderMinimap();
}

function promoteGroupDrag(action, event) {
  const group = getGroupById(action.groupId);
  if (!group) {
    state.action = null;
    return;
  }
  state.action = {
    type: "drag-group",
    pointerId: action.pointerId,
    groupId: action.groupId,
    startClientX: action.startClientX,
    startClientY: action.startClientY,
    groupOrigin: action.groupOrigin,
    origins: action.origins,
  };
  shell.classList.add("dragging");
  moveGroupNodes(state.action, event);
}

function moveGroupNodes(action, event) {
  const dx = (event.clientX - action.startClientX) / state.scale;
  const dy = (event.clientY - action.startClientY) / state.scale;
  const group = getGroupById(action.groupId);
  if (group && action.groupOrigin) {
    group.x = action.groupOrigin.x + dx;
    group.y = action.groupOrigin.y + dy;
  }
  for (const origin of action.origins) {
    const node = state.nodes.find((item) => item.id === origin.id);
    if (!node) continue;
    node.x = origin.x + dx;
    node.y = origin.y + dy;
  }
  render();
}

function resizeGroupFrame(action, event) {
  const group = getGroupById(action.groupId);
  if (!group) return;

  const dx = (event.clientX - action.startClientX) / state.scale;
  const dy = (event.clientY - action.startClientY) / state.scale;
  const handle = action.handle || "";
  let nextX = action.origin.x;
  let nextY = action.origin.y;
  let nextWidth = action.origin.width;
  let nextHeight = action.origin.height;

  if (handle.includes("e")) {
    nextWidth = action.origin.width + dx;
  }
  if (handle.includes("s")) {
    nextHeight = action.origin.height + dy;
  }
  if (handle.includes("w")) {
    nextX = action.origin.x + dx;
    nextWidth = action.origin.width - dx;
  }
  if (handle.includes("n")) {
    nextY = action.origin.y + dy;
    nextHeight = action.origin.height - dy;
  }

  if (nextWidth < groupFrameRules.minWidth) {
    if (handle.includes("w")) nextX = action.origin.x + action.origin.width - groupFrameRules.minWidth;
    nextWidth = groupFrameRules.minWidth;
  }
  if (nextHeight < groupFrameRules.minHeight) {
    if (handle.includes("n")) nextY = action.origin.y + action.origin.height - groupFrameRules.minHeight;
    nextHeight = groupFrameRules.minHeight;
  }

  group.x = nextX;
  group.y = nextY;
  group.width = nextWidth;
  group.height = nextHeight;
  render();
}

function rectContainsPoint(rect, point) {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

function getNodeCenter(node) {
  const bounds = getNodeBounds(node);
  return {
    x: bounds.left + bounds.width / 2,
    y: bounds.top + bounds.height / 2,
  };
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
  const center = getNodeCenter(node);
  return state.groups
    .map((group) => ({ group, bounds: getGroupBounds(group) }))
    .filter((item) => item.bounds && rectContainsPoint(item.bounds, center))
    .sort((a, b) => {
      const areaA = a.bounds.width * a.bounds.height;
      const areaB = b.bounds.width * b.bounds.height;
      return areaA - areaB;
    })[0]?.group || null;
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

function handlePointerMove(event) {
  const action = state.action;
  if (!action) return;

  if (action.type === "drag-candidate") {
    const distance = Math.hypot(event.clientX - action.startClientX, event.clientY - action.startClientY);
    if (distance < 4) return;
    promoteDragCandidate(action, event);
    return;
  }

  if (action.type === "group-drag-candidate") {
    const distance = Math.hypot(event.clientX - action.startClientX, event.clientY - action.startClientY);
    if (distance < 4) return;
    promoteGroupDrag(action, event);
    return;
  }

  if (action.type === "drag-group") {
    moveGroupNodes(action, event);
    return;
  }

  if (action.type === "resize-group") {
    resizeGroupFrame(action, event);
    return;
  }

  if (action.type === "drag-nodes") {
    moveDraggedNodes(action, event);
    return;
  }

  if (action.type === "marquee") {
    const distance = Math.hypot(event.clientX - action.startClientX, event.clientY - action.startClientY);
    if (distance < 4) return;
    action.moved = true;
    updateSelectionBox(action, event);
    selectNodesInMarquee(action, event);
    render();
    return;
  }

  if (action.type === "pan") {
    state.tx = action.tx + event.clientX - action.startClientX;
    state.ty = action.ty + event.clientY - action.startClientY;
    applyTransform();
    return;
  }

  if (action.type === "minimap-drag") {
    moveMinimapDrag(event);
    return;
  }

  if (action.type === "resize-agent") {
    setAgentWidth(action.startWidth + action.startClientX - event.clientX);
  }
}

function finishPointerInteraction(event) {
  const action = state.action;
  if (!action) return;

  if (action.type === "marquee") {
    selectionBox.classList.add("hidden");
    if (!action.moved) {
      clearSelection();
      collapseAllGeneratorPanels();
    }
    render();
  } else if (action.type === "drag-nodes") {
    updateDraggedNodeGroupMembership(action.ids);
    render();
  } else if (action.type === "drag-group" || action.type === "resize-group") {
    render();
  }

  state.action = null;
  shell.classList.remove("dragging");
  try {
    (action.captureTarget || shell).releasePointerCapture(event.pointerId);
  } catch {
    // Pointer capture may already be released by the browser.
  }
}

shell.addEventListener("pointerdown", (event) => {
  if (!isCanvasSurface(event.target)) return;

  if (event.button === 1 || state.isSpaceDown) {
    event.preventDefault();
    beginPan(event);
    return;
  }

  if (event.button !== 0) return;
  const activeNode = getActiveNode();
  if (activeNode?.kind === "generator" && activeNode.panel) {
    activeNode.panel = null;
    render();
    return;
  }

  beginMarquee(event);
});

window.addEventListener("pointermove", handlePointerMove);
shell.addEventListener("pointerup", finishPointerInteraction);
window.addEventListener("pointerup", finishPointerInteraction);
window.addEventListener("pointercancel", finishPointerInteraction);

shell.addEventListener("dblclick", (event) => {
  if (event.target instanceof Element && event.target.closest(".canvas-node")) return;
  addNodeAt(event.clientX, event.clientY);
});

shell.addEventListener(
  "wheel",
  (event) => {
    if (shouldBypassCanvasWheel(event.target)) return;
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      setCanvasZoom(state.scale * (event.deltaY > 0 ? 0.92 : 1.08), event.clientX, event.clientY);
      return;
    }

    const horizontalDelta = event.shiftKey && Math.abs(event.deltaX) < 1 ? event.deltaY : event.deltaX;
    const verticalDelta = event.shiftKey && Math.abs(event.deltaX) < 1 ? 0 : event.deltaY;
    state.tx -= horizontalDelta;
    state.ty -= verticalDelta;
    applyTransform();
  },
  { passive: false },
);

window.addEventListener(
  "wheel",
  (event) => {
    if (!(event.ctrlKey || event.metaKey) || !shouldBypassCanvasWheel(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
  },
  { passive: false, capture: true },
);

window.addEventListener("keydown", (event) => {
  const target = event.target;
  const isTyping = target instanceof Element && target.closest("input, textarea, [contenteditable='true']");
  if (isTyping) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    undoLastDelete();
    return;
  }

  if (event.ctrlKey || event.metaKey) {
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      setCanvasZoom(state.scale * 1.12);
      return;
    }
    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      setCanvasZoom(state.scale / 1.12);
      return;
    }
    if (event.key === "0") {
      event.preventDefault();
      setCanvasZoom(1);
      return;
    }
  }

  if (event.code === "Space") {
    state.isSpaceDown = true;
    shell.classList.add("space-pan");
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
  if (state.pendingUploadMode === "generator") {
    const node = state.nodes.find((item) => item.id === state.pendingUploadNodeId);
    if (node) addFilesToGeneratorNode(node, files);
  } else if (state.pendingUploadMode === "library") {
    const accepted = createAssetsFromFiles(files);
    registerLibraryAssets(accepted);
    accepted.forEach((asset) => hydrateAssetMetadata(asset, null));
    openAssetLibrary();
  }
  state.pendingUploadNodeId = null;
  state.pendingUploadMode = null;
});

window.addEventListener("dragover", (event) => {
  if (!hasDraggedFiles(event) && !hasDraggedLibraryAsset(event)) return;
  event.preventDefault();
  shell.classList.add("file-dragging");
});

window.addEventListener("dragleave", (event) => {
  if (event.clientX !== 0 && event.clientY !== 0) return;
  shell.classList.remove("file-dragging");
});

window.addEventListener("drop", (event) => {
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
    addFilesToGeneratorNode(targetNode, files);
    return;
  }

  addMediaNodesFromFiles(files, event.clientX, event.clientY);
});

emptyCreateBtn?.addEventListener("click", () => {
  addNodeAtViewportCenter();
});

railLibraryBtn?.addEventListener("click", () => {
  if (assetLibraryPanel?.classList.contains("hidden")) {
    openAssetLibrary();
  } else {
    closeAssetLibrary();
  }
});

assetLibraryCloseBtn?.addEventListener("click", closeAssetLibrary);
assetLibraryUploadBtn?.addEventListener("click", openLibraryUploadPicker);
assetLibraryPanel?.addEventListener("pointerdown", (event) => {
  event.stopPropagation();
});
assetLibraryPanel?.addEventListener("click", (event) => {
  const scope = event.target.closest("[data-library-scope]")?.dataset.libraryScope;
  if (scope) {
    state.libraryScope = scope;
    state.libraryFilter = scope === "official" ? "audio" : "all";
    renderAssetLibrary();
    return;
  }
  const filter = event.target.closest("[data-library-filter]")?.dataset.libraryFilter;
  if (filter) {
    state.libraryFilter = filter;
    renderAssetLibrary();
    return;
  }
  const assetId = event.target.closest("[data-library-add]")?.dataset.libraryAdd;
  if (assetId) useLibraryAsset(assetId);
});
assetLibraryGrid?.addEventListener("dblclick", (event) => {
  if (event.target.closest("[data-library-add]")) return;
  const assetId = event.target.closest("[data-library-asset]")?.dataset.libraryAsset;
  if (assetId) useLibraryAsset(assetId);
});
assetLibraryGrid?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  const assetId = event.target.closest("[data-library-asset]")?.dataset.libraryAsset;
  if (assetId) useLibraryAsset(assetId);
});
assetLibraryGrid?.addEventListener("dragstart", (event) => {
  const assetId = event.target.closest("[data-library-asset]")?.dataset.libraryAsset;
  if (!assetId || !event.dataTransfer) return;
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData("application/x-reelay-asset", assetId);
  event.dataTransfer.setData("text/plain", assetId);
});

shareProjectBtn?.addEventListener("click", shareProject);

railProfileBtn?.addEventListener("click", (event) => {
  event.stopPropagation();
  closeAssetLibrary();
  const willOpen = profileMenu?.classList.contains("hidden");
  profileMenu?.classList.toggle("hidden", !willOpen);
  themeSubmenu?.classList.add("hidden");
  profileMenu?.querySelector("[data-profile-action='appearance']")?.classList.remove("active");
  railProfileBtn.classList.toggle("active", Boolean(willOpen));
});

profileMenu?.addEventListener("pointerdown", (event) => {
  event.stopPropagation();
});

themeSubmenu?.addEventListener("pointerdown", (event) => {
  event.stopPropagation();
});

profileMenu?.addEventListener("click", (event) => {
  const action = event.target.closest("[data-profile-action]")?.dataset.profileAction;
  if (action === "appearance") {
    positionThemeSubmenu();
    themeSubmenu?.classList.toggle("hidden");
    event.target.closest("[data-profile-action]")?.classList.toggle("active", !themeSubmenu?.classList.contains("hidden"));
    return;
  }
  if (action === "logout") {
    showConfirmDialog({
      title: "退出登录",
      body: "当前是前端原型，退出登录暂未接入真实账号系统。",
      confirmText: "知道了",
      showCancel: false,
    });
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

themeSubmenu?.addEventListener("click", (event) => {
  const option = event.target.closest("[data-theme-choice]");
  if (!option) return;
  applyTheme(option.dataset.themeChoice);
  themeSubmenu.classList.add("hidden");
  profileMenu?.querySelector("[data-profile-action='appearance']")?.classList.remove("active");
});

selectionToolbar?.addEventListener("pointerdown", (event) => {
  event.stopPropagation();
});

selectionToolbar?.addEventListener("click", (event) => {
  event.stopPropagation();
  const layout = event.target.closest("[data-sort-layout]")?.dataset.sortLayout;
  if (layout) {
    selectionSortMenu?.classList.add("hidden");
    sortSelectedNodes(layout);
    return;
  }
  const action = event.target.closest("[data-selection-action]")?.dataset.selectionAction;
  if (action === "group") groupSelectedNodes();
  if (action === "toggle-sort") selectionSortMenu?.classList.toggle("hidden");
});

canvasTools?.addEventListener("pointerdown", (event) => {
  event.stopPropagation();
});

canvasToolButtons.forEach((button) => {
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    setCanvasPanel(button.dataset.canvasTool);
  });
});

minimapSurface?.addEventListener("pointerdown", beginMinimapDrag);

zoomPanel?.addEventListener("click", (event) => {
  event.stopPropagation();
  const item = event.target.closest("[data-zoom-action], [data-zoom-value]");
  if (!item) return;
  if (item.dataset.zoomAction === "in") {
    setCanvasZoom(state.scale * 1.12);
  } else if (item.dataset.zoomAction === "out") {
    setCanvasZoom(state.scale / 1.12);
  } else if (item.dataset.zoomValue) {
    setCanvasZoom(Number(item.dataset.zoomValue));
  }
  closeCanvasPanel();
});

undoDeleteBtn?.addEventListener("click", () => {
  undoLastDelete();
});

projectTitle?.addEventListener("dblclick", beginProjectRename);
projectTitle?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    commitProjectRename();
    projectTitle.blur();
  }
  if (event.key === "Escape") {
    event.preventDefault();
    projectTitle.textContent = state.projectName;
    commitProjectRename();
    projectTitle.blur();
  }
});
projectTitle?.addEventListener("blur", commitProjectRename);

agentLauncher?.addEventListener("click", () => setAgentOpen(true));
agentCloseBtn?.addEventListener("click", () => setAgentOpen(false));
agentNewChatBtn?.addEventListener("click", () => {
  setAgentConversation("new");
  agentInput?.focus();
});
agentHistoryBtn?.addEventListener("click", (event) => {
  event.stopPropagation();
  agentHistoryMenu?.classList.toggle("hidden");
  agentModelMenu?.classList.add("hidden");
  if (!agentHistoryMenu?.classList.contains("hidden")) {
    agentHistorySearch?.focus();
  }
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
agentInput?.addEventListener("keydown", (event) => {
  if (event.isComposing) return;
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendAgentMessage();
  }
});
agentModelBtn?.addEventListener("click", (event) => {
  event.stopPropagation();
  agentHistoryMenu?.classList.add("hidden");
  renderAgentModelMenu();
  agentModelMenu?.classList.toggle("hidden");
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
agentResizeHandle?.addEventListener("pointerdown", (event) => {
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

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target?.closest(".agent-actions, .agent-history-menu, .agent-model-wrap")) {
    agentHistoryMenu?.classList.add("hidden");
    agentModelMenu?.classList.add("hidden");
  }
  if (!target?.closest(".top-actions, #themeSubmenu")) {
    profileMenu?.classList.add("hidden");
    themeSubmenu?.classList.add("hidden");
    profileMenu?.querySelector("[data-profile-action='appearance']")?.classList.remove("active");
    railProfileBtn?.classList.remove("active");
  }
  if (!target?.closest("#canvasTools")) {
    closeCanvasPanel();
  }
  if (!target?.closest("#selectionToolbar")) {
    selectionSortMenu?.classList.add("hidden");
  }
  if (!target?.closest(".group-frame")) {
    closeGroupLayoutMenus();
  }
  if (!target?.closest(".media-edit-toolbar")) {
    const openMediaMenus = state.nodes.filter((node) => node.mediaMenuOpen);
    if (openMediaMenus.length) {
      openMediaMenus.forEach((node) => {
        node.mediaMenuOpen = false;
      });
      render();
    }
  }
});

setAgentWidth(state.agentWidth);
setAgentOpen(false);
setAgentConversation(state.activeConversationId);
syncAgentModelButton();
syncCreditDisplay();
applyTheme(state.themeMode);
syncFaviconContrast();
systemThemeQuery.addEventListener("change", () => {
  if (state.themeMode === "system") {
    applyTheme("system");
  }
});
officialLibraryAssets.forEach((asset) => hydrateAssetMetadata(asset, null));
document.title = `${state.projectName} · Reelay Canvas`;
applyTransform();
render();
