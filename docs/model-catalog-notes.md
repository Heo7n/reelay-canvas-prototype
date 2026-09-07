# 模型目录说明

更新时间：2026-09-07

## 命名原则

- 生成节点、Agent 模型偏好、组织积分演示和组织用量演示统一使用同一组产品模型名称。
- 模型条目、参数能力和可替换的演示用量模板只在 `data/model-catalog.js` 中定义；React 通过 `src/features/models/model-catalog.ts` 的类型化适配读取同一运行时目录。只有已经持久化的历史记录可以保存名称快照。
- 同系列速度变体保留明确后缀，例如 `Fast`、`Lite`。
- 目录中删除的模型 ID 只按媒体类型回退到新的默认模型，不允许图片和视频模型互相替代。

## 当前收录

图片模型：

- `GPT Image 2`
- `Seedream 5.0 Lite`

视频模型：

- `Seedance 2.5`
- `Seedance 2.0`
- `Seedance 2.0 Fast`
- `Kling 3.0`

当前共 6 个生成模型：图片 2 个、视频 4 个。音频暂不提供独立生成模型，只保留画布素材上传、播放与编辑能力。

## 菜单展示短句与资料依据

模型菜单使用一行“核心能力 + 辨识度”摘要，优先概括模型本身的生成、编辑、参考、控制或推理能力。保留有区分作用的时长，不把单一应用场景当作完整模型定位，也不使用未经核实的领先性、倍率或效果保证。以下资料均于 2026-09-07 重新联网读取；节点和对话框共用同一目录。

