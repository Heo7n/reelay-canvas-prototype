import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";

import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { InMemoryObjectStore } from "../infrastructure/InMemoryObjectStore";
import { PostgresAssetStore } from "../infrastructure/PostgresAssetStore";
import { PostgresEntityStore } from "../infrastructure/PostgresEntityStore";
import { DEFAULT_LOCAL_DATABASE_URL } from "./config";
import {
  DEMO_ASSET_FIXTURES,
  DEMO_ENTITY_FIXTURES,
  DemoAssetFixtureConflictError,
  LEGACY_DEMO_ASSET_FIXTURES,
  LEGACY_DEMO_ENTITY_FIXTURES,
  PREVIOUS_DEMO_ASSET_FIXTURES,
  PREVIOUS_DEMO_ENTITY_FIXTURES,
  resolveDemoAssetFixtures,
  seedDemoAssetLibrary,
} from "./demo-asset-seed";
import {
  DEMO_ACTOR_ID,
  DEMO_PROJECT_ID,
  DEMO_WORKSPACE_ID,
  demoAssetIdempotencyKey,
  legacyDemoAssetIdempotencyKey,
  previousDemoAssetIdempotencyKey,
  type DemoAssetFixture,
  type DemoEntityFixture,
} from "./demo-asset-fixtures";
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

interface SeededHistoricalLibrary {
  assetIdsByKey: Map<string, string>;
  entityIdsByCreateKey: Map<string, string>;
}

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

beforeEach(async () => {
  const pool = createPool();
  try {
    await pool.query(`
      TRUNCATE TABLE
        entity_personal_media_bindings,
        entity_placements,
        entity_media_references,
        workspace_entities,
        project_asset_references,
        media_asset_placements,
        asset_upload_intents,
        workspace_media_assets
    `);
  } finally {
    await pool.end();
  }
});

function fixtureUrl(fileName: string): URL {
  return new URL(`../../../assets/home/${fileName}`, import.meta.url);
}

async function seedHistoricalDemoAssetLibrary(
  pool: Pool,
  objectStore: InMemoryObjectStore,
  assetFixtures: readonly DemoAssetFixture[],
  entityFixtures: readonly DemoEntityFixture[],
  idempotencyKeyFor: (fixture: DemoAssetFixture) => string,
): Promise<SeededHistoricalLibrary> {
  const assetStore = new PostgresAssetStore(pool);
  const entityStore = new PostgresEntityStore(pool);
  const resolvedAssets = await resolveDemoAssetFixtures(
    assetFixtures,
    idempotencyKeyFor,
  );
  const assetIdsByKey = new Map<string, string>();
  for (const fixture of resolvedAssets) {
    const body = await readFile(fixtureUrl(fixture.fileName));
    const intent = await assetStore.createUploadIntent({
      actorId: DEMO_ACTOR_ID,
      workspaceId: DEMO_WORKSPACE_ID,
      idempotencyKey: fixture.idempotencyKey,
      mediaKind: fixture.mediaKind,
      displayName: fixture.displayName,
      contentType: fixture.contentType,
      byteSize: fixture.byteSize,
      checksumSha256: fixture.checksumSha256,
    });
    const stored = await objectStore.putObject({
      objectKey: intent.objectKey,
      contentType: fixture.contentType,
      body,
    });
    await assetStore.recordUpload({
      actorId: DEMO_ACTOR_ID,
      workspaceId: DEMO_WORKSPACE_ID,
      uploadIntentId: intent.id,
      objectKey: stored.objectKey,
      contentType: stored.contentType,
      byteSize: stored.byteSize,
      checksumSha256: stored.checksumSha256,
      etag: stored.etag,
    });
    const asset = await assetStore.finalizeUpload({
      actorId: DEMO_ACTOR_ID,
      workspaceId: DEMO_WORKSPACE_ID,
      uploadIntentId: intent.id,
    });
    await assetStore.attachAssetToProject({
      actorId: DEMO_ACTOR_ID,
      projectId: DEMO_PROJECT_ID,
      assetId: asset.id,
    });
    assetIdsByKey.set(fixture.key, asset.id);
  }

  const entityIdsByCreateKey = new Map<string, string>();
  for (const fixture of entityFixtures) {
    const mediaAssetIds = fixture.assetKeys.map((key) => {
      const assetId = assetIdsByKey.get(key);
      if (!assetId) throw new Error(`Legacy test fixture references an unavailable asset: ${key}.`);
      return assetId;
    });
    const coverMediaId = assetIdsByKey.get(fixture.coverAssetKey);
    if (!coverMediaId) throw new Error(`Legacy test fixture cover is unavailable: ${fixture.coverAssetKey}.`);
    const entity = await entityStore.createPersonalEntity({
      actorId: DEMO_ACTOR_ID,
      workspaceId: DEMO_WORKSPACE_ID,
      idempotencyKey: fixture.createIdempotencyKey,
      name: fixture.name,
      description: fixture.description,
      mediaAssetIds,
      coverMediaId,
    });
    entityIdsByCreateKey.set(fixture.createIdempotencyKey, entity.id);
  }
  return { assetIdsByKey, entityIdsByCreateKey };
}

