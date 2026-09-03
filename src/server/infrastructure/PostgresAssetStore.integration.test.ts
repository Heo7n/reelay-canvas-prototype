import { randomBytes } from "node:crypto";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ProjectAssetUnavailableError } from "../application/ProjectAssetReferenceStore";
import { PersonalAssetUnavailableError } from "../application/WorkspaceMediaAssetStore";
import { DEFAULT_LOCAL_DATABASE_URL } from "../db/config";
import { runMigrations } from "../db/migrate";
import { seedDemoDatabase } from "../db/seed";
import { PostgresAssetStore } from "./PostgresAssetStore";

const databaseName = `reelay_asset_test_${process.pid}_${randomBytes(4).toString("hex")}`;
const configuredAdminUrl = process.env.TEST_DATABASE_ADMIN_URL ?? DEFAULT_LOCAL_DATABASE_URL;
const adminUrl = new URL(configuredAdminUrl);
adminUrl.pathname = "/postgres";
adminUrl.search = "";
const databaseUrl = new URL(adminUrl);
databaseUrl.pathname = `/${databaseName}`;

const assetTables = [
  "asset_upload_intents",
  "workspace_media_assets",
  "media_asset_placements",
  "project_asset_references",
];

let adminPool: Pool;
let appliedMigrations: string[] = [];

function createPool(): Pool {
  return new Pool({
    connectionString: databaseUrl.toString(),
    max: 4,
    application_name: "reelay-asset-integration-test",
  });
}

