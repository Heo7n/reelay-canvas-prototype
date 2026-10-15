(function registerCanvasVideoGeneration(root) {
  "use strict";
  const terminal = new Set(["succeeded", "failed", "unconfirmed", "save_failed"]);

  function parametersFor(input) {
    const p = input.parameters || {};
    return { modelId: input.modelId || p.model, resolution: p.quality,
      aspectRatio: p.aspect, duration: parseFloat(p.duration), generateAudio: p.audioEnabled === true,
      workflow: p.workflow, generationStage: input.generationStage || "standard",
      omniReferenceTaskType: p.omniReferenceTaskType || "auto", outputFormat: p.outputFormat || "mp4", count: Number(p.count || 1) };
  }

  function mediaFor(task) {
    return task.result ? { id: task.result.id, type: "video", url: task.result.url,
      displayName: "生成视频", name: "生成视频", source: "real-generation" } : null;
  }

  function inputFor(task) {
    const p = task.parameters;
    return { mediaType: "video", modelId: p.modelId, modelName: p.modelId === "seedance-2-fast" ? "Seedance 2.0 Fast" : p.modelId === "seedance-2-5" ? "Seedance 2.5" : "Seedance 2.0",
      cost: 0, prompt: task.prompt || "", references: [], referenceSnapshot: [], generationStage: "standard",
      parameterSummary: `${p.resolution} · ${p.aspectRatio} · ${p.duration}s · ${p.generateAudio ? "有声" : "静音"}`,
      parameters: { model: p.modelId, mediaKind: "video", aspect: p.aspectRatio, quality: p.resolution.toLowerCase(),
        duration: String(p.duration), audioEnabled: p.generateAudio, workflow: p.workflow, count: 1,
        outputFormat: p.outputFormat || "mp4", omniReferenceTaskType: p.omniReferenceTaskType || "auto" } };
  }

  function createController(options) {
    const requests = new Map();
    const running = new Map();
    let context = null;
    let disposed = false;
    let epoch = 0;
    let restoreTimer = 0;
    let restoreEpoch = 0;
    let restoredSelection = false;
    let historyReady = false;
    function enabled() { return options.isHosted() && options.getCapabilities()?.realVideoGeneration === true; }
    function publishContext(next) { context = next; options.onContextChange?.(next); }
    function request(operation, payload = {}) {
      if (disposed || !enabled()) return Promise.reject(new Error("真实生成通道不可用。"));
      const requestId = options.makeId();
      return new Promise((resolve, reject) => {
        const timer = options.setTimer(() => {
          requests.delete(requestId);
          reject(new Error(operation === "submit" ? "提交状态尚未确认，请查看任务状态，不要重复发送。" : "无法读取生成连接，请稍后重试。"));
        }, operation === "submit" ? 180000 : 30000);
        requests.set(requestId, { operation, payload, resolve, reject, timer, epoch });
        options.getPersistence().post("canvas:video-generation-command", { requestId, operation, ...payload });
      });
    }
    async function resolveExecution(task) {
      if (task.input.mediaType !== "video" || !enabled()) return "simulation";
      const next = await request("context");
      publishContext(next);
      if (next.kind === "simulation") return "simulation";
      if (next.kind !== "real") throw new Error("生成连接已失效，请在账号设置中重新连接。");
      return "real";
    }
    function stop(id) {
      const entry = running.get(id);
      if (!entry) return;
      entry.active = false;
      options.clearTimer(entry.timer);
      running.delete(id);
    }
    function deliver(task, callbacks) {
      callbacks.onUpdate(task);
      if (task.status === "succeeded") callbacks.onComplete(mediaFor(task));
      else if (task.status === "failed") callbacks.onFail(task.message);
      return !terminal.has(task.status);
    }
    function start(callbacks) {
      const { task } = callbacks;
      const node = options.getNodeForTask(task);
      if (!node) throw new Error("原生成节点已不存在，未提交真实生成。");
      const entry = { active: true, timer: 0 };
      running.set(task.id, entry);
      callbacks.onUpdate({ status: "submitting", message: "正在准备任务并保存画布关联。" });
      const poll = async () => {
        if (!entry.active || disposed) return;
        try {
          const dto = await request("get", { taskId: task.id });
          if (!entry.active) return;
          if (!deliver(dto, callbacks)) { stop(task.id); return; }
        } catch {
          if (!entry.active) return;
          callbacks.onUpdate({ status: "waiting", message: "暂时无法读取平台状态，正在重试。" });
        }
        if (entry.active) entry.timer = options.setTimer(poll, 2000);
      };
      request("submit", { requestKey: task.id, canvasRecordId: task.scope.canvasId, nodeId: node.id,
        conversationId: task.sourceSurface === "conversation" ? task.scope.conversationId : null,
        sourceSurface: task.sourceSurface, prompt: task.input.prompt, parameters: parametersFor(task.input), references: task.input.references || [] })
        .then((dto) => {
          if (!entry.active) return;
          if (dto.kind === "simulation") throw new Error("连接已断开，本次未提交。请重新发送以使用模拟生成。");
          if (deliver(dto, callbacks)) entry.timer = options.setTimer(poll, 2000);
          else stop(task.id);
        }).catch((error) => {
          if (!entry.active) return;
          // Once the durable reference exists, a lost activation response cannot
          // tell us whether the platform accepted a paid request. Read; never resend.
          if (error.submissionState === "unknown" || (!error.submissionState && node.realGenerationTaskId === task.id)) {
            callbacks.onUpdate({ status: "unconfirmed", message: error.message });
            entry.timer = options.setTimer(poll, 2000);
          } else { callbacks.onFail(error.message); stop(task.id); }
        });
    }
    async function bind(message, pending) {
      if (pending.binding) return;
      pending.binding = true;
      const task = options.getTaskService().get(message.task.id);
      const node = task && options.getNodeForTask(task);
      const projectId = options.getProjectId();
      let bound = false;
      try {
        if (!node || message.task.id !== pending.payload.requestKey || message.task.nodeId !== pending.payload.nodeId
          || message.task.projectId !== projectId || node.id !== pending.payload.nodeId
          || message.task.canvasRecordId !== task.scope.canvasId || !options.getPersistence().canMutate()) return;
        node.realGenerationTaskId = message.task.id;
        await options.getPersistence().flushAndWait();
        bound = !disposed && pending.epoch === epoch && options.getProjectId() === projectId
          && options.getNodeForTask(task) === node && options.getPersistence().canMutate();
      } catch { bound = false; }
      finally {
        options.getPersistence().post("canvas:video-generation-bound", { requestId: message.requestId, taskId: message.task.id, bound });
      }
    }
    function handleHostMessage(event) {
      const message = event?.data;
      if (event?.origin !== options.getExpectedOrigin() || event?.source !== options.getExpectedSource()
        || message?.source !== "reelay-shell" || message.protocolVersion !== 1 || message.instanceId !== options.instanceId) return false;
      if (message.type === "host:video-generation-context") { publishContext(message.context); return true; }
      if (!["host:video-generation-bind", "host:video-generation-result", "host:video-generation-error"].includes(message.type)) return false;
      const pending = requests.get(message.requestId);
      if (!pending || pending.epoch !== epoch) return false;
      if (message.type === "host:video-generation-bind") { if (pending.operation === "submit") void bind(message, pending); return true; }
      requests.delete(message.requestId); options.clearTimer(pending.timer);
      if (message.type === "host:video-generation-error") pending.reject(Object.assign(new Error(message.message), { code: message.code, submissionState: message.submissionState }));
      else if (message.operation === pending.operation) pending.resolve(message.result);
      else pending.reject(new Error("生成通道响应不匹配。"));
      return true;
    }
    function importTask(dto, isOwner) {
      const scope = { projectId: dto.projectId, canvasId: dto.canvasRecordId, nodeId: dto.nodeId,
        conversationId: isOwner && dto.sourceSurface === "conversation" ? dto.conversationId : null };
      if (scope.conversationId) options.restoreConversation?.(scope.conversationId, dto.prompt);
      const task = options.getTaskService().importRealTask({ id: dto.id, scope, sourceSurface: scope.conversationId ? "conversation" : "canvas",
        input: inputFor(isOwner ? dto : { ...dto, prompt: "" }), status: dto.status === "succeeded" ? "succeeded" : dto.status === "failed" ? "failed" : "running",
        executionStatus: dto.status, message: dto.message, error: dto.status === "failed" ? dto.message : null,
        result: mediaFor(dto), createdAt: Date.parse(dto.createdAt || "") || Date.now(), finishedAt: ["succeeded", "failed"].includes(dto.status) ? dto.updatedAt : null, isOwner,
        addedNodeId: dto.nodeId, addedCanvasId: dto.canvasRecordId });
      if (task) options.projectTask?.(task);
    }
    async function restore() {
      if (!enabled() || disposed) return;
      const current = ++restoreEpoch;
      const projectId = options.getProjectId();
      const fresh = () => !disposed && current === restoreEpoch && projectId === options.getProjectId();
      let keepPolling = false;
      try {
        const nextContext = await request("context");
        if (!fresh()) return;
        publishContext(nextContext);
        if (nextContext.taskHistoryAvailable === false) {
          historyReady = true; options.onHistoryReady?.(); return;
        }
        const result = await request("list");
        if (!fresh()) return;
        for (const dto of result.tasks) {
          if (dto.projectId !== projectId) continue;
          importTask(dto, true);
          if (!terminal.has(dto.status)) keepPolling = true;
        }
        if (!restoredSelection) { restoredSelection = true; options.onRestored?.(result.tasks); }
        const own = new Set(result.tasks.map((t) => t.id));
        const refs = new Set(options.getCanvasRecords().flatMap((c) => c.nodes.map((n) => n.realGenerationTaskId).filter(Boolean)));
        for (const taskId of refs) {
          if (own.has(taskId)) continue;
          try {
            const dto = await request("projection", { taskId });
            if (!fresh()) return;
            const fullTask = dto.isOwner ? await request("get", { taskId }) : dto;
            if (!fresh()) return;
            importTask(fullTask, dto.isOwner);
            if (!terminal.has(fullTask.status)) keepPolling = true;
          } catch { if (fresh()) keepPolling = true; }
        }
        if (fresh()) { historyReady = true; options.onHistoryReady?.(); }
      } catch { if (fresh()) keepPolling = true; }
      if (fresh() && keepPolling) restoreTimer = options.setTimer(restore, 3000);
    }
    function reset() {
      epoch++; restoreEpoch++;
      restoredSelection = false;
      historyReady = false;
      options.clearTimer(restoreTimer);
      for (const pending of requests.values()) { options.clearTimer(pending.timer); pending.reject(new Error("项目上下文已切换，请重新查看生成任务。")); }
      requests.clear();
      for (const id of running.keys()) stop(id);
      context = null;
    }
    function dispose() { reset(); disposed = true; }
    return Object.freeze({ resolveExecution, handleHostMessage, restore, reset, dispose,
      getContext: () => context, isHistoryReady: () => historyReady, executor: Object.freeze({ start, stop, dispose }),
      resume(task) {
        if (task.isOwner === false || task.executionStatus !== "prepared") throw new Error("此任务不能重新提交。");
        if (running.has(task.id)) return;
        start({ task, onUpdate: (dto) => options.getTaskService().updateRealTask(task, dto),
          onComplete: (asset) => options.getTaskService().complete(task, asset),
          onFail: (reason) => options.getTaskService().fail(task, reason) });
      },
      async retrySave(task) { const dto = await request("retry-save", { taskId: task.id }); importTask(dto, true); void restore(); } });
  }
  root.REELAY_CANVAS_VIDEO_GENERATION = Object.freeze({ createController, parametersFor, mediaFor });
})(globalThis);
