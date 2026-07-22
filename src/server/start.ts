import { buildServer } from "./app";

async function start(): Promise<void> {
  const port = Number.parseInt(process.env.REELAY_SERVER_PORT ?? "5175", 10);
  const host = process.env.REELAY_SERVER_HOST ?? "127.0.0.1";
  const app = await buildServer({ logger: true });

  try {
    await app.listen({ host, port });
  } catch (error) {
    app.log.error(error);
    process.exitCode = 1;
  }
}

void start();
