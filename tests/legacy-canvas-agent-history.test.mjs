import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const source = await readFile(new URL("../src/legacy-canvas/canvas-agent-history.js", import.meta.url), "utf8");

const defaultSeed = [
  { id: "new", title: "新对话", messages: [] },
  { id: "alpha", title: "Alpha 规划", messages: [{ role: "user", content: "角色素材整理" }] },
  { id: "beta", title: "Beta 分镜", messages: [{ role: "user", content: "继续镜头规划" }] },
];

function setup(t, seed = defaultSeed) {
  const dom = new JSDOM('<div id="list"></div><button id="outside">其他操作</button>', {
    runScripts: "outside-only",
  });
  t.after(() => dom.window.close());
  const { window } = dom;
  const { document } = window;
  window.structuredClone = structuredClone;
  window.eval(source);
  const list = document.querySelector("#list");
  const selections = [];
  const renames = [];
  const deleteRequests = [];
  const controller = window.REELAY_AGENT_HISTORY.createController({
    list,
    seed,
    escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, (character) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
      })[character]);
    },
    refreshIcons() {},
    onSelect(conversation, options) {
      selections.push({ id: conversation.id, closeMenu: options.closeMenu });
    },
    onRename(conversation) {
      renames.push({ id: conversation.id, title: conversation.title });
    },
    requestDelete(request) { deleteRequests.push(request); },
  });
  controller.render();
  const row = (id) => [...list.querySelectorAll("[data-chat-id]")].find((element) => element.dataset.chatId === id);
  const control = (id, action) => row(id)?.querySelector(`[data-history-action="${action}"]`);
  const input = (id) => row(id)?.querySelector(".history-rename-input");
  function click(id, action) {
    const button = control(id, action);
    assert.ok(button, `Expected ${action} control for ${id}`);
    // A browser transfers focus between pointerdown and click unless pointerdown was canceled.
    const transferFocus = button.dispatchEvent(new window.Event("pointerdown", { bubbles: true, cancelable: true }));
    if (transferFocus) button.focus();
    button.click();
  }
  function key(element, value, options = {}) {
    const event = new window.KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true, ...options });
    element.dispatchEvent(event);
    return event;
  }
  function remove(id) {
    click(id, "delete");
    deleteRequests.at(-1).onConfirm();
  }
  return { window, document, list, controller, selections, renames, deleteRequests, row, control, input, click, key, remove };
}

test("history actions remain independent controls and renaming another row does not select it", (t) => {
  const h = setup(t);
  assert.equal(h.list.querySelector("button button"), null);
  h.click("alpha", "rename");
  assert.equal(h.document.activeElement, h.input("alpha"));
  assert.equal(h.controller.getActiveId(), "new");
  assert.deepEqual(h.selections, []);

  h.input("alpha").value = "  新的素材规划  ";
  assert.equal(h.row("alpha").querySelector("button"), null, "editing only shows the input");
  h.document.querySelector("#outside").focus();
  assert.equal(h.controller.getConversation("alpha").title, "新的素材规划");
  assert.equal(h.control("alpha", "select").textContent, "新的素材规划");
  assert.deepEqual(h.renames, [{ id: "alpha", title: "新的素材规划" }]);
  assert.deepEqual(h.selections, []);
  assert.equal(h.document.activeElement.id, "outside");
  assert.equal(defaultSeed[1].title, "Alpha 规划", "editing does not mutate the seed fixture");
});

test("renaming the active conversation notifies its title without replacing its messages or changing selection", (t) => {
  const h = setup(t);
  h.click("alpha", "select");
  h.selections.length = 0;
  const messages = h.controller.getConversation().messages;
  h.click("alpha", "rename");
  const title = '角色 "A" <img src=x onerror=alert(1)> & 分镜';
  h.input("alpha").value = title;
  h.key(h.input("alpha"), "Enter");

  assert.equal(h.controller.getActiveId(), "alpha");
  assert.equal(h.controller.getConversation().messages, messages);
  assert.deepEqual(h.renames, [{ id: "alpha", title }]);
  assert.deepEqual(h.selections, []);
  assert.equal(h.control("alpha", "select").textContent, title);
  assert.equal(h.row("alpha").querySelector("img"), null, "conversation names are rendered as text");
});

