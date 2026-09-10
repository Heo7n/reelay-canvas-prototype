import assert from "node:assert/strict";
import { test } from "node:test";

import { createSharedServerEnvironment, SHARED_DEVELOPMENT_PROJECT_REF } from "./start-shared-server.mjs";

const configuration = {
  REELAY_SHARED_PROJECT_REF: SHARED_DEVELOPMENT_PROJECT_REF,
  DATABASE_URL: `postgresql://postgres.${SHARED_DEVELOPMENT_PROJECT_REF}:test@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`,
  SUPABASE_URL: `https://${SHARED_DEVELOPMENT_PROJECT_REF}.supabase.co`,
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test-only",
  REELAY_SUPABASE_STORAGE_BUCKET: "reelay-assets",
};

test("shared entry uses its dedicated credentials and removes inherited deployment and seed settings", () => {
  const result = createSharedServerEnvironment({
    Path: "windows-path", NODE_ENV: "production", database_url: "wrong-database",
    MIGRATION_DATABASE_URL: "deployment-database", REELAY_OBJECT_STORE_ROOT: "old-files",
    SUPABASE_SERVICE_ROLE_KEY: "wrong-key", VERCEL: "1", ALLOW_DEMO_SEED: "true",
    ALLOW_DEMO_ASSET_SEED: "true", PGHOST: "wrong-host", PORT: "9000",
  }, configuration);
  assert.equal(result.Path, "windows-path");
  assert.equal(result.DATABASE_URL, configuration.DATABASE_URL);
  assert.equal(result.SUPABASE_SERVICE_ROLE_KEY, configuration.SUPABASE_SERVICE_ROLE_KEY);
  assert.equal(result.REELAY_OBJECT_STORAGE, "supabase");
  assert.equal(result.NODE_ENV, "development");
  assert.equal(result.REELAY_SERVER_HOST, "127.0.0.1");
  assert.equal(result.PORT, "5175");
  for (const key of ["database_url", "MIGRATION_DATABASE_URL", "REELAY_OBJECT_STORE_ROOT", "VERCEL", "ALLOW_DEMO_SEED", "ALLOW_DEMO_ASSET_SEED", "PGHOST"]) {
    assert.equal(result[key], undefined);
  }
});

test("a missing file setting cannot be satisfied by inherited credentials", () => {
  for (const key of Object.keys(configuration)) {
    const missing = { ...configuration };
    delete missing[key];
    assert.throws(() => createSharedServerEnvironment(configuration, missing), new RegExp(key));
  }
});

test("the dedicated file can opt out of retaining an idle connection", () => {
  const environment = createSharedServerEnvironment({ REELAY_DB_POOL_MIN: "9" }, { ...configuration, REELAY_DB_POOL_MIN: "0" });
  assert.equal(environment.REELAY_DB_POOL_MIN, "0");
  assert.equal(createSharedServerEnvironment({ REELAY_DB_POOL_MIN: "9" }, configuration).REELAY_DB_POOL_MIN, undefined);
});

test("a mismatched project and environment overrides fail before starting a server", () => {
  assert.throws(() => createSharedServerEnvironment({}, { ...configuration, REELAY_SHARED_PROJECT_REF: "otherproject" }), /must match/);
  assert.throws(() => createSharedServerEnvironment({}, {
    ...configuration,
    REELAY_SHARED_PROJECT_REF: "publicdemoproject",
    SUPABASE_URL: "https://publicdemoproject.supabase.co",
    DATABASE_URL: "postgresql://postgres.publicdemoproject:test@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres",
  }), /must match/);
  for (const key of ["NODE_ENV", "ALLOW_DEMO_SEED", "MIGRATION_DATABASE_URL", "VITE_SUPABASE_SERVICE_ROLE_KEY"]) {
    assert.throws(() => createSharedServerEnvironment({}, { ...configuration, [key]: "private-value" }), (error) => {
      assert.match(error.message, /Unsupported/);
      assert.ok(!error.message.includes("private-value"));
      return true;
    });
  }
});
