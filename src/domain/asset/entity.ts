import type { ActorId } from "../identity/session";
import type { WorkspaceId } from "../workspace/workspace";
import type { WorkspaceMediaAssetId } from "./workspace-media-asset";

export type EntityId = string;
export type EntityPlacementId = string;

export interface EntityMediaReference {
  mediaAssetId: WorkspaceMediaAssetId;
  order: number;
}

export interface WorkspaceEntity {
  id: EntityId;
  workspaceId: WorkspaceId;
  name: string;
  description: string;
  mediaRefs: EntityMediaReference[];
  coverMediaId: WorkspaceMediaAssetId | null;
  version: number;
  createdByActorId: ActorId;
  createdAt: string;
  updatedAt: string;
}

export interface EntityPlacement {
  id: EntityPlacementId;
  workspaceId: WorkspaceId;
  entityId: EntityId;
  scopeKind: "personal";
  ownerActorId: ActorId;
  createdByActorId: ActorId;
  createdAt: string;
}

export interface EntityContentInput {
  name: string;
  description?: string;
  mediaAssetIds: readonly WorkspaceMediaAssetId[];
  coverMediaId?: WorkspaceMediaAssetId | null;
}

export interface NormalizedEntityContent {
  name: string;
  description: string;
  mediaRefs: EntityMediaReference[];
  coverMediaId: WorkspaceMediaAssetId | null;
}

export type EntityValidationReason =
  | "idempotency_key_required"
  | "idempotency_key_too_short"
  | "idempotency_key_too_long"
  | "name_required"
  | "name_too_long"
  | "description_too_long"
  | "invalid_expected_version"
  | "media_required"
  | "too_many_media"
  | "media_id_required"
  | "cover_not_referenced";

export class EntityValidationError extends Error {
  constructor(readonly reason: EntityValidationReason) {
    super(`Entity content is invalid: ${reason}.`);
    this.name = "EntityValidationError";
  }
}

const MAX_ENTITY_NAME_LENGTH = 200;
const MAX_ENTITY_DESCRIPTION_LENGTH = 2_000;
const MAX_ENTITY_MEDIA_COUNT = 100;
const MIN_IDEMPOTENCY_KEY_LENGTH = 8;
const MAX_IDEMPOTENCY_KEY_LENGTH = 200;

export function normalizeEntityIdempotencyKey(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new EntityValidationError("idempotency_key_required");
  if (normalized.length < MIN_IDEMPOTENCY_KEY_LENGTH) {
    throw new EntityValidationError("idempotency_key_too_short");
  }
  if (normalized.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw new EntityValidationError("idempotency_key_too_long");
  }
  return normalized;
}

export function normalizeExpectedEntityVersion(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new EntityValidationError("invalid_expected_version");
  }
  return value;
}

export function normalizeEntityContent(input: EntityContentInput): NormalizedEntityContent {
  const name = input.name.trim();
  if (!name) throw new EntityValidationError("name_required");
  if (name.length > MAX_ENTITY_NAME_LENGTH) throw new EntityValidationError("name_too_long");

  const description = (input.description ?? "").trim();
  if (description.length > MAX_ENTITY_DESCRIPTION_LENGTH) {
    throw new EntityValidationError("description_too_long");
  }

  const seen = new Set<WorkspaceMediaAssetId>();
  const mediaAssetIds: WorkspaceMediaAssetId[] = [];
  for (const value of input.mediaAssetIds) {
    const mediaAssetId = value.trim();
    if (!mediaAssetId) throw new EntityValidationError("media_id_required");
    if (seen.has(mediaAssetId)) continue;
    seen.add(mediaAssetId);
    mediaAssetIds.push(mediaAssetId);
  }
  if (mediaAssetIds.length === 0) throw new EntityValidationError("media_required");
  if (mediaAssetIds.length > MAX_ENTITY_MEDIA_COUNT) throw new EntityValidationError("too_many_media");

  const requestedCoverMediaId = input.coverMediaId?.trim() || null;
  if (requestedCoverMediaId && !seen.has(requestedCoverMediaId)) {
    throw new EntityValidationError("cover_not_referenced");
  }

  return {
    name,
    description,
    mediaRefs: mediaAssetIds.map((mediaAssetId, order) => ({ mediaAssetId, order })),
    coverMediaId: requestedCoverMediaId,
  };
}
