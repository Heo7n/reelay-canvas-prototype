import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const source = await readFile(new URL("../src/legacy-canvas/canvas-generation-selection.js", import.meta.url), "utf8");

function fixture(t, options = {}) {
  const dom = new JSDOM('<!doctype html><body><button id="select">多选</button><section id="records"><div class="generation-record-list"></div></section><button id="outside">外部</button></body>', { runScripts: "outside-only" });
  const { window } = dom; const { document } = window;
  Object.defineProperty(window.HTMLElement.prototype, "inert", {
    configurable: true,
    get() { return this.hasAttribute("inert"); },
    set(value) { this.toggleAttribute("inert", Boolean(value)); },
  });
  const trigger = document.querySelector("#select");
  const container = document.querySelector("#records");
  const list = container.querySelector(".generation-record-list");
  let scope = { projectId: "project-1", conversationId: "chat-1" };
  let tasks = []; let pauses = 0; let entries = 0;
  const removed = [];
  window.HTMLMediaElement.prototype.pause = () => { pauses++; };
  window.eval(source);
  const controller = window.REELAY_GENERATION_SELECTION.createController({
    document, container, trigger, getScope: () => scope, getTasks: () => tasks,
    getTask: (id) => tasks.find((task) => task.id === id),
    onRemove: (items) => { removed.push(items); return options.onRemove?.(items); },
    onEnter: () => { entries++; },
  });
  t.after(() => { controller.dispose(); window.close(); });
  function addTask(id, status = "succeeded", overrides = {}) {
    const task = { id, status, scope: { ...scope }, input: { prompt: `任务 ${id}` }, ...overrides };
    tasks.push(task);
    const row = document.createElement("article");
    row.className = "generation-record";
    row.dataset.generationTaskId = id;
    row.innerHTML = '<div class="content"><button>详情</button></div><div class="locked" inert>已锁定</div><video></video>';
    list.append(row);
    return task;
  }
  const query = (selector) => container.querySelector(selector);
  const action = (name) => query(`[data-generation-selection="${name}"]`);
  const row = (id) => Array.from(list.children).find((element) => element.dataset.generationTaskId === id);
  const checkbox = (id) => row(id)?.querySelector('input[type="checkbox"]');
  return { window, document, trigger, container, list, controller, addTask, query, action, row, checkbox, removed,
    tasks: () => tasks, setTasks: (items) => { tasks = items; }, setScope: (value) => { scope = value; },
    pauses: () => pauses, entries: () => entries,
    enter() { controller.render(); trigger.click(); },
    count() { return query(".generation-record-selection-count")?.textContent; },
    escape(target = trigger) { const event = new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }); target.dispatchEvent(event); return event; },
  };
}

test("selection only targets terminal history; all-select and snapshot deletion exclude pending records", (t) => {
  const f = fixture(t);
  for (const [id, status] of [["success", "succeeded"], ["failure", "failed"], ["cancel", "canceled"], ["queue", "queued"], ["run", "running"]]) f.addTask(id, status);
  f.enter();
  assert.equal(f.entries(), 1);
  assert.equal(f.trigger.getAttribute("aria-pressed"), "true");
  assert.equal(f.checkbox("queue").disabled, true);
  assert.equal(f.checkbox("run").closest("label").title, "生成中，暂不可删除");
  assert.equal(f.action("remove").disabled, true);
  f.checkbox("success").click();
  assert.equal(f.count(), "已选 1 条");
  assert.equal(f.action("all").indeterminate, true);
  assert.equal(f.row("success").classList.contains("is-record-selected"), true);
  f.action("all").click();
  assert.equal(f.count(), "已选 3 条");
  assert.equal(f.action("all").checked, true);
  assert.equal(f.checkbox("run").checked, false);
  f.action("remove").click();
  assert.deepEqual(Array.from(f.removed[0], (task) => task.id), ["success", "failure", "cancel"]);
  assert.equal(Object.isFrozen(f.removed[0]), true);
  assert.equal(f.tasks().length, 5, "selection itself never removes or cancels task data");
});

test("late completion becomes eligible without joining a prior all-selection", (t) => {
  const f = fixture(t);
  f.addTask("first"); const running = f.addTask("later", "running");
  f.enter(); f.action("all").click();
  running.status = "succeeded"; f.controller.render();
  assert.equal(f.checkbox("later").disabled, false);
  assert.equal(f.checkbox("later").checked, false);
  assert.equal(f.action("all").indeterminate, true);
  assert.equal(f.count(), "已选 1 条");
  f.action("all").click();
  assert.equal(f.count(), "已选 2 条");
  f.action("all").click();
  assert.equal(f.count(), "已选 0 条");
  assert.equal(f.trigger.getAttribute("aria-pressed"), "true", "empty selection keeps selection mode open");
});

test("the full-row label toggles exactly once and routine renders preserve keyboard focus", (t) => {
  const f = fixture(t);
  f.addTask("first"); f.enter();
  const checkbox = f.checkbox("first");
  checkbox.closest("label").click();
  assert.equal(f.count(), "已选 1 条");
  checkbox.closest("label").click();
  assert.equal(f.count(), "已选 0 条");
  f.action("all").focus();
  f.controller.render();
  assert.equal(f.document.activeElement, f.action("all"));
  checkbox.focus(); f.controller.render();
  assert.equal(f.document.activeElement, checkbox);
});

