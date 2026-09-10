import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const root = new URL("../", import.meta.url);
const html = await readFile(new URL("index.html", root), "utf8");
const sources = await Promise.all(["layout", "scope", "controller"].map((name) =>
  readFile(new URL(`src/legacy-canvas/canvas-arrange-${name}.js`, root), "utf8")));

function fixture(t) {
  const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const { window } = dom;
  sources.forEach((source) => window.eval(source));
  const button = window.document.querySelector('[data-canvas-tool="organize"]');
  const menu = window.document.querySelector("#canvasArrangeMenu");
  const canvas = { id: "canvas", nodes: [
    { id: "a", x: 0, y: 0, width: 100, height: 80 },
    { id: "b", x: 350, y: 240, width: 100, height: 80 },
  ], groups: [], connections: [] };
  const state = { canvas, selectedIds: new Set(["a"]), activeGroupId: null, canMutate: true, interactionBusy: false };
  const calls = { commits: [], notices: [], renders: 0, complete: 0 };
  let beforeAction = () => {};
  let commitAllowed = true;
  const getContext = () => ({ ...state,
    nodes: state.canvas.nodes, groups: state.canvas.groups, connections: state.canvas.connections,
    getNodeBounds: (node) => ({ left: node.x, top: node.y, width: node.width, height: node.height }),
    getGroupBounds: (group) => ({ left: group.x, top: group.y, width: group.width, height: group.height }),
    planArrangement: window.REELAY_CANVAS_ARRANGE_LAYOUT.planArrangement,
  });
  const controller = window.REELAY_CANVAS_ARRANGE_CONTROLLER.create({
    button, menu, getContext,
    describeScope: window.REELAY_CANVAS_ARRANGE_SCOPE.describeScope,
    prepareArrangement: window.REELAY_CANVAS_ARRANGE_SCOPE.prepareArrangement,
    beforeArrange: () => beforeAction(),
    commit(plan) {
      calls.commits.push(plan);
      if (!commitAllowed) return { ok: false };
      for (const position of plan.positions) Object.assign(state.canvas.nodes.find(({ id }) => id === position.id), position);
      return { ok: true };
    },
    onPreviewChange() { calls.renders++; },
    onComplete() { calls.complete++; },
    notify(message) { calls.notices.push(message); },
    onOpenChange() {},
  });
  controller.sync();
  return { window, canvas, state, button, menu, controller, calls,
    before: (callback) => { beforeAction = callback; }, failCommit: () => { commitAllowed = false; },
    open: (options) => controller.toggle(options),
    decide: (decision) => menu.querySelector(`[data-arrange-decision="${decision}"]`).click(),
    isOpen: () => !menu.classList.contains("hidden"),
  };
}

test("one click previews the entire canvas without mutating content and exposes only two decisions", (t) => {
  const f = fixture(t);
  const before = JSON.stringify(f.canvas);
  f.open({ focus: true });
  assert.equal(f.isOpen(), true);
  assert.equal(f.menu.querySelectorAll("button").length, 2);
  assert.equal(f.menu.querySelectorAll("[data-arrange-scope], [data-arrange-action]").length, 0);
  assert.match(f.menu.textContent, /是否保留此次整理结果？/);
  assert.equal(JSON.stringify(f.canvas), before);
  assert.notEqual(f.controller.getNodePosition(f.canvas.nodes[1]).y, f.canvas.nodes[1].y);
  assert.equal(f.calls.commits.length, 0);
  assert.equal(f.window.document.activeElement.dataset.arrangeDecision, "restore");
  f.decide("keep");
  assert.equal(f.calls.commits.length, 1);
  assert.equal(f.calls.commits[0].affectedNodeIds.length, 2);
  assert.equal(f.isOpen(), false);
  assert.equal(f.controller.getNodePosition(f.canvas.nodes[1]), null);
  f.decide("keep");
  assert.equal(f.calls.commits.length, 1);
});

test("restore and a repeated trigger discard only the presentation", (t) => {
  const f = fixture(t);
  const before = JSON.stringify(f.canvas);
  f.open(); f.decide("restore");
  assert.equal(f.isOpen(), false);
  assert.equal(f.calls.commits.length, 0);
  assert.equal(JSON.stringify(f.canvas), before);
  f.open(); f.open();
  assert.equal(f.isOpen(), false);
  assert.equal(f.calls.commits.length, 0);
});

