import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const sources = await Promise.all(["src/config/inspiration-catalog.js", "src/legacy-canvas/canvas-inspiration-discovery.js"]
  .map((file) => readFile(new URL(`../${file}`, import.meta.url), "utf8")));
function setup(t, options = {}) {
  const dom = new JSDOM('<body><button id="trigger">筛选</button><input id="outside"><section id="host"></section><div id="grid"><button class="inspiration-card-preview" data-library-preview="inspiration-coast"><img></button></div></body>', { runScripts: "outside-only" });
  const { window } = dom;
  const document = window.document;
  const host = document.getElementById("host");
  const grid = document.getElementById("grid");
  const jobs = new Map();
  let scope = "main";
  let count = 0;
  let nextJob = 0;
  let reduce = false;
  window.matchMedia = () => ({ matches: reduce });
  window.HTMLMediaElement.prototype.play = () => Promise.resolve();
  window.HTMLMediaElement.prototype.pause = () => {};
  window.HTMLMediaElement.prototype.load = () => {};
  Object.defineProperty(document, "hidden", { value: false, configurable: true });
  sources.forEach((source) => window.eval(source));
  const catalog = window.REELAY_INSPIRATION_CATALOG;
  const controller = window.REELAY_CANVAS_INSPIRATION_DISCOVERY.create({ document, host, grid, catalog,
    getTrigger: () => document.getElementById("trigger"), getScope: () => scope, onChange: () => { count++; },
    schedule: (fn) => { const id = ++nextJob; jobs.set(id, fn); return id; }, cancel: (id) => jobs.delete(id),
    ...options,
  });
  controller.sync({ active: true });
  assert.equal(host.hidden, true);
  controller.toggle();
  t.after(() => { controller.destroy(); window.close(); });
  return { window, document, host, grid, controller, jobs, catalog, changed: () => count,
    flush() { for (const [id, fn] of jobs) { jobs.delete(id); fn(); } },
    scope(value) { scope = value; }, reduce(value) { reduce = value; },
    click(selector) { const button = host.querySelector(selector); assert.ok(button, selector); button.click(); },
  };
}
test("facet rows retain combined choices, summaries and keyboard focus", (t) => {
  const s = setup(t);
  s.click('[data-discovery-facet="movement:tracking"]');
  s.click('[data-discovery-group="light"]');
  s.click('[data-discovery-facet="light:backlight"]');
  assert.equal(s.controller.count, 2);
  assert.deepEqual(s.controller.results("").map((clip) => clip.id), s.catalog.search({ facets: ["movement:tracking", "light:backlight"] }).map((clip) => clip.id));
  assert.equal(s.document.activeElement.dataset.discoveryFacet, "light:backlight");
  s.document.activeElement.dispatchEvent(new s.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(s.controller.expanded, false);
  assert.equal(s.document.activeElement.id, "trigger");
  assert.equal(s.host.hidden, true);
  s.controller.toggle();
  assert.equal(s.controller.count, 2);
  s.click('[data-discovery-clear-group="movement"]');
  assert.equal(s.controller.count, 1);
  s.click('[data-discovery-reset]');
  assert.equal(s.controller.results("").length, 12);
});

test("matching context narrows displayed counts while retaining the catalog facet vocabulary", (t) => {
  const s = setup(t, { filterCandidates: (clips) => clips.filter((clip) => clip.id === "inspiration-coast") });
  assert.equal(s.host.querySelector('[data-discovery-results]').textContent, "1 个片段");
  assert.equal(s.host.querySelector('[data-discovery-facet="movement:tracking"] small').textContent, "1");
  const color = s.host.querySelector('[data-discovery-facet="light:colored"]');
  assert.ok(color);
  assert.equal(color.querySelector('small').textContent, "0");
  assert.equal(color.classList.contains("is-empty"), true);
  color.click();
  assert.equal(s.host.querySelector('[data-discovery-results]').textContent, "0 个片段");
  s.click('[data-discovery-reset]');
  s.controller.sync({ active: true, query: "雪山" });
  assert.equal(s.host.querySelector('[data-discovery-results]').textContent, "0 个片段");
});
test("filter state survives space changes and resets for a different canvas", (t) => {
  const s = setup(t);
  s.click('[data-discovery-facet="light:colored"]');
  s.controller.sync({ active: false });
  assert.equal(s.host.hidden, true);
  s.controller.sync({ active: true, query: "海岸" });
  assert.equal(s.controller.count, 1);
  assert.equal(s.controller.results("海岸").length, 0);
  s.scope("other");
  assert.equal(s.controller.results("").length, 12);
  assert.equal(s.controller.count, 0);
});
test("only one muted preview is mounted and pending/playing media releases on leave, hide and selection", (t) => {
  const s = setup(t);
  const button = s.grid.querySelector("button");
  const enter = () => button.dispatchEvent(new s.window.MouseEvent("pointerover", { bubbles: true }));
  enter();
  assert.equal(s.jobs.size, 1);
  button.dispatchEvent(new s.window.MouseEvent("pointerout", { bubbles: true }));
  s.flush();
  assert.equal(s.grid.querySelectorAll("video").length, 0);
  enter(); s.flush();
  const video = s.grid.querySelector("video");
  assert.ok(video);
  assert.equal(video.muted, true);
  assert.equal(video.loop, true);
  s.controller.sync({ active: false });
  assert.equal(video.getAttribute("src"), null);
  assert.equal(video.isConnected, false);
  s.controller.sync({ active: true, selectionMode: true });
  enter(); s.flush();
  assert.equal(s.grid.querySelectorAll("video").length, 0);
  s.controller.sync({ active: true });
  s.reduce(true); enter(); s.flush();
  assert.equal(s.grid.querySelectorAll("video").length, 0);
});


test("filter popover dismisses outside without resetting filters or rerendering the clicked control", (t) => {
  const s = setup(t);
  s.click('[data-discovery-facet="movement:tracking"]');
  const changes = s.changed();
  s.document.getElementById("outside").dispatchEvent(new s.window.MouseEvent("pointerdown", { bubbles: true }));
  assert.equal(s.host.hidden, true);
  assert.equal(s.controller.count, 1);
  assert.equal(s.changed(), changes);
  s.controller.toggle();
  assert.equal(s.host.hidden, false);
  s.controller.sync({ active: true, selectionMode: true });
  assert.equal(s.host.hidden, true);
  s.controller.sync({ active: false });
  s.controller.sync({ active: true });
  assert.equal(s.host.hidden, true);
  assert.equal(s.controller.count, 1);
});


test("options search preserves the input and selected criteria through IME, rerenders and empty results", (t) => {
  const s = setup(t);
  assert.equal(s.host.querySelector('[data-discovery-group="content"]'), null);
  assert.equal(s.host.querySelectorAll('[data-discovery-group]').length, 6);
  assert.equal([...s.host.querySelectorAll('.inspiration-facet-body')].every((body) => body.hidden), true);
  s.click('[data-discovery-group="light"]');
  const input = s.host.querySelector('[data-discovery-search="light"]');
  input.focus();
  input.value = "backlight";
  input.dispatchEvent(new s.window.InputEvent("input", { bubbles: true, isComposing: true }));
  assert.ok(s.host.querySelectorAll('[data-discovery-options="light"] button').length > 1);
  input.dispatchEvent(new s.window.CompositionEvent("compositionend", { bubbles: true }));
  assert.equal(s.host.querySelectorAll('[data-discovery-options="light"] button').length, 1);
  s.click('[data-discovery-facet="light:backlight"]');
  assert.equal(s.host.querySelector('[data-discovery-search="light"]'), input);
  assert.equal(input.value, "backlight");
  assert.equal(s.host.querySelector('[data-discovery-group="light"] .inspiration-facet-summary').textContent, "逆光");
  input.value = "xyz-not-found";
  input.dispatchEvent(new s.window.InputEvent("input", { bubbles: true }));
  assert.match(s.host.querySelector('[data-discovery-options="light"]').textContent, /没有匹配/);
  assert.equal(s.controller.count, 1);
  s.click('[data-discovery-clear-group="light"]');
  assert.equal(s.controller.count, 0);
});

test("card feature refines results without opening details, toggling off or changing batch mode", (t) => {
  const s = setup(t);
  const button = s.document.createElement("button");
  button.dataset.discoveryCardFacet = "movement:tracking";
  s.grid.append(button);
  let bubbled = 0;
  s.document.addEventListener("click", () => { bubbled++; });
  button.click();
  assert.equal(s.controller.count, 1);
  assert.equal(bubbled, 0);
  button.click();
  assert.equal(s.controller.count, 1);
  assert.equal(s.controller.results("").length, 6);
  s.controller.sync({ active: true, selectionMode: true });
  button.dataset.discoveryCardFacet = "light:backlight";
  button.click();
  assert.equal(s.controller.count, 1);
});


test("matched hover previews start and loop within the real shot without flashing the segment opening", (t) => {
  const s = setup(t);
  const button = s.grid.querySelector('button');
  const shot = s.catalog.clips[0].shots[1];
  const card = s.document.createElement('article');
  card.className = 'inspiration-card'; card.dataset.inspirationMatchShot = shot.id;
  button.replaceWith(card); card.append(button);
  let plays = 0;
  s.window.HTMLMediaElement.prototype.play = () => { plays++; return Promise.resolve(); };
  button.dispatchEvent(new s.window.MouseEvent('pointerover', { bubbles: true })); s.flush();
  const video = card.querySelector('video');
  assert.equal(video.loop, false);
  assert.equal(plays, 0);
  video.dispatchEvent(new s.window.Event('loadedmetadata'));
  assert.equal(video.currentTime, shot.start);
  assert.equal(plays, 1);
  video.dispatchEvent(new s.window.Event('loadeddata'));
  assert.equal(video.classList.contains('is-ready'), false);
  video.dispatchEvent(new s.window.Event('seeked'));
  assert.equal(video.classList.contains('is-ready'), true);
  video.currentTime = shot.end + 0.05; video.dispatchEvent(new s.window.Event('timeupdate'));
  assert.equal(video.currentTime, shot.start);
  assert.equal(plays, 2);
  video.dispatchEvent(new s.window.Event('ended'));
  assert.equal(plays, 3);
  s.controller.stopPreview();
  video.dispatchEvent(new s.window.Event('ended'));
  assert.equal(plays, 3);
  card.dataset.inspirationMatchShot = 'missing';
  button.dispatchEvent(new s.window.MouseEvent('pointerover', { bubbles: true })); s.flush();
  assert.equal(card.querySelector('video').loop, true);
  assert.equal(plays, 4);
});
