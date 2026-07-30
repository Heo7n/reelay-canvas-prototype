import { createPostgresPool, getMigrationDatabaseUrl } from "./config";
import { runMigrations } from "./migrate";

async function main(): Promise<void> {
  const pool = createPostgresPool(getMigrationDatabaseUrl());
  try {
    const applied = await runMigrations(pool);
    console.log(applied.length > 0 ? `Applied migrations: ${applied.join(", ")}` : "Database schema is current.");
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
