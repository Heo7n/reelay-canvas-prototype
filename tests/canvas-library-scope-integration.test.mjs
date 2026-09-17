import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const app = await readFile(new URL("../app.js", import.meta.url), "utf8");
const model = await readFile(new URL("../src/legacy-canvas/canvas-asset-library-model.js", import.meta.url), "utf8");
const useModel = await readFile(new URL("../src/legacy-canvas/canvas-entity-use-model.js", import.meta.url), "utf8");
function appFunction(name) {
  const start = app.indexOf(`function ${name}(`);
  assert.notEqual(start, -1);
  return app.slice(start, app.indexOf("\nfunction ", start + 1));
}

test("personal asset readiness is independent of Entity failure but never hides a failed library read", () => {
  const state = { hostCapabilities: { progressiveAssetLoading: true, workspaceCatalog: "unavailable", mediaLibrary: "ready" } };
  const context = vm.createContext({ state, window: { parent: {} } });
  new vm.Script(appFunction("getPersonalCatalogStatus")).runInContext(context);
  assert.equal(context.getPersonalCatalogStatus(), "");
  assert.equal(context.getPersonalCatalogStatus({ includeEntities: true }), "unavailable");
  state.hostCapabilities.mediaLibrary = "unavailable";
  state.hostCapabilities.workspaceCatalog = "ready";
  assert.equal(context.getPersonalCatalogStatus(), "unavailable");
  state.hostCapabilities.mediaLibrary = "loading";
  assert.equal(context.getPersonalCatalogStatus(), "loading");
  state.hostCapabilities.mediaLibrary = undefined;
  assert.equal(context.getPersonalCatalogStatus(), "");
});

test("organization group preview and use resolve the selected placement's names and tags", () => {
  const context = vm.createContext({});
  new vm.Script(model).runInContext(context);
  new vm.Script(useModel).runInContext(context);
  const media = { id: "media", workspaceAssetId: "media", name: "原名称", mediaKind: "image", url: "/assets/media.png" };
  const assetLibraryStore = context.REELAY_CANVAS_ASSET_LIBRARY_MODEL.createAssetLibraryStore({
    media: [media], entities: [{ id: "group", name: "素材组", mediaRefs: [{ mediaId: "media", order: 0 }], coverMediaId: "media" }],
    placements: ["personal", "organization"].flatMap((space) => [
      { item: { kind: "media", id: "media" }, space, folderId: null },
      { item: { kind: "entity", id: "group" }, space, folderId: null },
    ]),
  });
  assetLibraryStore.syncPersistedCatalog({ media: [media], folders: [], tags: [], entries: [
    { assetId: "media", displayName: "个人名称", space: "personal", folderId: null, tagIds: ["builtin:character"] },
    { assetId: "media", displayName: "组织名称", space: "organization", folderId: null, tagIds: ["builtin:scene"] },
  ] });
  context.assetLibraryStore = assetLibraryStore;
  context.canvasEntityUseModel = context.REELAY_CANVAS_ENTITY_USE_MODEL;
  for (const name of ["getEntityUseDetailPayload", "createEntityUseMediaPlan"]) new vm.Script(appFunction(name)).runInContext(context);
  const detail = context.getEntityUseDetailPayload("group", "organization");
  assert.equal(detail.media[0].displayName, "组织名称");
  assert.deepEqual(JSON.parse(JSON.stringify(detail.media[0].tags)), ["场景"]);
  const plan = context.createEntityUseMediaPlan(["group"], [], new Map([["group", "organization"]]));
  assert.equal(plan.entries[0].media.displayName, "组织名称");
  const personal = context.createEntityUseMediaPlan(["group"], [], new Map([["group", "personal"]]));
  assert.equal(personal.entries[0].media.displayName, "个人名称");
});

