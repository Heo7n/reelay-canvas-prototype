import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";

import { registerSessionRoutes } from "./http/session-routes";
import { registerWorkspaceProjectRoutes } from "./http/workspace-project-routes";
import { registerCanvasDocumentRoutes } from "./http/canvas-document-routes";
import type { CollaborationStore } from "./application/CollaborationStore";

export interface BuildServerOptions {
  logger?: boolean;
  secureCookies?: boolean;
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
  await registerWorkspaceProjectRoutes(app, store);
  await registerCanvasDocumentRoutes(app, store);

  return app;
}
