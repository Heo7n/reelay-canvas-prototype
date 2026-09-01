import { createPostgresPool, getMigrationDatabaseUrl } from "./config";
import { seedDemoAssetLibrary } from "./demo-asset-seed";
import { seedDemoDatabase } from "./seed";
import { FileSystemObjectStore } from "../infrastructure/FileSystemObjectStore";
import { PostgresAssetStore } from "../infrastructure/PostgresAssetStore";
import { PostgresEntityStore } from "../infrastructure/PostgresEntityStore";
import { getObjectStoreRoot } from "../object-store-config";

const isPreviewDeployment = process.env.REELAY_DEPLOYMENT_MODE === "preview";

if (process.env.NODE_ENV === "production" && !isPreviewDeployment) {
  throw new Error("Demo seed is disabled in production outside an explicit preview deployment.");
}
if (process.env.ALLOW_DEMO_SEED !== "true") {
  throw new Error("Refusing to write demo accounts unless ALLOW_DEMO_SEED=true.");
}

async function main(): Promise<void> {
  const pool = createPostgresPool(getMigrationDatabaseUrl());
  try {
    await seedDemoDatabase(pool);
    if (isPreviewDeployment) {
      console.log("Demo accounts and projects are present; local media fixtures are skipped in preview deployments.");
      return;
    }
    const seeded = await seedDemoAssetLibrary({
      assetStore: new PostgresAssetStore(pool),
      entityStore: new PostgresEntityStore(pool),
      objectStore: new FileSystemObjectStore(getObjectStoreRoot()),
    });
    console.log(`Demo seed is present (${seeded.assets.length} media assets, ${seeded.entities.length} Entities).`);
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
