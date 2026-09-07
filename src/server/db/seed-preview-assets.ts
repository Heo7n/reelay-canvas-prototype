import { PostgresAssetStore } from "../infrastructure/PostgresAssetStore";
import { PostgresEntityStore } from "../infrastructure/PostgresEntityStore";
import { createSupabaseObjectStore } from "../supabase-object-store-config";
import { createPostgresPool, getMigrationDatabaseUrl } from "./config";
import { seedDemoAssetLibrary, type DemoAssetSeedResult } from "./demo-asset-seed";

export class PreviewAssetSeedGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PreviewAssetSeedGuardError";
  }
}

export function assertPreviewAssetSeedEnvironment(environment: NodeJS.ProcessEnv): void {
  if (environment.REELAY_DEPLOYMENT_MODE !== "preview" || environment.ALLOW_DEMO_ASSET_SEED !== "true") {
    throw new PreviewAssetSeedGuardError("Preview asset seed requires REELAY_DEPLOYMENT_MODE=preview and ALLOW_DEMO_ASSET_SEED=true.");
  }
  if (!environment.MIGRATION_DATABASE_URL?.trim()) {
    throw new PreviewAssetSeedGuardError("Preview asset seed requires an explicit MIGRATION_DATABASE_URL.");
  }

  let storageUrl: URL;
  let databaseUrl: URL;
  let databaseUser: string;
  try {
    storageUrl = new URL(environment.SUPABASE_URL?.trim() || "");
    databaseUrl = new URL(environment.MIGRATION_DATABASE_URL.trim());
    databaseUser = decodeURIComponent(databaseUrl.username);
  } catch {
    throw new PreviewAssetSeedGuardError("Preview asset seed requires valid Supabase storage and database URLs.");
  }

  const projectRef = /^([a-z0-9]+)\.supabase\.co$/.exec(storageUrl.hostname)?.[1];
  if (!projectRef || storageUrl.protocol !== "https:" || storageUrl.port
    || storageUrl.username || storageUrl.password || storageUrl.pathname !== "/"
    || storageUrl.search || storageUrl.hash) {
    throw new PreviewAssetSeedGuardError("SUPABASE_URL must be the HTTPS origin of a hosted Supabase project.");
  }

  const direct = databaseUrl.hostname === `db.${projectRef}.supabase.co`;
  const session = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(databaseUrl.hostname)
    && databaseUser.endsWith(`.${projectRef}`)
    && databaseUser.length > projectRef.length + 1;
  if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)
    || !databaseUser || !databaseUrl.password || databaseUrl.pathname !== "/postgres"
    || (databaseUrl.port && databaseUrl.port !== "5432") || databaseUrl.hash
    || (!direct && !session)) {
    throw new PreviewAssetSeedGuardError("MIGRATION_DATABASE_URL must use the same Supabase project via direct or session port 5432, with explicit credentials and database postgres.");
  }
  // pg connection-string query values can override the verified host, user or
  // database. Only allow the TLS options already handled by createPostgresPool.
  if ([...databaseUrl.searchParams.keys()].some((key) => !["sslmode", "uselibpqcompat"].includes(key))) {
    throw new PreviewAssetSeedGuardError("MIGRATION_DATABASE_URL must not override connection settings through query parameters.");
  }
}

export async function seedPreviewAssets(): Promise<DemoAssetSeedResult> {
  assertPreviewAssetSeedEnvironment(process.env);
  const objectStore = createSupabaseObjectStore();
  const pool = createPostgresPool(getMigrationDatabaseUrl());
  try {
    return await seedDemoAssetLibrary({
      pool,
      assetStore: new PostgresAssetStore(pool),
      entityStore: new PostgresEntityStore(pool),
      objectStore,
    }, { personalOnly: true });
  } finally {
    await pool.end();
  }
}

export function previewAssetSeedErrorMessage(error: unknown): string {
  if (error instanceof PreviewAssetSeedGuardError) return error.message;
  // Provider and database errors can contain URLs, passwords and request headers.
  return "Preview asset seed failed. Check the deployed schema, private storage configuration and fixture ownership. No account/project seed or migrations were run.";
}
