import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { SquarePen } from "lucide";
import { readFile } from "node:fs/promises";
import { canvasIconsSource, installCanvasIcons } from "./helpers/canvas-icons.mjs";

test("every icon in the shipped canvas page is registered before app startup", async (t) => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const dom = new JSDOM(html, { runScripts: "outside-only" });
  t.after(() => dom.window.close());
  installCanvasIcons(dom.window);
  dom.window.REELAY_ICONS.refresh(dom.window.document);
  assert.equal(dom.window.document.querySelectorAll("i[data-lucide]").length, 0);
});

test("canvas icons use official geometry and preserve semantic attributes during refresh", (t) => {
  const dom = new JSDOM('<button><i data-lucide="square-pen" class="tool-icon" data-mode-icon="edit" aria-label="编辑"></i></button>', { runScripts: "outside-only" });
  t.after(() => dom.window.close());
  installCanvasIcons(dom.window);
  const { document, REELAY_ICONS: icons } = dom.window;
  icons.refresh(document);
  const svg = document.querySelector("svg");
  assert.equal(svg.getAttribute("class"), "lucide lucide-square-pen tool-icon");
  assert.equal(svg.getAttribute("data-mode-icon"), "edit");
  assert.equal(svg.getAttribute("aria-label"), "编辑");
  assert.equal(svg.getAttribute("viewBox"), "0 0 24 24");
  for (const [index, [tag, attrs]] of SquarePen.entries()) {
    assert.equal(svg.children[index].tagName, tag);
    for (const [name, value] of Object.entries(attrs)) assert.equal(svg.children[index].getAttribute(name), String(value));
  }
  icons.refresh(document);
  assert.equal(document.querySelector("svg"), svg, "refresh does not replace already rendered icons");
  assert.throws(() => icons.markup("unregistered-icon"), /Unknown canvas icon/, "unknown names cannot silently turn into circles");
});

test("canvas runtime stays a local subset and scopes refresh to its requested surface", (t) => {
  const dom = new JSDOM('<div id="target"><i data-lucide="image"></i></div><i id="outside" data-lucide="x"></i>', { runScripts: "outside-only" });
  t.after(() => dom.window.close());
  installCanvasIcons(dom.window);
  const { document, REELAY_ICONS: icons } = dom.window;
  icons.refresh(document.querySelector("#target"));
  assert.ok(document.querySelector("#target svg"));
  assert.equal(document.querySelector("#outside").tagName, "I");
  icons.refresh(document.querySelector("#outside"));
  assert.equal(document.querySelector("#outside").tagName, "svg");
  assert.ok(canvasIconsSource.length < 80_000, "avoid importing the full icon catalog");
});
