(function defineReelayPrototypeConfig() {
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
    promptTargetScreenWidth: 800,
    promptScreenMargin: 80,
    promptScaleMin: 0.5,
    promptScaleMax: 4,
    largePanelMinHeight: 320,
    largePanelMaxHeight: 480,
    largePromptMinHeight: 180,
    largePromptMaxHeight: 340,
    panelGap: 10,
  };

  const canvasScaleLimits = {
    min: 0.2,
    max: 2,
  };

  const groupFrameRules = {
    paddingX: 46,
    paddingTop: 58,
    paddingBottom: 46,
    minWidth: 280,
    minHeight: 180,
  };

  const assetCategoryFilters = [
    ["character", "角色"],
    ["scene", "场景"],
    ["prop", "道具"],
    ["material", "素材"],
  ];

  window.REELAY_PROTOTYPE_CONFIG = {
    imageResolutionCost,
    imageQualityMultiplier,
    videoQualityCost,
    simulationAssets,
    officialLibraryAssets,
    mediaToolDefinitions,
    mediaToolsByType,
    defaultMediaToolPreferences,
    agentConversations,
    layoutRules,
    canvasScaleLimits,
    groupFrameRules,
    assetCategoryFilters,
  };
})();
