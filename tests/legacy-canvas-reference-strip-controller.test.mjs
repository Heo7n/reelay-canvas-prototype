import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const [placementSource, controllerSource] = await Promise.all([
  "canvas-popover-placement.js", "canvas-reference-strip-controller.js",
].map((file) => readFile(new URL(`../src/legacy-canvas/${file}`, import.meta.url), "utf8")));

function fixture(t) {
  const dom = new JSDOM(`<!doctype html><body><textarea id="prompt">已有提示词</textarea>
    <div id="nodes"><section class="canvas-node" data-id="node-1"><div class="asset-shelf"></div></section></div>
    <button id="outside">其他控件</button></body>`, { runScripts: "outside-only" });
  const view = dom.window;
  const document = view.document;
  const root = document.querySelector("#nodes");
  const shelf = document.querySelector(".asset-shelf");
  const prompt = document.querySelector("#prompt");
  const outside = document.querySelector("#outside");
  let serial = 0;
  let time = 0;
  const timers = new Map();
  const frames = new Map();
  const calls = [];
  const captures = [];
  let pauses = 0;
  let loads = 0;
  view.setTimeout = (callback, delay) => { const id = ++serial; timers.set(id, { callback, due: time + delay }); return id; };
  view.clearTimeout = (id) => timers.delete(id);
  view.requestAnimationFrame = (callback) => { const id = ++serial; frames.set(id, callback); return id; };
  view.cancelAnimationFrame = (id) => frames.delete(id);
  view.HTMLElement.prototype.setPointerCapture = function capture(pointerId) { captures.push([this, pointerId]); };
  view.HTMLElement.prototype.releasePointerCapture = function release(pointerId) { captures.push([this, -pointerId]); };
  view.HTMLMediaElement.prototype.pause = () => { pauses++; };
  view.HTMLMediaElement.prototype.load = () => { loads++; };
  const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
  let shelfBounds = rect(100, 350, 260, 56);
  let previewSize = { width: 240, height: 200 };
  let scrollWidth = 260;
  let context = {
    scope: "project-1/canvas-1", nodeId: "node-1", node: {}, canReorder: true,
    entries: ["a", "b", "c", "d"].map((key) => ({ key, label: `素材 ${key}`, asset: { type: "image", url: `https://example.test/${key}.png` } })),
  };
  let spaceDown = false;
  let renderOnMove = false;
  let acceptsMove = true;
  let contextAvailable = true;
  Object.defineProperty(shelf, "clientWidth", { get: () => 260 });
  Object.defineProperty(shelf, "scrollWidth", { get: () => scrollWidth });
  shelf.style.overflowX = "auto";
  shelf.getBoundingClientRect = () => shelfBounds;
  view.HTMLElement.prototype.getBoundingClientRect = function bounds() {
    if (this.classList.contains("reference-preview-popover")) {
      const width = Math.min(previewSize.width, Number.parseFloat(this.style.maxWidth) || previewSize.width);
      const height = Math.min(previewSize.height, Number.parseFloat(this.style.maxHeight) || previewSize.height);
      return rect(0, 0, width, height);
    }
    if (this.hasAttribute("data-reference-key")) {
      const index = context.entries.findIndex((entry) => entry.key === this.dataset.referenceKey);
      return rect(shelfBounds.left + index * 56 - shelf.scrollLeft, shelfBounds.top + 4, 48, 48);
    }
    return rect(0, 0, 1024, 768);
  };
  function render() {
    shelf.replaceChildren(...context.entries.map((entry) => {
      const card = document.createElement("div");
      card.className = "asset-card reference-card";
      card.dataset.referenceKey = entry.key;
      card.tabIndex = 0;
      const image = document.createElement("img");
      image.src = entry.asset.url;
      const remove = document.createElement("button");
      remove.dataset.referenceRemove = entry.key;
      remove.textContent = "删除";
      card.append(image, remove);
      return card;
    }));
  }
  render();
  view.eval(placementSource);
  view.eval(controllerSource);
  const controller = view.REELAY_CANVAS_REFERENCE_STRIP.createController({
    document, root, placeAnchoredPopover: view.REELAY_CANVAS_POPOVER_PLACEMENT.placeAnchoredPopover,
    getContext: () => contextAvailable ? context : null,
    isSpaceDown: () => spaceDown,
    onMove: (current, movement) => {
      calls.push({ context: current, movement: { ...movement } });
      if (!acceptsMove) return false;
      if (renderOnMove) {
        const source = context.entries.find((entry) => entry.key === movement.sourceKey);
        const others = context.entries.filter((entry) => entry !== source);
        const index = others.findIndex((entry) => entry.key === movement.targetKey);
        others.splice(index + (movement.placement === "after" ? 1 : 0), 0, source);
        context.entries = others; render();
      }
      return true;
    },
  });
  t.after(() => { controller.dispose(); view.close(); });
  function tick(duration) {
    time += duration;
    for (const [id, timer] of [...timers]) if (timer.due <= time && timers.delete(id)) timer.callback();
  }
  function flushFrames() {
    for (const [id, callback] of [...frames]) if (frames.delete(id)) callback(time);
  }
  function pointer(type, target, options = {}) {
    const event = new view.MouseEvent(type, { bubbles: true, cancelable: true, clientX: 120, clientY: 375, ...options });
    Object.defineProperty(event, "pointerId", { value: options.pointerId ?? 1 });
    target.dispatchEvent(event);
    return event;
  }
  function key(target, key, options = {}) {
    const event = new view.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options });
    target.dispatchEvent(event);
    return event;
  }
  function wheel(target, options = {}) {
    const event = new view.WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 40, ...options });
    target.dispatchEvent(event);
    return event;
  }
  function card(key) { return [...shelf.children].find((element) => element.dataset.referenceKey === key); }
  function dragTo(key, x, y = 375) {
    const source = card(key);
    const bounds = source.getBoundingClientRect();
    pointer("pointerdown", source, { clientX: bounds.left + 20, clientY: bounds.top + 20 });
    pointer("pointermove", source, { clientX: x, clientY: y });
    return source;
  }
  return {
    document, view, root, shelf, prompt, outside, controller, calls, captures, timers, frames,
    tick, flushFrames, pointer, key, wheel, card, dragTo, rect, render,
    preview: () => document.querySelector(".reference-preview-popover"),
    ghost: () => document.querySelector(".reference-drag-ghost"),
    context: () => context,
    replaceContext: (next) => { context = next; },
    setAvailable: (value) => { contextAvailable = value; },
    setSpace: (value) => { spaceDown = value; },
    moveShelf: (next) => { shelfBounds = next; },
    resizePreview: (width, height) => { previewSize = { width, height }; },
    setScrollWidth: (width) => { scrollWidth = width; },
    setRenderOnMove: () => { renderOnMove = true; },
    rejectMoves: () => { acceptsMove = false; },
    mediaReleases: () => ({ pauses, loads }),
  };
}

