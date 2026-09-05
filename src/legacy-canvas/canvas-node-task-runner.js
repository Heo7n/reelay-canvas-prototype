(function registerCanvasNodeTaskRunner(root) {
  "use strict";

  function copyTaskInputs(value, ancestors = new Set()) {
    if (value == null || typeof value !== "object") return value;
    if (ancestors.has(value)) throw new TypeError("Node task inputs must not contain cycles.");
    ancestors.add(value);
    const copy = Array.isArray(value)
      ? value.map((item) => copyTaskInputs(item, ancestors))
      : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copyTaskInputs(item, ancestors)]));
    ancestors.delete(value);
    return Object.freeze(copy);
  }

  function createCanvasNodeTaskRunner(options = {}) {
    for (const name of ["makeTaskId", "setTimer", "clearTimer", "resolveTarget", "onStart", "onComplete", "onCancel"]) {
      if (typeof options[name] !== "function") throw new TypeError(`${name} must be a function.`);
    }
    const records = new Map();
    const targets = new Map();
    let disposed = false;

    function release(record) {
      if (records.get(record.task.id) !== record) return false;
      records.delete(record.task.id);
      if (targets.get(record.key) === record) targets.delete(record.key);
      if (record.timerId !== null) options.clearTimer(record.timerId);
      record.timerId = null;
      return true;
    }

    function cancelRecord(record, reason) {
      if (!record || !release(record)) return false;
      // The live object is an identity token, never a snapshot or a second content owner.
      if (options.resolveTarget(record.task) === record.target) {
        options.onCancel(record.task, record.target, reason);
      }
      return true;
    }

    function complete(record) {
      if (disposed || records.get(record.task.id) !== record) return;
      const target = options.resolveTarget(record.task);
      release(record);
      if (target === record.target) options.onComplete(record.task, target);
    }

    function start({ kind, scope, inputs = {}, delayMs } = {}) {
      if (disposed) return null;
      if (!["generation", "prompt-optimization"].includes(kind)) throw new TypeError("Unknown node task kind.");
      if (![scope?.projectId, scope?.canvasId, scope?.nodeId].every((id) => typeof id === "string" && id.length > 0)) {
        throw new TypeError("Node tasks require project, canvas and node scope.");
      }
      if (!Number.isFinite(delayMs) || delayMs < 0) throw new TypeError("Node task delay must be non-negative.");
      const taskScope = { projectId: scope.projectId, canvasId: scope.canvasId, nodeId: scope.nodeId };
      const target = options.resolveTarget(taskScope);
      if (!target) return null;
      const key = JSON.stringify([taskScope.projectId, taskScope.canvasId, taskScope.nodeId]);
      const previous = targets.get(key);
      if (previous?.target === target) return null;
      const id = options.makeTaskId();
      if (typeof id !== "string" || !id || records.has(id)) throw new TypeError("Node task ids must be unique.");
      const task = Object.freeze({ id, kind, ...taskScope, inputs: copyTaskInputs(inputs) });
      if (previous) cancelRecord(previous, "target-replaced");
      const record = { task, target, key, timerId: null };
      records.set(id, record);
      targets.set(key, record);
      try {
        if (options.onStart(task, target) === false) {
          cancelRecord(record, "start-rejected");
          return null;
        }
        if (records.get(id) !== record) return null;
        if (options.resolveTarget(task) !== target) {
          cancelRecord(record, "target-replaced");
          return null;
        }
        record.timerId = options.setTimer(() => complete(record), delayMs);
        return task;
      } catch (error) {
        cancelRecord(record, "start-failed");
        throw error;
      }
    }

    function cancelScope(scope = {}, reason = "cancelled") {
      let count = 0;
      let failure = null;
      const nodeIds = scope.nodeIds ? new Set(scope.nodeIds) : null;
      for (const record of [...records.values()]) {
        const task = record.task;
        if (scope.projectId !== undefined && scope.projectId !== task.projectId) continue;
        if (scope.canvasId !== undefined && scope.canvasId !== task.canvasId) continue;
        if (scope.nodeId !== undefined && scope.nodeId !== task.nodeId) continue;
        if (nodeIds && !nodeIds.has(task.nodeId)) continue;
        try {
          if (cancelRecord(record, reason)) count += 1;
        } catch (error) {
          failure ||= error;
        }
      }
      if (failure) throw failure;
      return count;
    }

    function dispose() {
      if (disposed) return;
      disposed = true;
      cancelScope({}, "disposed");
    }

    return Object.freeze({ start, cancelScope, dispose });
  }

  root.REELAY_CANVAS_NODE_TASK_RUNNER = Object.freeze({ createCanvasNodeTaskRunner });
})(typeof window === "undefined" ? globalThis : window);
