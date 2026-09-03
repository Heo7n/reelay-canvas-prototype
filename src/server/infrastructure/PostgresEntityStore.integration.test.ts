import { randomBytes } from "node:crypto";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  EntityCoverMediaInvalidError,
  EntityMediaUnavailableError,
  EntityVersionConflictError,
} from "../application/EntityStore";
import { DEFAULT_LOCAL_DATABASE_URL } from "../db/config";
import { runMigrations } from "../db/migrate";
import { seedDemoDatabase } from "../db/seed";
import { PostgresAssetStore } from "./PostgresAssetStore";
import { PostgresEntityStore } from "./PostgresEntityStore";

const databaseName = `reelay_entity_test_${process.pid}_${randomBytes(4).toString("hex")}`;
const configuredAdminUrl = process.env.TEST_DATABASE_ADMIN_URL ?? DEFAULT_LOCAL_DATABASE_URL;
const adminUrl = new URL(configuredAdminUrl);
adminUrl.pathname = "/postgres";
adminUrl.search = "";
const databaseUrl = new URL(adminUrl);
databaseUrl.pathname = `/${databaseName}`;

const entityTables = [
  "workspace_entities",
  "entity_media_references",
  "entity_placements",
  "entity_personal_media_bindings",
];

let adminPool: Pool;
let appliedMigrations: string[] = [];

function createPool(): Pool {
  return new Pool({
    connectionString: databaseUrl.toString(),
    max: 4,
    application_name: "reelay-entity-integration-test",
  });
}

