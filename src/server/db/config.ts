import { readFileSync } from "node:fs";
import path from "node:path";

import { Pool, type PoolConfig } from "pg";

export const DEFAULT_LOCAL_DATABASE_URL =
  "postgresql://reelay:reelay-local-only@127.0.0.1:54329/reelay";

function readPositiveInteger(name: string): number | undefined {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

export function getDatabaseUrl(): string {
  const configured = process.env.DATABASE_URL?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is required when NODE_ENV=production.");
  }
  return DEFAULT_LOCAL_DATABASE_URL;
}

export function getMigrationDatabaseUrl(): string {
  return process.env.MIGRATION_DATABASE_URL?.trim() || getDatabaseUrl();
}

function getConnectionConfig(connectionString: string): Pick<PoolConfig, "connectionString" | "ssl"> {
  const url = new URL(connectionString);
  const isSupabase =
    url.hostname.endsWith(".supabase.com") || url.hostname.endsWith(".pooler.supabase.com");
  if (!isSupabase) return { connectionString };

  url.searchParams.delete("sslmode");
  url.searchParams.delete("uselibpqcompat");
  const caPath =
    process.env.REELAY_DB_CA_FILE?.trim() ||
    path.resolve("src/server/db/supabase-ca.crt");

  return {
    connectionString: url.toString(),
    ssl: {
      ca: readFileSync(caPath, "utf8"),
      rejectUnauthorized: true,
    },
  };
}

export function createPostgresPool(connectionString = getDatabaseUrl()): Pool {
  const isServerless = Boolean(process.env.VERCEL);
  return new Pool({
    ...getConnectionConfig(connectionString),
    max: readPositiveInteger("REELAY_DB_POOL_MAX") ?? (isServerless ? 2 : 10),
    connectionTimeoutMillis: readPositiveInteger("REELAY_DB_CONNECT_TIMEOUT_MS") ?? 15_000,
    idleTimeoutMillis: readPositiveInteger("REELAY_DB_IDLE_TIMEOUT_MS") ?? 10_000,
    allowExitOnIdle: true,
    application_name: "reelay-server",
  });
}
