(function registerCanvasPersistenceCoordinator(root) {
  "use strict";

  const PROTOCOL_VERSION = 1;
  const LEGACY_SOURCE = "reelay-legacy-canvas";
  const HOST_SOURCE = "reelay-shell";
  const ACCESS_MODES = new Set(["standalone", "loading", "editable", "readonly", "blocked"]);
  const SAVE_ERROR_CODES = new Set(["conflict", "forbidden", "missing", "network"]);

  function createCanvasPersistenceCoordinator(options = {}) {
    const instanceId = typeof options.instanceId === "string" ? options.instanceId.trim() : "";
    const serialize = options.serialize;
    const hydrate = options.hydrate;
    const makeRequestId = options.makeRequestId;
    const postMessage = options.postMessage;
    const setTimer = options.setTimer;
    const clearTimer = options.clearTimer;
    if (
      !instanceId
      || typeof serialize !== "function"
      || typeof hydrate !== "function"
      || typeof makeRequestId !== "function"
      || typeof postMessage !== "function"
      || typeof setTimer !== "function"
      || typeof clearTimer !== "function"
    ) {
      throw new TypeError("Canvas persistence coordinator dependencies are incomplete.");
    }

    const isHosted = typeof options.isHosted === "function" ? options.isHosted : () => true;
    const getExpectedOrigin = typeof options.getExpectedOrigin === "function"
      ? options.getExpectedOrigin
      : () => "";
    const getExpectedSource = typeof options.getExpectedSource === "function"
      ? options.getExpectedSource
      : () => null;
    const onAccessChange = typeof options.onAccessChange === "function"
      ? options.onAccessChange
      : () => undefined;
    const onContext = typeof options.onContext === "function" ? options.onContext : () => undefined;
    const onDocumentReady = typeof options.onDocumentReady === "function"
      ? options.onDocumentReady
      : () => undefined;
    const onNotice = typeof options.onNotice === "function" ? options.onNotice : () => undefined;

    const state = {
      initialized: false,
      hydrating: false,
      writable: false,
      blocked: false,
      revision: 0,
      projectId: null,
      canvasId: null,
      scopeKey: null,
      saveTimer: 0,
      inFlight: null,
      pendingAfterFlight: false,
      lastSavedSnapshot: "",
      dirty: false,
      accessMode: isHosted() ? "loading" : "standalone",
      documentLoaded: false,
    };

    function setAccessMode(mode) {
      if (!ACCESS_MODES.has(mode) || state.accessMode === mode) return;
      state.accessMode = mode;
      onAccessChange(mode);
    }

    function send(type, payload = {}) {
      if (!isHosted()) return false;
      postMessage({
        source: LEGACY_SOURCE,
        type,
        protocolVersion: PROTOCOL_VERSION,
        instanceId,
        ...payload,
      });
      return true;
    }

    function setDirty(dirty) {
      const nextDirty = dirty === true;
      if (state.dirty === nextDirty) return;
      state.dirty = nextDirty;
      send("canvas:dirty", { dirty: nextDirty });
    }

    function clearScheduledSave() {
      if (!state.saveTimer) return;
      clearTimer(state.saveTimer);
      state.saveTimer = 0;
    }

    function resetForContext(context) {
      clearScheduledSave();
      state.initialized = false;
      state.hydrating = false;
      state.writable = context.writable === true;
      state.blocked = false;
      state.revision = 0;
      state.projectId = String(context.projectId);
      state.canvasId = String(context.canvasId || "main");
      state.scopeKey = `${state.projectId}\u0000${state.canvasId}`;
      state.inFlight = null;
      state.pendingAfterFlight = false;
      state.lastSavedSnapshot = "";
      state.dirty = false;
      state.documentLoaded = false;
      setAccessMode("loading");
    }

    function matchesDocumentScope(document) {
      return Boolean(
        document
        && document.projectId === state.projectId
        && document.id === state.canvasId,
      );
    }

    function initializeDocument(message) {
      if (!state.scopeKey || state.documentLoaded) return false;
      if (message.document && !matchesDocumentScope(message.document)) return false;

      state.hydrating = true;
      state.writable = message.writable === true;
      state.revision = message.document?.revision || 0;
      const hydrated = message.document ? hydrate(message.document.content) : true;
      state.hydrating = false;
      state.documentLoaded = true;
      if (!hydrated) {
        state.blocked = true;
        setAccessMode("blocked");
        onNotice("unsupported-document");
        return true;
      }

      state.lastSavedSnapshot = serialize();
      state.initialized = true;
      setDirty(false);
      setAccessMode(state.writable ? "editable" : "readonly");
      onDocumentReady({
        document: message.document || null,
        writable: state.writable,
      });
      return true;
    }

    function flush() {
      clearScheduledSave();
      if (
        !state.initialized
        || state.hydrating
        || !state.writable
        || state.blocked
        || !state.canvasId
      ) return false;
      if (state.inFlight) {
        state.pendingAfterFlight = true;
        return false;
      }

      const serialized = serialize();
      if (serialized === state.lastSavedSnapshot) {
        state.pendingAfterFlight = false;
        setDirty(false);
        return false;
      }

      const requestId = makeRequestId();
      state.inFlight = {
        requestId,
        scopeKey: state.scopeKey,
        serialized,
      };
      state.pendingAfterFlight = false;
      setDirty(true);
      send("canvas:save", {
        requestId,
        schemaVersion: 1,
        expectedRevision: state.revision,
        content: JSON.parse(serialized),
      });
      return true;
    }

    function schedule(delay = 800) {
      if (!state.initialized || state.hydrating || !state.writable || state.blocked) return false;
      setDirty(true);
      if (state.inFlight) {
        state.pendingAfterFlight = true;
        return true;
      }
      clearScheduledSave();
      state.saveTimer = setTimer(() => {
        state.saveTimer = 0;
        flush();
      }, delay);
      return true;
    }

    function acceptSaveResult(message) {
      const inFlight = state.inFlight;
      if (
        !inFlight
        || message.requestId !== inFlight.requestId
        || inFlight.scopeKey !== state.scopeKey
        || !matchesDocumentScope(message.document)
      ) return false;

      state.revision = message.document.revision;
      state.lastSavedSnapshot = inFlight.serialized;
      state.inFlight = null;
      const changedDuringSave = state.pendingAfterFlight || serialize() !== state.lastSavedSnapshot;
      state.pendingAfterFlight = false;
      if (changedDuringSave) {
        schedule(0);
      } else {
        setDirty(false);
      }
      return true;
    }

    function acceptSaveError(message) {
      const inFlight = state.inFlight;
      if (
        !inFlight
        || message.requestId !== inFlight.requestId
        || inFlight.scopeKey !== state.scopeKey
        || !SAVE_ERROR_CODES.has(message.code)
      ) return false;

      state.inFlight = null;
      state.pendingAfterFlight = false;
      if (message.code === "conflict") {
        state.blocked = true;
        setAccessMode("blocked");
        onNotice("conflict");
        return true;
      }
      if (message.code === "forbidden") {
        state.writable = false;
        setAccessMode("readonly");
        onNotice("forbidden");
        return true;
      }
      if (message.code === "missing") {
        state.blocked = true;
        setAccessMode("blocked");
        onNotice("missing");
        return true;
      }
      onNotice("network");
      schedule(3000);
      return true;
    }

    function isTrustedHostEvent(event) {
      return Boolean(
        isHosted()
        && event
        && event.origin === getExpectedOrigin()
        && event.source === getExpectedSource(),
      );
    }

    function handleHostMessage(event) {
      if (!isTrustedHostEvent(event)) return false;
      const message = event.data;
      if (!message || typeof message !== "object" || message.source !== HOST_SOURCE) return false;

      if (message.type === "host:init" && message.context?.protocolVersion === PROTOCOL_VERSION) {
        if (!message.context.projectId || !message.context.canvasId) return false;
        resetForContext(message.context);
        onContext(message.context);
        return true;
      }
      if (message.type === "host:document" && message.protocolVersion === PROTOCOL_VERSION) {
        return initializeDocument(message);
      }
      if (message.type === "host:flush" && message.protocolVersion === PROTOCOL_VERSION) {
        flush();
        return true;
      }
      if (message.type === "host:save-result" && message.protocolVersion === PROTOCOL_VERSION) {
        return acceptSaveResult(message);
      }
      if (message.type === "host:save-error" && message.protocolVersion === PROTOCOL_VERSION) {
        return acceptSaveError(message);
      }
      return false;
    }

    function getState() {
      return {
        ...state,
        inFlight: state.inFlight ? { ...state.inFlight } : null,
      };
    }

    function dispose() {
      clearScheduledSave();
      state.inFlight = null;
      state.pendingAfterFlight = false;
    }

    return Object.freeze({
      canMutate: () => state.accessMode === "standalone" || state.accessMode === "editable",
      dispose,
      flush,
      getAccessMode: () => state.accessMode,
      getState,
      handleHostMessage,
      post: send,
      schedule,
    });
  }

  root.REELAY_CANVAS_PERSISTENCE_COORDINATOR = Object.freeze({
    createCanvasPersistenceCoordinator,
  });
}(typeof globalThis === "object" ? globalThis : window));
