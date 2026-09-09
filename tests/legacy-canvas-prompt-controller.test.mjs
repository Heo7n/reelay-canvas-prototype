import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const modelSource = readFileSync(new URL('../src/legacy-canvas/canvas-prompt-document.js', import.meta.url), 'utf8');
const controllerSource = readFileSync(new URL('../src/legacy-canvas/canvas-prompt-controller.js', import.meta.url), 'utf8');

function setup(t, { lazy = false } = {}) {
  const dom = new JSDOM('<html><body><div id="one"></div><div id="two"></div></body></html>');
  t.after(() => dom.window.close());
  const context = vm.createContext({ console }); vm.runInContext(modelSource, context); vm.runInContext(controllerSource, context);
  const model = context.REELAY_CANVAS_PROMPT_DOCUMENT;
  const instances = [];
  const engine = {
    createSnapshot: (document, scope) => ({ document: model.normalize(document), scope, history: [] }),
    replaceSnapshot: (snapshot, document) => ({ ...snapshot, document: model.normalize(document), history: [...snapshot.history, snapshot.document] }),
    createEditor(options) {
      let doc = model.normalize(options.document); let history = options.historyState?.history || [];
      const editor = { options, destroyed: false, focused: false,
        getDocument: () => doc, refresh() {}, focus() { this.focused = true; }, blur() { this.focused = false; },
        setDocument(value, settings = {}) { if (settings.resetHistory) history = []; else if (settings.addToHistory) history = [...history, doc]; doc = model.normalize(value); },
        snapshotState: () => ({ document: doc, scope: options.getScope(), history }),
        restoreState(snapshot) { doc = snapshot.document; history = snapshot.history; options.onChange(doc, { origin: 'history' }); },
        destroy() { this.destroyed = true; },
      }; instances.push(editor); return editor;
    },
  };
  if (!lazy) context.REELAY_PROMPT_EDITOR = engine;
  const controller = context.REELAY_CANVAS_PROMPTS.createController({ document: dom.window.document });
  t.after(() => controller.destroy());
  let document = '原文'; let scope = 'canvas/node'; let readsAllowed = true; const changes = [];
  const owner = {};
  const options = () => ({ scope, readDocument: () => { assert.equal(readsAllowed, true, 'detached UI read callback must not run'); return document; }, getReferences: () => [], isCurrent: () => true,
    isEditable: () => true, getPlaceholder: () => '', onChange(value, meta) { changes.push({ value, meta }); document = value; } });
  return { context, dom, model, controller, engine, instances, owner, options, changes,
    one: dom.window.document.getElementById('one'), two: dom.window.document.getElementById('two'),
    set readsAllowed(value) { readsAllowed = value; }, set document(value) { document = value; }, set scope(value) { scope = value; },
    async finishLoad() { context.REELAY_PROMPT_EDITOR = engine; dom.window.document.querySelector('script').onload(); await Promise.resolve(); await Promise.resolve(); },
  };
}

test('detaching releases mounted callbacks; offline optimize/restore/clear-history use document snapshots', (t) => {
  const ctx = setup(t); ctx.controller.mount(ctx.owner, ctx.one, ctx.options());
  const before = ctx.controller.replace(ctx.owner, '优化一'); ctx.document = '优化一';
  ctx.controller.unmount(ctx.owner); ctx.readsAllowed = false;
  assert.equal(ctx.instances[0].destroyed, true);
  ctx.controller.replace(ctx.owner, '后台优化'); ctx.controller.restore(ctx.owner, before); ctx.controller.clearHistory(ctx.owner);
  ctx.instances[0].options.onChange('迟到回调'); assert.equal(ctx.changes.length, 0);
  ctx.readsAllowed = true; ctx.document = '原文'; ctx.controller.mount(ctx.owner, ctx.two, ctx.options());
  assert.equal(ctx.model.toText(ctx.instances[1].options.historyState.document), '原文');
  assert.equal(ctx.instances[1].options.historyState.history.length, 0);
});

test('callbacks from an old mount cannot edit or blur a replacement editor for the same owner', (t) => {
  const ctx = setup(t); ctx.controller.mount(ctx.owner, ctx.one, ctx.options()); const old = ctx.instances[0];
  ctx.controller.mount(ctx.owner, ctx.two, ctx.options()); ctx.controller.focus(ctx.owner);
  old.options.onChange('旧编辑器内容'); old.options.onEscape();
  assert.equal(ctx.changes.length, 0); assert.equal(ctx.instances[1].focused, true);
});

test('async editor load cannot install a detached host and installs only the newest mount', async (t) => {
  const ctx = setup(t, { lazy: true }); ctx.controller.mount(ctx.owner, ctx.one, ctx.options());
  ctx.controller.mount(ctx.owner, ctx.two, ctx.options()); await ctx.finishLoad();
  assert.equal(ctx.instances.length, 1); assert.equal(ctx.instances[0].options.element, ctx.two);
  assert.equal(ctx.controller.get(ctx.owner), ctx.instances[0]);
});

test('switching scope for the same owner discards old history and stale callbacks', (t) => {
  const ctx = setup(t); ctx.controller.mount(ctx.owner, ctx.one, ctx.options());
  ctx.controller.replace(ctx.owner, '别的画布旧文'); const old = ctx.instances[0];
  ctx.scope = 'other-canvas/node'; ctx.document = '新文'; ctx.controller.mount(ctx.owner, ctx.one, ctx.options());
  assert.equal(ctx.instances[1].options.historyState, null);
  old.options.onChange('串写'); assert.equal(ctx.changes.length, 0);
  ctx.controller.unmount(ctx.owner);
  assert.equal(ctx.controller.restore(ctx.owner, { scope: 'canvas/node', document: ctx.model.normalize('旧作用域'), history: [] }), false);
});

test('undo and redo preserve the canvas optimization marker bridge', (t) => {
  const ctx = setup(t); ctx.controller.mount(ctx.owner, ctx.one, ctx.options());
  const action = { before: '原文', after: '优化' }; ctx.controller.linkHistory(ctx.owner, action);
  ctx.document = '优化'; ctx.instances[0].options.onChange(ctx.model.normalize('原文'), { origin: 'undo' });
  assert.equal(ctx.changes.at(-1).meta.historyAction, action);
  ctx.instances[0].options.onChange(ctx.model.normalize('优化'), { origin: 'redo' });
  assert.equal(ctx.changes.at(-1).meta.historyAction, action);
});
