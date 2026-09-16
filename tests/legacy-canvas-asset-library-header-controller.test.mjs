import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const source = await readFile(new URL("../src/legacy-canvas/canvas-asset-library-header-controller.js", import.meta.url), "utf8");

function fixture(t, { synchronize = true, synchronizeOpen = true } = {}) {
  const dom = new JSDOM(`<div id="panel">
    <div id="spaces"><button data-library-space="personal">个人</button><button data-library-space="organization">组织</button><button data-library-space="platform">平台</button></div>
    <div id="navigation" data-library-search-covered><button>默认目录</button></div>
    <div id="search"><input id="input"><button id="clear" aria-label="关闭搜索">关闭</button></div>
    <div id="commands"><span id="leading" data-library-search-covered><button id="upload">上传</button></span><button data-library-search-toggle><span>搜索</span></button><button id="filter">筛选</button><button id="selection">多选</button></div>
  </div><button id="outside">画布</button>`, { runScripts: "outside-only" });
  const { window } = dom;
  const { document } = window;
  window.eval(source);
  const elements = Object.fromEntries(["panel", "spaces", "navigation", "search", "input", "clear", "commands", "leading", "filter", "selection", "outside"].map((id) => [id, document.getElementById(id)]));
  const queries = [];
  const spaces = [];
  const openChanges = [];
  const state = { space: "personal", query: "", visible: true, expanded: false };
  const controller = window.REELAY_CANVAS_ASSET_LIBRARY_HEADER_CONTROLLER.create({
    panel: elements.panel, spaceTabs: elements.spaces, searchRegion: elements.search,
    searchInput: elements.input, searchClear: elements.clear,
    onSpaceChange(space) { spaces.push(space); state.space = space; state.query = ""; controller.sync(state); },
    onQueryChange(query) { queries.push(query); state.query = query; controller.sync(state); },
    onSearchOpenChange(expanded) {
      openChanges.push(expanded);
      if (synchronizeOpen) { state.expanded = expanded; controller.sync(state); }
    },
  });
  if (synchronize) controller.sync(state);
  t.after(() => { controller.destroy(); window.close(); });
  return {
    ...elements, window, document, controller, queries, spaces, openChanges, state,
    tabs: [...elements.spaces.querySelectorAll("button")],
    toggle: () => elements.panel.querySelector("[data-library-search-toggle]"),
    open() { this.toggle().click(); },
    sync(patch) { Object.assign(state, patch); controller.sync(state); },
    key(element, key, options = {}) {
      const event = new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options });
      element.dispatchEvent(event);
      return event;
    },
    type(query) { elements.input.value = query; elements.input.dispatchEvent(new window.Event("input", { bubbles: true })); },
  };
}

test("creation and collapsed panels keep search unavailable without overwriting synchronized queries", (t) => {
  const f = fixture(t, { synchronize: false });
  assert.equal(f.search.inert, true);
  assert.equal(f.search.getAttribute("aria-hidden"), "true");
  f.tabs[1].click();
  f.open();
  f.type("初始化期间");
  assert.deepEqual(f.spaces, []);
  assert.deepEqual(f.queries, []);
  assert.deepEqual(f.openChanges, []);
  f.sync({ query: "恢复查询" });
  assert.equal(f.search.inert, true);
  assert.equal(f.input.value, "恢复查询");
  assert.equal(f.toggle().getAttribute("aria-expanded"), "false");
  assert.deepEqual(f.queries, []);
});

test("clicking the search icon opens and focuses the input while disabling only covered controls", (t) => {
  const f = fixture(t);
  f.toggle().querySelector("span").click();
  assert.deepEqual(f.openChanges, [true]);
  assert.equal(f.document.activeElement, f.input);
  assert.equal(f.panel.classList.contains("is-search-open"), true);
  assert.equal(f.search.inert, false);
  assert.equal(f.search.getAttribute("aria-hidden"), "false");
  assert.equal(f.toggle().getAttribute("aria-expanded"), "true");
  assert.equal(f.toggle().getAttribute("aria-controls"), "search");
  assert.equal(f.clear.hidden, false);
  for (const covered of [f.navigation, f.leading]) {
    assert.equal(covered.inert, true);
    assert.equal(covered.getAttribute("aria-hidden"), "true");
  }
  for (const available of [f.commands, f.filter, f.selection]) {
    assert.equal(available.hasAttribute("inert"), false);
    assert.equal(available.getAttribute("aria-hidden"), null);
  }
  f.open();
  assert.deepEqual(f.openChanges, [true]);
});

