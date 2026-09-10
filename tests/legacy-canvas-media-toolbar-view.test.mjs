import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { JSDOM } from "jsdom";

const source = await readFile(
  new URL("../src/legacy-canvas/canvas-media-toolbar-view.js", import.meta.url),
  "utf8",
);
const context = vm.createContext({});
new vm.Script(source, { filename: "canvas-media-toolbar-view.js" }).runInContext(context);
const { renderMediaToolbar } = context.REELAY_CANVAS_MEDIA_TOOLBAR_VIEW;

const cropTool = { id: "crop", icon: "crop", label: "裁剪" };
const eraseTool = { id: "erase", icon: "eraser", label: "橡皮擦" };
const libraryTool = { id: "add-library", icon: "folder-plus", label: "加入资产库" };

test("hidden media toolbar renders no markup", () => {
  assert.equal(renderMediaToolbar({ visible: false }), "");
});

test("compact media toolbar preserves interaction selectors and scale", () => {
  const markup = renderMediaToolbar({
    visible: true,
    toolbarScale: 0.82,
    pinnedTools: [cropTool],
  });

  assert.match(markup, /class="media-edit-toolbar compact"/);
  assert.match(markup, /--toolbar-scale: 0\.82/);
  assert.match(markup, /data-media-tool="crop"/);
  assert.match(markup, /data-media-tool="toggle-more"/);
  assert.match(markup, /data-media-tool="download"/);
  assert.doesNotMatch(markup, /<span>裁剪<\/span>/);
});

test("expanded media toolbar renders labels, overflow tools, and customization", () => {
  const markup = renderMediaToolbar({
    visible: true,
    showLabels: true,
    menuOpen: true,
    pinnedTools: [cropTool],
    unpinnedTools: [eraseTool],
  });

  assert.match(markup, /class="media-edit-toolbar show-labels"/);
  assert.match(markup, /<span>裁剪<\/span>/);
  assert.match(markup, /class="media-tool-menu"/);
  assert.match(markup, /data-media-tool="erase"/);
  assert.match(markup, /<span>橡皮擦<\/span>/);
  assert.match(markup, /data-media-tool="customize"/);
  assert.match(markup, /<span>自定义工具栏<\/span>/);
});

test("pinned library action is grouped with download and remains available when unpinned", () => {
  for (const pinned of [true, false]) {
    const dom = new JSDOM(renderMediaToolbar({
      visible: true,
      menuOpen: true,
      pinnedTools: pinned ? [libraryTool, cropTool] : [cropTool],
      unpinnedTools: pinned ? [] : [libraryTool],
    }));
    const doc = dom.window.document;
    const actions = [...doc.querySelectorAll('.media-tool-actions [data-media-tool]')]
      .map((button) => button.dataset.mediaTool);
    assert.deepEqual(actions, pinned ? ["add-library", "download"] : ["download"]);
    assert.equal(doc.querySelectorAll('[data-media-tool="add-library"]').length, 1);
    assert.ok(doc.querySelector('.media-tool-primary [data-media-tool="crop"]'));
    assert.ok(doc.querySelector('.media-tool-more .media-tool-menu'));
    assert.equal(doc.querySelector('[data-media-tool="toggle-more"]').getAttribute('aria-expanded'), 'true');
    dom.window.close();
  }
});
