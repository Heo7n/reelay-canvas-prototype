import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const source = await readFile(new URL("../src/legacy-canvas/canvas-asset-space-switcher.js", import.meta.url), "utf8");

function createClock() {
  let now = 0;
  let sequence = 0;
  const pending = new Map();
  return {
    schedule(callback, delay = 0) {
      const id = ++sequence;
      pending.set(id, { callback, at: now + delay });
      return id;
    },
    cancel(id) { pending.delete(id); },
    advance(duration) {
      const end = now + duration;
      for (;;) {
        const next = [...pending.entries()]
          .filter(([, item]) => item.at <= end)
          .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!next) break;
        const [id, item] = next;
        pending.delete(id);
        now = item.at;
        item.callback();
      }
      now = end;
    },
    get pendingCount() { return pending.size; },
  };
}

function setup(t, selected = "personal") {
  const dom = new JSDOM(`
    <button id="outside">其他操作</button>
    <div id="switcher">
      <button id="trigger" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="menu">个人空间</button>
      <div id="menu" role="menu" class="hidden">
        <button type="button" role="menuitemradio" data-library-space="personal" aria-checked="false"><span>个人空间</span></button>
        <button type="button" role="menuitemradio" data-library-space="organization" aria-checked="false"><span>组织空间</span></button>
        <button type="button" role="menuitemradio" data-library-space="platform" aria-checked="false"><span>平台空间</span></button>
      </div>
    </div>
  `, { runScripts: "outside-only" });
  const { window } = dom;
  const { document } = window;
  window.eval(source);
  const root = document.querySelector("#switcher");
  const trigger = document.querySelector("#trigger");
  const menu = document.querySelector("#menu");
  const outside = document.querySelector("#outside");
  const items = [...menu.querySelectorAll("[data-library-space]")];
  items.forEach((item) => item.setAttribute("aria-checked", String(item.dataset.librarySpace === selected)));
  const selections = [];
  const clock = createClock();
  let allowed = true;
  const controller = window.REELAY_ASSET_SPACE_SWITCHER.createController({
    root,
    trigger,
    menu,
    onSelect(space) {
      selections.push(space);
      items.forEach((item) => item.setAttribute("aria-checked", String(item.dataset.librarySpace === space)));
    },
    canOpen: () => allowed,
    schedule: clock.schedule,
    cancel: clock.cancel,
  });
  t.after(() => { controller.destroy(); window.close(); });

  function pointer(element, type, { pointerType = "mouse", relatedTarget = null } = {}) {
    const event = new window.MouseEvent(type, {
      bubbles: ["pointerdown", "pointerup", "pointermove"].includes(type),
      cancelable: true,
      relatedTarget,
    });
    Object.defineProperty(event, "pointerType", { value: pointerType });
    element.dispatchEvent(event);
    return event;
  }
  function enter(pointerType = "mouse") {
    pointer(root, "pointerenter", { pointerType, relatedTarget: outside });
    pointer(trigger, "pointerenter", { pointerType, relatedTarget: outside });
  }
  function leave(pointerType = "mouse") {
    pointer(trigger, "pointerleave", { pointerType, relatedTarget: outside });
    pointer(root, "pointerleave", { pointerType, relatedTarget: outside });
  }
  function click(element, { keyboard = false } = {}) {
    if (!keyboard) {
      const event = pointer(element, "pointerdown");
      if (!event.defaultPrevented) (element.closest("button") || element).focus();
      pointer(element, "pointerup");
    }
    element.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, detail: keyboard ? 0 : 1 }));
  }
  function key(element, value, options = {}) {
    const event = new window.KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true, ...options });
    element.dispatchEvent(event);
    return event;
  }
  function assertOpen(expected) {
    assert.equal(trigger.getAttribute("aria-expanded"), String(expected));
    assert.equal(menu.classList.contains("hidden"), !expected);
  }
  outside.focus();
  return {
    window, document, root, trigger, menu, outside, items, selections, clock, controller,
    pointer, enter, leave, click, key, assertOpen,
    setAllowed(value) { allowed = value; },
  };
}

test("returning beneath a stationary pointer waits for movement before hover preview", (t) => {
  const h = setup(t);
  h.controller.suspendHover();
  h.enter();
  h.clock.advance(500);
  h.assertOpen(false);
  h.pointer(h.trigger, "pointermove");
  h.clock.advance(140);
  h.assertOpen(true);
});