test("blank names keep the original title and Escape cancels only the inline edit", (t) => {
  const h = setup(t);
  let bubbledEscapes = 0;
  h.list.parentElement.addEventListener("keydown", (event) => {
    if (event.key === "Escape") bubbledEscapes += 1;
  });
  h.click("alpha", "rename");
  h.input("alpha").value = "   ";
  h.key(h.input("alpha"), "Enter");
  assert.equal(h.controller.getConversation("alpha").title, "Alpha 规划");

  h.click("alpha", "rename");
  h.input("alpha").value = "不保存的名称";
  const escape = h.key(h.input("alpha"), "Escape");
  assert.equal(escape.defaultPrevented, true);
  assert.equal(bubbledEscapes, 0);
  assert.equal(h.controller.getConversation("alpha").title, "Alpha 规划");
  assert.equal(h.input("alpha"), null);
  assert.equal(h.document.activeElement, h.control("alpha", "rename"));
  assert.deepEqual(h.renames, []);
  assert.equal(h.controller.handleEscape(), false, "a subsequent Escape belongs to the enclosing menu");
});

test("Chinese composition Enter keeps the edit open until the confirmed text is submitted", (t) => {
  const h = setup(t);
  h.click("alpha", "rename");
  const input = h.input("alpha");
  input.value = "中文规划";
  h.key(input, "Enter", { isComposing: true });
  assert.equal(h.input("alpha"), input);
  assert.equal(h.controller.getConversation("alpha").title, "Alpha 规划");
  assert.deepEqual(h.renames, []);
  h.key(input, "Enter");
  assert.equal(h.input("alpha"), null);
  assert.deepEqual(h.renames, [{ id: "alpha", title: "中文规划" }]);
});

test("closing the menu commits a pending name once and requesting deletion alone does not remove anything", (t) => {
  const h = setup(t);
  h.click("alpha", "rename");
  h.input("alpha").value = "保存的草稿";
  h.controller.close();
  h.controller.close();
  assert.equal(h.input("alpha"), null);
  assert.deepEqual(h.renames, [{ id: "alpha", title: "保存的草稿" }]);

  h.click("beta", "delete");
  h.controller.close();
  assert.ok(h.controller.getConversation("beta"));
  assert.ok(h.control("beta", "delete"));
  assert.equal(h.deleteRequests.length, 1);
  assert.deepEqual(h.selections, []);
});

test("clicking another row's delete action commits the edit and opens confirmation in one gesture", (t) => {
  const h = setup(t);
  h.click("alpha", "rename");
  h.input("alpha").value = "编辑后保留";
  h.click("beta", "delete");
  assert.equal(h.controller.getConversation("alpha").title, "编辑后保留");
  assert.equal(h.deleteRequests.at(-1).conversation.id, "beta");
  assert.deepEqual(h.selections, []);
  assert.ok(h.controller.getConversation("beta"));
  assert.equal(h.document.activeElement, h.control("beta", "delete"));
});

test("focus leaving the editor commits the name without selecting a conversation", (t) => {
  const h = setup(t);
  h.click("alpha", "rename");
  h.input("alpha").value = "失焦保存";
  h.document.querySelector("#outside").focus();
  assert.deepEqual(h.renames, [{ id: "alpha", title: "失焦保存" }]);
  assert.equal(h.input("alpha"), null);
  assert.equal(h.document.activeElement.id, "outside");
  assert.deepEqual(h.selections, []);
});

test("deletion confirmation preserves the row and a repeated confirmation cannot delete its neighbor", (t) => {
  const h = setup(t);
  const row = h.row("alpha");
  h.click("alpha", "delete");
  assert.equal(h.row("alpha"), row);
  assert.ok(h.control("alpha", "select"));
  assert.equal(h.list.querySelector('[role="dialog"]'), null, "confirmation lives outside the scrolling list");
  const request = h.deleteRequests.at(-1);
  request.onConfirm();
  request.onConfirm();
  assert.equal(h.controller.getConversation("alpha"), undefined);
  assert.ok(h.controller.getConversation("beta"));
});

