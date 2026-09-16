import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";
import { require as requireTs } from "tsx/cjs/api";
const { buildMediaUploadPolicy } = requireTs("../src/domain/asset/media-upload-policy.ts", import.meta.url);

const source = await readFile(new URL("../src/legacy-canvas/canvas-save-media-dialog.js", import.meta.url), "utf8");
const fileNameSource = await readFile(new URL("../src/legacy-canvas/canvas-file-name.js", import.meta.url), "utf8");
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const sampleItem = { key: "node-1", assetId: "asset-1", displayName: "海边镜头", mediaKind: "image", url: "/sample.jpg" };
const sampleCatalog = {
  folders: [
    { id: "f1", name: "角色参考", parentId: null, space: "personal" },
    { id: "f2", name: "主角", parentId: "f1", space: "personal" },
    { id: "f3", name: "服装", parentId: "f2", space: "personal" },
    { id: "f4", name: "夏季", parentId: "f3", space: "personal" },
    { id: "o1", name: "品牌", parentId: null, space: "organization" },
  ],
  tags: [{ id: "p-tag", name: "私人收藏", space: "personal" }, { id: "o-tag", name: "品牌素材", space: "organization" }],
  entries: [],
};

test("upload format hint is projected from actual policy with SVG override and no hint on canonical save", async (t) => {
  const f = fixture(t);
  f.controller.open({ items: [], intent: "upload", uploadPolicy: buildMediaUploadPolicy(64 * 1024 * 1024) });
  await settle();
  const hint = f.document.querySelector('[aria-label="支持的文件格式"]');
  assert.equal(hint.hidden, true);
  assert.ok(f.document.querySelector(".save-media-header").contains(f.button("格式与限制")));
  assert.equal(f.document.querySelector(".save-media-fields").contains(hint), false);
  f.button("格式与限制").click();
  assert.equal(hint.hidden, false);
  assert.equal(hint.querySelectorAll("li").length, 3);
  assert.match(hint.textContent, /SVG/); assert.match(hint.textContent, /WEBM/);
  assert.match(hint.textContent, /50 MB（SVG 4 MB）/);
  f.controller.close();
  f.controller.open({ items: [], intent: "upload", uploadPolicy: buildMediaUploadPolicy(4 * 1024 * 1024) });
  await settle();
  assert.match(hint.textContent, /单个文件不超过 4 MB$/);
  f.controller.close(); await f.open();
  assert.equal(hint.hidden, true);
  assert.equal(f.document.querySelector(".save-media-upload-help").hidden, true);
});

test("upload help supports hover, pinned reading and layered Escape without losing the upload draft", async (t) => {
  const f = fixture(t);
  f.controller.open({ items: [sampleItem], intent: "upload", uploadPolicy: buildMediaUploadPolicy(64 * 1024 * 1024) });
  await settle();
  const help = f.document.querySelector(".save-media-upload-help");
  const hint = f.document.getElementById("save-media-upload-hint");
  const trigger = f.button("格式与限制");
  const enter = () => help.dispatchEvent(new f.window.MouseEvent("pointerenter"));
  const leave = () => help.dispatchEvent(new f.window.MouseEvent("pointerleave"));
  enter();
  assert.equal(hint.hidden, false);
  assert.equal(trigger.getAttribute("aria-expanded"), "true");
  leave();
  assert.equal(hint.hidden, true);
  enter(); trigger.click(); leave();
  assert.equal(hint.hidden, false, "a click pins the already hovered content");
  trigger.click();
  assert.equal(hint.hidden, true);
  trigger.focus();
  assert.equal(hint.hidden, false, "keyboard focus reveals the policy");
  f.key(trigger, "Escape");
  assert.equal(hint.hidden, true);
  assert.equal(f.controller.isOpen(), true);
  assert.equal(f.document.activeElement, trigger);
  assert.equal(f.document.querySelectorAll(".save-media-batch-item").length, 1);
  trigger.click();
  f.document.querySelector(".save-media-body").dispatchEvent(new f.window.MouseEvent("pointerdown", { bubbles: true }));
  assert.equal(hint.hidden, true);
  assert.equal(f.saved.length, 0);
  f.controller.close();
  f.controller.open({ items: [], intent: "upload", uploadPolicy: buildMediaUploadPolicy(4 * 1024 * 1024) });
  assert.equal(hint.hidden, true, "reopening never retains a pinned tooltip");
  assert.equal(trigger.getAttribute("aria-expanded"), "false");
});

