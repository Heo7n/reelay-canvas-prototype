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
    { id, nodes: [], connections: [], editable: true, tx: 123, ty: 456, scale: 0.8, selected: ["existing-selection"] }]));
  const created = [];
  const commits = [];
  const focused = [];
  const updates = [];
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
    createPendingNode: (task, sourceNode) => {
      const size = task.requestedSize || sourceNode || {};
      const node = { id: `pending-${++sequence}`, x: 0, y: 0,
        width: size.width || 200, height: size.height || 120, inset: size.inset || 0,
        pendingGeneration: { taskId: task.id, status: task.status } };
      created.push(node); options.onCreate?.(node, canvases); return node;
    },
    commitPendingNode: (canvas, node, sourceNode) => {
      canvas.nodes.push(node);
      if (sourceNode) canvas.connections.push({ sourceNodeId: sourceNode.id, targetNodeId: node.id });
    },
    updatePendingNode: (canvas, node, task) => {
      node.pendingGeneration.status = task.status; updates.push({ canvas, node });
    },
    completePendingNode: (canvas, node, asset) => {
      options.beforeCommit?.(canvas, node);
      if (options.rejectCommit) return false;
      delete node.pendingGeneration; node.asset = asset; commits.push({ canvas, node });
    },
    removePendingNode: (canvas, node) => {
      canvas.nodes = canvas.nodes.filter((candidate) => candidate !== node);
      canvas.connections = canvas.connections.filter((edge) => edge.sourceNodeId !== node.id && edge.targetNodeId !== node.id);
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
  const complete = (currentTask, target) => {
    currentTask.status = "queued";
    controller.begin(currentTask, target);
    currentTask.status = "succeeded";
    return controller.place(currentTask, target);
  };
  return { controller, scope, task, complete, canvases, created, commits, focused, updates, bounds, addNode,
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
  const task = f.task({ requestedSize: { width: 160, height: 240, inset: 75 } });
  const before = { tx: f.canvas.tx, ty: f.canvas.ty, scale: f.canvas.scale, selected: [...f.canvas.selected] };
  const placement = f.complete(task, target);
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
  f.complete(f.task(), target);
  assert.equal(f.created[0].x, 804);
  assert.equal(f.created[0].y, 80);
  assert.deepEqual([a.x, a.y, b.x, b.y], originalPositions);
});

test("reference results stack below collisions with spacing and do not overwrite existing nodes", () => {
  const f = fixture();
  const reference = f.addNode();
  f.addNode({ x: 364, y: 100, width: 300, height: 270, asset: { id: "unrelated-asset" } });
  const target = f.controller.capture(f.scope, { references: [reference.asset] });
  f.complete(f.task(), target);
  f.complete(f.task(), target);
  assert.deepEqual(f.created.map(({ x, y }) => ({ x, y })), [{ x: 364, y: 434 }, { x: 364, y: 618 }]);
  assert.equal(f.canvas.nodes.length, 4);
});

test("without references results choose nearby free positions, including earlier results of separate tasks", () => {
  const f = fixture();
  f.addNode({ x: 400, y: 340, width: 200, height: 120 });
  const target = f.controller.capture(f.scope, {});
  f.complete(f.task(), target);
  f.complete(f.task(), target);
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
  f.complete(f.task({ requestedSize: { width: 280, height: 170 } }), f.controller.capture(f.scope, {}));
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
  f.complete(f.task(), target);
  assert.equal(f.canvas.nodes.length, 1);
  assert.equal(f.otherCanvas.nodes.length, 0);
  assert.equal(f.activeCanvasId, "canvas-b");
  assert.equal(f.commits[0].canvas, f.canvas);
});

