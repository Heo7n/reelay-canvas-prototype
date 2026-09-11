import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const source = await readFile(new URL("../src/legacy-canvas/canvas-generation-reference-preview.js", import.meta.url), "utf8");

function fixture(t, options = {}) {
  const dom = new JSDOM('<!doctype html><body><button id="trigger">图片1</button><button id="other">其他</button></body>', { runScripts: "outside-only" });
  const { window } = dom;
  const { document } = window;
  let modalCalls = 0;
  let nativeCloseCalls = 0;
  let pauses = 0;
  let loads = 0;
  let closed = 0;
  window.HTMLDialogElement.prototype.showModal = function () {
    modalCalls++;
    this.setAttribute("open", "");
    this.querySelector("[autofocus]")?.focus();
  };
  window.HTMLDialogElement.prototype.close = function () {
    nativeCloseCalls++;
    this.removeAttribute("open");
    this.dispatchEvent(new window.Event("close"));
  };
  window.HTMLMediaElement.prototype.pause = () => { pauses++; };
  window.HTMLMediaElement.prototype.load = () => { loads++; };
  window.eval(source);
  const controller = window.REELAY_GENERATION_REFERENCE_PREVIEW.createController({
    document,
    sanitizeUrl: (value) => /^https:\/\/example\.test\//.test(value || "") ? value : "",
    ...options,
  });
  const trigger = document.querySelector("#trigger");
  trigger.focus();
  t.after(() => { controller.dispose(); dom.window.close(); });
  const open = (type = "image", overrides = {}) => controller.open({
    asset: { type, url: `https://example.test/reference.${type === "image" ? "png" : type === "video" ? "mp4" : "mp3"}` },
    label: `${type}1`, trigger, onClose: () => { closed++; }, ...overrides,
  });
  return { window, document, controller, trigger, open,
    query: (selector) => document.querySelector(selector),
    get modalCalls() { return modalCalls; }, get closed() { return closed; },
    get nativeCloseCalls() { return nativeCloseCalls; },
    get pauses() { return pauses; }, get loads() { return loads; },
  };
}

test("image references open as native modal with escaped label and explicit loading/error states", (t) => {
  const f = fixture(t);
  assert.equal(f.open("image", { label: '<img src="x" onerror="alert(1)">' }), true);
  assert.equal(f.modalCalls, 1);
  assert.equal(f.controller.isOpen(), true);
  const dialog = f.query("dialog");
  assert.equal(f.document.activeElement, f.query(".generation-reference-preview-close"));
  assert.equal(f.query("h2").textContent, '<img src="x" onerror="alert(1)">');
  assert.equal(f.query("h2 img"), null);
  assert.equal(f.query("img").draggable, false);
  assert.equal(dialog.dataset.state, "loading");
  f.query("img").dispatchEvent(new f.window.Event("load"));
  assert.equal(dialog.dataset.state, "ready");
  assert.equal(f.query('[role="status"]').hidden, true);
  f.query("img").dispatchEvent(new f.window.Event("error"));
  assert.equal(dialog.dataset.state, "error");
  assert.equal(f.query("img").hidden, true);
  assert.equal(f.query("[data-preview-message]").textContent, "此素材暂时无法预览");
});

test("close button releases the image, restores source focus and notifies once", (t) => {
  const f = fixture(t); f.open();
  const image = f.query("img");
  f.query(".generation-reference-preview-close").click();
  assert.equal(f.controller.isOpen(), false);
  assert.equal(f.query("dialog"), null);
  assert.equal(image.hasAttribute("src"), false);
  assert.equal(f.document.activeElement, f.trigger);
  assert.equal(f.closed, 1);
  assert.equal(f.nativeCloseCalls, 1);
  f.controller.close({ notify: true });
  assert.equal(f.closed, 1);
});

test("Escape is isolated from canvas shortcuts and native cancel closes the preview", (t) => {
  const f = fixture(t); f.open();
  let escaped = 0;
  f.document.addEventListener("keydown", () => { escaped++; });
  const key = new f.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  f.query("button.generation-reference-preview-close").dispatchEvent(key);
  assert.equal(escaped, 0);
  assert.equal(key.defaultPrevented, false, "native dialog Escape remains enabled");
  const cancel = new f.window.Event("cancel", { cancelable: true });
  f.query("dialog").dispatchEvent(cancel);
  assert.equal(cancel.defaultPrevented, true);
  assert.equal(f.closed, 1);
  assert.equal(f.controller.isOpen(), false);
  assert.equal(f.document.activeElement, f.trigger);
});

