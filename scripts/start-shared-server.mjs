import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configurationFile = ".env.shared-development.local";
// The dedicated entry point belongs to the user-approved development project.
// Matching a database and bucket alone would also accept the public demo pair.
export const SHARED_DEVELOPMENT_PROJECT_REF = "oocagsuhijyvmzwotyxn";
const requiredKeys = [
  "REELAY_SHARED_PROJECT_REF", "DATABASE_URL", "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY", "REELAY_SUPABASE_STORAGE_BUCKET",
];
const allowedKeys = new Set([
  ...requiredKeys, "REELAY_DB_CA_FILE", "REELAY_DB_POOL_MAX",
  "REELAY_DB_CONNECT_TIMEOUT_MS", "REELAY_DB_IDLE_TIMEOUT_MS",
]);

export function createSharedServerEnvironment(baseEnvironment, configuration) {
  for (const key of Object.keys(configuration)) {
    if (!allowedKeys.has(key)) throw new Error(`Unsupported shared-development setting: ${key}`);
  }
  for (const key of requiredKeys) {
    if (!configuration[key]?.trim()) throw new Error(`Shared development requires ${key}.`);
  }
  const projectRef = configuration.REELAY_SHARED_PROJECT_REF.trim();
  if (projectRef !== SHARED_DEVELOPMENT_PROJECT_REF
    || configuration.SUPABASE_URL.trim() !== `https://${projectRef}.supabase.co`) {
    throw new Error("SUPABASE_URL and REELAY_SHARED_PROJECT_REF must match the configured Reelay_Dev project.");
  }

  // A terminal previously used for deployment or seeding must not redirect this
  // entry point. Connection credentials come only from the dedicated local file.
  const environment = Object.fromEntries(Object.entries(baseEnvironment).filter(([key]) =>
    !/^(?:NODE_ENV|PORT|DATABASE_URL|MIGRATION_DATABASE_URL|REELAY_.*|SUPABASE_.*|VERCEL.*|ALLOW_DEMO_.*|PG.*)$/i.test(key),
  ));
  for (const [key, value] of Object.entries(configuration)) environment[key] = value.trim();
  return {
    ...environment,
    NODE_ENV: "development",
    REELAY_STORAGE: "postgresql",
    REELAY_OBJECT_STORAGE: "supabase",
    REELAY_SERVER_HOST: "127.0.0.1",
    PORT: "5175",
    REELAY_DB_POOL_MAX: environment.REELAY_DB_POOL_MAX || "3",
  };
}

export function startSharedServer() {
  let configuration;
  try {
    configuration = parseEnv(readFileSync(path.join(projectRoot, configurationFile), "utf8"));
  } catch {
    throw new Error(`Create ${configurationFile} from docs/examples/shared-development.env.example and configure the development project.`);
  }
  const environment = createSharedServerEnvironment(process.env, configuration);
  console.log(`Shared development API: ${environment.REELAY_SHARED_PROJECT_REF} (http://127.0.0.1:5175)`);
  const child = spawn(process.execPath, ["--import", "tsx", "src/server/start.ts"], {
    cwd: projectRoot, env: environment, stdio: "inherit", shell: false, windowsHide: true,
  });
  const forwardInterrupt = () => child.kill("SIGINT");
  const forwardTermination = () => child.kill("SIGTERM");
  process.once("SIGINT", forwardInterrupt);
  process.once("SIGTERM", forwardTermination);
  child.once("error", () => {
    console.error("Could not start the shared development API. Check Node 24 and npm ci.");
    process.exitCode = 1;
  });
  child.once("close", (code) => {
    process.removeListener("SIGINT", forwardInterrupt);
    process.removeListener("SIGTERM", forwardTermination);
    process.exitCode = Number.isInteger(code) ? code : 1;
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    startSharedServer();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
