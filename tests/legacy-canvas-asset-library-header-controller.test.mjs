import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const source = await readFile(new URL("../src/legacy-canvas/canvas-asset-library-header-controller.js", import.meta.url), "utf8");

function fixture(t) {
  const dom = new JSDOM(`<div id="panel">
    <div id="spaces"><button data-library-space="personal">个人</button><button data-library-space="organization">组织</button><button data-library-space="platform">平台</button></div>
    <button id="toggle">搜索</button><div id="search"><input id="input"><button id="close">关闭</button></div>
    <div id="commands"><button id="upload">上传</button></div>
  </div><button id="outside">画布</button>`, { runScripts: "outside-only" });
  const { window } = dom;
  const { document } = window;
  window.eval(source);
  const elements = Object.fromEntries(["panel", "spaces", "toggle", "search", "input", "close", "commands", "outside"].map((id) => [id, document.getElementById(id)]));
  const queries = [];
  const spaces = [];
  const state = { space: "personal", query: "", visible: true };
  const controller = window.REELAY_CANVAS_ASSET_LIBRARY_HEADER_CONTROLLER.create({
    panel: elements.panel, spaceTabs: elements.spaces, searchRegion: elements.search,
    searchInput: elements.input, searchToggle: elements.toggle, searchClose: elements.close, commands: elements.commands,
    onSpaceChange(space) { spaces.push(space); state.space = space; state.query = ""; controller.sync(state); },
    onQueryChange(query) { queries.push(query); state.query = query; controller.sync(state); },
  });
  controller.sync(state);
  t.after(() => { controller.destroy(); window.close(); });
  return {
    ...elements, window, document, controller, queries, spaces, state,
    tabs: [...elements.spaces.querySelectorAll("button")],
    key(element, key, options = {}) {
      const event = new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options });
      element.dispatchEvent(event);
      return event;
    },
    type(query) { elements.input.value = query; elements.input.dispatchEvent(new window.Event("input", { bubbles: true })); },
  };
}

test("space tabs use automatic activation, arrow wrapping and Home/End with one tab stop", (t) => {
  const f = fixture(t);
  assert.equal(f.tabs[0].parentElement.getAttribute("role"), "tablist");
  assert.deepEqual(f.tabs.map((tab) => tab.tabIndex), [0, -1, -1]);
  f.tabs[0].focus();
  f.key(f.tabs[0], "ArrowLeft");
  assert.equal(f.document.activeElement, f.tabs[2]);
  assert.deepEqual(f.tabs.map((tab) => tab.getAttribute("aria-selected")), ["false", "false", "true"]);
  f.key(f.tabs[2], "ArrowRight");
  f.key(f.tabs[0], "End");
  f.key(f.tabs[2], "Home");
  f.tabs[1].click();
  assert.deepEqual(f.spaces, ["platform", "personal", "platform", "personal", "organization"]);
  assert.deepEqual(f.tabs.map((tab) => tab.tabIndex), [-1, 0, -1]);
});

test("search overlays commands accessibly and Escape clears once before restoring focus", (t) => {
  const f = fixture(t);
  assert.equal(f.search.inert, true);
  assert.equal(f.search.getAttribute("aria-hidden"), "true");
  f.toggle.click();
  assert.equal(f.document.activeElement, f.input);
  assert.equal(f.commands.inert, true);
  assert.equal(f.commands.getAttribute("aria-hidden"), "true");
  assert.equal(f.toggle.getAttribute("aria-expanded"), "true");
  assert.equal(f.search.inert, false);
  const originalInput = f.input;
  f.type("人像");
  assert.equal(f.document.getElementById("input"), originalInput);
  let parentEscapes = 0;
  f.panel.addEventListener("keydown", () => { parentEscapes++; });
  const event = f.key(f.input, "Escape");
  assert.equal(event.defaultPrevented, true);
  assert.equal(parentEscapes, 0);
  assert.deepEqual(f.queries, ["人像", ""]);
  assert.equal(f.input.value, "");
  assert.equal(f.document.activeElement, f.toggle);
  assert.equal(f.commands.inert, false);
  assert.equal(f.toggle.getAttribute("aria-expanded"), "false");
  assert.equal(f.panel.classList.contains("is-searching"), false);
});

