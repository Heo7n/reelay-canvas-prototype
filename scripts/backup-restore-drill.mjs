import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const image = "postgres:18.4";
const ownershipLabel = "com.reelay.backup-drill";

export function assertLocalDockerEndpoint(endpoint) {
  if (!/^unix:\/\/\//.test(endpoint) && !/^npipe:\/\/\/\/\.\/pipe\//.test(endpoint)) {
    throw new Error("Backup drill requires a local Docker socket; remote Docker endpoints are refused.");
  }
}

export function assertOwnedDrillContainer(name, label, runId) {
  if (!/^[0-9a-f-]{36}$/.test(runId) || name !== `reelay-backup-drill-${runId}` || label !== runId) {
    throw new Error("Refusing to remove a container not owned by this backup drill.");
  }
}

export function fingerprintRows(rows) {
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

export function assertRestoredSnapshot(source, restored) {
  assert.deepEqual(restored, source, "Restored schema, row counts, or row content differ from the source.");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8", timeout: 45_000, maxBuffer: 8 * 1024 * 1024, ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${result.error?.message ?? result.stderr ?? "unknown error"}`);
  }
  return result.stdout.trim();
}

async function snapshot(pool) {
  const { rows: tables } = await pool.query(`
    SELECT c.relname AS name, c.relrowsecurity, c.relforcerowsecurity,
      COALESCE(c.relacl, acldefault('r', c.relowner))::text AS effective_acl
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname
  `);
  const result = { tables: [], columns: [], constraints: [], indexes: [], policies: [] };
  for (const table of tables) {
    const identifier = `"${table.name.replaceAll('"', '""')}"`;
    const { rows } = await pool.query(`SELECT to_jsonb(t)::text AS row FROM public.${identifier} t ORDER BY 1`);
    result.tables.push({ ...table, count: rows.length, sha256: fingerprintRows(rows) });
  }
  // Logical restore compacts dropped-column slots and can encode default ACLs as NULL.
  // Compare visible column order and effective grants, not physical catalog representation.
  result.columns = (await pool.query(`
    SELECT table_name, column_name,
      (row_number() OVER (PARTITION BY table_name ORDER BY ordinal_position))::integer AS position,
      data_type, is_nullable, column_default
    FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position
  `)).rows;
  result.constraints = (await pool.query(`
    SELECT c.conrelid::regclass::text AS table_name, c.conname, pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'public' ORDER BY table_name, c.conname
  `)).rows;
  result.indexes = (await pool.query(`
    SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname
  `)).rows;
  result.policies = (await pool.query(`
    SELECT * FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname
  `)).rows;
  return result;
}

async function seedSamples(pool, objectRoot) {
  const { seedDemoDatabase } = await import("../src/server/db/seed.ts");
  const { PostgresAssetStore } = await import("../src/server/infrastructure/PostgresAssetStore.ts");
  const { FileSystemObjectStore } = await import("../src/server/infrastructure/FileSystemObjectStore.ts");
  const { DEMO_ASSET_FIXTURES } = await import("../src/config/entity-demo-fixtures.ts");
  const { DEMO_MEDIA_FIXTURES } = await import("../src/config/media-demo-fixtures.ts");
  const { DEMO_ACTOR_ID: actorId, DEMO_WORKSPACE_ID: workspaceId, DEMO_PROJECT_ID: projectId } =
    await import("../src/server/db/demo-asset-fixtures.ts");
  await seedDemoDatabase(pool);
  const assetStore = new PostgresAssetStore(pool);
  const objectStore = new FileSystemObjectStore(objectRoot);
  const fixtures = [DEMO_ASSET_FIXTURES[0], ...["video", "audio"].map((kind) =>
    DEMO_MEDIA_FIXTURES.find((fixture) => fixture.mediaKind === kind))];
  const assets = [];
  for (const fixture of fixtures) {
    assert.ok(fixture, "A published fixture is required for every media kind.");
    const fixtureDirectory = fixture.mediaKind === "image" ? "home" : "experience-media";
    const body = await readFile(path.join(root, "assets", fixtureDirectory, fixture.fileName));
    const checksumSha256 = createHash("sha256").update(body).digest("hex");
    assert.equal(checksumSha256, fixture.goldenChecksumSha256);
    const intent = await assetStore.createUploadIntent({
      actorId, workspaceId, idempotencyKey: `backup-drill-${fixture.key}`,
      mediaKind: fixture.mediaKind, displayName: fixture.displayName,
      contentType: fixture.contentType, byteSize: body.length, checksumSha256,
    });
    const stored = await objectStore.putObject({ objectKey: intent.objectKey, contentType: fixture.contentType, body });
    await assetStore.recordUpload({ actorId, workspaceId, uploadIntentId: intent.id, ...stored });
    const asset = await assetStore.finalizeUpload({ actorId, workspaceId, uploadIntentId: intent.id });
    await assetStore.attachAssetToProject({ actorId, projectId, assetId: asset.id });
    assets.push(asset);
  }
  await pool.query(`
    INSERT INTO canvas_documents (project_id, canvas_id, schema_version, revision, content,
      created_by_user_id, updated_by_user_id)
    VALUES ($1, 'backup-drill', 1, 7, $2::jsonb, $3, $3)
  `, [projectId, JSON.stringify({ nodes: assets.map((asset) => ({ id: asset.id, assetId: asset.id })) }), actorId]);
  return assets;
}

