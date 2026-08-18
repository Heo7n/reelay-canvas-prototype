import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const interactionSource = await readFile(
  new URL("../src/legacy-canvas/canvas-connection-interaction.js", import.meta.url),
  "utf8",
);
const context = vm.createContext({});
new vm.Script(interactionSource, {
  filename: "canvas-connection-interaction.js",
}).runInContext(context);
const interaction = context.REELAY_CANVAS_CONNECTION_INTERACTION;
const plain = (value) => JSON.parse(JSON.stringify(value));

const registry = interaction.buildPortRegistry([
  { id: "node-a:left", nodeId: "node-a", side: "left", anchor: { x: 100, y: 100 } },
  { id: "node-a:right", nodeId: "node-a", side: "right", anchor: { x: 200, y: 100 } },
  { id: "node-b:left", nodeId: "node-b", side: "left", anchor: { x: 300, y: 120 } },
  { id: "node-b:right", nodeId: "node-b", side: "right", anchor: { x: 400, y: 120 } },
]);

test("buildPortRegistry creates compact screen-space semicircle geometry", () => {
  assert.equal(registry.length, 4);
  assert.deepEqual(plain(registry[1].activationRect), {
    left: 192,
    right: 228,
    top: 72,
    bottom: 128,
  });
  assert.equal(registry[1].activationRadius, 28);
  assert.equal(registry[1].portTravelRadius, 22);
  assert.equal(registry[1].portMinOutside, 11);
  assert.equal(interaction.DEFAULTS.snapEnterRadius, 20);
  assert.equal(interaction.DEFAULTS.snapExitRadius, 32);
});

test("clampPointerToPort follows the pointer inside the outward semicircle", () => {
  const rightPort = registry[1];
  assert.deepEqual(
    plain(interaction.clampPointerToPort({ x: 215, y: 106 }, rightPort)),
    { x: 215, y: 106 },
  );
  assert.deepEqual(
    plain(interaction.clampPointerToPort({ x: 222, y: 100 }, rightPort)),
    { x: 222, y: 100 },
  );
  assert.equal(interaction.clampPointerToPort({ x: 191.9, y: 100 }, rightPort), null);
  assert.equal(interaction.clampPointerToPort({ x: 200, y: 128.1 }, rightPort), null);

  const leftPort = registry[0];
  assert.deepEqual(
    plain(interaction.clampPointerToPort({ x: 80, y: 92 }, leftPort)),
    { x: 80, y: 92 },
  );
});

test("findHoveredPort chooses the nearest active port from the cached registry", () => {
  const hovered = interaction.findHoveredPort({ x: 299, y: 118 }, registry);
  assert.equal(hovered.portId, "node-b:left");
  assert.deepEqual(plain(hovered.point), { x: 289, y: 118 });
  assert.equal(interaction.findHoveredPort({ x: 250, y: 20 }, registry), null);
});

test("selectSnapCandidate uses separate enter and exit radii for hysteresis", () => {
  const origin = registry[1];
  const enter = interaction.selectSnapCandidate({
    pointer: { x: 274, y: 120 },
    origin,
    registry,
  });
  assert.equal(enter.targetPortId, "node-b:left");

  const retained = interaction.selectSnapCandidate({
    pointer: { x: 256, y: 120 },
    origin,
    registry,
    previousTargetId: enter.targetPortId,
  });
  assert.equal(retained.targetPortId, "node-b:left");
  assert.ok(retained.distance > interaction.DEFAULTS.snapEnterRadius);
  assert.ok(retained.distance <= interaction.DEFAULTS.snapExitRadius);

  const released = interaction.selectSnapCandidate({
    pointer: { x: 245, y: 120 },
    origin,
    registry,
    previousTargetId: enter.targetPortId,
  });
  assert.equal(released, null);
});

test("new snap candidates must enter the compact activation rectangle", () => {
  const candidate = interaction.selectSnapCandidate({
    pointer: { x: 265, y: 120 },
    origin: registry[1],
    registry,
  });
  assert.equal(candidate, null);
});

test("snap selection keeps the previous valid target and respects compatibility", () => {
  const closeRegistry = interaction.buildPortRegistry([
    { id: "origin:right", nodeId: "origin", side: "right", anchor: { x: 100, y: 100 } },
    { id: "first:left", nodeId: "first", side: "left", anchor: { x: 160, y: 92 } },
    { id: "second:left", nodeId: "second", side: "left", anchor: { x: 160, y: 108 } },
  ]);
  const held = interaction.selectSnapCandidate({
    pointer: { x: 145, y: 105 },
    origin: closeRegistry[0],
    registry: closeRegistry,
    previousTargetId: "first:left",
  });
  assert.equal(held.targetPortId, "first:left");

  const filtered = interaction.selectSnapCandidate({
    pointer: { x: 145, y: 105 },
    origin: closeRegistry[0],
    registry: closeRegistry,
    canConnect: (direction) => direction.targetNodeId !== "first",
  });
  assert.equal(filtered.targetPortId, "second:left");
});

test("resolveConnectionDirection supports starting from either side", () => {
  assert.deepEqual(
    plain(interaction.resolveConnectionDirection(registry[1], registry[2])),
    {
      sourceNodeId: "node-a",
      sourcePortId: "node-a:right",
      targetNodeId: "node-b",
      targetPortId: "node-b:left",
    },
  );
  assert.deepEqual(
    plain(interaction.resolveConnectionDirection(registry[2], registry[1])),
    {
      sourceNodeId: "node-a",
      sourcePortId: "node-a:right",
      targetNodeId: "node-b",
      targetPortId: "node-b:left",
    },
  );
  assert.equal(interaction.resolveConnectionDirection(registry[0], registry[2]), null);
});

test("interaction reducer describes idle, hover, drag, and snap-ready without DOM state", () => {
  const idle = interaction.createInteractionState();
  assert.equal(idle.phase, interaction.PHASES.IDLE);

  const hover = interaction.transitionInteraction(idle, {
    type: interaction.EVENTS.PORT_HOVER,
    portId: "node-a:right",
    pointer: { x: 218, y: 100 },
  });
  assert.equal(hover.phase, interaction.PHASES.PORT_HOVER);

  const dragging = interaction.transitionInteraction(hover, {
    type: interaction.EVENTS.DRAG_START,
    portId: "node-a:right",
    nodeId: "node-a",
    side: "right",
    pointer: { x: 218, y: 100 },
  });
  assert.equal(dragging.phase, interaction.PHASES.EDGE_DRAG);
  assert.equal(dragging.originSide, "right");

  const snapReady = interaction.transitionInteraction(dragging, {
    type: interaction.EVENTS.DRAG_MOVE,
    pointer: { x: 282, y: 120 },
    snapTargetId: "node-b:left",
  });
  assert.equal(snapReady.phase, interaction.PHASES.SNAP_READY);
  assert.equal(snapReady.snapTargetId, "node-b:left");

  const unsnapped = interaction.transitionInteraction(snapReady, {
    type: interaction.EVENTS.DRAG_MOVE,
    pointer: { x: 240, y: 120 },
  });
  assert.equal(unsnapped.phase, interaction.PHASES.EDGE_DRAG);
  assert.equal(unsnapped.snapTargetId, null);

  const finished = interaction.transitionInteraction(unsnapped, {
    type: interaction.EVENTS.DRAG_END,
  });
  assert.deepEqual(plain(finished), plain(idle));
});
