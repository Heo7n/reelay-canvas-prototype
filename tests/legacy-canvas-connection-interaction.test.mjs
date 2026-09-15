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

test("buildPortRegistry separates the external start field from the wider target fields", () => {
  assert.equal(registry.length, 4);
  assert.deepEqual(plain(registry[1].activationRect), {
    left: 200,
    right: 272,
    top: 60,
    bottom: 140,
  });
  assert.equal(registry[1].restCenter.x, 238);
  assert.equal(registry[1].hitHorizontalRadius, 34);
  assert.equal(registry[1].hitOutwardRadius, 72);
  assert.equal(registry[1].hitVerticalRadius, 40);
  assert.equal(registry[1].fieldOutwardRadius, 148);
  assert.equal(registry[1].fieldVerticalRadius, 108);
  assert.equal(registry[1].snapOutwardRadius, 104);
  assert.equal(registry[1].snapVerticalRadius, 78);
  assert.equal(registry[1].snapExitPadding, 12);
  assert.equal(registry[1].portMinOutside, 17);
  assert.equal(interaction.isPointInPortHitArea({ x: 238, y: 139 }, registry[1]), true);
  assert.equal(interaction.isPointInPortHitArea({ x: 271, y: 139 }, registry[1]), false);
  assert.equal(interaction.isPointInPortHitArea({ x: 201, y: 100 }, registry[1]), false);
});

test("single-port visual proportions scale with the media while invisible targets stay usable at far zoom", () => {
  for (const scale of [0.1, 0.2, 0.4, 0.5, 1, 2, 4]) {
    const geometry = interaction.getScaledPortGeometry(scale);
    assert.ok(Math.abs(geometry.visualSize / scale - 34) < 1e-9, `world disk size at ${scale}`);
    assert.ok(Math.abs(geometry.portOffset / scale - 38) < 1e-9, `world offset at ${scale}`);
    assert.ok(Math.abs(geometry.portMinOutside / scale - 17) < 1e-9, `world radius at ${scale}`);
    assert.ok(geometry.hitHorizontalRadius >= 22, `comfortable invisible width at ${scale}`);
    assert.ok(geometry.hitVerticalRadius >= 22, `comfortable invisible height at ${scale}`);
    assert.equal(geometry.snapExitPadding, 12);
    const port = interaction.buildPortRegistry([{
      id: "target:right", nodeId: "target", side: "right", anchor: { x: 100, y: 100 }, options: geometry,
    }])[0];
    assert.deepEqual(plain(port.restCenter), { x: 100 + 38 * scale, y: 100 });
    assert.notEqual(interaction.clampPointerToPort({ x: port.restCenter.x + 20, y: 100 }, port), null);
    assert.equal(interaction.clampPointerToPort({ x: port.activationRect.right + 1, y: 100 }, port), null);
  }
  const far = interaction.getScaledPortGeometry(0.2);
  assert.equal(far.fieldOutwardRadius, 64);
  assert.equal(far.fieldVerticalRadius, 24);
  assert.equal(far.snapOutwardRadius, 52);
  assert.equal(far.snapVerticalRadius, 20);
  const near = interaction.getScaledPortGeometry(2);
  assert.equal(near.hitHorizontalRadius, 68);
  assert.equal(near.hitVerticalRadius, 80);
  assert.equal(near.fieldOutwardRadius, 296);
  assert.equal(near.fieldVerticalRadius, 216);
  assert.equal(near.snapOutwardRadius, 208);
  assert.equal(near.snapVerticalRadius, 156);
});

test("missing or invalid scale still produces finite usable port geometry", () => {
  for (const scale of [undefined, NaN, Infinity, -1, 0]) {
    const geometry = interaction.getScaledPortGeometry(scale);
    assert.ok(Object.values(geometry).every(Number.isFinite));
    assert.ok(geometry.visualSize > 0);
    assert.ok(geometry.portOffset > geometry.portMinOutside);
    assert.ok(geometry.hitHorizontalRadius >= 22);
    assert.ok(geometry.hitVerticalRadius >= 22);
  }
});

