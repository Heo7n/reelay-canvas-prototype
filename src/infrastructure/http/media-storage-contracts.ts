import { z } from "zod";
import type { MediaStorageSnapshot } from "../../domain/asset/media-storage";

const MediaStorageSnapshotSchema: z.ZodType<MediaStorageSnapshot> = z.object({
  owner: z.object({ kind: z.enum(["personal", "organization"]), id: z.string().min(1) }).strict(),
  limitBytes: z.number().int().nonnegative(),
  usedBytes: z.number().int().nonnegative(),
  reservedBytes: z.number().int().nonnegative(),
  availableBytes: z.number().int().nonnegative(),
}).strict();

export const MediaStorageResponseSchema = z.object({
  storage: MediaStorageSnapshotSchema,
  cleanup: z.object({
    pendingCount: z.number().int().nonnegative(),
    heldForRemoteUploadCount: z.number().int().nonnegative(),
  }).strict(),
}).strict();