test("a completed task commits once and does not recreate a node after undo or deletion", () => {
  const f = fixture();
  const target = f.controller.capture(f.scope, {});
  const task = f.task();
  const placement = f.complete(task, target);
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
  f.complete(f.task(), target);
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
  assert.equal(f.complete(f.task(), { ...target }), null);
  assert.equal(f.complete(f.task(), null), null);
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
  f.controller.begin(task, target);
  task.status = "succeeded";
  assert.ok(f.controller.place(task, target));
  assert.equal(f.created.length, 1);
});

test("reentrant completion cannot duplicate a commit and rejected commits are not retried", () => {
  let task; let target; let nested;
  const f = fixture({ beforeCommit: () => { nested = f.controller.place(task, target); } });
  target = f.controller.capture(f.scope, {}); task = f.task();
  assert.ok(f.complete(task, target));
  assert.equal(nested, null);
  assert.equal(f.commits.length, 1);
  const rejected = fixture({ rejectCommit: true });
  const rejectedTask = rejected.task();
  const rejectedTarget = rejected.controller.capture(rejected.scope, {});
  assert.equal(rejected.complete(rejectedTask, rejectedTarget), null);
  assert.equal(rejected.controller.place(rejectedTask, rejectedTarget), null);
  assert.equal(rejected.created.length, 1);
});

test("identity is rechecked after node construction before calling the commit adapter", () => {
  const f = fixture({ onCreate: (_node, canvases) => { canvases.delete("canvas-a"); } });
  const target = f.controller.capture(f.scope, {});
  assert.equal(f.complete(f.task(), target), null);
  assert.equal(f.commits.length, 0);
});

function deliver(f) {
  const task = f.task();
  const placement = f.complete(task, f.controller.capture(f.scope, {}));
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
  f.complete(task, f.controller.capture(f.scope, {}));
  assert.equal(f.controller.locate(task), false);
  task.addedNodeId = f.created[0].id; task.addedCanvasId = f.canvas.id;
  task.status = "failed";
  assert.equal(f.controller.locate(task), false);
  assert.equal(f.focused.length, 0);
});

function draftTarget(f, { nodeOrigin = true } = {}) {
  const source = f.addNode({ asset: { id: "draft-asset", type: "video",
    generation: { stage: "draft", taskId: "draft-task", resultId: "draft-asset" } } });
  const target = f.controller.capture(f.scope, { generationStage: "final",
    sourceDraftTaskId: "draft-task", sourceResultId: "draft-asset", sourceNodeId: nodeOrigin ? source.id : "" });
  return { source, target };
}

test("node final submission immediately connects a transient result then completes that exact moved node once", () => {
  const f = fixture(); const { source, target } = draftTarget(f);
  const task = f.task({ status: "queued", result: { type: "video", id: "final-result" } });
  const node = f.controller.begin(task, target);
  assert.equal(f.controller.begin(task, target), node);
  assert.equal(f.canvas.nodes.length, 2);
  assert.deepEqual(f.canvas.connections, [{ sourceNodeId: source.id, targetNodeId: node.id }]);
  assert.equal(node.x, source.x + source.width + 64);
  assert.equal(node.pendingGeneration.taskId, task.id);
  assert.equal(node.asset, undefined);
  assert.equal(f.commits.length, 0, "no completed asset is committed while the task runs");
  node.x += 500; node.y += 300; f.activate("canvas-b"); task.status = "succeeded";
  const placement = f.controller.place(task, target);
  assert.equal(placement.nodeId, node.id);
  assert.equal(f.canvas.nodes[1], node);
  assert.equal(node.x, source.x + source.width + 64 + 500);
  assert.equal(node.asset, task.result);
  assert.equal(node.pendingGeneration, undefined);
  assert.equal(f.controller.place(task, target), placement);
  assert.equal(f.commits.length, 1);
  assert.equal(f.otherCanvas.nodes.length, 0);
});