test("upload help respects directory and tag popups and closes on keyboard departure", async (t) => {
  const f = fixture(t);
  f.controller.open({ items: [], intent: "upload", uploadPolicy: buildMediaUploadPolicy(64 * 1024 * 1024) });
  await settle();
  const hint = f.document.getElementById("save-media-upload-hint");
  const trigger = f.button("格式与限制");
  trigger.focus();
  assert.equal(hint.hidden, false);
  f.button("选择本地文件").focus();
  assert.equal(hint.hidden, true);
  trigger.click();
  f.location();
  assert.equal(hint.hidden, true);
  assert.equal(f.document.querySelector(".save-media-popup").hidden, false);
  f.document.querySelector(".save-media-upload-help").dispatchEvent(new f.window.MouseEvent("pointerenter"));
  assert.equal(hint.hidden, true, "incidental hovering cannot dismiss an active directory editor");
  trigger.click();
  assert.equal(hint.hidden, false);
  assert.equal(f.document.querySelector(".save-media-popup").hidden, true);
  f.tags();
  assert.equal(hint.hidden, true);
  assert.equal(f.document.querySelector(".save-media-popup").hidden, false);
});

function fixture(t, overrides = {}) {
  const dom = new JSDOM('<button id="opener">保存到素材</button>', { runScripts: "outside-only" });
  const { window } = dom;
  const { document } = window;
  window.HTMLDialogElement.prototype.showModal = function showModal() { this.open = true; };
  window.HTMLDialogElement.prototype.close = function close() { this.open = false; };
  window.HTMLMediaElement.prototype.pause = function pause() {};
  window.HTMLMediaElement.prototype.load = function load() {};
  window.eval(fileNameSource);
  window.eval(source);
  const saved = [];
  const foldersCreated = [];
  const tagsCreated = [];
  const confirmations = [];
  const deletionConfirmations = [];
  let closed = 0;
  let catalog = structuredClone(sampleCatalog);
  const api = window.REELAY_CANVAS_SAVE_MEDIA_DIALOG;
  const controller = api.createSaveMediaDialog({
    document,
    getCatalog: async () => catalog,
    createFolder: async (input) => { foldersCreated.push(input); const folder = { ...input, id: `folder-${foldersCreated.length}` }; catalog.folders.push(folder); return folder; },
    createTag: async (input) => { tagsCreated.push(input); const tag = { ...input, id: `tag-${tagsCreated.length}` }; catalog.tags.push(tag); return tag; },
    canManageFolders: () => true,
    renameFolder: async (input) => {
      const folder = catalog.folders.find((item) => item.id === input.folderId && item.space === input.space);
      assert.equal(folder.name, input.expectedName);
      folder.name = input.name;
      return { ...folder };
    },
    deleteFolder: async ({ folderId }) => {
      const removed = new Set([folderId]);
      for (const folder of catalog.folders) if (removed.has(folder.parentId)) removed.add(folder.id);
      catalog = { ...catalog, folders: catalog.folders.filter((folder) => !removed.has(folder.id)) };
      return catalog;
    },
    confirmDeleteFolder: (input) => { deletionConfirmations.push(input); return input.onCancel; },
    save: async (input) => { saved.push(input); return catalog; },
    confirmMove: (input) => { confirmations.push(input); return input.onCancel; },
    onClose: () => { closed += 1; },
    ...overrides,
  });
  t.after(() => { controller.destroy(); window.close(); });
  const button = (label) => [...document.querySelectorAll("button")].find((node) => node.getAttribute("aria-label") === label);
  return {
    window, document, api, controller, saved, foldersCreated, tagsCreated, confirmations, deletionConfirmations, button,
    get closed() { return closed; },
    get catalog() { return catalog; },
    set catalog(value) { catalog = value; },
    input(label, value) {
      const node = [...document.querySelectorAll("input")].find((item) => item.getAttribute("aria-label") === label);
      assert.ok(node, `input ${label} exists`);
      node.value = value;
      node.dispatchEvent(new window.Event("input", { bubbles: true }));
      return node;
    },
    key(node, key, extra = {}) {
      const event = new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...extra });
      node.dispatchEvent(event); return event;
    },
    async open(items = [sampleItem], space) {
      document.getElementById("opener").focus();
      controller.open({ items, space });
      await settle();
      return document.querySelector("dialog");
    },
    location() { document.querySelector(".save-media-location").click(); },
    tags() { button("选择标签").click(); },
  };
}

test("location path keeps the full path when it fits and exactly space, ellipsis, leaf otherwise", (t) => {
  const f = fixture(t);
  const labels = f.api.getPathLabels(sampleCatalog.folders, "personal", "f4");
  assert.deepEqual([...labels], ["个人", "角色参考", "主角", "服装", "夏季"]);
  assert.deepEqual([...f.api.compactPath(labels, 100, (text) => text.length)], [...labels]);
  assert.deepEqual([...f.api.compactPath(labels, 22, (text) => text.length)], ["个人", "…", "夏季"]);
  assert.deepEqual([...f.api.compactPath(labels, 10, (text) => text.length)], ["个人", "…", "夏季"]);
  assert.deepEqual([...f.api.compactPath(["组织", "品牌", "季节", "春季活动视觉参考"], 8, (text) => text.length)], ["组织", "…", "春季活动视觉参考"]);
  assert.equal(f.api.getFolderPath([...sampleCatalog.folders, { id: "cycle", parentId: "cycle", space: "personal", name: "循环" }], "personal", "cycle").length, 1);
});

