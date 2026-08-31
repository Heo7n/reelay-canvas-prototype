import { randomUUID } from "node:crypto";

import type {
  AssetUploadIntent,
  MediaAssetPlacement,
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
  type CreateAssetUploadIntentInput,
  type FinalizeAssetUploadInput,
  type ListPersonalAssetsInput,
  type ReadAssetUploadIntentInput,
  type ReadPersonalAssetInput,
  type RecordAssetUploadInput,
  type WorkspaceMediaAssetStore,
} from "../application/WorkspaceMediaAssetStore";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export interface InMemoryAssetWorkspaceMembership {
  workspaceId: WorkspaceId;
  actorId: ActorId;
}

export interface InMemoryAssetProject {
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
  private readonly projects = new Map<ProjectId, InMemoryAssetProject>();
  private readonly uploadIntents = new Map<string, AssetUploadIntent>();
  private readonly uploadIntentByIdempotencyKey = new Map<string, string>();
  private readonly assets = new Map<string, WorkspaceMediaAsset>();
  private readonly placements = new Map<string, MediaAssetPlacement>();
  private readonly projectReferences = new Map<string, ProjectAssetReference>();

  constructor(
    seed: InMemoryAssetStoreSeed = { workspaceMemberships: [], projects: [] },
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = randomUUID,
    private readonly uploadIntentTtlMs = 15 * 60 * 1_000,
  ) {
    this.workspaceMemberships = new Set(
      seed.workspaceMemberships.map(({ workspaceId, actorId }) => `${workspaceId}\u0000${actorId}`),
    );
    seed.projects.forEach((project) => this.projects.set(project.id, clone(project)));
  }

  async createUploadIntent(input: CreateAssetUploadIntentInput): Promise<AssetUploadIntent> {
    this.requireWorkspaceMembership(input.workspaceId, input.actorId);
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
      return clone(existing);
    }

    const createdAt = this.now();
    const id = `upload-${this.createId()}`;
    const intent: AssetUploadIntent = {
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

  async getUploadIntent(input: ReadAssetUploadIntentInput): Promise<AssetUploadIntent | null> {
    this.requireWorkspaceMembership(input.workspaceId, input.actorId);
    const intent = this.uploadIntents.get(input.uploadIntentId);
    return intent && intent.workspaceId === input.workspaceId && intent.createdByActorId === input.actorId
      ? clone(intent)
      : null;
  }

  async recordUpload(input: RecordAssetUploadInput): Promise<AssetUploadIntent> {
    const intent = this.requireUploadIntent(input.workspaceId, input.actorId, input.uploadIntentId);
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
    if (intent.status !== "finalized" && this.now().getTime() >= Date.parse(intent.expiresAt)) {
      throw new AssetUploadConflictError("expired");
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
    if (this.now().getTime() >= Date.parse(intent.expiresAt)) {
      throw new AssetUploadConflictError("expired");
    }
    if (
      intent.status !== "uploaded"
      || !intent.uploadedContentType
      || intent.uploadedByteSize == null
      || !intent.uploadedChecksumSha256
      || !intent.uploadedAt
    ) throw new AssetUploadConflictError("not_uploaded");

    const timestamp = this.now().toISOString();
    const asset: WorkspaceMediaAsset = {
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
    const placement: MediaAssetPlacement = {
      id: `placement-${this.createId()}`,
      workspaceId: asset.workspaceId,
      assetId: asset.id,
      scopeKind: "personal",
      ownerActorId: input.actorId,
      createdByActorId: input.actorId,
      createdAt: timestamp,
    };
    this.assets.set(asset.id, asset);
    this.placements.set(this.personalPlacementKey(asset.workspaceId, asset.id, input.actorId), placement);
    intent.status = "finalized";
    intent.assetId = asset.id;
    intent.finalizedAt = timestamp;
    return clone(asset);
  }

  async listPersonalAssets(input: ListPersonalAssetsInput): Promise<WorkspaceMediaAsset[]> {
    this.requireWorkspaceMembership(input.workspaceId, input.actorId);
    return [...this.placements.values()]
      .filter((placement) => placement.workspaceId === input.workspaceId && placement.ownerActorId === input.actorId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.assetId.localeCompare(right.assetId))
      .flatMap((placement) => {
        const asset = this.assets.get(placement.assetId);
        return asset ? [clone(asset)] : [];
      });
  }

  async getPersonalAsset(input: ReadPersonalAssetInput): Promise<WorkspaceMediaAsset | null> {
    this.requireWorkspaceMembership(input.workspaceId, input.actorId);
    const placement = this.placements.get(this.personalPlacementKey(input.workspaceId, input.assetId, input.actorId));
    const asset = placement ? this.assets.get(input.assetId) : null;
    return asset ? clone(asset) : null;
  }

  async attachAssetToProject(input: AttachAssetToProjectInput): Promise<ProjectAssetReference> {
    const project = this.requireProject(input.projectId, input.actorId, true);
    const asset = this.assets.get(input.assetId);
    if (
      !asset
      || asset.workspaceId !== project.workspaceId
      || !this.placements.has(this.personalPlacementKey(asset.workspaceId, asset.id, input.actorId))
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
