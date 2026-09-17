import { MediaLibraryError } from "../../domain/asset/media-library";
import type { MoveLibraryEntitiesInput } from "../../domain/asset/media-library";
import { randomUUID } from "node:crypto";

import type { Pool, PoolClient, QueryResultRow } from "pg";
import { MediaStorageQuotaExceededError, type MediaStorageLimits } from "../../domain/asset/media-storage";
import { lockPostgresStorageOwner, readPostgresStorage, resolvePostgresStorageOwner } from "./PostgresMediaStorage";

import type {
  AssetUploadIntent,
  MediaKind,
  ProjectAsset,
  ProjectAssetReference,
  WorkspaceMediaAsset,
} from "../../domain/asset/workspace-media-asset";
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

import { PostgresMediaLibrary } from "./PostgresMediaLibrary";
import type { DeleteLibraryTagInput, RenameLibraryFolderInput, DeleteLibraryInput, CreateLibraryFolderInput, CreateLibraryTagInput, SaveLibraryInput, UpdateLibraryTagsInput } from "../../domain/asset/media-library";
import type { LibraryActorInput } from "../application/MediaLibraryStore";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

interface UploadIntentRow extends QueryResultRow {
  storage_owner_kind: "personal" | "organization";
  storage_owner_id: string;
  project_id: string | null;
  upload_authorization_expires_at: Date | string | null;
  reserved_byte_size: string;
  id: string;
  workspace_id: string;
  created_by_user_id: string;
  idempotency_key: string;
  media_kind: MediaKind;
  display_name: string;
  object_key: string;
  expected_content_type: string;
  expected_byte_size: string;
  expected_checksum_sha256: string;
  status: AssetUploadIntent["status"];
  uploaded_content_type: string | null;
  uploaded_byte_size: string | null;
  uploaded_checksum_sha256: string | null;
  uploaded_etag: string | null;
  asset_id: string | null;
  created_at: Date | string;
  expires_at: Date | string;
  uploaded_at: Date | string | null;
  finalized_at: Date | string | null;
}

interface AssetRow extends QueryResultRow {
  storage_owner_kind: "personal" | "organization";
  storage_owner_id: string;
  id: string;
  workspace_id: string;
  media_kind: MediaKind;
  display_name: string;
  object_key: string;
  object_version: number;
  content_type: string;
  byte_size: string;
  checksum_sha256: string;
  created_by_user_id: string;
  created_at: Date | string;
  updated_at: Date | string;
}

interface ProjectAssetRow extends AssetRow {
  reference_id: string;
  reference_workspace_id: string;
  reference_project_id: string;
  reference_asset_id: string;
  reference_asset_version: number;
  reference_created_by_user_id: string;
  reference_created_at: Date | string;
}

