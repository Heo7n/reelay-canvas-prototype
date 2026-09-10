import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const context = vm.createContext({});
for (const file of ["canvas-arrange-layout.js", "canvas-arrange-scope.js"]) {
  new vm.Script(await readFile(new URL(`../src/legacy-canvas/${file}`, import.meta.url), "utf8"), { filename: file }).runInContext(context);
}
const { describeScope, prepareArrangement } = context.REELAY_CANVAS_ARRANGE_SCOPE;
const { planArrangement } = context.REELAY_CANVAS_ARRANGE_LAYOUT;
const plain = (value) => JSON.parse(JSON.stringify(value));
const node = (id, x, y, overrides = {}) => ({ id, x, y, width: 100, height: 80, ...overrides });
const group = (id, nodeIds, overrides = {}) => ({ id, nodeIds, x: 80, y: 40, width: 300, height: 200, ...overrides });
function getNodeBounds(item) {
  const left = item.x + 20;
  const top = item.y - 28;
  return { left, top, right: left + item.width, bottom: top + item.height, width: item.width, height: item.height };
}
const getGroupBounds = (item) => ({ left: item.x, top: item.y, right: item.x + item.width, bottom: item.y + item.height, width: item.width, height: item.height });
const options = (extra = {}) => ({ nodes: [], groups: [], connections: [], selectedIds: [], scope: "all", getNodeBounds, getGroupBounds, planArrangement, mode: "horizontal", ...extra });
const movedPlan = (dx, dy) => ({ items }) => ({ ok: true, positions: items.map((item) => ({ id: item.id, x: item.x + dx, y: item.y + dy })), changed: Boolean(dx || dy) });

test("scope descriptions never measure layout and one selected node never widens to all", () => {
  const input = options({ nodes: [node("a", 0, 0), node("b", 400, 0)], scope: "current", selectedIds: new Set(["a"]),
    getNodeBounds() { throw new Error("description must not measure geometry"); }, planArrangement() { throw new Error("description must not arrange"); } });
  const description = describeScope(input);
  assert.equal(description.ok, false);
  assert.equal(description.available, false);
  assert.equal(description.reasonCode, "insufficient-items");
  assert.equal(description.unitCount, 1);
  assert.deepEqual(plain(description.affectedNodeIds), ["a"]);
  assert.equal(prepareArrangement(input).changed, false);
  assert.equal(describeScope({ ...input, scope: "all" }).available, true);
});

test("partial grouped selection expands to whole rigid groups and counts the expansion", () => {
  const input = options({ nodes: [node("a", 100, 100, { groupId: "g" }), node("b", 300, 100, { groupId: "g" }), node("c", 700, 100)],
    groups: [group("g", ["a", "b"])], scope: "current", selectedIds: ["a", "c"] });
  const result = describeScope(input);
  assert.equal(result.available, true);
  assert.equal(result.unitCount, 2);
  assert.equal(result.groupCount, 1);
  assert.equal(result.expandedGroupCount, 1);
  assert.deepEqual(plain(result.affectedNodeIds), ["a", "b", "c"]);
  assert.match(result.notice, /完整分组/);
  const singleGroup = describeScope({ ...input, selectedIds: ["a"] });
  assert.equal(singleGroup.available, false);
  assert.equal(singleGroup.unitCount, 1);
  assert.deepEqual(plain(singleGroup.affectedNodeIds), ["a", "b"]);
});

test("wholecanvas groups include member visual overflow and empty groups move as blocks", () => {
  let requested;
  const input = options({ nodes: [node("a", 100, 100, { groupId: "g" }), node("b", 430, 100, { groupId: "g" }), node("c", 700, 100)],
    groups: [group("g", ["a", "b"]), group("empty", [], { x: 1000, y: 0, width: 120, height: 100 })],
    planArrangement: (request) => { requested = request; return movedPlan(100, 200)(request); } });
  const before = plain(input);
  const result = prepareArrangement(input);
  assert.equal(result.ok, true);
  assert.equal(result.unitCount, 3);
  assert.equal(result.groupCount, 2);
  assert.deepEqual(plain(requested.items.find((item) => item.id === "group:g")), { id: "group:g", x: 80, y: 40, width: 470, height: 200 });
  assert.deepEqual(plain(result.positions), [{ id: "a", x: 200, y: 300 }, { id: "b", x: 530, y: 300 }, { id: "c", x: 800, y: 300 }]);
  assert.deepEqual(plain(result.groupPositions), [{ id: "g", x: 180, y: 240 }, { id: "empty", x: 1100, y: 200 }]);
  assert.deepEqual(plain(input), before);
});

