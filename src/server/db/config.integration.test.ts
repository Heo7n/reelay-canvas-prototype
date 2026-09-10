import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPostgresPool, DEFAULT_LOCAL_DATABASE_URL } from "./config";

const databaseUrl = process.env.TEST_DATABASE_ADMIN_URL ?? DEFAULT_LOCAL_DATABASE_URL;
const pools: Pool[] = [];

function trackedPool(environment: NodeJS.ProcessEnv): Pool {
  const pool = createPostgresPool(databaseUrl, { REELAY_DB_IDLE_TIMEOUT_MS: "40", REELAY_DB_POOL_MAX: "2", ...environment });
  pools.push(pool);
  return pool;
}

async function waitUntil(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (condition()) return;
    await delay(20);
  }
  expect(condition()).toBe(true);
}

afterEach(async () => {
  await Promise.all(pools.splice(0).map((pool) => pool.end()));
});

describe("database connection lifecycle", () => {
  it("retains one existing connection after surplus idle connections expire", async () => {
    const pool = trackedPool({});
    expect(pool.totalCount).toBe(0);
    const clients = await Promise.all([pool.connect(), pool.connect()]);
    const pids = await Promise.all(clients.map(async (client) => (await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid));
    clients.forEach((client) => client.release());
    await waitUntil(() => pool.totalCount === 1);
    await delay(100);
    expect(pool.idleCount).toBe(1);
    const next = await pool.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
    expect(pids).toContain(next.rows[0].pid);
  });

  it.each([{ VERCEL: "1" }, { REELAY_DB_POOL_MIN: "0" }])("drains idle connections when configured to release all: %o", async (environment) => {
    const pool = trackedPool(environment);
    await pool.query("SELECT 1");
    await waitUntil(() => pool.totalCount === 0);
    expect(pool.idleCount).toBe(0);
  });

  it("discards a disconnected idle client and accepts a later request without replaying a query", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const pool = trackedPool({ REELAY_DB_POOL_MAX: "1" });
    const original = await pool.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
    const control = trackedPool({ REELAY_DB_POOL_MIN: "0", REELAY_DB_POOL_MAX: "1" });
    // Only terminate the connection allocated by this test, never enumerate or
    // terminate another application's database sessions.
    await control.query("SELECT pg_terminate_backend($1)", [original.rows[0].pid]);
    await waitUntil(() => pool.totalCount === 0);
    expect(log).toHaveBeenCalledWith("database_pool_idle_error", { code: "57P01" });
    const next = await pool.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
    expect(next.rows[0].pid).not.toBe(original.rows[0].pid);
  });
});
