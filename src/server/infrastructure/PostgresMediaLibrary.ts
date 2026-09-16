import type { Pool, PoolClient } from "pg";
import { validateLibraryEntityMove, type MoveLibraryEntitiesInput, BUILTIN_LIBRARY_TAGS, MediaLibraryError, libraryNameKey, normalizeLibraryName, planLibraryDeletion, planLibraryTagUpdate, planLibraryTagDeletion, type DeleteLibraryTagInput, type UpdateLibraryTagsInput, type DeleteLibraryInput, type RenameLibraryFolderInput, validateLibraryFolderRename, validateLibraryFolder, validateLibrarySave, type CreateLibraryFolderInput, type CreateLibraryTagInput, type LibraryFolder, type LibraryTag, type LibrarySpace, type MediaLibraryCatalog, type SaveLibraryInput } from "../../domain/asset/media-library";
import type { MediaKind } from "../../domain/asset/workspace-media-asset";
import type { LibraryActorInput } from "../application/MediaLibraryStore";
import { AssetWorkspaceUnavailableError, PersonalAssetUnavailableError } from "../application/WorkspaceMediaAssetStore";
import { ProjectAssetUnavailableError } from "../application/ProjectAssetReferenceStore";

export class PostgresMediaLibrary {
  constructor(private readonly pool: Pool, private readonly now: () => Date, private readonly createId: () => string) {}

  async listLibrary(input: LibraryActorInput): Promise<MediaLibraryCatalog> {
    return this.transaction(input, (client) => this.catalog(client, input), false);
  }

