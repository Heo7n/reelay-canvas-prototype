import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../src/legacy-canvas/canvas-agent-result-placement.js", import.meta.url), "utf8");

function fixture(options = {}) {
  const runtime = vm.createContext({});
  vm.runInContext(source, runtime);
  let projectId = "project-a";
  let activeCanvasId = "canvas-a";
  let sequence = 0;
  let viewport = { left: 0, top: 0, right: 1000, bottom: 800 };
  const canvases = new Map(["canvas-a", "canvas-b"].map((id) => [id,
    { id, nodes: [], editable: true, tx: 123, ty: 456, scale: 0.8, selected: ["existing-selection"] }]));
  const created = [];
  const commits = [];
  const focused = [];
  const bounds = (node) => ({ left: node.x + (node.inset || 0), top: node.y,
    right: node.x + (node.inset || 0) + node.width, bottom: node.y + node.height });
  const controller = runtime.REELAY_AGENT_RESULT_PLACEMENT.createController({
    getProjectId: () => projectId,
    getCanvas: (id) => canvases.get(id),
    isEditable: (canvas) => canvas.editable,
    isAccessible: (canvas) => canvas.accessible !== false,
    focusNode: (canvas, node) => { focused.push({ canvas, node }); },
    getViewport: () => viewport,
    getNodeBounds: bounds,
    getNodeMedia: (node) => node.asset,
    createNode: (asset) => {
      const node = { id: `result-${++sequence}`, x: 0, y: 0,
        width: asset?.width || 200, height: asset?.height || 120, asset, inset: asset?.inset || 0 };
      created.push(node); options.onCreate?.(node, canvases); return node;
    },
    commitNode: (canvas, node) => {
      options.beforeCommit?.(canvas, node);
      if (options.rejectCommit) return false;
      canvas.nodes.push(node); commits.push({ canvas, node });
    },
  });
  const scope = { projectId, canvasId: "canvas-a", conversationId: "conversation-a" };
  const task = (fields = {}) => ({ id: `task-${sequence}`, scope: { ...scope }, status: "succeeded",
    result: { id: "same-output", type: "image" }, ...fields });
  const addNode = (fields = {}, canvasId = "canvas-a") => {
    const node = { id: `source-${canvases.get(canvasId).nodes.length}`, x: 100, y: 160, width: 200, height: 120,
      asset: { id: "source-asset", type: "image" }, ...fields };
    canvases.get(canvasId).nodes.push(node); return node;
  };
  return { controller, scope, task, canvases, created, commits, focused, bounds, addNode,
    canvas: canvases.get("canvas-a"), otherCanvas: canvases.get("canvas-b"),
    setProject: (value) => { projectId = value; },
    setViewport: (value) => { viewport = value; },
    activate: (value) => { activeCanvasId = value; },
    get activeCanvasId() { return activeCanvasId; },
  };
}

test("empty canvas places the actual visual bounds at the captured world viewport center", () => {
  const f = fixture();
  const target = f.controller.capture(f.scope, {});
  f.setViewport({ left: 5000, top: 4000, right: 6000, bottom: 4800 });
  const task = f.task({ result: { type: "image", width: 160, height: 240, inset: 75 } });
  const before = { tx: f.canvas.tx, ty: f.canvas.ty, scale: f.canvas.scale, selected: [...f.canvas.selected] };
  const placement = f.controller.place(task, target);
  assert.equal(placement.nodeId, f.created[0].id);
  assert.equal(placement.canvasId, "canvas-a");
  assert.deepEqual(f.bounds(f.created[0]), { left: 420, top: 280, right: 580, bottom: 520 });
  assert.deepEqual({ tx: f.canvas.tx, ty: f.canvas.ty, scale: f.canvas.scale, selected: f.canvas.selected }, before);
});

test("references anchor to the current right edge and top of the captured live nodes", () => {
  const f = fixture();
  const a = f.addNode({ asset: { id: "copy", sourceAssetId: "a" } });
  const b = f.addNode({ x: 360, y: 80, width: 300, asset: { id: "projection", librarySourceId: "b" } });
  const target = f.controller.capture(f.scope, { references: [{ id: "a" }], referenceSnapshot: [{ asset: { id: "b" } }] });
  a.x += 60; b.x += 80;
  const originalPositions = [a.x, a.y, b.x, b.y];
  f.controller.place(f.task(), target);
  assert.equal(f.created[0].x, 804);
  assert.equal(f.created[0].y, 80);
  assert.deepEqual([a.x, a.y, b.x, b.y], originalPositions);
});

test("reference results stack below collisions with spacing and do not overwrite existing nodes", () => {
  const f = fixture();
  const reference = f.addNode();
  f.addNode({ x: 364, y: 100, width: 300, height: 270, asset: { id: "unrelated-asset" } });
  const target = f.controller.capture(f.scope, { references: [reference.asset] });
  f.controller.place(f.task(), target);
  f.controller.place(f.task(), target);
  assert.deepEqual(f.created.map(({ x, y }) => ({ x, y })), [{ x: 364, y: 434 }, { x: 364, y: 618 }]);
  assert.equal(f.canvas.nodes.length, 4);
});

