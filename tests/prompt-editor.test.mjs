import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { EditorState, TextSelection } from 'prosemirror-state';
import { undo } from 'prosemirror-history';
import '../src/legacy-canvas/canvas-prompt-document.js';
import { createEditor, createSnapshot, replaceSnapshot, CLIPBOARD_TYPE } from '../src/prompt-editor/index.js';
import { toEditorDocument, fromEditorDocument, sliceDocument } from '../src/prompt-editor/schema.js';
import { findMention, filterReferences, placeMentionMenu } from '../src/prompt-editor/mention.js';

const model = globalThis.REELAY_CANVAS_PROMPT_DOCUMENT;
const reference = (key = 'asset:a', mediaType = 'image', label = '图片1') => ({ type: 'reference', key, mediaType, fallbackLabel: label });
const prompt = (...content) => model.normalize({ version: 1, content: content.map((part) => typeof part === 'string' ? { type: 'text', text: part } : part) });
const rawReferences = () => [
  { key: 'asset:a', name: '幽影人物', asset: { type: 'image', url: '/portrait.jpg' } },
  { key: 'asset:b', name: '森林场景', asset: { type: 'image', url: '/forest.jpg' } },
  { key: 'connection:c', name: '走路动作', asset: { type: 'video', url: '/walk.mp4' } },
  { key: 'asset:d', name: '角色配音', asset: { type: 'audio', url: '/voice.mp3' } },
];

function setup(t, overrides = {}) {
  const dom = new JSDOM('<!doctype html><html><body><div id="editor"></div></body></html>', { pretendToBeVisual: true, url: 'http://localhost/' });
  const { window } = dom;
  window.scrollBy = () => {};
  for (const name of ['window', 'document', 'MutationObserver', 'HTMLElement', 'Node', 'getComputedStyle']) globalThis[name] = typeof window[name] === 'function' && name === 'getComputedStyle' ? window[name].bind(window) : window[name];
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: window.navigator });
  window.Range.prototype.getClientRects = () => [{ left: 50, right: 51, top: 50, bottom: 70, width: 1, height: 20 }];
  window.Range.prototype.getBoundingClientRect = () => ({ left: 50, right: 51, top: 50, bottom: 70, width: 1, height: 20 });
  window.HTMLElement.prototype.getBoundingClientRect = () => ({ left: 0, right: 500, top: 0, bottom: 400, width: 500, height: 400 });
  let entries = rawReferences();
  let scope = 'project/canvas/node';
  let isEditable = true;
  const changes = []; const origins = []; const messages = []; let submits = 0;
  const element = window.document.getElementById('editor');
  const options = { element, document: '', getReferences: () => entries, getScope: () => scope, isEditable: () => isEditable,
    getPlaceholder: () => '输入提示词，@ 引用素材', onChange: (doc, metadata) => { changes.push(doc); origins.push(metadata?.origin); }, onMessage: (message) => messages.push(message), onSubmit: () => submits++, ...overrides };
  let editor = createEditor(options);
  editor.focus();
  t.after(() => { editor.destroy(); window.close(); });
  const key = (value, fields = {}) => editor.dom.dispatchEvent(new window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...fields }));
  const type = (text) => editor.view.dispatch(editor.view.state.tr.insertText(text));
  const select = (from, to = from) => editor.view.dispatch(editor.view.state.tr.setSelection(TextSelection.create(editor.view.state.doc, from, to)));
  const clipboard = (kind, data = {}) => {
    const event = new window.Event(kind, { bubbles: true, cancelable: true });
    const values = new Map(Object.entries(data));
    Object.defineProperty(event, 'clipboardData', { value: { getData: (key) => values.get(key) || '', setData: (key, value) => values.set(key, value) } });
    editor.dom.dispatchEvent(event); return values;
  };
  return { window, element, get editor() { return editor; }, type, select, key, clipboard, changes, origins, messages,
    get submits() { return submits; }, set entries(value) { entries = value; }, set scope(value) { scope = value; }, set editable(value) { isEditable = value; },
    remount(snapshot, doc) { editor.destroy(); editor = createEditor({ ...options, document: doc, historyState: snapshot }); editor.focus(); return editor; },
  };
}

