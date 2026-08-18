import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { JSDOM } from "jsdom";

const source = await readFile(
  new URL("../src/legacy-canvas/canvas-layer-reconciler.js", import.meta.url),
  "utf8",
);
const context = vm.createContext({});
new vm.Script(source, { filename: "canvas-layer-reconciler.js" }).runInContext(context);
const { createLayerReconciler } = context.REELAY_CANVAS_LAYER_RECONCILER;

function createHarness() {
  const dom = new JSDOM('<div id="layer"></div>');
  const layer = dom.window.document.querySelector("#layer");
  const prepareCalls = [];
  const syncCalls = [];
  const createElement = (className, datasetKey) => (item) => {
    const element = dom.window.document.createElement("div");
    element.className = className;
    element.dataset[datasetKey] = item.id;
    element.textContent = item.label;
    return element;
  };
  const reconciler = createLayerReconciler({
    layer,
    groups: {
      getId: (item) => item.id,
      getSignature: (item) => item.signature,
      createElement: createElement("group-frame", "groupId"),
      syncElement: (element, item) => syncCalls.push([element, item]),
    },
    nodes: {
      getId: (item) => item.id,
      getSignature: (item) => item.signature,
      createElement: createElement("canvas-node", "id"),
      syncElement: (element, item) => syncCalls.push([element, item]),
      prepareItem: (item) => prepareCalls.push(item.id),
    },
  });
  return { layer, reconciler, prepareCalls, syncCalls };
}

test("reconcile creates keyed group and node elements", () => {
  const harness = createHarness();
  harness.reconciler.reconcile({
    groups: [{ id: "group-a", label: "Group A", signature: "g1" }],
    nodes: [{ id: "node-a", label: "Node A", signature: "n1" }],
  });

  assert.equal(harness.layer.querySelectorAll(".group-frame").length, 1);
  assert.equal(harness.layer.querySelectorAll(".canvas-node").length, 1);
  assert.deepEqual(harness.prepareCalls, ["node-a"]);
});

test("unchanged signatures preserve DOM identity and use the sync callback", () => {
  const harness = createHarness();
  const input = {
    groups: [{ id: "group-a", label: "Group A", signature: "g1" }],
    nodes: [{ id: "node-a", label: "Node A", signature: "n1" }],
  };
  harness.reconciler.reconcile(input);
  const group = harness.layer.querySelector(".group-frame");
  const node = harness.layer.querySelector(".canvas-node");

  harness.reconciler.reconcile(input);

  assert.equal(harness.layer.querySelector(".group-frame"), group);
  assert.equal(harness.layer.querySelector(".canvas-node"), node);
  assert.equal(harness.syncCalls.length, 2);
});

test("a changed signature replaces only the affected keyed element", () => {
  const harness = createHarness();
  harness.reconciler.reconcile({
    groups: [],
    nodes: [
      { id: "node-a", label: "Node A", signature: "a1" },
      { id: "node-b", label: "Node B", signature: "b1" },
    ],
  });
  const nodeA = harness.layer.querySelector('[data-id="node-a"]');
  const nodeB = harness.layer.querySelector('[data-id="node-b"]');

  harness.reconciler.reconcile({
    groups: [],
    nodes: [
      { id: "node-a", label: "Node A changed", signature: "a2" },
      { id: "node-b", label: "Node B", signature: "b1" },
    ],
  });

  assert.notEqual(harness.layer.querySelector('[data-id="node-a"]'), nodeA);
  assert.equal(harness.layer.querySelector('[data-id="node-b"]'), nodeB);
});

test("stale keyed elements are removed without rebuilding live siblings", () => {
  const harness = createHarness();
  harness.reconciler.reconcile({
    groups: [{ id: "group-a", label: "Group A", signature: "g1" }],
    nodes: [
      { id: "node-a", label: "Node A", signature: "a1" },
      { id: "node-b", label: "Node B", signature: "b1" },
    ],
  });
  const nodeB = harness.layer.querySelector('[data-id="node-b"]');

  harness.reconciler.reconcile({
    groups: [],
    nodes: [{ id: "node-b", label: "Node B", signature: "b1" }],
  });

  assert.equal(harness.layer.querySelector('[data-id="node-a"]'), null);
  assert.equal(harness.layer.querySelector(".group-frame"), null);
  assert.equal(harness.layer.querySelector('[data-id="node-b"]'), nodeB);
});
