import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { capturePool } = vi.hoisted(() => ({ capturePool: vi.fn() }));
vi.mock("pg", () => ({ Pool: class { constructor(options: unknown) { capturePool(options); } on() { return this; } } }));

import { buildServer } from "./app";
import { DEFAULT_LOCAL_DATABASE_URL } from "./db/config";
import { createDemoSeed, DEMO_PASSWORD } from "./demo-fixtures";
import { FileSystemObjectStore } from "./infrastructure/FileSystemObjectStore";
import { InMemoryAssetStore } from "./infrastructure/InMemoryAssetStore";
import { InMemoryCollaborationStore } from "./infrastructure/InMemoryCollaborationStore";
import { PostgresAssetStore } from "./infrastructure/PostgresAssetStore";
import { PostgresCollaborationStore } from "./infrastructure/PostgresCollaborationStore";
import { PostgresEntityStore } from "./infrastructure/PostgresEntityStore";
import { SupabaseObjectStore } from "./infrastructure/SupabaseObjectStore";
import { createServerDependencies } from "./server-dependencies";

describe("server dependency composition", () => {
  beforeEach(() => capturePool.mockClear());
  afterEach(() => vi.unstubAllEnvs());

  it("does not advertise process-local asset persistence in memory mode", async () => {
    const dependencies = createServerDependencies({ REELAY_STORAGE: "memory" });
    expect(dependencies.assetStore).toBeUndefined();
    expect(dependencies.entityStore).toBeUndefined();
    expect(dependencies.objectStore).toBeUndefined();
    expect(capturePool).not.toHaveBeenCalled();

    const app = await buildServer(dependencies);
    try {
      await expect(app.inject({ method: "GET", url: "/api/health" }).then((response) => response.json()))
        .resolves.toEqual({ status: "ok", storage: "server-memory" });
      const capabilityProbe = await app.inject({
        method: "GET",
        url: "/api/workspaces/workspace-organization-reelay/media-assets",
      });
      expect(capabilityProbe.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it("keeps the default local PostgreSQL and filesystem adapters", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://wrong:password@127.0.0.1:5432/wrong");
    const dependencies = createServerDependencies({});
    expect(dependencies.store).toBeInstanceOf(PostgresCollaborationStore);
    expect(dependencies.assetStore).toBeInstanceOf(PostgresAssetStore);
    expect(dependencies.entityStore).toBeInstanceOf(PostgresEntityStore);
    expect(dependencies.objectStore).toBeInstanceOf(FileSystemObjectStore);
    expect(dependencies.maxAssetUploadBytes).toBeUndefined();
    expect(capturePool.mock.lastCall?.[0].connectionString).toBe(DEFAULT_LOCAL_DATABASE_URL);
  });

  it("uses the validated environment for both PostgreSQL and Supabase storage", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://wrong:password@127.0.0.1:5432/wrong");
    const databaseUrl = "postgresql://postgres.abcdefghijklmnopqrst:test@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres";
    const dependencies = createServerDependencies({
      DATABASE_URL: databaseUrl,
      REELAY_OBJECT_STORAGE: "supabase",
      SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "sb_secret_dependency_test",
      REELAY_SUPABASE_STORAGE_BUCKET: "reelay-assets",
    });
    expect(dependencies.store).toBeInstanceOf(PostgresCollaborationStore);
    expect(dependencies.assetStore).toBeInstanceOf(PostgresAssetStore);
    expect(dependencies.entityStore).toBeInstanceOf(PostgresEntityStore);
    expect(dependencies.objectStore).toBeInstanceOf(SupabaseObjectStore);
    expect(dependencies.maxAssetUploadBytes).toBe(50 * 1024 * 1024);
    expect(capturePool.mock.lastCall?.[0].connectionString).toBe(databaseUrl);
    expect(capturePool.mock.lastCall?.[0].ssl.rejectUnauthorized).toBe(true);
  });

  it.each([
    { storage: "supabase", byteSize: 50 * 1024 * 1024, statusCode: 201 },
    { storage: "supabase", byteSize: 50 * 1024 * 1024 + 1, statusCode: 413 },
    { storage: "filesystem", byteSize: 50 * 1024 * 1024 + 1, statusCode: 201 },
  ])("applies the $storage limit to upload intents before accepting bytes ($byteSize)", async ({ storage, byteSize, statusCode }) => {
    const dependencies = createServerDependencies({
      DATABASE_URL: "postgresql://postgres.abcdefghijklmnopqrst:test@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres",
      REELAY_OBJECT_STORAGE: storage,
      SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "sb_secret_dependency_test",
      REELAY_SUPABASE_STORAGE_BUCKET: "reelay-assets",
    });
    const seed = createDemoSeed();
    const store = new InMemoryCollaborationStore(seed);
    const assetStore = new InMemoryAssetStore({ workspaceMemberships: seed.memberships, projects: [] });
    const createIntent = vi.spyOn(assetStore, "createUploadIntent");
    const app = await buildServer({ ...dependencies, store, assetStore });
    try {
      const login = await app.inject({ method: "POST", url: "/api/demo/session", payload: { account: "creator@reelay.test", password: DEMO_PASSWORD } });
      expect(login.statusCode).toBe(201);
      const cookies = login.headers["set-cookie"];
      const sessionCookie = (Array.isArray(cookies) ? cookies[0] : cookies)?.split(";", 1)[0];
      const response = await app.inject({
        method: "POST", url: "/api/workspaces/workspace-organization-reelay/media-upload-intents",
        headers: { cookie: sessionCookie },
        payload: { idempotencyKey: "runtime-limit-contract", mediaKind: "image", displayName: "large.png", contentType: "image/png", byteSize, checksumSha256: "a".repeat(64) },
      });
      expect(response.statusCode).toBe(statusCode);
      if (statusCode === 413) {
        expect(response.json().error).toEqual({ code: "asset_too_large", message: "当前环境单个素材最大支持 50 MB。" });
        expect(createIntent).not.toHaveBeenCalled();
      } else expect(createIntent).toHaveBeenCalledOnce();
    } finally { await app.close(); }
  });

  it.each([
    { REELAY_OBJECT_STORAGE: "supabase" },
    { REELAY_OBJECT_STORAGE: "unknown" },
    {
      REELAY_OBJECT_STORAGE: "supabase",
      DATABASE_URL: "postgresql://postgres.abcdefghijklmnopqrst:test@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres",
      SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
      REELAY_SUPABASE_STORAGE_BUCKET: "reelay-assets",
    },
    { NODE_ENV: "production" },
  ])("fails incomplete or unsupported configuration before creating a pool", (environment) => {
    expect(() => createServerDependencies(environment)).toThrow();
    expect(capturePool).not.toHaveBeenCalled();
  });
});
