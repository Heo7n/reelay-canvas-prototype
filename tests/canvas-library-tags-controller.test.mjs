import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const source = await readFile(new URL("../src/legacy-canvas/canvas-library-tags-controller.js", import.meta.url), "utf8");
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const builtins = [{ id: "builtin:character", name: "角色" }, { id: "builtin:scene", name: "场景" }, { id: "builtin:object", name: "物品" }];
const sample = { folders: [], tags: [{ id: "private", name: "收藏", space: "personal" }, { id: "org", name: "组织标签", space: "organization" }],
  entries: [{ assetId: "a", space: "personal", tagIds: ["builtin:object", "private"] }],
  entityEntries: [{ entityId: "g", space: "personal", tagIds: ["builtin:character"] }] };
const selection = () => ({ space: "personal", items: [{ kind: "media", id: "a" }, { kind: "entity", id: "g" }] });
const managerFactory = "createLibraryTagManager";

test("delete confirmation keeps the management list mounted, preserves scroll, and returns focus to its row or neighbor", async (t) => {
  let current = structuredClone(sample);
  current.tags.push({ id: "next", name: "下一标签", space: "personal" });
  const f = setup(t, (command, input) => {
    if (command === "delete-tag") current = { ...current, tags: current.tags.filter((tag) => tag.id !== input.tagId) };
    return structuredClone(current);
  }, {}, managerFactory);
  await f.open();
  const manager = f.w.document.querySelector('.library-tag-manager');
  const overlay = f.w.document.querySelector('.library-tag-delete-dialog');
  const body = manager.querySelector('.library-tags-body');
  const remove = manager.querySelector('[aria-label="删除标签 收藏"]');
  const neighbor = manager.querySelector('[aria-label="删除标签 下一标签"]');
  const row = remove.parentElement;
  body.scrollTop = 120;
  remove.click();
  assert.equal(manager.open, true); assert.equal(overlay.open, true);
  assert.equal(manager.querySelector('h2').textContent, "管理标签");
  assert.equal(row.isConnected, true);
  assert.equal(manager.querySelector('.library-tag-manager-list').hidden, false);
  assert.equal(body.scrollTop, 120);
  overlay.dispatchEvent(new f.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  assert.equal(manager.open, true); assert.equal(overlay.open, false);
  assert.equal(f.w.document.activeElement, remove);
  assert.equal(body.scrollTop, 120);
  remove.click(); f.button("删除标签").click(); await settle();
  assert.equal(manager.open, true); assert.equal(overlay.open, false);
  assert.equal(row.isConnected, false);
  assert.equal(neighbor.isConnected, true);
  assert.equal(f.w.document.activeElement, neighbor);
  assert.equal(body.scrollTop, 120);
  f.c.destroy();
  assert.equal(f.w.document.querySelectorAll("dialog").length, 0);
});

test("tag management protects presets and requires confirmation before removing a custom dictionary tag", async (t) => {
  const deleted = [];
  const result = { ...structuredClone(sample), tags: [], entries: [{ assetId: "a", space: "personal", tagIds: ["builtin:object"] }] };
  const f = setup(t, (command) => command === "list" ? structuredClone(sample) : result, { onDeleted: (tag) => deleted.push(tag.id) }, managerFactory);
  await f.open();
  assert.equal(f.w.document.querySelectorAll('.library-tag-manager-delete').length, 1);
  assert.equal(f.w.document.querySelector('[aria-label="删除标签 角色"]'), null);
  f.w.document.querySelector('[aria-label="删除标签 收藏"]').click();
  assert.match(f.w.document.querySelector('.library-tag-delete-confirmation').textContent, /1 项/);
  assert.equal(f.calls.length, 1);
  f.button("取消").click();
  assert.equal(f.calls.length, 1);
  f.w.document.querySelector('[aria-label="删除标签 收藏"]').click();
  f.button("删除标签").click(); await settle();
  assert.deepEqual(f.calls[1], { command: "delete-tag", payload: { space: "personal", tagId: "private", expectedUsageCount: 1 } });
  assert.deepEqual(deleted, ["private"]);
  assert.equal(f.w.document.querySelector('[aria-label="删除标签 收藏"]'), null);
  f.button("完成").click();
  assert.equal(f.w.document.activeElement.id, "trigger");
});

test("tag deletion refreshes changed usage and requires a second explicit confirmation", async (t) => {
  let reads = 0, deletes = 0;
  const latest = structuredClone(sample);
  latest.entityEntries[0].tagIds.push("private");
  const f = setup(t, (command) => {
    if (command === "list") return ++reads === 1 ? structuredClone(sample) : latest;
    if (++deletes === 1) throw Object.assign(new Error("标签关联已变化，请重新确认"), { serviceCode: "tag_usage_changed" });
    return { ...latest, tags: [] };
  }, {}, managerFactory);
  await f.open();
  f.w.document.querySelector('[aria-label="删除标签 收藏"]').click();
  f.button("删除标签").click(); await settle();
  assert.equal(deletes, 1);
  assert.match(f.w.document.querySelector('.library-tag-delete-confirmation').textContent, /2 项/);
  assert.match(f.w.document.querySelector('.library-tag-delete-dialog [role="status"]').textContent, /重新确认/);
  f.button("删除标签").click(); await settle();
  assert.equal(f.calls.at(-1).payload.expectedUsageCount, 2);
  assert.equal(deletes, 2);
});

test("pending tag deletion blocks duplicate confirmation and ignores success after scope change", async (t) => {
  let finish;
  const f = setup(t, (command) => command === "list" ? structuredClone(sample) : new Promise((resolve) => { finish = resolve; }), {}, managerFactory);
  await f.open();
  f.w.document.querySelector('[aria-label="删除标签 收藏"]').click();
  f.button("删除标签").click();
  f.button("删除中…").click(); f.button("取消").click();
  assert.equal(f.calls.length, 2);
  assert.equal(f.w.document.querySelector("dialog").open, true);
  f.scope("organization:canvas-b");
  finish({ ...sample, tags: [] }); await settle();
  assert.equal(f.w.document.querySelector("dialog").open, false);
  assert.equal(f.w.document.querySelector('.library-tag-delete-dialog').open, false);
  assert.equal(f.catalogs.length, 1);
  assert.equal(f.notices.length, 0);
});

test("outer tag edit removes a deleted dictionary choice without losing other pending tags", async (t) => {
  const f = setup(t); await f.open();
  f.chip("private").click(); f.chip("builtin:scene").click();
  f.c.syncCatalog({ ...sample, tags: [] });
  assert.equal(f.chip("private"), null);
  assert.equal(f.chip("builtin:scene").getAttribute("aria-pressed"), "true");
  f.button("应用").click(); await settle();
  assert.deepEqual(f.calls.at(-1).payload.tagIds, ["builtin:scene"]);
});
function setup(t, handler, extra = {}, factory = "createLibraryTagsController") {
  const dom = new JSDOM('<button id="trigger">设置标签</button>', { runScripts: "outside-only" });
  t.after(() => dom.window.close());
  const w = dom.window;
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  w.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  w.eval(source);
  let scope = "personal:canvas-a", allowed = true;
  const calls = [], catalogs = [], notices = [], created = [];
  const c = w.REELAY_CANVAS_LIBRARY_TAGS_CONTROLLER[factory]({ document: w.document,
    getScopeKey: () => scope, canEdit: () => allowed, builtinTags: builtins,
    async request(command, payload) {
      calls.push({ command, payload: payload ? JSON.parse(JSON.stringify(payload)) : null });
      return handler ? handler(command, payload) : structuredClone(sample);
    }, onCatalog: (value) => catalogs.push(value), onTag: (value) => created.push(value), notify: (value) => notices.push(value), ...extra });
  const button = (text) => [...w.document.querySelectorAll('dialog button')].find((el) => el.textContent.trim() === text);
  const chip = (id) => w.document.querySelector(`[data-tag-id="${id}"]`);
  w.document.getElementById("trigger").focus();
  return { c, w, calls, catalogs, notices, created, button, chip,
    scope(value) { scope = value; c.syncContext(); }, revoke() { allowed = false; c.syncContext(); },
    async open(input = selection()) { c.open(input); await settle(); } };
}

test("tag edits capture exact targets and remain draft until Apply", async (t) => {
  const f = setup(t);
  const input = selection();
  await f.open(input); input.items[0].id = "different";
  assert.equal(f.chip("org"), null);
  f.chip("builtin:scene").click();
  assert.deepEqual(f.calls.map((call) => call.command), ["list"]);
  f.button("应用").click(); await settle();
  assert.deepEqual(f.calls[1], { command: "update-tags", payload: { ...selection(), operation: "add", tagIds: ["builtin:scene"] } });
  assert.equal(f.notices.length, 1);
  assert.equal(f.w.document.querySelector("dialog").open, false);
  assert.equal(f.w.document.activeElement.id, "trigger");
});

test("single media opens with its existing tags selected and atomically applies the full edited selection", async (t) => {
  const f = setup(t);
  await f.open({ space: "personal", items: [{ kind: "media", id: "a" }] });
  assert.equal(f.chip("builtin:object").getAttribute("aria-pressed"), "true");
  assert.equal(f.chip("private").getAttribute("aria-pressed"), "true");
  assert.equal(f.chip("builtin:scene").getAttribute("aria-pressed"), "false");
  assert.equal(f.button("添加标签").hidden, true);
  assert.equal(f.button("移除标签").hidden, true);
  assert.equal(f.button("应用").disabled, true);
  f.chip("private").click(); f.chip("builtin:scene").click();
  f.button("应用").click(); await settle();
  assert.deepEqual(f.calls[1], { command: "update-tags", payload: {
    space: "personal", operation: "replace", tagIds: ["builtin:object", "builtin:scene"],
    expectedTagIds: ["builtin:object", "private"], items: [{ kind: "media", id: "a" }],
  } });
  assert.equal(f.calls.length, 2);
});

test("single item can clear all tags and organization tags never inherit the personal placement", async (t) => {
  const catalog = structuredClone(sample);
  catalog.entries.push({ assetId: "a", space: "organization", tagIds: ["org"] });
  const f = setup(t, () => catalog);
  await f.open({ space: "organization", items: [{ kind: "media", id: "a" }] });
  assert.equal(f.chip("org").getAttribute("aria-pressed"), "true");
  assert.equal(f.chip("builtin:object").getAttribute("aria-pressed"), "false");
  assert.equal(f.chip("private"), null);
  f.chip("org").click(); f.button("应用").click(); await settle();
  assert.deepEqual(f.calls[1].payload.tagIds, []);
  assert.deepEqual(f.calls[1].payload.expectedTagIds, ["org"]);
  await f.open({ space: "personal", items: [{ kind: "entity", id: "g" }] });
  assert.equal(f.chip("builtin:character").getAttribute("aria-pressed"), "true");
  assert.equal(f.chip("builtin:object").getAttribute("aria-pressed"), "false");
});

test("single tag replacement keeps its draft and original expected tags after a failed save", async (t) => {
  let failed = true;
  const f = setup(t, (command) => {
    if (command === "update-tags" && failed) throw new Error("网络暂不可用");
    return structuredClone(sample);
  });
  await f.open({ space: "personal", items: [{ kind: "media", id: "a" }] });
  f.chip("private").click(); f.button("应用").click(); await settle();
  assert.equal(f.chip("private").getAttribute("aria-pressed"), "false");
  failed = false; f.button("应用").click(); await settle();
  assert.deepEqual(f.calls[1], f.calls[2]);
});

test("single tag edit preserves pending changes when a custom tag is deleted in the manager", async (t) => {
  const f = setup(t);
  await f.open({ space: "personal", items: [{ kind: "media", id: "a" }] });
  f.chip("builtin:scene").click();
  f.c.syncCatalog({ ...sample, tags: [], entries: [{ ...sample.entries[0], tagIds: ["builtin:object"] }] });
  f.button("应用").click(); await settle();
  assert.deepEqual(f.calls[1].payload.tagIds, ["builtin:object", "builtin:scene"]);
  assert.deepEqual(f.calls[1].payload.expectedTagIds, ["builtin:object"]);
});

test("remove choices are union of selected item labels, independent for groups and members", async (t) => {
  const f = setup(t); await f.open();
  f.button("移除标签").click();
  assert.equal(f.chip("builtin:scene"), null);
  assert.ok(f.chip("builtin:object")); assert.ok(f.chip("builtin:character")); assert.ok(f.chip("private"));
  f.chip("builtin:character").click();
  f.button("应用").click(); await settle();
  assert.equal(f.calls[1].payload.operation, "remove");
  assert.deepEqual(f.calls[1].payload.tagIds, ["builtin:character"]);
});

test("failed submission preserves draft and retries the same idempotent delta", async (t) => {
  let failed = true;
  const f = setup(t, async (command) => { if (command === "update-tags" && failed) throw new Error("暂时无法保存"); return structuredClone(sample); });
  await f.open(); f.chip("private").click(); f.button("应用").click(); await settle();
  assert.match(f.w.document.querySelector('[role="status"]').textContent, /暂时无法保存/);
  assert.equal(f.w.document.querySelector("dialog").open, true);
  assert.equal(f.chip("private").getAttribute("aria-pressed"), "true");
  assert.equal(f.notices.length, 0);
  failed = false; f.button("应用").click(); await settle();
  assert.deepEqual(f.calls[1], f.calls[2]); assert.equal(f.notices.length, 1);
});

test("scope change and permission loss close draft and discard late catalog responses", async (t) => {
  for (const invalidate of [(f) => f.scope("organization:canvas-b"), (f) => f.revoke()]) {
    let finish;
    const f = setup(t, () => new Promise((resolve) => { finish = resolve; }));
    f.c.open(selection()); invalidate(f);
    finish(structuredClone(sample)); await settle();
    assert.equal(f.w.document.querySelector("dialog").open, false);
    assert.equal(f.catalogs.length, 0);
    assert.equal(f.calls.length, 1);
  }
});

test("pending update blocks duplicate applies and old results cannot affect another canvas", async (t) => {
  let finish;
  const f = setup(t, (command) => command === "list" ? Promise.resolve(structuredClone(sample)) : new Promise((resolve) => { finish = resolve; }));
  await f.open(); f.chip("builtin:scene").click(); f.button("应用").click();
  assert.equal(f.c.open(selection()), false);
  assert.equal(f.button("应用中…").disabled, true);
  f.scope("other"); finish(structuredClone(sample)); await settle();
  assert.equal(f.catalogs.length, 1); assert.equal(f.notices.length, 0);
});

test("new tag supports Chinese composition and confirmed creation is separate from applying it", async (t) => {
  const f = setup(t, async (command) => command === "create-tag" ? { id: "new", name: "服装参考", space: "personal" } : structuredClone(sample));
  await f.open(); f.button("新建标签").click();
  const input = f.w.document.querySelector("input"); input.value = "服装参考";
  input.dispatchEvent(new f.w.KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true }));
  assert.equal(f.calls.length, 1);
  input.dispatchEvent(new f.w.KeyboardEvent("keydown", { key: "Enter", bubbles: true })); await settle();
  assert.equal(f.created.length, 1); assert.equal(f.chip("new").getAttribute("aria-pressed"), "true");
  f.c.close(); assert.equal(f.calls.filter((call) => call.command === "update-tags").length, 0);
  await f.open(); assert.equal(f.button("应用").disabled, true);
});

