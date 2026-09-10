(function registerAgentGeneration(root) {
  "use strict";

  function createController({ document, container, chatContainer, getScope, isGenerationMode, isEditable,
    captureInput, clearDraft, restoreDraft, hasDraft, charge, refund, makeResult, capturePlacementTarget,
    placeResult, locateResult, showMessage, escapeHtml, assetPreview, renderPrompt, sanitizeUrl,
    placeAnchoredPopover, refreshIcons, getDemoPresets = () => [], preparePreviewInput = () => null,
    createPreviewHistory = null }) {
    const window = document.defaultView;
    let disposed = false;
    let sending = false;
    let previewInitializer = createPreviewHistory;
    let previewHandled = false;
    const placementTargets = new WeakMap();
    let recordView;
    const service = root.REELAY_GENERATION_TASKS.createService({
      makeId: () => window.crypto.randomUUID(), now: () => Date.now(),
      setTimer: (fn, delay) => window.setTimeout(fn, delay), clearTimer: (id) => window.clearTimeout(id),
      charge, refund, makeResult,
      onRefund: (task) => showMessage(`已返还 ${task.refunded} 积分`),
    });

    function sameConversation(task, scope = getScope()) {
      return Boolean(task && scope && task.scope.projectId === scope.projectId
        && task.scope.conversationId === scope.conversationId);
    }

    function tasks() {
      const scope = getScope();
      return scope ? service.list({ projectId: scope.projectId, conversationId: scope.conversationId }) : [];
    }

    function render(options) {
      if (disposed) return;
      const generation = isGenerationMode();
      if (generation) initializePreviewHistory();
      chatContainer.hidden = generation;
      container.hidden = !generation;
      if (generation) recordView.render(options);
      else recordView.close();
    }

    function initializePreviewHistory() {
      if (!previewInitializer || previewHandled || disposed || !isGenerationMode() || !isEditable()) return;
      const scope = getScope();
      if (!scope?.projectId || !scope.canvasId || !scope.conversationId) return;
      // Only the first eligible conversation may receive examples; user-created conversations remain blank.
      previewHandled = true;
      const initialize = previewInitializer; previewInitializer = null;
      if (service.list().length || hasDraft()) return;
      const entries = initialize({ presets: getDemoPresets(), prepareInput: preparePreviewInput });
      if (Array.isArray(entries) && entries.length) {
        const imported = service.importPreviewRecords({ scope, records: entries });
        if (imported.length) container.scrollTop = 0;
      }
    }

    function submitSnapshot(input, scope) {
      const target = capturePlacementTarget(scope, input);
      if (!target) { showMessage("当前画布不可编辑，本次生成未提交"); return null; }
      const task = service.submit({ input, scope });
      if (!task) showMessage("积分不足，本次生成未提交");
      else placementTargets.set(task, target);
      return task;
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
        if (service.remove(task)) showMessage("已删除此条生成记录");
      } else if (name === "again") {
        if (!isEditable()) return;
        // A repeated click from the same activation must not produce two attempts.
        if (event?.detail > 1 || sending) return;
        sending = true;
        try {
          if (submitSnapshot(task.input, getScope())) render({ forceBottom: true });
        } finally { sending = false; }
      } else if (name === "edit") {
        if (!isEditable()) return;
        if (hasDraft()) { showMessage("输入区已有草稿，请先保留或清空，再重新编辑此条记录"); return; }
        if (restoreDraft(task.input)) { recordView.close(); showMessage("已带入提示词、参考素材和参数"); }
      } else if (name === "locate") {
        if (task.status !== "succeeded" || !task.addedNodeId) return;
        if (locateResult(task)) recordView.close();
        else showMessage("画布中的结果已不存在或暂不可访问");
      }
    }

    const unsubscribe = service.subscribe((task, event) => {
      // Placement belongs to the terminal transition and its captured canvas,
      // never to rendering, the current conversation, or a late "add" gesture.
      if (["succeeded", "failed", "canceled", "removed"].includes(event.type)) {
        const target = placementTargets.get(task);
        placementTargets.delete(task);
        if (event.type === "succeeded" && target) {
          let placement = null;
          try { placement = placeResult(task, target); } catch { /* Keep the successful media available in its record. */ }
          if (placement) service.markAdded(task, placement);
          else showMessage("生成已完成，原画布暂不可放置，结果保留在记录中");
        }
      }
      if (sameConversation(task)) render();
    });
    recordView = root.REELAY_GENERATION_RECORD_VIEW.createController({
      document, container, getScope, getTasks: tasks, getTask: (id) => service.get(id),
      onAction: action, canCancel: (task) => service.canCancel(task), now: () => Date.now(),
      escapeHtml, assetPreview, renderPrompt, sanitizeUrl, placeAnchoredPopover, refreshIcons, showMessage,
    });

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
    function close() { recordView.close(); }
    function dispose() {
      if (disposed) return;
      disposed = true; close(); unsubscribe(); service.dispose(); recordView.dispose();
      for (const [target, name, fn, capture] of listeners) target.removeEventListener(name, fn, capture);
    }
    function pageHide(event) { if (event.persisted) close(); else dispose(); }
    const listeners = [
      [window, "reelay:generation-connect", connect, false], [window, "pagehide", pageHide, false],
    ];
    for (const [target, name, fn, capture] of listeners) target.addEventListener(name, fn, capture);
    connect();
    return Object.freeze({ submit, render, close, dispose, service,
      hasRecords: (conversationId) => service.list({ projectId: getScope()?.projectId, conversationId }).length > 0,
      hasPending: (conversationId) => service.list({ projectId: getScope()?.projectId, conversationId })
        .some((task) => task.status === "queued" || task.status === "running"),
      removeConversation: (conversationId) => {
        for (const task of service.list({ projectId: getScope()?.projectId, conversationId })) service.remove(task);
      },
    });
  }
  root.REELAY_AGENT_GENERATION = Object.freeze({ createController });
})(globalThis);
