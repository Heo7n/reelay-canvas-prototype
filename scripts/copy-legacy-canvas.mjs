import { access, cp, copyFile, mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const workspaceRoot = process.cwd();
const outputRoot = path.join(workspaceRoot, "dist", "shell");

const files = [
  "index.html",
  "styles.css",
  "app.js",
  "assets/reelay-logo.png",
  "assets/canvas-empty-cursor.png",
  "src/config/prototype-config.js",
];
const directories = ["styles", "data", "assets/icons", "assets/model-logos"];

for (const relativePath of files) {
  const destination = path.join(outputRoot, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(path.join(workspaceRoot, relativePath), destination);
}

for (const relativePath of directories) {
  await cp(path.join(workspaceRoot, relativePath), path.join(outputRoot, relativePath), {
    recursive: true,
  });
}

const legacyModuleDirectory = "src/legacy-canvas";
const legacyModuleEntries = await readdir(path.join(workspaceRoot, legacyModuleDirectory), {
  withFileTypes: true,
});
const legacyModules = legacyModuleEntries
  .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
  .map((entry) => path.join(legacyModuleDirectory, entry.name));

for (const relativePath of legacyModules) {
  const destination = path.join(outputRoot, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(path.join(workspaceRoot, relativePath), destination);
}

const legacyHtml = await readFile(path.join(outputRoot, "index.html"), "utf8");
const localReferences = [...legacyHtml.matchAll(/\b(?:src|href)="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((reference) => !/^(?:[a-z]+:|#)/i.test(reference));

for (const reference of localReferences) {
  const cleanPath = reference.split(/[?#]/, 1)[0].replace(/^\.\//, "");
  await access(path.join(outputRoot, cleanPath));
}

console.log(
  `Legacy canvas copied into dist/shell (${legacyModules.length} modules, ${localReferences.length} entry references verified).`,
);