test('schema round-trips multiline prose and mixed atomic references without editor HTML', () => {
  const source = prompt('第一行\n让', reference(), '跳舞\n', reference('connection:c', 'video', '视频1'), '\n');
  assert.deepEqual(fromEditorDocument(toEditorDocument(source)), source);
  const selected = sliceDocument(toEditorDocument(prompt('让', reference(), '在森林')), 2, 5);
  assert.deepEqual(model.normalize(selected), prompt(reference(), '在森'));
});

test('mention recognizer accepts adjacent prose and excludes only recognizable email addresses or URLs', () => {
  for (const [text, expected] of [
    ['让@幽影', '幽影'], ['@', ''], ['fegea@', ''], ['123@', ''], ['name@', ''],
    ['邮箱a@b', 'b'], ['a.b@c', 'c'], ['参考 @视频1', '视频1'],
    ['name@example.com', null], ['邮箱name@example.co.uk。', null],
    ['https://a/@b', null], ['https://example.com/@', null], ['www.example.com/@creator', null], ['mailto:name@', null],
  ]) {
    let state = createSnapshot(text, 'scope').state;
    state = state.apply(state.tr.setSelection(TextSelection.atEnd(state.doc)));
    assert.equal(findMention(state)?.query ?? null, expected, text);
  }
  assert.deepEqual(filterReferences(model.referenceIndex(rawReferences()), '视频1').map((entry) => entry.key), ['connection:c']);
});

test('three successive references work after Chinese, English and numeric prose without spaces', (t) => {
  const ctx = setup(t, { submitOnEnter: true });
  for (const prefix of ['让', 'fegea', '123']) {
    ctx.type(`${prefix}@`);
    assert.equal(ctx.element.dataset.referenceMenuOpen, 'true', `menu opens after ${prefix}`);
    ctx.key('Enter');
  }
  const atoms = ctx.editor.getDocument().content.filter((part) => part.type === 'reference');
  assert.equal(atoms.length, 3);
  assert.equal(atoms.every((part) => part.key === 'asset:a'), true, 'same media may be referenced repeatedly');
  assert.equal(ctx.editor.getText(), '让图片1fegea图片1123图片1');
  assert.equal(ctx.submits, 0);
});

test('three adjacent reference atoms can be inserted with repeated @ and no separating prose', (t) => {
  const ctx = setup(t, { submitOnEnter: true });
  for (let index = 0; index < 3; index++) {
    ctx.type('@'); assert.equal(ctx.element.dataset.referenceMenuOpen, 'true'); ctx.key('Enter');
  }
  assert.deepEqual(ctx.editor.getDocument(), prompt(reference(), reference(), reference()));
  assert.equal(ctx.submits, 0);
});

test('typing an address closes the ambiguous name@ menu once a full email domain is present', (t) => {
  const ctx = setup(t); ctx.type('name@'); assert.equal(ctx.element.dataset.referenceMenuOpen, 'true');
  ctx.type('example.com'); assert.equal(ctx.window.document.querySelector('.prompt-reference-menu'), null);
  ctx.type('。'); assert.equal(ctx.window.document.querySelector('.prompt-reference-menu'), null);
  assert.equal(ctx.editor.getText(), 'name@example.com。');
  ctx.type(' https://example.com/@creator');
  assert.equal(ctx.window.document.querySelector('.prompt-reference-menu'), null);
  assert.equal(model.hasReferences(ctx.editor.getDocument()), false);
});

test('menu placement flips at the viewport bottom and clamps narrow viewport width', () => {
  assert.deepEqual(placeMentionMenu({ left: 290, top: 450, bottom: 470 }, { width: 320, height: 500 }, 250), { left: 24, top: 194, width: 288, maxHeight: 250 });
  const narrow = placeMentionMenu({ left: 2, top: 10, bottom: 30 }, { width: 220, height: 400 }, 300);
  assert.equal(narrow.left, 8); assert.equal(narrow.width, 204);
});

test('Chinese @ opens a caret menu and arrows/Enter insert one atom without sending', (t) => {
  const ctx = setup(t, { submitOnEnter: true });
  ctx.type('让@');
  assert.equal(ctx.element.dataset.referenceMenuOpen, 'true');
  assert.equal(ctx.window.document.querySelectorAll('[role="option"]').length, 4);
  ctx.key('ArrowDown'); ctx.key('Enter');
  assert.deepEqual(ctx.editor.getDocument(), prompt('让', reference('asset:b', 'image', '图片2')));
  assert.equal(ctx.submits, 0); assert.equal(ctx.editor.view.state.selection.from, 3);
  assert.equal(ctx.window.document.querySelector('.prompt-reference-menu'), null);
  ctx.type('行动');
  assert.equal(ctx.editor.getText(), '让图片2行动');
});

