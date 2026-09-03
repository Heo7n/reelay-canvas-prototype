import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("../src/legacy-canvas/canvas-agent-panel-geometry.js", import.meta.url),
  "utf8",
);
const context = vm.createContext({});
new vm.Script(source).runInContext(context);
const geometry = context.REELAY_CANVAS_AGENT_PANEL_GEOMETRY;

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test("the geometry API is frozen and exposes inset normalization", () => {
  assert.equal(Object.isFrozen(geometry), true);
  assert.equal(typeof geometry.normalizeInsets, "function");
});

test("dragging the top edge preserves the bottom inset and clamps the top inset", () => {
  assert.deepEqual(
    plain(geometry.normalizeInsets({
      top: 500,
      bottom: 300,
      viewportHeight: 1000,
      minHeight: 300,
      preferredEdge: "top",
    })),
    { top: 400, bottom: 300, height: 300 },
  );
});

test("dragging the bottom edge preserves the top inset and clamps the bottom inset", () => {
  assert.deepEqual(
    plain(geometry.normalizeInsets({
      top: 500,
      bottom: 300,
      viewportHeight: 1000,
      minHeight: 300,
      preferredEdge: "bottom",
    })),
    { top: 500, bottom: 200, height: 300 },
  );
});

test("the anchored inset is itself bounded before the moving edge is resolved", () => {
  assert.deepEqual(
    plain(geometry.normalizeInsets({
      top: 40,
      bottom: 900,
      viewportHeight: 800,
      minHeight: 240,
      preferredEdge: "top",
    })),
    { top: 0, bottom: 560, height: 240 },
  );
  assert.deepEqual(
    plain(geometry.normalizeInsets({
      top: 900,
      bottom: 40,
      viewportHeight: 800,
      minHeight: 240,
      preferredEdge: "bottom",
    })),
    { top: 560, bottom: 0, height: 240 },
  );
});

test("too-short viewports clear both insets without inventing panel height", () => {
  assert.deepEqual(
    plain(geometry.normalizeInsets({
      top: 40,
      bottom: 50,
      viewportHeight: 240,
      minHeight: 320,
      preferredEdge: "top",
    })),
    { top: 0, bottom: 0, height: 240 },
  );
});

test("invalid and negative inputs normalize to finite non-negative geometry", () => {
  assert.deepEqual(
    plain(geometry.normalizeInsets({
      top: Number.POSITIVE_INFINITY,
      bottom: -12,
      viewportHeight: 720,
      minHeight: "300",
      preferredEdge: "unsupported",
    })),
    { top: 0, bottom: 0, height: 720 },
  );
  assert.deepEqual(
    plain(geometry.normalizeInsets({
      top: 20,
      bottom: 20,
      viewportHeight: Number.NaN,
      minHeight: 300,
      preferredEdge: "bottom",
    })),
    { top: 0, bottom: 0, height: 0 },
  );
  assert.deepEqual(
    plain(geometry.normalizeInsets(null)),
    { top: 0, bottom: 0, height: 0 },
  );
});
