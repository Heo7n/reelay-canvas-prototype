import { z } from "zod";

const IdentifierSchema = z.string().trim().min(1).max(160);

export const SessionActorDtoSchema = z
  .object({
    account: z.string().trim().min(1).max(320),
    contactEmail: z.string().email().max(254).nullable().default(null),
    contactPhone: z.string().trim().min(5).max(32).nullable().default(null),
    id: IdentifierSchema,
    displayName: z.string().trim().min(1).max(160),
    workspaceIds: z.array(IdentifierSchema),
  })
  .strict();
export const SessionResponseDtoSchema = z
  .object({
    actor: SessionActorDtoSchema.nullable(),
  })
  .strict();

export const DemoSessionResponseDtoSchema = z
  .object({
    actor: SessionActorDtoSchema,
    mode: z.literal("demo"),
  })
  .strict();

export const AccountResponseDtoSchema = z
  .object({
    actor: SessionActorDtoSchema,
  })
  .strict();

export const WorkspaceDtoSchema = z
  .object({
    id: IdentifierSchema,
    kind: z.enum(["personal", "organization"]),
    name: z.string().trim().min(1).max(160),
    currentUserRole: z.enum(["owner", "admin", "member"]),
  })
  .strict();

export const WorkspaceListResponseDtoSchema = z
  .object({
    workspaces: z.array(WorkspaceDtoSchema),
  })
  .strict();

export const OrganizationMemberDtoSchema = z
  .object({
    userId: IdentifierSchema,
    displayName: z.string().trim().min(1).max(160),
    loginIdentifier: z.string().trim().min(1).max(320).nullable(),
    role: z.enum(["owner", "admin", "member"]),
  })
  .strict();

export const OrganizationMemberListResponseDtoSchema = z
  .object({
    members: z.array(OrganizationMemberDtoSchema),
  })
  .strict();

export const ProjectDtoSchema = z
  .object({
    id: IdentifierSchema,
    workspaceId: IdentifierSchema,
    accessKind: z.enum(["private", "collaborative"]),
    currentUserRole: z.enum(["admin", "edit", "view"]),
    name: z.string().trim().min(1).max(100),
    updatedAt: z.string().datetime({ offset: true }),
    coverAssetId: IdentifierSchema.nullable(),
  })
  .strict();

export const ProjectListResponseDtoSchema = z
  .object({
    projects: z.array(ProjectDtoSchema),
  })
  .strict();

export const WorkspaceContextResponseDtoSchema = z
  .object({
    actor: SessionActorDtoSchema,
    projects: z.array(ProjectDtoSchema),
    workspaces: z.array(WorkspaceDtoSchema),
  })
  .strict();

export const ProjectResponseDtoSchema = z
  .object({
    project: ProjectDtoSchema,
  })
  .strict();

export const CanvasDocumentDtoSchema = z
  .object({
    id: IdentifierSchema,
    projectId: IdentifierSchema,
    schemaVersion: z.number().int().min(1),
    revision: z.number().int().min(0),
    content: z.unknown(),
  })
  .strict();

export const CanvasDocumentReadResponseDtoSchema = z
  .object({
    document: CanvasDocumentDtoSchema.nullable(),
  })
  .strict();

export const CanvasDocumentResponseDtoSchema = z
  .object({
    document: CanvasDocumentDtoSchema,
  })
  .strict();

export const MediaAssetKindDtoSchema = z.enum(["image", "video", "audio"]);

export const ProjectAssetDtoSchema = z.object({
  referenceId: IdentifierSchema,
  assetId: IdentifierSchema,
  assetVersion: z.number().int().positive(),
  mediaKind: MediaAssetKindDtoSchema,
  displayName: z.string().trim().min(1).max(300),
  contentType: z.string().trim().min(1).max(120),
  byteSize: z.number().int().positive().max(64 * 1024 * 1024),
  checksumSha256: z.string().regex(/^[a-f\d]{64}$/),
  contentUrl: z.string().trim().min(1).max(2_048),
}).strict();

export const MediaUploadIntentResponseDtoSchema = z.object({
  uploadIntent: z.object({
    id: IdentifierSchema,
    expiresAt: z.string().datetime({ offset: true }),
  }).strict(),
  upload: z.object({
    url: z.string().trim().min(1).max(4_096),
    method: z.literal("PUT"),
    headers: z.record(z.string(), z.string()),
  }).strict(),
}).strict();

export const FinalizeMediaUploadResponseDtoSchema = z.object({
  asset: z.object({
    id: IdentifierSchema,
    workspaceId: IdentifierSchema,
    mediaKind: MediaAssetKindDtoSchema,
    displayName: z.string().trim().min(1).max(300),
    objectVersion: z.number().int().positive(),
    contentType: z.string().trim().min(1).max(120),
    byteSize: z.number().int().positive().max(64 * 1024 * 1024),
    checksumSha256: z.string().regex(/^[a-f\d]{64}$/),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  }).strict(),
}).strict();

export const ProjectAssetResponseDtoSchema = z.object({ projectAsset: ProjectAssetDtoSchema }).strict();
export const ProjectAssetsResponseDtoSchema = z.object({ projectAssets: z.array(ProjectAssetDtoSchema) }).strict();

export const ErrorResponseDtoSchema = z
  .object({
    error: z
      .object({
        code: z.string().trim().min(1).max(160),
        message: z.string().trim().min(1).max(500),
        currentRevision: z.number().int().nonnegative().optional(),
      })
      .strict(),
  })
  .strict();