test("conversation final immediately connects to the matching live sample and completes that node", () => {
  const f = fixture(); const { source, target } = draftTarget(f, { nodeOrigin: false });
  const task = f.task({ status: "queued" });
  const node = f.controller.begin(task, target);
  assert.equal(f.canvas.nodes.length, 2);
  assert.deepEqual(f.canvas.connections, [{ sourceNodeId: source.id, targetNodeId: node.id }]);
  task.status = "succeeded";
  assert.equal(f.controller.place(task, target).nodeId, node.id);
  assert.equal(f.canvas.nodes.length, 2);
  assert.equal(node.asset, task.result);
});

test("conversation final without a live sample creates an unconnected pending node", () => {
  const f = fixture(); const { target } = draftTarget(f, { nodeOrigin: false });
  f.canvas.nodes = [];
  const task = f.task({ status: "queued" });
  const node = f.controller.begin(task, target);
  assert.equal(f.canvas.nodes[0], node);
  assert.equal(f.canvas.connections.length, 0);
  task.status = "succeeded";
  assert.equal(f.controller.place(task, target).nodeId, node.id);
});

test("ordinary conversation tasks reserve distinct nodes immediately without source connections", () => {
  const f = fixture(); const source = f.addNode();
  const target = f.controller.capture(f.scope, { references: [source.asset] });
  const first = f.task({ status: "queued" });
  const firstNode = f.controller.begin(first, target);
  const second = f.task({ status: "running" });
  const secondNode = f.controller.begin(second, target);
  assert.notEqual(firstNode, secondNode);
  assert.equal(f.controller.begin(first, target), firstNode);
  assert.deepEqual(f.canvas.nodes, [source, firstNode, secondNode]);
  assert.equal(f.canvas.connections.length, 0);
  assert.equal(firstNode.asset, undefined);
  firstNode.x += 250;
  const movedX = firstNode.x;
  first.status = "succeeded";
  assert.equal(f.controller.place(first, target).nodeId, firstNode.id);
  assert.equal(firstNode.x, movedX);
  assert.equal(firstNode.asset, first.result);
  second.status = "canceled";
  f.controller.discard(second);
  assert.deepEqual(f.canvas.nodes, [source, firstNode]);
});

test("completion without accepted pending placement never inserts a late node", () => {
  const f = fixture(); const target = f.controller.capture(f.scope, {});
  const task = f.task();
  assert.equal(f.controller.place(task, target), null);
  assert.equal(f.created.length, 0);
  assert.equal(f.canvas.nodes.length, 0);
});

test("pending status follows the task in its original canvas and rejects stale object updates", () => {
  for (const reason of ["active-canvas", "project", "canvas", "permission", "node"]) {
    const f = fixture(); const target = f.controller.capture(f.scope, {});
    const task = f.task({ status: "queued" }); const node = f.controller.begin(task, target);
    assert.equal(node.pendingGeneration.status, "queued");
    if (reason === "active-canvas") f.activate("canvas-b");
    if (reason === "project") f.setProject("another-project");
    if (reason === "canvas") f.canvases.set(f.canvas.id, { ...f.canvas, nodes: [] });
    if (reason === "permission") f.canvas.editable = false;
    if (reason === "node") f.canvas.nodes = [{ ...node }];
    task.status = "running";
    assert.equal(f.controller.update(task), reason === "active-canvas");
    assert.equal(f.updates.length, reason === "active-canvas" ? 1 : 0);
    if (reason === "active-canvas") {
      assert.equal(f.updates[0].canvas, f.canvas);
      assert.equal(f.updates[0].node, node);
      assert.equal(node.pendingGeneration.status, "running");
      assert.equal(f.otherCanvas.nodes.length, 0);
      task.status = "succeeded";
      assert.equal(f.controller.update(task), false);
    }
  }
});

