import { z } from "zod";

const IdentifierSchema = z.string().trim().min(1).max(160);

export const SessionActorDtoSchema = z
  .object({
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

export const WorkspaceDtoSchema = z
  .object({
    id: IdentifierSchema,
    kind: z.enum(["personal", "organization"]),
    name: z.string().trim().min(1).max(160),
  })
  .strict();

export const WorkspaceListResponseDtoSchema = z
  .object({
    workspaces: z.array(WorkspaceDtoSchema),
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

export const ProjectResponseDtoSchema = z
  .object({
    project: ProjectDtoSchema,
  })
  .strict();

export const ErrorResponseDtoSchema = z
  .object({
    error: z
      .object({
        code: z.string().trim().min(1).max(160),
        message: z.string().trim().min(1).max(500),
      })
      .strict(),
  })
  .strict();