test("Tab out of rename keeps the next row action alive and saves only once", (t) => {
  const h = setup(t);
  const nextAction = h.control("beta", "rename");
  h.click("alpha", "rename");
  h.input("alpha").value = "自动保存";
  nextAction.focus();
  assert.equal(h.document.activeElement, nextAction);
  nextAction.click();
  assert.equal(h.document.activeElement, h.input("beta"));
  assert.deepEqual(h.renames, [{ id: "alpha", title: "自动保存" }]);
});


test("deleting a non-current conversation leaves the current conversation and its work untouched", (t) => {
  const h = setup(t);
  h.controller.select("alpha");
  h.selections.length = 0;
  const active = h.controller.getConversation();
  h.remove("beta");
  assert.equal(h.controller.getConversation("beta"), undefined);
  assert.equal(h.controller.getConversation(), active);
  assert.equal(h.controller.getActiveId(), "alpha");
  assert.deepEqual(h.selections, [], "no selection callback means no cancellation of the current prompt task");
});

test("deleting the current conversation selects its next neighbor, then the previous neighbor at the end", (t) => {
  const h = setup(t);
  h.controller.select("alpha");
  h.selections.length = 0;
  h.remove("alpha");
  assert.equal(h.controller.getActiveId(), "beta");
  h.remove("beta");
  assert.equal(h.controller.getActiveId(), "new");
  assert.deepEqual(h.selections, [
    { id: "beta", closeMenu: false },
    { id: "new", closeMenu: false },
  ]);
});

test("deleting every original conversation leaves one usable blank conversation", (t) => {
  const h = setup(t);
  for (const id of ["alpha", "beta", "new"]) h.remove(id);
  const remaining = h.controller.getConversation();
  assert.ok(remaining);
  assert.equal(remaining.title, "新对话");
  assert.equal(remaining.messages.length, 0);
  assert.equal(h.list.querySelectorAll("[data-chat-id]").length, 1);
  assert.equal(h.controller.getActiveId(), remaining.id);
  assert.equal(h.control(remaining.id, "select").getAttribute("aria-current"), "true");
  assert.deepEqual(h.selections, [{ id: remaining.id, closeMenu: false }]);
  h.controller.startNew();
  assert.equal(h.controller.getActiveId(), remaining.id, "an existing untouched blank conversation is reused");
});

test("new conversation works after the original new row is deleted and never overwrites an existing id", (t) => {
  const seed = [...defaultSeed, { id: "local-chat-1", title: "已有记录", messages: [{ role: "user", content: "保留" }] }];
  const h = setup(t, seed);
  h.remove("new");
  h.selections.length = 0;
  h.controller.startNew();
  const created = h.controller.getConversation();
  assert.notEqual(created.id, "new");
  assert.notEqual(created.id, "local-chat-1");
  assert.equal(created.title, "新对话");
  assert.equal(created.messages.length, 0);
  assert.deepEqual(h.selections, [{ id: created.id, closeMenu: true }]);
  assert.equal(h.controller.getConversation("local-chat-1").messages[0].content, "保留");
  created.messages.push({ role: "user", content: "第一次规划" });
  h.controller.startNew();
  assert.notEqual(h.controller.getActiveId(), created.id);
  assert.equal(h.controller.getConversation(created.id).messages[0].content, "第一次规划");
});

test("an empty seed still supports selection and ignores an unknown history id", (t) => {
  const h = setup(t, []);
  const blank = h.controller.getConversation();
  assert.ok(blank);
  assert.equal(blank.title, "新对话");
  h.controller.select("missing");
  assert.equal(h.controller.getConversation(), blank);
  assert.deepEqual(h.selections, []);
  h.click(blank.id, "select");
  assert.deepEqual(h.selections, [{ id: blank.id, closeMenu: true }]);
});
