(function registerCanvasConnectionFeedbackController(root) {
  "use strict";

  function createConnectionFeedbackController(options = {}) {
    const records = options.records instanceof Map ? options.records : new Map();
    const now = typeof options.now === "function" ? options.now : () => Date.now();
    const setTimer = typeof options.setTimer === "function" ? options.setTimer : root.setTimeout.bind(root);
    const clearTimer = typeof options.clearTimer === "function" ? options.clearTimer : root.clearTimeout.bind(root);
    const onChange = typeof options.onChange === "function" ? options.onChange : () => {};
    const enqueueMicrotask = typeof options.enqueueMicrotask === "function"
      ? options.enqueueMicrotask
      : (callback) => Promise.resolve().then(callback);
    let nextToken = 0;
    let expiryTimer = null;
    let completionNotificationQueued = false;

    function getDuration(profile) {
      if (Number.isFinite(profile?.safetyMs)) return Math.max(0, profile.safetyMs);
      return Number.isFinite(profile?.totalMs) ? Math.max(0, profile.totalMs) : 0;
    }

    function notifyCompleted() {
      if (completionNotificationQueued) return;
      completionNotificationQueued = true;
      enqueueMicrotask(() => {
        completionNotificationQueued = false;
        onChange(records);
      });
    }

    function scheduleExpiry() {
      if (expiryTimer !== null) clearTimer(expiryTimer);
      expiryTimer = null;
      if (!records.size) return;
      const expirations = Array.from(records.values(), (record) => record.expiresAt)
        .filter(Number.isFinite);
      if (!expirations.length) return;
      const nextExpiry = Math.min(...expirations);
      expiryTimer = setTimer(expireDueConnections, Math.max(0, nextExpiry - now()));
    }

    function expireDueConnections() {
      expiryTimer = null;
      const timestamp = now();
      let changed = false;
      for (const [connectionId, record] of records) {
        if (!Number.isFinite(record.expiresAt) || record.expiresAt > timestamp) continue;
        records.delete(connectionId);
        changed = true;
      }
      scheduleExpiry();
      if (changed) onChange(records);
    }

    function add(entries) {
      const added = [];
      const timestamp = now();
      for (const entry of entries || []) {
        if (!entry?.id || !entry.profile) continue;
        nextToken += 1;
        const record = {
          id: entry.id,
          token: nextToken,
          direction: entry.direction === "reverse" ? "reverse" : "forward",
          profile: entry.profile,
          startedAt: null,
          expiresAt: timestamp + getDuration(entry.profile),
        };
        records.set(entry.id, record);
        added.push(record);
      }
      if (!added.length) return added;
      scheduleExpiry();
      onChange(records);
      return added;
    }

    function start(connectionId, token) {
      const record = records.get(connectionId);
      if (!record || record.token !== token) return false;
      if (Number.isFinite(record.startedAt)) return true;
      record.startedAt = now();
      record.expiresAt = record.startedAt + getDuration(record.profile);
      scheduleExpiry();
      return true;
    }

    function complete(connectionId, token) {
      const record = records.get(connectionId);
      if (!record || record.token !== token) return false;
      records.delete(connectionId);
      scheduleExpiry();
      notifyCompleted();
      return true;
    }

    function getConnectionIds(connectionIds) {
      if (connectionIds instanceof Map) return connectionIds.keys();
      return connectionIds || records.keys();
    }

    function clear(connectionIds = records) {
      let changed = false;
      for (const connectionId of Array.from(getConnectionIds(connectionIds))) {
        changed = records.delete(connectionId) || changed;
      }
      scheduleExpiry();
      if (changed) onChange(records);
      return changed;
    }

    function dispose() {
      if (expiryTimer !== null) clearTimer(expiryTimer);
      expiryTimer = null;
      completionNotificationQueued = false;
      records.clear();
    }

    return Object.freeze({
      records,
      add,
      start,
      complete,
      clear,
      dispose,
    });
  }

  root.REELAY_CANVAS_CONNECTION_FEEDBACK_CONTROLLER = Object.freeze({
    createConnectionFeedbackController,
  });
})(typeof window !== "undefined" ? window : globalThis);
