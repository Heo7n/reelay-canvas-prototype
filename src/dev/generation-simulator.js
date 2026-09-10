(function mountGenerationSimulator(view) {
  "use strict";
  const document = view.document;
  const ROOT_ID = "reelay-generation-simulator";
  if (document.getElementById(ROOT_ID)) return;
  const composer = document.querySelector("#agentComposer");
  const agentPanel = document.querySelector("#agentPanel");
  const headerActions = agentPanel?.querySelector(".agent-actions");
  if (!composer || !headerActions) return;
  const root = document.createElement("span");
  root.id = ROOT_ID;
  root.hidden = true;
  root.dataset.generationSimulator = "";
  root.innerHTML = '<button class="generation-simulator-toggle" type="button" aria-expanded="false" aria-controls="generation-simulator-panel">生成模拟</button>';
  headerActions.prepend(root);
  const toggle = root.querySelector("button");
  const panel = document.createElement("section");
  panel.id = "generation-simulator-panel";
  panel.className = "generation-simulator-panel";
  panel.dataset.generationSimulator = "";
  panel.dataset.wheelScope = "local";
  panel.hidden = true;
  panel.setAttribute("aria-label", "开发模拟设置");
  panel.innerHTML = `
      <header><strong>开发模拟</strong><button type="button" data-simulator-close aria-label="收起开发模拟">×</button></header>
      <p class="generation-simulator-note">默认记录为展示示例，不影响当前积分或画布。</p>
      <label for="generation-simulator-preset">生成示例</label>
      <select id="generation-simulator-preset"></select>
      <p class="generation-simulator-description"></p>
      <button type="button" class="generation-simulator-fill" data-simulator-fill>填入输入区</button>
      <div class="generation-simulator-confirm" hidden>
        <p>输入区已有草稿，替换为这个示例？</p>
        <div class="generation-simulator-actions"><button type="button" data-simulator-replace>替换当前草稿</button><button type="button" data-simulator-keep>保留草稿</button></div>
      </div>
      <div class="generation-simulator-execution">
      <label for="generation-simulator-outcome">下一次生成结果</label>
      <select id="generation-simulator-outcome">
        <option value="success">成功</option><option value="failure">失败</option>
      </select>
      <div class="generation-simulator-reason" hidden>
        <label for="generation-simulator-reason">失败原因</label>
        <input id="generation-simulator-reason" type="text" maxlength="180" value="生成服务暂时不可用，请稍后重试。" />
      </div>
      <p class="generation-simulator-note" role="status">填入后正常发送；约 11 秒完成，前 7 秒可取消。</p>
      </div>`;
  document.body.append(panel);
  const preset = panel.querySelector("#generation-simulator-preset");
  const description = panel.querySelector(".generation-simulator-description");
  const fill = panel.querySelector("[data-simulator-fill]");
  const confirmation = panel.querySelector(".generation-simulator-confirm");
  const outcome = panel.querySelector("#generation-simulator-outcome");
  const reasonGroup = panel.querySelector(".generation-simulator-reason");
  const reason = panel.querySelector("#generation-simulator-reason");
  const note = panel.querySelector('.generation-simulator-note[role="status"]');
  let capabilities = null;
  let unsubscribe = null;
  let disposed = false;
  let suspended = false;
  let isOpen = false;
  let nextConfigured = false;
  let knownIds = new Set();
  let presets = [];
  let replacePresetId = null;
  const listeners = [];

  function listen(target, name, handler, options) {
    target.addEventListener(name, handler, options);
    listeners.push(() => target.removeEventListener(name, handler, options));
  }

  function clearConfirmation() { replacePresetId = null; confirmation.hidden = true; }

  function positionPanel() {
    if (!isOpen) return;
    const anchor = toggle.getBoundingClientRect();
    panel.style.maxHeight = `${Math.max(100, view.innerHeight - anchor.bottom - 16)}px`;
    const width = panel.getBoundingClientRect().width || 280;
    panel.style.left = `${Math.max(8, Math.min(anchor.right - width, view.innerWidth - width - 8))}px`;
    panel.style.top = `${Math.max(8, anchor.bottom + 7)}px`;
  }

  function setOpen(open, returnFocus = false) {
    isOpen = Boolean(open && !root.hidden);
    panel.hidden = !isOpen;
    toggle.setAttribute("aria-expanded", String(isOpen));
    clearConfirmation();
    if (returnFocus && !root.hidden) toggle.focus();
    if (isOpen) { positionPanel(); preset.focus(); }
  }

  function updatePosition() {
    if (disposed) return;
    const visible = !suspended && capabilities && composer?.dataset.composerMode === "generation"
      && agentPanel && !agentPanel.hidden && agentPanel.getAttribute("aria-hidden") !== "true";
    root.hidden = !visible;
    if (!visible) { setOpen(false); return; }
    positionPanel();
  }

  function renderTasks() {
    if (disposed || !capabilities) return;
    const tasks = capabilities.list();
    if (!Array.isArray(tasks)) return;
    if (nextConfigured && tasks.some((task) => !knownIds.has(task.id))) {
      nextConfigured = false;
      outcome.value = "success";
      reasonGroup.hidden = true;
      note.textContent = "本次设置已使用，下一次默认成功。";
    }
    knownIds = new Set(tasks.map((task) => task.id));
  }

  function updatePreset() {
    clearConfirmation();
    description.textContent = presets.find((item) => item.id === preset.value)?.description || "";
    fill.disabled = !presets.some((item) => item.id === preset.value);
  }

  function loadPresets() {
    const selected = preset.value;
    presets = Array.from(capabilities.listPresets() || []).filter((item) => item && typeof item.id === "string");
    preset.replaceChildren(...presets.map((item) => {
      const option = document.createElement("option"); option.value = item.id; option.textContent = item.label || item.id; return option;
    }));
    if (presets.some((item) => item.id === selected)) preset.value = selected;
    updatePreset();
  }

  function fillPreset(id, replace) {
    if (!capabilities || disposed || !presets.some((item) => item.id === id)) return;
    if (capabilities.fillPreset(id, { replace }) === true) {
      note.textContent = "示例已填入，可修改后正常发送。";
      setOpen(false);
    } else { clearConfirmation(); note.textContent = "暂未填入示例，请检查当前输入区。"; }
  }

  function requestFill() {
    if (!capabilities || !preset.value) return;
    if (capabilities.hasDraft()) {
      replacePresetId = preset.value;
      confirmation.hidden = false;
      panel.querySelector("[data-simulator-keep]").focus();
      positionPanel();
    } else fillPreset(preset.value, false);
  }

  function configureNext() {
    if (!capabilities || disposed) return;
    reasonGroup.hidden = outcome.value !== "failure";
    capabilities.setNextScenario({ outcome: outcome.value, failureReason: reason.value.trim() || "生成服务暂时不可用，请稍后重试。" });
    nextConfigured = true;
    note.textContent = `下一次：${outcome.selectedOptions[0].textContent}。约 11 秒完成，前 7 秒可取消。`;
    positionPanel();
  }

  function connect(event) {
    const next = event.detail;
    if (!next || !["setNextScenario", "list", "subscribe", "listPresets", "hasDraft", "fillPreset"].every((key) => typeof next[key] === "function")) return;
    if (next === capabilities) return;
    if (typeof unsubscribe === "function") unsubscribe();
    capabilities = next;
    if (typeof next.initializePreviewHistory === "function" && view.REELAY_GENERATION_HISTORY_PRESETS) {
      next.initializePreviewHistory(({ presets: historyPresets, prepareInput }) => view.REELAY_GENERATION_HISTORY_PRESETS.create({
        presets: historyPresets, prepareInput, media: view.REELAY_PROTOTYPE_CONFIG?.assetLibrarySeed?.media || [],
        simulationAssets: view.REELAY_PROTOTYPE_CONFIG?.simulationAssets || {}, now: Date.now(),
      }));
    }
    nextConfigured = false;
    outcome.value = "success";
    reasonGroup.hidden = true;
    knownIds = new Set();
    loadPresets(); renderTasks();
    unsubscribe = next.subscribe(renderTasks);
    updatePosition();
  }

  const observer = new view.MutationObserver(updatePosition);
  if (composer) observer.observe(composer, { attributes: true, attributeFilter: ["data-composer-mode"] });
  if (agentPanel) observer.observe(agentPanel, { attributes: true, attributeFilter: ["aria-hidden", "hidden", "style", "class"] });
  const resizeObserver = view.ResizeObserver ? new view.ResizeObserver(updatePosition) : null;
  if (agentPanel) resizeObserver?.observe(agentPanel);

  listen(toggle, "click", () => setOpen(!isOpen));
  listen(panel.querySelector("[data-simulator-close]"), "click", () => setOpen(false, true));
  listen(preset, "change", updatePreset);
  listen(fill, "click", requestFill);
  listen(panel.querySelector("[data-simulator-replace]"), "click", () => { if (replacePresetId) fillPreset(replacePresetId, true); });
  listen(panel.querySelector("[data-simulator-keep]"), "click", () => { clearConfirmation(); fill.focus(); });
  listen(outcome, "change", configureNext);
  listen(reason, "input", () => { if (outcome.value === "failure") configureNext(); });
  for (const element of [root, panel]) {
    for (const name of ["pointerdown", "mousedown", "dblclick", "wheel"]) listen(element, name, (event) => event.stopPropagation());
    listen(element, "keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); setOpen(false, true); }
    });
  }
  listen(document, "pointerdown", (event) => { if (isOpen && !root.contains(event.target) && !panel.contains(event.target)) setOpen(false); });
  listen(view, "resize", updatePosition);
  listen(view, "reelay:generation-ready", connect);
  listen(view, "pageshow", () => {
    suspended = false;
    renderTasks();
    updatePosition();
  });
  listen(view, "pagehide", (event) => {
    if (event.persisted) {
      suspended = true;
      updatePosition();
      return;
    }
    disposed = true;
    if (typeof unsubscribe === "function") unsubscribe();
    observer.disconnect();
    resizeObserver?.disconnect();
    listeners.splice(0).forEach((remove) => remove());
    root.remove(); panel.remove();
  });
  view.dispatchEvent(new view.CustomEvent("reelay:generation-connect"));
})(window);
