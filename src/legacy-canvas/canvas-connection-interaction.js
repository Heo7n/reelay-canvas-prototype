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
    fieldOutwardRadius: 148,
    fieldVerticalRadius: 108,
    snapOutwardRadius: 104,
    snapVerticalRadius: 78,
    snapExitPadding: 18,
    portOffset: 38,
    portMinOutside: 17,
    snapSwitchBias: 10,
  });

  const PORT_GEOMETRY = Object.freeze({
    fieldOutwardRadius: 148,
    fieldVerticalRadius: 108,
    minScreenOutwardRadius: 64,
    minScreenVerticalRadius: 24,
    snapOutwardRadius: 104,
    snapVerticalRadius: 78,
    minScreenSnapOutwardRadius: 52,
    minScreenSnapVerticalRadius: 20,
    snapExitPadding: 18,
    portOffset: 38,
    portMinOutside: 17,
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
      fieldOutwardRadius: positive(source.fieldOutwardRadius, DEFAULTS.fieldOutwardRadius),
      fieldVerticalRadius: positive(source.fieldVerticalRadius, DEFAULTS.fieldVerticalRadius),
      snapOutwardRadius: positive(source.snapOutwardRadius, DEFAULTS.snapOutwardRadius),
      snapVerticalRadius: positive(source.snapVerticalRadius, DEFAULTS.snapVerticalRadius),
      snapExitPadding: positive(source.snapExitPadding, DEFAULTS.snapExitPadding),
      portOffset: positive(source.portOffset, DEFAULTS.portOffset),
      portMinOutside: positive(source.portMinOutside, DEFAULTS.portMinOutside),
      snapSwitchBias: positive(source.snapSwitchBias, DEFAULTS.snapSwitchBias),
    };
    merged.fieldOutwardRadius = Math.max(0.01, merged.portMinOutside, merged.fieldOutwardRadius);
    merged.fieldVerticalRadius = Math.max(0.01, merged.fieldVerticalRadius);
    merged.snapOutwardRadius = clamp(
      Math.max(0.01, merged.snapOutwardRadius),
      0.01,
      merged.fieldOutwardRadius,
    );
    merged.snapVerticalRadius = clamp(
      Math.max(0.01, merged.snapVerticalRadius),
      0.01,
      merged.fieldVerticalRadius,
    );
    merged.portOffset = clamp(
      merged.portOffset,
      merged.portMinOutside,
      merged.fieldOutwardRadius,
    );
    return merged;
  }

  function getScaledPortGeometry(canvasScale) {
    const scale = Math.max(0.01, finite(canvasScale, 1));
    return {
      fieldOutwardRadius: Math.max(
        PORT_GEOMETRY.minScreenOutwardRadius,
        PORT_GEOMETRY.fieldOutwardRadius * scale,
      ),
      fieldVerticalRadius: Math.max(
        PORT_GEOMETRY.minScreenVerticalRadius,
        PORT_GEOMETRY.fieldVerticalRadius * scale,
      ),
      snapOutwardRadius: Math.max(
        PORT_GEOMETRY.minScreenSnapOutwardRadius,
        PORT_GEOMETRY.snapOutwardRadius * scale,
      ),
      snapVerticalRadius: Math.max(
        PORT_GEOMETRY.minScreenSnapVerticalRadius,
        PORT_GEOMETRY.snapVerticalRadius * scale,
      ),
      snapExitPadding: PORT_GEOMETRY.snapExitPadding,
      portOffset: PORT_GEOMETRY.portOffset * scale,
      portMinOutside: PORT_GEOMETRY.portMinOutside * scale,
    };
  }

  function normalizePoint(point) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
    return { x: point.x, y: point.y };
  }

  function normalizeRect(rect) {
    if (!rect || typeof rect !== "object") return null;
    const left = finite(rect.left, NaN);
    const right = finite(rect.right, NaN);
    const top = finite(rect.top, NaN);
    const bottom = finite(rect.bottom, NaN);
    if (![left, right, top, bottom].every(Number.isFinite)) return null;
    const normalized = {
      left: Math.min(left, right),
      right: Math.max(left, right),
      top: Math.min(top, bottom),
      bottom: Math.max(top, bottom),
    };
    normalized.width = normalized.right - normalized.left;
    normalized.height = normalized.bottom - normalized.top;
    return normalized.width > 0 && normalized.height > 0 ? normalized : null;
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
    const targetRect = normalizeRect(definition.targetRect);
    if (!id || !nodeId || !side || !anchor) return null;

    const settings = mergeOptions({ ...options, ...definition.options });
    const direction = side === "left" ? -1 : 1;
    const restCenter = {
      x: anchor.x + direction * settings.portOffset,
      y: anchor.y,
    };
    const activationRect = side === "left"
      ? {
        left: anchor.x - settings.fieldOutwardRadius,
        right: anchor.x,
        top: anchor.y - settings.fieldVerticalRadius,
        bottom: anchor.y + settings.fieldVerticalRadius,
      }
      : {
        left: anchor.x,
        right: anchor.x + settings.fieldOutwardRadius,
        top: anchor.y - settings.fieldVerticalRadius,
        bottom: anchor.y + settings.fieldVerticalRadius,
      };

    return Object.freeze({
      id,
      nodeId,
      side,
      anchor: Object.freeze(anchor),
      restCenter: Object.freeze(restCenter),
      activationRect: Object.freeze(activationRect),
      fieldOutwardRadius: settings.fieldOutwardRadius,
      fieldVerticalRadius: settings.fieldVerticalRadius,
      snapOutwardRadius: settings.snapOutwardRadius,
      snapVerticalRadius: settings.snapVerticalRadius,
      snapExitPadding: settings.snapExitPadding,
      portMinOutside: settings.portMinOutside,
      targetRect: targetRect ? Object.freeze(targetRect) : null,
      targetInset: positive(definition.targetInset, 12),
      targetPriority: finite(definition.targetPriority, 0),
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

  function getPortFieldCoordinates(pointer, port) {
    const nextPointer = normalizePoint(pointer);
    if (!nextPointer || !port) return null;
    const direction = port.side === "left" ? -1 : 1;
    return {
      direction,
      outward: direction * (nextPointer.x - port.anchor.x),
      vertical: nextPointer.y - port.anchor.y,
    };
  }

  function isPointInPortField(pointer, port, outwardRadius, verticalRadius) {
    const coordinates = getPortFieldCoordinates(pointer, port);
    if (!coordinates) return false;
    const rx = Math.max(0.01, finite(outwardRadius, port.fieldOutwardRadius));
    const ry = Math.max(0.01, finite(verticalRadius, port.fieldVerticalRadius));
    return coordinates.outward >= 0
      && ((coordinates.outward / rx) ** 2)
        + ((coordinates.vertical / ry) ** 2) <= 1;
  }

  function clampPointerToPort(pointer, port, options) {
    const nextPointer = normalizePoint(pointer);
    if (!nextPointer || !port || port.disabled) return null;
    const requireActivation = options?.requireActivation !== false;
    const coordinates = getPortFieldCoordinates(nextPointer, port);
    const { direction, outward, vertical } = coordinates;
    if (outward < 0) return null;
    const insideActivation = isPointInPortField(nextPointer, port);
    if (requireActivation && !insideActivation) return null;

    const clampedOutward = clamp(
      outward,
      port.portMinOutside,
      port.fieldOutwardRadius,
    );
    const outwardRatio = clampedOutward / port.fieldOutwardRadius;
    const verticalLimit = port.fieldVerticalRadius * Math.sqrt(Math.max(
      0,
      1 - (outwardRatio ** 2),
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
      const restDistance = distanceBetween(nextPointer, port.restCenter);
      if (!nearest
        || distance < nearest.distance
        || (distance === nearest.distance && restDistance < nearest.restDistance)) {
        nearest = {
          portId: port.id,
          nodeId: port.nodeId,
          side: port.side,
          point,
          distance,
          restDistance,
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

  function createSnapResult(pointer, origin, port, canConnect, radii) {
    if (!port || port.disabled) return null;
    const direction = resolveConnectionDirection(origin, port);
    if (!direction || (canConnect && !canConnect(direction, port, origin))) return null;
    if (!isPointInPortField(pointer, port, radii?.outward, radii?.vertical)) return null;
    const point = clampPointerToPort(pointer, port, { requireActivation: false });
    if (!point) return null;
    return {
      targetPortId: port.id,
      targetNodeId: port.nodeId,
      point,
      distance: distanceBetween(pointer, point),
      restDistance: distanceBetween(pointer, port.restCenter),
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

    let retained = null;
    if (input.previousTargetId) {
      const previousPort = registry.find((port) => port.id === input.previousTargetId);
      const previous = createSnapResult(
        pointer,
        origin,
        previousPort,
        canConnect,
        {
          outward: previousPort
            ? previousPort.snapOutwardRadius + previousPort.snapExitPadding
            : undefined,
          vertical: previousPort
            ? previousPort.snapVerticalRadius + previousPort.snapExitPadding
            : undefined,
        },
      );
      if (previous) retained = previous;
    }

    let nearest = null;
    for (const port of registry) {
      if (port.id === origin.id || port.id === retained?.targetPortId) continue;
      const candidate = createSnapResult(pointer, origin, port, canConnect, {
        outward: port.snapOutwardRadius,
        vertical: port.snapVerticalRadius,
      });
      if (!candidate) continue;
      if (!nearest || candidate.restDistance < nearest.restDistance) nearest = candidate;
    }
    if (!retained) return nearest;
    if (nearest && nearest.restDistance + settings.snapSwitchBias < retained.restDistance) {
      return nearest;
    }
    return retained;
  }

  function createNodeBodyCandidate(pointer, origin, port, canConnect) {
    if (!port || port.disabled || !port.targetRect) return null;
    const direction = resolveConnectionDirection(origin, port);
    if (!direction || (canConnect && !canConnect(direction, port, origin))) return null;
    const rect = port.targetRect;
    if (pointer.x < rect.left || pointer.x > rect.right
      || pointer.y < rect.top || pointer.y > rect.bottom) return null;
    const inset = clamp(port.targetInset, 0, rect.height / 2);
    const connectionPoint = {
      x: port.side === "left" ? rect.left : rect.right,
      y: clamp(pointer.y, rect.top + inset, rect.bottom - inset),
    };
    return {
      targetPortId: port.id,
      targetNodeId: port.nodeId,
      point: port.restCenter,
      connectionPoint,
      distance: distanceBetween(pointer, connectionPoint),
      restDistance: distanceBetween(pointer, port.restCenter),
      targetPriority: port.targetPriority,
      hitKind: "body",
      direction,
    };
  }

  function selectNodeBodyCandidate(input) {
    const pointer = normalizePoint(input?.pointer);
    const origin = input?.origin;
    if (!pointer || !origin) return null;
    const registry = Array.isArray(input.registry) ? input.registry : [];
    const canConnect = typeof input.canConnect === "function" ? input.canConnect : null;
    let selected = null;

    for (const port of registry) {
      if (port.id === origin.id) continue;
      const candidate = createNodeBodyCandidate(pointer, origin, port, canConnect);
      if (!candidate) continue;
      if (!selected
        || candidate.targetPriority > selected.targetPriority
        || (candidate.targetPriority === selected.targetPriority
          && candidate.restDistance < selected.restDistance)) selected = candidate;
    }
    return selected;
  }

  function selectSnapProximity(input) {
    const pointer = normalizePoint(input?.pointer);
    const origin = input?.origin;
    if (!pointer || !origin) return null;
    const registry = Array.isArray(input.registry) ? input.registry : [];
    const canConnect = typeof input.canConnect === "function" ? input.canConnect : null;
    let nearest = null;

    for (const port of registry) {
      if (port.id === origin.id || port.disabled) continue;
      const direction = resolveConnectionDirection(origin, port);
      if (!direction || (canConnect && !canConnect(direction, port, origin))) continue;
      if (!isPointInPortField(pointer, port)) continue;
      const point = clampPointerToPort(pointer, port, { requireActivation: false });
      if (!point) continue;
      const distance = distanceBetween(pointer, port.restCenter);
      const coordinates = getPortFieldCoordinates(pointer, port);
      const normalizedDistance = Math.sqrt(
        ((coordinates.outward / port.fieldOutwardRadius) ** 2)
        + ((coordinates.vertical / port.fieldVerticalRadius) ** 2),
      );
      if (!nearest || distance < nearest.distance) {
        nearest = {
          targetPortId: port.id,
          targetNodeId: port.nodeId,
          point,
          distance,
          strength: 1 - normalizedDistance,
          direction,
        };
      }
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
    getScaledPortGeometry,
    isPointInPortField,
    resolveConnectionDirection,
    selectNodeBodyCandidate,
    selectSnapCandidate,
    selectSnapProximity,
    transitionInteraction,
  });
}(typeof globalThis === "object" ? globalThis : window));
