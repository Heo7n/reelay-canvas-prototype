import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const source = await readFile(new URL("../src/legacy-canvas/canvas-agent-composer-resize.js", import.meta.url), "utf8");

function fixture(t) {
  const dom = new JSDOM('<!doctype html><body><section id="panel"><header class="agent-header"></header><div id="history"></div><div id="composer" style="margin-bottom:12px"><section id="advanced"></section><div id="stage"><div id="editor" contenteditable="true">原提示词与引用</div></div></div></section></body>', { runScripts: "outside-only" });
  const { window } = dom; const { document } = window;
  const panel = document.querySelector("#panel"); const composer = document.querySelector("#composer"); const stage = document.querySelector("#stage");
  let panelHeight = 800; let extraHeight = 2; let captured = null; let resizeStarts = 0; let documentMoves = 0; let documentDowns = 0;
  const calls = []; const observers = [];
  const height = () => Number.parseFloat(composer.style.getPropertyValue("--agent-composer-height")) || 240;
  const rect = (height) => ({ x: 0, y: 0, top: 0, bottom: height, left: 0, right: 560, width: 560, height });
  panel.getBoundingClientRect = () => rect(panelHeight);
  panel.querySelector("header").getBoundingClientRect = () => rect(52);
  composer.getBoundingClientRect = () => rect(height() + extraHeight);
  stage.getBoundingClientRect = () => rect(height());
  window.HTMLElement.prototype.setPointerCapture = (id) => { captured = id; };
  window.HTMLElement.prototype.hasPointerCapture = (id) => captured === id;
  window.HTMLElement.prototype.releasePointerCapture = () => { captured = null; };
  window.ResizeObserver = class { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } };
  document.addEventListener("pointermove", () => { documentMoves++; }); document.addEventListener("pointerdown", () => { documentDowns++; });
  window.eval(source);
  const controller = window.REELAY_CANVAS_AGENT_COMPOSER_RESIZE.createController({ document, panel, composer, stage,
    onResizeStart: () => { resizeStarts++; }, onResize: (value, detail) => calls.push({ value, ...detail }),
  });
  const handle = composer.querySelector(".agent-composer-resize-handle");
  t.after(() => { controller.dispose(); window.close(); });
  function pointer(type, y, options = {}) {
    const event = new window.MouseEvent(type, { bubbles: true, cancelable: true, clientY: y, button: options.button ?? 0 });
    Object.defineProperty(event, "pointerId", { value: options.pointerId ?? 1 });
    Object.defineProperty(event, "isPrimary", { value: options.isPrimary ?? true });
    handle.dispatchEvent(event); return event;
  }
  function key(key, shiftKey = false) { handle.dispatchEvent(new window.KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true })); }
  return { document, window, panel, composer, stage, handle, controller, calls, height, pointer, key, observers,
    get captured() { return captured; }, get resizeStarts() { return resizeStarts; },
    get documentMoves() { return documentMoves; }, get documentDowns() { return documentDowns; },
    setPanelHeight(value) { panelHeight = value; controller.sync(); },
    setExtraHeight(value) { extraHeight = value; observers.forEach((observer) => observer.callback()); },
  };
}

test("composer drag owns pointer capture, clamps size, and preserves editor DOM and content", (t) => {
  const f = fixture(t); const editor = f.document.querySelector("#editor"); editor.scrollTop = 29;
  assert.equal(f.height(), 240);
  f.pointer("pointerdown", 500); assert.equal(f.captured, 1);
  f.pointer("pointermove", 410); assert.equal(f.height(), 330);
  assert.equal(f.documentMoves, 0); assert.equal(f.documentDowns, 0);
  assert.equal(f.document.querySelector("#editor"), editor); assert.equal(editor.textContent, "原提示词与引用"); assert.equal(editor.scrollTop, 29);
  f.pointer("pointermove", 100); assert.equal(f.height(), 420);
  f.pointer("pointerup", 100); assert.equal(f.captured, null); assert.equal(f.composer.classList.contains("is-resizing-composer"), false);
  f.pointer("pointerdown", 500); f.pointer("pointerup", 1000); assert.equal(f.height(), 208);
});

