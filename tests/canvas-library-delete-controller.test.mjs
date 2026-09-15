import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { JSDOM } from "jsdom";

const context = vm.createContext({});
new vm.Script(await readFile(new URL("../src/legacy-canvas/canvas-library-delete-controller.js", import.meta.url), "utf8")).runInContext(context);
const factory = context.REELAY_CANVAS_LIBRARY_DELETE_CONTROLLER.createLibraryDeleteController;
function harness(remove = async () => ({ entries: [] })) {
  let scope = "canvas-a:personal";
  let allowed = true;
  let confirmation;
  let dismissed = 0;
  const calls = [], deleted = [], notices = [];
  const controller = factory({ getScopeKey: () => scope, canDelete: () => allowed,
    confirm(input) { confirmation = input; return () => { dismissed++; input.onCancel(); }; },
    remove(input) { calls.push(input); return remove(input); },
    onDeleted(...values) { deleted.push(values); }, notify(value) { notices.push(value); },
  });
  return { controller, calls, deleted, notices, get confirmation() { return confirmation; }, get dismissed() { return dismissed; },
    changeScope() { scope = "canvas-b:organization"; }, revoke() { allowed = false; } };
}
const selection = () => ({ space: "personal", items: [{ kind: "media", id: "media-1" }, { kind: "entity", id: "group-1", expectedVersion: 3 }] });

test("delete captures the exact mixed selection and writes only after confirmation", async () => {
  const h = harness();
  const input = selection();
  h.controller.open(input);
  input.items[0].id = "unrelated";
  assert.equal(h.calls.length, 0);
  await h.confirmation.onConfirm();
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls[0])), selection());
  assert.equal(h.deleted.length, 1);
  assert.equal(h.notices.length, 1);
});

test("failed deletion leaves confirmation retryable and never removes local entries", async () => {
  let fail = true;
  const h = harness(async () => { if (fail) throw new Error("素材仍被组引用"); return {}; });
  h.controller.open(selection());
  await assert.rejects(h.confirmation.onConfirm(), /引用/);
  assert.equal(h.deleted.length, 0);
  assert.equal(h.notices.length, 0);
  fail = false;
  await h.confirmation.onConfirm();
  assert.equal(h.deleted.length, 1);
});

test("cancel and changed ownership prevent stale confirmation from writing", async () => {
  for (const invalidate of [h => h.confirmation.onCancel(), h => h.changeScope(), h => h.revoke()]) {
    const h = harness();
    h.controller.open(selection());
    invalidate(h);
    await assert.rejects(h.confirmation.onConfirm(), /权限已变化/);
    assert.equal(h.calls.length, 0);
  }
});

test("in-flight requests block a second deletion and never clear a new canvas selection", async () => {
  let resolve;
  const h = harness(() => new Promise(r => { resolve = r; }));
  h.controller.open(selection());
  const pending = h.confirmation.onConfirm();
  assert.equal(h.controller.open(selection()), false);
  h.changeScope();
  h.controller.syncContext();
  assert.equal(h.dismissed, 1);
  resolve({});
  await pending;
  assert.equal(h.deleted.length, 0);
  assert.equal(h.notices.length, 0);
});

test("confirmation awaits deletion, reports failure inline, and permits retry", async (t) => {
  const app = await readFile(new URL("../app.js", import.meta.url), "utf8");
  const functionSource = app.slice(app.indexOf("function showConfirmDialog("), app.indexOf("function escapePlainText("));
  const dom = new JSDOM('<button id="trigger">删除</button>', { runScripts: "outside-only" });
  t.after(() => dom.window.close());
  const w = dom.window;
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.requestAnimationFrame = fn => fn();
  w.getDialogFocusFallback = () => null;
  w.canRestoreDialogFocus = node => node?.isConnected;
  w.escapeHtml = value => value;
  w.escapePlainText = value => value;
  w.eval(functionSource);
  let reject;
  w.showConfirmDialog({ title: "删除素材？", body: "确认范围", waitForConfirm: true,
    onConfirm: () => new Promise((_, r) => { reject = r; }) });
  const settle = () => new Promise(r => setTimeout(r, 0));
  const button = w.document.querySelector('.confirm-ok');
  button.click();
  await settle();
  assert.equal(button.disabled, true);
  assert.equal(w.document.querySelector('dialog').open, true);
  reject(new Error("仍被引用"));
  await settle();
  assert.equal(button.disabled, false);
  assert.equal(w.document.querySelector('[role="alert"]').textContent, "仍被引用");
  assert.equal(w.document.querySelector('dialog').open, true);
  w.document.querySelector('.confirm-cancel').click();
  assert.equal(w.document.querySelector('dialog'), null);
});