test("failed list remains retryable and cancellation never submits labels", async (t) => {
  let fail = true;
  const f = setup(t, async () => { if (fail) throw new Error("无法加载"); return structuredClone(sample); });
  await f.open(); assert.equal(f.button("应用").disabled, true);
  fail = false; f.button("重试").click(); await settle();
  f.chip("builtin:character").click();
  f.w.document.querySelector("dialog").dispatchEvent(new f.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(f.w.document.querySelector("dialog").open, false);
  assert.equal(f.calls.every((call) => call.command === "list"), true);
});

test("unconfirmed tag name cannot be discarded by selecting another chip and applying", async (t) => {
  const f = setup(t); await f.open();
  f.button("新建标签").click();
  f.w.document.querySelector("input").value = "待确认标签";
  f.chip("builtin:scene").click();
  assert.equal(f.button("应用").disabled, true);
  f.button("应用").click(); await settle();
  assert.equal(f.calls.length, 1);
  assert.equal(f.w.document.querySelector("input").value, "待确认标签");
});

test("confirmed custom tag publishes after enclosing draft closes but never crosses scope", async (t) => {
  for (const changeScope of [false, true]) {
    let finish;
    const f = setup(t, (command) => command === "list" ? Promise.resolve(structuredClone(sample)) : new Promise((resolve) => { finish = resolve; }));
    await f.open(); f.button("新建标签").click();
    f.w.document.querySelector("input").value = "服装"; f.button("创建").click();
    f.c.close(); if (changeScope) f.scope("other");
    finish({ id: "new", name: "服装", space: "personal" }); await settle();
    assert.equal(f.created.length, changeScope ? 0 : 1);
    assert.equal(f.w.document.querySelector("dialog").open, false);
  }
});

test("a confirmed personal tag reaches its dictionary after switching only the browsed space", async (t) => {
  let finish;
  const f = setup(t, (command) => command === "list" ? Promise.resolve(structuredClone(sample)) : new Promise((resolve) => { finish = resolve; }),
    { getCatalogScopeKey: () => "same-account:canvas", canCreateTag: () => true });
  await f.open(); f.button("新建标签").click();
  f.w.document.querySelector("input").value = "服装"; f.button("创建").click();
  f.c.close(); f.scope("organization:canvas-a");
  finish({ id: "new", name: "服装", space: "personal" }); await settle();
  assert.equal(f.created.length, 1); assert.equal(f.created[0].space, "personal");
  assert.equal(f.w.document.querySelector("dialog").open, false);
});
