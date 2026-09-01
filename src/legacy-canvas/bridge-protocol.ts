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
    entityPersistence: z.boolean().optional(),
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

export const bridgeWorkspaceAssetSchema = z.object({
  assetId: bridgeIdentifierSchema,
  assetVersion: z.number().int().positive(),
  mediaKind: mediaKindSchema,
  displayName: z.string().trim().min(1).max(300),
  contentType: z.string().trim().min(1).max(120),
  byteSize: z.number().int().positive().max(64 * 1024 * 1024),
  checksumSha256: z.string().regex(/^[a-f\d]{64}$/),
  contentUrl: z.string().trim().min(1).max(2_048),
}).strict();

export const bridgeWorkspaceEntitySchema = z.object({
  id: bridgeIdentifierSchema,
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2_000),
  mediaRefs: z.array(z.object({
    assetId: bridgeIdentifierSchema,
    order: z.number().int().nonnegative(),
  }).strict()).min(1).max(100),
  coverAssetId: bridgeIdentifierSchema.nullable(),
  version: z.number().int().positive(),
}).strict().superRefine((entity, context) => {
  const assetIds = new Set<string>();
  entity.mediaRefs.forEach((reference, index) => {
    if (assetIds.has(reference.assetId) || reference.order !== index) {
      context.addIssue({ code: "custom", message: "Entity mediaRefs must be unique and contiguously ordered." });
    }
    assetIds.add(reference.assetId);
  });
  if (entity.coverAssetId && !assetIds.has(entity.coverAssetId)) {
    context.addIssue({ code: "custom", message: "Entity coverAssetId must belong to mediaRefs." });
  }
});
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

export const hostWorkspaceAssetCatalogMessageSchema = z.object({
  source: z.literal("reelay-shell"),
  type: z.literal("host:workspace-asset-catalog"),
  protocolVersion: z.literal(1),
  requestId: bridgeRequestIdSchema,
  instanceId: canvasInstanceIdSchema,
  assets: z.array(bridgeWorkspaceAssetSchema).max(10_000),
  entities: z.array(bridgeWorkspaceEntitySchema).max(10_000),
}).strict();

export const hostEntityCommandResultMessageSchema = z.object({
  source: z.literal("reelay-shell"),
  type: z.literal("host:entity-command-result"),
  protocolVersion: z.literal(1),
  requestId: bridgeRequestIdSchema,
  instanceId: canvasInstanceIdSchema,
  entity: bridgeWorkspaceEntitySchema,
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

const hostMediaUploadResultFields = {
  source: z.literal("reelay-shell"),
  type: z.literal("host:media-upload-result"),
  protocolVersion: z.literal(1),
  requestId: bridgeRequestIdSchema,
  instanceId: canvasInstanceIdSchema,
  uploadId: bridgeIdentifierSchema,
};

export const hostMediaUploadResultMessageSchema = z.discriminatedUnion("target", [
  z.object({
    ...hostMediaUploadResultFields,
    target: z.literal("project"),
    projectAsset: bridgeProjectAssetSchema,
  }).strict(),
  z.object({
    ...hostMediaUploadResultFields,
    target: z.literal("personal"),
    workspaceAsset: bridgeWorkspaceAssetSchema,
  }).strict(),
]);

export const hostAssetCommandErrorMessageSchema = z.object({
  source: z.literal("reelay-shell"),
  type: z.literal("host:asset-command-error"),
  protocolVersion: z.literal(1),
  requestId: bridgeRequestIdSchema,
  instanceId: canvasInstanceIdSchema,
  code: z.enum(["invalid", "forbidden", "missing", "conflict", "network", "unsupported"]),
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
    target: z.enum(["project", "personal"]).optional().default("project"),
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
  z.object({
    source: z.literal("reelay-legacy-canvas"),
    type: z.literal("canvas:create-entity"),
    protocolVersion: z.literal(1),
    instanceId: canvasInstanceIdSchema,
    requestId: bridgeRequestIdSchema,
    idempotencyKey: z.string().trim().min(8).max(200),
    name: z.string().trim().min(1).max(200),
    description: z.string().max(2_000),
    assetIds: z.array(bridgeIdentifierSchema).min(1).max(100),
    coverAssetId: bridgeIdentifierSchema.nullable(),
  }).strict(),
  z.object({
    source: z.literal("reelay-legacy-canvas"),
    type: z.literal("canvas:update-entity"),
    protocolVersion: z.literal(1),
    instanceId: canvasInstanceIdSchema,
    requestId: bridgeRequestIdSchema,
    entityId: bridgeIdentifierSchema,
    expectedVersion: z.number().int().positive(),
    name: z.string().trim().min(1).max(200),
    description: z.string().max(2_000),
    assetIds: z.array(bridgeIdentifierSchema).min(1).max(100),
    coverAssetId: bridgeIdentifierSchema.nullable(),
  }).strict(),
]);

export type CanvasMessage = z.infer<typeof canvasMessageSchema>;

export function parseCanvasMessage(value: unknown): CanvasMessage | null {
  const result = canvasMessageSchema.safeParse(value);
  return result.success ? result.data : null;
}