test("pointer cancel, lost capture, Escape, and window blur restore the previous chosen height", (t) => {
  const f = fixture(t);
  let panelEscape = 0;
  f.panel.addEventListener("keydown", (event) => { if (event.key === "Escape") panelEscape++; });
  for (const reason of ["pointercancel", "lostpointercapture", "Escape", "blur"]) {
    f.pointer("pointerdown", 500); f.pointer("pointermove", 380); assert.equal(f.height(), 360);
    if (reason === "Escape") f.key("Escape");
    else if (reason === "blur") f.window.dispatchEvent(new f.window.Event("blur"));
    else f.pointer(reason, 380);
    assert.equal(f.height(), 240); assert.equal(f.captured, null);
  }
  assert.equal(panelEscape, 0, "canceling a resize must not close the panel");
});

test("keyboard separator supports arrows, larger steps, bounds, and resetting the default", (t) => {
  const f = fixture(t);
  assert.equal(f.handle.getAttribute("role"), "separator"); assert.equal(f.handle.getAttribute("aria-orientation"), "horizontal");
  f.key("ArrowUp"); assert.equal(f.height(), 256);
  f.key("ArrowDown", true); assert.equal(f.height(), 208);
  f.key("End"); assert.equal(f.height(), 420);
  f.key("Home"); assert.equal(f.height(), 208);
  assert.equal(f.handle.getAttribute("aria-valuenow"), "208");
  f.handle.dispatchEvent(new f.window.MouseEvent("dblclick", { bubbles: true })); assert.equal(f.height(), 240);
});

test("panel and advanced settings clamp usable height and restore the preferred size when space returns", (t) => {
  const f = fixture(t); f.key("End"); assert.equal(f.height(), 420);
  f.setPanelHeight(420); assert.equal(f.height(), 270);
  assert.equal(f.handle.getAttribute("aria-valuemax"), "270");
  f.setExtraHeight(82); assert.equal(f.height(), 190);
  assert.equal(f.handle.getAttribute("aria-valuemin"), "190");
  f.setPanelHeight(800); assert.equal(f.height(), 420);
  f.setPanelHeight(280); assert.ok(f.height() <= 280 - 52 - 82 - 12);
});

test("other pointers and pointer buttons cannot take over a resize gesture", (t) => {
  const f = fixture(t);
  f.pointer("pointerdown", 500, { button: 2 }); assert.equal(f.captured, null);
  f.pointer("pointerdown", 500, { isPrimary: false }); assert.equal(f.captured, null);
  f.pointer("pointerdown", 500); f.pointer("pointermove", 350, { pointerId: 2 }); assert.equal(f.height(), 240);
  f.pointer("pointerup", 350, { pointerId: 2 }); assert.equal(f.captured, 1);
  f.pointer("pointerup", 400); assert.equal(f.height(), 340); assert.equal(f.captured, null);
});

test("hidden panel rejects gestures and disposal removes owned handle, listeners, and sizing override", (t) => {
  const f = fixture(t); f.panel.setAttribute("aria-hidden", "true");
  f.pointer("pointerdown", 500); assert.equal(f.captured, null); assert.equal(f.resizeStarts, 0);
  f.panel.removeAttribute("aria-hidden"); f.pointer("pointerdown", 500); f.pointer("pointermove", 400);
  f.controller.close(); assert.equal(f.height(), 240);
  const editor = f.document.querySelector("#editor"); f.controller.dispose();
  assert.equal(f.composer.style.getPropertyValue("--agent-composer-height"), "");
  assert.equal(f.composer.querySelector(".agent-composer-resize-handle"), null);
  assert.equal(f.document.querySelector("#editor"), editor); assert.equal(f.observers[0].disconnected, true);
});
