(() => {
  const canvasModels = [
    {
      id: "gpt-image-2",
      type: "image",
      provider: "OpenAI",
      name: "GPT Image 2",
      optimizationInstructions: "保留用户原意、原语言与素材引用。围绕图像主体、构图、光线和材质整理表达；需要画面文字时，保留用户给出的具体文字。遵循已选比例、分辨率和质量，不擅自增加角色或修改参数。",
      desc: "高质量图像生成，文字呈现与高保真编辑",
      icon: "GI",
      iconSrc: "./assets/model-logos/openai.svg",
      iconMode: "mask",
      badge: "30s",
      capabilities: {
        aspects: ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
        resolutions: ["1K", "2K", "4K"],
        qualities: ["低", "中", "高"],
        counts: [1, 2, 4],
      },
      defaults: {
        aspect: "1:1",
        resolution: "2K",
        quality: "中",
      },
      demoUsage: [
        { order: 11, activityLabel: "图片生成", specification: "高 · 2K · 16:9 · 4 张", weight: 12, baseCredits: 168, outputImages: 4, outputVideoSeconds: 0 },
        { order: 12, activityLabel: "图片生成", specification: "中 · 2K · 1:1 · 2 张", weight: 8, baseCredits: 88, outputImages: 2, outputVideoSeconds: 0 },
        { order: 13, activityLabel: "图片生成", specification: "低 · 1K · 3:2 · 4 张", weight: 5, baseCredits: 48, outputImages: 4, outputVideoSeconds: 0 },
      ],
    },
    {
      id: "seedream-5-lite",
      type: "image",
      provider: "ByteDance",
      name: "Seedream 5.0 Lite",
      optimizationInstructions: "保留用户原意、原语言与素材引用。清楚组织图像主体、场景、构图与风格关系，让描述清楚一致。遵循已选比例和分辨率，不编造素材内容，不擅自增加角色或修改参数。",
      desc: "深度推理与联网检索，精准图像创作",
      icon: "SR",
      iconSrc: "./assets/model-logos/bytedance-mono.svg",
      iconMode: "mask",
      badge: "30s",
      capabilities: {
        aspects: ["1:1", "2:3", "3:2", "4:3", "3:4", "16:9", "9:16", "21:9"],
        resolutions: ["2K", "4K"],
        counts: [1, 2, 4],
      },
      defaults: {
        aspect: "1:1",
        resolution: "2K",
      },
      demoUsage: [
        { order: 14, activityLabel: "图片生成", specification: "4K · 3:2 · 4 张", weight: 8, baseCredits: 88, outputImages: 4, outputVideoSeconds: 0 },
        { order: 15, activityLabel: "图片生成", specification: "2K · 16:9 · 4 张", weight: 6, baseCredits: 68, outputImages: 4, outputVideoSeconds: 0 },
      ],
    },
    {
      id: "seedance-2-5",
      type: "video",
      provider: "ByteDance",
      brand: "seedance",
      name: "Seedance 2.5",
      optimizationInstructions: "保留用户原意、原语言及图片、视频、音频引用。根据当前已选任务说明生成、编辑或延长的意图，明确动作顺序与镜头衔接；编辑时保留未要求修改的内容，延长时明确方向。遵循当前模式的时长与比例限制，不擅自切换模式或参数。",
      desc: "30 秒音画叙事，精细参考与音视频编辑",
      icon: "S25",
      iconSrc: "./assets/model-logos/bytedance-mono.svg",
      iconMode: "mask",
      badge: "30s",
      capabilities: {
        workflows: ["omni-reference"],
        omniReferenceTaskType: {
          parameter: "omni_reference_task_type",
          values: ["auto", "reference", "edit", "extend"],
          uiValues: ["auto", "edit", "extend"],
          labels: {
            auto: "全模态参考",
            reference: "参考生视频",
            edit: "视频编辑",
            extend: "视频延长",
          },
          // Seedance 2.5 (2026-09-08): https://docs.byteplus.com/en/docs/ModelArk/2607688
          // Non-edit video inputs: 2–30s each; edit: 4–30s each. Up to 10 videos / 30s total.
          // auto recommends 4–30s inputs because the prompt can be recognized as an edit task.
          // Generated / extended output: 4–30s; editing essentially retains the input duration.
          descriptions: {
            auto: "生成 4–30 秒视频，可用图片、视频或音频参考。\n参考视频每段 2–30 秒，建议至少 4 秒。",
            edit: "上传 4–30 秒视频，用文字修改画面或声音。\n支持局部编辑，输出基本保持原时长。",
            extend: "上传 2–30 秒视频，向前或向后续写。\n可指定 4–30 秒续写时长。",
          },
          // Prompt guidance: https://docs.volcengine.com/docs/82379/2607689?lang=zh
          promptPlaceholders: {
            auto: "基于图片、视频或音频参考生成新视频",
            edit: "传入已有视频，提示词带关键词：修改、替换、增加、删除等更改视频内容的描述，支持时间戳局部编辑，支持额外输入参考图引导编辑。",
            extend: "传入已有视频，提示词带关键词：向前/向后延长、续写……可指定 4–30 秒续写时长。",
          },
          constraints: {
            reference: {},
            edit: {
              referenceVideoRequired: true,
              referenceVideoDurationRange: { min: 4, max: 30 },
              aspect: "adaptive",
              duration: -1,
              hideDuration: true,
            },
            extend: {
              referenceVideoRequired: true,
              aspect: "adaptive",
              hideDuration: true,
            },
          },
        },
        aspects: ["adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
        aspectLabels: { adaptive: "Auto" },
        qualities: ["480p", "720p", "1080p"],
        qualityLabels: { "480p": "480P", "720p": "720P", "1080p": "1080P" },
        durationRange: { min: 4, max: 30, step: 1, marks: [4, 5, 10, 15, 20, 25, 30] },
        outputFormats: ["mp4", "mov"],
        counts: [1, 2, 4],
      },
      defaults: {
        workflow: "omni-reference",
        aspect: "16:9",
        quality: "480p",
        duration: "10s",
        outputFormat: "mp4",
        omniReferenceTaskType: "auto",
      },
      demoUsage: [
        { order: 8, activityLabel: "文生视频", specification: "720p · 5s", weight: 6, baseCredits: 210, outputImages: 0, outputVideoSeconds: 5 },
        { order: 9, activityLabel: "参考生视频", specification: "1080p · 8s", weight: 3, baseCredits: 920, outputImages: 0, outputVideoSeconds: 8 },
      ],
    },
    {
      id: "seedance-2",
      type: "video",
      provider: "ByteDance",
      brand: "seedance",
      name: "Seedance 2.0",
      optimizationInstructions: "保留用户原意、原语言及多模态素材引用。围绕主体动作、镜头顺序与音画关系整理视频描述，保持事件和角色一致。遵循已选时长、比例与质量，不额外添加事件，不擅自修改参数。",
      desc: "全模态音画生成，精准表演与运镜控制",
      icon: "S20",
      iconSrc: "./assets/model-logos/bytedance-mono.svg",
      iconMode: "mask",
      badge: "15s",
      capabilities: {
        workflows: ["omni-reference"],
        aspects: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
        qualities: ["480p", "720p", "1080p"],
        qualityLabels: { "480p": "480P", "720p": "720P", "1080p": "1080P" },
        durationRange: { min: 4, max: 15, step: 1, marks: [4, 5, 10, 15] },
        counts: [1, 2, 4],
      },
      defaults: {
        workflow: "omni-reference",
        aspect: "16:9",
        quality: "720p",
        duration: "4s",
      },
      demoUsage: [
        { order: 0, activityLabel: "文生视频", specification: "1080p · 10s", weight: 14, baseCredits: 720, outputImages: 0, outputVideoSeconds: 10 },
        { order: 1, activityLabel: "文生视频", specification: "720p · 5s", weight: 8, baseCredits: 380, outputImages: 0, outputVideoSeconds: 5 },
        { order: 2, activityLabel: "文生视频", specification: "4K · 10s", weight: 3, baseCredits: 1080, outputImages: 0, outputVideoSeconds: 10 },
      ],
    },
    {
      id: "seedance-2-fast",
      type: "video",
      provider: "ByteDance",
      brand: "seedance",
      name: "Seedance 2.0 Fast",
      optimizationInstructions: "保留用户原意、原语言及多模态素材引用。用清楚、紧凑的表达描述主体动作、镜头运动和音画关系，保持动作连续。遵循已选时长、比例与质量，不擅自补充角色或修改参数。",
      desc: "多模态参考与灵活运镜，快速生成同步音画",
      icon: "S2F",
      iconSrc: "./assets/model-logos/bytedance-mono.svg",
      iconMode: "mask",
      badge: "15s",
      capabilities: {
        workflows: ["omni-reference"],
        aspects: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
        qualities: ["480p", "720p"],
        qualityLabels: { "480p": "480P", "720p": "720P" },
        durationRange: { min: 4, max: 15, step: 1, marks: [4, 5, 10, 15] },
        counts: [1, 2, 4],
      },
      defaults: {
        workflow: "omni-reference",
        aspect: "16:9",
        quality: "720p",
        duration: "4s",
      },
      demoUsage: [
        { order: 3, activityLabel: "图生视频", specification: "720p · 5s", weight: 10, baseCredits: 360, outputImages: 0, outputVideoSeconds: 5 },
        { order: 4, activityLabel: "图生视频", specification: "480p · 5s", weight: 6, baseCredits: 240, outputImages: 0, outputVideoSeconds: 5 },
      ],
    },
    {
      id: "kling-video-3",
      type: "video",
      provider: "Kuaishou",
      name: "Kling 3.0",
      optimizationInstructions: "保留用户原意、原语言与素材引用。根据当前已选文生视频、图生视频或首尾帧工作流整理动作与镜头关系；使用首尾帧时说明两者间的连贯过渡。遵循已选时长、比例与质量，不擅自切换工作流或添加事件。",
      desc: "原生音画同步生成，多镜头叙事与主体一致性",
      icon: "K3",
      iconSrc: "./assets/model-logos/kling-mono.svg",
      iconMode: "mask",
      badge: "15s",
      capabilities: {
        workflows: ["text-to-video", "image-to-video", "first-last-frame"],
        aspects: ["16:9", "1:1", "9:16"],
        qualities: ["720p", "1080p", "4K"],
        qualityLabels: { "720p": "std (720p)", "1080p": "pro (1080p)", "4K": "4K" },
        durationRange: { min: 3, max: 15, step: 1, marks: [3, 5, 10, 15] },
        counts: [1, 2, 4],
      },
      defaults: {
        workflow: "text-to-video",
        aspect: "16:9",
        quality: "720p",
        duration: "4s",
      },
      demoUsage: [
        { order: 5, activityLabel: "参考生视频", specification: "1080p · 10s", weight: 6, baseCredits: 660, outputImages: 0, outputVideoSeconds: 10 },
        { order: 6, activityLabel: "参考生视频", specification: "720p · 5s", weight: 4, baseCredits: 390, outputImages: 0, outputVideoSeconds: 5 },
        { order: 7, activityLabel: "参考生视频", specification: "4K · 10s", weight: 3, baseCredits: 1020, outputImages: 0, outputVideoSeconds: 10 },
        { order: 10, activityLabel: "参考生视频", specification: "720p · 8s", weight: 2, baseCredits: 650, outputImages: 0, outputVideoSeconds: 8 },
      ],
    },
  ];

  const serviceModels = [
    {
      id: "reelay-hd",
      type: "enhancement",
      provider: "Reelay",
      name: "Reelay HD",
      capabilities: { operations: ["upscale"] },
      demoUsage: [
        { order: 16, activityLabel: "高清放大", specification: "2× · 4K", weight: 7, baseCredits: 54, outputImages: 1, outputVideoSeconds: 0 },
        { order: 17, activityLabel: "高清放大", specification: "4× · 8K", weight: 4, baseCredits: 92, outputImages: 1, outputVideoSeconds: 0 },
      ],
    },
    {
      id: "reelay-frameboost",
      type: "enhancement",
      provider: "Reelay",
      name: "Reelay FrameBoost",
      capabilities: { operations: ["frame-interpolation"] },
      demoUsage: [
        { order: 18, activityLabel: "提升帧率", specification: "1080p · 60fps · 10s", weight: 5, baseCredits: 86, outputImages: 0, outputVideoSeconds: 10 },
      ],
    },
    {
      id: "reelay-clean",
      type: "enhancement",
      provider: "Reelay",
      name: "Reelay Clean",
      capabilities: { operations: ["subtitle-removal"] },
      demoUsage: [
        { order: 19, activityLabel: "视频去字幕", specification: "1080p · 10s", weight: 4, baseCredits: 72, outputImages: 0, outputVideoSeconds: 10 },
      ],
    },
    {
      id: "reelay-agent",
      type: "agent",
      provider: "Reelay",
      name: "Reelay Agent",
      capabilities: { operations: ["storyboard-breakdown", "shot-planning", "prompt-polish"] },
      demoUsage: [
        { order: 20, activityLabel: "Agent 处理", specification: "分镜拆解 · 1 次", weight: 9, baseCredits: 42, outputImages: 0, outputVideoSeconds: 0 },
        { order: 21, activityLabel: "Agent 处理", specification: "镜头规划 · 1 次", weight: 6, baseCredits: 38, outputImages: 0, outputVideoSeconds: 0 },
        { order: 22, activityLabel: "Agent 处理", specification: "提示词润色 · 1 次", weight: 5, baseCredits: 24, outputImages: 0, outputVideoSeconds: 0 },
      ],
    },
  ];

  const deepFreeze = (value) => {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  };
  const catalog = deepFreeze(canvasModels);
  const directory = deepFreeze([...canvasModels, ...serviceModels]);
  const target = typeof window === "object" ? window : globalThis;
  target.REELAY_MODEL_CATALOG = catalog;
  target.REELAY_MODEL_DIRECTORY = directory;
})();
