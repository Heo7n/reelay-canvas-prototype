import { createPostgresPool, getMigrationDatabaseUrl } from "./config";
import { seedDemoDatabase } from "./seed";

const isPreviewDeployment = process.env.REELAY_DEPLOYMENT_MODE === "preview";

if (process.env.NODE_ENV === "production" && !isPreviewDeployment) {
  throw new Error("Demo seed is disabled in production outside an explicit preview deployment.");
}
if (process.env.ALLOW_DEMO_SEED !== "true") {
  throw new Error("Refusing to write demo accounts unless ALLOW_DEMO_SEED=true.");
}

async function main(): Promise<void> {
  const pool = createPostgresPool(getMigrationDatabaseUrl());
  try {
    await seedDemoDatabase(pool);
    console.log("Demo seed is present.");
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
