import { readFileSync } from "node:fs";
import path from "node:path";

import { Pool, type PoolConfig } from "pg";

export const DEFAULT_LOCAL_DATABASE_URL =
  "postgresql://reelay:reelay-local-only@127.0.0.1:54329/reelay";

function readPositiveInteger(name: string, environment: NodeJS.ProcessEnv): number | undefined {
  const value = environment[name]?.trim();
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

export function getDatabaseUrl(environment: NodeJS.ProcessEnv = process.env): string {
  const configured = environment.DATABASE_URL?.trim();
  if (configured) return configured;
  if (environment.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is required when NODE_ENV=production.");
  }
  return DEFAULT_LOCAL_DATABASE_URL;
}

export function getMigrationDatabaseUrl(): string {
  return process.env.MIGRATION_DATABASE_URL?.trim() || getDatabaseUrl();
}

function getConnectionConfig(
  connectionString: string,
  environment: NodeJS.ProcessEnv,
): Pick<PoolConfig, "connectionString" | "ssl"> {
  const url = new URL(connectionString);
  const isSupabase =
    url.hostname.endsWith(".supabase.com") || url.hostname.endsWith(".supabase.co");
  if (!isSupabase) return { connectionString };

  url.searchParams.delete("sslmode");
  url.searchParams.delete("uselibpqcompat");
  const caPath =
    environment.REELAY_DB_CA_FILE?.trim() ||
    path.resolve("src/server/db/supabase-ca.crt");

  return {
    connectionString: url.toString(),
    ssl: {
      ca: readFileSync(caPath, "utf8"),
      rejectUnauthorized: true,
    },
  };
}

export function createPostgresPool(
  connectionString?: string,
  environment: NodeJS.ProcessEnv = process.env,
): Pool {
  const isServerless = Boolean(environment.VERCEL);
  return new Pool({
    ...getConnectionConfig(connectionString ?? getDatabaseUrl(environment), environment),
    max: readPositiveInteger("REELAY_DB_POOL_MAX", environment) ?? (isServerless ? 2 : 10),
    connectionTimeoutMillis: readPositiveInteger("REELAY_DB_CONNECT_TIMEOUT_MS", environment) ?? 15_000,
    // A long-lived API should reuse its bounded pool between normal UI actions;
    // discarding it after ten seconds repeatedly pays the remote TLS handshake.
    idleTimeoutMillis: readPositiveInteger("REELAY_DB_IDLE_TIMEOUT_MS", environment) ?? (isServerless ? 10_000 : 60_000),
    allowExitOnIdle: true,
    application_name: "reelay-server",
  });
}
