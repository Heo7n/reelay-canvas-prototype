import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
const [viewSource, modelSource] = await Promise.all(['canvas-prompt-optimization-view.js', 'canvas-prompt-document.js'].map(name => readFile(new URL(`../src/legacy-canvas/${name}`, import.meta.url), 'utf8')));
function fixture(t) {
  const dom = new JSDOM('<!doctype html><body><button id="trigger">优化</button></body>', { runScripts: 'outside-only' });
  const { window } = dom; const { document } = window;
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  let installed, replacements = 0, destroyed = false, released = false, paused = 0;
  const calls = []; const results = { commit: false };
  window.HTMLMediaElement.prototype.pause = () => paused++;
  window.HTMLMediaElement.prototype.load = () => {};
  window.REELAY_CANVAS_PROMPTS = { createController: () => ({
    mount(owner, element, options) { installed = { owner, element, options }; },
    replace() { replacements++; }, unmount() { released = true; }, destroy() { destroyed = true; },
  }) };
  window.eval(modelSource); window.eval(viewSource);
  const model = window.REELAY_CANVAS_PROMPT_DOCUMENT;
  const base = { status: 'ready', source: { scope: 'node:1', prompt: model.normalize('原文'), references: [], model: { name: 'Seedance 2.5', type: 'video' } }, suggestion: model.normalize('优化建议'), settings: { customInstructions: '' }, configuration: configuration(), version: 1 };
  const controller = window.REELAY_PROMPT_OPTIMIZATION_VIEW.createController({ document, onSettingsChange: settings => calls.push(['settings', settings]), onApply: () => calls.push(['apply']), onCancelConfirm: () => calls.push(['cancel']), onEdit: doc => calls.push(['edit', doc]), onClose: () => calls.push(['close']), onSelectConfiguration: id => calls.push(['select-configuration', id]), onCommitConfiguration: payload => { calls.push(['commit-configuration', JSON.parse(JSON.stringify(payload))]); return results.commit; } });
  t.after(() => { controller.dispose(); window.close(); });
  const open = state => controller.open(state || base, document.querySelector('#trigger'));
  return { window, document, controller, base, open, calls, results, model, get editor() { return installed; }, get replacements() { return replacements; }, get released() { return released; }, get destroyed() { return destroyed; }, get paused() { return paused; } };
}
function configuration(overrides = {}) {
  return { modelId: 'seedance', modelName: 'Seedance 2.5', selectedId: 'default', options: [
    { id: 'default', name: '平台默认' }, { id: 'cinematic', name: '叙事镜头', customInstructions: '镜头衔接自然，不新增角色。' },
  ], models: [{ id: 'seedance', name: 'Seedance 2.5' }, { id: 'image', name: '图像模型' }], ...overrides };
}

test('settings and edits preserve editor DOM and scroll position; a new completion resets the reading position', t => {
  const f = fixture(t); f.open();
  const element = f.editor.element; const scroller = f.document.querySelector('[data-suggestion]');
  scroller.scrollTop = 120; const replacements = f.replacements;
  f.controller.update({ ...f.base, settings: { customInstructions: '保留人物' } });
  assert.equal(f.editor.element, element); assert.equal(scroller.scrollTop, 120); assert.equal(f.replacements, replacements);
  f.controller.update({ ...f.base, status: 'processing', version: 2 });
  scroller.scrollTop = 110;
  f.controller.update({ ...f.base, version: 2, suggestion: f.model.normalize('新的建议') });
  assert.equal(scroller.scrollTop, 0); assert.equal(f.editor.options.readDocument().content[0].text, '新的建议');
});
test('processing and unavailable targets block apply while stale results offer current-input optimization', t => {
  const f = fixture(t); f.open({ ...f.base, status: 'processing' });
  assert.equal(f.editor.options.isEditable(), false); assert.equal(f.document.querySelector('[data-action="apply"]').disabled, true);
  f.controller.update({ ...f.base, stale: true });
  assert.match(f.document.querySelector('[data-action="apply"]').textContent, /优化当前内容/);
  assert.equal(f.document.querySelector('[data-action="regenerate"]').hidden, true);
  assert.doesNotMatch(f.document.querySelector('.prompt-optimization-notice').textContent, /填入将替换|确认替换/);
  assert.equal(f.document.querySelector('[data-action="cancel-confirm"]').hidden, true);
  f.document.querySelector('[data-action="apply"]').click(); assert.equal(f.calls.at(-1)[0], 'apply');
  f.controller.update({ ...f.base, unavailable: true }); assert.equal(f.document.querySelector('[data-action="apply"]').disabled, true);
});

