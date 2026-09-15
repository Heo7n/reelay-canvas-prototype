import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MediaStorageQuotaExceededError } from "../../domain/asset/media-storage";
import { DEFAULT_LOCAL_DATABASE_URL } from "../db/config";
import { runMigrations } from "../db/migrate";
import { seedDemoDatabase } from "../db/seed";
import { PostgresAssetStore } from "./PostgresAssetStore";
import type { AssetUploadIntent } from "../../domain/asset/workspace-media-asset";

const databaseName = `reelay_storage_test_${process.pid}_${randomBytes(4).toString("hex")}`;
const adminUrl = new URL(process.env.TEST_DATABASE_ADMIN_URL ?? DEFAULT_LOCAL_DATABASE_URL);
adminUrl.pathname = "/postgres";
adminUrl.search = "";
const databaseUrl = new URL(adminUrl);
databaseUrl.pathname = `/${databaseName}`;
let adminPool: Pool;
let pool: Pool;
const scope = { actorId: "actor-tianmaochao", workspaceId: "workspace-organization-reelay" };
const input = { ...scope, idempotencyKey: "one", mediaKind: "video" as const, displayName: "cut.mp4", contentType: "video/mp4", byteSize: 60, checksumSha256: "a".repeat(64) };
const read = (intent: AssetUploadIntent) => ({ ...scope, uploadIntentId: intent.id });
const uploaded = (intent: AssetUploadIntent) => ({ objectKey: intent.objectKey, contentType: intent.expectedContentType, byteSize: intent.expectedByteSize, checksumSha256: intent.expectedChecksumSha256 });

beforeAll(async () => {
  adminPool = new Pool({ connectionString: adminUrl.toString(), max: 1 });
  if (!/^[a-z0-9_]+$/.test(databaseName)) throw new Error("Unsafe test database name.");
  await adminPool.query(`DO $$ BEGIN
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    END $$`);
  await adminPool.query(`CREATE DATABASE "${databaseName}"`);
  pool = new Pool({ connectionString: databaseUrl.toString(), max: 8 });
  await runMigrations(pool);
  await seedDemoDatabase(pool);
  await pool.query("INSERT INTO workspaces(id,kind,name) VALUES ('workspace-other','organization','Other')");
  await pool.query("INSERT INTO memberships(workspace_id,user_id,role) VALUES ('workspace-other',$1,'member')", [scope.actorId]);
});

beforeEach(async () => {
  await pool.query("TRUNCATE asset_upload_intents, workspace_media_assets CASCADE");
  await pool.query("DELETE FROM media_storage_accounts");
});

afterAll(async () => {
  await pool?.end();
  if (!adminPool) return;
  await adminPool.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()", [databaseName]);
  await adminPool.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
  await adminPool.end();
});

function fixture(limit = 100) {
  let time = Date.parse("2026-09-15T00:00:00.000Z");
  const store = new PostgresAssetStore(pool, () => new Date(time), undefined, 1000, { personal: limit, organization: limit });
  return { store, advance: () => { time += 5000; } };
}

