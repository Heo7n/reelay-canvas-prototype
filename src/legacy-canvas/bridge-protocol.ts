import { z } from "zod";

export const bridgeCanvasDocumentSchema = z
  .object({
    id: z.string().min(1),
    projectId: z.string().min(1),
    schemaVersion: z.number().int().min(1),
    revision: z.number().int().min(0),
    content: z.unknown(),
  })
  .strict();

const legacyCanvasCapabilitiesSchema = z
  .object({
    accountSections: z.boolean(),
    projectSwitcher: z.boolean().optional(),
    assetPersistence: z.boolean().optional(),
  })
  .strict();

const legacyProjectOptionSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    coverUrl: z.string().min(1).nullable(),
  })
  .strict();

export const legacyCanvasContextSchema = z
  .object({
    protocolVersion: z.literal(1),
    workspaceId: z.string().min(1),
    projectId: z.string().min(1),
    projectName: z.string().min(1),
    projects: z.array(legacyProjectOptionSchema).optional(),
    canvasId: z.string().min(1),
    theme: z.enum(["light", "dark"]),
    writable: z.boolean(),
    capabilities: legacyCanvasCapabilitiesSchema.optional(),
    actor: z.object({
      account: z.string().min(1),
      displayName: z.string().min(1),
    }).strict(),
    workspace: z.object({
      name: z.string().min(1),
      role: z.enum(["owner", "admin", "member"]),
    }).strict(),
  })
  .strict();

export type LegacyCanvasContext = z.infer<typeof legacyCanvasContextSchema>;

const canvasInstanceIdSchema = z.string().min(1).max(200);
const bridgeRequestIdSchema = z.string().min(1).max(200);
const bridgeIdentifierSchema = z.string().min(1).max(200);
const mediaKindSchema = z.enum(["image", "video", "audio"]);

export const bridgeProjectAssetSchema = z.object({
  referenceId: bridgeIdentifierSchema,
  assetId: bridgeIdentifierSchema,
  assetVersion: z.number().int().positive(),
  mediaKind: mediaKindSchema,
  displayName: z.string().trim().min(1).max(300),
  contentType: z.string().trim().min(1).max(120),
  byteSize: z.number().int().positive().max(64 * 1024 * 1024),
  checksumSha256: z.string().regex(/^[a-f\d]{64}$/),
  contentUrl: z.string().trim().min(1).max(2_048),
}).strict();
export const legacyAccountSectionSchema = z.enum(["profile", "credits"]);
export type LegacyAccountSection = z.infer<typeof legacyAccountSectionSchema>;

export const hostMessageSchema = z
  .object({
    source: z.literal("reelay-shell"),
    type: z.literal("host:init"),
    context: legacyCanvasContextSchema,
  })
  .strict();

export const hostDocumentMessageSchema = z
  .object({
    source: z.literal("reelay-shell"),
    type: z.literal("host:document"),
    protocolVersion: z.literal(1),
    document: bridgeCanvasDocumentSchema.nullable(),
    writable: z.boolean(),
  })
  .strict();

export const hostFlushMessageSchema = z
  .object({
    source: z.literal("reelay-shell"),
    type: z.literal("host:flush"),
    protocolVersion: z.literal(1),
  })
  .strict();

export const hostSaveResultMessageSchema = z
  .object({
    source: z.literal("reelay-shell"),
    type: z.literal("host:save-result"),
    protocolVersion: z.literal(1),
    requestId: z.string().min(1),
    document: bridgeCanvasDocumentSchema,
  })
  .strict();

export const hostSaveErrorMessageSchema = z
  .object({
    source: z.literal("reelay-shell"),
    type: z.literal("host:save-error"),
    protocolVersion: z.literal(1),
    requestId: z.string().min(1),
    code: z.enum(["conflict", "forbidden", "missing", "network"]),
  })
  .strict();

export const hostProjectAssetsMessageSchema = z.object({
  source: z.literal("reelay-shell"),
  type: z.literal("host:project-assets"),
  protocolVersion: z.literal(1),
  requestId: bridgeRequestIdSchema,
  instanceId: canvasInstanceIdSchema,
  projectAssets: z.array(bridgeProjectAssetSchema).max(10_000),
}).strict();

