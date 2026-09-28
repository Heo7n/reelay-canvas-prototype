(function registerGenerationHistoryPresets(root) {
  "use strict";

  function create({ presets = [], prepareInput, createFinalInput, scope, makeId, media = [], simulationAssets = {},
    simulationVideos = [], now = Date.now() } = {}) {
    if (typeof prepareInput !== "function") return [];
    const definitions = [
      { presetId: "image-portrait", status: "succeeded", type: "image" },
      { presetId: "image-many", status: "failed", type: "image", error: "参考素材暂时无法读取，请稍后重试。" },
      { presetId: "video-portrait", status: "canceled", type: "video" },
    ];
    const image = media.find((asset) => asset.type === "image" && asset.url && asset.height > asset.width)
      || media.find((asset) => asset.type === "image" && asset.url) || simulationAssets.image;
    const finishedAt = (createdAt) => Math.min(now, createdAt + root.REELAY_PROTOTYPE_CONFIG.generationDurationMs);
    const examples = definitions.flatMap((definition, index) => {
      const preset = presets.find((entry) => entry.id === definition.presetId);
      if (!preset) return [];
      const input = prepareInput(preset.input);
      if (!input || input.mediaType !== definition.type) return [];
      const result = definition.type === "image" ? image : simulationAssets.video;
      if (definition.status === "succeeded" && !result?.url) return [];
      const createdAt = Math.max(0, now - (definitions.length - index) * 60000);
      return [{ input, status: definition.status, createdAt, finishedAt: definition.status === "canceled" ? Math.min(now, createdAt + 3500) : finishedAt(createdAt),
        error: definition.error || null,
        result: definition.status === "succeeded" ? { ...result, id: `preview-result-${definition.presetId}`,
          source: "preview", displayName: definition.type === "image" ? "图片生成展示示例" : "视频生成展示示例" } : null }];
    });
    const model = root.REELAY_MODEL_DIRECTORY?.find((entry) => entry.executionMode === "draft");
    if (!model || !scope || typeof makeId !== "function" || typeof createFinalInput !== "function") return examples;
    const scenarios = [
      { prompt: "一段用于旅行短片开场的海岸风景。晴朗午后，青蓝色海水从远处缓慢涌向浅色沙滩，白色浪花沿岸线展开，近处保留礁石和湿润沙面的细节。镜头以低空航拍视角沿海岸平稳向前，略微向右侧海面移动，让弧形岸线自然引导视线，地平线始终保持水平。阳光明亮但不过曝，海面有细碎反光，颜色清透自然。全程一个连续镜头，节奏舒缓，结尾继续保持运动，方便衔接下一镜。不要突然加速、变焦或切换视角，画面中不出现人物、船只、字幕和水印。", formats: [] },
      { prompt: "清晨的群山与云海，写实自然纪录片质感。画面从较低的山谷视角开始，前景是带有冷色阴影的山脊，中景薄雾缓慢流动，远处山峰被初升的阳光照亮，形成清楚的前、中、后景层次。\n\n镜头连续缓慢向前并轻微抬升，逐渐越过前景山脊，露出更开阔的山谷；前半段让观众看到岩石、树木和雾气的细节，后半段自然打开视野。云雾的移动速度应明显慢于镜头，不要像延时摄影那样快速翻涌。阳光从画面右上方照入，暖色只落在受光的山顶，阴影中保留冷灰与墨绿色，不要把整幅画面染成金黄色。\n\n保持山体形状和植被分布稳定，镜头平稳、无抖动，曝光和色温不要跳变。整体安静、辽阔，有清晨空气的通透感，不添加建筑、游客、文字或夸张的光晕，结尾留出自然的剪辑余量。", formats: ["mp4"] },
      { prompt: "制作一个森林主题短片的环境镜头，真实摄影质感，重点表现林间的空间纵深与午后阳光。场景是一条向远处弯曲的林间小径，两侧树木高低错落，近处能看见树皮纹理、苔藓和零散落叶，远处植被逐渐融入柔和的阴影。画面中没有人物，观众像沿着小径缓缓走进森林。\n\n开头从接近人眼高度的中广角视角进入，镜头沿小径匀速向前，前景枝叶从画面边缘自然掠过，产生轻微视差，但不要遮住画面中心。中段随着路径轻轻向左转动，露出树木之间的一束阳光；结尾放缓推进，停留在明暗交界的位置，不突然停止，也不切镜。\n\n阳光从右上方穿过树冠，地面上的光斑随树叶轻微变化。枝叶只有微风带来的自然摆动，树干和地形保持稳定，空气中可见少量细小尘埃，不要出现浓重雾气或舞台式光柱。绿色以自然的深浅层次为主，保留树皮的灰褐色和地面暖色，避免高饱和、过度锐化和塑料质感。\n\n全程保持同一场景与连贯透视，不新增分岔路，不让树木融化或相互穿插；不要推拉变焦、快速摇镜、转场、字幕、Logo或背景配乐。", formats: ["mp4", "mov"] },
    ];
    const drafts = scenarios.flatMap((scenario, index) => {
      const media = simulationVideos[index] || simulationAssets.video;
      if (!media?.url) return [];
      const input = prepareInput({ modelId: model.id, prompt: scenario.prompt, references: [],
        parameters: { ...model.defaults, aspect: "16:9" } });
      if (!input || !root.REELAY_DRAFT_VIDEO.isDraftInput(input)) return [];
      const id = makeId(); const resultId = makeId();
      const createdAt = Math.max(0, now - (scenarios.length - index + definitions.length) * 60000);
      const result = { ...media, id: resultId, source: "preview", generationTaskId: id,
        generation: root.REELAY_DRAFT_VIDEO.createDraftProvenance({ input, taskId: id, resultId, createdAt, scope }) };
      const sample = { id, input, result, status: "succeeded", createdAt, finishedAt: finishedAt(createdAt) };
      const finals = scenario.formats.flatMap((outputFormat, version) => {
        const finalInput = createFinalInput(result, { scope, outputFormat });
        if (!finalInput) return [];
        const finalId = makeId(); const finalResultId = makeId();
        const finalCreatedAt = Math.min(now, createdAt + (version + 1) * 15000);
        return [{ id: finalId, input: finalInput, status: "succeeded", createdAt: finalCreatedAt, finishedAt: finishedAt(finalCreatedAt),
          result: { ...media, id: finalResultId, source: "preview", generationTaskId: finalId,
            generation: root.REELAY_DRAFT_VIDEO.createFinalProvenance({ input: finalInput, taskId: finalId,
              resultId: finalResultId, createdAt: finalCreatedAt, scope }) } }];
      });
      return [sample, ...finals];
    });
    return [...drafts, ...examples];
  }

  root.REELAY_GENERATION_HISTORY_PRESETS = Object.freeze({ create });
})(globalThis);
