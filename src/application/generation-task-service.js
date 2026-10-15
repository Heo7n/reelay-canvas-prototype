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
    const now = options.now || (() => Date.now());
    const executor = options.executor;
    const realExecutor = options.realExecutor;
    const resolveExecution = options.resolveExecution;
    const shouldResolveExecution = options.shouldResolveExecution;
    if (resolveExecution !== undefined && typeof resolveExecution !== "function") throw new TypeError("Execution routing must be a function.");
    if (shouldResolveExecution !== undefined && typeof shouldResolveExecution !== "function") throw new TypeError("Execution routing selection must be a function.");
    if (realExecutor !== undefined && !["start", "stop", "dispose"].every((name) => typeof realExecutor?.[name] === "function")) {
      throw new TypeError("Real generation requires an injected executor.");
    }
    if (!["start", "stop", "dispose"].every((name) => typeof executor?.[name] === "function")) {
      throw new TypeError("Generation tasks require an injected executor.");
    }
    const draftPolicy = options.draftPolicy;
    const { cancelWindowMs, previewDurationMs } = options;
    if (![cancelWindowMs, previewDurationMs].every((value) => Number.isFinite(value) && value >= 0)) {
      throw new TypeError("Generation timing must be explicit and non-negative.");
    }
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
      return Boolean(isActive(record) && record.channel === "simulation" && ownerIsCurrent(record) && now() < record.cancelUntil);
    }

    function ownerIsCurrent(record) {
      try { return !record.isCurrent || record.isCurrent(); }
      catch { return false; }
    }

    function canExecute(record) {
      if (!isActive(record)) return false;
      if (record.channel === "real") return true;
      if (ownerIsCurrent(record)) return true;
      invalidate(record.task, "owner-replaced");
      return false;
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

    function finish(record, status, { error = null, result = null, refund = true, cancellationReason = null } = {}) {
      if (!isActive(record)) return false;
      // Commit the terminal state before invoking collaborators; late/reentrant callbacks lose.
      record.status = status;
      record.finishedAt = record.remoteFinishedAt ?? now();
      record.error = error;
      record.result = result;
      record.cancellationReason = cancellationReason;
      if (status === "succeeded") record.progress = 100;
      if (record.channel === "real") {
        record.executionStatus = status;
        if (error) record.message = error;
        realExecutor?.stop(record.task.id);
      } else if (record.channel === "simulation") executor.stop(record.task.id);
      if (refund && record.channel === "simulation" && (status === "failed" || status === "canceled")) refundOnce(record);
      notify(record, status);
      if (record.refunded > 0 && typeof options.onRefund === "function") {
        try { options.onRefund(record.task); } catch { /* Toast failures cannot repeat a refund. */ }
      }
      return true;
    }

    function fail(taskOrId, reason = defaultFailure) {
      const record = resolve(taskOrId);
      if (!canExecute(record)) return false;
      const message = typeof reason === "string" && reason.trim() ? reason.trim() : defaultFailure;
      return finish(record, "failed", { error: message });
    }

    function complete(taskOrId, result) {
      const record = resolve(taskOrId);
      if (!canExecute(record)) return false;
      try {
        let output = result === undefined && record.channel === "simulation" ? options.makeResult(record.task) : result;
        if (!output || typeof output !== "object" || Array.isArray(output)) {
          throw new TypeError("生成结果不可用，请重新生成。");
        }
        if (output.type !== record.task.input.mediaType) {
          throw new TypeError("生成结果类型与本次任务不一致，请重新生成。");
        }
        const task = record.task;
        if (record.channel === "simulation" && task.input.generationStage === "final") {
          // A simulated finish keeps the original clip and its true decoded size;
          // 1080P / MOV are requested specifications, not a fictitious transcode.
          const source = task.input.sourceDraftAsset;
          const { generation: _generation, ...sourceMedia } = source;
          output = { ...sourceMedia, ...output, url: source.url, width: source.width, height: source.height,
            aspectRatio: source.aspectRatio, duration: source.duration, name: source.name,
            displayName: "模拟生成成片", generation: draftPolicy.createFinalProvenance({
              input: task.input, taskId: task.id, resultId: output.id, scope: task.scope, createdAt: task.createdAt,
            }) };
        } else if (record.channel === "simulation" && draftPolicy?.isDraftInput(task.input)) {
          output = { ...output, generation: draftPolicy.createDraftProvenance({
            input: task.input, taskId: task.id, resultId: output.id, scope: task.scope, createdAt: task.createdAt,
          }) };
        }
        const frozenResult = snapshot(output);
        return finish(record, "succeeded", { result: frozenResult });
      } catch (error) {
        return fail(record.task, error?.message || defaultFailure);
      }
    }

    function startSimulation(record, scenario) {
      const task = record.task;
      if (!scenario) {
        scenario = nextScenario;
        nextScenario = Object.freeze({ outcome: "success" });
      }
      executor.start({
        id: task.id, task, input: task.input, scope: task.scope, sourceSurface: task.sourceSurface,
        createdAt: record.executionCreatedAt ?? record.createdAt, cancelUntil: record.cancelUntil, scenario,
        onRunning() {
          if (!canExecute(record) || record.status !== "queued") return;
          record.status = "running";
          record.startedAt = now();
          notify(record, "running");
        },
        onProgress(value) {
          if (!canExecute(record) || !Number.isFinite(value)) return;
          const progress = Math.min(99, Math.max(0, Math.floor(value)));
          if (progress <= record.progress) return;
          record.progress = progress;
          notify(record, "progress");
        },
        onCancelWindowClosed() {
          if (canExecute(record)) notify(record, "cancel-window-closed");
        },
        onComplete: () => complete(task),
        onFail: (reason) => fail(task, reason),
      });
    }

    function updateRealTask(taskOrId, update = {}) {
      const record = resolve(taskOrId);
      if (!isActive(record) || record.channel !== "real" || (update.id !== undefined && update.id !== record.task.id)) return false;
      const status = update.executionStatus || update.status;
      if (!["prepared", "submitting", "waiting", "saving", "succeeded", "failed", "unconfirmed", "save_failed"].includes(status)) return false;
      record.executionStatus = status;
      if (typeof update.message === "string") record.message = update.message.trim().slice(0, 1000);
      const finishedAt = typeof update.finishedAt === "string" ? Date.parse(update.finishedAt) : update.finishedAt;
      if (Number.isFinite(finishedAt)) record.remoteFinishedAt = finishedAt;
      if (status === "failed") return fail(record.task, record.message || "真实生成失败。");
      if (status === "succeeded" && update.result?.type === record.task.input.mediaType) return complete(record.task, update.result);
      record.status = status === "prepared" ? "queued" : "running";
      if (record.status === "running" && record.startedAt === null) record.startedAt = now();
      notify(record, "real-updated");
      return true;
    }

    async function resolveAndStart(record) {
      if (!isActive(record) || record.channel !== "checking") return;
      try {
        const channel = await resolveExecution(record.task);
        if (!canExecute(record)) return;
        if (!["simulation", "real"].includes(channel)) throw new TypeError("生成连接未能确认执行通道。");
        record.channel = channel;
        if (channel === "real") {
          if (!realExecutor) throw new Error("真实生成执行器不可用，请稍后重试。");
          record.cancelUntil = null;
          record.executionStatus = "prepared";
          notify(record, "real-updated");
          if (!isActive(record)) return;
          record.realAttempted = true;
          await realExecutor.start({
            id: record.task.id, task: record.task, input: record.task.input, scope: record.task.scope,
            sourceSurface: record.task.sourceSurface, nodeId: record.task.nodeId, createdAt: record.createdAt,
            onUpdate: (update) => updateRealTask(record.task, update),
            onComplete: (result) => complete(record.task, result),
            onFail: (reason) => fail(record.task, reason),
          });
        } else {
          record.submitting = true;
          try {
            if (record.task.input.cost > 0 && options.charge(record.task.input.cost, record.task.id) !== true) throw new Error("模拟积分不足，生成任务未启动。");
            record.charged = record.task.input.cost;
          } finally { record.submitting = false; }
          record.cancelUntil = now() + cancelWindowMs;
          record.executionCreatedAt = now();
          notify(record, "execution-resolved");
          if (canExecute(record)) startSimulation(record);
        }
      } catch (error) {
        const message = error?.message || "生成连接暂时不可用，请稍后重试。";
        if (record.channel === "real" && record.realAttempted) updateRealTask(record.task, { status: "unconfirmed", message });
        else fail(record.task, message);
      }
    }

    function submit({ scope, input, idempotencyKey, sourceSurface = "conversation", nodeId = null, isCurrent, onAccepted } = {}) {
      if (disposed) return null;
      if (isCurrent !== undefined && typeof isCurrent !== "function") throw new TypeError("Task ownership must be a predicate.");
      if (onAccepted !== undefined && typeof onAccepted !== "function") throw new TypeError("Task acceptance must be a function.");
      if (nodeId !== null && (typeof nodeId !== "string" || !nodeId.trim())) throw new TypeError("Task node identity must be a non-empty string.");
      if (isCurrent && !isCurrent()) return null;
      if (!["conversation", "canvas"].includes(sourceSurface)) throw new TypeError("Unknown generation source surface.");
      const requiredFields = sourceSurface === "canvas" ? ["projectId", "canvasId"] : scopeFields;
      if (!requiredFields.every((key) => typeof scope?.[key] === "string" && scope[key].trim())
        || (sourceSurface === "canvas" && scope.conversationId != null)) {
        throw new TypeError("Generation tasks require project and canvas scope; conversation requests also require conversation scope.");
      }
      scope = { ...scope, conversationId: sourceSurface === "canvas" ? null : scope.conversationId };
      if (idempotencyKey !== undefined && (typeof idempotencyKey !== "string" || !idempotencyKey)) {
        throw new TypeError("Task idempotency keys must be non-empty strings.");
      }
      const key = idempotencyKey === undefined ? null : JSON.stringify([sourceSurface, ...scopeFields.map((field) => scope[field]), idempotencyKey]);
      if (key && submissions.has(key)) return submissions.get(key).task;
      if (!input || !Number.isFinite(input.cost) || input.cost < 0) {
        throw new TypeError("Generation task cost must be a finite, non-negative number.");
      }
      if (!["image", "video", "audio"].includes(input.mediaType)) {
        throw new TypeError("Generation task mediaType must be image, video or audio.");
      }
      if (input.generationStage === "final") {
        if (!draftPolicy) throw new Error("Draft generation requires an injected policy.");
        // Reconstruct from provenance for every attempt, including direct repeat
        // submissions: current editor parameters never change the original clip.
        input = draftPolicy.buildFinalInput(input.sourceDraftAsset, {
          projectId: scope.projectId, now: now(), cost: input.cost, outputFormat: input.parameters?.outputFormat,
        });
        const pending = [...records.values()].find((record) => !record.removed && activeStatuses.has(record.status)
          && record.task.scope.projectId === scope.projectId && record.task.input.generationStage === "final"
          && record.task.input.sourceDraftTaskId === input.sourceDraftTaskId && record.task.input.sourceResultId === input.sourceResultId);
        if (pending) return pending.task;
      }
      const frozenInput = snapshot(input);
      const frozenScope = snapshot(scope);
      const resolveTask = Boolean(resolveExecution && (!shouldResolveExecution || shouldResolveExecution(frozenInput) === true));
      const id = options.makeId();
      if (typeof id !== "string" || !id || records.has(id)) throw new TypeError("Generation task ids must be unique.");
      const createdAt = now();
      const record = {
        task: null, submitting: true, removed: false, isCurrent,
        channel: resolveTask ? "checking" : "simulation", executionStatus: null, message: null, isOwner: true, nodeId: nodeId ?? frozenScope.nodeId ?? null,
        status: "queued", progress: 0, createdAt, startedAt: null, finishedAt: null,
        cancelUntil: createdAt + cancelWindowMs, error: null, result: null, cancellationReason: null,
        charged: 0, refunded: 0, refundAttempted: false,
        addedNodeId: null, addedCanvasId: null,
      };
      const task = { id, sourceSurface, input: frozenInput, scope: frozenScope };
      for (const field of ["status", "progress", "createdAt", "startedAt", "finishedAt", "cancelUntil", "error", "result", "charged", "refunded", "addedNodeId", "addedCanvasId", "cancellationReason", "channel", "executionStatus", "message", "isOwner", "nodeId"]) {
        Object.defineProperty(task, field, { enumerable: true, get: () => record[field] });
      }
      Object.defineProperty(task, "canCancel", { enumerable: true, get: () => canCancel(task) });
      record.task = Object.freeze(task);
      records.set(id, record);
      if (key) submissions.set(key, record);
      try {
        if (resolveTask) record.cancelUntil = null;
        else {
          if (frozenInput.cost > 0 && options.charge(frozenInput.cost, id) !== true) {
            records.delete(id);
            if (key) submissions.delete(key);
            return null;
          }
          record.charged = frozenInput.cost;
        }
      } catch (error) {
        records.delete(id);
        if (key) submissions.delete(key);
        throw error;
      }
      record.submitting = false;
      const scenario = resolveTask ? null : nextScenario;
      if (!resolveTask) nextScenario = Object.freeze({ outcome: "success" });
      try {
        if (onAccepted?.(task) === false) {
          fail(task, "生成任务未能启动，请重试。");
          return task;
        }
        if (!canExecute(record)) return task;
        if (resolveTask) {
          notify(record, "submitted");
          void resolveAndStart(record);
          return task;
        }
        startSimulation(record, scenario);
      } catch (error) {
        fail(task, error?.message || defaultFailure);
        return task;
      }
      notify(record, "submitted");
      return task;
    }

    function submitFinal({ source, scope, cost, outputFormat = "mp4", idempotencyKey, sourceSurface = "conversation", isCurrent, onAccepted } = {}) {
      if (disposed) return null;
      if (!draftPolicy) throw new Error("Draft generation requires an injected policy.");
      const input = draftPolicy.buildFinalInput(source, { projectId: scope?.projectId, now: now(), cost, outputFormat });
      return submit({ input, scope, idempotencyKey, sourceSurface, isCurrent, onAccepted });
    }

    function get(taskOrId) {
      const record = resolve(taskOrId);
      return record && !record.removed ? record.task : null;
    }

    function importRealTask(entry = {}) {
      if (disposed || typeof entry.id !== "string" || !entry.id || entry.input?.mediaType !== "video") return null;
      const sourceSurface = entry.sourceSurface || (entry.scope?.conversationId ? "conversation" : "canvas");
      if (!["canvas", "conversation"].includes(sourceSurface)) return null;
      const required = sourceSurface === "canvas" ? ["projectId", "canvasId"] : scopeFields;
      if (!required.every((field) => typeof entry.scope?.[field] === "string" && entry.scope[field].trim())
        || (sourceSurface === "canvas" && entry.scope.conversationId != null)) return null;
      const scope = { ...entry.scope, conversationId: sourceSurface === "canvas" ? null : entry.scope.conversationId };
      const status = entry.executionStatus || entry.status;
      if (!["prepared", "submitting", "waiting", "saving", "succeeded", "failed", "unconfirmed", "save_failed"].includes(status)) return null;
      if (status === "succeeded" && entry.result?.type !== "video") return null;
      let record = records.get(entry.id);
      if (record) {
        if (record.channel !== "real" || record.task.sourceSurface !== sourceSurface
          || ["workspaceId", ...scopeFields].some((field) => record.task.scope[field] !== scope[field])) return null;
        if (typeof entry.isOwner === "boolean") record.isOwner = entry.isOwner;
      } else {
        const date = typeof entry.createdAt === "string" ? Date.parse(entry.createdAt) : entry.createdAt;
        const createdAt = Number.isFinite(date) ? date : now();
        record = {
          task: null, channel: "real", executionStatus: null, message: null, isOwner: entry.isOwner !== false, nodeId: entry.nodeId ?? scope.nodeId ?? null,
          submitting: false, removed: false, isCurrent: entry.isCurrent,
          status: "queued", progress: 0, createdAt, startedAt: null, finishedAt: null,
          cancelUntil: null, error: null, result: null, cancellationReason: null,
          charged: 0, refunded: 0, refundAttempted: false, addedNodeId: null, addedCanvasId: null,
        };
        const task = { id: entry.id, sourceSurface, input: snapshot(entry.input), scope: snapshot(scope) };
        for (const field of ["status", "progress", "createdAt", "startedAt", "finishedAt", "cancelUntil", "error", "result", "charged", "refunded", "addedNodeId", "addedCanvasId", "cancellationReason", "channel", "executionStatus", "message", "isOwner", "nodeId"]) {
          Object.defineProperty(task, field, { enumerable: true, get: () => record[field] });
        }
        Object.defineProperty(task, "canCancel", { enumerable: true, get: () => false });
        record.task = Object.freeze(task);
        records.set(entry.id, record);
      }
      if (status === "succeeded" && typeof entry.addedNodeId === "string" && entry.addedNodeId
        && typeof entry.addedCanvasId === "string" && entry.addedCanvasId && !record.addedNodeId) {
        record.addedNodeId = entry.addedNodeId;
        record.addedCanvasId = entry.addedCanvasId;
      }
      updateRealTask(record.task, { ...entry, executionStatus: status });
      return record.task;
    }

    function importPreviewRecords({ scope, records: entries } = {}) {
      if (disposed || !Array.isArray(entries) || !entries.length || entries.length > 12) return [];
      if (!scopeFields.every((key) => typeof scope?.[key] === "string" && scope[key].trim())) return [];
      if (list({ projectId: scope.projectId, conversationId: scope.conversationId }).length) return [];
      const frozenScope = snapshot(scope);
      const prepared = []; const ids = new Set();
      for (const entry of entries) {
        if (!["succeeded", "failed", "canceled"].includes(entry?.status)
          || !["image", "video", "audio"].includes(entry.input?.mediaType)
          || !Number.isFinite(entry.input?.cost) || entry.input.cost < 0
          || (entry.status === "succeeded" && (!entry.result || entry.result.type !== entry.input.mediaType))) return [];
        const id = entry.id ?? options.makeId();
        if (typeof id !== "string" || !id || records.has(id) || ids.has(id)) return [];
        ids.add(id);
        const createdAt = Number.isFinite(entry.createdAt) ? entry.createdAt : now() - previewDurationMs;
        const finishedAt = Math.max(createdAt, Number.isFinite(entry.finishedAt) ? entry.finishedAt : createdAt + previewDurationMs);
        const frozenInput = snapshot(entry.input);
        const task = Object.freeze({ id, sourceSurface: "conversation", isPreview: true, scope: frozenScope, input: frozenInput,
          status: entry.status, progress: entry.status === "succeeded" ? 100 : 0, createdAt, startedAt: createdAt, finishedAt, cancelUntil: createdAt,
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
      return canCancel(taskOrId) ? finish(resolve(taskOrId), "canceled", { cancellationReason: "user-canceled" }) : false;
    }

    function invalidate(taskOrId, reason = "owner-replaced") {
      const record = resolve(taskOrId);
      if (isActive(record) && record.channel === "real") {
        record.isCurrent = () => false;
        notify(record, "detached");
        return true;
      }
      // System cleanup stops execution without inventing a supplier refund.
      return finish(resolve(taskOrId), "canceled", { refund: false, cancellationReason: reason });
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
      realExecutor?.dispose();
      subscribers.clear();
    }

    return Object.freeze({ submit, submitFinal, get, list, subscribe, canCancel, cancel, invalidate, remove, markAdded, clearAdded, dispose, setNextScenario, complete, fail, importPreviewRecords, updateRealTask, importRealTask });
  }

  root.REELAY_GENERATION_TASKS = Object.freeze({ createService });
})(typeof window === "undefined" ? globalThis : window);
