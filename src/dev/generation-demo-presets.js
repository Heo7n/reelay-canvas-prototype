(function registerGenerationDemoPresets(root) {
  "use strict";
  const definitions = [
    { id: "image-square", label: "纯文字 · 方形图片", model: "gpt-image-2", aspect: "1:1", images: 0,
      prompt: "设计一张极简香水海报：半透明玻璃瓶置于浅灰石台，柔和侧光勾勒轮廓，留出舒适的标题空间，画面安静、精致。" },
    { id: "video-omni", label: "全模态参考 · 横版视频", model: "seedance-2-5", aspect: "16:9", images: 7, videos: 1, audios: 1,
      prompt: "创作一段10秒横版角色短片，呈现幽影与白汐在林间察觉未知动静的瞬间，保持真实材质与克制的动作。\n场景与角色：图片1用于树林空间和前后景层次；图片2确定幽影的面甲、兜帽与配色，图片3校准转身时的服装结构，图片4参考身体姿态和轮廓，图片5约束链刃形制，图片6提供护盾纹理。白汐依照图片7的面部与服饰出现于远处，不混用两人的特征。\n镜头：0–3秒从林间花草前景缓慢推进，视频1仅参考花朵的轻微摆动；3–7秒镜头移至幽影侧后方，角色停步、抬手，链刃随动作自然垂落，护盾短暂亮起；7–10秒焦点转向远处的白汐，她看向林外，镜头停稳收尾。使用连贯运镜，不插入设定图或突然切换场景。\n声音：音频1作为第5秒远处传来的低吼参考，降低音量并加入林间回响；脚步、衣料与链条轻响对应动作，无旁白、对白或配乐。保留安静间隙，护盾只增加短促低频声。\n画面要求：人物比例与武器结构稳定，脚部完整入画，光线柔和，能量光不遮挡面部，无字幕、水印与多余角色。" },
    { id: "image-many", label: "多素材 · 12 张图片", model: "gpt-image-2", aspect: "3:2", images: 12,
      prompt: "以图片1、图片2和图片3整理角色轮廓，结合图片4、图片5和图片6提取服装与材质层次；从图片7、图片8和图片9对比装备细节，使用图片10、图片11和图片12统一配色与表现风格。\n创作一张横版叙事概念图。主角全身入画，前景保留少量虚化细节，中景呈现人物与装备，远景用低饱和雾气拉开空间。选择相互协调的参考元素，避免堆砌；光线集中在面部与关键道具，画面保持清晰、安静。" },
    { id: "image-portrait", label: "竖版图片 · 单图参考", model: "seedream-5-lite", aspect: "9:16", images: 1,
      prompt: "保持图片1的人物特征，创作全身竖版角色海报。脚部完整入画，背景简洁，层次清晰，避免裁切头部与装备。" },
    { id: "video-portrait", label: "竖版视频 · 单图参考", model: "seedance-2", aspect: "9:16", images: 1,
      prompt: "以图片1为首要角色参考，人物缓缓抬头看向镜头，衣料随微风轻动，竖版全身构图，保持角色造型一致。" },
  ];

  function create({ models = [], media = [] } = {}) {
    // A shared file can appear in multiple seed libraries; count it only once.
    const available = (type) => {
      const unique = new Map();
      for (const asset of media) if (asset.type === type && asset.url && !unique.has(asset.url)) unique.set(asset.url, asset);
      return [...unique.values()];
    };
    const images = available("image"); const videos = available("video"); const audios = available("audio");
    return definitions.flatMap((definition) => {
      const model = models.find((entry) => entry.id === definition.model);
      const videoCount = definition.videos || 0; const audioCount = definition.audios || 0;
      if (!model || !model.capabilities?.aspects?.includes(definition.aspect)
        || images.length < definition.images || videos.length < videoCount || audios.length < audioCount
        || ((videoCount || audioCount) && !model.capabilities.workflows?.includes("omni-reference"))) return [];
      const references = [...images.slice(0, definition.images), ...videos.slice(0, videoCount), ...audios.slice(0, audioCount)]
        .map((asset, index) => ({ ...asset, id: `demo-${definition.id}-${index}`, sourceAssetId: asset.id }));
      const counts = {};
      const byLabel = new Map(references.map((asset) => {
        const number = counts[asset.type] = (counts[asset.type] || 0) + 1;
        return [`${{ image: "图片", video: "视频", audio: "音频" }[asset.type]}${number}`, asset];
      }));
      const content = definition.prompt.split(/((?:图片|视频|音频)\d+)/).filter(Boolean).map((text) => {
        const asset = byLabel.get(text);
        return asset ? { type: "reference", key: `asset:${asset.id}`, mediaType: asset.type, fallbackLabel: text }
          : { type: "text", text };
      });
      return [{ id: definition.id, label: definition.label,
        description: `${model.name} · ${definition.aspect === "adaptive" ? "随原视频比例" : definition.aspect} · ${references.length ? `${references.length} 个参考素材` : "无参考素材"}。结果使用示例媒体，仅演示生成流程。`,
        input: { modelId: model.id, references, prompt: definition.prompt, promptDocument: { version: 1, content },
          parameters: { ...model.defaults, aspect: definition.aspect } },
      }];
    });
  }
  root.REELAY_GENERATION_DEMO_PRESETS = Object.freeze({ create });
})(globalThis);
