import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const visited = new Set();

async function readStyle(relativePath) {
  const url = new URL(relativePath, root);
  const key = url.href;
  if (visited.has(key)) return "";
  visited.add(key);

  const css = await readFile(url, "utf8");
  checkStructure(css, relativePath);
  const imported = [];
  const importPattern = /@import\s+(?:url\()?\s*["']([^"')]+)["']\s*\)?[^;]*;/g;
  for (const match of css.matchAll(importPattern)) {
    const cleanPath = match[1].split(/[?#]/, 1)[0];
    const importedUrl = new URL(cleanPath, url);
    imported.push(await readStyle(importedUrl.href));
  }

  return `${css}\n${imported.join("\n")}`;
}

function checkStructure(css, source = "combined styles") {
  let depth = 0;
  let quote = null;
  let inComment = false;

  for (let index = 0; index < css.length; index += 1) {
    const char = css[index];
    const next = css[index + 1];

    if (inComment) {
      if (char === "*" && next === "/") {
        inComment = false;
        index += 1;
      }
      continue;
    }

    if (!quote && char === "/" && next === "*") {
      inComment = true;
      index += 1;
      continue;
    }

    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = null;
      continue;
    }

    if (char === '"' || char === "'") quote = char;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      assert.ok(depth >= 0, `${source}: unexpected closing brace at character ${index}.`);
    }
  }

  assert.equal(inComment, false, `${source}: CSS contains an unclosed comment.`);
  assert.equal(quote, null, `${source}: CSS contains an unclosed string.`);
  assert.equal(depth, 0, `${source}: CSS braces are not balanced.`);
}

const css = await readStyle("styles.css");
await readStyle("dev/canvas-layout-tuner.css");

for (const selector of [
  ":root",
  'html[data-theme="light"]',
  ".app-shell",
  ".canvas-shell",
  ".generator-node",
  ".asset-library-panel",
  ".agent-panel",
]) {
  assert.ok(css.includes(selector), `Required selector ${selector} is missing.`);
}

assert.ok(visited.size >= 2, "The stylesheet entries must resolve the legacy canvas styles.");
console.log(`CSS structure check passed (${visited.size} files).`);
