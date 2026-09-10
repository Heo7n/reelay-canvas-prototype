(function registerGenerationHistoryPresets(root) {
  "use strict";

  function create({ presets = [], prepareInput, media = [], simulationAssets = {}, now = Date.now() } = {}) {
    if (typeof prepareInput !== "function") return [];
    const definitions = [
      { presetId: "video-omni", status: "succeeded", type: "video" },
      { presetId: "image-portrait", status: "succeeded", type: "image" },
      { presetId: "image-many", status: "failed", type: "image", error: "参考素材暂时无法读取，请稍后重试。" },
      { presetId: "video-portrait", status: "canceled", type: "video" },
    ];
    const image = media.find((asset) => asset.type === "image" && asset.url && asset.height > asset.width)
      || media.find((asset) => asset.type === "image" && asset.url) || simulationAssets.image;
    return definitions.flatMap((definition, index) => {
      const preset = presets.find((entry) => entry.id === definition.presetId);
      if (!preset) return [];
      const input = prepareInput(preset.input);
      if (!input || input.mediaType !== definition.type) return [];
      const result = definition.type === "image" ? image : simulationAssets.video;
      if (definition.status === "succeeded" && !result?.url) return [];
      const createdAt = now - (definitions.length - index) * 60000;
      return [{ input, status: definition.status, createdAt, finishedAt: createdAt + (definition.status === "canceled" ? 3500 : 11000),
        error: definition.error || null,
        result: definition.status === "succeeded" ? { ...result, id: `preview-result-${definition.presetId}`,
          source: "preview", displayName: definition.type === "image" ? "图片生成展示示例" : "视频生成展示示例" } : null }];
    });
  }

  root.REELAY_GENERATION_HISTORY_PRESETS = Object.freeze({ create });
})(globalThis);
