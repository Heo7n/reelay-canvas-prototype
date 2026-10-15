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
import type { CanvasVideoGenerationStore } from "./application/CanvasVideoGenerationStore";
import { PostgresCanvasVideoGenerationStore } from "./infrastructure/PostgresCanvasVideoGenerationStore";

export interface ServerDependencies {
  assetStore?: WorkspaceMediaAssetStore & ProjectAssetReferenceStore;
  entityStore?: EntityStore;
  maxAssetUploadBytes?: number;
  objectStore?: ObjectStore;
  realGeneration?: { enabled: boolean };
  canvasVideoStore?: CanvasVideoGenerationStore;
  store: CollaborationStore;
}

export function createServerDependencies(environment: NodeJS.ProcessEnv = process.env): ServerDependencies {
  const realGenerationEnabled = environment.REELAY_REAL_GENERATION_ENABLED === "1" && environment.NODE_ENV !== "production" && !environment.VERCEL;
  if (realGenerationEnabled && !["127.0.0.1", "localhost", "::1"].includes(environment.REELAY_SERVER_HOST ?? "127.0.0.1")) {
    throw new Error("Real generation probes require a loopback-only server binding.");
  }
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
      realGeneration: { enabled: realGenerationEnabled },
      canvasVideoStore: new PostgresCanvasVideoGenerationStore(pool),
      // Match the shared development bucket before issuing an upload intent.
      maxAssetUploadBytes: objectStore instanceof SupabaseObjectStore ? 50 * 1024 * 1024 : undefined,
    };
  }
  throw new Error(`Unsupported REELAY_STORAGE value: ${storage}`);
}
