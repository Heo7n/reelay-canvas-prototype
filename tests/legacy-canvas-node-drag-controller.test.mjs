import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const [interactionSource, controllerSource] = await Promise.all([
  readFile(new URL("../src/legacy-canvas/canvas-node-interaction.js", import.meta.url), "utf8"),
  readFile(new URL("../src/legacy-canvas/canvas-node-drag-controller.js", import.meta.url), "utf8"),
]);
const context = vm.createContext({});
new vm.Script(interactionSource).runInContext(context);
new vm.Script(controllerSource).runInContext(context);
for (const file of ["canvas-command-executor.js", "canvas-content-commands.js"]) {
  new vm.Script(await readFile(new URL(`../src/legacy-canvas/${file}`, import.meta.url), "utf8")).runInContext(context);
}

function createHarness(overrides = {}) {
  const nodes = [
    { id: "a", kind: "generator", x: 10, y: 20 },
    { id: "b", kind: "media", x: 70, y: 90 },
  ];
  const calls = [];
  const undoActions = [];
  let activeAction = null;
  let cloneCount = 0;
  const controller = context.REELAY_CANVAS_NODE_DRAG_CONTROLLER.createCanvasNodeDragController({
    interaction: context.REELAY_CANVAS_NODE_INTERACTION,
    getScale: () => 2,
    getNode: (nodeId) => nodes.find((node) => node.id === nodeId),
    cloneNode: (node) => ({ ...node, id: `${node.id}-copy-${++cloneCount}` }),
    addNodes: (items) => nodes.push(...items),
    removeDuplicatedNodes: (ids, action) => {
      for (let index = nodes.length - 1; index >= 0; index -= 1) {
        if (ids.includes(nodes[index].id)) nodes.splice(index, 1);
      }
      calls.push(`remove:${ids.join(",")}`);
      calls.push(`select:${action.sourceIds.join(",")}:${action.sourceActiveId}`);
    },
    selectNodes: (ids, activeId) => calls.push(`select:${ids.join(",")}:${activeId}`),
    promoteNodes: (items) => calls.push(`promote:${items.map((item) => item.id).join(",")}`),
    setAction: (action) => { activeAction = action; },
    setDragging: (dragging) => calls.push(`dragging:${dragging}`),
    applyNodePosition: (position) => {
      const node = nodes.find((item) => item.id === position.id);
      Object.assign(node, { x: position.x, y: position.y });
    },
    renderMovement: () => calls.push("movement"),
    updateGroupMembership: (ids) => calls.push(`groups:${ids.join(",")}`),
    pushUndoAction: (action) => undoActions.push(action),
    render: () => calls.push("render"),
    ...overrides,
  });
  return { controller, nodes, calls, undoActions, getAction: () => activeAction };
}

function candidate(overrides = {}) {
  return {
    type: "drag-candidate",
    pointerId: 3,
    ids: ["a", "b"],
    activeId: "a",
    altKey: false,
    startClientX: 100,
    startClientY: 100,
    origins: [{ id: "a", x: 10, y: 20 }, { id: "b", x: 70, y: 90 }],
    groups: [{ id: "group-1" }],
    revealMediaToolbar: true,
    revealGeneratorPanel: true,
    ...overrides,
  };
}

test("promoting a drag candidate preserves offsets and begins immediate movement", () => {
  const harness = createHarness();
  const action = harness.controller.promote(
    candidate({ interactionSource: "selection-frame" }),
    { clientX: 120, clientY: 110 },
  );

  assert.equal(action.type, "drag-nodes");
  assert.equal(action.activeId, "a");
  assert.equal(action.revealMediaToolbar, true);
  assert.equal(action.revealGeneratorPanel, true);
  assert.equal(action.interactionSource, "selection-frame");
  assert.equal(harness.getAction(), action);
  assert.deepEqual(harness.nodes.slice(0, 2).map(({ id, x, y }) => ({ id, x, y })), [
    { id: "a", x: 20, y: 25 },
    { id: "b", x: 80, y: 95 },
  ]);
  assert.deepEqual(harness.calls, ["promote:a,b", "dragging:true", "movement"]);
});

test("Alt promotion duplicates nodes and drags only the copies", () => {
  const harness = createHarness();
  const action = harness.controller.promote(candidate({ altKey: true }), { clientX: 120, clientY: 110 });

  assert.deepEqual(action.ids, ["a-copy-1", "b-copy-2"]);
  assert.equal(action.activeId, "a-copy-1");
  assert.deepEqual(action.sourceIds, ["a", "b"]);
  assert.equal(action.sourceActiveId, "a");
  assert.equal(harness.nodes.length, 4);
  assert.deepEqual(harness.nodes.slice(0, 2).map(({ x, y }) => ({ x, y })), [{ x: 10, y: 20 }, { x: 70, y: 90 }]);
  assert.deepEqual(harness.nodes.slice(2).map(({ x, y }) => ({ x, y })), [{ x: 20, y: 25 }, { x: 80, y: 95 }]);
  assert.deepEqual(harness.calls, [
    "select:a-copy-1,b-copy-2:a-copy-1",
    "render",
    "promote:a-copy-1,b-copy-2",
    "dragging:true",
    "movement",
  ]);
});

test("Alt promotion maps the active node to its corresponding copy", () => {
  const harness = createHarness();
  const action = harness.controller.promote(candidate({ activeId: "b", altKey: true }), { clientX: 120, clientY: 110 });
  assert.equal(action.activeId, "b-copy-2");
  assert.equal(harness.calls[0], "select:a-copy-1,b-copy-2:b-copy-2");
});