test("folder disclosure only expands; selecting a directory changes destination with full accessible path", async (t) => {
  const f = fixture(t);
  await f.open();
  f.location();
  f.button("展开 角色参考").click();
  assert.ok(f.button("保存到 主角"));
  assert.equal(f.document.querySelector(".save-media-location").title, "个人 / 默认目录");
  f.button("保存到 主角").click();
  assert.equal(f.document.querySelector(".save-media-location").title, "个人 / 角色参考 / 主角");
  assert.equal(f.document.getElementById("save-media-full-path").textContent, "个人 / 角色参考 / 主角");
  f.button("保存").click();
  await settle();
  assert.equal(f.saved[0].folderId, "f2");
  assert.equal(f.saved[0].items[0].displayName, "海边镜头");
  assert.equal(f.saved[0].items[0].action, "save");
  assert.equal(f.document.activeElement.id, "opener");
});

test("inline folder creation validates drafts, handles IME, persists only after confirmation and selects the result", async (t) => {
  const f = fixture(t);
  await f.open();
  f.location();
  f.button("在 默认目录 中新建文件夹").click();
  assert.equal(f.foldersCreated.length, 0);
  f.button("确认新建文件夹").click();
  assert.match(f.document.querySelector(".save-media-inline-error").textContent, /请输入/);
  f.input("文件夹名称", "  角色参考  ");
  f.button("确认新建文件夹").click();
  assert.match(f.document.querySelector(".save-media-inline-error").textContent, /同名/);
  let input = f.input("文件夹名称", "新的参考");
  f.key(input, "Enter", { isComposing: true });
  assert.equal(f.foldersCreated.length, 0);
  f.key(input, "Enter");
  await settle();
  assert.equal(f.foldersCreated[0].parentId, null);
  assert.equal(f.foldersCreated[0].name, "新的参考");
  assert.equal(f.document.querySelector(".save-media-location").title, "个人 / 新的参考");
  f.button("取消").click();
  assert.equal(f.saved.length, 0);
  assert.ok(f.catalog.folders.some((folder) => folder.name === "新的参考"));
});

test("folder plus creates at its row and the fifth directory level has no further child creation", async (t) => {
  const f = fixture(t);
  await f.open(); f.location();
  f.button("在 角色参考 中新建文件夹").click();
  f.input("文件夹名称", "配角"); f.button("确认新建文件夹").click(); await settle();
  assert.equal(f.foldersCreated[0].parentId, "f1");
  f.button("展开 主角").click();
  f.button("展开 服装").click();
  assert.equal(f.button("最多支持 5 级目录").disabled, true);
  f.button("保存到 夏季").click();
  assert.equal(f.document.querySelector(".save-media-location").title, "个人 / 角色参考 / 主角 / 服装 / 夏季");
});

test("tags offer three builtins, reuse matching tags, and drop personal custom choices when switching spaces", async (t) => {
  const f = fixture(t);
  await f.open(); f.tags();
  assert.deepEqual([...f.document.querySelectorAll('[data-tag-id^="builtin:"]')].map((node) => node.textContent), ["角色", "场景", "物品"]);
  f.button("角色").click(); f.button("私人收藏").click();
  f.button("新建标签").click(); f.input("标签名称", "角色"); f.button("确认新建标签").click();
  assert.equal(f.tagsCreated.length, 0);
  f.button("新建标签").click(); f.input("标签名称", "纪录片"); f.button("确认新建标签").click(); await settle();
  assert.equal(f.tagsCreated[0].space, "personal");
  assert.equal(f.document.querySelector(".save-media-tags-value").textContent, "角色、私人收藏、纪录片");
  assert.equal(f.document.querySelector(".save-media-tags-toggle").title, "角色、私人收藏、纪录片");
  f.location(); f.button("组织").click();
  assert.equal(f.document.querySelector(".save-media-tags-value").textContent, "角色");
  assert.equal(f.document.querySelectorAll(".save-media-tag-chip, .save-media-chip-remove").length, 0);
  f.button("保存到 品牌").click();
  f.button("保存").click(); await settle();
  assert.equal(f.saved[0].space, "organization");
  assert.deepEqual([...f.saved[0].tagIds], ["builtin:character"]);
});

