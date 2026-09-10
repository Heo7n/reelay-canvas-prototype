import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "node:url";
import { buildPromptEditor } from "../scripts/build-prompt-editor.mjs";

const root = new URL("../", import.meta.url);
const modelSource = await readFile(new URL("src/legacy-canvas/canvas-asset-library-model.js", root), "utf8");
const viewSource = await readFile(new URL("src/legacy-canvas/canvas-asset-library-view.js", root), "utf8");
const context = vm.createContext({});
new vm.Script(modelSource).runInContext(context);
new vm.Script(viewSource).runInContext(context);
const { REELAY_CANVAS_ASSET_LIBRARY_MODEL: model, REELAY_CANVAS_ASSET_LIBRARY_VIEW: view } = context;
const ids = (items) => Array.from(items, ({ id }) => id);
const plain = (value) => JSON.parse(JSON.stringify(value));

function seed() {
  return {
    media: [
      { id: "portrait", type: "image", name: "角色正面.png", url: "blob:portrait" },
      { id: "voice", type: "audio", name: "角色台词.mp3", url: "blob:voice" },
      { id: "video", type: "video", name: "角色动作.mp4", url: "blob:video" },
      { id: "other", type: "image", name: "无关图片.png", url: "blob:other" },
    ],
    entities: [{ id: "hero", name: "角色", mediaRefs: [{ mediaId: "voice" }, { mediaId: "portrait" }, { mediaId: "video" }] }],
    folders: [
      { id: "images", name: "图片", space: "personal", kind: "media" },
      { id: "motions", name: "动态", space: "personal", kind: "media" },
    ],
    placements: [
      { item: { kind: "media", id: "portrait" }, space: "personal", folderId: "images" },
      { item: { kind: "media", id: "voice" }, space: "personal", folderId: null },
      { item: { kind: "media", id: "video" }, space: "personal", folderId: "motions" },
      { item: { kind: "media", id: "other" }, space: "personal", folderId: null },
      { item: { kind: "entity", id: "hero" }, space: "personal", folderId: null },
    ],
  };
}

test("related Media crosses folders in reference order and intersects search/type without altering placement", () => {
  const store = model.createAssetLibraryStore(seed());
  const before = plain(store.snapshot());
  const result = store.listEntityMedia({ entityId: "hero", space: "personal" });
  assert.deepEqual(ids(result.items), ["voice", "portrait", "video"]);
  assert.equal(result.status, "ready");
  assert.equal(result.entity.name, "角色");
  const filtered = store.listEntityMedia({ entityId: "hero", query: "角色", mediaKind: "image" });
  assert.deepEqual(ids(filtered.items), ["portrait"]);
  assert.equal(filtered.allItems.length, 3);
  assert.deepEqual(ids(store.listEntityMedia({ entityId: "hero", query: "无关" }).items), []);
  result.entity.name = "mutated";
  result.items[0].placement.folderId = "images";
  assert.deepEqual(plain(store.snapshot()), before);
});

test("related Media follows live entity names and current refs, preserving explicit source-space visibility", () => {
  const store = model.createAssetLibraryStore(seed());
  store.renameItem({ item: { kind: "entity", id: "hero" }, name: "新角色", space: "personal" });
  store.moveItems({ items: [{ kind: "media", id: "portrait" }], folderId: "motions", space: "personal" });
  assert.equal(store.listEntityMedia({ entityId: "hero" }).entity.name, "新角色");
  assert.deepEqual(ids(store.listEntityMedia({ entityId: "hero" }).items), ["voice", "portrait", "video"]);
  for (const options of [{ entityId: "hero", space: "organization" }, { entityId: "hero", space: "platform" }, { entityId: "deleted" }, {}]) {
    const result = store.listEntityMedia(options);
    assert.equal(result.status, "unavailable");
    assert.deepEqual(ids(result.items), []);
    assert.equal(result.entity, null);
  }
  store.shareToOrganization({ items: [{ kind: "entity", id: "hero" }] });
  assert.deepEqual(ids(store.listEntityMedia({ entityId: "hero", space: "organization" }).items), ["voice", "portrait", "video"]);
});

