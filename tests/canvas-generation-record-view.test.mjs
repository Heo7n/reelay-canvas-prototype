import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const [source, placement, mediaPlayer] = await Promise.all([
  "canvas-generation-record-view.js", "canvas-popover-placement.js", "canvas-generation-media.js",
].map((name) => readFile(new URL(`../src/legacy-canvas/${name}`, import.meta.url), "utf8")));

function fixture(t, options = {}) {
  const dom = new JSDOM('<!doctype html><body><div id="records"></div><button id="outside">其他</button></body>', { runScripts: "outside-only" });
  const { window } = dom; const { document } = window;
  // jsdom lacks the native reflected inert property used by the inline actions.
  if (!("inert" in window.HTMLElement.prototype)) {
    Object.defineProperty(window.HTMLElement.prototype, "inert", {
      configurable: true,
      get() { return this.hasAttribute("inert"); },
      set(value) { this.toggleAttribute("inert", Boolean(value)); },
    });
  }
  const container = document.querySelector("#records");
  let now = 100000; let id = 0; let width = 508; let scope = { projectId: "project-1", conversationId: "chat-1", canvasId: "canvas-1" };
  let tasks = []; const timers = new Map(); const actions = []; let pauses = 0;
  const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    if (this === container) return rect(850, 60, width + 52, 600);
    if (this.classList.contains("generation-record-list")) return rect(876, 100, width, 900);
    if (this.classList.contains("generation-record-references")) return rect(876, 180, 106, 64);
    if (this.classList.contains("generation-record-counts")) return rect(876, 180, 34, 54);
    if (this.classList.contains("generation-record-popover")) return rect(0, 0, Math.min(380, width), 140);
    if (this.classList.contains("generation-record")) return rect(876, 150, width, 240);
    return rect(876, 250, 100, 60);
  };
  Object.defineProperty(window, "innerWidth", { value: 1440 });
  Object.defineProperty(window, "innerHeight", { value: 900 });
  Object.defineProperty(container, "clientHeight", { value: 600 });
  Object.defineProperty(container, "clientWidth", { get: () => width });
  Object.defineProperty(container, "scrollHeight", { value: 1800 });
  window.setTimeout = (callback, delay) => { const next = ++id; timers.set(next, { callback, at: now + delay }); return next; };
  window.clearTimeout = (timer) => timers.delete(timer);
  window.HTMLMediaElement.prototype.pause = () => { pauses++; };
  window.HTMLMediaElement.prototype.load = () => {};
  window.eval(placement); window.eval(mediaPlayer); window.eval(source);
  const controller = window.REELAY_GENERATION_RECORD_VIEW.createController({
    document, container, getScope: () => scope, getTasks: () => tasks, getTask: (id) => tasks.find((task) => task.id === id),
    onAction: (...args) => actions.push(args), now: () => now,
    placeAnchoredPopover: window.REELAY_CANVAS_POPOVER_PLACEMENT.placeAnchoredPopover,
    ...options,
  });
  t.after(() => { controller.dispose(); dom.window.close(); });
  function task(overrides = {}) {
    return { id: `task-${tasks.length + 1}`, scope: { ...scope }, status: "queued", createdAt: now,
      cancelUntil: now + 7000, input: { prompt: "保留瓶身设计，镜头缓慢推进。", modelName: "Seedance 2.5", parameterSummary: "全模态参考 · 16:9 · 480P · 10s", cost: 24, references: [] },
      charged: 24, refunded: 0, ...overrides };
  }
  function advance(amount) {
    now += amount;
    for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); }
  }
  function references(count) {
    return Array.from({ length: count }, (_, index) => ({ key: `asset:${index}`, asset: { type: index === count - 1 ? "video" : "image", name: `参考${index}`, url: `https://example.test/${index}.png` } }));
  }
  return { window, document, container, controller, task, references, actions, timers, advance,
    setTasks(value) { tasks = value; controller.render(); }, setScope(value) { scope = value; controller.render(); },
    setWidth(value) { width = value; window.dispatchEvent(new window.Event("resize")); }, get pauses() { return pauses; },
    query: (selector) => document.querySelector(selector), all: (selector) => [...document.querySelectorAll(selector)],
  };
}

test("generation cards keep media and prompt DOM through task updates and width changes", (t) => {
  const f = fixture(t); const task = f.task({ status: "succeeded", result: { type: "video", url: "https://example.test/result.mp4" } });
  f.setTasks([task]);
  const media = f.query("video"); const prompt = f.query(".generation-record-prompt");
  media.currentTime = 12;
  task.addedNodeId = "node-1"; f.controller.render(); f.setWidth(288); f.controller.render();
  assert.equal(f.query("video"), media); assert.equal(media.currentTime, 12);
  assert.equal(f.query(".generation-record-prompt"), prompt); assert.equal(f.pauses, 0);
  assert.equal(f.query(".generation-record-result-tools"), null);
  assert.equal(f.query('[data-generation-action="add"]'), null);
  assert.equal(f.query('[draggable="true"]'), null);
  assert.equal(media.controls, false);
  assert.equal(f.all('.generation-media-overlay').length, 1);
});

test("record video controls dispose on result removal while hiding only pauses playback", (t) => {
  const f = fixture(t);
  const task = f.task({ status: "succeeded", result: { type: "video", url: "https://example.test/result.mp4" } });
  f.setTasks([task]);
  const media = f.query("video");
  const controls = f.query(".generation-media-overlay");
  const current = controls.querySelector("[data-media-current]");
  media.currentTime = 3;
  media.dispatchEvent(new f.window.Event("timeupdate"));
  assert.equal(current.textContent, "0:03");
  f.controller.close();
  assert.equal(f.query(".generation-media-overlay"), controls, "closing sidebar preserves player and position");
  assert.equal(media.currentTime, 3);
  f.setTasks([]);
  assert.equal(controls.isConnected, false);
  assert.equal(media.hasAttribute("src"), false);
  media.currentTime = 7;
  media.dispatchEvent(new f.window.Event("timeupdate"));
  assert.equal(current.textContent, "0:03", "removed player releases its media event listeners");
});

