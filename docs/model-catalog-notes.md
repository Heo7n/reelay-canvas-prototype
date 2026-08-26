# 模型目录说明

更新时间：2026-08-24

## 命名原则

- 生成节点、Agent 模型偏好、组织积分演示和组织用量演示统一使用同一组产品模型名称。
- 模型条目、参数能力和可替换的演示用量模板只在 `data/model-catalog.js` 中定义；React 通过 `src/features/models/model-catalog.ts` 的类型化适配读取同一运行时目录。只有已经持久化的历史记录可以保存名称快照。
- 同系列速度变体保留明确后缀，例如 `Fast`、`Lite`。
- 目录中删除的模型 ID 只按媒体类型回退到新的默认模型，不允许图片和视频模型互相替代。

## 当前收录

图片模型：

- `GPT Image 2`
- `Seedream 5.0 Lite`
- `NanoBanana Pro`

视频模型：

- `Seedance 2.5`
- `Seedance 2.0`
- `Seedance 2.0 Fast`
- `Kling 3.0`

当前共 7 个生成模型：图片 3 个、视频 4 个。音频暂不提供独立生成模型，只保留画布素材上传、播放与编辑能力。

## 菜单展示短句与资料依据

模型菜单的说明是面向创作者的单行能力摘要，不照搬供应商营销文案，也不把当前原型尚未接入的 API 能力表述为已经可用。当前短句依据 2026-08-24 可访问的公开资料统一压缩：

- GPT Image 2：OpenAI 将其定位为快速、高质量的图像生成与编辑模型，并强调灵活尺寸、高保真图像输入和改进的文字呈现；菜单摘要为“快速生成与编辑，强化文字与参考还原”。来源：[OpenAI 模型页](https://developers.openai.com/api/docs/models/gpt-image-2)、[ChatGPT Images 2.0](https://openai.com/index/introducing-chatgpt-images-2-0/)。
- Seedream 5.0 Lite：ByteDance Seed 将其定位为具备深度思考和在线检索能力的统一多模态图像生成模型；菜单摘要为“深度推理与实时检索，提升生成准确度”。来源：[Seedream 5.0 Lite](https://seed.bytedance.com/seedream5_0_lite)。
- NanoBanana Pro：Google 将其称为 Gemini 3 Pro Image，面向复杂、专业场景，强调高级推理、稳健控制、图像生成与编辑；菜单摘要为“专业级生成与编辑，强化复杂视觉控制”。来源：[Introducing Nano Banana Pro](https://blog.google/innovation-and-ai/products/nano-banana-pro/)、[Gemini 3 Pro Image for developers](https://blog.google/innovation-and-ai/technology/developers-tools/gemini-3-pro-image-developers/)。
- Seedance 2.5：ByteDance Seed 强调 30 秒叙事、音视频联合生成、精准参考控制和编辑能力；菜单摘要为“30 秒音视频叙事，支持精准参考与编辑”。来源：[Seedance 2.5](https://seed.bytedance.com/en/seedance2_5)。
- Seedance 2.0：ByteDance Seed 将其定义为支持文字、图片、音频和视频四种输入的统一多模态音视频联合生成架构；菜单摘要为“四模态输入，统一音视频生成与编辑”。来源：[Seedance 2.0](https://seed.bytedance.com/seedance2_0)。
- Seedance 2.0 Fast：公开模型服务将其描述为 Seedance 2.0 的速度优化变体，支持同步音频和多模态输入；菜单只保留经得起跨服务差异的定位，摘要为“加速多模态生成，适合高频创意迭代”。来源：[Replicate 模型页](https://replicate.com/bytedance/seedance-2.0-fast)、[Krea 模型页](https://www.krea.ai/models/seedance-2-fast)。
- Kling 3.0：Kling 官方说明其最长生成 15 秒，支持原生音视频输出和灵活的多镜头叙事；菜单摘要为“15 秒原生音视频，强化多镜头叙事”。来源：[Kling VIDEO 3.0 指南](https://app.klingai.com/global/quickstart/klingai-video-3-model-user-guide)。

## 原型能力契约

`data/model-catalog.js` 为每个模型声明 `capabilities` 和必要的 `defaults`，节点参数菜单完全由这些字段生成。

- GPT Image 2：常用比例、`1K / 2K / 4K` 与低/中/高生成质量。
- Seedream 5.0 Lite：常用比例与 `2K / 4K`。
- NanoBanana Pro：常用比例与 `1K / 2K / 4K`。
- Seedance 2.5：全能参考 / 首尾帧、六种常用比例、`480p / 720p / 1080p`、`5–30s` 逐秒时长；默认 `16:9 · 720p · 5s`。
- Seedance 2.0：使用与 Seedance 2.5 同一组原型画幅和分辨率，时长为 `4–15s`、逐秒可调，默认 `4s`。
- Seedance 2.0 Fast：文生视频 / 图生视频、`480p / 720p`、`4–15s` 逐秒时长，默认 `4s`。
- Kling 3.0：文生视频 / 图生视频、`720p / 1080p / 4K`、`3–15s` 逐秒时长，默认 `3s`。

这些是当前交互原型的产品能力契约，不代表已经接入供应商 API。真实接入时必须由后端能力接口校准输入方式、输出分辨率、时长、参考素材数量、原生音频、地区、价格、服务状态和下线日期。

## 持久化兼容

- `seedance-2`、`seedance-2-fast`、`kling-video-3`、`gpt-image-2`、`seedream-5-lite` 和 `nano-banana-pro` 保留既有稳定 ID。
- 新增的 Seedance 2.5 使用 `seedance-2-5`，并成为新视频节点默认模型。
- 历史画布中的 Nano Banana 2、Midjourney、Niji、Seedance 2.0 Mini、Kling Video 3.0 Omni 和 Veo 3.1 会在恢复并归一化节点时回退到同媒体类型的当前默认模型。
- 个人与组织用量页面仍使用可整体替换的确定性演示流水；演示记录的模型名称在生成 fixture 时从共享 `REELAY_MODEL_DIRECTORY` 解析，不维护第二套模型目录。未来真实 `GenerationTask` 仍应保存不可变的模型与计费快照。
