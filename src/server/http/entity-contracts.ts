import { z } from "zod";

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
  scope: z.literal("personal").optional().default("personal"),
}).strict();

export const CreatePersonalEntityBodySchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(200),
  name: EntityNameSchema,
  description: EntityDescriptionSchema,
  assetIds: EntityAssetIdsSchema,
  coverAssetId: EntityCoverAssetIdSchema,
}).strict();

export const UpdatePersonalEntityBodySchema = z.object({
  expectedVersion: z.number().int().positive(),
  name: EntityNameSchema,
  description: EntityDescriptionSchema,
  assetIds: EntityAssetIdsSchema,
  coverAssetId: EntityCoverAssetIdSchema,
}).strict();
