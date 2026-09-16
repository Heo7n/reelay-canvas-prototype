import { validateLibraryEntityMove, type MoveLibraryEntitiesInput } from "../../domain/asset/media-library";
import type { InMemoryEntityStore } from "./InMemoryEntityStore";
import { randomUUID } from "node:crypto";
import { MediaStorageQuotaExceededError, mediaStorageLimit, mediaStorageSnapshot, type MediaStorageLimits, type MediaStorageOwner } from "../../domain/asset/media-storage";

import type {
  AssetUploadIntent,
  ProjectAsset,
  ProjectAssetReference,
  WorkspaceMediaAsset,
} from "../../domain/asset/workspace-media-asset";
import type { ActorId } from "../../domain/identity/session";
import type { ProjectId, ProjectUserRole } from "../../domain/project/project";
import type { WorkspaceId } from "../../domain/workspace/workspace";
import {
  ProjectAssetUnavailableError,
  type AttachAssetToProjectInput,
  type ListProjectAssetsInput,
  type ProjectAssetReferenceStore,
  type ReadProjectAssetInput,
} from "../application/ProjectAssetReferenceStore";
import {
  AssetUploadConflictError,
  AssetUploadIntentUnavailableError,
  AssetWorkspaceUnavailableError,
  PersonalAssetUnavailableError,
  type CreateAssetUploadIntentInput,
  type FinalizeAssetUploadInput,
  type ListPersonalAssetsInput,
  type ReadAssetUploadIntentInput,
  type ReadPersonalAssetInput,
  type RecordAssetUploadInput,
  type RenamePersonalAssetInput,
  type WorkspaceMediaAssetStore,
  type ReadMediaStorageInput,
  type UploadedAssetObject,
  type CancelAssetUploadInput,
  type FindAssetUploadIntentInput,
} from "../application/WorkspaceMediaAssetStore";

import { BUILTIN_LIBRARY_TAGS, MediaLibraryError, libraryNameKey, normalizeLibraryName, planLibraryDeletion, planLibraryTagUpdate, planLibraryTagDeletion, type DeleteLibraryTagInput, type UpdateLibraryTagsInput, type DeleteLibraryInput, type RenameLibraryFolderInput, validateLibraryFolderRename, validateLibraryFolder, validateLibrarySave, type CreateLibraryFolderInput, type CreateLibraryTagInput, type LibraryFolder, type LibraryTag, type LibrarySpace, type MediaLibraryCatalog, type SaveLibraryInput } from "../../domain/asset/media-library";
import type { LibraryActorInput } from "../application/MediaLibraryStore";

type MemoryPlacement = { id: string; workspaceId: string; assetId: string; scopeKind: LibrarySpace; ownerActorId: string | null; createdByActorId: string; createdAt: string; addedAt?: string; displayName?: string; folderId?: string | null; tagIds?: string[]; updatedAt?: string };
type ScopedFolder = LibraryFolder & { workspaceId: string; ownerActorId: string | null };
type ScopedTag = LibraryTag & { workspaceId: string; ownerActorId: string | null };
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export interface InMemoryAssetWorkspaceMembership {
  workspaceId: WorkspaceId;
  actorId: ActorId;
  role?: "owner" | "admin" | "member";
}

export interface InMemoryAssetProject {
  accessKind?: "private" | "collaborative";
  id: ProjectId;
  workspaceId: WorkspaceId;
  deleted?: boolean;
  members: Array<{ actorId: ActorId; role: ProjectUserRole }>;
}

export interface InMemoryAssetStoreSeed {
  workspaceMemberships: InMemoryAssetWorkspaceMembership[];
  projects: InMemoryAssetProject[];
}

function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function validDisplayName(value: string): string {
  const normalized = requiredText(value, "Asset display name");
  if (normalized.length > 300) throw new Error("Asset display name must not exceed 300 characters.");
  return normalized;
}

function validByteSize(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Asset byte size must be a positive safe integer.");
  return value;
}

