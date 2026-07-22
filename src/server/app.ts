import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";

import { registerSessionRoutes } from "./http/session-routes";
import { registerWorkspaceProjectRoutes } from "./http/workspace-project-routes";
import { InMemoryCollaborationStore } from "./infrastructure/InMemoryCollaborationStore";

export interface BuildServerOptions {
  logger?: boolean;
  secureCookies?: boolean;
  store?: InMemoryCollaborationStore;
}

export async function buildServer(options: BuildServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });
  const store = options.store ?? new InMemoryCollaborationStore();

  await app.register(cookie);
  app.get("/api/health", async () => ({ status: "ok", storage: "server-memory" }));
  await registerSessionRoutes(app, store, options.secureCookies ?? process.env.NODE_ENV === "production");
  await registerWorkspaceProjectRoutes(app, store);

  return app;
}
