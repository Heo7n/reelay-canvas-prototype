import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../src/legacy-canvas/canvas-arrange-layout.js", import.meta.url), "utf8");
const context = vm.createContext({});
new vm.Script(source, { filename: "canvas-arrange-layout.js" }).runInContext(context);
const model = context.REELAY_CANVAS_ARRANGE_LAYOUT;
const plan = model.planArrangement;
const plain = (value) => JSON.parse(JSON.stringify(value));
const item = (id, x = 0, y = 0, width = 120, height = 80) => ({ id, x, y, width, height });
const edge = (fromId, toId) => ({ fromId, toId });
const placedItems = (items, result) => {
  const positions = new Map(result.positions.map((position) => [position.id, position]));
  return items.map((entry) => ({ ...entry, ...positions.get(entry.id) }));
};
const positionsById = (result) => Object.fromEntries(result.positions.map((position) => [position.id, plain(position)]).sort(([left], [right]) => left.localeCompare(right)));
const overlaps = (left, right) => left.x < right.x + right.width && left.x + left.width > right.x
  && left.y < right.y + right.height && left.y + left.height > right.y;

function assertSeparated(items) {
  for (let index = 0; index < items.length; index += 1) {
    const current = items[index];
    assert.ok([current.x, current.y, current.width, current.height].every(Number.isFinite));
    for (const other of items.slice(index + 1)) {
      assert.equal(overlaps(current, other), false, `${current.id} overlaps ${other.id}`);
    }
  }
}

test("exports one frozen pure planner and preserves all input records", () => {
  const input = {
    items: [item("b", -320, 400), item("a", 400, -200), item("c", 20, 120)],
    edges: [edge("a", "b")],
    obstacles: [item("obstacle", -50, 120)],
  };
  const before = JSON.stringify(input);
  const result = plan(input);
  assert.deepEqual(plain(Object.keys(model)), ["planArrangement"]);
  assert.ok(Object.isFrozen(model));
  assert.equal(result.ok, true);
  assert.equal(JSON.stringify(input), before);
  assert.equal(result.positions.length, input.items.length);
  assert.notEqual(result.positions[0], input.items[0]);
});

test("empty and single-item scopes are no-ops, even beside obstacles", () => {
  assert.deepEqual(plain(plan({ items: [] })), { ok: true, positions: [], changed: false, bounds: null, reason: "" });
  const only = item("single", -90, 31);
  const result = plan({ items: [only], obstacles: [item("other", -90, 31)] });
  assert.equal(result.changed, false);
  assert.deepEqual(plain(result.positions), [{ id: "single", x: -90, y: 31 }]);
});

test("explicit singleton placement can clear a resized group frame without resizing it again", () => {
  const frame = item("frame", 0, 0, 1200, 600);
  const outside = item("outside", 1000, 150, 300, 300);
  const result = plan({ items: [frame], obstacles: [outside], translateSingle: true });
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  const [moved] = placedItems([frame], result);
  assertSeparated([moved, outside]);
  assert.equal(result.bounds.width, frame.width);
  assert.equal(result.bounds.height, frame.height);
  assert.equal(plan({ items: [moved], obstacles: [outside], translateSingle: true }).changed, false);
});

test("all modes preserve the visual origin and separate heterogeneous rectangles", () => {
  const items = [item("portrait", -200, 90, 160, 850), item("wide", 200, -80, 1200, 150), item("prompt", 150, 380, 460, 600), item("small", -100, 80, 12, 12)];
  for (const mode of ["auto", "grid", "horizontal", "vertical"]) {
    const result = plan({ items, mode });
    assert.equal(result.ok, true, mode);
    assert.equal(result.bounds.left, -200, mode);
    assert.equal(result.bounds.top, -80, mode);
    assertSeparated(placedItems(items, result));
    assert.deepEqual([...result.positions.map(({ id }) => id)].sort(), items.map(({ id }) => id).sort());
  }
});

test("automatic topology puts every acyclic source before its target, including diamonds", () => {
  const items = [item("output", -100, -100, 700, 160), item("upper", 90, 40, 300, 400), item("lower", 30, 60, 80, 300), item("source", 500, 500, 600, 200)];
  const edges = [edge("source", "upper"), edge("source", "lower"), edge("upper", "output"), edge("lower", "output"), edge("source", "output")];
  const result = plan({ items, edges });
  const arranged = placedItems(items, result);
  const byId = new Map(arranged.map((entry) => [entry.id, entry]));
  for (const connection of edges) {
    const from = byId.get(connection.fromId);
    const to = byId.get(connection.toId);
    assert.ok(from.x + from.width < to.x, connection.fromId + " -> " + connection.toId);
  }
  assertSeparated(arranged);
});

test("cycles stay together without blocking downstream layout or depending on edge order", () => {
  const items = [item("c", 500, 400, 600, 500), item("a", 0, 30), item("b", 0, 200), item("before", 300, 0), item("after", -300, -200)];
  const edges = [edge("a", "b"), edge("b", "c"), edge("c", "a"), edge("before", "a"), edge("c", "after")];
  const result = plan({ items, edges });
  const arranged = placedItems(items, result);
  const byId = new Map(arranged.map((entry) => [entry.id, entry]));
  assert.equal(result.ok, true);
  assert.equal(byId.get("a").x, byId.get("b").x);
  assert.equal(byId.get("b").x, byId.get("c").x);
  assert.ok(byId.get("before").x + byId.get("before").width < byId.get("a").x);
  assert.ok(byId.get("c").x + byId.get("c").width < byId.get("after").x);
  assertSeparated(arranged);
  assert.deepEqual(positionsById(plan({ items: [...items].reverse(), edges: [...edges].reverse() })), positionsById(result));
});

