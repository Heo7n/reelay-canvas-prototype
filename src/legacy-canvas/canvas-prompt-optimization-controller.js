(function registerPromptOptimizationController(root) {
  "use strict";

  function createController({ document, promptDocument, sanitizeUrl, onChange = () => {}, storage,
    getModels = () => root.REELAY_MODEL_CATALOG || [],
    createService = root.REELAY_PROMPT_OPTIMIZATION_SERVICE.createService,
    createView = root.REELAY_PROMPT_OPTIMIZATION_VIEW.createController, setTimer, clearTimer } = {}) {
    const win = document.defaultView || root;
    const adapters = new WeakMap();
    const drafts = new WeakMap(), applications = new WeakMap();
    let active = null, view = null, confirmAction = "", confirmContext = "", notice = "", toast, toastTimer;
    const preferences = root.REELAY_PROMPT_OPTIMIZATION_PREFERENCES.createStore({ storage, models: getModels() });
    const supportedModels = new Set(getModels().filter(root.REELAY_PROMPT_OPTIMIZATION_PREFERENCES.supportsModel).map(model => model.id));
    const supportsModel = model => supportedModels.has(typeof model === "string" ? model : model?.id);
    let disposed = false;
    const same = (a, b) => JSON.stringify(promptDocument.normalize(a)) === JSON.stringify(promptDocument.normalize(b));
    const sameSource = (a, b) => same(a.prompt, b.prompt)
      && JSON.stringify([a.scope, a.model, a.references]) === JSON.stringify([b.scope, b.model, b.references]);
    const canReview = (state, snapshot) => Boolean(state && (
      sameSource(state.source, snapshot)
      || (state.suggestion && state.source.scope === snapshot.scope)
    ));

    function getDraftOwner(conversation) {
      if (!conversation) return null;
      if (!drafts.has(conversation)) drafts.set(conversation, {});
      return drafts.get(conversation);
    }
    function advanceDraft(conversation) {
      const previous = getDraftOwner(conversation);
      if (active === previous) close();
      drafts.set(conversation, {});
      // The previous task keeps its owner; late results and undo cannot address the new draft.
      onChange(drafts.get(conversation));
      return drafts.get(conversation);
    }
    function matchesApplication(owner, state, snapshot) {
      const application = applications.get(owner);
      return Boolean(application && sameSource(application.source, state.source)
        && sameSource(application.snapshot, snapshot));
    }

    function settingsFor(model) {
      return { customInstructions: preferences.get(model).customInstructions };
    }
    function optimizationRequest(target, state) {
      const snapshot = target.snapshot();
      const current = !sameSource(state.source, snapshot) && !matchesApplication(target.owner, state, snapshot);
      const source = current ? snapshot : state.source;
      const settings = settingsFor(snapshot.model);
      const action = current ? "current" : "regenerate";
      return { source, action, key: JSON.stringify([snapshot, source, state.suggestion, settings, action]) };
    }
    function requestOptimization(target, state) {
      const request = optimizationRequest(target, state);
      if (!available(target, request.source.prompt)
        || !promptDocument.toText(request.source.prompt, request.source.references).trim()) return false;
      const application = applications.get(target.owner);
      const suggestionWasApplied = application && sameSource(application.source, state.source)
        && same(application.snapshot.prompt, state.suggestion);
      if (state.edited && !suggestionWasApplied
        && (confirmAction !== request.action || confirmContext !== request.key)) {
        confirmAction = request.action; confirmContext = request.key; refresh(); return false;
      }
      return startCurrent(target, request.source);
    }
    function configure(action, ...args) {
      const target = adapters.get(active);
      if (!target?.isCurrent() || !supportsModel(target.snapshot().model) || service.get(active)?.status === "processing") return false;
      try {
        preferences[action](target.snapshot().model, ...args);
        confirmAction = ""; refresh();
        if (action === "save") message("优化方案已保存");
        return true;
      } catch (error) { message(error.message || "配置未保存，请重试"); return false; }
    }
    function message(text, label, action, tone = "info") {
      if (disposed) return;
      toast?.remove(); win.clearTimeout(toastTimer);
      toast = document.createElement("div"); toast.className = "prompt-optimization-toast";
      toast.dataset.tone = tone;
      toast.setAttribute("role", "status"); toast.setAttribute("aria-live", "polite");
      const status = document.createElement("span"); status.className = "prompt-optimization-toast-status";
      status.setAttribute("aria-hidden", "true");
      status.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><use href="./assets/icons/prompt-optimization.svg#${tone === "success" ? "check" : "info"}"/></svg>`;
      const content = document.createElement("span"); content.className = "prompt-optimization-toast-content"; content.textContent = text; toast.append(status, content);
      if (label && action) {
        const button = document.createElement("button"); button.type = "button"; button.textContent = label;
        button.addEventListener("click", () => { toast?.remove(); action(); }); toast.append(button);
      }
      (view?.isOpen() ? document.querySelector(".prompt-optimization-dialog") : document.body)?.append(toast);
      toastTimer = win.setTimeout(() => { toast?.remove(); toast = null; }, label ? 7000 : 3500);
    }
    function available(target, suggestion) {
      return Boolean(target?.isCurrent() && supportsModel(target.snapshot().model)
        && (!suggestion || promptDocument.resolve(suggestion, target.references()).valid));
    }
    function stateFor(owner) {
      const state = service.get(owner), target = adapters.get(owner);
      if (!state || !target) return null;
      const snapshot = target.isCurrent() ? target.snapshot() : null;
      if (snapshot && !supportsModel(snapshot.model)) return null;
      if (confirmAction && (!snapshot || optimizationRequest(target, state).key !== confirmContext)) confirmAction = "";
      const filled = snapshot && matchesApplication(owner, state, snapshot);
      const stale = !snapshot || (!sameSource(state.source, snapshot) && !filled);
      const configuration = preferences.get(snapshot?.model || state.source.model);
      const publicConfiguration = { ...configuration,
        customInstructions: configuration.selectedId === "default" ? "" : configuration.customInstructions };
      return { ...state, configuration: publicConfiguration, settings: { customInstructions: publicConfiguration.customInstructions }, confirmAction, notice: notice || state.error,
        previousModelName: snapshot && snapshot.model.id !== state.source.model.id
          ? getModels().find(model => model.id === state.source.model.id)?.name || state.source.model.name || state.source.model.id : "",
        applied: Boolean(filled && same(snapshot.prompt, state.suggestion)),
        unavailable: !available(target, stale ? snapshot?.prompt : state.suggestion), stale,
        emptyInput: Boolean(snapshot && !promptDocument.toText(snapshot.prompt, snapshot.references).trim()) };
    }
    function refresh() {
      if (!active || !view?.isOpen()) return;
      const state = stateFor(active); if (state) view.update(state); else close();
    }
    const service = createService({ promptDocument, setTimer, clearTimer,
      onChange(owner) { onChange(owner); if (active === owner) refresh(); },
      onReady(owner) {
        applications.delete(owner);
        onChange(owner); if (active === owner) refresh();
        if (!available(adapters.get(owner))) return;
        if (active === owner && view?.isOpen()) service.markRead(owner);
        else message("提示词已优化，可再次点击提示词优化按钮查看。", "查看", () => open(owner), "success");
      },
      onError(owner, state) { if (adapters.get(owner)?.isCurrent()) message(state.error || "优化未完成，请重试"); },
    });
    function ensureView() {
      if (!view) view = createView({ document, promptDocument, sanitizeUrl, showMessage: message,
        onEdit(value) { confirmAction = ""; notice = ""; service.edit(active, value); },
        onSelectConfiguration: id => configure("select", id),
        onCommitConfiguration: value => configure("save", value),
        onRegenerate: regenerate, onApply: apply,
        onClose() { active = null; confirmAction = ""; notice = ""; },
        onCancelConfirm() { confirmAction = ""; notice = ""; refresh(); },
      });
      return view;
    }
    function open(owner, trigger) {
      if (disposed || !available(adapters.get(owner))) return false;
      if (!service.get(owner)) return false;
      active = owner; confirmAction = ""; notice = "";
      service.markRead(owner); ensureView().open(stateFor(owner), trigger); return true;
    }
    function activate(target, trigger) {
      if (disposed || !target?.owner || !available(target)) return false;
      adapters.set(target.owner, target);
      const previous = service.get(target.owner);
      if (previous?.status === "processing") return false;
      const snapshot = target.snapshot();
      if (canReview(previous, snapshot)) return open(target.owner, trigger);
      return startCurrent(target, snapshot);
    }
    function startCurrent(target, snapshot = target.snapshot()) {
      if (!supportsModel(snapshot.model)) return false;
      if (!promptDocument.toText(snapshot.prompt, snapshot.references).trim()) return false;
      if (!promptDocument.resolve(snapshot.prompt, snapshot.references).valid) { message("请先修复失效的素材引用"); return false; }
      confirmAction = ""; notice = "";
      toast?.remove();
      const previous = service.get(target.owner);
      if (previous && previous.source.scope !== snapshot.scope) service.remove(target.owner);
      try { return service.start(target.owner, snapshot, settingsFor(snapshot.model)); }
      catch (error) { message(error.message || "提示词暂时无法优化"); return false; }
    }
    function regenerate() {
      const state = service.get(active), target = adapters.get(active);
      if (!state || state.status === "processing" || !target?.isCurrent()) return false;
      return requestOptimization(target, state);
    }
    function apply() {
      const owner = active, state = service.get(owner), target = adapters.get(owner);
      if (!state || state.status === "processing") return false;
      const snapshot = target?.isCurrent() ? target.snapshot() : null;
      if (snapshot && !sameSource(state.source, snapshot) && !matchesApplication(owner, state, snapshot)) return requestOptimization(target, state);
      if (!state.suggestion) return false;
      if (snapshot && matchesApplication(owner, state, snapshot) && same(snapshot.prompt, state.suggestion)) return false;
      if (!available(target, state.suggestion)) { notice = "输入位置或引用已变化，请重新发起优化。"; refresh(); return false; }
      const before = promptDocument.normalize(target.read()), after = promptDocument.normalize(state.suggestion);
      const previousApplication = applications.get(owner);
      if (target.write(after) === false) { notice = "当前输入不可修改，请返回后重试。"; refresh(); return false; }
      applications.set(owner, { source: state.source, snapshot: JSON.parse(JSON.stringify(target.snapshot())) });
      service.markRead(owner);
      onChange(owner); close(); target.focus?.();
      message("已填入优化提示词", "撤销", () => {
        if (!available(target, before) || !same(target.read(), after)) { message("输入内容已变化，未撤销后续编辑"); return; }
        if (target.write(before) !== false) {
          if (previousApplication) applications.set(owner, previousApplication); else applications.delete(owner);
          onChange(owner); refresh(); target.focus?.(); message("已还原填入前的提示词");
        }
      });
      return true;
    }
    function syncButton(button, owner, { hasPrompt = false, disabled = false, model } = {}) {
      if (!button) return;
      const state = service.get(owner), target = adapters.get(owner), busy = state?.status === "processing";
      const supported = supportsModel(model || (target?.isCurrent() ? target.snapshot().model : null));
      button.hidden = !supported;
      if (!supported && active === owner) close();
      const ready = Boolean(state && !busy && target?.isCurrent() && canReview(state, target.snapshot()));
      button.disabled = !supported || disabled || busy || (!hasPrompt && !ready);
      button.classList.toggle("is-processing", busy);
      button.classList.toggle("has-optimization", ready);
      button.classList.toggle("has-unread-optimization", Boolean(ready && state?.unread));
      button.setAttribute("aria-busy", String(busy));
      const label = busy ? "正在优化提示词" : ready ? "查看提示词优化" : hasPrompt ? "提示词优化" : "输入提示词后优化";
      button.title = label; button.setAttribute("aria-label", label);
    }
    function close() { view?.close(); active = null; confirmAction = ""; notice = ""; }
    function dispose() { close(); disposed = true; view?.dispose(); service.dispose(); toast?.remove(); win.clearTimeout(toastTimer); }
    return Object.freeze({ activate, open, close, refresh, syncButton, get: service.get, getDraftOwner, advanceDraft, apply, regenerate, dispose });
  }
  root.REELAY_PROMPT_OPTIMIZATION = Object.freeze({ createController });
}(typeof globalThis === "object" ? globalThis : window));
