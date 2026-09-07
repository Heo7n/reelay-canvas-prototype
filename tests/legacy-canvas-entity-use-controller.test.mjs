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
    avoidRects: [{ left: 800, top: 0, width: 200, height: 800 }],
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
    getAvoidRects: () => environment.avoidRects,
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

function capturePickerShell(picker) {
  return [
    "[data-entity-use-picker-backdrop]", "[data-entity-use-picker]", "header",
    '[data-entity-use-space="personal"]', '[data-entity-use-space="organization"]',
    "[data-entity-use-search]", "[data-entity-use-picker-results]", "footer",
    "[data-entity-use-picker-cancel]", "[data-entity-use-picker-add]",
  ].map((selector) => {
    const element = picker.querySelector(selector);
    assert.ok(element, `Missing stable picker element: ${selector}`);
    return { selector, element };
  });
}

function assertPickerShellUnchanged(picker, shell) {
  for (const { selector, element } of shell) {
    assert.equal(picker.querySelector(selector), element, `${selector} must survive an in-place picker update`);
    assert.equal(element.isConnected, true);
  }
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

test("detail centers using its rendered dimensions and remeasures when content changes", (t) => {
  const h = createHarness(t);
  h.environment.avoidRects = [];
  h.window.innerWidth = 1440;
  h.window.innerHeight = 900;
  const card = h.grid.querySelector('[data-library-entity="one"]');
  card.getBoundingClientRect = () => ({ left: 380, top: 300, width: 164, height: 164 });
  let measuredHeight = 386;
  let heightReads = 0;
  Object.defineProperties(h.window.HTMLElement.prototype, {
    offsetWidth: {
      configurable: true,
      get() { return this.matches(".entity-use-detail") ? 318 : 0; },
    },
    offsetHeight: {
      configurable: true,
      get() {
        if (!this.matches(".entity-use-detail")) return 0;
        heightReads += 1;
        assert.equal(h.detail.hidden, false, "the panel must participate in layout before measurement");
        assert.ok(h.calls.iconRefreshes > 0, "measure the final icon-rendered content");
        assert.equal(h.detail.style.getPropertyValue("--entity-use-detail-width"), "340px");
        return measuredHeight;
      },
    },
  });

  h.controller.openDetail("one");
  assert.ok(heightReads > 0);
  assert.equal(h.detail.style.getPropertyValue("--entity-use-detail-top"), "189px");
  assert.equal(h.detail.style.getPropertyValue("--entity-use-detail-left"), "554px");
  assert.equal(h.detail.style.getPropertyValue("--entity-use-detail-width"), "318px");
  let panel = h.detail.querySelector(".entity-use-detail");
  assert.equal(panel.style.getPropertyValue("--entity-use-detail-top"), "", "placement has no stale child override");
  assert.equal(panel.dataset.placement, "right");

  measuredHeight = 432;
  h.entities[0].description = "内容变长后，定位应重新使用整个面板的实际高度。";
  h.controller.refreshDetail();
  h.flushFrames();
  assert.ok(heightReads >= 2);
  assert.equal(h.detail.style.getPropertyValue("--entity-use-detail-top"), "166px");
  panel = h.detail.querySelector(".entity-use-detail");
  assert.equal(panel.style.getPropertyValue("--entity-use-detail-top"), "");
});

test("list detail recenters on resize and remains inside a short viewport", (t) => {
  const h = createHarness(t);
  h.environment.avoidRects = [];
  h.window.innerWidth = 1200;
  h.window.innerHeight = 900;
  const card = h.grid.querySelector('[data-library-entity="one"]');
  let rowTop = 400;
  card.getBoundingClientRect = () => ({ left: 20, top: rowTop, width: 524, height: 48 });
  Object.defineProperties(h.window.HTMLElement.prototype, {
    offsetWidth: {
      configurable: true,
      get() { return this.matches(".entity-use-detail") ? 340 : 0; },
    },
    offsetHeight: {
      configurable: true,
      get() {
        return this.matches(".entity-use-detail")
          ? Math.min(386, Number.parseFloat(h.detail.style.getPropertyValue("--entity-use-detail-max-height")))
          : 0;
      },
    },
  });

  h.controller.openDetail("one");
  assert.equal(h.detail.style.getPropertyValue("--entity-use-detail-top"), "231px");

  h.window.innerHeight = 720;
  rowTop = 640;
  h.window.dispatchEvent(new h.window.Event("resize"));
  h.flushFrames();
  assert.equal(h.detail.style.getPropertyValue("--entity-use-detail-top"), "322px");
  assert.equal(h.detail.style.getPropertyValue("--entity-use-detail-max-height"), "386px");

  h.window.innerHeight = 160;
  rowTop = 80;
  h.window.dispatchEvent(new h.window.Event("resize"));
  h.flushFrames();
  assert.equal(h.detail.style.getPropertyValue("--entity-use-detail-top"), "12px");
  assert.equal(h.detail.style.getPropertyValue("--entity-use-detail-max-height"), "136px");
  assert.equal(h.detail.querySelector(".entity-use-detail").offsetHeight, 136);
  assert.ok(h.detail.querySelector("[data-entity-use-add-canvas]"));
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

test("switching picker spaces retains the dialog shell, search and focused space control", (t) => {
  const h = createHarness(t);
  h.entities[1].description = "雾森外景";
  h.controller.openPicker("node-one");
  h.flushFrames();
  const shell = capturePickerShell(h.picker);
  const input = h.picker.querySelector("[data-entity-use-search]");
  input.value = "雾森";
  input.setSelectionRange(1, 1);
  input.dispatchEvent(new h.window.InputEvent("input", { bubbles: true }));
  h.flushFrames();
  assertPickerShellUnchanged(h.picker, shell);
  const results = h.picker.querySelector("[data-entity-use-picker-results]");
  const sharedCard = h.picker.querySelector('[data-entity-use-picker-card="one"]');
  const sharedImage = sharedCard.querySelector("img");
  assert.ok(sharedImage);

  for (const space of ["organization", "personal", "organization", "personal"]) {
    const selector = `[data-entity-use-space="${space}"]`;
    const spaceButton = h.picker.querySelector(selector);
    results.scrollTop = 220;
    spaceButton.focus();
    h.click(selector);
    h.flushFrames();
    assertPickerShellUnchanged(h.picker, shell);
    assert.equal(h.document.activeElement, spaceButton, "switching must not send focus back to search");
    assert.equal(spaceButton.getAttribute("aria-pressed"), "true");
    assert.equal(results.getAttribute("aria-labelledby"), `entity-use-space-${space}`);
    assert.equal(results.scrollTop, 0, "new space results start at the top");
    assert.equal(input.value, "雾森");
    assert.equal(input.selectionStart, 1);
    assert.equal(h.picker.querySelectorAll("[data-entity-use-picker-card]").length, space === "organization" ? 2 : 1);
    assert.equal(h.picker.querySelector('[data-entity-use-picker-card="one"]'), sharedCard);
    assert.equal(sharedCard.querySelector("img"), sharedImage, "an unchanged cover must not reload across spaces");
  }
});

test("clicking the active picker space is a no-op and keeps the current reading position", (t) => {
  const h = createHarness(t);
  h.controller.openPicker("node-one");
  h.flushFrames();
  const results = h.picker.querySelector("[data-entity-use-picker-results]");
  const activeSpace = h.picker.querySelector('[data-entity-use-space="personal"]');
  results.scrollTop = 180;
  activeSpace.focus();
  const observer = new h.window.MutationObserver(() => undefined);
  observer.observe(h.picker, { subtree: true, childList: true, attributes: true, characterData: true });
  const iconRefreshes = h.calls.iconRefreshes;
  h.click('[data-entity-use-space="personal"]');
  h.flushFrames();
  assert.equal(results.scrollTop, 180);
  assert.equal(h.document.activeElement, activeSpace);
  assert.equal(h.calls.iconRefreshes, iconRefreshes);
  assert.equal(observer.takeRecords().length, 0, "an already-active space must not trigger a render");
  observer.disconnect();
});

test("selecting picker cards updates selection without replacing covers, focus or scroll position", (t) => {
  const h = createHarness(t);
  h.controller.openPicker("node-one");
  h.flushFrames();
  const shell = capturePickerShell(h.picker);
  const results = h.picker.querySelector("[data-entity-use-picker-results]");
  const card = h.picker.querySelector('[data-entity-use-picker-card="one"]');
  const button = card.querySelector("button");
  const image = card.querySelector("img");
  const add = h.picker.querySelector("[data-entity-use-picker-add]");
  assert.ok(image);
  results.scrollTop = 190;
  button.focus();

  for (const selected of [true, false, true]) {
    h.click('[data-entity-use-toggle="one"]');
    h.flushFrames();
    assertPickerShellUnchanged(h.picker, shell);
    assert.equal(h.picker.querySelector('[data-entity-use-picker-card="one"]'), card);
    assert.equal(card.querySelector("button"), button);
    assert.equal(card.querySelector("img"), image);
    assert.equal(h.document.activeElement, button);
    assert.equal(results.scrollTop, 190);
    assert.equal(button.getAttribute("aria-pressed"), String(selected));
    assert.equal(card.dataset.selected, String(selected));
    assert.equal(card.classList.contains("is-selected"), selected);
    assert.equal(h.picker.querySelector("[data-entity-use-picker-count]").textContent, `已选 ${selected ? 1 : 0} 个`);
    assert.equal(add.disabled, !selected);
  }
});

test("external picker refresh updates entity text while keeping live controls and unchanged media", (t) => {
  const h = createHarness(t);
  h.controller.openPicker("node-one");
  h.flushFrames();
  const shell = capturePickerShell(h.picker);
  const results = h.picker.querySelector("[data-entity-use-picker-results]");
  const card = h.picker.querySelector('[data-entity-use-picker-card="one"]');
  const button = card.querySelector("button");
  const image = card.querySelector("img");
  const activeSpace = h.picker.querySelector('[data-entity-use-space="personal"]');
  results.scrollTop = 165;
  activeSpace.focus();
  h.entities[0].name = "雾森角色 · 已更新";
  h.controller.refresh({ renderPicker: true });
  h.flushFrames();
  assertPickerShellUnchanged(h.picker, shell);
  assert.equal(h.picker.querySelector('[data-entity-use-picker-card="one"]'), card);
  assert.equal(card.querySelector("button"), button);
  assert.equal(card.querySelector("img"), image);
  assert.equal(button.getAttribute("aria-label"), "选择 雾森角色 · 已更新");
  assert.equal(card.querySelector("strong").textContent, "雾森角色 · 已更新");
  assert.equal(h.document.activeElement, activeSpace);
  assert.equal(results.scrollTop, 165);
});

test("search preserves committed Chinese text and caret without replacing the composing input", (t) => {
  const h = createHarness(t);
  h.controller.openPicker("node-one");
  h.flushFrames();
  const shell = capturePickerShell(h.picker);
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
  assert.equal(committed, input, "committing an IME composition preserves the live input");
  assertPickerShellUnchanged(h.picker, shell);
  assert.equal(committed.value, "雾森");
  assert.equal(committed.selectionStart, 1);
  assert.equal(h.document.activeElement, committed);
  committed.setSelectionRange(0, 1);
  h.controller.refresh({ renderPicker: true });
  h.flushFrames();
  assertPickerShellUnchanged(h.picker, shell);
  assert.equal(h.picker.querySelector("input").selectionStart, 0);
  assert.equal(h.picker.querySelector("input").selectionEnd, 1);
  h.click('[data-entity-use-action="clear-search"]');
  h.flushFrames();
  assertPickerShellUnchanged(h.picker, shell);
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
