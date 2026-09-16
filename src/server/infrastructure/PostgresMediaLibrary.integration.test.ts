import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { beforeAll,afterAll,expect,it } from "vitest";
import { DEFAULT_LOCAL_DATABASE_URL } from "../db/config";
import { runMigrations } from "../db/migrate";
import { PostgresAssetStore } from "./PostgresAssetStore";
import { PostgresEntityStore } from "./PostgresEntityStore";
import { verifyLibraryGroupDirectories, verifyMediaLibraryTagDeletion, verifyMediaLibraryTagUpdates, verifyMediaLibraryFolderRename, verifyMediaLibraryDeletion, verifyMediaLibraryStore } from "./media-library-store-contract";

const databaseName=`reelay_library_test_${process.pid}_${randomUUID().replaceAll("-","")}`;
const adminUrl=new URL(process.env.TEST_DATABASE_ADMIN_URL ?? DEFAULT_LOCAL_DATABASE_URL);
if (!["127.0.0.1","localhost","::1"].includes(adminUrl.hostname)) throw new Error("Library integration tests require an isolated local database.");
adminUrl.pathname="/postgres";
adminUrl.search="";
const databaseUrl=new URL(adminUrl);databaseUrl.pathname=`/${databaseName}`;
let admin: Pool;
let pool: Pool;
beforeAll(async () => {
  admin=new Pool({ connectionString:adminUrl.toString(),max:1 });
  await admin.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END $$`);
  if (!/^reelay_library_test_[a-z0-9_]+$/.test(databaseName)) throw new Error("Unsafe test database name.");
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  pool=new Pool({ connectionString:databaseUrl.toString(),max:5 });
  await runMigrations(pool);
});
afterAll(async () => {
  await pool?.end();
  if (admin) { await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`); await admin.end(); }
});
async function createFixture() {
  const suffix=randomUUID();
  const workspaceId=`workspace-${suffix}`,projectId=`project-${suffix}`,otherProjectId=`other-project-${suffix}`,owner=`owner-${suffix}`,editor=`editor-${suffix}`,outsider=`outsider-${suffix}`,external=`external-${suffix}`;
  for (const id of [owner,editor,outsider,external]) await pool.query("INSERT INTO users (id,display_name) VALUES ($1,$1)",[id]);
  await pool.query("INSERT INTO workspaces (id,kind,name) VALUES ($1,'organization','Library test')",[workspaceId]);
  for (const id of [owner,editor,outsider]) await pool.query("INSERT INTO memberships (workspace_id,user_id,role) VALUES ($1,$2,'member')",[workspaceId,id]);
  for (const id of [projectId,otherProjectId]) {
    await pool.query("INSERT INTO projects (id,workspace_id,created_by_user_id,updated_by_user_id,name,access_kind,created_at,updated_at) VALUES ($1,$2,$3,$3,'Library project','collaborative',now(),now())",[id,workspaceId,owner]);
    for (const actor of [owner,editor,external]) await pool.query("INSERT INTO project_memberships (project_id,user_id,role) VALUES ($1,$2,'edit')",[id,actor]);
  }
  await pool.query("UPDATE memberships SET role='owner' WHERE workspace_id=$1 AND user_id=$2", [workspaceId, owner]);
  return { entities: new PostgresEntityStore(pool), store:new PostgresAssetStore(pool),workspaceId,projectId,otherProjectId,owner,editor,outsider,external };
}
verifyMediaLibraryStore(createFixture);
verifyMediaLibraryDeletion(createFixture);
verifyMediaLibraryFolderRename(createFixture);
verifyMediaLibraryTagUpdates(createFixture);
verifyMediaLibraryTagDeletion(createFixture);
it("keeps the complete persisted placement unchanged when add is replayed with different metadata", async () => {
  const { store,workspaceId,projectId,owner }=await createFixture();
  const context={ actorId:owner,workspaceId };
  const folder=await store.createLibraryFolder({ ...context,space:"personal",parentId:null,name:"Existing" });
  const intent=await store.createUploadIntent({ ...context,idempotencyKey:"insert-only-replay",mediaKind:"image",displayName:"Source",contentType:"image/png",byteSize:10,checksumSha256:"b".repeat(64) });
  await store.recordUpload({ ...context,uploadIntentId:intent.id,objectKey:intent.objectKey,contentType:"image/png",byteSize:10,checksumSha256:"b".repeat(64) });
  const asset=await store.finalizeUpload({ ...context,uploadIntentId:intent.id });
  await store.saveLibrary({ ...context,projectId,space:"personal",folderId:folder.id,tagIds:["builtin:object"],
    items:[{ assetId:asset.id,displayName:"Preserved name",action:"move",expectedFolderId:null }] });
  const readPlacement=() => pool.query("SELECT * FROM media_asset_placements WHERE workspace_id=$1 AND asset_id=$2",[workspaceId,asset.id]);
  const before=await readPlacement();
  await store.saveLibrary({ ...context,projectId,space:"personal",folderId:null,tagIds:[],
    items:[{ assetId:asset.id,displayName:"Ignored name",action:"add" }] });
  expect((await readPlacement()).rows).toEqual(before.rows);
});
it("keeps library tables server-only and persists catalogs across adapter restart", async () => {
  const rls=await pool.query("SELECT relrowsecurity,has_table_privilege('anon',oid,'SELECT') AS anon_read,has_table_privilege('authenticated',oid,'SELECT') AS authenticated_read FROM pg_class WHERE relname IN ('media_library_folders','media_library_tags')");
  expect(rls.rows).toEqual([expect.objectContaining({ relrowsecurity:true,anon_read:false,authenticated_read:false }),expect.objectContaining({ relrowsecurity:true,anon_read:false,authenticated_read:false })]);
  const workspace=(await pool.query("SELECT workspace_id,user_id FROM memberships AS membership WHERE EXISTS (SELECT 1 FROM media_asset_placements AS placement WHERE placement.workspace_id=membership.workspace_id AND placement.owner_user_id=membership.user_id) LIMIT 1")).rows[0];
  const context={ actorId:String(workspace.user_id),workspaceId:String(workspace.workspace_id) };
  const before=await new PostgresAssetStore(pool).listLibrary(context);
  expect(before.entries.length).toBeGreaterThan(0);
  const restarted=new Pool({ connectionString:databaseUrl.toString(),max:1 });
  try { await expect(new PostgresAssetStore(restarted).listLibrary(context)).resolves.toEqual(before); }
  finally { await restarted.end(); }
});

