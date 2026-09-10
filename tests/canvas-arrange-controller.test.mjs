import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const root = new URL("../", import.meta.url);
const html = await readFile(new URL("index.html", root), "utf8");
const sources = await Promise.all([
  "canvas-arrange-layout.js", "canvas-arrange-scope.js", "canvas-arrange-controller.js",
].map((file) => readFile(new URL(`src/legacy-canvas/${file}`, root), "utf8")));
const plain = (value) => JSON.parse(JSON.stringify(value));

function fixture(t, overrides = {}) {
  const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const { window } = dom;
  sources.forEach((source) => window.eval(source));
  const button = window.document.querySelector('[data-canvas-tool="organize"]');
  const menu = window.document.querySelector("#canvasArrangeMenu");
  const canvas = { id: "same-id", nodes: [
    { id: "a", x: 0, y: 0, width: 100, height: 80 },
    { id: "b", x: 350, y: 240, width: 100, height: 80 },
  ], groups: [], connections: [] };
  let state = { canvas, selectedIds: new Set(), activeGroupId: null, canMutate: true, interactionBusy: false, ...overrides };
  const calls = { before: 0, prepared: [], committed: [], completed: [], notices: [], openChanges: 0 };
  let beforeAction = () => {};
  let commitAllowed = true;
  let prepareFailure = null;
  const getContext = () => ({
    ...state, nodes: state.canvas.nodes, groups: state.canvas.groups, connections: state.canvas.connections,
    getNodeBounds: (node) => ({ left: node.x, top: node.y, right: node.x + node.width, bottom: node.y + node.height }),
    getGroupBounds: (group) => ({ left: group.x, top: group.y, right: group.x + group.width, bottom: group.y + group.height }),
    groupPadding: { left: 28, right: 28, top: 48, bottom: 28 },
    planArrangement: window.REELAY_CANVAS_ARRANGE_LAYOUT.planArrangement,
  });
  const controller = window.REELAY_CANVAS_ARRANGE_CONTROLLER.create({
    button, menu, getContext,
    describeScope: window.REELAY_CANVAS_ARRANGE_SCOPE.describeScope,
    prepareArrangement(context) {
      calls.prepared.push(context);
      return prepareFailure || window.REELAY_CANVAS_ARRANGE_SCOPE.prepareArrangement(context);
    },
    beforeArrange() { calls.before++; beforeAction(); },
    commit(plan) {
      calls.committed.push(plan);
      if (!commitAllowed) return { ok: false };
      for (const position of plan.positions) Object.assign(state.canvas.nodes.find(({ id }) => id === position.id), position);
      for (const position of plan.groupPositions) Object.assign(state.canvas.groups.find(({ id }) => id === position.id), position);
      return { ok: true };
    },
    onComplete(plan, mode) { calls.completed.push({ plan, mode }); },
    notify(message) { calls.notices.push(message); },
    onOpenChange() { calls.openChanges++; },
  });
  controller.sync();
  return { window, canvas, button, menu, controller, calls,
    state: () => state,
    update: (patch) => { state = { ...state, ...patch }; },
    before: (callback) => { beforeAction = callback; },
    setCommitAllowed: (value) => { commitAllowed = value; },
    setPrepareFailure: (value) => { prepareFailure = value; },
    open: (options) => controller.toggle(options),
    clickScope: (scope) => menu.querySelector(`[data-arrange-scope="${scope}"]`).click(),
    clickMode: (mode) => menu.querySelector(`[data-arrange-action="${mode}"]`).click(),
    isOpen: () => !menu.classList.contains("hidden"),
  };
}

test("single-selection scope stays explicit until the user chooses the whole canvas", (t) => {
  const f = fixture(t, { selectedIds: new Set(["a"]) });
  f.open({ focus: true });
  assert.equal(f.isOpen(), true);
  assert.equal(f.button.getAttribute("aria-expanded"), "true");
  assert.equal(f.menu.querySelector('[data-arrange-scope="current"]').getAttribute("aria-pressed"), "true");
  assert.equal(f.window.document.activeElement, f.menu.querySelector('[data-arrange-scope="current"]'));
  assert.ok([...f.menu.querySelectorAll("[data-arrange-action]")].every((control) => control.disabled));
  f.clickMode("auto");
  assert.equal(f.calls.committed.length, 0);
  f.clickScope("all");
  assert.equal(f.menu.querySelector('[data-arrange-scope="all"]').getAttribute("aria-pressed"), "true");
  assert.ok([...f.menu.querySelectorAll("[data-arrange-action]")].every((control) => !control.disabled));
  f.clickMode("horizontal");
  assert.equal(f.calls.prepared[0].scope, "all");
  assert.deepEqual(plain(f.calls.committed[0].affectedNodeIds), ["a", "b"]);
  assert.deepEqual([...f.state().selectedIds], ["a"]);
});

test("no-selection defaults to all and keeps the unavailable current-selection switch disabled", (t) => {
  const f = fixture(t);
  f.open();
  const current = f.menu.querySelector('[data-arrange-scope="current"]');
  assert.equal(current.disabled, true);
  current.click();
  assert.equal(f.menu.querySelector('[data-arrange-scope="all"]').getAttribute("aria-pressed"), "true");
  f.clickMode("grid");
  assert.equal(f.calls.prepared[0].scope, "all");
});

test("replacement canvas with the same identifier cannot receive a stale arrangement", (t) => {
  const f = fixture(t);
  f.open();
  const replacement = { ...f.canvas, nodes: f.canvas.nodes.map((node) => ({ ...node })) };
  const before = plain(replacement);
  f.update({ canvas: replacement });
  f.controller.arrange("horizontal");
  assert.equal(f.isOpen(), false);
  assert.equal(f.calls.prepared.length, 0);
  assert.equal(f.calls.committed.length, 0);
  assert.deepEqual(plain(replacement), before);
});

