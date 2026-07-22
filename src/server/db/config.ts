import { Pool } from "pg";

export const DEFAULT_LOCAL_DATABASE_URL =
  "postgresql://reelay:reelay-local-only@127.0.0.1:54329/reelay";

export function getDatabaseUrl(): string {
  const configured = process.env.DATABASE_URL?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is required when NODE_ENV=production.");
  }
  return DEFAULT_LOCAL_DATABASE_URL;
}

export function createPostgresPool(connectionString = getDatabaseUrl()): Pool {
  return new Pool({
    connectionString,
    max: 10,
    application_name: "reelay-server",
  });
}
