import { cp, copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

const workspaceRoot = process.cwd();
const outputRoot = path.join(workspaceRoot, "dist", "shell");

const files = [
  "index.html",
  "styles.css",
  "app.js",
  "assets/reelay-logo.png",
  "src/config/prototype-config.js",
  "src/legacy-canvas/canvas-document-codec.js",
];
const directories = ["styles", "data"];

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

console.log("Legacy canvas assets copied into dist/shell.");