it("removes private folders and placements when membership is revoked while retaining project media", async () => {
  const { store,workspaceId,projectId,owner,editor }=await createFixture();
  const context={ actorId:owner,workspaceId };
  const folder=await store.createLibraryFolder({ ...context,space:"personal",parentId:null,name:"Private folder" });
  const tag=await store.createLibraryTag({ ...context,space:"personal",name:"Private tag" });
  const intent=await store.createUploadIntent({ ...context,idempotencyKey:"revocation-test",mediaKind:"image",displayName:"Private source",contentType:"image/png",byteSize:10,checksumSha256:"a".repeat(64) });
  await store.recordUpload({ ...context,uploadIntentId:intent.id,objectKey:intent.objectKey,contentType:"image/png",byteSize:10,checksumSha256:"a".repeat(64) });
  const asset=await store.finalizeUpload({ ...context,uploadIntentId:intent.id });
  const reference=await store.attachAssetToProject({ actorId:owner,projectId,assetId:asset.id });
  await store.saveLibrary({ ...context,projectId,space:"personal",folderId:folder.id,tagIds:[tag.id],items:[{ assetId:asset.id,displayName:"Private entry",action:"move",expectedFolderId:null }] });
  await expect(pool.query("DELETE FROM memberships WHERE workspace_id=$1 AND user_id=$2",[workspaceId,owner])).resolves.toMatchObject({ rowCount:1 });
  await expect(store.listLibrary(context)).rejects.toMatchObject({ name:"AssetWorkspaceUnavailableError" });
  await expect(store.getLibraryAsset({ ...context,assetId:asset.id })).resolves.toBeNull();
  expect((await pool.query("SELECT id FROM media_library_folders WHERE id=$1",[folder.id])).rows).toHaveLength(0);
  expect((await pool.query("SELECT id FROM media_library_tags WHERE id=$1",[tag.id])).rows).toHaveLength(0);
  await expect(store.getProjectAsset({ actorId:editor,projectId,referenceId:reference.id })).resolves.toMatchObject({ asset:{ id:asset.id,displayName:"Private source" } });
});

