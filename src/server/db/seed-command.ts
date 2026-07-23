import { createPostgresPool } from "./config";
import { seedDemoDatabase } from "./seed";

if (process.env.NODE_ENV === "production") {
  throw new Error("Demo seed is disabled when NODE_ENV=production.");
}
if (process.env.ALLOW_DEMO_SEED !== "true") {
  throw new Error("Refusing to write demo accounts unless ALLOW_DEMO_SEED=true.");
}

async function main(): Promise<void> {
  const pool = createPostgresPool();
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