export const hostMediaUploadGrantMessageSchema = z.object({
  source: z.literal("reelay-shell"),
  type: z.literal("host:media-upload-grant"),
  protocolVersion: z.literal(1),
  requestId: bridgeRequestIdSchema,
  instanceId: canvasInstanceIdSchema,
  uploadIntent: z.object({
    id: bridgeIdentifierSchema,
    expiresAt: z.string().datetime({ offset: true }),
  }).strict(),
  upload: z.object({
    url: z.string().trim().min(1).max(4_096),
    method: z.literal("PUT"),
    headers: z.record(z.string(), z.string()),
  }).strict(),
}).strict();

export const hostMediaUploadResultMessageSchema = z.object({
  source: z.literal("reelay-shell"),
  type: z.literal("host:media-upload-result"),
  protocolVersion: z.literal(1),
  requestId: bridgeRequestIdSchema,
  instanceId: canvasInstanceIdSchema,
  uploadId: bridgeIdentifierSchema,
  projectAsset: bridgeProjectAssetSchema,
}).strict();

export const hostAssetCommandErrorMessageSchema = z.object({
  source: z.literal("reelay-shell"),
  type: z.literal("host:asset-command-error"),
  protocolVersion: z.literal(1),
  requestId: bridgeRequestIdSchema,
  instanceId: canvasInstanceIdSchema,
  code: z.enum(["invalid", "forbidden", "missing", "network", "unsupported"]),
}).strict();

export const canvasMessageSchema = z.discriminatedUnion("type", [
  z.object({
    source: z.literal("reelay-legacy-canvas"),
    type: z.literal("canvas:ready"),
    protocolVersion: z.literal(1),
    instanceId: canvasInstanceIdSchema,
  }).strict(),
  z.object({
    source: z.literal("reelay-legacy-canvas"),
    type: z.literal("canvas:dirty"),
    protocolVersion: z.literal(1),
    instanceId: canvasInstanceIdSchema,
    dirty: z.boolean(),
  }).strict(),
  z.object({
    source: z.literal("reelay-legacy-canvas"),
    type: z.literal("canvas:navigate"),
    protocolVersion: z.literal(1),
    instanceId: canvasInstanceIdSchema,
    target: z.enum(["home", "projects", "organization", "logout"]),
  }).strict(),
  z.object({
    source: z.literal("reelay-legacy-canvas"),
    type: z.literal("canvas:open-project"),
    protocolVersion: z.literal(1),
    instanceId: canvasInstanceIdSchema,
    projectId: z.string().min(1),
  }).strict(),
  z.object({
    source: z.literal("reelay-legacy-canvas"),
    type: z.literal("canvas:create-project"),
    protocolVersion: z.literal(1),
    instanceId: canvasInstanceIdSchema,
  }).strict(),
  z.object({
    source: z.literal("reelay-legacy-canvas"),
    type: z.literal("canvas:open-account"),
    protocolVersion: z.literal(1),
    instanceId: canvasInstanceIdSchema,
    section: legacyAccountSectionSchema.optional().default("profile"),
  }).strict(),
  z.object({
    source: z.literal("reelay-legacy-canvas"),
    type: z.literal("canvas:save"),
    protocolVersion: z.literal(1),
    instanceId: canvasInstanceIdSchema,
    requestId: z.string().min(1),
    schemaVersion: z.number().int().min(1),
    expectedRevision: z.number().int().min(0),
    content: z.unknown(),
  }).strict(),
  z.object({
    source: z.literal("reelay-legacy-canvas"),
    type: z.literal("canvas:create-media-upload"),
    protocolVersion: z.literal(1),
    instanceId: canvasInstanceIdSchema,
    requestId: bridgeRequestIdSchema,
    idempotencyKey: z.string().trim().min(1).max(200),
    mediaKind: mediaKindSchema,
    displayName: z.string().trim().min(1).max(300),
    contentType: z.string().trim().min(1).max(120),
    byteSize: z.number().int().positive().max(64 * 1024 * 1024),
    checksumSha256: z.string().regex(/^[a-f\d]{64}$/),
  }).strict(),
  z.object({
    source: z.literal("reelay-legacy-canvas"),
    type: z.literal("canvas:finalize-media-upload"),
    protocolVersion: z.literal(1),
    instanceId: canvasInstanceIdSchema,
    requestId: bridgeRequestIdSchema,
    uploadId: bridgeIdentifierSchema,
  }).strict(),
]);

export type CanvasMessage = z.infer<typeof canvasMessageSchema>;

export function parseCanvasMessage(value: unknown): CanvasMessage | null {
  const result = canvasMessageSchema.safeParse(value);
  return result.success ? result.data : null;
}
