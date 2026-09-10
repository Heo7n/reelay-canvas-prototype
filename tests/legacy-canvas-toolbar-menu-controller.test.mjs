import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const [placementSource, controllerSource] = await Promise.all([
  "canvas-popover-placement.js", "canvas-toolbar-menu-controller.js",
].map((file) => readFile(new URL(`../src/legacy-canvas/${file}`, import.meta.url), "utf8")));

function fixture(t, kind = "group") {
  const dom = new JSDOM(`<div id="canvas"><div class="toolbar"><button aria-expanded="true">Open</button><div data-toolbar-popover="${kind}" popover="manual"><button>Action</button></div></div></div>`, { runScripts: "outside-only" });
  const view = dom.window;
  const surface = view.document.querySelector("#canvas");
  const menu = surface.querySelector("[data-toolbar-popover]");
  const trigger = surface.querySelector("[aria-expanded]");
  const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
  let anchor = rect(300, 100, 32, 32);
  let scope = {};
  let owner = {};
  let opened = false;
  let replacedTrigger = null;
  const lifecycle = { shows: 0, hides: 0, disconnects: 0 };
  const dismissals = [];
  const frames = new Map();
  let frameId = 0;
  view.requestAnimationFrame = (callback) => { frames.set(++frameId, callback); return frameId; };
  view.cancelAnimationFrame = (id) => frames.delete(id);
  view.ResizeObserver = class { observe() {} disconnect() { lifecycle.disconnects++; } };
  surface.getBoundingClientRect = () => rect(0, 0, 800, 600);
  trigger.getBoundingClientRect = () => anchor;
  menu.getBoundingClientRect = () => rect(0, 0, 190, 150);
  const matches = menu.matches.bind(menu);
  menu.matches = (selector) => selector === ":popover-open" ? opened : matches(selector);
  menu.showPopover = () => { opened = true; lifecycle.shows++; };
  menu.hidePopover = () => { opened = false; lifecycle.hides++; };
  view.eval(placementSource);
  view.eval(controllerSource);
  const controller = view.REELAY_CANVAS_TOOLBAR_MENU_CONTROLLER.create({
    root: surface,
    getScope: () => scope,
    getOwner: () => owner,
    placeAnchoredPopover: view.REELAY_CANVAS_POPOVER_PLACEMENT.placeAnchoredPopover,
    onDismiss: (event) => {
      dismissals.push(event);
      trigger.setAttribute("aria-expanded", "false");
      menu.classList.add("hidden");
      return replacedTrigger;
    },
  });
  t.after(() => { controller.dispose(); dom.window.close(); });
  function flush() {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback());
  }
  return { view, surface, trigger, menu, lifecycle, controller, frames, flush, rect, dismissals,
    move: (value) => { anchor = value; }, opened: () => opened,
    replaceScope: () => { scope = {}; }, replaceOwner: () => { owner = {}; },
    replacement: (button) => { replacedTrigger = button; },
  };
}

for (const kind of ["group", "media", "selection"]) {
  test(`${kind} menus use the top layer while retaining delegated events and focused DOM`, (t) => {
    const f = fixture(t, kind);
    const parent = f.menu.parentElement;
    let clicks = 0;
    parent.addEventListener("click", () => clicks++);
    f.controller.sync();
    assert.equal(f.opened(), true);
    assert.equal(f.menu.parentElement, parent);
    const item = f.menu.querySelector("button");
    item.focus();
    item.click();
    assert.equal(clicks, 1);
    f.move(f.rect(380, 160, 32, 32));
    f.controller.sync();
    f.controller.sync();
    assert.equal(f.frames.size, 1, "projection changes share one scheduled frame");
    f.flush();
    assert.equal(f.frames.size, 0, "a stationary toolbar starts no permanent frame loop");
    assert.equal(f.lifecycle.shows, 1);
    assert.equal(f.lifecycle.hides, 0);
    assert.equal(f.view.document.activeElement, item);
    assert.equal(f.menu.style.left, "222px");
    assert.equal(f.menu.style.top, "200px");
  });
}

test("toolbar menu placement flips at viewport edges and closes when its anchor leaves the canvas", (t) => {
  const f = fixture(t);
  f.view.innerWidth = 800;
  f.view.innerHeight = 600;
  f.move(f.rect(20, 540, 32, 32));
  f.controller.sync();
  assert.equal(f.menu.style.left, "20px");
  assert.equal(f.menu.style.top, "382px");
  const outside = f.view.document.createElement("button");
  f.view.document.body.append(outside);
  outside.focus();
  f.move(f.rect(20, 620, 32, 32));
  f.view.dispatchEvent(new f.view.Event("resize"));
  f.flush();
  assert.equal(f.opened(), false);
  assert.equal(f.dismissals[0].reason, "offscreen");
  assert.equal(f.view.document.activeElement, outside, "offscreen dismissal never steals focus");
  f.view.dispatchEvent(new f.view.Event("resize"));
  assert.equal(f.frames.size, 0);
});

test("Escape closes one current popup and returns focus to the rendered replacement trigger", (t) => {
  const f = fixture(t);
  const replacement = f.view.document.createElement("button");
  f.surface.append(replacement);
  f.replacement(replacement);
  f.controller.sync();
  const item = f.menu.querySelector("button");
  item.focus();
  const event = new f.view.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  item.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(f.dismissals.length, 1);
  assert.equal(f.dismissals[0].reason, "escape");
  assert.equal(f.view.document.activeElement, replacement);
  assert.equal(f.opened(), false);
  replacement.dispatchEvent(new f.view.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(f.dismissals.length, 1);
});

test("old projection callbacks cannot dismiss replacement canvas or owner state", (t) => {
  const f = fixture(t);
  for (const replace of [f.replaceScope, f.replaceOwner]) {
    f.controller.sync();
    f.controller.sync();
    replace();
    f.flush();
    assert.equal(f.opened(), false);
    assert.equal(f.dismissals.length, 0);
    assert.equal(f.frames.size, 0);
  }
});

test("model-close and detached menus release observers, listeners and queued placement work", (t) => {
  const f = fixture(t);
  f.controller.sync();
  f.controller.sync();
  const staleCallback = [...f.frames.values()][0];
  f.trigger.setAttribute("aria-expanded", "false");
  f.controller.sync();
  staleCallback();
  assert.equal(f.opened(), false);
  assert.equal(f.dismissals.length, 0);
  assert.equal(f.frames.size, 0);
  assert.equal(f.lifecycle.disconnects, 1);
  f.trigger.setAttribute("aria-expanded", "true");
  f.controller.sync();
  f.menu.remove();
  f.controller.sync();
  f.view.dispatchEvent(new f.view.Event("resize"));
  assert.equal(f.frames.size, 0);
  assert.equal(f.lifecycle.disconnects, 2);
});
