import { glob, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const files = ["AGENTS.md", "README.md"];
for await (const file of glob("docs/**/*.md", { cwd: root })) files.push(file);
const documents = new Map();

async function readDocument(file) {
  if (documents.has(file)) return documents.get(file);
  const source = await readFile(file, "utf8");
  // Code samples may contain intentionally illustrative paths, not navigation.
  const text = source.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, "");
  const anchors = new Set();
  for (const match of text.matchAll(/^#{1,6}\s+(.+)$/gm)) {
    const base = match[1].trim().toLowerCase()
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, "")
      .replace(/\s/g, "-");
    let anchor = base;
    for (let suffix = 1; anchors.has(anchor); suffix += 1) anchor = `${base}-${suffix}`;
    anchors.add(anchor);
  }
  const document = { text, anchors };
  documents.set(file, document);
  return document;
}

const errors = [];
let links = 0;
for (const relativePath of files.sort()) {
  const file = path.join(root, relativePath);
  const { text } = await readDocument(file);
  // Repository docs use inline Markdown links; remote URLs are not fetched.
  for (const match of text.matchAll(/\[[^\]\n]*\]\((?:<([^>]+)>|([^\s)]+))(?:\s+"[^"]*")?\)/g)) {
    const href = match[1] || match[2];
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) continue;
    links += 1;
    try {
      const hash = href.indexOf("#");
      const pathname = decodeURIComponent((hash < 0 ? href : href.slice(0, hash)).split("?")[0]);
      const fragment = hash < 0 ? "" : decodeURIComponent(href.slice(hash + 1));
      const target = pathname ? path.resolve(path.dirname(file), pathname) : file;
      const entry = await stat(target);
      if (fragment && entry.isFile() && target.endsWith(".md")) {
        const { anchors } = await readDocument(target);
        if (!anchors.has(fragment)) throw new Error("missing heading");
      }
    } catch (error) {
      errors.push(`${relativePath}: ${href} (${error.code || error.message})`);
    }
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Documentation links passed (${files.length} files, ${links} local links).`);
}