test("open intent does not independently change app-owned expansion or steal focus", (t) => {
  const f = fixture(t, { synchronizeOpen: false });
  f.outside.focus();
  f.open();
  assert.deepEqual(f.openChanges, [true]);
  assert.equal(f.search.inert, true);
  assert.equal(f.document.activeElement, f.outside);
  f.sync({ expanded: true, query: "背景" });
  assert.equal(f.search.inert, false);
  assert.equal(f.input.value, "背景");
  assert.equal(f.document.activeElement, f.outside);
});

test("hovering the icon or focusing elsewhere never changes search expansion", (t) => {
  const f = fixture(t);
  f.toggle().dispatchEvent(new f.window.MouseEvent("pointerenter", { bubbles: true }));
  f.toggle().focus();
  assert.deepEqual(f.openChanges, []);
  assert.equal(f.search.inert, true);
  f.open();
  f.type("人物");
  f.outside.focus();
  f.outside.click();
  assert.deepEqual(f.openChanges, [true]);
  assert.equal(f.search.inert, false);
  assert.equal(f.input.value, "人物");
});

test("close requests preserve queries and return focus to the icon with covered controls restored", (t) => {
  const f = fixture(t);
  f.open();
  f.type("人像");
  f.clear.click();
  assert.deepEqual(f.openChanges, [true, false]);
  assert.deepEqual(f.queries, ["人像"]);
  assert.equal(f.input.value, "人像");
  assert.equal(f.document.activeElement, f.toggle());
  assert.equal(f.search.inert, true);
  assert.equal(f.clear.hidden, true);
  assert.equal(f.panel.classList.contains("is-search-open"), false);
  for (const covered of [f.navigation, f.leading]) {
    assert.equal(covered.inert, false);
    assert.equal(covered.hasAttribute("inert"), false);
    assert.equal(covered.getAttribute("aria-hidden"), null);
  }
});

test("Escape closes empty and populated searches before reaching the surrounding panel", (t) => {
  const f = fixture(t);
  let parentEscapes = 0;
  f.panel.addEventListener("keydown", () => { parentEscapes++; });
  f.open();
  assert.equal(f.key(f.input, "Escape").defaultPrevented, true);
  assert.equal(parentEscapes, 0);
  assert.equal(f.document.activeElement, f.toggle());
  f.open();
  f.type("视频");
  assert.equal(f.key(f.input, "Escape").defaultPrevented, true);
  assert.equal(parentEscapes, 0);
  assert.deepEqual(f.queries, ["视频"]);
  assert.equal(f.key(f.toggle(), "Escape").defaultPrevented, false);
  assert.equal(parentEscapes, 1);
  assert.deepEqual(f.openChanges, [true, false, true, false]);
});

test("composition Escape does not close an in-progress search", (t) => {
  const f = fixture(t);
  f.open();
  f.type("角色");
  assert.equal(f.key(f.input, "Escape", { isComposing: true }).defaultPrevented, false);
  assert.equal(f.key(f.input, "Escape", { keyCode: 229 }).defaultPrevented, false);
  assert.equal(f.input.value, "角色");
  assert.equal(f.search.inert, false);
  assert.deepEqual(f.openChanges, [true]);
  assert.deepEqual(f.queries, ["角色"]);
});

test("platform search stays expanded across clearing, Escape and panel reopening", (t) => {
  const f = fixture(t);
  f.sync({ space: "platform", expanded: false });
  assert.equal(f.search.inert, false);
  assert.equal(f.clear.hidden, true);
  f.type("角色");
  assert.equal(f.clear.getAttribute("aria-label"), "清空搜索");
  assert.equal(f.clear.hidden, false);
  f.clear.click();
  assert.equal(f.input.value, "");
  assert.equal(f.document.activeElement, f.input);
  assert.equal(f.search.inert, false);
  f.type("场景");
  f.key(f.input, "Escape");
  assert.deepEqual(f.queries, ["角色", "", "场景", ""]);
  assert.deepEqual(f.openChanges, []);
  f.sync({ visible: false });
  assert.equal(f.search.inert, true);
  f.sync({ visible: true });
  assert.equal(f.search.inert, false);
  assert.equal(f.filter.hasAttribute("inert"), false);
  assert.equal(f.selection.hasAttribute("inert"), false);
  f.sync({ space: "personal" });
  assert.equal(f.search.inert, true);
  assert.equal(f.clear.getAttribute("aria-label"), "关闭搜索");
});