test("existing placement hydrates its metadata and moving requires an explicit acknowledgment", async (t) => {
  const f = fixture(t);
  f.catalog.entries.push({ assetId: "asset-1", space: "personal", folderId: "f2", displayName: "素材库名称", tagIds: ["builtin:scene"] });
  await f.open();
  assert.equal(f.document.getElementById("save-media-name").value, "素材库名称");
  assert.equal(f.document.querySelector(".save-media-location").title, "个人 / 角色参考 / 主角");
  assert.equal(f.confirmations.length, 0);
  f.location(); f.button("保存到 默认目录").click();
  assert.equal(f.document.querySelector(".save-media-primary").disabled, false);
  f.document.querySelector(".save-media-primary").click();
  assert.equal(f.saved.length, 0);
  assert.equal(f.confirmations[0].count, 1);
  assert.equal(f.confirmations[0].destination, "个人 / 默认目录");
  f.confirmations[0].onConfirm(); await settle();
  assert.equal(f.saved[0].items[0].action, "move");
  assert.equal(f.saved[0].items[0].expectedFolderId, "f2");
  assert.equal(sampleItem.displayName, "海边镜头");
});

test("batch saves preserve each asset identity and name while sharing destination and tags", async (t) => {
  const f = fixture(t);
  await f.open([sampleItem, { ...sampleItem, key: "node-2", assetId: "asset-2", displayName: "城市镜头" }]);
  assert.equal(f.document.getElementById("save-media-name").hidden, true);
  f.tags(); f.button("场景").click();
  f.button("保存").click(); await settle();
  assert.deepEqual(f.saved[0].items.map((item) => item.displayName), ["海边镜头", "城市镜头"]);
  assert.deepEqual([...f.saved[0].tagIds], ["builtin:scene"]);
  assert.equal(f.saved[0].items.length, 2);
  assert.ok(f.saved[0].items.every((item) => item.action === "add"));
});

test("batch preview shows all names and thumbnails without loading media players and resets for single save", async (t) => {
  const f = fixture(t);
  const items = Array.from({ length: 14 }, (_, index) => ({ ...sampleItem, key: `node-${index}`, assetId: `asset-${index}`, displayName: `参考素材 ${index + 1}` }));
  items[1] = { ...items[1], mediaKind: "video", thumbnailUrl: "/video-poster.jpg", url: "/video.mp4" };
  items[2] = { ...items[2], mediaKind: "audio", thumbnailUrl: undefined, url: "/sound.mp3" };
  await f.open(items);
  const region = f.document.querySelector('[aria-label="所选素材"]');
  assert.equal(region.hidden, false);
  assert.equal(region.tabIndex, 0);
  assert.deepEqual([...region.querySelectorAll('.save-media-preview-name')].map((node) => node.textContent), items.map((item) => item.displayName));
  assert.equal(region.querySelectorAll('li').length, 14);
  assert.equal(region.querySelector('video, audio'), null);
  assert.equal(region.querySelectorAll('li')[1].querySelector('img').getAttribute('src'), '/video-poster.jpg');
  assert.equal(region.querySelectorAll('li')[2].textContent, '音频参考素材 3');
  assert.equal(f.document.getElementById('save-media-name').parentElement.hidden, true);
  region.querySelector('img').dispatchEvent(new f.window.Event('error'));
  assert.equal(region.querySelector('li').querySelector('img'), null);
  assert.ok(region.querySelector('li').querySelector('svg'));
  f.controller.close();
  assert.equal(region.querySelectorAll('li').length, 0);
  await f.open();
  assert.equal(region.hidden, true);
  assert.equal(f.document.querySelector('.save-media-preview').hidden, false);
  assert.equal(f.document.getElementById('save-media-name').parentElement.hidden, false);
});

test("loading updates the location control without adding rows or leaking a previous error", async (t) => {
  let resolve;
  const f = fixture(t, { getCatalog: () => new Promise((finish) => { resolve = finish; }) });
  await f.open();
  const fields = f.document.querySelector('.save-media-fields');
  const rows = [...fields.children];
  assert.match(f.document.querySelector('.save-media-path').textContent, /读取中/);
  assert.equal(f.document.querySelector('.save-media-status').hidden, true);
  assert.equal(f.document.activeElement.id, 'save-media-title');
  resolve({ ...sampleCatalog, entries: [{ assetId: 'asset-1', space: 'personal', folderId: 'f4', displayName: '已保存名称', tagIds: ['builtin:object'] }] });
  await settle();
  assert.deepEqual([...fields.children], rows);
  assert.equal(f.document.querySelector('.save-media-status').hidden, true);
  assert.equal(f.document.getElementById('save-media-name').value, '已保存名称');
  assert.match(f.document.querySelector('.save-media-location').title, /夏季$/);
});