test("hover suspension keeps explicit clicks available", (t) => {
  const h = setup(t);
  h.controller.suspendHover();
  h.click(h.trigger);
  h.assertOpen(true);
});

test("a deliberate mouse pause previews spaces without moving focus or selecting a space", (t) => {
  const h = setup(t);
  h.enter();
  h.clock.advance(139);
  h.assertOpen(false);
  h.clock.advance(1);
  h.assertOpen(true);
  assert.equal(h.document.activeElement, h.outside);
  assert.deepEqual(h.selections, []);
});

test("passing over the trigger cancels the preview rather than flashing it later", (t) => {
  const h = setup(t);
  h.enter();
  h.clock.advance(100);
  h.leave();
  h.clock.advance(1000);
  h.assertOpen(false);
  assert.equal(h.clock.pendingCount, 0);
});

test("moving into the menu preserves the preview and returning during the exit delay cancels closing", (t) => {
  const h = setup(t);
  h.enter();
  h.clock.advance(140);
  h.pointer(h.trigger, "pointerleave", { relatedTarget: h.menu });
  h.pointer(h.menu, "pointerenter", { relatedTarget: h.trigger });
  h.clock.advance(500);
  h.assertOpen(true);
  h.pointer(h.menu, "pointerleave", { relatedTarget: h.outside });
  h.pointer(h.root, "pointerleave", { relatedTarget: h.outside });
  h.clock.advance(179);
  h.assertOpen(true);
  h.enter();
  h.clock.advance(500);
  h.assertOpen(true);
  h.leave();
  h.clock.advance(180);
  h.assertOpen(false);
});

test("the first click after a hover preview keeps the menu open, while another click closes it", (t) => {
  const h = setup(t);
  h.enter();
  h.clock.advance(140);
  h.click(h.trigger);
  h.assertOpen(true);
  h.leave();
  h.clock.advance(500);
  h.assertOpen(true);
  h.click(h.trigger);
  h.assertOpen(false);
  h.clock.advance(500);
  h.assertOpen(false);
});

test("clicking before the hover delay opens immediately and cancels the pending preview", (t) => {
  const h = setup(t);
  h.enter();
  h.clock.advance(80);
  h.click(h.trigger);
  h.assertOpen(true);
  h.click(h.trigger);
  h.assertOpen(false);
  h.clock.advance(500);
  h.assertOpen(false);
  assert.equal(h.clock.pendingCount, 0);
});

test("touch entry does not preview spaces but touching the trigger still opens the menu", (t) => {
  const h = setup(t);
  h.enter("touch");
  h.clock.advance(500);
  h.assertOpen(false);
  h.pointer(h.trigger, "pointerdown", { pointerType: "touch" });
  h.trigger.focus();
  h.trigger.dispatchEvent(new h.window.MouseEvent("click", { bubbles: true, detail: 1 }));
  h.assertOpen(true);
});

test("a panel that is no longer available cannot open from a pending preview or a new click", (t) => {
  const h = setup(t);
  h.enter();
  h.clock.advance(100);
  h.setAllowed(false);
  h.clock.advance(500);
  h.assertOpen(false);
  h.click(h.trigger);
  h.assertOpen(false);
  h.key(h.trigger, "ArrowDown");
  h.assertOpen(false);
  assert.deepEqual(h.selections, []);
});

test("choosing a visible option changes space once and closes the menu", (t) => {
  const h = setup(t);
  h.enter();
  h.clock.advance(140);
  h.click(h.items[1].querySelector("span"));
  assert.deepEqual(h.selections, ["organization"]);
  h.assertOpen(false);
  h.clock.advance(500);
  h.assertOpen(false);
});

test("keyboard opening begins at the current space and arrows wrap without selecting", (t) => {
  const h = setup(t, "organization");
  h.trigger.focus();
  const open = h.key(h.trigger, "ArrowDown");
  assert.equal(open.defaultPrevented, true);
  h.assertOpen(true);
  assert.equal(h.document.activeElement, h.items[1]);
  h.key(h.items[1], "ArrowDown");
  assert.equal(h.document.activeElement, h.items[2]);
  h.key(h.items[2], "ArrowDown");
  assert.equal(h.document.activeElement, h.items[0]);
  h.key(h.items[0], "ArrowUp");
  assert.equal(h.document.activeElement, h.items[2]);
  h.key(h.items[2], "Home");
  assert.equal(h.document.activeElement, h.items[0]);
  h.key(h.items[0], "End");
  assert.equal(h.document.activeElement, h.items[2]);
  assert.deepEqual(h.selections, []);
});

