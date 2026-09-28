(function registerAgentGeneration(root) {
  "use strict";

  function createController({ document, container, chatContainer, getScope, isGenerationMode, isEditable,
    captureInput, clearDraft, restoreDraft, hasDraft, charge, refund, makeResult, capturePlacementTarget,
    placeResult, locateResult, showMessage, escapeHtml, assetPreview, renderPrompt, sanitizeUrl,
    placeAnchoredPopover, refreshIcons, getDemoPresets = () => [], preparePreviewInput = () => null,
    createPreviewHistory = null, selectionTrigger = null, beforeSelection = () => {},
    confirmRemoveRecords = async () => false, createFinalInput = null,
    beginResult = () => null, updateResult = () => {}, discardResult = () => {} }) {
    const window = document.defaultView;
    let disposed = false;
    let sending = false;
    let previewInitializer = createPreviewHistory;
    let previewHandled = false;
    const placementTargets = new Map();
    let recordView;
    let selectionView;
    let removing = false;
    const recordGroups = root.REELAY_GENERATION_RECORD_GROUPS;
    const service = root.REELAY_GENERATION_TASKS.createService({
      makeId: () => window.crypto.randomUUID(), now: () => Date.now(),
      setTimer: (fn, delay) => window.setTimeout(fn, delay), clearTimer: (id) => window.clearTimeout(id),
      charge, refund, makeResult,
      onRefund: (task) => showMessage(task.sourceSurface === "canvas" && task.status === "failed"
        ? `正片生成失败，已返还 ${task.refunded} 积分` : `已返还 ${task.refunded} 积分`),
    });
    const finalView = createFinalInput && root.REELAY_DRAFT_VIDEO_CONTROLLER?.createController({
      document, getScope, isEditable, createFinalInput, showMessage, placeAnchoredPopover,
      onSubmit: (input, context) => submitFinalSnapshot(input, context),
    });

    function sameConversation(task, scope = getScope()) {
      return Boolean(task?.sourceSurface === "conversation" && scope?.conversationId && task.scope.projectId === scope.projectId
        && task.scope.conversationId === scope.conversationId);
    }

    function tasks() {
      const scope = getScope();
      return scope?.conversationId ? service.list({ projectId: scope.projectId, conversationId: scope.conversationId }) : [];
    }

    function render(options) {
      if (disposed) return;
      finalView?.refresh();
      const generation = isGenerationMode();
      if (generation) initializePreviewHistory();
      chatContainer.hidden = generation;
      container.hidden = !generation;
      if (selectionTrigger) selectionTrigger.hidden = !generation;
      if (generation) {
        recordView.render(options);
        selectionView?.render();
        if (!isEditable()) {
          selectionView?.close();
          if (selectionTrigger) selectionTrigger.disabled = true;
        }
      } else {
        selectionView?.close();
        recordView.close();
      }
    }

    function initializePreviewHistory() {
      if (!previewInitializer || previewHandled || disposed || !isGenerationMode() || !isEditable()) return;
      const scope = getScope();
      if (!scope?.projectId || !scope.canvasId || !scope.conversationId) return;
      // Only the first eligible conversation may receive examples; user-created conversations remain blank.
      previewHandled = true;
      const initialize = previewInitializer; previewInitializer = null;
      if (service.list().some((task) => task.sourceSurface === "conversation") || hasDraft()) return;
      const entries = initialize({ presets: getDemoPresets(), prepareInput: preparePreviewInput, createFinalInput, scope,
        makeId: () => window.crypto.randomUUID() });
      if (Array.isArray(entries) && entries.length) {
        const imported = service.importPreviewRecords({ scope, records: entries });
        if (imported.length) container.scrollTop = 0;
      }
    }

    function beginPlacement(task, target) {
      if (placementTargets.has(task)) return;
      placementTargets.set(task, target);
      try { beginResult(task, target); } catch { /* View creation cannot interrupt the accepted task. */ }
    }

    function submitSnapshot(input, scope) {
      const target = capturePlacementTarget(scope, input);
      if (!target) { showMessage("当前画布不可编辑，本次生成未提交"); return null; }
      const task = service.submit({ input, scope });
      if (!task) showMessage("积分不足，本次生成未提交");
      else beginPlacement(task, target);
      return task;
    }

    function submitFinalSnapshot(input, { sourceAsset, scope, sourceSurface }) {
      const current = getScope();
      if (disposed || sending || !isEditable() || !current || current.projectId !== scope.projectId
        || current.canvasId !== scope.canvasId
        || (sourceSurface === "conversation" && current.conversationId !== scope.conversationId)) return null;
      const pending = service.list({ projectId: scope.projectId }).find((task) => ["queued", "running"].includes(task.status)
        && task.input.generationStage === "final" && task.input.sourceDraftTaskId === input.sourceDraftTaskId
        && task.input.sourceResultId === input.sourceResultId);
      if (pending) { showMessage("此样片的正片已在生成中，请勿重复提交"); return pending; }
      const target = capturePlacementTarget(scope, input);
      if (!target) { showMessage("当前画布不可编辑，本次生成未提交"); return null; }
      sending = true;
      try {
        const task = service.submitFinal({ source: sourceAsset, scope, sourceSurface, cost: input.cost,
          outputFormat: input.parameters?.outputFormat || "mp4" });
        if (!task) { showMessage("本次生成未提交，请检查积分或样片有效期"); return null; }
        beginPlacement(task, target);
        if (sourceSurface === "conversation") render();
        showMessage(sourceSurface === "canvas" ? "正片已提交，正在画布中生成" : "正片已提交，可在生成记录中查看进度");
        return task;
      } finally { sending = false; }
    }

    function requestFinal(sourceAsset, { sourceNodeId = "", anchor = document.activeElement, scope = getScope(), interaction = "activate" } = {}) {
      if (disposed || !finalView) return false;
      if (interaction === "leave") { finalView.leave(anchor); return true; }
      if (sending || !isEditable() || !scope) return false;
      const eligibility = root.REELAY_DRAFT_VIDEO.getFinalEligibility(sourceAsset, { projectId: scope.projectId });
      if (!eligibility.eligible) { if (interaction !== "hover") showMessage(eligibility.reason); return false; }
      recordView.close();
      const sourceSurface = sourceNodeId ? "canvas" : "conversation";
      const options = { sourceAsset, sourceNodeId, anchor, sourceSurface,
        scope: sourceSurface === "canvas" ? { ...scope, conversationId: null } : scope };
      return interaction === "hover" ? finalView.hover(options) : finalView.open(options);
    }

    function submit() {
      if (disposed || sending || !isGenerationMode() || !isEditable()) return null;
      const scope = getScope();
      if (!scope) return null;
      sending = true;
      try {
        const input = captureInput();
        if (!input) return null;
        const task = submitSnapshot(input, scope);
        if (task) {
          selectionView?.close();
          clearDraft();
          render({ forceBottom: true });
        }
        return task;
      } finally { sending = false; }
    }

    async function action(name, task, event) {
      if (disposed || !isGenerationMode() || !sameConversation(task) || service.get(task.id) !== task) return;
      if (name === "feedback") {
        try {
          if (!window.navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
          await window.navigator.clipboard.writeText(task.id);
          if (!disposed) showMessage("TaskId 已复制");
        } catch { if (!disposed) showMessage("复制未成功，请重试"); }
        return;
      }
      if (name === "cancel") {
        if (!service.cancel(task)) { render(); showMessage("已进入生成阶段，当前无法取消"); }
      } else if (name === "remove") {
        if (removeRecord(task)) { render(); showMessage("已删除此条生成记录"); }
      } else if (name === "again") {
        if (!isEditable()) return;
        // A repeated click from the same activation must not produce two attempts.
        if (event?.detail > 1 || sending) return;
        if (task.input.generationStage === "final") {
          requestFinal(task.input.sourceDraftAsset, { anchor: event?.target?.closest?.("button") });
          return;
        }
        sending = true;
        try {
          if (submitSnapshot(task.input, getScope())) render({ forceBottom: true });
        } finally { sending = false; }
      } else if (name === "edit") {
        if (!isEditable()) return;
        if (task.input.generationStage === "final") return;
        if (hasDraft()) { showMessage("输入区已有草稿，请先保留或清空，再重新编辑此条记录"); return; }
        if (restoreDraft(task.input)) { recordView.close(); showMessage("已带入提示词、参考素材和参数"); }
      } else if (name === "locate") {
        if (task.status !== "succeeded" || !task.addedNodeId) return;
        if (locateResult(task)) recordView.close();
        else showMessage("画布中的结果已不存在或暂不可访问");
      } else if (name === "final") {
        if (task.status === "succeeded") requestFinal(task.result?.asset || task.result,
          { anchor: event?.target?.closest?.("button") });
      }
    }

    const unsubscribe = service.subscribe((task, event) => {
      recordView?.observeTask(task, event);
      // Both surfaces project the same task into its captured canvas.
      if (["running", "progress", "cancel-window-closed"].includes(event.type)) updateResult(task);
      if (["succeeded", "failed", "canceled", "removed"].includes(event.type)) {
        const target = placementTargets.get(task);
        placementTargets.delete(task);
        if (event.type === "succeeded" && target) {
          let placement = null;
          try { placement = placeResult(task, target); } catch { /* Report unavailable placement without replaying task settlement. */ }
          if (placement) service.markAdded(task, placement);
          else {
            discardResult(task);
            showMessage(task.sourceSurface === "canvas"
              ? "生成已完成，但原画布或结果节点已不可用，未放置结果"
              : "生成已完成，原画布暂不可放置，结果保留在记录中");
          }
        } else if (target) {
          discardResult(task);
          if (task.sourceSurface === "canvas" && event.type === "failed" && !task.refunded) showMessage("正片生成失败，请稍后重试");
        }
      }
      if (!removing && sameConversation(task)) render();
    });
    recordView = root.REELAY_GENERATION_RECORD_VIEW.createController({
      document, container, getScope, getTasks: tasks, getTask: (id) => service.get(id),
      onAction: action, canCancel: (task) => service.canCancel(task), now: () => Date.now(),
      escapeHtml, assetPreview, renderPrompt, sanitizeUrl, placeAnchoredPopover, refreshIcons, showMessage,
    });

    function removeRecord(task) {
      const group = recordGroups.recordForTask(tasks(), task);
      if (!recordGroups.canRemove(group)) return false;
      const previousRemoving = removing;
      removing = true;
      try {
        // Remove terminal children first so no orphan record can briefly appear.
        for (const member of [...group.finals, group.root]) service.remove(member);
      } finally { removing = previousRemoving; }
      return true;
    }

    async function removeSelected(selectedTasks) {
      if (disposed || !isGenerationMode() || !isEditable() || !selectedTasks.length) return;
      const scope = { ...getScope() };
      const confirmed = await confirmRemoveRecords({ count: selectedTasks.length });
      if (!confirmed || disposed || !isGenerationMode() || !isEditable()
        || getScope()?.projectId !== scope.projectId || getScope()?.conversationId !== scope.conversationId) return;
      let removed = 0;
      removing = true;
      try {
        // Delete only the captured selection, revalidating identity and scope at
        // confirmation time. The task service protects active tasks and billing.
        for (const task of selectedTasks) {
          if (sameConversation(task, scope) && service.get(task.id) === task && removeRecord(task)) removed += 1;
        }
      } finally { removing = false; }
      selectionView.close({ restoreFocus: true });
      render();
      if (removed) showMessage(`已删除 ${removed} 条生成记录`);
    }
    if (selectionTrigger) {
      selectionView = root.REELAY_GENERATION_SELECTION.createController({
        document, container, trigger: selectionTrigger, getScope,
        getTasks: () => recordGroups.groupTasks(tasks()).map((group) => group.root),
        canRemoveTask: (task) => recordGroups.canRemove(recordGroups.recordForTask(tasks(), task)),
        getTask: (id) => service.get(id), onRemove: removeSelected,
        onEnter() { recordView.close(); beforeSelection(); }, refreshIcons,
      });
    }

    const capabilities = Object.freeze({
      list: () => service.list().filter((task) => !task.isPreview), subscribe: service.subscribe,
      initializePreviewHistory(createRecords) {
        if (disposed || previewHandled || previewInitializer || typeof createRecords !== "function" || !getDemoPresets().length) return false;
        previewInitializer = createRecords;
        initializePreviewHistory();
        return true;
      },
      listPresets: () => getDemoPresets().map(({ id, label, description }) => ({ id, label, description })),
      hasDraft: () => hasDraft(),
      fillPreset(id, { replace = false } = {}) {
        if (disposed || !isGenerationMode() || !isEditable() || (!replace && hasDraft())) return false;
        const preset = getDemoPresets().find((item) => item.id === id);
        if (!preset || !restoreDraft(preset.input, { replace })) return false;
        recordView.close(); showMessage("示例已填入，可修改后发送"); return true;
      },
      setNextScenario: (scenario) => service.setNextScenario(typeof scenario === "string" ? scenario
        : { outcome: scenario.outcome, reason: scenario.failureReason || scenario.reason }),
      complete: (id) => service.complete(id), fail: (id, reason) => service.fail(id, reason),
    });
    function connect() {
      window.dispatchEvent(new window.CustomEvent("reelay:generation-ready", { detail: capabilities }));
    }
    function cancelTask(id) {
      const task = service.get(id);
      const scope = getScope();
      if (disposed || !isEditable() || !task || task.scope.projectId !== scope?.projectId
        || task.scope.canvasId !== scope.canvasId) return false;
      return service.cancel(task);
    }
    function close() { selectionView?.close(); recordView.close(); finalView?.close(); }
    function dispose() {
      if (disposed) return;
      disposed = true; close(); unsubscribe(); service.dispose(); selectionView?.dispose(); recordView.dispose(); finalView?.dispose();
      for (const task of placementTargets.keys()) discardResult(task);
      placementTargets.clear();
      for (const [target, name, fn, capture] of listeners) target.removeEventListener(name, fn, capture);
    }
    function pageHide(event) { if (event.persisted) close(); else dispose(); }
    const listeners = [
      [window, "reelay:generation-connect", connect, false], [window, "pagehide", pageHide, false],
    ];
    for (const [target, name, fn, capture] of listeners) target.addEventListener(name, fn, capture);
    connect();
    return Object.freeze({ submit, requestFinal, cancelTask, render, close, dispose, service,
      repositionFinal: () => finalView?.reposition(),
      hasRecords: (conversationId) => Boolean(conversationId) && service.list({ projectId: getScope()?.projectId, conversationId }).length > 0,
      hasPending: (conversationId) => Boolean(conversationId) && service.list({ projectId: getScope()?.projectId, conversationId })
        .some((task) => task.status === "queued" || task.status === "running"),
      removeConversation: (conversationId) => {
        if (!conversationId) return;
        const records = recordGroups.groupTasks(service.list({ projectId: getScope()?.projectId, conversationId }));
        for (const group of records) {
          if (!recordGroups.canRemove(group)) continue;
          for (const task of [...group.finals, group.root]) service.remove(task);
        }
      },
    });
  }
  root.REELAY_AGENT_GENERATION = Object.freeze({ createController });
})(globalThis);