test("batch add preserves existing entries and disables an already-saved target without a move prompt", async (t) => {
  const f = fixture(t);
  f.catalog.entries.push({ assetId: 'asset-1', space: 'personal', folderId: 'f2', displayName: '已有名称', tagIds: ['builtin:scene'] });
  await f.open([sampleItem, { ...sampleItem, key: 'node-2', assetId: 'asset-2', displayName: '新增镜头' }]);
  assert.equal(f.document.querySelector('.save-media-primary').textContent, '保存 1 项');
  assert.equal(f.confirmations.length, 0);
  f.button('保存').click(); await settle();
  assert.deepEqual(f.saved[0].items.map((item) => item.assetId), ['asset-2']);
  assert.equal(f.saved[0].items[0].action, 'add');
  assert.deepEqual(f.catalog.entries[0].tagIds, ['builtin:scene']);
  f.catalog.entries.push({ assetId: 'asset-2', space: 'personal', folderId: 'f3', displayName: '另一个已有名称', tagIds: [] });
  await f.open([sampleItem, { ...sampleItem, key: 'node-2', assetId: 'asset-2' }]);
  assert.equal(f.document.querySelector('.save-media-primary').textContent, '已保存');
  assert.equal(f.document.querySelector('.save-media-primary').disabled, true);
  f.location(); f.button('组织').click();
  assert.equal(f.document.querySelector('.save-media-primary').textContent, '保存 2 项');
  assert.equal(f.document.querySelector('.save-media-primary').disabled, false);
});

test("canceling move confirmation keeps the draft and closing invalidates its callback", async (t) => {
  const f = fixture(t);
  f.catalog.entries.push({ assetId: 'asset-1', space: 'personal', folderId: 'f2', displayName: '原名称', tagIds: [] });
  await f.open();
  f.location(); f.button('保存到 默认目录').click(); f.button('保存').click();
  f.confirmations[0].onCancel();
  assert.equal(f.controller.isOpen(), true);
  assert.equal(f.button('保存').disabled, false);
  assert.equal(f.saved.length, 0);
  f.button('保存').click(); f.controller.close();
  f.confirmations[1].onConfirm(); await settle();
  assert.equal(f.saved.length, 0);
});

test("save failure keeps draft and blocks double submission until the request completes", async (t) => {
  let reject;
  let requests = 0;
  const f = fixture(t, { save: () => { requests += 1; return new Promise((resolve, fail) => { reject = fail; }); } });
  await f.open();
  const name = f.document.getElementById("save-media-name"); name.value = "新标题"; name.dispatchEvent(new f.window.Event("input", { bubbles: true }));
  f.button("保存").click(); f.button("保存").click();
  assert.equal(requests, 1);
  reject(new Error("网络中断，请重试")); await settle();
  assert.equal(f.controller.isOpen(), true);
  assert.equal(name.value, "新标题");
  assert.match(f.document.querySelector(".save-media-status").textContent, /网络中断/);
  assert.equal(f.button("保存").disabled, false);
});

test("directory rename preserves destination, tags and identity while updating ancestor paths", async (t) => {
  const f = fixture(t);
  f.controller.open({ items: [sampleItem], folderId: "f4" });
  await settle();
  f.tags(); f.document.querySelector('[aria-label="物品"]').click(); f.key(f.document.activeElement, "Escape");
  f.location(); f.button("重命名 角色参考").click();
  assert.equal(f.document.querySelector('[aria-label="重命名文件夹"]').value, "角色参考");
  f.input("重命名文件夹", "人物参考");
  f.button("确认重命名文件夹").click(); await settle();
  assert.match(f.document.querySelector(".save-media-location").getAttribute("aria-label"), /人物参考/);
  assert.equal(f.catalog.folders.find((folder) => folder.id === "f2").parentId, "f1");
  f.key(f.document.activeElement, "Escape");
  f.document.querySelector(".save-media-primary").click(); await settle();
  assert.equal(f.saved[0].folderId, "f4");
  assert.deepEqual(Array.from(f.saved[0].tagIds), ["builtin:object"]);
});

test("directory management hides unavailable actions and only explicit deletion changes the selected path", async (t) => {
  const f = fixture(t);
  f.controller.open({ items: [sampleItem], folderId: "f4" }); await settle(); f.location();
  assert.equal(f.button("重命名 默认目录"), undefined);
  assert.equal(f.button("删除 默认目录"), undefined);
  f.button("删除 主角").click();
  assert.equal(f.catalog.folders.length, 5, "opening confirmation does not delete");
  f.deletionConfirmations[0].onCancel();
  assert.match(f.document.querySelector(".save-media-location").getAttribute("aria-label"), /夏季/);
  f.button("删除 主角").click();
  await f.deletionConfirmations[1].onConfirm();
  assert.equal(f.document.querySelector(".save-media-location").getAttribute("aria-label"), "保存位置：个人 / 角色参考");
  assert.equal(f.button("保存到 夏季"), undefined);
  const denied = fixture(t, { canManageFolders: () => false, canCreateFolder: () => false });
  await denied.open(); denied.location();
  assert.equal(denied.document.querySelector(".save-media-folder-actions"), null);
});

