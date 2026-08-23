import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("../src/legacy-canvas/canvas-node-interaction.js", import.meta.url),
  "utf8",
);
const context = vm.createContext({});
new vm.Script(source, { filename: "canvas-node-interaction.js" }).runInContext(context);
const interaction = context.REELAY_CANVAS_NODE_INTERACTION;

test("pointer selection preserves multi-selection and supports shift toggling", () => {
  assert.deepEqual(
    Array.from(interaction.resolvePointerSelection({ selectedIds: ["a", "b"], nodeId: "a" })),
    ["a", "b"],
  );
  assert.deepEqual(
    Array.from(interaction.resolvePointerSelection({ selectedIds: ["a", "b"], nodeId: "a", shiftKey: true })),
    ["b"],
  );
  assert.deepEqual(
    Array.from(interaction.resolvePointerSelection({ selectedIds: ["a"], nodeId: "b", shiftKey: true })),
    ["a", "b"],
  );
});

test("drag calculations preserve node offsets at the current canvas scale", () => {
  const result = interaction.getDraggedPositions({
    startClientX: 100,
    startClientY: 80,
    origins: [
      { id: "a", x: 10, y: 20 },
      { id: "b", x: 70, y: 95 },
    ],
  }, { clientX: 140, clientY: 100 }, 2);

  assert.equal(result.dx, 20);
  assert.equal(result.dy, 10);
  assert.equal(result.moved, true);
  assert.deepEqual(Array.from(result.positions, (position) => ({ ...position })), [
    { id: "a", x: 30, y: 30 },
    { id: "b", x: 90, y: 105 },
  ]);
});

test("drag promotion uses a stable four pixel threshold", () => {
  const action = { startClientX: 10, startClientY: 10 };
  assert.equal(interaction.hasCrossedDragThreshold(action, { clientX: 12, clientY: 12 }), false);
  assert.equal(interaction.hasCrossedDragThreshold(action, { clientX: 13.999, clientY: 10 }), false);
  assert.equal(interaction.hasCrossedDragThreshold(action, { clientX: 14, clientY: 10 }), true);
});

test("marquee selection normalizes reverse drags and supports additive selection", () => {
  const marquee = interaction.getWorldMarqueeRect({ x: 100, y: 100 }, { x: 20, y: 30 });
  assert.deepEqual({ ...marquee }, { left: 20, top: 30, right: 100, bottom: 100 });

  const nodes = [
    { id: "a", bounds: { left: 10, top: 10, right: 25, bottom: 35 } },
    { id: "b", bounds: { left: 40, top: 40, right: 60, bottom: 60 } },
    { id: "c", bounds: { left: 120, top: 120, right: 150, bottom: 150 } },
  ];
  const selected = interaction.resolveMarqueeSelection({
    nodes,
    marquee,
    getBounds: (node) => node.bounds,
    additive: true,
    baseSelection: ["c"],
  });
  assert.deepEqual(Array.from(selected), ["c", "a", "b"]);
});

test("local marquee geometry stays relative to the canvas shell", () => {
  const rect = interaction.getLocalMarqueeRect(
    { localStartX: 80, localStartY: 60 },
    { clientX: 50, clientY: 75 },
    { left: 10, top: 5 },
  );
  assert.deepEqual({ ...rect }, { left: 40, top: 60, width: 40, height: 10 });
});
