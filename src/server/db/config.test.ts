import { describe, expect, it, vi } from "vitest";

const { capturePool } = vi.hoisted(() => ({ capturePool: vi.fn() }));
vi.mock("pg", () => ({ Pool: class { constructor(options: unknown) { capturePool(options); } } }));
import { createPostgresPool } from "./config";

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
});