test("hover opens a centered preview after a short delay, allows crossing into it, and closes on departure", (t) => {
  const f = fixture(t);
  f.pointer("pointerover", f.card("b"));
  f.tick(100);
  assert.equal(f.preview(), null);
  f.pointer("pointerout", f.card("b"), { relatedTarget: f.outside });
  f.tick(300);
  assert.equal(f.preview(), null);
  f.pointer("pointerover", f.card("b"));
  f.tick(220);
  const preview = f.preview();
  assert.equal(preview.parentElement, f.document.body);
  assert.equal(preview.getAttribute("role"), "dialog");
  assert.equal(preview.querySelector("img").src, "https://example.test/b.png");
  assert.equal(preview.style.left, "60px");
  assert.equal(preview.style.top, "146px");
  assert.equal(preview.dataset.placement, "top");
  f.pointer("pointerout", f.card("b"));
  f.tick(80);
  f.pointer("pointerover", preview);
  f.tick(300);
  assert.equal(f.preview(), preview);
  f.pointer("pointerout", preview, { relatedTarget: f.outside });
  f.tick(180);
  assert.equal(f.preview(), null);
  assert.equal(f.card("b").hasAttribute("aria-controls"), false);
  assert.equal(f.frames.size, 0);
});

test("keyboard focus previews without moving focus; Escape closes before canvas handlers run", (t) => {
  const f = fixture(t);
  let canvasEscapes = 0;
  f.document.addEventListener("keydown", () => { canvasEscapes++; });
  f.card("a").focus(); f.tick(220);
  assert.ok(f.preview());
  assert.equal(f.document.activeElement, f.card("a"));
  const event = f.key(f.card("a"), "Escape");
  assert.equal(event.defaultPrevented, true);
  assert.equal(canvasEscapes, 0);
  assert.equal(f.preview(), null);
  assert.equal(f.document.activeElement, f.card("a"));
  f.key(f.card("a"), "Escape");
  assert.equal(canvasEscapes, 1);
});

