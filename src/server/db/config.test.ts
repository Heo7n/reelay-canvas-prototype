import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";

const { capturePool } = vi.hoisted(() => ({ capturePool: vi.fn() }));
vi.mock("pg", () => ({ Pool: class extends EventEmitter { constructor(options: unknown) { super(); capturePool(options); } } }));
import { createPostgresPool, DEFAULT_LOCAL_DATABASE_URL, getDatabaseUrl } from "./config";

afterEach(() => vi.unstubAllEnvs());

describe("Supabase database transport", () => {
  it.each([
    "postgresql://postgres:test@db.exampleproject.supabase.co:5432/postgres?sslmode=disable",
    "postgresql://postgres.exampleproject:test@aws-0-us-east-2.pooler.supabase.com:6543/postgres?sslmode=require",
  ])("pins the official CA for direct and pooled connections", (connection) => {
    createPostgresPool(connection);
    const options = capturePool.mock.lastCall?.[0];
    expect(options.connectionString).not.toContain("sslmode");
    expect(options.ssl.rejectUnauthorized).toBe(true);
    expect(options.ssl.ca).toContain("BEGIN CERTIFICATE");
  });

  it.each([["", 60_000], ["1", 10_000]] as const)("bounds idle reuse for VERCEL=%s", (vercel, idleTimeout) => {
    vi.stubEnv("VERCEL", vercel);
    vi.stubEnv("REELAY_DB_IDLE_TIMEOUT_MS", "");
    createPostgresPool("postgresql://local:local@127.0.0.1:54329/reelay");
    expect(capturePool.mock.lastCall?.[0].idleTimeoutMillis).toBe(idleTimeout);
  });

  it("preserves an explicitly configured idle timeout", () => {
    vi.stubEnv("REELAY_DB_IDLE_TIMEOUT_MS", "25000");
    createPostgresPool("postgresql://local:local@127.0.0.1:54329/reelay");
    expect(capturePool.mock.lastCall?.[0].idleTimeoutMillis).toBe(25_000);
  });

  it("keeps one established connection only for persistent processes by default", () => {
    createPostgresPool(DEFAULT_LOCAL_DATABASE_URL, {});
    expect(capturePool.mock.lastCall?.[0]).toMatchObject({ min: 1, keepAlive: true, keepAliveInitialDelayMillis: 10_000 });
    createPostgresPool(DEFAULT_LOCAL_DATABASE_URL, { VERCEL: "1" });
    expect(capturePool.mock.lastCall?.[0]).toMatchObject({ min: 0, max: 2 });
  });

  it("allows bounded minimum overrides including zero without ambient leakage", () => {
    vi.stubEnv("REELAY_DB_POOL_MIN", "8");
    createPostgresPool(DEFAULT_LOCAL_DATABASE_URL, { REELAY_DB_POOL_MIN: "0", REELAY_DB_POOL_MAX: "1" });
    expect(capturePool.mock.lastCall?.[0]).toMatchObject({ min: 0, max: 1 });
    createPostgresPool(DEFAULT_LOCAL_DATABASE_URL, { REELAY_DB_POOL_MIN: "2", REELAY_DB_POOL_MAX: "3" });
    expect(capturePool.mock.lastCall?.[0]).toMatchObject({ min: 2, max: 3 });
    createPostgresPool(DEFAULT_LOCAL_DATABASE_URL, {});
    expect(capturePool.mock.lastCall?.[0].min).toBe(1);
  });

  it.each(["-1", "1.5", "bad", "2", "99999999999999999999"])("rejects invalid minimum %s", (value) => {
    expect(() => createPostgresPool(DEFAULT_LOCAL_DATABASE_URL, { REELAY_DB_POOL_MIN: value, REELAY_DB_POOL_MAX: "1" }))
      .toThrow(/REELAY_DB_POOL_MIN/);
  });

  it("handles idle connection failures without logging credentials or query details", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const pool = createPostgresPool(DEFAULT_LOCAL_DATABASE_URL, {});
    expect(() => pool.emit("error", Object.assign(new Error("private connection detail"), { code: "ECONNRESET" }))).not.toThrow();
    expect(log).toHaveBeenLastCalledWith("database_pool_idle_error", { code: "ECONNRESET" });
    pool.emit("error", Object.assign(new Error("private detail"), { code: "postgresql://secret" }));
    expect(log).toHaveBeenLastCalledWith("database_pool_idle_error", { code: "UNKNOWN" });
  });
});

describe("database environment selection", () => {
  it("resolves defaults and production requirements from the supplied environment", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://inherited:password@localhost:5432/inherited");
    expect(getDatabaseUrl({})).toBe(DEFAULT_LOCAL_DATABASE_URL);
    expect(() => getDatabaseUrl({ NODE_ENV: "production" })).toThrow(/DATABASE_URL is required/);
    expect(getDatabaseUrl()).toBe(process.env.DATABASE_URL);
  });

  it("uses the supplied database URL and pool settings without ambient overrides", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://inherited:password@localhost:5432/inherited");
    vi.stubEnv("REELAY_DB_POOL_MAX", "99");
    vi.stubEnv("REELAY_DB_CA_FILE", "missing-inherited-certificate.crt");
    const databaseUrl = "postgresql://postgres:test@db.exampleproject.supabase.co:5432/postgres";
    createPostgresPool(undefined, {
      DATABASE_URL: ` ${databaseUrl} `,
      REELAY_DB_POOL_MAX: "3",
      REELAY_DB_CONNECT_TIMEOUT_MS: "5000",
      REELAY_DB_IDLE_TIMEOUT_MS: "2000",
    });
    expect(capturePool.mock.lastCall?.[0]).toMatchObject({
      connectionString: databaseUrl,
      max: 3,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 2000,
      ssl: { rejectUnauthorized: true },
    });
  });

  it("retains explicit connection arguments and serverless defaults", () => {
    const connectionString = "postgresql://explicit:test@localhost:5432/explicit";
    createPostgresPool(connectionString, {
      DATABASE_URL: "postgresql://unused:test@localhost:5432/unused", VERCEL: "1",
    });
    expect(capturePool.mock.lastCall?.[0]).toMatchObject({ connectionString, max: 2 });
    createPostgresPool(undefined, {});
    expect(capturePool.mock.lastCall?.[0]).toMatchObject({ connectionString: DEFAULT_LOCAL_DATABASE_URL, max: 10 });
  });
});
