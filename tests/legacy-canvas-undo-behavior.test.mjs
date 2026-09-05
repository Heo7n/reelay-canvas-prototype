import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const root = new URL("../", import.meta.url);
const html = await readFile(new URL("index.html", root), "utf8");
const scriptDocument = new JSDOM(html);
const scriptPaths = [...scriptDocument.window.document.querySelectorAll("script[src]")]
  .map((script) => script.getAttribute("src"))
  .filter((src) => src.startsWith("./"))
  .map((src) => src.split("?")[0]);
scriptDocument.window.close();
const scripts = await Promise.all(scriptPaths.map(async (path) => ({
  path,
  source: await readFile(new URL(path, root), "utf8"),
})));

// Load the real entry and controllers; only browser scheduling/media APIs are stubbed.
// The test-only export exposes state without changing the shipped application.
function createHarness(t) {
  const dom = new JSDOM(html, {
    url: "http://reelay.test/index.html",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  t.after(() => dom.window.close());
  const { window } = dom;
  const timers = new Map();
  let nextTimerId = 0;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.structuredClone = structuredClone;
  window.requestAnimationFrame = () => 1;
  window.cancelAnimationFrame = () => {};
  window.setTimeout = (callback) => {
    const id = ++nextTimerId;
    timers.set(id, callback);
    return id;
  };
  window.clearTimeout = (id) => timers.delete(id);
  window.URL.createObjectURL = () => "blob:http://reelay.test/mock";
  window.URL.revokeObjectURL = () => {};
  window.Element.prototype.setPointerCapture = () => {};
  window.Element.prototype.releasePointerCapture = () => {};
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  for (const { path, source } of scripts) {
    window.eval(source + (path === "./app.js"
      ? "\nwindow.canvasTest = { state, canvasRuntimeStore, canvasNodeDragController, canvasEntityUse };"
      : ""));
  }
  const { state, canvasRuntimeStore, canvasNodeDragController } = window.canvasTest;
  function node(id, overrides = {}) {
    return Object.assign(window.defaultGeneratorNode(10, 20, "video"), {
      id, prompt: "一只狐狸走过森林", expanded: false, ...overrides,
    });
  }
  function canvas(id, nodes = [], groups = [], connections = []) {
    return { ...window.createCanvasRecord(id), id, nodes, groups, connections };
  }
  function install(...canvases) {
    for (const canvas of canvases) {
      canvas.connections = window.REELAY_CANVAS_CONNECTIONS.normalizeConnections(canvas.connections, canvas.nodes);
    }
    canvasRuntimeStore.replaceCanvases(canvases, canvases[0].id);
    window.clearSelection();
    window.render();
  }
  function fireTimer(id) {
    const callback = timers.get(id);
    assert.equal(typeof callback, "function", "expected a scheduled task callback");
    timers.delete(id);
    callback();
  }
  function moveNode(nodeId, dx, dy) {
    const current = state.nodes.find((item) => item.id === nodeId);
    const action = canvasNodeDragController.promote({
      type: "drag-candidate", pointerId: 1, ids: [nodeId], activeId: nodeId,
      altKey: false, startClientX: 0, startClientY: 0,
      origins: [{ id: nodeId, x: current.x, y: current.y }],
      groups: state.groups.map(window.cloneGroupState),
    }, { clientX: dx, clientY: dy });
    canvasNodeDragController.finish(action);
    state.action = null;
  }
  return { window, state, node, canvas, install, fireTimer, moveNode, timers };
}

function group(id, nodeIds, overrides = {}) {
  return { id, nodeIds, name: id, x: 0, y: 0, width: 1200, height: 900, z: 1, layoutMenuOpen: false, ...overrides };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertMembership(canvas) {
  for (const current of canvas.groups) {
    for (const id of current.nodeIds) {
      assert.equal(canvas.nodes.find((node) => node.id === id)?.groupId, current.id);
    }
  }
  for (const node of canvas.nodes) {
    if (node.groupId) assert.ok(canvas.groups.find((group) => group.id === node.groupId)?.nodeIds.includes(node.id));
  }
}

for (const selected of [["a"], ["a", "c"], ["a", "b", "c"], ["a", "b", "c", "d"]]) {
  test(`deleting ${selected.join(",")} preserves remaining groups and undo restores membership and order`, (t) => {
    const h = createHarness(t);
    const nodes = ["a", "b", "c", "d", "outside"].map((id) => h.node(id, {
      ...(id !== "outside" ? { groupId: ["a", "b"].includes(id) ? "first" : "second" } : {}),
    }));
    const groups = [group("first", ["a", "b"]), group("untouched-empty", []), group("second", ["c", "d"])];
    const connections = [
      { id: "a-b", sourceNodeId: "a", targetNodeId: "b" },
      { id: "c-d", sourceNodeId: "c", targetNodeId: "d" },
      { id: "b-outside", sourceNodeId: "b", targetNodeId: "outside" },
    ];
    const first = h.canvas("one", nodes, groups, connections);
    const second = h.canvas("two", [h.node("a")], [group("other-empty", [])]);
    h.install(first, second);
    const beforeGroups = plain(first.groups);
    const beforeConnections = plain(first.connections);
    const otherCanvas = plain(second);
    h.window.setSelection(selected);
    h.window.deleteSelectedNodes(true);
    assert.deepEqual(plain(first.nodes.map((node) => node.id)), ["a", "b", "c", "d", "outside"].filter((id) => !selected.includes(id)));
    assert.deepEqual(plain(first.groups), beforeGroups.flatMap((item) => {
      const nodeIds = item.nodeIds.filter((id) => !selected.includes(id));
      return item.nodeIds.length && !nodeIds.length ? [] : [{ ...item, nodeIds }];
    }));
    assertMembership(first);
    assert.equal(first.undoStack.length, 1);
    assert.deepEqual(plain(second), otherCanvas);
    h.window.undoLastAction();
    assert.deepEqual(plain(first.nodes.map((node) => node.id)), ["a", "b", "c", "d", "outside"]);
    assert.deepEqual(plain(first.groups), beforeGroups);
    assert.deepEqual(plain(first.connections), beforeConnections);
    assertMembership(first);
    assert.equal(first.undoStack.length, 0);
    assert.deepEqual(plain(second), otherCanvas);
  });
}

test("deleting every group member requires confirmation and undo restores the complete group", (t) => {
  const h = createHarness(t);
  const first = h.canvas("one", [h.node("a", { groupId: "group" }), h.node("b", { groupId: "group" })], [group("group", ["a", "b"])]);
  h.install(first);
  h.window.setSelection(["a", "b"]);
  h.window.deleteSelectedNodes();
  assert.equal(first.nodes.length, 2);
  assert.equal(first.undoStack.length, 0);
  assert.ok(h.window.document.querySelector(".confirm-layer"));
  h.window.document.querySelector(".confirm-ok").click();
  assert.equal(first.nodes.length, 0);
  assert.equal(first.groups.length, 0);
  h.window.undoLastAction();
  assert.deepEqual(plain(first.groups[0].nodeIds), ["a", "b"]);
  assertMembership(first);
});

for (const dx of [120, 1500]) {
  test(`prompt optimization undo preserves a ${dx}px move and its membership change`, (t) => {
    const h = createHarness(t);
    const node = h.node("video", { prompt: "  一只狐狸走过森林  ", groupId: "group" });
    const first = h.canvas("one", [node], [group("group", [node.id])]);
    h.install(first);
    const originalPrompt = node.prompt;
    assert.equal(h.window.startPromptOptimization(node), true);
    const task = [...h.state.promptOptimizationTasks.values()][0];
    h.moveNode(node.id, dx, 80);
    const moved = { x: node.x, y: node.y, z: node.z, groupId: node.groupId };
    h.fireTimer(task.timeoutId);
    assert.notEqual(node.prompt, originalPrompt);
    assert.equal(node.promptOptimizing, false);
    assert.equal(first.undoStack.length, 2);
    h.window.undoLastAction();
    assert.equal(first.nodes[0], node, "prompt undo must preserve the live node object");
    assert.equal(node.prompt, originalPrompt);
    assert.deepEqual({ x: node.x, y: node.y, z: node.z, groupId: node.groupId }, moved);
    assert.equal(first.undoStack.length, 1);
    h.window.undoLastAction();
    assert.deepEqual({ x: node.x, y: node.y }, { x: 10, y: 20 });
    assert.equal(node.prompt, originalPrompt);
    assertMembership(first);
  });
}

test("editing an optimized prompt retires only the superseded field undo, without blocking earlier movement", (t) => {
  const h = createHarness(t);
  const node = h.node("video");
  const first = h.canvas("one", [node]);
  h.install(first);
  h.moveNode(node.id, 100, 100);
  h.window.startPromptOptimization(node);
  h.fireTimer([...h.state.promptOptimizationTasks.values()][0].timeoutId);
  node.expanded = true;
  h.window.render();
  const promptInput = h.window.document.querySelector('.canvas-node[data-id="video"] .prompt-input');
  promptInput.value = "手动修改的提示词";
  promptInput.dispatchEvent(new h.window.Event("input", { bubbles: true }));
  h.window.undoLastAction();
  assert.equal(node.prompt, "手动修改的提示词");
  assert.equal(first.undoStack.length, 1);
  assert.deepEqual({ x: node.x, y: node.y }, { x: 110, y: 120 });
  h.window.undoLastAction();
  assert.equal(node.prompt, "手动修改的提示词");
  assert.equal(first.undoStack.length, 0);
  assert.deepEqual({ x: node.x, y: node.y }, { x: 10, y: 20 });
});

test("background optimization writes and undoes only on its originating canvas", (t) => {
  const h = createHarness(t);
  const node = h.node("shared-id");
  const first = h.canvas("one", [node]);
  const second = h.canvas("two", [h.node("shared-id", { prompt: "另一个画布" })]);
  h.install(first, second);
  const originalPrompt = node.prompt;
  h.window.startPromptOptimization(node);
  const task = [...h.state.promptOptimizationTasks.values()][0];
  h.window.switchCanvas(second.id);
  const otherCanvas = plain(second);
  h.fireTimer(task.timeoutId);
  assert.notEqual(node.prompt, originalPrompt);
  assert.equal(first.undoStack.length, 1);
  assert.deepEqual(plain(second), otherCanvas);
  h.window.undoLastAction();
  assert.notEqual(node.prompt, originalPrompt);
  h.window.switchCanvas(first.id);
  h.window.undoLastAction();
  assert.equal(node.prompt, originalPrompt);
  assert.deepEqual(plain(second), otherCanvas);
});

test("deleted nodes cancel optimization without resurrecting task state on undo", (t) => {
  const h = createHarness(t);
  const node = h.node("video");
  const first = h.canvas("one", [node]);
  h.install(first);
  h.window.startPromptOptimization(node);
  const task = [...h.state.promptOptimizationTasks.values()][0];
  const staleCallback = h.timers.get(task.timeoutId);
  h.window.setSelection([node.id]);
  h.window.deleteSelectedNodes();
  assert.equal(h.state.promptOptimizationTasks.size, 0);
  assert.equal(h.timers.has(task.timeoutId), false);
  h.window.undoLastAction();
  staleCallback();
  assert.equal(first.nodes[0].prompt, node.prompt);
  assert.equal(first.nodes[0].promptOptimizing, false);
  assert.equal(first.undoStack.length, 0);
});

test("optimization ignores replaced prompts and another project", (t) => {
  const h = createHarness(t);
  const node = h.node("video");
  const first = h.canvas("one", [node]);
  h.install(first);
  h.window.startPromptOptimization(node);
  let task = [...h.state.promptOptimizationTasks.values()][0];
  node.prompt = "新输入";
  h.fireTimer(task.timeoutId);
  assert.equal(node.prompt, "新输入");
  assert.equal(first.undoStack.length, 0);
  h.window.startPromptOptimization(node);
  task = [...h.state.promptOptimizationTasks.values()][0];
  h.state.projectId = "another-project";
  h.fireTimer(task.timeoutId);
  assert.equal(node.prompt, "新输入");
  assert.equal(first.undoStack.length, 0);
});

test("successful generation remains a boundary for prompt undo without removing move undo", (t) => {
  const h = createHarness(t);
  const node = h.node("video");
  const first = h.canvas("one", [node]);
  h.install(first);
  h.window.startPromptOptimization(node);
  const task = [...h.state.promptOptimizationTasks.values()][0];
  h.moveNode(node.id, 100, 100);
  h.fireTimer(task.timeoutId);
  const optimized = node.prompt;
  assert.equal(h.window.startSimulatedGeneration(node), true);
  h.window.undoLastAction();
  assert.equal(first.undoStack.length, 2, "generation prevents undoing prompt parameters in flight");
  h.fireTimer([...h.state.generationTasks.values()][0].timeoutId);
  assert.equal(first.undoStack.length, 1);
  const result = node.generatedAsset;
  h.window.undoLastAction();
  assert.equal(node.prompt, optimized);
  assert.equal(node.generatedAsset, result);
  assert.deepEqual({ x: node.x, y: node.y }, { x: 10, y: 20 });
});

test("Entity picker expands independent references in one undo and repeated use skips existing media", (t) => {
  const h = createHarness(t);
  const target = h.node("entity-target", { model: "seedance-2", assets: [] });
  const first = h.canvas("one", [target]);
  h.install(first);
  const entity = h.window.getEntityUsePickerEntities().find((entry) => entry.spaces.includes("personal") && entry.media.length);
  assert.ok(entity, "expected a usable personal Entity fixture");
  const { canvasEntityUse } = h.window.canvasTest;
  const picker = h.window.document.querySelector("#entityUsePickerPortal");
  function confirmEntity() {
    assert.equal(canvasEntityUse.openPicker(target.id), true);
    picker.querySelector(`[data-entity-use-toggle="${entity.id}"]`).click();
    picker.querySelector('[data-entity-use-action="add-entities"]').click();
  }
  confirmEntity();
  assert.equal(first.undoStack.length, 1);
  assert.equal(picker.hidden, true);
  assert.ok(target.assets.length > 0);
  const expanded = plain(target.assets);
  assert.ok(target.assets.every((asset) => !entity.media.some((media) => media.id === asset.id)), "references receive independent legacy asset ids");
  confirmEntity();
  assert.deepEqual(plain(target.assets), expanded);
  assert.equal(first.undoStack.length, 1, "a duplicate-only confirmation must not add an undo entry");
  h.window.undoLastAction();
  assert.equal(first.nodes[0].assets.length, 0);
  assert.equal(first.undoStack.length, 0);
});

test("Entity-use content adapters reject another project or canvas even when target node ids match", (t) => {
  const h = createHarness(t);
  const first = h.canvas("one", [h.node("same-id", { model: "seedance-2", assets: [] })]);
  const second = h.canvas("two", [h.node("same-id", { model: "seedance-2", assets: [] })]);
  h.install(first, second);
  const entity = h.window.getEntityUsePickerEntities().find((entry) => entry.spaces.includes("personal") && entry.media.length);
  const submission = {
    scope: { projectId: h.state.projectId, canvasId: first.id }, nodeId: "same-id",
    selections: [{ entityId: entity.id, space: "personal" }],
  };
  h.window.switchCanvas(second.id);
  h.window.addSelectedEntitiesToGenerator(submission);
  const created = h.window.addEntityToCanvas({ scope: submission.scope, entityId: entity.id, space: "personal" });
  assert.equal(created.length, 0);
  assert.equal(second.nodes[0].assets.length, 0);
  assert.equal(second.undoStack.length, 0);
  h.window.switchCanvas(first.id);
  h.state.projectId = "another-project";
  h.window.addSelectedEntitiesToGenerator(submission);
  assert.equal(first.nodes[0].assets.length, 0);
  assert.equal(first.undoStack.length, 0);
});

test("Entity canvas consumption creates separate media nodes and undoes the complete expansion once", (t) => {
  const h = createHarness(t);
  const first = h.canvas("one");
  h.install(first);
  const entity = h.window.getEntityUsePickerEntities().find((entry) => entry.spaces.includes("personal") && entry.media.length);
  const scope = { projectId: h.state.projectId, canvasId: first.id };
  const created = h.window.addEntityToCanvas({ scope, entityId: entity.id, space: "personal" });
  assert.ok(created.length > 1);
  assert.equal(first.nodes.length, created.length);
  assert.equal(first.undoStack.length, 1);
  assert.ok(created.every((node) => node.kind === "asset"));
  h.window.undoLastAction();
  assert.equal(first.nodes.length, 0);
  assert.equal(first.undoStack.length, 0);
});
