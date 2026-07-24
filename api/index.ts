import type { IncomingMessage, ServerResponse } from "node:http";

import { attachDatabasePool } from "@vercel/functions";

import { buildServer } from "../src/server/app";
import { createPostgresPool } from "../src/server/db/config";
import { PostgresCollaborationStore } from "../src/server/infrastructure/PostgresCollaborationStore";

const pool = createPostgresPool();
attachDatabasePool(pool);

const store = new PostgresCollaborationStore(pool);
let appPromise: ReturnType<typeof createApp> | undefined;

async function createApp() {
  await store.ping();
  const app = await buildServer({ logger: true, secureCookies: true, store });
  await app.ready();
  return app;
}

function restoreApiPath(request: IncomingMessage): void {
  const url = new URL(request.url ?? "/api", "http://localhost");
  const apiPath = url.searchParams.get("apiPath");
  if (url.pathname !== "/api" || !apiPath) return;

  url.searchParams.delete("apiPath");
  const search = url.searchParams.toString();
  request.url = `/api/${apiPath.replace(/^\/+/, "")}${search ? `?${search}` : ""}`;
}

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  restoreApiPath(request);
  appPromise ??= createApp();
  const app = await appPromise;
  app.server.emit("request", request, response);
}