test("Escape and undo cancel preview without reaching the canvas undo handler", (t) => {
  const f = fixture(t);
  let downstream = 0;
  f.window.document.addEventListener("keydown", () => downstream++);
  for (const key of [{ key: "Escape" }, { key: "z", ctrlKey: true }, { key: "z", metaKey: true }]) {
    f.open();
    const event = new f.window.KeyboardEvent("keydown", { ...key, bubbles: true, cancelable: true });
    f.menu.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(f.isOpen(), false);
    assert.equal(f.window.document.activeElement, f.button);
  }
  assert.equal(downstream, 0);
  assert.equal(f.calls.commits.length, 0);
});

test("outside pointer or wheel discards preview before another canvas interaction", (t) => {
  const f = fixture(t);
  f.open();
  f.menu.dispatchEvent(new f.window.MouseEvent("pointerdown", { bubbles: true }));
  assert.equal(f.isOpen(), true);
  f.window.document.body.dispatchEvent(new f.window.MouseEvent("pointerdown", { bubbles: true }));
  assert.equal(f.isOpen(), false);
  f.open();
  f.window.document.body.dispatchEvent(new f.window.WheelEvent("wheel", { bubbles: true }));
  assert.equal(f.isOpen(), false);
  assert.equal(f.calls.commits.length, 0);
});

test("selection changes and task metadata do not change the whole-canvas preview", (t) => {
  const f = fixture(t);
  f.open();
  f.state.selectedIds = new Set(["b"]);
  f.canvas.nodes[0].generatedAsset = { id: "result", url: "/result.png" };
  f.canvas.nodes[0].generating = false;
  f.controller.sync();
  assert.equal(f.isOpen(), true);
  f.decide("keep");
  assert.equal(f.canvas.nodes[0].generatedAsset.id, "result");
});

test("same-ID canvas or node replacement invalidates the preview without touching either instance", (t) => {
  const f = fixture(t);
  f.open();
  const original = f.canvas.nodes[1];
  f.state.canvas = structuredClone(f.canvas);
  assert.equal(f.controller.getNodePosition(original), null);
  f.decide("keep");
  assert.equal(f.calls.commits.length, 0);
  assert.equal(f.isOpen(), false);
  f.open();
  f.state.canvas.nodes[1] = { ...f.state.canvas.nodes[1] };
  f.controller.sync();
  assert.equal(f.isOpen(), false);
});

test("geometry, membership or connection changes invalidate an outdated plan", (t) => {
  for (const change of [
    (f) => { f.canvas.nodes[0].x++; },
    (f) => { f.canvas.nodes[0].width++; },
    (f) => { f.canvas.nodes[0].groupId = "new-group"; },
    (f) => { f.canvas.connections.push({ id: "new", sourceNodeId: "a", targetNodeId: "b" }); },
  ]) {
    const f = fixture(t);
    f.open(); change(f); f.controller.sync();
    assert.equal(f.isOpen(), false);
    assert.equal(f.calls.commits.length, 0);
  }
});

test("read-only and active gestures are checked before preview and before commit", (t) => {
  const f = fixture(t);
  for (const field of ["canMutate", "interactionBusy"]) {
    const unavailable = field === "canMutate" ? false : true;
    f.state[field] = unavailable;
    f.open(); assert.equal(f.isOpen(), false);
    f.state[field] = !unavailable;
    f.open(); assert.equal(f.isOpen(), true);
    f.state[field] = unavailable;
    f.decide("keep"); assert.equal(f.isOpen(), false);
    f.state[field] = !unavailable;
  }
  f.before(() => { f.state.canMutate = false; });
  f.open();
  assert.equal(f.calls.commits.length, 0);
});

test("unchanged and empty canvases create no preview or commit", (t) => {
  const f = fixture(t);
  f.open(); f.decide("keep"); f.open();
  assert.equal(f.isOpen(), false);
  assert.equal(f.calls.commits.length, 1);
  f.canvas.nodes = [];
  f.open();
  assert.equal(f.isOpen(), false);
  assert.equal(f.button.getAttribute("aria-disabled"), "true");
});

test("a rejected commit removes the visual preview without claiming success", (t) => {
  const f = fixture(t);
  const before = JSON.stringify(f.canvas);
  f.open(); f.failCommit(); f.decide("keep");
  assert.equal(f.calls.complete, 0);
  assert.equal(f.isOpen(), false);
  assert.equal(JSON.stringify(f.canvas), before);
});
