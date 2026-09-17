import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const sources = await Promise.all([
  "../src/config/inspiration-catalog.js",
  "../src/legacy-canvas/canvas-inspiration-view.js",
  "../src/legacy-canvas/canvas-inspiration-controller.js",
].map((path) => readFile(new URL(path, import.meta.url), "utf8")));

function setup(t, { writable = true, onUse, copyText } = {}) {
  const dom = new JSDOM('<!doctype html><body><button id="trigger">参考片段</button></body>', { runScripts: "outside-only" });
  const { window } = dom;
  const { document } = window;
  let scope = { workspaceId: "space-1", projectId: "project-1", canvasId: "main" };
  let allowed = writable;
  const calls = [];
  const afterCalls = [];
  const copied = [];
  const mediaCalls = { pause: 0, load: 0, play: 0 };
  const jobs = new Map();
  let nextJob = 0;
  window.HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
  window.HTMLDialogElement.prototype.close = function close() { this.open = false; };
  window.HTMLMediaElement.prototype.pause = function pause() { mediaCalls.pause += 1; };
  window.HTMLMediaElement.prototype.load = function load() { mediaCalls.load += 1; };
  window.HTMLMediaElement.prototype.play = function play() { mediaCalls.play += 1; return Promise.resolve(); };
  sources.forEach((source) => window.eval(source));
  const catalog = window.REELAY_INSPIRATION_CATALOG;
  const controller = window.REELAY_CANVAS_INSPIRATION_CONTROLLER.create({
    document, catalog, view: window.REELAY_CANVAS_INSPIRATION_VIEW,
    getScope: () => scope, canUse: () => allowed,
    onUse: (kind, values) => { calls.push({ kind, values }); return onUse?.(kind, values); },
    copyText: async (text) => { copied.push(text); return copyText?.(text); },
    afterUse: (kind) => afterCalls.push(kind),
    schedule: (callback, delay) => { const id = ++nextJob; jobs.set(id, { callback, delay }); return id; },
    cancelScheduled: (id) => jobs.delete(id),
  });
  const trigger = document.querySelector("#trigger");
  const clip = catalog.clips[0];
  t.after(() => { controller.destroy(); window.close(); });
  return {
    window, document, controller, catalog, calls, copied, afterCalls, mediaCalls, trigger, clip,
    jobs,
    finishAnalysis: () => { for (const [id, job] of [...jobs]) { jobs.delete(id); job.callback(); } },
    open: () => { trigger.focus(); assert.equal(controller.open(clip.id, trigger), true); return document.querySelector("dialog"); },
    setWritable: (value) => { allowed = value; },
    changeScope: () => { scope = { ...scope, canvasId: "other-canvas" }; },
  };
}

function setField(context, dialog, selector, value) {
  const input = dialog.querySelector(selector);
  input.value = String(value);
  input.dispatchEvent(new context.window.Event("input", { bubbles: true }));
}

function analyze(context, dialog) {
  dialog.querySelector("[data-inspiration-analyze]").click();
  context.finishAnalysis();
  assert.equal(dialog.querySelector("[data-inspiration-results]").hidden, false);
  return context.catalog.getAnalysis({ clip: context.clip, start: dialog.querySelector("[data-inspiration-start]").valueAsNumber, end: dialog.querySelector("[data-inspiration-end]").valueAsNumber });
}
function editPrompt(context, dialog, value) {
  dialog.querySelector('[data-inspiration-result-tab="prompt"]').click();
  setField(context, dialog, '[data-inspiration-prompt]', value);
}

test("invalid ranges block analysis; copying is unavailable until a valid result exists", (t) => {
  const c = setup(t); const d = c.open();
  assert.equal(d.querySelector('[data-inspiration-action="copy"]').disabled, true);
  for (const [start, end] of [[4, 2], [-1, 5], [0, 12], [2, 2], ["", 5]]) {
    setField(c, d, '[data-inspiration-start]', start); setField(c, d, '[data-inspiration-end]', end);
    d.querySelector('[data-inspiration-analyze]').click();
    assert.match(d.querySelector('[data-inspiration-error]').textContent, /有效时间段/);
    assert.equal(d.querySelector('[data-inspiration-results]').hidden, true);
    assert.equal(c.calls.length, 0);
  }
  setField(c, d, '[data-inspiration-start]', 0); setField(c, d, '[data-inspiration-end]', 5);
  analyze(c, d);
  assert.equal(d.querySelector('[data-inspiration-action="copy"]').disabled, false);
});

