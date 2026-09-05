import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const LOCAL_DEMO_STEPS = Object.freeze(["db:up", "db:migrate", "db:seed"]);

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1"]);

function getEnvironmentValue(environment, name) {
  const matchingKeys = Object.keys(environment).filter((key) => key.toUpperCase() === name);
  if (matchingKeys.length > 1) {
    throw new Error(`Ambiguous ${name} environment variables differ only by letter casing.`);
  }
  return matchingKeys[0] ? environment[matchingKeys[0]]?.trim() : undefined;
}

function removeEnvironmentValue(environment, name) {
  for (const key of Object.keys(environment)) {
    if (key.toUpperCase() === name) delete environment[key];
  }
}

export function assertLocalDemoEnvironment(environment = process.env) {
  const nodeEnvironment = getEnvironmentValue(environment, "NODE_ENV")?.toLowerCase();
  const deploymentMode = getEnvironmentValue(environment, "REELAY_DEPLOYMENT_MODE")?.toLowerCase();
  const vercelEnvironment = getEnvironmentValue(environment, "VERCEL_ENV")?.toLowerCase();
  const isVercel = Boolean(getEnvironmentValue(environment, "VERCEL"));

  if (
    nodeEnvironment === "production" ||
    deploymentMode === "preview" ||
    deploymentMode === "production" ||
    vercelEnvironment === "preview" ||
    vercelEnvironment === "production" ||
    isVercel
  ) {
    throw new Error(
      "Local demo setup is disabled in production and preview deployments. Follow the explicit remote initialization guide instead.",
    );
  }

  const migrationDatabaseUrl = getEnvironmentValue(environment, "MIGRATION_DATABASE_URL");
  const databaseUrl = getEnvironmentValue(environment, "DATABASE_URL");
  const configuredDatabase = migrationDatabaseUrl
    ? { name: "MIGRATION_DATABASE_URL", value: migrationDatabaseUrl }
    : databaseUrl
      ? { name: "DATABASE_URL", value: databaseUrl }
      : undefined;

  if (!configuredDatabase) return;

  let url;
  try {
    url = new URL(configuredDatabase.value);
  } catch {
    throw new Error(`${configuredDatabase.name} must be a valid PostgreSQL URL.`);
  }

  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error(`${configuredDatabase.name} must be a PostgreSQL URL.`);
  }

  const queryOverridesHost = [...url.searchParams.keys()].some((key) => key.toLowerCase() === "host");
  if (queryOverridesHost) {
    throw new Error(`${configuredDatabase.name} must not override its host through query parameters.`);
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!loopbackHosts.has(hostname)) {
    throw new Error(
      `${configuredDatabase.name} must target localhost for npm run db:setup; received host "${url.hostname}".`,
    );
  }
}

export function createStepEnvironment(baseEnvironment, step) {
  const childEnvironment = { ...baseEnvironment };
  removeEnvironmentValue(childEnvironment, "ALLOW_DEMO_SEED");
  if (step === "db:seed") childEnvironment.ALLOW_DEMO_SEED = "true";
  return childEnvironment;
}

export class LocalDemoStepError extends Error {
  constructor(step, exitCode) {
    super(`npm run ${step} failed with exit code ${exitCode}.`);
    this.name = "LocalDemoStepError";
    this.exitCode = exitCode;
    this.step = step;
  }
}

export function runNpmStep({ step, environment, cwd = projectRoot }) {
  const npmExecPath = getEnvironmentValue(environment, "NPM_EXECPATH");
  if (!npmExecPath) {
    return Promise.reject(
      new Error("npm executable metadata is unavailable. Run this setup through npm run db:setup."),
    );
  }

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [npmExecPath, "run", step], {
      cwd,
      env: environment,
      shell: false,
      stdio: "inherit",
      windowsHide: true,
    });

    child.once("error", reject);
    child.once("exit", (code) => resolve(Number.isInteger(code) ? code : 1));
  });
}

export async function runLocalDemoSetup({
  environment = process.env,
  cwd = projectRoot,
  runStep = runNpmStep,
  report = console.log,
} = {}) {
  assertLocalDemoEnvironment(environment);

  for (const [index, step] of LOCAL_DEMO_STEPS.entries()) {
    report(`[local-demo] ${index + 1}/${LOCAL_DEMO_STEPS.length} npm run ${step}`);
    const exitCode = await runStep({
      step,
      cwd,
      environment: createStepEnvironment(environment, step),
    });
    if (exitCode !== 0) throw new LocalDemoStepError(step, exitCode);
  }

  report("[local-demo] Local database, demo accounts, media assets, and Entities are ready.");
}

const isDirectRun = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isDirectRun) {
  void runLocalDemoSetup().catch((error) => {
    console.error(`[local-demo] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = error instanceof LocalDemoStepError ? error.exitCode : 1;
  });
}
