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

  const assetLibrarySeed = {
    media: [
      {
        id: "media-personal-mountain",
        mediaKind: "image",
        type: "image",
        name: "森林旅人.webp",
        displayName: "森林旅人.webp",
        url: "./assets/home/project-character.webp",
        width: 800,
        height: 450,
        aspectRatio: 16 / 9,
        source: "upload",
      },
      {
        id: "media-personal-mist-courier-cover",
        mediaKind: "image",
        type: "image",
        name: "雾森信使_林溪主视觉.png",
        displayName: "雾森信使_林溪主视觉.png",
        url: "./assets/home/entity-mist-courier-cover.png",
        width: 1672,
        height: 941,
        aspectRatio: 1672 / 941,
        source: "generation-result",
      },
      {
        id: "media-personal-mist-courier-portrait",
        mediaKind: "image",
        type: "image",
        name: "雾森信使_罗盘近景.png",
        displayName: "雾森信使_罗盘近景.png",
        url: "./assets/home/entity-mist-courier-portrait.png",
        width: 1086,
        height: 1448,
        aspectRatio: 3 / 4,
        source: "generation-result",
      },
      {
        id: "media-personal-mist-courier-gear",
        mediaKind: "image",
        type: "image",
        name: "雾森信使_装备细节.png",
        displayName: "雾森信使_装备细节.png",
        url: "./assets/home/entity-mist-courier-gear.png",
        width: 1254,
        height: 1254,
        aspectRatio: 1,
        source: "generation-result",
      },
      {
        id: "media-personal-obsidian-probe-cover",
        mediaKind: "image",
        type: "image",
        name: "曜石勘探体_雨夜主视觉.png",
        displayName: "曜石勘探体_雨夜主视觉.png",
        url: "./assets/home/entity-obsidian-probe-cover.png",
        width: 1672,
        height: 941,
        aspectRatio: 1672 / 941,
        source: "generation-result",
      },
      {
        id: "media-personal-obsidian-probe-detail",
        mediaKind: "image",
        type: "image",
        name: "曜石勘探体_结构资料.png",
        displayName: "曜石勘探体_结构资料.png",
        url: "./assets/home/entity-obsidian-probe-detail.png",
        width: 1254,
        height: 1254,
        aspectRatio: 1,
        source: "generation-result",
      },
      {
        id: "media-personal-obsidian-probe-profile",
        mediaKind: "image",
        type: "image",
        name: "曜石勘探体_侧视结构.png",
        displayName: "曜石勘探体_侧视结构.png",
        url: "./assets/home/entity-obsidian-probe-profile.png",
        width: 1448,
        height: 1086,
        aspectRatio: 4 / 3,
        source: "generation-result",
      },
      {
        id: "media-personal-forest",
        mediaKind: "video",
        type: "video",
        name: "林间镜头.mp4",
        displayName: "林间镜头.mp4",
        url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
        width: 1280,
        height: 720,
        aspectRatio: 16 / 9,
        source: "generation-result",
      },
      {
        id: "media-personal-roar",
        mediaKind: "audio",
        type: "audio",
        name: "氛围低吼.mp3",
        displayName: "氛围低吼.mp3",
        url: "https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3",
        duration: 0,
        source: "upload",
      },
      {
        id: "media-organization-product",
        mediaKind: "image",
        type: "image",
        name: "品牌产品参考.png",
        displayName: "品牌产品参考.png",
        url: "./assets/home/project-product.webp",
        width: 800,
        height: 450,
        aspectRatio: 16 / 9,
        source: "team-shared",
      },
      {
        id: "media-platform-landscape",
        mediaKind: "image",
        type: "image",
        name: "深空母舰.webp",
        displayName: "深空母舰.webp",
        url: "./assets/home/project-scifi.webp",
        width: 800,
        height: 450,
        aspectRatio: 16 / 9,
        source: "platform",
        platformSourceId: "platform-landscape-001",
        sourceCatalogId: "reelay-inspiration",
      },
      {
        id: "media-platform-roar",
        mediaKind: "audio",
        type: "audio",
        name: "荒原巨兽低吼.mp3",
        displayName: "荒原巨兽低吼.mp3",
        url: "https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3",
        duration: 0,
        source: "platform",
        platformSourceId: "platform-roar-001",
        sourceCatalogId: "reelay-inspiration",
      },
    ],
    entities: [
      {
        id: "entity-personal-mist-courier",
        name: "雾森信使",
        description: "往返古林与边境聚落的年轻信使，熟悉隐蔽林径与旧路标。",
        mediaRefs: [
          { mediaId: "media-personal-mist-courier-cover", order: 0 },
          { mediaId: "media-personal-mist-courier-portrait", order: 1 },
          { mediaId: "media-personal-mist-courier-gear", order: 2 },
        ],
        coverMediaId: "media-personal-mist-courier-cover",
      },
      {
        id: "entity-personal-obsidian-probe",
        name: "曜石勘探体",
        description: "配备琥珀光学核心的多足勘探机械体，用于潮湿工业遗迹与低照度环境。",
        mediaRefs: [
          { mediaId: "media-personal-obsidian-probe-cover", order: 0 },
          { mediaId: "media-personal-obsidian-probe-detail", order: 1 },
          { mediaId: "media-personal-obsidian-probe-profile", order: 2 },
        ],
        coverMediaId: "media-personal-obsidian-probe-cover",
      },
    ],
    folders: [
      { id: "folder-personal-visual", space: "personal", kind: "media", name: "视觉参考", parentId: null },
      { id: "folder-personal-entity", space: "personal", kind: "entity", name: "主体合集", parentId: null },
      { id: "folder-organization-brand", space: "organization", kind: "media", name: "品牌资料", parentId: null },
      { id: "folder-platform-starter", space: "platform", kind: "media", name: "平台示例", parentId: null },
    ],
    placements: [
      { item: { kind: "media", id: "media-personal-mountain" }, space: "personal", folderId: null },
      { item: { kind: "media", id: "media-personal-mist-courier-cover" }, space: "personal", folderId: null },
      { item: { kind: "media", id: "media-personal-mist-courier-portrait" }, space: "personal", folderId: null },
      { item: { kind: "media", id: "media-personal-mist-courier-gear" }, space: "personal", folderId: null },
      { item: { kind: "media", id: "media-personal-obsidian-probe-cover" }, space: "personal", folderId: null },
      { item: { kind: "media", id: "media-personal-obsidian-probe-detail" }, space: "personal", folderId: null },
      { item: { kind: "media", id: "media-personal-obsidian-probe-profile" }, space: "personal", folderId: null },
      { item: { kind: "media", id: "media-personal-forest" }, space: "personal", folderId: null },
      { item: { kind: "media", id: "media-personal-roar" }, space: "personal", folderId: null },
      { item: { kind: "entity", id: "entity-personal-mist-courier" }, space: "personal", folderId: null },
      { item: { kind: "entity", id: "entity-personal-obsidian-probe" }, space: "personal", folderId: null },
      { item: { kind: "media", id: "media-organization-product" }, space: "organization", folderId: null },
      { item: { kind: "media", id: "media-platform-landscape" }, space: "platform", folderId: null },
      { item: { kind: "media", id: "media-platform-roar" }, space: "platform", folderId: null },
    ],
  };

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

  const generationWorkflows = {
    image: [],
    video: [
      { id: "text-to-video", label: "文生视频", icon: "square-play" },
      { id: "omni-reference", label: "全能参考", icon: "folder-plus" },
      { id: "first-last-frame", label: "首尾帧", icon: "panels-top-left" },
      { id: "image-to-video", label: "图生视频", icon: "image" },
    ],
  };

  const agentConversations = [
    {
      id: "new",
      title: "新对话",
      messages: [],
    },
    {
      id: "seedance",
      title: "你有多了解 Seedance 2.5 创作视频...",
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
    normalPanelWidth: 705,
    normalPanelHeight: 291,
    compactPanelHeight: 260,
    advancedSettingsHeightByMode: {
      image: 118,
      video: 154,
    },
    promptInputTop: 73,
    promptInputBottom: 51,
    promptTargetScreenWidth: 705,
    promptScreenMargin: 20,
    promptScaleMin: 0.5,
    promptScaleMax: 5,
    panelGap: 14,
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

  window.REELAY_PROTOTYPE_CONFIG = {
    imageResolutionCost,
    imageQualityMultiplier,
    videoQualityCost,
    simulationAssets,
    assetLibrarySeed,
    mediaToolDefinitions,
    mediaToolsByType,
    defaultMediaToolPreferences,
    generationWorkflows,
    agentConversations,
    layoutRules,
    canvasScaleLimits,
    groupFrameRules,
  };
})();
