# 模型目录说明

更新时间：2026-09-24

## 命名原则

- 生成节点、Agent 模型偏好、组织积分演示和组织用量演示统一使用同一组产品模型名称。
- 模型条目、参数能力和可替换的演示用量模板只在 `data/model-catalog.js` 中定义；React 通过 `src/features/models/model-catalog.ts` 的类型化适配读取同一运行时目录。只有已经持久化的历史记录可以保存名称快照。
- 底栏可使用目录中的 `compactName` 紧凑名称；展开列表、悬停提示与任务记录仍使用完整 `name`。样片入口分别为 `Seedance 2.5（样片）` / `Seedance 2.5（样片模式）`。
- 同系列速度变体保留明确后缀，例如 `Fast`、`Lite`。
- 目录中删除的模型 ID 只按媒体类型回退到新的默认模型，不允许图片和视频模型互相替代。

## 当前收录

图片模型：

- `GPT Image 2`
- `Seedream 5.0 Lite`

视频模型：

- `Seedance 2.5`
- `Seedance 2.5（样片模式）`
- `Seedance 2.0`
- `Seedance 2.0 Fast`
- `Kling 3.0`

当前共 7 个生成入口：图片 2 个、视频 5 个。样片模式是 Seedance 2.5 的独立产品入口，底层复用同一供应商模型。音频暂不提供独立生成模型，只保留画布素材上传、播放与编辑能力。

## 菜单展示短句与资料依据

模型菜单使用一行“核心能力 + 辨识度”摘要，优先概括模型本身的生成、编辑、参考、控制或推理能力。保留有区分作用的时长，不把单一应用场景当作完整模型定位，也不使用未经核实的领先性、倍率或效果保证。以下资料均于 2026-09-07 重新联网读取；节点和对话框共用同一目录。

