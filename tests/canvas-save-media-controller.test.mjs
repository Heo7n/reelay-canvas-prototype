import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const context = vm.createContext({ URL, Map, Set });
for (const name of ["canvas-save-media-controller", "canvas-media-library-coordinator", "canvas-asset-library-model"]) {
  new vm.Script(await readFile(new URL(`../src/legacy-canvas/${name}.js`, import.meta.url), "utf8")).runInContext(context);
}
const empty = () => ({ folders: [], tags: [], entries: [] });
const copy = (value) => JSON.parse(JSON.stringify(value));
const media = (extra = {}) => ({ id: "asset", type: "image", name: "原图", url: "/assets/photo.jpg", ...extra });

function harness(overrides = {}) {
  let options;
  let scope = "canvas-a";
  let catalog = empty();
  const calls = [];
  const notices = [];
  const imports = [];
  const snapshots = [];
  const folders = [];
  const tags = [];
  let imported = null;
  let saveFails = false;
  let mutable = true;
  const dialog = { open(value) { this.input = value; return overrides.open?.(value); }, setItems(value) { this.input.items = value; }, close() { options?.onClose(); }, destroy() {}, setCatalog() {}, updateItemsIdentity() {} };
  const controller = context.REELAY_CANVAS_SAVE_MEDIA_CONTROLLER.createSaveMediaController({
    document: {}, createDialog: (input) => { options = input; return dialog; },
    coordinator: { request: async (command, input) => {
      calls.push({ command, input });
      if (overrides.request) return overrides.request(command, input);
      if (command === "save" && saveFails) throw new Error("offline");
      return catalog;
    } },
    importer: { resolvePersonalMedia: () => imported,
      prepareMedia: async (values) => {
        imports.push(values);
        imported = { id: "persisted" };
        return { importedCount: 1, idMap: new Map([[values[0].id, imported.id]]) };
      }, ...overrides.importer },
    inspectSource: () => ({ allowed: true }), getScopeKey: () => scope, isMutable: () => mutable,
    onCatalog: (value) => { catalog = value; snapshots.push(value); }, onFolder: (value) => folders.push(value), onTag: (value) => tags.push(value), notify: (value) => notices.push(value),
  });
  return { controller, dialog, calls, notices, imports, snapshots, folders, tags, get options() { return options; },
    setScope(value) { scope = value; }, setFailure(value) { saveFails = value; }, setMutable(value) { mutable = value; } };
}

test("opening and cancelling save only creates a draft; duplicate node references collapse", () => {
  const h = harness();
  const source = media({ workspaceAssetId: "persisted" });
  h.controller.open([{ asset: source }, { asset: { ...source, id: "second-node-copy" } }]);
  assert.equal(h.dialog.input.items.length, 1);
  assert.equal(h.calls.length, 0);
  assert.equal(h.imports.length, 0);
  h.controller.close();
  assert.equal(h.calls.length, 0);
});

test("local library uploads pass purpose and final selected storage space while canonical save only adds a placement", async () => {
  const preparations = [];
  const h = harness({ importer: {
    resolvePersonalMedia: () => null,
    prepareMedia: async (values, options) => { preparations.push(options); return { importedCount: 1, idMap: new Map([[values[0].id, "new-asset"]]) }; },
  } });
  h.controller.open([{ asset: media() }], { intent: "upload", space: "personal" });
  await h.options.save({ space: "organization", folderId: null, tagIds: [], items: [{ key: "asset", displayName: "logo.svg", action: "add" }] });
  assert.equal(preparations[0].uploadPurpose, "library");
  assert.equal(preparations[0].storageSpace, "organization");
  h.controller.open([{ asset: media({ byteSize: 60 * 1024 * 1024, workspaceAssetId: "large-original" }) }]);
  await h.options.save({ space: "personal", folderId: null, tagIds: [], items: [{ key: "large-original", displayName: "large.gif", action: "add" }] });
  assert.equal(preparations.length, 1, "existing objects bypass local-upload format and size policy");
  h.controller.open([{ asset: media() }]);
  await h.options.save({ space: "personal", folderId: null, tagIds: [], items: [{ key: "asset", displayName: "canvas-result.png", action: "add" }] });
  assert.equal(preparations[1].uploadPurpose, "canvas");
});