test("disconnected flows and standalone group-sized blocks get separate stable shelf cells", () => {
  const items = [item("a", 0, 0), item("b", 300, 0), item("c", 0, 600), item("d", 300, 600), item("group", 800, 500, 1700, 1400)];
  const edges = [edge("a", "b"), edge("c", "d")];
  const result = plan({ items, edges });
  const arranged = placedItems(items, result);
  assertSeparated(arranged);
  const group = arranged.find(({ id }) => id === "group");
  assert.equal(group.width, 1700);
  assert.equal(group.height, 1400);
  const again = plan({ items: arranged, edges });
  assert.equal(again.changed, false);
  assert.deepEqual(positionsById(again), positionsById(result));
});

test("duplicate, self and external edges do not alter valid layout", () => {
  const items = [item("a"), item("b", 90, 90), item("c", 180, 180)];
  const edges = [edge("a", "b"), edge("b", "c")];
  const baseline = plan({ items, edges });
  const redundant = [...edges, ...edges, edge("a", "a"), edge("unknown", "a"), edge("a", "unknown"), null, {}];
  assert.deepEqual(positionsById(plan({ items, edges: redundant })), positionsById(baseline));
});

test("selection arrangement translates as a whole around untouched rectangles", () => {
  const items = [item("a", 0, 0, 120, 80), item("b", 300, 90, 120, 80)];
  const edges = [edge("a", "b")];
  const obstacles = [item("first", 220, 0, 180, 160), item("right", 450, -120, 180, 300), item("upper", -200, -200, 700, 70)];
  const baseline = positionsById(plan({ items, edges }));
  const result = plan({ items, edges, obstacles });
  assert.equal(result.ok, true);
  const arranged = placedItems(items, result);
  assertSeparated([...arranged, ...obstacles]);
  const after = positionsById(result);
  assert.equal(after.b.x - after.a.x, baseline.b.x - baseline.a.x);
  assert.equal(after.b.y - after.a.y, baseline.b.y - baseline.a.y);
  assert.equal(plan({ items: arranged, edges, obstacles }).changed, false);
});

test("outside rectangles in empty layout gaps do not force a needless translation", () => {
  const items = [item("a", 0, 0, 100, 100), item("b", 400, 0, 100, 100)];
  const edges = [edge("a", "b")];
  const baseline = plan({ items, edges, layerGap: 300 });
  const result = plan({ items, edges, layerGap: 300, obstacles: [item("gap", 180, 0, 40, 100)] });
  assert.deepEqual(positionsById(result), positionsById(baseline));
});

test("malformed scopes fail atomically rather than moving only valid records", () => {
  for (const invalid of [
    null, {}, { items: null },
    { items: [item("a"), item("a")] },
    { items: [item("a"), item("b", Infinity)] },
    { items: [item("a"), item("b", 0, NaN)] },
    { items: [item("a"), item("b", 0, 0, 0)] },
    { items: [item("a"), item("b", 0, 0, 90, -1)] },
    { items: [item("a"), item(" ")] },
    { items: [item("a")], mode: "unknown" },
    { items: [item("a")], obstacles: [item("outside", 0, 0, NaN)] },
    { items: [item("a")], obstacles: {} },
  ]) {
    const result = plan(invalid);
    assert.equal(result.ok, false, JSON.stringify(invalid));
    assert.equal(result.changed, false);
    assert.deepEqual(plain(result.positions), []);
    assert.equal(result.bounds, null);
    assert.ok(result.reason);
  }
});

test("overflow never exposes partial or non-finite coordinates", () => {
  const result = plan({ items: [item("a", 0, 0, 1e308), item("b", 0, 0, 1e308)], mode: "horizontal" });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "layout-overflow");
  assert.deepEqual(plain(result.positions), []);
});

test("rerunning every layout is an exact no-op for varied graphs and rectangle sizes", () => {
  let seed = 37681;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  for (let example = 0; example < 30; example += 1) {
    const items = Array.from({ length: 18 }, (_, index) => item(`item-${index}`,
      Math.floor(random() * 4000) - 2000, Math.floor(random() * 3000) - 1500,
      Math.floor(random() * 750) + 40, Math.floor(random() * 650) + 40));
    const edges = Array.from({ length: 22 }, () => edge(items[Math.floor(random() * items.length)].id, items[Math.floor(random() * items.length)].id));
    for (const mode of ["auto", "grid", "horizontal", "vertical"]) {
      const first = plan({ items, edges, mode });
      assert.equal(first.ok, true);
      const arranged = placedItems(items, first);
      assertSeparated(arranged);
      const second = plan({ items: arranged, edges, mode });
      assert.equal(second.changed, false, `${mode} example ${example}`);
      assert.deepEqual(positionsById(second), positionsById(first));
    }
  }
});

test("long dependency chains do not overflow the call stack", () => {
  const items = Array.from({ length: 6000 }, (_, index) => item(`item-${index}`, 0, index));
  const edges = items.slice(1).map((entry, index) => edge(items[index].id, entry.id));
  const result = plan({ items, edges });
  assert.equal(result.ok, true);
  assert.equal(result.positions.length, items.length);
  const positions = positionsById(result);
  assert.ok(positions["item-5999"].x > positions["item-0"].x);
  assert.equal(plan({ items: placedItems(items, result), edges }).changed, false);
});