test("file labels preserve their actual suffix without changing the submitted filename", async (t) => {
  const f = fixture(t);
  const displayName = "ChatGPT Image 长文件名 2026年9月15日.png";
  f.controller.open({ intent: "upload", items: [{ ...sampleItem, displayName }] }); await settle();
  const label = f.document.querySelector(".save-media-batch-item .save-media-preview-name");
  assert.equal(label.querySelector(".save-media-filename-extension").textContent, ".png");
  assert.equal(label.textContent, displayName);
  assert.equal(label.title, displayName);
  f.document.querySelector(".save-media-primary").click(); await settle();
  assert.equal(f.saved[0].items[0].displayName, displayName);
});

test("loaded batch previews replace the placeholder while failed and missing previews retain a fallback", async (t) => {
  const f = fixture(t);
  f.controller.open({ intent: "upload", items: [
    { ...sampleItem, key: "transparent", url: "/transparent.png" },
    { ...sampleItem, key: "broken", url: "/missing.png" },
    { ...sampleItem, key: "audio", mediaKind: "audio", url: "/voice.wav" },
  ] });
  await settle();
  const [loaded, failed, audio] = f.document.querySelectorAll(".save-media-batch-thumbnail");
  const preview = loaded.querySelector("img");
  assert.ok(loaded.querySelector(":scope > svg"));
  preview.dispatchEvent(new f.window.Event("load"));
  assert.equal(loaded.querySelector(":scope > svg"), null);
  assert.equal(loaded.querySelector("img"), preview);
  assert.ok(loaded.querySelector(".save-media-upload-remove"));
  failed.querySelector("img").dispatchEvent(new f.window.Event("error"));
  assert.equal(failed.querySelector("img"), null);
  assert.equal(failed.querySelectorAll(":scope > svg").length, 1);
  assert.equal(audio.querySelector("img"), null);
  assert.ok(audio.querySelector(":scope > svg"));
});

test("closing or replacing the dialog isolates asynchronous completions and restores focus", async (t) => {
  let resolve;
  const f = fixture(t, { getCatalog: () => new Promise((finish) => { resolve = finish; }) });
  await f.open();
  f.controller.close();
  resolve(sampleCatalog); await settle();
  assert.equal(f.document.activeElement.id, "opener");
  assert.equal(f.controller.isOpen(), false);
  assert.equal(f.closed, 1);
});

test("Escape dismisses an inline draft, then its popup, then the modal without triggering canvas shortcuts", async (t) => {
  const f = fixture(t);
  let escapedToCanvas = 0;
  f.document.addEventListener("keydown", () => { escapedToCanvas += 1; });
  await f.open(); f.tags(); f.button("新建标签").click();
  const input = f.input("标签名称", "草稿"); f.key(input, "Escape");
  assert.equal(f.document.querySelector(".save-media-inline-input"), null);
  assert.equal(f.document.querySelector(".save-media-popup").hidden, false);
  f.key(f.document.activeElement, "Escape");
  assert.equal(f.document.querySelector(".save-media-popup").hidden, true);
  f.key(f.document.activeElement, "Escape");
  assert.equal(f.controller.isOpen(), false);
  assert.equal(escapedToCanvas, 0);
  assert.equal(f.tagsCreated.length, 0);
});

test("newly imported media identity can refresh an existing placement without losing draft and requires explicit move", async (t) => {
  const f = fixture(t);
  await f.open([{ ...sampleItem, assetId: undefined }]);
  f.document.getElementById("save-media-name").value = "未入库草稿";
  f.controller.updateItemsIdentity(new Map([["node-1", "persisted-1"]]));
  f.controller.setCatalog({ ...f.catalog, entries: [{ assetId: "persisted-1", space: "personal", folderId: "f1", displayName: "原始名称", tagIds: [] }] });
  assert.equal(f.document.getElementById("save-media-name").value, "未入库草稿");
  assert.equal(f.document.querySelector(".save-media-primary").disabled, false);
  f.document.querySelector(".save-media-primary").click();
  f.confirmations[0].onConfirm(); await settle();
  assert.equal(f.saved[0].items[0].assetId, "persisted-1");
  assert.equal(f.saved[0].items[0].action, "move");
});