test("empty upload draft accepts additions and removals without restarting its catalog or location", async () => {
  const h = harness();
  let chosen = 0;
  const removed = [];
  assert.equal(h.controller.open([], { intent: "upload", folderId: "leaf", onChooseFiles: () => chosen++, onRemoveItem: key => removed.push(key) }), true);
  assert.equal(h.imports.length, 0);
  await h.options.getCatalog();
  h.options.onChooseFiles();
  assert.equal(chosen, 1);
  h.controller.appendEntries([{ asset: media({ id: "first", workspaceAssetId: "first" }) }]);
  h.controller.appendEntries([{ asset: media({ id: "second", workspaceAssetId: "second" }) }]);
  assert.equal(h.dialog.input.folderId, "leaf");
  assert.equal(h.calls.length, 1, "file additions do not reload the catalog");
  h.options.onRemoveItem("first");
  assert.deepEqual(removed, ["first"]);
  assert.deepEqual(Array.from(h.dialog.input.items, item => item.key), ["second"]);
  await h.options.save({ space: "personal", folderId: "leaf", tagIds: ["builtin:scene"], items: h.dialog.input.items });
  assert.deepEqual(copy(h.calls.at(-1).input.items), [{ assetId: "second", displayName: "原图", action: "add" }]);
});

test("pending save rejects chooser additions and freezes the submitted selection", async () => {
  let finish;
  const h = harness({ request: command => command === "save" ? new Promise(resolve => { finish = resolve; }) : empty() });
  let chosen = 0;
  h.controller.open([{ asset: media({ workspaceAssetId: "saved" }) }], { intent: "upload", onChooseFiles: () => chosen++ });
  const pending = h.options.save({ space: "personal", folderId: null, tagIds: [], items: h.dialog.input.items });
  assert.throws(() => h.controller.appendEntries([{ asset: media({ id: "late" }) }]), /无法添加/);
  assert.equal(h.options.onRemoveItem("saved"), false);
  h.options.onChooseFiles();
  assert.equal(chosen, 0);
  finish(empty());
  await pending;
  h.options.onRemoveItem("saved");
  await assert.rejects(h.options.save({ items: [] }), /请先选择/);
});

test("a cancelled draft's late list cannot replace a newer dialog's saved catalog", async () => {
  let resolveOld;
  const oldRead = new Promise((resolve) => { resolveOld = resolve; });
  const beforeSave = { ...empty(), folders: [{ id: "current", name: "当前目录", space: "personal", parentId: null }] };
  const saved = { ...beforeSave, entries: [{ assetId: "persisted", displayName: "新名称", space: "personal", folderId: "current", tagIds: [] }] };
  let readCount = 0;
  const h = harness({ request: (command) => command === "list" ? (++readCount === 1 ? oldRead : beforeSave) : saved });
  const entries = [{ asset: media({ workspaceAssetId: "persisted" }) }];
  h.controller.open(entries);
  const rejected = assert.rejects(h.options.getCatalog(), /画布或访问权限/);
  h.controller.close();
  h.controller.open(entries);
  await h.options.getCatalog();
  await h.options.save({ space: "personal", folderId: "current", tagIds: [], items: h.dialog.input.items });
  assert.equal(h.snapshots.at(-1), saved);
  resolveOld(empty());
  await rejected;
  assert.equal(h.snapshots.at(-1), saved);
  assert.equal(h.snapshots.length, 2);
});

test("confirmed folder creation survives cancellation as an incremental result, but never crosses canvases", async () => {
  for (const changeScope of [false, true]) {
    let resolveFolder;
    const pending = new Promise((resolve) => { resolveFolder = resolve; });
    const h = harness({ request: (command) => command === "list" ? empty() : pending });
    h.controller.open([{ asset: media({ workspaceAssetId: "persisted" }) }]);
    await h.options.getCatalog();
    const rejected = assert.rejects(h.options.createFolder({ space: "personal", parentId: null, name: "已确认" }), /画布或访问权限/);
    h.controller.close();
    if (changeScope) h.setScope("canvas-b");
    const folder = { id: "created", name: "已确认", space: "personal", parentId: null };
    resolveFolder(folder);
    await rejected;
    assert.deepEqual(h.folders, changeScope ? [] : [folder]);
    assert.equal(h.snapshots.length, 1, "creation never replays the closed draft's full snapshot");
  }
});

test("confirmed tag creation updates the shared dictionary after cancelling the save draft", async () => {
  for (const changeScope of [false, true]) {
    let finish;
    const h = harness({ request: (command) => command === "list" ? empty() : new Promise((resolve) => { finish = resolve; }) });
    h.controller.open([{ asset: media({ workspaceAssetId: "persisted" }) }]);
    await h.options.getCatalog();
    const rejected = assert.rejects(h.options.createTag({ space: "personal", name: "已确认" }), /画布或访问权限/);
    h.controller.close(); if (changeScope) h.setScope("another-canvas");
    finish({ id: "confirmed", space: "personal", name: "已确认" }); await rejected;
    assert.equal(h.tags.length, changeScope ? 0 : 1);
    assert.equal(h.calls.some((call) => call.command === "save"), false);
  }
});

