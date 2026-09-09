import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const pageContracts = [
  {
    htmlFile: "index.html",
    scriptFile: "app.js",
    requiredScripts: [
      "./data/model-catalog.js",
      "./src/config/prototype-config.js",
      "./src/legacy-canvas/canvas-prompt-document.js",
      "./src/legacy-canvas/canvas-prompt-controller.js",
      "./src/legacy-canvas/canvas-document-codec.js",
      "./app.js",
    ],
  },
];

let totalIds = 0;
let totalReferences = 0;

for (const contract of pageContracts) {
  const html = await readFile(new URL(contract.htmlFile, root), "utf8");
  const scriptSource = await readFile(new URL(contract.scriptFile, root), "utf8");

  assert.match(html, /<html\s+[^>]*lang="zh-CN"/i, `${contract.htmlFile}: language must be zh-CN.`);
  assert.match(html, /<meta\s+name="viewport"/i, `${contract.htmlFile}: viewport metadata is required.`);

  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual([...new Set(duplicateIds)], [], `${contract.htmlFile}: duplicate ids: ${duplicateIds.join(", ")}`);

  const localReferences = [...html.matchAll(/\s(?:src|href)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((reference) => !/^(?:[a-z]+:|#)/i.test(reference));

  for (const reference of localReferences) {
    const cleanPath = reference.split(/[?#]/, 1)[0];
    await access(new URL(cleanPath, root));
  }

  // The editor is a lazy dev endpoint and a hashed build output, not a
  // checked-in script. Do not confuse its data attribute with a native src.
  assert.match(html, /\sdata-prompt-editor-src="\.\/assets\/prompt-editor\.js"/);
  for (const source of ["src/prompt-editor/index.js", "scripts/build-prompt-editor.mjs", "src/dev/prompt-editor-plugin.ts"]) {
    await access(new URL(source, root));
  }

  let previousIndex = -1;
  for (const script of contract.requiredScripts) {
    const index = html.indexOf(script);
    assert.ok(index > previousIndex, `${contract.htmlFile}: ${script} is missing or loaded out of order.`);
    previousIndex = index;
  }

  const referencedIds = new Set([
    ...scriptSource.matchAll(/querySelector(?:All)?\(\s*["']#([A-Za-z0-9_-]+)/g),
    ...scriptSource.matchAll(/getElementById\(\s*["']([A-Za-z0-9_-]+)/g),
  ].map((match) => match[1]));
  const htmlIds = new Set(ids);
  const missingIds = [...referencedIds].filter((id) => !htmlIds.has(id));
  assert.deepEqual(missingIds, [], `${contract.scriptFile} references missing HTML ids: ${missingIds.join(", ")}`);

  for (const anchor of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/gi)) {
    assert.match(anchor[0], /\brel="[^"]*noopener[^"]*"/i, `${contract.htmlFile}: external blank-target links need rel=noopener.`);
  }

  totalIds += ids.length;
  totalReferences += localReferences.length;
}

console.log(`HTML contract check passed (${pageContracts.length} pages, ${totalIds} ids, ${totalReferences} local references).`);
