import path from "node:path";

import { buildServer } from "./app";
import type { CollaborationStore } from "./application/CollaborationStore";
import { createPostgresPool } from "./db/config";
import { InMemoryCollaborationStore } from "./infrastructure/InMemoryCollaborationStore";
import { PostgresCollaborationStore } from "./infrastructure/PostgresCollaborationStore";

function createStore(): CollaborationStore {
  const storage = process.env.REELAY_STORAGE?.trim().toLocaleLowerCase("en-US") ?? "postgresql";
  if (storage === "memory") return new InMemoryCollaborationStore();
  if (storage === "postgresql") return new PostgresCollaborationStore(createPostgresPool());
  throw new Error(`Unsupported REELAY_STORAGE value: ${storage}`);
}

async function start(): Promise<void> {
  const isProduction = process.env.NODE_ENV === "production";
  const port = Number.parseInt(process.env.PORT ?? process.env.REELAY_SERVER_PORT ?? "5175", 10);
  const host = process.env.REELAY_SERVER_HOST ?? (isProduction ? "0.0.0.0" : "127.0.0.1");
  const configuredStaticRoot = process.env.REELAY_STATIC_ROOT?.trim();
  const staticRoot = configuredStaticRoot || (isProduction ? path.resolve("dist/shell") : undefined);
  const store = createStore();
  let app;

  try {
    await store.ping();
    app = await buildServer({ logger: true, staticRoot, store });
  } catch (error) {
    await store.close();
    throw error;
  }

  let closePromise: Promise<void> | null = null;
  const close = (): Promise<void> => {
    closePromise ??= app.close();
    return closePromise;
  };
  process.once("SIGINT", () => void close());
  process.once("SIGTERM", () => void close());

  try {
    await app.listen({ host, port });
  } catch (error) {
    app.log.error(error);
    await close();
    throw error;
  }
}

void start().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
