import vm from "node:vm";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

async function runBrowserScript(relativePath, context) {
  const source = await readFile(new URL(relativePath, root), "utf8");
  vm.runInContext(source, context, { filename: relativePath });
}

export async function loadPrototypeData() {
  const sandbox = { window: {} };
  const context = vm.createContext(sandbox);

  await runBrowserScript("data/model-catalog.js", context);
  await runBrowserScript("src/config/prototype-config.js", context);

  return {
    catalog: sandbox.window.REELAY_MODEL_CATALOG,
    modelDirectory: sandbox.window.REELAY_MODEL_DIRECTORY,
    config: sandbox.window.REELAY_PROTOTYPE_CONFIG,
  };
}