function seedLegacyDemoAssetLibrary(
  pool: Pool,
  objectStore: InMemoryObjectStore,
): Promise<SeededHistoricalLibrary> {
  return seedHistoricalDemoAssetLibrary(
    pool,
    objectStore,
    LEGACY_DEMO_ASSET_FIXTURES,
    LEGACY_DEMO_ENTITY_FIXTURES,
    legacyDemoAssetIdempotencyKey,
  );
}

function seedPreviousDemoAssetLibrary(
  pool: Pool,
  objectStore: InMemoryObjectStore,
): Promise<SeededHistoricalLibrary> {
  return seedHistoricalDemoAssetLibrary(
    pool,
    objectStore,
    PREVIOUS_DEMO_ASSET_FIXTURES,
    PREVIOUS_DEMO_ENTITY_FIXTURES,
    previousDemoAssetIdempotencyKey,
  );
}

async function readDemoEntityRows(pool: Pool) {
  return pool.query<{
    id: string;
    name: string;
    version: number;
    create_idempotency_key: string;
  }>(
    `SELECT id, name, version, create_idempotency_key
     FROM workspace_entities
     WHERE workspace_id = $1
       AND created_by_user_id = $2
       AND create_idempotency_key = ANY($3::text[])
     ORDER BY create_idempotency_key`,
    [DEMO_WORKSPACE_ID, DEMO_ACTOR_ID, DEMO_ENTITY_FIXTURES.map(({ createIdempotencyKey }) => createIdempotencyKey)],
  );
}

function expectCanonicalEntityContents(
  seeded: Awaited<ReturnType<typeof seedDemoAssetLibrary>>,
): void {
  const assetsByKey = new Map(
    DEMO_ASSET_FIXTURES.map((fixture, index) => [fixture.key, seeded.assets[index]!] as const),
  );
  const assetsById = new Map(seeded.assets.map((asset) => [asset.id, asset]));

  for (const fixture of DEMO_ENTITY_FIXTURES) {
    const entity = seeded.entities.find(({ name }) => name === fixture.name);
    const expectedMediaIds = fixture.assetKeys.map((key) => assetsByKey.get(key)?.id);
    expect(entity?.description).toBe(fixture.description);
    expect(entity?.mediaRefs.map(({ mediaAssetId, order }) => ({ mediaAssetId, order }))).toEqual(
      expectedMediaIds.map((mediaAssetId, order) => ({ mediaAssetId, order })),
    );
    expect(entity?.coverMediaId).toBe(assetsByKey.get(fixture.coverAssetKey)?.id);
    expect(entity?.mediaRefs.map(({ mediaAssetId }) => assetsById.get(mediaAssetId)?.mediaKind))
      .toEqual(fixture.assetKeys.map((key) => (
        DEMO_ASSET_FIXTURES.find((assetFixture) => assetFixture.key === key)?.mediaKind
      )));
    expect(entity?.mediaRefs.filter(({ mediaAssetId }) =>
      assetsById.get(mediaAssetId)?.mediaKind === "audio")).toHaveLength(1);
  }
}

