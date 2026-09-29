import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalPreviewPlan } from "./start-local-preview.mjs";
import { checkReleaseCI } from "./check-release-ci.mjs";
import { validateOrigin, verifyExperience } from "./verify-experience.mjs";

const sha = "a".repeat(40);
const configuration = {
  REELAY_PREVIEW_FRONTEND_PORT: "5182", REELAY_PREVIEW_API_PORT: "5183",
  REELAY_PREVIEW_DB_CONTAINER: "existing-preview",
  DATABASE_URL: "postgresql://local:private-test-value@127.0.0.1:5432/existing",
  REELAY_OBJECT_STORE_ROOT: ".reelay-data/existing/objects",
};
const options = { root: process.cwd(), isDirectory: () => true, resolveBinding: () => "127.0.0.1:6543\n" };

test("local server preserves explicit existing data and removes inherited cloud, migration and seed settings", () => {
  const plan = createLocalPreviewPlan("server", configuration, { ...options, baseEnvironment: { Path: "system", DATABASE_URL: "remote", SUPABASE_SERVICE_ROLE_KEY: "old", REELAY_OBJECT_STORE_ROOT: "wrong", ALLOW_DEMO_SEED: "true", MIGRATION_DATABASE_URL: "wrong", PGHOST: "wrong", VERCEL: "1" } });
  assert.equal(plan.env.Path, "system"); assert.equal(plan.env.PORT, "5183");
  assert.equal(plan.env.DATABASE_URL, "postgresql://local:private-test-value@127.0.0.1:6543/existing");
  assert.equal(plan.env.REELAY_OBJECT_STORE_ROOT, path.resolve(options.root, configuration.REELAY_OBJECT_STORE_ROOT));
  assert.equal(plan.env.REELAY_OBJECT_STORAGE, "filesystem");
  assert.equal(plan.env.REELAY_SERVER_HOST, "127.0.0.1");
  for (const key of ["SUPABASE_SERVICE_ROLE_KEY", "ALLOW_DEMO_SEED", "MIGRATION_DATABASE_URL", "PGHOST", "VERCEL"]) assert.equal(plan.env[key], undefined);
  assert.deepEqual(plan.args, ["--import", "tsx", "src/server/start.ts"]);
});

test("frontend receives only its explicit API port and never resolves database credentials", () => {
  const plan = createLocalPreviewPlan("frontend", configuration, { ...options, baseEnvironment: { DATABASE_URL: "old", SUPABASE_SERVICE_ROLE_KEY: "old" }, resolveBinding: () => { throw new Error("must not run docker"); } });
  assert.equal(plan.env.DATABASE_URL, undefined); assert.equal(plan.env.SUPABASE_SERVICE_ROLE_KEY, undefined);
  assert.equal(plan.env.REELAY_DEV_API_PORT, "5183"); assert.equal(plan.port, "5182");
  assert.ok(plan.args.includes("--strictPort"));
});

test("invalid local targets fail without leaking credentials or initializing directories", () => {
  for (const database of ["postgresql://local:private-test-value@remote.example:5432/db", "postgresql://local:private-test-value@localhost:5432/db?host=remote", "invalid", "postgresql://localhost:5432/db"]) {
    assert.throws(() => createLocalPreviewPlan("server", { ...configuration, DATABASE_URL: database }, options), (error) => !error.message.includes("private-test-value"));
  }
  assert.throws(() => createLocalPreviewPlan("server", configuration, { ...options, isDirectory: () => false }), /already exist/);
  assert.throws(() => createLocalPreviewPlan("server", configuration, { ...options, resolveBinding: () => "0.0.0.0:5432" }), /loopback/);
  assert.throws(() => createLocalPreviewPlan("server", { ...configuration, ALLOW_DEMO_SEED: "true" }, options), /Unsupported/);
  assert.throws(() => createLocalPreviewPlan("frontend", { ...configuration, REELAY_PREVIEW_FRONTEND_PORT: "5183" }, options), /distinct/);
});

function ciFixture({ runs, jobs } = {}) {
  return { repository: "example/reelay", sha, readJSON: async (endpoint) => endpoint.includes("/attempts/")
    ? { jobs: jobs || ["quality", "browser", "postgres"].map((name) => ({ name, status: "completed", conclusion: "success", html_url: `https://example.test/${name}` })) }
    : { workflow_runs: runs || [{ id: 10, run_number: 4, run_attempt: 1, head_sha: sha, event: "push", status: "completed", conclusion: "success", html_url: "https://example.test/run" }] } };
}

test("release CI accepts exactly the source push/manual and all three successful jobs", async () => {
  const result = await checkReleaseCI(ciFixture());
  assert.equal(result.sourceCommit, sha); assert.equal(result.checks.length, 3); assert.equal(result.event, "push");
});

