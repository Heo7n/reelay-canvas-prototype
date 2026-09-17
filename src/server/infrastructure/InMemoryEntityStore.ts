import { MediaLibraryError, type LibrarySpace, type LibraryEntityBinding, type LibraryEntityEntry } from "../../domain/asset/media-library";
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
  EntityForbiddenError,
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
  workspaceMemberships: Array<{ workspaceId: WorkspaceId; actorId: ActorId; role?: "owner" | "admin" | "member" }>;
  organizationAssetPlacements?: Array<{ workspaceId: WorkspaceId; assetId: string }>;
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
  private readonly workspaceMemberships: Map<string, "owner" | "admin" | "member">;
  private membershipReader?: (workspaceId: string, actorId: string) => "owner" | "admin" | "member" | null;
  private readonly organizationAssetPlacements: Set<string>;
  private readonly assets = new Map<string, InMemoryEntityAsset>();
  private readonly personalAssetPlacements: Set<string>;
  private readonly entities = new Map<string, WorkspaceEntity>();
  private readonly entityPlacements = new Map<string, { tagIds: string[]; folderId: string | null; addedAt: string }>();
  private libraryMediaReader?: (workspaceId: string, actorId: string, assetId: string, space: LibrarySpace) => InMemoryEntityAsset | null;
  private readonly deletedLibraryEntities = new Set<string>();
  private libraryTagExists?: (workspaceId: string, actorId: string, tagId: string, space: LibrarySpace) => boolean;
  private libraryFolderExists?: (workspaceId: string, actorId: string, folderId: string, space: LibrarySpace) => boolean;
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
    this.workspaceMemberships = new Map(
      seed.workspaceMemberships.map(({ workspaceId, actorId, role }) => [this.membershipKey(workspaceId, actorId), role ?? "member"]),
    );
    this.organizationAssetPlacements = new Set((seed.organizationAssetPlacements ?? []).map(({workspaceId, assetId}) => this.assetKey(workspaceId, assetId)));
    seed.assets.forEach((asset) => this.assets.set(this.assetKey(asset.workspaceId, asset.id), clone(asset)));
    this.personalAssetPlacements = new Set(
      seed.personalAssetPlacements.map(({ workspaceId, assetId, ownerActorId }) => (
        this.personalAssetPlacementKey(workspaceId, assetId, ownerActorId)
      )),
    );
  }

  async createPersonalEntity(input: CreatePersonalEntityInput): Promise<WorkspaceEntity> {
    const space = input.space ?? "personal";
    this.requireWorkspaceMembership(input.workspaceId, input.actorId);
    const idempotencyKey = normalizeEntityIdempotencyKey(input.idempotencyKey);
    const content = normalizeEntityContent(input);
    const tagIds = normalizeEntityLibraryTags(input.tagIds ?? []);
    const commandKey = this.createCommandKey(input.workspaceId, input.actorId, idempotencyKey, space);
    const existingId = this.createCommandEntities.get(commandKey);
    if (existingId) {
      const existing = this.entities.get(existingId);
      if (!existing || (this.createCommandFolders.get(commandKey) ?? null) !== (input.folderId ?? null) || this.deletedLibraryEntities.has(this.entityPlacementKey(input.workspaceId, existingId, input.actorId, space)) || !sameContent(existing, content)) {
        throw new EntityCreateConflictError("idempotency_key_reused");
      }
      const existingTags = this.entityPlacements.get(this.entityPlacementKey(input.workspaceId, existing.id, input.actorId, space))?.tagIds ?? [];
      if (input.tagIds !== undefined && JSON.stringify(normalizeEntityLibraryTags(existingTags)) !== JSON.stringify(tagIds)) throw new EntityCreateConflictError("idempotency_key_reused");
      this.requireLibraryMedia(input.workspaceId, input.actorId, content, space);
      const placementKey = this.entityPlacementKey(input.workspaceId, existing.id, input.actorId, space);
      if (!this.entityPlacements.has(placementKey)) this.entityPlacements.set(placementKey, { tagIds: [], folderId: null, addedAt: existing.createdAt });
      return { ...clone(existing), libraryTagIds: [...existingTags] };
    }
    validateEntityLibraryTags(tagIds, (id) => this.libraryTagExists?.(input.workspaceId, input.actorId, id, space) ?? false);
    if (input.folderId && !this.libraryFolderExists?.(input.workspaceId, input.actorId, input.folderId, space)) throw new MediaLibraryError("folder_not_found", "保存目录不存在或不可访问，请重新选择。");
    this.requireLibraryMedia(input.workspaceId, input.actorId, content, space);

    const timestamp = this.now().toISOString();
    const entity: WorkspaceEntity = {
      id: `entity-${this.createId()}`,
      workspaceId: input.workspaceId,
      space,
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
    this.entityPlacements.set(this.entityPlacementKey(input.workspaceId, entity.id, input.actorId, space), { tagIds: [...tagIds], folderId: input.folderId ?? null, addedAt: timestamp });
    this.createCommandEntities.set(commandKey, entity.id);
    this.createCommandFolders.set(commandKey, input.folderId ?? null);
    return { ...clone(entity), libraryTagIds: [...tagIds] };
  }

  async listPersonalEntities(input: ListPersonalEntitiesInput): Promise<WorkspaceEntity[]> {
    const space = input.space ?? "personal";
    this.requireWorkspaceMembership(input.workspaceId, input.actorId);
    return [...this.entities.values()]
      .filter((entity) => (
        entity.workspaceId === input.workspaceId
        && this.entityPlacements.has(
          this.entityPlacementKey(input.workspaceId, entity.id, input.actorId, space),
        )
      ))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id))
      .map((entity) => ({ ...clone(entity), libraryTagIds: [...this.entityPlacements.get(this.entityPlacementKey(input.workspaceId, entity.id, input.actorId, space))!.tagIds] }));
  }

  async getPersonalEntity(input: ReadPersonalEntityInput): Promise<WorkspaceEntity | null> {
    const space = input.space ?? "personal";
    this.requireWorkspaceMembership(input.workspaceId, input.actorId);
    const entity = this.entities.get(input.entityId);
    return entity
      && entity.workspaceId === input.workspaceId
      && this.entityPlacements.has(
        this.entityPlacementKey(input.workspaceId, input.entityId, input.actorId, space),
      )
      ? { ...clone(entity), libraryTagIds: [...this.entityPlacements.get(this.entityPlacementKey(input.workspaceId, entity.id, input.actorId, space))!.tagIds] }
      : null;
  }

  async updatePersonalEntity(input: UpdatePersonalEntityInput): Promise<WorkspaceEntity> {
    const space = input.space ?? "personal";
    this.requireWorkspaceMembership(input.workspaceId, input.actorId);
    if (space === "organization" && !["owner", "admin"].includes(this.membershipRole(input.workspaceId, input.actorId) ?? "")) throw new EntityForbiddenError();
    const expectedVersion = normalizeExpectedEntityVersion(input.expectedVersion);
    const entity = this.entities.get(input.entityId);
    if (
      !entity
      || entity.workspaceId !== input.workspaceId
      || !this.entityPlacements.has(
        this.entityPlacementKey(input.workspaceId, input.entityId, input.actorId, space),
      )
    ) throw new EntityUnavailableError();
    if (entity.version !== expectedVersion) throw new EntityVersionConflictError(entity.version);

    const content = normalizeEntityContent(input);
    this.requireLibraryMedia(input.workspaceId, input.actorId, content, space);
    const placementKey = this.entityPlacementKey(input.workspaceId, input.entityId, input.actorId, space);
    const placement = this.entityPlacements.get(placementKey)!;
    let tagIds = placement.tagIds;
    if (input.tagIds !== undefined) {
      requireExpectedEntityLibraryTags(placement.tagIds, input.expectedTagIds);
      tagIds = validateEntityLibraryTags(input.tagIds, (id) => this.libraryTagExists?.(input.workspaceId, input.actorId, id, space) ?? false);
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
    this.entityPlacements.set(placementKey, { ...placement, tagIds: [...tagIds] });
    return { ...clone(updated), libraryTagIds: [...tagIds] };
  }

  connectLibraryTags(exists: (workspaceId: string, actorId: string, tagId: string, space: LibrarySpace) => boolean): void { this.libraryTagExists = exists; }

  connectLibraryFolders(exists: (workspaceId: string, actorId: string, folderId: string, space: LibrarySpace) => boolean): void { this.libraryFolderExists = exists; }

  connectLibraryMedia(reader: (workspaceId: string, actorId: string, assetId: string, space: LibrarySpace) => InMemoryEntityAsset | null): void {
    this.libraryMediaReader = reader;
  }

  connectLibraryMembership(reader: (workspaceId: string, actorId: string) => "owner" | "admin" | "member" | null): void { this.membershipReader = reader; }

  libraryBindings(workspaceId: string, actorId: string, space: LibrarySpace = "personal"): LibraryEntityBinding[] {
    return [...this.entities.values()].filter((entity) => entity.workspaceId === workspaceId && this.entityPlacements.has(this.entityPlacementKey(workspaceId, entity.id, actorId, space)))
      .map((entity) => ({ id: entity.id, version: entity.version, assetIds: entity.mediaRefs.map((ref) => ref.mediaAssetId) }));
  }

  libraryEntries(workspaceId: string, actorId: string, space: LibrarySpace = "personal"): LibraryEntityEntry[] {
    return this.libraryBindings(workspaceId, actorId, space).map((entity) => ({ entityId: entity.id, space, ...structuredClone(this.entityPlacements.get(this.entityPlacementKey(workspaceId, entity.id, actorId, space))!) }));
  }

  updateLibraryPlacementTags(workspaceId: string, actorId: string, updates: Array<{ id: string; tagIds: string[] }>, space: LibrarySpace = "personal"): void {
    const placements = updates.map((update) => ({ ...update, key: this.entityPlacementKey(workspaceId, update.id, actorId, space) }));
    if (placements.some(({ key }) => !this.entityPlacements.has(key))) throw new MediaLibraryError("library_item_not_found", "所选素材组不存在或不可访问。");
    for (const { key, tagIds } of placements) this.entityPlacements.set(key, { ...this.entityPlacements.get(key)!, tagIds: [...tagIds] });
  }

  moveLibraryPlacements(workspaceId: string, actorId: string, entityIds: string[], folderId: string | null, addedAt: string, space: LibrarySpace = "personal"): void {
    for (const entityId of entityIds) {
      const key = this.entityPlacementKey(workspaceId, entityId, actorId, space);
      const current = this.entityPlacements.get(key)!;
      if (current.folderId !== folderId) this.entityPlacements.set(key, { ...current, folderId, addedAt });
    }
  }

  detachLibraryFolders(workspaceId: string, actorId: string, folderIds: string[], space: LibrarySpace = "personal"): void {
    for (const entry of this.libraryEntries(workspaceId, actorId, space)) {
      if (!entry.folderId || !folderIds.includes(entry.folderId)) continue;
      const key = this.entityPlacementKey(workspaceId, entry.entityId, actorId, space);
      this.entityPlacements.set(key, { ...this.entityPlacements.get(key)!, folderId: null });
    }
  }

  removeLibraryPlacements(workspaceId: string, actorId: string, entityIds: string[], space: LibrarySpace = "personal"): void {
    for (const entityId of entityIds) {
      const key = this.entityPlacementKey(workspaceId, entityId, actorId, space);
      this.entityPlacements.delete(key);
      this.deletedLibraryEntities.add(key);
    }
  }

  private membershipRole(workspaceId: WorkspaceId, actorId: ActorId) {
    return this.membershipReader ? this.membershipReader(workspaceId, actorId) : this.workspaceMemberships.get(this.membershipKey(workspaceId, actorId)) ?? null;
  }

  private requireWorkspaceMembership(workspaceId: WorkspaceId, actorId: ActorId): void {
    if (!this.membershipRole(workspaceId, actorId)) {
      throw new EntityWorkspaceUnavailableError();
    }
  }

  private requireLibraryMedia(
    workspaceId: WorkspaceId,
    actorId: ActorId,
    content: NormalizedEntityContent,
    space: LibrarySpace,
  ): void {
    const available = content.mediaRefs.every(({ mediaAssetId }) => {
      if (this.libraryMediaReader) return this.libraryMediaReader(workspaceId, actorId, mediaAssetId, space)?.finalized === true;
      const asset = this.assets.get(this.assetKey(workspaceId, mediaAssetId));
      return asset?.finalized === true
        && (space === "organization" ? this.organizationAssetPlacements.has(this.assetKey(workspaceId, mediaAssetId)) : this.personalAssetPlacements.has(this.personalAssetPlacementKey(workspaceId, mediaAssetId, actorId)));
    });
    if (!available) throw new EntityMediaUnavailableError();
    if (content.coverMediaId) {
      const cover = this.libraryMediaReader ? this.libraryMediaReader(workspaceId, actorId, content.coverMediaId, space) : this.assets.get(this.assetKey(workspaceId, content.coverMediaId));
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

  private entityPlacementKey(workspaceId: WorkspaceId, entityId: string, actorId: ActorId, space: LibrarySpace = "personal"): string {
    return `${workspaceId}\u0000${entityId}\u0000${space}\u0000${space === "personal" ? actorId : ""}`;
  }

  private createCommandKey(workspaceId: WorkspaceId, actorId: ActorId, idempotencyKey: string, space: LibrarySpace): string {
    return `${workspaceId}\u0000${space}\u0000${actorId}\u0000${idempotencyKey}`;
  }
}