describe("PostgreSQL storage capacity", () => {
  it("recovers an owned completed upload after a quota reduction without a new reservation", async () => {
    const { store, advance } = fixture();
    const intent = await store.createUploadIntent({ ...input, projectId: "project-scifi-trailer" });
    await store.recordUpload({ ...read(intent), ...uploaded(intent) });
    const lookup = { ...scope, idempotencyKey: input.idempotencyKey };
    expect((await store.findUploadIntentByIdempotencyKey(lookup))?.status).toBe("uploaded");
    await store.finalizeUpload(read(intent));
    advance();
    await pool.query("UPDATE media_storage_accounts SET limit_bytes=1");
    expect((await store.findUploadIntentByIdempotencyKey(lookup))?.status).toBe("finalized");
    expect(await store.getMediaStorage({ ...scope, storageSpace: "organization" })).toMatchObject({ limitBytes: 1, usedBytes: 60, reservedBytes: 0 });
    expect(await store.findUploadIntentByIdempotencyKey({ ...lookup, actorId: "actor-linjing" })).toBeNull();
    expect(await store.findUploadIntentByIdempotencyKey({ ...lookup, workspaceId: "workspace-other" })).toBeNull();
    await pool.query("UPDATE project_memberships SET role='view' WHERE project_id='project-scifi-trailer' AND user_id=$1", [scope.actorId]);
    try { await expect(store.findUploadIntentByIdempotencyKey(lookup)).rejects.toThrow(/unavailable/); }
    finally { await pool.query("UPDATE project_memberships SET role='admin' WHERE project_id='project-scifi-trailer' AND user_id=$1", [scope.actorId]); }
  });
  it("serializes concurrent reservations across sessions and workspaces for a personal account", async () => {
    const { store } = fixture();
    const outcomes = await Promise.allSettled([store.createUploadIntent(input), store.createUploadIntent({ ...input, workspaceId: "workspace-other" })]);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.find((result) => result.status === "rejected")).toMatchObject({ reason: expect.any(MediaStorageQuotaExceededError) });
    expect(await store.getMediaStorage(scope)).toMatchObject({ owner: { kind: "personal", id: scope.actorId }, usedBytes: 0, reservedBytes: 60, availableBytes: 40 });
    expect(await store.getMediaStorage({ ...scope, workspaceId: "workspace-other" })).toEqual(await store.getMediaStorage(scope));
  });

  it("converts reservation to one persisted source and preserves usage when deleting its placement", async () => {
    const { store } = fixture();
    const intents = await Promise.all([store.createUploadIntent(input), store.createUploadIntent(input)]);
    expect(intents[0].id).toBe(intents[1].id);
    await store.recordUpload({ ...read(intents[0]), ...uploaded(intents[0]) });
    const [asset, repeated] = await Promise.all([store.finalizeUpload(read(intents[0])), store.finalizeUpload(read(intents[0]))]);
    expect(repeated.id).toBe(asset.id);
    await store.attachAssetToProject({ actorId: scope.actorId, projectId: "project-perfume-tvc", assetId: asset.id });
    await store.saveLibrary({ ...scope, projectId: "project-perfume-tvc", space: "organization", folderId: null, tagIds: [], items: [{ assetId: asset.id, displayName: asset.displayName, action: "add" }] });
    await store.deleteLibrary({ ...scope, space: "personal", items: [{ kind: "media", id: asset.id }] });
    const restarted = new PostgresAssetStore(pool, undefined, undefined, undefined, { personal: 100 });
    expect(await restarted.getMediaStorage(scope)).toMatchObject({ usedBytes: 60, reservedBytes: 0, availableBytes: 40 });
    expect(await restarted.getMediaStorage({ ...scope, storageSpace: "organization" })).toMatchObject({ usedBytes: 0 });
    expect((await restarted.getProjectAsset({ actorId: scope.actorId, projectId: "project-perfume-tvc", referenceId: (await store.listProjectAssets({ actorId: scope.actorId, projectId: "project-perfume-tvc" }))[0].reference.id }))?.asset.storageOwner).toEqual({ kind: "personal", id: scope.actorId });
  });

  it("derives organization owner from actual project permissions, including finalize-time revocation", async () => {
    const { store } = fixture();
    const intent = await store.createUploadIntent({ ...input, projectId: "project-scifi-trailer" });
    expect(intent.storageOwner).toEqual({ kind: "organization", id: scope.workspaceId });
    await expect(store.createUploadIntent({ ...input, projectId: "project-scifi-trailer", storageSpace: "personal" })).rejects.toMatchObject({ reason: "storage_owner_mismatch" });
    await expect(store.createUploadIntent({ ...input, actorId: "actor-zhouyu", projectId: "project-scifi-trailer" })).rejects.toThrow(/unavailable/);
    await expect(store.createUploadIntent({ ...input, actorId: "actor-chenxi", projectId: "project-perfume-tvc" })).rejects.toThrow(/unavailable/);
    await expect(store.createUploadIntent({ ...input, workspaceId: "workspace-other", projectId: "project-scifi-trailer" })).rejects.toThrow(/unavailable/);
    await store.recordUpload({ ...read(intent), ...uploaded(intent) });
    await pool.query("UPDATE project_memberships SET role='view' WHERE project_id='project-scifi-trailer' AND user_id=$1", [scope.actorId]);
    try { await expect(store.finalizeUpload(read(intent))).rejects.toThrow(/unavailable/); }
    finally { await pool.query("UPDATE project_memberships SET role='admin' WHERE project_id='project-scifi-trailer' AND user_id=$1", [scope.actorId]); }
    const asset = await store.finalizeUpload(read(intent));
    expect(asset.storageOwner).toEqual(intent.storageOwner);
    expect(await store.listPersonalAssets(scope)).toHaveLength(0);
    expect((await store.listLibrary(scope)).entries).toEqual([expect.objectContaining({ assetId: asset.id, space: "organization" })]);
  });

  it("holds expired reservations and signed grants until cancellation can be proved safe", async () => {
    const { store, advance } = fixture(200);
    const local = await store.createUploadIntent(input);
    const remote = await store.createUploadIntent({ ...input, idempotencyKey: "remote" });
    await store.registerUploadAuthorization({ ...read(remote), expiresAt: "2026-09-15T00:00:02.000Z" });
    advance();
    expect(await store.listExpiredUploadIntents(scope)).toHaveLength(2);
    expect(await store.getMediaStorage(scope)).toMatchObject({ reservedBytes: 120 });
    await store.beginUploadCancellation({ ...read(local), expiredOnly: true });
    await store.beginUploadCancellation({ ...read(remote), expiredOnly: true });
    await expect(store.recordUpload({ ...read(local), ...uploaded(local) })).rejects.toMatchObject({ reason: "cancelled" });
    await store.completeUploadCancellation(read(local));
    await expect(store.completeUploadCancellation(read(remote))).rejects.toMatchObject({ reason: "authorization_active" });
    expect(await store.getMediaStorage(scope)).toMatchObject({ reservedBytes: 60 });
    await expect(store.createUploadIntent(input)).rejects.toMatchObject({ reason: "cancelled" });
    await expect(store.beginUploadCancellation({ ...read(remote), actorId: "actor-linjing" })).rejects.toThrow(/unavailable/);
  });

  it("keeps the upload lock across proxy I/O so cancellation cannot release a late write", async () => {
    const { store } = fixture();
    const intent = await store.createUploadIntent(input);
    let started!: () => void;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const signal = new Promise<void>((resolve) => { started = resolve; });
    const writing = store.writeUpload(read(intent), async () => { started(); await gate; return uploaded(intent); });
    await signal;
    let done = false;
    const cancellation = store.beginUploadCancellation(read(intent)).then((value) => { done = true; return value; });
    // A separate connection verifies that the source has not yet been recorded.
    expect((await store.getUploadIntent(read(intent)))?.status).toBe("pending");
    expect(done).toBe(false);
    release();
    expect((await writing).status).toBe("uploaded");
    expect((await cancellation).status).toBe("cancelling");
    await expect(store.writeUpload(read(intent), async () => uploaded(intent))).rejects.toMatchObject({ reason: "cancelled" });
  });

  it("uses persisted capacity overrides without changing defaults or allowing raw client table access", async () => {
    const { store } = fixture();
    await store.createUploadIntent(input);
    await pool.query("UPDATE media_storage_accounts SET limit_bytes=70 WHERE owner_kind='personal' AND owner_id=$1", [scope.actorId]);
    expect(await new PostgresAssetStore(pool).getMediaStorage(scope)).toMatchObject({ limitBytes: 70, reservedBytes: 60, availableBytes: 10 });
    await expect(store.createUploadIntent({ ...input, idempotencyKey: "two", byteSize: 11 })).rejects.toBeInstanceOf(MediaStorageQuotaExceededError);
    expect(await store.getMediaStorage({ ...scope, storageSpace: "organization" })).toMatchObject({ limitBytes: 100, usedBytes: 0 });
    const rls = await pool.query("SELECT relrowsecurity FROM pg_class WHERE oid='media_storage_accounts'::regclass");
    expect(rls.rows[0].relrowsecurity).toBe(true);
    const permissions = await pool.query("SELECT has_table_privilege('anon','media_storage_accounts','SELECT') AS anon, has_table_privilege('authenticated','media_storage_accounts','UPDATE') AS authenticated");
    expect(permissions.rows[0]).toEqual({ anon: false, authenticated: false });
  });

  it("reserves the provider's enforceable byte ceiling before issuing a remote grant, then accounts only verified bytes", async () => {
    const { store } = fixture(200);
    const intent = await store.createUploadIntent(input);
    await store.registerUploadAuthorization({ ...read(intent), expiresAt: "2026-09-15T00:00:02.000Z", reservedBytes: 150 });
    expect(await store.getMediaStorage(scope)).toMatchObject({ reservedBytes: 150, availableBytes: 50 });
    await expect(store.createUploadIntent({ ...input, idempotencyKey: "another" })).rejects.toBeInstanceOf(MediaStorageQuotaExceededError);
    await expect(store.registerUploadAuthorization({ ...read(intent), expiresAt: "2026-09-15T00:00:03.000Z", reservedBytes: 201 })).rejects.toBeInstanceOf(MediaStorageQuotaExceededError);
    expect((await store.getUploadIntent(read(intent)))?.reservedByteSize).toBe(150);
    await store.recordUpload({ ...read(intent), ...uploaded(intent) });
    await store.finalizeUpload(read(intent));
    expect(await store.getMediaStorage(scope)).toMatchObject({ usedBytes: 60, reservedBytes: 0, availableBytes: 140 });
  });

  it("does not deadlock an idempotent create retry racing finalization or remote authorization", async () => {
    const { store } = fixture(200);
    const intent = await store.createUploadIntent(input);
    const [retry] = await Promise.all([
      store.createUploadIntent(input),
      store.registerUploadAuthorization({ ...read(intent), expiresAt: "2026-09-15T00:00:02.000Z", reservedBytes: 150 }),
    ]);
    expect(retry.id).toBe(intent.id);
    await store.recordUpload({ ...read(intent), ...uploaded(intent) });
    const [again, asset] = await Promise.all([store.createUploadIntent(input), store.finalizeUpload(read(intent))]);
    expect(again.id).toBe(intent.id);
    expect(asset.id).toBeTruthy();
    expect(await store.getMediaStorage(scope)).toMatchObject({ usedBytes: 60, reservedBytes: 0 });
  });
});