test("busy record exposes cancellation for seven seconds with no countdown or delete action", (t) => {
  const f = fixture(t); const task = f.task(); f.setTasks([task]);
  const cancel = f.query('[data-generation-action="cancel"]');
  assert.equal(cancel.hidden, false); assert.equal(cancel.textContent, "取消生成");
  assert.equal(f.query(".generation-record-terminal-actions").hidden, true);
  assert.equal(f.timers.size, 0, "service owns task deadline timers");
  f.advance(6999); assert.equal(cancel.hidden, false);
  f.advance(2); f.controller.render(); assert.equal(cancel.hidden, true);
  cancel.click(); assert.equal(f.actions.length, 0);
  assert.ok(f.query(".generation-record-wait"));
});

test("cancel and failure collapse output and only confirmed refund is displayed", (t) => {
  const f = fixture(t); const task = f.task(); f.setTasks([task]);
  f.query('[data-generation-action="cancel"]').click(); assert.equal(f.actions[0][0], "cancel");
  task.status = "canceled"; task.refunded = 24; f.controller.render();
  assert.equal(f.query(".generation-record-wait"), null);
  assert.equal(f.query(".generation-record-refund").textContent, "积分已返还");
  assert.match(f.query(".generation-record-outcome").textContent, /生成已取消/);
  task.status = "failed"; task.refunded = 0; task.error = "输入视频无法读取"; f.controller.render();
  assert.equal(f.query(".generation-record-refund"), null);
  assert.match(f.query(".generation-record-outcome").textContent, /生成失败｜输入视频无法读取/);
  f.query('[data-generation-action="feedback"]').click(); assert.equal(f.actions.at(-1)[0], "feedback");
  assert.match(f.query('[data-generation-action="feedback"]').title, /复制任务编号/);
});

test("reference summary combines cover and nonzero counts while the full strip stays collapsed", (t) => {
  const f = fixture(t); const task = f.task(); task.input.referenceSnapshot = f.references(3); f.setTasks([task]);
  const strip = f.query(".generation-record-references");
  assert.equal(strip.getAttribute("aria-label"), "参考素材：2 个图片、1 个视频");
  assert.equal(strip.matches('button[data-record-popover="references"]'), true);
  assert.equal(strip.getAttribute("aria-expanded"), "false");
  assert.equal(f.query(".generation-record-popover"), null);
  assert.equal(f.all(".generation-record-reference-item").length, 0);
  assert.ok(strip.querySelector(".generation-record-counts"));
  assert.ok(strip.querySelector(".generation-record-cover img"));
  assert.equal(strip.contains(f.query(".generation-record-prompt")), false);
  assert.equal(f.all(".generation-record-counts > span").length, 2);
  assert.doesNotMatch(f.query(".generation-record-parameters").textContent, /个图片|个视频|个音频/);
  assert.equal(f.query(".generation-record-footer time"), null);
  assert.ok(f.query('button[data-record-popover="details"]'));
});

function availablePage(element) {
  return element && !element.hidden && !element.disabled && element.style.visibility !== "hidden";
}

function activateWithPointer(f, element) {
  for (const type of ["pointerdown", "mousedown"]) element.dispatchEvent(new f.window.MouseEvent(type, { bubbles: true, button: 0 }));
  element.focus();
  for (const type of ["pointerup", "mouseup", "click"]) element.dispatchEvent(new f.window.MouseEvent(type, { bubbles: true, button: 0, detail: 1 }));
}

test("paging an unpinned hover gallery retains its navigation and survives pointer/focus transitions", (t) => {
  const f = fixture(t); const task = f.task(); task.input.referenceSnapshot = f.references(16); f.setTasks([task]); f.setWidth(288);
  const summary = f.query(".generation-record-references");
  summary.dispatchEvent(new f.window.MouseEvent("pointerover", { bubbles: true })); f.advance(301);
  const portal = f.query(".generation-record-references-popover");
  summary.dispatchEvent(new f.window.MouseEvent("pointerout", { bubbles: true, relatedTarget: portal }));
  portal.dispatchEvent(new f.window.MouseEvent("pointerenter", { relatedTarget: summary }));
  const next = f.query('[data-reference-page="1"]'); const rail = f.query(".generation-record-reference-rail");
  activateWithPointer(f, next);
  assert.equal(f.query(".generation-record-references-popover"), portal);
  assert.equal(f.query(".generation-record-reference-rail"), rail);
  assert.equal(f.query('[data-reference-page="1"]'), next);
  assert.equal(f.document.activeElement, next);
  f.advance(500); assert.equal(f.query(".generation-record-references-popover"), portal);
  assert.ok(Number(f.query("[data-reference-preview]").dataset.referencePreview) > 0);
});

