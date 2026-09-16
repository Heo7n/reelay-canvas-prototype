import { MediaLibraryError, type LibraryEntityBinding, type LibraryEntityEntry } from "../../domain/asset/media-library";
import { randomUUID } from "node:crypto";
import { normalizeEntityLibraryTags, validateEntityLibraryTags, requireExpectedEntityLibraryTags } from "../../domain/asset/entity-library-tags";

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
  private readonly personalEntityPlacements = new Map<string, { tagIds: string[]; folderId: string | null; addedAt: string }>();
  private personalMediaReader?: (workspaceId: string, actorId: string, assetId: string) => InMemoryEntityAsset | null;
  private readonly deletedLibraryEntities = new Set<string>();
  private personalTagExists?: (workspaceId: string, actorId: string, tagId: string) => boolean;
  private personalFolderExists?: (workspaceId: string, actorId: string, folderId: string) => boolean;
  private readonly createCommandFolders = new Map<string, string | null>();
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
    const tagIds = normalizeEntityLibraryTags(input.tagIds ?? []);
    const commandKey = this.createCommandKey(input.workspaceId, input.actorId, idempotencyKey);
    const existingId = this.createCommandEntities.get(commandKey);
    if (existingId) {
      const existing = this.entities.get(existingId);
      if (!existing || (this.createCommandFolders.get(commandKey) ?? null) !== (input.folderId ?? null) || this.deletedLibraryEntities.has(this.personalEntityPlacementKey(input.workspaceId, existingId, input.actorId)) || !sameContent(existing, content)) {
        throw new EntityCreateConflictError("idempotency_key_reused");
      }
      const existingTags = this.personalEntityPlacements.get(this.personalEntityPlacementKey(input.workspaceId, existing.id, input.actorId))?.tagIds ?? [];
      if (input.tagIds !== undefined && JSON.stringify(normalizeEntityLibraryTags(existingTags)) !== JSON.stringify(tagIds)) throw new EntityCreateConflictError("idempotency_key_reused");
      this.requirePersonalMedia(input.workspaceId, input.actorId, content);
      const placementKey = this.personalEntityPlacementKey(input.workspaceId, existing.id, input.actorId);
      if (!this.personalEntityPlacements.has(placementKey)) this.personalEntityPlacements.set(placementKey, { tagIds: [], folderId: null, addedAt: existing.createdAt });
      return { ...clone(existing), libraryTagIds: [...existingTags] };
    }
    validateEntityLibraryTags(tagIds, (id) => this.personalTagExists?.(input.workspaceId, input.actorId, id) ?? false);
    if (input.folderId && !this.personalFolderExists?.(input.workspaceId, input.actorId, input.folderId)) throw new MediaLibraryError("folder_not_found", "保存目录不存在或不可访问，请重新选择。");
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
    this.personalEntityPlacements.set(this.personalEntityPlacementKey(input.workspaceId, entity.id, input.actorId), { tagIds: [...tagIds], folderId: input.folderId ?? null, addedAt: timestamp });
    this.createCommandEntities.set(commandKey, entity.id);
    this.createCommandFolders.set(commandKey, input.folderId ?? null);
    return { ...clone(entity), libraryTagIds: [...tagIds] };
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
      .map((entity) => ({ ...clone(entity), libraryTagIds: [...this.personalEntityPlacements.get(this.personalEntityPlacementKey(input.workspaceId, entity.id, input.actorId))!.tagIds] }));
  }

  async getPersonalEntity(input: ReadPersonalEntityInput): Promise<WorkspaceEntity | null> {
    this.requireWorkspaceMembership(input.workspaceId, input.actorId);
    const entity = this.entities.get(input.entityId);
    return entity
      && entity.workspaceId === input.workspaceId
      && this.personalEntityPlacements.has(
        this.personalEntityPlacementKey(input.workspaceId, input.entityId, input.actorId),
      )
      ? { ...clone(entity), libraryTagIds: [...this.personalEntityPlacements.get(this.personalEntityPlacementKey(input.workspaceId, entity.id, input.actorId))!.tagIds] }
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
    const placementKey = this.personalEntityPlacementKey(input.workspaceId, input.entityId, input.actorId);
    const placement = this.personalEntityPlacements.get(placementKey)!;
    let tagIds = placement.tagIds;
    if (input.tagIds !== undefined) {
      requireExpectedEntityLibraryTags(placement.tagIds, input.expectedTagIds);
      tagIds = validateEntityLibraryTags(input.tagIds, (id) => this.personalTagExists?.(input.workspaceId, input.actorId, id) ?? false);
    }
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
    this.personalEntityPlacements.set(placementKey, { ...placement, tagIds: [...tagIds] });
    return { ...clone(updated), libraryTagIds: [...tagIds] };
  }

  connectLibraryTags(exists: (workspaceId: string, actorId: string, tagId: string) => boolean): void { this.personalTagExists = exists; }

  connectLibraryFolders(exists: (workspaceId: string, actorId: string, folderId: string) => boolean): void { this.personalFolderExists = exists; }

  connectLibraryMedia(reader: (workspaceId: string, actorId: string, assetId: string) => InMemoryEntityAsset | null): void {
    this.personalMediaReader = reader;
  }

  libraryBindings(workspaceId: string, actorId: string): LibraryEntityBinding[] {
    return [...this.entities.values()].filter((entity) => entity.workspaceId === workspaceId && this.personalEntityPlacements.has(this.personalEntityPlacementKey(workspaceId, entity.id, actorId)))
      .map((entity) => ({ id: entity.id, version: entity.version, assetIds: entity.mediaRefs.map((ref) => ref.mediaAssetId) }));
  }

  libraryEntries(workspaceId: string, actorId: string): LibraryEntityEntry[] {
    return this.libraryBindings(workspaceId, actorId).map((entity) => ({ entityId: entity.id, space: "personal", ...structuredClone(this.personalEntityPlacements.get(this.personalEntityPlacementKey(workspaceId, entity.id, actorId))!) }));
  }

  updateLibraryPlacementTags(workspaceId: string, actorId: string, updates: Array<{ id: string; tagIds: string[] }>): void {
    const placements = updates.map((update) => ({ ...update, key: this.personalEntityPlacementKey(workspaceId, update.id, actorId) }));
    if (placements.some(({ key }) => !this.personalEntityPlacements.has(key))) throw new MediaLibraryError("library_item_not_found", "所选素材组不存在或不可访问。");
    for (const { key, tagIds } of placements) this.personalEntityPlacements.set(key, { ...this.personalEntityPlacements.get(key)!, tagIds: [...tagIds] });
  }

  moveLibraryPlacements(workspaceId: string, actorId: string, entityIds: string[], folderId: string | null, addedAt: string): void {
    for (const entityId of entityIds) {
      const key = this.personalEntityPlacementKey(workspaceId, entityId, actorId);
      const current = this.personalEntityPlacements.get(key)!;
      if (current.folderId !== folderId) this.personalEntityPlacements.set(key, { ...current, folderId, addedAt });
    }
  }

  detachLibraryFolders(workspaceId: string, actorId: string, folderIds: string[]): void {
    for (const entry of this.libraryEntries(workspaceId, actorId)) {
      if (!entry.folderId || !folderIds.includes(entry.folderId)) continue;
      const key = this.personalEntityPlacementKey(workspaceId, entry.entityId, actorId);
      this.personalEntityPlacements.set(key, { ...this.personalEntityPlacements.get(key)!, folderId: null });
    }
  }

  removeLibraryPlacements(workspaceId: string, actorId: string, entityIds: string[]): void {
    for (const entityId of entityIds) {
      const key = this.personalEntityPlacementKey(workspaceId, entityId, actorId);
      this.personalEntityPlacements.delete(key);
      this.deletedLibraryEntities.add(key);
    }
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
      if (this.personalMediaReader) return this.personalMediaReader(workspaceId, actorId, mediaAssetId)?.finalized === true;
      const asset = this.assets.get(this.assetKey(workspaceId, mediaAssetId));
      return asset?.finalized === true
        && this.personalAssetPlacements.has(this.personalAssetPlacementKey(workspaceId, mediaAssetId, actorId));
    });
    if (!available) throw new EntityMediaUnavailableError();
    if (content.coverMediaId) {
      const cover = this.personalMediaReader ? this.personalMediaReader(workspaceId, actorId, content.coverMediaId) : this.assets.get(this.assetKey(workspaceId, content.coverMediaId));
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
