import type { PoolClient } from "pg";
import { mediaStorageLimit, mediaStorageSnapshot, type MediaStorageLimits, type MediaStorageOwner, type MediaStorageSnapshot } from "../../domain/asset/media-storage";
import { AssetUploadConflictError, AssetWorkspaceUnavailableError, type ReadMediaStorageInput } from "../application/WorkspaceMediaAssetStore";
import { ProjectAssetUnavailableError } from "../application/ProjectAssetReferenceStore";

export async function resolvePostgresStorageOwner(client: PoolClient, input: ReadMediaStorageInput, writable = true): Promise<MediaStorageOwner> {
  const membership = await client.query("SELECT 1 FROM memberships WHERE workspace_id=$1 AND user_id=$2 FOR SHARE", [input.workspaceId, input.actorId]);
  if (!membership.rowCount) throw new AssetWorkspaceUnavailableError();
  let kind = input.storageSpace ?? "personal";
  if (input.projectId) {
    const project = await client.query<{ access_kind: "private" | "collaborative"; role: string }>(
      `SELECT project.access_kind, member.role FROM projects project JOIN project_memberships member ON member.project_id=project.id AND member.user_id=$2
       WHERE project.id=$3 AND project.workspace_id=$1 AND project.deleted_at IS NULL FOR SHARE OF project, member`,
      [input.workspaceId, input.actorId, input.projectId]);
    if (!project.rows[0] || (writable && !["admin", "edit"].includes(project.rows[0].role))) throw new ProjectAssetUnavailableError();
    kind = project.rows[0].access_kind === "collaborative" ? "organization" : "personal";
    if (input.storageSpace && input.storageSpace !== kind) throw new AssetUploadConflictError("storage_owner_mismatch");
  }
  return { kind, id: kind === "personal" ? input.actorId : input.workspaceId };
}

export async function lockPostgresStorageOwner(client: PoolClient, owner: MediaStorageOwner): Promise<void> {
  await client.query("INSERT INTO media_storage_accounts(owner_kind, owner_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [owner.kind, owner.id]);
  await client.query("SELECT 1 FROM media_storage_accounts WHERE owner_kind=$1 AND owner_id=$2 FOR NO KEY UPDATE", [owner.kind, owner.id]);
}

export async function readPostgresStorage(client: PoolClient, owner: MediaStorageOwner, limits: MediaStorageLimits): Promise<MediaStorageSnapshot> {
  const result = await client.query<{ limit_bytes: string | null; used_bytes: string; reserved_bytes: string }>(
    `SELECT (SELECT limit_bytes FROM media_storage_accounts WHERE owner_kind=$1 AND owner_id=$2) AS limit_bytes,
      COALESCE((SELECT SUM(byte_size) FROM workspace_media_assets WHERE storage_owner_kind=$1 AND storage_owner_id=$2), 0) AS used_bytes,
      COALESCE((SELECT SUM(reserved_byte_size) FROM asset_upload_intents WHERE storage_owner_kind=$1 AND storage_owner_id=$2 AND status IN ('pending','uploaded','cancelling')), 0) AS reserved_bytes`,
    [owner.kind, owner.id]);
  const row = result.rows[0];
  // object_key is globally unique on workspace_media_assets; placements,
  // project references and derived thumbnails never participate in this sum.
  return mediaStorageSnapshot(owner, row.limit_bytes == null ? mediaStorageLimit(limits, owner.kind) : Number(row.limit_bytes), Number(row.used_bytes), Number(row.reserved_bytes));
}
