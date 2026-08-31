import path from "node:path";

import type { CollaborationStore } from "./application/CollaborationStore";
import type { ObjectStore } from "./application/ObjectStore";
import type { ProjectAssetReferenceStore } from "./application/ProjectAssetReferenceStore";
import type { WorkspaceMediaAssetStore } from "./application/WorkspaceMediaAssetStore";
import { createPostgresPool } from "./db/config";
import { createDemoSeed } from "./demo-fixtures";
import { FileSystemObjectStore } from "./infrastructure/FileSystemObjectStore";
import { InMemoryCollaborationStore } from "./infrastructure/InMemoryCollaborationStore";
import { PostgresAssetStore } from "./infrastructure/PostgresAssetStore";
import { PostgresCollaborationStore } from "./infrastructure/PostgresCollaborationStore";

export interface ServerDependencies {
  assetStore?: WorkspaceMediaAssetStore & ProjectAssetReferenceStore;
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
    const pool = createPostgresPool();
    const objectStoreRoot = environment.REELAY_OBJECT_STORE_ROOT?.trim()
      || path.resolve(".reelay-data/object-store");
    return {
      store: new PostgresCollaborationStore(pool),
      assetStore: new PostgresAssetStore(pool),
      objectStore: new FileSystemObjectStore(objectStoreRoot),
    };
  }
  throw new Error(`Unsupported REELAY_STORAGE value: ${storage}`);
}
