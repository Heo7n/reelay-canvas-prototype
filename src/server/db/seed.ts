import type { Pool, PoolClient } from "pg";

import { createDemoSeed, DEMO_PASSWORD } from "../demo-fixtures";
import { hashDemoPassword } from "./passwords";

async function insertDemoData(client: PoolClient): Promise<void> {
  const seed = createDemoSeed();

  for (const account of seed.accounts) {
    await client.query(
      `INSERT INTO users (id, display_name)
       VALUES ($1, $2)
       ON CONFLICT (id) DO NOTHING`,
      [account.actorId, account.displayName],
    );
    await client.query(
      `INSERT INTO password_identities (
         id, user_id, identifier, normalized_identifier, password_hash
       )
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [
        `identity-${account.actorId}`,
        account.actorId,
        account.account,
        account.account.trim().toLocaleLowerCase("en-US"),
        await hashDemoPassword(DEMO_PASSWORD, account.actorId),
      ],
    );
  }

  for (const workspace of seed.workspaces) {
    await client.query(
      `INSERT INTO workspaces (id, kind, name)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO NOTHING`,
      [workspace.id, workspace.kind, workspace.name],
    );
  }

  for (const membership of seed.memberships) {
    await client.query(
      `INSERT INTO memberships (workspace_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (workspace_id, user_id) DO NOTHING`,
      [membership.workspaceId, membership.actorId, membership.role],
    );
  }

  for (const project of seed.projects) {
    await client.query(
      `INSERT INTO projects (
         id, workspace_id, created_by_user_id, updated_by_user_id, name, created_at, updated_at, cover_asset_id
       )
       VALUES ($1, $2, $3, $3, $4, $5, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [
        project.id,
        project.workspaceId,
        seed.projectAuthors[project.id],
        project.name,
        project.updatedAt,
        project.coverAssetId,
      ],
    );
  }
}

export async function seedDemoDatabase(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await insertDemoData(client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