test("inline references preview outside a strip while preserving native selection, keys and IME", (t) => {
  const f = fixture(t);
  const editor = f.document.createElement("div");
  editor.className = "prompt-editor";
  editor.contentEditable = "true";
  const pill = f.document.createElement("span");
  pill.className = "prompt-reference";
  pill.dataset.referenceKey = "a";
  pill.contentEditable = "false";
  pill.tabIndex = 0;
  editor.append(pill);
  f.root.querySelector(".canvas-node").append(editor);
  assert.equal(pill.closest(".asset-shelf"), null);
  assert.equal(f.pointer("pointerdown", pill).defaultPrevented, false);
  assert.equal(f.pointer("pointermove", pill, { clientX: 300 }).defaultPrevented, false);
  assert.equal(f.captures.length, 0);
  assert.equal(f.ghost(), null);
  for (const name of ["Enter", "ArrowLeft", "ArrowRight"]) {
    assert.equal(f.key(pill, name, { altKey: true }).defaultPrevented, false);
  }
  assert.equal(f.calls.length, 0);
  f.pointer("pointerover", pill); f.tick(220);
  assert.equal(f.preview().querySelector("img").src, "https://example.test/a.png");
  assert.equal(f.key(pill, "Escape", { isComposing: true }).defaultPrevented, false);
  assert.ok(f.preview());
  editor.dataset.referenceMenuOpen = "true";
  f.flushFrames();
  assert.equal(f.preview(), null);
  f.pointer("pointerover", pill); f.tick(220);
  assert.equal(f.preview(), null);
  delete editor.dataset.referenceMenuOpen;
  pill.focus(); f.tick(220);
  assert.ok(f.preview());
  assert.equal(f.document.activeElement, pill);
  assert.equal(f.shelf.scrollLeft, 0);
  f.controller.close();
  editor.tabIndex = 0;
  editor.focus();
  pill.dispatchEvent(new f.view.CustomEvent("reference-preview-request", { bubbles: true, detail: { open: true } }));
  assert.ok(f.preview());
  assert.equal(f.document.activeElement, editor);
  pill.dispatchEvent(new f.view.CustomEvent("reference-preview-request", { bubbles: true, detail: { open: false } }));
  assert.equal(f.preview(), null);
  pill.classList.add("is-missing");
  f.pointer("pointerover", pill); f.tick(220);
  assert.equal(f.preview(), null);
});

test("hovering the removal control cancels its card preview without starting reorder", (t) => {
  const f = fixture(t);
  const card = f.card("a");
  const remove = card.querySelector("button");
  f.pointer("pointerover", card); f.tick(100);
  f.pointer("pointerover", remove, { relatedTarget: card });
  f.tick(220);
  assert.equal(f.preview(), null);
  assert.equal(f.pointer("pointerdown", remove).defaultPrevented, false);
  assert.equal(f.captures.length, 0);
  assert.equal(f.calls.length, 0);
});

test("native video/audio controls never autoplay, and release their source when the preview closes", (t) => {
  const f = fixture(t);
  for (const type of ["video", "audio"]) {
    f.context().entries[0].asset.type = type;
    f.key(f.card("a"), "Enter");
    const media = f.preview().querySelector(type);
    assert.equal(media.controls, true);
    assert.equal(media.autoplay, false);
    assert.equal(media.preload, "metadata");
    let canvasClicks = 0;
    f.document.addEventListener("click", () => { canvasClicks++; }, { once: true });
    const click = f.pointer("click", media);
    assert.equal(click.defaultPrevented, false);
    assert.equal(canvasClicks, 0);
    f.controller.close();
    assert.equal(media.hasAttribute("src"), false);
  }
  assert.deepEqual(f.mediaReleases(), { pauses: 2, loads: 2 });
});

