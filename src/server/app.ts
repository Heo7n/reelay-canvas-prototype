import { InMemoryAssetStore } from "./infrastructure/InMemoryAssetStore";
import { randomUUID } from "node:crypto";
import { REAL_GENERATION_CALL_SOURCE, REAL_GENERATION_PROBE_SPEC } from "../contracts/real-generation";
import { InMemoryEntityStore } from "./infrastructure/InMemoryEntityStore";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";

import { registerSessionRoutes } from "./http/session-routes";
import { registerAccountRoutes } from "./http/account-routes";
import { registerWorkspaceProjectRoutes } from "./http/workspace-project-routes";
import { registerCanvasDocumentRoutes } from "./http/canvas-document-routes";
import { registerAssetRoutes } from "./http/asset-routes";
import { registerMediaStorageRoutes } from "./http/media-storage-routes";
import { registerEntityRoutes } from "./http/entity-routes";
import { registerRealGenerationRoutes } from "./http/real-generation-routes";
import { RealGenerationProbeService } from "./application/RealGenerationProbeService";
import { ReelayPlatformClient } from "./infrastructure/ReelayPlatformClient";
import type { CanvasVideoGenerationStore } from "./application/CanvasVideoGenerationStore";
import { CanvasVideoGenerationService } from "./application/CanvasVideoGenerationService";
import { registerCanvasVideoGenerationRoutes } from "./http/canvas-video-generation-routes";
import type { CollaborationStore } from "./application/CollaborationStore";
import type { EntityStore } from "./application/EntityStore";
import type { ObjectStore } from "./application/ObjectStore";
import type { ProjectAssetReferenceStore } from "./application/ProjectAssetReferenceStore";
import type { WorkspaceMediaAssetStore } from "./application/WorkspaceMediaAssetStore";

export interface BuildServerOptions {
  assetStore?: WorkspaceMediaAssetStore & ProjectAssetReferenceStore;
  entityStore?: EntityStore;
  logger?: boolean;
  maxAssetUploadBytes?: number;
  objectStore?: ObjectStore;
  realGeneration?: { enabled: boolean; fetcher?: typeof fetch };
  canvasVideoStore?: CanvasVideoGenerationStore;
  savedGenerationProbes?: Parameters<RealGenerationProbeService["seedSavedProbe"]>[0][];
  secureCookies?: boolean;
  staticRoot?: string;
  store: CollaborationStore;
}

export async function buildServer(options: BuildServerOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });
  const { store } = options;
  if (options.assetStore instanceof InMemoryAssetStore && options.entityStore instanceof InMemoryEntityStore) {
    options.assetStore.connectLibraryEntities(options.entityStore);
  }

  await app.register(cookie);
  app.addHook("onClose", async () => store.close());
  app.get("/api/health", async (_request, reply) => {
    try {
      await store.ping();
      return { status: "ok", storage: store.storageKind };
    } catch {
      return reply.code(503).send({ status: "degraded", storage: store.storageKind });
    }
  });
  await registerSessionRoutes(app, store, options.secureCookies ?? process.env.NODE_ENV === "production");
  await registerAccountRoutes(app, store);
  await registerWorkspaceProjectRoutes(app, store);
  await registerCanvasDocumentRoutes(app, store);
  // Explicit local opt-in cannot enable paid generation in any hosted build.
  const realGenerationAvailable = options.realGeneration?.enabled === true && !!options.objectStore
    && process.env.NODE_ENV !== "production" && !process.env.VERCEL;
  const generationPlatform = realGenerationAvailable ? new ReelayPlatformClient(options.realGeneration?.fetcher) : null;
  const generationConnections = generationPlatform ? new RealGenerationProbeService(generationPlatform, options.objectStore!, { channel: REAL_GENERATION_CALL_SOURCE, specification: REAL_GENERATION_PROBE_SPEC, makeId: randomUUID, accountGuard: options.canvasVideoStore }) : null;
  for (const probe of options.savedGenerationProbes ?? []) generationConnections?.seedSavedProbe(probe);
  registerRealGenerationRoutes(app, { sessions: store, service: generationConnections });
  registerCanvasVideoGenerationRoutes(app, { sessions: store, projects: store, service: options.canvasVideoStore && options.objectStore
    ? new CanvasVideoGenerationService({ tasks: options.canvasVideoStore, projects: store, connections: generationConnections, platform: generationPlatform, objects: options.objectStore, makeId: randomUUID, processId: randomUUID() }) : null });
  if (options.assetStore && options.objectStore) {
    registerMediaStorageRoutes(app, { assetStore: options.assetStore, objectStore: options.objectStore, sessions: store });
    await registerAssetRoutes(app, {
      assetStore: options.assetStore,
      objectStore: options.objectStore,
      maxUploadBytes: options.maxAssetUploadBytes,
      projects: store,
      sessions: store,
    });
  }
  if (options.entityStore) {
    await registerEntityRoutes(app, { entities: options.entityStore, sessions: store });
  }

  if (options.staticRoot) {
    await app.register(fastifyStatic, {
      root: options.staticRoot,
      index: false,
      redirect: false,
      wildcard: false,
    });

    app.get("/", async (_request, reply) => reply.redirect("/app"));
    app.setNotFoundHandler(async (request, reply) => {
      const pathname = request.url.split("?", 1)[0];
      if (request.method === "GET" && /^\/app(?:\/|$)/.test(pathname)) {
        return reply.type("text/html; charset=utf-8").sendFile("app-shell.html");
      }
      return reply.code(404).send({
        error: { code: "not_found", message: "The requested resource was not found." },
      });
    });
  }

  return app;
}