test("batch save preserves individual names and forwards explicit move preconditions", async () => {
  const h = harness();
  h.controller.open([{ asset: media({ workspaceAssetId: "one" }) }, { asset: media({ id: "two", name: "第二张", workspaceAssetId: "two" }) }]);
  await h.options.getCatalog();
  const items = h.dialog.input.items.map((item) => ({ ...item, action: "move", expectedFolderId: "old" }));
  await h.options.save({ space: "organization", folderId: "new", tagIds: ["builtin:scene"], items });
  assert.deepEqual(copy(h.calls.at(-1).input.items), [
    { assetId: "one", displayName: "原图", action: "move", expectedFolderId: "old" },
    { assetId: "two", displayName: "第二张", action: "move", expectedFolderId: "old" },
  ]);
  assert.equal(h.imports.length, 0);
});

test("failed save keeps imported identity and intended new folder across retry", async () => {
  const h = harness();
  h.controller.open([{ asset: media() }]);
  await h.options.getCatalog();
  const input = { space: "personal", folderId: "new", tagIds: [], items: h.dialog.input.items };
  h.setFailure(true);
  await assert.rejects(h.options.save(input), /offline/);
  h.setFailure(false);
  await h.options.save(input);
  assert.equal(h.imports.length, 1);
  assert.deepEqual(copy(h.calls.at(-1).input.items), [{ assetId: "persisted", displayName: "原图", action: "move", expectedFolderId: null }]);
});

test("batch add applies selected tags to its own newly uploaded root placement and preserves first identity", async () => {
  const h = harness();
  h.controller.open([{ asset: media() }, { asset: media({ id: 'duplicate-content', name: '后一个名称' }) }]);
  await h.options.getCatalog();
  await h.options.save({ space: 'personal', folderId: null, tagIds: ['builtin:object'],
    items: h.dialog.input.items.map(item => ({ ...item, action: 'add' })) });
  assert.deepEqual(copy(h.calls.at(-1).input.items), [{ assetId: 'persisted', displayName: '原图', action: 'save' }]);
  assert.deepEqual(copy(h.calls.at(-1).input.tagIds), ['builtin:object']);
  assert.equal(h.imports.length, 1);
});

test("a changed canvas rejects old save before upload or command", async () => {
  const h = harness();
  h.controller.open([{ asset: media() }]);
  h.setScope("canvas-b");
  await assert.rejects(h.options.save({ items: h.dialog.input.items }), /画布或访问权限/);
  assert.equal(h.imports.length, 0);
  assert.equal(h.calls.length, 0);
});

test("upload intent forwards the selected folder and cannot edit existing metadata even with a single item", async () => {
  const h = harness({ importer: { resolvePersonalMedia: () => ({ id: "persisted" }) } });
  h.controller.open([{ asset: media() }], { space: "organization", folderId: "selected", intent: "upload" });
  assert.equal(h.dialog.input.folderId, "selected");
  assert.equal(h.dialog.input.intent, "upload");
  await h.options.getCatalog();
  await h.options.save({ space: "personal", folderId: "new", tagIds: ["builtin:object"],
    items: h.dialog.input.items.map((item) => ({ ...item, action: "move", expectedFolderId: "old" })) });
  assert.deepEqual(copy(h.calls.at(-1).input.items), [{ assetId: "persisted", displayName: "原图", action: "add" }]);
  assert.equal(h.imports.length, 0);
});

test("upload content deduplication uses add while only this draft's new root placement can move", async () => {
  for (const importedCount of [0, 1]) {
    const h = harness({ importer: { resolvePersonalMedia: () => null,
      prepareMedia: async (values) => ({ importedCount, idMap: new Map([[values[0].id, "persisted"]]) }) } });
    h.controller.open([{ asset: media() }], { intent: "upload", folderId: "destination" });
    await h.options.getCatalog();
    await h.options.save({ space: "personal", folderId: "destination", tagIds: ["builtin:object"], items: h.dialog.input.items });
    assert.deepEqual(copy(h.calls.at(-1).input.items), [{ assetId: "persisted", displayName: "原图",
      action: importedCount ? "move" : "add", ...(importedCount ? { expectedFolderId: null } : {}) }]);
  }
});

