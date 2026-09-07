import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PostgresAssetStore } from "../infrastructure/PostgresAssetStore";
import { PostgresEntityStore } from "../infrastructure/PostgresEntityStore";
import {
  assertPreviewAssetSeedEnvironment,
  previewAssetSeedErrorMessage,
  seedPreviewAssets,
} from "./seed-preview-assets";

const mocks = vi.hoisted(() => ({
  pool: { end: vi.fn(async () => undefined) },
  objectStore: {},
  createPool: vi.fn(),
  createObjectStore: vi.fn(),
  seed: vi.fn(),
}));

vi.mock("./config", () => ({
  getMigrationDatabaseUrl: () => process.env.MIGRATION_DATABASE_URL,
  createPostgresPool: mocks.createPool,
}));
vi.mock("../supabase-object-store-config", () => ({ createSupabaseObjectStore: mocks.createObjectStore }));
vi.mock("./demo-asset-seed", () => ({ seedDemoAssetLibrary: mocks.seed }));

const projectRef = "abcdefghijklmnopqrst";
const credentials = "private-password";
const validEnvironment = {
  REELAY_DEPLOYMENT_MODE: "preview",
  ALLOW_DEMO_ASSET_SEED: "true",
  SUPABASE_URL: `https://${projectRef}.supabase.co`,
  MIGRATION_DATABASE_URL: `postgresql://postgres.${projectRef}:${credentials}@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createPool.mockReturnValue(mocks.pool);
  mocks.createObjectStore.mockReturnValue(mocks.objectStore);
  mocks.seed.mockResolvedValue({ assets: [], entities: [] });
});
afterEach(() => vi.unstubAllEnvs());

describe("preview asset seed safeguards", () => {
  it.each([
    validEnvironment.MIGRATION_DATABASE_URL,
    `postgresql://postgres:${credentials}@db.${projectRef}.supabase.co:5432/postgres?sslmode=require`,
    `postgres://postgres:${credentials}@db.${projectRef}.supabase.co/postgres`,
  ])("accepts explicit same-project direct and session connections (%#)", (connection) => {
    expect(() => assertPreviewAssetSeedEnvironment({ ...validEnvironment, MIGRATION_DATABASE_URL: connection })).not.toThrow();
  });

  it.each([
    { REELAY_DEPLOYMENT_MODE: "production" },
    { ALLOW_DEMO_ASSET_SEED: undefined },
    { ALLOW_DEMO_ASSET_SEED: "false", ALLOW_DEMO_SEED: "true" },
    { MIGRATION_DATABASE_URL: undefined, DATABASE_URL: validEnvironment.MIGRATION_DATABASE_URL },
    { MIGRATION_DATABASE_URL: "postgresql://reelay:private-password@127.0.0.1:54329/reelay" },
    { MIGRATION_DATABASE_URL: validEnvironment.MIGRATION_DATABASE_URL.replace(":5432/", ":6543/") },
    { MIGRATION_DATABASE_URL: validEnvironment.MIGRATION_DATABASE_URL.replace(`postgres.${projectRef}`, "postgres.anotherproject") },
    { MIGRATION_DATABASE_URL: `postgresql://postgres:${credentials}@db.anotherproject.supabase.co:5432/postgres` },
    { MIGRATION_DATABASE_URL: `${validEnvironment.MIGRATION_DATABASE_URL}?host=db.anotherproject.supabase.co` },
    { MIGRATION_DATABASE_URL: `${validEnvironment.MIGRATION_DATABASE_URL}?user=postgres.anotherproject` },
    { MIGRATION_DATABASE_URL: validEnvironment.MIGRATION_DATABASE_URL.replace(/\/postgres$/, "/another_database") },
    { MIGRATION_DATABASE_URL: `postgresql://postgres%ZZ:${credentials}@db.${projectRef}.supabase.co:5432/postgres` },
    { SUPABASE_URL: "https://anotherproject.supabase.co" },
    { SUPABASE_URL: `http://${projectRef}.supabase.co` },
    { SUPABASE_URL: `https://private-key@${projectRef}.supabase.co` },
    { SUPABASE_URL: "https://example.com" },
  ])("refuses an unapproved or mismatched target without disclosing credentials (%#)", (override) => {
    let failure: unknown;
    try {
      assertPreviewAssetSeedEnvironment({ ...validEnvironment, ...override });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    const message = previewAssetSeedErrorMessage(failure);
    expect(message).not.toContain(credentials);
    expect(message).not.toContain("private-key");
    expect(message).not.toContain("postgresql://");
  });

  it("checks consent before creating storage or a database pool", async () => {
    for (const [name, value] of Object.entries(validEnvironment)) vi.stubEnv(name, value);
    vi.stubEnv("ALLOW_DEMO_ASSET_SEED", undefined);
    await expect(seedPreviewAssets()).rejects.toThrow(/ALLOW_DEMO_ASSET_SEED/);
    expect(mocks.createObjectStore).not.toHaveBeenCalled();
    expect(mocks.createPool).not.toHaveBeenCalled();
    expect(mocks.seed).not.toHaveBeenCalled();
  });

  it("uses only the personal catalog seed with the validated migration pool and always closes it", async () => {
    for (const [name, value] of Object.entries(validEnvironment)) vi.stubEnv(name, value);
    await expect(seedPreviewAssets()).resolves.toEqual({ assets: [], entities: [] });
    expect(mocks.createPool).toHaveBeenCalledWith(validEnvironment.MIGRATION_DATABASE_URL);
    expect(mocks.seed).toHaveBeenCalledWith({
      pool: mocks.pool,
      assetStore: expect.any(PostgresAssetStore),
      entityStore: expect.any(PostgresEntityStore),
      objectStore: mocks.objectStore,
    }, { personalOnly: true });
    expect(mocks.pool.end).toHaveBeenCalledOnce();

    mocks.seed.mockRejectedValueOnce(new Error(`Provider failed: ${validEnvironment.MIGRATION_DATABASE_URL} Authorization: private-key`));
    const failure = await seedPreviewAssets().catch((error: unknown) => error);
    expect(mocks.pool.end).toHaveBeenCalledTimes(2);
    expect(previewAssetSeedErrorMessage(failure)).not.toContain(credentials);
    expect(previewAssetSeedErrorMessage(failure)).not.toContain("private-key");
    expect(previewAssetSeedErrorMessage(failure)).not.toContain("postgresql://");
  });
});
