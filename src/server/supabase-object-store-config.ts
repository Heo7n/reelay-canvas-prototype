import { SupabaseObjectStore } from "./infrastructure/SupabaseObjectStore";

export function createSupabaseObjectStore(environment: NodeJS.ProcessEnv = process.env): SupabaseObjectStore {
  const url = environment.SUPABASE_URL?.trim();
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const bucket = environment.REELAY_SUPABASE_STORAGE_BUCKET?.trim();
  if (!url || !serviceRoleKey || !bucket) {
    throw new Error("Supabase object storage requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and REELAY_SUPABASE_STORAGE_BUCKET.");
  }
  return new SupabaseObjectStore({ url, serviceRoleKey, bucket });
}