test('Esc dismisses current query without deleting it or reopening on refresh', (t) => {
  const ctx = setup(t); ctx.type('@'); ctx.key('Escape'); ctx.editor.refresh();
  assert.equal(ctx.editor.getText(), '@');
  assert.equal(ctx.window.document.querySelector('.prompt-reference-menu'), null);
  ctx.type('人物'); assert.equal(ctx.window.document.querySelector('.prompt-reference-menu'), null);
});

test('empty results Enter is consumed, never sent, and Tab leaves selection untouched', (t) => {
  const ctx = setup(t, { submitOnEnter: true }); ctx.type('@不存在');
  assert.equal(ctx.window.document.querySelector('.prompt-reference-menu-empty').textContent, '没有匹配的参考素材');
  ctx.key('Enter'); assert.equal(ctx.submits, 0); assert.equal(ctx.editor.getText(), '@不存在');
  const before = ctx.editor.view.state.selection.from; ctx.key('Tab');
  assert.equal(ctx.editor.view.state.selection.from, before);
  assert.equal(ctx.window.document.querySelector('.prompt-reference-menu'), null);
});

test('empty reference area keeps @ as prose and closes an open menu when its last asset disappears', (t) => {
  const ctx = setup(t);
  ctx.entries = []; ctx.editor.refresh(); ctx.type('@');
  assert.equal(ctx.window.document.querySelector('.prompt-reference-menu'), null);
  ctx.key('Enter');
  assert.equal(ctx.editor.getText(), '@\n', 'ordinary newline is not intercepted by an invisible menu');
  ctx.entries = rawReferences(); ctx.editor.refresh(); ctx.type('@');
  assert.equal(ctx.element.dataset.referenceMenuOpen, 'true');
  ctx.entries = []; ctx.editor.refresh();
  assert.equal(ctx.window.document.querySelector('.prompt-reference-menu'), null);
  assert.equal(ctx.editor.dom.getAttribute('aria-expanded'), 'false');
  assert.equal(ctx.editor.getText(), '@\n@');
});

test('IME composition never chooses a reference or sends while confirming a candidate', async (t) => {
  const ctx = setup(t, { submitOnEnter: true }); ctx.type('@');
  ctx.editor.dom.dispatchEvent(new ctx.window.CompositionEvent('compositionstart', { bubbles: true }));
  ctx.type('幽影'); ctx.key('Enter', { isComposing: true, keyCode: 229 });
  assert.equal(ctx.submits, 0); assert.equal(model.hasReferences(ctx.editor.getDocument()), false);
  ctx.editor.dom.dispatchEvent(new ctx.window.CompositionEvent('compositionend', { bubbles: true }));
  await new Promise((resolve) => ctx.window.setTimeout(resolve, 30));
  assert.equal(ctx.window.document.querySelectorAll('[role="option"]').length, 1);
});

test('Enter submits only in Agent setting and Shift-Enter still inserts a line break', (t) => {
  const ctx = setup(t, { submitOnEnter: true }); ctx.type('第一行'); ctx.key('Enter'); assert.equal(ctx.submits, 1);
  ctx.key('Enter', { shiftKey: true }); ctx.type('第二行'); assert.equal(ctx.editor.getText(), '第一行\n第二行');
});

test('atomic insertion and deletion each undo independently', (t) => {
  const ctx = setup(t); ctx.type('让@'); ctx.key('Enter');
  assert.equal(model.hasReferences(ctx.editor.getDocument()), true);
  ctx.key('Backspace'); assert.equal(ctx.editor.getText(), '让');
  ctx.editor.undo(); assert.equal(model.hasReferences(ctx.editor.getDocument()), true);
  ctx.editor.undo(); assert.equal(ctx.editor.getText(), '让@');
  ctx.editor.redo(); assert.equal(model.hasReferences(ctx.editor.getDocument()), true);
});

