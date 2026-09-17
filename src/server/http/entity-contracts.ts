import { z } from "zod";
import { EntityLibraryTagIdsSchema } from "../../domain/asset/entity-library-tags";

const IdentifierSchema = z.string().trim().min(1).max(200);
const EntityNameSchema = z.string().trim().min(1).max(200);
const EntityDescriptionSchema = z.string().max(2_000).optional().default("");
const EntityAssetIdsSchema = z.array(IdentifierSchema).min(1).max(100);
const EntityCoverAssetIdSchema = IdentifierSchema.nullable().optional().default(null);

export const WorkspaceEntityParamsSchema = z.object({
  workspaceId: IdentifierSchema,
}).strict();

export const WorkspaceEntityItemParamsSchema = z.object({
  workspaceId: IdentifierSchema,
  entityId: IdentifierSchema,
}).strict();

export const PersonalEntityQuerySchema = z.object({
  scope: z.enum(["personal", "organization"]).optional().default("personal"),
}).strict();

export const CreatePersonalEntityBodySchema = z.object({
  space: z.enum(["personal", "organization"]).optional().default("personal"),
  folderId: z.string().trim().min(1).max(200).nullable().optional(),
  idempotencyKey: z.string().trim().min(8).max(200),
  tagIds: EntityLibraryTagIdsSchema.optional(),
  name: EntityNameSchema,
  description: EntityDescriptionSchema,
  assetIds: EntityAssetIdsSchema,
  coverAssetId: EntityCoverAssetIdSchema,
}).strict();

export const UpdatePersonalEntityBodySchema = z.object({
  space: z.enum(["personal", "organization"]).optional().default("personal"),
  expectedVersion: z.number().int().positive(),
  tagIds: EntityLibraryTagIdsSchema.optional(),
  expectedTagIds: EntityLibraryTagIdsSchema.optional(),
  name: EntityNameSchema,
  description: EntityDescriptionSchema,
  assetIds: EntityAssetIdsSchema,
  coverAssetId: EntityCoverAssetIdSchema,
}).strict();