test("keyboard paging cancels a pending hover departure and keeps a valid focus at the last page", (t) => {
  const f = fixture(t); const task = f.task(); task.input.referenceSnapshot = f.references(6); f.setTasks([task]); f.setWidth(288);
  const summary = f.query(".generation-record-references");
  summary.dispatchEvent(new f.window.MouseEvent("pointerover", { bubbles: true })); f.advance(301);
  const portal = f.query(".generation-record-references-popover");
  portal.dispatchEvent(new f.window.MouseEvent("pointerleave", { relatedTarget: f.query("#outside") }));
  assert.equal(f.timers.size, 1);
  const next = f.query('[data-reference-page="1"]'); next.focus();
  next.dispatchEvent(new f.window.KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
  next.dispatchEvent(new f.window.MouseEvent("click", { bubbles: true, detail: 0 }));
  f.advance(500);
  assert.equal(f.query(".generation-record-references-popover"), portal);
  assert.equal(f.query('[data-reference-page="1"]'), next); assert.equal(next.disabled, true);
  assert.equal(f.document.activeElement, f.query('[data-reference-page="-1"]'));
  assert.equal(f.timers.size, 0);
});

function mockReferenceAnimations(f) {
  const animations = [];
  f.window.HTMLElement.prototype.animate = function (frames, timing) {
    const animation = { element: this, frames, timing, cancelled: false, onfinish: null,
      cancel() { this.cancelled = true; }, finish() { this.onfinish?.(); } };
    animations.push(animation); return animation;
  };
  return animations;
}

test("rapid gallery paging slides in the requested direction, clips to ten slots and releases obsolete media", (t) => {
  const f = fixture(t, { assetPreview: (asset) => `<video src="${asset.url}" preload="metadata" muted></video>` });
  const animations = mockReferenceAnimations(f); const task = f.task();
  task.input.referenceSnapshot = Array.from({ length: 35 }, (_, index) => ({ key: `clip:${index}`, asset: { type: "video", url: `https://example.test/${index}.mp4` } }));
  f.setTasks([task]); f.setWidth(1400); f.query(".generation-record-references").click();
  const portal = f.query(".generation-record-references-popover"); const viewport = f.query(".generation-record-reference-viewport");
  const next = f.query('[data-reference-page="1"]'); const previous = f.query('[data-reference-page="-1"]');
  assert.equal(portal.querySelectorAll("video").length, 10, "only the current page is loaded initially");
  activateWithPointer(f, next);
  const staleFinish = animations.at(-1).onfinish;
  assert.equal(animations.at(-1).frames[0].transform, "translateX(580px)");
  assert.equal(animations.at(-2).frames[1].transform, "translateX(-580px)");
  assert.equal(viewport.style.width, "574px");
  assert.equal(portal.querySelectorAll("video").length, 20, "at most the incoming and outgoing page are mounted during movement");
  assert.equal(f.query(".generation-record-reference-page.is-leaving").getAttribute("aria-hidden"), "true");
  assert.equal(f.query(".generation-record-reference-page.is-leaving").inert, true);
  activateWithPointer(f, next); activateWithPointer(f, next); staleFinish();
  assert.equal(f.query(".generation-record-references-popover"), portal);
  assert.equal(f.query(".generation-record-reference-viewport"), viewport);
  assert.equal(f.query('[data-reference-page="1"]'), next); assert.equal(next.disabled, true);
  assert.equal(f.document.activeElement, previous);
  const currentItems = () => [...portal.querySelectorAll(".generation-record-reference-page:not(.is-leaving) [data-reference-preview]")];
  assert.deepEqual(currentItems().map((item) => Number(item.dataset.referencePreview)), [30, 31, 32, 33, 34]);
  assert.equal(viewport.style.width, "574px", "the short final page retains the ten-slot viewport throughout the slide");
  assert.equal(currentItems().length <= 10, true);
  assert.ok(animations.slice(0, 4).every((animation) => animation.cancelled));
  animations.at(-1).finish();
  assert.equal(portal.querySelectorAll("video").length, 5); assert.equal(f.query(".is-leaving"), null);
  activateWithPointer(f, previous);
  assert.equal(animations.at(-1).frames[0].transform, "translateX(-580px)");
  assert.equal(animations.at(-2).frames[1].transform, "translateX(580px)");
  assert.equal(currentItems()[0].dataset.referencePreview, "20");
  const finishingAfterClose = animations.at(-1).onfinish;
  f.controller.close(); finishingAfterClose();
  assert.equal(f.query(".generation-record-popover"), null);
  assert.ok(animations.every((animation) => animation.cancelled));
});

test("gallery resize and media back restore an available tile without replacing the controls", (t) => {
  const f = fixture(t); const task = f.task(); task.input.referenceSnapshot = f.references(12); f.setTasks([task]);
  f.setWidth(288); f.query(".generation-record-references").focus();
  const previous = f.query('[data-reference-page="-1"]'); const next = f.query('[data-reference-page="1"]');
  const second = f.query('[data-reference-preview="2"]'); second.focus(); f.setWidth(200);
  assert.ok(f.query(".generation-record-references-popover"));
  assert.equal(f.document.activeElement.dataset.referencePreview, "0", "a tile displaced by resize returns focus to a visible item");
  assert.equal(f.query('[data-reference-page="-1"]'), previous); assert.equal(f.query('[data-reference-page="1"]'), next);
  activateWithPointer(f, next);
  const preview = f.query('[data-reference-preview="3"]'); activateWithPointer(f, preview);
  f.setWidth(1400); f.query("[data-record-back]").click();
  assert.equal(f.document.activeElement.dataset.referencePreview, "3", "back focuses the selected item after a width change");
  assert.ok(f.query('[data-reference-preview="0"]'));
});

test("reduced motion changes the gallery page immediately without retaining outgoing videos", (t) => {
  const f = fixture(t); const animations = mockReferenceAnimations(f);
  f.window.matchMedia = () => ({ matches: true });
  const task = f.task(); task.input.referenceSnapshot = f.references(12); f.setTasks([task]); f.setWidth(288);
  f.query(".generation-record-references").click(); activateWithPointer(f, f.query('[data-reference-page="1"]'));
  assert.equal(animations.length, 0); assert.equal(f.all(".generation-record-reference-page").length, 1);
  assert.equal(f.query("[data-reference-preview]").dataset.referencePreview, "3");
});

test("reference strip pages every item without empty media tiles and previews its selected video", (t) => {
  const f = fixture(t); const task = f.task(); task.input.referenceSnapshot = f.references(13); f.setTasks([task]);
  f.setWidth(288); f.query(".generation-record-references").click();
  assert.ok(f.query(".generation-record-references-popover"));
  const capacity = f.all(".generation-record-reference-item").length;
  const viewport = f.query(".generation-record-reference-viewport");
  const viewportWidth = `${capacity * 58 - 6}px`;
  assert.ok(capacity > 0 && capacity <= 10);
  assert.equal(Boolean(availablePage(f.query('[data-reference-page="-1"]'))), false);
  const indices = [];
  for (let page = 0; page < 20; page++) {
    const items = f.all(".generation-record-reference-item");
    assert.ok(items.length > 0 && items.length <= capacity);
    assert.equal(f.query(".generation-record-reference-page").children.length, items.length);
    assert.equal(viewport.style.width, viewportWidth, "every page, including the last, preserves its viewport width");
    indices.push(...items.map((item) => Number(item.dataset.referencePreview)));
    const next = f.query('[data-reference-page="1"]');
    if (!availablePage(next)) break;
    next.click();
  }
  assert.deepEqual(indices, Array.from({ length: 13 }, (_, index) => index));
  assert.ok(availablePage(f.query('[data-reference-page="-1"]')));
  assert.equal(Boolean(availablePage(f.query('[data-reference-page="1"]'))), false);
  f.query('[data-reference-preview="12"]').click();
  assert.ok(f.query(".generation-record-preview-media").matches("video"));
  assert.equal(f.query("video").controls, true);
  assert.doesNotMatch(f.query(".generation-record-popover").style.cssText, /NaN/);
  f.query("[data-record-back]").click(); assert.equal(f.query("video"), null);
  assert.equal(f.pauses, 1);
  assert.ok(f.query('[data-reference-preview="12"]'), "returning from preview retains the current reference page");
  assert.ok(f.query(".generation-record-references-popover"));
});

test("short reference strip uses only needed cells and has no paging controls", (t) => {
  const f = fixture(t); const task = f.task(); task.input.referenceSnapshot = f.references(2); f.setTasks([task]);
  f.query(".generation-record-references").click();
  assert.equal(f.all(".generation-record-reference-item").length, 2);
  assert.ok(f.all("[data-reference-page]").every((button) => button.hidden && button.disabled));
  assert.equal(f.query(".generation-record-reference-page").children.length, 2);
  assert.equal(f.query(".generation-record-reference-viewport").style.width, "232px", "a pair uses two larger previews and one gap, without empty capacity");
  assert.equal(f.query(".generation-record-reference-rail").style.getPropertyValue("--reference-tile-size"), "112px");
  assert.ok(f.query(".generation-record-references-popover").classList.contains("is-sparse"));
  assert.equal(f.query(".generation-record-references-popover [data-record-close]"), null);
  f.window.document.dispatchEvent(new f.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(f.query(".generation-record-references-popover"), null);
});

test("one reference opens a content-sized preview and returning from detail preserves the sparse layout", (t) => {
  const f = fixture(t); const task = f.task(); task.input.referenceSnapshot = f.references(1); f.setTasks([task]);
  f.query(".generation-record-references").click();
  assert.equal(f.query(".generation-record-reference-viewport").style.width, "112px");
  assert.ok(f.all("[data-reference-page]").every((button) => button.hidden));
  f.query('[data-reference-preview="0"]').click();
  f.query("[data-record-back]").click();
  assert.equal(f.query(".generation-record-reference-viewport").style.width, "112px");
  assert.ok(f.query(".generation-record-references-popover").classList.contains("is-sparse"));
});

test("resizing a later reference page normalizes pagination and restores all items when they fit", (t) => {
  const f = fixture(t); const task = f.task(); task.input.referenceSnapshot = f.references(5); f.setTasks([task]);
  f.setWidth(200); f.query(".generation-record-references").click();
  const capacity = f.all("[data-reference-preview]").length;
  const viewport = f.query(".generation-record-reference-viewport");
  assert.equal(viewport.style.width, `${capacity * 58 - 6}px`);
  assert.ok(capacity < 5);
  f.query('[data-reference-page="1"]').click();
  assert.ok(Number(f.query("[data-reference-preview]").dataset.referencePreview) > 0);
  f.setWidth(1000);
  assert.deepEqual(f.all("[data-reference-preview]").map((item) => item.dataset.referencePreview), ["0", "1", "2", "3", "4"]);
  assert.equal(f.query(".generation-record-reference-viewport"), viewport);
  assert.equal(viewport.style.width, "284px", "when all five references fit, the viewport uses their actual width");
  assert.ok(f.all("[data-reference-page]").every((button) => button.hidden && button.disabled));
  f.setWidth(200);
  assert.equal(viewport.style.width, `${capacity * 58 - 6}px`, "resizing recalculates the page capacity without replacing its viewport");
  assert.deepEqual(f.all("[data-reference-preview]").map((item) => Number(item.dataset.referencePreview)), Array.from({ length: capacity }, (_, index) => index));
  assert.equal(Boolean(availablePage(f.query('[data-reference-page="-1"]'))), false);
});

test("each record remembers its reference page while task updates preserve the open picker", (t) => {
  const f = fixture(t); const first = f.task({ id: "first" }); const second = f.task({ id: "second" });
  first.input.referenceSnapshot = f.references(12); second.input.referenceSnapshot = f.references(11);
  f.setTasks([first, second]); f.setWidth(288);
  const firstRow = f.query('[data-generation-task-id="first"]'); const secondRow = f.query('[data-generation-task-id="second"]');
  firstRow.querySelector(".generation-record-references").click();
  f.query('[data-reference-page="1"]').click();
  const firstIndex = Number(f.query("[data-reference-preview]").dataset.referencePreview);
  assert.ok(firstIndex > 0);
  f.document.dispatchEvent(new f.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  secondRow.querySelector(".generation-record-references").click();
  assert.equal(f.query("[data-reference-preview]").dataset.referencePreview, "0");
  const secondItem = f.query("[data-reference-preview]");
  first.status = "running"; f.controller.render();
  assert.equal(f.query("[data-reference-preview]"), secondItem);
  f.document.dispatchEvent(new f.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  firstRow.querySelector(".generation-record-references").click();
  assert.equal(Number(f.query("[data-reference-preview]").dataset.referencePreview), firstIndex);
});

test("empty references produce no strip and a large strip never shows more than ten media tiles", (t) => {
  const f = fixture(t); const task = f.task(); f.setTasks([task]);
  assert.equal(f.query(".generation-record-references"), null);
  const many = f.task({ id: "many" }); many.input.referenceSnapshot = f.references(18);
  f.setTasks([many]); f.setWidth(1400); f.query(".generation-record-references").click();
  assert.equal(f.all("[data-reference-preview]").length, 10);
});

test("only truncated prompt opens reading panel and pinned reader survives hover elsewhere", (t) => {
  const f = fixture(t); const task = f.task(); task.input.referenceSnapshot = f.references(2); f.setTasks([task]);
  const prompt = f.query(".generation-record-prompt"); prompt.click(); assert.equal(f.query(".generation-record-popover"), null);
  Object.defineProperty(prompt, "clientHeight", { value: 66 }); Object.defineProperty(prompt, "scrollHeight", { value: 120 });
  prompt.click(); const panel = f.query(".generation-record-full-prompt"); assert.ok(panel);
  f.query(".generation-record-references").dispatchEvent(new f.window.MouseEvent("pointerover", { bubbles: true })); f.advance(400);
  assert.equal(f.query(".generation-record-full-prompt"), panel);
  f.document.dispatchEvent(new f.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(f.query(".generation-record-popover"), null); assert.equal(f.document.activeElement, prompt);
});

test("hovering the reference summary opens its strip with a pointer bridge and outside dismissal", (t) => {
  const f = fixture(t); const task = f.task(); task.input.referenceSnapshot = f.references(2); f.setTasks([task]);
  const item = f.query(".generation-record-references");
  assert.equal(item.dataset.recordPopover, "references");
  item.dispatchEvent(new f.window.MouseEvent("pointerover", { bubbles: true })); f.advance(40);
  assert.equal(f.query(".generation-record-popover"), null, "briefly crossing the entry does not flash a gallery");
  item.dispatchEvent(new f.window.MouseEvent("pointerout", { bubbles: true })); f.advance(120);
  assert.equal(f.query(".generation-record-popover"), null);
  item.dispatchEvent(new f.window.MouseEvent("pointerover", { bubbles: true })); f.advance(120);
  const popover = f.query(".generation-record-popover"); assert.ok(popover);
  assert.ok(popover.classList.contains("generation-record-references-popover"));
  assert.equal(popover.querySelectorAll(".generation-record-reference-item").length, 2);
  item.dispatchEvent(new f.window.MouseEvent("pointerout", { bubbles: true })); f.advance(100);
  popover.dispatchEvent(new f.window.MouseEvent("pointerenter")); f.advance(200);
  assert.equal(f.query(".generation-record-popover"), popover);
  f.query("#outside").dispatchEvent(new f.window.MouseEvent("pointerdown", { bubbles: true }));
  assert.equal(f.query(".generation-record-popover"), null);
});

test("keyboard focus opens the picker and selecting audio then returning to an image uses one stable portal", (t) => {
  const f = fixture(t); const task = f.task(); task.input.referenceSnapshot = [
    { key: "audio", asset: { type: "audio", url: "https://example.test/ref.wav" } },
    { key: "image", asset: { type: "image", url: "https://example.test/ref.png" } },
  ]; f.setTasks([task]);
  const summary = f.query(".generation-record-references"); summary.focus(); f.advance(401);
  assert.ok(f.query(".generation-record-references-popover"));
  f.query('[data-reference-preview="0"]').click();
  assert.equal(f.query(".generation-record-preview-media").tagName, "AUDIO");
  assert.equal(f.query("audio").controls, true);
  f.query("[data-record-back]").click(); f.query('[data-reference-preview="1"]').click();
  assert.equal(f.all(".generation-record-popover").length, 1);
  assert.equal(f.query(".generation-record-preview-media").tagName, "IMG");
  assert.equal(f.pauses, 1);
});

test("Escape closes a selected media preview and restores the summary without reopening it", (t) => {
  const f = fixture(t); const task = f.task(); task.input.referenceSnapshot = f.references(2); f.setTasks([task]);
  const item = f.query(".generation-record-references"); item.focus();
  f.query(".generation-record-reference-item").click();
  assert.ok(f.query(".generation-record-popover"));
  f.query("[data-record-close]").focus();
  f.document.activeElement.dispatchEvent(new f.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(f.document.activeElement, item);
  assert.equal(f.query(".generation-record-popover"), null);
  f.advance(500); assert.equal(f.query(".generation-record-popover"), null);
  f.query("#outside").focus(); item.focus();
  assert.ok(f.query(".generation-record-popover"), "an intentional new focus entry can preview again");
});

test("focus can move from a summary into its unpinned picker, but leaving both closes it", (t) => {
  const f = fixture(t); const task = f.task(); task.input.referenceSnapshot = f.references(2); f.setTasks([task]);
  f.query(".generation-record-references").focus();
  const popover = f.query(".generation-record-popover"); assert.ok(popover);
  f.query(".generation-record-reference-item").focus(); f.advance(500);
  assert.equal(f.query(".generation-record-popover"), popover);
  f.query("#outside").focus(); f.advance(500);
  assert.equal(f.query(".generation-record-popover"), null);
});

test("a pinned media preview survives focus changes and closes on an outside pointer action", (t) => {
  const f = fixture(t); const task = f.task(); task.input.referenceSnapshot = f.references(2); f.setTasks([task]);
  f.query(".generation-record-references").click(); f.query(".generation-record-reference-item").click();
  const popover = f.query(".generation-record-popover"); assert.ok(popover);
  f.query("#outside").focus(); f.advance(500);
  assert.equal(f.query(".generation-record-popover"), popover);
  f.query("#outside").dispatchEvent(new f.window.MouseEvent("pointerdown", { bubbles: true }));
  assert.equal(f.query(".generation-record-popover"), null);
});

function inlineReferenceFixture(t) {
  const markup = '保留<span class="prompt-reference" data-reference-key="asset:second" role="button" tabindex="0"><span class="prompt-reference-thumb"><img src="https://example.test/second.png" alt=""></span><span class="prompt-reference-label">图片2</span></span>的细节';
  const f = fixture(t, { renderPrompt: () => markup });
  const task = f.task(); task.input.referenceSnapshot = [
    { key: "asset:first", asset: { type: "image", url: "https://example.test/first.png" } },
    { key: "asset:second", asset: { type: "image", url: "https://example.test/second.png" } },
  ]; f.setTasks([task]);
  return f;
}

test("compact inline reference uses its thumbnail and number and previews the correct media on hover or keyboard", (t) => {
  const f = inlineReferenceFixture(t); const part = f.query(".generation-record-prompt .prompt-reference");
  assert.equal(f.query(".generation-record-prompt").textContent, "保留 图片2 的细节");
  assert.equal(part.querySelector(".prompt-reference-label").textContent, "图片2");
  assert.equal(part.querySelector(".prompt-reference-thumb img").src, "https://example.test/second.png");
  part.dispatchEvent(new f.window.MouseEvent("pointerover", { bubbles: true })); f.advance(401);
  assert.equal(f.query(".generation-record-preview-media").src, "https://example.test/second.png");
  assert.equal(f.query(".generation-record-preview-popover .generation-record-popover-title"), null);
  assert.equal(f.query(".generation-record-preview-popover [data-record-close]"), null);
  f.controller.close(); part.focus();
  assert.equal(f.query(".generation-record-preview-media").src, "https://example.test/second.png");
  part.dispatchEvent(new f.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  assert.equal(f.all(".generation-record-popover").length, 1);
  assert.equal(f.query(".generation-record-prompt .prompt-reference"), part);
});

test("a reference opened from full prompt uses the persistent record anchor instead of its removed portal node", (t) => {
  const f = inlineReferenceFixture(t); const prompt = f.query(".generation-record-prompt");
  Object.defineProperty(prompt, "clientHeight", { value: 66 }); Object.defineProperty(prompt, "scrollHeight", { value: 120 });
  prompt.click(); const part = f.query(".generation-record-full-prompt .prompt-reference");
  assert.ok(part.querySelector('.prompt-reference-thumb img')); assert.match(part.textContent, /图片2/);
  part.focus(); part.dispatchEvent(new f.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  assert.equal(f.query(".generation-record-full-prompt"), null);
  assert.equal(f.query(".generation-record-preview-media").src, "https://example.test/second.png");
  assert.equal(f.all(".generation-record-popover").length, 1);
  assert.equal(f.query(".generation-record-prompt"), prompt);
  assert.doesNotMatch(f.query(".generation-record-popover").style.cssText, /NaN/);
  prompt.dispatchEvent(new f.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(f.query(".generation-record-popover"), null); assert.equal(f.document.activeElement, prompt);
});

test("sent Prompt thumbnails resolve stable snapshot keys without changing labels, accessibility or unrelated markup", (t) => {
  const entries = [
    { key: "asset:photo", label: "图片2", type: "image", icon: "image" },
    { key: "asset:clip", label: "视频1", type: "video", icon: "square-play" },
    { key: "asset:sound", label: "音频1", type: "audio", icon: "audio-lines" },
  ];
  const markup = entries.map(({ key, label }) => `<span class="prompt-reference" data-reference-key="${key}" data-media-type="image" contenteditable="false" role="button" tabindex="0" title="${label}：素材" aria-label="${label}：素材，预览"><span class="prompt-reference-thumb" aria-hidden="true"><img src="https://example.test/thumb.png" alt=""></span><span class="prompt-reference-label">${label}</span></span>`).join(" ");
  const missing = '<span class="prompt-reference is-missing" data-reference-key="asset:removed"><span class="prompt-reference-thumb">?</span><span class="prompt-reference-label">图片3 · 已移除</span></span>';
  const original = markup + missing;
  const f = fixture(t, { renderPrompt: () => original }); const task = f.task();
  task.input.referenceSnapshot = [...entries].reverse().map(({ key, type }) => ({ key, asset: { type, url: `https://example.test/${key}` } }));
  f.setTasks([task]);
  for (const [index, part] of f.all(".generation-record-prompt .prompt-reference:not(.is-missing)").entries()) {
    const entry = entries[index];
    if (entry.type === "image") assert.equal(part.querySelector(".prompt-reference-thumb img").src, `https://example.test/${entry.key}`);
    else {
      const symbol = part.querySelector(".prompt-reference-thumb svg");
      assert.equal(symbol.dataset.generationIcon, entry.icon);
      assert.equal(symbol.getAttribute("fill"), "none"); assert.equal(symbol.getAttribute("stroke"), "currentColor");
      assert.equal(symbol.getAttribute("aria-hidden"), "true");
    }
    assert.equal(part.dataset.referenceKey, entry.key); assert.equal(part.getAttribute("contenteditable"), "false");
    assert.equal(part.getAttribute("role"), "button"); assert.equal(part.tabIndex, 0);
    assert.equal(part.getAttribute("title"), `${entry.label}：素材`);
    assert.equal(part.getAttribute("aria-label"), `${entry.label}：素材，预览`);
    assert.equal(part.querySelector(".prompt-reference-label").textContent, entry.label);
    part.focus(); assert.equal(f.query(".generation-record-preview-media").tagName.toLowerCase(), entry.type === "image" ? "img" : entry.type);
    f.controller.close();
  }
  assert.equal(f.query(".generation-record-prompt .is-missing").outerHTML, missing);
  assert.equal(f.query(".generation-record-cover img").src, "https://example.test/asset:photo");
});

test("history scope filters records and closes previews without cross-conversation actions", (t) => {
  const f = fixture(t); const task = f.task({ status: "succeeded", result: { type: "audio", url: "https://example.test/audio.wav" } });
  const other = f.task({ id: "other", scope: { projectId: "project-2", conversationId: "chat-1" } }); f.setTasks([task, other]);
  assert.equal(f.all(".generation-record").length, 1); f.query('[data-record-popover="menu"]').click();
  const oldRemove = f.query('[data-generation-action="remove"]');
  f.setScope({ projectId: "project-2", conversationId: "chat-1" });
  assert.equal(f.query(".generation-record").dataset.generationTaskId, "other");
  assert.equal(f.query(".generation-record-popover"), null); assert.equal(f.pauses, 1);
  oldRemove.click(); assert.equal(f.actions.length, 0);
});

test("finishing a task does not force-scroll a reader and provides a new-result hint", (t) => {
  const f = fixture(t); const task = f.task(); f.setTasks([task]);
  f.container.scrollTop = 200; task.status = "failed"; task.error = "本次任务失败"; f.controller.render();
  assert.equal(f.container.scrollTop, 200); assert.equal(f.query(".generation-record-new").hidden, false);
  f.query(".generation-record-new").click(); assert.equal(f.container.scrollTop, 1800);
  assert.equal(f.query(".generation-record-new").hidden, true);
});

test("record text is escaped, invalid media schemes are omitted, and details use task completion time", (t) => {
  const f = fixture(t); const task = f.task({ status: "failed", error: '<img src=x onerror="boom()">', finishedAt: 103000 });
  task.input.prompt = "<script>bad()</script>"; task.input.modelName = "<b>model</b>";
  task.input.referenceSnapshot = [{ key: "a", asset: { type: "image", name: '<img src=x onerror="boom()">', url: "javascript:boom()" } }];
  f.setTasks([task]); assert.equal(f.query("script"), null); assert.equal(f.query("img"), null);
  assert.match(f.query(".generation-record-prompt").textContent, /<script>/);
  assert.match(f.query(".generation-record-outcome").textContent, /<img/);
  f.query('[data-record-popover="details"]').click();
  assert.match(f.query(".generation-record-details-popover").textContent, /耗时3 秒/);
  f.query('.generation-record-details-popover [data-generation-action="feedback"]').click();
  assert.equal(f.actions.at(-1)[0], "feedback"); assert.equal(f.actions.at(-1)[1], task);
});

test("busy tasks expose direct parameter details and TaskId copying while deletion remains unavailable", (t) => {
  const f = fixture(t); const task = f.task(); f.setTasks([task]);
  const details = f.query('button[data-record-popover="details"]'); assert.ok(details);
  details.click(); assert.match(f.query(".generation-record-details-popover").textContent, /task-1/);
  f.query('.generation-record-details-popover [data-generation-action="feedback"]').click();
  assert.deepEqual(f.actions.map(([action]) => action), ["feedback"]);
  f.query('[data-record-popover="menu"]').click();
  const reveal = f.query("[data-record-delete-reveal]");
  assert.equal(reveal.hidden, true); assert.ok(reveal.inert || reveal.hasAttribute("inert"));
  reveal.querySelector('[data-generation-action="remove"]').click();
  assert.deepEqual(f.actions.map(([action]) => action), ["feedback"]);
});

test("array and legacy text summaries keep individually wrapping parameters before the task details action", (t) => {
  const f = fixture(t);
  const values = ["全模态参考", "16:9", "1080P", "10s"];
  const tasks = [values, values.join(" · ")].map((parameterSummary, index) => {
    const task = f.task({ id: `parameters-${index}` });
    task.input.parameterSummary = parameterSummary;
    return task;
  });
  f.setTasks(tasks);
  for (const [index, record] of f.all(".generation-record").entries()) {
    const parameters = record.querySelector(".generation-record-parameters");
    assert.deepEqual([...parameters.querySelectorAll(".generation-record-parameter")].map((item) => item.textContent), values);
    assert.equal(parameters.firstElementChild.textContent, "Seedance 2.5");
    const details = parameters.lastElementChild;
    assert.equal(details.matches('button[data-record-popover="details"]'), true);
    details.click();
    assert.match(f.query(".generation-record-details-popover").textContent, new RegExp(tasks[index].id));
    f.controller.close();
  }
});

test("More reveals deletion inline and its collapsed action cannot be activated", (t) => {
  const f = fixture(t); const task = f.task({ status: "canceled", refunded: 24 }); f.setTasks([task]);
  const more = f.query('[data-record-popover="menu"]'); const reveal = f.query("[data-record-delete-reveal]");
  const remove = reveal.querySelector('[data-generation-action="remove"]');
  assert.equal(reveal.hidden, true); assert.ok(reveal.inert || reveal.hasAttribute("inert"));
  remove.click(); assert.equal(f.actions.length, 0);
  more.click(); assert.equal(reveal.hidden, false); assert.equal(Boolean(reveal.inert || reveal.hasAttribute("inert")), false);
  assert.equal(more.getAttribute("aria-expanded"), "true"); assert.equal(f.query(".generation-record-popover"), null);
  assert.ok(f.query(".generation-record").contains(reveal));
  more.click(); assert.equal(reveal.hidden, true); assert.ok(reveal.inert || reveal.hasAttribute("inert"));
  remove.click(); assert.equal(f.actions.length, 0);
});

test("inline deletion closes on Escape or outside click, restoring More focus when dismissed with the keyboard", (t) => {
  const f = fixture(t); f.setTasks([f.task({ status: "failed", error: "本次未完成" })]);
  const more = f.query('[data-record-popover="menu"]'); const reveal = f.query("[data-record-delete-reveal]");
  more.click(); reveal.querySelector("button").focus();
  f.document.activeElement.dispatchEvent(new f.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(reveal.hidden, true); assert.equal(f.document.activeElement, more);
  more.click(); f.query("#outside").dispatchEvent(new f.window.MouseEvent("pointerdown", { bubbles: true }));
  assert.equal(reveal.hidden, true);
});

test("inline deletion and reference or detail popovers are mutually exclusive", (t) => {
  const f = fixture(t); const task = f.task({ status: "canceled" }); task.input.referenceSnapshot = f.references(2); f.setTasks([task]);
  const more = f.query('[data-record-popover="menu"]'); const reveal = f.query("[data-record-delete-reveal]");
  more.click(); f.query('[data-record-popover="details"]').click();
  assert.equal(reveal.hidden, true); assert.ok(f.query(".generation-record-details-popover"));
  more.click(); assert.equal(reveal.hidden, false); assert.equal(f.query(".generation-record-popover"), null);
  f.query(".generation-record-references").click();
  assert.equal(reveal.hidden, true); assert.ok(f.query(".generation-record-references-popover"));
});

test("delete/edit/again use one action boundary and completed results have no manual placement controls", (t) => {
  const f = fixture(t); const task = f.task({ status: "succeeded", result: { type: "image", url: "https://example.test/result.png" } }); f.setTasks([task]);
  f.query('[data-generation-action="edit"]').click(); f.query('[data-generation-action="again"]').click();
  const media = f.query(".generation-record-media");
  assert.equal(media.draggable, false);
  media.dispatchEvent(new f.window.Event("dragstart", { bubbles: true }));
  assert.equal(f.query('[data-generation-action="dragstart"]'), null);
  assert.equal(f.query('[data-generation-action="add"]'), null);
  f.query('[data-record-popover="menu"]').click(); f.query('[data-generation-action="remove"]').click();
  assert.deepEqual(f.actions.map(([action]) => action), ["edit", "again", "remove"]);
  assert.ok(f.actions.every(([, value]) => value === task)); assert.equal(f.query(".generation-record-popover"), null);
});

test("hiding generation records pauses media while retaining playback position on reopen", (t) => {
  const f = fixture(t); f.setTasks([f.task({ status: "succeeded", result: { type: "audio", url: "https://example.test/audio.wav" } })]);
  const audio = f.query("audio"); audio.currentTime = 42;
  f.controller.close(); assert.equal(f.pauses, 1); assert.equal(audio.currentTime, 42);
  f.controller.render(); assert.equal(f.query("audio"), audio); assert.equal(audio.currentTime, 42);
});

test("reference cover, Prompt and gallery use the same thumbnail adapter and release paged media", (t) => {
  const f = fixture(t, {
    assetPreview: (asset) => `<video data-reference-video-src="${asset.url}" muted playsinline preload="metadata"></video>`,
    renderPrompt: () => '<span class="prompt-reference" data-reference-key="asset:0"><span class="prompt-reference-thumb"></span><span>视频1</span></span>',
  });
  const task = f.task(); task.input.referenceSnapshot = f.references(12).map((entry) => ({ ...entry, asset: { ...entry.asset, type: "video" } }));
  f.setTasks([task]);
  const cover = f.query(".generation-record-cover video");
  assert.equal(cover.dataset.referenceVideoSrc, task.input.referenceSnapshot[0].asset.url);
  assert.equal(f.query(".prompt-reference-thumb video").dataset.referenceVideoSrc, cover.dataset.referenceVideoSrc);
  task.status = "running"; f.controller.render(); assert.equal(f.query(".generation-record-cover video"), cover);
  f.query(".generation-record-references").click();
  const visible = f.all(".generation-record-reference-item video");
  assert.ok(visible.length < 12); assert.ok(visible.every((video) => !video.controls && !video.autoplay));
  f.query('[data-reference-page="1"]').click();
  assert.equal(f.pauses, visible.length, "paging releases every outgoing thumbnail");
  assert.ok(visible.every((video) => !video.isConnected));
});

test("locate is available only for an associated successful result", (t) => {
  const f = fixture(t); const task = f.task(); f.setTasks([task]);
  const locate = f.query('[data-generation-action="locate"]');
  assert.equal(locate.hidden, true); locate.click(); assert.equal(f.actions.length, 0);
  task.status = "succeeded"; task.result = { type: "image", url: "https://example.test/result.png" };
  f.controller.render(); assert.equal(locate.hidden, true);
  task.addedNodeId = "result-1"; f.controller.render(); assert.equal(locate.hidden, false);
  locate.click(); assert.equal(f.actions.at(-1)[0], "locate");
  assert.equal(f.query('[data-generation-action="add"]'), null);
});

test("media counts reuse existing icons and task affordances do not degrade to fallback circles", (t) => {
  const f = fixture(t); const task = f.task({ status: "succeeded", result: { type: "image", url: "https://example.test/result.png" } });
  task.input.referenceSnapshot = [{ key: "v", asset: { type: "video" } }, { key: "a", asset: { type: "audio" } }];
  f.setTasks([task]);
  assert.ok(f.query('.generation-record-counts svg[data-generation-icon="square-play"]'));
  assert.ok(f.query('.generation-record-counts svg[data-generation-icon="audio-lines"]'));
  assert.ok(f.query('.generation-record-more [data-lucide="more-horizontal"]'));
  task.status = "failed"; f.controller.render();
  assert.ok(f.query('.generation-record-outcome svg[data-generation-icon="circle-alert"] path'));
  assert.ok(f.query('[data-record-popover="details"]'));
  f.query('[data-record-popover="details"]').click();
  assert.ok(f.query('.generation-record-details-popover [data-generation-icon="copy"]'));
});
