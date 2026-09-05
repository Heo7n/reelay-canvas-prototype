import { z } from "zod";

const IdentifierSchema = z.string().trim().min(1).max(200);

export const WorkspaceAssetParamsSchema = z.object({
  workspaceId: IdentifierSchema,
}).strict();

export const WorkspaceAssetItemParamsSchema = z.object({
  workspaceId: IdentifierSchema,
  assetId: IdentifierSchema,
}).strict();

export const AssetUploadParamsSchema = z.object({
  workspaceId: IdentifierSchema,
  uploadId: IdentifierSchema,
}).strict();

export const ProjectAssetParamsSchema = z.object({
  projectId: IdentifierSchema,
}).strict();

export const ProjectAssetItemParamsSchema = z.object({
  projectId: IdentifierSchema,
  assetId: IdentifierSchema,
}).strict();

export const ProjectAssetContentParamsSchema = z.object({
  projectId: IdentifierSchema,
  referenceId: IdentifierSchema,
}).strict();

export const CreateAssetUploadIntentBodySchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(200),
  mediaKind: z.enum(["image", "video", "audio"]),
  displayName: z.string().trim().min(1).max(300),
  contentType: z.string().trim().toLowerCase().min(1).max(120),
  byteSize: z.number().int().positive().max(64 * 1024 * 1024),
  checksumSha256: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();

export const RenamePersonalAssetBodySchema = z.object({
  displayName: z.string().trim().min(1).max(300),
}).strict();

export const PersonalAssetQuerySchema = z.object({
  scope: z.literal("personal").optional().default("personal"),
}).strict();
