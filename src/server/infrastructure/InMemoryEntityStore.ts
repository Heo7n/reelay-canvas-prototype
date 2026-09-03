import { randomUUID } from "node:crypto";

import {
  normalizeEntityContent,
  normalizeEntityIdempotencyKey,
  normalizeExpectedEntityVersion,
  type NormalizedEntityContent,
  type WorkspaceEntity,
} from "../../domain/asset/entity";
import type { ActorId } from "../../domain/identity/session";
import type { WorkspaceId } from "../../domain/workspace/workspace";
import type { MediaKind } from "../../domain/asset/workspace-media-asset";
import {
  EntityCoverMediaInvalidError,
  EntityCreateConflictError,
  EntityMediaUnavailableError,
  EntityUnavailableError,
  EntityVersionConflictError,
  EntityWorkspaceUnavailableError,
  type CreatePersonalEntityInput,
  type EntityStore,
  type ListPersonalEntitiesInput,
  type ReadPersonalEntityInput,
  type UpdatePersonalEntityInput,
} from "../application/EntityStore";

export interface InMemoryEntityAsset {
  id: string;
  workspaceId: WorkspaceId;
  mediaKind: MediaKind;
  finalized: boolean;
}

export interface InMemoryPersonalAssetPlacement {
  workspaceId: WorkspaceId;
  assetId: string;
  ownerActorId: ActorId;
}

export interface InMemoryEntityStoreSeed {
  workspaceMemberships: Array<{ workspaceId: WorkspaceId; actorId: ActorId }>;
  assets: InMemoryEntityAsset[];
  personalAssetPlacements: InMemoryPersonalAssetPlacement[];
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function sameContent(entity: WorkspaceEntity, content: NormalizedEntityContent): boolean {
  return entity.name === content.name
    && entity.description === content.description
    && entity.coverMediaId === content.coverMediaId
    && entity.mediaRefs.length === content.mediaRefs.length
    && entity.mediaRefs.every((reference, index) => {
      const expected = content.mediaRefs[index];
      return reference.mediaAssetId === expected.mediaAssetId && reference.order === expected.order;
    });
}

export class InMemoryEntityStore implements EntityStore {
  private readonly workspaceMemberships: Set<string>;
  private readonly assets = new Map<string, InMemoryEntityAsset>();
  private readonly personalAssetPlacements: Set<string>;
  private readonly entities = new Map<string, WorkspaceEntity>();
  private readonly personalEntityPlacements = new Set<string>();
  private readonly createCommandEntities = new Map<string, string>();

  constructor(
    seed: InMemoryEntityStoreSeed = {
      workspaceMemberships: [],
      assets: [],
      personalAssetPlacements: [],
    },
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = randomUUID,
  ) {
    this.workspaceMemberships = new Set(
      seed.workspaceMemberships.map(({ workspaceId, actorId }) => this.membershipKey(workspaceId, actorId)),
    );
    seed.assets.forEach((asset) => this.assets.set(this.assetKey(asset.workspaceId, asset.id), clone(asset)));
    this.personalAssetPlacements = new Set(
      seed.personalAssetPlacements.map(({ workspaceId, assetId, ownerActorId }) => (
        this.personalAssetPlacementKey(workspaceId, assetId, ownerActorId)
      )),
    );
  }

  async createPersonalEntity(input: CreatePersonalEntityInput): Promise<WorkspaceEntity> {
    this.requireWorkspaceMembership(input.workspaceId, input.actorId);
    const idempotencyKey = normalizeEntityIdempotencyKey(input.idempotencyKey);
    const content = normalizeEntityContent(input);
    const commandKey = this.createCommandKey(input.workspaceId, input.actorId, idempotencyKey);
    const existingId = this.createCommandEntities.get(commandKey);
    if (existingId) {
      const existing = this.entities.get(existingId);
      if (!existing || !sameContent(existing, content)) {
        throw new EntityCreateConflictError("idempotency_key_reused");
      }
      this.requirePersonalMedia(input.workspaceId, input.actorId, content);
      this.personalEntityPlacements.add(
        this.personalEntityPlacementKey(input.workspaceId, existing.id, input.actorId),
      );
      return clone(existing);
    }
    this.requirePersonalMedia(input.workspaceId, input.actorId, content);

    const timestamp = this.now().toISOString();
    const entity: WorkspaceEntity = {
      id: `entity-${this.createId()}`,
      workspaceId: input.workspaceId,
      name: content.name,
      description: content.description,
      mediaRefs: content.mediaRefs,
      coverMediaId: content.coverMediaId,
      version: 1,
      createdByActorId: input.actorId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.entities.set(entity.id, entity);
    this.personalEntityPlacements.add(this.personalEntityPlacementKey(input.workspaceId, entity.id, input.actorId));
    this.createCommandEntities.set(commandKey, entity.id);
    return clone(entity);
  }

  async listPersonalEntities(input: ListPersonalEntitiesInput): Promise<WorkspaceEntity[]> {
    this.requireWorkspaceMembership(input.workspaceId, input.actorId);
    return [...this.entities.values()]
      .filter((entity) => (
        entity.workspaceId === input.workspaceId
        && this.personalEntityPlacements.has(
          this.personalEntityPlacementKey(input.workspaceId, entity.id, input.actorId),
        )
      ))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id))
      .map(clone);
  }

