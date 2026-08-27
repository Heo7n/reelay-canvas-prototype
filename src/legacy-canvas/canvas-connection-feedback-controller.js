(function registerCanvasConnectionFeedbackController(root) {
  "use strict";

  function createConnectionFeedbackController(options = {}) {
    const recentIds = options.recentIds instanceof Set ? options.recentIds : new Set();
    const duration = Number.isFinite(options.duration) ? Math.max(0, options.duration) : 520;
    const now = typeof options.now === "function" ? options.now : () => Date.now();
    const setTimer = typeof options.setTimer === "function" ? options.setTimer : root.setTimeout.bind(root);
    const clearTimer = typeof options.clearTimer === "function" ? options.clearTimer : root.clearTimeout.bind(root);
    const onExpire = typeof options.onExpire === "function" ? options.onExpire : () => {};
    const expirations = new Map();
    let expiryTimer = null;

    function scheduleExpiry() {
      if (expiryTimer !== null) clearTimer(expiryTimer);
      expiryTimer = null;
      if (!expirations.size) return;
      const nextExpiry = Math.min(...expirations.values());
      expiryTimer = setTimer(expireDueConnections, Math.max(0, nextExpiry - now()));
    }

    function expireDueConnections() {
      expiryTimer = null;
      const timestamp = now();
      let changed = false;
      for (const [connectionId, expiresAt] of expirations) {
        if (expiresAt > timestamp) continue;
        expirations.delete(connectionId);
        changed = recentIds.delete(connectionId) || changed;
      }
      if (changed) onExpire(recentIds);
      scheduleExpiry();
    }

    function add(connections) {
      const expiresAt = now() + duration;
      let changed = false;
      for (const connection of connections || []) {
        if (!connection?.id) continue;
        recentIds.add(connection.id);
        expirations.set(connection.id, expiresAt);
        changed = true;
      }
      if (changed) scheduleExpiry();
    }

    function clear(connectionIds = recentIds) {
      let changed = false;
      for (const connectionId of Array.from(connectionIds)) {
        expirations.delete(connectionId);
        changed = recentIds.delete(connectionId) || changed;
      }
      scheduleExpiry();
      return changed;
    }

    function dispose() {
      if (expiryTimer !== null) clearTimer(expiryTimer);
      expiryTimer = null;
      expirations.clear();
      recentIds.clear();
    }

    return {
      recentIds,
      add,
      clear,
      dispose,
    };
  }

  root.REELAY_CANVAS_CONNECTION_FEEDBACK_CONTROLLER = Object.freeze({
    createConnectionFeedbackController,
  });
})(typeof window !== "undefined" ? window : globalThis);
