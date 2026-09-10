import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createContext, Script } from "node:vm";
import { JSDOM } from "jsdom";
import { build, loadConfigFromFile } from "vite";
import { buildLegacyCanvas, bundleClassicScripts } from "./copy-legacy-canvas.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

async function temporaryDirectory(t) {
  const parent = path.resolve(os.tmpdir());
  const directory = await mkdtemp(path.join(parent, "reelay-legacy-build-"));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(directory)), parent);
    assert.ok(path.basename(directory).startsWith("reelay-legacy-build-"));
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

test("classic concatenation preserves order, local strict mode, ASI and global bindings", () => {
  const scripts = [
    { name: "first.js", source: '(function () { "use strict"; globalThis.order = [1]; globalThis.strictThis = (function () { return this; })(); })() // EOF' },
    { name: "second.js", source: '(function () { globalThis.order.push(2); })()' },
    { name: "app.js", source: 'var shared = 3; const lexical = 4; function publicFunction() { return this; } order.push(shared + lexical);' },
  ];
  const context = createContext({});
  new Script(bundleClassicScripts(scripts)).runInContext(context);
  assert.equal(new Script('JSON.stringify(order)').runInContext(context), "[1,2,7]");
  assert.equal(context.strictThis, undefined);
  assert.equal(context.shared, 3);
  assert.equal(new Script("lexical").runInContext(context), 4);
  assert.equal(new Script("publicFunction() === globalThis").runInContext(context), true);
});

test("refuses script identity, top-level strictness and changed global declaration timing", () => {
  const last = { name: "app.js", source: "const later = 1;" };
  for (const source of [
    '"use strict"; (() => {})();',
    '(() => { document.currentScript.src; })();',
    '(() => { document["currentScript"].src; })();',
    '(() => { document.write("text"); })();',
    '(() => { globalThis.result = typeof later; })();',
    '(async () => { await Promise.resolve(); })();',
    'const topLevel = 1;',
  ]) {
    assert.throws(() => bundleClassicScripts([{ name: "first.js", source }, last]));
  }
  assert.throws(() => bundleClassicScripts([{ name: "app.js", source: '"use strict"; const value = 1;' }]), /strict mode/);
});

