import type { ObjectStore } from "./application/ObjectStore";
import { FileSystemObjectStore } from "./infrastructure/FileSystemObjectStore";
import { getObjectStoreRoot } from "./object-store-config";
import { createSupabaseObjectStore } from "./supabase-object-store-config";

function assertSharedSupabaseProject(environment: NodeJS.ProcessEnv): void {
  if (!environment.DATABASE_URL?.trim()) {
    throw new Error("Supabase runtime storage requires an explicit DATABASE_URL.");
  }

  let storageUrl: URL;
  let databaseUrl: URL;
  let databaseUser: string;
  try {
    storageUrl = new URL(environment.SUPABASE_URL?.trim() || "");
    databaseUrl = new URL(environment.DATABASE_URL.trim());
    databaseUser = decodeURIComponent(databaseUrl.username);
    decodeURIComponent(databaseUrl.password);
  } catch {
    throw new Error("Supabase runtime storage requires valid SUPABASE_URL and DATABASE_URL values.");
  }

  const projectRef = /^([a-z0-9]+)\.supabase\.co$/.exec(storageUrl.hostname)?.[1];
  if (!projectRef || storageUrl.protocol !== "https:" || storageUrl.port
    || storageUrl.username || storageUrl.password || storageUrl.pathname !== "/"
    || storageUrl.search || storageUrl.hash) {
    throw new Error("SUPABASE_URL must be the HTTPS origin of a hosted Supabase project.");
  }

  const direct = databaseUrl.hostname === `db.${projectRef}.supabase.co`;
  const session = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(databaseUrl.hostname)
    && databaseUser.endsWith(`.${projectRef}`)
    && databaseUser.length > projectRef.length + 1;
  if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)
    || !databaseUser || !databaseUrl.password || databaseUrl.pathname !== "/postgres"
    || (databaseUrl.port && databaseUrl.port !== "5432") || databaseUrl.hash
    || (!direct && !session)) {
    throw new Error("DATABASE_URL must use the same Supabase project via direct or session port 5432, with explicit credentials and database postgres.");
  }
  // pg parses query settings after the URL authority, so they could redirect
  // metadata to a different database while the object store uses this project.
  if ([...databaseUrl.searchParams.keys()].some((key) => !["sslmode", "uselibpqcompat"].includes(key))) {
    throw new Error("DATABASE_URL must not override connection settings through query parameters.");
  }
}

export function createRuntimeObjectStore(environment: NodeJS.ProcessEnv = process.env): ObjectStore {
  const storage = environment.REELAY_OBJECT_STORAGE?.trim().toLocaleLowerCase("en-US") ?? "filesystem";
  if (storage === "filesystem") return new FileSystemObjectStore(getObjectStoreRoot(environment));
  if (storage === "supabase") {
    assertSharedSupabaseProject(environment);
    return createSupabaseObjectStore(environment);
  }
  throw new Error("REELAY_OBJECT_STORAGE must be filesystem or supabase.");
}
