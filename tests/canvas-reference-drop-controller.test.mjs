import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const source = await readFile(new URL("../src/legacy-canvas/canvas-reference-drop-controller.js", import.meta.url), "utf8");

function fixture(t) {
  const dom = new JSDOM(`<main id="canvas"><article data-id="one"><div class="media-frame"><span>Media</span></div><div class="prompt-panel"><textarea></textarea></div></article><article data-id="two"><div class="media-frame"></div></article></main><aside id="agent"><textarea></textarea></aside>`, { runScripts: "outside-only" });
  t.after(() => dom.window.close());
  const { window } = dom;
  window.eval(source);
  const nodes = new Map(["one", "two"].map((id) => [id, { id, kind: "generator", generating: false }]));
  const context = { scope: {}, mutable: true };
  const query = (selector) => window.document.querySelector(selector);
  const controller = window.REELAY_CANVAS_REFERENCE_DROP.createCanvasReferenceDropController({
    window,
    hasPayload: (event) => event.dataTransfer?.types.includes("Files"),
    isCanvasTarget: (target) => Boolean(target?.closest?.("#canvas")),
    isMutable: () => context.mutable,
    getNode: (target) => nodes.get(target?.closest?.("[data-id]")?.dataset.id),
    getScope: () => context.scope,
  });
  t.after(() => controller.destroy());
  function drag(type, target, options = {}) {
    const event = new window.MouseEvent(type, { bubbles: true, cancelable: true, ...options });
    const transfer = { types: ["Files"], dropEffect: "none" };
    Object.defineProperty(event, "dataTransfer", { value: transfer });
    target.dispatchEvent(event);
    return transfer;
  }
  const active = () => [...window.document.querySelectorAll(".reference-drop-active")];
  return { window, context, nodes, query, controller, drag, active };
}

test("feedback follows just the hovered generator surface and leaves blank canvas without a node highlight", (t) => {
  const f = fixture(t);
  const media = f.query(".media-frame"), prompt = f.query(".prompt-panel");
  assert.equal(f.drag("dragover", media.firstChild).dropEffect, "copy");
  assert.deepEqual(f.active(), [media]);
  f.drag("dragover", prompt.firstChild);
  assert.deepEqual(f.active(), [prompt]);
  assert.equal(f.drag("dragover", f.query("#canvas")).dropEffect, "copy");
  assert.deepEqual(f.active(), []);
  f.nodes.get("two").kind = "asset";
  assert.equal(f.drag("dragover", f.query('[data-id="two"] .media-frame')).dropEffect, "copy");
  assert.deepEqual(f.active(), []);
});

test("crossing into Agent clears the canvas feedback even when Agent stops event bubbling", (t) => {
  const f = fixture(t);
  const agent = f.query("#agent");
  agent.addEventListener("dragover", (event) => {
    event.preventDefault(); event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
  });
  f.drag("dragover", f.query(".media-frame"));
  assert.equal(f.active().length, 1);
  assert.equal(f.drag("dragover", agent.firstChild).dropEffect, "copy");
  assert.deepEqual(f.active(), []);
});

test("leaving the active surface clears feedback but moving among its children keeps it", (t) => {
  const f = fixture(t), media = f.query(".media-frame");
  f.drag("dragover", media);
  f.drag("dragleave", media, { relatedTarget: media.firstChild });
  assert.deepEqual(f.active(), [media]);
  f.drag("dragleave", media, { relatedTarget: f.query("#agent") });
  assert.deepEqual(f.active(), []);
  f.drag("dragover", media);
  f.drag("dragleave", media, { relatedTarget: null });
  assert.deepEqual(f.active(), []);
});

test("drop, dragend, blur, pagehide and disposal clear feedback including intercepted drops", (t) => {
  const f = fixture(t), media = f.query(".media-frame");
  media.addEventListener("drop", (event) => event.stopPropagation());
  for (const type of ["drop", "dragend", "blur", "pagehide"]) {
    f.drag("dragover", media);
    assert.equal(f.active().length, 1);
    if (type === "drop" || type === "dragend") f.drag(type, media);
    else f.window.dispatchEvent(new f.window.Event(type));
    assert.deepEqual(f.active(), [], type);
  }
  f.drag("dragover", media);
  f.controller.destroy();
  assert.deepEqual(f.active(), []);
  f.drag("dragover", media);
  assert.deepEqual(f.active(), []);
});

test("scope replacement, access loss, generation and removed nodes invalidate the live target", (t) => {
  const f = fixture(t), media = f.query(".media-frame");
  const changes = [
    () => { f.context.scope = {}; },
    () => { f.context.mutable = false; },
    () => { f.nodes.get("one").generating = true; },
    () => { f.nodes.delete("one"); },
    () => { media.remove(); },
  ];
  for (const change of changes) {
    f.context.mutable = true;
    f.nodes.set("one", { id: "one", kind: "generator", generating: false });
    f.drag("dragover", media);
    assert.equal(f.active().length, 1);
    change();
    f.controller.syncContext();
    assert.equal(media.classList.contains("reference-drop-active"), false);
  }
});

test("read-only and generating targets do not advertise copy acceptance", (t) => {
  const f = fixture(t), media = f.query(".media-frame");
  f.context.mutable = false;
  assert.equal(f.drag("dragover", media).dropEffect, "none");
  assert.equal(f.controller.canDrop(media), false);
  f.context.mutable = true;
  f.nodes.get("one").generating = true;
  assert.equal(f.drag("dragover", media).dropEffect, "none");
  assert.equal(f.controller.canDrop(media), false);
  assert.deepEqual(f.active(), []);
});
