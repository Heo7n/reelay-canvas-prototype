(function registerSimulatedGenerationExecutor(root) {
  "use strict";

  // This adapter only schedules signals. The application service owns state and settlement.
  function createExecutor(options = {}) {
    const now = options.now || (() => Date.now());
    const setTimer = options.setTimer || ((callback, delay) => root.setTimeout(callback, delay));
    const clearTimer = options.clearTimer || ((timer) => root.clearTimeout(timer));
    const durationMs = root.REELAY_PROTOTYPE_CONFIG.generationDurationMs;
    const executions = new Map();
    let disposed = false;

    function stop(id) {
      const execution = executions.get(id);
      if (!execution) return false;
      executions.delete(id);
      for (const timer of execution.timers) clearTimer(timer);
      execution.timers.clear();
      return true;
    }

    function start({ id, createdAt, cancelUntil, scenario, onRunning, onProgress, onComplete, onFail, onCancelWindowClosed }) {
      if (disposed) return false;
      if (executions.has(id)) throw new TypeError("An execution already exists for this task.");
      const execution = { timers: new Set() };
      executions.set(id, execution);

      function schedule(at, callback) {
        if (disposed || executions.get(id) !== execution) return;
        const timer = setTimer(() => {
          execution.timers.delete(timer);
          if (disposed || executions.get(id) !== execution) return;
          callback();
        }, Math.max(0, at - now()));
        execution.timers.add(timer);
      }

      function reportProgress() {
        // This percentage belongs to the simulation, not to a real model provider.
        const progress = Math.min(99, Math.max(0, Math.floor((now() - createdAt) * 100 / durationMs)));
        onProgress(progress);
        if (progress < 99) schedule(now() + 500, reportProgress);
      }

      try {
        schedule(createdAt + 700, onRunning);
        schedule(cancelUntil, onCancelWindowClosed);
        if (scenario.outcome !== "hold") {
          schedule(createdAt + durationMs, () => {
            if (scenario.outcome === "failure") onFail(scenario.reason);
            else onComplete();
          });
        }
        if (typeof onProgress === "function") schedule(createdAt + 500, reportProgress);
      } catch (error) {
        stop(id);
        throw error;
      }
      return true;
    }

    function dispose() {
      if (disposed) return;
      disposed = true;
      for (const id of [...executions.keys()]) stop(id);
    }

    return Object.freeze({ start, stop, dispose });
  }

  root.REELAY_SIMULATED_GENERATION_EXECUTOR = Object.freeze({ createExecutor });
})(typeof window === "undefined" ? globalThis : window);
