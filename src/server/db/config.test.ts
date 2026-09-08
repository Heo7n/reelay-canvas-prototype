import { afterEach, describe, expect, it, vi } from "vitest";

const { capturePool } = vi.hoisted(() => ({ capturePool: vi.fn() }));
vi.mock("pg", () => ({ Pool: class { constructor(options: unknown) { capturePool(options); } } }));
import { createPostgresPool } from "./config";

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
});