test('stale confirmation stays on the primary action and model attribution is conditional', t => {
  const f = fixture(t); f.open();
  const model = f.document.querySelector('.prompt-optimization-source-model');
  assert.equal(model.hidden, true);
  f.controller.update({ ...f.base, stale: true, confirmAction: 'current', previousModelName: 'Seedance 2.0' });
  assert.equal(f.document.querySelector('[data-action="apply"] span').textContent, '确认优化当前内容');
  assert.equal(f.document.querySelector('[data-action="regenerate"]').hidden, true);
  assert.equal(f.document.querySelector('[data-action="cancel-confirm"]').hidden, false);
  assert.match(f.document.querySelector('.prompt-optimization-notice').textContent, /尚未填入/);
  assert.equal(model.textContent, '上次优化使用：Seedance 2.0'); assert.equal(model.hidden, false);
  f.controller.update(f.base);
  assert.equal(model.hidden, true); assert.equal(model.textContent, '');
  assert.equal(f.document.querySelector('[data-action="regenerate"]').hidden, false);
});
test('applied suggestions show a quiet completed action and return to fill after suggestion edits', t => {
  const f = fixture(t); f.open({ ...f.base, applied: true });
  const button = f.document.querySelector('[data-action="apply"]');
  assert.equal(button.disabled, true);
  assert.equal(button.querySelector('span').textContent, '已填入');
  f.controller.update({ ...f.base, applied: false });
  assert.equal(button.disabled, false);
  assert.equal(button.querySelector('span').textContent, '填入输入框');
});

test('source renders reference bindings and suggestion editor receives the same identities', t => {
  const f = fixture(t); const reference = { key: 'asset:one', asset: { type: 'image', url: 'https://example.test/image.png', name: '主体' } };
  const prompt = { version: 1, content: [{ type: 'text', text: '保留' }, { type: 'reference', key: 'asset:one', mediaType: 'image', fallbackLabel: '图片1' }] };
  f.open({ ...f.base, source: { ...f.base.source, prompt, references: [reference] }, suggestion: prompt });
  assert.equal(f.document.querySelector('[data-source] [data-reference-key]').dataset.referenceKey, 'asset:one');
  assert.equal(f.editor.options.getReferences()[0].key, 'asset:one'); assert.equal(f.editor.options.isMentionEnabled(), true);
  f.editor.options.onChange(f.model.normalize('修改')); assert.equal(f.calls.at(-1)[0], 'edit');
});
test('comparison headings omit versions, summaries and mock labels and use the shared icon sprite', t => {
  const f = fixture(t); f.open({ ...f.base, version: 23, summary: ['不应展示的摘要'] });
  assert.deepEqual([...f.document.querySelectorAll('.prompt-optimization-columns h3')].map(el => el.textContent), ['优化前（原文）', '优化后']);
  assert.doesNotMatch(f.document.querySelector('dialog').textContent, /不应展示的摘要|第.*版|模拟|表达整理|画面细化|镜头与动作|简洁|适中|详细/);
  const uses = [...f.document.querySelectorAll('button svg use')];
  assert.ok(uses.length >= 4);
  assert.ok(uses.every(el => el.getAttribute('href').startsWith('./assets/icons/prompt-optimization.svg#')));
});
test('nested media preview closes before the dialog and releases playback', t => {
  const f = fixture(t); const prompt = { version: 1, content: [{ type: 'reference', key: 'asset:clip', mediaType: 'video', fallbackLabel: '视频1' }] };
  f.open({ ...f.base, source: { ...f.base.source, prompt, references: [{ key: 'asset:clip', asset: { type: 'video', url: 'https://example.test/video.mp4' } }] } });
  f.document.querySelector('[data-source] [data-reference-key]').focus();
  assert.ok(f.document.querySelector('dialog .prompt-optimization-preview video'));
  f.document.querySelector('dialog').dispatchEvent(new f.window.Event('cancel', { cancelable: true }));
  assert.equal(f.document.querySelector('.prompt-optimization-preview'), null); assert.equal(f.paused, 1); assert.equal(f.controller.isOpen(), true);
  f.document.querySelector('dialog').dispatchEvent(new f.window.Event('cancel', { cancelable: true })); assert.equal(f.controller.isOpen(), false);
});
test('platform default shows only its name and accessible explanation, never private default instructions', t => {
  const f = fixture(t);
  f.open({ ...f.base, settings: { customInstructions: 'PRIVATE_DEFAULT_INSTRUCTIONS' }, configuration: configuration({ customInstructions: 'PRIVATE_DEFAULT_INSTRUCTIONS' }) });
  assert.equal(f.document.querySelector('[data-scheme-name]').textContent, '平台默认');
  assert.equal(f.document.querySelectorAll('[data-action="settings"], .prompt-optimization-settings').length, 0);
  assert.doesNotMatch(f.document.querySelector('dialog').textContent, /PRIVATE_DEFAULT_INSTRUCTIONS/);
  assert.ok([...f.document.querySelectorAll('textarea,input')].every(input => !input.value.includes('PRIVATE_DEFAULT_INSTRUCTIONS')));
  const info = f.document.querySelector('[data-action="default-info"]'); info.focus();
  const tooltip = f.document.querySelector('.prompt-optimization-info-tooltip');
  assert.equal(tooltip.hidden, false); assert.equal(tooltip.getAttribute('role'), 'tooltip');
  assert.equal(tooltip.textContent, '「平台默认」会随当前生成模型自动切换对应优化规则。');
  info.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(tooltip.hidden, true); assert.equal(f.controller.isOpen(), true);
});

