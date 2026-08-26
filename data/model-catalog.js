(() => {
  const canvasModels = [
    {
      id: "gpt-image-2",
      type: "image",
      provider: "OpenAI",
      name: "GPT Image 2",
      desc: "快速生成与编辑，强化文字与参考还原",
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
      desc: "深度推理与实时检索，提升生成准确度",
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
        { order: 18, activityLabel: "图片生成", specification: "4K · 3:2 · 4 张", weight: 8, baseCredits: 88, outputImages: 4, outputVideoSeconds: 0 },
        { order: 19, activityLabel: "图片生成", specification: "2K · 16:9 · 4 张", weight: 6, baseCredits: 68, outputImages: 4, outputVideoSeconds: 0 },
      ],
    },
    {
      id: "nano-banana-pro",
      type: "image",
      provider: "Google",
      name: "NanoBanana Pro",
      desc: "专业级生成与编辑，强化复杂视觉控制",
      icon: "NB",
      iconSrc: "./assets/model-logos/nanobanana-mono.svg",
      iconMode: "mask",
      badge: "30s",
      capabilities: {
        aspects: ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
        resolutions: ["1K", "2K", "4K"],
        counts: [1, 2, 4],
      },
      defaults: {
        aspect: "1:1",
        resolution: "2K",
      },
      demoUsage: [
        { order: 14, activityLabel: "图片生成", specification: "2K · 1:1 · 2 张", weight: 12, baseCredits: 96, outputImages: 2, outputVideoSeconds: 0 },
        { order: 15, activityLabel: "图片生成", specification: "4K · 16:9 · 1 张", weight: 6, baseCredits: 120, outputImages: 1, outputVideoSeconds: 0 },
        { order: 16, activityLabel: "图片生成", specification: "2K · 16:9 · 4 张", weight: 10, baseCredits: 112, outputImages: 4, outputVideoSeconds: 0 },
        { order: 17, activityLabel: "图片生成", specification: "2K · 1:1 · 4 张", weight: 7, baseCredits: 112, outputImages: 4, outputVideoSeconds: 0 },
      ],
    },
    {
      id: "seedance-2-5",
      type: "video",
      provider: "ByteDance",
      brand: "seedance",
      name: "Seedance 2.5",
      desc: "30 秒音视频叙事，支持精准参考与编辑",
      icon: "S25",
      iconSrc: "./assets/model-logos/bytedance-mono.svg",
      iconMode: "mask",
      badge: "30s",
      capabilities: {
        workflows: ["omni-reference", "first-last-frame"],
        aspects: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
        qualities: ["480p", "720p", "1080p"],
        durationRange: { min: 5, max: 30, step: 1, marks: [5, 10, 15, 20, 25, 30] },
        counts: [1, 2, 4],
      },
      defaults: {
        workflow: "omni-reference",
        aspect: "16:9",
        quality: "720p",
        duration: "5s",
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
      desc: "四模态输入，统一音视频生成与编辑",
      icon: "S20",
      iconSrc: "./assets/model-logos/bytedance-mono.svg",
      iconMode: "mask",
      badge: "15s",
      capabilities: {
        workflows: ["omni-reference", "first-last-frame"],
        aspects: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
        qualities: ["480p", "720p", "1080p"],
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
      desc: "加速多模态生成，适合高频创意迭代",
      icon: "S2F",
      iconSrc: "./assets/model-logos/bytedance-mono.svg",
      iconMode: "mask",
      badge: "10s",
      capabilities: {
        workflows: ["text-to-video", "image-to-video"],
        aspects: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"],
        qualities: ["480p", "720p"],
        durationRange: { min: 4, max: 15, step: 1, marks: [4, 5, 10, 15] },
        counts: [1, 2, 4],
      },
      defaults: {
        workflow: "text-to-video",
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
      desc: "15 秒原生音视频，强化多镜头叙事",
      icon: "K3",
      iconSrc: "./assets/model-logos/kling-mono.svg",
      iconMode: "mask",
      badge: "15s",
      capabilities: {
        workflows: ["text-to-video", "image-to-video"],
        aspects: ["16:9", "9:16", "1:1"],
        qualities: ["720p", "1080p", "4K"],
        durationRange: { min: 3, max: 15, step: 1, marks: [3, 5, 10, 15] },
        counts: [1, 2, 4],
      },
      defaults: {
        workflow: "text-to-video",
        aspect: "16:9",
        quality: "720p",
        duration: "3s",
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
        { order: 20, activityLabel: "高清放大", specification: "2× · 4K", weight: 7, baseCredits: 54, outputImages: 1, outputVideoSeconds: 0 },
        { order: 21, activityLabel: "高清放大", specification: "4× · 8K", weight: 4, baseCredits: 92, outputImages: 1, outputVideoSeconds: 0 },
      ],
    },
    {
      id: "reelay-frameboost",
      type: "enhancement",
      provider: "Reelay",
      name: "Reelay FrameBoost",
      capabilities: { operations: ["frame-interpolation"] },
      demoUsage: [
        { order: 22, activityLabel: "提升帧率", specification: "1080p · 60fps · 10s", weight: 5, baseCredits: 86, outputImages: 0, outputVideoSeconds: 10 },
      ],
    },
    {
      id: "reelay-clean",
      type: "enhancement",
      provider: "Reelay",
      name: "Reelay Clean",
      capabilities: { operations: ["subtitle-removal"] },
      demoUsage: [
        { order: 23, activityLabel: "视频去字幕", specification: "1080p · 10s", weight: 4, baseCredits: 72, outputImages: 0, outputVideoSeconds: 10 },
      ],
    },
    {
      id: "reelay-agent",
      type: "agent",
      provider: "Reelay",
      name: "Reelay Agent",
      capabilities: { operations: ["storyboard-breakdown", "shot-planning", "prompt-polish"] },
      demoUsage: [
        { order: 24, activityLabel: "Agent 处理", specification: "分镜拆解 · 1 次", weight: 9, baseCredits: 42, outputImages: 0, outputVideoSeconds: 0 },
        { order: 25, activityLabel: "Agent 处理", specification: "镜头规划 · 1 次", weight: 6, baseCredits: 38, outputImages: 0, outputVideoSeconds: 0 },
        { order: 26, activityLabel: "Agent 处理", specification: "提示词润色 · 1 次", weight: 5, baseCredits: 24, outputImages: 0, outputVideoSeconds: 0 },
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
