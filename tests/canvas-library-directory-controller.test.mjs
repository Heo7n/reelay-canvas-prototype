import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const context = vm.createContext({ Map, Set, WeakMap });
new vm.Script(await readFile(new URL("../src/legacy-canvas/canvas-library-directory-controller.js", import.meta.url), "utf8")).runInContext(context);
const create = context.REELAY_CANVAS_LIBRARY_DIRECTORY_CONTROLLER.createLibraryDirectoryController;
const copy = value => JSON.parse(JSON.stringify(value));
const folder = (id, parentId = null, name = id, space = "personal") => ({ id, parentId, name, space });

function harness({ folders = [], request } = {}) {
  let scope = "project-a/canvas-a";
  let space = "personal";
  let currentFolderId = null;
  let createAllowed = true;
  let renameAllowed = true;
  const spacePermissions = new Map();
  const calls = [], snapshots = [], changes = [], published = [], created = [], errors = [];
  const controller = create({
    getScopeKey: () => scope, getSpace: () => space, getFolders: () => folders,
    getCurrentFolderId: () => currentFolderId,
    canCreate: targetSpace => createAllowed && (spacePermissions.get(`${targetSpace}:create`) ?? true),
    canRename: targetSpace => renameAllowed && (spacePermissions.get(`${targetSpace}:rename`) ?? true),
    request: async (command, payload) => {
      calls.push({ command, payload: copy(payload) });
      return request ? request(command, payload) : folder(payload.folderId || `new-${calls.length}`, payload.parentId ?? folders.find(item => item.id === payload.folderId)?.parentId ?? null, payload.name, payload.space);
    },
    onFolder: value => { published.push(copy(value)); folders = [...folders.filter(item => item.id !== value.id), value]; },
    onDraftChange: (value, change) => { snapshots.push(value ? copy(value) : null); changes.push(copy(change)); },
    onCreated: value => created.push(copy(value)), onError: value => errors.push(value),
  });
  return { controller, calls, snapshots, changes, published, created, errors,
    setScope(value) { scope = value; }, setSpace(value) { space = value; },
    setCurrentFolder(value) { currentFolderId = value; }, setFolders(value) { folders = value; },
    setCreateAllowed(value) { createAllowed = value; }, setRenameAllowed(value) { renameAllowed = value; },
    setPermission(targetSpace, kind, value) { spacePermissions.set(`${targetSpace}:${kind}`, value); } };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

test("directory editing is a draft until explicit confirmation and cannot mutate the exposed snapshot", async () => {
  const h = harness({ folders: [folder("parent")] });
  h.setCurrentFolder("parent");
  assert.equal(h.controller.beginCreate(), true);
  assert.deepEqual(copy(h.controller.getDraft()), { kind: "create", space: "personal", parentId: "parent", folderId: null, expectedName: null, name: "", error: null, pending: false, scope: "project-a/canvas-a" });
  assert.equal(h.calls.length, 0);
  const snapshot = h.controller.getDraft();
  assert.throws(() => { snapshot.name = "mutation"; }, TypeError);
  h.controller.setName("  我的目录  ");
  assert.equal(h.calls.length, 0);
  const saved = await h.controller.commit();
  assert.deepEqual(h.calls, [{ command: "create-folder", payload: { space: "personal", parentId: "parent", name: "我的目录" } }]);
  assert.deepEqual(h.published, [copy(saved)]);
  assert.deepEqual(h.created, [copy(saved)]);
  assert.equal(h.controller.getDraft(), null);
  h.controller.beginCreate(null);
  h.controller.setName("取消的目录");
  assert.equal(h.controller.cancel(), true);
  assert.equal(h.calls.length, 1);
  assert.equal(h.controller.getDraft(), null);
});

test("empty, invalid, and normalized duplicate names stay inline without requests", async () => {
  const h = harness({ folders: [folder("a", null, "Alpha"), folder("other-scope", null, "自由", "organization"), folder("parent"), folder("child", "parent", "同名") ] });
  h.controller.beginCreate(null);
  for (const value of ["   ", "A".repeat(101), "bad\nname", "ＡＬＰＨＡ"]) {
    h.controller.setName(value);
    assert.equal(await h.controller.commit(), null);
    assert.equal(h.controller.getDraft().name, value);
    assert.ok(h.controller.getDraft().error);
    assert.equal(h.controller.getDraft().pending, false);
  }
  assert.equal(h.calls.length, 0);
  h.controller.setName("自由");
  assert.equal(h.controller.getDraft().error, null);
  await h.controller.commit();
  h.controller.beginCreate(null);
  h.controller.setName("同名");
  await h.controller.commit();
  assert.equal(h.calls.length, 2, "other scopes and non-sibling names do not conflict");
});

test("root plus four folder levels is the limit and missing or cyclic parents are rejected", async () => {
  const h = harness({ folders: [folder("one"), folder("two", "one"), folder("three", "two"), folder("four", "three")] });
  assert.equal(h.controller.beginCreate("three"), true);
  h.controller.setName("另一末级");
  await h.controller.commit();
  assert.equal(h.controller.beginCreate("four"), false);
  assert.match(h.errors.at(-1), /最多支持五级/);
  assert.equal(h.controller.beginCreate("missing"), false);
  h.setFolders([folder("cycle", "cycle")]);
  assert.equal(h.controller.beginCreate("cycle"), false);
  assert.equal(h.calls.length, 1);
  assert.equal(h.controller.getDraft(), null);
});

test("rename excludes itself from sibling conflicts, skips unchanged names, and sends the original precondition", async () => {
  const h = harness({ folders: [folder("one", null, "原名称"), folder("two", null, "占用名称")] });
  assert.equal(h.controller.beginRename("one"), true);
  h.controller.setName("  原名称  ");
  assert.equal(await h.controller.commit(), null);
  assert.equal(h.controller.getDraft(), null);
  assert.equal(h.calls.length, 0);
  h.controller.beginRename("one");
  h.controller.setName("占用名称");
  await h.controller.commit();
  assert.match(h.controller.getDraft().error, /同名/);
  h.controller.setName("新名称");
  await h.controller.commit();
  assert.deepEqual(h.calls, [{ command: "rename-folder", payload: { space: "personal", folderId: "one", name: "新名称", expectedName: "原名称" } }]);
  assert.equal(h.controller.getDraft(), null);
  assert.equal(h.created.length, 0, "renaming does not select or navigate to another folder");
});

test("pending confirmation freezes the submitted draft and a failed request preserves its text for retry", async () => {
  const first = deferred();
  let attempt = 0;
  const h = harness({ folders: [folder("one")], request: (_command, payload) => ++attempt === 1 ? first.promise : folder("saved", payload.parentId, payload.name) });
  h.controller.beginCreate("one");
  h.controller.setName("保留草稿");
  const pending = h.controller.commit();
  assert.equal(h.controller.getDraft().pending, true);
  assert.equal(h.controller.setName("不能替换"), false);
  assert.equal(h.controller.beginCreate(null), false);
  assert.equal(h.controller.beginRename("one"), false);
  assert.equal(await h.controller.commit(), null);
  assert.equal(h.calls.length, 1);
  first.reject(new Error("连接中断"));
  assert.equal(await pending, null);
  assert.equal(h.controller.getDraft().name, "保留草稿");
  assert.equal(h.controller.getDraft().error, "连接中断");
  assert.equal(h.controller.getDraft().pending, false);
  await h.controller.commit();
  assert.equal(h.calls.length, 2);
  assert.equal(h.controller.getDraft(), null);
});

test("cancelled confirmed creation still updates its catalog but never replaces a newer draft or changes selection", async () => {
  const waiting = deferred();
  const h = harness({ request: () => waiting.promise });
  h.controller.beginCreate(null);
  h.controller.setName("已经确认");
  const pending = h.controller.commit();
  h.controller.cancel();
  h.controller.beginCreate(null);
  h.controller.setName("新的草稿");
  waiting.resolve(folder("confirmed", null, "已经确认"));
  await pending;
  assert.equal(h.published.length, 1);
  assert.equal(h.created.length, 0);
  assert.equal(h.controller.getDraft().name, "新的草稿");
  assert.equal(h.controller.getDraft().pending, false);
  assert.equal(h.errors.length, 0);
});

test("late failures from cancelled drafts are silent", async () => {
  const waiting = deferred();
  const h = harness({ request: () => waiting.promise });
  h.controller.beginCreate(null);
  h.controller.setName("旧请求");
  const pending = h.controller.commit();
  h.controller.cancel();
  waiting.reject(new Error("旧错误"));
  await pending;
  assert.equal(h.errors.length, 0);
  assert.equal(h.published.length, 0);
});

test("scope and permission loss discard old drafts and callbacks even after returning", async () => {
  for (const change of ["scope", "permission"]) {
    const waiting = deferred();
    const h = harness({ request: () => waiting.promise });
    h.controller.beginCreate(null);
    h.controller.setName("旧目录");
    const pending = h.controller.commit();
    if (change === "scope") h.setScope("canvas-b");
    else h.setCreateAllowed(false);
    assert.equal(h.controller.syncContext(), true);
    assert.equal(h.controller.getDraft(), null);
    h.setScope("project-a/canvas-a"); h.setSpace("personal"); h.setCreateAllowed(true);
    h.controller.syncContext();
    waiting.resolve(folder("old", null, "旧目录"));
    assert.equal(await pending, null);
    assert.equal(h.published.length, 0);
    assert.equal(h.created.length, 0);
  }
});

test("input notifications preserve the form while validation and command state notify structure changes", async () => {
  const h = harness();
  h.controller.beginCreate(null);
  assert.deepEqual(h.changes.at(-1), { reason: "structure" });
  await h.controller.commit();
  assert.ok(h.controller.getDraft().error);
  assert.deepEqual(h.changes.at(-1), { reason: "structure" });
  for (const name of ["pin", "拼", "拼音输入"]) {
    h.controller.setName(name);
    assert.deepEqual(h.changes.at(-1), { reason: "input" });
    assert.equal(h.controller.getDraft().name, name);
    assert.equal(h.controller.getDraft().error, null);
  }
  await h.controller.commit();
  assert.deepEqual(h.changes.slice(-2), [{ reason: "structure" }, { reason: "structure" }]);
});

test("switching panel space keeps confirmed create and rename projections without navigation or changing the new draft", async () => {
  for (const kind of ["create", "rename"]) {
    const waiting = deferred();
    const h = harness({ folders: [folder("existing", null, "原目录")], request: () => waiting.promise });
    if (kind === "create") h.controller.beginCreate(null);
    else h.controller.beginRename("existing");
    h.controller.setName("已确认个人目录");
    const pending = h.controller.commit();
    h.setSpace("organization");
    assert.equal(h.controller.syncContext(), true);
    assert.equal(h.controller.getDraft(), null);
    h.controller.beginCreate(null);
    h.controller.setName("组织新草稿");
    const result = folder(kind === "create" ? "created" : "existing", null, "已确认个人目录");
    waiting.resolve(result);
    assert.deepEqual(copy(await pending), result);
    assert.deepEqual(h.published, [result]);
    assert.equal(h.created.length, 0);
    assert.equal(h.controller.getDraft().space, "organization");
    assert.equal(h.controller.getDraft().name, "组织新草稿");
    assert.equal(h.controller.getDraft().pending, false);
  }
});

test("a hidden original space losing permission prevents its confirmed projection but leaves the active space draft intact", async () => {
  for (const kind of ["create", "rename"]) {
    const waiting = deferred();
    const h = harness({ folders: [folder("existing", null, "原目录")], request: () => waiting.promise });
    if (kind === "create") h.controller.beginCreate(null);
    else h.controller.beginRename("existing");
    h.controller.setName("旧请求");
    const pending = h.controller.commit();
    h.setSpace("organization");
    h.controller.syncContext();
    h.controller.beginCreate(null);
    h.controller.setName("仍有权限的组织草稿");
    h.setPermission("personal", kind, false);
    h.controller.syncContext();
    h.setPermission("personal", kind, true);
    h.controller.syncContext();
    waiting.resolve(folder(kind === "create" ? "created" : "existing", null, "旧请求"));
    assert.equal(await pending, null);
    assert.equal(h.published.length, 0);
    assert.equal(h.created.length, 0);
    assert.equal(h.controller.getDraft().name, "仍有权限的组织草稿");
  }
});

test("organization contribution and folder administration use independent capabilities", async () => {
  const h = harness({ folders: [folder("org", null, "组织目录", "organization")] });
  h.setSpace("organization");
  h.setRenameAllowed(false);
  assert.equal(h.controller.beginCreate(null), true);
  h.controller.setName("成员创建");
  await h.controller.commit();
  assert.equal(h.controller.beginRename("org"), false);
  h.setSpace("platform");
  assert.equal(h.controller.beginCreate(null), false);
  assert.equal(h.calls.length, 1);
});

test("catalog changes are validated again on commit and cannot silently rename a changed folder", async () => {
  const h = harness({ folders: [folder("parent"), folder("one", "parent", "初始名称")] });
  h.controller.beginRename("one");
  h.controller.setName("我的名称");
  h.setFolders([folder("parent"), folder("one", "parent", "他人新名称")]);
  assert.equal(await h.controller.commit(), null);
  assert.equal(h.controller.getDraft().name, "我的名称");
  assert.match(h.controller.getDraft().error, /已变化/);
  assert.equal(h.calls.length, 0);
  h.controller.cancel();
  h.controller.beginCreate("parent");
  h.controller.setName("新目录");
  h.setFolders([]);
  assert.equal(await h.controller.commit(), null);
  assert.ok(h.controller.getDraft().error);
  assert.equal(h.calls.length, 0);
});

test("an older rename result cannot overwrite a newer observed catalog name", async () => {
  const waiting = deferred();
  const h = harness({ folders: [folder("one", null, "最初名称")], request: () => waiting.promise });
  h.controller.beginRename("one");
  h.controller.setName("第一个名称");
  const pending = h.controller.commit();
  h.controller.cancel();
  h.setFolders([folder("one", null, "更晚的名称")]);
  waiting.resolve(folder("one", null, "第一个名称"));
  await pending;
  assert.equal(h.published.length, 0);
  assert.equal(h.created.length, 0);
});

test("destroy prevents pending writes from publishing into the next mounted view", async () => {
  const waiting = deferred();
  const h = harness({ request: () => waiting.promise });
  h.controller.beginCreate(null);
  h.controller.setName("待完成");
  const pending = h.controller.commit();
  h.controller.destroy();
  waiting.resolve(folder("old", null, "待完成"));
  assert.equal(await pending, null);
  assert.equal(h.published.length, 0);
  assert.equal(h.controller.beginCreate(null), false);
  assert.equal(h.controller.getDraft(), null);
});