  async getPersonalEntity(input: ReadPersonalEntityInput): Promise<WorkspaceEntity | null> {
    this.requireWorkspaceMembership(input.workspaceId, input.actorId);
    const entity = this.entities.get(input.entityId);
    return entity
      && entity.workspaceId === input.workspaceId
      && this.personalEntityPlacements.has(
        this.personalEntityPlacementKey(input.workspaceId, input.entityId, input.actorId),
      )
      ? clone(entity)
      : null;
  }

  async updatePersonalEntity(input: UpdatePersonalEntityInput): Promise<WorkspaceEntity> {
    this.requireWorkspaceMembership(input.workspaceId, input.actorId);
    const expectedVersion = normalizeExpectedEntityVersion(input.expectedVersion);
    const entity = this.entities.get(input.entityId);
    if (
      !entity
      || entity.workspaceId !== input.workspaceId
      || !this.personalEntityPlacements.has(
        this.personalEntityPlacementKey(input.workspaceId, input.entityId, input.actorId),
      )
    ) throw new EntityUnavailableError();
    if (entity.version !== expectedVersion) throw new EntityVersionConflictError(entity.version);

    const content = normalizeEntityContent(input);
    this.requirePersonalMedia(input.workspaceId, input.actorId, content);
    const updated: WorkspaceEntity = {
      ...entity,
      name: content.name,
      description: content.description,
      mediaRefs: content.mediaRefs,
      coverMediaId: content.coverMediaId,
      version: entity.version + 1,
      updatedAt: this.now().toISOString(),
    };
    this.entities.set(updated.id, updated);
    return clone(updated);
  }

  private requireWorkspaceMembership(workspaceId: WorkspaceId, actorId: ActorId): void {
    if (!this.workspaceMemberships.has(this.membershipKey(workspaceId, actorId))) {
      throw new EntityWorkspaceUnavailableError();
    }
  }

  private requirePersonalMedia(
    workspaceId: WorkspaceId,
    actorId: ActorId,
    content: NormalizedEntityContent,
  ): void {
    const available = content.mediaRefs.every(({ mediaAssetId }) => {
      const asset = this.assets.get(this.assetKey(workspaceId, mediaAssetId));
      return asset?.finalized === true
        && this.personalAssetPlacements.has(this.personalAssetPlacementKey(workspaceId, mediaAssetId, actorId));
    });
    if (!available) throw new EntityMediaUnavailableError();
    if (content.coverMediaId) {
      const cover = this.assets.get(this.assetKey(workspaceId, content.coverMediaId));
      if (!cover || cover.mediaKind !== "image") throw new EntityCoverMediaInvalidError();
    }
  }

  private membershipKey(workspaceId: WorkspaceId, actorId: ActorId): string {
    return `${workspaceId}\u0000${actorId}`;
  }

  private assetKey(workspaceId: WorkspaceId, assetId: string): string {
    return `${workspaceId}\u0000${assetId}`;
  }

  private personalAssetPlacementKey(workspaceId: WorkspaceId, assetId: string, actorId: ActorId): string {
    return `${workspaceId}\u0000${assetId}\u0000${actorId}`;
  }

  private personalEntityPlacementKey(workspaceId: WorkspaceId, entityId: string, actorId: ActorId): string {
    return `${workspaceId}\u0000${entityId}\u0000${actorId}`;
  }

  private createCommandKey(workspaceId: WorkspaceId, actorId: ActorId, idempotencyKey: string): string {
    return `${workspaceId}\u0000${actorId}\u0000${idempotencyKey}`;
  }
}
