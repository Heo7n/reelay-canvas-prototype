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
  { id: "node-a:left", nodeId: "node-a", side: "left", anchor: { x: 100, y: 100 }, targetRect: { left: 100, right: 200, top: 50, bottom: 150 } },
  { id: "node-a:right", nodeId: "node-a", side: "right", anchor: { x: 200, y: 100 }, targetRect: { left: 100, right: 200, top: 50, bottom: 150 } },
  { id: "node-b:left", nodeId: "node-b", side: "left", anchor: { x: 500, y: 120 }, targetRect: { left: 500, right: 600, top: 70, bottom: 170 } },
  { id: "node-b:right", nodeId: "node-b", side: "right", anchor: { x: 600, y: 120 }, targetRect: { left: 500, right: 600, top: 70, bottom: 170 } },
]);

test("buildPortRegistry creates a frame-external half-ellipse field", () => {
  assert.equal(registry.length, 4);
  assert.deepEqual(plain(registry[1].activationRect), {
    left: 200,
    right: 348,
    top: -8,
    bottom: 208,
  });
  assert.equal(registry[1].restCenter.x, 238);
  assert.equal(registry[1].fieldOutwardRadius, 148);
  assert.equal(registry[1].fieldVerticalRadius, 108);
  assert.equal(registry[1].snapOutwardRadius, 104);
  assert.equal(registry[1].snapVerticalRadius, 78);
  assert.equal(registry[1].snapExitPadding, 18);
  assert.equal(registry[1].portMinOutside, 17);
});

test("port fields scale with the canvas while retaining far-zoom screen floors", () => {
  const farGeometry = interaction.getScaledPortGeometry(0.4);
  const nearGeometry = interaction.getScaledPortGeometry(2);
  const far = interaction.buildPortRegistry([
    { id: "far:right", nodeId: "far", side: "right", anchor: { x: 100, y: 100 }, options: farGeometry },
  ])[0];
  const near = interaction.buildPortRegistry([
    { id: "near:right", nodeId: "near", side: "right", anchor: { x: 100, y: 100 }, options: nearGeometry },
  ])[0];

  assert.equal(far.restCenter.x, 115.2);
  assert.equal(near.restCenter.x, 176);
  assert.equal(far.fieldOutwardRadius, 64);
  assert.ok(Math.abs(far.fieldVerticalRadius - 43.2) < 1e-9);
  assert.equal(far.snapOutwardRadius, 52);
  assert.ok(Math.abs(far.snapVerticalRadius - 31.2) < 1e-9);
  assert.equal(near.fieldOutwardRadius, 296);
  assert.equal(near.fieldVerticalRadius, 216);
  assert.equal(near.snapOutwardRadius, 208);
  assert.equal(near.snapVerticalRadius, 156);
  assert.ok(Math.abs(far.portMinOutside - 6.8) < 1e-9);
  assert.equal(near.portMinOutside, 34);
  assert.equal(far.snapExitPadding, 18);
  assert.equal(near.snapExitPadding, 18);
});

test("clampPointerToPort follows the pointer only inside the external half ellipse", () => {
  const rightPort = registry[1];
  assert.deepEqual(
    plain(interaction.clampPointerToPort({ x: 220, y: 106 }, rightPort)),
    { x: 220, y: 106 },
  );
  assert.deepEqual(
    plain(interaction.clampPointerToPort({ x: 348, y: 100 }, rightPort)),
    { x: 348, y: 100 },
  );
  assert.equal(interaction.clampPointerToPort({ x: 199.9, y: 100 }, rightPort), null);
  assert.equal(interaction.clampPointerToPort({ x: 340, y: 190 }, rightPort), null);
  assert.equal(interaction.clampPointerToPort({ x: 349, y: 100 }, rightPort), null);

  const leftPort = registry[0];
  assert.deepEqual(
    plain(interaction.clampPointerToPort({ x: 80, y: 92 }, leftPort)),
    { x: 80, y: 92 },
  );
});