it("serializes group creation and deletion so concurrent requests cannot leave dangling personal bindings", async () => {
  const { store, entities, workspaceId, owner } = await createFixture();
  const context = { workspaceId, actorId: owner };
  const intent = await store.createUploadIntent({ ...context, idempotencyKey: "concurrent-group-delete", mediaKind: "image", displayName: "Source", contentType: "image/png", byteSize: 10, checksumSha256: "c".repeat(64) });
  await store.recordUpload({ ...context, uploadIntentId: intent.id, objectKey: intent.objectKey, contentType: "image/png", byteSize: 10, checksumSha256: "c".repeat(64) });
  const asset = await store.finalizeUpload({ ...context, uploadIntentId: intent.id });
  const results = await Promise.allSettled([
    entities.createPersonalEntity({ ...context, idempotencyKey: "concurrent-group", name: "Group", description: "", mediaAssetIds: [asset.id], coverMediaId: asset.id }),
    store.deleteLibrary({ ...context, space: "personal", items: [{ kind: "media", id: asset.id }] }),
  ]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const catalog = await store.listLibrary(context);
  const groups = await entities.listPersonalEntities(context);
  expect(groups.length ? catalog.entries.some((entry) => entry.assetId === asset.id) : !catalog.entries.some((entry) => entry.assetId === asset.id)).toBe(true);
  const references = await pool.query("SELECT 1 FROM entity_personal_media_bindings AS binding LEFT JOIN media_asset_placements AS placement ON placement.workspace_id=binding.workspace_id AND placement.asset_id=binding.asset_id AND placement.owner_user_id=binding.owner_user_id WHERE binding.workspace_id=$1 AND placement.id IS NULL", [workspaceId]);
  expect(references.rows).toEqual([]);
});

it("keeps a deleted group's source and tombstone across restart and prevents old create replay", async () => {
  const { store, entities, workspaceId, owner } = await createFixture();
  const context = { workspaceId, actorId: owner };
  const intent = await store.createUploadIntent({ ...context, idempotencyKey: "tombstone-source", mediaKind: "image", displayName: "Source", contentType: "image/png", byteSize: 10, checksumSha256: "d".repeat(64) });
  await store.recordUpload({ ...context, uploadIntentId: intent.id, objectKey: intent.objectKey, contentType: "image/png", byteSize: 10, checksumSha256: "d".repeat(64) });
  const asset = await store.finalizeUpload({ ...context, uploadIntentId: intent.id });
  const input = { ...context, idempotencyKey: "tombstone-group", name: "Group", description: "", mediaAssetIds: [asset.id], coverMediaId: asset.id };
  const group = await entities.createPersonalEntity(input);
  await store.deleteLibrary({ ...context, space: "personal", items: [{ kind: "entity", id: group.id, expectedVersion: group.version }] });
  expect((await pool.query("SELECT id FROM workspace_entities WHERE id=$1", [group.id])).rows).toHaveLength(1);
  expect((await pool.query("SELECT entity_id FROM entity_library_deletions WHERE entity_id=$1", [group.id])).rows).toHaveLength(1);
  await expect(new PostgresEntityStore(pool).createPersonalEntity(input)).rejects.toMatchObject({ name: "EntityCreateConflictError" });
  expect(await new PostgresEntityStore(pool).listPersonalEntities(context)).toEqual([]);
  const rls = await pool.query("SELECT relrowsecurity,has_table_privilege('anon',oid,'SELECT') AS anon_read,has_table_privilege('authenticated',oid,'SELECT') AS authenticated_read FROM pg_class WHERE relname='entity_library_deletions'");
  expect(rls.rows).toEqual([{ relrowsecurity: true, anon_read: false, authenticated_read: false }]);
});

it("persists independent group tags, keeps replayed rows untouched and composes tags with insert-only saves", async () => {
  const { store, entities, workspaceId, projectId, owner } = await createFixture();
  const context = { workspaceId, actorId: owner, space: "personal" as const };
  const intent = await store.createUploadIntent({ ...context, idempotencyKey: "persistent-tags", mediaKind: "image", displayName: "Source", contentType: "image/png", byteSize: 10, checksumSha256: "e".repeat(64) });
  await store.recordUpload({ ...context, uploadIntentId: intent.id, objectKey: intent.objectKey, contentType: "image/png", byteSize: 10, checksumSha256: "e".repeat(64) });
  const asset = await store.finalizeUpload({ ...context, uploadIntentId: intent.id });
  const group = await entities.createPersonalEntity({ ...context, idempotencyKey: "persistent-tag-group", name: "Persisted", description: "", mediaAssetIds: [asset.id], coverMediaId: asset.id });
  const items = [{ kind: "media" as const, id: asset.id }, { kind: "entity" as const, id: group.id }];
  const request = { ...context, operation: "add" as const, tagIds: ["builtin:scene"], items };
  await store.updateLibraryTags(request);
  const rowsBefore = await pool.query("SELECT * FROM media_asset_placements WHERE workspace_id=$1", [workspaceId]);
  const groupsBefore = await pool.query("SELECT * FROM entity_placements WHERE workspace_id=$1", [workspaceId]);
  await store.updateLibraryTags(request);
  expect((await pool.query("SELECT * FROM media_asset_placements WHERE workspace_id=$1", [workspaceId])).rows).toEqual(rowsBefore.rows);
  expect((await pool.query("SELECT * FROM entity_placements WHERE workspace_id=$1", [workspaceId])).rows).toEqual(groupsBefore.rows);
  await Promise.all([
    store.updateLibraryTags({ ...request, tagIds: ["builtin:object"] }),
    store.saveLibrary({ ...context, projectId, folderId: null, tagIds: [], items: [{ assetId: asset.id, displayName: "Ignored", action: "add" }] }),
  ]);
  const restarted = new Pool({ connectionString: databaseUrl.toString(), max: 1 });
  try {
    const catalog = await new PostgresAssetStore(restarted).listLibrary(context);
    expect(catalog.entries[0]).toMatchObject({ displayName: "Source", folderId: null, tagIds: ["builtin:object", "builtin:scene"] });
    expect(catalog.entityEntries).toEqual([{ entityId: group.id, space: "personal", folderId: null, addedAt: group.createdAt, tagIds: ["builtin:object", "builtin:scene"] }]);
    expect(await new PostgresEntityStore(restarted).getPersonalEntity({ ...context, entityId: group.id })).toEqual({ ...group, libraryTagIds: ["builtin:object", "builtin:scene"] });
  } finally { await restarted.end(); }
  const deletion = store.deleteLibrary({ ...context, items: [{ kind: "entity", id: group.id, expectedVersion: group.version }, { kind: "media", id: asset.id }] });
  const update = store.updateLibraryTags({ ...request, tagIds: ["builtin:character"] });
  const outcomes = await Promise.allSettled([deletion, update]);
  expect(outcomes[0].status).toBe("fulfilled");
  if (outcomes[1].status === "rejected") expect(outcomes[1].reason).toMatchObject({ code: "library_item_not_found" });
  expect(await store.listLibrary(context)).toMatchObject({ entries: [], entityEntries: [] });
});

it("allows organization admins and isolates personal targets across workspaces", async () => {
  const first = await createFixture(), second = await createFixture();
  const context = { workspaceId: first.workspaceId, actorId: first.owner };
  const intent = await first.store.createUploadIntent({ ...context, idempotencyKey: "admin-tags", mediaKind: "image", displayName: "Source", contentType: "image/png", byteSize: 10, checksumSha256: "f".repeat(64) });
  await first.store.recordUpload({ ...context, uploadIntentId: intent.id, objectKey: intent.objectKey, contentType: "image/png", byteSize: 10, checksumSha256: "f".repeat(64) });
  const asset = await first.store.finalizeUpload({ ...context, uploadIntentId: intent.id });
  await first.store.saveLibrary({ ...context, projectId: first.projectId, space: "organization", folderId: null, tagIds: [], items: [{ assetId: asset.id, displayName: "Shared", action: "add" }] });
  await pool.query("UPDATE memberships SET role='admin' WHERE workspace_id=$1 AND user_id=$2", [first.workspaceId, first.editor]);
  const request = { ...context, space: "organization" as const, operation: "add" as const, tagIds: ["builtin:object"], items: [{ kind: "media" as const, id: asset.id }] };
  await expect(first.store.updateLibraryTags({ ...request, actorId: first.editor })).resolves.toMatchObject({ entries: [expect.objectContaining({ space: "organization", tagIds: ["builtin:object"] })] });
  await pool.query("INSERT INTO memberships (workspace_id,user_id,role) VALUES ($1,$2,'member')", [second.workspaceId, first.owner]);
  await expect(second.store.updateLibraryTags({ ...request, workspaceId: second.workspaceId, space: "personal" })).rejects.toMatchObject({ code: "library_item_not_found" });
});

it("migrates retired sound references into the exact scoped dictionary without removing ordinary labels", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Temporary pre-migration tables keep this compatibility test independent from all real fixture rows.
    await client.query(`CREATE TEMP TABLE media_library_tags (
      id text PRIMARY KEY, workspace_id text, scope_kind text, owner_user_id text,
      scope_owner text GENERATED ALWAYS AS (COALESCE(owner_user_id,'')) STORED,
      name text, name_key text, UNIQUE(workspace_id,scope_kind,scope_owner,name_key)
    ) ON COMMIT DROP`);
    await client.query(`CREATE TEMP TABLE media_asset_placements (
      id text PRIMARY KEY, workspace_id text, scope_kind text, owner_user_id text,
      scope_owner text GENERATED ALWAYS AS (COALESCE(owner_user_id,'')) STORED,
      display_name text, folder_id text, tag_ids text[] NOT NULL
    ) ON COMMIT DROP`);
    await client.query("CREATE TEMP TABLE entity_placements (entity_id text PRIMARY KEY) ON COMMIT DROP");
    await client.query(`INSERT INTO media_library_tags (id,workspace_id,scope_kind,owner_user_id,name,name_key) VALUES
      ('existing-sound','first','personal','owner','音效','音效'), ('ordinary-others','first','personal','owner','Others','others')`);
    await client.query(`INSERT INTO media_asset_placements (id,workspace_id,scope_kind,owner_user_id,display_name,folder_id,tag_ids) VALUES
      ('personal','first','personal','owner','Personal name','folder-a',ARRAY['builtin:sound','existing-sound','ordinary-others']),
      ('organization','first','organization',NULL,'Organization name',NULL,ARRAY['builtin:sound','builtin:object']),
      ('another-workspace','second','personal','owner','Second workspace',NULL,ARRAY['builtin:sound']),
      ('untouched','first','personal','other','Untouched name',NULL,ARRAY['builtin:scene'])`);
    await client.query("INSERT INTO entity_placements VALUES ('empty-group')");
    await client.query(await readFile(new URL("../db/migrations/0017_entity_library_tags.sql", import.meta.url), "utf8"));
    const tags = (await client.query<{ id: string; workspace_id: string; scope_kind: string; owner_user_id: string | null; name: string }>("SELECT id,workspace_id,scope_kind,owner_user_id,name FROM media_library_tags ORDER BY id")).rows;
    expect(tags).toHaveLength(4);
    const rows = (await client.query<{ id: string; display_name: string; folder_id: string | null; tag_ids: string[] }>("SELECT id,display_name,folder_id,tag_ids FROM media_asset_placements ORDER BY id")).rows;
    expect(rows.find((row) => row.id === "personal")).toEqual({ id: "personal", display_name: "Personal name", folder_id: "folder-a", tag_ids: ["existing-sound", "ordinary-others"] });
    expect(rows.find((row) => row.id === "organization")?.tag_ids).toEqual(["builtin:object", tags.find((tag) => tag.scope_kind === "organization")!.id]);
    expect(rows.find((row) => row.id === "another-workspace")?.tag_ids).toEqual([tags.find((tag) => tag.workspace_id === "second")!.id]);
    expect(rows.find((row) => row.id === "untouched")?.tag_ids).toEqual(["builtin:scene"]);
    expect(rows.some((row) => row.tag_ids.includes("builtin:sound"))).toBe(false);
    expect((await client.query("SELECT * FROM entity_placements")).rows).toEqual([{ entity_id: "empty-group", tag_ids: [] }]);
  } finally { await client.query("ROLLBACK"); client.release(); }
});

verifyLibraryGroupDirectories(createFixture);
