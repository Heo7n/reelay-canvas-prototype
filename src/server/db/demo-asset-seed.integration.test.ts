import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";

import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { DEMO_ASSET_TAG_IDS } from "../../config/demo-asset-tags";
import { DEMO_LIBRARY_DIRECTORY_EXAMPLE } from "../../config/media-library-directory-example";
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
  V3_DEMO_ASSET_FIXTURES,
  V3_DEMO_ENTITY_FIXTURES,
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
  v3DemoAssetIdempotencyKey,
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
        media_library_folders,
        media_library_tags,
        entity_library_deletions,
        entity_personal_media_bindings,
        entity_placements,
        entity_media_references,
        workspace_entities,
        project_asset_references,
        media_asset_placements,
        asset_upload_intents,
        workspace_media_assets,
        media_storage_accounts
    `);
    await pool.query("DELETE FROM canvas_documents WHERE canvas_id = 'fixture-retention-test'");
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
      assetsById.get(mediaAssetId)?.mediaKind === "audio")).toHaveLength(0);
  }
}

describe("demo asset library seed", () => {
  it("labels canonical media on creation and preserves removed or customized labels on replay", async () => {
    const pool = createPool();
    const assetStore = new PostgresAssetStore(pool);
    const dependencies = { pool, assetStore, entityStore: new PostgresEntityStore(pool), objectStore: new InMemoryObjectStore() };
    const context = { actorId: DEMO_ACTOR_ID, workspaceId: DEMO_WORKSPACE_ID };
    try {
      const seeded = await seedDemoAssetLibrary(dependencies, { personalOnly: true });
      const initial = await assetStore.listLibrary(context);
      expect(Object.keys(DEMO_ASSET_TAG_IDS).sort()).toEqual(DEMO_ASSET_FIXTURES.map(({ key }) => key).sort());
      for (const [index, fixture] of DEMO_ASSET_FIXTURES.entries()) {
        expect(initial.entries.find(({ assetId }) => assetId === seeded.assets[index].id)?.tagIds)
          .toEqual(DEMO_ASSET_TAG_IDS[fixture.key]);
      }
      expect(initial.entries.filter(({ tagIds }) => tagIds.includes("builtin:character"))).toHaveLength(8);
      expect(initial.entries.filter(({ tagIds }) => tagIds.includes("builtin:object"))).toHaveLength(4);

      const equipmentIndex = DEMO_ASSET_FIXTURES.findIndex(({ key }) => key === DEMO_LIBRARY_DIRECTORY_EXAMPLE.assetKey);
      await assetStore.updateLibraryTags({ ...context, space: "personal", operation: "remove", tagIds: ["builtin:object"],
        items: [{ kind: "media", id: seeded.assets[equipmentIndex].id }] });
      const customTag = await assetStore.createLibraryTag({ ...context, space: "personal", name: "已选定" });
      await assetStore.updateLibraryTags({ ...context, space: "personal", operation: "add", tagIds: [customTag.id],
        items: [{ kind: "media", id: seeded.assets[0].id }] });
      const customized = await assetStore.listLibrary(context);
      await seedDemoAssetLibrary(dependencies, { personalOnly: true, withDirectoryExample: true });
      expect(await assetStore.listLibrary(context)).toEqual(customized);
      expect(customized.folders).toHaveLength(0);
    } finally { await pool.end(); }
  });

  it("opts into exactly one reusable five-level directory example and preserves later user placement changes", async () => {
    const pool = createPool();
    const assetStore = new PostgresAssetStore(pool);
    const dependencies = { pool, assetStore, entityStore: new PostgresEntityStore(pool), objectStore: new InMemoryObjectStore() };
    const context = { actorId: DEMO_ACTOR_ID, workspaceId: DEMO_WORKSPACE_ID };
    try {
      const seeded = await seedDemoAssetLibrary(dependencies);
      expect((await assetStore.listLibrary(context)).folders).toHaveLength(0);
      const fixtureIndex = DEMO_ASSET_FIXTURES.findIndex(({ key }) => key === DEMO_LIBRARY_DIRECTORY_EXAMPLE.assetKey);
      const sample = seeded.assets[fixtureIndex];
      const firstFolder = await assetStore.createLibraryFolder({ ...context, space: "personal", parentId: null, name: DEMO_LIBRARY_DIRECTORY_EXAMPLE.path[0] });
      await seedDemoAssetLibrary(dependencies, { withDirectoryExample: true });
      const example = await assetStore.listLibrary(context);
      expect(example.folders).toHaveLength(4);
      expect(example.tags).toHaveLength(0);
      let parentId: string | null = null;
      for (const name of DEMO_LIBRARY_DIRECTORY_EXAMPLE.path) {
        const folder = example.folders.find((candidate) => candidate.parentId === parentId && candidate.name === name);
        expect(folder).toBeDefined();
        if (parentId === null) expect(folder?.id).toBe(firstFolder.id);
        parentId = folder!.id;
      }
      const entry = example.entries.find(({ assetId }) => assetId === sample.id);
      expect(entry).toMatchObject({ folderId: parentId, displayName: DEMO_LIBRARY_DIRECTORY_EXAMPLE.displayName, tagIds: [DEMO_LIBRARY_DIRECTORY_EXAMPLE.builtinTagId] });
      expect(example.entries.filter(({ folderId }) => folderId !== null)).toHaveLength(1);
      expect(example.entityEntries).toEqual(seeded.entities.map((entity) => ({ entityId: entity.id, space: "personal", folderId: null, addedAt: entity.createdAt, tagIds: ["builtin:character"] })).sort((left, right) => left.entityId.localeCompare(right.entityId)));
      await seedDemoAssetLibrary(dependencies, { withDirectoryExample: true });
      expect(await assetStore.listLibrary(context)).toEqual(example);
      expect((await assetStore.listProjectAssets({ actorId: DEMO_ACTOR_ID, projectId: DEMO_PROJECT_ID })).find(({ asset }) => asset.id === sample.id)?.asset.displayName).toBe(DEMO_ASSET_FIXTURES[fixtureIndex].displayName);
      await assetStore.saveLibrary({ ...context, projectId: DEMO_PROJECT_ID, space: "personal", folderId: null, tagIds: [], items: [{ assetId: sample.id, displayName: "用户的收藏", action: "move", expectedFolderId: parentId }] });
      const customized = await assetStore.listLibrary(context);
      await assetStore.updateLibraryTags({ ...context, space: "personal", operation: "remove", tagIds: ["builtin:character"], items: seeded.entities.map((entity) => ({ kind: "entity", id: entity.id })) });
      customized.entityEntries = customized.entityEntries?.map((entry) => ({ ...entry, tagIds: [] }));
      await seedDemoAssetLibrary(dependencies, { withDirectoryExample: true });
      expect(await assetStore.listLibrary(context)).toEqual(customized);
    } finally { await pool.end(); }
  });

  it("does not add example folders or relocate a previously customized demo asset", async () => {
    const pool = createPool();
    const assetStore = new PostgresAssetStore(pool);
    const dependencies = { pool, assetStore, entityStore: new PostgresEntityStore(pool), objectStore: new InMemoryObjectStore() };
    const context = { actorId: DEMO_ACTOR_ID, workspaceId: DEMO_WORKSPACE_ID };
    try {
      const seeded = await seedDemoAssetLibrary(dependencies, { personalOnly: true });
      const index = DEMO_ASSET_FIXTURES.findIndex(({ key }) => key === DEMO_LIBRARY_DIRECTORY_EXAMPLE.assetKey);
      await assetStore.renamePersonalAsset({ ...context, assetId: seeded.assets[index].id, displayName: "用户已编辑的名称" });
      const before = await assetStore.listLibrary(context);
      await seedDemoAssetLibrary(dependencies, { personalOnly: true, withDirectoryExample: true });
      expect(await assetStore.listLibrary(context)).toEqual(before);
      expect(before.folders).toHaveLength(0);
      expect(before.tags).toHaveLength(0);
      expect(await assetStore.listProjectAssets({ actorId: DEMO_ACTOR_ID, projectId: DEMO_PROJECT_ID })).toHaveLength(0);
    } finally { await pool.end(); }
  });

  it.each([false, true])("seeds a personal-only catalog idempotently without changing projects or accounts (historical catalog: %s)", async (withHistoricalCatalog) => {
    const pool = createPool();
    const assetStore = new PostgresAssetStore(pool);
    const entityStore = new PostgresEntityStore(pool);
    const objectStore = new InMemoryObjectStore();
    const dependencies = { pool, assetStore, entityStore, objectStore };
    const preservedTables = [
      "users", "password_identities", "sessions", "workspaces", "memberships",
      "projects", "project_memberships", "canvas_documents", "project_asset_references",
    ];
    const readPreservedState = () => Promise.all(preservedTables.map(async (table) => {
      const result = await pool.query(`SELECT to_jsonb(record) AS content FROM ${table} AS record ORDER BY to_jsonb(record)::text`);
      return result.rows;
    }));

    try {
      const historical = withHistoricalCatalog ? await seedLegacyDemoAssetLibrary(pool, objectStore) : null;
      if (historical) {
        await assetStore.attachAssetToProject({
          actorId: DEMO_ACTOR_ID,
          projectId: "project-scifi-trailer",
          assetId: [...historical.assetIdsByKey.values()][0]!,
        });
      }
      const originalCanvas = { nodes: [{ id: "existing-user-node", prompt: "保留用户画布" }] };
      await pool.query(
        `INSERT INTO canvas_documents (project_id, canvas_id, schema_version, revision, content,
           created_by_user_id, updated_by_user_id)
         VALUES ($1, 'fixture-retention-test', 1, 7, $2::jsonb, $3, $3)`,
        [DEMO_PROJECT_ID, JSON.stringify(originalCanvas), DEMO_ACTOR_ID],
      );
      const before = await readPreservedState();
      const first = await seedDemoAssetLibrary(dependencies, { personalOnly: true });
      expect(await readPreservedState()).toEqual(before);
      const second = await seedDemoAssetLibrary(dependencies, { personalOnly: true });
      expect(await readPreservedState()).toEqual(before);

      expect(first.assets).toHaveLength(12);
      expect(first.entities).toHaveLength(3);
      expect(second).toEqual(first);
      expectCanonicalEntityContents(first);
      const personalAssets = await assetStore.listPersonalAssets({ actorId: DEMO_ACTOR_ID, workspaceId: DEMO_WORKSPACE_ID });
      expect(personalAssets.map(({ id }) => id).sort()).toEqual([
        ...first.assets.map(({ id }) => id),
        ...(historical ? [...historical.assetIdsByKey.values()] : []),
      ].sort());
      expect(await entityStore.listPersonalEntities({ actorId: DEMO_ACTOR_ID, workspaceId: DEMO_WORKSPACE_ID }))
        .toHaveLength(3);
      for (const asset of first.assets) {
        await expect(objectStore.headObject(asset.objectKey)).resolves.toEqual(expect.objectContaining({
          byteSize: asset.byteSize,
          checksumSha256: asset.checksumSha256,
        }));
      }
    } finally {
      await pool.end();
    }
  });

  it("persists the static prototype fixtures on a fresh database and remains idempotent", async () => {
    const pool = createPool();
    const assetStore = new PostgresAssetStore(pool);
    const entityStore = new PostgresEntityStore(pool);
    const objectStore = new InMemoryObjectStore();
    const dependencies = { pool, assetStore, entityStore, objectStore };

    try {
      const first = await seedDemoAssetLibrary(dependencies);
      const second = await seedDemoAssetLibrary(dependencies);

      expect(first.assets).toHaveLength(12);
      expect(first.entities).toHaveLength(3);
      expect(first.entities.map(({ mediaRefs }) => mediaRefs.length)).toEqual([5, 3, 4]);
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
      expect(rowsAfterFirst.rows.filter(({ create_idempotency_key }) =>
        legacy.entityIdsByCreateKey.has(create_idempotency_key)).map(({ id }) => id).sort()).toEqual(
        [...legacy.entityIdsByCreateKey.values()].sort(),
      );
      expect(rowsAfterFirst.rows.map(({ name }) => name).sort()).toEqual(
        DEMO_ENTITY_FIXTURES.map(({ name }) => name).sort(),
      );
      for (const row of rowsAfterFirst.rows) {
        expect(row.version).toBe(legacy.entityIdsByCreateKey.has(row.create_idempotency_key) ? 2 : 1);
      }
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
      expect(placementsAfter.rows.filter(({ entity_id }) =>
        [...legacy.entityIdsByCreateKey.values()].includes(entity_id))).toEqual(placementsBefore.rows);
      expect(placementsAfter.rows).toHaveLength(3);

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

  it.each([
    { generation: "v2", assets: PREVIOUS_DEMO_ASSET_FIXTURES, entities: PREVIOUS_DEMO_ENTITY_FIXTURES, keyFor: previousDemoAssetIdempotencyKey, entityVersion: 1 },
    { generation: "v3", assets: V3_DEMO_ASSET_FIXTURES, entities: V3_DEMO_ENTITY_FIXTURES, keyFor: v3DemoAssetIdempotencyKey, entityVersion: 1 },
    { generation: "v3", assets: V3_DEMO_ASSET_FIXTURES, entities: V3_DEMO_ENTITY_FIXTURES, keyFor: v3DemoAssetIdempotencyKey, entityVersion: 2 },
    { generation: "v3", assets: V3_DEMO_ASSET_FIXTURES, entities: V3_DEMO_ENTITY_FIXTURES, keyFor: v3DemoAssetIdempotencyKey, entityVersion: 3 },
  ])("upgrades pristine $generation Entities at version $entityVersion to v4 without duplicating or replacing their identities", async ({ assets, entities, keyFor, entityVersion }) => {
    const pool = createPool();
    const objectStore = new InMemoryObjectStore();
    const assetStore = new PostgresAssetStore(pool);
    const entityStore = new PostgresEntityStore(pool);
    const dependencies = { pool, assetStore, entityStore, objectStore };
    try {
      const previous = await seedHistoricalDemoAssetLibrary(pool, objectStore, assets, entities, keyFor);
      await pool.query("UPDATE workspace_entities SET version = $1 WHERE id = ANY($2::text[])", [
        entityVersion, [...previous.entityIdsByCreateKey.values()],
      ]);
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

      expect(rowsBefore.rows).toHaveLength(entities.length);
      expect(rowsAfterFirst.rows).toHaveLength(DEMO_ENTITY_FIXTURES.length);
      expect(rowsAfterFirst.rows.filter(({ create_idempotency_key }) =>
        previous.entityIdsByCreateKey.has(create_idempotency_key)).map(({ id }) => id).sort()).toEqual(
        [...previous.entityIdsByCreateKey.values()].sort(),
      );
      const versionsBeforeByCreateKey = new Map(
        rowsBefore.rows.map(({ create_idempotency_key, version }) => [create_idempotency_key, version]),
      );
      for (const row of rowsAfterFirst.rows) {
        expect(row.version).toBe((versionsBeforeByCreateKey.get(row.create_idempotency_key) ?? 0) + 1);
      }
      expect(rowsAfterSecond.rows).toEqual(rowsAfterFirst.rows);
      expect(second.entities.map(({ id }) => id)).toEqual(first.entities.map(({ id }) => id));
      expectCanonicalEntityContents(first);

      const placementsAfter = await pool.query<{ id: string; entity_id: string }>(
        `SELECT id, entity_id FROM entity_placements
         WHERE workspace_id = $1 AND owner_user_id = $2 ORDER BY entity_id`,
        [DEMO_WORKSPACE_ID, DEMO_ACTOR_ID],
      );
      expect(placementsAfter.rows.filter(({ entity_id }) =>
        [...previous.entityIdsByCreateKey.values()].includes(entity_id))).toEqual(placementsBefore.rows);
      expect(placementsAfter.rows).toHaveLength(3);

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
        assets: String(assets.length),
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
      expect(entityRows.rows).toHaveLength(LEGACY_DEMO_ENTITY_FIXTURES.length);
      expect(entityRows.rows.find(({ id }) => id === entityId)).toEqual(expect.objectContaining({
        name: "用户修改后的主体",
        version: 2,
      }));
    } finally {
      await pool.end();
    }
  });

  it.each([
    { generation: "v2", assets: PREVIOUS_DEMO_ASSET_FIXTURES, entities: PREVIOUS_DEMO_ENTITY_FIXTURES, keyFor: previousDemoAssetIdempotencyKey },
    { generation: "v3", assets: V3_DEMO_ASSET_FIXTURES, entities: V3_DEMO_ENTITY_FIXTURES, keyFor: v3DemoAssetIdempotencyKey },
  ])("fails closed before creating v4 media when a $generation Entity was edited", async ({ assets, entities, keyFor }) => {
    const pool = createPool();
    const objectStore = new InMemoryObjectStore();
    const assetStore = new PostgresAssetStore(pool);
    const entityStore = new PostgresEntityStore(pool);
    try {
      const previous = await seedHistoricalDemoAssetLibrary(pool, objectStore, assets, entities, keyFor);
      const firstFixture = entities[0];
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

  it.each([
    { generation: "v1", assets: LEGACY_DEMO_ASSET_FIXTURES, entities: LEGACY_DEMO_ENTITY_FIXTURES, keyFor: legacyDemoAssetIdempotencyKey },
    { generation: "v3", assets: V3_DEMO_ASSET_FIXTURES, entities: V3_DEMO_ENTITY_FIXTURES, keyFor: v3DemoAssetIdempotencyKey },
  ])("preserves $generation assets referenced by user Entities, other projects, or canvas documents", async ({ assets, entities, keyFor }) => {
    const pool = createPool();
    const objectStore = new InMemoryObjectStore();
    const assetStore = new PostgresAssetStore(pool);
    const entityStore = new PostgresEntityStore(pool);
    try {
      const legacy = await seedHistoricalDemoAssetLibrary(pool, objectStore, assets, entities, keyFor);
      const protectedAssetId = legacy.assetIdsByKey.get(assets[0].key)!;
      const projectProtectedAssetId = legacy.assetIdsByKey.get(assets[1].key)!;
      const canvasProtectedIds = assets.slice(2, 5).map(({ key }) => legacy.assetIdsByKey.get(key)!);
      const userEntity = await entityStore.createPersonalEntity({
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

      const canvasAssets = await pool.query<{ id: string; object_key: string; reference_id: string }>(
        `SELECT asset.id, asset.object_key, reference.id AS reference_id
         FROM workspace_media_assets AS asset
         JOIN project_asset_references AS reference ON reference.asset_id = asset.id
         WHERE asset.id = ANY($1::text[]) AND reference.project_id = $2`,
        [canvasProtectedIds, DEMO_PROJECT_ID],
      );
      const canvasAssetsById = new Map(canvasAssets.rows.map((asset) => [asset.id, asset]));
      const originalCanvas = {
        nodes: [
          { id: "existing-media", mediaAssetId: canvasProtectedIds[0] },
          { id: "existing-object", objectKey: canvasAssetsById.get(canvasProtectedIds[1])!.object_key },
          { id: "existing-reference", projectAssetReferenceId: canvasAssetsById.get(canvasProtectedIds[2])!.reference_id },
        ],
      };
      await pool.query(
        `INSERT INTO canvas_documents (project_id, canvas_id, schema_version, revision, content,
           created_by_user_id, updated_by_user_id)
         VALUES ($1, 'fixture-retention-test', 1, 1, $2::jsonb, $3, $3)`,
        [DEMO_PROJECT_ID, JSON.stringify(originalCanvas), DEMO_ACTOR_ID],
      );

      await seedDemoAssetLibrary({ pool, assetStore, entityStore, objectStore });

      expect(await entityStore.getPersonalEntity({
        actorId: DEMO_ACTOR_ID, workspaceId: DEMO_WORKSPACE_ID, entityId: userEntity.id,
      })).toEqual(userEntity);
      const canvasAfter = await pool.query<{ revision: number; content: unknown }>(
        "SELECT revision, content FROM canvas_documents WHERE project_id = $1 AND canvas_id = 'fixture-retention-test'",
        [DEMO_PROJECT_ID],
      );
      expect(canvasAfter.rows[0]).toEqual({ revision: 1, content: originalCanvas });
      for (const assetId of canvasProtectedIds) {
        const retainedCanvasAsset = await pool.query<{ placements: string; project_references: string }>(
          `SELECT
             (SELECT count(*) FROM media_asset_placements WHERE asset_id = $1)::text AS placements,
             (SELECT count(*) FROM project_asset_references WHERE asset_id = $1)::text AS project_references`,
          [assetId],
        );
        expect(retainedCanvasAsset.rows[0]).toEqual({ placements: "1", project_references: "1" });
        await expect(objectStore.headObject(canvasAssetsById.get(assetId)!.object_key)).resolves.toBeTruthy();
      }

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
        (id) => id !== protectedAssetId && id !== projectProtectedAssetId && !canvasProtectedIds.includes(id),
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
