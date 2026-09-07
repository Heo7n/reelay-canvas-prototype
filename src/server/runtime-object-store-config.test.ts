import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { FileSystemObjectStore } from "./infrastructure/FileSystemObjectStore";
import { SupabaseObjectStore } from "./infrastructure/SupabaseObjectStore";
import { createRuntimeObjectStore } from "./runtime-object-store-config";

const projectRef = "abcdefghijklmnopqrst";
const validEnvironment = {
  REELAY_OBJECT_STORAGE: "supabase",
  DATABASE_URL: `postgresql://postgres.${projectRef}:runtime-password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`,
  SUPABASE_URL: `https://${projectRef}.supabase.co`,
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_runtime_test",
  REELAY_SUPABASE_STORAGE_BUCKET: "reelay-assets",
};

describe("runtime object storage", () => {
  it("defaults to the configured filesystem directory without requiring cloud configuration", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "reelay-runtime-object-store-"));
    try {
      const store = createRuntimeObjectStore({ REELAY_OBJECT_STORE_ROOT: root });
      expect(store).toBeInstanceOf(FileSystemObjectStore);
      await store.putObject({ objectKey: "test/image.png", contentType: "image/png", body: new Uint8Array([1, 2, 3]) });
      const reopened = new FileSystemObjectStore(root);
      expect((await reopened.getObject("test/image.png"))?.body).toEqual(new Uint8Array([1, 2, 3]));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each([
    validEnvironment.DATABASE_URL,
    `postgresql://postgres:runtime-password@db.${projectRef}.supabase.co:5432/postgres?sslmode=require`,
    `postgres://postgres:runtime-password@db.${projectRef}.supabase.co/postgres`,
  ])("uses the existing Supabase adapter for direct or session connections (%s)", (databaseUrl) => {
    expect(createRuntimeObjectStore({
      ...validEnvironment, DATABASE_URL: databaseUrl, REELAY_OBJECT_STORAGE: " Supabase ",
    })).toBeInstanceOf(SupabaseObjectStore);
  });

  it.each([
    ["missing database URL", { DATABASE_URL: undefined }],
    ["blank database URL", { DATABASE_URL: " " }],
    ["missing storage URL", { SUPABASE_URL: undefined }],
    ["missing server secret", { SUPABASE_SERVICE_ROLE_KEY: undefined }],
    ["publishable key", { SUPABASE_SERVICE_ROLE_KEY: "sb_publishable_browser_test" }],
    ["missing bucket", { REELAY_SUPABASE_STORAGE_BUCKET: undefined }],
    ["invalid bucket", { REELAY_SUPABASE_STORAGE_BUCKET: "../another-bucket" }],
    ["unrecognized storage mode", { REELAY_OBJECT_STORAGE: "cloud-auto" }],
    ["local database with cloud objects", { DATABASE_URL: "postgresql://reelay:test@127.0.0.1:54329/reelay" }],
    ["other project direct host", { DATABASE_URL: "postgresql://postgres:test@db.anotherproject.supabase.co:5432/postgres" }],
    ["other project pooled user", { DATABASE_URL: validEnvironment.DATABASE_URL.replace(`postgres.${projectRef}`, "postgres.anotherproject") }],
    ["transaction pooler", { DATABASE_URL: validEnvironment.DATABASE_URL.replace(":5432/", ":6543/") }],
    ["missing database password", { DATABASE_URL: validEnvironment.DATABASE_URL.replace(":runtime-password", "") }],
    ["wrong database", { DATABASE_URL: validEnvironment.DATABASE_URL.replace(/\/postgres$/, "/another_database") }],
    ["malformed username", { DATABASE_URL: validEnvironment.DATABASE_URL.replace(`postgres.${projectRef}`, `postgres%ZZ.${projectRef}`) }],
    ["malformed password", { DATABASE_URL: validEnvironment.DATABASE_URL.replace("runtime-password", "%ZZ") }],
    ["invalid connection URL", { DATABASE_URL: "runtime-password@invalid" }],
    ["non-Postgres protocol", { DATABASE_URL: validEnvironment.DATABASE_URL.replace("postgresql:", "https:") }],
    ["connection URL fragment", { DATABASE_URL: `${validEnvironment.DATABASE_URL}#ignored` }],
    ["other storage project", { SUPABASE_URL: "https://anotherproject.supabase.co" }],
    ["non-Supabase origin", { SUPABASE_URL: "https://example.com" }],
    ["insecure origin", { SUPABASE_URL: `http://${projectRef}.supabase.co` }],
    ["origin credentials", { SUPABASE_URL: `https://private-key@${projectRef}.supabase.co` }],
    ["origin path", { SUPABASE_URL: `${validEnvironment.SUPABASE_URL}/storage/v1` }],
  ] satisfies Array<[string, NodeJS.ProcessEnv]>)("rejects %s without filesystem fallback or secret disclosure", (_label, overrides) => {
    expect(() => createRuntimeObjectStore({ ...validEnvironment, ...overrides })).toThrow();
    try {
      createRuntimeObjectStore({ ...validEnvironment, ...overrides });
    } catch (error) {
      expect((error as Error).message).not.toMatch(/runtime-password|sb_secret_runtime_test|private-key/);
    }
  });

  it.each(["host", "hostaddr", "user", "password", "database", "port", "service", "sslrootcert"])(
    "rejects PostgreSQL query overrides (%s) before pg can redirect the verified connection",
    (parameter) => {
      expect(() => createRuntimeObjectStore({
        ...validEnvironment, DATABASE_URL: `${validEnvironment.DATABASE_URL}?${parameter}=other`,
      })).toThrow(/must not override connection settings/);
    },
  );
});
