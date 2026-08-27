import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("../src/legacy-canvas/canvas-node-placement.js", import.meta.url),
  "utf8",
);
const context = vm.createContext({});
new vm.Script(source).runInContext(context);
const placement = context.REELAY_CANVAS_NODE_PLACEMENT;

test("blank-canvas creation anchors the media frame center to the pointer", () => {
  const world = { x: 1000, y: 800 };
  const layout = {
    nodeWidth: 705,
    nodeHeight: 790,
    mediaWidth: 460,
    mediaHeight: 460,
  };
  const position = placement.getNodePosition({ world, layout });
  const mediaLeft = position.x + (layout.nodeWidth - layout.mediaWidth) / 2;

  assert.equal(mediaLeft + layout.mediaWidth / 2, world.x);
  assert.equal(position.y + layout.mediaHeight / 2, world.y);
});

test("prompt expansion never changes the default creation anchor", () => {
  const world = { x: 640, y: 360 };
  const base = { nodeWidth: 705, mediaWidth: 620, mediaHeight: 349 };
  const compact = placement.getNodePosition({ world, layout: { ...base, nodeHeight: 349 } });
  const expanded = placement.getNodePosition({ world, layout: { ...base, nodeHeight: 880 } });

  assert.deepEqual({ ...expanded }, { ...compact });
});

test("connection creation keeps the dropped endpoint outside the requested media edge", () => {
  const world = { x: 700, y: 420 };
  const layout = { nodeWidth: 705, mediaWidth: 620, mediaHeight: 349 };
  const input = placement.getNodePosition({ world, layout, anchor: "input" });
  const output = placement.getNodePosition({ world, layout, anchor: "output" });
  const inset = (layout.nodeWidth - layout.mediaWidth) / 2;

  assert.equal(input.x + inset - placement.defaultPortOffset, world.x);
  assert.equal(output.x + inset + layout.mediaWidth + placement.defaultPortOffset, world.x);
  assert.equal(input.y + layout.mediaHeight / 2, world.y);
  assert.equal(output.y + layout.mediaHeight / 2, world.y);
});

test("aspect resizing preserves the media bottom edge and horizontal center", () => {
  const position = { x: 180, y: 260 };
  const currentLayout = { nodeWidth: 705, mediaWidth: 620, mediaHeight: 349 };
  const nextLayout = { nodeWidth: 740, mediaWidth: 293, mediaHeight: 520 };
  const nextPosition = placement.getBottomCenterAnchoredPosition({
    position,
    currentLayout,
    nextLayout,
  });

  assert.equal(nextPosition.x + nextLayout.nodeWidth / 2, position.x + currentLayout.nodeWidth / 2);
  assert.equal(nextPosition.y + nextLayout.mediaHeight, position.y + currentLayout.mediaHeight);
});

test("bottom-centered resizing rejects incomplete geometry", () => {
  assert.equal(
    placement.getBottomCenterAnchoredPosition({
      position: { x: 1, y: 2 },
      currentLayout: { nodeWidth: 705, mediaHeight: 349 },
      nextLayout: { nodeWidth: 705 },
    }),
    null,
  );
});
