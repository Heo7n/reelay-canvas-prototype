import { randomBytes } from "node:crypto";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { InMemoryObjectStore } from "../infrastructure/InMemoryObjectStore";
import { PostgresAssetStore } from "../infrastructure/PostgresAssetStore";
import { PostgresEntityStore } from "../infrastructure/PostgresEntityStore";
import { DEFAULT_LOCAL_DATABASE_URL } from "./config";
import {
  DEMO_ASSET_FIXTURES,
  DEMO_ENTITY_FIXTURES,
  seedDemoAssetLibrary,
} from "./demo-asset-seed";
import { runMigrations } from "./migrate";
import { seedDemoDatabase } from "./seed";

const databaseName = `reelay_demo_asset_seed_test_${process.pid}_${randomBytes(4).toString("hex")}`;
const configuredAdminUrl = process.env.TEST_DATABASE_ADMIN_URL ?? DEFAULT_LOCAL_DATABASE_URL;
const adminUrl = new URL(configuredAdminUrl);
adminUrl.pathname = "/postgres";
adminUrl.search = "";
const databaseUrl = new URL(adminUrl);
databaseUrl.pathname = `/${databaseName}`;

let adminPool: Pool;

function createPool(): Pool {
  return new Pool({
    connectionString: databaseUrl.toString(),
    max: 4,
    application_name: "reelay-demo-asset-seed-integration-test",
  });
}

beforeAll(async () => {
  adminPool = new Pool({
    connectionString: adminUrl.toString(),
    max: 1,
    application_name: "reelay-demo-asset-seed-test-admin",
  });
  if (!/^[a-z0-9_]+$/.test(databaseName)) throw new Error("Unsafe test database name.");
  await adminPool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
      END IF;
    END
    $$
  `);
  await adminPool.query(`CREATE DATABASE "${databaseName}"`);

  const setupPool = createPool();
  try {
    await runMigrations(setupPool);
    await seedDemoDatabase(setupPool);
  } finally {
    await setupPool.end();
  }
});

afterAll(async () => {
  if (!adminPool) return;
  await adminPool.query(
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
    [databaseName],
  );
  await adminPool.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
  await adminPool.end();
});

describe("demo asset library seed", () => {
  it("persists the Image 2 fixtures and remains idempotent", async () => {
    const pool = createPool();
    const assetStore = new PostgresAssetStore(pool);
    const entityStore = new PostgresEntityStore(pool);
    const objectStore = new InMemoryObjectStore();
    const dependencies = { assetStore, entityStore, objectStore };

    try {
      const first = await seedDemoAssetLibrary(dependencies);
      const second = await seedDemoAssetLibrary(dependencies);

      expect(first.assets).toHaveLength(DEMO_ASSET_FIXTURES.length);
      expect(first.entities).toHaveLength(DEMO_ENTITY_FIXTURES.length);
      expect(second.assets.map(({ id }) => id)).toEqual(first.assets.map(({ id }) => id));
      expect(second.entities.map(({ id }) => id)).toEqual(first.entities.map(({ id }) => id));

      const personalAssets = await assetStore.listPersonalAssets({
        actorId: "actor-tianmaochao",
        workspaceId: "workspace-organization-reelay",
      });
      const seededAssetIds = new Set(first.assets.map(({ id }) => id));
      expect(personalAssets.filter(({ id }) => seededAssetIds.has(id))).toHaveLength(DEMO_ASSET_FIXTURES.length);

      const projectAssets = await assetStore.listProjectAssets({
        actorId: "actor-tianmaochao",
        projectId: "project-perfume-tvc",
      });
      expect(projectAssets.filter(({ asset }) => seededAssetIds.has(asset.id)))
        .toHaveLength(DEMO_ASSET_FIXTURES.length);

      const personalEntities = await entityStore.listPersonalEntities({
        actorId: "actor-tianmaochao",
        workspaceId: "workspace-organization-reelay",
      });
      const seededEntities = personalEntities.filter(({ name }) =>
        DEMO_ENTITY_FIXTURES.some((fixture) => fixture.name === name));
      expect(seededEntities).toHaveLength(DEMO_ENTITY_FIXTURES.length);
      expect(seededEntities.every(({ mediaRefs }) => mediaRefs.length === 3)).toBe(true);
      expect(seededEntities.every(({ coverMediaId, mediaRefs }) =>
        coverMediaId === mediaRefs[0]?.mediaAssetId)).toBe(true);

      for (const asset of first.assets) {
        await expect(objectStore.headObject(asset.objectKey)).resolves.toEqual(expect.objectContaining({
          objectKey: asset.objectKey,
          checksumSha256: asset.checksumSha256,
        }));
      }

      const counts = await pool.query<{ intents: string; entities: string }>(
        `SELECT
           (SELECT count(*) FROM asset_upload_intents
             WHERE idempotency_key LIKE 'reelay-demo-image2-v1-asset-%')::text AS intents,
           (SELECT count(*) FROM workspace_entities
             WHERE create_idempotency_key LIKE 'reelay-demo-image2-v1-entity-%')::text AS entities`,
      );
      expect(counts.rows[0]).toEqual({
        intents: String(DEMO_ASSET_FIXTURES.length),
        entities: String(DEMO_ENTITY_FIXTURES.length),
      });
    } finally {
      await pool.end();
    }
  });
});
