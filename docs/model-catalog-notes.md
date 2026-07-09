# 模型目录说明

更新时间：2026-07-09

## 命名原则

- 使用厂商正式公开名称。
- 不把 Pro、Premier 等订阅套餐误写成模型后缀。
- 同系列速度 / 成本变体保留明确后缀，例如 Fast、Mini、Lite。
- Omni 按官方拼写，不使用 `Omini`。

## 本轮关键判断

- OpenAI 当前图像 API 模型使用 `GPT Image 2`。
- Google 图像模型收录 `Nano Banana Pro` 和 `Nano Banana 2`。
- Midjourney 当前默认版本为 `V8.1`，同时保留 `V7` 和动漫方向的 `Niji 7`。
- 字节跳动正式发布的是 `Seedream 5.0 Lite`；未收录无法从官方资料核实的 `Seedream 5.0 Pro`。
- Seedance 收录 `2.0`、`2.0 Fast`、`2.0 Mini` 三档。
- 可灵收录 `Video 3.0` 与 `Video 3.0 Omni`，并收录对应图片系列。
- Suno 正式模型名是 `v5.5`；Pro 是订阅层级。
- ElevenLabs 收录 `Music v2`、`Sound Effects v2` 与 `Multilingual v2`。
- Sora 2 未收录，因为 OpenAI 官方页面标注该产品已于 2026-04-26 停止提供。

## 产品实现提醒

当前模型目录只驱动展示和类型切换。真实接入时必须补充：

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

这些字段应进入 `ModelDefinition` schema，节点参数面板应根据 schema 生成。
