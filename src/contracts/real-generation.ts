import { z } from "zod";
import "../../data/model-catalog.js";
import type {
  ProbeSpecification, GenerationProbe, GenerationConnection, PlatformLogin, StartGenerationProbe, PlatformContainerPage,
} from "../domain/generation/real-generation";

export const REAL_GENERATION_PLATFORM_ORIGIN = "https://reelay.tech.jetsentv.com";
export const REAL_GENERATION_CALL_SOURCE = "web";

const ProbeSpecificationSchema = z.object({
  modelId: z.string().min(1),
  model: z.string().min(1),
  modelName: z.string().min(1),
  resolution: z.literal("480P"),
  aspectRatio: z.literal("16:9"),
  duration: z.literal(5),
  generateAudio: z.literal(true),
}) satisfies z.ZodType<ProbeSpecification>;

type CatalogGlobal = {
  REELAY_MODEL_DIRECTORY?: readonly {
    id: string;
    name: string;
    integrations?: { reelay?: { model: string; probe?: unknown } };
  }[];
};
const runtime = globalThis as CatalogGlobal & { window?: CatalogGlobal };
const catalog = (runtime.window ?? runtime).REELAY_MODEL_DIRECTORY;
const probeModel = catalog?.find((entry) => entry.integrations?.reelay?.probe);
export const REAL_GENERATION_PROBE_SPEC = Object.freeze(ProbeSpecificationSchema.parse({
  modelId: probeModel?.id,
  modelName: probeModel?.name,
  model: probeModel?.integrations?.reelay?.model,
  ...(typeof probeModel?.integrations?.reelay?.probe === "object" ? probeModel.integrations.reelay.probe : {}),
}));

export const PlatformLoginSchema = z.object({
  type: z.enum(["phone", "email"]),
  target: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(256),
}).strict() satisfies z.ZodType<PlatformLogin>;

export const StartGenerationProbeSchema = z.object({
  requestKey: z.string().uuid(),
  projectId: z.string().trim().min(1).max(200),
  prompt: z.string().trim().min(1).max(4000),
  paidConsent: z.literal(true),
}).strict() satisfies z.ZodType<StartGenerationProbe>;

export const GenerationProbeSchema = z.object({
  id: z.string().min(1),
  requestKey: z.string().uuid(),
  status: z.enum(["submitting", "waiting", "saving", "succeeded", "failed", "unconfirmed", "save_failed"]),
  createdAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable(),
  message: z.string(),
  prompt: z.string(),
  projectId: z.string(),
  diagnostics: z.object({
    eventCount: z.number().int().nonnegative(),
    eventTypes: z.array(z.string()),
    eventShapes: z.array(z.string().max(800)).max(8),
  }),
  result: z.object({
    url: z.string().regex(/^\/api\/real-generation\/probes\/[a-zA-Z0-9_-]+\/video$/),
    contentType: z.string().startsWith("video/"),
    byteSize: z.number().int().positive(),
  }).nullable(),
}) satisfies z.ZodType<GenerationProbe>;

export const GenerationConnectionSchema = z.object({
  channel: z.literal("web"),
  available: z.boolean(),
  state: z.enum(["disconnected", "connected", "expired"]),
  reason: z.string().nullable(),
  platformUser: z.object({ id: z.string().min(1), displayName: z.string().min(1) }).nullable(),
  specification: ProbeSpecificationSchema,
  probe: GenerationProbeSchema.nullable(),
}) satisfies z.ZodType<GenerationConnection>;

export const PlatformContainerPageSchema = z.object({
  items: z.array(z.object({ id: z.string().min(1), name: z.string() })),
  page: z.number().int().positive(),
  hasMore: z.boolean(),
}) satisfies z.ZodType<PlatformContainerPage>;

export type {
  PlatformLogin, StartGenerationProbe, GenerationProbe, GenerationConnection, PlatformContainerPage,
} from "../domain/generation/real-generation";
