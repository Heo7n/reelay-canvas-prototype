export type MediaStorageSpace = "personal" | "organization";

export interface MediaStorageOwner {
  kind: MediaStorageSpace;
  id: string;
}

export interface MediaStorageSnapshot {
  owner: MediaStorageOwner;
  limitBytes: number;
  usedBytes: number;
  reservedBytes: number;
  availableBytes: number;
}

export interface MediaStorageLimits {
  personal?: number;
  organization?: number;
}

export const DEFAULT_MEDIA_STORAGE_BYTES = 10 * 1024 * 1024 * 1024;

export function mediaStorageLimit(limits: MediaStorageLimits, kind: MediaStorageSpace): number {
  const value = limits[kind] ?? DEFAULT_MEDIA_STORAGE_BYTES;
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Storage capacity must be a non-negative safe integer.");
  return value;
}

export function mediaStorageSnapshot(owner: MediaStorageOwner, limitBytes: number, usedBytes: number, reservedBytes: number): MediaStorageSnapshot {
  return { owner, limitBytes, usedBytes, reservedBytes, availableBytes: Math.max(0, limitBytes - usedBytes - reservedBytes) };
}

export class MediaStorageQuotaExceededError extends Error {
  constructor(readonly storage: MediaStorageSnapshot) {
    super("Storage capacity is exhausted.");
    this.name = "MediaStorageQuotaExceededError";
  }
}
