import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const [viewSource, controllerSource] = await Promise.all([
  readFile(new URL("../src/legacy-canvas/canvas-entity-use-view.js", import.meta.url), "utf8"),
  readFile(new URL("../src/legacy-canvas/canvas-entity-use-controller.js", import.meta.url), "utf8"),
]);

function createHarness(t) {
  const dom = new JSDOM(`<!doctype html><body>
    <main id="background"><div id="grid">
      <article data-library-entity="one"><button class="asset-library-card-preview">一</button></article>
      <article data-library-entity="two"><button class="asset-library-card-preview">二</button></article>
    </div><div id="nodes"><button data-node="node-one">主体</button></div></main>
    <div id="detail" hidden inert aria-hidden="true"></div>
    <div id="picker" hidden inert aria-hidden="true"></div>
  </body>`, { runScripts: "outside-only", url: "https://reelay.test/" });
  const { window } = dom;
  const document = window.document;
  let serial = 0;
  let time = 0;
  const timers = new Map();
  const frames = new Map();
  window.setTimeout = (callback, delay) => { const id = ++serial; timers.set(id, { callback, due: time + delay }); return id; };
  window.clearTimeout = (id) => timers.delete(id);
  window.requestAnimationFrame = (callback) => { const id = ++serial; frames.set(id, callback); return id; };
  window.cancelAnimationFrame = (id) => frames.delete(id);
  window.HTMLElement.prototype.getClientRects = function getClientRects() { return this.isConnected ? [{}] : []; };
  window.eval(viewSource);
  window.eval(controllerSource);
  const grid = document.querySelector("#grid");
  const detail = document.querySelector("#detail");
  const picker = document.querySelector("#picker");
  const background = document.querySelector("#background");
  background.inert = false;
  const environment = {
    scope: { projectId: "project-one", canvasId: "canvas-one" },
    context: { eligible: true, space: "personal" },
    mutable: true,
    target: { id: "node-one", supported: true, generating: false, promptOptimizing: false },
  };
  const media = [{ id: "image-one", mediaKind: "image", name: "图片一", url: "https://cdn.example/one.jpg" }];
  const entities = [
    { id: "one", name: "雾森角色", spaces: ["personal", "organization"], media },
    { id: "two", name: "城市场景", spaces: ["organization"], media },
  ];
  const calls = { submissions: [], canvas: [], iconRefreshes: 0 };
  const controller = window.REELAY_CANVAS_ENTITY_USE_CONTROLLER.createCanvasEntityUseController({
    grid, detailPortal: detail, pickerPortal: picker, background,
    view: window.REELAY_CANVAS_ENTITY_USE_VIEW,
    getScope: () => environment.scope,
    getDetailContext: () => environment.context,
    getDetailEntity: (id, space) => entities.find((entity) => entity.id === id && entity.spaces.includes(space)),
    getPickerEntities: () => entities,
    getAvoidRects: () => [{ left: 800, top: 0, width: 200, height: 800 }],
    isTargetAvailable: (id) => environment.target?.id === id && environment.target.supported && !environment.target.generating && !environment.target.promptOptimizing,
    isMutable: () => environment.mutable,
    requireMutation: () => environment.mutable,
    getPickerTrigger: (id) => document.querySelector(`[data-node="${id}"]`),
    onAddEntities: (submission) => calls.submissions.push(submission),
    onAddToCanvas: (submission) => { calls.canvas.push(submission); return true; },
    refreshIcons: () => { calls.iconRefreshes += 1; },
  });
  t.after(() => { controller.dispose(); dom.window.close(); });
  function tick(duration) {
    time += duration;
    for (const [id, timer] of [...timers]) {
      if (timer.due <= time && timers.delete(id)) timer.callback();
    }
  }
  function flushFrames() {
    for (const [id, callback] of [...frames]) if (frames.delete(id)) callback(time);
  }
  function click(selector, host = picker) {
    const element = host.querySelector(selector);
    assert.ok(element, `Missing ${selector}`);
    element.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    return element;
  }
  function pointer(type, target, relatedTarget = null) {
    target.dispatchEvent(new window.MouseEvent(type, { bubbles: true, relatedTarget }));
  }
  function key(target, value, shiftKey = false) {
    const event = new window.KeyboardEvent("keydown", { key: value, shiftKey, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  }
  return { window, document, grid, detail, picker, background, controller, environment, entities, calls, timers, frames, tick, flushFrames, click, pointer, key };
}

test("hover and focus detail sessions retain card-to-detail traversal and pinned behavior", (t) => {
  const h = createHarness(t);
  const card = h.grid.querySelector('[data-library-entity="one"]');
  h.pointer("pointerover", card);
  h.tick(129);
  assert.equal(h.detail.hidden, true);
  h.tick(1);
  assert.equal(h.detail.hidden, false);
  h.pointer("pointerout", card, h.detail);
  h.tick(170);
  assert.equal(h.detail.hidden, false);
  h.pointer("pointerleave", h.detail);
  h.tick(169);
  assert.equal(h.detail.hidden, false);
  h.pointer("pointerenter", h.detail);
  h.tick(1);
  assert.equal(h.detail.hidden, false);
  h.pointer("pointerleave", h.detail);
  h.tick(170);
  assert.equal(h.detail.hidden, true);
  h.controller.openDetail("one", { pinned: true });
  h.controller.openDetail("two");
  h.pointer("pointerleave", h.detail);
  h.tick(170);
  assert.ok(h.detail.querySelector('[data-entity-use-detail="one"]'));
  h.grid.dispatchEvent(new h.window.Event("scroll"));
  assert.equal(h.detail.hidden, false);
  const escape = new h.window.KeyboardEvent("keydown", { key: "Escape", cancelable: true });
  assert.equal(h.controller.handleGlobalKeyDown(escape), true);
  h.flushFrames();
  assert.equal(h.document.activeElement, card.querySelector("button"));
  assert.equal(h.detail.hidden, true, "returning focus does not reopen the dismissed detail");
  h.controller.openDetail("one");
  h.grid.dispatchEvent(new h.window.Event("scroll"));
  assert.equal(h.detail.hidden, true);
});

test("pending detail timers and stale detail actions cannot cross library, canvas or project scopes", (t) => {
  const h = createHarness(t);
  h.controller.openDetail("one", { delay: 130 });
  h.environment.context.eligible = false;
  h.controller.refreshDetail();
  h.environment.context.eligible = true;
  h.tick(130);
  assert.equal(h.detail.hidden, true);
  h.controller.openDetail("one", { delay: 130 });
  h.environment.scope = { ...h.environment.scope, canvasId: "canvas-two" };
  h.tick(130);
  assert.equal(h.detail.hidden, true);
  h.controller.openDetail("one");
  h.environment.context.space = "organization";
  h.click("[data-entity-use-add-canvas]", h.detail);
  assert.equal(h.calls.canvas.length, 0);
  assert.equal(h.detail.hidden, true);
  h.controller.openDetail("one");
  h.environment.scope.projectId = "project-two";
  h.controller.refresh();
  h.flushFrames();
  assert.equal(h.detail.hidden, true);
  h.controller.openDetail("one");
  h.click("[data-entity-use-add-canvas]", h.detail);
  assert.equal(h.calls.canvas.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.canvas[0])), {
    scope: { projectId: "project-two", canvasId: "canvas-two" }, entityId: "one", space: "organization",
  });
});

