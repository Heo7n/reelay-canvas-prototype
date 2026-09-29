(function registerCanvasNodeTaskRunner(root) {
  "use strict";

  // Projects the shared task into its original live node. It owns no timers,
  // progress, result, or settlement; those belong to the application service.
  function createCanvasNodeTaskRunner({ service, resolveTarget, onStart, onComplete, onCancel, onProgress = () => {} } = {}) {
    if (!["submit", "subscribe", "cancel", "invalidate"].every((name) => typeof service?.[name] === "function")) {
      throw new TypeError("Node generation requires the application task service.");
    }
    if (![resolveTarget, onStart, onComplete, onCancel].every((value) => typeof value === "function")) {
      throw new TypeError("Node generation requires target and projection adapters.");
    }
    const records = new Map();
    const targets = new Map();
    let disposed = false;

    function release(record) {
      records.delete(record.task.id);
      if (targets.get(record.key) === record) targets.delete(record.key);
    }

    const unsubscribe = service.subscribe((task, event) => {
      const record = records.get(task.id);
      if (!record || record.task !== task) return;
      const isCurrent = resolveTarget(task.scope) === record.target;
      if (["succeeded", "failed", "canceled"].includes(event.type)) {
        release(record);
        if (!isCurrent) return;
        if (event.type === "succeeded") onComplete(task, record.target);
        else onCancel(task, record.target, task.cancellationReason || "failed");
      } else if (isCurrent && ["running", "progress", "cancel-window-closed"].includes(event.type)) {
        onProgress(task, record.target);
      }
    });

    function start({ scope, input } = {}) {
      if (disposed) return null;
      if (![scope?.projectId, scope?.canvasId, scope?.nodeId].every((id) => typeof id === "string" && id.length > 0)) {
        throw new TypeError("Node tasks require project, canvas and node scope.");
      }
      const taskScope = { projectId: scope.projectId, canvasId: scope.canvasId, nodeId: scope.nodeId, conversationId: null };
      const target = resolveTarget(taskScope);
      if (!target) return null;
      const key = JSON.stringify([taskScope.projectId, taskScope.canvasId, taskScope.nodeId]);
      const previous = targets.get(key);
      if (previous?.target === target) return null;
      if (previous) service.invalidate(previous.task, "target-replaced");
      return service.submit({
        scope: taskScope, input, sourceSurface: "canvas",
        isCurrent: () => !disposed && resolveTarget(taskScope) === target,
        onAccepted(task) {
          const record = { task, target, key };
          records.set(task.id, record);
          targets.set(key, record);
          return onStart(task, target);
        },
      });
    }

    function cancelScope(scope = {}, reason = "cancelled") {
      const nodeIds = scope.nodeIds ? new Set(scope.nodeIds) : null;
      let count = 0;
      for (const { task } of [...records.values()]) {
        if (["projectId", "canvasId", "nodeId"].some((field) => scope[field] !== undefined && scope[field] !== task.scope[field])) continue;
        if (nodeIds && !nodeIds.has(task.scope.nodeId)) continue;
        if (service.invalidate(task, reason)) count += 1;
      }
      return count;
    }

    function get(taskId) { return !disposed ? records.get(taskId)?.task || null : null; }
    function canCancel(taskId) { const task = get(taskId); return Boolean(task && service.canCancel(task)); }
    function cancel(taskId) { const task = get(taskId); return Boolean(task && service.cancel(task)); }
    function dispose() {
      if (disposed) return;
      cancelScope({}, "disposed");
      disposed = true;
      unsubscribe();
    }
    return Object.freeze({ start, get, canCancel, cancel, cancelScope, dispose });
  }

  root.REELAY_CANVAS_NODE_TASK_RUNNER = Object.freeze({ createCanvasNodeTaskRunner });
})(typeof window === "undefined" ? globalThis : window);