test("selection identity closes stale menus while reorder of the same selected IDs remains valid", (t) => {
  const f = fixture(t, { selectedIds: new Set(["a", "b"]) });
  f.open();
  f.update({ selectedIds: new Set(["b", "a"]) });
  f.controller.sync();
  assert.equal(f.isOpen(), true);
  f.update({ selectedIds: new Set(["b"]) });
  f.clickMode("horizontal");
  assert.equal(f.isOpen(), false);
  assert.equal(f.calls.before, 0);
  assert.equal(f.calls.committed.length, 0);
});

test("active-group scope is independent from wholecanvas mode and closes when the active group changes", (t) => {
  const f = fixture(t);
  f.canvas.nodes.forEach((node) => { node.groupId = "group"; });
  f.canvas.groups.push({ id: "group", nodeIds: ["a", "b"], x: -50, y: -50, width: 600, height: 450 });
  f.update({ activeGroupId: "group" });
  f.open();
  assert.equal(f.menu.querySelector('[data-arrange-scope="current"]').textContent, "当前分组");
  f.clickScope("all");
  assert.equal(f.menu.querySelector('[data-arrange-action="auto"]').disabled, true, "one whole group is one indivisible unit");
  f.clickScope("current");
  assert.equal(f.menu.querySelector('[data-arrange-action="auto"]').disabled, false);
  f.update({ activeGroupId: null });
  f.controller.sync();
  assert.equal(f.isOpen(), false);
  assert.equal(f.calls.committed.length, 0);
});

for (const [name, blocked, message] of [
  ["readonly", { canMutate: false }, /不可编辑/],
  ["busy", { interactionBusy: true }, /完成当前画布操作/],
]) {
  test(`${name} contexts reject both opening and actions from a previously open menu`, (t) => {
    const f = fixture(t, blocked);
    assert.equal(f.button.getAttribute("aria-disabled"), "true");
    f.open();
    assert.equal(f.isOpen(), false);
    assert.match(f.calls.notices.at(-1), message);
    f.update({ canMutate: true, interactionBusy: false });
    f.controller.sync();
    f.open();
    f.update(blocked);
    f.clickMode("vertical");
    assert.equal(f.isOpen(), false);
    assert.equal(f.calls.before, 0);
    assert.equal(f.calls.committed.length, 0);
    assert.match(f.calls.notices.at(-1), message);
  });
}

test("context is rechecked after finishing pending presentation transitions", (t) => {
  for (const change of [
    (f) => f.update({ canvas: { ...f.canvas } }),
    (f) => f.update({ selectedIds: new Set(["a"]) }),
    (f) => f.update({ canMutate: false }),
    (f) => f.update({ interactionBusy: true }),
  ]) {
    const f = fixture(t);
    f.before(() => change(f));
    f.open();
    f.clickMode("horizontal");
    assert.equal(f.calls.before, 1);
    assert.equal(f.calls.prepared.length, 0);
    assert.equal(f.calls.committed.length, 0);
    assert.equal(f.isOpen(), false);
  }
});

test("unchanged layout closes with feedback and creates no content transaction", (t) => {
  const f = fixture(t);
  f.canvas.nodes[1].x = 148;
  f.canvas.nodes[1].y = 0;
  const before = plain(f.canvas);
  f.open();
  f.clickMode("horizontal");
  assert.equal(f.calls.prepared.length, 1);
  assert.equal(f.calls.committed.length, 0);
  assert.equal(f.calls.completed.length, 0);
  assert.equal(f.isOpen(), false);
  assert.match(f.calls.notices.at(-1), /无需重复整理/);
  assert.deepEqual(plain(f.canvas), before);
});

test("one arrangement action commits once, closes, and subsequent stale clicks cannot repeat it", (t) => {
  const f = fixture(t);
  f.open();
  f.clickMode("horizontal");
  f.clickMode("horizontal");
  f.controller.arrange("horizontal");
  assert.equal(f.calls.committed.length, 1);
  assert.equal(f.calls.completed.length, 1);
  assert.equal(f.calls.completed[0].mode, "horizontal");
  assert.equal(f.isOpen(), false);
  assert.equal(f.button.getAttribute("aria-expanded"), "false");
  assert.equal(f.button.classList.contains("active"), false);
  f.open();
  f.clickMode("horizontal");
  assert.equal(f.calls.committed.length, 1, "rerunning the now-aligned layout stays a no-op");
});

test("plan and commit failures retain a reviewable menu without completion feedback", (t) => {
  const f = fixture(t);
  const before = plain(f.canvas);
  f.setPrepareFailure({ ok: false, reason: "分组关联异常" });
  f.open();
  f.clickMode("auto");
  assert.equal(f.isOpen(), true);
  assert.equal(f.calls.committed.length, 0);
  assert.equal(f.menu.querySelector("[data-arrange-status]").textContent, "分组关联异常");
  f.setPrepareFailure(null);
  f.setCommitAllowed(false);
  f.clickMode("auto");
  assert.equal(f.calls.committed.length, 1);
  assert.equal(f.calls.completed.length, 0);
  assert.equal(f.isOpen(), true);
  assert.match(f.menu.querySelector("[data-arrange-status]").textContent, /未完成/);
  assert.deepEqual(plain(f.canvas), before);
  f.setCommitAllowed(true);
  f.clickMode("auto");
  assert.equal(f.calls.committed.length, 2);
  assert.equal(f.calls.completed.length, 1);
  assert.equal(f.isOpen(), false);
});
