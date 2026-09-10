import type { CollaborationStore } from "./application/CollaborationStore";
import type { EntityStore } from "./application/EntityStore";
import type { ObjectStore } from "./application/ObjectStore";
import type { ProjectAssetReferenceStore } from "./application/ProjectAssetReferenceStore";
import type { WorkspaceMediaAssetStore } from "./application/WorkspaceMediaAssetStore";
import { createPostgresPool } from "./db/config";
import { createDemoSeed } from "./demo-fixtures";
import { InMemoryCollaborationStore } from "./infrastructure/InMemoryCollaborationStore";
import { PostgresAssetStore } from "./infrastructure/PostgresAssetStore";
import { PostgresCollaborationStore } from "./infrastructure/PostgresCollaborationStore";
import { PostgresEntityStore } from "./infrastructure/PostgresEntityStore";
import { SupabaseObjectStore } from "./infrastructure/SupabaseObjectStore";
import { createRuntimeObjectStore } from "./runtime-object-store-config";

export interface ServerDependencies {
  assetStore?: WorkspaceMediaAssetStore & ProjectAssetReferenceStore;
  entityStore?: EntityStore;
  maxAssetUploadBytes?: number;
  objectStore?: ObjectStore;
  store: CollaborationStore;
}

export function createServerDependencies(environment: NodeJS.ProcessEnv = process.env): ServerDependencies {
  const storage = environment.REELAY_STORAGE?.trim().toLocaleLowerCase("en-US") ?? "postgresql";
  if (storage === "memory") {
    // Memory mode is an explicitly non-persistent collaboration fallback. Omitting
    // asset capabilities makes the existing client probe degrade instead of
    // advertising a process-local asset library that disappears on restart.
    return { store: new InMemoryCollaborationStore(createDemoSeed()) };
  }
  if (storage === "postgresql") {
    // Validate both storage destinations before allocating database resources.
    const objectStore = createRuntimeObjectStore(environment);
    const pool = createPostgresPool(undefined, environment);
    return {
      store: new PostgresCollaborationStore(pool),
      assetStore: new PostgresAssetStore(pool),
      entityStore: new PostgresEntityStore(pool),
      objectStore,
      // Match the shared development bucket before issuing an upload intent.
      maxAssetUploadBytes: objectStore instanceof SupabaseObjectStore ? 50 * 1024 * 1024 : undefined,
    };
  }
  throw new Error(`Unsupported REELAY_STORAGE value: ${storage}`);
}