test("keyboard opening falls back to the first or last option when none is selected", (t) => {
  const h = setup(t, null);
  h.trigger.focus();
  h.key(h.trigger, "ArrowDown");
  assert.equal(h.document.activeElement, h.items[0]);
  h.controller.close();
  h.trigger.focus();
  h.key(h.trigger, "ArrowUp");
  assert.equal(h.document.activeElement, h.items[2]);
});

test("a native keyboard button activation selects once and returns focus to the trigger", (t) => {
  const h = setup(t);
  h.trigger.focus();
  h.key(h.trigger, "ArrowDown");
  h.key(h.items[0], "End");
  h.click(h.items[2], { keyboard: true });
  assert.deepEqual(h.selections, ["platform"]);
  h.assertOpen(false);
  assert.equal(h.document.activeElement, h.trigger);
});

test("Escape closes only the switcher, restores trigger focus, and does not escape into the canvas", (t) => {
  const h = setup(t);
  let escapedIntoCanvas = 0;
  h.document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") escapedIntoCanvas += 1;
  });
  h.trigger.focus();
  h.key(h.trigger, "ArrowDown");
  const event = h.key(h.items[0], "Escape");
  assert.equal(event.defaultPrevented, true);
  assert.equal(escapedIntoCanvas, 0);
  h.assertOpen(false);
  assert.equal(h.document.activeElement, h.trigger);
  h.key(h.trigger, "Escape");
  assert.equal(escapedIntoCanvas, 1, "Escape after closure belongs to the containing interface");
});

test("Escape dismisses a hover preview from outside the switcher without moving the user's focus", (t) => {
  const h = setup(t);
  let escapedIntoCanvas = 0;
  h.document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") escapedIntoCanvas += 1;
  });
  h.enter();
  h.clock.advance(140);
  h.assertOpen(true);
  assert.equal(h.document.activeElement, h.outside);

  const event = h.key(h.outside, "Escape");
  assert.equal(event.defaultPrevented, true);
  assert.equal(escapedIntoCanvas, 0);
  h.assertOpen(false);
  assert.equal(h.document.activeElement, h.outside);
  h.clock.advance(500);
  h.assertOpen(false);
  h.key(h.outside, "Escape");
  assert.equal(escapedIntoCanvas, 1, "once the preview is dismissed, Escape belongs to the canvas again");
});

test("Tab and focus leaving close the menu without taking focus back from the next control", (t) => {
  const h = setup(t);
  h.trigger.focus();
  h.key(h.trigger, "ArrowDown");
  const tab = h.key(h.items[0], "Tab");
  assert.equal(tab.defaultPrevented, false);
  h.outside.focus();
  h.clock.advance(500);
  h.assertOpen(false);
  assert.equal(h.document.activeElement, h.outside);

  h.click(h.trigger);
  h.outside.focus();
  h.clock.advance(500);
  h.assertOpen(false);
  assert.equal(h.document.activeElement, h.outside);
});

test("clicking outside closes a hover preview without intercepting the other control", (t) => {
  const h = setup(t);
  h.enter();
  h.clock.advance(140);
  let outsideClicks = 0;
  h.outside.addEventListener("click", () => { outsideClicks += 1; });
  h.click(h.outside);
  h.assertOpen(false);
  assert.equal(outsideClicks, 1);
  assert.equal(h.document.activeElement, h.outside);
});

test("close cancels pending opening and closing timers without stealing focus", (t) => {
  const h = setup(t);
  h.enter();
  h.clock.advance(100);
  h.controller.close();
  assert.equal(h.clock.pendingCount, 0);
  h.clock.advance(500);
  h.assertOpen(false);
  assert.equal(h.document.activeElement, h.outside);
  h.enter();
  h.clock.advance(140);
  h.leave();
  h.controller.close();
  assert.equal(h.clock.pendingCount, 0);
  h.clock.advance(500);
  h.assertOpen(false);
});

test("destroy clears timers and detaches input listeners so disposed controls cannot reopen or select", (t) => {
  const h = setup(t);
  h.enter();
  h.clock.advance(100);
  h.controller.destroy();
  assert.equal(h.clock.pendingCount, 0);
  h.clock.advance(500);
  h.enter();
  h.click(h.trigger);
  h.key(h.trigger, "ArrowDown");
  h.click(h.items[1]);
  h.clock.advance(500);
  h.assertOpen(false);
  assert.deepEqual(h.selections, []);
});
