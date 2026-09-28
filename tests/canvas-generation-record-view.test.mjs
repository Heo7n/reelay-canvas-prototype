import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";
import { installCanvasIcons } from "./helpers/canvas-icons.mjs";

const [source, placement, mediaPlayer, referencePreview, statusView] = await Promise.all([
  "canvas-generation-record-view.js", "canvas-popover-placement.js", "canvas-generation-media.js", "canvas-generation-reference-preview.js", "canvas-generation-status-view.js",
].map((name) => readFile(new URL(`../src/legacy-canvas/${name}`, import.meta.url), "utf8")));
const [modelCatalog, draftPolicy, prototypeConfig] = await Promise.all(["../data/model-catalog.js", "../src/application/draft-video-policy.js", "../src/config/prototype-config.js"]
  .map((path) => readFile(new URL(path, import.meta.url), "utf8")));
const recordGroups = await readFile(new URL("../src/application/generation-record-groups.js", import.meta.url), "utf8");

function fixture(t, options = {}) {
  const dom = new JSDOM('<!doctype html><body><div id="records"></div><button id="outside">其他</button></body>', { runScripts: "outside-only" });
  const { window } = dom; const { document } = window;
  installCanvasIcons(window);
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
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  window.eval(prototypeConfig); window.eval(modelCatalog); window.eval(draftPolicy); window.eval(recordGroups);
  window.eval(placement); window.eval(mediaPlayer); window.eval(referencePreview); window.eval(statusView); window.eval(source);
  const controller = window.REELAY_GENERATION_RECORD_VIEW.createController({
    document, container, getScope: () => scope, getTasks: () => tasks, getTask: (id) => tasks.find((task) => task.id === id),
    onAction: (...args) => actions.push(args), now: () => now,
    placeAnchoredPopover: window.REELAY_CANVAS_POPOVER_PLACEMENT.placeAnchoredPopover,
    ...options,
  });
  t.after(() => { controller.dispose(); dom.window.close(); });
  function task(overrides = {}) {
    return { id: `task-${tasks.length + 1}`, scope: { ...scope }, status: "queued", createdAt: now,
      cancelUntil: now + 5000, input: { prompt: "保留瓶身设计，镜头缓慢推进。", modelName: "Seedance 2.5", parameterSummary: "全模态参考 · 16:9 · 480P · 10s", cost: 24, references: [] },
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

for (const status of ["queued", "running"]) {
  test(`${status} record places cancellation in its status row and disables it at the five-second deadline`, (t) => {
    const f = fixture(t); const task = f.task({ status }); f.setTasks([task]);
    const edit = f.query('[data-generation-action="edit"]');
    const cancel = f.query('[data-generation-action="cancel"]');
    const visibleActions = () => f.all('[data-generation-action]').filter((button) => !button.closest("[hidden], [inert]"));
    assert.deepEqual(visibleActions().map((button) => button.dataset.generationAction), ["cancel", "edit"]);
    assert.equal(cancel.textContent.trim(), "取消");
    assert.ok(cancel.closest(".generation-record-wait .generation-status"));
    assert.match(cancel.title, /发送后\s*5\s*秒内可取消/);
    assert.match(cancel.getAttribute("aria-description"), /取消后返还本次积分/);
    assert.equal(f.timers.size, 0, "service owns task deadline timers");
    edit.click(); assert.deepEqual(f.actions.map(([action]) => action), ["edit"]);
    f.query('[data-generation-action="again"]').click();
    f.query('[data-generation-action="remove"]').click();
    assert.deepEqual(f.actions.map(([action]) => action), ["edit"], "hidden terminal actions cannot submit duplicate tasks or delete active ones");
    f.advance(4999); f.controller.render(); assert.equal(cancel.disabled, false);
    cancel.focus();
    f.advance(1); f.controller.render();
    assert.deepEqual(visibleActions().map((button) => button.dataset.generationAction), ["cancel", "edit"]);
    assert.equal(cancel.disabled, true);
    assert.equal(f.document.activeElement, edit, "expiration returns focus from the now-disabled cancel action");
    cancel.click(); assert.equal(f.actions.length, 1);
    edit.click(); assert.deepEqual(f.actions.map(([action]) => action), ["edit", "edit"]);
    assert.ok(f.query(".generation-record-wait"));
  });
}

test("progress updates retain the active status bar and button without adding view timers", (t) => {
  const f = fixture(t); const task = f.task({ progress: 4 }); f.setTasks([task]);
  const status = f.query(".generation-status");
  const cancel = status.querySelector("[data-cancel-generation]"); cancel.focus();
  task.status = "running"; task.progress = 16; f.controller.render();
  assert.equal(f.query(".generation-status"), status);
  assert.equal(f.document.activeElement, cancel);
  assert.equal(status.querySelector("[data-generation-progress]").textContent, "16%");
  assert.equal(status.querySelector('[role="progressbar"]').getAttribute("aria-valuenow"), "16");
  assert.equal(status.querySelector(".generation-status-label").textContent, "生成中");
  assert.equal(f.timers.size, 0);
});

test("the cancellation deadline does not steal focus from another control", (t) => {
  const f = fixture(t); f.setTasks([f.task()]);
  const outside = f.query("#outside"); outside.focus();
  f.advance(5000); f.controller.render();
  assert.equal(f.query('[data-generation-action="cancel"]').disabled, true);
  assert.equal(f.document.activeElement, outside);
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
  const previous = f.query('[data-reference-page="-1"]');
  assert.equal(previous.disabled, true); assert.equal(previous.hidden, false);
  assert.notEqual(previous.style.visibility, "hidden");
  const next = f.query('[data-reference-page="1"]'); next.focus();
  next.dispatchEvent(new f.window.KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
  next.dispatchEvent(new f.window.MouseEvent("click", { bubbles: true, detail: 0 }));
  f.advance(500);
  assert.equal(f.query(".generation-record-references-popover"), portal);
  assert.equal(f.query('[data-reference-page="1"]'), next); assert.equal(next.disabled, true);
  assert.equal(next.hidden, false); assert.notEqual(next.style.visibility, "hidden");
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
  assert.equal(animations.at(-1).frames[0].transform, "translateX(880px)");
  assert.equal(animations.at(-2).frames[1].transform, "translateX(-880px)");
  assert.equal(viewport.style.width, "872px");
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
  assert.equal(viewport.style.width, "872px", "the short final page retains the ten-slot viewport throughout the slide");
  assert.equal(currentItems().length <= 10, true);
  assert.ok(animations.slice(0, 4).every((animation) => animation.cancelled));
  animations.at(-1).finish();
  assert.equal(portal.querySelectorAll("video").length, 5); assert.equal(f.query(".is-leaving"), null);
  activateWithPointer(f, previous);
  assert.equal(animations.at(-1).frames[0].transform, "translateX(-880px)");
  assert.equal(animations.at(-2).frames[1].transform, "translateX(880px)");
  assert.equal(currentItems()[0].dataset.referencePreview, "20");
  const finishingAfterClose = animations.at(-1).onfinish;
  f.controller.close(); finishingAfterClose();
  assert.equal(f.query(".generation-record-popover"), null);
  assert.ok(animations.every((animation) => animation.cancelled));
});

test("gallery resize and media back restore an available tile without replacing the controls", (t) => {
  const f = fixture(t); const task = f.task(); task.input.referenceSnapshot = f.references(12); f.setTasks([task]);
  f.setWidth(314); f.query(".generation-record-references").focus();
  const previous = f.query('[data-reference-page="-1"]'); const next = f.query('[data-reference-page="1"]');
  const fourth = f.query('[data-reference-preview="3"]'); fourth.focus(); f.setWidth(200);
  assert.ok(f.query(".generation-record-references-popover"));
  assert.equal(f.document.activeElement.dataset.referencePreview, "0", "a tile displaced by resize returns focus to a visible item");
  assert.equal(f.query('[data-reference-page="-1"]'), previous); assert.equal(f.query('[data-reference-page="1"]'), next);
  activateWithPointer(f, next);
  const preview = f.query('[data-reference-preview="3"]'); activateWithPointer(f, preview);
  f.setWidth(1400); f.query(".generation-reference-preview-close").click();
  assert.equal(f.document.activeElement.dataset.referencePreview, "3", "back focuses the selected item after a width change");
  assert.ok(f.query('[data-reference-preview="0"]'));
});

test("reduced motion changes the gallery page immediately without retaining outgoing videos", (t) => {
  const f = fixture(t); const animations = mockReferenceAnimations(f);
  f.window.matchMedia = () => ({ matches: true });
  const task = f.task(); task.input.referenceSnapshot = f.references(12); f.setTasks([task]); f.setWidth(314);
  f.query(".generation-record-references").click(); activateWithPointer(f, f.query('[data-reference-page="1"]'));
  assert.equal(animations.length, 0); assert.equal(f.all(".generation-record-reference-page").length, 1);
  assert.equal(f.query("[data-reference-preview]").dataset.referencePreview, "4");
});

test("header navigation leaves the row for media and wheel gestures page without momentum skips", (t) => {
  const f = fixture(t); const task = f.task(); task.input.referenceSnapshot = f.references(12); f.setTasks([task]);
  f.setWidth(314);
  f.query(".generation-record-references").dispatchEvent(new f.window.MouseEvent("pointerover", { bubbles: true })); f.advance(100);
  const gallery = f.query(".generation-record-references-popover");
  assert.ok(f.query('[data-reference-page="1"]').closest(".generation-record-popover-title"));
  assert.equal(f.all(".generation-record-reference-item").length, 4, "navigation no longer takes space from media");
  const leading = () => Number(f.query("[data-reference-preview]").dataset.referencePreview);
  const wheel = (options) => {
    const event = new f.window.WheelEvent("wheel", { bubbles: true, cancelable: true, ...options });
    gallery.dispatchEvent(event); return event;
  };
  wheel({ deltaY: 12 }); wheel({ deltaY: 12 }); assert.equal(leading(), 0);
  assert.equal(wheel({ deltaY: 24 }).defaultPrevented, true); assert.equal(leading(), 4);
  wheel({ deltaY: 120 }); f.advance(60); wheel({ deltaY: 30 }); assert.equal(leading(), 4);
  f.advance(200); wheel({ deltaX: 100 }); assert.equal(leading(), 8);
  f.advance(200); assert.equal(wheel({ deltaY: 100 }).defaultPrevented, true); assert.equal(leading(), 8);
  wheel({ deltaY: -3, deltaMode: 1 }); assert.equal(leading(), 4);
  assert.equal(wheel({ deltaY: 120, ctrlKey: true }).defaultPrevented, false); assert.equal(leading(), 4);
  gallery.dispatchEvent(new f.window.MouseEvent("pointerleave", { relatedTarget: f.query("#outside") })); f.advance(500);
  assert.equal(f.query(".generation-record-references-popover"), gallery, "scrolling pins the gallery for continued browsing");
});

test("reference strip pages every item without empty media tiles and previews its selected video", (t) => {
  const f = fixture(t); const task = f.task(); task.input.referenceSnapshot = f.references(13); f.setTasks([task]);
  f.setWidth(288); f.query(".generation-record-references").click();
  assert.ok(f.query(".generation-record-references-popover"));
  const capacity = f.all(".generation-record-reference-item").length;
  const viewport = f.query(".generation-record-reference-viewport");
  const viewportWidth = "256px";
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
  assert.ok(f.query(".generation-reference-preview-media").matches("video"));
  assert.equal(f.query("video").controls, true);
  assert.doesNotMatch(f.query(".generation-record-popover").style.cssText, /NaN/);
  f.query(".generation-reference-preview-close").click(); assert.equal(f.query("video"), null);
  assert.equal(f.pauses, 1);
  assert.ok(f.query('[data-reference-preview="12"]'), "returning from preview retains the current reference page");
  assert.ok(f.query(".generation-record-references-popover"));
});

test("gallery resizing within the same capacity updates tile width and keeps captions inside previews", (t) => {
  const f = fixture(t); const task = f.task(); task.input.referenceSnapshot = f.references(12); f.setTasks([task]);
  f.setWidth(500); f.query(".generation-record-references").click();
  const portal = f.query(".generation-record-references-popover");
  const viewport = f.query(".generation-record-reference-viewport");
  const next = f.query('[data-reference-page="1"]');
  assert.equal(f.all("[data-reference-preview]").length, 6);
  assert.equal(viewport.style.width, "474px");
  next.click(); f.setWidth(520);
  assert.equal(f.query(".generation-record-references-popover"), portal);
  assert.equal(f.query('[data-reference-page="1"]'), next);
  assert.equal(f.all("[data-reference-preview]").length, 6);
  assert.equal(f.query("[data-reference-preview]").dataset.referencePreview, "6");
  assert.equal(viewport.style.width, "494px");
  assert.ok(f.all("[data-reference-preview]").every((item) => item.querySelector(":scope > span > small")));
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
  f.query(".generation-reference-preview-close").click();
  assert.equal(f.query(".generation-record-reference-viewport").style.width, "112px");
  assert.ok(f.query(".generation-record-references-popover").classList.contains("is-sparse"));
});

test("resizing a later reference page normalizes pagination and restores all items when they fit", (t) => {
  const f = fixture(t); const task = f.task(); task.input.referenceSnapshot = f.references(5); f.setTasks([task]);
  f.setWidth(200); f.query(".generation-record-references").click();
  const capacity = f.all("[data-reference-preview]").length;
  const viewport = f.query(".generation-record-reference-viewport");
  assert.equal(viewport.style.width, "168px");
  assert.ok(capacity < 5);
  f.query('[data-reference-page="1"]').click();
  assert.ok(Number(f.query("[data-reference-preview]").dataset.referencePreview) > 0);
  f.setWidth(1000);
  assert.deepEqual(f.all("[data-reference-preview]").map((item) => item.dataset.referencePreview), ["0", "1", "2", "3", "4"]);
  assert.equal(f.query(".generation-record-reference-viewport"), viewport);
  assert.equal(viewport.style.width, "352px", "when all five references fit, the viewport uses their actual width");
  assert.ok(f.all("[data-reference-page]").every((button) => button.hidden && button.disabled));
  f.setWidth(200);
  assert.equal(viewport.style.width, "168px", "resizing recalculates the page capacity without replacing its viewport");
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

function longPromptFixture(t) {
  const f = fixture(t);
  f.setTasks([f.task({ id: "long-1" }), f.task({ id: "long-2" })]);
  const prompts = f.all(".generation-record-prompt");
  for (const prompt of prompts) {
    Object.defineProperty(prompt, "clientHeight", { value: 60 });
    Object.defineProperty(prompt, "scrollHeight", { value: 240 });
  }
  return { ...f, prompts,
    over(target, x = 10) { target.dispatchEvent(new f.window.MouseEvent("pointerover", { bubbles: true, clientX: x, clientY: 20 })); },
    move(target, x) { target.dispatchEvent(new f.window.MouseEvent("pointermove", { bubbles: true, clientX: x, clientY: 20 })); },
  };
}

test("scrolling long messages cancels pending hover and stationary boundary events cannot reopen it", (t) => {
  const f = longPromptFixture(t); const [first, second] = f.prompts;
  f.over(first); f.advance(100);
  const wheel = new f.window.WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 80 });
  first.dispatchEvent(wheel);
  assert.equal(wheel.defaultPrevented, false, "message scrolling remains native");
  f.over(second); f.advance(1000);
  assert.equal(f.query(".generation-record-popover"), null);
  f.over(first); f.move(first, 10); f.advance(1000);
  assert.equal(f.query(".generation-record-popover"), null, "unchanged pointer coordinates are not renewed reading intent");
  f.move(first, 12); f.advance(299);
  assert.equal(f.query(".generation-record-popover"), null);
  f.advance(2); assert.ok(f.query(".generation-record-full-prompt"));
});

test("list scroll dismisses a temporary reader and movement during momentum does not rearm it", (t) => {
  const f = longPromptFixture(t); const [first, second] = f.prompts;
  f.over(first); f.advance(301); assert.ok(f.query(".generation-record-full-prompt"));
  f.container.dispatchEvent(new f.window.Event("scroll"));
  assert.equal(f.query(".generation-record-popover"), null);
  f.advance(100); f.move(second, 20);
  f.container.dispatchEvent(new f.window.Event("scroll"));
  f.advance(100); f.move(second, 21); f.advance(500);
  assert.equal(f.query(".generation-record-popover"), null, "stopping momentum never opens a reader automatically");
  f.move(second, 22); f.advance(301);
  assert.ok(f.query(".generation-record-full-prompt"), "movement within the same prompt rearms without a new pointerover");
});

test("scroll suppression preserves pinned reading and explicit click and keyboard activation", (t) => {
  const f = longPromptFixture(t); const [prompt] = f.prompts;
  f.over(prompt); f.container.dispatchEvent(new f.window.Event("scroll"));
  prompt.dispatchEvent(new f.window.MouseEvent("click", { bubbles: true, detail: 1 }));
  const reader = f.query(".generation-record-full-prompt"); assert.ok(reader);
  reader.scrollTop = 90; reader.dispatchEvent(new f.window.Event("scroll"));
  f.container.dispatchEvent(new f.window.Event("scroll"));
  assert.equal(f.query(".generation-record-full-prompt"), reader); assert.equal(reader.scrollTop, 90);
  f.document.dispatchEvent(new f.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  prompt.dispatchEvent(new f.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  assert.ok(f.query(".generation-record-full-prompt"));
  f.document.dispatchEvent(new f.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  f.query('[data-record-popover="details"]').focus();
  assert.ok(f.query(".generation-record-details-popover"), "keyboard focus does not depend on pointer movement");
});

test("unrelated scrolling and browser zoom gestures do not cancel deliberate message hover", (t) => {
  const f = longPromptFixture(t); const [prompt] = f.prompts;
  f.over(prompt);
  f.query("#outside").dispatchEvent(new f.window.Event("scroll"));
  prompt.dispatchEvent(new f.window.WheelEvent("wheel", { bubbles: true, deltaY: 80, ctrlKey: true }));
  f.advance(301); assert.ok(f.query(".generation-record-full-prompt"));
});

test("closing or switching conversation cancels hover intent until fresh pointer movement", (t) => {
  const f = longPromptFixture(t); const [prompt] = f.prompts;
  f.over(prompt); f.advance(100); f.controller.close(); f.advance(500);
  f.over(prompt); f.advance(400); assert.equal(f.query(".generation-record-popover"), null);
  f.move(prompt, 12); f.advance(301); assert.ok(f.query(".generation-record-full-prompt"));
  f.setScope({ projectId: "project-1", conversationId: "chat-2", canvasId: "canvas-1" });
  f.setTasks([f.task()]);
  const details = f.query('[data-record-popover="details"]');
  f.over(details); f.advance(500); assert.equal(f.query(".generation-record-popover"), null);
  f.move(details, 13); f.advance(301); assert.ok(f.query(".generation-record-details-popover"));
  f.controller.dispose(); f.advance(1000);
  assert.equal(f.query(".generation-record-popover"), null); assert.equal(f.timers.size, 0);
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

test("full prompt width follows the message column when the sidebar is resized", (t) => {
  const f = fixture(t); f.setTasks([f.task()]);
  const prompt = f.query(".generation-record-prompt");
  Object.defineProperty(prompt, "clientHeight", { value: 60 }); Object.defineProperty(prompt, "scrollHeight", { value: 240 });
  prompt.click(); const popover = f.query(".generation-record-prompt-popover");
  const content = f.query(".generation-record-full-prompt");
  for (const width of [432, 720, 508]) {
    f.setWidth(width);
    assert.equal(popover.style.getPropertyValue("--generation-prompt-width"), `${width}px`);
    assert.equal(f.query(".generation-record-full-prompt"), content, "resizing preserves the reader and its scroll state");
  }
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

test("task details open on deliberate hover and retain a pointer bridge into the panel", (t) => {
  const f = fixture(t); f.setTasks([f.task()]);
  const trigger = f.query('[data-record-popover="details"]');
  trigger.dispatchEvent(new f.window.MouseEvent("pointerover", { bubbles: true })); f.advance(100);
  assert.equal(f.query(".generation-record-details-popover"), null);
  trigger.dispatchEvent(new f.window.MouseEvent("pointerout", { bubbles: true })); f.advance(300);
  assert.equal(f.query(".generation-record-details-popover"), null, "crossing the trigger must not open task details");
  trigger.dispatchEvent(new f.window.MouseEvent("pointerover", { bubbles: true })); f.advance(301);
  const panel = f.query(".generation-record-details-popover"); assert.ok(panel);
  trigger.dispatchEvent(new f.window.MouseEvent("pointerout", { bubbles: true, relatedTarget: panel })); f.advance(100);
  panel.dispatchEvent(new f.window.MouseEvent("pointerenter", { relatedTarget: trigger })); f.advance(300);
  assert.equal(f.query(".generation-record-details-popover"), panel);
  panel.dispatchEvent(new f.window.MouseEvent("pointerleave", { relatedTarget: f.query("#outside") })); f.advance(211);
  assert.equal(f.query(".generation-record-details-popover"), null);
});

test("task details support focus and click pinning without disappearing when the pointer leaves", (t) => {
  const f = fixture(t); f.setTasks([f.task()]);
  const trigger = f.query('[data-record-popover="details"]');
  trigger.focus(); const panel = f.query(".generation-record-details-popover"); assert.ok(panel);
  panel.querySelector('[data-generation-action="feedback"]').focus(); f.advance(400);
  assert.equal(f.query(".generation-record-details-popover"), panel);
  f.query("#outside").focus(); f.advance(300);
  assert.equal(f.query(".generation-record-details-popover"), null);
  activateWithPointer(f, trigger);
  const pinned = f.query(".generation-record-details-popover"); assert.ok(pinned);
  trigger.dispatchEvent(new f.window.MouseEvent("pointerout", { bubbles: true }));
  f.query("#outside").focus(); f.advance(400);
  assert.equal(f.query(".generation-record-details-popover"), pinned);
  f.document.dispatchEvent(new f.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(f.query(".generation-record-details-popover"), null);
  assert.equal(f.document.activeElement, trigger);
});

test("keyboard focus opens the picker and selecting audio then returning to an image uses one stable portal", (t) => {
  const f = fixture(t); const task = f.task(); task.input.referenceSnapshot = [
    { key: "audio", asset: { type: "audio", url: "https://example.test/ref.wav" } },
    { key: "image", asset: { type: "image", url: "https://example.test/ref.png" } },
  ]; f.setTasks([task]);
  const summary = f.query(".generation-record-references"); summary.focus(); f.advance(401);
  assert.ok(f.query(".generation-record-references-popover"));
  f.query('[data-reference-preview="0"]').click();
  assert.equal(f.query(".generation-reference-preview-media").tagName, "AUDIO");
  assert.equal(f.query("audio").controls, true);
  f.query(".generation-reference-preview-close").click(); f.query('[data-reference-preview="1"]').click();
  assert.equal(f.all(".generation-record-popover").length, 1);
  assert.equal(f.query(".generation-reference-preview-media").tagName, "IMG");
  assert.equal(f.pauses, 1);
});

test("closing fullscreen returns to the same reference page before Escape dismisses the gallery", (t) => {
  const f = fixture(t); const task = f.task(); task.input.referenceSnapshot = f.references(12); f.setTasks([task]);
  const summary = f.query(".generation-record-references"); summary.focus();
  f.query('[data-reference-page="1"]').click();
  const tile = f.query(".generation-record-reference-item");
  const gallery = f.query(".generation-record-references-popover");
  tile.click();
  const dialog = f.query(".generation-reference-preview"); assert.equal(dialog.open, true);
  dialog.dispatchEvent(new f.window.Event("cancel", { cancelable: true }));
  assert.equal(f.query(".generation-reference-preview"), null);
  assert.equal(f.document.activeElement, tile);
  assert.equal(f.query(".generation-record-references-popover"), gallery);
  f.advance(500); assert.equal(f.query(".generation-record-references-popover"), gallery);
  tile.dispatchEvent(new f.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(f.query(".generation-record-popover"), null); assert.equal(f.document.activeElement, summary);
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

test("a fullscreen reference isolates background actions and closes when its conversation changes", (t) => {
  const f = fixture(t); const task = f.task(); task.input.referenceSnapshot = f.references(2); f.setTasks([task]);
  f.query(".generation-record-references").click(); f.query(".generation-record-reference-item").click();
  const dialog = f.query(".generation-reference-preview"); assert.equal(dialog.open, true);
  f.query("#outside").dispatchEvent(new f.window.MouseEvent("pointerdown", { bubbles: true }));
  assert.equal(f.query(".generation-reference-preview"), dialog);
  f.setScope({ projectId: "other-project", conversationId: "other-chat" });
  assert.equal(f.query(".generation-reference-preview"), null);
  assert.equal(f.query(".generation-record-popover"), null);
  assert.equal(f.actions.length, 0);
});

function inlineReferenceFixture(t, type = "image") {
  const markup = '保留<span class="prompt-reference" data-reference-key="asset:second" role="button" tabindex="0"><span class="prompt-reference-thumb"><img src="https://example.test/second.png" alt=""></span><span class="prompt-reference-label">图片2</span></span>的细节';
  const f = fixture(t, { renderPrompt: () => markup });
  const task = f.task(); task.input.referenceSnapshot = [
    { key: "asset:first", asset: { type: "image", url: "https://example.test/first.png" } },
    { key: "asset:second", asset: { type, url: `https://example.test/second.${type === "image" ? "png" : "mp4"}` } },
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

test("inline preview follows its reference, clamps to the message edges and flips below near the top", (t) => {
  const f = inlineReferenceFixture(t); const part = f.query(".generation-record-prompt .prompt-reference");
  let left = 1130; let top = 250;
  part.getBoundingClientRect = () => ({ left, top, right: left + 70, bottom: top + 20, width: 70, height: 20 });
  part.dispatchEvent(new f.window.MouseEvent("pointerover", { bubbles: true })); f.advance(401);
  const popover = f.query(".generation-record-preview-popover");
  assert.equal(popover.style.left, "975px", "the preview centers on the hovered reference rather than the message left edge");
  assert.equal(popover.dataset.placement, "top");
  left = 876; f.window.dispatchEvent(new f.window.Event("resize"));
  assert.equal(popover.style.left, "876px", "the leftmost reference cannot push its preview out of the message column");
  left = 1314; f.window.dispatchEvent(new f.window.Event("resize"));
  assert.equal(popover.style.left, "1004px", "the rightmost reference stays inside the message right edge");
  top = 75; f.window.dispatchEvent(new f.window.Event("resize"));
  assert.equal(popover.dataset.placement, "bottom");
  assert.equal(popover.style.top, "102px");
});

function openFullPrompt(f) {
  const prompt = f.query(".generation-record-prompt");
  Object.defineProperty(prompt, "clientHeight", { value: 66 }); Object.defineProperty(prompt, "scrollHeight", { value: 240 });
  // Pointer opening avoids assigning keyboard focus to the reader in hover tests.
  prompt.dispatchEvent(new f.window.MouseEvent("click", { bubbles: true, detail: 1 }));
  const reader = f.query(".generation-record-full-prompt"); reader.scrollTop = 80;
  return { prompt, reader, part: reader.querySelector(".prompt-reference"), panel: f.query(".generation-record-prompt-popover") };
}

test("scrolling the full prompt cancels pending child hover without closing the pinned reader", (t) => {
  const f = inlineReferenceFixture(t); const { reader, part } = openFullPrompt(f);
  part.dispatchEvent(new f.window.MouseEvent("pointerover", { bubbles: true, clientX: 10, clientY: 20 }));
  f.advance(100);
  reader.dispatchEvent(new f.window.WheelEvent("wheel", { bubbles: true, deltaY: 80 }));
  reader.scrollTop = 110; reader.dispatchEvent(new f.window.Event("scroll"));
  part.dispatchEvent(new f.window.MouseEvent("pointerover", { bubbles: true, clientX: 10, clientY: 20 }));
  f.advance(500);
  assert.equal(f.query(".generation-record-inline-preview"), null);
  assert.equal(f.query(".generation-record-full-prompt"), reader); assert.equal(reader.scrollTop, 110);
  part.dispatchEvent(new f.window.MouseEvent("pointermove", { bubbles: true, clientX: 12, clientY: 20 }));
  f.advance(301); assert.ok(f.query(".generation-record-inline-preview"));
});

test("full prompt reference hover preserves its reader and scroll while allowing entry into the child preview", (t) => {
  const f = inlineReferenceFixture(t); const { reader, part, panel } = openFullPrompt(f);
  part.dispatchEvent(new f.window.MouseEvent("pointerover", { bubbles: true })); f.advance(100);
  assert.equal(f.query(".generation-record-inline-preview"), null);
  part.dispatchEvent(new f.window.MouseEvent("pointerout", { bubbles: true })); f.advance(300);
  assert.equal(f.query(".generation-record-inline-preview"), null, "a brief crossing must not flash media");
  part.dispatchEvent(new f.window.MouseEvent("pointerover", { bubbles: true })); f.advance(301);
  const preview = f.query(".generation-record-inline-preview"); assert.ok(preview);
  assert.equal(preview.querySelector(".generation-record-preview-media").src, "https://example.test/second.png");
  assert.equal(f.query(".generation-record-full-prompt"), reader); assert.equal(reader.scrollTop, 80);
  assert.equal(f.query(".generation-record-prompt-popover"), panel);
  part.dispatchEvent(new f.window.MouseEvent("pointerout", { bubbles: true, relatedTarget: preview }));
  panel.dispatchEvent(new f.window.MouseEvent("pointerleave", { relatedTarget: preview })); f.advance(100);
  preview.dispatchEvent(new f.window.MouseEvent("pointerenter", { relatedTarget: part })); f.advance(300);
  assert.equal(f.query(".generation-record-inline-preview"), preview);
  assert.equal(f.query(".generation-record-full-prompt"), reader);
  preview.dispatchEvent(new f.window.MouseEvent("pointerleave", { relatedTarget: reader })); f.advance(211);
  assert.equal(f.query(".generation-record-inline-preview"), null);
  assert.equal(f.query(".generation-record-full-prompt"), reader); assert.equal(reader.scrollTop, 80);
  part.dispatchEvent(new f.window.MouseEvent("pointerover", { bubbles: true })); f.advance(301);
  assert.ok(f.query(".generation-record-inline-preview"));
  reader.scrollTop = 110; reader.dispatchEvent(new f.window.Event("scroll"));
  assert.equal(f.query(".generation-record-inline-preview"), null, "scrolling the reader releases a preview whose reference has moved");
  assert.equal(f.query(".generation-record-full-prompt"), reader); assert.equal(reader.scrollTop, 110);
});

for (const activation of ["click", "Enter"]) {
  test(`full prompt reference ${activation} pins a child preview and Escape restores focus through both layers`, (t) => {
    const f = inlineReferenceFixture(t); const { prompt, reader, part } = openFullPrompt(f);
    if (activation === "click") activateWithPointer(f, part);
    else { part.focus(); part.dispatchEvent(new f.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })); }
    const preview = f.query(".generation-record-inline-preview"); assert.ok(preview);
    assert.equal(preview.querySelector(".generation-record-preview-media").src, "https://example.test/second.png");
    assert.equal(f.query(".generation-record-full-prompt"), reader); assert.equal(reader.scrollTop, 80);
    part.dispatchEvent(new f.window.MouseEvent("pointerout", { bubbles: true }));
    reader.focus(); preview.dispatchEvent(new f.window.MouseEvent("pointerleave")); f.advance(400);
    assert.equal(f.query(".generation-record-inline-preview"), preview, "activated previews remain available after hover leaves");
    f.document.dispatchEvent(new f.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.equal(f.query(".generation-record-inline-preview"), null);
    assert.equal(f.query(".generation-record-full-prompt"), reader); assert.equal(reader.scrollTop, 80);
    assert.equal(f.document.activeElement, part);
    f.advance(500); assert.equal(f.query(".generation-record-inline-preview"), null, "restoring focus must not reopen the child");
    part.dispatchEvent(new f.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.equal(f.query(".generation-record-popover"), null); assert.equal(f.document.activeElement, prompt);
  });
}

test("closing records, changing scope and removing the record release both preview layers and child media", (t) => {
  for (const cleanup of ["close", "scope", "remove"]) {
    const f = inlineReferenceFixture(t, "video"); const { part } = openFullPrompt(f);
    part.click(); const preview = f.query(".generation-record-inline-preview"); assert.ok(preview);
    const media = preview.querySelector("video"); assert.ok(media);
    const pauses = f.pauses;
    if (cleanup === "close") f.controller.close();
    else if (cleanup === "scope") f.setScope({ projectId: "other-project", conversationId: "other-chat" });
    else f.setTasks([]);
    f.advance(500);
    assert.equal(f.query(".generation-record-inline-preview"), null, cleanup);
    assert.equal(f.query(".generation-record-prompt-popover"), null, cleanup);
    assert.equal(media.isConnected, false, cleanup);
    assert.equal(media.hasAttribute("src"), false, cleanup);
    assert.ok(f.pauses > pauses, `${cleanup} pauses released preview media`);
  }
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

test("offscreen success counts as a new result and locates its media instead of the prompt", (t) => {
  const f = fixture(t); const task = f.task(); f.setTasks([task]);
  const output = f.query(".generation-record-output");
  output.getBoundingClientRect = () => ({ top: 760, bottom: 1000, height: 240 });
  f.container.scrollTop = 200; task.status = "succeeded"; task.result = { type: "video", url: "/new.mp4" }; f.controller.render();
  f.query(".generation-record-result").getBoundingClientRect = output.getBoundingClientRect;
  f.controller.render();
  assert.equal(f.container.scrollTop, 200);
  const notice = f.query(".generation-record-new");
  assert.equal(notice.hidden, false); assert.match(notice.textContent, /1 个新结果.*查看/);
  notice.click();
  assert.ok(f.container.scrollTop >= 880 && f.container.scrollTop <= 900, "notice locates the media top, allowing its focus inset");
  assert.equal(notice.hidden, true);
  assert.equal(output.classList.contains("is-result-highlighted"), true);
  f.advance(1200); assert.equal(output.classList.contains("is-result-highlighted"), false);
});

for (const status of ["failed", "canceled"]) {
  test(`${status} completion never announces a new generated result`, (t) => {
    const f = fixture(t); const task = f.task(); f.setTasks([task]);
    f.container.scrollTop = 200; task.status = status; f.controller.render();
    assert.equal(f.query(".generation-record-new").hidden, true);
    assert.equal(f.container.scrollTop, 200);
  });
}

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
  f.controller.render(); assert.equal(locate.hidden, false);
  assert.equal(locate.getAttribute("aria-disabled"), "true");
  assert.equal(locate.title, "生成结果尚未放入画布");
  locate.click(); assert.equal(f.actions.length, 0);
  task.addedNodeId = "result-1"; f.controller.render(); assert.equal(locate.hidden, false);
  assert.equal(locate.getAttribute("aria-disabled"), "false");
  assert.equal(locate.title, "定位生成结果");
  locate.click(); assert.equal(f.actions.at(-1)[0], "locate");
  assert.equal(f.query('[data-generation-action="add"]'), null);
});

test("media counts reuse existing icons and task affordances do not degrade to fallback circles", (t) => {
  const f = fixture(t); const task = f.task({ status: "succeeded", result: { type: "image", url: "https://example.test/result.png" } });
  task.input.referenceSnapshot = [{ key: "v", asset: { type: "video" } }, { key: "a", asset: { type: "audio" } }];
  f.setTasks([task]);
  assert.ok(f.query('.generation-record-counts svg[data-generation-icon="square-play"]'));
  assert.ok(f.query('.generation-record-counts svg[data-generation-icon="audio-lines"]'));
  assert.ok(f.query('.generation-record-more svg[data-generation-icon="ellipsis"]'));
  task.status = "failed"; f.controller.render();
  const statusIcon = f.query('.generation-record-outcome svg[data-generation-icon="circle-alert"]');
  assert.equal(statusIcon.outerHTML, f.window.REELAY_ICONS.markup('circle-alert', { 'data-generation-icon': 'circle-alert' }));
  assert.ok(f.query('[data-record-popover="details"]'));
  f.query('[data-record-popover="details"]').click();
  assert.ok(f.query('.generation-record-details-popover [data-generation-icon="copy"]'));
});

test("only a real successful sample exposes final generation and expiry updates without replacing its video", (t) => {
  const f = fixture(t);
  const input = { mediaType: "video", modelId: "seedance-2-5-draft", prompt: "样片内容", cost: 12,
    parameters: { quality: "480p", aspect: "16:9", duration: "10s" } };
  const task = f.task({ status: "succeeded", input });
  task.result = { id: "sample-asset", type: "video", url: "/sample.mp4", generation: f.window.REELAY_DRAFT_VIDEO.createDraftProvenance({
    input, scope: task.scope, taskId: task.id, resultId: "sample-asset", createdAt: task.createdAt,
  }) };
  f.setTasks([task]);
  const action = f.query('[data-generation-action="final"]'); const video = f.query("video");
  assert.equal(f.query('.generation-record-stage'), null);
  assert.equal(f.query('.generation-record-draft-action'), null);
  assert.equal(f.query('.generation-record-actions').firstElementChild, action);
  assert.equal(action.textContent, "生成正片");
  const badge = f.query('.generation-media-resolution');
  assert.equal(badge.textContent, "样片 480P");
  assert.equal(f.all('.generation-media-resolution').length, 1);
  assert.equal(action.disabled, false); action.click(); assert.equal(f.actions.at(-1)[0], "final");
  f.advance(7 * 24 * 60 * 60 * 1000 + 1);
  assert.equal(action.disabled, true); assert.match(action.title, /已过期/);
  assert.equal(action.getAttribute("aria-description"), action.title);
  assert.equal(f.query('.generation-media-resolution'), badge);
  assert.equal(f.query("video"), video); action.click(); assert.equal(f.actions.length, 1);
  const ordinary = f.task({ status: "succeeded", result: { type: "video", url: "/ordinary.mp4", height: 480 } });
  f.setTasks([ordinary]); assert.equal(f.query('[data-generation-action="final"]').hidden, true);
  f.query('[data-generation-action="final"]').click(); assert.equal(f.actions.length, 1);
});

test("final task hides free editing in every state and shows its distinct requested output stage", (t) => {
  const f = fixture(t); const task = f.task({ input: { generationStage: "final", modelName: "Seedance 2.5（成片）", cost: 36 } });
  f.setTasks([task]);
  assert.equal(f.query('.generation-record-stage'), null);
  const edit = f.query('[data-generation-action="edit"]'); assert.equal(edit.hidden, true);
  edit.click(); assert.equal(f.actions.length, 0);
  f.query('[data-generation-action="cancel"]').focus(); f.advance(5000); f.controller.render();
  assert.equal(f.document.activeElement, f.query('[data-record-popover="details"]'));
  task.status = "failed"; f.controller.render();
  f.query('[data-generation-action="again"]').click(); assert.equal(f.actions.at(-1)[0], "again");
  assert.equal(f.query('[data-generation-action="final"]').hidden, true);
  task.status = "succeeded";
  task.result = { type: "video", url: "/final.mp4", generation: { stage: "final", simulated: true } };
  f.controller.render(); assert.equal(f.query('.generation-media-resolution').textContent, "正片 1080P");
});

test("final records show the source sample and output choices without repeating the prompt or original references", (t) => {
  let promptRenders = 0;
  const f = fixture(t, { renderPrompt() { promptRenders++; return "原提示词"; } });
  const task = f.task();
  Object.assign(task.input, { generationStage: "final", sourceDraftAsset: { type: "video", url: "/sample.mp4", posterUrl: "/sample.jpg" },
    parameters: { quality: "1080p", outputFormat: "mov", duration: "10s", aspect: "16:9" }, referenceSnapshot: f.references(3) });
  f.setTasks([task]);
  assert.equal(f.query(".generation-record-prompt, .generation-record-references"), null);
  assert.equal(promptRenders, 0);
  assert.equal(f.query(".generation-record-source-pill strong").textContent, "正片生成");
  assert.deepEqual(f.all(".generation-record-final-source .generation-record-parameter").map((element) => element.textContent), ["10s", "16:9", "1080P", "MOV"]);
  assert.equal(f.query(".generation-record-final-source .generation-record-parameters strong").textContent, "Seedance 2.5");
  assert.equal(f.query(".generation-record-source-thumbnail img").getAttribute("src"), "/sample.jpg");
  assert.equal(f.query(".generation-record-source-thumbnail video"), null);
  const source = f.query(".generation-record-final-source");
  task.status = "succeeded"; task.result = { type: "video", url: "/final.mp4" }; f.controller.render();
  assert.equal(f.query(".generation-record-final-source"), source);
  assert.equal(f.query(".generation-record-result video").getAttribute("src"), "/final.mp4");
  f.query('[data-record-popover="details"]').click(); assert.ok(f.query(".generation-record-details-popover"));
  f.query('[data-generation-action="again"]').click(); assert.equal(f.actions.at(-1)[0], "again");
  f.query('[data-record-popover="menu"]').click(); f.query('[data-generation-action="remove"]').click();
  assert.equal(f.actions.at(-1)[0], "remove");
});

test("source sample without a poster uses a stable silent video thumbnail and releases it with the record", (t) => {
  const f = fixture(t); const task = f.task();
  Object.assign(task.input, { generationStage: "final", sourceDraftAsset: { type: "video", url: "/sample.mp4" } });
  f.setTasks([task]);
  const video = f.query(".generation-record-source-thumbnail video");
  assert.equal(video.muted, true); assert.equal(video.autoplay, false); assert.equal(video.controls, false);
  assert.equal(video.preload, "metadata"); assert.equal(video.playsInline, true);
  task.status = "running"; f.controller.render();
  assert.equal(f.query(".generation-record-source-thumbnail video"), video);
  f.setTasks([]); assert.equal(video.hasAttribute("src"), false); assert.ok(f.pauses > 0);
});

test("source sample thumbnails reject unsafe URLs and fall back safely when unavailable", (t) => {
  const f = fixture(t); const task = f.task();
  Object.assign(task.input, { generationStage: "final", sourceDraftAsset: { type: "video", url: "javascript:bad()", posterUrl: "javascript:bad()" } });
  f.setTasks([task]);
  assert.equal(f.query(".generation-record-source-thumbnail :is(img, video)"), null);
  assert.ok(f.query(".generation-record-source-thumbnail svg"));
  const other = f.task({ id: "other" });
  Object.assign(other.input, { generationStage: "final", sourceDraftAsset: { type: "video", url: "/sample.mp4", thumbnailUrl: "/missing.png" } });
  f.setTasks([other]); f.query(".generation-record-source-thumbnail img").dispatchEvent(new f.window.Event("error"));
  assert.equal(f.query(".generation-record-source-thumbnail img"), null);
  assert.ok(f.query(".generation-record-source-thumbnail svg"));
});

function groupedTasks(f) {
  const root = f.task({ id: "sample", sourceSurface: "conversation", status: "succeeded", addedNodeId: "sample-node" });
  Object.assign(root.input, { mediaType: "video", modelId: "seedance-2-5-draft", generationStage: "draft", parameters: { outputFormat: "mp4", quality: "480p", aspect: "16:9", duration: "10s" }, referenceSnapshot: f.references(1) });
  root.result = { id: "sample-result", type: "video", url: "/shared.mp4", generation: f.window.REELAY_DRAFT_VIDEO.createDraftProvenance({
    input: root.input, scope: root.scope, taskId: root.id, resultId: "sample-result", createdAt: root.createdAt,
  }) };
  const final = f.task({ id: "final-1", sourceSurface: "conversation", status: "running", progress: 20, addedNodeId: "final-node" });
  Object.assign(final.input, { generationStage: "final", sourceDraftTaskId: root.id, sourceResultId: "sample-result", parameters: { outputFormat: "mov" }, cost: 54 });
  return { root, final };
}
function succeedFinal(task) {
  task.status = "succeeded";
  task.result = { id: `${task.id}-result`, type: "video", url: "/shared.mp4", generation: { stage: "final", outputFormat: task.input.parameters.outputFormat } };
}

function openVersions(f, article = f.query("article.generation-record")) {
  const trigger = article.querySelector('[data-record-popover="versions"]');
  trigger.click();
  const panel = f.query(".generation-record-versions-popover");
  assert.ok(panel, "the stack opens the versions list");
  return { trigger, panel, buttons: [...panel.querySelectorAll("[data-record-version]")] };
}

function chooseVersion(f, id) {
  const { panel, trigger } = openVersions(f);
  const button = panel.querySelector(`[data-record-version="${id}"]`);
  button.focus(); button.click();
  assert.equal(f.query(".generation-record-versions-popover"), null);
  assert.equal(f.document.activeElement, trigger);
  return button;
}

function setMediaRect(f, { top = 200, height = 240 } = {}, article = f.query("article")) {
  const rectangle = () => ({ top, bottom: top + height, left: 876, right: 1176, width: 300, height });
  article.querySelector(".generation-record-output").getBoundingClientRect = rectangle;
  const result = article.querySelector(".generation-record-result");
  if (result) result.getBoundingClientRect = rectangle;
}

test("initial history and preview successes never appear as new results", (t) => {
  const f = fixture(t); const { root, final } = groupedTasks(f); succeedFinal(final);
  f.setTasks([root, final]);
  assert.equal(f.query(".generation-record-new").hidden, true);
  assert.equal(f.query('[data-record-popover="versions"]').dataset.unread, undefined);
  const preview = f.task({ id: "preview", isPreview: true });
  f.setTasks([root, final, preview]);
  preview.status = "succeeded"; preview.result = { type: "image", url: "/preview.png" }; f.controller.render();
  assert.equal(f.query(".generation-record-new").hidden, true);
});

test("a visible selected result uses only the local marker and acknowledges after a sustained look", (t) => {
  const f = fixture(t); const task = f.task(); f.setTasks([task]);
  task.status = "succeeded"; task.result = { type: "image", url: "/visible.png" }; f.controller.render();
  setMediaRect(f); f.controller.render();
  const marker = f.query(".generation-record-media-new");
  assert.ok(marker); assert.equal(marker.hidden, false); assert.match(marker.textContent, /新/);
  assert.equal(f.query(".generation-record-new").hidden, true);
  f.advance(899); assert.equal(marker.hidden, false);
  f.advance(1); assert.equal(f.query(".generation-record-media-new"), null);
});

test("quick scrolling and less than half-visible media do not acknowledge a result", (t) => {
  const f = fixture(t); const task = f.task(); f.setTasks([task]);
  task.status = "succeeded"; task.result = { type: "video", url: "/visible.mp4" }; f.controller.render();
  setMediaRect(f); f.controller.render(); f.advance(450);
  setMediaRect(f, { top: 550 }); f.container.dispatchEvent(new f.window.Event("scroll"));
  f.advance(900);
  assert.equal(f.query(".generation-record-new").hidden, false);
  assert.equal(f.query(".generation-record-media-new").hidden, false);
  setMediaRect(f); f.container.dispatchEvent(new f.window.Event("scroll"));
  f.advance(899); assert.equal(f.query(".generation-record-media-new").hidden, false);
  f.advance(1); assert.equal(f.query(".generation-record-media-new"), null);
});

test("viewport is checked again when the dwell period ends", (t) => {
  const f = fixture(t); const task = f.task(); f.setTasks([task]);
  task.status = "succeeded"; task.result = { type: "image", url: "/visible.png" }; f.controller.render();
  setMediaRect(f); f.controller.render();
  setMediaRect(f, { top: 850 }); // Layout can move without a scroll event.
  f.advance(900);
  assert.equal(f.query(".generation-record-media-new").hidden, false);
  assert.equal(f.query(".generation-record-new").hidden, false);
});

test("new finals retain individual unread state and the notice visits them in completion order", (t) => {
  const f = fixture(t); const { root, final } = groupedTasks(f);
  const second = { ...final, id: "final-2", createdAt: final.createdAt + 1 };
  f.setTasks([root, final, second]);
  Object.defineProperty(f.query(".generation-record-output video"), "paused", { value: false });
  succeedFinal(second); second.finishedAt = 100100; f.controller.render();
  succeedFinal(final); final.finishedAt = 100200; f.controller.render();
  const notice = f.query(".generation-record-new");
  assert.equal(notice.hidden, false); assert.match(notice.textContent, /2 个新结果/);
  const { trigger, panel } = openVersions(f);
  assert.equal(trigger.dataset.unread, "true");
  assert.equal(panel.querySelector('[data-record-version="sample"]').dataset.unread, undefined);
  assert.equal(panel.querySelector('[data-record-version="final-1"]').dataset.unread, "true");
  assert.equal(panel.querySelector('[data-record-version="final-2"]').dataset.unread, "true");
  panel.querySelector('[data-record-version="sample"]').click();
  assert.match(notice.textContent, /2 个新结果/, "choosing the old sample cannot consume either new final");
  notice.click();
  assert.equal(f.query(".generation-record-footer").dataset.generationTaskId, second.id);
  assert.match(notice.textContent, /1 个新结果/); assert.equal(notice.hidden, false);
  notice.click();
  assert.equal(f.query(".generation-record-footer").dataset.generationTaskId, final.id);
  assert.equal(notice.hidden, true);
  assert.notEqual(trigger.dataset.unread, "true");
});

test("manual selection acknowledges only the selected new final", (t) => {
  const f = fixture(t); const { root, final } = groupedTasks(f);
  const second = { ...final, id: "final-2" };
  f.setTasks([root, final, second]);
  Object.defineProperty(f.query(".generation-record-output video"), "paused", { value: false });
  succeedFinal(final); succeedFinal(second); f.controller.render();
  chooseVersion(f, second.id);
  assert.match(f.query(".generation-record-new").textContent, /1 个新结果/);
  const { panel } = openVersions(f);
  assert.equal(panel.querySelector('[data-record-version="final-1"]').dataset.unread, "true");
  assert.notEqual(panel.querySelector('[data-record-version="final-2"]').dataset.unread, "true");
});

test("scrolling to the conversation bottom cannot clear an unseen result in an earlier record", (t) => {
  const f = fixture(t); const task = f.task(); f.setTasks([task]);
  task.status = "succeeded"; task.result = { type: "image", url: "/above.png" }; f.controller.render();
  setMediaRect(f, { top: -400 }); f.controller.render();
  f.container.scrollTop = 1200; f.container.dispatchEvent(new f.window.Event("scroll"));
  f.advance(1000);
  assert.equal(f.query(".generation-record-new").hidden, false);
  assert.match(f.query(".generation-record-new").textContent, /1 个新结果/);
});

test("closing preserves unseen results but cancels dwell and highlight feedback", (t) => {
  const f = fixture(t); const task = f.task(); f.setTasks([task]);
  task.status = "succeeded"; task.result = { type: "image", url: "/visible.png" }; f.controller.render();
  setMediaRect(f); f.controller.render(); f.advance(400); f.controller.close(); f.advance(2000);
  f.controller.render();
  assert.equal(f.query(".generation-record-media-new").hidden, false);
  setMediaRect(f, { top: 850 }); f.controller.render();
  f.query(".generation-record-new").click();
  assert.equal(f.query(".generation-record-output").classList.contains("is-result-highlighted"), true);
  f.controller.close();
  assert.equal(f.query(".generation-record-output").classList.contains("is-result-highlighted"), false);
});

test("completion observed outside the active conversation stays scoped until return", (t) => {
  const f = fixture(t); const task = f.task(); f.setTasks([task]);
  const originalScope = { ...task.scope };
  f.setScope({ projectId: "project-1", conversationId: "chat-2", canvasId: "canvas-1" });
  task.status = "succeeded"; task.result = { type: "image", url: "/elsewhere.png" };
  f.controller.observeTask(task, { type: "succeeded" }); f.controller.render();
  assert.equal(f.query(".generation-record-new").hidden, true);
  f.setScope(originalScope);
  assert.equal(f.query(".generation-record-media-new").hidden, false);
  setMediaRect(f, { top: 850 }); f.controller.render();
  assert.equal(f.query(".generation-record-new").hidden, false);
});

test("the stack distinguishes no final, one final and multiple finals without an extra playing video", (t) => {
  const f = fixture(t); const { root, final } = groupedTasks(f);
  root.result.posterUrl = "/sample-poster.jpg";
  f.setTasks([root]);
  assert.equal(f.query(".generation-record-versions").hidden, true);
  f.setTasks([root, final]);
  assert.equal(f.query(".generation-record-versions").hidden, true, "pending is not a finished version");
  succeedFinal(final); final.result.posterUrl = "/final-poster.jpg"; f.controller.render();
  const stack = f.query(".generation-record-versions");
  const trigger = stack.querySelector('[data-record-popover="versions"]');
  assert.equal(stack.hidden, false); assert.match(trigger.textContent, /正片\s*×\s*1/);
  assert.equal(stack.querySelectorAll("video").length, 0);
  assert.ok(stack.querySelector(".generation-record-version-cover img"));
  assert.match(stack.querySelector("img").getAttribute("src"), /poster\.jpg$/);
  const second = { ...final, id: "second", createdAt: final.createdAt + 1 }; succeedFinal(second);
  f.setTasks([root, final, second]);
  assert.match(trigger.textContent, /正片\s*×\s*2/);
  assert.equal(f.query(".generation-record-versions-popover"), null);
});

test("the versions menu closes on outside click or Escape and shares one popover with details", (t) => {
  const f = fixture(t); const { root, final } = groupedTasks(f); succeedFinal(final);
  f.setTasks([root, final]);
  const { trigger, buttons } = openVersions(f);
  assert.equal(trigger.getAttribute("aria-expanded"), "true");
  buttons[0].focus();
  f.document.dispatchEvent(new f.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(f.query(".generation-record-versions-popover"), null);
  assert.equal(f.document.activeElement, trigger);
  assert.equal(trigger.getAttribute("aria-expanded"), "false");
  openVersions(f);
  f.query("#outside").dispatchEvent(new f.window.MouseEvent("pointerdown", { bubbles: true }));
  assert.equal(f.query(".generation-record-versions-popover"), null);
  openVersions(f);
  f.query('[data-record-popover="details"]').click();
  assert.equal(f.query(".generation-record-versions-popover"), null);
  assert.ok(f.query(".generation-record-details-popover"));
  openVersions(f);
  assert.equal(f.query(".generation-record-details-popover"), null);
  assert.equal(f.all(".generation-record-popover").length, 1);
});

test("final versions show an operation badge and the source model without inventing a final model", (t) => {
  const f = fixture(t); const { root, final } = groupedTasks(f);
  root.input.modelName = "Seedance 2.5（样片模式）";
  final.input.modelName = "Seedance 2.5（成片）";
  succeedFinal(final); f.setTasks([root, final]);
  const name = f.query(".generation-record-parameters strong");
  const operation = f.query(".generation-record-operation");
  assert.equal(name.textContent, root.input.modelName);
  assert.equal(operation.textContent, "正片生成");
  assert.equal(operation.hidden, false);
  assert.equal(operation.nextElementSibling, name);
  chooseVersion(f, "sample");
  assert.equal(operation.hidden, true);
  assert.equal(name.textContent, root.input.modelName);
  chooseVersion(f, "final-1");
  assert.equal(operation.hidden, false);
  assert.equal(name.title, root.input.modelName);
});

test("standalone finals identify their source model from the frozen sample", (t) => {
  const f = fixture(t); const task = f.task();
  Object.assign(task.input, { generationStage: "final", modelId: "seedance-2-5", modelName: "Seedance 2.5（成片）",
    sourceDraftAsset: { type: "video", url: "/sample.mp4", generation: {
      input: { modelId: "seedance-2-5-draft", modelName: "Seedance 2.5（样片模式）" },
    } } });
  f.setTasks([task]);
  assert.equal(f.query(".generation-record-parameters strong").textContent, "Seedance 2.5（样片模式）");
  assert.equal(f.query(".generation-record-source-pill strong").textContent, "正片生成");
  assert.equal(f.query(".generation-record-operation"), null, "source capsule already identifies the operation");
});

test("grouped final keeps the sample player and one prompt while progress and cancellation target the child", (t) => {
  const f = fixture(t); const { root, final } = groupedTasks(f);
  f.setTasks([root]);
  const video = f.query(".generation-record-output video"); video.currentTime = 3;
  const prompt = f.query(".generation-record-prompt");
  f.setTasks([root, final]);
  assert.equal(f.all("article.generation-record").length, 1);
  assert.equal(f.all(".generation-record-prompt").length, 1);
  assert.equal(f.query(".generation-record-prompt"), prompt);
  assert.equal(f.query(".generation-record-output video"), video);
  assert.equal(video.currentTime, 3);
  const cancel = f.query('.generation-record-final-state [data-generation-action="cancel"]');
  cancel.click(); assert.equal(f.actions.at(-1)[1].id, final.id);
  final.progress = 66; f.controller.render();
  assert.equal(f.query('.generation-record-final-state [data-generation-action="cancel"]'), cancel);
  assert.equal(f.query("[data-generation-progress]").textContent, "66%");
  assert.equal(f.query('[data-record-popover="menu"]').disabled, true);
  cancel.focus(); f.advance(5000); f.controller.render();
  assert.equal(cancel.disabled, true);
  assert.equal(f.document.activeElement, f.query('[data-record-popover="details"]'));
  assert.equal(f.query(".generation-record-output video"), video);
  assert.equal(f.pauses, 0);
});

test("completed grouped final switches metadata despite identical URLs and routes selected actions and details", (t) => {
  const f = fixture(t); const { root, final } = groupedTasks(f);
  f.setTasks([root, final]); const sample = f.query(".generation-record-output video");
  succeedFinal(final); f.controller.render();
  assert.notEqual(f.query(".generation-record-output video"), sample);
  assert.equal(f.query(".generation-media-resolution").textContent, "正片 1080P");
  assert.equal(f.query(".generation-record-version-meta"), null, "format belongs to selected parameters, not a detached label beside versions");
  assert.deepEqual(f.all(".generation-record-parameter").map((item) => item.textContent), ["1080P", "MOV"]);
  f.query('[data-generation-action="locate"]').click(); assert.equal(f.actions.at(-1)[1].id, final.id);
  f.query('[data-record-popover="details"]').click();
  assert.equal(f.query(".generation-record-task-id code").textContent, final.id);
  f.query('[data-record-close]').click();
  const switcher = chooseVersion(f, "sample");
  assert.equal(f.query(".generation-media-resolution").textContent, "样片 480P");
  assert.ok(f.all(".generation-record-parameter").some((item) => item.textContent === "480P"));
  assert.equal(f.document.activeElement.dataset.recordPopover, "versions");
  assert.equal(switcher.getAttribute("aria-pressed"), "true");
  f.query('[data-generation-action="locate"]').click(); assert.equal(f.actions.at(-1)[1].id, root.id);
  f.query('[data-record-popover="menu"]').click(); f.query('[data-generation-action="remove"]').click();
  assert.equal(f.actions.at(-1)[1].id, root.id);
});

test("playing sample stays in place when final completes until the explicit ready action", (t) => {
  const f = fixture(t); const { root, final } = groupedTasks(f);
  f.setTasks([root, final]); const video = f.query(".generation-record-output video");
  Object.defineProperty(video, "paused", { value: false }); video.currentTime = 4;
  f.container.scrollTop = 200; succeedFinal(final); f.controller.render();
  assert.equal(f.query(".generation-record-output video"), video);
  assert.equal(video.currentTime, 4); assert.equal(f.container.scrollTop, 200);
  assert.match(f.query(".generation-record-final-state").textContent, /正片已就绪/);
  f.query(".generation-record-final-ready").click();
  assert.equal(f.query(".generation-media-resolution").textContent, "正片 1080P");
  assert.equal(f.query(".generation-record-final-state").hidden, true);
});

test("offscreen final notice selects its exact result and locates media below the long prompt", (t) => {
  const f = fixture(t); const { root, final } = groupedTasks(f);
  f.setTasks([root, final]);
  f.query("article").getBoundingClientRect = () => ({ top: -900, bottom: -60, height: 840 });
  const output = f.query(".generation-record-output");
  output.getBoundingClientRect = () => ({ top: -300, bottom: -60, height: 240 });
  f.query(".generation-record-result").getBoundingClientRect = output.getBoundingClientRect;
  const video = f.query(".generation-record-output video"); f.container.scrollTop = 600;
  succeedFinal(final); f.controller.render();
  assert.equal(f.query(".generation-record-output video"), video);
  assert.equal(f.container.scrollTop, 600);
  assert.equal(f.query(".generation-record-new").hidden, false);
  f.query(".generation-record-new").click();
  assert.ok(f.container.scrollTop >= 220 && f.container.scrollTop <= 240);
  assert.equal(f.query(".generation-media-resolution").textContent, "正片 1080P");
  assert.equal(output.classList.contains("is-result-highlighted"), true);
});

test("canceled and failed attempts remain in details history while versions contain only successful finals", (t) => {
  const f = fixture(t); const { root, final } = groupedTasks(f);
  final.status = "canceled"; final.refunded = 54;
  f.setTasks([root, final]);
  assert.equal(f.query(".generation-record-versions").hidden, true, "canceled attempts do not create a result stack");
  const video = f.query(".generation-record-output video");
  assert.match(f.query(".generation-record-final-state").textContent, /已取消.*积分已返还/);
  f.query('.generation-record-final-state [data-generation-action="again"]').click();
  assert.equal(f.actions.at(-1)[1].id, final.id);
  const failed = { ...final, id: "final-failed", status: "failed", error: "模拟失败" };
  const first = { ...final, id: "final-success-1", refunded: 0 }; succeedFinal(first);
  const second = { ...final, id: "final-success-2", refunded: 0 }; succeedFinal(second);
  f.setTasks([root, final, failed, first, second]);
  assert.equal(f.all("article.generation-record").length, 1);
  const { buttons, trigger } = openVersions(f);
  assert.deepEqual(buttons.map((button) => button.dataset.recordVersion), [root.id, first.id, second.id]);
  assert.match(trigger.textContent, /正片\s*×\s*2/);
  assert.equal(f.query(".generation-record-version-select"), null);
  assert.equal(video.isConnected, false);
  const firstVersion = f.query(`[data-record-version="${first.id}"]`); firstVersion.focus(); firstVersion.click();
  assert.equal(f.document.activeElement, trigger);
  f.query('[data-record-popover="details"]').click();
  assert.equal(f.query(".generation-record-task-id code").textContent, first.id);
  assert.equal(f.all(".generation-record-task-attempt").length, 5);
  const history = f.query('[data-record-history-task="final-failed"]'); history.focus(); history.click();
  assert.equal(f.query(".generation-record-task-id code").textContent, failed.id);
  assert.equal(f.document.activeElement.dataset.recordHistoryTask, failed.id);
  f.query('.generation-record-details-popover [data-generation-action="feedback"]').click();
  assert.equal(f.actions.at(-1)[1].id, failed.id);
});

test("grouped records exclude canvas finals and never attach a different conversation's final", (t) => {
  const f = fixture(t); const { root, final } = groupedTasks(f);
  const canvas = { ...final, id: "canvas-final", sourceSurface: "canvas" };
  const other = { ...final, id: "other-final", scope: { ...final.scope, conversationId: "other" } };
  f.setTasks([root, canvas, other]);
  assert.equal(f.all("article.generation-record").length, 1);
  assert.equal(f.query(".generation-record-final-state").hidden, true);
  assert.equal(f.query(".generation-record-versions").hidden, true);
});


test("group final completion and cancellation keep keyboard focus on a usable control", (t) => {
  const f = fixture(t); const { root, final } = groupedTasks(f);
  f.setTasks([root, final]);
  f.query('.generation-record-final-state [data-generation-action="cancel"]').focus();
  final.status = "canceled"; f.controller.render();
  assert.equal(f.document.activeElement, f.query('.generation-record-final-state [data-generation-action="again"]'));
  final.status = "running"; f.controller.render();
  const cancel = f.query('.generation-record-final-state [data-generation-action="cancel"]'); cancel.focus();
  succeedFinal(final); f.controller.render();
  assert.equal(f.document.activeElement, f.query('[data-record-popover="details"]'));
});

test("a history item retains keyboard focus when its task completes asynchronously", (t) => {
  const f = fixture(t); const { root, final } = groupedTasks(f);
  f.setTasks([root, final]); f.query('[data-record-popover="details"]').click();
  const history = f.query('[data-record-history-task="final-1"]'); history.focus(); history.click();
  succeedFinal(final); f.controller.render();
  assert.equal(f.document.activeElement.dataset.recordHistoryTask, final.id);
  assert.match(f.document.activeElement.textContent, /已完成/);
});

test("expired source disables grouped retry and moves focus off the expired control", (t) => {
  const f = fixture(t); const { root, final } = groupedTasks(f);
  final.status = "failed"; final.error = { message: "服务暂不可用" };
  f.setTasks([root, final]);
  assert.match(f.query(".generation-record-final-outcome").textContent, /服务暂不可用/);
  const retry = f.query('.generation-record-final-state [data-generation-action="again"]');
  retry.focus(); f.advance(7 * 24 * 60 * 60 * 1000 + 1);
  assert.equal(retry.disabled, true); assert.match(retry.title, /已过期/);
  assert.equal(f.document.activeElement, f.query('[data-record-popover="details"]'));
  retry.click(); assert.equal(f.actions.length, 0);
});

test("the stack lists successful finals with their formats and selected format stays with its parameters", (t) => {
  const f = fixture(t); const { root, final } = groupedTasks(f);
  const finals = Array.from({ length: 4 }, (_, index) => {
    const task = { ...final, id: `final-${index + 1}`, createdAt: final.createdAt + index,
      input: { ...final.input, parameters: { outputFormat: index % 2 ? "mp4" : "mov" } } };
    succeedFinal(task); return task;
  });
  f.setTasks([root, ...finals]);
  const { buttons, trigger } = openVersions(f);
  assert.match(trigger.textContent, /正片\s*×\s*4/);
  assert.deepEqual(buttons.map((button) => button.querySelector(".generation-record-version-label").textContent), ["样片", "正片 1", "正片 2", "正片 3", "正片 4"]);
  assert.deepEqual(buttons.map((button) => button.dataset.recordVersion), [root.id, ...finals.map((task) => task.id)]);
  assert.equal(f.query(".generation-record-versions select"), null);
  assert.equal(f.query(".generation-record-version-meta"), null);
  for (const [index, task] of finals.entries()) {
    if (index) openVersions(f);
    const button = buttons[index + 1]; const format = task.input.parameters.outputFormat.toUpperCase();
    button.focus(); button.click();
    assert.equal(f.query(".generation-record-versions-popover"), null);
    assert.equal(f.document.activeElement, trigger);
    assert.equal(button.getAttribute("aria-pressed"), "true");
    assert.equal(buttons.filter((item) => item.getAttribute("aria-pressed") === "true").length, 1);
    assert.match(button.title, new RegExp(`正片 ${index + 1}.*1080P.*${format}`));
    assert.match(button.getAttribute("aria-label"), new RegExp(`正片 ${index + 1}.*1080P.*${format}`));
    assert.match(button.querySelector(".generation-record-version-spec").textContent, new RegExp(`1080P.*${format}`));
    assert.deepEqual(f.all(".generation-record-parameter").map((item) => item.textContent), ["1080P", format]);
    f.query('[data-generation-action="locate"]').click();
    assert.equal(f.actions.at(-1)[1].id, task.id);
  }
  chooseVersion(f, root.id);
  assert.match(buttons[0].title, /样片.*480P.*MP4/);
  assert.equal(f.query(".generation-media-resolution").textContent, "样片 480P");
});

for (const scrollTop of [200, 1180]) {
  test(`switching an earlier record preserves scroll at ${scrollTop} and does not touch other cards or show a lifecycle notice`, (t) => {
    const f = fixture(t); const { root, final } = groupedTasks(f); succeedFinal(final);
    const before = f.task({ id: "before", status: "succeeded", result: { type: "video", url: "/before.mp4" } });
    const after = f.task({ id: "after", status: "succeeded", result: { type: "video", url: "/after.mp4" } });
    f.setTasks([before, root, final, after]);
    const articles = f.all("article.generation-record");
    const neighbors = [articles[0], articles[2]];
    const players = neighbors.map((article) => article.querySelector("video"));
    const observer = new f.window.MutationObserver(() => {});
    for (const article of neighbors) observer.observe(article, { subtree: true, attributes: true, childList: true, characterData: true });
    players.forEach((player) => { player.currentTime = 3; });
    f.container.scrollTop = scrollTop;
    const hint = f.query(".generation-record-new"); assert.equal(hint.hidden, true);
    const versions = articles[1].querySelector(".generation-record-versions");
    const { trigger, buttons: [sampleButton, finalButton] } = openVersions(f, articles[1]);
    const focusCalls = [];
    const originalFocus = trigger.focus.bind(trigger);
    trigger.focus = (options) => { focusCalls.push(options); originalFocus(options); };
    for (const button of [sampleButton, finalButton]) {
      if (!f.query(".generation-record-versions-popover")) openVersions(f, articles[1]);
      button.focus(); button.click();
      assert.equal(f.container.scrollTop, scrollTop, "explicit local switching must never apply near-bottom auto-follow");
      assert.equal(f.document.activeElement, trigger);
      assert.equal(focusCalls.at(-1)?.preventScroll, true);
      assert.equal(articles[1].querySelector(".generation-record-versions"), versions);
      assert.equal(f.query(".generation-record-versions-popover"), null);
      assert.equal(hint.hidden, true, "viewing an existing result is not a new task completion");
    }
    assert.deepEqual(observer.takeRecords(), [], "switching updates only the chosen card");
    observer.disconnect();
    neighbors.forEach((article, index) => {
      assert.equal(article.querySelector("video"), players[index]);
      assert.equal(players[index].currentTime, 3);
    });
  });
}

test("an open version menu retains its buttons, focus and selected sample when a final completes", (t) => {
  const f = fixture(t); const { root, final } = groupedTasks(f); succeedFinal(final);
  f.setTasks([root, final]);
  const versions = f.query(".generation-record-versions");
  chooseVersion(f, root.id);
  const { panel, trigger, buttons: [sampleButton, firstButton] } = openVersions(f);
  sampleButton.focus();
  const video = f.query(".generation-record-output video");
  video.currentTime = 3;
  const second = { ...final, id: "final-2", createdAt: final.createdAt + 1 }; succeedFinal(second);
  f.setTasks([root, final, second]);
  assert.equal(f.query(".generation-record-versions"), versions);
  assert.equal(f.query(".generation-record-versions-popover"), panel);
  assert.equal(panel.querySelector(`[data-record-version="${root.id}"]`), sampleButton);
  assert.equal(panel.querySelector(`[data-record-version="${final.id}"]`), firstButton);
  assert.equal(f.document.activeElement, sampleButton);
  assert.equal(sampleButton.getAttribute("aria-pressed"), "true", "completion must not replace a version being inspected");
  assert.deepEqual([...panel.querySelectorAll(".generation-record-version-label")].map((label) => label.textContent), ["样片", "正片 1", "正片 2"]);
  assert.match(trigger.textContent, /正片\s*×\s*2/);
  assert.equal(f.query(".generation-record-output video"), video);
  assert.equal(video.currentTime, 3);
});

test("selecting the already selected version is a no-op for playback, scroll and focus", (t) => {
  const f = fixture(t); const { root, final } = groupedTasks(f); succeedFinal(final);
  f.setTasks([root, final]);
  const { panel, trigger } = openVersions(f);
  const button = panel.querySelector(`[data-record-version="${final.id}"]`);
  const video = f.query(".generation-record-output video");
  video.currentTime = 4; Object.defineProperty(video, "paused", { value: false });
  const observer = new f.window.MutationObserver(() => {});
  observer.observe(f.query(".generation-record-output"), { subtree: true, attributes: true, childList: true, characterData: true });
  f.container.scrollTop = 1180; button.focus(); button.click();
  assert.equal(f.query(".generation-record-output video"), video);
  assert.equal(video.currentTime, 4); assert.equal(f.pauses, 0);
  assert.equal(f.document.activeElement, trigger); assert.equal(f.container.scrollTop, 1180);
  assert.equal(f.query(".generation-record-versions-popover"), null);
  assert.deepEqual(observer.takeRecords(), []);
  observer.disconnect();
});