test("without references results choose nearby free positions, including earlier results of separate tasks", () => {
  const f = fixture();
  f.addNode({ x: 400, y: 340, width: 200, height: 120 });
  const target = f.controller.capture(f.scope, {});
  f.controller.place(f.task(), target);
  f.controller.place(f.task(), target);
  assert.deepEqual(f.created.map(({ x, y }) => ({ x, y })), [{ x: 400, y: 524 }, { x: 400, y: 156 }]);
  assert.equal(f.created[0].asset.id, f.created[1].asset.id, "shared fixture media must not deduplicate distinct tasks");
});

test("crowded unequal node bounds still leave the selected placement clear of every existing node", () => {
  const f = fixture();
  for (let row = -2; row < 3; row++) {
    for (let col = -2; col < 3; col++) {
      f.addNode({ x: 400 + col * 250, y: 340 + row * 165, width: 210, height: 140 });
    }
  }
  const existing = [...f.canvas.nodes];
  f.controller.place(f.task({ result: { type: "video", width: 280, height: 170 } }), f.controller.capture(f.scope, {}));
  const result = f.bounds(f.created[0]);
  for (const node of existing) {
    const obstacle = f.bounds(node);
    assert.ok(result.right + 48 <= obstacle.left || result.left >= obstacle.right + 48
      || result.bottom + 48 <= obstacle.top || result.top >= obstacle.bottom + 48);
  }
});

test("completing in another active canvas writes only the original captured CanvasRecord", () => {
  const f = fixture();
  const target = f.controller.capture(f.scope, {});
  f.activate("canvas-b");
  f.controller.place(f.task(), target);
  assert.equal(f.canvas.nodes.length, 1);
  assert.equal(f.otherCanvas.nodes.length, 0);
  assert.equal(f.activeCanvasId, "canvas-b");
  assert.equal(f.commits[0].canvas, f.canvas);
});

test("a completed task commits once and does not recreate a node after undo or deletion", () => {
  const f = fixture();
  const target = f.controller.capture(f.scope, {});
  const task = f.task();
  const placement = f.controller.place(task, target);
  assert.equal(f.controller.place(task, target), placement);
  f.canvas.nodes.length = 0;
  assert.equal(f.controller.place(task, target), placement);
  assert.equal(f.created.length, 1);
  assert.equal(f.commits.length, 1);
  assert.equal(f.canvas.nodes.length, 0);
});

test("removed reference objects and replacements with identical ids are not followed", () => {
  const f = fixture();
  const reference = f.addNode();
  const target = f.controller.capture(f.scope, { references: [reference.asset] });
  f.canvas.nodes.length = 0;
  f.addNode({ ...reference, x: 4000, y: 3000 });
  f.controller.place(f.task(), target);
  assert.deepEqual({ x: f.created[0].x, y: f.created[0].y }, { x: 400, y: 340 });
});

test("deleted or replaced destination is rejected permanently even if the original is later restored", () => {
  for (const replacement of [null, { id: "canvas-a", nodes: [], editable: true }]) {
    const f = fixture();
    const target = f.controller.capture(f.scope, {});
    const task = f.task();
    if (replacement) f.canvases.set("canvas-a", replacement); else f.canvases.delete("canvas-a");
    assert.equal(f.controller.place(task, target), null);
    f.canvases.set("canvas-a", f.canvas);
    assert.equal(f.controller.place(task, target), null);
    assert.equal(f.created.length, 0);
    assert.equal(f.canvas.nodes.length, 0);
  }
});

test("project changes and revoked write access prevent delayed writes, with no later recovery write", () => {
  for (const reason of ["project", "permission"]) {
    const f = fixture();
    const target = f.controller.capture(f.scope, {});
    const task = f.task();
    if (reason === "project") f.setProject("project-b"); else f.canvas.editable = false;
    assert.equal(f.controller.place(task, target), null);
    f.setProject("project-a"); f.canvas.editable = true;
    assert.equal(f.controller.place(task, target), null);
    assert.equal(f.created.length, 0);
  }
});

test("capture refuses foreign, missing or read-only canvases and placement refuses foreign scope or forged targets", () => {
  const f = fixture();
  assert.equal(f.controller.capture({ ...f.scope, projectId: "elsewhere" }, {}), null);
  assert.equal(f.controller.capture({ ...f.scope, canvasId: "missing" }, {}), null);
  f.canvas.editable = false;
  assert.equal(f.controller.capture(f.scope, {}), null);
  f.canvas.editable = true;
  const target = f.controller.capture(f.scope, {});
  assert.equal(f.controller.place(f.task({ scope: { ...f.scope, canvasId: "canvas-b" } }), target), null);
  assert.equal(f.controller.place(f.task(), { ...target }), null);
  assert.equal(f.controller.place(f.task(), null), null);
  assert.equal(f.commits.length, 0);
});