test("preview labels and text are safe text, and unavailable assets get a readable placeholder", (t) => {
  const f = fixture(t);
  f.context().entries[0].label = "<img onerror=alert(1)>";
  f.context().entries[0].asset = { type: "text", text: "<script>内容</script>" };
  f.key(f.card("a"), "Enter");
  assert.equal(f.preview().querySelector(".reference-preview-label").textContent, "<img onerror=alert(1)>");
  assert.equal(f.preview().querySelector(".reference-preview-empty").textContent, "<script>内容</script>");
  assert.equal(f.preview().querySelector("script, img"), null);
  f.controller.close();
  f.context().entries[0].asset = { type: "image", url: "" };
  f.key(f.card("a"), "Enter");
  assert.equal(f.preview().querySelector(".reference-preview-empty").textContent, "暂无可预览内容");
});

test("preview follows a moving card, flips below near the top, and respects viewport gutters", (t) => {
  const f = fixture(t);
  f.key(f.card("a"), "Enter");
  assert.equal(f.preview().style.left, "12px");
  f.moveShelf(f.rect(800, 20, 260, 56));
  f.flushFrames();
  assert.equal(f.preview().dataset.placement, "bottom");
  assert.equal(f.preview().style.top, "80px");
  assert.equal(f.preview().style.left, "704px");
  f.view.innerHeight = 150;
  f.resizePreview(1500, 500);
  f.flushFrames();
  assert.equal(f.preview().style.maxWidth, "1000px");
  assert.equal(f.preview().style.maxHeight, "126px");
  assert.equal(f.preview().style.left, "12px");
  assert.equal(f.preview().style.top, "12px");
});

test("preview closes if its card is removed, fully clipped, hidden, replaced, or moved to another scope", (t) => {
  const f = fixture(t);
  for (const invalidate of [
    () => f.card("a").remove(),
    () => { f.shelf.scrollLeft = 100; },
    () => { f.root.hidden = true; },
    () => { f.context().node = {}; },
    () => { f.context().scope = "project-2/canvas-2"; },
    () => { f.context().entries[0].asset.url = "https://example.test/replacement.png"; },
    () => f.setAvailable(false),
  ]) {
    f.render(); f.shelf.scrollLeft = 0; f.root.hidden = false; f.setAvailable(true);
    f.key(f.card("a"), "Enter");
    assert.ok(f.preview());
    invalidate(); f.flushFrames();
    assert.equal(f.preview(), null);
    assert.equal(f.frames.size, 0);
  }
});

test("ordinary clicks keep existing card actions and focus, while remove controls and canvas gestures bypass sorting", (t) => {
  const f = fixture(t);
  let clicks = 0;
  let presses = 0;
  f.root.addEventListener("click", () => { clicks++; });
  f.root.addEventListener("pointerdown", () => { presses++; });
  f.prompt.focus();
  const down = f.pointer("pointerdown", f.card("a"));
  f.pointer("pointerup", f.card("a"));
  const click = f.pointer("click", f.card("a"));
  assert.equal(down.defaultPrevented, true);
  assert.equal(click.defaultPrevented, false);
  assert.equal(clicks, 1);
  assert.equal(presses, 0);
  assert.equal(f.document.activeElement, f.prompt);
  assert.equal(f.calls.length, 0);
  const remove = f.card("a").querySelector("button");
  f.pointer("pointerdown", remove); f.pointer("click", remove);
  assert.equal(clicks, 2);
  assert.equal(presses, 1);
  f.pointer("pointerdown", f.card("a"), { button: 1 });
  f.setSpace(true); f.pointer("pointerdown", f.card("a"));
  assert.equal(presses, 3);
  assert.equal(f.ghost(), null);
});

