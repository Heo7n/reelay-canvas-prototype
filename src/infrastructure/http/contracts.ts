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
