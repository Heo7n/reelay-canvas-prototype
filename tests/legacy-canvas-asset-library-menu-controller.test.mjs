import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const [placementSource, controllerSource] = await Promise.all([
  "canvas-popover-placement.js", "canvas-asset-library-menu-controller.js",
].map((file) => readFile(new URL(`../src/legacy-canvas/${file}`, import.meta.url), "utf8")));

function fixture() {
  const dom = new JSDOM('<div id="grid"><article><button data-library-menu-toggle="asset">More</button><div class="asset-library-item-menu" popover="manual"><button>Rename</button></div></article></div>', { runScripts: "outside-only" });
  const view = dom.window;
  const grid = view.document.querySelector("#grid");
  const menu = grid.querySelector(".asset-library-item-menu");
  const trigger = grid.querySelector("[data-library-menu-toggle]");
  const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
  let anchor = rect(380, 180, 24, 24);
  let opened = false;
  const lifecycle = { shows: 0, hides: 0 };
  let dismissals = 0;
  const frames = new Map();
  let frameId = 0;
  view.requestAnimationFrame = (callback) => { frames.set(++frameId, callback); return frameId; };
  view.cancelAnimationFrame = (id) => frames.delete(id);
  view.ResizeObserver = class { observe() {} disconnect() {} };
  grid.getBoundingClientRect = () => rect(20, 100, 400, 500);
  trigger.getBoundingClientRect = () => anchor;
  menu.getBoundingClientRect = () => rect(0, 0, 194, 200);
  menu.showPopover = () => { opened = true; lifecycle.shows++; };
  menu.hidePopover = () => { opened = false; lifecycle.hides++; };
  menu.matches = () => opened;
  view.eval(placementSource);
  view.eval(controllerSource);
  const controller = view.REELAY_CANVAS_ASSET_LIBRARY_MENU_CONTROLLER.create({
    grid,
    placeAnchoredPopover: view.REELAY_CANVAS_POPOVER_PLACEMENT.placeAnchoredPopover,
    onDismiss: () => { dismissals++; },
  });
  function flush() {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback());
  }
  return { view, grid, menu, lifecycle, controller, frames, flush, move: (value) => { anchor = value; }, rect, opened: () => opened, dismissals: () => dismissals, close: () => { controller.dispose(); dom.window.close(); } };
}

test("retained menus reposition without reopening or disturbing keyboard focus", () => {
  const f = fixture();
  try {
    f.controller.sync();
    const item = f.menu.querySelector("button");
    item.focus();
    f.move(f.rect(380, 160, 24, 24));
    f.controller.sync();
    f.controller.sync();
    assert.equal(f.frames.size, 1);
    f.flush();
    assert.deepEqual(f.lifecycle, { shows: 1, hides: 0 });
    assert.equal(f.view.document.activeElement, item);
    assert.equal(f.menu.style.top, "160px");
    f.menu.remove();
    f.controller.sync();
    assert.deepEqual(f.lifecycle, { shows: 1, hides: 1 });
    f.view.dispatchEvent(new f.view.Event("resize"));
    assert.equal(f.frames.size, 0);
  } finally { f.close(); }
});

test("item menus can extend past the library edge and only flip at the viewport edge", () => {
  const f = fixture();
  try {
    f.controller.sync();
    assert.equal(f.opened(), true);
    assert.equal(f.menu.style.left, "410px");
    assert.equal(f.menu.style.top, "180px");
    assert.ok(Number.parseFloat(f.menu.style.left) + 194 > f.grid.getBoundingClientRect().right);
    f.view.innerWidth = 500;
    f.view.dispatchEvent(new f.view.Event("resize"));
    f.flush();
    assert.equal(f.menu.style.left, "180px");
  } finally { f.close(); }
});

test("menus follow scrolling anchors, dismiss when the trigger leaves the list, and release listeners", () => {
  const f = fixture();
  try {
    f.controller.sync();
    f.move(f.rect(380, 140, 24, 24));
    f.grid.dispatchEvent(new f.view.Event("scroll"));
    f.flush();
    assert.equal(f.menu.style.top, "140px");
    f.move(f.rect(380, 40, 24, 24));
    f.grid.dispatchEvent(new f.view.Event("scroll"));
    f.flush();
    assert.equal(f.opened(), false);
    assert.equal(f.dismissals(), 1);
    f.view.dispatchEvent(new f.view.Event("resize"));
    assert.equal(f.frames.size, 0);
    f.move(f.rect(380, 180, 24, 24));
    f.controller.sync();
    f.view.dispatchEvent(new f.view.Event("resize"));
    f.controller.dispose();
    f.flush();
    assert.equal(f.opened(), false);
    assert.equal(f.frames.size, 0);
  } finally { f.close(); }
});