interface ProjectAssetReferenceRow extends QueryResultRow {
  id: string;
  workspace_id: string;
  project_id: string;
  asset_id: string;
  asset_version: number;
  created_by_user_id: string;
  created_at: Date | string;
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

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toNullableIso(value: Date | string | null): string | null {
  return value == null ? null : toIso(value);
}

function mapUploadIntent(row: UploadIntentRow): AssetUploadIntent {
  return {
    storageOwner: { kind: row.storage_owner_kind, id: row.storage_owner_id },
    projectId: row.project_id,
    uploadAuthorizationExpiresAt: toNullableIso(row.upload_authorization_expires_at),
    reservedByteSize: Number(row.reserved_byte_size),
    id: row.id,
    workspaceId: row.workspace_id,
    createdByActorId: row.created_by_user_id,
    idempotencyKey: row.idempotency_key,
    mediaKind: row.media_kind,
    displayName: row.display_name,
    objectKey: row.object_key,
    expectedContentType: row.expected_content_type,
    expectedByteSize: Number(row.expected_byte_size),
    expectedChecksumSha256: row.expected_checksum_sha256,
    status: row.status,
    uploadedContentType: row.uploaded_content_type,
    uploadedByteSize: row.uploaded_byte_size == null ? null : Number(row.uploaded_byte_size),
    uploadedChecksumSha256: row.uploaded_checksum_sha256,
    uploadedEtag: row.uploaded_etag,
    assetId: row.asset_id,
    createdAt: toIso(row.created_at),
    expiresAt: toIso(row.expires_at),
    uploadedAt: toNullableIso(row.uploaded_at),
    finalizedAt: toNullableIso(row.finalized_at),
  };
}

function mapAsset(row: AssetRow): WorkspaceMediaAsset {
  return {
    storageOwner: { kind: row.storage_owner_kind, id: row.storage_owner_id },
    id: row.id,
    workspaceId: row.workspace_id,
    mediaKind: row.media_kind,
    displayName: row.display_name,
    objectKey: row.object_key,
    objectVersion: row.object_version,
    contentType: row.content_type,
    byteSize: Number(row.byte_size),
    checksumSha256: row.checksum_sha256,
    createdByActorId: row.created_by_user_id,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapProjectAsset(row: ProjectAssetRow): ProjectAsset {
  return {
    reference: {
      id: row.reference_id,
      workspaceId: row.reference_workspace_id,
      projectId: row.reference_project_id,
      assetId: row.reference_asset_id,
      assetVersion: row.reference_asset_version,
      createdByActorId: row.reference_created_by_user_id,
      createdAt: toIso(row.reference_created_at),
    },
    asset: mapAsset(row),
  };
}

function mapProjectAssetReference(row: ProjectAssetReferenceRow): ProjectAssetReference {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    assetId: row.asset_id,
    assetVersion: row.asset_version,
    createdByActorId: row.created_by_user_id,
    createdAt: toIso(row.created_at),
  };
}

const uploadIntentColumns = `
  storage_owner_kind, storage_owner_id, project_id, upload_authorization_expires_at, reserved_byte_size,
  id, workspace_id, created_by_user_id, idempotency_key, media_kind, display_name,
  object_key, expected_content_type, expected_byte_size, expected_checksum_sha256,
  status, uploaded_content_type, uploaded_byte_size, uploaded_checksum_sha256,
  uploaded_etag, asset_id, created_at, expires_at, uploaded_at, finalized_at
`;

const assetColumns = `
  storage_owner_kind, storage_owner_id,
  id, workspace_id, media_kind, display_name, object_key, object_version,
  content_type, byte_size, checksum_sha256, created_by_user_id, created_at, updated_at
`;

const personalAssetColumns = assetColumns.split(",").map((column) => {
  const name = column.trim();
  if (name === "display_name" || name === "updated_at") {
    return `COALESCE(placement.${name}, asset.${name}) AS ${name}`;
  }
  return `asset.${name}`;
}).join(", ");

export class PostgresAssetStore implements WorkspaceMediaAssetStore, ProjectAssetReferenceStore {
  constructor(
    private readonly pool: Pool,
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = randomUUID,
    private readonly uploadIntentTtlMs = 15 * 60 * 1_000,
    private readonly storageLimits: MediaStorageLimits = {},
  ) {}

  private get library(): PostgresMediaLibrary { return new PostgresMediaLibrary(this.pool, this.now, this.createId); }
  listLibrary(input: LibraryActorInput) { return this.library.listLibrary(input); }
  createLibraryFolder(input: CreateLibraryFolderInput & { actorId: string }) { return this.library.createLibraryFolder(input); }
  renameLibraryFolder(input: RenameLibraryFolderInput & { actorId: string }) { return this.library.renameLibraryFolder(input); }
  createLibraryTag(input: CreateLibraryTagInput & { actorId: string }) { return this.library.createLibraryTag(input); }
  deleteLibrary(input: DeleteLibraryInput & { actorId: string }) { return this.library.deleteLibrary(input); }
  deleteLibraryTag(input: DeleteLibraryTagInput & { actorId: string }) { return this.library.deleteLibraryTag(input); }
  updateLibraryTags(input: UpdateLibraryTagsInput & { actorId: string }) { return this.library.updateLibraryTags(input); }
  moveLibraryEntities(input: MoveLibraryEntitiesInput & { actorId: string }) { return this.library.moveLibraryEntities(input); }
  saveLibrary(input: SaveLibraryInput & { actorId: string }) { return this.library.saveLibrary(input); }

  async getLibraryAsset(input: LibraryActorInput & { assetId: string }): Promise<WorkspaceMediaAsset | null> {
    const result = await this.pool.query<AssetRow>(
      `SELECT ${assetColumns.split(",").map((column) => `asset.${column.trim()}`).join(", ")}
       FROM workspace_media_assets AS asset JOIN memberships AS membership ON membership.workspace_id=asset.workspace_id AND membership.user_id=$1
       WHERE asset.workspace_id=$2 AND asset.id=$3 AND EXISTS (SELECT 1 FROM media_asset_placements AS placement WHERE placement.workspace_id=asset.workspace_id AND placement.asset_id=asset.id AND (placement.scope_kind='organization' OR placement.owner_user_id=$1))`,
      [input.actorId,input.workspaceId,input.assetId]);
    return result.rows[0] ? mapAsset(result.rows[0]) : null;
  }

  async createUploadIntent(input: CreateAssetUploadIntentInput): Promise<AssetUploadIntent> {
    const idempotencyKey = requiredText(input.idempotencyKey, "Asset upload idempotency key");
    const displayName = requiredText(input.displayName, "Asset display name");
    const contentType = requiredText(input.contentType, "Asset content type");
    const byteSize = validByteSize(input.byteSize);
    const checksumSha256 = validChecksum(input.checksumSha256);
    const createdAt = this.now();
    const id = `upload-${this.createId()}`;
    const objectKey = `workspaces/${encodeURIComponent(input.workspaceId)}/uploads/${encodeURIComponent(id)}`;
    const expiresAt = new Date(createdAt.getTime() + this.uploadIntentTtlMs);
    return this.withTransaction(async (client) => {
      const owner = await resolvePostgresStorageOwner(client, input);
      await lockPostgresStorageOwner(client, owner);
      const prior = await client.query<UploadIntentRow>(`SELECT ${uploadIntentColumns} FROM asset_upload_intents WHERE workspace_id=$1 AND created_by_user_id=$2 AND idempotency_key=$3`, [input.workspaceId, input.actorId, idempotencyKey]);
      if (!prior.rowCount) {
        const storage = await readPostgresStorage(client, owner, this.storageLimits);
        if (byteSize > storage.availableBytes) throw new MediaStorageQuotaExceededError(storage);
      }
      const result = prior.rowCount ? prior : await client.query<UploadIntentRow>(
        `INSERT INTO asset_upload_intents (
           id, workspace_id, created_by_user_id, idempotency_key, media_kind, display_name,
           object_key, expected_content_type, expected_byte_size, expected_checksum_sha256,
           created_at, expires_at, storage_owner_kind, storage_owner_id, project_id
         )
         SELECT $1, workspace.id, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
         FROM workspaces AS workspace
         JOIN memberships AS membership
           ON membership.workspace_id = workspace.id
          AND membership.user_id = $3
         WHERE workspace.id = $2
         ON CONFLICT (workspace_id, created_by_user_id, idempotency_key)
         DO NOTHING
         RETURNING ${uploadIntentColumns}`,
        [
          id,
          input.workspaceId,
          input.actorId,
          idempotencyKey,
          input.mediaKind,
          displayName,
          objectKey,
          contentType,
          byteSize,
          checksumSha256,
          createdAt.toISOString(),
          expiresAt.toISOString(),
          owner.kind, owner.id, input.projectId ?? null,
        ],
      );
      const row = result.rows[0] ?? (await client.query<UploadIntentRow>(`SELECT ${uploadIntentColumns} FROM asset_upload_intents WHERE workspace_id=$1 AND created_by_user_id=$2 AND idempotency_key=$3`, [input.workspaceId, input.actorId, idempotencyKey])).rows[0];
      if (!row) throw new AssetWorkspaceUnavailableError();
      const intent = mapUploadIntent(row);
      if (
        intent.mediaKind !== input.mediaKind
        || intent.displayName !== displayName
        || intent.expectedContentType !== contentType
        || intent.expectedByteSize !== byteSize
        || intent.expectedChecksumSha256 !== checksumSha256
        || intent.storageOwner.kind !== owner.kind || intent.storageOwner.id !== owner.id
        || intent.projectId !== (input.projectId ?? null)
      ) throw new AssetUploadConflictError("idempotency_key_reused");
      this.requireActiveIntent(intent);
      return intent;
    });
  }

  async findUploadIntentByIdempotencyKey(input: FindAssetUploadIntentInput): Promise<AssetUploadIntent | null> {
    const key = requiredText(input.idempotencyKey, "Asset upload idempotency key");
    return this.withTransaction(async (client) => {
      await resolvePostgresStorageOwner(client, input);
      const result = await client.query<UploadIntentRow>(`SELECT ${uploadIntentColumns} FROM asset_upload_intents
        WHERE workspace_id=$1 AND created_by_user_id=$2 AND idempotency_key=$3`, [input.workspaceId, input.actorId, key]);
      if (!result.rows[0]) return null;
      const intent = mapUploadIntent(result.rows[0]);
      await this.requireIntentOwner(client, intent);
      return intent;
    });
  }

  async getUploadIntent(input: ReadAssetUploadIntentInput): Promise<AssetUploadIntent | null> {
    const result = await this.pool.query<UploadIntentRow>(
      `SELECT ${uploadIntentColumns.split(",").map((column) => `intent.${column.trim()}`).join(", ")}
       FROM asset_upload_intents AS intent
       JOIN memberships AS membership
         ON membership.workspace_id = intent.workspace_id
        AND membership.user_id = $1
       WHERE intent.id = $2
         AND intent.workspace_id = $3
         AND intent.created_by_user_id = $1`,
      [input.actorId, input.uploadIntentId, input.workspaceId],
    );
    return result.rows[0] ? mapUploadIntent(result.rows[0]) : null;
  }

  async recordUpload(input: RecordAssetUploadInput): Promise<AssetUploadIntent> {
    return this.withTransaction(async (client) => {
      const intent = await this.lockUploadIntent(client, input.workspaceId, input.actorId, input.uploadIntentId);
      return this.recordLockedUpload(client, intent, input);
    });
  }

  async writeUpload(input: ReadAssetUploadIntentInput, write: (intent: AssetUploadIntent) => Promise<UploadedAssetObject>): Promise<AssetUploadIntent> {
    return this.withTransaction(async (client) => {
      const intent = await this.lockUploadIntent(client, input.workspaceId, input.actorId, input.uploadIntentId);
      this.requireActiveIntent(intent);
      await this.requireIntentOwner(client, intent);
      const uploaded = await write(intent);
      return this.recordLockedUpload(client, intent, { ...input, ...uploaded });
    });
  }

  private async recordLockedUpload(client: PoolClient, intent: AssetUploadIntent, input: RecordAssetUploadInput): Promise<AssetUploadIntent> {
    const objectKey = requiredText(input.objectKey, "Asset object key");
    const contentType = requiredText(input.contentType, "Asset content type");
    const byteSize = validByteSize(input.byteSize);
    const checksumSha256 = validChecksum(input.checksumSha256);
    const etag = input.etag == null ? null : requiredText(input.etag, "Asset object etag");
    this.requireActiveIntent(intent);
    await this.requireIntentOwner(client, intent);
    if (
      intent.objectKey !== objectKey
      || intent.expectedContentType !== contentType
      || intent.expectedByteSize !== byteSize
      || intent.expectedChecksumSha256 !== checksumSha256
    ) throw new AssetUploadConflictError("metadata_mismatch");
    if (intent.status !== "pending") {
      if (
        intent.uploadedContentType !== contentType
        || intent.uploadedByteSize !== byteSize
        || intent.uploadedChecksumSha256 !== checksumSha256
        || intent.uploadedEtag !== etag
      ) throw new AssetUploadConflictError("metadata_mismatch");
      return intent;
    }
    const uploadedAt = this.now().toISOString();
    const updated = await client.query<UploadIntentRow>(
      `UPDATE asset_upload_intents
       SET status = 'uploaded',
           uploaded_content_type = $2,
           uploaded_byte_size = $3,
           uploaded_checksum_sha256 = $4,
           uploaded_etag = $5,
           uploaded_at = $6
       WHERE id = $1
       RETURNING ${uploadIntentColumns}`,
      [intent.id, contentType, byteSize, checksumSha256, etag, uploadedAt],
    );
    return mapUploadIntent(updated.rows[0]);
  }

  async finalizeUpload(input: FinalizeAssetUploadInput): Promise<WorkspaceMediaAsset> {
    return this.withTransaction(async (client) => {
      const intent = await this.lockUploadIntent(client, input.workspaceId, input.actorId, input.uploadIntentId);
      if (intent.status === "finalized" && intent.assetId) {
        const existing = await this.readAsset(client, intent.workspaceId, intent.assetId);
        if (existing) return existing;
      }
      this.requireActiveIntent(intent);
      await this.requireIntentOwner(client, intent);
      if (
        intent.status !== "uploaded"
        || !intent.uploadedContentType
        || intent.uploadedByteSize == null
        || !intent.uploadedChecksumSha256
        || !intent.uploadedAt
      ) throw new AssetUploadConflictError("not_uploaded");

      const timestamp = this.now().toISOString();
      const assetId = `asset-${this.createId()}`;
      const assetResult = await client.query<AssetRow>(
        `INSERT INTO workspace_media_assets (
           id, workspace_id, media_kind, display_name, object_key, object_version,
           content_type, byte_size, checksum_sha256, created_by_user_id, created_at, updated_at, storage_owner_kind, storage_owner_id
         )
         VALUES ($1, $2, $3, $4, $5, 1, $6, $7, $8, $9, $10, $10, $11, $12)
         RETURNING ${assetColumns}`,
        [
          assetId,
          intent.workspaceId,
          intent.mediaKind,
          intent.displayName,
          intent.objectKey,
          intent.uploadedContentType,
          intent.uploadedByteSize,
          intent.uploadedChecksumSha256,
          intent.createdByActorId,
          timestamp,
          intent.storageOwner.kind, intent.storageOwner.id,
        ],
      );
      await client.query(
        `INSERT INTO media_asset_placements (
           id, workspace_id, asset_id, scope_kind, owner_user_id, created_by_user_id, created_at
         )
         VALUES ($1, $2, $3, $6, $7, $4, $5)`,
        [`placement-${this.createId()}`, intent.workspaceId, assetId, input.actorId, timestamp, intent.storageOwner.kind, intent.storageOwner.kind === "personal" ? input.actorId : null],
      );
      await client.query(
        `UPDATE asset_upload_intents
         SET status = 'finalized', asset_id = $2, finalized_at = $3
         WHERE id = $1`,
        [intent.id, assetId, timestamp],
      );
      return mapAsset(assetResult.rows[0]);
    });
  }

  async getMediaStorage(input: ReadMediaStorageInput) {
    return this.withTransaction(async (client) => readPostgresStorage(client, await resolvePostgresStorageOwner(client, input, false), this.storageLimits));
  }

  async listExpiredUploadIntents(input: ReadMediaStorageInput): Promise<AssetUploadIntent[]> {
    return this.withTransaction(async (client) => {
      const owner = await resolvePostgresStorageOwner(client, input, false);
      const result = await client.query<UploadIntentRow>(`SELECT ${uploadIntentColumns} FROM asset_upload_intents
        WHERE workspace_id=$1 AND created_by_user_id=$2 AND storage_owner_kind=$3 AND storage_owner_id=$4
        AND (status IN ('pending','uploaded') AND expires_at <= $5 OR status='cancelling')
        ORDER BY expires_at, id LIMIT 100`, [input.workspaceId, input.actorId, owner.kind, owner.id, this.now().toISOString()]);
      return result.rows.map(mapUploadIntent);
    });
  }

  async registerUploadAuthorization(input: ReadAssetUploadIntentInput & { expiresAt: string; reservedBytes?: number }): Promise<void> {
    const expiry = new Date(input.expiresAt);
    if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= this.now().getTime()) throw new AssetUploadConflictError("expired");
    await this.withTransaction(async (client) => {
      const intent = await this.lockUploadIntent(client, input.workspaceId, input.actorId, input.uploadIntentId);
      if (intent.status === "finalized") throw new AssetUploadConflictError("finalized");
      this.requireActiveIntent(intent);
      await this.requireIntentOwner(client, intent);
      const bytes = input.reservedBytes ?? intent.expectedByteSize;
      if (!Number.isSafeInteger(bytes) || bytes < intent.expectedByteSize) throw new AssetUploadConflictError("metadata_mismatch");
      await lockPostgresStorageOwner(client, intent.storageOwner);
      const storage = await readPostgresStorage(client, intent.storageOwner, this.storageLimits);
      const extra = Math.max(0, bytes - intent.reservedByteSize);
      if (extra > storage.availableBytes) throw new MediaStorageQuotaExceededError(storage);
      await client.query("UPDATE asset_upload_intents SET upload_authorization_expires_at=GREATEST(upload_authorization_expires_at,$2::timestamptz), reserved_byte_size=GREATEST(reserved_byte_size,$3) WHERE id=$1", [intent.id, expiry.toISOString(), bytes]);
    });
  }

  async beginUploadCancellation(input: CancelAssetUploadInput): Promise<AssetUploadIntent> {
    return this.withTransaction(async (client) => {
      const intent = await this.lockUploadIntent(client, input.workspaceId, input.actorId, input.uploadIntentId);
      if (intent.status === "finalized") throw new AssetUploadConflictError("finalized");
      if (input.expiredOnly && intent.status !== "cancelling" && this.now().getTime() < Date.parse(intent.expiresAt)) throw new AssetUploadConflictError("not_expired");
      if (intent.status === "cancelled" || intent.status === "cancelling") return intent;
      const result = await client.query<UploadIntentRow>(`UPDATE asset_upload_intents SET status='cancelling' WHERE id=$1 RETURNING ${uploadIntentColumns}`, [intent.id]);
      return mapUploadIntent(result.rows[0]);
    });
  }

  async completeUploadCancellation(input: ReadAssetUploadIntentInput): Promise<void> {
    await this.withTransaction(async (client) => {
      const intent = await this.lockUploadIntent(client, input.workspaceId, input.actorId, input.uploadIntentId);
      if (intent.status === "cancelled") return;
      if (intent.status !== "cancelling") throw new AssetUploadConflictError("metadata_mismatch");
      // Expiration does not prove that an external PUT which already started
      // has terminated. Only proxy writes currently have an enforceable fence.
      if (intent.uploadAuthorizationExpiresAt) throw new AssetUploadConflictError("authorization_active");
      await client.query("UPDATE asset_upload_intents SET status='cancelled' WHERE id=$1", [intent.id]);
    });
  }

  private requireActiveIntent(intent: AssetUploadIntent): void {
    if (intent.status === "cancelling" || intent.status === "cancelled") throw new AssetUploadConflictError("cancelled");
    if (intent.status !== "finalized" && this.now().getTime() >= Date.parse(intent.expiresAt)) throw new AssetUploadConflictError("expired");
  }

  private async requireIntentOwner(client: PoolClient, intent: AssetUploadIntent): Promise<void> {
    const owner = await resolvePostgresStorageOwner(client, { workspaceId: intent.workspaceId, actorId: intent.createdByActorId, storageSpace: intent.storageOwner.kind, projectId: intent.projectId ?? undefined });
    if (owner.kind !== intent.storageOwner.kind || owner.id !== intent.storageOwner.id) throw new AssetUploadConflictError("storage_owner_mismatch");
  }

  async listPersonalAssets(input: ListPersonalAssetsInput): Promise<WorkspaceMediaAsset[]> {
    const result = await this.pool.query<AssetRow>(
      `SELECT ${personalAssetColumns}
       FROM media_asset_placements AS placement
       JOIN workspace_media_assets AS asset
         ON asset.workspace_id = placement.workspace_id
        AND asset.id = placement.asset_id
       JOIN memberships AS membership
         ON membership.workspace_id = placement.workspace_id
        AND membership.user_id = $1
       WHERE placement.workspace_id = $2
         AND placement.scope_kind = 'personal'
         AND placement.owner_user_id = $1
       ORDER BY placement.created_at DESC, asset.id`,
      [input.actorId, input.workspaceId],
    );
    return result.rows.map(mapAsset);
  }

  async getPersonalAsset(input: ReadPersonalAssetInput): Promise<WorkspaceMediaAsset | null> {
    const result = await this.pool.query<AssetRow>(
      `SELECT ${personalAssetColumns}
       FROM media_asset_placements AS placement
       JOIN workspace_media_assets AS asset
         ON asset.workspace_id = placement.workspace_id
        AND asset.id = placement.asset_id
       JOIN memberships AS membership
         ON membership.workspace_id = placement.workspace_id
        AND membership.user_id = $1
       WHERE placement.workspace_id = $2
         AND placement.asset_id = $3
         AND placement.scope_kind = 'personal'
         AND placement.owner_user_id = $1`,
      [input.actorId, input.workspaceId, input.assetId],
    );
    return result.rows[0] ? mapAsset(result.rows[0]) : null;
  }

  async renamePersonalAsset(input: RenamePersonalAssetInput): Promise<WorkspaceMediaAsset> {
    const displayName = validDisplayName(input.displayName);
    const space = input.space ?? "personal";
    return this.withTransaction(async (client) => {
      const membership = await client.query<{role: string}>(
        "SELECT role FROM memberships WHERE workspace_id=$1 AND user_id=$2 FOR SHARE",
        [input.workspaceId, input.actorId],
      );
      if (!membership.rows[0]) throw new AssetWorkspaceUnavailableError();
      if (space === "organization" && !["owner", "admin"].includes(membership.rows[0].role)) throw new MediaLibraryError("forbidden", "只有组织所有者或管理员可以重命名组织素材。");
      const result = await client.query<AssetRow>(
        `WITH renamed AS (
           UPDATE media_asset_placements AS placement
           SET display_name = $4, updated_at = $5
           WHERE placement.workspace_id = $2 AND placement.asset_id = $3
             AND placement.scope_kind = $6 AND placement.scope_owner = $1
           RETURNING placement.*
         )
         SELECT ${personalAssetColumns}
         FROM renamed AS placement
         JOIN workspace_media_assets AS asset
           ON asset.workspace_id = placement.workspace_id AND asset.id = placement.asset_id`,
        [space === "personal" ? input.actorId : "", input.workspaceId, input.assetId, displayName, this.now().toISOString(), space],
      );
      if (!result.rows[0]) throw new PersonalAssetUnavailableError();
      return mapAsset(result.rows[0]);
    });
  }

  async attachAssetToProject(input: AttachAssetToProjectInput): Promise<ProjectAssetReference> {
    const id = `project-asset-${this.createId()}`;
    const createdAt = this.now().toISOString();
    const result = await this.pool.query<ProjectAssetReferenceRow>(
      `INSERT INTO project_asset_references (
         id, workspace_id, project_id, asset_id, asset_version, created_by_user_id, created_at
       )
       SELECT $1, project.workspace_id, project.id, asset.id, asset.object_version, $2, $5
       FROM projects AS project
       JOIN project_memberships AS project_membership
         ON project_membership.project_id = project.id
        AND project_membership.user_id = $2
        AND project_membership.role IN ('admin', 'edit')
       JOIN memberships AS workspace_membership
         ON workspace_membership.workspace_id = project.workspace_id
        AND workspace_membership.user_id = $2
       JOIN workspace_media_assets AS asset
         ON asset.workspace_id = project.workspace_id
        AND asset.id = $3
       WHERE project.id = $4
         AND project.deleted_at IS NULL
         AND EXISTS (
           SELECT 1
           FROM media_asset_placements AS placement
           WHERE placement.workspace_id = asset.workspace_id
             AND placement.asset_id = asset.id
             AND (
               (placement.scope_kind = 'personal' AND placement.owner_user_id = $2)
               OR placement.scope_kind = 'organization'
             )
         )
       ON CONFLICT (project_id, asset_id, asset_version)
       DO UPDATE SET id = project_asset_references.id
       RETURNING id, workspace_id, project_id, asset_id, asset_version, created_by_user_id, created_at`,
      [id, input.actorId, input.assetId, input.projectId, createdAt],
    );
    const row = result.rows[0];
    if (!row) throw new ProjectAssetUnavailableError();
    return mapProjectAssetReference(row);
  }

  async listProjectAssets(input: ListProjectAssetsInput): Promise<ProjectAsset[]> {
    await this.requireProjectReadAccess(input.actorId, input.projectId);
    const result = await this.pool.query<ProjectAssetRow>(
      this.projectAssetSelect("reference.project_id = $2"),
      [input.actorId, input.projectId],
    );
    return result.rows.map(mapProjectAsset);
  }

  async getProjectAsset(input: ReadProjectAssetInput): Promise<ProjectAsset | null> {
    await this.requireProjectReadAccess(input.actorId, input.projectId);
    const result = await this.pool.query<ProjectAssetRow>(
      this.projectAssetSelect("reference.project_id = $2 AND reference.id = $3"),
      [input.actorId, input.projectId, input.referenceId],
    );
    return result.rows[0] ? mapProjectAsset(result.rows[0]) : null;
  }

  private async lockUploadIntent(
    client: PoolClient,
    workspaceId: string,
    actorId: string,
    uploadIntentId: string,
  ): Promise<AssetUploadIntent> {
    const result = await client.query<UploadIntentRow>(
      `SELECT ${uploadIntentColumns.split(",").map((column) => `intent.${column.trim()}`).join(", ")}
       FROM asset_upload_intents AS intent
       JOIN memberships AS membership
         ON membership.workspace_id = intent.workspace_id
        AND membership.user_id = $1
       WHERE intent.id = $2
         AND intent.workspace_id = $3
         AND intent.created_by_user_id = $1
       FOR UPDATE OF intent`,
      [actorId, uploadIntentId, workspaceId],
    );
    if (!result.rows[0]) throw new AssetUploadIntentUnavailableError();
    return mapUploadIntent(result.rows[0]);
  }

  private async readAsset(client: PoolClient, workspaceId: string, assetId: string): Promise<WorkspaceMediaAsset | null> {
    const result = await client.query<AssetRow>(
      `SELECT ${assetColumns} FROM workspace_media_assets WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, assetId],
    );
    return result.rows[0] ? mapAsset(result.rows[0]) : null;
  }

  private async requireProjectReadAccess(actorId: string, projectId: string): Promise<void> {
    const result = await this.pool.query(
      `SELECT 1
       FROM projects AS project
       JOIN project_memberships AS membership
         ON membership.project_id = project.id
        AND membership.user_id = $1
       WHERE project.id = $2
         AND project.deleted_at IS NULL`,
      [actorId, projectId],
    );
    if (!result.rows[0]) throw new ProjectAssetUnavailableError();
  }

  private projectAssetSelect(predicate: string): string {
    return `SELECT
      reference.id AS reference_id,
      reference.workspace_id AS reference_workspace_id,
      reference.project_id AS reference_project_id,
      reference.asset_id AS reference_asset_id,
      reference.asset_version AS reference_asset_version,
      reference.created_by_user_id AS reference_created_by_user_id,
      reference.created_at AS reference_created_at,
      asset.id,
      asset.storage_owner_kind,
      asset.storage_owner_id,
      asset.workspace_id,
      asset.media_kind,
      asset.display_name,
      asset.object_key,
      asset.object_version,
      asset.content_type,
      asset.byte_size,
      asset.checksum_sha256,
      asset.created_by_user_id,
      asset.created_at,
      asset.updated_at
    FROM project_asset_references AS reference
    JOIN projects AS project
      ON project.workspace_id = reference.workspace_id
     AND project.id = reference.project_id
     AND project.deleted_at IS NULL
    JOIN project_memberships AS membership
      ON membership.project_id = project.id
     AND membership.user_id = $1
    JOIN workspace_media_assets AS asset
      ON asset.workspace_id = reference.workspace_id
     AND asset.id = reference.asset_id
     AND asset.object_version = reference.asset_version
    WHERE ${predicate}
    ORDER BY reference.created_at DESC, reference.id`;
  }

  private async withTransaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