test("picker restores original background attributes and refocuses the newly rendered trigger", (t) => {
  const h = createHarness(t);
  h.background.inert = true;
  h.background.setAttribute("aria-hidden", "false");
  const trigger = h.document.querySelector("[data-node]");
  trigger.focus();
  h.controller.openPicker("node-one");
  h.flushFrames();
  assert.equal(h.background.inert, true);
  assert.equal(h.background.getAttribute("aria-hidden"), "true");
  assert.equal(h.document.activeElement, h.picker.querySelector("input"));
  h.document.querySelector("#nodes").innerHTML = '<button data-node="node-one">新的主体入口</button>';
  h.click('[data-entity-use-action="cancel-picker"]');
  h.flushFrames();
  assert.equal(h.document.activeElement, h.document.querySelector("[data-node]"));
  assert.equal(h.background.inert, true);
  assert.equal(h.background.getAttribute("aria-hidden"), "false");
  h.background.inert = false;
  h.background.removeAttribute("aria-hidden");
  h.controller.openPicker("node-one");
  h.click("[data-entity-use-picker-backdrop]");
  h.flushFrames();
  assert.equal(h.background.inert, false);
  assert.equal(h.background.hasAttribute("aria-hidden"), false);
  assert.equal(h.picker.hasAttribute("inert"), true);
});

test("picker retains cross-space selections and dispatches an immutable selection once", (t) => {
  const h = createHarness(t);
  h.controller.openPicker("node-one");
  h.click('[data-entity-use-toggle="one"]');
  h.click('[data-entity-use-space="organization"]');
  assert.equal(h.picker.querySelector('[data-entity-use-toggle="one"]').getAttribute("aria-pressed"), "true");
  h.click('[data-entity-use-toggle="two"]');
  h.controller.refresh({ renderPicker: true });
  const add = h.click('[data-entity-use-action="add-entities"]');
  add.dispatchEvent(new h.window.MouseEvent("click", { bubbles: true }));
  assert.equal(h.calls.submissions.length, 1);
  const submitted = h.calls.submissions[0];
  assert.deepEqual(JSON.parse(JSON.stringify(submitted)), {
    scope: { projectId: "project-one", canvasId: "canvas-one" }, nodeId: "node-one",
    selections: [{ entityId: "one", space: "personal" }, { entityId: "two", space: "organization" }],
  });
  assert.ok(Object.isFrozen(submitted) && Object.isFrozen(submitted.scope) && Object.isFrozen(submitted.selections) && Object.isFrozen(submitted.selections[0]));
  assert.equal(h.picker.hidden, true);
  h.controller.openPicker("node-one");
  assert.equal(h.picker.querySelector('[data-entity-use-toggle="one"]').getAttribute("aria-pressed"), "false");
  assert.equal(submitted.selections.length, 2);
});