test("library upload starts at its requested deep directory and submits single files as additions", async (t) => {
  const f = fixture(t);
  f.controller.open({ items: [sampleItem], space: "personal", folderId: "f4", intent: "upload" });
  await settle();
  assert.equal(f.document.querySelector(".save-media-location").title, "个人 / 角色参考 / 主角 / 服装 / 夏季");
  f.button("保存").click(); await settle();
  assert.equal(f.saved[0].folderId, "f4");
  assert.equal(f.saved[0].items[0].action, "add");
  assert.equal(f.confirmations.length, 0);
});

test("upload does not hydrate existing metadata or offer an implicit move when content is already saved", async (t) => {
  const f = fixture(t);
  f.catalog.entries.push({ assetId: "asset-1", space: "personal", folderId: "f2", displayName: "已保存名称", tagIds: ["builtin:scene"] });
  f.controller.open({ items: [sampleItem], space: "personal", folderId: "f4", intent: "upload" });
  await settle();
  assert.equal(f.document.querySelector(".save-media-primary").textContent, "已保存");
  assert.equal(f.document.querySelector(".save-media-primary").disabled, true);
  assert.equal(f.document.getElementById("save-media-name").value, "海边镜头");
  assert.equal(f.document.querySelector(".save-media-location").title, "个人 / 角色参考 / 主角 / 服装 / 夏季");
  assert.equal(f.document.querySelector(".save-media-tags-value").textContent.includes("场景"), false);
  f.location(); f.button("组织").click();
  assert.equal(f.document.querySelector(".save-media-primary").disabled, false);
  f.button("保存").click(); await settle();
  assert.equal(f.saved[0].items[0].action, "add");
  assert.equal(f.confirmations.length, 0);
});

test("a missing initial directory never silently changes to root and can be corrected in the same dialog", async (t) => {
  for (const folderId of ["missing", "o1"]) {
    const f = fixture(t);
    f.controller.open({ items: [sampleItem], space: "personal", folderId, intent: "upload" });
    await settle();
    assert.match(f.document.querySelector(".save-media-path").textContent, /位置已不可用/);
    assert.match(f.document.querySelector(".save-media-status").textContent, /重新选择/);
    assert.equal(f.document.querySelector(".save-media-primary").disabled, true);
    f.button("保存").click(); await settle();
    assert.equal(f.saved.length, 0);
    f.location(); f.button("保存到 默认目录").click();
    assert.equal(f.document.querySelector(".save-media-primary").disabled, false);
    assert.equal(f.document.querySelector(".save-media-status").hidden, true);
    f.button("保存").click(); await settle();
    assert.equal(f.saved[0].folderId, null);
  }
});

test("catalog refresh deleting the chosen destination blocks save without moving the draft", async (t) => {
  const f = fixture(t);
  f.controller.open({ items: [sampleItem], space: "personal", folderId: "f4" });
  await settle();
  f.controller.setCatalog({ ...f.catalog, folders: [] });
  assert.equal(f.document.querySelector(".save-media-primary").disabled, true);
  assert.match(f.document.querySelector(".save-media-path").textContent, /位置已不可用/);
  assert.equal(f.document.getElementById("save-media-name").value, "海边镜头");
});

test("upload opens an empty grid with a persistent first add tile before selecting any local files", async (t) => {
  let chooserOpened = 0;
  const f = fixture(t, { onChooseFiles: () => { chooserOpened += 1; } });
  assert.equal(f.controller.open({ items: [], intent: "upload", space: "organization", folderId: "o1" }), true);
  await settle();
  assert.equal(f.document.querySelector("dialog").classList.contains("is-batch"), true);
  assert.equal(f.document.getElementById("save-media-title").textContent, "上传资产");
  assert.equal(f.document.querySelector(".save-media-item-count").hidden, true);
  assert.equal(f.document.getElementById("save-media-name").parentElement.hidden, true);
  assert.equal(f.document.querySelector(".save-media-primary").disabled, true);
  assert.equal(f.document.querySelector(".save-media-primary").textContent, "保存");
  const add = f.button("选择本地文件");
  assert.equal(f.document.querySelector(".save-media-batch-grid").firstElementChild.contains(add), true);
  assert.equal(chooserOpened, 0);
  add.click();
  assert.equal(chooserOpened, 1);
  assert.equal(f.saved.length, 0);
  assert.equal(f.document.querySelector(".save-media-location").title, "组织 / 品牌");
});