async function verifyObjects(pool, objectRoot) {
  const { FileSystemObjectStore } = await import("../src/server/infrastructure/FileSystemObjectStore.ts");
  const store = new FileSystemObjectStore(objectRoot);
  const { rows } = await pool.query(`
    SELECT object_key, byte_size::text, checksum_sha256, content_type
    FROM workspace_media_assets ORDER BY id
  `);
  let bytes = 0;
  for (const row of rows) {
    const object = await store.getObject(row.object_key);
    assert.ok(object, "Restored media object is missing.");
    assert.equal(object.body.length, Number(row.byte_size));
    assert.equal(object.contentType, row.content_type);
    assert.equal(createHash("sha256").update(object.body).digest("hex"), row.checksum_sha256);
    bytes += object.body.length;
  }
  return { count: rows.length, bytes, verified: "all original media bytes and SHA-256" };
}

async function main() {
  if (process.argv.length !== 2) throw new Error("This sample drill accepts no database URL or target arguments.");
  process.chdir(root);
  const context = run("docker", ["context", "show"]);
  const endpoint = run("docker", ["context", "inspect", context, "--format", "{{.Endpoints.docker.Host}}"]);
  assertLocalDockerEndpoint(endpoint);
  const docker = (args, options) => run("docker", ["--context", context, ...args], options);
  docker(["info", "--format", "{{.ServerVersion}}"]);
  // Never pull a large image or start the retained source Compose service as a side effect.
  const imageId = docker(["image", "inspect", image, "--format", "{{.Id}}"]);
  const runId = randomUUID();
  const containerName = `reelay-backup-drill-${runId}`;
  const output = path.join(root, ".reelay-data", "backup-drills", runId);
  await mkdir(path.dirname(output), { recursive: true });
  await mkdir(output);
  const password = randomUUID();
  const pools = [];
  let created = false;
  let report;
  const started = Date.now();
  try {
    docker(["run", "--detach", "--pull", "never", "--name", containerName,
      "--label", `${ownershipLabel}=${runId}`, "--env", "POSTGRES_PASSWORD",
      "--mount", "type=tmpfs,destination=/var/lib/postgresql,tmpfs-size=536870912",
      "--publish", "127.0.0.1::5432", image], { env: { ...process.env, POSTGRES_PASSWORD: password } });
    created = true;
    const mapping = docker(["port", containerName, "5432/tcp"]);
    const portMatch = /^127\.0\.0\.1:(\d+)$/.exec(mapping);
    assert.ok(portMatch, "Drill database must publish only on local loopback.");
    const { Pool } = await import("pg");
    const connect = (database) => {
      const pool = new Pool({ host: "127.0.0.1", port: Number(portMatch[1]), user: "postgres", password,
        database, max: 1, connectionTimeoutMillis: 1000, options: "-c timezone=UTC" });
      pools.push(pool);
      return pool;
    };
    const admin = connect("postgres");
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      try { await admin.query("SELECT 1"); ready = true; break; }
      catch { await new Promise((resolve) => setTimeout(resolve, 1000)); }
    }
    assert.ok(ready, "Isolated PostgreSQL did not become ready within 30 seconds.");
    await admin.query("CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN");
    await admin.query("CREATE DATABASE drill_source");
    await admin.query("CREATE DATABASE drill_restored");
    const source = connect("drill_source");
    const restored = connect("drill_restored");
    const { runMigrations } = await import("../src/server/db/migrate.ts");
    const migrations = await runMigrations(source);
    await seedSamples(source, path.join(output, "source-objects"));
    const before = await snapshot(source);
    docker(["exec", containerName, "pg_dump", "-U", "postgres", "-d", "drill_source", "--format=custom",
      "--no-owner", "--file=/tmp/reelay-backup.dump"]);
    await cp(path.join(output, "source-objects"), path.join(output, "backup-objects"), { recursive: true });
    docker(["cp", `${containerName}:/tmp/reelay-backup.dump`, path.join(output, "database.dump")]);
    // Restore the actual exported artifact, not a second copy obtained from the live source.
    docker(["cp", path.join(output, "database.dump"), `${containerName}:/tmp/reelay-restore.dump`]);
    docker(["exec", containerName, "pg_restore", "-U", "postgres", "-d", "drill_restored", "--exit-on-error",
      "--single-transaction", "--no-owner", "/tmp/reelay-restore.dump"]);
    await cp(path.join(output, "backup-objects"), path.join(output, "restored-objects"), { recursive: true });
    assertRestoredSnapshot(before, await snapshot(restored));
    const objects = await verifyObjects(restored, path.join(output, "restored-objects"));
    const archive = await readFile(path.join(output, "database.dump"));
    report = {
      version: 1, completedAt: new Date().toISOString(), scope: "local repository samples only; no cloud data",
      image, imageId, migrations: migrations.length, tables: before.tables,
      schemaVerified: "columns, constraints, indexes, RLS flags, table ACLs, policies", objects,
      archive: { bytes: archive.length, sha256: createHash("sha256").update(archive).digest("hex") },
      elapsedMs: Date.now() - started,
    };
  } finally {
    await Promise.allSettled(pools.map((pool) => pool.end()));
    if (created) {
      const label = docker(["inspect", containerName, "--format", `{{index .Config.Labels "${ownershipLabel}"}}`]);
      assertOwnedDrillContainer(containerName, label, runId);
      docker(["rm", "--force", "--volumes", containerName]);
    }
  }
  await writeFile(path.join(output, "report.json"), `${JSON.stringify({ ...report, containerRemoved: true }, null, 2)}\n`);
  console.log(`Backup/restore drill passed: ${report.tables.length} tables, ${report.objects.count} objects; ${report.elapsedMs} ms.`);
  console.log(`Sample evidence: ${path.relative(root, path.join(output, "report.json"))}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