test("drag uses a threshold and pointer capture, displays an insertion marker, then commits exactly once on release", (t) => {
  const f = fixture(t);
  f.key(f.card("a"), "Enter");
  f.pointer("pointerdown", f.card("a"));
  f.pointer("pointermove", f.card("a"), { clientX: 123 });
  assert.equal(f.ghost(), null);
  f.pointer("pointermove", f.card("a"), { clientX: 250 });
  assert.equal(f.preview(), null);
  assert.ok(f.ghost());
  assert.equal(f.ghost().parentElement, f.document.body);
  assert.equal(f.ghost().style.width, "48px");
  assert.equal(f.card("a").dataset.referenceDragging, "true");
  assert.equal(f.card("c").dataset.referenceDrop, "after");
  assert.equal(f.calls.length, 0);
  f.pointer("pointerup", f.card("a"), { clientX: 250 });
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0].movement, { sourceKey: "a", targetKey: "c", placement: "after" });
  assert.equal(f.ghost(), null);
  assert.equal(f.card("a").hasAttribute("data-reference-dragging"), false);
  assert.equal(f.card("c").hasAttribute("data-reference-drop"), false);
  assert.equal(f.document.body.classList.contains("reference-strip-dragging"), false);
  assert.equal(f.captures.length, 2);
  let clicks = 0;
  f.root.addEventListener("click", () => { clicks++; });
  const click = f.pointer("click", f.card("a"));
  assert.equal(click.defaultPrevented, true);
  assert.equal(clicks, 0);
  f.pointer("click", f.card("a"));
  assert.equal(clicks, 1);
});

test("reordering adjacent cards into their current slot is a no-op, and release outside the shelf cancels", (t) => {
  const f = fixture(t);
  const source = f.dragTo("a", 158);
  assert.equal(f.document.querySelector("[data-reference-drop]"), null);
  f.pointer("pointerup", source, { clientX: 158 });
  assert.equal(f.calls.length, 0);
  f.dragTo("a", 250);
  assert.equal(f.card("c").dataset.referenceDrop, "after");
  f.pointer("pointerup", source, { clientX: 250, clientY: 500 });
  assert.equal(f.calls.length, 0);
  assert.equal(f.document.querySelector("[data-reference-drop]"), null);
});

test("cancel, Escape, lost capture, window blur, and Space cancel without mutating references", (t) => {
  const f = fixture(t);
  for (const cancel of [
    () => f.pointer("pointercancel", f.card("a")),
    () => f.key(f.card("a"), "Escape"),
    () => f.pointer("lostpointercapture", f.card("a")),
    () => f.view.dispatchEvent(new f.view.Event("blur")),
    () => { f.setSpace(true); f.pointer("pointermove", f.card("a"), { clientX: 255 }); },
  ]) {
    f.setSpace(false); f.dragTo("a", 250);
    assert.ok(f.ghost());
    cancel();
    f.pointer("pointerup", f.card("a"), { clientX: 250 });
    assert.equal(f.calls.length, 0);
    assert.equal(f.ghost(), null);
    assert.equal(f.frames.size, 0);
    assert.equal(f.document.querySelector("[data-reference-drop]"), null);
  }
});

test("drag invalidates on permission/generation changes, node replacement, scope switch, or concurrent entry changes", (t) => {
  const f = fixture(t);
  for (const invalidate of [
    () => { f.context().canReorder = false; },
    () => { f.context().node = {}; },
    () => { f.context().scope += "/changed"; },
    () => { f.context().entries = [...f.context().entries].reverse(); },
    () => f.setAvailable(false),
    () => f.card("a").remove(),
  ]) {
    f.setAvailable(true); f.context().canReorder = true;
    f.context().entries.sort((a, b) => a.key.localeCompare(b.key)); f.render();
    f.dragTo("a", 250); invalidate(); f.flushFrames();
    assert.equal(f.ghost(), null);
    f.pointer("pointerup", f.document, { clientX: 250 });
    assert.equal(f.calls.length, 0);
  }
});

test("pointer identity and final synchronous scope checks prevent unrelated releases or stale commits", (t) => {
  const f = fixture(t);
  f.dragTo("a", 250);
  f.pointer("pointerup", f.card("a"), { clientX: 250, pointerId: 2 });
  assert.ok(f.ghost());
  assert.equal(f.calls.length, 0);
  f.context().canReorder = false;
  f.pointer("pointerup", f.card("a"), { clientX: 250 });
  assert.equal(f.calls.length, 0);
  assert.equal(f.ghost(), null);
});