test("scope changes invalidate selection before a stale delete click can affect reused IDs", (t) => {
  const f = fixture(t);
  f.addTask("same-id"); f.enter(); f.action("all").click();
  const staleDelete = f.action("remove");
  const nextScope = { projectId: "project-2", conversationId: "chat-2" };
  f.setScope(nextScope);
  f.setTasks([{ id: "same-id", scope: nextScope, status: "succeeded", input: { prompt: "其它项目" } }]);
  staleDelete.click();
  assert.equal(f.removed.length, 0);
  assert.equal(f.trigger.getAttribute("aria-pressed"), "false");
  assert.equal(f.query(".generation-record-select-overlay"), null);
  f.enter();
  assert.equal(f.count(), "已选 0 条");
});

test("removed and nonterminal selected tasks are reconciled and never reach onRemove", (t) => {
  const f = fixture(t);
  const first = f.addTask("first"); f.addTask("removed"); f.addTask("remaining");
  f.enter(); f.action("all").click();
  first.status = "running";
  f.setTasks(f.tasks().filter((task) => task.id !== "removed"));
  const detached = f.row("removed"); detached.remove();
  f.action("remove").click();
  assert.deepEqual(Array.from(f.removed[0], (task) => task.id), ["remaining"]);
  assert.equal(detached.querySelector(".content").inert, false);
  assert.equal(detached.querySelector(".generation-record-select-overlay"), null);
  assert.equal(f.count(), "已选 1 条");
});

test("record controls become inert once, updates stay inert, and close restores original inert states", (t) => {
  const f = fixture(t);
  f.addTask("media");
  const row = f.row("media"); const content = row.querySelector(".content");
  f.enter();
  assert.equal(content.inert, true);
  assert.equal(row.querySelector(".locked").inert, true);
  assert.equal(f.checkbox("media").closest("label").inert, false);
  for (let index = 0; index < 4; index++) f.controller.render();
  assert.equal(f.pauses(), 1, "render updates do not repeatedly pause unchanged media");
  const replacement = f.document.createElement("button"); replacement.textContent = "新结果";
  content.replaceWith(replacement); f.controller.render();
  assert.equal(content.inert, false, "replaced content restores its prior state");
  assert.equal(replacement.inert, true);
  f.action("done").click();
  assert.equal(replacement.inert, false);
  assert.equal(row.querySelector(".locked").inert, true);
  assert.equal(f.query(".generation-record-select-overlay"), null);
  assert.equal(f.document.activeElement, f.trigger);
});

test("empty history exits selection and running-only history has no eligible all-select", (t) => {
  const f = fixture(t);
  assert.equal(f.trigger.disabled, true);
  f.addTask("running", "running"); f.enter();
  assert.equal(f.action("all").disabled, true);
  assert.equal(f.action("remove").disabled, true);
  f.setTasks([]); f.controller.render();
  assert.equal(f.trigger.disabled, true);
  assert.equal(f.trigger.getAttribute("aria-pressed"), "false");
  assert.equal(f.query(".generation-record-selection-toolbar"), null);
});

test("Escape is scoped, yields to dialogs and handled events, and otherwise restores trigger focus", (t) => {
  const f = fixture(t);
  f.addTask("first"); f.enter();
  f.escape(f.document.querySelector("#outside"));
  assert.equal(f.trigger.getAttribute("aria-pressed"), "true");
  const modal = f.document.createElement("div"); modal.setAttribute("role", "dialog");
  f.document.body.append(modal); f.escape(f.checkbox("first"));
  assert.equal(f.trigger.getAttribute("aria-pressed"), "true");
  modal.classList.add("hidden");
  const handled = new f.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  handled.preventDefault(); f.trigger.dispatchEvent(handled);
  assert.equal(f.trigger.getAttribute("aria-pressed"), "true");
  assert.equal(f.escape(f.checkbox("first")).defaultPrevented, true);
  assert.equal(f.trigger.getAttribute("aria-pressed"), "false");
  assert.equal(f.document.activeElement, f.trigger);
});

test("repeated rendering and entering do not duplicate controls or deletion listeners; dispose removes interaction", (t) => {
  const f = fixture(t);
  f.addTask("first");
  for (let index = 0; index < 3; index++) {
    f.enter(); f.controller.render(); f.controller.close();
  }
  f.enter(); f.controller.render();
  assert.equal(f.container.querySelectorAll(".generation-record-select-overlay").length, 1);
  assert.equal(f.container.querySelectorAll(".generation-record-selection-toolbar").length, 1);
  f.checkbox("first").click(); f.action("remove").click();
  assert.equal(f.removed.length, 1);
  f.controller.dispose(); f.trigger.click(); f.controller.render();
  assert.equal(f.query(".generation-record-selection-toolbar"), null);
  assert.equal(f.row("first").querySelector(".content").inert, false);
});

test("pending removal prevents duplicate submissions without auto-clearing the selection", async (t) => {
  let resolve;
  const f = fixture(t, { onRemove: () => new Promise((done) => { resolve = done; }) });
  f.addTask("first"); f.enter(); f.checkbox("first").click();
  f.action("remove").click(); f.action("remove").click();
  assert.equal(f.removed.length, 1);
  assert.equal(f.action("remove").disabled, true);
  resolve(); await Promise.resolve();
  assert.equal(f.action("remove").disabled, false);
  assert.equal(f.count(), "已选 1 条");
});