test("background click closes but clicks on media and drags ending on background do not", (t) => {
  const f = fixture(t); f.open();
  const stage = f.query(".generation-reference-preview-stage");
  const image = f.query("img");
  image.dispatchEvent(new f.window.Event("pointerdown", { bubbles: true }));
  image.click();
  assert.equal(f.controller.isOpen(), true);
  image.dispatchEvent(new f.window.Event("pointerdown", { bubbles: true }));
  stage.click();
  assert.equal(f.controller.isOpen(), true);
  stage.dispatchEvent(new f.window.Event("pointerdown", { bubbles: true }));
  stage.click();
  assert.equal(f.controller.isOpen(), false);
  assert.equal(f.closed, 1);
});

test("video uses real controls without autoplay and releases media when silently replaced", (t) => {
  const f = fixture(t);
  f.open("video", { asset: { type: "video", url: "https://example.test/clip.mp4", posterUrl: "https://example.test/poster.jpg" } });
  const video = f.query("video");
  assert.equal(video.controls, true);
  assert.equal(video.autoplay, false);
  assert.equal(video.playsInline, true);
  assert.equal(video.preload, "metadata");
  assert.equal(video.poster, "https://example.test/poster.jpg");
  video.dispatchEvent(new f.window.Event("loadeddata"));
  assert.equal(f.query("dialog").dataset.state, "ready");
  f.open("image");
  assert.equal(f.pauses, 1);
  assert.equal(f.loads, 1);
  assert.equal(video.hasAttribute("src"), false);
  assert.equal(video.hasAttribute("poster"), false);
  assert.equal(f.closed, 0);
  video.dispatchEvent(new f.window.Event("error"));
  assert.equal(f.query("dialog").dataset.state, "loading", "released media cannot affect the next preview");
});

test("audio provides a labelled native player and removes its source on external close", (t) => {
  const f = fixture(t); f.open("audio");
  const audio = f.query("audio");
  assert.equal(audio.controls, true);
  assert.equal(audio.autoplay, false);
  assert.equal(audio.getAttribute("aria-label"), "audio1");
  audio.dispatchEvent(new f.window.Event("loadedmetadata"));
  assert.equal(f.query("dialog").dataset.state, "ready");
  const other = f.query("#other"); other.focus();
  f.controller.close();
  assert.equal(audio.hasAttribute("src"), false);
  assert.equal(f.pauses, 1);
  assert.equal(f.loads, 1);
  assert.equal(f.closed, 0);
  assert.equal(f.nativeCloseCalls, 0, "silent close avoids native automatic opener focus restoration");
  assert.equal(f.document.activeElement, other, "external lifecycle closure does not explicitly return focus to stale trigger");
});

test("invalid media URL shows an error without assigning a source or unsafe poster", (t) => {
  const f = fixture(t);
  assert.equal(f.open("image", { asset: { type: "image", url: "javascript:alert(1)" } }), true);
  assert.equal(f.query("img"), null);
  assert.equal(f.query("dialog").dataset.state, "error");
  f.open("video", { asset: { type: "video", url: "https://example.test/clip.mp4", posterUrl: "javascript:alert(1)" } });
  assert.equal(f.query("video").hasAttribute("poster"), false);
});

test("dispose closes silently, releases handlers, and rejects future open calls", (t) => {
  const f = fixture(t); f.open("video");
  const dialog = f.query("dialog");
  f.controller.dispose();
  assert.equal(f.closed, 0);
  assert.equal(f.controller.isOpen(), false);
  dialog.dispatchEvent(new f.window.Event("cancel", { cancelable: true }));
  assert.equal(f.closed, 0);
  assert.equal(f.open(), false);
  assert.equal(f.query("dialog"), null);
  assert.equal(f.pauses, 1);
});

test("native open failure cleans up and returns false instead of an inaccessible overlay", (t) => {
  const f = fixture(t);
  f.window.HTMLDialogElement.prototype.showModal = () => { throw new Error("document inactive"); };
  assert.equal(f.open("video"), false);
  assert.equal(f.controller.isOpen(), false);
  assert.equal(f.query("dialog"), null);
  assert.equal(f.closed, 0);
  assert.equal(f.pauses, 1);
});
