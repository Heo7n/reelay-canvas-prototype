import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import { canvasIconsSource } from "./helpers/canvas-icons.mjs";
import { fileURLToPath } from "node:url";
import { buildPromptEditor } from "../scripts/build-prompt-editor.mjs";

const root = new URL("../", import.meta.url);
const modelSource = await readFile(new URL("src/legacy-canvas/canvas-asset-library-model.js", root), "utf8");
const viewSource = await readFile(new URL("src/legacy-canvas/canvas-asset-library-view.js", root), "utf8");
const context = vm.createContext({});
new vm.Script(await readFile(new URL("src/legacy-canvas/canvas-file-name.js", root), "utf8")).runInContext(context);
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

test("read-only subjects omit management menus and related filters explain unavailable state", () => {
  const markup = view.renderEntityCard({ entity: { id: "hero", name: "角色" }, space: "personal", mutable: false, menuOpen: true });
  assert.doesNotMatch(markup, /data-library-menu-item=/);
  assert.doesNotMatch(markup, /data-library-menu-item="(?:edit|rename|move|share-organization|delete)"/);
  const filter = view.renderEntityMediaFilter({ entity: { name: '<img onerror="alert(1)">' }, status: "ready" });
  assert.match(filter, /返回主体列表/);
  assert.doesNotMatch(filter, /跨目录|筛选/);
  assert.doesNotMatch(filter, /<img/);
  assert.match(view.renderEmptyState({ section: "media", entityFilterStatus: "unavailable", hasQuery: true }), /主体已不可用/);
  assert.match(view.renderEmptyState({ section: "media", entityFilterStatus: "ready" }), /主体中没有可用素材/);
  const bar = view.renderCommandBar({ section: "media", mutable: true, entityFilter: true });
  assert.doesNotMatch(bar, /返回素材库/);
  assert.doesNotMatch(bar, /data-library-upload/);
});

const html = await readFile(new URL("index.html", root), "utf8");
const sourceDocument = new JSDOM(html);
const paths = [...sourceDocument.window.document.querySelectorAll("script[src]")]
  .map((script) => script.getAttribute("src")).filter((path) => path.startsWith("./"));
sourceDocument.window.close();
const scripts = await Promise.all(paths.map(async (path) => ({ path, source: path.split("?")[0] === "./assets/canvas-icons.js" ? canvasIconsSource : await readFile(new URL(path.split("?")[0], root), "utf8") })));
const promptSource = await buildPromptEditor(fileURLToPath(root));