  async createLibraryFolder(input: CreateLibraryFolderInput & { actorId: string }): Promise<LibraryFolder> {
    return this.transaction(input, async (client) => {
      const catalog = await this.catalog(client, input);
      const name = validateLibraryFolder(catalog, input);
      let depth = 1;
      let parent = catalog.folders.find((folder) => folder.id === input.parentId);
      while (parent) { depth += 1; parent = catalog.folders.find((folder) => folder.id === parent?.parentId); }
      const folder: LibraryFolder = { id: `folder-${this.createId()}`, name, parentId: input.parentId, space: input.space };
      await client.query(`INSERT INTO media_library_folders (id, workspace_id, scope_kind, owner_user_id, name, name_key, parent_id, depth) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [folder.id, input.workspaceId, input.space, input.space === "personal" ? input.actorId : null, name, libraryNameKey(name), input.parentId, depth]);
      return folder;
    });
  }

  async renameLibraryFolder(input: RenameLibraryFolderInput & { actorId: string }): Promise<LibraryFolder> {
    return this.transaction(input, async (client) => {
      if (input.space === "organization") {
        const role = await client.query<{ role: string }>("SELECT role FROM memberships WHERE workspace_id=$1 AND user_id=$2 FOR SHARE", [input.workspaceId, input.actorId]);
        if (!["owner", "admin"].includes(role.rows[0]?.role)) throw new MediaLibraryError("forbidden", "只有组织所有者或管理员可以重命名组织文件夹。");
      }
      const folder = validateLibraryFolderRename(await this.catalog(client, input), input);
      await client.query(`UPDATE media_library_folders SET name=$5,name_key=$6 WHERE workspace_id=$1 AND scope_kind=$2 AND scope_owner=$3 AND id=$4`,
        [input.workspaceId, input.space, input.space === "personal" ? input.actorId : "", folder.id, folder.name, libraryNameKey(folder.name)]);
      return folder;
    });
  }

  async createLibraryTag(input: CreateLibraryTagInput & { actorId: string }): Promise<LibraryTag> {
    return this.transaction(input, async (client) => {
      const name = normalizeLibraryName(input.name);
      if (!name || name.length > 40 || [...name].some((character) => character.charCodeAt(0) < 32)) throw new MediaLibraryError("invalid_tag_name", "标签名称需为 1–40 个字符。");
      const builtin = BUILTIN_LIBRARY_TAGS.find((tag) => libraryNameKey(tag.name) === libraryNameKey(name));
      if (builtin) return { ...builtin, space: input.space };
      const result = await client.query<{ id: string; name: string; scope_kind: LibrarySpace }>(
        `INSERT INTO media_library_tags (id,workspace_id,scope_kind,owner_user_id,name,name_key) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (workspace_id,scope_kind,scope_owner,name_key) DO UPDATE SET name_key=EXCLUDED.name_key RETURNING id,name,scope_kind`,
        [`tag-${this.createId()}`, input.workspaceId, input.space, input.space === "personal" ? input.actorId : null, name, libraryNameKey(name)]);
      return { id: result.rows[0].id, name: result.rows[0].name, space: result.rows[0].scope_kind };
    });
  }

  async saveLibrary(input: SaveLibraryInput & { actorId: string }): Promise<MediaLibraryCatalog> {
    return this.transaction(input, async (client) => {
      const catalog = await this.catalog(client, input);
      const normalized = validateLibrarySave(catalog, input);
      const project = await client.query(`SELECT project.id FROM projects AS project JOIN project_memberships AS membership ON membership.project_id=project.id AND membership.user_id=$1 WHERE project.id=$2 AND project.workspace_id=$3 AND project.deleted_at IS NULL FOR KEY SHARE OF project, membership`, [input.actorId,input.projectId,input.workspaceId]);
      if (!project.rows[0]) throw new ProjectAssetUnavailableError();
      // Resolve authorization for every item before writing; transaction rollback also protects batch atomicity.
      for (const item of normalized.items) {
        const readable = await client.query(`SELECT asset.id FROM workspace_media_assets AS asset WHERE asset.workspace_id=$1 AND asset.id=$2 AND (
          EXISTS (SELECT 1 FROM media_asset_placements AS placement WHERE placement.workspace_id=asset.workspace_id AND placement.asset_id=asset.id AND (placement.scope_kind='organization' OR placement.owner_user_id=$3)) OR
          EXISTS (SELECT 1 FROM project_asset_references AS reference WHERE reference.workspace_id=asset.workspace_id AND reference.project_id=$4 AND reference.asset_id=asset.id AND reference.asset_version=asset.object_version)) FOR KEY SHARE OF asset`, [input.workspaceId,item.assetId,input.actorId,input.projectId]);
        if (!readable.rows[0]) throw new PersonalAssetUnavailableError();
      }
      const timestamp = this.now().toISOString();
      for (const item of normalized.items) {
        const existing = catalog.entries.find((entry) => entry.space===input.space && entry.assetId===item.assetId);
        // The locked catalog decides insert-only saves, including concurrent and retried requests.
        if (existing && item.action === "add") continue;
        if (existing) {
          await client.query(`UPDATE media_asset_placements SET display_name=$5,added_at=CASE WHEN folder_id IS DISTINCT FROM $6 THEN $8 ELSE added_at END,folder_id=$6,tag_ids=$7,updated_at=$8 WHERE workspace_id=$1 AND asset_id=$2 AND scope_kind=$3 AND scope_owner=$4`,
            [input.workspaceId,item.assetId,input.space,input.space==="personal" ? input.actorId : "",item.displayName,input.folderId,normalized.tagIds,timestamp]);
        } else {
          await client.query(`INSERT INTO media_asset_placements (id,workspace_id,asset_id,scope_kind,owner_user_id,created_by_user_id,created_at,display_name,folder_id,tag_ids,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$7)`,
            [`placement-${this.createId()}`,input.workspaceId,item.assetId,input.space,input.space==="personal" ? input.actorId : null,input.actorId,timestamp,item.displayName,input.folderId,normalized.tagIds]);
        }
      }
      return this.catalog(client,input);
    });
  }

  async moveLibraryEntities(input: MoveLibraryEntitiesInput & { actorId: string }): Promise<MediaLibraryCatalog> {
    return this.transaction(input, async (client) => {
      const normalized = validateLibraryEntityMove(await this.catalog(client, input), input);
      await client.query(`UPDATE entity_placements SET folder_id=$3,added_at=$4
        WHERE workspace_id=$1 AND scope_kind='personal' AND owner_user_id=$2 AND entity_id=ANY($5::text[]) AND folder_id IS DISTINCT FROM $3`,
      [input.workspaceId, input.actorId, normalized.folderId, this.now().toISOString(), normalized.items.map((item) => item.entityId)]);
      return this.catalog(client, input);
    });
  }

  async deleteLibrary(input: DeleteLibraryInput & { actorId: string }): Promise<MediaLibraryCatalog> {
    return this.transaction(input, async (client) => {
      if (input.space === "organization") {
        const role = await client.query<{ role: string }>("SELECT role FROM memberships WHERE workspace_id=$1 AND user_id=$2 FOR SHARE", [input.workspaceId, input.actorId]);
        if (!["owner", "admin"].includes(role.rows[0]?.role)) throw new MediaLibraryError("forbidden", "只有组织所有者或管理员可以删除组织素材。");
      }
      const catalog = await this.catalog(client, input);
      const entities = input.space === "personal" ? await client.query<{ id: string; version: number; asset_ids: string[] }>(
        `SELECT entity.id,entity.version,ARRAY(SELECT reference.asset_id FROM entity_media_references AS reference WHERE reference.workspace_id=entity.workspace_id AND reference.entity_id=entity.id) AS asset_ids
         FROM entity_placements AS placement JOIN workspace_entities AS entity ON entity.workspace_id=placement.workspace_id AND entity.id=placement.entity_id
         WHERE placement.workspace_id=$1 AND placement.scope_kind='personal' AND placement.owner_user_id=$2 FOR UPDATE OF entity,placement`, [input.workspaceId, input.actorId]) : { rows: [] };
      const plan = planLibraryDeletion(catalog, entities.rows.map((entity) => ({ id: entity.id, version: entity.version, assetIds: entity.asset_ids })), input);
      // Delete group placements first, letting their personal media bindings cascade. The source group and media remain intact.
      if (plan.entityIds.length) {
        await client.query(`INSERT INTO entity_library_deletions (workspace_id,entity_id,owner_user_id) SELECT $1,unnest($2::text[]),$3 ON CONFLICT DO NOTHING`, [input.workspaceId, plan.entityIds, input.actorId]);
        await client.query(`DELETE FROM entity_placements WHERE workspace_id=$1 AND entity_id=ANY($2::text[]) AND scope_kind='personal' AND owner_user_id=$3`, [input.workspaceId, plan.entityIds, input.actorId]);
      }
      const owner = input.space === "personal" ? input.actorId : "";
      // Detach legacy locations without moving/reordering surviving subjects or changing their content.
      await client.query(`UPDATE entity_placements SET folder_id=NULL WHERE workspace_id=$1 AND scope_kind=$2 AND scope_owner=$3 AND folder_id=ANY($4::text[])`, [input.workspaceId, input.space, owner, plan.folderIds]);
      await client.query(`DELETE FROM media_asset_placements WHERE workspace_id=$1 AND scope_kind=$2 AND scope_owner=$3 AND asset_id=ANY($4::text[])`, [input.workspaceId, input.space, owner, plan.assetIds]);
      await client.query(`DELETE FROM media_library_folders WHERE workspace_id=$1 AND scope_kind=$2 AND scope_owner=$3 AND id=ANY($4::text[])`, [input.workspaceId, input.space, owner, plan.folderIds]);
      return this.catalog(client, input);
    });
  }

  async deleteLibraryTag(input: DeleteLibraryTagInput & { actorId: string }): Promise<MediaLibraryCatalog> {
    return this.transaction(input, async (client) => {
      if (input.space === "organization") {
        const role = await client.query<{ role: string }>("SELECT role FROM memberships WHERE workspace_id=$1 AND user_id=$2 FOR SHARE", [input.workspaceId, input.actorId]);
        if (!["owner", "admin"].includes(role.rows[0]?.role)) throw new MediaLibraryError("forbidden", "只有组织所有者或管理员可以删除组织标签。");
      }
      const catalog = await this.catalog(client, input);
      const result = planLibraryTagDeletion(catalog, input);
      if (result === catalog) return catalog;
      const scope = [input.workspaceId, input.space, input.space === "personal" ? input.actorId : "", input.tagId];
      // The shared workspace transaction lock also guards save/update, so removed IDs cannot be reattached.
      await client.query(`UPDATE media_asset_placements SET tag_ids=array_remove(tag_ids,$4),updated_at=$5
        WHERE workspace_id=$1 AND scope_kind=$2 AND scope_owner=$3 AND $4=ANY(tag_ids)`, [...scope, this.now().toISOString()]);
      await client.query(`UPDATE entity_placements SET tag_ids=array_remove(tag_ids,$4)
        WHERE workspace_id=$1 AND scope_kind=$2 AND COALESCE(owner_user_id,'')=$3 AND $4=ANY(tag_ids)`, scope);
      await client.query(`DELETE FROM media_library_tags WHERE workspace_id=$1 AND scope_kind=$2 AND scope_owner=$3 AND id=$4`, scope);
      return this.catalog(client, input);
    });
  }

  async updateLibraryTags(input: UpdateLibraryTagsInput & { actorId: string }): Promise<MediaLibraryCatalog> {
    return this.transaction(input, async (client) => {
      if (input.space === "organization") {
        const role = await client.query<{ role: string }>("SELECT role FROM memberships WHERE workspace_id=$1 AND user_id=$2 FOR SHARE", [input.workspaceId, input.actorId]);
        if (!["owner", "admin"].includes(role.rows[0]?.role)) throw new MediaLibraryError("forbidden", "只有组织所有者或管理员可以整理组织素材标签。");
      }
      // The same workspace lock guards saves, deletions and Entity writes; every delta reads the latest committed tags.
      const plan = planLibraryTagUpdate(await this.catalog(client, input), input);
      for (const item of plan.items) {
        if (item.kind === "media") {
          await client.query(`UPDATE media_asset_placements SET tag_ids=$5,updated_at=$6
            WHERE workspace_id=$1 AND scope_kind=$2 AND scope_owner=$3 AND asset_id=$4 AND tag_ids IS DISTINCT FROM $5::text[]`,
          [input.workspaceId, plan.space, plan.space === "personal" ? input.actorId : "", item.id, item.tagIds, this.now().toISOString()]);
        } else {
          await client.query(`UPDATE entity_placements SET tag_ids=$4
            WHERE workspace_id=$1 AND scope_kind='personal' AND owner_user_id=$2 AND entity_id=$3 AND tag_ids IS DISTINCT FROM $4::text[]`,
          [input.workspaceId, input.actorId, item.id, item.tagIds]);
        }
      }
      return this.catalog(client, input);
    });
  }

  private async catalog(client: PoolClient, input: LibraryActorInput): Promise<MediaLibraryCatalog> {
    const visibility = `workspace_id=$1 AND (scope_kind='organization' OR owner_user_id=$2)`;
    const folders = await client.query<{ id: string; name: string; parent_id: string | null; scope_kind: LibrarySpace }>(`SELECT id,name,parent_id,scope_kind FROM media_library_folders WHERE ${visibility} ORDER BY name,id`,[input.workspaceId,input.actorId]);
    const tags = await client.query<{ id: string; name: string; scope_kind: LibrarySpace }>(`SELECT id,name,scope_kind FROM media_library_tags WHERE ${visibility} ORDER BY name,id`,[input.workspaceId,input.actorId]);
    const entityEntries = await client.query<{ entity_id: string; scope_kind: LibrarySpace; tag_ids: string[]; folder_id: string | null; added_at: Date }>(
      `SELECT entity_id,scope_kind,tag_ids,folder_id,COALESCE(added_at,created_at) AS added_at FROM entity_placements WHERE workspace_id=$1 AND scope_kind='personal' AND owner_user_id=$2 ORDER BY entity_id`, [input.workspaceId, input.actorId]);
    const entries = await client.query<{ asset_id: string; object_version: number; media_kind: MediaKind; display_name: string; content_type: string; byte_size: string; checksum_sha256: string; created_at: Date; added_at: Date; scope_kind: LibrarySpace; folder_id: string | null; tag_ids: string[] }>(
      `SELECT asset.id AS asset_id,asset.object_version,asset.media_kind,COALESCE(placement.display_name,asset.display_name) AS display_name,asset.content_type,asset.byte_size,asset.checksum_sha256,placement.created_at,COALESCE(placement.added_at,placement.created_at) AS added_at,placement.scope_kind,placement.folder_id,placement.tag_ids FROM media_asset_placements AS placement JOIN workspace_media_assets AS asset ON asset.workspace_id=placement.workspace_id AND asset.id=placement.asset_id WHERE placement.workspace_id=$1 AND (placement.scope_kind='organization' OR placement.owner_user_id=$2) ORDER BY placement.created_at DESC,asset.id`,[input.workspaceId,input.actorId]);
    return {
      folders: folders.rows.map((row) => ({ id: row.id,name: row.name,parentId: row.parent_id,space: row.scope_kind })),
      tags: tags.rows.map((row) => ({ id: row.id,name: row.name,space: row.scope_kind })),
      entityEntries: entityEntries.rows.map((row) => ({ entityId: row.entity_id, space: row.scope_kind, tagIds: row.tag_ids, folderId: row.folder_id, addedAt: new Date(row.added_at).toISOString() })),
      entries: entries.rows.map((row) => ({ assetId: row.asset_id,assetVersion: row.object_version,mediaKind: row.media_kind,displayName: row.display_name,contentType: row.content_type,byteSize: Number(row.byte_size),checksumSha256: row.checksum_sha256,contentUrl: `/api/workspaces/${encodeURIComponent(input.workspaceId)}/media-assets/${encodeURIComponent(row.asset_id)}/content`,createdAt: new Date(row.created_at).toISOString(),addedAt: new Date(row.added_at).toISOString(),space: row.scope_kind,folderId: row.folder_id,tagIds: row.tag_ids })),
    };
  }

  private async transaction<T>(input: LibraryActorInput, operation: (client: PoolClient) => Promise<T>, writable = true): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query(writable ? "BEGIN" : "BEGIN ISOLATION LEVEL REPEATABLE READ");
      if (writable) await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`media-library:${input.workspaceId}`]);
      const membership = await client.query("SELECT 1 FROM memberships WHERE workspace_id=$1 AND user_id=$2 FOR KEY SHARE", [input.workspaceId,input.actorId]);
      if (!membership.rows[0]) throw new AssetWorkspaceUnavailableError();
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
}
