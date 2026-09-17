import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1);
  return source.slice(start, source.indexOf("\nfunction ", start + 1));
}

// Exercise the actual legacy transitions without mounting unrelated canvas UI.
function harness() {
  const a = { id: "a", duration: 1 };
  const b = { id: "b", duration: 2 };
  const c = { id: "c", duration: 3 };
  const node = { id: "node", kind: "generator", assets: [a, b, c], activeAssetId: "b",
    referenceOrder: ["asset:c", "connection:upstream", "asset:b", "asset:a"] };
  const canvas = { nodes: [node], undoStack: [] };
  let writable = true;
  const state = { nodes: canvas.nodes, get undoStack() { return canvas.undoStack; } };
  const context = vm.createContext({ state, requireCanvasMutation: () => writable,
    pushUndoAction: (action) => canvas.undoStack.push(action),
    render() {}, setSelection() {}, hydrateAssetMetadata() {}, showActionToast() {},
    canvasNodeLayoutTransition: { finishAll() {} }, promptEditors: { clearHistory() {} } });
  for (const name of ["removeAssetsFromGeneratorNode", "undoLastAction", "commitGenerationUndoBoundary"]) {
    vm.runInContext(functionSource(name), context);
  }
  return { context, canvas, node, a, b, c, setWritable(value) { writable = value; } };
}

test("reference removal restores positions without replacing surviving assets or reference order", () => {
  const h = harness();
  const order = h.node.referenceOrder;
  assert.equal(h.context.removeAssetsFromGeneratorNode(h.node, ["a", "b", "missing"]), 2);
  assert.deepEqual(h.node.assets.map((asset) => asset.id), ["c"]);
  assert.equal(h.node.activeAssetId, "c");
  assert.equal(h.node.referenceOrder, order);
  h.c.duration = 17;
  const added = { id: "later", duration: 7 };
  h.node.assets.push(added);
  h.context.undoLastAction();
  assert.deepEqual(h.node.assets.map((asset) => asset.id), ["a", "b", "c", "later"]);
  assert.equal(h.node.assets[2], h.c);
  assert.equal(h.node.assets[2].duration, 17);
  assert.equal(h.node.assets[3], added);
  assert.equal(h.node.activeAssetId, "b");
  assert.equal(h.node.referenceOrder, order);
});

test("undo does not overwrite a reintroduced reference or a later active reference", () => {
  const h = harness();
  h.context.removeAssetsFromGeneratorNode(h.node, ["b"]);
  const replacement = { id: "b", duration: 100 };
  h.node.assets.push(replacement);
  h.node.activeAssetId = "c";
  h.context.undoLastAction();
  assert.equal(h.node.assets.filter((asset) => asset.id === "b").length, 1);
  assert.equal(h.node.assets.find((asset) => asset.id === "b"), replacement);
  assert.equal(h.node.activeAssetId, "c");
});

test("invalid, readonly, and generating nodes cannot remove references or create undo records", () => {
  const h = harness();
  h.setWritable(false);
  assert.equal(h.context.removeAssetsFromGeneratorNode(h.node, ["b"]), 0);
  h.setWritable(true);
  h.node.generating = true;
  assert.equal(h.context.removeAssetsFromGeneratorNode(h.node, ["b"]), 0);
  h.node.generating = false;
  assert.equal(h.context.removeAssetsFromGeneratorNode({ ...h.node }, ["b"]), 0);
  assert.equal(h.context.removeAssetsFromGeneratorNode(h.node, ["missing"]), 0);
  assert.equal(h.canvas.undoStack.length, 0);
  assert.equal(h.node.assets.length, 3);
});

test("removal undo remains queued while generating and is pruned at the generation boundary", () => {
  const h = harness();
  h.context.removeAssetsFromGeneratorNode(h.node, ["b"]);
  h.node.generating = true;
  h.context.undoLastAction();
  assert.equal(h.canvas.undoStack.length, 1);
  assert.equal(h.node.assets.length, 2);
  h.node.generating = false;
  h.setWritable(false);
  h.context.undoLastAction();
  assert.equal(h.canvas.undoStack.length, 1);
  h.setWritable(true);
  h.canvas.undoStack.push({ type: "node-assets-remove", nodeId: "other" });
  h.context.commitGenerationUndoBoundary(h.canvas, h.node.id);
  assert.equal(h.canvas.undoStack.length, 1);
  assert.equal(h.canvas.undoStack[0].nodeId, "other");
});
