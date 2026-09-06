import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("../src/legacy-canvas/canvas-node-editor-layout.js", import.meta.url),
  "utf8",
);
const context = vm.createContext({});
new vm.Script(source).runInContext(context);
const { getEditorLayout } = context.REELAY_CANVAS_NODE_EDITOR_LAYOUT;
const rules = Object.freeze({
  promptScreenWidthByMode: Object.freeze({ image: 850, video: 800 }),
  promptScreenMargin: 24,
  panelGap: 12,
});

function closeTo(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be close to ${expected}`);
}

const zoomCases = [[0.2, 12], [0.5, 12], [0.75, 12], [1, 12], [1.5, 18], [2, 24]];

for (const [scale, expectedGap] of zoomCases) {
  test(`${scale * 100}% zoom keeps image and video editors at their fixed screen widths`, () => {
    for (const [mode, expectedWidth] of [["image", 850], ["video", 800]]) {
      const layout = getEditorLayout({ scale, availableWidth: 1280, mode, rules });

      assert.equal(layout.panelWidth, expectedWidth);
      closeTo(layout.promptScale * scale, 1);
      closeTo(layout.panelWidth * layout.promptScale * scale, expectedWidth);
      closeTo(layout.panelGap * scale, expectedGap);
    }
  });
}

test("a narrow canvas corridor reduces layout width without shrinking controls", () => {
  for (const [scale, expectedGap] of zoomCases) {
    for (const mode of ["image", "video"]) {
      const layout = getEditorLayout({ scale, availableWidth: 280, mode, rules });

      assert.equal(layout.panelWidth, 256);
      closeTo(layout.panelWidth * layout.promptScale * scale, 256);
      closeTo(layout.promptScale * scale, 1);
      closeTo(layout.panelGap * scale, expectedGap);
    }
  }
});

test("available-width clipping is continuous for each editor and never returns a nonpositive width", () => {
  for (const [mode, expectedWidth] of [["image", 850], ["video", 800]]) {
    const boundaryWidth = expectedWidth + rules.promptScreenMargin;
    const widths = [-0.01, 0, 0.01].map((offset) => getEditorLayout({
      scale: 1,
      availableWidth: boundaryWidth + offset,
      mode,
      rules,
    }).panelWidth);

    closeTo(widths[0], expectedWidth - 0.01);
    assert.equal(widths[1], expectedWidth);
    assert.equal(widths[2], expectedWidth);
    assert.equal(getEditorLayout({ scale: 1, availableWidth: 12, mode, rules }).panelWidth, 1);
  }
});

test("an omitted or unsupported mode uses the video editor width", () => {
  for (const mode of [undefined, "audio", "unknown"]) {
    const layout = getEditorLayout({ scale: 0.5, availableWidth: 1280, mode, rules });

    assert.equal(layout.panelWidth, 800);
  }
});

test("invalid scales use the neutral canvas scale", () => {
  for (const scale of [undefined, null, NaN, Infinity, -Infinity, 0, -1, "0.5"]) {
    const layout = getEditorLayout({ scale, availableWidth: 1280, rules });

    assert.deepEqual({ ...layout }, { panelWidth: 800, promptScale: 1, panelGap: 12 });
  }
});

test("invalid available widths preserve the current media type's fixed screen width", () => {
  for (const availableWidth of [undefined, null, NaN, Infinity, -Infinity, 0, -1, "280"]) {
    for (const scale of [0.2, 1, 2]) {
      assert.equal(getEditorLayout({ scale, availableWidth, mode: "image", rules }).panelWidth, 850);
      assert.equal(getEditorLayout({ scale, availableWidth, mode: "video", rules }).panelWidth, 800);
    }
  }
});

test("layout is deterministic without a DOM and does not mutate its inputs", () => {
  const options = Object.freeze({ scale: 0.9, availableWidth: 700, mode: "image", rules });
  const before = JSON.stringify(options);
  const first = getEditorLayout(options);
  const second = getEditorLayout(options);

  assert.equal(context.document, undefined);
  assert.equal(context.window, undefined);
  assert.equal(JSON.stringify(options), before);
  assert.deepEqual({ ...first }, { ...second });
  assert.notEqual(first, second);
});
