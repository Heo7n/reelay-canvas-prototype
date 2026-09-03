import { randomUUID } from "node:crypto";

import type { Pool, PoolClient, QueryResultRow } from "pg";

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
} from "../application/WorkspaceMediaAssetStore";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

interface UploadIntentRow extends QueryResultRow {
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
  status: "pending" | "uploaded" | "finalized";
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
  id, workspace_id, created_by_user_id, idempotency_key, media_kind, display_name,
  object_key, expected_content_type, expected_byte_size, expected_checksum_sha256,
  status, uploaded_content_type, uploaded_byte_size, uploaded_checksum_sha256,
  uploaded_etag, asset_id, created_at, expires_at, uploaded_at, finalized_at
`;

const assetColumns = `
  id, workspace_id, media_kind, display_name, object_key, object_version,
  content_type, byte_size, checksum_sha256, created_by_user_id, created_at, updated_at
`;

export class PostgresAssetStore implements WorkspaceMediaAssetStore, ProjectAssetReferenceStore {
  constructor(
    private readonly pool: Pool,
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = randomUUID,
    private readonly uploadIntentTtlMs = 15 * 60 * 1_000,
  ) {}

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
    const result = await this.pool.query<UploadIntentRow>(
      `INSERT INTO asset_upload_intents (
         id, workspace_id, created_by_user_id, idempotency_key, media_kind, display_name,
         object_key, expected_content_type, expected_byte_size, expected_checksum_sha256,
         created_at, expires_at
       )
       SELECT $1, workspace.id, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
       FROM workspaces AS workspace
       JOIN memberships AS membership
         ON membership.workspace_id = workspace.id
        AND membership.user_id = $3
       WHERE workspace.id = $2
       ON CONFLICT (workspace_id, created_by_user_id, idempotency_key)
       DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
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
      ],
    );
    const row = result.rows[0];
    if (!row) throw new AssetWorkspaceUnavailableError();
    const intent = mapUploadIntent(row);
    if (
      intent.mediaKind !== input.mediaKind
      || intent.displayName !== displayName
      || intent.expectedContentType !== contentType
      || intent.expectedByteSize !== byteSize
      || intent.expectedChecksumSha256 !== checksumSha256
    ) throw new AssetUploadConflictError("idempotency_key_reused");
    return intent;
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
    const objectKey = requiredText(input.objectKey, "Asset object key");
    const contentType = requiredText(input.contentType, "Asset content type");
    const byteSize = validByteSize(input.byteSize);
    const checksumSha256 = validChecksum(input.checksumSha256);
    const etag = input.etag == null ? null : requiredText(input.etag, "Asset object etag");
    return this.withTransaction(async (client) => {
      const intent = await this.lockUploadIntent(client, input.workspaceId, input.actorId, input.uploadIntentId);
      if (
        intent.objectKey !== objectKey
        || intent.expectedContentType !== contentType
        || intent.expectedByteSize !== byteSize
        || intent.expectedChecksumSha256 !== checksumSha256
      ) throw new AssetUploadConflictError("metadata_mismatch");
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
    });
  }

  async finalizeUpload(input: FinalizeAssetUploadInput): Promise<WorkspaceMediaAsset> {
    return this.withTransaction(async (client) => {
      const intent = await this.lockUploadIntent(client, input.workspaceId, input.actorId, input.uploadIntentId);
      if (intent.status === "finalized" && intent.assetId) {
        const existing = await this.readAsset(client, intent.workspaceId, intent.assetId);
        if (existing) return existing;
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
      const assetId = `asset-${this.createId()}`;
      const assetResult = await client.query<AssetRow>(
        `INSERT INTO workspace_media_assets (
           id, workspace_id, media_kind, display_name, object_key, object_version,
           content_type, byte_size, checksum_sha256, created_by_user_id, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, 1, $6, $7, $8, $9, $10, $10)
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
        ],
      );
      await client.query(
        `INSERT INTO media_asset_placements (
           id, workspace_id, asset_id, scope_kind, owner_user_id, created_by_user_id, created_at
         )
         VALUES ($1, $2, $3, 'personal', $4, $4, $5)`,
        [`placement-${this.createId()}`, intent.workspaceId, assetId, input.actorId, timestamp],
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

  async listPersonalAssets(input: ListPersonalAssetsInput): Promise<WorkspaceMediaAsset[]> {
    const result = await this.pool.query<AssetRow>(
      `SELECT ${assetColumns.split(",").map((column) => `asset.${column.trim()}`).join(", ")}
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
      `SELECT ${assetColumns.split(",").map((column) => `asset.${column.trim()}`).join(", ")}
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
    const result = await this.pool.query<AssetRow>(
      `UPDATE workspace_media_assets AS asset
       SET display_name = $4,
           updated_at = $5
       FROM media_asset_placements AS placement
       JOIN memberships AS membership
         ON membership.workspace_id = placement.workspace_id
        AND membership.user_id = $1
       WHERE asset.workspace_id = $2
         AND asset.id = $3
         AND placement.workspace_id = asset.workspace_id
         AND placement.asset_id = asset.id
         AND placement.scope_kind = 'personal'
         AND placement.owner_user_id = $1
       RETURNING ${assetColumns.split(",").map((column) => `asset.${column.trim()}`).join(", ")}`,
      [input.actorId, input.workspaceId, input.assetId, displayName, this.now().toISOString()],
    );
    if (!result.rows[0]) throw new PersonalAssetUnavailableError();
    return mapAsset(result.rows[0]);
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