test("aggregate ports keep a readable screen disk and external hit target across zoom levels", () => {
  const anchor = { x: 720, y: 360 };
  for (const scale of [0.1, 0.2, 0.4, 0.5, 1, 2, 4]) {
    const geometry = interaction.getAggregatePortGeometry(scale);
    const port = interaction.buildPortRegistry([{
      id: "selection:output",
      nodeId: "__selection__",
      side: "right",
      anchor,
      options: geometry,
    }])[0];

    assert.ok(geometry.visualSize >= 32 && geometry.visualSize <= 40, `readable disk at ${scale}`);
    assert.ok(geometry.hitSize >= 44, `accessible target at ${scale}`);
    assert.ok(geometry.markWidth >= 16 && geometry.markWidth <= 21, `readable mark at ${scale}`);
    assert.equal(geometry.markHeight, 2, `crisp mark stroke at ${scale}`);
    assert.ok(geometry.portOffset <= 44, `port stays close to selection at ${scale}`);
    assert.ok(port.restCenter.x - geometry.hitSize / 2 >= anchor.x + 6, `hit area cannot steal frame clicks at ${scale}`);
    assert.deepEqual(plain(port.anchor), anchor);
    assert.equal(port.restCenter.x, anchor.x + geometry.portOffset);
    assert.equal(port.restCenter.y, anchor.y);
  }

  const far = interaction.getAggregatePortGeometry(0.2);
  assert.equal(far.visualSize, 32);
  assert.equal(far.portOffset, 28);
  assert.equal(interaction.getAggregatePortGeometry(2).visualSize, 40);
  assert.ok(Math.abs(interaction.getScaledPortGeometry(0.2).portMinOutside - 3.4) < 1e-9);
  assert.equal(interaction.getScaledPortGeometry(2).portMinOutside, 34);
});

test("aggregate geometry remains finite for missing and invalid scale without changing its edge anchor", () => {
  for (const scale of [undefined, NaN, Infinity, -1, 0]) {
    const geometry = interaction.getAggregatePortGeometry(scale);
    assert.ok(Object.values(geometry).every(Number.isFinite));
    assert.ok(geometry.visualSize >= 32 && geometry.visualSize <= 40);
    assert.ok(geometry.portOffset >= geometry.hitSize / 2 + 6);
  }
});

test("the inner magnet area aligns the port with the pointer on both sides at every zoom", () => {
  for (const scale of [0.2, 0.5, 1, 2]) {
    for (const side of ["left", "right"]) {
      const geometry = interaction.getScaledPortGeometry(scale);
      const port = interaction.buildPortRegistry([{
        id: `target:${side}`, nodeId: "target", side, anchor: { x: 100, y: 100 }, options: geometry,
      }])[0];
      const direction = side === "left" ? -1 : 1;
      const pointer = { x: port.restCenter.x + direction * 10 * scale, y: port.restCenter.y + 4 * scale };
      assert.deepEqual(plain(interaction.clampPointerToPort(pointer, port)), pointer);
      assert.deepEqual(plain(interaction.clampPointerToPort(port.restCenter, port)), plain(port.restCenter));
      assert.equal(interaction.clampPointerToPort({ x: port.anchor.x - direction, y: 100 }, port), null);
    }
  }
});

test("magnetic entry and exit settle continuously at rest instead of jumping at the outer boundary", () => {
  for (const port of [registry[0], registry[1]]) {
    const direction = port.side === "left" ? -1 : 1;
    const edgeX = port.restCenter.x + direction * port.hitHorizontalRadius;
    const atEdge = interaction.clampPointerToPort({ x: edgeX, y: 100 }, port);
    const justInside = interaction.clampPointerToPort({ x: edgeX - direction * 0.01, y: 100 }, port);
    assert.deepEqual(plain(atEdge), plain(port.restCenter));
    assert.ok(Math.hypot(justInside.x - atEdge.x, justInside.y - atEdge.y) < 0.01);
    assert.equal(interaction.clampPointerToPort({ x: edgeX + direction * 0.01, y: 100 }, port), null);
    assert.deepEqual(plain(interaction.clampPointerToPort({ x: edgeX + direction * 30, y: 100 }, port, { requireActivation: false })), plain(port.restCenter));
    const outer = interaction.clampPointerToPort({ x: edgeX - direction * 4, y: 100 }, port);
    assert.ok(Math.hypot(outer.x - port.restCenter.x, outer.y - port.restCenter.y) < 4);
    const beforeCoreBoundary = interaction.clampPointerToPort({ x: port.restCenter.x + direction * 15.29, y: 100 }, port);
    const afterCoreBoundary = interaction.clampPointerToPort({ x: port.restCenter.x + direction * 15.31, y: 100 }, port);
    assert.ok(Math.hypot(afterCoreBoundary.x - beforeCoreBoundary.x, afterCoreBoundary.y - beforeCoreBoundary.y) < 0.03);
  }
});