test("ordinary pending nodes clean up on cancellation, failure, invalidation and deletion without late recreation", () => {
  for (const reason of ["canceled", "failed", "project", "canvas", "permission", "deleted", "replaced"]) {
    const f = fixture(); const other = f.addNode();
    const target = f.controller.capture(f.scope, {});
    const task = f.task({ status: "queued" });
    const node = f.controller.begin(task, target);
    if (reason === "project") f.setProject("other-project");
    if (reason === "canvas") f.canvases.set(f.canvas.id, { ...f.canvas, nodes: [] });
    if (reason === "permission") f.canvas.editable = false;
    if (reason === "deleted") f.canvas.nodes = [other];
    const replacement = { ...node, pendingGeneration: undefined };
    if (reason === "replaced") f.canvas.nodes = [other, replacement];
    if (["canceled", "failed"].includes(reason)) {
      task.status = reason;
      assert.equal(f.controller.discard(task), true);
      assert.equal(f.controller.discard(task), false);
    } else {
      task.status = "succeeded";
      assert.equal(f.controller.place(task, target), null);
    }
    assert.deepEqual(f.canvas.nodes, reason === "replaced" ? [other, replacement] : [other]);
    assert.equal(f.commits.length, 0);
    // Late callbacks cannot reserve a second placeholder, even if eligibility returns.
    f.setProject(f.scope.projectId); f.canvas.editable = true; f.canvases.set(f.canvas.id, f.canvas);
    task.status = "running";
    assert.equal(f.controller.begin(task, target), null);
    task.status = "succeeded";
    assert.equal(f.controller.place(task, target), null);
    assert.equal(f.created.length, 1);
  }
});

test("cancel or failure removes only its transient node and connection, idempotently", () => {
  for (const status of ["canceled", "failed"]) {
    const f = fixture(); const { source, target } = draftTarget(f);
    const task = f.task({ status: "queued" }); f.controller.begin(task, target);
    task.status = status;
    assert.equal(f.controller.discard(task), true);
    assert.equal(f.controller.discard(task), false);
    assert.deepEqual(f.canvas.nodes, [source]);
    assert.equal(f.canvas.connections.length, 0);
    assert.equal(f.controller.place(task, target), null);
    assert.equal(f.commits.length, 0);
  }
});

test("deleting or replacing a pending node never recreates a result on completion", () => {
  for (const replace of [false, true]) {
    const f = fixture(); const { source, target } = draftTarget(f);
    const task = f.task({ status: "queued" }); const pending = f.controller.begin(task, target);
    const replacement = { ...pending, pendingGeneration: undefined };
    f.canvas.nodes = replace ? [source, replacement] : [source];
    task.status = "succeeded";
    assert.equal(f.controller.place(task, target), null);
    assert.equal(f.controller.place(task, target), null);
    assert.equal(f.canvas.nodes.length, replace ? 2 : 1);
    assert.equal(f.commits.length, 0);
  }
});

test("final pending delivery rechecks original project, canvas identity and permissions", () => {
  for (const invalidation of ["project", "canvas", "permission"]) {
    const f = fixture(); const { source, target } = draftTarget(f);
    const task = f.task({ status: "queued" }); f.controller.begin(task, target);
    if (invalidation === "project") f.setProject("other-project");
    if (invalidation === "canvas") f.canvases.set(f.canvas.id, { ...f.canvas, nodes: [] });
    if (invalidation === "permission") f.canvas.editable = false;
    task.status = "succeeded";
    assert.equal(f.controller.place(task, target), null);
    assert.deepEqual(f.canvas.nodes, [source]);
    assert.equal(f.canvas.connections.length, 0);
    assert.equal(f.commits.length, 0);
  }
});

test("node final capture and pending creation require the original live sample node", () => {
  const f = fixture(); const { source, target } = draftTarget(f);
  assert.equal(f.controller.capture(f.scope, { generationStage: "final", sourceNodeId: "missing",
    sourceDraftTaskId: "draft-task", sourceResultId: "draft-asset" }), null);
  f.canvas.nodes = [{ ...source }];
  const task = f.task({ status: "queued" });
  assert.equal(f.controller.begin(task, target), null);
  task.status = "succeeded";
  assert.equal(f.controller.place(task, target), null);
  assert.equal(f.canvas.nodes.length, 1);
});