test("recent Media sorting uses creation time with stable undated items and leaves subject reference order intact", () => {
  const fixture = seed();
  fixture.media[0].createdAt = "2026-09-08T11:00:00Z";
  fixture.media[1].createdAt = "2026-09-10T11:00:00Z";
  fixture.media[2].createdAt = "invalid";
  fixture.media[3].updatedAt = "2099-09-10T11:00:00Z";
  const store = model.createAssetLibraryStore(fixture);
  assert.deepEqual(ids(store.listItems({ kind: "media", sort: "recent" })), ["voice", "portrait", "video", "other"]);
  assert.deepEqual(ids(store.listItems({ kind: "media" })), ["portrait", "voice", "video", "other"]);
  store.renameItem({ item: { kind: "media", id: "portrait" }, name: "改名图.png" });
  assert.deepEqual(ids(store.listItems({ kind: "media", sort: "recent" })), ["voice", "portrait", "video", "other"]);
  assert.deepEqual(ids(store.listEntityMedia({ entityId: "hero", sort: "recent" }).items), ["voice", "portrait", "video"]);
  assert.deepEqual(ids(store.listItems({ kind: "entity", sort: "recent" })), ["hero"]);
});

test("read-only subjects retain only the related-media menu action and related filters explain unavailable state", () => {
  const markup = view.renderEntityCard({ entity: { id: "hero", name: "角色" }, space: "personal", mutable: false, menuOpen: true });
  assert.match(markup, /data-library-menu-item="view-media"/);
  assert.doesNotMatch(markup, /data-library-menu-item="(?:edit|rename|move|share-organization|delete)"/);
  const filter = view.renderEntityMediaFilter({ entity: { name: '<img onerror="alert(1)">' }, status: "ready" });
  assert.match(filter, /清除主体筛选/);
  assert.match(filter, /跨目录/);
  assert.doesNotMatch(filter, /<img/);
  assert.match(view.renderEmptyState({ section: "media", entityFilterStatus: "unavailable", hasQuery: true }), /主体已不可用/);
  assert.match(view.renderEmptyState({ section: "media", entityFilterStatus: "ready" }), /没有可用的关联素材/);
  const bar = view.renderCommandBar({ section: "media", mutable: true, entityFilter: true });
  assert.match(bar, /返回素材库/);
  assert.doesNotMatch(bar, /data-library-upload/);
});

const html = await readFile(new URL("index.html", root), "utf8");
const sourceDocument = new JSDOM(html);
const paths = [...sourceDocument.window.document.querySelectorAll("script[src]")]
  .map((script) => script.getAttribute("src")).filter((path) => path.startsWith("./"));
sourceDocument.window.close();
const scripts = await Promise.all(paths.map(async (path) => ({ path, source: await readFile(new URL(path.split("?")[0], root), "utf8") })));
const promptSource = await buildPromptEditor(fileURLToPath(root));

