import type { IncomingMessage, ServerResponse } from "node:http";

import { attachDatabasePool } from "@vercel/functions";

import { buildServer } from "../src/server/app";
import { createPostgresPool } from "../src/server/db/config";
import { PostgresCollaborationStore } from "../src/server/infrastructure/PostgresCollaborationStore";
import { PostgresAssetStore } from "../src/server/infrastructure/PostgresAssetStore";
import { PostgresEntityStore } from "../src/server/infrastructure/PostgresEntityStore";
import { createSupabaseObjectStore } from "../src/server/supabase-object-store-config";

const pool = createPostgresPool();
attachDatabasePool(pool);

const store = new PostgresCollaborationStore(pool);
const assetStore = new PostgresAssetStore(pool);
const entityStore = new PostgresEntityStore(pool);
const objectStore = createSupabaseObjectStore();
let appPromise: ReturnType<typeof createApp> | undefined;

async function createApp() {
  const app = await buildServer({
    logger: true, secureCookies: true, store, assetStore, entityStore, objectStore,
    // Both requests and responses must fit Vercel's 4.5 MB function payload limit.
    maxAssetUploadBytes: 4 * 1024 * 1024,
  });
  await app.ready();
  return app;
}

function getApp() {
  appPromise ??= createApp().catch((error: unknown) => {
    appPromise = undefined;
    throw error;
  });
  return appPromise;
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
  const app = await getApp();
  app.server.emit("request", request, response);
}
