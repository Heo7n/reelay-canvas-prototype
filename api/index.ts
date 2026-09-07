import type { IncomingMessage, ServerResponse } from "node:http";

import { attachDatabasePool } from "@vercel/functions";

import { buildServer } from "../src/server/app";
import { createPostgresPool } from "../src/server/db/config";
import { PostgresCollaborationStore } from "../src/server/infrastructure/PostgresCollaborationStore";
import { PostgresAssetStore } from "../src/server/infrastructure/PostgresAssetStore";
import { PostgresEntityStore } from "../src/server/infrastructure/PostgresEntityStore";
import { createSupabaseObjectStore } from "../src/server/supabase-object-store-config";
import { normalizeVercelApiUrl } from "../src/server/http/vercel-api-path";

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

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  request.url = normalizeVercelApiUrl(request.url);
  const app = await getApp();
  app.server.emit("request", request, response);
}