test("left and right ports give mirrored feedback throughout the magnetic area", () => {
  for (const [dx, dy] of [[0, 0], [10, 4], [-10, 4], [25, 10], [30, -10], [0, 39]]) {
    const left = registry[0];
    const right = registry[1];
    const leftPoint = interaction.clampPointerToPort({ x: left.restCenter.x - dx, y: left.restCenter.y + dy }, left);
    const rightPoint = interaction.clampPointerToPort({ x: right.restCenter.x + dx, y: right.restCenter.y + dy }, right);
    assert.ok(leftPoint && rightPoint);
    assert.ok(Math.abs((leftPoint.x - left.restCenter.x) + (rightPoint.x - right.restCenter.x)) < 1e-9);
    assert.ok(Math.abs(leftPoint.y - rightPoint.y) < 1e-9);
  }
});

test("magnetic movement keeps the visible disk within the hit area and outside the media at every zoom", () => {
  for (const scale of [0.2, 0.5, 1, 2]) {
    const geometry = interaction.getScaledPortGeometry(scale);
    for (const side of ["left", "right"]) {
      const port = interaction.buildPortRegistry([{
        id: `target:${side}`, nodeId: "target", side, anchor: { x: 100, y: 100 }, options: geometry,
      }])[0];
      const direction = side === "left" ? -1 : 1;
      for (let step = 0; step < 36; step += 1) {
        const angle = step * Math.PI / 18;
        const pointer = {
          x: port.restCenter.x + geometry.hitHorizontalRadius * 0.55 * Math.cos(angle),
          y: port.restCenter.y + geometry.hitVerticalRadius * 0.55 * Math.sin(angle),
        };
        if (!interaction.isPointInPortHitArea(pointer, port)) continue;
        const center = interaction.clampPointerToPort(pointer, port);
        assert.ok(center);
        for (let edge = 0; edge < 36; edge += 1) {
          const edgeAngle = edge * Math.PI / 18;
          const point = {
            x: center.x + geometry.visualSize / 2 * Math.cos(edgeAngle),
            y: center.y + geometry.visualSize / 2 * Math.sin(edgeAngle),
          };
          assert.ok(direction * (point.x - port.anchor.x) >= -1e-9, `disk avoids media at ${scale}`);
          assert.equal(interaction.isPointInPortHitArea(point, port), true, `visible circumference is clickable at ${scale}`);
        }
      }
    }
  }
});

test("findHoveredPort chooses the nearest active port from the cached registry", () => {
  const hovered = interaction.findHoveredPort({ x: 470, y: 118 }, registry);
  assert.equal(hovered.portId, "node-b:left");
  assert.deepEqual(plain(hovered.point), { x: 470, y: 118 });
  assert.equal(interaction.findHoveredPort({ x: 350, y: -20 }, registry), null);
});

test("overlapping start fields choose the nearest rest center regardless of registry order", () => {
  const closeRegistry = interaction.buildPortRegistry([
    { id: "first:left", nodeId: "first", side: "left", anchor: { x: 300, y: 100 } },
    { id: "second:left", nodeId: "second", side: "left", anchor: { x: 320, y: 100 } },
  ]);
  for (const ports of [closeRegistry, [...closeRegistry].reverse()]) {
    assert.equal(interaction.findHoveredPort({ x: 265, y: 100 }, ports).portId, "first:left");
    assert.equal(interaction.findHoveredPort({ x: 290, y: 100 }, ports).portId, "second:left");
  }
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
    pointer: { x: 383.9, y: 120 },
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

test("dragging can find and snap a target outside the smaller start field", () => {
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
  assert.equal(interaction.clampPointerToPort({ x: 250, y: 100 }, farRegistry[1]), null);
  assert.deepEqual(plain(candidate.point), { x: 284.8, y: 100 });
  assert.ok(candidate.distance > 0);
  assert.equal(interaction.selectSnapCandidate({
    pointer: { x: 238, y: 100 },
    origin: farRegistry[0],
    registry: farRegistry,
  }), null);
  assert.equal(interaction.clampPointerToPort({ x: 238, y: 100 }, farRegistry[1]), null);
  assert.equal(interaction.selectSnapProximity({
    pointer: { x: 238, y: 100 },
    origin: farRegistry[0],
    registry: farRegistry,
  }).targetPortId, "target:left");
});

test("target proximity works outside the start area while snapped feedback stays at rest", () => {
  const origin = registry[1];
  const near = interaction.selectSnapProximity({
    pointer: { x: 360, y: 120 },
    origin,
    registry,
  });
  assert.equal(near.targetPortId, "node-b:left");
  assert.deepEqual(plain(near.point), { x: 462, y: 120 });
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
  for (const pointer of [{ x: 440, y: 120 }, { x: 478, y: 145 }, { x: 485, y: 115 }]) {
    const snapped = interaction.selectSnapCandidate({ pointer, origin, registry });
    assert.equal(snapped.targetPortId, "node-b:left");
    assert.deepEqual(plain(snapped.point), { x: 462, y: 120 });
  }
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
    pointer: { x: 290, y: 100 },
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