test('reference reordering updates pill labels without changing document, selection, scroll or history', (t) => {
  const ctx = setup(t, { document: prompt('角色', reference('asset:b', 'image', '图片2')) });
  ctx.select(3); ctx.editor.dom.scrollTop = 42;
  const before = ctx.editor.getDocument(); const beforeState = ctx.editor.view.state;
  ctx.entries = [rawReferences()[1], rawReferences()[0], ...rawReferences().slice(2)]; ctx.editor.refresh();
  assert.equal(ctx.editor.dom.querySelector('.prompt-reference-label').textContent, '图片1');
  assert.deepEqual(ctx.editor.getDocument(), before); assert.equal(ctx.editor.getText(), '角色图片1');
  assert.equal(ctx.editor.view.state.selection.from, 3); assert.equal(ctx.editor.dom.scrollTop, 42);
  assert.equal(ctx.editor.view.state, beforeState);
});

test('removal shows a missing atom, restoring same key heals only the presentation', (t) => {
  const ctx = setup(t, { document: prompt(reference()) });
  ctx.entries = rawReferences().slice(1); ctx.editor.refresh();
  assert.equal(ctx.editor.dom.querySelector('.prompt-reference').classList.contains('is-missing'), true);
  assert.equal(ctx.editor.dom.querySelector('.prompt-reference-label').textContent, '图片1 · 已移除');
  ctx.entries = rawReferences(); ctx.editor.refresh();
  assert.equal(ctx.editor.dom.querySelector('.prompt-reference').classList.contains('is-missing'), false);
  assert.deepEqual(ctx.editor.getDocument(), prompt(reference())); assert.equal(ctx.changes.length, 0);
});

test('same-scope clipboard keeps atoms, cross-scope clipboard becomes plain text with a notice', (t) => {
  const ctx = setup(t, { document: prompt('让', reference(), '跳舞') }); ctx.select(1, 5);
  const copied = ctx.clipboard('copy'); assert.equal(copied.get('text/plain'), '让图片1跳舞');
  ctx.select(5); ctx.clipboard('paste', Object.fromEntries(copied));
  assert.equal(ctx.editor.getDocument().content.filter((part) => part.type === 'reference').length, 2);
  const payload = JSON.parse(copied.get(CLIPBOARD_TYPE)); payload.scope = 'other/node';
  ctx.clipboard('paste', { 'text/plain': copied.get('text/plain'), [CLIPBOARD_TYPE]: JSON.stringify(payload) });
  assert.equal(ctx.editor.getDocument().content.filter((part) => part.type === 'reference').length, 2);
  assert.equal(ctx.messages.length, 1);
});

test('external paste accepts only plain text and never auto-interprets @ or HTML as identity', (t) => {
  const ctx = setup(t); ctx.clipboard('paste', { 'text/plain': '参考@图片1\n下一行', 'text/html': '<span data-reference-key="asset:a">图片1</span>' });
  assert.equal(ctx.editor.getText(), '参考@图片1\n下一行');
  assert.equal(model.hasReferences(ctx.editor.getDocument()), false);
  assert.equal(ctx.window.document.querySelector('.prompt-reference-menu'), null);
});

test('editor snapshot survives unmount and continues the same undo history', (t) => {
  const ctx = setup(t); ctx.type('原文'); ctx.editor.setDocument(prompt('优化后', reference()), { addToHistory: true, notify: true });
  const snapshot = ctx.editor.snapshotState(); ctx.remount(snapshot, ctx.editor.getDocument());
  assert.equal(snapshot.state.plugins.length, 1, 'snapshot keeps history only, without mounted-view keymap closures');
  ctx.editor.undo(); assert.equal(ctx.editor.getText(), '原文');
  ctx.editor.redo(); assert.equal(ctx.editor.getText(), '优化后图片1');
});

test('background snapshot replacement is undoable without creating a DOM editor', () => {
  const before = createSnapshot('原文', 'scope');
  const after = replaceSnapshot(before, prompt('优化', reference()), { addToHistory: true });
  let restored; assert.equal(undo(after.state, (transaction) => { restored = after.state.apply(transaction); }), true);
  assert.deepEqual(fromEditorDocument(restored.doc), prompt('原文'));
  assert.deepEqual(fromEditorDocument(before.state.doc), prompt('原文'));
});