test("findHoveredPort chooses the nearest active port from the cached registry", () => {
  const hovered = interaction.findHoveredPort({ x: 480, y: 118 }, registry);
  assert.equal(hovered.portId, "node-b:left");
  assert.deepEqual(plain(hovered.point), { x: 480, y: 118 });
  assert.equal(interaction.findHoveredPort({ x: 350, y: -20 }, registry), null);
});

test("selectSnapCandidate uses nested enter and exit half ellipses for hysteresis", () => {
  const origin = registry[1];
  const enter = interaction.selectSnapCandidate({
    pointer: { x: 400, y: 120 },
    origin,
    registry,
  });
  assert.equal(enter.targetPortId, "node-b:left");

  const retained = interaction.selectSnapCandidate({
    pointer: { x: 390, y: 120 },
    origin,
    registry,
    previousTargetId: enter.targetPortId,
  });
  assert.equal(retained.targetPortId, "node-b:left");
  const target = registry[2];
  assert.equal(interaction.isPointInPortField(
    { x: 390, y: 120 },
    target,
    target.snapOutwardRadius,
    target.snapVerticalRadius,
  ), false);
  assert.equal(interaction.isPointInPortField(
    { x: 390, y: 120 },
    target,
    target.snapOutwardRadius + target.snapExitPadding,
    target.snapVerticalRadius + target.snapExitPadding,
  ), true);

  const released = interaction.selectSnapCandidate({
    pointer: { x: 377.9, y: 120 },
    origin,
    registry,
    previousTargetId: enter.targetPortId,
  });
  assert.equal(released, null);
  assert.equal(interaction.selectSnapCandidate({
    pointer: { x: 500.1, y: 120 },
    origin,
    registry,
    previousTargetId: enter.targetPortId,
  }), null);
});

test("port snap stays external while the media frame is a complete connection target", () => {
  const portCandidate = interaction.selectSnapCandidate({
    pointer: { x: 501, y: 120 },
    origin: registry[1],
    registry,
  });
  assert.equal(portCandidate, null);
  assert.equal(interaction.selectSnapCandidate({
    pointer: { x: 360, y: 220 },
    origin: registry[1],
    registry,
  }), null);

  const bodyCandidate = interaction.selectNodeBodyCandidate({
    pointer: { x: 550, y: 90 },
    origin: registry[1],
    registry,
  });
  assert.equal(bodyCandidate.targetPortId, "node-b:left");
  assert.equal(bodyCandidate.targetNodeId, "node-b");
  assert.equal(bodyCandidate.hitKind, "body");
  assert.deepEqual(plain(bodyCandidate.point), { x: 462, y: 120 });
  assert.deepEqual(plain(bodyCandidate.connectionPoint), { x: 500, y: 90 });
  assert.deepEqual(plain(bodyCandidate.direction), {
    sourceNodeId: "node-a",
    sourcePortId: "node-a:right",
    targetNodeId: "node-b",
    targetPortId: "node-b:left",
  });
});

test("node body targeting projects safely to either connection edge", () => {
  const nearCorner = interaction.selectNodeBodyCandidate({
    pointer: { x: 590, y: 71 },
    origin: registry[1],
    registry,
  });
  assert.deepEqual(plain(nearCorner.connectionPoint), { x: 500, y: 82 });

  const reverse = interaction.selectNodeBodyCandidate({
    pointer: { x: 150, y: 130 },
    origin: registry[2],
    registry,
  });
  assert.equal(reverse.targetPortId, "node-a:right");
  assert.deepEqual(plain(reverse.connectionPoint), { x: 200, y: 130 });
  assert.deepEqual(plain(reverse.direction), {
    sourceNodeId: "node-a",
    sourcePortId: "node-a:right",
    targetNodeId: "node-b",
    targetPortId: "node-b:left",
  });

  assert.equal(interaction.selectNodeBodyCandidate({
    pointer: { x: 550, y: 120 },
    origin: registry[1],
    registry,
    canConnect: (direction) => direction.targetNodeId !== "node-b",
  }), null);
});

