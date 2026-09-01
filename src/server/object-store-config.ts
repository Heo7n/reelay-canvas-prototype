import path from "node:path";

export function getObjectStoreRoot(environment: NodeJS.ProcessEnv = process.env): string {
  return environment.REELAY_OBJECT_STORE_ROOT?.trim()
    || path.resolve(".reelay-data/object-store");
}
