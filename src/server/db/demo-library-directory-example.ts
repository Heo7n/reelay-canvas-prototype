import { randomUUID } from "node:crypto";
import type { Pool, QueryResult } from "pg";

import { DEMO_LIBRARY_DIRECTORY_EXAMPLE } from "../../config/media-library-directory-example";
import { libraryNameKey } from "../../domain/asset/media-library";
import { DEMO_ACTOR_ID, DEMO_WORKSPACE_ID } from "./demo-asset-fixtures";

/** Opt-in fixture setup. A user's existing placement, name, or tags always win. */
export async function seedDemoLibraryDirectoryExample(
  pool: Pool,
  assetId: string,
  expectedDisplayName: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`media-library:${DEMO_WORKSPACE_ID}`]);
    const existing = await client.query<{
      display_name: string; folder_id: string | null; tag_ids: string[]; untouched: boolean;
    }>(
      `SELECT COALESCE(placement.display_name, asset.display_name) AS display_name,
              placement.folder_id, placement.tag_ids,
              (placement.updated_at IS NULL OR placement.updated_at = placement.created_at) AS untouched
       FROM media_asset_placements AS placement
       JOIN workspace_media_assets AS asset ON asset.workspace_id = placement.workspace_id AND asset.id = placement.asset_id
       WHERE placement.workspace_id = $1 AND placement.asset_id = $2
         AND placement.scope_kind = 'personal' AND placement.owner_user_id = $3
       FOR UPDATE OF placement`,
      [DEMO_WORKSPACE_ID, assetId, DEMO_ACTOR_ID],
    );
    const placement = existing.rows[0];
    if (!placement || !placement.untouched || placement.folder_id !== null
      || placement.display_name !== expectedDisplayName || placement.tag_ids.length > 0) {
      await client.query("COMMIT");
      return;
    }

    let parentId: string | null = null;
    const example = DEMO_LIBRARY_DIRECTORY_EXAMPLE;
    for (const [index, name] of example.path.entries()) {
      const result: QueryResult<{ id: string }> = await client.query<{ id: string }>(
        `INSERT INTO media_library_folders (id, workspace_id, scope_kind, owner_user_id, name, name_key, parent_id, depth)
         VALUES ($1, $2, 'personal', $3, $4, $5, $6, $7)
         ON CONFLICT (workspace_id, scope_kind, scope_owner, (COALESCE(parent_id, '')), name_key)
         DO UPDATE SET name_key = EXCLUDED.name_key RETURNING id`,
        [`folder-${randomUUID()}`, DEMO_WORKSPACE_ID, DEMO_ACTOR_ID, name, libraryNameKey(name), parentId, index + 1],
      );
      parentId = result.rows[0].id;
    }
    const tag = await client.query<{ id: string }>(
      `INSERT INTO media_library_tags (id, workspace_id, scope_kind, owner_user_id, name, name_key)
       VALUES ($1, $2, 'personal', $3, $4, $5)
       ON CONFLICT (workspace_id, scope_kind, scope_owner, name_key)
       DO UPDATE SET name_key = EXCLUDED.name_key RETURNING id`,
      [`tag-${randomUUID()}`, DEMO_WORKSPACE_ID, DEMO_ACTOR_ID, example.customTagName, libraryNameKey(example.customTagName)],
    );
    await client.query(
      `UPDATE media_asset_placements SET display_name = $4, folder_id = $5, tag_ids = $6, updated_at = now()
       WHERE workspace_id = $1 AND asset_id = $2 AND scope_kind = 'personal' AND owner_user_id = $3`,
      [DEMO_WORKSPACE_ID, assetId, DEMO_ACTOR_ID, example.displayName, parentId, [example.builtinTagId, tag.rows[0].id]],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
