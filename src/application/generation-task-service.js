(function registerGenerationTasks(root) {
  "use strict";

  const activeStatuses = new Set(["queued", "running"]);
  const scopeFields = ["projectId", "conversationId", "canvasId"];
  const defaultFailure = "模拟生成服务暂时不可用，请稍后重试。";

  function snapshot(value, ancestors = new Set()) {
    if (value == null || typeof value !== "object") {
      if (["function", "symbol", "bigint"].includes(typeof value)) throw new TypeError("Task snapshots must contain data only.");
      return value;
    }
    if (ancestors.has(value)) throw new TypeError("Task snapshots must not contain cycles.");
    if (!Array.isArray(value) && Object.prototype.toString.call(value) !== "[object Object]") {
      throw new TypeError("Task snapshots must contain plain data only.");
    }
    ancestors.add(value);
    const copy = Array.isArray(value)
      ? value.map((item) => snapshot(item, ancestors))
      : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, snapshot(item, ancestors)]));
    ancestors.delete(value);
    return Object.freeze(copy);
  }

  function createService(options = {}) {
    for (const name of ["makeId", "charge", "refund", "makeResult"]) {
      if (typeof options[name] !== "function") throw new TypeError(`${name} must be a function.`);
    }
    if (!root.REELAY_SIMULATED_GENERATION_EXECUTOR) throw new Error("The simulated generation executor must be loaded first.");
    const now = options.now || (() => Date.now());
    const executor = root.REELAY_SIMULATED_GENERATION_EXECUTOR.createExecutor({
      now, setTimer: options.setTimer, clearTimer: options.clearTimer,
    });
    const records = new Map();
    const submissions = new Map();
    const subscribers = new Set();
    let nextScenario = Object.freeze({ outcome: "success" });
    let disposed = false;

    function resolve(taskOrId) {
      const id = typeof taskOrId === "string" ? taskOrId : taskOrId?.id;
      const record = records.get(id);
      return record && (typeof taskOrId === "string" || taskOrId === record.task) ? record : null;
    }

    function isActive(record) {
      return !disposed && record && !record.submitting && !record.removed && activeStatuses.has(record.status);
    }

    function canCancel(taskOrId) {
      const record = resolve(taskOrId);
      return Boolean(isActive(record) && now() < record.cancelUntil);
    }

    function notify(record, type) {
      const event = Object.freeze({ type });
      for (const subscriber of [...subscribers]) {
        // A view failure cannot interrupt settlement or another observer's update.
        try { subscriber(record.task, event); } catch { /* Observers do not own task state. */ }
      }
    }

    function refundOnce(record) {
      if (record.refundAttempted || record.charged <= 0) return;
      record.refundAttempted = true;
      try {
        if (options.refund(record.charged, record.task.id) === true) record.refunded = record.charged;
      } catch { /* Failed settlement must never be shown as refunded. */ }
    }

    function finish(record, status, { error = null, result = null } = {}) {
      if (!isActive(record)) return false;
      // Commit the terminal state before invoking collaborators; late/reentrant callbacks lose.
      record.status = status;
      record.finishedAt = now();
      record.error = error;
      record.result = result;
      executor.stop(record.task.id);
      if (status === "failed" || status === "canceled") refundOnce(record);
      notify(record, status);
      if (record.refunded > 0 && typeof options.onRefund === "function") {
        try { options.onRefund(record.task); } catch { /* Toast failures cannot repeat a refund. */ }
      }
      return true;
    }

    function fail(taskOrId, reason = defaultFailure) {
      const message = typeof reason === "string" && reason.trim() ? reason.trim() : defaultFailure;
      return finish(resolve(taskOrId), "failed", { error: message });
    }

    function complete(taskOrId, result) {
      const record = resolve(taskOrId);
      if (!isActive(record)) return false;
      try {
        const output = result === undefined ? options.makeResult(record.task) : result;
        if (!output || typeof output !== "object" || Array.isArray(output)) {
          throw new TypeError("生成结果不可用，请重新生成。");
        }
        if (output.type !== record.task.input.mediaType) {
          throw new TypeError("生成结果类型与本次任务不一致，请重新生成。");
        }
        const frozenResult = snapshot(output);
        return finish(record, "succeeded", { result: frozenResult });
      } catch (error) {
        return fail(record.task, error?.message || defaultFailure);
      }
    }

    function submit({ scope, input, idempotencyKey } = {}) {
      if (disposed) return null;
      if (!scopeFields.every((key) => typeof scope?.[key] === "string" && scope[key].trim())) {
        throw new TypeError("Generation tasks require project, conversation and canvas scope.");
      }
      if (idempotencyKey !== undefined && (typeof idempotencyKey !== "string" || !idempotencyKey)) {
        throw new TypeError("Task idempotency keys must be non-empty strings.");
      }
      const key = idempotencyKey === undefined ? null : JSON.stringify([...scopeFields.map((field) => scope[field]), idempotencyKey]);
      if (key && submissions.has(key)) return submissions.get(key).task;
      if (!input || !Number.isFinite(input.cost) || input.cost < 0) {
        throw new TypeError("Generation task cost must be a finite, non-negative number.");
      }
      if (!["image", "video", "audio"].includes(input.mediaType)) {
        throw new TypeError("Generation task mediaType must be image, video or audio.");
      }
      const frozenInput = snapshot(input);
      const frozenScope = snapshot(scope);
      const id = options.makeId();
      if (typeof id !== "string" || !id || records.has(id)) throw new TypeError("Generation task ids must be unique.");
      const createdAt = now();
      const record = {
        task: null, submitting: true, removed: false,
        status: "queued", createdAt, startedAt: null, finishedAt: null,
        cancelUntil: createdAt + 7000, error: null, result: null,
        charged: 0, refunded: 0, refundAttempted: false,
        addedNodeId: null, addedCanvasId: null,
      };
      const task = { id, input: frozenInput, scope: frozenScope };
      for (const field of ["status", "createdAt", "startedAt", "finishedAt", "cancelUntil", "error", "result", "charged", "refunded", "addedNodeId", "addedCanvasId"]) {
        Object.defineProperty(task, field, { enumerable: true, get: () => record[field] });
      }
      Object.defineProperty(task, "canCancel", { enumerable: true, get: () => canCancel(task) });
      record.task = Object.freeze(task);
      records.set(id, record);
      if (key) submissions.set(key, record);
      try {
        if (frozenInput.cost > 0 && options.charge(frozenInput.cost, id) !== true) {
          records.delete(id);
          if (key) submissions.delete(key);
          return null;
        }
        record.charged = frozenInput.cost;
      } catch (error) {
        records.delete(id);
        if (key) submissions.delete(key);
        throw error;
      }
      record.submitting = false;
      const scenario = nextScenario;
      nextScenario = Object.freeze({ outcome: "success" });
      try {
        executor.start({
          id, createdAt, cancelUntil: record.cancelUntil, scenario,
          onRunning() {
            if (!isActive(record) || record.status !== "queued") return;
            record.status = "running";
            record.startedAt = now();
            notify(record, "running");
          },
          onCancelWindowClosed() {
            if (isActive(record)) notify(record, "cancel-window-closed");
          },
          onComplete: () => complete(task),
          onFail: (reason) => fail(task, reason),
        });
      } catch (error) {
        fail(task, error?.message || defaultFailure);
        return task;
      }
      notify(record, "submitted");
      return task;
    }

    function get(taskOrId) {
      const record = resolve(taskOrId);
      return record && !record.removed ? record.task : null;
    }

    function importPreviewRecords({ scope, records: entries } = {}) {
      if (disposed || !Array.isArray(entries) || !entries.length || entries.length > 8) return [];
      if (!scopeFields.every((key) => typeof scope?.[key] === "string" && scope[key].trim())) return [];
      if (list({ projectId: scope.projectId, conversationId: scope.conversationId }).length) return [];
      const frozenScope = snapshot(scope);
      const prepared = []; const ids = new Set();
      for (const entry of entries) {
        if (!["succeeded", "failed", "canceled"].includes(entry?.status)
          || !["image", "video", "audio"].includes(entry.input?.mediaType)
          || !Number.isFinite(entry.input?.cost) || entry.input.cost < 0
          || (entry.status === "succeeded" && (!entry.result || entry.result.type !== entry.input.mediaType))) return [];
        const id = options.makeId();
        if (typeof id !== "string" || !id || records.has(id) || ids.has(id)) return [];
        ids.add(id);
        const createdAt = Number.isFinite(entry.createdAt) ? entry.createdAt : now() - 11000;
        const finishedAt = Math.max(createdAt, Number.isFinite(entry.finishedAt) ? entry.finishedAt : createdAt + 11000);
        const frozenInput = snapshot(entry.input);
        const task = Object.freeze({ id, isPreview: true, scope: frozenScope, input: frozenInput,
          status: entry.status, createdAt, startedAt: createdAt, finishedAt, cancelUntil: createdAt,
          error: entry.status === "failed" ? String(entry.error || defaultFailure) : null,
          result: entry.status === "succeeded" ? snapshot(entry.result) : null,
          charged: frozenInput.cost, refunded: entry.status === "succeeded" ? 0 : frozenInput.cost,
          addedNodeId: null, addedCanvasId: null, canCancel: false });
        prepared.push({ task, status: task.status, submitting: false, removed: false });
      }
      // Historical preview snapshots do not replay execution, charging, refunding or result delivery.
      for (const record of prepared) records.set(record.task.id, record);
      for (const record of prepared) notify(record, "preview-imported");
      return prepared.map((record) => record.task);
    }

    function list(scope = {}) {
      return [...records.values()]
        .filter((record) => !record.removed && Object.entries(scope).every(([key, value]) => value === undefined || record.task.scope[key] === value))
        .map((record) => record.task);
    }

    function subscribe(subscriber) {
      if (typeof subscriber !== "function") throw new TypeError("Task subscriber must be a function.");
      if (disposed) return () => {};
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    }

    function cancel(taskOrId) {
      return canCancel(taskOrId) ? finish(resolve(taskOrId), "canceled") : false;
    }

    function remove(taskOrId) {
      const record = resolve(taskOrId);
      if (disposed || !record || record.submitting || record.removed || activeStatuses.has(record.status)) return false;
      record.removed = true;
      notify(record, "removed");
      return true;
    }

    function markAdded(taskOrId, { nodeId, canvasId } = {}) {
      const record = resolve(taskOrId);
      if (disposed || !record || record.removed || record.task.isPreview || record.status !== "succeeded") return false;
      if (![nodeId, canvasId].every((id) => typeof id === "string" && id.trim())) return false;
      if (record.addedNodeId) return record.addedNodeId === nodeId && record.addedCanvasId === canvasId;
      record.addedNodeId = nodeId;
      record.addedCanvasId = canvasId;
      notify(record, "added");
      return true;
    }

    function clearAdded(taskOrId, { nodeId, canvasId } = {}) {
      const record = resolve(taskOrId);
      if (disposed || !record || record.removed || !record.addedNodeId) return false;
      if (record.addedNodeId !== nodeId || record.addedCanvasId !== canvasId) return false;
      record.addedNodeId = null;
      record.addedCanvasId = null;
      notify(record, "added-cleared");
      return true;
    }

    function setNextScenario(value, reason) {
      if (disposed) return false;
      const scenario = typeof value === "string" ? { outcome: value, reason } : value;
      if (!scenario || !["success", "failure", "hold"].includes(scenario.outcome)) {
        throw new TypeError("Unknown simulated generation outcome.");
      }
      nextScenario = Object.freeze({
        outcome: scenario.outcome,
        reason: typeof scenario.reason === "string" && scenario.reason.trim() ? scenario.reason.trim() : defaultFailure,
      });
      return true;
    }

    function dispose() {
      if (disposed) return;
      disposed = true;
      executor.dispose();
      subscribers.clear();
    }

    return Object.freeze({ submit, get, list, subscribe, canCancel, cancel, remove, markAdded, clearAdded, dispose, setNextScenario, complete, fail, importPreviewRecords });
  }

  root.REELAY_GENERATION_TASKS = Object.freeze({ createService });
})(typeof window === "undefined" ? globalThis : window);
