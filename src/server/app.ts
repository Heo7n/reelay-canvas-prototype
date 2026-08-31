import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";

import { registerSessionRoutes } from "./http/session-routes";
import { registerAccountRoutes } from "./http/account-routes";
import { registerWorkspaceProjectRoutes } from "./http/workspace-project-routes";
import { registerCanvasDocumentRoutes } from "./http/canvas-document-routes";
import { registerAssetRoutes } from "./http/asset-routes";
import type { CollaborationStore } from "./application/CollaborationStore";
import type { ObjectStore } from "./application/ObjectStore";
import type { ProjectAssetReferenceStore } from "./application/ProjectAssetReferenceStore";
import type { WorkspaceMediaAssetStore } from "./application/WorkspaceMediaAssetStore";

export interface BuildServerOptions {
  assetStore?: WorkspaceMediaAssetStore & ProjectAssetReferenceStore;
  logger?: boolean;
  objectStore?: ObjectStore;
  secureCookies?: boolean;
  staticRoot?: string;
  store: CollaborationStore;
}

export async function buildServer(options: BuildServerOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });
  const { store } = options;

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
  if (options.assetStore && options.objectStore) {
    await registerAssetRoutes(app, {
      assetStore: options.assetStore,
      objectStore: options.objectStore,
      projects: store,
      sessions: store,
    });
  }

  if (options.staticRoot) {
    await app.register(fastifyStatic, {
      root: options.staticRoot,
      index: false,
      redirect: false,
      wildcard: false,
    });

    app.get("/", async (_request, reply) => reply.redirect("/app/login"));
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
