(function registerCanvasConnectionInteraction(root) {
  "use strict";

  const PHASES = Object.freeze({
    IDLE: "idle",
    PORT_HOVER: "port-hover",
    EDGE_DRAG: "edge-drag",
    SNAP_READY: "snap-ready",
  });

  const EVENTS = Object.freeze({
    PORT_HOVER: "port-hover",
    PORT_LEAVE: "port-leave",
    DRAG_START: "drag-start",
    DRAG_MOVE: "drag-move",
    DRAG_END: "drag-end",
    CANCEL: "cancel",
  });

  const DEFAULTS = Object.freeze({
    activationInside: 8,
    activationRadius: 28,
    portOffset: 18,
    portTravelRadius: 22,
    portMinOutside: 11,
    snapEnterRadius: 20,
    snapExitRadius: 32,
  });

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function positive(value, fallback) {
    const next = finite(value, fallback);
    return next >= 0 ? next : fallback;
  }

  function mergeOptions(options) {
    const source = options && typeof options === "object" ? options : {};
    const merged = {
      activationInside: positive(source.activationInside, DEFAULTS.activationInside),
      activationRadius: positive(source.activationRadius, DEFAULTS.activationRadius),
      portOffset: positive(source.portOffset, DEFAULTS.portOffset),
      portTravelRadius: positive(source.portTravelRadius, DEFAULTS.portTravelRadius),
      portMinOutside: positive(source.portMinOutside, DEFAULTS.portMinOutside),
      snapEnterRadius: positive(source.snapEnterRadius, DEFAULTS.snapEnterRadius),
      snapExitRadius: positive(source.snapExitRadius, DEFAULTS.snapExitRadius),
    };
    merged.portTravelRadius = Math.max(merged.portMinOutside, merged.portTravelRadius);
    merged.portOffset = clamp(
      merged.portOffset,
      merged.portMinOutside,
      merged.portTravelRadius,
    );
    merged.snapExitRadius = Math.max(merged.snapEnterRadius, merged.snapExitRadius);
    return merged;
  }

  function normalizePoint(point) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
    return { x: point.x, y: point.y };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function distanceBetween(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function createPortEntry(definition, options) {
    if (!definition || typeof definition !== "object") return null;
    const id = typeof definition.id === "string" ? definition.id.trim() : "";
    const nodeId = typeof definition.nodeId === "string" ? definition.nodeId.trim() : "";
    const side = definition.side === "left" || definition.side === "right"
      ? definition.side
      : null;
    const anchor = normalizePoint(definition.anchor);
    if (!id || !nodeId || !side || !anchor) return null;

    const settings = mergeOptions({ ...options, ...definition.options });
    const direction = side === "left" ? -1 : 1;
    const restCenter = {
      x: anchor.x + direction * settings.portOffset,
      y: anchor.y,
    };
    const activationRect = side === "left"
      ? {
        left: anchor.x - settings.activationRadius,
        right: anchor.x + settings.activationInside,
        top: anchor.y - settings.activationRadius,
        bottom: anchor.y + settings.activationRadius,
      }
      : {
        left: anchor.x - settings.activationInside,
        right: anchor.x + settings.activationRadius,
        top: anchor.y - settings.activationRadius,
        bottom: anchor.y + settings.activationRadius,
      };

    return Object.freeze({
      id,
      nodeId,
      side,
      anchor: Object.freeze(anchor),
      restCenter: Object.freeze(restCenter),
      activationRect: Object.freeze(activationRect),
      activationInside: settings.activationInside,
      activationRadius: settings.activationRadius,
      portTravelRadius: settings.portTravelRadius,
      portMinOutside: settings.portMinOutside,
      disabled: definition.disabled === true,
    });
  }

  function buildPortRegistry(definitions, options) {
    const seen = new Set();
    const registry = [];
    for (const definition of Array.isArray(definitions) ? definitions : []) {
      const entry = createPortEntry(definition, options);
      if (!entry || seen.has(entry.id)) continue;
      seen.add(entry.id);
      registry.push(entry);
    }
    return Object.freeze(registry);
  }

  function clampPointerToPort(pointer, port, options) {
    const nextPointer = normalizePoint(pointer);
    if (!nextPointer || !port || port.disabled) return null;
    const requireActivation = options?.requireActivation !== false;
    const direction = port.side === "left" ? -1 : 1;
    const outward = direction * (nextPointer.x - port.anchor.x);
    const vertical = nextPointer.y - port.anchor.y;
    const insideActivation = outward >= -port.activationInside
      && Math.hypot(Math.max(0, outward), vertical) <= port.activationRadius;
    if (requireActivation && !insideActivation) return null;

    const clampedOutward = clamp(
      outward,
      port.portMinOutside,
      port.portTravelRadius,
    );
    const verticalLimit = Math.sqrt(Math.max(
      0,
      (port.portTravelRadius ** 2) - (clampedOutward ** 2),
    ));
    return {
      x: port.anchor.x + direction * clampedOutward,
      y: port.anchor.y + clamp(vertical, -verticalLimit, verticalLimit),
    };
  }

  function findHoveredPort(pointer, registry) {
    const nextPointer = normalizePoint(pointer);
    if (!nextPointer) return null;
    let nearest = null;
    for (const port of Array.isArray(registry) ? registry : []) {
      const point = clampPointerToPort(nextPointer, port);
      if (!point) continue;
      const distance = distanceBetween(nextPointer, point);
      if (!nearest || distance < nearest.distance) {
        nearest = {
          portId: port.id,
          nodeId: port.nodeId,
          side: port.side,
          point,
          distance,
        };
      }
    }
    return nearest;
  }

  function resolveConnectionDirection(origin, target) {
    if (!origin || !target || origin.nodeId === target.nodeId) return null;
    if (origin.side === "right" && target.side === "left") {
      return {
        sourceNodeId: origin.nodeId,
        sourcePortId: origin.id,
        targetNodeId: target.nodeId,
        targetPortId: target.id,
      };
    }
    if (origin.side === "left" && target.side === "right") {
      return {
        sourceNodeId: target.nodeId,
        sourcePortId: target.id,
        targetNodeId: origin.nodeId,
        targetPortId: origin.id,
      };
    }
    return null;
  }

  function createSnapResult(pointer, origin, port, canConnect, options) {
    if (!port || port.disabled) return null;
    const direction = resolveConnectionDirection(origin, port);
    if (!direction || (canConnect && !canConnect(direction, port, origin))) return null;
    const point = clampPointerToPort(pointer, port, options);
    if (!point) return null;
    return {
      targetPortId: port.id,
      targetNodeId: port.nodeId,
      point,
      distance: distanceBetween(pointer, point),
      direction,
    };
  }

  function selectSnapCandidate(input) {
    const pointer = normalizePoint(input?.pointer);
    const origin = input?.origin;
    if (!pointer || !origin) return null;
    const registry = Array.isArray(input.registry) ? input.registry : [];
    const settings = mergeOptions(input.options);
    const canConnect = typeof input.canConnect === "function" ? input.canConnect : null;

    if (input.previousTargetId) {
      const previousPort = registry.find((port) => port.id === input.previousTargetId);
      const previous = createSnapResult(
        pointer,
        origin,
        previousPort,
        canConnect,
        { requireActivation: false },
      );
      if (previous && previous.distance <= settings.snapExitRadius) return previous;
    }

    let nearest = null;
    for (const port of registry) {
      if (port.id === origin.id) continue;
      const candidate = createSnapResult(pointer, origin, port, canConnect);
      if (!candidate || candidate.distance > settings.snapEnterRadius) continue;
      if (!nearest || candidate.distance < nearest.distance) nearest = candidate;
    }
    return nearest;
  }

  function createInteractionState() {
    return Object.freeze({
      phase: PHASES.IDLE,
      hoveredPortId: null,
      originPortId: null,
      originNodeId: null,
      originSide: null,
      snapTargetId: null,
      pointer: null,
    });
  }

  function pointOrPrevious(point, previous) {
    return normalizePoint(point) || previous || null;
  }

  function transitionInteraction(state, event) {
    const current = state && typeof state === "object" ? state : createInteractionState();
    if (!event || typeof event !== "object") return current;

    if (event.type === EVENTS.CANCEL || event.type === EVENTS.DRAG_END) {
      return createInteractionState();
    }

    if (event.type === EVENTS.DRAG_START) {
      const side = event.side === "left" || event.side === "right" ? event.side : null;
      if (!event.portId || !event.nodeId || !side) return current;
      return Object.freeze({
        phase: PHASES.EDGE_DRAG,
        hoveredPortId: event.portId,
        originPortId: event.portId,
        originNodeId: event.nodeId,
        originSide: side,
        snapTargetId: null,
        pointer: pointOrPrevious(event.pointer, current.pointer),
      });
    }

    const dragging = current.phase === PHASES.EDGE_DRAG || current.phase === PHASES.SNAP_READY;
    if (event.type === EVENTS.DRAG_MOVE && dragging) {
      const snapTargetId = event.snapTargetId || null;
      return Object.freeze({
        ...current,
        phase: snapTargetId ? PHASES.SNAP_READY : PHASES.EDGE_DRAG,
        snapTargetId,
        pointer: pointOrPrevious(event.pointer, current.pointer),
      });
    }

    if (dragging) return current;

    if (event.type === EVENTS.PORT_HOVER && event.portId) {
      return Object.freeze({
        ...current,
        phase: PHASES.PORT_HOVER,
        hoveredPortId: event.portId,
        pointer: pointOrPrevious(event.pointer, current.pointer),
      });
    }

    if (event.type === EVENTS.PORT_LEAVE) return createInteractionState();
    return current;
  }

  root.REELAY_CANVAS_CONNECTION_INTERACTION = Object.freeze({
    DEFAULTS,
    EVENTS,
    PHASES,
    buildPortRegistry,
    clampPointerToPort,
    createInteractionState,
    findHoveredPort,
    resolveConnectionDirection,
    selectSnapCandidate,
    transitionInteraction,
  });
}(typeof globalThis === "object" ? globalThis : window));