test("builds the real entry with content hashes, complete references and unchanged CSS order", async (t) => {
  const output = await temporaryDirectory(t);
  const before = await readFile(path.join(root, "index.html"), "utf8");
  const result = await buildLegacyCanvas(root, output);
  const html = await readFile(path.join(output, "index.html"), "utf8");
  assert.match(result.faviconReference, /favicon-account-[a-f0-9]+\.svg$/);
  assert.ok(html.includes(`href="${result.faviconReference}"`));
  assert.deepEqual(await readFile(path.join(output, result.faviconReference)), await readFile(path.join(root, "assets/favicon-account.svg")));
  assert.doesNotMatch(html, /favicon-experience/);
  assert.equal(result.scriptCount, [...before.matchAll(/<script src=/g)].length);
  assert.equal([...html.matchAll(/<script\b/g)].length, 1);
  assert.equal([...html.matchAll(/rel="stylesheet"/g)].length, 1);
  assert.match(result.editorReference, /^\.\/assets\/prompt-editor-[a-f0-9]{16}\.js$/);
  assert.ok(html.includes(`data-prompt-editor-src="${result.editorReference}"`));
  for (const reference of [result.scriptReference, result.styleReference, result.editorReference]) {
    const source = await readFile(path.join(output, reference));
    const hash = createHash("sha256").update(source).digest("hex").slice(0, 16);
    assert.ok(reference.includes(`-${hash}.`));
  }
  const css = await readFile(path.join(output, result.styleReference), "utf8");
  let position = -1;
  for (const filename of ["app.css", "canvas-chrome.css", "canvas-arrange.css", "canvas-asset-library.css", "canvas-entity-editor.css", "canvas-entity-use.css", "canvas-connections.css"]) {
    const original = await readFile(path.join(root, "styles", filename), "utf8");
    const next = css.indexOf(original);
    assert.ok(next > position, `${filename} keeps its original cascade position and exact contents`);
    position = next;
  }
  assert.doesNotMatch(css, /@import\b|\burl\s*\(/);
  for (const [, reference] of html.matchAll(/\s(?:src|href)="([^"]+)"/g)) {
    if (!/^(?:[a-z]+:|#|\/\/)/i.test(reference)) await access(path.join(output, reference.split(/[?#]/)[0]));
  }
  assert.equal(await readFile(path.join(root, "index.html"), "utf8"), before);
  const again = await buildLegacyCanvas(root, output);
  assert.equal(again.scriptReference, result.scriptReference);
  assert.equal(again.styleReference, result.styleReference);
  assert.equal(again.editorReference, result.editorReference);
});

test("experience legacy build uses its own hashed favicon without the account icon", async (t) => {
  const output = await temporaryDirectory(t);
  const result = await buildLegacyCanvas(root, output, { experience: true });
  const html = await readFile(path.join(output, "index.html"), "utf8");
  assert.match(result.faviconReference, /favicon-experience-[a-f0-9]+\.svg$/);
  assert.ok(html.includes(`href="${result.faviconReference}"`));
  assert.deepEqual(await readFile(path.join(output, result.faviconReference)), await readFile(path.join(root, "assets/favicon-experience.svg")));
  assert.doesNotMatch(html, /favicon-account/);
  assert.ok(!(await readdir(path.join(output, "assets"))).some((name) => name.startsWith("favicon-account")));
});

for (const [mode, variant] of [["production", "account"], ["experience", "experience"]]) {
  test(`shell HTML emits an accessible ${variant} favicon in ${mode} mode`, async (t) => {
    const fixture = await temporaryDirectory(t);
    await mkdir(path.join(fixture, "assets"));
    for (const name of ["account", "experience"]) {
      await copyFile(path.join(root, `assets/favicon-${name}.svg`), path.join(fixture, `assets/favicon-${name}.svg`));
    }
    // Use the real HTML and mode-specific plugin, without rebuilding unrelated UI.
    const sourceHtml = (await readFile(path.join(root, "app-shell.html"), "utf8")).replace(/<script\b[\s\S]*?<\/script>/g, "");
    await writeFile(path.join(fixture, "app-shell.html"), sourceHtml);
    const configured = await loadConfigFromFile({ command: "build", mode }, path.join(root, "vite.shell.config.ts"));
    const plugin = configured.config.plugins.flat().find((candidate) => candidate?.name === "reelay-site-favicon");
    assert.ok(plugin);
    const output = path.join(fixture, "dist");
    await build({ configFile: false, root: fixture, mode, logLevel: "silent", plugins: [plugin],
      build: { outDir: output, rollupOptions: { input: path.join(fixture, "app-shell.html") } } });
    const html = await readFile(path.join(output, "app-shell.html"), "utf8");
    const dom = new JSDOM(html);
    t.after(() => dom.window.close());
    const icons = dom.window.document.querySelectorAll('link[rel="icon"]');
    assert.equal(icons.length, 1);
    assert.equal(icons[0].getAttribute("type"), "image/svg+xml");
    const href = icons[0].getAttribute("href");
    assert.match(href, new RegExp(`^/assets/favicon-${variant}-.+\\.svg$`));
    assert.deepEqual(await readFile(path.join(output, href.slice(1))), await readFile(path.join(root, `assets/favicon-${variant}.svg`)));
    const other = variant === "account" ? "experience" : "account";
    assert.doesNotMatch(html, new RegExp(`favicon-${other}`));
    assert.ok(!(await readdir(path.join(output, "assets"))).some((name) => name.startsWith(`favicon-${other}`)));
  });
}

test("shell history fallback serves a demo query on the public root without capturing assets", async () => {
  const configured = await loadConfigFromFile({ command: "serve", mode: "development" }, path.join(root, "vite.shell.config.ts"));
  const plugin = configured.config.plugins.flat().find((candidate) => candidate?.name === "reelay-shell-history-fallback");
  let middleware;
  plugin.configureServer({ middlewares: { use: (handler) => { middleware = handler; } } });
  for (const [url, expected] of [
    ["/app?demo=admin", "/app-shell.html"],
    ["/app/login?demo=admin", "/app-shell.html"],
    ["/app/icon.svg?no-inline", "/app/icon.svg?no-inline"],
    ["/app/@vite/client", "/app/@vite/client"],
    ["/apple?demo=admin", "/apple?demo=admin"],
  ]) {
    const request = { url };
    let continued = false;
    middleware(request, {}, () => { continued = true; });
    assert.equal(request.url, expected);
    assert.equal(continued, true);
  }
});

function runCanvas(t, html, scripts) {
  const dom = new JSDOM(html, { url: "http://reelay.test/index.html", runScripts: "outside-only", pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const { window } = dom;
  let nextId = 0;
  window.crypto.randomUUID = () => `deterministic-${++nextId}`;
  window.Date.now = () => 1_700_000_000_000;
  window.Math.random = () => 0.5;
  window.performance.now = () => 100;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.structuredClone = structuredClone;
  window.requestAnimationFrame = () => 1;
  window.cancelAnimationFrame = () => {};
  window.setTimeout = () => 1;
  window.clearTimeout = () => {};
  window.URL.createObjectURL = () => "blob:http://reelay.test/mock";
  window.URL.revokeObjectURL = () => {};
  window.Element.prototype.setPointerCapture = () => {};
  window.Element.prototype.releasePointerCapture = () => {};
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const context = dom.getInternalVMContext();
  for (const script of scripts) new Script(script.source, { filename: script.name }).runInContext(context);
  return new Script(`JSON.stringify({
    account: state.account,
    theme: state.themeMode,
    canvases: state.canvases,
    activeCanvasId: state.activeCanvasId,
    assetLibrary: state.assetLibrary,
    generator: defaultGeneratorNode(10, 20, "video"),
    exports: Object.keys(globalThis).filter((key) => key.startsWith("REELAY_")).sort(),
    publicFunction: typeof globalThis.defaultGeneratorNode,
    creditText: document.querySelector("#profileCreditValue")?.textContent,
    renderedNodes: document.querySelector("#nodeLayer").innerHTML
  })`).runInContext(context);
}

test("the real combined classic script boots with the same state and exported globals as separate scripts", async (t) => {
  const html = await readFile(path.join(root, "index.html"), "utf8");
  const scripts = await Promise.all([...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(async ([, reference]) => {
    const name = reference.split(/[?#]/)[0].replace(/^\.\//, "");
    return { name, source: await readFile(path.join(root, name), "utf8") };
  }));
  const separate = runCanvas(t, html, scripts);
  const bundled = runCanvas(t, html, [{ name: "bundle.js", source: bundleClassicScripts(scripts) }]);
  assert.deepEqual(JSON.parse(bundled), JSON.parse(separate));
  assert.equal(JSON.parse(bundled).account.credits, 3000);
  assert.equal(JSON.parse(bundled).publicFunction, "function");
});

test("the build rejects async scripts and CSS whose relative asset URLs would move", async (t) => {
  const fixture = await temporaryDirectory(t);
  await writeFile(path.join(fixture, "app.js"), "var initialized = true;");
  await writeFile(path.join(fixture, "styles.css"), '.example { background: url("./image.png"); }');
  const html = '<link rel="stylesheet" href="./styles.css" /><script src="./app.js"></script>';
  await writeFile(path.join(fixture, "index.html"), html.replace("<script src", "<script async src"));
  await assert.rejects(buildLegacyCanvas(fixture), /synchronous external classic/);
  await writeFile(path.join(fixture, "index.html"), html);
  await assert.rejects(buildLegacyCanvas(fixture), /CSS needs explicit URL/);
  await writeFile(path.join(fixture, "styles.css"), '.example { color: red; }');
  await writeFile(path.join(fixture, "index.html"), html.replace("</script>", '</script><div></div><script src="./app.js"></script>'));
  await assert.rejects(buildLegacyCanvas(fixture), /single definition IIFE/);
});