test("queued, running, canceled and failed tasks do not place media", () => {
  const f = fixture();
  const target = f.controller.capture(f.scope, {});
  for (const status of ["queued", "running", "canceled", "failed"]) {
    assert.equal(f.controller.place(f.task({ status }), target), null);
  }
  const task = f.task({ status: "running" });
  assert.equal(f.controller.place(task, target), null);
  task.status = "succeeded";
  assert.ok(f.controller.place(task, target));
  assert.equal(f.created.length, 1);
});

test("reentrant completion cannot duplicate a commit and rejected commits are not retried", () => {
  let task; let target; let nested;
  const f = fixture({ beforeCommit: () => { nested = f.controller.place(task, target); } });
  target = f.controller.capture(f.scope, {}); task = f.task();
  assert.ok(f.controller.place(task, target));
  assert.equal(nested, null);
  assert.equal(f.commits.length, 1);
  const rejected = fixture({ rejectCommit: true });
  const rejectedTask = rejected.task();
  const rejectedTarget = rejected.controller.capture(rejected.scope, {});
  assert.equal(rejected.controller.place(rejectedTask, rejectedTarget), null);
  assert.equal(rejected.controller.place(rejectedTask, rejectedTarget), null);
  assert.equal(rejected.created.length, 1);
});

test("identity is rechecked after node construction before calling the commit adapter", () => {
  const f = fixture({ onCreate: (_node, canvases) => { canvases.delete("canvas-a"); } });
  const target = f.controller.capture(f.scope, {});
  assert.equal(f.controller.place(f.task(), target), null);
  assert.equal(f.commits.length, 0);
});

function deliver(f) {
  const task = f.task();
  const placement = f.controller.place(task, f.controller.capture(f.scope, {}));
  task.addedNodeId = placement.nodeId; task.addedCanvasId = placement.canvasId;
  return task;
}

test("locate resolves the delivered node identity in its original canvas without inserting or moving content", () => {
  const f = fixture();
  const task = deliver(f);
  const node = f.created[0];
  node.x = 4800; node.y = -2400;
  f.activate("canvas-b");
  assert.equal(f.controller.locate(task), true);
  assert.equal(f.controller.locate(task), true);
  assert.equal(f.focused.length, 2);
  assert.equal(f.focused[0].canvas, f.canvas);
  assert.equal(f.focused[0].node, node);
  assert.deepEqual([node.x, node.y], [4800, -2400]);
  assert.equal(f.created.length, 1);
  assert.equal(f.commits.length, 1);
});

test("locate rejects deleted results and same-id replacement nodes and canvases", () => {
  for (const reason of ["removed-node", "replaced-node", "removed-canvas", "replaced-canvas"]) {
    const f = fixture();
    const task = deliver(f);
    if (reason === "removed-node") f.canvas.nodes.length = 0;
    if (reason === "replaced-node") f.canvas.nodes[0] = { ...f.canvas.nodes[0] };
    if (reason === "removed-canvas") f.canvases.delete(f.canvas.id);
    if (reason === "replaced-canvas") f.canvases.set(f.canvas.id, { ...f.canvas });
    assert.equal(f.controller.locate(task), false);
    assert.equal(f.focused.length, 0);
    assert.equal(f.created.length, 1);
    assert.equal(f.commits.length, 1);
  }
});

test("locate permits read-only browsing but refuses inaccessible projects, foreign scopes and altered delivery ids", () => {
  const f = fixture();
  const task = deliver(f);
  f.canvas.editable = false;
  assert.equal(f.controller.locate(task), true, "locating visible content does not require write access");
  f.canvas.accessible = false;
  assert.equal(f.controller.locate(task), false);
  f.canvas.accessible = true;
  f.setProject("other-project");
  assert.equal(f.controller.locate(task), false);
  f.setProject(f.scope.projectId);
  task.scope.canvasId = "canvas-b";
  assert.equal(f.controller.locate(task), false);
  task.scope.canvasId = f.scope.canvasId;
  task.addedNodeId = "replaced-id";
  assert.equal(f.controller.locate(task), false);
  assert.equal(f.focused.length, 1);
});

test("locate requires a successful task and its acknowledged automatic delivery", () => {
  const f = fixture();
  assert.equal(f.controller.locate(f.task()), false);
  const task = f.task();
  f.controller.place(task, f.controller.capture(f.scope, {}));
  assert.equal(f.controller.locate(task), false);
  task.addedNodeId = f.created[0].id; task.addedCanvasId = f.canvas.id;
  task.status = "failed";
  assert.equal(f.controller.locate(task), false);
  assert.equal(f.focused.length, 0);
});