test("delete result projects a mixed group and media removal before the later Host workspace catalog", () => {
  const errors = [];
  const context = vm.createContext({ URL, Set,
    window: { location: { href: "http://localhost:5182/app", origin: "http://localhost:5182" }, REELAY_CANVAS_SAVE_MEDIA_DIALOG: { BUILTIN_TAGS: [{ id: "builtin:object", name: "物品" }] } },
    state: { librarySpace: "personal", libraryFolderId: null, libraryEntityFilter: { entityId: "remove-group" },
      libraryTagFilter: { tagIds: ["removed-tag", "builtin:object"], untagged: false }, libraryTagFilterByContext: {}, libraryFilterDraft: null },
    hostPersonalMediaIds: new Set(),
    canvasLibraryNavigation: { pruneTags() {} },
    canvasLibrarySearch: { pruneTags() {} },
    sanitizeRuntimeMediaUrl: (url) => url, libraryImagePreviewUrl: (url) => url.href,
    renderAssetLibrary() {}, renderSelectionToolbar() {}, clearAssetLibrarySelection() {}, restoreTransientCanvasMedia() {},
    showActionToast: (message) => errors.push(message),
  });
  new vm.Script(model).runInContext(context);
  context.assetLibraryStore = context.REELAY_CANVAS_ASSET_LIBRARY_MODEL.createAssetLibraryStore();
  for (const name of ["workspaceAssetToLibraryMedia", "registerHostMediaLibrary", "registerHostWorkspaceAssetCatalog"]) new vm.Script(appFunction(name)).runInContext(context);
  const callbackStart = app.indexOf("  onDeleted(catalog, items) {");
  const callback = app.slice(callbackStart, app.indexOf("\n  notify: showActionToast,", callbackStart)).trim();
  new vm.Script(`function ${callback.slice(0, -1)}`).runInContext(context);
  const assets = ["remove", "keep"].map((id) => ({ assetId: id, assetVersion: 1, mediaKind: "image", displayName: id,
    contentType: "image/png", byteSize: 12, checksumSha256: "a".repeat(64), contentUrl: `/api/media/${id}/content` }));
  const entities = assets.map((asset) => ({ id: `${asset.assetId}-group`, name: `${asset.assetId} group`, version: 1,
    description: "", mediaRefs: [{ assetId: asset.assetId, order: 0 }], coverAssetId: asset.assetId }));
  const entries = assets.map((asset) => ({ ...asset, space: "personal", folderId: null, tagIds: [] }));
  const entityEntries = entities.map((entity) => ({ entityId: entity.id, space: "personal", folderId: null, tagIds: [] }));
  context.registerHostWorkspaceAssetCatalog({ assets, entities, libraryCatalog: { folders: [], tags: [], entries, entityEntries } });
  assert.deepEqual(Array.from(context.state.libraryTagFilter.tagIds), ["builtin:object"]);
  const result = { folders: [], tags: [], entries: [entries[1]], entityEntries: [entityEntries[1]] };
  context.onDeleted(result, [{ kind: "entity", id: entities[0].id, expectedVersion: 1 }, { kind: "media", id: assets[0].assetId }]);
  assert.deepEqual(Array.from(context.hostPersonalMediaIds), ["keep"]);
  assert.equal(context.assetLibraryStore.hasPlacement({ kind: "entity", id: "remove-group" }, "personal"), false);
  assert.equal(context.state.libraryEntityFilter, null);
  context.registerHostWorkspaceAssetCatalog({ assets: [assets[1]], entities: [entities[1]], libraryCatalog: result });
  assert.deepEqual(errors, []);
  assert.deepEqual(JSON.parse(JSON.stringify(context.assetLibraryStore.listItems({ kind: "all", space: "personal" }).map((item) => item.id))).sort(), ["keep", "keep-group"]);
});


test("organization transient canvas references restore from scoped library entries without becoming personal assets", () => {
  const restored = [];
  const catalog = { entries: [{ assetId: "organization-image", contentUrl: "blob:organization-live", space: "organization" }], entityEntries: [], tags: [], folders: [] };
  const context = vm.createContext({ Map, hostPersonalMediaIds: new Set(),
    workspaceAssetToLibraryMedia: (asset) => ({ id: asset.assetId, url: asset.contentUrl }),
    registerHostMediaLibrary() {}, restoreTransientCanvasMedia: (media) => restored.push(...media),
    renderAssetLibrary() {}, renderSelectionToolbar() {}, showActionToast: (message) => { throw new Error(message); } });
  new vm.Script(appFunction("registerHostWorkspaceAssetCatalog")).runInContext(context);
  context.registerHostWorkspaceAssetCatalog({ assets: [], entities: [], libraryCatalog: catalog });
  assert.deepEqual(restored.map((media) => media.id), ["organization-image"]);
  assert.equal(restored[0].url, "blob:organization-live");
  assert.equal(context.hostPersonalMediaIds.size, 0);
});
