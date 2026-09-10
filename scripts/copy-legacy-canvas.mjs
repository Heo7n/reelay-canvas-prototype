import { createHash } from "node:crypto";
import { access, cp, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";
import ts from "typescript";
import { buildPromptEditor } from "./build-prompt-editor.mjs";

function localPath(root, reference) {
  if (/^(?:[a-z]+:|\/\/)/i.test(reference)) throw new Error(`Expected a local resource: ${reference}`);
  const cleanPath = reference.split(/[?#]/, 1)[0].replace(/^\//, "");
  const resolved = path.resolve(root, cleanPath);
  if (path.relative(root, resolved).startsWith("..") || path.isAbsolute(path.relative(root, resolved))) {
    throw new Error(`Resource leaves the build root: ${reference}`);
  }
  return resolved;
}

function replaceAdjacent(html, matches, replacement) {
  if (!matches.length) throw new Error("Expected legacy entry resources.");
  for (let index = 1; index < matches.length; index += 1) {
    if (html.slice(matches[index - 1].index + matches[index - 1][0].length, matches[index].index).trim()) {
      throw new Error("Legacy resources must remain adjacent to preserve execution and cascade order.");
    }
  }
  const last = matches.at(-1);
  return html.slice(0, matches[0].index) + replacement + html.slice(last.index + last[0].length);
}

function unparenthesize(expression) {
  return ts.isParenthesizedExpression(expression) ? unparenthesize(expression.expression) : expression;
}

// Keep classic global bindings: neither a module conversion nor an app wrapper.
// Earlier files must be definition-only IIFEs; app.js remains the final initializer.
export function bundleClassicScripts(scripts) {
  let source = "";
  let appOffset = 0;
  for (const [index, script] of scripts.entries()) {
    const parsed = ts.createSourceFile(script.name, script.source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    new Script(script.source, { filename: script.name });
    if (/\bcurrentScript\b|\bdocument\s*(?:\.\s*(?:write|scripts)\b|\[)/.test(script.source)) {
      throw new Error(`Script identity or document parsing depends on a separate script: ${script.name}`);
    }
    for (const statement of parsed.statements) {
      if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) break;
      if (statement.expression.text === "use strict") {
        throw new Error(`Top-level strict mode cannot cross a classic script boundary: ${script.name}`);
      }
    }
    if (index < scripts.length - 1) {
      const [statement] = parsed.statements;
      const expression = statement && ts.isExpressionStatement(statement) ? unparenthesize(statement.expression) : null;
      const callee = expression && ts.isCallExpression(expression) ? unparenthesize(expression.expression) : null;
      if (parsed.statements.length !== 1 || !callee || !(ts.isFunctionExpression(callee) || ts.isArrowFunction(callee))) {
        throw new Error(`Expected a single definition IIFE before app.js: ${script.name}`);
      }
      if (callee.asteriskToken || callee.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword)) {
        throw new Error(`Definition IIFEs must execute synchronously: ${script.name}`);
      }
    } else {
      if (script.name !== "app.js") throw new Error("app.js must remain the final classic script.");
      appOffset = source.length;
    }
    // A newline ends a trailing line comment; a semicolon prevents IIFE/ASI joins.
    source += `\n;\n// ${script.name}\n${script.source}\n`;
  }
  if (!scripts.length) throw new Error("Expected classic scripts.");
  new Script(source, { filename: "legacy-canvas.js" });

  // Concatenation hoists app globals earlier. Refuse any dependency on that new
  // visibility (including typeof/TDZ), using the existing TypeScript dependency.
  const filename = "legacy-canvas.js";
  const options = { allowJs: true, noLib: true, noResolve: true };
  const host = ts.createCompilerHost(options);
  host.getSourceFile = (name) => name === filename
    ? ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS) : undefined;
  const program = ts.createProgram([filename], options, host);
  const checker = program.getTypeChecker();
  function inspect(node) {
    if (node.pos >= appOffset) return;
    if (ts.isIdentifier(node)) {
      const symbol = checker.getSymbolAtLocation(node);
      if (symbol?.declarations?.some((declaration) => declaration.pos >= appOffset)) {
        throw new Error(`An earlier script depends on an app.js binding: ${node.text}`);
      }
    }
    ts.forEachChild(node, inspect);
  }
  inspect(program.getSourceFile(filename));
  return source;
}

export function generationPreviewAssets(scripts) {
  const context = {};
  context.window = context;
  for (const name of ["data/model-catalog.js", "src/config/prototype-config.js", "src/config/generation-demo-presets.js"]) {
    const script = scripts.find((entry) => entry.name === name);
    if (!script) throw new Error(`Missing generation preview definition: ${name}`);
    new Script(script.source, { filename: name }).runInNewContext(context);
  }
  const presets = context.REELAY_GENERATION_DEMO_PRESETS.create({
    models: context.REELAY_MODEL_CATALOG, media: context.REELAY_PROTOTYPE_CONFIG.assetLibrarySeed.media,
  });
  return [...new Set(presets.flatMap((preset) => preset.input.references.map((asset) => asset.url)))]
    .filter((url) => !/^(?:https?:|\/\/)/.test(url))
    .map((url) => {
      if (!/^\.\/assets\/home\/[a-z0-9-]+\.(?:png|jpg|webp)$/.test(url)) {
        throw new Error(`Unexpected published preview asset: ${url}`);
      }
      return url;
    });
}

// The current styles contain no asset URLs, namespace rules, or conditional
// imports. Fail closed if that contract changes rather than relocating URLs.
async function flattenStyles(root, reference, ancestors = []) {
  const filename = localPath(root, reference);
  if (ancestors.includes(filename)) throw new Error(`Circular CSS import: ${reference}`);
  let source = await readFile(filename, "utf8");
  const imports = [...source.matchAll(/@import\s+url\("([^"]+)"\)\s*;/g)];
  if (imports.length) {
    if (source.replace(/@import\s+url\("[^"]+"\)\s*;/g, "").trim()) {
      throw new Error(`Only unconditional import-only CSS entry files can be flattened: ${reference}`);
    }
    source = (await Promise.all(imports.map((match) => flattenStyles(
      path.dirname(filename), match[1], [...ancestors, filename],
    )))).join("\n");
  }
  if (/\burl\s*\(|@(?:import|charset|namespace)\b/i.test(source)) {
    throw new Error(`CSS needs explicit URL or at-rule handling before bundling: ${reference}`);
  }
  return `/* ${reference} */\n${source}\n`;
}

async function writeHashed(outputRoot, extension, source, name = "legacy-canvas") {
  const hash = createHash("sha256").update(source).digest("hex").slice(0, 16);
  const reference = `./assets/${name}-${hash}.${extension}`;
  const filename = localPath(outputRoot, reference);
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, source);
  return reference;
}

export async function buildLegacyCanvas(workspaceRoot, outputRoot = path.join(workspaceRoot, "dist", "shell"), { experience = false } = {}) {
  let html = await readFile(path.join(workspaceRoot, "index.html"), "utf8");
  let editorReference;
  if (/\sdata-prompt-editor-src=/.test(html)) {
    if (!html.includes('data-prompt-editor-src="./assets/prompt-editor.js"')) throw new Error("Unsupported prompt editor entry.");
    const editorSource = await buildPromptEditor(workspaceRoot);
    const editorHash = createHash("sha256").update(editorSource).digest("hex").slice(0, 16);
    editorReference = `./assets/prompt-editor-${editorHash}.js`;
    await mkdir(path.join(outputRoot, "assets"), { recursive: true });
    await writeFile(localPath(outputRoot, editorReference), editorSource);
    html = html.replace('data-prompt-editor-src="./assets/prompt-editor.js"', `data-prompt-editor-src="${editorReference}"`);
  }
  const scriptTags = [...html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi)];
  const scripts = await Promise.all(scriptTags.map(async ([tag]) => {
    const match = tag.match(/^<script src="([^"]+)"><\/script>$/);
    if (!match) throw new Error(`Only synchronous external classic scripts can be bundled: ${tag}`);
    const filename = localPath(workspaceRoot, match[1]);
    return { name: path.relative(workspaceRoot, filename).split(path.sep).join("/"), source: await readFile(filename, "utf8") };
  }));
  const scriptReference = await writeHashed(outputRoot, "js", bundleClassicScripts(scripts));
  html = replaceAdjacent(html, scriptTags, `<script src="${scriptReference}"></script>`);

  const styleTags = [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*>/gi)];
  const styles = await Promise.all(styleTags.map(async ([tag]) => {
    const match = tag.match(/^<link rel="stylesheet" href="([^"]+)"\s*\/>$/);
    if (!match) throw new Error(`Unsupported stylesheet attributes: ${tag}`);
    return flattenStyles(workspaceRoot, match[1]);
  }));
  const styleReference = await writeHashed(outputRoot, "css", styles.join("\n"));
  html = replaceAdjacent(html, styleTags, `<link rel="stylesheet" href="${styleReference}" />`);

  const faviconName = `favicon-${experience ? "experience" : "account"}`;
  const faviconSource = await readFile(path.join(workspaceRoot, "assets", `${faviconName}.svg`));
  const faviconReference = await writeHashed(outputRoot, "svg", faviconSource, faviconName);
  html = html.replace("./assets/favicon-account.svg", faviconReference);

  for (const relativePath of ["assets/reelay-logo.png", "assets/canvas-empty-cursor.png"]) {
    const destination = path.join(outputRoot, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(workspaceRoot, relativePath), destination);
  }
  for (const relativePath of ["assets/icons", "assets/model-logos"]) {
    await cp(path.join(workspaceRoot, relativePath), path.join(outputRoot, relativePath), { recursive: true });
  }

  // Runtime presets contain media URLs, which are invisible to HTML/Vite asset scanning.
  // Ship exactly their local dependencies in both account and experience builds.
  const previewReferences = generationPreviewAssets(scripts);
  for (const reference of previewReferences) {
    const destination = localPath(outputRoot, reference);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(localPath(workspaceRoot, reference), destination);
  }

  const references = [...html.matchAll(/\s(?:src|href)="([^"]+)"/g)]
    .map((match) => match[1]).filter((reference) => !/^(?:[a-z]+:|#|\/\/)/i.test(reference));
  if (editorReference) references.push(editorReference);
  references.push(...previewReferences);
  await Promise.all(references.map((reference) => access(localPath(outputRoot, reference))));
  await writeFile(path.join(outputRoot, "index.html"), html);
  return { scriptCount: scripts.length, referenceCount: references.length, scriptReference, styleReference, faviconReference, editorReference };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildLegacyCanvas(process.cwd());
  console.log(`Legacy canvas built (${result.scriptCount} classic scripts → 1 JS + 1 CSS; ${result.referenceCount} entry references verified).`);
}