test("missing, foreign SHA and PR merge runs cannot attest the release source", async () => {
  for (const runs of [[], [{ head_sha: "b".repeat(40), event: "push" }], [{ head_sha: sha, event: "pull_request" }]]) {
    await assert.rejects(checkReleaseCI(ciFixture({ runs })), /No push\/manual/);
  }
});

test("a newer failed or pending source run cannot fall back to an old success", async () => {
  for (const status of ["completed", "in_progress"]) {
    await assert.rejects(checkReleaseCI(ciFixture({ runs: [
      { id: 1, run_number: 1, run_attempt: 1, head_sha: sha, event: "push", status: "completed", conclusion: "success" },
      { id: 2, run_number: 2, run_attempt: 1, head_sha: sha, event: "workflow_dispatch", status, conclusion: status === "completed" ? "failure" : null },
    ] })), /Latest source CI/);
  }
});

test("skipped, absent or duplicated required jobs fail closed", async () => {
  for (const jobs of [[], [{ name: "quality", status: "completed", conclusion: "skipped" }], [{ name: "quality", status: "completed", conclusion: "success" }, { name: "quality", status: "completed", conclusion: "success" }]]) {
    await assert.rejects(checkReleaseCI(ciFixture({ jobs })), /Required job/);
  }
});

async function experienceFixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "reelay-delivery-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const files = new Map([
    ["experience-release.json", Buffer.from(JSON.stringify({ runtime: "ephemeral-experience", assets: 1, releaseCommit: sha }))],
    ["app-shell.html", Buffer.from("<!doctype html><main>Review</main>")],
    ["assets/demo.mp4", Buffer.alloc(300 * 1024, 9)],
  ]);
  await mkdir(path.join(directory, "assets"));
  for (const [file, bytes] of files) await writeFile(path.join(directory, file), bytes);
  const requests = [];
  const request = async (url, { range }) => {
    const route = new URL(url).pathname;
    requests.push({ route, range });
    if (route === "/api/health") return { status: 404, bytes: Buffer.from("Missing") };
    const bytes = route.startsWith("/app") ? files.get("app-shell.html") : files.get(route.slice(1));
    if (!bytes) return { status: 404, bytes: Buffer.alloc(0) };
    return range ? { status: 206, bytes: bytes.subarray(0, 1024), contentRange: `bytes 0-1023/${bytes.length}` } : { status: 200, bytes };
  };
  return { directory, origin: "https://preview.example.test", expectedCommit: sha, request, files, requests };
}

test("experience verification records full hashes, explicit prefix checks, source metadata and SPA/API/video boundaries", async (t) => {
  const fixture = await experienceFixture(t);
  const result = await verifyExperience(fixture);
  assert.equal(result.release.releaseCommit, sha); assert.equal(result.fullHashFiles, 2); assert.equal(result.rangeFiles, 1);
  assert.equal(result.apiStatus, 404); assert.equal(result.spaRoutes, 2); assert.equal(result.videoRangeStatus, 206);
  const full = await verifyExperience({ ...fixture, fullMedia: true });
  assert.equal(full.fullHashFiles, 3); assert.equal(full.rangeFiles, 0);
});

test("wrong local source SHA fails before network and wrong deployed bytes fail verification", async (t) => {
  const fixture = await experienceFixture(t);
  await assert.rejects(verifyExperience({ ...fixture, expectedCommit: "b".repeat(40) }), /metadata/);
  assert.equal(fixture.requests.length, 0);
  await assert.rejects(verifyExperience({ ...fixture, request: async (url, options) => {
    const response = await fixture.request(url, options);
    return url.endsWith("experience-release.json") ? { ...response, bytes: Buffer.from("wrong source") } : response;
  } }), /Artifact mismatch/);
});

test("incorrect ranges and accidentally exposed API fail verification", async (t) => {
  const fixture = await experienceFixture(t);
  await assert.rejects(verifyExperience({ ...fixture, request: async (url, options) => ({ ...await fixture.request(url, options), contentRange: "bytes 0-1023/1" }) }), /Artifact mismatch/);
  await assert.rejects(verifyExperience({ ...fixture, request: async (url, options) => url.endsWith("/api/health") ? { status: 200, bytes: Buffer.from("ok") } : fixture.request(url, options) }), /exposes API/);
});

test("verification origins reject credential-bearing URLs and insecure remote hosts", () => {
  assert.equal(validateOrigin("http://127.0.0.1:5182"), "http://127.0.0.1:5182");
  for (const origin of ["http://remote.example", "https://user:secret@example.test", "https://example.test/?token=secret", "https://example.test/app"]) assert.throws(() => validateOrigin(origin), /without credentials/);
});
