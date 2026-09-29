import { execFileSync, spawn } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, parseEnv } from "node:util";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const environmentKey = /^(?:NODE_ENV|PORT|DATABASE_URL|MIGRATION_DATABASE_URL|REELAY_.*|SUPABASE_.*|VERCEL.*|ALLOW_DEMO_.*|PG.*)$/i;
const allowedKeys = new Set(["REELAY_PREVIEW_FRONTEND_PORT", "REELAY_PREVIEW_API_PORT", "REELAY_PREVIEW_DB_CONTAINER", "DATABASE_URL", "REELAY_OBJECT_STORE_ROOT"]);

function port(value, name) {
  if (!/^\d+$/.test(value || "") || Number(value) < 1024 || Number(value) > 65535) throw new Error(`${name} must be a port between 1024 and 65535.`);
  return String(Number(value));
}

export function createLocalPreviewPlan(mode, configuration, { baseEnvironment = {}, root = projectRoot, resolveBinding, isDirectory = (target) => statSync(target).isDirectory() } = {}) {
  if (!["frontend", "server"].includes(mode)) throw new Error("Choose frontend or server.");
  for (const key of Object.keys(configuration)) if (!allowedKeys.has(key)) throw new Error(`Unsupported preview setting: ${key}`);
  const frontendPort = port(configuration.REELAY_PREVIEW_FRONTEND_PORT, "Frontend port");
  const apiPort = port(configuration.REELAY_PREVIEW_API_PORT, "API port");
  if (frontendPort === apiPort) throw new Error("Frontend and API need distinct ports.");
  const env = Object.fromEntries(Object.entries(baseEnvironment).filter(([key]) => !environmentKey.test(key)));
  if (mode === "frontend") return {
    mode, port: frontendPort, env: { ...env, NODE_ENV: "development", REELAY_DEV_API_PORT: apiPort },
    args: ["node_modules/vite/bin/vite.js", "--config", "vite.shell.config.ts", "--host", "127.0.0.1", "--port", frontendPort, "--strictPort"],
  };
  let database;
  try { database = new URL(configuration.DATABASE_URL); } catch { throw new Error("Configure a local PostgreSQL DATABASE_URL in the preview file."); }
  if (!["postgres:", "postgresql:"].includes(database.protocol) || !["127.0.0.1", "localhost", "[::1]"].includes(database.hostname)
    || !database.username || !database.password || !/^\/[a-zA-Z0-9_-]+$/.test(database.pathname) || database.search || database.hash) {
    throw new Error("Preview database must be a loopback PostgreSQL URL with explicit credentials and database name, without query options.");
  }
  const container = configuration.REELAY_PREVIEW_DB_CONTAINER?.trim();
  if (container) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(container) || !resolveBinding) throw new Error("Invalid local preview database container.");
    const binding = resolveBinding(container).trim();
    const match = /^127\.0\.0\.1:(\d+)$/.exec(binding);
    if (!match) throw new Error("Database container must expose one loopback IPv4 binding for 5432/tcp.");
    database.hostname = "127.0.0.1";
    database.port = port(match[1], "Database port");
  } else port(database.port, "Database port");
  if (!configuration.REELAY_OBJECT_STORE_ROOT?.trim()) throw new Error("Configure the existing REELAY_OBJECT_STORE_ROOT.");
  const objectRoot = path.resolve(root, configuration.REELAY_OBJECT_STORE_ROOT.trim());
  let exists = false;
  try { exists = isDirectory(objectRoot); } catch {}
  if (!exists) throw new Error("The configured object directory must already exist; this launcher never initializes data.");
  return {
    mode, port: apiPort,
    env: { ...env, NODE_ENV: "development", PORT: apiPort, REELAY_SERVER_HOST: "127.0.0.1", REELAY_STORAGE: "postgresql", REELAY_OBJECT_STORAGE: "filesystem", DATABASE_URL: database.href, REELAY_OBJECT_STORE_ROOT: objectRoot },
    args: ["--import", "tsx", "src/server/start.ts"],
  };
}

export function startLocalPreview(args = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { config: { type: "string", default: ".env.local-preview" } } });
  if (positionals.length !== 1) throw new Error("Usage: npm run dev:preview -- frontend|server [--config .env.local-preview]");
  let configuration;
  try { configuration = parseEnv(readFileSync(path.resolve(projectRoot, values.config), "utf8")); }
  catch { throw new Error("Create a local preview configuration from docs/examples/local-preview.env.example; no data will be initialized."); }
  const plan = createLocalPreviewPlan(positionals[0], configuration, {
    baseEnvironment: process.env,
    resolveBinding: (container) => {
      try { return execFileSync("docker", ["port", container, "5432/tcp"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true }); }
      catch { throw new Error("Cannot read the existing database container binding. Start or recover it explicitly; this launcher does not create containers."); }
    },
  });
  console.log(`Local preview ${plan.mode}: http://127.0.0.1:${plan.port}`);
  const child = spawn(process.execPath, plan.args, { cwd: projectRoot, env: plan.env, stdio: "inherit", shell: false, windowsHide: true });
  const stop = () => child.kill("SIGTERM");
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  child.once("error", () => { console.error("Could not start preview; check Node 24 and npm ci."); process.exitCode = 1; });
  child.once("close", (code) => { process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop); process.exitCode = Number.isInteger(code) ? code : 1; });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { startLocalPreview(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