test("overflow edge scrolling follows the pointer, stops outside the strip, and cleans up on cancel", (t) => {
  const f = fixture(t);
  f.setScrollWidth(520);
  f.dragTo("a", 354);
  f.flushFrames();
  assert.ok(f.shelf.scrollLeft > 0);
  const scroll = f.shelf.scrollLeft;
  f.pointer("pointermove", f.card("a"), { clientX: 354, clientY: 500 });
  f.flushFrames();
  assert.equal(f.shelf.scrollLeft, scroll);
  assert.equal(f.document.querySelector("[data-reference-drop]"), null);
  f.controller.close(); f.flushFrames();
  assert.equal(f.frames.size, 0);
  assert.equal(f.shelf.scrollLeft, scroll);
});

test("ordinary vertical wheel browses the overflow strip in both directions, clamps at its edges, and creates no content change", (t) => {
  const f = fixture(t);
  f.setScrollWidth(520);
  const first = f.wheel(f.card("a"));
  assert.equal(first.defaultPrevented, true);
  assert.equal(f.shelf.scrollLeft, 40);
  const right = f.wheel(f.shelf, { deltaY: 500 });
  assert.equal(right.defaultPrevented, true);
  assert.equal(f.shelf.scrollLeft, 260);
  assert.equal(f.wheel(f.shelf).defaultPrevented, false);
  assert.equal(f.shelf.scrollLeft, 260);
  f.wheel(f.shelf, { deltaY: -600 });
  assert.equal(f.shelf.scrollLeft, 0);
  assert.equal(f.wheel(f.shelf, { deltaY: -40 }).defaultPrevented, false);
  assert.equal(f.calls.length, 0);
});

test("wheel keeps Ctrl/Meta zoom and native horizontal/Shift scrolling untouched, and is scoped to overflowing reference shelves", (t) => {
  const f = fixture(t);
  assert.equal(f.wheel(f.card("a")).defaultPrevented, false);
  f.setScrollWidth(520);
  for (const options of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { deltaX: 30 }, { deltaY: 0 }]) {
    assert.equal(f.wheel(f.card("a"), options).defaultPrevented, false);
    assert.equal(f.shelf.scrollLeft, 0);
  }
  for (const target of [f.prompt, f.outside, f.root]) assert.equal(f.wheel(target).defaultPrevented, false);
  const outsideShelf = f.document.createElement("div");
  outsideShelf.className = "asset-shelf";
  f.document.body.append(outsideShelf);
  Object.defineProperty(outsideShelf, "clientWidth", { value: 100 });
  Object.defineProperty(outsideShelf, "scrollWidth", { value: 300 });
  assert.equal(f.wheel(outsideShelf).defaultPrevented, false);
  assert.equal(outsideShelf.scrollLeft, 0);
});

test("wheel normalizes line and page units and honors the strip's screen scale", (t) => {
  const f = fixture(t);
  f.setScrollWidth(1000);
  f.wheel(f.shelf, { deltaY: 2, deltaMode: 1 });
  assert.equal(f.shelf.scrollLeft, 32);
  f.wheel(f.shelf, { deltaY: 1, deltaMode: 2 });
  assert.equal(f.shelf.scrollLeft, 292);
  f.shelf.scrollLeft = 0;
  f.moveShelf(f.rect(100, 350, 130, 56));
  f.wheel(f.shelf, { deltaY: 20 });
  assert.equal(f.shelf.scrollLeft, 40);
});