beforeAll(async () => {
  adminPool = new Pool({ connectionString: adminUrl.toString(), max: 1, application_name: "reelay-asset-test-admin" });
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

describe("PostgreSQL asset persistence", () => {
  it("migrates once, enables RLS, and leaves client roles without table privileges", async () => {
    expect(appliedMigrations).toContain("0010_workspace_media_assets.sql");
    expect(appliedMigrations).toContain("0011_asset_membership_lifecycle.sql");
    const pool = createPool();
    try {
      const rls = await pool.query<{ relname: string; relrowsecurity: boolean }>(
        `SELECT relname, relrowsecurity
         FROM pg_class
         WHERE relnamespace = 'public'::regnamespace
           AND relname = ANY($1::text[])
         ORDER BY relname`,
        [assetTables],
      );
      expect(rls.rows).toHaveLength(assetTables.length);
      expect(rls.rows.every((row) => row.relrowsecurity)).toBe(true);

      const privileges = await pool.query<{
        table_name: string;
        anon_select: boolean;
        authenticated_select: boolean;
      }>(
        `SELECT table_name,
                has_table_privilege('anon', table_name, 'SELECT') AS anon_select,
                has_table_privilege('authenticated', table_name, 'SELECT') AS authenticated_select
         FROM unnest($1::text[]) AS asset_table(table_name)
         ORDER BY table_name`,
        [assetTables],
      );
      expect(privileges.rows).toHaveLength(assetTables.length);
      expect(privileges.rows.every((row) => !row.anon_select && !row.authenticated_select)).toBe(true);
    } finally {
      await pool.end();
    }
  });

  it("rejects creators who are not members of the referenced workspace", async () => {
    const pool = createPool();
    try {
      await pool.query("INSERT INTO workspaces (id, kind, name) VALUES ('workspace-asset-other', 'organization', 'Other')");
      const store = new PostgresAssetStore(pool);
      await expect(store.createUploadIntent({
        actorId: "actor-tianmaochao",
        workspaceId: "workspace-asset-other",
        idempotencyKey: "cross-workspace",
        mediaKind: "image",
        displayName: "forbidden.png",
        contentType: "image/png",
        byteSize: 1,
        checksumSha256: "a".repeat(64),
      })).rejects.toMatchObject({ name: "AssetWorkspaceUnavailableError" });
    } finally {
      await pool.end();
    }
  });

  it("persists an idempotent personal upload and an authorized project reference", async () => {
    const ownerId = "actor-tianmaochao";
    const workspaceId = "workspace-organization-reelay";
    const projectId = "project-scifi-trailer";
    const checksumSha256 = "b".repeat(64);
    let nextId = 0;
    let currentTime = new Date("2026-08-31T00:00:00.000Z");
    const firstPool = createPool();
    const store = new PostgresAssetStore(
      firstPool,
      () => currentTime,
      () => String(++nextId),
    );

    try {
      const request = {
        actorId: ownerId,
        workspaceId,
        idempotencyKey: "postgres-upload-1",
        mediaKind: "image" as const,
        displayName: "主视觉.webp",
        contentType: "image/webp",
        byteSize: 42,
        checksumSha256,
      };
      const intent = await store.createUploadIntent(request);
      await expect(store.createUploadIntent(request)).resolves.toEqual(intent);
      await expect(store.getUploadIntent({ actorId: ownerId, workspaceId, uploadIntentId: intent.id }))
        .resolves.toEqual(intent);
      await expect(store.getUploadIntent({
        actorId: "actor-linjing",
        workspaceId,
        uploadIntentId: intent.id,
      })).resolves.toBeNull();

      const uploaded = await store.recordUpload({
        actorId: ownerId,
        workspaceId,
        uploadIntentId: intent.id,
        objectKey: intent.objectKey,
        contentType: request.contentType,
        byteSize: request.byteSize,
        checksumSha256,
        etag: checksumSha256,
      });
      await expect(store.recordUpload({
        actorId: ownerId,
        workspaceId,
        uploadIntentId: intent.id,
        objectKey: intent.objectKey,
        contentType: request.contentType,
        byteSize: request.byteSize,
        checksumSha256,
        etag: checksumSha256,
      })).resolves.toEqual(uploaded);

      const asset = await store.finalizeUpload({ actorId: ownerId, workspaceId, uploadIntentId: intent.id });
      await expect(store.finalizeUpload({ actorId: ownerId, workspaceId, uploadIntentId: intent.id }))
        .resolves.toEqual(asset);
      await expect(store.listPersonalAssets({ actorId: ownerId, workspaceId })).resolves.toEqual([asset]);
      await expect(store.getPersonalAsset({ actorId: ownerId, workspaceId, assetId: asset.id }))
        .resolves.toEqual(asset);
      await expect(store.getPersonalAsset({ actorId: "actor-linjing", workspaceId, assetId: asset.id }))
        .resolves.toBeNull();

      const reference = await store.attachAssetToProject({ actorId: ownerId, projectId, assetId: asset.id });
      await expect(store.attachAssetToProject({ actorId: ownerId, projectId, assetId: asset.id }))
        .resolves.toEqual(reference);
      await expect(store.renamePersonalAsset({
        actorId: "actor-linjing",
        workspaceId,
        assetId: asset.id,
        displayName: "越权改名.webp",
      })).rejects.toBeInstanceOf(PersonalAssetUnavailableError);

      currentTime = new Date("2026-08-31T00:01:00.000Z");
      const renamed = await store.renamePersonalAsset({
        actorId: ownerId,
        workspaceId,
        assetId: asset.id,
        displayName: "  最终主视觉.webp  ",
      });
      expect(renamed).toEqual({
        ...asset,
        displayName: "最终主视觉.webp",
        updatedAt: currentTime.toISOString(),
      });
      expect(renamed.objectVersion).toBe(asset.objectVersion);
      await expect(store.listProjectAssets({ actorId: ownerId, projectId })).resolves.toEqual([
        { reference, asset: renamed },
      ]);
      expect(reference.assetVersion).toBe(asset.objectVersion);
      await expect(store.attachAssetToProject({ actorId: "actor-linjing", projectId, assetId: asset.id }))
        .rejects.toBeInstanceOf(ProjectAssetUnavailableError);
      await expect(store.listProjectAssets({ actorId: "actor-chenxi", projectId }))
        .rejects.toBeInstanceOf(ProjectAssetUnavailableError);
    } finally {
      await firstPool.end();
    }

    const restartedPool = createPool();
    const restartedStore = new PostgresAssetStore(restartedPool);
    try {
      const restored = await restartedStore.listProjectAssets({ actorId: "actor-zhouyu", projectId });
      expect(restored).toHaveLength(1);
      expect(restored[0]).toEqual(expect.objectContaining({
        reference: expect.objectContaining({ projectId }),
        asset: expect.objectContaining({ displayName: "最终主视觉.webp", checksumSha256, objectVersion: 1 }),
      }));
      expect(restored[0].reference.assetVersion).toBe(restored[0].asset.objectVersion);
      await expect(restartedStore.getProjectAsset({
        actorId: "actor-zhouyu",
        projectId,
        referenceId: restored[0].reference.id,
      })).resolves.toEqual(restored[0]);
    } finally {
      await restartedPool.end();
    }
  });

  it("preserves audit records while membership removal revokes placements and access", async () => {
    const pool = createPool();
    const actorId = "actor-asset-membership-lifecycle";
    const workspaceId = "workspace-organization-reelay";
    const projectId = "project-asset-membership-lifecycle";
    const checksumSha256 = "c".repeat(64);
    let nextId = 0;
    try {
      await pool.query(
        `INSERT INTO users (id, display_name) VALUES ($1, 'Asset lifecycle actor')`,
        [actorId],
      );
      await pool.query(
        `INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'member')`,
        [workspaceId, actorId],
      );
      await pool.query(
        `INSERT INTO projects (
           id, workspace_id, created_by_user_id, updated_by_user_id, name,
           created_at, updated_at, access_kind
         ) VALUES ($1, $2, $3, $3, 'Asset lifecycle project', now(), now(), 'private')`,
        [projectId, workspaceId, actorId],
      );
      await pool.query(
        `INSERT INTO project_memberships (project_id, user_id, role) VALUES ($1, $2, 'admin')`,
        [projectId, actorId],
      );

      const store = new PostgresAssetStore(
        pool,
        () => new Date("2026-08-31T00:00:00.000Z"),
        () => `lifecycle-${++nextId}`,
      );
      const intent = await store.createUploadIntent({
        actorId,
        workspaceId,
        idempotencyKey: "membership-lifecycle-upload",
        mediaKind: "image",
        displayName: "lifecycle.png",
        contentType: "image/png",
        byteSize: 3,
        checksumSha256,
      });
      await store.recordUpload({
        actorId,
        workspaceId,
        uploadIntentId: intent.id,
        objectKey: intent.objectKey,
        contentType: "image/png",
        byteSize: 3,
        checksumSha256,
        etag: checksumSha256,
      });
      const asset = await store.finalizeUpload({ actorId, workspaceId, uploadIntentId: intent.id });
      const reference = await store.attachAssetToProject({ actorId, projectId, assetId: asset.id });

      await expect(pool.query(
        "DELETE FROM project_memberships WHERE project_id = $1 AND user_id = $2",
        [projectId, actorId],
      )).resolves.toMatchObject({ rowCount: 1 });
      await expect(pool.query(
        "DELETE FROM memberships WHERE workspace_id = $1 AND user_id = $2",
        [workspaceId, actorId],
      )).resolves.toMatchObject({ rowCount: 1 });

      const audit = await pool.query<{
        assets: string;
        intents: string;
        placements: string;
        references: string;
      }>(
        `SELECT
           (SELECT count(*) FROM workspace_media_assets WHERE id = $1)::text AS assets,
           (SELECT count(*) FROM asset_upload_intents WHERE id = $2)::text AS intents,
           (SELECT count(*) FROM media_asset_placements WHERE asset_id = $1)::text AS placements,
           (SELECT count(*) FROM project_asset_references WHERE id = $3)::text AS references`,
        [asset.id, intent.id, reference.id],
      );
      expect(audit.rows[0]).toEqual({ assets: "1", intents: "1", placements: "0", references: "1" });
    } finally {
      await pool.end();
    }
  });
});