test('scheme menu navigates with arrows, Home, End and Escape and keeps edits separate from selecting', t => {
  const f = fixture(t); f.open();
  const trigger = f.document.querySelector('[data-action="schemes"]');
  const key = (name) => f.document.activeElement.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
  trigger.focus(); key('ArrowDown');
  const menu = f.document.querySelector('[role="menu"]');
  assert.equal(menu.hidden, false); assert.equal(f.document.activeElement.dataset.configurationChoice, 'default');
  key('ArrowDown'); assert.equal(f.document.activeElement.dataset.configurationChoice, 'cinematic');
  key('ArrowDown'); assert.equal(f.document.activeElement.dataset.configurationEdit, 'cinematic');
  key('End'); assert.equal(f.document.activeElement.dataset.action, 'new-configuration');
  key('Home'); assert.equal(f.document.activeElement.dataset.configurationChoice, 'default');
  assert.equal(menu.querySelector('[data-configuration-edit="default"]'), null);
  key('Escape'); assert.equal(menu.hidden, true); assert.equal(f.document.activeElement, trigger);
  trigger.click(); menu.querySelector('[data-configuration-choice="cinematic"]').click();
  assert.deepEqual(f.calls.at(-1), ['select-configuration', 'cinematic']); assert.equal(menu.hidden, true);
  f.controller.update({ ...f.base, configuration: configuration({ selectedId: 'cinematic' }) });
  assert.equal(f.document.querySelector('[data-scheme-name]').textContent, '叙事镜头'); assert.equal(f.document.querySelector('[data-action="default-info"]').hidden, true);
});

test('new configuration starts blank, remains local across refresh and outside clicks, and commits only on save', async t => {
  const f = fixture(t); f.open({ ...f.base, configuration: configuration({ customInstructions: 'PRIVATE_DEFAULT_INSTRUCTIONS' }) });
  f.document.querySelector('[data-action="schemes"]').click(); f.document.querySelector('[data-action="new-configuration"]').click();
  const panel = f.document.querySelector('.prompt-optimization-configuration-panel');
  const name = f.document.querySelector('[data-configuration-name]'), custom = f.document.querySelector('[data-custom]'), model = f.document.querySelector('[data-configuration-model]');
  assert.equal(panel.hidden, false); assert.equal(custom.value, ''); assert.equal(name.value, ''); assert.equal(model.value, 'seedance'); assert.equal(model.disabled, false);
  name.value = '产品图片'; custom.value = '重点描述材质'; custom.dispatchEvent(new f.window.Event('input', { bubbles: true })); model.value = 'image';
  custom.focus(); custom.setSelectionRange(2, 2);
  f.controller.update({ ...f.base, configuration: configuration({ customInstructions: '应忽略的刷新内容' }) });
  assert.equal(custom.value, '重点描述材质'); assert.equal(model.value, 'image'); assert.equal(f.document.activeElement, custom); assert.equal(custom.selectionStart, 2);
  f.document.querySelector('[data-source]').dispatchEvent(new f.window.Event('pointerdown', { bubbles: true })); assert.equal(panel.hidden, false);
  assert.equal(f.calls.filter(call => call[0] === 'commit-configuration').length, 0);
  const submit = async () => { f.document.querySelector('[data-configuration-form]').dispatchEvent(new f.window.Event('submit', { cancelable: true, bubbles: true })); await Promise.resolve(); await Promise.resolve(); };
  await submit(); assert.equal(panel.hidden, false); assert.equal(name.value, '产品图片');
  f.results.commit = true; await submit();
  assert.deepEqual(f.calls.at(-1), ['commit-configuration', { name: '产品图片', modelId: 'image', customInstructions: '重点描述材质' }]);
  assert.equal(f.calls.some(call => call[0] === 'select-configuration'), false); assert.equal(panel.hidden, true); assert.equal(f.controller.isOpen(), true);
});

