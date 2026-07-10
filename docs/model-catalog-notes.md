# 模型目录说明

更新时间：2026-07-09

## 命名原则

- 使用厂商正式公开名称。
- 不把 Pro、Premier 等订阅套餐误写成模型后缀。
- 同系列速度 / 成本变体保留明确后缀，例如 Fast、Mini、Lite。
- Omni 按官方拼写，不使用 `Omini`。

## 当前收录

- OpenAI 当前图像 API 模型使用 `GPT Image 2`。
- Google 图像模型收录 `Nano Banana Pro` 和 `Nano Banana 2`。
- Midjourney 当前默认版本为 `V8.1`，同时保留 `V7` 和动漫方向的 `Niji 7`。
- 字节跳动正式发布的是 `Seedream 5.0 Lite`；未收录无法从官方资料核实的 `Seedream 5.0 Pro`。
- Seedance 收录 `2.0`、`2.0 Fast`、`2.0 Mini` 三档。
- 可灵收录 `Video 3.0` 与 `Video 3.0 Omni`。
- Sora 2 未收录，因为 OpenAI 官方页面标注该产品已于 2026-04-26 停止提供。

当前共 13 个模型：图片 7 个、视频 6 个。音频暂不提供生成模型，只保留画布素材上传、播放与编辑能力。

## 参数校验

`data/model-catalog.js` 已为每个模型声明 `capabilities`，节点参数面板根据该字段动态生成，不再共用一套虚构参数。

- GPT Image 2：官方支持满足约束的任意尺寸；原型提供十种常用比例、`1K / 2K / 4K` 与低/中/高生成质量。
- Nano Banana Pro / Nano Banana 2：提供官方支持的完整常用画幅与 `1K / 2K / 4K`。
- Midjourney V8.1：提供原生 `1K / 2K`；V7 与 Niji 7 只显示原生 `1K`，2K 放大保留为媒体编辑能力。
- Seedream 5.0 Lite：只显示已确认的高分辨率 `2K / 4K`。
- Seedance 2.0：`720p / 1080p / 4K`；Fast 与 Mini：`480p / 720p`；时长均限制在 4 至 15 秒的产品范围内。火山引擎当前页面对 4K 同时存在模型直出与 MediaKit 后处理口径，真实 API 接入时必须以端点能力响应为准。
- Veo 3.1：`720p` 支持 4/6/8 秒；选择 `1080p` 或 `4K` 时自动限制为 8 秒；单次只生成 1 个视频。
- Kling Video 3.0 系列：`720p / 1080p`，时长在官方 3 至 15 秒范围内。

## 主要来源

- [OpenAI GPT Image 2 输出尺寸与质量](https://developers.openai.com/api/docs/guides/image-generation#customize-image-output)
- [Google Nano Banana 图像生成参数](https://ai.google.dev/gemini-api/docs/image-generation)
- [Midjourney 版本与 HD 能力](https://docs.midjourney.com/hc/en-us/articles/32199405667853-Version)
- [Midjourney 图片尺寸](https://docs.midjourney.com/hc/en-us/articles/33329374594957-Image-Size-Resolution)
- [火山引擎 Seedance 2.0](https://www.volcengine.com/activity/seedance2)
- [Google Veo 3.1 参数](https://ai.google.dev/gemini-api/docs/video)
- [可灵 3.0 用户指南](https://app.klingai.com/cn/quickstart/klingai-video-3-model-user-guide)

## 真实接入提醒

当前能力表服务于前端原型。真实接入仍必须补充：

- 输入模态。
- 输出模态。
- 分辨率与比例。
- 时长。
- 参考素材数量。
- 原生音频能力。
- 可用地区。
- 供应商模型 ID。
- 价格与积分换算。
- 服务状态。
- 下线日期。

其中输入模态、参考素材条件和供应商实时服务状态会进一步影响参数组合，应由后端能力接口覆盖前端静态目录。