| 模型 | 菜单简介 | 核实依据 |
| --- | --- | --- |
| GPT Image 2 | 高质量图像生成，文字呈现与高保真编辑 | [官方模型页](https://developers.openai.com/api/docs/models/gpt-image-2)说明高质量生成与编辑；[图像生成指南](https://developers.openai.com/api/docs/guides/image-generation#image-input-fidelity)明确 GPT Image 2 自动以高保真处理图像输入。文字呈现依据指南的 GPT Image 系列说明，不承诺文字布局完全准确。 |
| Seedream 5.0 Lite | 深度推理与联网检索，精准图像创作 | [官方模型页](https://seed.bytedance.com/seedream5_0_lite)明确深度思考、实时检索增强、指令响应及风格与排版控制。 |
| Seedance 2.5 | 30 秒音画叙事，精细参考与音视频编辑 | [官方模型页](https://seed.bytedance.com/zh/seedance2_5)明确 30 秒长叙事、参考视频意图与镜头语言理解，以及更广的音视频编辑能力。 |
| Seedance 2.0 | 全模态音画生成，精准表演与运镜控制 | [官方模型页](https://seed.bytedance.com/seedance2_0)明确文字、图片、音频与视频输入、音视频联合生成，以及表演、光影、运镜调度。 |
| Seedance 2.0 Fast | 多模态参考与灵活运镜，快速生成同步音画 | [fal 的 Fast 专属端点](https://fal.ai/models/bytedance/seedance-2.0/fast/reference-to-video)明确较低延迟、多种图像/视频/音频参考、同步音频及运镜控制；不推导具体提速倍率或各渠道价格。 |
| Kling 3.0 | 原生音画同步生成，多镜头叙事与主体一致性 | [官方 VIDEO 3.0 指南](https://app.klingai.com/global/quickstart/klingai-video-3-model-user-guide)明确 Native Audio、Multi-Shot 及 Enhanced Subject Consistency，均属于 VIDEO 3.0 本身，不借用 Omni 专属能力。 |

这些简介描述模型的官方能力定位，不代表原型已接入供应商 API、联网检索、多镜头专用控件或真实生成服务。参数可选范围仍由下方原型能力契约定义；此次仅更新介绍，未修改能力字段、价格或调用路径。

## 素材校验文案边界

2026-09-07 核对的[火山引擎官方说明](https://developer.volcengine.com/articles/7628567056649125942)将人脸验证、肖像授权及虚拟人像素材分别说明；这支持区分授权与素材使用流程，但不是各版本、各服务渠道通用的审核 API 契约。

Reelay 的“自动校验素材”按用户确认的产品规则表达为：用户选择素材类别，系统按类别将当前生成中尚未审核的相关图片和视频提交至模型平台。这里“自动”只修饰提交动作，不代表自动识别真人、不代表代用户分类，也不代表自动审核通过。当前仍只保存开关偏好，分类、审核任务与供应商授权流程尚未接入；实际接入时按所选模型和服务渠道校准。

## 原型能力契约

`data/model-catalog.js` 为每个模型声明 `capabilities` 和必要的 `defaults`，节点参数菜单完全由这些字段生成。

- GPT Image 2：常用比例、`1K / 2K / 4K` 与低/中/高生成质量。
- Seedream 5.0 Lite：常用比例与 `2K / 4K`。
- Seedance 2.5：底层 workflow 固定为 `omni-reference`；界面任务类型为全模态参考 / 视频编辑 / 视频延长，对应 `omni_reference_task_type=auto / edit / extend`，接口支持但界面不单列的 `reference` 仍保留在能力表中。比例为 `adaptive / 21:9 / 16:9 / 4:3 / 1:1 / 3:4 / 9:16`，其中 `adaptive` 显示为 `Auto`；分辨率显示为 `480P / 720P / 1080P`；普通输出时长为 `4–30s`、逐秒可调；默认 `auto · 16:9 · 480p · 10s`，与参数稿选中态一致。
- Seedance 2.5 特殊约束：`edit` 与 `extend` 必须包含真实参考视频且比例固定为 `adaptive`；两种模式的比例区只呈现一个占满整行的 `Auto`，并都隐藏时长控件。`edit` 的参考视频须为 `4–30s`，生成请求时长仍固定为 `-1`。三种任务类型在同一参数弹层内切换，变化内容与弹层高度使用短促连续过渡；系统减少动态效果时直接采用最终布局。这些约束用于前端生成可用性和模拟任务快照；实际处理时模型仍可能因任务类型不一致而异步失败。
- Seedance 2.0：底层固定为 `omni-reference`，不显示模式选择；比例为 `21:9 / 16:9 / 4:3 / 1:1 / 3:4 / 9:16`，分辨率显示为 `480P / 720P / 1080P`，时长为 `4–15s`、逐秒可调，默认 `4s`。
- Seedance 2.0 Fast：同样固定为 `omni-reference` 且不显示模式选择，分辨率只有 `480P / 720P`，时长为 `4–15s`、逐秒可调，默认 `4s`。
- Kling 3.0：文生视频 / 图生视频 / 首尾帧，比例为 `16:9 / 1:1 / 9:16`，分辨率显示为 `std (720p) / pro (1080p) / 4K`，时长为 `3–15s`、逐秒可调，默认 `4s`，与参数稿选中态一致。

比例和分辨率选项的 canonical value 分别保存在 `aspects` 与 `qualities` 中；`aspectLabels` / `qualityLabels` 只负责界面显示。例如 Seedance 2.5 的 `adaptive` 显示为 `Auto`、Seedance 的 `720p` 显示为 `720P`，Kling 的 `720p` 显示为 `std (720p)`。节点保存、参数归一化、计价和历史文档兼容不得使用展示文案替代 canonical value。

这些是当前交互原型的产品能力契约，不代表已经接入供应商 API。真实接入时必须由后端能力接口校准输入方式、输出分辨率、时长、参考素材数量、原生音频、地区、价格、服务状态和下线日期。

## 持久化兼容

- `seedance-2`、`seedance-2-fast`、`kling-video-3`、`gpt-image-2`、`seedream-5-lite` 和 `nano-banana-pro` 保留既有稳定 ID。
- 新增的 Seedance 2.5 使用 `seedance-2-5`，并成为新视频节点默认模型。
- 历史画布中的 Nano Banana 2、Midjourney、Niji、Seedance 2.0 Mini、Kling Video 3.0 Omni 和 Veo 3.1 会在恢复并归一化节点时回退到同媒体类型的当前默认模型。
- 个人与组织用量页面仍使用可整体替换的确定性演示流水；演示记录的模型名称在生成 fixture 时从共享 `REELAY_MODEL_DIRECTORY` 解析，不维护第二套模型目录。未来真实 `GenerationTask` 仍应保存不可变的模型与计费快照。