function validChecksum(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!SHA256_PATTERN.test(normalized)) throw new Error("Asset checksum must be a SHA-256 hex digest.");
  return normalized;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryAssetStore implements WorkspaceMediaAssetStore, ProjectAssetReferenceStore {
  private readonly workspaceMemberships: Set<string>;
  private readonly workspaceRoles = new Map<string, "owner" | "admin" | "member">();
  private entityStore?: InMemoryEntityStore;
  private readonly projects = new Map<ProjectId, InMemoryAssetProject>();
  private readonly uploadIntents = new Map<string, AssetUploadIntent>();
  private readonly uploadIntentByIdempotencyKey = new Map<string, string>();
  private readonly assets = new Map<string, WorkspaceMediaAsset>();
  private readonly placements = new Map<string, MemoryPlacement>();
  private readonly libraryFolders = new Map<string, ScopedFolder>();
  private readonly libraryTags = new Map<string, ScopedTag>();
  private readonly projectReferences = new Map<string, ProjectAssetReference>();
  private readonly intentOperations = new Map<string, Promise<unknown>>();

  constructor(
    seed: InMemoryAssetStoreSeed = { workspaceMemberships: [], projects: [] },
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = randomUUID,
    private readonly uploadIntentTtlMs = 15 * 60 * 1_000,
    private readonly storageLimits: MediaStorageLimits = {},
  ) {
    this.workspaceMemberships = new Set(
      seed.workspaceMemberships.map(({ workspaceId, actorId }) => `${workspaceId}\u0000${actorId}`),
    );
    seed.workspaceMemberships.forEach(({ workspaceId, actorId, role }) => this.workspaceRoles.set(`${workspaceId}\u0000${actorId}`, role ?? "member"));
    seed.projects.forEach((project) => this.projects.set(project.id, clone(project)));
  }

  async createUploadIntent(input: CreateAssetUploadIntentInput): Promise<AssetUploadIntent> {
    this.requireWorkspaceMembership(input.workspaceId, input.actorId);
    const owner = this.resolveStorageOwner(input);
    const idempotencyKey = requiredText(input.idempotencyKey, "Asset upload idempotency key");
    const displayName = requiredText(input.displayName, "Asset display name");
    const contentType = requiredText(input.contentType, "Asset content type");
    const checksumSha256 = validChecksum(input.checksumSha256);
    const byteSize = validByteSize(input.byteSize);
    const lookupKey = `${input.workspaceId}\u0000${input.actorId}\u0000${idempotencyKey}`;
    const existingId = this.uploadIntentByIdempotencyKey.get(lookupKey);
    if (existingId) {
      const existing = this.uploadIntents.get(existingId);
      if (!existing || !this.sameIntentRequest(existing, input, displayName, contentType, byteSize, checksumSha256)) {
        throw new AssetUploadConflictError("idempotency_key_reused");
      }
      if (existing.storageOwner.kind !== owner.kind || existing.storageOwner.id !== owner.id || existing.projectId !== (input.projectId ?? null)) throw new AssetUploadConflictError("idempotency_key_reused");
      this.requireActiveIntent(existing);
      return clone(existing);
    }

    const storage = this.storageSnapshot(owner);
    if (byteSize > storage.availableBytes) throw new MediaStorageQuotaExceededError(storage);

    const createdAt = this.now();
    const id = `upload-${this.createId()}`;
    const intent: AssetUploadIntent = {
      storageOwner: owner,
      projectId: input.projectId ?? null,
      uploadAuthorizationExpiresAt: null,
      reservedByteSize: byteSize,
      id,
      workspaceId: input.workspaceId,
      createdByActorId: input.actorId,
      idempotencyKey,
      mediaKind: input.mediaKind,
      displayName,
      objectKey: `workspaces/${encodeURIComponent(input.workspaceId)}/uploads/${encodeURIComponent(id)}`,
      expectedContentType: contentType,
      expectedByteSize: byteSize,
      expectedChecksumSha256: checksumSha256,
      status: "pending",
      uploadedContentType: null,
      uploadedByteSize: null,
      uploadedChecksumSha256: null,
      uploadedEtag: null,
      assetId: null,
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + this.uploadIntentTtlMs).toISOString(),
      uploadedAt: null,
      finalizedAt: null,
    };
    this.uploadIntents.set(intent.id, intent);
    this.uploadIntentByIdempotencyKey.set(lookupKey, intent.id);
    return clone(intent);
  }

  async findUploadIntentByIdempotencyKey(input: FindAssetUploadIntentInput): Promise<AssetUploadIntent | null> {
    this.requireWorkspaceMembership(input.workspaceId, input.actorId);
    const key = requiredText(input.idempotencyKey, "Asset upload idempotency key");
    const id = this.uploadIntentByIdempotencyKey.get(`${input.workspaceId}\u0000${input.actorId}\u0000${key}`);
    const intent = id ? this.uploadIntents.get(id) : undefined;
    if (!intent) return null;
    this.requireIntentOwner(intent);
    return clone(intent);
  }

  async getUploadIntent(input: ReadAssetUploadIntentInput): Promise<AssetUploadIntent | null> {
    this.requireWorkspaceMembership(input.workspaceId, input.actorId);
    const intent = this.uploadIntents.get(input.uploadIntentId);
    return intent && intent.workspaceId === input.workspaceId && intent.createdByActorId === input.actorId
      ? clone(intent)
      : null;
  }

  async recordUpload(input: RecordAssetUploadInput): Promise<AssetUploadIntent> {
    const intent = this.requireUploadIntent(input.workspaceId, input.actorId, input.uploadIntentId);
    this.requireActiveIntent(intent);
    this.requireIntentOwner(intent);
    const objectKey = requiredText(input.objectKey, "Asset object key");
    const contentType = requiredText(input.contentType, "Asset content type");
    const byteSize = validByteSize(input.byteSize);
    const checksumSha256 = validChecksum(input.checksumSha256);
    const etag = input.etag == null ? null : requiredText(input.etag, "Asset object etag");
    if (
      objectKey !== intent.objectKey
      || contentType !== intent.expectedContentType
      || byteSize !== intent.expectedByteSize
      || checksumSha256 !== intent.expectedChecksumSha256
    ) {
      throw new AssetUploadConflictError("metadata_mismatch");
    }
    if (intent.status !== "pending") {
      if (
        intent.uploadedContentType !== contentType
        || intent.uploadedByteSize !== byteSize
        || intent.uploadedChecksumSha256 !== checksumSha256
        || intent.uploadedEtag !== etag
      ) throw new AssetUploadConflictError("metadata_mismatch");
      return clone(intent);
    }

    intent.status = "uploaded";
    intent.uploadedContentType = contentType;
    intent.uploadedByteSize = byteSize;
    intent.uploadedChecksumSha256 = checksumSha256;
    intent.uploadedEtag = etag;
    intent.uploadedAt = this.now().toISOString();
    return clone(intent);
  }

  async finalizeUpload(input: FinalizeAssetUploadInput): Promise<WorkspaceMediaAsset> {
    const intent = this.requireUploadIntent(input.workspaceId, input.actorId, input.uploadIntentId);
    if (intent.status === "finalized" && intent.assetId) {
      const existing = this.assets.get(intent.assetId);
      if (existing) return clone(existing);
    }
    this.requireActiveIntent(intent);
    this.requireIntentOwner(intent);
    if (
      intent.status !== "uploaded"
      || !intent.uploadedContentType
      || intent.uploadedByteSize == null
      || !intent.uploadedChecksumSha256
      || !intent.uploadedAt
    ) throw new AssetUploadConflictError("not_uploaded");

    const timestamp = this.now().toISOString();
    const asset: WorkspaceMediaAsset = {
      storageOwner: clone(intent.storageOwner),
      id: `asset-${this.createId()}`,
      workspaceId: intent.workspaceId,
      mediaKind: intent.mediaKind,
      displayName: intent.displayName,
      objectKey: intent.objectKey,
      objectVersion: 1,
      contentType: intent.uploadedContentType,
      byteSize: intent.uploadedByteSize,
      checksumSha256: intent.uploadedChecksumSha256,
      createdByActorId: intent.createdByActorId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const placement: MemoryPlacement = {
      id: `placement-${this.createId()}`,
      workspaceId: asset.workspaceId,
      assetId: asset.id,
      scopeKind: intent.storageOwner.kind,
      ownerActorId: intent.storageOwner.kind === "personal" ? input.actorId : null,
      createdByActorId: input.actorId,
      createdAt: timestamp,
    };
    this.assets.set(asset.id, asset);
    this.placements.set(this.personalPlacementKey(asset.workspaceId, asset.id, placement.ownerActorId ?? "@organization"), placement);
    intent.status = "finalized";
    intent.assetId = asset.id;
    intent.finalizedAt = timestamp;
    return clone(asset);
  }

  private resolveStorageOwner(input: ReadMediaStorageInput, writable = true): MediaStorageOwner {
    this.requireWorkspaceMembership(input.workspaceId, input.actorId);
    let kind = input.storageSpace ?? "personal";
    if (input.projectId) {
      const project = this.requireProject(input.projectId, input.actorId, writable);
      if (project.workspaceId !== input.workspaceId) throw new ProjectAssetUnavailableError();
      kind = project.accessKind === "collaborative" ? "organization" : "personal";
      if (input.storageSpace && input.storageSpace !== kind) throw new AssetUploadConflictError("storage_owner_mismatch");
    }
    return { kind, id: kind === "personal" ? input.actorId : input.workspaceId };
  }

  private requireIntentOwner(intent: AssetUploadIntent): void {
    const owner = this.resolveStorageOwner({ workspaceId: intent.workspaceId, actorId: intent.createdByActorId, storageSpace: intent.storageOwner.kind, projectId: intent.projectId ?? undefined });
    if (owner.id !== intent.storageOwner.id || owner.kind !== intent.storageOwner.kind) throw new AssetUploadConflictError("storage_owner_mismatch");
  }

  private requireActiveIntent(intent: AssetUploadIntent): void {
    if (intent.status === "cancelling" || intent.status === "cancelled") throw new AssetUploadConflictError("cancelled");
    if (intent.status !== "finalized" && this.now().getTime() >= Date.parse(intent.expiresAt)) throw new AssetUploadConflictError("expired");
  }

  private storageSnapshot(owner: MediaStorageOwner) {
    const matches = (value: MediaStorageOwner | undefined) => value?.kind === owner.kind && value.id === owner.id;
    const used = [...this.assets.values()].filter((asset) => matches(asset.storageOwner)).reduce((total, asset) => total + asset.byteSize, 0);
    const reserved = [...this.uploadIntents.values()].filter((intent) => matches(intent.storageOwner) && ["pending", "uploaded", "cancelling"].includes(intent.status)).reduce((total, intent) => total + intent.reservedByteSize, 0);
    return mediaStorageSnapshot(owner, mediaStorageLimit(this.storageLimits, owner.kind), used, reserved);
  }

  async getMediaStorage(input: ReadMediaStorageInput) { return this.storageSnapshot(this.resolveStorageOwner(input, false)); }

  async listExpiredUploadIntents(input: ReadMediaStorageInput): Promise<AssetUploadIntent[]> {
    const owner = this.resolveStorageOwner(input, false);
    return clone([...this.uploadIntents.values()].filter((intent) => intent.workspaceId === input.workspaceId && intent.createdByActorId === input.actorId
      && intent.storageOwner.kind === owner.kind && intent.storageOwner.id === owner.id
      && ((["pending", "uploaded"].includes(intent.status) && Date.parse(intent.expiresAt) <= this.now().getTime()) || intent.status === "cancelling")).slice(0, 100));
  }

  async registerUploadAuthorization(input: ReadAssetUploadIntentInput & { expiresAt: string; reservedBytes?: number }): Promise<void> {
    const intent = this.requireUploadIntent(input.workspaceId, input.actorId, input.uploadIntentId);
    if (intent.status === "finalized") throw new AssetUploadConflictError("finalized");
    this.requireActiveIntent(intent);
    this.requireIntentOwner(intent);
    const expiry = Date.parse(input.expiresAt);
    if (!Number.isFinite(expiry) || expiry <= this.now().getTime()) throw new AssetUploadConflictError("expired");
    const bytes = input.reservedBytes ?? intent.expectedByteSize;
    if (!Number.isSafeInteger(bytes) || bytes < intent.expectedByteSize) throw new AssetUploadConflictError("metadata_mismatch");
    const storage = this.storageSnapshot(intent.storageOwner);
    if (Math.max(0, bytes - intent.reservedByteSize) > storage.availableBytes) throw new MediaStorageQuotaExceededError(storage);
    intent.reservedByteSize = Math.max(intent.reservedByteSize, bytes);
    intent.uploadAuthorizationExpiresAt = new Date(Math.max(expiry, Date.parse(intent.uploadAuthorizationExpiresAt ?? "") || 0)).toISOString();
  }

  async writeUpload(input: ReadAssetUploadIntentInput, write: (intent: AssetUploadIntent) => Promise<UploadedAssetObject>): Promise<AssetUploadIntent> {
    return this.withIntentLock(input.uploadIntentId, async () => {
      const intent = this.requireUploadIntent(input.workspaceId, input.actorId, input.uploadIntentId);
      this.requireActiveIntent(intent);
      this.requireIntentOwner(intent);
      return this.recordUpload({ ...input, ...await write(clone(intent)) });
    });
  }

  async beginUploadCancellation(input: CancelAssetUploadInput): Promise<AssetUploadIntent> {
    return this.withIntentLock(input.uploadIntentId, async () => {
      const intent = this.requireUploadIntent(input.workspaceId, input.actorId, input.uploadIntentId);
      if (intent.status === "finalized") throw new AssetUploadConflictError("finalized");
      if (input.expiredOnly && intent.status !== "cancelling" && this.now().getTime() < Date.parse(intent.expiresAt)) throw new AssetUploadConflictError("not_expired");
      if (intent.status !== "cancelled") intent.status = "cancelling";
      return clone(intent);
    });
  }

  async completeUploadCancellation(input: ReadAssetUploadIntentInput): Promise<void> {
    return this.withIntentLock(input.uploadIntentId, async () => {
      const intent = this.requireUploadIntent(input.workspaceId, input.actorId, input.uploadIntentId);
      if (intent.status === "cancelled") return;
      if (intent.status !== "cancelling") throw new AssetUploadConflictError("metadata_mismatch");
      if (intent.uploadAuthorizationExpiresAt) throw new AssetUploadConflictError("authorization_active");
      intent.status = "cancelled";
    });
  }

  private async withIntentLock<T>(id: string, operation: () => Promise<T>): Promise<T> {
    const prior = this.intentOperations.get(id) ?? Promise.resolve();
    const current = prior.catch(() => undefined).then(operation);
    this.intentOperations.set(id, current);
    try { return await current; }
    finally { if (this.intentOperations.get(id) === current) this.intentOperations.delete(id); }
  }

  async listPersonalAssets(input: ListPersonalAssetsInput): Promise<WorkspaceMediaAsset[]> {
    this.requireWorkspaceMembership(input.workspaceId, input.actorId);
    return [...this.placements.values()]
      .filter((placement) => placement.workspaceId === input.workspaceId && placement.ownerActorId === input.actorId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.assetId.localeCompare(right.assetId))
      .flatMap((placement) => {
        const asset = this.assets.get(placement.assetId);
        return asset ? [{ ...clone(asset), displayName: placement.displayName ?? asset.displayName, updatedAt: placement.updatedAt ?? asset.updatedAt }] : [];
      });
  }

  async getPersonalAsset(input: ReadPersonalAssetInput): Promise<WorkspaceMediaAsset | null> {
    this.requireWorkspaceMembership(input.workspaceId, input.actorId);
    const placement = this.placements.get(this.personalPlacementKey(input.workspaceId, input.assetId, input.actorId));
    const asset = placement ? this.assets.get(input.assetId) : null;
    return asset ? { ...clone(asset), displayName: placement?.displayName ?? asset.displayName, updatedAt: placement?.updatedAt ?? asset.updatedAt } : null;
  }

  async renamePersonalAsset(input: RenamePersonalAssetInput): Promise<WorkspaceMediaAsset> {
    this.requireWorkspaceMembership(input.workspaceId, input.actorId);
    const displayName = validDisplayName(input.displayName);
    const placement = this.placements.get(this.personalPlacementKey(input.workspaceId, input.assetId, input.actorId));
    const asset = placement ? this.assets.get(input.assetId) : null;
    if (!asset || asset.workspaceId !== input.workspaceId) throw new PersonalAssetUnavailableError();

    const renamed: WorkspaceMediaAsset = {
      ...asset,
      displayName,
      updatedAt: this.now().toISOString(),
    };
    if (placement) { placement.displayName = displayName; placement.updatedAt = renamed.updatedAt; }
    return clone(renamed);
  }

  async attachAssetToProject(input: AttachAssetToProjectInput): Promise<ProjectAssetReference> {
    const project = this.requireProject(input.projectId, input.actorId, true);
    const asset = this.assets.get(input.assetId);
    if (
      !this.workspaceMemberships.has(`${project.workspaceId}\u0000${input.actorId}`)
      || !asset
      || asset.workspaceId !== project.workspaceId
      || (!this.placements.has(this.personalPlacementKey(asset.workspaceId, asset.id, input.actorId)) && !this.placements.has(this.personalPlacementKey(asset.workspaceId, asset.id, "@organization")))
    ) throw new ProjectAssetUnavailableError();

    const lookupKey = `${project.id}\u0000${asset.id}\u0000${asset.objectVersion}`;
    const existing = this.projectReferences.get(lookupKey);
    if (existing) return clone(existing);
    const reference: ProjectAssetReference = {
      id: `project-asset-${this.createId()}`,
      workspaceId: project.workspaceId,
      projectId: project.id,
      assetId: asset.id,
      assetVersion: asset.objectVersion,
      createdByActorId: input.actorId,
      createdAt: this.now().toISOString(),
    };
    this.projectReferences.set(lookupKey, reference);
    return clone(reference);
  }

  async listProjectAssets(input: ListProjectAssetsInput): Promise<ProjectAsset[]> {
    this.requireProject(input.projectId, input.actorId, false);
    return [...this.projectReferences.values()]
      .filter((reference) => reference.projectId === input.projectId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id))
      .flatMap((reference) => {
        const asset = this.assets.get(reference.assetId);
        return asset ? [{ reference: clone(reference), asset: clone(asset) }] : [];
      });
  }

  async getProjectAsset(input: ReadProjectAssetInput): Promise<ProjectAsset | null> {
    this.requireProject(input.projectId, input.actorId, false);
    const reference = [...this.projectReferences.values()].find(
      (candidate) => candidate.projectId === input.projectId && candidate.id === input.referenceId,
    );
    const asset = reference ? this.assets.get(reference.assetId) : null;
    return reference && asset ? { reference: clone(reference), asset: clone(asset) } : null;
  }

  connectLibraryEntities(entities: InMemoryEntityStore): void {
    this.entityStore = entities;
    entities.connectLibraryTags((workspaceId, actorId, tagId) => {
      const tag = this.libraryTags.get(tagId);
      return !!tag && tag.workspaceId === workspaceId && tag.space === "personal" && tag.ownerActorId === actorId;
    });
    entities.connectLibraryFolders((workspaceId, actorId, folderId) => {
      const folder = this.libraryFolders.get(folderId);
      return !!folder && folder.workspaceId === workspaceId && folder.space === "personal" && folder.ownerActorId === actorId;
    });
    entities.connectLibraryMedia((workspaceId, actorId, assetId) => {
      const asset = this.placements.has(this.personalPlacementKey(workspaceId, assetId, actorId)) ? this.assets.get(assetId) : undefined;
      return asset && asset.workspaceId === workspaceId ? { id: asset.id, workspaceId, mediaKind: asset.mediaKind, finalized: true } : null;
    });
  }

  async moveLibraryEntities(input: MoveLibraryEntitiesInput & { actorId: string }): Promise<MediaLibraryCatalog> {
    const normalized = validateLibraryEntityMove(this.readLibraryCatalog(input), input);
    this.entityStore?.moveLibraryPlacements(input.workspaceId, input.actorId, normalized.items.map((item) => item.entityId), normalized.folderId, this.now().toISOString());
    return this.readLibraryCatalog(input);
  }

  async deleteLibrary(input: DeleteLibraryInput & { actorId: string }): Promise<MediaLibraryCatalog> {
    const catalog = this.readLibraryCatalog(input);
    if (input.space === "organization" && !["owner", "admin"].includes(this.workspaceRoles.get(`${input.workspaceId}\u0000${input.actorId}`) ?? "member")) throw new MediaLibraryError("forbidden", "只有组织所有者或管理员可以删除组织素材。");
    const plan = planLibraryDeletion(catalog, this.entityStore?.libraryBindings(input.workspaceId, input.actorId) ?? [], input);
    // All validation above is synchronous; no interleaving can expose a partial in-memory batch.
    this.entityStore?.removeLibraryPlacements(input.workspaceId, input.actorId, plan.entityIds);
    if (input.space === "personal") this.entityStore?.detachLibraryFolders(input.workspaceId, input.actorId, plan.folderIds);
    for (const id of plan.assetIds) this.placements.delete(this.personalPlacementKey(input.workspaceId, id, input.space === "personal" ? input.actorId : "@organization"));
    for (const id of plan.folderIds) this.libraryFolders.delete(id);
    return this.readLibraryCatalog(input);
  }

  async listLibrary(input: LibraryActorInput): Promise<MediaLibraryCatalog> { return this.readLibraryCatalog(input); }

  async deleteLibraryTag(input: DeleteLibraryTagInput & { actorId: string }): Promise<MediaLibraryCatalog> {
    const catalog = this.readLibraryCatalog(input);
    if (input.space === "organization" && !["owner", "admin"].includes(this.workspaceRoles.get(`${input.workspaceId}\u0000${input.actorId}`) ?? "member")) throw new MediaLibraryError("forbidden", "只有组织所有者或管理员可以删除组织标签。");
    const result = planLibraryTagDeletion(catalog, input);
    if (result === catalog) return catalog;
    // Validate before this synchronous batch; all placement changes and dictionary removal are atomic.
    this.entityStore?.updateLibraryPlacementTags(input.workspaceId, input.actorId,
      (result.entityEntries ?? []).filter((entry) => entry.space === input.space).map((entry) => ({ id: entry.entityId, tagIds: entry.tagIds })));
    for (const entry of result.entries) {
      if (entry.space !== input.space) continue;
      const key = this.personalPlacementKey(input.workspaceId, entry.assetId, input.space === "personal" ? input.actorId : "@organization");
      const placement = this.placements.get(key)!;
      if (placement.tagIds?.includes(input.tagId)) this.placements.set(key, { ...placement, tagIds: entry.tagIds, updatedAt: this.now().toISOString() });
    }
    this.libraryTags.delete(input.tagId);
    return this.readLibraryCatalog(input);
  }

  async updateLibraryTags(input: UpdateLibraryTagsInput & { actorId: string }): Promise<MediaLibraryCatalog> {
    const catalog = this.readLibraryCatalog(input);
    if (input.space === "organization" && !["owner", "admin"].includes(this.workspaceRoles.get(`${input.workspaceId}\u0000${input.actorId}`) ?? "member")) throw new MediaLibraryError("forbidden", "只有组织所有者或管理员可以整理组织素材标签。");
    const plan = planLibraryTagUpdate(catalog, input);
    // Resolve all targets first, then apply the complete delta without an asynchronous gap.
    this.entityStore?.updateLibraryPlacementTags(input.workspaceId, input.actorId, plan.items.filter((item) => item.kind === "entity"));
    for (const item of plan.items) {
      if (item.kind !== "media") continue;
      const key = this.personalPlacementKey(input.workspaceId, item.id, plan.space === "personal" ? input.actorId : "@organization");
      const placement = this.placements.get(key)!;
      if (JSON.stringify(placement.tagIds ?? []) !== JSON.stringify(item.tagIds)) this.placements.set(key, { ...placement, tagIds: item.tagIds, updatedAt: this.now().toISOString() });
    }
    return this.readLibraryCatalog(input);
  }

  private readLibraryCatalog(input: LibraryActorInput): MediaLibraryCatalog {
    this.requireWorkspaceMembership(input.workspaceId, input.actorId);
    const visible = (record: { workspaceId: string; ownerActorId: string | null }) => record.workspaceId === input.workspaceId && (record.ownerActorId === null || record.ownerActorId === input.actorId);
    return clone({
      folders: [...this.libraryFolders.values()].filter(visible).map(({ id, name, parentId, space }) => ({ id, name, parentId, space })),
      tags: [...this.libraryTags.values()].filter(visible).map(({ id, name, space }) => ({ id, name, space })),
      entityEntries: this.entityStore?.libraryEntries(input.workspaceId, input.actorId) ?? [],
      entries: [...this.placements.values()].filter(visible).flatMap((placement) => {
        const asset = this.assets.get(placement.assetId);
        return asset ? [{ assetId: asset.id, assetVersion: asset.objectVersion, mediaKind: asset.mediaKind, displayName: placement.displayName ?? asset.displayName,
          contentType: asset.contentType, byteSize: asset.byteSize, checksumSha256: asset.checksumSha256,
          contentUrl: `/api/workspaces/${encodeURIComponent(input.workspaceId)}/media-assets/${encodeURIComponent(asset.id)}/content`,
          createdAt: placement.createdAt, addedAt: placement.addedAt ?? placement.createdAt, space: placement.scopeKind, folderId: placement.folderId ?? null, tagIds: placement.tagIds ?? [] }] : [];
      }),
    });
  }

  async createLibraryFolder(input: CreateLibraryFolderInput & { actorId: string }): Promise<LibraryFolder> {
    const catalog = this.readLibraryCatalog(input);
    const name = validateLibraryFolder(catalog, input);
    const folder: ScopedFolder = { id: `folder-${this.createId()}`, name, parentId: input.parentId, space: input.space, workspaceId: input.workspaceId, ownerActorId: input.space === "personal" ? input.actorId : null };
    this.libraryFolders.set(folder.id, folder);
    const { id, parentId, space } = folder;
    return { id, name, parentId, space };
  }

  async renameLibraryFolder(input: RenameLibraryFolderInput & { actorId: string }): Promise<LibraryFolder> {
    const catalog = this.readLibraryCatalog(input);
    if (input.space === "organization" && !["owner", "admin"].includes(this.workspaceRoles.get(`${input.workspaceId}\u0000${input.actorId}`) ?? "member")) throw new MediaLibraryError("forbidden", "只有组织所有者或管理员可以重命名组织文件夹。");
    const folder = validateLibraryFolderRename(catalog, input);
    const current = this.libraryFolders.get(folder.id)!;
    this.libraryFolders.set(folder.id, { ...current, name: folder.name });
    return clone(folder);
  }

  async createLibraryTag(input: CreateLibraryTagInput & { actorId: string }): Promise<LibraryTag> {
    const catalog = this.readLibraryCatalog(input);
    const name = normalizeLibraryName(input.name);
    if (!name || name.length > 40 || [...name].some((character) => character.charCodeAt(0) < 32)) throw new MediaLibraryError("invalid_tag_name", "标签名称需为 1–40 个字符。");
    const existing = [...BUILTIN_LIBRARY_TAGS.map((tag) => ({ ...tag, space: input.space })), ...catalog.tags.filter((tag) => tag.space === input.space)].find((tag) => libraryNameKey(tag.name) === libraryNameKey(name));
    if (existing) return clone(existing);
    const tag: ScopedTag = { id: `tag-${this.createId()}`, name, space: input.space, workspaceId: input.workspaceId, ownerActorId: input.space === "personal" ? input.actorId : null };
    this.libraryTags.set(tag.id, tag);
    return { id: tag.id, name, space: tag.space };
  }

  async saveLibrary(input: SaveLibraryInput & { actorId: string }): Promise<MediaLibraryCatalog> {
    const catalog = this.readLibraryCatalog(input);
    const normalized = validateLibrarySave(catalog, input);
    const project = this.requireProject(input.projectId, input.actorId, false);
    if (project.workspaceId !== input.workspaceId) throw new ProjectAssetUnavailableError();
    // Validate the whole batch before the first placement mutation.
    for (const item of normalized.items) {
      const asset = this.assets.get(item.assetId);
      const readable = catalog.entries.some((entry) => entry.assetId === item.assetId) || [...this.projectReferences.values()].some((reference) => reference.projectId === input.projectId && reference.assetId === item.assetId);
      if (!asset || asset.workspaceId !== input.workspaceId || !readable) throw new PersonalAssetUnavailableError();
    }
    const timestamp = this.now().toISOString();
    for (const item of normalized.items) {
      const key = this.personalPlacementKey(input.workspaceId, item.assetId, input.space === "personal" ? input.actorId : "@organization");
      const existing = this.placements.get(key);
      if (existing && item.action === "add") continue;
      this.placements.set(key, { id: existing?.id ?? `placement-${this.createId()}`, workspaceId: input.workspaceId, assetId: item.assetId, scopeKind: input.space,
        ownerActorId: input.space === "personal" ? input.actorId : null, createdByActorId: existing?.createdByActorId ?? input.actorId,
        createdAt: existing?.createdAt ?? timestamp, addedAt: existing && (existing.folderId ?? null) === input.folderId ? existing.addedAt ?? existing.createdAt : timestamp, displayName: item.displayName, folderId: input.folderId, tagIds: normalized.tagIds, updatedAt: timestamp });
    }
    return this.listLibrary(input);
  }

  async getLibraryAsset(input: LibraryActorInput & { assetId: string }): Promise<WorkspaceMediaAsset | null> {
    if (!this.workspaceMemberships.has(`${input.workspaceId}\u0000${input.actorId}`)) return null;
    const hasPlacement = this.placements.has(this.personalPlacementKey(input.workspaceId, input.assetId, input.actorId))
      || this.placements.has(this.personalPlacementKey(input.workspaceId, input.assetId, "@organization"));
    const asset = hasPlacement ? this.assets.get(input.assetId) : null;
    return asset ? clone(asset) : null;
  }

  private requireWorkspaceMembership(workspaceId: WorkspaceId, actorId: ActorId): void {
    if (!this.workspaceMemberships.has(`${workspaceId}\u0000${actorId}`)) {
      throw new AssetWorkspaceUnavailableError();
    }
  }

  private requireUploadIntent(
    workspaceId: WorkspaceId,
    actorId: ActorId,
    uploadIntentId: string,
  ): AssetUploadIntent {
    this.requireWorkspaceMembership(workspaceId, actorId);
    const intent = this.uploadIntents.get(uploadIntentId);
    if (!intent || intent.workspaceId !== workspaceId || intent.createdByActorId !== actorId) {
      throw new AssetUploadIntentUnavailableError();
    }
    return intent;
  }

  private requireProject(projectId: ProjectId, actorId: ActorId, writable: boolean): InMemoryAssetProject {
    const project = this.projects.get(projectId);
    const role = project?.members.find((member) => member.actorId === actorId)?.role;
    if (!project || project.deleted || !role || (writable && role !== "admin" && role !== "edit")) {
      throw new ProjectAssetUnavailableError();
    }
    return project;
  }

  private personalPlacementKey(workspaceId: WorkspaceId, assetId: string, actorId: ActorId): string {
    return `${workspaceId}\u0000${assetId}\u0000${actorId}`;
  }

  private sameIntentRequest(
    intent: AssetUploadIntent,
    input: CreateAssetUploadIntentInput,
    displayName: string,
    contentType: string,
    byteSize: number,
    checksumSha256: string,
  ): boolean {
    return intent.mediaKind === input.mediaKind
      && intent.displayName === displayName
      && intent.expectedContentType === contentType
      && intent.expectedByteSize === byteSize
      && intent.expectedChecksumSha256 === checksumSha256;
  }
}