test("appending and removing upload items preserves directory, tags, loaded cards, scroll and surviving focus", async (t) => {
  let reads = 0;
  const removed = [];
  let selected = [];
  const f = fixture(t, {
    getCatalog: async () => { reads += 1; return structuredClone(sampleCatalog); },
    onRemoveItem(key) { removed.push(key); selected = selected.filter((item) => item.key !== key); f.controller.setItems(selected); },
  });
  f.controller.open({ items: [], intent: "upload", space: "personal", folderId: "f4" });
  await settle();
  f.tags(); f.button("场景").click(); f.tags();
  selected = [sampleItem];
  f.controller.setItems(selected);
  const firstCard = f.document.querySelector(".save-media-batch-item");
  const loadedImage = firstCard.querySelector("img");
  const firstRemove = f.button("移除 海边镜头");
  const scrollArea = f.document.querySelector(".save-media-batch-preview");
  scrollArea.scrollTop = 120;
  firstRemove.focus();
  selected = [...selected, { ...sampleItem, key: "second", assetId: "asset-2", displayName: "城市镜头" }];
  f.controller.setItems(selected);
  assert.equal(f.document.querySelector(".save-media-batch-item"), firstCard);
  assert.equal(firstCard.querySelector("img"), loadedImage);
  assert.equal(f.document.activeElement, firstRemove);
  assert.equal(scrollArea.scrollTop, 120);
  assert.equal(f.document.querySelectorAll(".save-media-batch-grid > li").length, 3);
  assert.equal(f.document.querySelector(".save-media-location").title, "个人 / 角色参考 / 主角 / 服装 / 夏季");
  assert.equal(f.document.querySelector(".save-media-tags-value").textContent, "场景");
  firstRemove.click();
  assert.deepEqual(removed, ["node-1"]);
  assert.equal(f.document.activeElement, f.button("移除 城市镜头"));
  assert.equal(f.document.querySelector(".save-media-item-count").textContent, "1 项");
  f.button("移除 城市镜头").click();
  assert.equal(f.document.activeElement, f.button("选择本地文件"));
  assert.equal(f.document.querySelector(".save-media-primary").disabled, true);
  assert.equal(f.document.querySelector(".save-media-item-count").hidden, true);
  assert.equal(f.document.querySelectorAll(".save-media-batch-grid > li").length, 1);
  assert.equal(f.document.querySelector(".save-media-tags-value").textContent, "场景");
  assert.equal(reads, 1);
});

test("a single upload remains in the grid and saves its filename without requiring the hidden name field", async (t) => {
  const f = fixture(t);
  f.controller.open({ items: [], intent: "upload", space: "personal" }); await settle();
  f.controller.setItems([{ ...sampleItem, displayName: "新文件.png" }]);
  assert.equal(f.document.getElementById("save-media-name").value, "");
  assert.equal(f.document.getElementById("save-media-name").hidden, true);
  assert.equal(f.document.querySelector(".save-media-preview").hidden, true);
  assert.equal(f.document.querySelector(".save-media-batch-preview").hidden, false);
  f.button("保存").click(); await settle();
  assert.equal(f.saved[0].items[0].displayName, "新文件.png");
  assert.equal(f.saved[0].items[0].action, "add");
});

test("saving blocks upload add and remove controls and late setItems without losing the selected files", async (t) => {
  let reject;
  let choices = 0;
  let removals = 0;
  const f = fixture(t, { save: () => new Promise((_, fail) => { reject = fail; }),
    onChooseFiles: () => { choices += 1; }, onRemoveItem: () => { removals += 1; } });
  f.controller.open({ items: [sampleItem], intent: "upload", space: "personal" }); await settle();
  f.button("保存").click();
  const add = f.button("选择本地文件"), remove = f.button("移除 海边镜头");
  assert.equal(add.disabled, true); assert.equal(remove.disabled, true);
  add.dispatchEvent(new f.window.Event("click")); remove.dispatchEvent(new f.window.Event("click"));
  assert.equal(choices, 0); assert.equal(removals, 0);
  assert.equal(f.controller.setItems([]), false);
  assert.ok(f.button("移除 海边镜头"));
  reject(new Error("网络中断")); await settle();
  assert.equal(add.disabled, false); assert.equal(remove.disabled, false);
  assert.match(f.document.querySelector(".save-media-status").textContent, /网络中断/);
});

test("local chooser and controller validation errors stay in the existing upload footer", async (t) => {
  const f = fixture(t, { onChooseFiles() { throw new Error("当前文件不可读取"); } });
  f.controller.open({ items: [], intent: "upload" }); await settle();
  f.button("选择本地文件").click();
  const status = f.document.querySelector(".save-media-status");
  assert.equal(status.textContent, "当前文件不可读取");
  assert.equal(status.classList.contains("is-error"), true);
  assert.equal(status.parentElement.className, "save-media-footer");
  f.controller.showError("超过单文件上传限制");
  assert.equal(status.textContent, "超过单文件上传限制");
  f.controller.showError("");
  assert.equal(status.hidden, true);
});
