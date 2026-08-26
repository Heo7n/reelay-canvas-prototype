import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("../src/legacy-canvas/canvas-command-executor.js", import.meta.url),
  "utf8",
);
const context = vm.createContext({});
new vm.Script(source).runInContext(context);
const factory = context.REELAY_CANVAS_COMMAND_EXECUTOR;

const plain = (value) => JSON.parse(JSON.stringify(value));

function createCanvas(id, overrides = {}) {
  return {
    id,
    nodes: [],
    groups: [],
    connections: [],
    undoStack: [],
    ...overrides,
  };
}

function createHarness(canvases) {
  const byId = new Map(canvases.map((canvas) => [canvas.id, canvas]));
  const effects = [];
  const executor = factory.createCanvasCommandExecutor({
    getCanvas: (canvasId) => byId.get(canvasId) || null,
    onCommit: (effect) => effects.push(effect),
  });
  return { byId, effects, executor };
}

function snapshot(record, index) {
  const value = { record };
  if (index !== undefined) value.index = index;
  return value;
}

test("a multi-collection delete commits once and undo restores every record atomically", () => {
  const node = { id: "node-1", kind: "generator", prompt: "hello" };
  const group = { id: "group-1", nodeIds: [node.id] };
  const connection = { id: "connection-1", sourceNodeId: node.id, targetNodeId: "node-2" };
  const canvas = createCanvas("canvas-1", {
    nodes: [node, { id: "node-2", kind: "generator" }],
    groups: [group],
    connections: [connection],
  });
  const { effects, executor } = createHarness([canvas]);

  const result = executor.execute({
    id: "delete-selection-1",
    type: "delete-selection",
    canvasId: canvas.id,
    changes: [
      { collection: "connections", id: connection.id, before: snapshot(connection, 0), after: snapshot(null) },
      { collection: "groups", id: group.id, before: snapshot(group, 0), after: snapshot(null) },
      { collection: "nodes", id: node.id, before: snapshot(node, 0), after: snapshot(null) },
    ],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(plain(canvas.nodes), [{ id: "node-2", kind: "generator" }]);
  assert.deepEqual(plain(canvas.groups), []);
  assert.deepEqual(plain(canvas.connections), []);
  assert.equal(canvas.undoStack.length, 1);
  assert.equal(effects.length, 1);
  assert.equal(effects[0].source, "execute");

  const undo = executor.undoLast(canvas.id);
  assert.equal(undo.ok, true);
  assert.deepEqual(plain(canvas.nodes), [node, { id: "node-2", kind: "generator" }]);
  assert.deepEqual(plain(canvas.groups), [group]);
  assert.deepEqual(plain(canvas.connections), [connection]);
  assert.deepEqual(plain(canvas.undoStack), []);
  assert.equal(effects.length, 2);
  assert.equal(effects[1].source, "undo");
});

test("replace and insert honor record snapshots and indexes", () => {
  const original = { id: "node-1", prompt: "before", nested: { count: 1 } };
  const replacement = { id: "node-1", prompt: "after", nested: { count: 2 } };
  const inserted = { id: "node-2", prompt: "new" };
  const canvas = createCanvas("canvas-1", { nodes: [original] });
  const { effects, executor } = createHarness([canvas]);

  const result = executor.execute({
    id: "update-and-insert",
    type: "node-batch",
    canvasId: canvas.id,
    changes: [
      { collection: "nodes", id: original.id, before: snapshot(original, 0), after: snapshot(replacement, 1) },
      { collection: "nodes", id: inserted.id, before: snapshot(null), after: snapshot(inserted, 0) },
    ],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(plain(canvas.nodes), [inserted, replacement]);
  replacement.nested.count = 99;
  inserted.prompt = "mutated outside";
  assert.deepEqual(plain(canvas.nodes), [
    { id: "node-2", prompt: "new" },
    { id: "node-1", prompt: "after", nested: { count: 2 } },
  ]);
  assert.equal(effects.length, 1);
});

test("a stale before record rolls the whole command back without undo or effects", () => {
  const node = { id: "node-1", prompt: "current" };
  const group = { id: "group-1", nodeIds: [node.id] };
  const canvas = createCanvas("canvas-1", { nodes: [node], groups: [group] });
  const before = plain(canvas);
  const { effects, executor } = createHarness([canvas]);

  const result = executor.execute({
    id: "stale-command",
    type: "compound-update",
    canvasId: canvas.id,
    changes: [
      {
        collection: "nodes",
        id: node.id,
        before: snapshot({ id: node.id, prompt: "stale" }, 0),
        after: snapshot({ id: node.id, prompt: "next" }, 0),
      },
      { collection: "groups", id: group.id, before: snapshot(group, 0), after: snapshot(null) },
    ],
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "before-conflict");
  assert.deepEqual(plain(canvas), before);
  assert.equal(effects.length, 0);
});

test("duplicate ids are rejected before canonical collections change", () => {
  const canvas = createCanvas("canvas-1", { nodes: [{ id: "node-1" }] });
  const before = plain(canvas);
  const { effects, executor } = createHarness([canvas]);

  const result = executor.execute({
    id: "duplicate-node",
    type: "insert",
    canvasId: canvas.id,
    changes: [
      {
        collection: "nodes",
        id: "node-1",
        before: snapshot(null),
        after: snapshot({ id: "node-1", prompt: "duplicate" }, 1),
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "before-conflict");
  assert.deepEqual(plain(canvas), before);
  assert.equal(effects.length, 0);
});

test("an unknown canvas fails with zero mutation, undo, or effects", () => {
  const canvas = createCanvas("canvas-1", { nodes: [{ id: "node-1" }] });
  const before = plain(canvas);
  const { effects, executor } = createHarness([canvas]);

  const result = executor.execute({
    id: "wrong-canvas",
    type: "remove",
    canvasId: "missing-canvas",
    changes: [
      {
        collection: "nodes",
        id: "node-1",
        before: snapshot({ id: "node-1" }, 0),
        after: snapshot(null),
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "canvas-not-found");
  assert.deepEqual(plain(canvas), before);
  assert.equal(effects.length, 0);
});

test("one compound command emits one effect and recordUndo false emits no undo entry", () => {
  const canvas = createCanvas("canvas-1");
  const { effects, executor } = createHarness([canvas]);
  const result = executor.execute({
    id: "insert-without-undo",
    type: "seed",
    canvasId: canvas.id,
    changes: [
      { collection: "nodes", id: "node-1", before: snapshot(null), after: snapshot({ id: "node-1" }, 0) },
      { collection: "groups", id: "group-1", before: snapshot(null), after: snapshot({ id: "group-1", nodeIds: [] }, 0) },
    ],
  }, { recordUndo: false });

  assert.equal(result.ok, true);
  assert.equal(effects.length, 1);
  assert.deepEqual(plain(canvas.undoStack), []);
});

test("undo stacks remain isolated across canvases", () => {
  const first = createCanvas("canvas-1", { nodes: [{ id: "node-a", value: 1 }] });
  const second = createCanvas("canvas-2", { nodes: [{ id: "node-b", value: 1 }] });
  const { effects, executor } = createHarness([first, second]);

  for (const [canvas, nodeId] of [[first, "node-a"], [second, "node-b"]]) {
    const before = canvas.nodes[0];
    const result = executor.execute({
      id: `replace-${nodeId}`,
      type: "replace",
      canvasId: canvas.id,
      changes: [{
        collection: "nodes",
        id: nodeId,
        before: snapshot(before, 0),
        after: snapshot({ ...before, value: 2 }, 0),
      }],
    });
    assert.equal(result.ok, true);
  }

  const undo = executor.undoLast(first.id);
  assert.equal(undo.ok, true);
  assert.equal(first.nodes[0].value, 1);
  assert.equal(first.undoStack.length, 0);
  assert.equal(second.nodes[0].value, 2);
  assert.equal(second.undoStack.length, 1);
  assert.equal(effects.length, 3);
});

test("a commit callback failure cannot misreport an already committed command as failed", () => {
  const canvas = createCanvas("canvas-1");
  const executor = factory.createCanvasCommandExecutor({
    getCanvas: () => canvas,
    onCommit: () => {
      throw new Error("render adapter failed");
    },
  });

  const result = executor.execute({
    id: "insert-node",
    type: "insert",
    canvasId: canvas.id,
    changes: [{
      collection: "nodes",
      id: "node-1",
      before: snapshot(null),
      after: snapshot({ id: "node-1" }, 0),
    }],
  });

  assert.equal(result.ok, true);
  assert.equal(result.effectError.message, "render adapter failed");
  assert.deepEqual(plain(canvas.nodes), [{ id: "node-1" }]);
  assert.equal(canvas.undoStack.length, 1);
});

test("the command executor bounds mixed undo history", () => {
  const canvas = createCanvas("canvas-1", { undoStack: [{ type: "legacy" }] });
  const byId = new Map([[canvas.id, canvas]]);
  const executor = factory.createCanvasCommandExecutor({
    getCanvas: (canvasId) => byId.get(canvasId) || null,
    undoLimit: 2,
  });

  for (const nodeId of ["node-1", "node-2"]) {
    assert.equal(executor.execute({
      id: `insert-${nodeId}`,
      type: "insert",
      canvasId: canvas.id,
      changes: [{
        collection: "nodes",
        id: nodeId,
        before: snapshot(null),
        after: snapshot({ id: nodeId }),
      }],
    }).ok, true);
  }

  assert.equal(canvas.undoStack.length, 2);
  assert.equal(canvas.undoStack.every((entry) => entry.kind === "canvas-command"), true);
});

test("a transition validator rejects the whole draft before commit", () => {
  const node = { id: "node-1", mediaKind: "image" };
  const canvas = createCanvas("canvas-1", { nodes: [node] });
  const before = plain(canvas);
  const effects = [];
  const executor = factory.createCanvasCommandExecutor({
    getCanvas: () => canvas,
    onCommit: (effect) => effects.push(effect),
    validateTransition: ({ canvas: draft }) => (
      draft.nodes.some((item) => item.mediaKind !== "image")
        ? { code: "media-kind-changed", message: "mediaKind is immutable." }
        : null
    ),
  });

  const result = executor.execute({
    id: "change-media-kind",
    type: "replace",
    canvasId: canvas.id,
    changes: [{
      collection: "nodes",
      id: node.id,
      before: snapshot(node, 0),
      after: snapshot({ id: node.id, mediaKind: "video" }, 0),
    }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "media-kind-changed");
  assert.deepEqual(plain(canvas), before);
  assert.deepEqual(effects, []);
});

test("a normalizer cannot silently discard an explicit command change", () => {
  const canvas = createCanvas("canvas-1");
  const before = plain(canvas);
  const effects = [];
  const executor = factory.createCanvasCommandExecutor({
    getCanvas: () => canvas,
    normalize: () => [],
    onCommit: (effect) => effects.push(effect),
  });

  const result = executor.execute({
    id: "insert-rejected-node",
    type: "insert",
    canvasId: canvas.id,
    changes: [{
      collection: "nodes",
      id: "node-1",
      before: snapshot(null),
      after: snapshot({ id: "node-1" }, 0),
    }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "after-conflict");
  assert.deepEqual(plain(canvas), before);
  assert.deepEqual(effects, []);
});
