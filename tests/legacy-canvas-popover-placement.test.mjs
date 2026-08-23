import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("../src/legacy-canvas/canvas-popover-placement.js", import.meta.url),
  "utf8",
);
const context = vm.createContext({});
new vm.Script(source).runInContext(context);
const { placeAnchoredPopover } = context.REELAY_CANVAS_POPOVER_PLACEMENT;
const boundary = { left: 0, top: 70, right: 1000, bottom: 700 };
const floating = { width: 300, height: 180 };

test("preferred top gravity stays attached to the anchor when it fits", () => {
  const result = placeAnchoredPopover({
    anchor: { left: 420, right: 520, top: 400, bottom: 436, width: 100, height: 36 },
    boundary,
    floating,
    placements: ["top", "bottom"],
    gap: 10,
    padding: 12,
  });
  assert.equal(result.placement, "top");
  assert.equal(result.left, 320);
  assert.equal(result.top, 210);
});

test("top collision flips the anchored popover below its trigger", () => {
  const result = placeAnchoredPopover({
    anchor: { left: 420, right: 520, top: 90, bottom: 126, width: 100, height: 36 },
    boundary,
    floating,
    placements: ["top", "bottom"],
    gap: 10,
    padding: 12,
  });
  assert.equal(result.placement, "bottom");
  assert.equal(result.top, 136);
});

test("cross-axis overflow shifts into the safe viewport without detaching vertically", () => {
  const result = placeAnchoredPopover({
    anchor: { left: 8, right: 88, top: 400, bottom: 436, width: 80, height: 36 },
    boundary,
    floating,
    placements: ["top-start", "bottom-start"],
    gap: 10,
    padding: 12,
  });
  assert.equal(result.placement, "top-start");
  assert.equal(result.left, 12);
  assert.equal(result.top, 210);
});
