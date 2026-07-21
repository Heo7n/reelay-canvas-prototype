import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const html = await readFile(new URL("index.html", root), "utf8");
const appSource = await readFile(new URL("app.js", root), "utf8");

assert.match(html, /<html\s+[^>]*lang="zh-CN"/i, "HTML language must be zh-CN.");
assert.match(html, /<meta\s+name="viewport"/i, "Viewport metadata is required.");

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
assert.deepEqual([...new Set(duplicateIds)], [], `Duplicate HTML ids: ${duplicateIds.join(", ")}`);

const localReferences = [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((reference) => !/^(?:[a-z]+:|#)/i.test(reference));

for (const reference of localReferences) {
  const cleanPath = reference.split(/[?#]/, 1)[0];
  await access(new URL(cleanPath, root));
}

const requiredScripts = [
  "./data/model-catalog.js",
  "./src/config/prototype-config.js",
  "./app.js",
];
let previousIndex = -1;
for (const script of requiredScripts) {
  const index = html.indexOf(script);
  assert.ok(index > previousIndex, `${script} is missing or loaded out of order.`);
  previousIndex = index;
}

const referencedIds = new Set([
  ...appSource.matchAll(/querySelector(?:All)?\(\s*["']#([A-Za-z0-9_-]+)/g),
  ...appSource.matchAll(/getElementById\(\s*["']([A-Za-z0-9_-]+)/g),
].map((match) => match[1]));
const htmlIds = new Set(ids);
const missingIds = [...referencedIds].filter((id) => !htmlIds.has(id));
assert.deepEqual(missingIds, [], `app.js references missing HTML ids: ${missingIds.join(", ")}`);

for (const anchor of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/gi)) {
  assert.match(anchor[0], /\brel="[^"]*noopener[^"]*"/i, "External blank-target links need rel=noopener.");
}

console.log(`HTML contract check passed (${ids.length} ids, ${localReferences.length} local references).`);