test("read-only viewers can analyze, play and copy without writing a canvas", (t) => {
  const c = setup(t, { writable: false }); const d = c.open();
  analyze(c, d);
  assert.equal(d.querySelectorAll('[data-inspiration-action]:disabled').length, 1);
  d.querySelectorAll('[data-inspiration-action]').forEach((button) => button.click());
  assert.equal(c.calls.length, 0);
  assert.equal(c.copied.length, 1);
  assert.equal(d.querySelector('[data-inspiration-play-range]').disabled, false);
});

test("pending clipboard feedback cannot follow changed prompts or a closed session", async (t) => {
  const pending = [];
  const c = setup(t, { copyText: () => new Promise((resolve, reject) => pending.push({ resolve, reject })) });
  const d = c.open(); analyze(c, d); editPrompt(c, d, '旧提示词');
  const action = d.querySelector('[data-inspiration-action="copy"]');
  action.click(); assert.equal(action.disabled, true); assert.equal(action.textContent, '复制中');
  editPrompt(c, d, '新提示词');
  pending[0].resolve(); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(action.textContent, '复制提示词');
  action.click(); c.controller.close(); const next = c.open();
  pending[1].reject(new Error('Previous permission request failed'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(next.querySelector('[data-inspiration-error]').hidden, true);
  assert.equal(next.querySelector('[data-inspiration-action="copy"]').textContent, '复制提示词');
});

test("scope or permission invalidation closes the dialog and clears remembered analysis", (t) => {
  const c = setup(t); let d = c.open(); analyze(c, d);
  c.controller.close(); c.changeScope(); c.controller.syncContext(); d = c.open();
  assert.equal(d.querySelector('[data-inspiration-results]').hidden, true);
  analyze(c, d); c.setWritable(false);
  d.querySelector('[data-inspiration-action="copy"]').click();
  assert.equal(c.calls.length, 0); assert.equal(d.isConnected, false);
  c.setWritable(true); d = c.open();
  assert.equal(d.querySelector('[data-inspiration-results]').hidden, true);
});

test("analysis and shot selection retain the video while shot playback stops at its own end", async (t) => {
  const c = setup(t); const d = c.open(); const video = d.querySelector('video');
  video.currentTime = 1.5; const result = analyze(c, d);
  assert.equal(d.querySelector('video'), video); assert.equal(video.currentTime, 1.5);
  const shot = result.shots[0];
  d.querySelector(`[data-inspiration-shot="${shot.id}"]`).click(); await Promise.resolve();
  assert.equal(video.currentTime, shot.start); assert.equal(c.mediaCalls.play, 1);
  video.currentTime = shot.end + .1; video.dispatchEvent(new c.window.Event('timeupdate'));
  assert.equal(video.currentTime, shot.end); assert.equal(c.mediaCalls.pause, 1);
  assert.equal(d.querySelector('[data-inspiration-start]').valueAsNumber, 0);
  assert.equal(d.querySelector('[data-inspiration-end]').valueAsNumber, c.clip.duration);
});

test("range playback and marking use relative time without requiring analysis", async (t) => {
  const c = setup(t); const d = c.open(); const video = d.querySelector('video');
  video.currentTime = 2.34; d.querySelector('[data-inspiration-mark="start"]').click();
  assert.equal(d.querySelector('[data-inspiration-start]').value, '2.3');
  setField(c, d, '[data-inspiration-end]', 4.6);
  d.querySelector('[data-inspiration-play-range]').click(); await Promise.resolve();
  assert.equal(video.currentTime, 2.3);
  video.currentTime = 4.9; video.dispatchEvent(new c.window.Event('timeupdate'));
  assert.equal(video.currentTime, 4.6); assert.equal(c.mediaCalls.pause, 1);
  assert.match(d.querySelector('[data-inspiration-range-label]').textContent, /00:02\.3/);
});

test("range changes retain the edited prompt but invalidate use until explicit replacement", (t) => {
  const c = setup(t); const d = c.open(); analyze(c, d);
  editPrompt(c, d, '只借鉴运镜，替换为我的主角');
  setField(c, d, '[data-inspiration-end]', 5);
  assert.equal(d.querySelector('[data-inspiration-action="copy"]').disabled, true);
  d.querySelector('[data-inspiration-analyze]').click();
  assert.equal(d.querySelector('[data-inspiration-replace-confirm]').hidden, false);
  d.querySelector('[data-inspiration-replace-cancel]').click();
  assert.equal(d.querySelector('[data-inspiration-prompt]').value, '只借鉴运镜，替换为我的主角');
  d.querySelector('[data-inspiration-analyze]').click();
  d.querySelector('[data-inspiration-replace-confirm-button]').click();
  c.finishAnalysis();
  assert.equal(d.querySelector('[data-inspiration-action="copy"]').disabled, false);
  d.querySelector('[data-inspiration-result-tab="prompt"]').click();
  assert.notEqual(d.querySelector('[data-inspiration-prompt]').value, '只借鉴运镜，替换为我的主角');
  d.querySelector('[data-inspiration-action="copy"]').click();
  assert.equal(c.copied[0], d.querySelector('[data-inspiration-prompt]').value);
  assert.equal(c.calls.length, 0);
});

test("tabs preserve their DOM and scroll; shot prompts are independent of the whole range", (t) => {
  const c = setup(t); const d = c.open(); const result = analyze(c, d);
  editPrompt(c, d, '可编辑的创作草稿');
  const textarea = d.querySelector('[data-inspiration-prompt]');
  textarea.scrollTop = 70;
  d.querySelector('[data-inspiration-result-tab="analysis"]').click();
  d.querySelector('[data-inspiration-result-tab="prompt"]').click();
  assert.equal(d.querySelector('[data-inspiration-prompt]'), textarea);
  assert.equal(textarea.scrollTop, 70);
  d.querySelector(`[data-inspiration-shot="${result.shots[0].id}"]`).click();
  editPrompt(c, d, '单镜头动作提示');
  d.querySelector('[data-inspiration-result-tab="analysis"]').click();
  const tab = d.querySelector('[data-inspiration-result-tab="analysis"]');
  tab.dispatchEvent(new c.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.equal(c.document.activeElement.dataset.inspirationResultTab, 'prompt');
  assert.equal(d.querySelector('[data-inspiration-prompt]').value, '单镜头动作提示');
  d.querySelector('[data-inspiration-shot=""]').click();
  assert.equal(d.querySelector('[data-inspiration-prompt]').value, '可编辑的创作草稿');
});

test("closing and reopening retains range, analysis, prompt and active shot within this canvas", (t) => {
  const c = setup(t); let d = c.open();
  setField(c, d, '[data-inspiration-start]', 1); setField(c, d, '[data-inspiration-end]', 5);
  analyze(c, d); editPrompt(c, d, '保留本次修改');
  c.controller.close(); d = c.open();
  assert.equal(d.querySelector('[data-inspiration-start]').value, '1');
  assert.equal(d.querySelector('[data-inspiration-end]').value, '5');
  assert.equal(d.querySelector('[data-inspiration-prompt]').value, '保留本次修改');
  assert.equal(d.querySelector('[data-inspiration-results]').hidden, false);
  c.controller.open(c.catalog.clips[1].id);
  assert.equal(c.document.querySelector('[data-inspiration-results]').hidden, true);
  d = c.open(); assert.equal(d.querySelector('[data-inspiration-prompt]').value, '保留本次修改');
});

test("Escape cancels replacement first, then closes and releases media with focus restored", (t) => {
  const c = setup(t); const d = c.open(); const video = d.querySelector('video');
  analyze(c, d); editPrompt(c, d, '保留'); d.querySelector('[data-inspiration-analyze]').click();
  d.dispatchEvent(new c.window.Event('cancel', { cancelable: true }));
  assert.equal(d.open, true); assert.equal(d.querySelector('[data-inspiration-replace-confirm]').hidden, true);
  d.dispatchEvent(new c.window.Event('cancel', { cancelable: true }));
  assert.equal(d.isConnected, false); assert.equal(video.hasAttribute('src'), false);
  assert.equal(c.mediaCalls.load, 1); assert.equal(c.document.activeElement, c.trigger);
  video.dispatchEvent(new c.window.Event('error')); assert.equal(d.querySelector('[data-inspiration-media-error]').hidden, true);
});

test("empty prompt blocks copy; clipboard failure preserves edits and success stays in the dialog", async (t) => {
  let attempt = 0;
  const c = setup(t, { copyText: () => { if (++attempt === 1) throw new Error('Denied'); } });
  const d = c.open(); analyze(c, d);
  editPrompt(c, d, ''); assert.equal(d.querySelector('[data-inspiration-action="copy"]').disabled, true);
  editPrompt(c, d, '替换为我的主角'); const action = d.querySelector('[data-inspiration-action="copy"]'); action.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(d.isConnected, true); assert.equal(d.querySelector('[data-inspiration-prompt]').value, '替换为我的主角');
  assert.match(d.querySelector('[data-inspiration-error]').textContent, /未能复制/);
  action.click(); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(d.isConnected, true); assert.equal(action.textContent, '已复制');
  assert.deepEqual(c.copied, ['替换为我的主角', '替换为我的主角']);
  assert.equal(c.calls.length, 0); assert.deepEqual(c.afterCalls, []);
  editPrompt(c, d, '新修改'); assert.equal(action.textContent, '复制提示词');
});

test("media failure keeps analysis readable but never re-enables playback or use", (t) => {
  const c = setup(t); const d = c.open(); analyze(c, d);
  d.querySelector('video').dispatchEvent(new c.window.Event('error'));
  editPrompt(c, d, '继续编辑'); setField(c, d, '[data-inspiration-end]', 4);
  assert.equal(d.querySelector('[data-inspiration-action="copy"]').disabled, true);
  assert.equal(d.querySelector('[data-inspiration-analyze]').disabled, true);
  assert.equal(d.querySelector('[data-inspiration-action="canvas"]').disabled, true);
  assert.equal(d.querySelector('[data-inspiration-play-range]').disabled, true);
});

test("false adapter result preserves the dialog and canvas use sends the original clip", (t) => {
  let successful = false; const c = setup(t, { onUse: () => successful }); const d = c.open();
  d.querySelector('[data-inspiration-action="canvas"]').click(); assert.equal(d.isConnected, true);
  successful = true; d.querySelector('[data-inspiration-action="canvas"]').click();
  assert.equal(c.calls[1].values.clip, c.clip); assert.equal(d.isConnected, false);
  assert.equal(c.document.activeElement, c.trigger); assert.deepEqual(c.afterCalls, ['canvas']);
});

test("destroy closes the session and rejects later opens", (t) => {
  const c = setup(t); const d = c.open(); c.controller.destroy();
  assert.equal(d.isConnected, false); assert.equal(c.controller.open(c.clip.id), false);
});

test("an old rejected play promise cannot clear the latest range boundary", async (t) => {
  const c = setup(t); const d = c.open(); const video = d.querySelector('video');
  let rejectFirst;
  let attempt = 0;
  video.play = () => ++attempt === 1 ? new Promise((resolve, reject) => { rejectFirst = reject; }) : Promise.resolve();
  setField(c, d, '[data-inspiration-start]', 1); setField(c, d, '[data-inspiration-end]', 3);
  d.querySelector('[data-inspiration-play-range]').click();
  setField(c, d, '[data-inspiration-end]', 4);
  d.querySelector('[data-inspiration-play-range]').click();
  rejectFirst(new Error('Interrupted by pause')); await Promise.resolve(); await Promise.resolve();
  video.currentTime = 4.5; video.dispatchEvent(new c.window.Event('timeupdate'));
  assert.equal(video.currentTime, 4);
  assert.equal(d.querySelector('[data-inspiration-error]').hidden, true);
});

test("permission upgrades enable use without losing an inspected result", (t) => {
  const c = setup(t, { writable: false }); const d = c.open(); analyze(c, d);
  c.setWritable(true); c.controller.syncContext();
  assert.equal(d.querySelector('[data-inspiration-action="canvas"]').disabled, false);
  assert.equal(d.querySelector('[data-inspiration-action="copy"]').disabled, false);
});


test("simulated analysis is delayed, single flight, and cancelled by range changes", (t) => {
  const c = setup(t); const d = c.open();
  const button = d.querySelector('[data-inspiration-analyze]');
  button.click();
  assert.equal(button.disabled, true);
  assert.equal(button.getAttribute('aria-busy'), 'true');
  assert.equal(button.textContent, '分析中');
  assert.equal(d.querySelector('[data-inspiration-results]').hidden, true);
  assert.equal([...c.jobs.values()][0].delay, 2200);
  const old = [...c.jobs.values()][0].callback;
  button.click(); assert.equal(c.jobs.size, 1);
  setField(c, d, '[data-inspiration-end]', 5);
  assert.equal(c.jobs.size, 0); assert.equal(button.disabled, false);
  old(); assert.equal(d.querySelector('[data-inspiration-results]').hidden, true);
  analyze(c, d);
  assert.equal(button.getAttribute('aria-busy'), 'false');
});

test("pending analysis cannot reopen closed dialogs, cross scopes, or survive media failure", (t) => {
  const c = setup(t);
  for (const invalidate of [() => c.controller.close(), () => { c.changeScope(); c.controller.syncContext(); },
    () => { c.setWritable(false); c.controller.syncContext(); }, () => c.controller.destroy()]) {
    c.setWritable(true); const d = c.open();
    d.querySelector('[data-inspiration-analyze]').click();
    const old = [...c.jobs.values()][0].callback;
    invalidate(); old();
    assert.equal(c.document.querySelector('dialog'), null);
    assert.equal(c.jobs.size, 0);
  }
});

test("media failure cancels processing and retains copyable edited text", (t) => {
  const c = setup(t); const d = c.open(); analyze(c, d);
  editPrompt(c, d, '保留我的编辑');
  d.querySelector('[data-inspiration-analyze]').click();
  d.querySelector('[data-inspiration-replace-confirm-button]').click();
  assert.equal(d.querySelector('[data-inspiration-prompt]').disabled, true);
  const old = [...c.jobs.values()][0].callback;
  d.querySelector('video').dispatchEvent(new c.window.Event('error'));
  old();
  assert.equal(d.querySelector('[data-inspiration-prompt]').value, '保留我的编辑');
  assert.equal(c.jobs.size, 0);
  assert.equal(d.querySelector('[data-inspiration-analyze]').getAttribute('aria-busy'), 'false');
  assert.equal(d.querySelector('[data-inspiration-action="copy"]').disabled, false);
});


test("selected shot prompts retain independent edits on reopen and copy only the selected text", (t) => {
  const c = setup(t); let d = c.open();
  setField(c, d, '[data-inspiration-start]', 0.5);
  const result = analyze(c, d); const shot = result.shots[0];
  editPrompt(c, d, '整段镜头串联');
  d.querySelector(`[data-inspiration-shot="${shot.id}"]`).click();
  editPrompt(c, d, '单镜头侧向跟拍');
  c.controller.close(); d = c.open();
  assert.equal(d.querySelector('[data-inspiration-prompt]').value, '单镜头侧向跟拍');
  d.querySelector('[data-inspiration-shot=""]').click();
  assert.equal(d.querySelector('[data-inspiration-prompt]').value, '整段镜头串联');
  d.querySelector(`[data-inspiration-shot="${shot.id}"]`).click();
  d.querySelector('[data-inspiration-action="copy"]').click();
  assert.deepEqual(c.copied, ['单镜头侧向跟拍']);
  assert.equal(c.calls.length, 0);
});