test("an upload draft owns previews through a failed save and releases once on replacement, close or context loss", async () => {
  const h = harness();
  const released = [];
  const entries = [{ asset: media() }];
  h.controller.open(entries, { intent: "upload", onRelease: () => released.push("first") });
  h.setFailure(true);
  await assert.rejects(h.options.save({ space: "personal", folderId: null, tagIds: [], items: h.dialog.input.items }), /offline/);
  assert.deepEqual(released, []);
  h.controller.open(entries, { onRelease: () => released.push("second") });
  assert.deepEqual(released, ["first"]);
  h.controller.close(); h.controller.close();
  assert.deepEqual(released, ["first", "second"]);
  h.controller.open(entries, { onRelease: () => released.push("third") });
  h.setScope("canvas-b"); h.controller.syncContext();
  assert.deepEqual(released, ["first", "second", "third"]);
  h.controller.open(entries, { onRelease: () => released.push("fourth") });
  h.setMutable(false); h.controller.syncContext();
  assert.deepEqual(released, ["first", "second", "third", "fourth"]);
  assert.equal(h.controller.open(entries, { onRelease: () => released.push("rejected") }), false);
  assert.equal(released.at(-1), "rejected");
});

test("save success closes and releases the draft, and failed dialog opening releases immediately", async () => {
  const h = harness();
  let released = 0;
  h.controller.open([{ asset: media({ workspaceAssetId: "known" }) }], { intent: "upload", onRelease: () => { released += 1; } });
  const result = await h.options.save({ space: "personal", folderId: null, tagIds: [], items: h.dialog.input.items });
  h.options.onSaved(result); h.options.onClose();
  assert.equal(released, 1); assert.equal(h.controller.isOpen(), false);
  for (const outcome of [false, "throw"]) {
    const failure = harness({ open() { if (outcome === "throw") throw new Error("unavailable"); return false; } });
    const input = { onRelease: () => { released += 1; } };
    if (outcome === "throw") assert.throws(() => failure.controller.open([{ asset: media() }], input), /unavailable/);
    else assert.equal(failure.controller.open([{ asset: media() }], input), false);
    assert.equal(failure.controller.isOpen(), false);
  }
  assert.equal(released, 3);
});

test("catalog projections preserve separate personal and organization names, tags and placement", () => {
  const store = context.REELAY_CANVAS_ASSET_LIBRARY_MODEL.createAssetLibraryStore();
  const record = media({ workspaceAssetId: "asset", mediaKind: "image" });
  const catalog = {
    media: [record], folders: [{ id: "folder", parentId: null, name: "参考", space: "organization" }], tags: [],
    entries: [
      { assetId: "asset", space: "personal", folderId: null, displayName: "个人名称", tagIds: ["builtin:character"] },
      { assetId: "asset", space: "organization", folderId: "folder", displayName: "团队名称", tagIds: ["builtin:scene"] },
    ],
  };
  store.syncPersistedCatalog(catalog);
  store.syncPersistedCatalog(catalog);
  assert.equal(store.listItems({ space: "personal" })[0].displayName, "个人名称");
  assert.equal(store.listItems({ space: "organization", folderId: "folder" })[0].displayName, "团队名称");
  assert.deepEqual(copy(store.getMedia({ id: "asset", kind: "media", space: "organization" }).tags), ["场景"]);
  assert.equal(store.listItems({ space: "personal", query: "团队名称" }).length, 0);
  assert.equal(store.listItems({ space: "organization", query: "场景" }).length, 1);
  assert.throws(() => store.renameFolder({ folderId: "folder", name: "无效本地改名", space: "organization" }), /尚未开放/);
  const before = copy(store.snapshot());
  assert.throws(() => store.syncPersistedCatalog({ ...catalog, entries: [{ ...catalog.entries[0], folderId: "missing" }] }), /Folder/);
  assert.deepEqual(copy(store.snapshot()), before);
});

test("library bridge ignores foreign origin, instance and mismatched commands", async () => {
  const host = {};
  const sent = [];
  const coordinator = context.REELAY_CANVAS_MEDIA_LIBRARY_COORDINATOR.createMediaLibraryCoordinator({
    instanceId: "instance", isHosted: () => true, makeRequestId: () => "request", postMessage: (value) => sent.push(value),
    getExpectedSource: () => host, getExpectedOrigin: () => "https://reelay.test", setTimer: () => 1, clearTimer() {},
  });
  const pending = coordinator.request("list");
  const event = { source: host, origin: "https://reelay.test", data: { source: "reelay-shell", type: "host:media-library-result",
    protocolVersion: 1, instanceId: "instance", requestId: "request", command: "list", result: empty() } };
  assert.equal(coordinator.handleHostMessage({ ...event, origin: "https://other.test" }), false);
  assert.equal(coordinator.handleHostMessage({ ...event, data: { ...event.data, instanceId: "old" } }), false);
  assert.equal(coordinator.handleHostMessage({ ...event, data: { ...event.data, command: "save" } }), false);
  assert.equal(coordinator.handleHostMessage(event), true);
  assert.deepEqual(copy(await pending), empty());
  assert.equal(sent.length, 1);
});