function harness(t) {
  const dom = new JSDOM(html, { url: "http://reelay.test/index.html", runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  t.after(() => { window.relatedMediaTest?.promptEditors.destroy(); dom.window.close(); });
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.structuredClone = structuredClone;
  window.requestAnimationFrame = () => 1;
  window.cancelAnimationFrame = () => {};
  window.setTimeout = () => 1;
  window.clearTimeout = () => {};
  window.ResizeObserver = class { observe() {} disconnect() {} };
  window.HTMLMediaElement.prototype.pause = () => {};
  window.HTMLMediaElement.prototype.load = () => {};
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  window.Element.prototype.getBoundingClientRect = () => ({ left: 20, top: 100, width: 400, height: 500, right: 420, bottom: 600 });
  window.HTMLElement.prototype.showPopover = function () { this.dataset.testOpen = "true"; };
  window.HTMLElement.prototype.hidePopover = function () { delete this.dataset.testOpen; };
  const matches = window.Element.prototype.matches;
  window.Element.prototype.matches = function (selector) { return selector === ":popover-open" ? this.dataset.testOpen === "true" : matches.call(this, selector); };
  window.eval(promptSource);
  for (const { path, source } of scripts) {
    window.eval(source + (path === "./app.js" ? "\nwindow.relatedMediaTest = { state, assetLibraryStore, promptEditors };" : ""));
  }
  const { state, assetLibraryStore: store } = window.relatedMediaTest;
  const rootMedia = store.registerMedia({ media: { id: "related-root", type: "image", name: "角色正面.png", url: "blob:related-root" } }).media;
  const folder = store.createFolder({ name: "既有目录", space: "personal", kind: "media" });
  const nestedMedia = store.registerMedia({ media: { id: "related-nested", type: "audio", name: "角色台词.mp3", url: "blob:related-nested" }, folderId: folder.id }).media;
  const entity = store.registerPersistedEntity({ id: "related-subject", name: "跨目录角色", description: "", mediaRefs: [{ mediaId: nestedMedia.id }, { mediaId: rootMedia.id }], version: 1 }).entity;
  window.openAssetLibrary();
  return { window, document: window.document, state, store, rootMedia, nestedMedia, folder, entity };
}

test("real subject menu opens cross-directory Media; search, type, clear and explicit navigation compose safely", (t) => {
  const h = harness(t);
  const before = plain(h.store.snapshot());
  const canvasBefore = JSON.stringify(h.window.createCanvasDocumentSnapshot());
  h.document.querySelector('#assetLibraryEntityTab').click();
  const card = h.document.querySelector(`[data-library-entity="${h.entity.id}"]`);
  card.querySelector('[data-library-menu-toggle]').click();
  h.document.querySelector('[data-library-menu-item="view-media"]').click();
  assert.equal(h.state.librarySection, "media");
  assert.deepEqual(ids(h.window.getVisibleAssetLibraryContent().items), [h.nestedMedia.id, h.rootMedia.id]);
  assert.equal(h.document.querySelector('#assetLibraryEntityFilter').hidden, false);
  assert.equal(h.document.activeElement.dataset.libraryClearEntityFilter, "true");
  assert.equal(h.document.querySelector('[data-library-upload]'), null);
  const search = h.document.querySelector('#assetLibrarySearchInput');
  search.value = "台词";
  search.dispatchEvent(new h.window.Event("input", { bubbles: true }));
  assert.deepEqual(ids(h.window.getVisibleAssetLibraryContent().items), [h.nestedMedia.id]);
  h.document.querySelector('[data-library-filter-toggle]').click();
  h.document.querySelector('[data-library-filter="image"]').click();
  assert.equal(h.window.getVisibleAssetLibraryContent().items.length, 0);
  h.document.querySelector('[data-library-clear-query]').click();
  assert.equal(h.window.getVisibleAssetLibraryContent().items.length, 2);
  assert.equal(h.state.libraryEntityFilter.entityId, h.entity.id);
  h.document.querySelector('#assetLibraryEntityFilter button').click();
  assert.equal(h.state.libraryEntityFilter, null);
  assert.equal(h.state.libraryFolderId, null);
  assert.ok(!ids(h.window.getVisibleAssetLibraryContent().items).includes(h.nestedMedia.id));
  h.window.selectAssetLibraryDirectory(h.folder.id);
  h.window.viewEntityRelatedMedia(h.entity.id);
  assert.equal(h.window.getVisibleAssetLibraryContent().items.length, 2);
  h.document.querySelector('#assetLibraryEntityFilter button').click();
  assert.equal(h.state.libraryFolderId, h.folder.id);
  assert.deepEqual(ids(h.window.getVisibleAssetLibraryContent().items), [h.nestedMedia.id]);
  h.window.viewEntityRelatedMedia(h.entity.id);
  h.window.selectAssetLibraryDirectory(null);
  assert.equal(h.state.libraryEntityFilter, null);
  for (const action of [
    () => h.document.querySelector('#assetLibraryMediaTab').click(),
    () => h.document.querySelector('#assetLibraryEntityTab').click(),
    () => h.window.switchAssetLibraryContext({ space: "organization" }),
    () => h.window.closeAssetLibrary(),
  ]) {
    h.window.switchAssetLibraryContext({ space: "personal", section: "media" });
    h.window.viewEntityRelatedMedia(h.entity.id);
    action();
    assert.equal(h.state.libraryEntityFilter, null);
  }
  assert.deepEqual(plain(h.store.snapshot()), before);
  assert.equal(JSON.stringify(h.window.createCanvasDocumentSnapshot()), canvasBefore);
});

test("active related-media filter follows renamed/edited Entity projections and does not broaden after deletion", (t) => {
  const h = harness(t);
  h.window.viewEntityRelatedMedia(h.entity.id);
  h.store.updateEntity({ entityId: h.entity.id, name: "新名称", mediaRefs: [{ mediaId: h.rootMedia.id }], expectedVersion: 1 });
  h.window.renderAssetLibrary();
  assert.match(h.document.querySelector('#assetLibraryEntityFilter').textContent, /新名称/);
  assert.deepEqual(ids(h.window.getVisibleAssetLibraryContent().items), [h.rootMedia.id]);
  h.store.syncPersistedEntities([]);
  h.window.renderAssetLibrary();
  assert.equal(h.window.getVisibleAssetLibraryContent().items.length, 0);
  assert.match(h.document.querySelector('#assetLibraryGrid').textContent, /主体已不可用/);
  assert.equal(h.state.libraryEntityFilter.entityId, h.entity.id);
});
