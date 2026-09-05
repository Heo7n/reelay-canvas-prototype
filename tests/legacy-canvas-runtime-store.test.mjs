import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("../src/legacy-canvas/canvas-runtime-store.js", import.meta.url),
  "utf8",
);
const context = vm.createContext({});
new vm.Script(source).runInContext(context);
const factory = context.REELAY_CANVAS_RUNTIME_STORE;

function createCanvas(id, overrides = {}) {
  return {
    id,
    name: id,
    nodes: [],
    connections: [],
    groups: [],
    tx: 0,
    ty: 0,
    scale: 1,
    zCounter: 1,
    undoStack: [],
    ...overrides,
  };
}

test("the legacy state facade delegates every active canvas field without copying it", () => {
  const store = factory.createCanvasRuntimeStore();
  const state = {};
  store.attachStateFacade(state);
  const first = createCanvas("canvas-1", { nodes: [{ id: "node-1" }], tx: 12 });
  const second = createCanvas("canvas-2", { nodes: [{ id: "node-2" }], tx: 80 });

  store.replaceCanvases([first, second], first.id);

  assert.equal(state.nodes, first.nodes);
  assert.equal(state.tx, 12);
  const replacements = {
    nodes: [{ id: "replacement" }],
    connections: [{ id: "connection-1" }],
    groups: [{ id: "group-1" }],
    tx: 24,
    ty: 32,
    scale: 1.5,
    zCounter: 9,
    undoStack: [{ type: "move" }],
  };
  for (const [field, value] of Object.entries(replacements)) state[field] = value;
  for (const [field, value] of Object.entries(replacements)) assert.equal(first[field], value);

  store.activateCanvas(second.id);
  assert.equal(state.nodes, second.nodes);
  assert.equal(state.tx, 80);
  assert.equal(first.nodes[0].id, "replacement");
  store.activateCanvas(first.id);
  for (const [field, value] of Object.entries(replacements)) assert.equal(state[field], value);
});

test("detached startup access is discarded when the first canonical canvas is installed", () => {
  const store = factory.createCanvasRuntimeStore();
  const state = { nodes: [{ id: "startup-node" }], tx: 7 };
  store.attachStateFacade(state);

  assert.equal(state.nodes[0].id, "startup-node");
  assert.equal(state.tx, 7);

  const canvas = createCanvas("canvas-1");
  store.replaceCanvases([canvas], canvas.id);
  state.nodes.push({ id: "live-node" });
  assert.deepEqual(canvas.nodes.map((node) => node.id), ["live-node"]);
});

test("canvas collection mutations go through the runtime store", () => {
  const mutations = [];
  const store = factory.createCanvasRuntimeStore({
    onMutation: (mutation) => mutations.push({ ...mutation }),
  });
  const state = {};
  store.attachStateFacade(state);
  const first = createCanvas("canvas-1");
  const second = createCanvas("canvas-2");

  store.replaceCanvases([first], first.id);
  store.addCanvas(second, { activate: true });
  assert.equal(state.activeCanvasId, second.id);

  const exposedList = state.canvases;
  exposedList.length = 0;
  assert.equal(state.canvases.length, 2);

  const removal = store.removeCanvas(second.id);
  assert.equal(removal.activeChanged, true);
  assert.equal(removal.removedCanvas, second);
  assert.equal(state.activeCanvasId, first.id);
  assert.equal(store.removeCanvas(first.id), null);
  assert.deepEqual(
    mutations.map((mutation) => mutation.type),
    ["replace", "add", "remove"],
  );
});

test("activating another canvas emits one collection mutation and ignores no-op activation", () => {
  const mutations = [];
  const store = factory.createCanvasRuntimeStore({
    onMutation: (mutation) => mutations.push({ ...mutation }),
  });
  const first = createCanvas("canvas-1");
  const second = createCanvas("canvas-2");
  store.replaceCanvases([first, second], first.id);
  mutations.length = 0;

  store.activateCanvas(first.id);
  store.activateCanvas(second.id);

  assert.deepEqual(mutations, [{ type: "activate", activeCanvasId: second.id }]);
});

test("invalid records and duplicate ids are rejected at the store boundary", () => {
  const store = factory.createCanvasRuntimeStore();
  assert.throws(() => store.addCanvas({}), /non-empty id/);
  store.addCanvas(createCanvas("canvas-1"));
  assert.throws(() => store.addCanvas(createCanvas("canvas-1")), /Duplicate canvas id/);
  assert.throws(
    () => store.replaceCanvases([createCanvas("same"), createCanvas("same")]),
    /Duplicate canvas id/,
  );
});
