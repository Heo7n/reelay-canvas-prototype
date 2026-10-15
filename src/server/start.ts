import path from "node:path";

import { buildServer } from "./app";
import { createServerDependencies } from "./server-dependencies";

async function start(): Promise<void> {
  const isProduction = process.env.NODE_ENV === "production";
  const port = Number.parseInt(process.env.PORT ?? process.env.REELAY_SERVER_PORT ?? "5175", 10);
  const host = process.env.REELAY_SERVER_HOST ?? (isProduction ? "0.0.0.0" : "127.0.0.1");
  if (process.env.REELAY_REAL_GENERATION_ENABLED === "1" && !isProduction && !process.env.VERCEL
    && !["127.0.0.1", "localhost", "::1"].includes(host)) {
    throw new Error("Real generation probes require a loopback-only server binding.");
  }
  const configuredStaticRoot = process.env.REELAY_STATIC_ROOT?.trim();
  const staticRoot = configuredStaticRoot || (isProduction ? path.resolve("dist/shell") : undefined);
  const dependencies = createServerDependencies();
  const { store } = dependencies;
  let app;

  try {
    await store.ping();
    app = await buildServer({ ...dependencies, logger: true, staticRoot });
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