test('editing loads only saved custom instructions, locks model, and cancels with Escape without changing scheme', async t => {
  const f = fixture(t); f.open();
  const openEdit = () => { f.document.querySelector('[data-action="schemes"]').click(); f.document.querySelector('[data-configuration-edit="cinematic"]').click(); };
  openEdit();
  const custom = f.document.querySelector('[data-custom]'), model = f.document.querySelector('[data-configuration-model]');
  assert.equal(custom.value, '镜头衔接自然，不新增角色。'); assert.equal(model.disabled, true); assert.equal(model.value, 'seedance');
  custom.value = '尚未保存的编辑'; custom.dispatchEvent(new f.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(f.document.querySelector('.prompt-optimization-configuration-panel').hidden, true); assert.equal(f.controller.isOpen(), true); assert.equal(f.calls.length, 0);
  openEdit(); assert.equal(custom.value, '镜头衔接自然，不新增角色。');
  custom.value = '新的镜头指令'; f.results.commit = true;
  f.document.querySelector('[data-configuration-form]').dispatchEvent(new f.window.Event('submit', { cancelable: true, bubbles: true })); await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(f.calls.at(-1), ['commit-configuration', { id: 'cinematic', name: '叙事镜头', modelId: 'seedance', customInstructions: '新的镜头指令' }]);
});

test('open on another owner clears local forms even for the same model, and processing disables committing', t => {
  const f = fixture(t); f.open();
  const openNew = () => { f.document.querySelector('[data-action="schemes"]').click(); f.document.querySelector('[data-action="new-configuration"]').click(); };
  openNew(); const name = f.document.querySelector('[data-configuration-name]'); name.value = '旧节点草稿';
  f.controller.open(f.base, f.document.querySelector('#trigger'));
  assert.equal(f.document.querySelector('.prompt-optimization-configuration-panel').hidden, true); assert.equal(name.value, '');
  openNew(); f.controller.update({ ...f.base, status: 'processing' });
  for (const selector of ['[data-action="schemes"]', '[data-configuration-name]', '[data-configuration-model]', '[data-custom]', '[data-save-configuration]']) assert.equal(f.document.querySelector(selector).disabled, true);
  f.controller.update({ ...f.base, source: { ...f.base.source, scope: 'node:2' } });
  assert.equal(f.document.querySelector('.prompt-optimization-configuration-panel').hidden, true);
});

test('default label and info share one control group without nesting interactive elements', t => {
  const f = fixture(t); f.open();
  const group = f.document.querySelector('.prompt-optimization-scheme-control');
  const trigger = group.querySelector('[data-action="schemes"]'), info = group.querySelector('[data-action="default-info"]');
  assert.equal(group.getAttribute('role'), 'group'); assert.equal(group.getAttribute('aria-label'), '优化配置');
  assert.equal(trigger.parentElement, info.parentElement); assert.equal(trigger.contains(info), false);
  assert.equal(group.querySelectorAll('button button').length, 0);
  info.click(); assert.equal(f.document.querySelector('.prompt-optimization-info-tooltip').hidden, false);
  assert.equal(f.document.querySelector('.prompt-optimization-scheme-menu').hidden, true, 'the information action does not open the scheme menu');
  trigger.click(); assert.equal(f.document.querySelector('.prompt-optimization-scheme-menu').hidden, false);
  f.controller.update({ ...f.base, configuration: configuration({ selectedId: 'cinematic' }) });
  assert.equal(info.hidden, true); assert.equal(trigger.querySelector('[data-scheme-name]').textContent, '叙事镜头');
});