beforeAll(async () => {
  adminPool = new Pool({ connectionString: adminUrl.toString(), max: 1, application_name: "reelay-entity-test-admin" });
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
    appliedMigrations = await runMigrations(setupPool);
    await expect(runMigrations(setupPool)).resolves.toEqual([]);
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

async function createPersonalAsset(
  store: PostgresAssetStore,
  actorId: string,
  workspaceId: string,
  suffix: string,
  mediaKind: "image" | "video" | "audio" = "image",
) {
  const checksumSha256 = suffix.padEnd(64, suffix[0]).slice(0, 64).replace(/[^0-9a-f]/g, "a");
  const contentType = mediaKind === "audio" ? "audio/mpeg" : mediaKind === "video" ? "video/mp4" : "image/png";
  const intent = await store.createUploadIntent({
    actorId,
    workspaceId,
    idempotencyKey: `entity-asset-${suffix}`,
    mediaKind,
    displayName: `${suffix}.${mediaKind === "audio" ? "mp3" : mediaKind === "video" ? "mp4" : "png"}`,
    contentType,
    byteSize: 10,
    checksumSha256,
  });
  await store.recordUpload({
    actorId,
    workspaceId,
    uploadIntentId: intent.id,
    objectKey: intent.objectKey,
    contentType,
    byteSize: 10,
    checksumSha256,
    etag: checksumSha256,
  });
  return store.finalizeUpload({ actorId, workspaceId, uploadIntentId: intent.id });
}

describe("PostgreSQL Entity persistence", () => {
  it("migrates the Entity tables with server-only access", async () => {
    expect(appliedMigrations).toContain("0012_workspace_entities.sql");
    expect(appliedMigrations).toContain("0013_entity_personal_media_bindings.sql");
    const pool = createPool();
    try {
      const rls = await pool.query<{ relname: string; relrowsecurity: boolean }>(
        `SELECT relname, relrowsecurity
         FROM pg_class
         WHERE relnamespace = 'public'::regnamespace
           AND relname = ANY($1::text[])
         ORDER BY relname`,
        [entityTables],
      );
      expect(rls.rows).toHaveLength(entityTables.length);
      expect(rls.rows.every((row) => row.relrowsecurity)).toBe(true);

      const privileges = await pool.query<{
        anon_select: boolean;
        authenticated_select: boolean;
      }>(
        `SELECT has_table_privilege('anon', entity_table, 'SELECT') AS anon_select,
                has_table_privilege('authenticated', entity_table, 'SELECT') AS authenticated_select
         FROM unnest($1::text[]) AS entity_table`,
        [entityTables],
      );
      expect(privileges.rows.every((row) => !row.anon_select && !row.authenticated_select)).toBe(true);
    } finally {
      await pool.end();
    }
  });

  it("persists personal Entities, media order, cover, idempotency, and optimistic updates", async () => {
    const actorId = "actor-tianmaochao";
    const workspaceId = "workspace-organization-reelay";
    let nextId = 0;
    const firstPool = createPool();
    const assetStore = new PostgresAssetStore(
      firstPool,
      () => new Date("2026-09-01T00:00:00.000Z"),
      () => `entity-test-${++nextId}`,
    );
    const entityStore = new PostgresEntityStore(
      firstPool,
      () => new Date("2026-09-01T00:00:00.000Z"),
      () => `entity-test-${++nextId}`,
    );

    let entityId = "";
    let motionAssetId = "";
    try {
      const front = await createPersonalAsset(assetStore, actorId, workspaceId, "a1");
      const voice = await createPersonalAsset(assetStore, actorId, workspaceId, "b2", "audio");
      const motion = await createPersonalAsset(assetStore, actorId, workspaceId, "v9", "video");
      motionAssetId = motion.id;
      await expect(entityStore.createPersonalEntity({
        actorId,
        workspaceId,
        idempotencyKey: "postgres-entity-video-cover",
        name: "视频封面主体",
        mediaAssetIds: [motion.id],
        coverMediaId: motion.id,
      })).rejects.toBeInstanceOf(EntityCoverMediaInvalidError);
      const createInput = {
        actorId,
        workspaceId,
        idempotencyKey: "postgres-entity-lirael",
        name: "莉瑞尔",
        description: "角色设定",
        mediaAssetIds: [front.id, voice.id, front.id],
        coverMediaId: front.id,
      };
      const created = await entityStore.createPersonalEntity(createInput);
      entityId = created.id;
      expect(created).toEqual(expect.objectContaining({
        version: 1,
        coverMediaId: front.id,
        mediaRefs: [
          { mediaAssetId: front.id, order: 0 },
          { mediaAssetId: voice.id, order: 1 },
        ],
      }));
      await expect(entityStore.createPersonalEntity(createInput)).resolves.toEqual(created);
      await expect(entityStore.createPersonalEntity({ ...createInput, name: "冲突主体" }))
        .rejects.toMatchObject({ reason: "idempotency_key_reused" });
      await expect(entityStore.createPersonalEntity({
        ...createInput,
        actorId: "actor-linjing",
        idempotencyKey: "postgres-entity-foreign-media",
      })).rejects.toBeInstanceOf(EntityMediaUnavailableError);

      const updated = await entityStore.updatePersonalEntity({
        actorId,
        workspaceId,
        entityId,
        expectedVersion: 1,
        name: "莉瑞尔新版",
        description: "切换封面",
        mediaAssetIds: [voice.id, front.id],
        coverMediaId: front.id,
      });
      expect(updated).toEqual(expect.objectContaining({
        version: 2,
        name: "莉瑞尔新版",
        coverMediaId: front.id,
        mediaRefs: [
          { mediaAssetId: voice.id, order: 0 },
          { mediaAssetId: front.id, order: 1 },
        ],
      }));
      await expect(entityStore.updatePersonalEntity({
        actorId,
        workspaceId,
        entityId,
        expectedVersion: 2,
        name: "错误音频封面",
        mediaAssetIds: [voice.id, front.id],
        coverMediaId: voice.id,
      })).rejects.toBeInstanceOf(EntityCoverMediaInvalidError);
      await expect(entityStore.updatePersonalEntity({
        actorId,
        workspaceId,
        entityId,
        expectedVersion: 2,
        name: "错误视频封面",
        mediaAssetIds: [motion.id, front.id],
        coverMediaId: motion.id,
      })).rejects.toBeInstanceOf(EntityCoverMediaInvalidError);
      await expect(entityStore.updatePersonalEntity({
        actorId,
        workspaceId,
        entityId,
        expectedVersion: 1,
        name: "陈旧更新",
        mediaAssetIds: [front.id],
      })).rejects.toBeInstanceOf(EntityVersionConflictError);
      await expect(entityStore.getPersonalEntity({
        actorId: "actor-linjing",
        workspaceId,
        entityId,
      })).resolves.toBeNull();

      await expect(firstPool.query(
        "UPDATE workspace_entities SET cover_asset_id = $1 WHERE workspace_id = $2 AND id = $3",
        ["asset-not-referenced", workspaceId, entityId],
      )).rejects.toMatchObject({ code: "23503" });
    } finally {
      await firstPool.end();
    }

    const restartedPool = createPool();
    const restartedStore = new PostgresEntityStore(restartedPool);
    try {
      const restored = await restartedStore.getPersonalEntity({ actorId, workspaceId, entityId });
      expect(restored).toEqual(expect.objectContaining({
        id: entityId,
        name: "莉瑞尔新版",
        version: 2,
      }));
      await expect(restartedStore.listPersonalEntities({ actorId, workspaceId })).resolves.toEqual([restored]);

      await restartedPool.query(
        `INSERT INTO entity_media_references (workspace_id, entity_id, asset_id, position)
         VALUES ($1, $2, $3, 2)`,
        [workspaceId, entityId, motionAssetId],
      );
      await restartedPool.query(
        "UPDATE workspace_entities SET cover_asset_id = $3 WHERE workspace_id = $1 AND id = $2",
        [workspaceId, entityId, motionAssetId],
      );
      await expect(restartedStore.getPersonalEntity({ actorId, workspaceId, entityId }))
        .rejects.toBeInstanceOf(EntityCoverMediaInvalidError);
      await expect(restartedStore.listPersonalEntities({ actorId, workspaceId }))
        .rejects.toBeInstanceOf(EntityCoverMediaInvalidError);
    } finally {
      await restartedPool.end();
    }
  });

  it("restores an idempotent Entity placement only after its personal media placements are valid again", async () => {
    const actorId = "actor-entity-lifecycle";
    const workspaceId = "workspace-entity-lifecycle";
    let nextId = 0;
    const pool = createPool();
    const assetStore = new PostgresAssetStore(
      pool,
      () => new Date("2026-09-01T01:00:00.000Z"),
      () => `entity-lifecycle-${++nextId}`,
    );
    const entityStore = new PostgresEntityStore(
      pool,
      () => new Date("2026-09-01T01:00:00.000Z"),
      () => `entity-lifecycle-${++nextId}`,
    );

    try {
      await pool.query(
        "INSERT INTO users (id, display_name) VALUES ($1, '主体生命周期测试')",
        [actorId],
      );
      await pool.query(
        "INSERT INTO workspaces (id, kind, name) VALUES ($1, 'organization', '主体生命周期工作区')",
        [workspaceId],
      );
      await pool.query(
        "INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')",
        [workspaceId, actorId],
      );

      const front = await createPersonalAsset(assetStore, actorId, workspaceId, "c3");
      const side = await createPersonalAsset(assetStore, actorId, workspaceId, "d4");
      const createInput = {
        actorId,
        workspaceId,
        idempotencyKey: "entity-lifecycle-create",
        name: "可恢复主体",
        mediaAssetIds: [front.id, side.id],
        coverMediaId: front.id,
      };
      const created = await entityStore.createPersonalEntity(createInput);

      await expect(pool.query(
        "DELETE FROM memberships WHERE workspace_id = $1 AND user_id = $2",
        [workspaceId, actorId],
      )).resolves.toMatchObject({ rowCount: 1 });
      const removedLifecycle = await pool.query<{
        entity_placements: string;
        media_placements: string;
        bindings: string;
        entities: string;
      }>(
        `SELECT
           (SELECT count(*) FROM entity_placements WHERE workspace_id = $1)::text AS entity_placements,
           (SELECT count(*) FROM media_asset_placements WHERE workspace_id = $1)::text AS media_placements,
           (SELECT count(*) FROM entity_personal_media_bindings WHERE workspace_id = $1)::text AS bindings,
           (SELECT count(*) FROM workspace_entities WHERE workspace_id = $1)::text AS entities`,
        [workspaceId],
      );
      expect(removedLifecycle.rows[0]).toEqual({
        entity_placements: "0",
        media_placements: "0",
        bindings: "0",
        entities: "1",
      });

      await pool.query(
        "INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')",
        [workspaceId, actorId],
      );
      await expect(entityStore.createPersonalEntity(createInput))
        .rejects.toBeInstanceOf(EntityMediaUnavailableError);
      await expect(entityStore.getPersonalEntity({ actorId, workspaceId, entityId: created.id }))
        .resolves.toBeNull();

      for (const assetId of [front.id, side.id]) {
        await pool.query(
          `INSERT INTO media_asset_placements (
             id, workspace_id, asset_id, scope_kind, owner_user_id, created_by_user_id, created_at
           ) VALUES ($1, $2, $3, 'personal', $4, $4, $5)`,
          [`restored-placement-${assetId}`, workspaceId, assetId, actorId, "2026-09-01T02:00:00.000Z"],
        );
      }

      await expect(entityStore.createPersonalEntity(createInput)).resolves.toEqual(created);
      const restoredLifecycle = await pool.query<{ placements: string; bindings: string }>(
        `SELECT
           (SELECT count(*) FROM entity_placements
             WHERE workspace_id = $1 AND entity_id = $2 AND owner_user_id = $3)::text AS placements,
           (SELECT count(*) FROM entity_personal_media_bindings
             WHERE workspace_id = $1 AND entity_id = $2 AND owner_user_id = $3)::text AS bindings`,
        [workspaceId, created.id, actorId],
      );
      expect(restoredLifecycle.rows[0]).toEqual({ placements: "1", bindings: "2" });

      await expect(pool.query(
        `DELETE FROM media_asset_placements
         WHERE workspace_id = $1 AND asset_id = $2 AND owner_user_id = $3`,
        [workspaceId, front.id, actorId],
      )).rejects.toMatchObject({
        code: "23503",
        constraint: "entity_personal_media_bindings_personal_asset_fkey",
      });
    } finally {
      await pool.end();
    }
  });
});
