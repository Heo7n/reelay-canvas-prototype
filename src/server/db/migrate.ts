import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import type { Pool, PoolClient } from "pg";

const MIGRATION_LOCK_ID = 1_907_072_022;
const migrationsDirectory = join(process.cwd(), "src", "server", "db", "migrations");

interface AppliedMigrationRow {
  file_name: string;
  checksum: string;
}

export function calculateMigrationChecksum(sql: string): string {
  const normalizedSql = sql.replace(/\r\n?/g, "\n");
  return createHash("sha256").update(normalizedSql).digest("hex");
}

async function ensureMigrationTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      file_name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

export async function runMigrations(pool: Pool): Promise<string[]> {
  const client = await pool.connect();
  const appliedNow: string[] = [];

  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
    await ensureMigrationTable(client);

    const files = (await readdir(migrationsDirectory))
      .filter((fileName) => /^\d{4}_[a-z0-9_-]+\.sql$/i.test(fileName))
      .sort();
    const appliedResult = await client.query<AppliedMigrationRow>(
      "SELECT file_name, checksum FROM schema_migrations",
    );
    const applied = new Map(appliedResult.rows.map((row) => [row.file_name, row.checksum]));

    for (const fileName of files) {
      const sql = await readFile(join(migrationsDirectory, fileName), "utf8");
      const checksum = calculateMigrationChecksum(sql);
      const existingChecksum = applied.get(fileName);

      if (existingChecksum) {
        if (existingChecksum !== checksum) {
          throw new Error(`Applied migration ${fileName} no longer matches its recorded checksum.`);
        }
        continue;
      }

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (file_name, checksum) VALUES ($1, $2)",
          [fileName, checksum],
        );
        await client.query("COMMIT");
        appliedNow.push(fileName);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    return appliedNow;
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]).catch(() => undefined);
    client.release();
  }
}
