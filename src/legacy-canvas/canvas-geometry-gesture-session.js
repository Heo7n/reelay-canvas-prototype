(function registerCanvasGeometryGesture(root) {
  "use strict";

  const NODE_FIELDS = ["x", "y", "z", "groupId"];
  const GROUP_FIELDS = ["x", "y", "width", "height", "z", "nodeIds"];
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const copy = (value) => Array.isArray(value) ? value.slice() : value;
  const equal = (left, right) => Array.isArray(left) && Array.isArray(right)
    ? left.length === right.length && left.every((value, index) => value === right[index]) : Object.is(left, right);
  const captureFields = (record, fields) => fields.map((key) => ({ key, present: own(record, key), value: copy(record[key]) }));
  const unchanged = (record, fields) => fields.every(({ key, present, value }) => own(record, key) === present && equal(record[key], value));

  // CanvasRecord remains committed content. This owner holds only the geometry
  // and temporary copies that the current pointer session presents to the view.
  function createSession({ getContext, cloneNode } = {}) {
    if (typeof getContext !== "function" || typeof cloneNode !== "function") {
      throw new TypeError("Geometry gestures require context and a pure node clone adapter.");
    }
    let active = null;

    function recordFor(action) {
      return active && (!action || action.gesture === active.token) ? active : null;
    }
    function valid(record) {
      if (!record || record.finished) return false;
      const context = getContext();
      if (!context?.canMutate || context.projectId !== record.projectId || context.canvas !== record.canvas) return false;
      if (record.nodes.some(({ node, before }) => !record.canvas.nodes.includes(node) || !unchanged(node, before))) return false;
      if (record.group && (!record.canvas.groups.includes(record.group.record) || !unchanged(record.group.record, record.group.before))) return false;
      const ids = new Set(record.canvas.nodes.map((node) => node.id));
      return record.copies.every((node) => !ids.has(node.id));
    }
    function isCurrent(action) { return valid(recordFor(action)); }
    function cancel(action) {
      const record = recordFor(action);
      if (!record) return false;
      record.finished = true;
      active = null;
      return true;
    }
    function maxLayer(canvas) {
      return Math.max(0, Number.isFinite(canvas.zCounter) ? canvas.zCounter : 0,
        ...canvas.nodes.map((node) => Number.isFinite(node.z) ? node.z : 0),
        ...canvas.groups.map((group) => Number.isFinite(group.z) ? group.z : 0));
    }
    function promoteLayers(record, nodes, activeId) {
      const ordered = nodes.filter((node) => node.id !== activeId);
      const current = nodes.find((node) => node.id === activeId);
      if (current) ordered.push(current);
      record.layers.clear();
      let z = maxLayer(record.canvas);
      for (const node of ordered) record.layers.set(node, ++z);
    }
    function capture(action) {
      if (!action || typeof action !== "object") return false;
      if (action.gesture) return isCurrent(action);
      if (!["drag-candidate", "group-drag-candidate", "resize-group"].includes(action.type)) return false;
      cancel();
      const context = getContext();
      const canvas = context?.canvas;
      if (!context?.canMutate || !context.projectId || !canvas || !Array.isArray(canvas.nodes) || !Array.isArray(canvas.groups)) return false;
      const ids = action.ids || (action.origins || []).map(({ id }) => id);
      if (new Set(ids).size !== ids.length) return false;
      const nodes = ids.map((id) => canvas.nodes.find((node) => node.id === id));
      if (nodes.some((node) => !node || !Number.isFinite(node.x) || !Number.isFinite(node.y))) return false;
      const group = action.groupId ? canvas.groups.find((entry) => entry.id === action.groupId) : null;
      if (action.groupId && !group) return false;
      if (action.type === "drag-candidate" && !nodes.length) return false;
      const token = Object.freeze({});
      active = { token, projectId: context.projectId, canvas, finished: false, promoted: false,
        nodes: nodes.map((node) => ({ node, before: captureFields(node, NODE_FIELDS) })),
        group: group ? { record: group, before: captureFields(group, GROUP_FIELDS) } : null,
        positions: new Map(), layers: new Map(), frame: null, copies: [], targets: nodes };
      action.gesture = token;
      if (action.type === "drag-candidate") promoteLayers(active, nodes, action.activeId);
      return true;
    }
    function promoteNodes(action) {
      if (!action?.gesture && !capture(action)) return null;
      const record = recordFor(action);
      if (!valid(record) || record.promoted) return null;
      const sources = record.nodes.map(({ node }) => node);
      const copies = action.altKey ? sources.map((source) => ({ source, node: cloneNode(source) })).filter(({ node }) => node) : [];
      if (action.altKey && !copies.length) { cancel(action); return null; }
      const nodes = action.altKey ? copies.map(({ node }) => node) : sources;
      const ids = new Set();
      for (const node of nodes) {
        if (!node?.id || ids.has(node.id) || !Number.isFinite(node.x) || !Number.isFinite(node.y)) { cancel(action); return null; }
        ids.add(node.id);
      }
      record.copies = action.altKey ? nodes : [];
      if (!valid(record)) { cancel(action); return null; }
      record.targets = nodes;
      record.promoted = true;
      const activeId = action.altKey ? (copies.find(({ source }) => source.id === action.activeId) || copies[0]).node.id : action.activeId;
      promoteLayers(record, nodes, activeId);
      return { nodes, origins: nodes.map(({ id, x, y }) => ({ id, x, y })),
        sourceIds: sources.map(({ id }) => id), sourceActiveId: sources.find((node) => node.id === action.activeId)?.id || sources[0]?.id || null,
        activeId, isDuplicate: Boolean(action.altKey) };
    }
    function setNodePositions(action, positions) {
      const record = recordFor(action);
      if (!valid(record) || !Array.isArray(positions)) return false;
      const updates = positions.map((position) => ({ node: record.targets.find((node) => node.id === position.id), position }));
      if (updates.some(({ node, position }) => !node || !Number.isFinite(position.x) || !Number.isFinite(position.y))) return false;
      for (const { node, position } of updates) record.positions.set(node, { x: position.x, y: position.y });
      return true;
    }
    function setGroupFrame(action, frame) {
      const record = recordFor(action);
      if (!valid(record) || !record.group || !frame || Object.keys(frame).some((key) =>
        !["x", "y", "width", "height"].includes(key) || !Number.isFinite(frame[key]) || (["width", "height"].includes(key) && frame[key] <= 0))) return false;
      record.frame = { ...record.frame, ...frame };
      return true;
    }
    function prepareWrite(writes, target, key, value) {
      if (Object.is(target[key], value)) return;
      const descriptor = Object.getOwnPropertyDescriptor(target, key);
      if ((descriptor && (!own(descriptor, "value") || !descriptor.writable)) || (!descriptor && !Object.isExtensible(target))) {
        throw new TypeError("Gesture content is not writable.");
      }
      writes.push({ target, key, descriptor: descriptor ? { ...descriptor, value }
        : { value, writable: true, enumerable: true, configurable: true } });
    }
    function commit(action) {
      const record = recordFor(action);
      if (!valid(record)) { cancel(action); return { ok: false, changed: false }; }
      const writes = [];
      try {
        for (const [node, position] of record.positions) {
          prepareWrite(writes, node, "x", position.x); prepareWrite(writes, node, "y", position.y);
        }
        if (record.frame) for (const [key, value] of Object.entries(record.frame)) prepareWrite(writes, record.group.record, key, value);
        if (record.layers.size) {
          let z = maxLayer(record.canvas);
          for (const node of record.layers.keys()) prepareWrite(writes, node, "z", ++z);
          prepareWrite(writes, record.canvas, "zCounter", z);
        }
        if (record.copies.length) prepareWrite(writes, record.canvas, "nodes", [...record.canvas.nodes, ...record.copies]);
      } catch { cancel(action); return { ok: false, changed: false }; }
      // Validate all identities/owned fields and descriptors before any live write.
      if (!valid(record)) { cancel(action); return { ok: false, changed: false }; }
      cancel(action);
      for (const { target, key, descriptor } of writes) Object.defineProperty(target, key, descriptor);
      return { ok: true, changed: writes.length > 0 };
    }
    function getViewNodes() {
      const canvas = getContext()?.canvas;
      const nodes = canvas?.nodes || [];
      return valid(active) && active.copies.length ? [...nodes, ...active.copies] : nodes;
    }
    function getNodePosition(node) { return valid(active) ? active.positions.get(node) || null : null; }
    function getNodeZ(node) { return valid(active) ? active.layers.get(node) ?? null : null; }
    function getGroupFrame(group) { return valid(active) && active.group?.record === group ? active.frame : null; }
    return Object.freeze({ capture, promoteNodes, setNodePositions, setGroupFrame, commit, cancel, isCurrent,
      hasActive: () => Boolean(active), getViewNodes, getNodePosition, getNodeZ, getGroupFrame });
  }

  root.REELAY_CANVAS_GEOMETRY_GESTURE = Object.freeze({ createSession });
})(typeof globalThis === "object" ? globalThis : window);