test("replaced toolbar icons receive synchronized state, delegated activation and focus return", (t) => {
  const f = fixture(t);
  const oldToggle = f.toggle();
  oldToggle.replaceWith(oldToggle.cloneNode(true));
  const nextToggle = f.toggle();
  f.sync({});
  assert.equal(nextToggle.getAttribute("aria-expanded"), "false");
  nextToggle.querySelector("span").click();
  assert.equal(f.document.activeElement, f.input);
  nextToggle.replaceWith(nextToggle.cloneNode(true));
  const finalToggle = f.toggle();
  f.sync({ query: "搜索" });
  assert.equal(finalToggle.getAttribute("aria-expanded"), "true");
  f.clear.click();
  assert.equal(f.document.activeElement, finalToggle);
  assert.equal(finalToggle.getAttribute("aria-expanded"), "false");
  assert.equal(oldToggle.isConnected, false);
  assert.deepEqual(f.openChanges, [true, false]);
});

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
  f.tabs[1].click();
  assert.deepEqual(f.spaces, ["platform", "personal", "platform", "personal", "organization"]);
  assert.deepEqual(f.tabs.map((tab) => tab.tabIndex), [-1, 0, -1]);
});

test("space keyboard navigation skips disabled tabs and leaves modified shortcuts alone", (t) => {
  const f = fixture(t);
  f.tabs[1].disabled = true;
  f.tabs[0].focus();
  assert.equal(f.key(f.tabs[0], "ArrowRight", { ctrlKey: true }).defaultPrevented, false);
  assert.deepEqual(f.spaces, []);
  f.key(f.tabs[0], "ArrowRight");
  assert.equal(f.document.activeElement, f.tabs[2]);
  assert.deepEqual(f.spaces, ["platform"]);
});

test("query and visibility sync silently restore space state without moving focus", (t) => {
  const f = fixture(t);
  f.tabs[1].focus();
  f.sync({ space: "organization", query: "背景", expanded: true });
  assert.equal(f.input.value, "背景");
  assert.equal(f.document.activeElement, f.tabs[1]);
  f.sync({ visible: false });
  assert.equal(f.search.inert, true);
  assert.equal(f.search.getAttribute("aria-hidden"), "true");
  assert.equal(f.input.value, "背景");
  assert.equal(f.toggle().getAttribute("aria-expanded"), "false");
  f.clear.click();
  f.tabs[0].click();
  f.open();
  assert.deepEqual(f.queries, []);
  assert.deepEqual(f.spaces, []);
  assert.deepEqual(f.openChanges, []);
  f.sync({ visible: true });
  assert.equal(f.search.inert, false);
  assert.equal(f.input.value, "背景");
  f.sync({ space: "personal", query: "人物", expanded: false });
  assert.equal(f.input.value, "人物");
  assert.deepEqual(f.queries, []);
  assert.equal(f.document.activeElement, f.tabs[1]);
});

test("programmatic clearing emits only on change and focuses only an expanded search", (t) => {
  const f = fixture(t);
  f.open();
  f.type("素材");
  f.outside.focus();
  f.controller.clear({ restoreFocus: false });
  assert.deepEqual(f.queries, ["素材", ""]);
  assert.equal(f.document.activeElement, f.outside);
  f.controller.clear();
  assert.deepEqual(f.queries, ["素材", ""]);
  assert.equal(f.document.activeElement, f.input);
  f.clear.click();
  f.sync({ query: "收起时的查询" });
  f.controller.clear();
  assert.equal(f.document.activeElement, f.toggle());
});

test("destroy releases callbacks and covered controls without clearing the query", (t) => {
  const f = fixture(t);
  f.sync({ query: "保留查询", expanded: true });
  f.controller.destroy();
  f.controller.destroy();
  assert.equal(f.input.value, "保留查询");
  assert.equal(f.navigation.hasAttribute("inert"), false);
  assert.equal(f.leading.hasAttribute("inert"), false);
  f.clear.click();
  f.tabs[1].click();
  f.open();
  f.type("无监听");
  f.key(f.tabs[0], "ArrowRight");
  f.controller.clear();
  f.controller.sync({ space: "personal", query: "不再同步", visible: true, expanded: true });
  assert.deepEqual(f.queries, []);
  assert.deepEqual(f.spaces, []);
  assert.deepEqual(f.openChanges, []);
  assert.equal(f.input.value, "无监听");
  assert.equal(f.search.inert, true);
});