test("overlapping node bodies prefer the top visual target", () => {
  const overlapRegistry = interaction.buildPortRegistry([
    { id: "origin:right", nodeId: "origin", side: "right", anchor: { x: 100, y: 100 } },
    { id: "lower:left", nodeId: "lower", side: "left", anchor: { x: 300, y: 100 }, targetRect: { left: 300, right: 500, top: 20, bottom: 180 }, targetPriority: 3 },
    { id: "upper:left", nodeId: "upper", side: "left", anchor: { x: 320, y: 100 }, targetRect: { left: 300, right: 500, top: 20, bottom: 180 }, targetPriority: 8 },
  ]);
  const candidate = interaction.selectNodeBodyCandidate({
    pointer: { x: 420, y: 100 },
    origin: overlapRegistry[0],
    registry: overlapRegistry,
  });
  assert.equal(candidate.targetPortId, "upper:left");
});

test("far-zoom hover keeps an outer floor while snap uses its nested ellipse", () => {
  const farRegistry = interaction.buildPortRegistry([
    { id: "origin:right", nodeId: "origin", side: "right", anchor: { x: 100, y: 100 }, options: interaction.getScaledPortGeometry(0.4) },
    { id: "target:left", nodeId: "target", side: "left", anchor: { x: 300, y: 100 }, options: interaction.getScaledPortGeometry(0.4) },
  ]);
  const candidate = interaction.selectSnapCandidate({
    pointer: { x: 250, y: 100 },
    origin: farRegistry[0],
    registry: farRegistry,
  });
  assert.equal(candidate.targetPortId, "target:left");
  assert.equal(candidate.distance, 0);
  assert.deepEqual(plain(candidate.point), { x: 250, y: 100 });
  assert.equal(interaction.selectSnapCandidate({
    pointer: { x: 247.9, y: 100 },
    origin: farRegistry[0],
    registry: farRegistry,
  }), null);
  assert.equal(interaction.selectSnapProximity({
    pointer: { x: 240, y: 100 },
    origin: farRegistry[0],
    registry: farRegistry,
  }).targetPortId, "target:left");
});

test("snap proximity follows the pointer only inside the outer external half ellipse", () => {
  const origin = registry[1];
  const near = interaction.selectSnapProximity({
    pointer: { x: 360, y: 120 },
    origin,
    registry,
  });
  assert.equal(near.targetPortId, "node-b:left");
  assert.deepEqual(plain(near.point), { x: 360, y: 120 });
  assert.ok(near.strength > 0 && near.strength < 0.1);

  const boundary = interaction.selectSnapProximity({
    pointer: { x: 352, y: 120 },
    origin,
    registry,
  });
  assert.equal(boundary.targetPortId, "node-b:left");
  assert.equal(boundary.strength, 0);
  assert.equal(interaction.selectSnapProximity({
    pointer: { x: 351.9, y: 120 },
    origin,
    registry,
  }), null);
  assert.equal(interaction.selectSnapProximity({
    pointer: { x: 500.1, y: 120 },
    origin,
    registry,
  }), null);
  assert.equal(interaction.selectSnapProximity({
    pointer: { x: 360, y: 220 },
    origin,
    registry,
  }), null);
});

test("snap selection ranks overlapping candidates by stable rest distance", () => {
  const closeRegistry = interaction.buildPortRegistry([
    { id: "origin:right", nodeId: "origin", side: "right", anchor: { x: 100, y: 100 } },
    { id: "first:left", nodeId: "first", side: "left", anchor: { x: 300, y: 100 } },
    { id: "second:left", nodeId: "second", side: "left", anchor: { x: 320, y: 100 } },
  ]);
  const selected = interaction.selectSnapCandidate({
    pointer: { x: 285, y: 100 },
    origin: closeRegistry[0],
    registry: closeRegistry,
  });
  assert.equal(selected.targetPortId, "second:left");

  const switched = interaction.selectSnapCandidate({
    pointer: { x: 282, y: 100 },
    origin: closeRegistry[0],
    registry: closeRegistry,
    previousTargetId: "first:left",
  });
  assert.equal(switched.targetPortId, "second:left");
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