test("finishing records one move for originals or one create for duplicated nodes", () => {
  const original = createHarness();
  const originalAction = { ...candidate(), type: "drag-nodes", moved: true, isDuplicate: false };
  original.controller.finish(originalAction);
  assert.deepEqual(original.calls, ["groups:a,b", "render"]);
  assert.deepEqual(JSON.parse(JSON.stringify(original.undoActions)), [{
    type: "move",
    positions: originalAction.origins,
    groups: originalAction.groups,
  }]);

  const duplicate = createHarness();
  const duplicateAction = duplicate.controller.promote(candidate({ altKey: true }), { clientX: 120, clientY: 110 });
  duplicate.controller.finish(duplicateAction);
  duplicate.controller.finish(duplicateAction);
  assert.deepEqual(JSON.parse(JSON.stringify(duplicate.undoActions)), [{ type: "create", nodeIds: ["a-copy-1", "b-copy-2"] }]);
  assert.equal(duplicate.calls.filter((call) => call.startsWith("groups:")).length, 1);
});

test("cancelling a shared drag restores every origin without membership or undo work", () => {
  const harness = createHarness();
  harness.nodes[0].x = 44;
  harness.nodes[0].y = 55;
  harness.nodes[1].x = 104;
  harness.nodes[1].y = 125;
  const action = {
    ...candidate({ interactionSource: "selection-frame" }),
    type: "drag-nodes",
    moved: true,
    isDuplicate: false,
  };

  harness.controller.finish(action, { cancelled: true });

  assert.deepEqual(harness.nodes.map(({ id, x, y }) => ({ id, x, y })), [
    { id: "a", x: 10, y: 20 },
    { id: "b", x: 70, y: 90 },
  ]);
  assert.deepEqual(harness.calls, ["render"]);
  assert.equal(harness.undoActions.length, 0);
});

test("cancelling Alt drag removes only its copies and restores source selection without undo", () => {
  const h = createHarness();
  const originals = h.nodes.slice();
  const action = h.controller.promote(candidate({ altKey: true, activeId: "b" }), { clientX: 120, clientY: 110 });
  h.calls.length = 0;
  h.controller.finish(action, { cancelled: true });
  h.controller.finish(action, { cancelled: true });
  assert.deepEqual(h.nodes, originals);
  assert.equal(h.nodes[0], originals[0]);
  assert.equal(h.nodes[1], originals[1]);
  assert.deepEqual(h.calls, ["remove:a-copy-1,b-copy-2", "select:a,b:b", "render"]);
  assert.equal(h.undoActions.length, 0);
});

test("Alt drag returned to its origin still records creation because the copies exist", () => {
  const h = createHarness();
  const action = h.controller.promote(candidate({ altKey: true }), { clientX: 120, clientY: 110 });
  h.controller.move(action, { clientX: 100, clientY: 100 });
  assert.equal(action.moved, false);
  h.controller.finish(action, { render: false });
  assert.deepEqual(JSON.parse(JSON.stringify(h.undoActions)), [{ type: "create", nodeIds: ["a-copy-1", "b-copy-2"] }]);
  assert.equal(h.nodes.length, 4);
});

test("group creation followed by Alt duplication keeps both entries undoable in order", () => {
  const policy = context.REELAY_CANVAS_CONTENT_COMMANDS;
  let canvas, executor;
  let serial = 0;
  const executeGroups = (groups, recordUndo) => executor.execute({
    id: `group-change-${++serial}`, type: "groups", canvasId: canvas.id,
    changes: policy.buildGroupChanges(canvas, groups),
  }, { recordUndo });
  const h = createHarness({
    cloneNode: (source) => {
      const clone = { ...source, id: `${source.id}-copy` };
      delete clone.groupId;
      return clone;
    },
    updateGroupMembership: (ids) => {
      assert.equal(executeGroups(canvas.groups.map((group) => ({ ...group, nodeIds: [...group.nodeIds, ...ids] })), false).ok, true);
    },
    pushUndoAction: (action) => canvas.undoStack.push(action),
  });
  canvas = { id: "canvas", nodes: h.nodes, groups: [], connections: [], undoStack: [] };
  executor = context.REELAY_CANVAS_COMMAND_EXECUTOR.createCanvasCommandExecutor({
    getCanvas: () => canvas, projectRecord: policy.projectRecord, validateTransition: policy.validateTransition,
  });
  assert.equal(executeGroups([{ id: "g", name: "group", nodeIds: ["a", "b"], x: 0, y: 0, width: 400, height: 300, z: 1 }], true).ok, true);
  const initialGrouping = canvas.undoStack[0];
  const action = h.controller.promote(candidate({ altKey: true }), { clientX: 120, clientY: 110 });
  h.controller.finish(action);
  assert.equal(canvas.undoStack.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(canvas.groups[0].nodeIds)), ["a", "b", "a-copy", "b-copy"]);

  // Exercise the existing create undo contract: remove its nodeIds and commit
  // membership removal without a second history entry before undoing the group.
  const creation = canvas.undoStack.pop();
  assert.equal(creation.type, "create");
  for (let index = canvas.nodes.length - 1; index >= 0; index -= 1) {
    if (creation.nodeIds.includes(canvas.nodes[index].id)) canvas.nodes.splice(index, 1);
  }
  assert.equal(executeGroups(canvas.groups.map((group) => ({ ...group, nodeIds: group.nodeIds.filter((id) => !creation.nodeIds.includes(id)) })), false).ok, true);
  assert.equal(canvas.undoStack[0], initialGrouping);
  assert.equal(executor.undoLast(canvas.id).ok, true);
  assert.equal(canvas.undoStack.length, 0);
  assert.deepEqual(canvas.nodes.map((node) => node.id), ["a", "b"]);
  assert.deepEqual(JSON.parse(JSON.stringify(canvas.groups)), []);
  assert.ok(canvas.nodes.every((node) => !node.groupId));
});
