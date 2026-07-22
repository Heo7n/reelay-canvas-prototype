import { buildServer } from "./app";
import { InMemoryCollaborationStore } from "./infrastructure/InMemoryCollaborationStore";

async function start(): Promise<void> {
  const port = Number.parseInt(process.env.REELAY_SERVER_PORT ?? "5175", 10);
  const host = process.env.REELAY_SERVER_HOST ?? "127.0.0.1";
  const app = await buildServer({ logger: true, store: new InMemoryCollaborationStore() });

  try {
    await app.listen({ host, port });
  } catch (error) {
    app.log.error(error);
    await app.close();
    process.exitCode = 1;
  }
}

void start();