test("current scope sends unselected blocks as obstacles and maps cross-group connections once", () => {
  let requested;
  const input = options({ nodes: [node("a", 100, 100, { groupId: "g" }), node("b", 300, 100, { groupId: "g" }), node("c", 700, 100), node("outside", 1000, 100)],
    groups: [group("g", ["a", "b"]), group("empty", [], { x: 1400 })], scope: "current", selectedIds: ["a", "c"],
    connections: [
      { sourceNodeId: "a", targetNodeId: "b" }, { sourceNodeId: "a", targetNodeId: "c" },
      { sourceNodeId: "b", targetNodeId: "c" }, { sourceNodeId: "outside", targetNodeId: "c" },
      { sourceNodeId: "missing", targetNodeId: "c" },
    ], planArrangement: (request) => { requested = request; return movedPlan(10, 20)(request); } });
  const result = prepareArrangement(input);
  assert.equal(result.ok, true);
  assert.deepEqual(plain(requested.edges), [{ fromId: "group:g", toId: "node:c" }]);
  assert.deepEqual(plain(requested.obstacles.map(({ id }) => id)), ["node:outside", "group:empty"]);
  assert.equal(result.positions.some(({ id }) => id === "outside"), false);
  assert.equal(result.groupPositions.some(({ id }) => id === "empty"), false);
});

test("visual bbox inset conversion produces canonical coordinates without header or width offsets", () => {
  const result = prepareArrangement(options({ nodes: [node("a", 40, 70), node("b", 440, 270)], planArrangement: movedPlan(25, -40) }));
  assert.deepEqual(plain(result.positions), [{ id: "a", x: 65, y: 30 }, { id: "b", x: 465, y: 230 }]);
});

test("active group arranges members while retaining a manually enlarged frame and ignoring external edges", () => {
  const requests = [];
  const input = options({ nodes: [node("a", 200, 150, { groupId: "g" }), node("b", 650, 300, { groupId: "g" }), node("outside", 3000, 0)],
    groups: [group("g", ["a", "b"], { x: 0, y: 0, width: 1200, height: 1000 })], scope: "current", activeGroupId: "g",
    groupPadding: { left: 28, right: 28, top: 48, bottom: 28 }, connections: [{ sourceNodeId: "a", targetNodeId: "b" }, { sourceNodeId: "outside", targetNodeId: "a" }],
    planArrangement: (request) => { requests.push(request); return planArrangement(request); } });
  const before = plain(input);
  const result = prepareArrangement(input);
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.equal(result.scopeLabel, "当前分组");
  assert.deepEqual(plain(result.groupPositions), [{ id: "g", x: 0, y: 0, width: 1200, height: 1000 }]);
  assert.deepEqual(plain(requests[0].edges), [{ fromId: "node:a", toId: "node:b" }]);
  assert.equal(requests[0].obstacles.length, 0);
  assert.equal(requests[1].translateSingle, true);
  assert.deepEqual(plain(requests[1].obstacles.map(({ id }) => id)), ["node:outside"]);
  assert.deepEqual(plain(input), before);
});

test("internal layout grows the frame to fit media and headers without shrinking or shifting its origin", () => {
  const input = options({ nodes: [node("a", -20, 10, { groupId: "g", width: 200, height: 100 }), node("b", 50, 30, { groupId: "g", width: 200, height: 100 })],
    groups: [group("g", ["a", "b"], { x: 0, y: 0, width: 300, height: 200 })], scope: "current", activeGroupId: "g",
    groupPadding: { left: 28, right: 28, top: 48, bottom: 28 } });
  const result = prepareArrangement(input);
  assert.equal(result.ok, true);
  const frame = result.groupPositions[0];
  assert.equal(frame.x, 0);
  assert.equal(frame.y, 0);
  assert.equal(frame.height, 200);
  assert.ok(frame.width > 300);
  for (const position of result.positions) {
    const bounds = getNodeBounds({ ...input.nodes.find(({ id }) => id === position.id), ...position });
    assert.ok(bounds.left >= frame.x + 28);
    assert.ok(bounds.top >= frame.y + 48);
    assert.ok(bounds.right <= frame.x + frame.width - 28);
    assert.ok(bounds.bottom <= frame.y + frame.height - 28);
  }
});