test("search preserves committed Chinese text and caret without replacing the composing input", (t) => {
  const h = createHarness(t);
  h.controller.openPicker("node-one");
  h.flushFrames();
  const input = h.picker.querySelector("input");
  input.dispatchEvent(new h.window.CompositionEvent("compositionstart", { bubbles: true }));
  input.value = "雾森";
  input.setSelectionRange(1, 1);
  input.dispatchEvent(new h.window.InputEvent("input", { bubbles: true, isComposing: true }));
  h.controller.refresh({ renderPicker: true });
  h.flushFrames();
  assert.equal(h.picker.querySelector("input"), input);
  input.dispatchEvent(new h.window.CompositionEvent("compositionend", { bubbles: true, data: "雾森" }));
  h.flushFrames();
  const committed = h.picker.querySelector("input");
  assert.notEqual(committed, input);
  assert.equal(committed.value, "雾森");
  assert.equal(committed.selectionStart, 1);
  assert.equal(h.document.activeElement, committed);
  committed.setSelectionRange(0, 1);
  h.controller.refresh({ renderPicker: true });
  h.flushFrames();
  assert.equal(h.picker.querySelector("input").selectionStart, 0);
  assert.equal(h.picker.querySelector("input").selectionEnd, 1);
  h.click('[data-entity-use-action="clear-search"]');
  h.flushFrames();
  assert.equal(h.picker.querySelector("input").value, "");
  assert.equal(h.picker.querySelector("input").selectionStart, 0);
});

test("picker rejects stale targets at refresh and at confirm, even when another scope has the same node id", (t) => {
  const changes = [
    (env) => { env.scope.canvasId = "other-canvas"; },
    (env) => { env.scope.projectId = "other-project"; },
    (env) => { env.target = null; },
    (env) => { env.target.generating = true; },
    (env) => { env.target.promptOptimizing = true; },
    (env) => { env.target.supported = false; },
    (env) => { env.mutable = false; },
  ];
  for (const change of changes) {
    for (const shouldRefresh of [false, true]) {
      const h = createHarness(t);
      h.controller.openPicker("node-one");
      h.click('[data-entity-use-toggle="one"]');
      const add = h.picker.querySelector('[data-entity-use-action="add-entities"]');
      change(h.environment);
      if (shouldRefresh) h.controller.refresh();
      add.dispatchEvent(new h.window.MouseEvent("click", { bubbles: true }));
      h.flushFrames();
      assert.equal(h.calls.submissions.length, 0);
      assert.equal(h.picker.hidden, true);
      assert.equal(h.background.inert, false);
    }
  }
});

test("picker traps Tab, consumes canvas shortcuts and cancels stale focus callbacks on close or reopen", (t) => {
  const h = createHarness(t);
  h.controller.openPicker("node-one");
  h.flushFrames();
  const buttons = [...h.picker.querySelectorAll("button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex='-1'])")];
  const first = buttons[0];
  const last = buttons.at(-1);
  first.focus();
  assert.equal(h.key(first, "Tab", true).defaultPrevented, true);
  assert.equal(h.document.activeElement, last);
  assert.equal(h.key(last, "Tab").defaultPrevented, true);
  assert.equal(h.document.activeElement, first);
  assert.equal(h.controller.handleGlobalKeyDown(new h.window.KeyboardEvent("keydown", { key: "Delete" })), true);
  assert.equal(h.key(first, "Escape").defaultPrevented, true);
  assert.equal(h.picker.hidden, true);
  h.controller.openPicker("node-one");
  h.flushFrames();
  assert.equal(h.document.activeElement, h.picker.querySelector("input"));
  h.controller.closePicker({ restoreFocus: false });
  h.document.querySelector("[data-node]").focus();
  h.flushFrames();
  assert.equal(h.document.activeElement, h.document.querySelector("[data-node]"));
  assert.equal(h.controller.handleGlobalKeyDown(new h.window.KeyboardEvent("keydown", { key: "Delete" })), false);
});

test("disposal restores background, cancels timers and frames, and removes every owned listener", (t) => {
  const h = createHarness(t);
  h.controller.openDetail("one", { delay: 130 });
  h.controller.dispose();
  h.tick(200);
  assert.equal(h.detail.hidden, true);
  assert.equal(h.timers.size, 0);
  h.pointer("pointerover", h.grid.querySelector("article"));
  h.tick(200);
  assert.equal(h.detail.hidden, true);
  assert.equal(h.controller.openPicker("node-one"), false);
  const modal = createHarness(t);
  modal.controller.openPicker("node-one");
  modal.click('[data-entity-use-toggle="one"]');
  const add = modal.picker.querySelector('[data-entity-use-action="add-entities"]');
  modal.controller.dispose();
  modal.picker.append(add);
  add.dispatchEvent(new modal.window.MouseEvent("click", { bubbles: true }));
  modal.flushFrames();
  assert.equal(modal.calls.submissions.length, 0);
  assert.equal(modal.background.inert, false);
  assert.equal(modal.background.hasAttribute("aria-hidden"), false);
  assert.equal(modal.frames.size, 0);
  assert.equal(modal.picker.hidden, true);
});