test("empty search closes only after focus leaves, and a nonempty search stays expanded", async (t) => {
  const f = fixture(t);
  f.toggle.click();
  f.close.focus();
  await Promise.resolve();
  assert.equal(f.panel.classList.contains("is-searching"), true);
  f.outside.focus();
  await Promise.resolve();
  assert.equal(f.panel.classList.contains("is-searching"), false);
  f.toggle.click();
  f.type("视频");
  f.outside.focus();
  await Promise.resolve();
  assert.equal(f.panel.classList.contains("is-searching"), true);
  f.close.click();
  assert.deepEqual(f.queries, ["视频", ""]);
  assert.equal(f.document.activeElement, f.toggle);
});

test("space query sync restores search without stealing focus, and hiding preserves queries", (t) => {
  const f = fixture(t);
  f.tabs[1].focus();
  f.controller.sync({ space: "organization", query: "背景", visible: true });
  assert.equal(f.input.value, "背景");
  assert.equal(f.panel.classList.contains("is-searching"), true);
  assert.equal(f.document.activeElement, f.tabs[1]);
  f.controller.sync({ space: "organization", query: "背景", visible: false });
  assert.equal(f.panel.classList.contains("is-searching"), false);
  assert.equal(f.input.value, "背景");
  assert.deepEqual(f.queries, []);
  f.controller.sync({ space: "organization", query: "背景", visible: true });
  assert.equal(f.panel.classList.contains("is-searching"), true);
  f.controller.sync({ space: "personal", query: "", visible: true });
  assert.equal(f.panel.classList.contains("is-searching"), false);
});

test("composition Escape leaves search open and destroy releases callbacks and pending blur", async (t) => {
  const f = fixture(t);
  f.toggle.click();
  f.key(f.input, "Escape", { isComposing: true });
  assert.equal(f.panel.classList.contains("is-searching"), true);
  f.outside.focus();
  f.controller.destroy();
  await Promise.resolve();
  f.toggle.click();
  f.tabs[1].click();
  f.type("无监听");
  f.key(f.tabs[0], "ArrowRight");
  f.controller.close({ restoreFocus: true });
  f.controller.sync({ space: "personal", query: "不会打开", visible: true });
  assert.deepEqual(f.queries, []);
  assert.deepEqual(f.spaces, []);
  assert.equal(f.panel.classList.contains("is-searching"), false);
});


test("hover opens without stealing focus; leaving closes only an empty unfocused search", async (t) => {
  const f = fixture(t);
  f.outside.focus();
  f.toggle.dispatchEvent(new f.window.MouseEvent("pointerenter"));
  assert.equal(f.search.inert, false);
  assert.equal(f.document.activeElement, f.outside);
  f.toggle.dispatchEvent(new f.window.MouseEvent("pointerleave", { relatedTarget: f.search }));
  f.search.dispatchEvent(new f.window.MouseEvent("pointerenter"));
  await new Promise((resolve) => f.window.setTimeout(resolve, 170));
  assert.equal(f.search.inert, false);
  f.search.dispatchEvent(new f.window.MouseEvent("pointerleave", { relatedTarget: f.outside }));
  await new Promise((resolve) => f.window.setTimeout(resolve, 170));
  assert.equal(f.search.inert, true);
  f.toggle.dispatchEvent(new f.window.MouseEvent("pointerenter"));
  f.toggle.click();
  assert.equal(f.document.activeElement, f.input);
  f.search.dispatchEvent(new f.window.MouseEvent("pointerleave", { relatedTarget: f.outside }));
  await new Promise((resolve) => f.window.setTimeout(resolve, 170));
  assert.equal(f.search.inert, false);
});

test("platform search remains expanded and keeps commands accessible through clear and Escape", (t) => {
  const f = fixture(t);
  f.tabs[2].click();
  assert.equal(f.search.inert, false);
  assert.equal(f.commands.inert, false);
  assert.equal(f.close.hidden, true);
  f.type("平台素材");
  assert.equal(f.close.hidden, false);
  assert.equal(f.close.getAttribute("aria-label"), "清除搜索");
  f.close.click();
  assert.equal(f.document.activeElement, f.input);
  assert.equal(f.search.inert, false);
  assert.equal(f.commands.inert, false);
  f.key(f.input, "Escape");
  assert.equal(f.search.inert, false);
  f.tabs[0].click();
  assert.equal(f.search.inert, true);
});
