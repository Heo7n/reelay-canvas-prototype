(function registerPromptOptimizationView(root) {
  "use strict";
  // Official Lucide 1.25.0 icons, exported from the installed package (ISC).
  const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="./assets/icons/prompt-optimization.svg#${name}"/></svg>`;

  function createController({ document, promptDocument = root.REELAY_CANVAS_PROMPT_DOCUMENT, showMessage = () => {},
    sanitizeUrl, onEdit = () => {}, onRegenerate = () => {}, onApply = () => {},
    onClose = () => {}, onCancelConfirm = () => {}, onSelectConfiguration = () => {},
    onCommitConfiguration = () => false }) {
    const win = document.defaultView || root;
    const owner = {};
    const editor = root.REELAY_CANVAS_PROMPTS.createController({ document, showMessage });
    let state, trigger, mountedVersion, sourceIdentity, opened = false, disposed = false;
    let preview, previewAnchor, openTimer, closeTimer;
    let configurationContext, configurationForm = null, configurationFormEpoch = 0, savingConfiguration = false;
    let menuOpen = false, infoTimer;
    const dialog = document.createElement('dialog');
    dialog.className = 'prompt-optimization-dialog';
    dialog.setAttribute('aria-labelledby', 'prompt-optimization-title');
    dialog.dataset.wheelScope = 'local';
    dialog.innerHTML = `<header class="prompt-optimization-header"><div><h2 id="prompt-optimization-title">提示词优化</h2></div><div class="prompt-optimization-header-actions"><div class="prompt-optimization-scheme-control" role="group" aria-label="优化配置"><button type="button" data-action="schemes" aria-haspopup="menu" aria-expanded="false" aria-controls="prompt-optimization-scheme-menu"><span data-scheme-name>平台默认</span>${icon('chevron')}</button><button type="button" class="prompt-optimization-info-button" data-action="default-info" aria-label="平台默认说明" aria-describedby="prompt-optimization-default-info">${icon('info')}</button></div><button type="button" class="prompt-optimization-icon-button" data-action="close" aria-label="关闭提示词优化">${icon('close')}</button></div></header>
      <div class="prompt-optimization-scheme-menu" id="prompt-optimization-scheme-menu" role="menu" aria-label="优化配置方案" hidden></div>
      <div class="prompt-optimization-info-tooltip" id="prompt-optimization-default-info" role="tooltip" hidden>「平台默认」会随当前生成模型自动切换对应优化规则。</div>
      <section class="prompt-optimization-configuration-panel" role="dialog" aria-label="自定义优化配置" hidden>
        <form data-configuration-form><h3 data-configuration-title>自定义优化配置</h3>
          <div class="prompt-optimization-configuration-fields"><label>方案名称<input data-configuration-name aria-label="方案名称" maxlength="40" required autocomplete="off" placeholder="给这套配置起个名字"></label><label>适配模型<select data-configuration-model aria-label="适配模型"></select></label></div>
          <label class="prompt-optimization-instructions-label" for="prompt-optimization-instructions">自定义优化指令</label><div class="prompt-optimization-custom-input"><textarea id="prompt-optimization-instructions" data-custom maxlength="2000" rows="5" aria-label="自定义优化指令" placeholder="例如：保留我的表达习惯，不添加新的角色，优先梳理主体、动作和镜头关系。"></textarea><span class="prompt-optimization-custom-count" data-custom-count>0 / 2000</span></div>
          <div class="prompt-optimization-configuration-actions"><button type="button" data-action="cancel-configuration">取消</button><button type="submit" data-save-configuration>保存</button></div>
        </form>
      </section>
      <div class="prompt-optimization-source-model" hidden></div>
      <div class="prompt-optimization-tabs" role="tablist" aria-label="提示词对照"><button type="button" role="tab" data-tab="source" aria-selected="false" aria-controls="prompt-optimization-source">优化前（原文）</button><button type="button" role="tab" data-tab="suggestion" aria-selected="true" aria-controls="prompt-optimization-suggestion">优化后</button></div>
      <div class="prompt-optimization-columns" data-active-tab="suggestion"><section id="prompt-optimization-source" class="prompt-optimization-column prompt-optimization-source"><div class="prompt-optimization-column-heading"><h3>优化前<span class="prompt-optimization-original">（原文）</span></h3></div><div class="prompt-optimization-scroll" data-source></div></section>
      <section id="prompt-optimization-suggestion" class="prompt-optimization-column prompt-optimization-suggestion"><div class="prompt-optimization-column-heading"><h3>优化后</h3><button type="button" data-action="copy" class="prompt-optimization-icon-button" aria-label="复制优化后">${icon('copy')}</button></div><div class="prompt-optimization-scroll" data-suggestion><div class="prompt-editor" data-editor></div></div><div class="prompt-optimization-progress" hidden><span></span>正在整理表达与创作细节…</div></section></div>
      <div class="prompt-optimization-notice" role="status" hidden></div>
      <footer class="prompt-optimization-footer"><div><button type="button" data-action="cancel-confirm" hidden>取消</button><button type="button" data-action="regenerate">${icon('refresh')}<span>重新优化</span></button><button type="button" data-action="apply" class="prompt-optimization-primary"><span>填入输入框</span>${icon('arrow')}</button></div></footer>`;
    const query = (selector) => dialog.querySelector(selector);
    const safeUrl = (value) => {
      if (typeof value !== 'string' || /^\s*(?:javascript|vbscript|data:(?!image\/|video\/|audio\/))/i.test(value)) return '';
      return sanitizeUrl ? sanitizeUrl(value) || '' : value;
    };
    const references = () => promptDocument.referenceIndex(state?.source?.references || []);
    const setText = (selector, value) => { const el = query(selector); if (el.textContent !== value) el.textContent = value; };

    function positionOverlay(element, anchor, width) {
      if (!opened || element.hidden) return;
      const bounds = dialog.getBoundingClientRect(), rect = anchor.getBoundingClientRect();
      const available = Math.max(0, Math.min(bounds.width - 24, win.innerWidth - 32));
      element.style.width = `${Math.min(width, available)}px`;
      const left = Math.max(bounds.left + 12, Math.min(rect.right - Math.min(width, available), bounds.right - Math.min(width, available) - 12));
      const top = Math.max(bounds.top + 12, Math.min(rect.bottom + 8, bounds.bottom - 100));
      Object.assign(element.style, { left: `${left}px`, top: `${top}px`, maxHeight: `${Math.max(80, bounds.bottom - top - 12)}px` });
    }
    function hideInfo() { win.clearTimeout(infoTimer); query('.prompt-optimization-info-tooltip').hidden = true; }
    function showInfo() {
      if (!opened || query('[data-action="default-info"]').hidden) return;
      win.clearTimeout(infoTimer);
      const tooltip = query('.prompt-optimization-info-tooltip'); tooltip.hidden = false;
      tooltip.style.width = 'max-content';
      tooltip.style.maxWidth = `${Math.max(0, Math.min(dialog.getBoundingClientRect().width - 24, win.innerWidth - 32))}px`;
      positionOverlay(tooltip, query('[data-action="default-info"]'), Math.ceil(tooltip.getBoundingClientRect().width));
    }
    function closeMenu({ restoreFocus = false } = {}) {
      const wasOpen = menuOpen; menuOpen = false;
      query('.prompt-optimization-scheme-menu').hidden = true;
      query('[data-action="schemes"]').setAttribute('aria-expanded', 'false');
      if (restoreFocus && wasOpen) query('[data-action="schemes"]').focus({ preventScroll: true });
    }
    function closeConfigurationForm({ restoreFocus = false } = {}) {
      const wasOpen = Boolean(configurationForm);
      configurationForm = null; configurationFormEpoch++; savingConfiguration = false;
      query('.prompt-optimization-configuration-panel').hidden = true;
      query('[data-configuration-name]').value = ''; query('[data-custom]').value = '';
      setText('[data-custom-count]', '0 / 2000');
      if (restoreFocus && wasOpen) query('[data-action="schemes"]').focus({ preventScroll: true });
    }
    function renderSchemeMenu() {
      const config = state.configuration;
      const options = config?.options?.length ? config.options : [{ id: 'default', name: '平台默认' }];
      const selectedId = config?.selectedId || 'default';
      const menu = query('.prompt-optimization-scheme-menu');
      const identity = JSON.stringify([options.map(({ id, name }) => ({ id, name })), selectedId]);
      if (menu.dataset.identity === identity) return;
      const focused = document.activeElement?.dataset;
      const focusedChoice = focused?.configurationChoice, focusedEdit = focused?.configurationEdit;
      menu.replaceChildren();
      for (const option of options) {
        const row = document.createElement('div'); row.className = 'prompt-optimization-scheme-option'; row.setAttribute('role', 'none');
        const choose = document.createElement('button'); choose.type = 'button'; choose.dataset.configurationChoice = option.id;
        choose.setAttribute('role', 'menuitemradio'); choose.setAttribute('aria-checked', String(option.id === selectedId)); choose.tabIndex = -1;
        const check = document.createElement('span'); check.className = 'prompt-optimization-scheme-check'; check.innerHTML = icon('check'); check.classList.toggle('is-selected', option.id === selectedId);
        const name = document.createElement('span'); name.className = 'prompt-optimization-scheme-label'; name.textContent = option.name;
        choose.append(check, name); row.append(choose);
        if (option.id !== 'default') {
          const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'prompt-optimization-scheme-edit'; edit.dataset.configurationEdit = option.id;
          edit.setAttribute('role', 'menuitem'); edit.setAttribute('aria-label', `编辑 ${option.name}`); edit.tabIndex = -1; edit.innerHTML = icon('edit'); row.append(edit);
        }
        menu.append(row);
      }
      const add = document.createElement('button'); add.type = 'button'; add.dataset.action = 'new-configuration'; add.className = 'prompt-optimization-scheme-add'; add.setAttribute('role', 'menuitem'); add.tabIndex = -1;
      add.innerHTML = icon('plus'); const label = document.createElement('span'); label.textContent = '自定义优化配置'; add.append(label); menu.append(add); menu.dataset.identity = identity;
      if (menuOpen && (focusedChoice || focusedEdit)) {
        [...menu.querySelectorAll('button')].find((button) => focusedChoice ? button.dataset.configurationChoice === focusedChoice : button.dataset.configurationEdit === focusedEdit)?.focus({ preventScroll: true });
      }
    }
    function openMenu({ last = false } = {}) {
      if (!opened || state.status === 'processing') return;
      closeConfigurationForm(); closePreview(); hideInfo(); renderSchemeMenu(); menuOpen = true;
      const menu = query('.prompt-optimization-scheme-menu'); menu.hidden = false;
      query('[data-action="schemes"]').setAttribute('aria-expanded', 'true');
      positionOverlay(menu, query('[data-action="schemes"]'), 288);
      const items = [...menu.querySelectorAll('button:not(:disabled)')];
      (last ? items.at(-1) : items.find((item) => item.getAttribute('aria-checked') === 'true') || items[0])?.focus({ preventScroll: true });
    }
    function updateConfiguration() {
      const config = state.configuration;
      const context = JSON.stringify([state.source.scope, config?.modelId || state.source.model?.id || '']);
      if (configurationContext !== context) { closeConfigurationForm(); closeMenu(); hideInfo(); configurationContext = context; }
      const selectedId = config?.selectedId || 'default';
      setText('[data-scheme-name]', config?.options?.find((option) => option.id === selectedId)?.name || '平台默认');
      query('[data-action="default-info"]').hidden = selectedId !== 'default';
      if (selectedId !== 'default') hideInfo();
      const disabled = state.status === 'processing' || savingConfiguration;
      query('[data-action="schemes"]').disabled = disabled;
      if (state.status === 'processing') closeMenu();
      for (const field of dialog.querySelectorAll('[data-configuration-name], [data-custom], [data-save-configuration]')) field.disabled = disabled;
      query('[data-configuration-model]').disabled = disabled || Boolean(configurationForm?.id);
      renderSchemeMenu();
      if (menuOpen) positionOverlay(query('.prompt-optimization-scheme-menu'), query('[data-action="schemes"]'), 288);
      if (configurationForm) positionOverlay(query('.prompt-optimization-configuration-panel'), query('[data-action="schemes"]'), 460);
    }
    function openConfigurationForm(id) {
      if (!state.configuration || state.status === 'processing') return;
      const config = state.configuration;
      const option = id ? config.options?.find((entry) => entry.id === id && entry.id !== 'default') : null;
      if (id && !option) return;
      closeMenu(); hideInfo(); closePreview(); closeConfigurationForm();
      configurationForm = { ...(option ? { id: option.id } : {}), modelId: config.modelId };
      const models = config.models?.length ? config.models : [{ id: config.modelId, name: config.modelName }];
      const select = query('[data-configuration-model]');
      select.replaceChildren(...models.map((model) => { const element = document.createElement('option'); element.value = model.id; element.textContent = model.name; return element; }));
      if (![...select.options].some((item) => item.value === config.modelId)) { const model = document.createElement('option'); model.value = config.modelId; model.textContent = config.modelName; select.append(model); }
      select.value = config.modelId;
      query('[data-configuration-name]').value = option?.name || '';
      // Platform defaults remain private: a new configuration always starts blank.
      query('[data-custom]').value = option?.customInstructions || '';
      setText('[data-custom-count]', `${query('[data-custom]').value.length} / 2000`);
      setText('[data-configuration-title]', option ? '编辑优化配置' : '自定义优化配置');
      query('.prompt-optimization-configuration-panel').hidden = false;
      updateConfiguration(); query('[data-configuration-name]').focus({ preventScroll: true });
    }
    async function submitConfiguration() {
      if (!configurationForm || savingConfiguration || state.status === 'processing') return;
      const name = query('[data-configuration-name]').value.trim();
      if (!name) { query('[data-configuration-name]').focus(); return; }
      const payload = { ...(configurationForm.id ? { id: configurationForm.id } : {}), name,
        modelId: configurationForm.id ? configurationForm.modelId : query('[data-configuration-model]').value,
        customInstructions: query('[data-custom]').value };
      if (!payload.modelId) return;
      const epoch = configurationFormEpoch; savingConfiguration = true; updateConfiguration();
      let saved = false;
      try { saved = await onCommitConfiguration(payload); }
      catch { showMessage('配置未保存，请重试'); }
      finally {
        if (epoch === configurationFormEpoch && !disposed) {
          savingConfiguration = false;
          if (saved === true) closeConfigurationForm({ restoreFocus: true });
          updateConfiguration();
        }
      }
    }
    function onResize() {
      closePreview(); hideInfo();
      if (menuOpen) positionOverlay(query('.prompt-optimization-scheme-menu'), query('[data-action="schemes"]'), 288);
      if (configurationForm) positionOverlay(query('.prompt-optimization-configuration-panel'), query('[data-action="schemes"]'), 460);
    }

    function closePreview() {
      win.clearTimeout(openTimer); win.clearTimeout(closeTimer);
      for (const media of preview?.querySelectorAll('video, audio') || []) {
        media.pause(); media.removeAttribute('src'); media.load();
      }
      preview?.remove(); preview = null; previewAnchor = null;
    }
    function positionPreview() {
      if (!preview || !previewAnchor?.isConnected) return closePreview();
      const anchor = previewAnchor.getBoundingClientRect();
      const rect = preview.getBoundingClientRect();
      const bounds = dialog.getBoundingClientRect();
      const left = Math.max(bounds.left + 10, Math.min(anchor.left + anchor.width / 2 - rect.width / 2, bounds.right - rect.width - 10));
      const top = anchor.top - rect.height - 8 >= bounds.top + 10 ? anchor.top - rect.height - 8 : Math.min(anchor.bottom + 8, bounds.bottom - rect.height - 10);
      Object.assign(preview.style, { left: `${left}px`, top: `${Math.max(bounds.top + 10, top)}px` });
    }
    function openPreview(anchor) {
      const reference = references().find((entry) => entry.key === anchor.dataset.referenceKey);
      if (!reference) return;
      closePreview(); previewAnchor = anchor;
      preview = document.createElement('div'); preview.className = 'prompt-optimization-preview';
      preview.setAttribute('role', 'region'); preview.setAttribute('aria-label', `${reference.label}预览`);
      const type = reference.mediaType;
      const media = document.createElement(type === 'image' ? 'img' : type);
      const asset = reference.asset;
      const url = safeUrl(asset.url || asset.src || asset.thumbnailUrl);
      if (!url) return closePreview();
      media.src = url;
      if (type === 'image') { media.alt = reference.name || reference.label; media.addEventListener('load', positionPreview); }
      else { media.controls = true; media.preload = 'metadata'; if (type === 'video') { media.playsInline = true; media.poster = safeUrl(asset.thumbnailUrl || asset.thumbnail); } }
      media.addEventListener('error', () => { if (preview?.contains(media)) { const message = document.createElement('span'); message.textContent = '素材暂时无法预览'; preview.replaceChildren(message); positionPreview(); } });
      preview.append(media); dialog.append(preview); positionPreview();
    }
    function renderSource() {
      const region = query('[data-source]'); region.replaceChildren();
      const refs = references();
      for (const part of promptDocument.normalize(state.source.prompt).content) {
        if (part.type === 'text') { region.append(document.createTextNode(part.text)); continue; }
        const reference = refs.find((entry) => entry.key === part.key);
        const chip = document.createElement('span'); chip.className = 'prompt-reference'; chip.dataset.referenceKey = part.key;
        chip.setAttribute('tabindex', '0'); chip.setAttribute('aria-label', reference?.name || part.fallbackLabel);
        const thumb = document.createElement('span'); thumb.className = 'prompt-reference-thumb';
        const url = safeUrl(reference?.asset?.thumbnailUrl || reference?.asset?.thumbnail || (part.mediaType === 'image' ? reference?.asset?.url : ''));
        if (url) { const img = document.createElement('img'); img.src = url; img.alt = ''; thumb.append(img); } else thumb.innerHTML = icon(part.mediaType);
        const label = document.createElement('span'); label.className = 'prompt-reference-label'; label.textContent = reference?.label || part.fallbackLabel;
        chip.append(thumb, label); region.append(chip);
      }
    }
    function mountEditor() {
      editor.mount(owner, query('[data-editor]'), { scope: state.source.scope, readDocument: () => state.suggestion,
        getReferences: references, isCurrent: () => opened && !disposed, isEditable: () => state.status !== 'processing',
        isMentionEnabled: () => true, getPlaceholder: () => '优化后的提示词将在这里显示，你也可以直接修改。',
        onChange: (value) => { state = { ...state, suggestion: value, edited: true }; onEdit(value); }, submitOnEnter: false });
    }
    function update(next) {
      if (disposed) return;
      const previousVersion = mountedVersion; const completed = state?.status === 'processing' && next.status === 'ready'; state = next;
      const processing = state.status === 'processing';
      const hasSuggestion = promptDocument.toText(state.suggestion, references()).trim().length > 0;
      const identity = JSON.stringify([state.source.scope, state.source.prompt, state.source.references]);
      if (identity !== sourceIdentity) { renderSource(); sourceIdentity = identity; }
      if (opened) {
        if (previousVersion !== state.version || completed) { editor.replace(owner, state.suggestion, { addToHistory: false }); query('[data-suggestion]').scrollTop = 0; }
        mountEditor();
      }
      mountedVersion = state.version;
      query('.prompt-optimization-progress').hidden = !processing;
      query('[data-editor]').setAttribute('aria-busy', String(processing));
      query('[data-action="copy"]').disabled = !hasSuggestion;
      const apply = query('[data-action="apply"]'); apply.disabled = processing || state.applied || (!hasSuggestion && !state.stale) || (state.stale && state.emptyInput) || state.unavailable;
      apply.querySelector('span').textContent = state.applied ? '已填入' : state.confirmAction === 'current' ? '确认优化当前内容' : state.stale ? '优化当前内容' : '填入输入框';
      const regenerate = query('[data-action="regenerate"]'); regenerate.disabled = processing || (state.stale && state.emptyInput) || state.unavailable;
      regenerate.hidden = Boolean(state.stale);
      regenerate.querySelector('span').textContent = state.confirmAction === 'regenerate' ? '确认重新优化' : processing ? '正在优化' : state.status === 'failed' ? '重新尝试' : '重新优化';
      query('[data-action="cancel-confirm"]').hidden = !state.confirmAction;
      const notice = query('.prompt-optimization-notice');
      notice.textContent = state.unavailable ? '原输入位置或参考素材已不可用，请返回输入区重新发起。' : state.confirmAction ? '继续优化将替换尚未填入的手动修改。' : state.notice || '';
      notice.hidden = !notice.textContent;
      const sourceModel = query('.prompt-optimization-source-model');
      sourceModel.textContent = state.previousModelName ? `上次优化使用：${state.previousModelName}` : '';
      sourceModel.hidden = !state.previousModelName;
      updateConfiguration();
    }
    function close() {
      if (!opened) return;
      opened = false; closePreview(); closeConfigurationForm(); closeMenu(); hideInfo(); editor.unmount(owner); dialog.close(); onClose();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    }
    function closeTopLayer(event) {
      if (preview) { event.preventDefault(); closePreview(); return true; }
      if (configurationForm) { event.preventDefault(); closeConfigurationForm({ restoreFocus: true }); return true; }
      if (menuOpen) { event.preventDefault(); closeMenu({ restoreFocus: true }); return true; }
      if (!query('.prompt-optimization-info-tooltip').hidden) { event.preventDefault(); hideInfo(); return true; }
      return false;
    }
    dialog.addEventListener('cancel', (event) => { if (!closeTopLayer(event)) { event.preventDefault(); close(); } });
    dialog.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Escape') { closeTopLayer(event); return; }
      const menu = query('.prompt-optimization-scheme-menu');
      if (event.target.closest('[data-action="schemes"]') && ['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); openMenu({ last: event.key === 'ArrowUp' }); return; }
      if (menuOpen && menu.contains(event.target)) {
        const items = [...menu.querySelectorAll('button:not(:disabled)')], index = items.indexOf(document.activeElement);
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
          items[next]?.focus({ preventScroll: true });
        } else if (event.key === 'Tab') closeMenu({ restoreFocus: true });
      }
      if (configurationForm && event.key === 'Tab') {
        const items = [...query('.prompt-optimization-configuration-panel').querySelectorAll('input:not(:disabled),select:not(:disabled),textarea:not(:disabled),button:not(:disabled)')];
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    });
    for (const type of ['pointerdown', 'pointerup', 'wheel']) dialog.addEventListener(type, (event) => event.stopPropagation());
    dialog.addEventListener('pointerdown', (event) => {
      if (menuOpen && !event.target.closest('.prompt-optimization-scheme-menu,[data-action="schemes"]')) closeMenu();
      if (!event.target.closest('.prompt-optimization-info-tooltip,[data-action="default-info"]')) hideInfo();
    });
    dialog.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close(); return; }
      const button = event.target.closest('button'); if (!button || button.disabled) return;
      const action = button.dataset.action;
      if (action === 'close') close();
      if (action === 'schemes') { if (menuOpen) closeMenu({ restoreFocus: true }); else openMenu(); }
      if (action === 'default-info') showInfo();
      if (button.dataset.configurationChoice) { closeMenu({ restoreFocus: true }); onSelectConfiguration(button.dataset.configurationChoice); }
      if (button.dataset.configurationEdit) openConfigurationForm(button.dataset.configurationEdit);
      if (action === 'new-configuration') openConfigurationForm();
      if (action === 'cancel-configuration') closeConfigurationForm({ restoreFocus: true });
      if (action === 'apply') onApply();
      if (action === 'regenerate') onRegenerate();
      if (action === 'cancel-confirm') onCancelConfirm();
      if (action === 'copy') {
        try { await win.navigator.clipboard.writeText(promptDocument.toText(state.suggestion, references())); showMessage('已复制优化后'); } catch { showMessage('复制未成功，请选择文本复制'); }
      }
      if (button.dataset.tab) {
        query('.prompt-optimization-columns').dataset.activeTab = button.dataset.tab;
        for (const tab of dialog.querySelectorAll('[data-tab]')) tab.setAttribute('aria-selected', String(tab === button));
        closePreview();
      }
    });
    query('[data-configuration-form]').addEventListener('submit', (event) => { event.preventDefault(); event.stopPropagation(); void submitConfiguration(); });
    query('[data-custom]').addEventListener('input', (event) => setText('[data-custom-count]', `${event.target.value.length} / 2000`));
    const infoButton = query('[data-action="default-info"]'), tooltip = query('.prompt-optimization-info-tooltip');
    infoButton.addEventListener('pointerenter', () => { win.clearTimeout(infoTimer); infoTimer = win.setTimeout(showInfo, 160); });
    infoButton.addEventListener('pointerleave', () => { if (document.activeElement !== infoButton) { win.clearTimeout(infoTimer); infoTimer = win.setTimeout(hideInfo, 160); } });
    infoButton.addEventListener('focus', showInfo); infoButton.addEventListener('blur', hideInfo);
    tooltip.addEventListener('pointerenter', () => win.clearTimeout(infoTimer)); tooltip.addEventListener('pointerleave', hideInfo);
    dialog.addEventListener('pointerover', (event) => {
      if (preview?.contains(event.target)) { win.clearTimeout(closeTimer); return; }
      const anchor = event.target.closest('[data-reference-key]');
      if (!anchor || anchor.contains(event.relatedTarget)) return;
      win.clearTimeout(closeTimer); win.clearTimeout(openTimer); openTimer = win.setTimeout(() => openPreview(anchor), 220);
    });
    dialog.addEventListener('pointerout', (event) => {
      const anchor = event.target.closest('[data-reference-key]');
      if ((!anchor && !preview?.contains(event.target)) || anchor?.contains(event.relatedTarget) || preview?.contains(event.relatedTarget)) return;
      win.clearTimeout(openTimer); win.clearTimeout(closeTimer); closeTimer = win.setTimeout(closePreview, 220);
    });
    dialog.addEventListener('focusin', (event) => { const anchor = event.target.closest('[data-reference-key]'); if (anchor) openPreview(anchor); });
    for (const region of dialog.querySelectorAll('.prompt-optimization-scroll')) region.addEventListener('scroll', closePreview);
    win.addEventListener('resize', onResize);
    return Object.freeze({
      open(next, anchor) {
        if (disposed) return;
        closeConfigurationForm(); closeMenu(); hideInfo();
        if (!dialog.isConnected) document.body.append(dialog);
        trigger = anchor || document.activeElement;
        if (!opened) { dialog.showModal(); opened = true; }
        update(next); query('[data-action="close"]').focus({ preventScroll: true });
      }, update, close, isOpen: () => opened,
      dispose() { close(); disposed = true; editor.destroy(); win.removeEventListener('resize', onResize); dialog.remove(); },
    });
  }
  root.REELAY_PROMPT_OPTIMIZATION_VIEW = Object.freeze({ createController });
}(typeof globalThis === 'object' ? globalThis : window));