describe("demo asset library seed", () => {
  it("persists the static prototype fixtures on a fresh database and remains idempotent", async () => {
    const pool = createPool();
    const assetStore = new PostgresAssetStore(pool);
    const entityStore = new PostgresEntityStore(pool);
    const objectStore = new InMemoryObjectStore();
    const dependencies = { pool, assetStore, entityStore, objectStore };

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
      expect(seededEntities.map(({ mediaRefs }) => mediaRefs.length).sort()).toEqual(
        DEMO_ENTITY_FIXTURES.map(({ assetKeys }) => assetKeys.length).sort(),
      );
      expectCanonicalEntityContents(first);

      for (const [index, asset] of first.assets.entries()) {
        const fixture = DEMO_ASSET_FIXTURES[index];
        await expect(objectStore.headObject(asset.objectKey)).resolves.toEqual(expect.objectContaining({
          objectKey: asset.objectKey,
          contentType: fixture?.contentType,
          checksumSha256: asset.checksumSha256,
        }));
      }

      const counts = await pool.query<{ intents: string; entities: string }>(
        `SELECT
           (SELECT count(*) FROM asset_upload_intents
             WHERE idempotency_key = ANY($1::text[]))::text AS intents,
           (SELECT count(*) FROM workspace_entities
             WHERE create_idempotency_key = ANY($2::text[]))::text AS entities`,
        [
          DEMO_ASSET_FIXTURES.map(demoAssetIdempotencyKey),
          DEMO_ENTITY_FIXTURES.map(({ createIdempotencyKey }) => createIdempotencyKey),
        ],
      );
      expect(counts.rows[0]).toEqual({
        intents: String(DEMO_ASSET_FIXTURES.length),
        entities: String(DEMO_ENTITY_FIXTURES.length),
      });
    } finally {
      await pool.end();
    }
  });

  it("calibrates pristine legacy fixtures in place, preserves Entity placements, and retires only their catalog links", async () => {
    const pool = createPool();
    const objectStore = new InMemoryObjectStore();
    const assetStore = new PostgresAssetStore(pool);
    const entityStore = new PostgresEntityStore(pool);
    const dependencies = { pool, assetStore, entityStore, objectStore };
    try {
      const legacy = await seedLegacyDemoAssetLibrary(pool, objectStore);
      const placementsBefore = await pool.query<{ id: string; entity_id: string }>(
        `SELECT id, entity_id FROM entity_placements
         WHERE workspace_id = $1 AND owner_user_id = $2 ORDER BY entity_id`,
        [DEMO_WORKSPACE_ID, DEMO_ACTOR_ID],
      );

      const first = await seedDemoAssetLibrary(dependencies);
      const rowsAfterFirst = await readDemoEntityRows(pool);
      const second = await seedDemoAssetLibrary(dependencies);
      const rowsAfterSecond = await readDemoEntityRows(pool);

      expect(rowsAfterFirst.rows).toHaveLength(DEMO_ENTITY_FIXTURES.length);
      expect(rowsAfterFirst.rows.map(({ id }) => id).sort()).toEqual(
        [...legacy.entityIdsByCreateKey.values()].sort(),
      );
      expect(rowsAfterFirst.rows.map(({ name }) => name).sort()).toEqual(
        DEMO_ENTITY_FIXTURES.map(({ name }) => name).sort(),
      );
      expect(rowsAfterFirst.rows.every(({ version }) => version === 2)).toBe(true);
      expect(rowsAfterSecond.rows).toEqual(rowsAfterFirst.rows);
      expect(second.entities.map(({ id }) => id)).toEqual(first.entities.map(({ id }) => id));

      expectCanonicalEntityContents(first);
      const bindings = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM entity_personal_media_bindings AS binding
         JOIN workspace_entities AS entity
           ON entity.workspace_id = binding.workspace_id
          AND entity.id = binding.entity_id
         WHERE entity.create_idempotency_key = ANY($1::text[])`,
        [DEMO_ENTITY_FIXTURES.map(({ createIdempotencyKey }) => createIdempotencyKey)],
      );
      expect(bindings.rows[0]?.count).toBe(String(
        DEMO_ENTITY_FIXTURES.reduce((total, fixture) => total + fixture.assetKeys.length, 0),
      ));

      const placementsAfter = await pool.query<{ id: string; entity_id: string }>(
        `SELECT id, entity_id FROM entity_placements
         WHERE workspace_id = $1 AND owner_user_id = $2 ORDER BY entity_id`,
        [DEMO_WORKSPACE_ID, DEMO_ACTOR_ID],
      );
      expect(placementsAfter.rows).toEqual(placementsBefore.rows);

      const personalAssets = await assetStore.listPersonalAssets({
        actorId: DEMO_ACTOR_ID,
        workspaceId: DEMO_WORKSPACE_ID,
      });
      const projectAssets = await assetStore.listProjectAssets({
        actorId: DEMO_ACTOR_ID,
        projectId: DEMO_PROJECT_ID,
      });
      expect(personalAssets.map(({ id }) => id).sort()).toEqual(first.assets.map(({ id }) => id).sort());
      expect(projectAssets.map(({ asset }) => asset.id).sort()).toEqual(first.assets.map(({ id }) => id).sort());

      const underlying = await pool.query<{ assets: string; entities: string; legacy_placements: string }>(
        `SELECT
           (SELECT count(*) FROM workspace_media_assets)::text AS assets,
           (SELECT count(*) FROM workspace_entities
             WHERE create_idempotency_key = ANY($1::text[]))::text AS entities,
           (SELECT count(*)
              FROM media_asset_placements
             WHERE asset_id = ANY($2::text[]))::text AS legacy_placements`,
        [
          DEMO_ENTITY_FIXTURES.map(({ createIdempotencyKey }) => createIdempotencyKey),
          [...legacy.assetIdsByKey.values()],
        ],
      );
      expect(underlying.rows[0]).toEqual({
        assets: String(LEGACY_DEMO_ASSET_FIXTURES.length + DEMO_ASSET_FIXTURES.length),
        entities: String(DEMO_ENTITY_FIXTURES.length),
        legacy_placements: "0",
      });
      for (const assetId of legacy.assetIdsByKey.values()) {
        const asset = await pool.query<{ object_key: string }>(
          "SELECT object_key FROM workspace_media_assets WHERE id = $1",
          [assetId],
        );
        await expect(objectStore.headObject(asset.rows[0]!.object_key)).resolves.toBeTruthy();
      }
    } finally {
      await pool.end();
    }
  });

  it("upgrades pristine v2 fixtures to v3 in place with audio while preserving Entity identities and placements", async () => {
    const pool = createPool();
    const objectStore = new InMemoryObjectStore();
    const assetStore = new PostgresAssetStore(pool);
    const entityStore = new PostgresEntityStore(pool);
    const dependencies = { pool, assetStore, entityStore, objectStore };
    try {
      const previous = await seedPreviousDemoAssetLibrary(pool, objectStore);
      const rowsBefore = await readDemoEntityRows(pool);
      const placementsBefore = await pool.query<{ id: string; entity_id: string }>(
        `SELECT id, entity_id FROM entity_placements
         WHERE workspace_id = $1 AND owner_user_id = $2 ORDER BY entity_id`,
        [DEMO_WORKSPACE_ID, DEMO_ACTOR_ID],
      );

      const first = await seedDemoAssetLibrary(dependencies);
      const rowsAfterFirst = await readDemoEntityRows(pool);
      const second = await seedDemoAssetLibrary(dependencies);
      const rowsAfterSecond = await readDemoEntityRows(pool);

      expect(rowsBefore.rows).toHaveLength(PREVIOUS_DEMO_ENTITY_FIXTURES.length);
      expect(rowsAfterFirst.rows).toHaveLength(DEMO_ENTITY_FIXTURES.length);
      expect(rowsAfterFirst.rows.map(({ id }) => id).sort()).toEqual(
        [...previous.entityIdsByCreateKey.values()].sort(),
      );
      const versionsBeforeByCreateKey = new Map(
        rowsBefore.rows.map(({ create_idempotency_key, version }) => [create_idempotency_key, version]),
      );
      for (const row of rowsAfterFirst.rows) {
        expect(row.version).toBe(versionsBeforeByCreateKey.get(row.create_idempotency_key)! + 1);
      }
      expect(rowsAfterSecond.rows).toEqual(rowsAfterFirst.rows);
      expect(second.entities.map(({ id }) => id)).toEqual(first.entities.map(({ id }) => id));
      expectCanonicalEntityContents(first);

      const placementsAfter = await pool.query<{ id: string; entity_id: string }>(
        `SELECT id, entity_id FROM entity_placements
         WHERE workspace_id = $1 AND owner_user_id = $2 ORDER BY entity_id`,
        [DEMO_WORKSPACE_ID, DEMO_ACTOR_ID],
      );
      expect(placementsAfter.rows).toEqual(placementsBefore.rows);

      const bindings = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM entity_personal_media_bindings AS binding
         JOIN workspace_entities AS entity
           ON entity.workspace_id = binding.workspace_id
          AND entity.id = binding.entity_id
         WHERE entity.create_idempotency_key = ANY($1::text[])`,
        [DEMO_ENTITY_FIXTURES.map(({ createIdempotencyKey }) => createIdempotencyKey)],
      );
      expect(bindings.rows[0]?.count).toBe(String(
        DEMO_ENTITY_FIXTURES.reduce((total, fixture) => total + fixture.assetKeys.length, 0),
      ));

      const personalAssets = await assetStore.listPersonalAssets({
        actorId: DEMO_ACTOR_ID,
        workspaceId: DEMO_WORKSPACE_ID,
      });
      const projectAssets = await assetStore.listProjectAssets({
        actorId: DEMO_ACTOR_ID,
        projectId: DEMO_PROJECT_ID,
      });
      expect(personalAssets.map(({ id }) => id).sort()).toEqual(first.assets.map(({ id }) => id).sort());
      expect(projectAssets.map(({ asset }) => asset.id).sort()).toEqual(first.assets.map(({ id }) => id).sort());

      const previousAssetIds = [...previous.assetIdsByKey.values()];
      const historicalLinks = await pool.query<{ placements: string; project_references: string; assets: string }>(
        `SELECT
           (SELECT count(*) FROM media_asset_placements
             WHERE asset_id = ANY($1::text[]))::text AS placements,
           (SELECT count(*) FROM project_asset_references
             WHERE asset_id = ANY($1::text[]))::text AS project_references,
           (SELECT count(*) FROM workspace_media_assets
             WHERE id = ANY($1::text[]))::text AS assets`,
        [previousAssetIds],
      );
      expect(historicalLinks.rows[0]).toEqual({
        placements: "0",
        project_references: "0",
        assets: String(PREVIOUS_DEMO_ASSET_FIXTURES.length),
      });
      for (const assetId of previousAssetIds) {
        const asset = await pool.query<{ object_key: string }>(
          "SELECT object_key FROM workspace_media_assets WHERE id = $1",
          [assetId],
        );
        await expect(objectStore.headObject(asset.rows[0]!.object_key)).resolves.toBeTruthy();
      }
    } finally {
      await pool.end();
    }
  });

  it("fails closed before creating canonical media when a legacy Entity was edited", async () => {
    const pool = createPool();
    const objectStore = new InMemoryObjectStore();
    const assetStore = new PostgresAssetStore(pool);
    const entityStore = new PostgresEntityStore(pool);
    try {
      const legacy = await seedLegacyDemoAssetLibrary(pool, objectStore);
      const firstFixture = LEGACY_DEMO_ENTITY_FIXTURES[0];
      const entityId = legacy.entityIdsByCreateKey.get(firstFixture.createIdempotencyKey)!;
      const current = await entityStore.getPersonalEntity({
        actorId: DEMO_ACTOR_ID,
        workspaceId: DEMO_WORKSPACE_ID,
        entityId,
      });
      if (!current) throw new Error("Expected the legacy Entity to exist.");
      await entityStore.updatePersonalEntity({
        actorId: DEMO_ACTOR_ID,
        workspaceId: DEMO_WORKSPACE_ID,
        entityId,
        expectedVersion: current.version,
        name: "用户修改后的主体",
        description: current.description,
        mediaAssetIds: current.mediaRefs.map(({ mediaAssetId }) => mediaAssetId),
        coverMediaId: current.coverMediaId,
      });

      await expect(seedDemoAssetLibrary({ pool, assetStore, entityStore, objectStore }))
        .rejects.toBeInstanceOf(DemoAssetFixtureConflictError);

      const canonicalIntents = await pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM asset_upload_intents WHERE idempotency_key = ANY($1::text[])",
        [DEMO_ASSET_FIXTURES.map(demoAssetIdempotencyKey)],
      );
      expect(canonicalIntents.rows[0]?.count).toBe("0");
      const entityRows = await readDemoEntityRows(pool);
      expect(entityRows.rows).toHaveLength(DEMO_ENTITY_FIXTURES.length);
      expect(entityRows.rows.find(({ id }) => id === entityId)).toEqual(expect.objectContaining({
        name: "用户修改后的主体",
        version: 2,
      }));
    } finally {
      await pool.end();
    }
  });

  it("fails closed before creating v3 media when a previous v2 Entity was edited", async () => {
    const pool = createPool();
    const objectStore = new InMemoryObjectStore();
    const assetStore = new PostgresAssetStore(pool);
    const entityStore = new PostgresEntityStore(pool);
    try {
      const previous = await seedPreviousDemoAssetLibrary(pool, objectStore);
      const firstFixture = PREVIOUS_DEMO_ENTITY_FIXTURES[0];
      const entityId = previous.entityIdsByCreateKey.get(firstFixture.createIdempotencyKey)!;
      const current = await entityStore.getPersonalEntity({
        actorId: DEMO_ACTOR_ID,
        workspaceId: DEMO_WORKSPACE_ID,
        entityId,
      });
      if (!current) throw new Error("Expected the previous v2 Entity to exist.");
      await entityStore.updatePersonalEntity({
        actorId: DEMO_ACTOR_ID,
        workspaceId: DEMO_WORKSPACE_ID,
        entityId,
        expectedVersion: current.version,
        name: "用户修改后的 v2 主体",
        description: current.description,
        mediaAssetIds: current.mediaRefs.map(({ mediaAssetId }) => mediaAssetId),
        coverMediaId: current.coverMediaId,
      });

      await expect(seedDemoAssetLibrary({ pool, assetStore, entityStore, objectStore }))
        .rejects.toBeInstanceOf(DemoAssetFixtureConflictError);

      const canonicalIntents = await pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM asset_upload_intents WHERE idempotency_key = ANY($1::text[])",
        [DEMO_ASSET_FIXTURES.map(demoAssetIdempotencyKey)],
      );
      expect(canonicalIntents.rows[0]?.count).toBe("0");
      const entityRows = await readDemoEntityRows(pool);
      expect(entityRows.rows.find(({ id }) => id === entityId)).toEqual(expect.objectContaining({
        name: "用户修改后的 v2 主体",
        version: current.version + 1,
      }));
    } finally {
      await pool.end();
    }
  });

  it("keeps a legacy asset visible and stored when another personal Entity still references it", async () => {
    const pool = createPool();
    const objectStore = new InMemoryObjectStore();
    const assetStore = new PostgresAssetStore(pool);
    const entityStore = new PostgresEntityStore(pool);
    try {
      const legacy = await seedLegacyDemoAssetLibrary(pool, objectStore);
      const protectedAssetId = legacy.assetIdsByKey.get(LEGACY_DEMO_ASSET_FIXTURES[0].key)!;
      const projectProtectedAssetId = legacy.assetIdsByKey.get(LEGACY_DEMO_ASSET_FIXTURES[1].key)!;
      await entityStore.createPersonalEntity({
        actorId: DEMO_ACTOR_ID,
        workspaceId: DEMO_WORKSPACE_ID,
        idempotencyKey: "user-entity-preserving-a-legacy-demo-asset",
        name: "用户保留主体",
        description: "引用旧演示素材",
        mediaAssetIds: [protectedAssetId],
        coverMediaId: protectedAssetId,
      });
      await assetStore.attachAssetToProject({
        actorId: DEMO_ACTOR_ID,
        projectId: "project-scifi-trailer",
        assetId: projectProtectedAssetId,
      });

      await seedDemoAssetLibrary({ pool, assetStore, entityStore, objectStore });

      const retained = await pool.query<{ placements: string; project_references: string; assets: string }>(
        `SELECT
           (SELECT count(*) FROM media_asset_placements WHERE asset_id = $1)::text AS placements,
           (SELECT count(*) FROM project_asset_references WHERE asset_id = $1)::text AS project_references,
           (SELECT count(*) FROM workspace_media_assets WHERE id = $1)::text AS assets`,
        [protectedAssetId],
      );
      expect(retained.rows[0]).toEqual({ placements: "1", project_references: "1", assets: "1" });
      const projectRetained = await pool.query<{ placements: string; project_references: string; assets: string }>(
        `SELECT
           (SELECT count(*) FROM media_asset_placements WHERE asset_id = $1)::text AS placements,
           (SELECT count(*) FROM project_asset_references WHERE asset_id = $1)::text AS project_references,
           (SELECT count(*) FROM workspace_media_assets WHERE id = $1)::text AS assets`,
        [projectProtectedAssetId],
      );
      expect(projectRetained.rows[0]).toEqual({ placements: "1", project_references: "2", assets: "1" });
      const unreferencedLegacyIds = [...legacy.assetIdsByKey.values()].filter(
        (id) => id !== protectedAssetId && id !== projectProtectedAssetId,
      );
      const hidden = await pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM media_asset_placements WHERE asset_id = ANY($1::text[])",
        [unreferencedLegacyIds],
      );
      expect(hidden.rows[0]?.count).toBe("0");
    } finally {
      await pool.end();
    }
  });
});
