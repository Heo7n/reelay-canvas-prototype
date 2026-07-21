import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const entryFiles = ["app.js"];

async function collectModules(relativeDirectory, extensions) {
  const directory = path.join(root, relativeDirectory);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectModules(relativePath, extensions)));
    } else if (entry.isFile() && extensions.some((extension) => entry.name.endsWith(extension))) {
      files.push(relativePath);
    }
  }

  return files;
}

const files = [
  ...entryFiles,
  ...(await collectModules("data", [".js", ".mjs"])),
  ...(await collectModules("src", [".js", ".mjs"])),
  ...(await collectModules("scripts", [".mjs"])),
  ...(await collectModules("tests", [".mjs"])),
];

for (const relativePath of files) {
  const result = spawnSync(process.execPath, ["--check", path.join(root, relativePath)], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }
}

console.log(`JavaScript syntax check passed (${files.length} files).`);