test('readonly and stale scopes refuse keyboard, paste and menu insertion mutations', (t) => {
  const ctx = setup(t, { document: '原文' }); ctx.editable = false; ctx.editor.refresh();
  ctx.clipboard('paste', { 'text/plain': '改文' }); assert.equal(ctx.editor.getText(), '原文');
  assert.equal(ctx.editor.insertReference('asset:a'), false);
  ctx.editable = true; ctx.scope = 'other/node'; ctx.type('不应写入');
  assert.equal(ctx.editor.getText(), '原文'); assert.equal(ctx.editor.setDocument('也不应写入'), false);
});

test('length overflow rejects the transaction atomically rather than desynchronizing DOM and document', (t) => {
  const ctx = setup(t, { document: 'a'.repeat(19999) }); ctx.select(20000); ctx.type('bc');
  assert.equal(ctx.editor.getText().length, 19999); assert.equal(ctx.messages.length, 1); assert.equal(ctx.changes.length, 0);
});

test('reference count limit rejects the complete insertion and preserves existing atoms', (t) => {
  const ctx = setup(t, { document: prompt(...Array.from({ length: 512 }, () => reference())) });
  ctx.select(513); ctx.editor.insertReference('asset:a');
  assert.equal(ctx.editor.getDocument().content.length, 512); assert.equal(ctx.messages.length, 1);
});

test('setDocument preserves host reading position and revealReference emits keyboard preview intent', (t) => {
  const ctx = setup(t, { document: prompt('第一行\n', reference()) });
  ctx.element.scrollTop = 98;
  ctx.editor.setDocument(prompt('替换行\n', reference()), { addToHistory: true });
  assert.equal(ctx.element.scrollTop, 98);
  const events = [];
  ctx.element.addEventListener('reference-preview-request', (event) => events.push(event.detail.open));
  assert.equal(ctx.editor.revealReference('asset:a'), true);
  assert.equal(ctx.editor.view.state.selection.node.type.name, 'reference');
  assert.deepEqual(events, [true]);
  ctx.select(1); assert.deepEqual(events, [true, false]);
});

test('sending resets undo and redo history without remounting the prompt DOM', (t) => {
  const ctx = setup(t); ctx.type('第一份草稿');
  const dom = ctx.editor.dom; const notifications = ctx.changes.length;
  ctx.editor.setDocument('', { resetHistory: true, notify: false });
  assert.equal(ctx.editor.dom, dom); assert.equal(ctx.editor.getText(), '');
  assert.equal(ctx.editor.undo(), false); assert.equal(ctx.editor.redo(), false);
  assert.equal(ctx.changes.length, notifications);
  ctx.type('下一份草稿'); assert.equal(ctx.editor.undo(), true); assert.equal(ctx.editor.getText(), '');
  assert.equal(ctx.editor.undo(), false);
});

test('resetHistory clears a redo branch even when the replacement document is unchanged', (t) => {
  const ctx = setup(t); ctx.type('发送过的内容'); ctx.editor.undo();
  assert.equal(ctx.editor.getText(), '');
  ctx.editor.setDocument('', { resetHistory: true, notify: false });
  assert.equal(ctx.editor.redo(), false); assert.equal(ctx.editor.getText(), '');
});

test('keyboard and API history commands report precise undo/redo origins', (t) => {
  const ctx = setup(t); ctx.type('草稿');
  ctx.key('z', { ctrlKey: true }); assert.equal(ctx.origins.at(-1), 'undo');
  ctx.key('y', { ctrlKey: true }); assert.equal(ctx.origins.at(-1), 'redo');
  ctx.editor.undo(); assert.equal(ctx.origins.at(-1), 'undo');
  ctx.editor.redo(); assert.equal(ctx.origins.at(-1), 'redo');
  ctx.editor.restoreState(ctx.editor.snapshotState()); assert.equal(ctx.origins.at(-1), 'history');
});

test('each background optimization remains an independent history transaction', () => {
  const first = replaceSnapshot(createSnapshot('原文', 'scope'), prompt('优化一', reference()), { addToHistory: true });
  const second = replaceSnapshot(first, prompt('优化二', reference()), { addToHistory: true });
  let state = second.state;
  assert.equal(undo(state, (transaction) => { state = state.apply(transaction); }), true);
  assert.deepEqual(fromEditorDocument(state.doc), prompt('优化一', reference()));
  assert.equal(undo(state, (transaction) => { state = state.apply(transaction); }), true);
  assert.deepEqual(fromEditorDocument(state.doc), prompt('原文'));
});