function harness(t) {
  const dom = new JSDOM(html, { url: "http://reelay.test/index.html", runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  t.after(() => { window.relatedMediaTest?.promptEditors.destroy(); dom.window.close(); });
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.structuredClone = structuredClone;
  // jsdom lacks CSS.escape; hexadecimal escapes preserve fixture IDs in selectors.
  window.CSS = { escape: (value) => Array.from(String(value), (char) => `\\${char.codePointAt(0).toString(16)} `).join("") };
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

test("subject member browsing composes cross-directory Media search, type, clear and explicit navigation safely", (t) => {
  const h = harness(t);
  const before = plain(h.store.snapshot());
  const canvasBefore = JSON.stringify(h.window.createCanvasDocumentSnapshot());
  h.document.querySelector('[data-library-open-subjects]').click();
  h.window.viewEntityRelatedMedia(h.entity.id);
  assert.equal(h.document.querySelector('#assetLibraryEntityTab'), null);
  assert.deepEqual(ids(h.window.getVisibleAssetLibraryContent().items), [h.nestedMedia.id, h.rootMedia.id]);
  assert.equal(h.document.querySelector('#assetLibraryEntityFilter').hidden, false);
  assert.equal(h.document.activeElement.dataset.libraryClearEntityFilter, "true");
  assert.equal(h.document.querySelector('[data-library-upload]'), null);
  h.document.querySelector('[data-library-filter-toggle]').click();
  h.document.querySelector('[data-library-filter="image"]').click();
  assert.deepEqual(ids(h.window.getVisibleAssetLibraryContent().items), [h.nestedMedia.id, h.rootMedia.id]);
  h.document.querySelector('[data-library-filter-apply]').click();
  assert.deepEqual(ids(h.window.getVisibleAssetLibraryContent().items), [h.rootMedia.id]);
  h.document.querySelector('[data-library-filter-toggle]').click();
  h.document.querySelector('[data-library-filter-reset]').click();
  h.document.querySelector('[data-library-filter-apply]').click();
  assert.equal(h.window.getVisibleAssetLibraryContent().items.length, 2);
  assert.equal(h.state.libraryEntityFilter.entityId, h.entity.id);
  h.document.querySelector('#assetLibraryEntityFilter button').click();
  assert.equal(h.state.libraryEntityFilter, null);
  assert.equal(h.state.libraryFolderId, null);
  assert.equal(h.state.libraryZone, "subjects");
  assert.ok(h.window.getVisibleAssetLibraryContent().items.every((item) => item.kind === "entity"));
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

test("active search and type filters include descendants while ordinary browsing remains in its directory", (t) => {
  const h = harness(t);
  h.window.selectAssetLibraryDirectory(null);
  const initial = ids(h.window.getVisibleAssetLibraryContent().items);
  assert.ok(!initial.includes(h.nestedMedia.id));
  h.state.libraryFilter = "audio";
  assert.ok(ids(h.window.getVisibleAssetLibraryContent().items).includes(h.nestedMedia.id));
  h.state.libraryFilter = "all";
  h.state.librarySearch = h.nestedMedia.name;
  assert.ok(ids(h.window.getVisibleAssetLibraryContent().items).includes(h.nestedMedia.id));
  h.state.librarySearch = "";
  assert.deepEqual(ids(h.window.getVisibleAssetLibraryContent().items), initial);
  h.window.selectAssetLibraryDirectory(h.folder.id);
  h.state.libraryFilter = "audio";
  assert.ok(!ids(h.window.getVisibleAssetLibraryContent().items).includes(h.rootMedia.id));
});

test("global search groups all directories and subjects, restores origin, and isolates spaces", (t) => {
  const h = harness(t);
  const before = plain(h.store.snapshot());
  const sibling = h.store.createFolder({ name: "角色参考", space: "personal", kind: "media" });
  const outside = h.store.registerMedia({ media: { id: "sibling-reference", type: "image", name: "角色侧面.png", url: "blob:sibling-reference" }, folderId: sibling.id }).media;
  const organization = h.store.registerMedia({ space: "organization", media: { id: "organization-reference", type: "image", name: "角色组织参考.png", url: "blob:organization-reference" } }).media;
  h.window.selectAssetLibraryDirectory(h.folder.id);
  const grid = h.document.querySelector('#assetLibraryGrid');
  grid.scrollTop = 90;
  const search = h.document.querySelector('#assetLibrarySearchInput');
  const toggle = () => h.document.querySelector('[data-library-search-toggle]').click();
  const enterQuery = (value) => { search.value = value; search.dispatchEvent(new h.window.Event("input", { bubbles: true })); };
  toggle();
  enterQuery("角色");
  const results = ids(h.window.getVisibleAssetLibraryContent().items);
  for (const id of [h.rootMedia.id, h.nestedMedia.id, outside.id, h.entity.id]) assert.ok(results.includes(id));
  assert.ok(!results.includes(organization.id));
  assert.deepEqual(ids(h.window.getVisibleAssetLibraryContent().folders), [sibling.id]);
  assert.equal(grid.querySelectorAll('[data-library-result-heading]').length, 3);
  assert.equal(h.document.querySelector('.asset-library-directory-shell').hasAttribute('inert'), true);
  assert.equal(h.document.querySelector('#assetLibraryCommandBar').hasAttribute('inert'), false);
  grid.scrollTop = 42;
  h.window.selectAssetLibraryDirectory(sibling.id);
  assert.equal(h.state.librarySearch, "");
  assert.equal(h.state.libraryFolderId, sibling.id);
  assert.equal(h.document.querySelector('#assetLibrarySearchRegion').getAttribute('aria-hidden'), 'true');
  toggle();
  assert.equal(h.state.librarySearch, "角色");
  assert.equal(grid.scrollTop, 42);
  h.window.viewEntityRelatedMedia(h.entity.id);
  assert.match(h.document.querySelector('#assetLibraryEntityFilter').textContent, /搜索结果/);
  h.document.querySelector('[data-library-clear-entity-filter]').click();
  assert.equal(h.state.librarySearch, "角色");
  assert.equal(grid.querySelectorAll('[data-library-result-heading]').length, 3);
  h.document.querySelector('#assetLibrarySearchClearBtn').click();
  assert.equal(h.state.libraryFolderId, h.folder.id);
  assert.equal(h.state.librarySearch, "");
  assert.equal(grid.scrollTop, 90);
  assert.equal(h.document.activeElement, h.document.querySelector('[data-library-search-toggle]'));
  h.window.viewEntityRelatedMedia(h.entity.id);
  toggle(); enterQuery("角色");
  assert.ok(ids(h.window.getVisibleAssetLibraryContent().items).includes(outside.id));
  h.window.switchAssetLibraryContext({ space: "organization" });
  assert.equal(h.state.librarySearch, "角色");
  assert.deepEqual(ids(h.window.getVisibleAssetLibraryContent().items), [organization.id]);
  h.document.querySelector('#assetLibrarySearchClearBtn').click();
  assert.equal(h.state.librarySpace, "organization");
  assert.equal(h.state.librarySearch, "");
  assert.equal(h.store.getMedia({ kind: "media", id: h.rootMedia.id }).name, before.media.find((item) => item.id === h.rootMedia.id).name);
});

test("global search selection only combines like items and batch actions stay accessible", (t) => {
  const h = harness(t);
  h.document.querySelector('[data-library-search-toggle]').click();
  const search = h.document.querySelector('#assetLibrarySearchInput');
  search.value = "角色";
  search.dispatchEvent(new h.window.Event("input", { bubbles: true }));
  h.document.querySelector('[data-library-selection-toggle]').click();
  h.document.querySelector('[data-library-select-all]').click();
  assert.ok(h.document.querySelector('[data-library-select-kind="media"]'));
  h.document.querySelector('[data-library-select-kind="entity"]').click();
  assert.ok(h.state.librarySelectedIds.has(`entity:${h.entity.id}`));
  assert.ok([...h.state.librarySelectedIds].every((key) => key.startsWith("entity:")));
  assert.equal(h.document.querySelector(`[data-library-select="media:${h.rootMedia.id}"]`).disabled, true);
  h.window.toggleAssetLibrarySelection(`media:${h.rootMedia.id}`);
  assert.ok(h.state.librarySelectedIds.has(`entity:${h.entity.id}`));
  assert.ok([...h.state.librarySelectedIds].every((key) => key.startsWith("entity:")));
  h.document.querySelector('[data-library-batch-toggle]').click();
  assert.equal(h.document.querySelector('[data-library-batch-toggle]').closest('[data-library-search-covered]'), null);
  assert.ok(h.document.querySelector('[data-library-batch-action="add-canvas"]'));
  assert.equal(h.document.querySelector('[data-library-batch-action="create-group"]'), null);
  h.document.querySelector('[data-library-selection-cancel]').click();
  assert.ok(h.document.querySelector('[data-library-filter-toggle]'));
});

test("empty media search retains a clear action without a subject shortcut concealing the result", (t) => {
  const h = harness(t);
  h.state.librarySearch = "完全不存在的文件检索名称";
  h.window.renderAssetLibrary();
  assert.equal(h.document.querySelector('#assetLibraryGrid [data-library-subject-zone]'), null);
  assert.match(h.document.querySelector('#assetLibraryGrid').textContent, /没有匹配结果/);
  assert.ok(h.document.querySelector('[data-library-clear-query]'));
  const subjectEntry = h.document.querySelector('#assetLibrarySubjectsBtn');
  assert.ok(subjectEntry);
  subjectEntry.click();
  assert.equal(h.state.libraryZone, "subjects");
  assert.ok(ids(h.window.getVisibleAssetLibraryContent().items).includes(h.entity.id));
  h.document.querySelector('#assetLibraryDirectoryButton').click();
  assert.equal(h.state.librarySearch, "完全不存在的文件检索名称");
  h.document.querySelector('[data-library-clear-query]').click();
  assert.equal(h.state.librarySearch, "");
  assert.equal(h.document.querySelector('#assetLibraryGrid [data-library-open-subjects]'), null);
  assert.equal(h.document.querySelector('#assetLibrarySubjectsBtn').hidden, false);
  assert.ok(ids(h.window.getVisibleAssetLibraryContent().items).includes(h.rootMedia.id));
});

test("tag filter draft cancels, applies, resets, and restores across group and space navigation", (t) => {
  const h = harness(t);
  const open = () => h.document.querySelector('[data-library-filter-toggle]').click();
  const pick = () => h.document.querySelector('[data-library-filter-tag="builtin:character"]').click();
  const apply = () => h.document.querySelector('[data-library-filter-apply]').click();
  const initial = ids(h.window.getVisibleAssetLibraryContent().items);
  open(); pick();
  assert.deepEqual(ids(h.window.getVisibleAssetLibraryContent().items), initial);
  h.document.querySelector('[data-library-filter-cancel]').click();
  assert.deepEqual(plain(h.state.libraryTagFilter), {tagIds:[],untagged:false});
  open(); pick(); apply();
  assert.deepEqual(plain(h.state.libraryTagFilter), {tagIds:["builtin:character"],untagged:false});
  h.window.viewEntityRelatedMedia(h.entity.id);
  assert.deepEqual(plain(h.state.libraryTagFilter), {tagIds:[],untagged:false});
  h.document.querySelector('#assetLibraryEntityFilter button').click();
  assert.deepEqual(plain(h.state.libraryTagFilter), {tagIds:["builtin:character"],untagged:false});
  h.window.switchAssetLibraryContext({space:"organization"});
  assert.deepEqual(plain(h.state.libraryTagFilter), {tagIds:[],untagged:false});
  h.window.switchAssetLibraryContext({space:"personal"});
  assert.deepEqual(plain(h.state.libraryTagFilter), {tagIds:["builtin:character"],untagged:false});
  open(); h.document.querySelector('[data-library-filter-reset]').click();
  assert.deepEqual(plain(h.state.libraryTagFilter), {tagIds:["builtin:character"],untagged:false});
  apply(); assert.deepEqual(ids(h.window.getVisibleAssetLibraryContent().items), initial);
});

test("subject zone is reachable from the fifth directory level and restores independent media and subject contexts", (t) => {
  const h = harness(t);
  const grid = h.document.querySelector('#assetLibraryGrid');
  assert.equal(grid.querySelector('[data-library-open-subjects]'), null);
  assert.equal(grid.querySelector('[data-library-entity]'), null);
  assert.ok(h.window.getVisibleAssetLibraryContent().items.every((item) => item.kind === "media"));
  let leaf = h.folder;
  for (const name of ["项目", "角色", "最终选用"]) leaf = h.store.createFolder({ name, parentId: leaf.id, space: "personal", kind: "media" });
  h.store.moveItems({ items: [{ kind: "media", id: h.nestedMedia.id }], folderId: leaf.id, space: "personal" });
  const archived = h.store.registerPersistedEntity({ id: "legacy-subject", name: "原目录主体", description: "旧目录中的资料", folderId: leaf.id,
    mediaRefs: [{ mediaId: h.rootMedia.id }], version: 1 }).entity;
  h.store.syncPersistedCatalog({ entityEntries: h.store.listItems({ kind: "entity", space: "personal" }).map((item) => ({
    entityId: item.id, space: "personal", folderId: item.placement.folderId,
    tagIds: item.id === h.entity.id ? ["builtin:character"] : [],
  })) });
  const before = plain(h.store.snapshot());
  h.window.selectAssetLibraryDirectory(leaf.id);
  h.state.librarySearch = "台词";
  h.state.libraryFilter = "audio";
  h.state.libraryTagFilter = { tagIds: [], untagged: true };
  h.window.renderAssetLibrary();
  grid.scrollTop = 74;
  const entry = h.document.querySelector('#assetLibrarySubjectsBtn');
  entry.click();
  assert.equal(h.state.libraryZone, "subjects");
  assert.equal(h.document.querySelector('#assetLibraryDirectoryBackBtn'), null);
  assert.equal(h.document.querySelector('#assetLibraryDirectoryName').textContent, leaf.name);
  assert.equal(h.document.activeElement, entry);
  assert.equal(entry.getAttribute('aria-pressed'), 'true');
  const directory = h.document.querySelector('#assetLibraryDirectoryButton');
  directory.querySelector('strong').click();
  assert.equal(h.state.libraryZone, "media");
  assert.equal(h.state.libraryFolderId, leaf.id);
  assert.equal(h.state.librarySearch, "台词");
  assert.equal(grid.scrollTop, 74);
  assert.equal(h.state.libraryDirectoryMenuOpen, false);
  directory.querySelector('svg, i').dispatchEvent(new h.window.MouseEvent('click', { bubbles: true }));
  assert.equal(h.state.libraryDirectoryMenuOpen, true);
  assert.ok(h.document.querySelector(`[aria-selected="true"] [data-library-directory-select="${leaf.id}"]`));
  assert.equal(h.document.querySelector('#assetLibraryDirectoryTreePopover [data-library-open-subjects]'), null);
  h.window.dispatchEvent(new h.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(h.state.libraryDirectoryMenuOpen, false);
  assert.equal(h.document.activeElement, directory);
  entry.click();
  assert.equal(h.document.querySelector('#assetLibraryEntityFilter').hidden, true);
  assert.deepEqual(plain(h.state.libraryTagFilter), { tagIds: [], untagged: false });
  assert.equal(h.state.librarySearch, "");
  assert.equal(h.state.libraryFilter, "all");
  assert.equal(h.document.querySelector('#assetLibraryCreateFolderBtn'), null);
  assert.equal(grid.querySelector('[data-library-folder]'), null);
  assert.ok(ids(h.window.getVisibleAssetLibraryContent().items).includes(archived.id));
  assert.ok(ids(h.window.getVisibleAssetLibraryContent().items).includes(h.entity.id));
  const open = () => h.document.querySelector('[data-library-filter-toggle]').click();
  const apply = () => h.document.querySelector('[data-library-filter-apply]').click();
  open();
  assert.equal(h.document.querySelector('[data-library-filter-item-kind]'), null);
  assert.equal(h.document.querySelector('[data-library-filter]'), null);
  h.document.querySelector('[data-library-filter-tag="builtin:character"]').click();
  apply();
  assert.deepEqual(ids(h.window.getVisibleAssetLibraryContent().items), [h.entity.id]);
  h.state.librarySearch = "跨目录";
  h.window.renderAssetLibrary();
  grid.scrollTop = 126;
  h.window.viewEntityRelatedMedia(h.entity.id);
  assert.ok(h.window.getVisibleAssetLibraryContent().items.every((item) => item.kind === "media"));
  assert.equal(h.state.librarySearch, "");
  assert.deepEqual(plain(h.state.libraryTagFilter), { tagIds: [], untagged: false });
  open();
  assert.equal(h.document.querySelector('[data-library-filter-item-kind]'), null);
  assert.ok(h.document.querySelector('[data-library-filter="audio"]'));
  h.document.querySelector('[data-library-filter-cancel]').click();
  h.document.querySelector('[data-library-clear-entity-filter]').click();
  assert.equal(h.state.libraryZone, "subjects");
  assert.equal(h.state.librarySearch, "跨目录");
  assert.deepEqual(plain(h.state.libraryTagFilter), { tagIds: ["builtin:character"], untagged: false });
  assert.equal(grid.scrollTop, 126);
  h.window.switchAssetLibraryContext({ space: "organization" });
  assert.equal(h.state.libraryZone, "media");
  assert.equal(h.document.querySelector('#assetLibrarySubjectsBtn').hidden, false);
  h.window.switchAssetLibraryContext({ space: "personal" });
  assert.equal(h.state.libraryZone, "subjects");
  assert.equal(grid.scrollTop, 126);
  h.document.querySelector('#assetLibraryDirectoryButton').click();
  assert.equal(h.state.libraryZone, "media");
  assert.equal(h.state.libraryFolderId, leaf.id);
  assert.equal(h.state.libraryDirectoryMenuOpen, false);
  assert.equal(h.state.librarySearch, "台词");
  assert.equal(h.state.libraryFilter, "audio");
  assert.deepEqual(plain(h.state.libraryTagFilter), { tagIds: [], untagged: true });
  assert.equal(grid.scrollTop, 74);
  assert.deepEqual(ids(h.window.getVisibleAssetLibraryContent().items), [h.nestedMedia.id]);
  assert.deepEqual(plain(h.store.snapshot()), before);
});

test("directory levels use the unified menu without a separate parent button", (t) => {
  const h = harness(t);
  const folders = [h.folder];
  for (const name of ["第二层", "第三层", "第四层"]) folders.push(h.store.createFolder({ name, parentId: folders.at(-1).id, space: "personal", kind: "media" }));
  h.window.selectAssetLibraryDirectory(folders.at(-1).id);
  assert.equal(h.document.querySelector('#assetLibraryDirectoryBackBtn'), null);
  h.document.querySelector('#assetLibraryDirectoryButton').click();
  assert.equal(h.document.querySelectorAll('[data-library-directory-select]').length >= 5, true);
  h.document.querySelector('[data-library-directory-select=""]').click();
  assert.equal(h.state.libraryFolderId, null);
  assert.equal(h.document.querySelector('#assetLibraryDirectoryName').textContent, "默认目录");
  assert.equal(h.document.activeElement, h.document.querySelector('#assetLibraryDirectoryButton'));
});

test("directory and subject entries restore their own context from subject details without remembering a stale media source", (t) => {
  const h = harness(t);
  const grid = h.document.querySelector('#assetLibraryGrid');
  const subjects = h.document.querySelector('#assetLibrarySubjectsBtn');
  const directory = h.document.querySelector('#assetLibraryDirectoryButton');
  h.window.selectAssetLibraryDirectory(h.folder.id);
  h.state.librarySearch = "台词";
  h.window.renderAssetLibrary();
  grid.scrollTop = 72;
  subjects.click();
  h.state.librarySearch = h.entity.name;
  h.window.renderAssetLibrary();
  grid.scrollTop = 123;
  h.window.viewEntityRelatedMedia(h.entity.id);
  subjects.click();
  assert.equal(h.state.libraryEntityFilter, null);
  assert.equal(h.state.librarySearch, h.entity.name);
  assert.equal(grid.scrollTop, 123);
  h.window.viewEntityRelatedMedia(h.entity.id);
  directory.click();
  assert.equal(h.state.libraryFolderId, h.folder.id);
  assert.equal(h.state.librarySearch, "台词");
  assert.equal(grid.scrollTop, 72);
  // A detail opened directly from another media context must not reuse the old subject return.
  h.window.selectAssetLibraryDirectory(null);
  h.state.librarySearch = "新范围";
  h.window.renderAssetLibrary();
  grid.scrollTop = 34;
  h.window.viewEntityRelatedMedia(h.entity.id);
  directory.click();
  assert.equal(h.state.libraryZone, "media");
  assert.equal(h.state.libraryFolderId, null);
  assert.equal(h.state.librarySearch, "新范围");
  assert.equal(grid.scrollTop, 34);
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

test("same-ID media and subjects keep separate selections across zones and only media supply a drag payload", (t) => {
  const h = harness(t);
  h.store.registerMedia({ media: { id: h.entity.id, type: "image", name: "同 ID 的独立图片", url: "blob:same-id" } });
  h.window.renderAssetLibrary();
  const select = (kind, id) => h.document.querySelector(`[data-library-select="${kind}:${id}"]`).click();
  select("media", h.entity.id);
  assert.deepEqual([...h.state.librarySelectedIds], [`media:${h.entity.id}`]);
  assert.equal(h.document.querySelector('[data-library-subject-zone]'), null);
  h.document.querySelector('#assetLibrarySubjectsBtn').click();
  assert.equal(h.state.librarySelectedIds.size, 0);
  h.document.querySelector('[data-library-selection-toggle]').click();
  h.document.querySelector(`[data-library-entity="${h.entity.id}"] [data-library-preview]`).click();
  assert.deepEqual([...h.state.librarySelectedIds], [`entity:${h.entity.id}`]);
  assert.equal(h.document.querySelectorAll("#assetLibraryGrid .selected").length, 1);
  const subjectCard = h.document.querySelector(`[data-library-entity="${h.entity.id}"]`);
  assert.equal(subjectCard.draggable, false);
  const payload = new Map();
  const drag = (card) => {
    const event = new h.window.Event("dragstart", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: { setData: (type, value) => payload.set(type, value) } });
    card.dispatchEvent(event);
    return event;
  };
  drag(subjectCard);
  assert.equal(payload.size, 0);
  h.document.querySelector('#assetLibraryDirectoryButton').click();
  assert.equal(h.state.librarySelectedIds.size, 0);
  select("media", h.entity.id);
  assert.equal(drag(h.document.querySelector(`[data-library-media="${h.entity.id}"]`)).defaultPrevented, false);
  assert.deepEqual(JSON.parse(payload.get("application/x-reelay-asset")).assetIds, [h.entity.id]);
  assert.deepEqual([...h.state.librarySelectedIds], [`media:${h.entity.id}`]);
  h.document.querySelector('[data-library-select-all]').click();
  assert.ok([...h.state.librarySelectedIds].every((key) => key.startsWith("media:")));
  assert.equal(h.state.librarySelectedIds.size, h.window.getVisibleAssetLibraryContent().items.length);
});

test("subject member browsing leaves canvas unchanged and restores its source", (t) => {
  const h = harness(t);
  const before = JSON.stringify(h.window.createCanvasDocumentSnapshot());
  h.document.querySelector('[data-library-open-subjects]').click();
  h.window.viewEntityRelatedMedia(h.entity.id);
  assert.deepEqual(ids(h.window.getVisibleAssetLibraryContent().items), [h.nestedMedia.id, h.rootMedia.id]);
  assert.equal(h.document.querySelectorAll("#assetLibraryGrid [data-library-entity]").length, 0);
  assert.equal(JSON.stringify(h.window.createCanvasDocumentSnapshot()), before);
  h.document.querySelector('#assetLibraryEntityFilter [data-library-clear-entity-filter]').click();
  assert.ok(h.document.querySelector(`[data-library-entity="${h.entity.id}"]`));
  assert.equal(h.document.querySelector(`[data-library-media="${h.rootMedia.id}"]`), null);
  h.document.querySelector('#assetLibraryDirectoryButton').click();
  assert.equal(h.document.querySelector(`[data-library-entity="${h.entity.id}"]`), null);
  assert.ok(h.document.querySelector(`[data-library-media="${h.rootMedia.id}"]`));
  assert.equal(JSON.stringify(h.window.createCanvasDocumentSnapshot()), before);
});

test("using multiple subjects expands ordered references and inserts shared media only once", (t) => {
  const h = harness(t);
  const other = h.store.registerPersistedEntity({ id: "shared-subject", name: "同一角色另一套设定", version: 1,
    mediaRefs: [{ mediaId: h.rootMedia.id }, { mediaId: h.nestedMedia.id }] }).entity;
  const before = h.state.nodes.length;
  h.document.querySelector('[data-library-open-subjects]').click();
  h.document.querySelector('[data-library-selection-toggle]').click();
  h.document.querySelector(`[data-library-entity="${h.entity.id}"] [data-library-preview]`).click();
  h.document.querySelector(`[data-library-entity="${other.id}"] [data-library-preview]`).click();
  h.document.querySelector('[data-library-batch-toggle]').click();
  h.document.querySelector('[data-library-batch-action="add-canvas"]').click();
  assert.equal(h.state.nodes.length, before + 2);
  assert.equal(h.state.librarySelectedIds.size, 0);
});

test("subject batches expose usage and media batches expose creation without advertising unavailable persistent actions", (t) => {
  const h = harness(t);
  const menuActions = () => [...h.document.querySelectorAll('[data-library-batch-action]')].map((button) => button.dataset.libraryBatchAction).sort();
  h.document.querySelector('[data-library-open-subjects]').click();
  h.document.querySelector('[data-library-selection-toggle]').click();
  h.document.querySelector(`[data-library-entity="${h.entity.id}"] [data-library-preview]`).click();
  h.document.querySelector('[data-library-batch-toggle]').click();
  assert.deepEqual(menuActions(), ["add-canvas"]);
  h.document.querySelector('#assetLibraryDirectoryButton').click();
  h.document.querySelector(`[data-library-select="media:${h.rootMedia.id}"]`).click();
  h.document.querySelector('[data-library-batch-toggle]').click();
  assert.deepEqual(menuActions(), ["add-canvas", "create-group", "move", "review", "share-organization"]);
});

test("group card menus keep edit and rename without duplicate content browsing", (t) => {
  const h = harness(t);
  h.document.querySelector('[data-library-open-subjects]').click();
  const card = h.document.querySelector(`[data-library-entity="${h.entity.id}"]`);
  card.querySelector('[data-library-menu-toggle]').click();
  const actions = [...h.document.querySelectorAll('[data-library-menu-item]')].map((button) => button.dataset.libraryMenuItem).sort();
  assert.deepEqual(actions, ["edit", "rename"]);
});


test("subject edit menu opens its editor with own tags and leaves canvas content unchanged", (t) => {
  const h = harness(t);
  h.store.registerPersistedEntity({ entity: {...h.entity, libraryTagIds: ['builtin:character']} });
  const before = JSON.stringify(h.window.createCanvasDocumentSnapshot());
  h.document.querySelector('[data-library-open-subjects]').click();
  h.document.querySelector(`[data-library-entity="${h.entity.id}"] [data-library-menu-toggle]`).click();
  h.document.querySelector('[data-library-menu-item="edit"]').click();
  assert.equal(h.document.querySelector('[data-entity-editor="true"]').dataset.entityEditorMode, 'edit');
  assert.equal(h.document.querySelector('[data-entity-editor-name]').value, h.entity.name);
  assert.match(h.document.querySelector('[data-entity-editor-tags-toggle]').textContent, /角色/);
  assert.equal(h.state.libraryEntityFilter, null);
  assert.equal(JSON.stringify(h.window.createCanvasDocumentSnapshot()), before);
});

test("subject card click opens its editor and does not add canvas nodes", (t) => {
  const h = harness(t);
  const before = JSON.stringify(h.window.createCanvasDocumentSnapshot());
  h.document.querySelector('[data-library-open-subjects]').click();
  h.document.querySelector(`[data-library-entity="${h.entity.id}"] [data-library-preview]`).click();
  assert.equal(h.document.querySelector('[data-entity-editor="true"]').dataset.entityEditorMode, "edit");
  assert.equal(h.document.querySelector('[data-entity-use-detail]'), null);
  assert.equal(JSON.stringify(h.window.createCanvasDocumentSnapshot()), before);
});

test("subject cover action adds ordered media once without editing and supports one-step undo", (t) => {
  const h = harness(t);
  const before = h.state.nodes.length;
  h.document.querySelector('[data-library-open-subjects]').click();
  const add = () => h.document.querySelector(`[data-library-entity="${h.entity.id}"] [data-library-entity-add]`);
  assert.ok(add());
  add().click();
  assert.equal(h.document.querySelector('[data-entity-editor="true"]'), null);
  assert.equal(h.state.nodes.length, before + 2);
  assert.deepEqual(Array.from(h.state.nodes.slice(before), (node) => node.assets[0].librarySourceId), [h.nestedMedia.id, h.rootMedia.id]);
  add().click();
  assert.equal(h.state.nodes.length, before + 2);
  h.window.undoLastAction();
  assert.equal(h.state.nodes.length, before);
});

test("subject corner checkboxes appear only in multi-selection and sync with cover toggles", (t) => {
  const h = harness(t);
  h.document.querySelector('[data-library-open-subjects]').click();
  assert.equal(h.document.querySelector('[data-library-entity] [data-library-select]'), null);
  h.document.querySelector('[data-library-selection-toggle]').click();
  const cover = () => h.document.querySelector(`[data-library-entity="${h.entity.id}"] [data-library-preview]`);
  const checkbox = () => h.document.querySelector(`[data-library-select="entity:${h.entity.id}"]`);
  assert.equal(checkbox().getAttribute('aria-pressed'), 'false');
  cover().click();
  assert.equal(cover().getAttribute('aria-pressed'), 'true');
  assert.deepEqual([...h.state.librarySelectedIds], [`entity:${h.entity.id}`]);
  assert.equal(checkbox().getAttribute('aria-pressed'), 'true');
  assert.equal(h.document.querySelector('[data-entity-editor="true"]'), null);
  checkbox().click();
  assert.equal(cover().getAttribute('aria-pressed'), 'false');
  assert.equal(h.state.librarySelectedIds.size, 0);
  h.document.querySelector('[data-library-selection-cancel]').click();
  assert.equal(checkbox(), null);
});

test("subject card in reference selection opens members instead of a canvas-use preview", (t) => {
  const h = harness(t);
  const node = h.window.defaultGeneratorNode(0, 0, "video");
  h.state.nodes.push(node);
  h.window.openAssetLibrary(node.id);
  h.document.querySelector('[data-library-open-subjects]').click();
  assert.equal(h.document.querySelector('[data-library-entity-add]'), null);
  h.document.querySelector(`[data-library-entity="${h.entity.id}"] [data-library-preview]`).click();
  assert.equal(h.document.querySelector('[data-entity-use-detail]'), null);
  assert.equal(h.document.querySelector('[data-entity-editor="true"]'), null);
  assert.equal(h.state.libraryEntityFilter.entityId, h.entity.id);
  assert.deepEqual(ids(h.window.getVisibleAssetLibraryContent().items), [h.nestedMedia.id, h.rootMedia.id]);
  assert.equal(node.assets.length, 0);
});

test("node inspiration matching opens platform with a frozen text snapshot and leaves canvas unchanged", (t) => {
  const h = harness(t);
  const node = h.window.defaultGeneratorNode(0, 0, "video");
  h.state.nodes.push(node);
  node.prompt = "人物在海岸向前奔跑，镜头跟拍，自然光";
  const before = JSON.stringify(h.window.createCanvasDocumentSnapshot());
  assert.equal(h.window.findInspiration({ kind: "node", node }), true);
  assert.equal(h.state.librarySpace, "platform");
  assert.equal(h.state.libraryTarget, null);
  const context = h.document.getElementById("inspirationMatchContext");
  assert.equal(context.hidden, false);
  assert.ok(h.document.querySelector('[data-inspiration-match-shot]'));
  assert.equal(JSON.stringify(h.window.createCanvasDocumentSnapshot()), before);
  const snapshot = context.querySelector('p').textContent;
  const firstResult = h.document.querySelector('[data-inspiration-match-shot]').dataset.libraryMedia;
  node.prompt = "雪山里的固定机位";
  h.window.renderAssetLibrary();
  assert.equal(context.querySelector('p').textContent, snapshot);
  assert.equal(h.document.querySelector('[data-inspiration-match-shot]').dataset.libraryMedia, firstResult);
  context.querySelector('[data-match-action="update"]').click();
  assert.equal(context.querySelector('p').textContent, "雪山里的固定机位");
  context.querySelector('[data-match-action="clear"]').click();
  assert.equal(context.hidden, true);
  assert.equal(h.document.querySelector('[data-inspiration-match-shot]'), null);
});

test("Agent inspiration action preserves draft and canvas and releases its source when the conversation or mode changes", (t) => {
  const h = harness(t);
  h.window.setAgentOpen(true);
  h.window.setAgentComposerMode("generation");
  const conversation = h.window.getConversation();
  conversation.draftPrompt = "人物在海岸向前奔跑，镜头跟拍，自然光";
  h.window.syncAgentPromptOptimizationControl();
  const draft = JSON.stringify(conversation);
  const canvas = JSON.stringify(h.window.createCanvasDocumentSnapshot());
  const action = h.document.getElementById("agentInspirationBtn");
  const context = h.document.getElementById("inspirationMatchContext");
  assert.equal(action.disabled, false);
  action.click();
  assert.equal(h.state.librarySpace, "platform");
  assert.equal(h.state.libraryTarget, null);
  assert.equal(context.hidden, false);
  assert.match(context.querySelector('[data-match-label]').textContent, /对话文字/);
  assert.ok(h.document.querySelector('[data-inspiration-match-shot]'));
  assert.equal(JSON.stringify(conversation), draft);
  assert.equal(JSON.stringify(h.window.createCanvasDocumentSnapshot()), canvas);
  h.document.getElementById("agentNewChatBtn").click();
  assert.notEqual(h.window.getConversation(), conversation);
  assert.equal(context.hidden, true);
  assert.equal(h.document.querySelector('[data-inspiration-match-shot]'), null);
  assert.equal(action.disabled, true);
  assert.equal(JSON.stringify(conversation), draft);
  h.window.getConversation().draftPrompt = "海岸，镜头跟拍";
  h.window.syncAgentPromptOptimizationControl();
  action.click();
  assert.equal(context.hidden, false);
  h.window.setAgentComposerMode("agent");
  assert.equal(context.hidden, true);
  assert.equal(action.disabled, true);
});

test("inspiration matching ends on deleted source, canvas navigation, library close and space change", (t) => {
  const h = harness(t);
  const node = h.window.defaultGeneratorNode(0, 0, "video");
  node.prompt = "海岸，镜头跟拍";
  h.state.nodes.push(node);
  const context = h.document.getElementById("inspirationMatchContext");
  const begin = () => {
    assert.equal(h.window.findInspiration({ kind: "node", node }), true);
    assert.equal(context.hidden, false);
  };
  begin();
  h.state.nodes.splice(h.state.nodes.indexOf(node), 1);
  h.window.renderAssetLibrary();
  assert.equal(context.hidden, true);
  assert.equal(h.document.querySelector('[data-inspiration-match-shot]'), null);
  h.state.nodes.push(node);
  begin();
  h.window.closeAssetLibrary();
  h.window.openAssetLibrary();
  assert.equal(context.hidden, true);
  begin();
  h.window.switchAssetLibraryContext({ space: "personal" });
  h.window.switchAssetLibraryContext({ space: "platform" });
  assert.equal(context.hidden, true);
  begin();
  const originalCanvas = h.window.getActiveCanvas().id;
  h.window.addCanvas();
  assert.notEqual(h.window.getActiveCanvas().id, originalCanvas);
  assert.equal(context.hidden, true);
  h.window.switchCanvas(originalCanvas);
  assert.equal(context.hidden, true);
  assert.equal(h.document.querySelector('[data-inspiration-match-shot]'), null);
});

test("manual search and facets remain strict intersections of frozen inspiration results", (t) => {
  const h = harness(t);
  const node = h.window.defaultGeneratorNode(0, 0, "video");
  node.prompt = "人物在海岸向前奔跑，镜头跟拍，自然光";
  h.state.nodes.push(node);
  h.window.findInspiration({ kind: "node", node });
  const initial = ids(h.window.getVisibleAssetLibraryContent().items);
  assert.ok(initial.includes("inspiration-coast"));
  const context = h.document.getElementById("inspirationMatchContext");
  const snapshot = context.querySelector('p').textContent;
  const search = h.document.getElementById("assetLibrarySearchInput");
  const query = (value) => {
    search.value = value;
    search.dispatchEvent(new h.window.Event("input", { bubbles: true }));
  };
  query("海岸");
  assert.deepEqual(ids(h.window.getVisibleAssetLibraryContent().items), ["inspiration-coast"]);
  h.document.querySelector('[data-library-filter-toggle]').click();
  h.document.querySelector('[data-discovery-facet="light:colored"]').click();
  assert.deepEqual(ids(h.window.getVisibleAssetLibraryContent().items), []);
  assert.match(h.document.getElementById("assetLibraryGrid").textContent, /暂无匹配片段/);
  assert.equal(h.document.querySelector('[data-discovery-results]').textContent, "0 个片段");
  assert.equal(context.querySelector('p').textContent, snapshot);
  h.document.querySelector('[data-discovery-reset]').click();
  assert.deepEqual(ids(h.window.getVisibleAssetLibraryContent().items), ["inspiration-coast"]);
  query("不存在的独角兽片段");
  assert.deepEqual(ids(h.window.getVisibleAssetLibraryContent().items), []);
  query("");
  assert.deepEqual(ids(h.window.getVisibleAssetLibraryContent().items), initial);
});
