import { z } from "zod";
import "../../data/model-catalog.js";
import type { SeedanceVideoCapability, SeedanceVideoModelId, SeedanceVideoParameters } from "../domain/generation/seedance-video";

export const SeedanceVideoModelIdSchema = z.enum(["seedance-2", "seedance-2-fast", "seedance-2-5"]);
const ResolutionSchema = z.enum(["480P", "720P", "1080P"]);
const AspectRatioSchema = z.enum(["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"], { error: "当前通道尚未核验此画幅；请选择已核验的固定比例。" });

export const SeedanceVideoCapabilitySchema = z.object({
  modelId: SeedanceVideoModelIdSchema,
  model: z.string().min(1),
  channel: z.literal("web"),
  resolutions: z.array(ResolutionSchema).min(1),
  aspectRatios: z.array(AspectRatioSchema).min(1),
  durationRange: z.object({ min: z.number().int().positive(), max: z.number().int().positive(), step: z.literal(1) }),
  generateAudio: z.literal(true),
  maxCount: z.literal(1),
  referencesRequirePlatformAsset: z.literal(true),
  optionalFieldsPlacement: z.enum(["video", "extra"]),
  verification: z.literal("documented"),
}).strict() satisfies z.ZodType<SeedanceVideoCapability>;

type CatalogGlobal = { REELAY_MODEL_DIRECTORY?: readonly { id: string; integrations?: { reelay?: unknown } }[] };
const runtime = globalThis as CatalogGlobal & { window?: CatalogGlobal };
const catalog = (runtime.window ?? runtime).REELAY_MODEL_DIRECTORY;
const capabilities = new Map<SeedanceVideoModelId, SeedanceVideoCapability>();
for (const modelId of SeedanceVideoModelIdSchema.options) {
  const integration = catalog?.find((entry) => entry.id === modelId)?.integrations?.reelay;
  if (!integration || typeof integration !== "object" || !("video" in integration)) throw new Error("Seedance Web model mapping is missing");
  const entry = integration as { model?: unknown; channel?: unknown; video: unknown };
  if (!entry.video || typeof entry.video !== "object") throw new Error("Seedance Web capabilities are missing");
  capabilities.set(modelId, Object.freeze(SeedanceVideoCapabilitySchema.parse({
    modelId, model: entry.model, channel: entry.channel, ...entry.video,
  })));
}

export function getSeedanceVideoCapability(modelId: SeedanceVideoModelId): SeedanceVideoCapability {
  const capability = capabilities.get(modelId);
  if (!capability) throw new Error("Unknown Seedance Web model");
  return structuredClone(capability);
}

/**
 * Local canonical quality values are normalized once at this boundary. Unsupported
 * intent is rejected before any remote placeholder or generation can be created.
 */
export const SeedanceVideoParametersSchema = z.object({
  modelId: SeedanceVideoModelIdSchema,
  model: z.string().min(1).optional(),
  resolution: z.enum(["480P", "720P", "1080P", "480p", "720p", "1080p"]).transform((value) => ResolutionSchema.parse(value.toUpperCase())),
  aspectRatio: AspectRatioSchema,
  duration: z.number().int(),
  generateAudio: z.boolean(),
  workflow: z.literal("omni-reference", { error: "当前真实通道只支持普通视频生成。" }),
  generationStage: z.literal("standard", { error: "样片与成片暂未接入真实生成。" }),
  omniReferenceTaskType: z.literal("auto", { error: "视频编辑、延长与参考任务暂未接入真实生成。" }).optional(),
  outputFormat: z.literal("mp4", { error: "当前通道尚未核验其他输出格式，请使用 MP4。" }).optional(),
  count: z.literal(1, { error: "当前真实生成每个任务仅支持一个视频。" }).optional(),
  references: z.array(z.unknown()).max(0, { error: "参考素材需要平台资产上传与关联，暂未接入真实生成。" }).optional(),
}).strict().superRefine((input, context) => {
  const capability = capabilities.get(input.modelId);
  if (!capability) { context.addIssue({ code: "custom", path: ["modelId"], message: "模型未接入真实生成。" }); return; }
  if (input.model !== undefined && input.model !== capability.model) context.addIssue({ code: "custom", path: ["model"], message: "平台模型与所选模型不匹配。" });
  if (!capability.resolutions.includes(input.resolution)) context.addIssue({ code: "custom", path: ["resolution"], message: "所选模型不支持此真实视频分辨率。" });
  if (input.duration < capability.durationRange.min || input.duration > capability.durationRange.max) context.addIssue({ code: "custom", path: ["duration"], message: "视频时长超出所选模型的真实生成范围。" });
}).transform((input): SeedanceVideoParameters => ({
  modelId: input.modelId,
  model: getSeedanceVideoCapability(input.modelId).model,
  resolution: input.resolution,
  aspectRatio: input.aspectRatio,
  duration: input.duration,
  generateAudio: input.generateAudio,
  workflow: input.workflow,
  generationStage: input.generationStage,
  ...(input.omniReferenceTaskType !== undefined ? { omniReferenceTaskType: input.omniReferenceTaskType } : {}),
  ...(input.outputFormat !== undefined ? { outputFormat: input.outputFormat } : {}),
}));

export function validateSeedanceVideoRequest(input: unknown): SeedanceVideoParameters {
  return SeedanceVideoParametersSchema.parse(input);
}

export function buildSeedanceWebVideoPayload(input: {
  parameters: SeedanceVideoParameters;
  prompt: string;
  projectId: string;
  artifactId: string;
}): Record<string, unknown> {
  const parameters = validateSeedanceVideoRequest(input.parameters);
  const optionalFields = {
    ...(parameters.omniReferenceTaskType ? { omni_reference_task_type: parameters.omniReferenceTaskType } : {}),
    ...(parameters.outputFormat ? { output_format: parameters.outputFormat } : {}),
  };
  const videoFields = Object.keys(optionalFields).length && getSeedanceVideoCapability(parameters.modelId).optionalFieldsPlacement === "extra"
    ? { extra: optionalFields } : optionalFields;
  return {
    prompt: input.prompt,
    generate_type: "text_to_video",
    model: parameters.model,
    project_id: input.projectId,
    artifact_id: input.artifactId,
    video: {
      aspect_ratio: parameters.aspectRatio,
      duration: parameters.duration,
      resolution: parameters.resolution,
      generate_audio: parameters.generateAudio,
      ...videoFields,
    },
  };
}

export type { SeedanceVideoCapability, SeedanceVideoModelId, SeedanceVideoParameters } from "../domain/generation/seedance-video";