test("keyboard focus reveals overflowing references and remove controls by scrolling only their shelf", (t) => {
  const f = fixture(t);
  f.context().entries.push(...["e", "f", "g", "h"].map((key) => ({
    key, label: key, asset: { type: "image", url: `https://example.test/${key}.png` },
  })));
  f.setScrollWidth(440); f.render();
  f.card("h").focus(); f.tick(220);
  assert.equal(f.shelf.scrollLeft, 180);
  assert.ok(f.preview());
  assert.equal(f.document.activeElement, f.card("h"));
  f.card("a").focus(); f.tick(220);
  assert.equal(f.shelf.scrollLeft, 0);
  assert.equal(f.document.activeElement, f.card("a"));
  f.card("h").querySelector("button").focus();
  assert.equal(f.shelf.scrollLeft, 180);
  assert.equal(f.document.activeElement, f.card("h").querySelector("button"));
  assert.equal(f.root.scrollLeft, 0);
  assert.equal(f.document.documentElement.scrollLeft, 0);
  assert.equal(f.calls.length, 0);
});

test("Alt+arrows move exactly one step, retain focus by key after rendering, and ignore boundaries/read-only cards", (t) => {
  const f = fixture(t);
  f.setRenderOnMove(); f.card("b").focus();
  f.key(f.card("b"), "ArrowRight", { altKey: true });
  assert.deepEqual(f.context().entries.map((entry) => entry.key), ["a", "c", "b", "d"]);
  assert.equal(f.document.activeElement, f.card("b"));
  f.key(f.card("b"), "ArrowLeft", { altKey: true });
  assert.deepEqual(f.context().entries.map((entry) => entry.key), ["a", "b", "c", "d"]);
  assert.equal(f.document.activeElement, f.card("b"));
  f.key(f.card("a"), "ArrowLeft", { altKey: true });
  f.context().canReorder = false;
  f.key(f.card("b"), "ArrowRight", { altKey: true });
  assert.equal(f.calls.length, 2);
});

test("reorder restores the shelf card rather than an earlier inline reference with the same stable key", (t) => {
  const f = fixture(t);
  const editor = f.document.createElement("div");
  editor.className = "prompt-editor";
  const inline = f.document.createElement("span");
  inline.className = "prompt-reference";
  inline.dataset.referenceKey = "a";
  inline.textContent = "图片1";
  editor.append(inline);
  f.shelf.before(editor);
  f.setRenderOnMove();

  // An editor atom is not normally focusable. Even a focusable read-only pill
  // must never replace the focused card after that card's DOM is rerendered.
  for (const [index, key] of ["ArrowRight", "ArrowLeft"].entries()) {
    if (index) inline.tabIndex = 0;
    const before = f.card("a");
    before.focus();
    assert.equal(f.key(before, key, { altKey: true }).defaultPrevented, true);
    assert.notEqual(f.card("a"), before);
    assert.equal(f.document.activeElement, f.card("a"));
    assert.notEqual(f.document.activeElement, inline);
  }
  assert.equal(f.calls.length, 2);
});

test("mouse sorting preserves a prompt's focus and text, but restores an already focused card after rendering", (t) => {
  const f = fixture(t);
  f.setRenderOnMove(); f.prompt.focus(); f.prompt.setSelectionRange(1, 3);
  let source = f.dragTo("a", 250);
  f.pointer("pointerup", source, { clientX: 250 });
  assert.equal(f.document.activeElement, f.prompt);
  assert.equal(f.prompt.value, "已有提示词");
  assert.equal(f.prompt.selectionStart, 1);
  assert.equal(f.prompt.selectionEnd, 3);
  f.card("b").focus(); source = f.dragTo("b", 300);
  f.pointer("pointerup", source, { clientX: 300 });
  assert.equal(f.document.activeElement, f.card("b"));
});

test("BFCache cleanup permits reentry and disposal removes all handlers and pending work", (t) => {
  const f = fixture(t);
  f.dragTo("a", 250);
  f.view.dispatchEvent(new f.view.PageTransitionEvent("pagehide", { persisted: true }));
  assert.equal(f.ghost(), null);
  f.key(f.card("a"), "Enter");
  assert.ok(f.preview());
  f.view.dispatchEvent(new f.view.PageTransitionEvent("pagehide", { persisted: false }));
  f.tick(1000);
  assert.equal(f.preview(), null);
  assert.equal(f.frames.size, 0);
  assert.equal(f.timers.size, 0);
  const pointer = f.pointer("pointerdown", f.card("a"));
  assert.equal(pointer.defaultPrevented, false);
  f.key(f.card("a"), "Enter");
  assert.equal(f.preview(), null);
});