| 模型 | 菜单简介 | 核实依据 |
| --- | --- | --- |
| GPT Image 2 | 高质量图像生成，文字呈现与高保真编辑 | [官方模型页](https://developers.openai.com/api/docs/models/gpt-image-2)说明高质量生成与编辑；[图像生成指南](https://developers.openai.com/api/docs/guides/image-generation#image-input-fidelity)明确 GPT Image 2 自动以高保真处理图像输入。文字呈现依据指南的 GPT Image 系列说明，不承诺文字布局完全准确。 |
| Seedream 5.0 Lite | 深度推理与联网检索，精准图像创作 | [官方模型页](https://seed.bytedance.com/seedream5_0_lite)明确深度思考、实时检索增强、指令响应及风格与排版控制。 |
| Seedance 2.5 | 30 秒音画叙事，精细参考与音视频编辑 | [官方模型页](https://seed.bytedance.com/zh/seedance2_5)明确 30 秒长叙事、参考视频意图与镜头语言理解，以及更广的音视频编辑能力。 |
| Seedance 2.5（样片模式） | 先生成 480P 样片，选定后生成 1080P 成片 | 2026-09-24 核对[火山官方样片模式](https://docs.volcengine.com/docs/ark/seedance-2-5?lang=zh#2.5_draft_mode)：同一模型通过 `draft=true` 生成 480p 样片，7 天内引用样片任务生成 1080p 成片，两阶段分别计费。 |
| Seedance 2.0 | 全模态音画生成，精准表演与运镜控制 | [官方模型页](https://seed.bytedance.com/seedance2_0)明确文字、图片、音频与视频输入、音视频联合生成，以及表演、光影、运镜调度。 |
| Seedance 2.0 Fast | 多模态参考与灵活运镜，快速生成同步音画 | [fal 的 Fast 专属端点](https://fal.ai/models/bytedance/seedance-2.0/fast/reference-to-video)明确较低延迟、多种图像/视频/音频参考、同步音频及运镜控制；不推导具体提速倍率或各渠道价格。 |
| Kling 3.0 | 原生音画同步生成，多镜头叙事与主体一致性 | [官方 VIDEO 3.0 指南](https://app.klingai.com/global/quickstart/klingai-video-3-model-user-guide)明确 Native Audio、Multi-Shot 及 Enhanced Subject Consistency，均属于 VIDEO 3.0 本身，不借用 Omni 专属能力。 |

这些简介描述模型的官方能力定位，不代表原型已接入供应商 API、联网检索、多镜头专用控件或真实生成服务。参数可选范围由下方原型能力契约定义。

## 素材校验文案边界

2026-09-07 核对的[火山引擎官方说明](https://developer.volcengine.com/articles/7628567056649125942)将人脸验证、肖像授权及虚拟人像素材分别说明；这支持区分授权与素材使用流程，但不是各版本、各服务渠道通用的审核 API 契约。

Reelay 的“自动校验素材”按用户确认的产品规则表达为：用户选择素材类别，系统按类别将当前生成中尚未审核的相关图片和视频提交至模型平台。这里“自动”只修饰提交动作，不代表自动识别真人、不代表代用户分类，也不代表自动审核通过。当前仍只保存开关偏好，分类、审核任务与供应商授权流程尚未接入；实际接入时按所选模型和服务渠道校准。

## 原型能力契约

`data/model-catalog.js` 为每个模型声明 `capabilities` 和必要的 `defaults`，节点参数菜单完全由这些字段生成。

- GPT Image 2：常用比例、`1K / 2K / 4K` 与低/中/高生成质量。
- Seedream 5.0 Lite：常用比例与 `2K / 4K`。
- Seedance 2.5：底层 workflow 固定为 `omni-reference`；界面任务类型为全模态参考 / 视频编辑 / 视频延长，对应 `omni_reference_task_type=auto / edit / extend`，接口支持但界面不单列的 `reference` 仍保留在能力表中。比例为 `adaptive / 21:9 / 16:9 / 4:3 / 1:1 / 3:4 / 9:16`，其中 `adaptive` 显示为 `Auto`；分辨率显示为 `480P / 720P / 1080P`；普通输出时长为 `4–30s`、逐秒可调；默认 `auto · 16:9 · 480p · 10s`，与参数稿选中态一致。
- Seedance 2.5 特殊约束：`edit` 与 `extend` 必须包含真实参考视频且比例固定为 `adaptive`；两种模式的比例区只呈现一个占满整行的 `Auto`。`edit` 保留时长滑杆与数值框，滑杆禁用、数值框只读显示「智能」，悬停说明跟随原视频，参考视频须为 `4–30s`，生成请求时长固定为 `-1`。`extend` 使用滑杆选择：最左端为「智能」，下一档为 4s，向右逐秒至 30s；数值框同步显示智能或秒数，无额外模式按钮。Auto 保存为字符串 `auto`，请求映射为 `-1`，滑杆位置不参与秒数计算；同一时长区不改变高度。Auto 与自定义值穿过编辑模式时保留，不支持 Auto 的其他模式恢复模型默认秒数。当前 Auto 延长仅以默认 `10s` 做模拟估算，正式供应商能力及计费仍须接入时核验。三种任务类型在同一参数弹层内切换，仅 tab 选中底色短促过渡，内容不做整层位移、复制或高度动画；系统减少动态效果时直接采用最终布局。这些约束用于前端生成可用性和模拟任务快照；实际处理时模型仍可能因任务类型不一致而异步失败。
- Seedance 2.0：底层固定为 `omni-reference`，不显示模式选择；比例为 `21:9 / 16:9 / 4:3 / 1:1 / 3:4 / 9:16`，分辨率显示为 `480P / 720P / 1080P`，时长为 `4–15s`、逐秒可调，默认 `4s`。
- Seedance 2.5（样片模式）：沿用普通 2.5 的任务类型、参考约束、时长、音频与优化能力，分辨率固定为 `480p`（显示 `样片 480P`），单次 1 个结果。`seedance-2-5-draft` 与普通入口共享 `baseModelId=seedance-2-5`、`providerModelId=doubao-seedance-2-5-260628`，以 `executionMode=draft` 区分；转成片分辨率和有效期由目录 `draftConversion` 声明。样片模拟费用沿用普通 480p，成片按冻结输出时长与现有 1080p 规则单独估算，不宣称优惠倍率或真实供应商价格。普通 480p 视频及上传素材不具备样片身份。完整模拟行为见产品规范 10.8。
- Seedance 2.0 Fast：同样固定为 `omni-reference` 且不显示模式选择，分辨率只有 `480P / 720P`，时长为 `4–15s`、逐秒可调，默认 `4s`。
- Kling 3.0：文生视频 / 图生视频 / 首尾帧，比例为 `16:9 / 1:1 / 9:16`，分辨率显示为 `std (720p) / pro (1080p) / 4K`，时长为 `3–15s`、逐秒可调，默认 `4s`，与参数稿选中态一致。

比例和分辨率选项的 canonical value 分别保存在 `aspects` 与 `qualities` 中；`aspectLabels` / `qualityLabels` 只负责界面显示。例如 Seedance 2.5 的 `adaptive` 显示为 `Auto`、Seedance 的 `720p` 显示为 `720P`，Kling 的 `720p` 显示为 `std (720p)`。节点保存、参数归一化、计价和历史文档兼容不得使用展示文案替代 canonical value。

这些是当前交互原型的产品能力契约，不代表已经接入供应商 API。真实接入时必须由后端能力接口校准输入方式、输出分辨率、时长、参考素材数量、原生音频、地区、价格、服务状态和下线日期。

2026-10-13 图片通道只读核对：用户外部接口文档 §6 与缓存官网公开配置均列 `jimeng/seedream-5.0`，官网另列 `openai/gpt-image-2`；官网展示 Seedream `2K/3K`、两者 max_n=1。这只证明官网 UI 配置，不证明接口上限，遗漏的字段不等于平台拒绝。两模型尚未接入真实生成或实测出图；官网 Web 与 Agent 不是同一提交契约。原型 Seedream 5.0 Lite 的名称和参数须单独核对身份，不能直接套入通道。

[GPT Image 2 原生 API](https://developers.openai.com/api/reference/resources/images/methods/generate)已确认支持自定义像素 size 与独立 quality；不把官网固定比例菜单写成模型限制。目录后续应分别维护模型原生约束、各通道映射 / 已核验能力和产品开放策略；未知透传字段保留“待核验”，不冒充拒绝或已实现。尺寸交互按精确像素预设 + 自定义宽高设计，不把通用 4K 机械套到方形 / 其它比例，也不静默修改输入。[尺寸指南](https://developers.openai.com/cookbook/examples/multimodal/image-gen-models-prompting-guide)与 API 引用的 3840 边界表述有差异，实际通道仍需确认。方案见[普通真实接入规划](product-expansion-plan.md#83-普通真实生成本机首期接入方案)。

## 积分预估配置

本机普通真实生成首测的独立映射保存在 Fast 的 `integrations.reelay`：平台 model ID 为 `jimeng/seedance-2.0-fast`，`probe` 固定 `480P / 16:9 / 5 秒 / 含音频`。它只供账号设置的受控联调，不替换节点默认参数、不把样片识别为普通 480P，也不宣称其他目录模型的真实接口已经验证。费用未核验时不沿用下方演示积分扣费，行为见[产品规范 §2.3](current-product-spec.md#23-本机普通真实生成联调)。

Seedance 2.5、2.0、Fast 的 `pricing` 在 `data/model-catalog.js` 维护，2026-10-12 核对[官方单价](https://docs.volcengine.com/docs/ark/model-pricing?lang=zh)、[实际输出尺寸](https://docs.volcengine.com/docs/ark/video-generation-tutorial?lang=zh)与[最低 token 用量表](https://bytedance.larkoffice.com/wiki/FXaYwxzJ5i5Zdik32ipcWzt7nxd?table=tblheIYDXXwYM43b&view=vew2CR2JYM#CategoryScheduledTask)。只配置当前已开放规格，没有增加 4K 能力。样片继承 2.5 的 480P 规则，正片按原输入视频时长与目标 1080P 独立估算，样片视频不作为新增输入。

估算用量为 `(参考视频总秒数 + 输出秒数) × 宽 × 高 × 24 / 1024`；含视频输入时取与最低用量的较大值。最低表按输出整数秒保存等价计费秒数，乘实际面积后 `Math.round` 可重建所核对的官方整数 token 表；不能把一个规格的 `67,200` 当作通用下限。成本使用模型 / 分辨率 / 有无视频输入对应的单价，保留中间精度，最终积分 `ceil(成本 × 16.5)`。因此可与官方计算器两位小数的显示成本换算相差少量尾数。报价是预估，实际供应商用量和结算仍需在真实接入时校准。

2.5 的编辑 / 延长按[官方继承规则](https://docs.volcengine.com/docs/ark/seedance-2-5?lang=zh)解析输出规格。唯一参考视频的编辑继承其画幅、完整小数时长，指定时长的延长继承画幅，显示单个预估数字；智能延长仍显示时长范围。多视频不能按第一段、最长时长或普通文字中的“视频1”猜目标，此轮未增加语义解析或目标选择控件，按每个可能目标的画幅与编辑时长配对估算范围，输入时长始终累加全部参考视频。元数据缺失时等待，不回落默认比例。标准画幅映射官方尺寸；非标准 5:4 / 7:5 等没有已核验的精确输出像素映射，采用目录 `estimatedAdaptivePixelArea` 的该分辨率标称面积作单值近似，在提示中持续标明，不伪造输出宽高或改成 16:9。报价中的 `exact` 仅表示单个预估值，不等于供应商精确结算。小数时长相邻最低档均被公式用量覆盖时不再无条件显示范围；真实最低档仍有费用差异时保留区间。

## 持久化兼容

- `seedance-2`、`seedance-2-fast`、`kling-video-3`、`gpt-image-2`、`seedream-5-lite` 和 `nano-banana-pro` 保留既有稳定 ID。
- 新增的 Seedance 2.5 使用 `seedance-2-5`，并成为新视频节点默认模型。
- 样片入口使用 `seedance-2-5-draft`，不替换默认模型。画布资产通过经过校验的 `generation` 保存样片 / 成片来源、任务标识和不可变输入；浏览器与服务端文档归一化共用同一来源序列化规则。来源不等于持久任务，刷新仍清空本次对话任务并重置模拟积分。样片作为已有模型变体不新增虚构的账户演示流水。
- 历史画布中的 Nano Banana 2、Midjourney、Niji、Seedance 2.0 Mini、Kling Video 3.0 Omni 和 Veo 3.1 会在恢复并归一化节点时回退到同媒体类型的当前默认模型。
- 个人与组织用量页面仍使用可整体替换的确定性演示流水；演示记录的模型名称在生成 fixture 时从共享 `REELAY_MODEL_DIRECTORY` 解析，不维护第二套模型目录。未来真实 `GenerationTask` 仍应保存不可变的模型与计费快照。