test("grown active group avoids outside content by translating its frame and all members together", () => {
  const input = options({ nodes: [node("a", 0, 80, { groupId: "g", width: 220 }), node("b", 100, 80, { groupId: "g", width: 220 }), node("outside", 480, 0, { width: 140, height: 300 })],
    groups: [group("g", ["a", "b"], { x: 0, y: 0, width: 300, height: 200 })], scope: "current", activeGroupId: "g",
    groupPadding: { paddingX: 28, paddingTop: 48, paddingBottom: 28 } });
  const clear = prepareArrangement({ ...input, nodes: input.nodes.filter(({ id }) => id !== "outside") });
  const avoided = prepareArrangement(input);
  assert.equal(avoided.ok, true);
  const frame = avoided.groupPositions[0];
  const originalFrame = clear.groupPositions[0];
  const dx = frame.x - originalFrame.x;
  const dy = frame.y - originalFrame.y;
  assert.ok(dx !== 0 || dy !== 0);
  for (const position of avoided.positions) {
    const original = clear.positions.find(({ id }) => id === position.id);
    assert.equal(position.x - original.x, dx);
    assert.equal(position.y - original.y, dy);
  }
  assert.equal(frame.width, originalFrame.width);
  assert.equal(frame.height, originalFrame.height);
  const obstacle = getNodeBounds(input.nodes.find(({ id }) => id === "outside"));
  assert.ok(frame.x + frame.width <= obstacle.left || frame.x >= obstacle.right || frame.y + frame.height <= obstacle.top || frame.y >= obstacle.bottom);
  assert.equal(avoided.positions.some(({ id }) => id === "outside"), false);
});

test("broken membership, stale selection and malformed geometry fail without content changes", () => {
  const valid = options({ nodes: [node("a", 100, 100, { groupId: "g" }), node("b", 400, 100)], groups: [group("g", ["a"])] });
  const bad = [
    { ...valid, groups: [group("g", ["a", "a"])] },
    { ...valid, groups: [group("g", ["missing"])] },
    { ...valid, nodes: [{ ...valid.nodes[0], groupId: "missing" }, valid.nodes[1]] },
    { ...valid, groups: [group("g", [])] },
    { ...valid, scope: "current", selectedIds: ["missing"] },
    { ...valid, scope: "current", activeGroupId: "missing" },
    { ...valid, getNodeBounds: () => ({ left: 0, top: 0, right: Infinity, bottom: 10 }) },
  ];
  for (const input of bad) {
    const before = plain(input);
    const result = prepareArrangement(input);
    assert.equal(result.ok, false);
    assert.equal(result.available, false);
    assert.equal(result.changed, false);
    assert.deepEqual(plain(result.positions), []);
    assert.deepEqual(plain(result.groupPositions), []);
    assert.deepEqual(plain(input), before);
  }
});

test("partial, duplicate or failed planner results never produce partial content patches", () => {
  const input = options({ nodes: [node("a", 0, 0), node("b", 500, 0)] });
  for (const planner of [
    () => ({ ok: false, reason: "layout-overflow" }),
    () => ({ ok: true, positions: [{ id: "node:a", x: 0, y: 0 }] }),
    () => ({ ok: true, positions: [{ id: "node:a", x: 0, y: 0 }, { id: "node:a", x: 0, y: 0 }] }),
    () => { throw new Error("bad geometry adapter"); },
  ]) {
    const result = prepareArrangement({ ...input, planArrangement: planner });
    assert.equal(result.ok, false);
    assert.equal(result.available, false);
    assert.equal(result.changed, false);
    assert.deepEqual(plain(result.positions), []);
  }
});

test("already arranged scope returns a no-op and never includes unrelated fields", () => {
  const result = prepareArrangement(options({ nodes: [node("a", 0, 0), node("b", 500, 0)], planArrangement: movedPlan(0, 0) }));
  assert.equal(result.ok, true);
  assert.equal(result.changed, false);
  assert.deepEqual(Object.keys(result.positions[0]).sort(), ["id", "x", "y"]);
});
