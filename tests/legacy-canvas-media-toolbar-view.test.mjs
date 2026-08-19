import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("../src/legacy-canvas/canvas-media-toolbar-view.js", import.meta.url),
  "utf8",
);
const context = vm.createContext({});
new vm.Script(source, { filename: "canvas-media-toolbar-view.js" }).runInContext(context);
const { renderMediaToolbar } = context.REELAY_CANVAS_MEDIA_TOOLBAR_VIEW;

const cropTool = { id: "crop", icon: "crop", label: "裁剪" };
const eraseTool = { id: "erase", icon: "eraser", label: "橡皮擦" };

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
  assert.doesNotMatch(markup, />裁剪<\/span>/);
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
