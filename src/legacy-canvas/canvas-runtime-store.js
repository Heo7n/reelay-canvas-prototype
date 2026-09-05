(function registerCanvasRuntimeStore(root) {
  "use strict";

  const ACTIVE_CANVAS_FIELDS = Object.freeze([
    "nodes",
    "connections",
    "groups",
    "tx",
    "ty",
    "scale",
    "zCounter",
    "undoStack",
  ]);

  const FIELD_DEFAULTS = Object.freeze({
    nodes: () => [],
    connections: () => [],
    groups: () => [],
    tx: () => 0,
    ty: () => 0,
    scale: () => 1,
    zCounter: () => 1,
    undoStack: () => [],
  });

  function createDefaultValue(field) {
    return FIELD_DEFAULTS[field]();
  }

  function normalizeCanvasId(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function prepareCanvasRecord(candidate) {
    if (!candidate || typeof candidate !== "object") {
      throw new TypeError("Canvas runtime records must be objects.");
    }
    const id = normalizeCanvasId(candidate.id);
    if (!id) throw new TypeError("Canvas runtime records require a non-empty id.");
    candidate.id = id;
    for (const field of ACTIVE_CANVAS_FIELDS) {
      if (candidate[field] === undefined) candidate[field] = createDefaultValue(field);
    }
    return candidate;
  }

  function createCanvasRuntimeStore(options = {}) {
    let canvases = [];
    let activeCanvasId = null;
    const onMutation = typeof options.onMutation === "function"
      ? options.onMutation
      : () => undefined;
    const detachedActiveState = Object.fromEntries(
      ACTIVE_CANVAS_FIELDS.map((field) => [field, createDefaultValue(field)]),
    );

    function getCanvas(canvasId) {
      const normalizedId = normalizeCanvasId(canvasId);
      if (!normalizedId) return null;
      return canvases.find((canvas) => canvas.id === normalizedId) || null;
    }

    function getActiveCanvas() {
      return getCanvas(activeCanvasId);
    }

    function replaceCanvases(nextCanvases, requestedActiveCanvasId = null) {
      if (!Array.isArray(nextCanvases)) {
        throw new TypeError("Canvas runtime store requires an array of canvases.");
      }
      const prepared = nextCanvases.map(prepareCanvasRecord);
      const ids = new Set();
      for (const canvas of prepared) {
        if (ids.has(canvas.id)) throw new TypeError(`Duplicate canvas id: ${canvas.id}`);
        ids.add(canvas.id);
      }

      canvases = prepared.slice();
      const requestedId = normalizeCanvasId(requestedActiveCanvasId);
      activeCanvasId = requestedId && ids.has(requestedId)
        ? requestedId
        : canvases[0]?.id || null;
      onMutation(Object.freeze({ type: "replace", activeCanvasId }));
      return getActiveCanvas();
    }

    function activateCanvas(canvasId) {
      const canvas = getCanvas(canvasId);
      if (!canvas) return null;
      if (activeCanvasId === canvas.id) return canvas;
      activeCanvasId = canvas.id;
      onMutation(Object.freeze({ type: "activate", activeCanvasId }));
      return canvas;
    }

    function addCanvas(candidate, options = {}) {
      const canvas = prepareCanvasRecord(candidate);
      if (getCanvas(canvas.id)) throw new TypeError(`Duplicate canvas id: ${canvas.id}`);
      canvases.push(canvas);
      if (!activeCanvasId || options.activate === true) activeCanvasId = canvas.id;
      onMutation(Object.freeze({ type: "add", activeCanvasId, canvasId: canvas.id }));
      return canvas;
    }

    function removeCanvas(canvasId) {
      if (canvases.length <= 1) return null;
      const index = canvases.findIndex((canvas) => canvas.id === canvasId);
      if (index === -1) return null;
      const wasActive = canvases[index].id === activeCanvasId;
      const [removedCanvas] = canvases.splice(index, 1);
      if (wasActive) {
        activeCanvasId = canvases[Math.max(0, index - 1)]?.id || canvases[0]?.id || null;
      }
      onMutation(Object.freeze({ type: "remove", activeCanvasId, canvasId: removedCanvas.id }));
      return Object.freeze({
        activeCanvas: getActiveCanvas(),
        activeChanged: wasActive,
        removedCanvas,
      });
    }

    function getActiveField(field) {
      if (!ACTIVE_CANVAS_FIELDS.includes(field)) {
        throw new TypeError(`Unknown active canvas field: ${field}`);
      }
      return (getActiveCanvas() || detachedActiveState)[field];
    }

    function setActiveField(field, value) {
      if (!ACTIVE_CANVAS_FIELDS.includes(field)) {
        throw new TypeError(`Unknown active canvas field: ${field}`);
      }
      (getActiveCanvas() || detachedActiveState)[field] = value;
      return value;
    }

    function attachStateFacade(target) {
      if (!target || typeof target !== "object") {
        throw new TypeError("Canvas runtime state facade requires an object target.");
      }
      for (const field of ACTIVE_CANVAS_FIELDS) {
        if (Object.hasOwn(target, field)) detachedActiveState[field] = target[field];
        Object.defineProperty(target, field, {
          configurable: false,
          enumerable: true,
          get: () => getActiveField(field),
          set: (value) => setActiveField(field, value),
        });
      }
      Object.defineProperties(target, {
        canvases: {
          configurable: false,
          enumerable: true,
          get: () => canvases.slice(),
        },
        activeCanvasId: {
          configurable: false,
          enumerable: true,
          get: () => activeCanvasId,
        },
      });
      return target;
    }

    return Object.freeze({
      activateCanvas,
      addCanvas,
      attachStateFacade,
      getActiveCanvas,
      getActiveField,
      getCanvas,
      listCanvases: () => canvases.slice(),
      removeCanvas,
      replaceCanvases,
      setActiveField,
    });
  }

  root.REELAY_CANVAS_RUNTIME_STORE = Object.freeze({
    ACTIVE_CANVAS_FIELDS,
    createCanvasRuntimeStore,
  });
}(typeof globalThis === "object" ? globalThis : window));
