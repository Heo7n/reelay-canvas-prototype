import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("../src/legacy-canvas/canvas-asset-library-model.js", import.meta.url),
  "utf8",
);
const context = vm.createContext({});
new vm.Script(source).runInContext(context);
const model = context.REELAY_CANVAS_ASSET_LIBRARY_MODEL;
const plain = (value) => JSON.parse(JSON.stringify(value));
const mediaRef = (id) => ({ kind: "media", id });
const entityRef = (id) => ({ kind: "entity", id });

test("group placements share media directories and sort by arrival without moving their members", () => {
  const folder = { id: "design", name: "设计", parentId: null, space: "personal" };
  const media = [{ id: "image", workspaceAssetId: "image", type: "image", name: "原图.png", createdAt: "2026-09-01T00:00:00Z" }];
  const entries = [{ assetId: "image", space: "personal", folderId: "design", displayName: "原图.png", tagIds: [], addedAt: "2026-09-15T00:00:00Z" }];
  const entity = { id: "group", name: "组合", version: 1, assetIds: ["image"], coverAssetId: "image", createdAt: "2026-09-02T00:00:00Z" };
  const entityEntries = [{ entityId: "group", space: "personal", folderId: "design", addedAt: "2026-09-16T00:00:00Z", tagIds: [] }];
  const store = model.createAssetLibraryStore();
  store.syncPersistedCatalog({ media, folders: [folder], entries, entityEntries });
  store.syncPersistedEntities({ entities: [entity] });
  const ordered = () => plain(store.listItems({ space: "personal", kind: "all", folderId: "design", sort: "recent" }).map(({ id }) => id));
  assert.deepEqual(ordered(), ["group", "image"]);
  store.registerPersistedEntity({ entity: { ...entity, name: "改名", version: 2, updatedAt: "2099-01-01T00:00:00Z" } });
  assert.deepEqual(ordered(), ["group", "image"]);
  store.syncPersistedCatalog({ media, folders: [folder], entries, entityEntries: [{ ...entityEntries[0], folderId: null }] });
  assert.deepEqual(ordered(), ["image"]);
  assert.deepEqual(plain(store.listEntityMedia({ entityId: "group" }).items.map(({ id }) => id)), ["image"]);
  assert.equal(store.listItems({ kind: "entity", folderId: null })[0].id, "group");
  store.syncPersistedCatalog({ media, folders: [folder], entries, entityEntries: [] });
  assert.equal(store.getEntity("group"), null);
  assert.equal(store.listItems({ kind: "media", folderId: "design" })[0].id, "image");
});

test("recursive filtering spans the selected subtree without mixing siblings or spaces", () => {
  const store = model.createAssetLibraryStore({
    media: ["root", "parent", "leaf", "sibling", "organization"].map((id) => ({ id, type: "image", name: `武器-${id}` })),
    folders: [
      { id: "parent-folder", name: "父目录", space: "personal", kind: "media" },
      { id: "leaf-folder", name: "子目录", parentId: "parent-folder", space: "personal", kind: "media" },
      { id: "sibling-folder", name: "旁支", space: "personal", kind: "media" },
    ],
    placements: [
      { item: mediaRef("root"), space: "personal", folderId: null, tagIds: ["builtin:object"] },
      { item: mediaRef("parent"), space: "personal", folderId: "parent-folder", tagIds: ["builtin:object"] },
      { item: mediaRef("leaf"), space: "personal", folderId: "leaf-folder", tagIds: ["builtin:object"] },
      { item: mediaRef("sibling"), space: "personal", folderId: "sibling-folder", tagIds: ["builtin:object"] },
      { item: mediaRef("organization"), space: "organization", tagIds: ["builtin:object"] },
    ],
  });
  const before = plain(store.snapshot());
  const list = (options) => plain(store.listItems({ space: "personal", kind: "all", ...options })).map((item) => item.id);
  assert.deepEqual(list({ folderId: null }), ["root"]);
  assert.deepEqual(list({ folderId: null, includeDescendants: true, tagIds: ["builtin:object"] }), ["root", "parent", "leaf", "sibling"]);
  assert.deepEqual(list({ folderId: "parent-folder", includeDescendants: true, query: "武器", mediaKind: "image" }), ["parent", "leaf"]);
  assert.deepEqual(list({ folderId: "leaf-folder", includeDescendants: true }), ["leaf"]);
  assert.deepEqual(list({ folderId: "parent-folder" }), ["parent"]);
  assert.throws(() => list({ folderId: "missing", includeDescendants: true }), /Folder not found/);
  assert.deepEqual(plain(store.snapshot()), before);
});

function createSearchFixtureStore() {
  return model.createAssetLibraryStore({
    media: [
      { id: "root", type: "image", name: "武器正面.png" },
      { id: "leaf", type: "video", name: "武器转台.mp4" },
      { id: "sibling", type: "audio", name: "武器音效.wav" },
      { id: "hidden", type: "image", name: "未公开附件.png", hidden: true },
      { id: "organization", type: "image", name: "武器组织图.png" },
      { id: "platform", type: "image", name: "武器平台图.png" },
      { id: "unplaced", type: "image", name: "武器未入库.png" },
    ],
    entities: [
      { id: "equipment", name: "装备设定", description: "武器道具参考", mediaRefs: ["root", "leaf", "hidden"] },
      { id: "sound", name: "音效设定", mediaRefs: ["sibling"] },
      { id: "organization-subject", name: "武器组织主体", mediaRefs: ["organization"] },
      { id: "platform-subject", name: "武器平台主体", mediaRefs: ["platform"] },
    ],
    folders: [
      { id: "design", name: "武器设计", space: "personal", kind: "media" },
      { id: "detail", name: "细节", parentId: "design", space: "personal", kind: "media" },
      { id: "sibling", name: "旁支", space: "personal", kind: "media" },
      { id: "legacy-subjects", name: "武器旧主体目录", space: "personal", kind: "entity" },
      { id: "organization", name: "武器组织目录", space: "organization", kind: "media" },
      { id: "platform", name: "武器平台目录", space: "platform", kind: "media" },
    ],
    placements: [
      { item: mediaRef("root"), space: "personal", tagIds: ["member"], tags: ["成员标签"] },
      { item: mediaRef("leaf"), space: "personal", folderId: "detail", tagIds: ["builtin:object"], tags: ["物品"] },
      { item: mediaRef("sibling"), space: "personal", folderId: "sibling", tagIds: [] },
      { item: mediaRef("hidden"), space: "personal", tagIds: [] },
      { item: entityRef("equipment"), space: "personal", folderId: "legacy-subjects", tagIds: ["builtin:object"], tags: ["物品"] },
      { item: entityRef("sound"), space: "personal", tagIds: [] },
      { item: mediaRef("organization"), space: "organization", folderId: "organization" },
      { item: entityRef("organization-subject"), space: "organization" },
      { item: mediaRef("platform"), space: "platform", folderId: "platform" },
      { item: entityRef("platform-subject"), space: "platform" },
    ],
  });
}

test("global library search groups all directory depths without changing the catalog or returned item format", () => {
  const store = createSearchFixtureStore();
  const before = plain(store.snapshot());
  const results = store.searchLibrary({ space: "personal", query: " 武器 " });
  assert.deepEqual(plain(results.folders.map(({ id }) => id)), ["design", "detail"]);
  assert.deepEqual(plain(results.media.map(({ id }) => id)), ["root", "leaf", "sibling"]);
  assert.deepEqual(plain(results.entities.map(({ id }) => id)), ["equipment", "sound"]);
  assert.deepEqual(plain(results.media), plain(store.listItems({ space: "personal", kind: "media", query: "武器", sort: "recent" })));
  assert.deepEqual(plain(results.entities), plain(store.listItems({ space: "personal", kind: "entity", query: "武器", sort: "recent" })));
  results.folders[0].name = "outside mutation";
  results.media[0].placement.tagIds.length = 0;
  results.entities[0].mediaRefs.length = 0;
  assert.deepEqual(plain(store.snapshot()), before);
});

test("global library search matches complete folder paths and omits obsolete subject directories", () => {
  const store = createSearchFixtureStore();
  const ids = (query) => plain(store.searchLibrary({ query }).folders.map(({ id }) => id));
  assert.deepEqual(ids("细节"), ["detail"]);
  assert.deepEqual(ids("武器设计 / 细节"), ["detail"]);
  assert.deepEqual(ids("武器设计 细节"), ["detail"]);
  assert.deepEqual(ids("旧主体"), []);
});

test("global library search respects each space and exposes only subjects belonging to that space", () => {
  const store = createSearchFixtureStore();
  for (const space of ["organization", "platform"]) {
    const results = plain(store.searchLibrary({ space, query: "武器" }));
    assert.deepEqual(results.folders.map(({ id }) => id), [space]);
    assert.deepEqual(results.media.map(({ id }) => id), [space]);
    assert.deepEqual(results.entities.map(({ id }) => id), space === "organization" ? ["organization-subject"] : []);
  }
  assert.deepEqual(plain(store.searchLibrary({ space: "official", query: "武器" })),
    plain(store.searchLibrary({ space: "platform", query: "武器" })));
  assert.throws(() => store.searchLibrary({ space: "unknown", query: "武器" }), /Unknown asset library space/);
});

test("global search applies media type only to media and own tags to each result kind", () => {
  const store = createSearchFixtureStore();
  const typed = plain(store.searchLibrary({ query: "武器", mediaKind: "audio" }));
  assert.deepEqual(typed.folders, []);
  assert.deepEqual(typed.media.map(({ id }) => id), ["sibling"]);
  assert.deepEqual(typed.entities.map(({ id }) => id), ["equipment", "sound"]);
  const tagged = plain(store.searchLibrary({ query: "武器", tagIds: ["builtin:object"], mediaKind: "audio" }));
  assert.deepEqual(tagged.folders, []);
  assert.deepEqual(tagged.media, []);
  assert.deepEqual(tagged.entities.map(({ id }) => id), ["equipment"]);
  const memberTag = plain(store.searchLibrary({ query: "武器", tagIds: ["member"] }));
  assert.deepEqual(memberTag.media.map(({ id }) => id), ["root"]);
  assert.deepEqual(memberTag.entities, []);
  const untagged = plain(store.searchLibrary({ query: "武器", untagged: true }));
  assert.deepEqual(untagged.folders, []);
  assert.deepEqual(untagged.media.map(({ id }) => id), ["sibling"]);
  assert.deepEqual(untagged.entities.map(({ id }) => id), ["sound"]);
});

test("global subject search retains own description and tags plus accessible member search", () => {
  const store = createSearchFixtureStore();
  const ids = (query) => plain(store.searchLibrary({ query }).entities.map(({ id }) => id));
  assert.deepEqual(ids("道具参考"), ["equipment"]);
  assert.deepEqual(ids("物品"), ["equipment"]);
  assert.deepEqual(ids("转台"), ["equipment"]);
  assert.deepEqual(ids("成员标签"), ["equipment"]);
  assert.deepEqual(ids("未公开附件"), []);
});

test("empty global search leaves the existing navigation view in charge", () => {
  const store = createSearchFixtureStore();
  assert.deepEqual(plain(store.searchLibrary()), { folders: [], media: [], entities: [] });
  assert.deepEqual(plain(store.searchLibrary({ query: "  ", tagIds: ["builtin:object"] })),
    { folders: [], media: [], entities: [] });
});

function createFixtureStore() {
  return model.createAssetLibraryStore({
    media: [
      {
        id: "portrait",
        type: "image",
        name: "主角人像.png",
        displayName: "主角人像",
        url: "blob:portrait",
        librarySourceId: "canvas-result-1",
      },
      { id: "voice", type: "audio", name: "角色台词.mp3", url: "blob:voice" },
      { id: "platform-video", type: "video", name: "平台示例.mp4", url: "/platform/demo.mp4" },
    ],
    entities: [
      {
        id: "hero",
        name: "主角",
        mediaRefs: [
          { mediaId: "portrait", order: 7 },
          { mediaId: "voice", order: 2 },
          { mediaId: "portrait", order: 9 },
        ],
        url: "must-not-copy",
        blob: { unsafe: true },
        width: 1920,
        height: 1080,
      },
    ],
    folders: [
      { id: "personal-media", name: "个人素材", space: "personal", kind: "media" },
      { id: "personal-entity", name: "个人主体", space: "personal", kind: "entity" },
      { id: "organization-media", name: "组织素材", space: "organization", kind: "media" },
      { id: "organization-entity", name: "组织主体", space: "organization", kind: "entity" },
      { id: "platform-media", name: "平台素材", space: "platform", kind: "media" },
    ],
    placements: [
      { item: mediaRef("portrait"), space: "personal", folderId: "personal-media" },
      { item: mediaRef("voice"), space: "personal", folderId: "personal-media" },
      { item: entityRef("hero"), space: "personal", folderId: "personal-entity" },
      { item: mediaRef("platform-video"), space: "official", folderId: "platform-media" },
    ],
  });
}

test("exposes only the focused asset-library model API", () => {
  assert.ok(Object.isFrozen(model));
  assert.deepEqual(plain(Object.keys(model).sort()), [
    "MAX_DIRECTORY_LEVELS",
    "createAssetLibraryStore",
    "isMutableSpace",
    "matchesSearch",
    "normalizeSearch",
    "normalizeSpace",
  ]);
  assert.equal(model.MAX_DIRECTORY_LEVELS, 5);
  const store = createFixtureStore();
  assert.equal(store.createEntityFromMedia, undefined);
  assert.equal(store.importPlatformMediaToPersonal, undefined);
});

test("normalizes searches and the legacy official space without making platform mutable", () => {
  assert.equal(model.normalizeSearch("  Robot HERO  "), "robot hero");
  assert.equal(model.matchesSearch(["星海", "Robot Hero"], " robot "), true);
  assert.equal(model.normalizeSpace("official"), "platform");
  assert.equal(model.normalizeSpace("unknown"), "personal");
  assert.equal(model.isMutableSpace("personal"), true);
  assert.equal(model.isMutableSpace("organization"), true);
  assert.equal(model.isMutableSpace("platform"), false);
  assert.equal(model.isMutableSpace("official"), false);
  assert.equal(model.isMutableSpace("unknown"), false);
});

test("lists folders and items by placement, space, folder, media kind, and search", () => {
  const store = createFixtureStore();

  assert.deepEqual(plain(store.listFolders({ space: "personal", kind: "media" })).map((folder) => folder.id), [
    "personal-media",
  ]);
  assert.deepEqual(plain(store.listItems({ space: "personal", kind: "media" })).map((item) => item.id), [
    "portrait",
    "voice",
  ]);
  assert.deepEqual(
    plain(store.listItems({ space: "personal", kind: "media", mediaKind: "audio", query: "台词" })).map((item) => item.id),
    ["voice"],
  );
  assert.deepEqual(
    plain(store.listItems({ space: "personal", kind: "media", folderId: "personal-media" })).map((item) => item.id),
    ["portrait", "voice"],
  );
  assert.deepEqual(plain(store.listItems({ space: "platform", kind: "media" })).map((item) => item.id), [
    "platform-video",
  ]);
  assert.equal(store.hasPlacement(mediaRef("platform-video"), "official"), true);
});

test("returns isolated media, Entity references, resolved Entity media, and snapshots", () => {
  const store = createFixtureStore();
  const entity = plain(store.getEntity(entityRef("hero")));

  assert.deepEqual(entity.mediaRefs, [
    { mediaId: "portrait", order: 0 },
    { mediaId: "voice", order: 1 },
  ]);
  assert.equal("url" in entity, false);
  assert.equal("blob" in entity, false);
  assert.equal("width" in entity, false);
  assert.equal("height" in entity, false);
  assert.deepEqual(plain(store.getEntityMedia(entityRef("hero"))).map((item) => item.id), ["portrait", "voice"]);
  assert.deepEqual(plain(store.listAllMedia()).map((item) => item.id), ["portrait", "voice", "platform-video"]);

  const snapshot = store.snapshot();
  snapshot.media[0].name = "mutated outside";
  snapshot.entities[0].mediaRefs.length = 0;
  assert.equal(store.getMedia(mediaRef("portrait")).name, "主角人像.png");
  assert.equal(store.getEntity(entityRef("hero")).mediaRefs.length, 2);
});

test("unified reads mix root assets without relocating or conflating records with the same id", () => {
  const store = model.createAssetLibraryStore({
    media: [
      { id: "shared-id", type: "image", name: "照片", createdAt: "2026-09-10T00:00:00Z" },
      { id: "recent", type: "video", name: "影片", createdAt: "2026-09-12T00:00:00Z" },
    ],
    entities: [{ id: "shared-id", name: "素材组", mediaRefs: ["shared-id"], createdAt: "2026-09-11T00:00:00Z" }],
    placements: [
      { item: mediaRef("shared-id"), space: "personal" },
      { item: entityRef("shared-id"), space: "personal" },
      { item: mediaRef("recent"), space: "personal" },
    ],
  });
  const before = plain(store.snapshot());
  const items = plain(store.listItems({ space: "personal", kind: "all", folderId: null, sort: "recent" }));
  assert.deepEqual(items.map((item) => [item.kind, item.id]), [
    ["media", "recent"], ["entity", "shared-id"], ["media", "shared-id"],
  ]);
  assert.deepEqual(items.map((item) => item.placement.item), items.map(({ kind, id }) => ({ kind, id })));
  items[1].mediaRefs.length = 0;
  assert.deepEqual(plain(store.snapshot()), before);
});

test("unified directories preserve both original trees and validate space at child reads", () => {
  const store = createFixtureStore();
  const before = plain(store.snapshot());
  assert.deepEqual(plain(store.listFolders({ space: "personal", kind: "all", parentId: null })).map((folder) => folder.id), [
    "personal-media", "personal-entity",
  ]);
  assert.deepEqual(plain(store.listItems({ space: "personal", kind: "all", folderId: null })), []);
  assert.deepEqual(plain(store.listItems({ space: "personal", kind: "all", folderId: "personal-media" })).map((item) => item.id), [
    "portrait", "voice",
  ]);
  assert.deepEqual(plain(store.listItems({ space: "personal", kind: "all", folderId: "personal-entity" })).map((item) => item.id), ["hero"]);
  assert.deepEqual(plain(store.getFolderPath({ space: "personal", kind: "all", folderId: "personal-entity" })).map((folder) => folder.id), ["personal-entity"]);
  assert.throws(() => store.listItems({ space: "organization", kind: "all", folderId: "personal-entity" }), /does not belong/);
  assert.throws(() => store.getFolderPath({ space: "organization", kind: "all", folderId: "personal-entity" }), /does not belong/);
  assert.throws(() => store.listItems({ space: "personal", kind: "all", folderId: "missing" }), /Folder not found/);
  assert.deepEqual(plain(store.snapshot()), before);
});

test("unified type and search filters match groups through visible matching media", () => {
  const store = createFixtureStore();
  assert.deepEqual(plain(store.listItems({ space: "personal", kind: "all", mediaKind: "audio", query: "台词" })).map((item) => item.id), ["voice", "hero"]);
  assert.deepEqual(plain(store.listItems({ space: "personal", kind: "all", mediaKind: "image", query: "台词" })), []);
  assert.deepEqual(plain(store.listItems({ space: "personal", kind: "all", mediaKind: "video" })), []);
  assert.deepEqual(plain(store.listItems({ space: "personal", kind: "all", query: "人像" })).map((item) => item.id), ["portrait", "hero"]);
  assert.deepEqual(plain(store.listItems({ space: "personal", kind: "entity", query: "人像" })).map((item) => item.id), ["hero"]);
  assert.throws(() => store.createFolder({ space: "personal", kind: "all", name: "不允许的目录" }), /Unknown asset library item kind/);
  const hiddenSnapshot = plain(store.snapshot());
  hiddenSnapshot.media.find((media) => media.id === "voice").hidden = true;
  const hiddenStore = model.createAssetLibraryStore(hiddenSnapshot);
  assert.deepEqual(plain(hiddenStore.listItems({ space: "personal", kind: "all", mediaKind: "audio", folderId: "personal-entity" })), []);
  assert.deepEqual(plain(hiddenStore.listItems({ space: "personal", kind: "all", query: "台词", folderId: "personal-entity" })), []);
});

test("mixed selection expansion preserves typed identities and ordered group references without duplicates", () => {
  const store = model.createAssetLibraryStore({
    media: [
      { id: "shared", type: "image", name: "共享 ID 图片" },
      { id: "voice", type: "audio", name: "音频" },
      { id: "video", type: "video", name: "视频" },
    ],
    entities: [
      { id: "shared", name: "共享 ID 素材组", mediaRefs: ["voice", "shared"] },
      { id: "second", name: "第二组", mediaRefs: ["video", "voice"] },
    ],
    placements: [
      ...["shared", "voice", "video"].map((id) => ({ item: mediaRef(id), space: "personal" })),
      ...["shared", "second"].map((id) => ({ item: entityRef(id), space: "personal" })),
    ],
  });
  const before = plain(store.snapshot());
  const result = store.resolveMediaItems({ items: [entityRef("shared"), mediaRef("shared"), entityRef("second"), mediaRef("video")], space: "personal" });
  assert.deepEqual(plain(result.media).map((media) => media.id), ["voice", "shared", "video"]);
  assert.equal(result.missingCount, 0);
  result.media[0].name = "外部修改";
  assert.deepEqual(plain(store.snapshot()), before);
  assert.deepEqual(plain(store.resolveMediaItems({ items: [mediaRef("shared"), entityRef("shared")], space: "personal" }).media).map((media) => media.id), ["shared", "voice"]);
});

test("mixed selection expansion rejects stale or inaccessible top-level references before returning a batch", () => {
  const store = createFixtureStore();
  const before = plain(store.snapshot());
  assert.throws(() => store.resolveMediaItems({ items: [mediaRef("portrait"), mediaRef("platform-video")], space: "personal" }), /not visible/);
  assert.throws(() => store.resolveMediaItems({ items: [entityRef("hero")], space: "organization" }), /not visible/);
  assert.throws(() => store.resolveMediaItems({ items: [mediaRef("missing")], space: "personal" }), /not found/);
  assert.throws(() => store.resolveMediaItems({ items: [{ kind: "all", id: "portrait" }] }), /Unknown asset library item kind/);
  assert.throws(() => store.resolveMediaItems({ items: ["portrait"] }), /Unknown asset library item kind/);
  assert.throws(() => store.resolveMediaItems({ items: {} }), /must be an array/);
  assert.deepEqual(plain(store.resolveMediaItems({ items: [], space: "personal" })), { media: [], missingCount: 0, existingCount: 0 });
  assert.deepEqual(plain(store.resolveMediaItems({ items: [mediaRef("platform-video")], space: "platform" }).media).map((media) => media.id), ["platform-video"]);
  assert.deepEqual(plain(store.snapshot()), before);
});

test("mixed selection expansion skips hidden group members and counts unique unavailable media", () => {
  const snapshot = plain(createFixtureStore().snapshot());
  snapshot.media.find((media) => media.id === "voice").hidden = true;
  snapshot.entities.push({ id: "another", name: "另一组", mediaRefs: ["voice", "portrait"] });
  snapshot.placements.push({ item: entityRef("another"), space: "personal" });
  const store = model.createAssetLibraryStore(snapshot);
  const result = plain(store.resolveMediaItems({ items: [entityRef("hero"), entityRef("another")], space: "personal" }));
  assert.deepEqual(result.media.map((media) => media.id), ["portrait"]);
  assert.equal(result.missingCount, 1);
  assert.throws(() => store.resolveMediaItems({ items: [entityRef("hero"), mediaRef("voice")], space: "personal" }), /not visible/);
});

test("mixed selection expansion can exclude existing canvas media through every stable identity field", () => {
  const store = createFixtureStore();
  const items = [entityRef("hero"), mediaRef("portrait")];
  for (const field of ["id", "assetId", "mediaAssetId", "librarySourceId", "workspaceAssetId", "platformSourceId", "sourceId"]) {
    const result = plain(store.resolveMediaItems({ items, space: "personal", existingMedia: [{ id: "canvas-copy", [field]: " portrait " }] }));
    assert.deepEqual(result.media.map((media) => media.id), ["voice"], field);
    assert.equal(result.existingCount, 1, field);
    assert.equal(result.missingCount, 0, field);
  }
  const sourceResult = plain(store.resolveMediaItems({ items, space: "personal", existingMedia: [{ media: { id: "canvas-copy", sourceId: "canvas-result-1" } }] }));
  assert.deepEqual(sourceResult.media.map((media) => media.id), ["voice"]);
  assert.equal(sourceResult.existingCount, 1);
  const unexcluded = plain(store.resolveMediaItems({ items, space: "personal" }));
  assert.deepEqual(unexcluded.media.map((media) => media.id), ["portrait", "voice"]);
  assert.equal(unexcluded.existingCount, 0);
  assert.throws(() => store.resolveMediaItems({ items, existingMedia: {} }), /Existing media must be an array/);
});

test("registerMedia deduplicates by id, source id, or URL while adding a placement", () => {
  const store = createFixtureStore();
  const bySource = store.registerMedia({
    media: { id: "different-id", type: "image", librarySourceId: "canvas-result-1", url: "blob:other" },
    space: "organization",
    folderId: "organization-media",
  });
  const byUrl = store.registerMedia({
    media: { id: "another-id", type: "image", url: "blob:portrait" },
    space: "organization",
    folderId: "organization-media",
  });

  assert.equal(bySource.created, false);
  assert.equal(bySource.media.id, "portrait");
  assert.equal(bySource.placementCreated, true);
  assert.equal(byUrl.created, false);
  assert.equal(byUrl.media.id, "portrait");
  assert.equal(byUrl.placementCreated, false);
  assert.equal(store.listAllMedia().length, 3);
  assert.equal(store.hasPlacement(mediaRef("portrait"), "organization", "organization-media"), true);
});

test("registers persisted Entities idempotently in the personal root without weakening Media invariants", () => {
  const store = createFixtureStore();
  const persisted = {
    id: "persisted-hero",
    name: " 持久主角 ",
    description: "角色说明",
    mediaRefs: [
      { assetId: "portrait", order: 0 },
      { assetId: "voice", order: 1 },
      { assetId: "portrait", order: 2 },
    ],
    coverAssetId: "portrait",
    version: 1,
  };
  const first = store.registerPersistedEntity({ entity: persisted });
  const repeated = store.registerPersistedEntity({ entity: persisted });

  assert.equal(first.created, true);
  assert.equal(first.updated, false);
  assert.equal(first.placementCreated, true);
  assert.equal(repeated.created, false);
  assert.equal(repeated.updated, false);
  assert.equal(repeated.placementCreated, false);
  assert.deepEqual(plain(store.getEntity(entityRef("persisted-hero"))), {
    id: "persisted-hero",
    name: "持久主角",
    mediaRefs: [
      { mediaId: "portrait", order: 0 },
      { mediaId: "voice", order: 1 },
    ],
    description: "角色说明",
    coverMediaId: "portrait",
    version: 1,
    space: "personal",
    tagIds: [],
    tags: [],
  });
  assert.equal(store.hasPlacement(entityRef("persisted-hero"), "personal", null), true);
  const beforeUnsupportedCommands = plain(store.snapshot());
  assert.throws(
    () => store.renameItem({ item: entityRef("persisted-hero"), name: "绕过版本改名", space: "personal" }),
    /版本化主体命令/,
  );
  assert.throws(
    () => store.moveItems({ items: [entityRef("persisted-hero")], space: "personal", folderId: "personal-entity" }),
    /版本化主体命令/,
  );
  assert.throws(
    () => store.shareToOrganization({ items: [entityRef("persisted-hero")], fromSpace: "personal" }),
    /持久主体共享必须通过版本化主体命令/,
  );
  assert.throws(
    () => store.removePlacements({ items: [entityRef("persisted-hero")], space: "personal" }),
    /版本化主体命令/,
  );
  assert.deepEqual(plain(store.snapshot()), beforeUnsupportedCommands);

  const beforeFailure = plain(store.snapshot());
  assert.throws(
    () => store.registerPersistedEntity({
      entity: { ...persisted, id: "audio-cover", coverAssetId: "voice" },
    }),
    /cover must be an image/,
  );
  assert.throws(
    () => store.registerPersistedEntity({
      entity: { ...persisted, id: "missing-media", mediaRefs: [{ assetId: "missing", order: 0 }] },
    }),
    /references missing media/,
  );
  assert.throws(
    () => store.registerPersistedEntity({ entity: { ...persisted, id: "versionless", version: 0 } }),
    /positive integer/,
  );
  assert.throws(
    () => store.registerPersistedEntity({ entity: { ...persisted, id: "hero" } }),
    /page-local record/,
  );
  assert.deepEqual(plain(store.snapshot()), beforeFailure);
});

test("syncs the complete persisted Entity projection atomically and rejects stale snapshots", () => {
  const store = createFixtureStore();
  const firstCatalog = [
    {
      id: "persisted-a",
      name: "主体 A",
      description: "",
      mediaRefs: [{ mediaId: "portrait", order: 0 }],
      coverMediaId: "portrait",
      version: 1,
    },
    {
      id: "persisted-b",
      name: "主体 B",
      description: "声音主体",
      mediaRefs: [{ mediaId: "voice", order: 0 }],
      coverMediaId: null,
      version: 1,
    },
  ];
  assert.deepEqual(plain(store.syncPersistedEntities({ entities: firstCatalog }).removedEntityIds), []);
  assert.equal(store.hasPlacement(entityRef("persisted-a"), "personal", null), true);
  assert.equal(store.hasPlacement(entityRef("persisted-b"), "personal", null), true);

  const second = store.syncPersistedEntities({ entities: [{ ...firstCatalog[1], name: "主体 B2", version: 2 }] });
  assert.deepEqual(plain(second.removedEntityIds), ["persisted-a"]);
  assert.equal(store.getEntity(entityRef("persisted-a")), null);
  assert.equal(store.hasPlacement(entityRef("persisted-a"), "personal"), false);
  assert.equal(store.getEntity(entityRef("persisted-b")).name, "主体 B2");

  const beforeFailure = plain(store.snapshot());
  assert.throws(
    () => store.syncPersistedEntities({ entities: [{ ...firstCatalog[1], name: "旧名称", version: 1 }] }),
    /version cannot move backwards/,
  );
  assert.throws(
    () => store.syncPersistedEntities({
      entities: [
        { ...firstCatalog[1], name: "同版本不同内容", version: 2 },
        { ...firstCatalog[1], name: "重复记录", version: 2 },
      ],
    }),
    /changed without a new version|Duplicate persisted Entity id/,
  );
  assert.deepEqual(plain(store.snapshot()), beforeFailure);
});

test("syncing the full Entity catalog removes absent persisted subjects from both writable spaces", () => {
  const entity = {
    id: "persisted-shared",
    name: "已共享主体",
    description: "",
    mediaRefs: [{ mediaId: "portrait", order: 0 }],
    coverMediaId: "portrait",
    version: 1,
  };
  const store = model.createAssetLibraryStore({
    media: [{ id: "portrait", type: "image", name: "主体封面" }],
    entities: [entity],
    placements: [
      { item: mediaRef("portrait"), space: "personal", folderId: null },
      { item: mediaRef("portrait"), space: "organization", folderId: null },
      { item: entityRef(entity.id), space: "personal", folderId: null },
      { item: entityRef(entity.id), space: "organization", folderId: null },
    ],
  });

  const result = store.syncPersistedEntities({ entities: [] });

  assert.deepEqual(plain(result.removedEntityIds), [entity.id]);
  assert.equal(store.hasPlacement(entityRef(entity.id), "personal"), false);
  assert.equal(store.hasPlacement(entityRef(entity.id), "organization"), false);
  assert.equal(store.getEntity(entityRef(entity.id)), null);
});

test("updates persisted Entity content only from the expected version and advances exactly once", () => {
  const store = createFixtureStore();
  store.registerPersistedEntity({
    entity: {
      id: "persisted-edit",
      name: "编辑前",
      description: "旧描述",
      mediaRefs: [{ mediaId: "portrait", order: 0 }],
      coverMediaId: "portrait",
      version: 3,
    },
  });
  const beforeConflict = plain(store.snapshot());
  assert.throws(
    () => store.updateEntity({ entityId: "persisted-edit", expectedVersion: 2, name: "陈旧写入" }),
    (error) => error.code === "conflict" && error.currentVersion === 3,
  );
  assert.deepEqual(plain(store.snapshot()), beforeConflict);

  const updated = store.updateEntity({
    entityId: "persisted-edit",
    expectedVersion: 3,
    name: " 编辑后 ",
    description: "新描述",
    mediaRefs: [
      { mediaId: "voice", order: 0 },
      { mediaId: "portrait", order: 1 },
      { mediaId: "voice", order: 2 },
    ],
    coverMediaId: "portrait",
  });
  assert.equal(updated.version, 4);
  assert.equal(updated.name, "编辑后");
  assert.deepEqual(plain(updated.mediaRefs), [
    { mediaId: "voice", order: 0 },
    { mediaId: "portrait", order: 1 },
  ]);
  assert.equal(store.hasPlacement(entityRef("persisted-edit"), "personal", null), true);

  const beforeInvalid = plain(store.snapshot());
  assert.throws(
    () => store.updateEntity({
      entityId: "persisted-edit",
      expectedVersion: 4,
      mediaRefs: [{ mediaId: "voice", order: 0 }],
      coverMediaId: "voice",
    }),
    /cover must be an image/,
  );
  assert.throws(
    () => store.updateEntity({
      entityId: "persisted-edit",
      expectedVersion: 4,
      mediaRefs: [],
      coverMediaId: null,
    }),
    /must reference at least one Media item/,
  );
  assert.deepEqual(plain(store.snapshot()), beforeInvalid);
});

test("rejects structurally invalid Entity seed records", () => {
  assert.throws(
    () => model.createAssetLibraryStore({ entities: [{ id: "empty", name: "空主体", mediaRefs: [] }] }),
    /at least one Media/,
  );
  assert.throws(
    () => model.createAssetLibraryStore({
      media: [{ id: "image", type: "image" }],
      entities: [{
        id: "bad-cover",
        name: "错误封面",
        mediaRefs: [{ mediaId: "image" }],
        coverMediaId: "missing",
      }],
    }),
    /cover media must belong/,
  );
  assert.throws(
    () => model.createAssetLibraryStore({
      media: [{ id: "image", type: "image" }],
      entities: [{ id: "missing-ref", name: "缺失引用", mediaRefs: [{ mediaId: "missing" }] }],
    }),
    /references missing media/,
  );
  assert.throws(
    () => model.createAssetLibraryStore({
      media: [{ id: "voice", type: "audio" }],
      entities: [{
        id: "audio-cover",
        name: "音频封面",
        mediaRefs: [{ mediaId: "voice" }],
        coverMediaId: "voice",
      }],
    }),
    /cover media must be an image/,
  );
  assert.throws(
    () => model.createAssetLibraryStore({
      media: [{ id: "motion", type: "video" }],
      entities: [{
        id: "video-cover",
        name: "视频封面",
        mediaRefs: [{ mediaId: "motion" }],
        coverMediaId: "motion",
      }],
    }),
    /cover media must be an image/,
  );
});

test("creates and renames folders, renames items, and moves placements without changing item ids", () => {
  const store = createFixtureStore();
  const folder = store.createFolder({ id: "archive", name: " 待整理 ", space: "personal", kind: "media" });
  assert.equal(folder.name, "待整理");
  assert.equal(store.renameFolder({ folderId: "archive", name: "归档", space: "personal" }).name, "归档");
  assert.equal(
    store.renameItem({ item: mediaRef("portrait"), name: "角色定妆", space: "personal" }).name,
    "角色定妆",
  );
  store.moveItems({ items: [mediaRef("portrait"), mediaRef("voice")], space: "personal", folderId: "archive" });

  assert.equal(store.hasPlacement(mediaRef("portrait"), "personal", "archive"), true);
  assert.equal(store.hasPlacement(mediaRef("voice"), "personal", "archive"), true);
  assert.equal(store.getMedia(mediaRef("portrait")).id, "portrait");
  assert.deepEqual(plain(store.listFolders({ space: "personal", kind: "media" })).map((item) => item.name), [
    "个人素材",
    "归档",
  ]);
});

test("builds a five-level directory tree from the virtual default root and rejects cycles or overflow", () => {
  const store = createFixtureStore();
  const level2 = store.createFolder({ id: "role", name: "角色", space: "personal", kind: "media" });
  const level3 = store.createFolder({ id: "lirael", name: "Lirael", space: "personal", kind: "media", parentId: level2.id });
  const level4 = store.createFolder({ id: "style", name: "造型1", space: "personal", kind: "media", parentId: level3.id });

  assert.deepEqual(plain(store.getFolderPath({
    folderId: level4.id,
    space: "personal",
    kind: "media",
  })).map((folder) => folder.id), ["role", "lirael", "style"]);
  assert.deepEqual(plain(store.listFolders({
    space: "personal",
    kind: "media",
    parentId: level2.id,
  })).map((folder) => folder.id), ["lirael"]);

  const level5 = store.createFolder({
    id: "episode-settings",
    name: "第一集设定",
    space: "personal",
    kind: "media",
    parentId: level4.id,
  });
  assert.equal(store.getFolderPath({ folderId: level5.id, space: "personal", kind: "media" }).length, 4);
  assert.throws(
    () => store.createFolder({
      id: "too-deep",
      name: "越界目录",
      space: "personal",
      kind: "media",
      parentId: level5.id,
    }),
    /at most 5 levels/,
  );
  assert.throws(
    () => store.moveFolder({ folderId: "role", parentId: "episode-settings", space: "personal" }),
    /descendants/,
  );
});

test("folder names are unique among siblings while moving a subtree preserves valid depth", () => {
  const store = createFixtureStore();
  store.createFolder({ id: "characters", name: "角色", space: "personal", kind: "media" });
  store.createFolder({ id: "scenes", name: "场景", space: "personal", kind: "media" });
  store.createFolder({ id: "nested-scenes", name: "场景", space: "personal", kind: "media", parentId: "characters" });
  assert.throws(
    () => store.createFolder({ id: "duplicate", name: "场景", space: "personal", kind: "media" }),
    /already exists in this directory/,
  );
  assert.equal(
    store.moveFolder({ folderId: "nested-scenes", parentId: "scenes", space: "personal" }).parentId,
    "scenes",
  );
});

test("shares an Entity and its Media to organization by placement without cloning records", () => {
  const store = createFixtureStore();
  const mediaBefore = plain(store.listAllMedia());
  store.shareToOrganization({
    items: [entityRef("hero")],
    fromSpace: "personal",
    mediaFolderId: "organization-media",
    entityFolderId: "organization-entity",
  });

  assert.equal(store.hasPlacement(entityRef("hero"), "organization", "organization-entity"), true);
  assert.equal(store.hasPlacement(mediaRef("portrait"), "organization", "organization-media"), true);
  assert.equal(store.hasPlacement(mediaRef("voice"), "organization", "organization-media"), true);
  assert.deepEqual(plain(store.listAllMedia()), mediaBefore);

  store.removePlacements({ items: [entityRef("hero")], space: "organization" });
  assert.equal(store.hasPlacement(entityRef("hero"), "organization"), false);
  assert.equal(store.hasPlacement(mediaRef("portrait"), "organization"), true);
  assert.equal(store.hasPlacement(mediaRef("voice"), "organization"), true);
  assert.equal(store.getEntity(entityRef("hero")).id, "hero");
  assert.deepEqual(plain(store.listAllMedia()), mediaBefore);
});

test("submits idempotent review requests without changing target placements", () => {
  const store = createFixtureStore();
  const first = store.submitReview({
    items: [entityRef("hero")],
    space: "personal",
    targetSpace: "platform",
    operationKey: "publish-hero",
  });
  const repeated = store.submitReview({
    items: [entityRef("hero")],
    space: "personal",
    targetSpace: "platform",
    operationKey: "publish-hero",
  });

  assert.equal(first[0].id, repeated[0].id);
  assert.deepEqual(plain(first[0].dependencyMediaIds), ["portrait", "voice"]);
  assert.equal(store.hasPlacement(entityRef("hero"), "platform"), false);
  assert.equal(store.snapshot().reviews.length, 1);
  assert.throws(
    () => store.submitReview({ items: [mediaRef("voice")], space: "personal", targetSpace: "platform" }),
    /Audio Media cannot be submitted/,
  );
});

test("deleting an old subject directory preserves subjects and protects their referenced media", () => {
  const store = createFixtureStore();
  const entity = plain(store.getEntity("hero"));
  store.removeFolder({ folderId: "personal-entity", space: "personal" });
  assert.equal(store.getEntity("hero").name, entity.name);
  assert.deepEqual(plain(store.getEntity("hero").mediaRefs), entity.mediaRefs);
  assert.equal(store.hasPlacement(entityRef("hero"), "personal", null), true);
  const before = plain(store.snapshot());
  assert.throws(() => store.removeFolder({ folderId: "personal-media", space: "personal" }), /still referenced/);
  assert.deepEqual(plain(store.snapshot()), before);
});

test("copies a personal folder tree to organization by placement and removes a folder tree atomically", () => {
  const store = createFixtureStore();
  store.createFolder({ id: "reference", name: "参考", space: "personal", kind: "media" });
  store.createFolder({ id: "character", name: "角色", space: "personal", kind: "media", parentId: "reference" });
  store.moveItems({ items: [mediaRef("portrait")], space: "personal", folderId: "character" });

  const copied = store.copyFolderToOrganization({ folderId: "reference", fromSpace: "personal" });
  const organizationReference = store.listFolders({ space: "organization", kind: "media", parentId: null })
    .find((folder) => folder.name === "参考");
  const organizationCharacter = store.listFolders({
    space: "organization",
    kind: "media",
    parentId: organizationReference.id,
  }).find((folder) => folder.name === "角色");
  assert.equal(copied.folderCount, 2);
  assert.equal(copied.itemCount, 1);
  assert.equal(store.hasPlacement(mediaRef("portrait"), "organization", organizationCharacter.id), true);

  assert.throws(
    () => store.removeFolder({ folderId: "reference", space: "personal" }),
    /still referenced by Entity hero/,
  );
  assert.notEqual(store.getFolder("reference"), null);
  store.removePlacements({ items: [entityRef("hero")], space: "personal" });
  const removed = store.removeFolder({ folderId: "reference", space: "personal" });
  assert.equal(removed.folders.length, 2);
  assert.equal(store.getFolder("reference"), null);
  assert.equal(store.getFolder("character"), null);
  assert.equal(store.hasPlacement(mediaRef("portrait"), "personal"), false);
  assert.equal(store.getMedia(mediaRef("portrait")).id, "portrait");
});

test("blocks removal of referenced Media unless its Entity placement is removed atomically", () => {
  const store = createFixtureStore();
  assert.throws(
    () => store.removePlacements({ items: [mediaRef("portrait")], space: "personal" }),
    /still referenced by Entity hero/,
  );
  store.removePlacements({ items: [entityRef("hero"), mediaRef("portrait")], space: "personal" });

  assert.equal(store.hasPlacement(entityRef("hero"), "personal"), false);
  assert.equal(store.hasPlacement(mediaRef("portrait"), "personal"), false);
  assert.equal(store.getMedia(mediaRef("portrait")).id, "portrait");
  assert.equal(store.getEntity(entityRef("hero")).id, "hero");
});

test("preflights persisted Entities before copying a folder tree and leaves the snapshot unchanged", () => {
  const store = model.createAssetLibraryStore({
    media: [{ id: "persisted-cover", type: "image", name: "持久主体封面" }],
    entities: [{
      id: "persisted-in-folder",
      name: "目录中的持久主体",
      description: "",
      mediaRefs: [{ mediaId: "persisted-cover", order: 0 }],
      coverMediaId: "persisted-cover",
      version: 1,
    }],
    folders: [
      { id: "entity-tree", name: "角色库", space: "personal", kind: "entity" },
      { id: "entity-leaf", name: "主角", space: "personal", kind: "entity", parentId: "entity-tree" },
    ],
    placements: [
      { item: mediaRef("persisted-cover"), space: "personal", folderId: null },
      { item: entityRef("persisted-in-folder"), space: "personal", folderId: "entity-leaf" },
    ],
  });
  const before = plain(store.snapshot());

  assert.throws(
    () => store.copyFolderToOrganization({ folderId: "entity-tree", fromSpace: "personal" }),
    /持久主体共享必须通过版本化主体命令/,
  );
  assert.deepEqual(plain(store.snapshot()), before);
});

test("fails closed for unsupported persisted Media commands while preserving organization sharing", () => {
  const store = createFixtureStore();
  store.registerMedia({
    media: {
      id: "workspace-asset-1",
      type: "image",
      name: "Cloud image",
      workspaceAssetId: "workspace-asset-1",
      url: "/api/assets/workspace-asset-1/content",
    },
    space: "personal",
  });
  assert.throws(
    () => store.renameItem({ item: mediaRef("workspace-asset-1"), name: "Renamed", space: "personal" }),
    /尚未接入/,
  );
  assert.throws(
    () => store.moveItems({ items: [mediaRef("workspace-asset-1")], space: "personal", folderId: null }),
    /尚未接入/,
  );
  assert.throws(
    () => store.removePlacements({ items: [mediaRef("workspace-asset-1")], space: "personal" }),
    /尚未接入/,
  );
  store.shareToOrganization({ items: [mediaRef("workspace-asset-1")], fromSpace: "personal" });
  assert.equal(store.hasPlacement(mediaRef("workspace-asset-1"), "personal"), true);
  assert.equal(store.hasPlacement(mediaRef("workspace-asset-1"), "organization"), true);
});

test("refreshes a persisted Media display name without changing its identity or placements", () => {
  const store = createFixtureStore();
  store.registerMedia({
    media: {
      id: "workspace-asset-rename",
      workspaceAssetId: "workspace-asset-rename",
      mediaKind: "image",
      name: "旧名称.webp",
      displayName: "旧名称.webp",
      assetVersion: 1,
      url: "/api/assets/workspace-asset-rename/content",
    },
    space: "personal",
  });

  const updated = store.syncPersistedMedia({
    id: "workspace-asset-rename",
    workspaceAssetId: "workspace-asset-rename",
    mediaKind: "image",
    displayName: "新名称.webp",
    assetVersion: 1,
    url: "/api/assets/workspace-asset-rename/content",
  });

  assert.equal(updated.name, "新名称.webp");
  assert.equal(updated.displayName, "新名称.webp");
  assert.equal(updated.assetVersion, 1);
  assert.equal(store.getMedia(mediaRef("workspace-asset-rename")).name, "新名称.webp");
  assert.equal(store.hasPlacement(mediaRef("workspace-asset-rename"), "personal", null), true);
  assert.throws(
    () => store.syncPersistedMedia({ ...updated, mediaKind: "video" }),
    /identity cannot change/,
  );
});

test("rejects every mutation whose source or target placement is the platform space", () => {
  const store = createFixtureStore();
  const before = plain(store.snapshot());

  assert.throws(
    () => store.registerMedia({ media: { id: "platform-upload", type: "image" }, space: "platform" }),
    /read-only/,
  );
  assert.throws(
    () => store.registerMedia({
      media: {
        id: "page-local-platform-copy",
        type: "video",
        platformSourceId: "platform-video",
        url: "/platform/copied.mp4",
      },
      space: "personal",
    }),
    /authoritative persisted Workspace Media record/,
  );
  assert.throws(
    () => store.registerMedia({ media: { id: "platform-video", type: "video" }, space: "personal" }),
    /cannot have both platform and writable-space placements/,
  );
  assert.throws(
    () => store.createFolder({ id: "platform-new", name: "平台新目录", space: "platform", kind: "media" }),
    /read-only/,
  );
  assert.throws(
    () => store.renameFolder({ folderId: "platform-media", name: "改名", space: "platform" }),
    /read-only/,
  );
  assert.throws(
    () => store.moveFolder({ folderId: "platform-media", parentId: null, space: "platform" }),
    /read-only/,
  );
  assert.throws(
    () => store.renameItem({ item: mediaRef("platform-video"), name: "改名", space: "platform" }),
    /read-only/,
  );
  assert.throws(
    () => store.moveItems({ items: [mediaRef("platform-video")], space: "platform", folderId: null }),
    /read-only/,
  );
  assert.throws(
    () => store.shareToOrganization({ items: [mediaRef("platform-video")], fromSpace: "platform" }),
    /read-only/,
  );
  assert.throws(
    () => store.submitReview({ items: [mediaRef("platform-video")], space: "platform", targetSpace: "organization" }),
    /read-only/,
  );
  assert.throws(
    () => store.removePlacements({ items: [mediaRef("platform-video")], space: "platform" }),
    /read-only/,
  );
  assert.throws(
    () => store.removeFolder({ folderId: "platform-media", space: "platform" }),
    /read-only/,
  );
  assert.deepEqual(plain(store.snapshot()), before);
});

test("projects a confirmed mixed group and media deletion atomically before the Host group catalog arrives", () => {
  const media = ["removed", "kept"].map((id) => ({ id, workspaceAssetId: id, type: "image", name: id, url: `/api/media/${id}/content` }));
  const entity = (id, mediaId) => ({ id, name: id, version: 1, description: "", mediaRefs: [{ assetId: mediaId, order: 0 }], coverAssetId: mediaId });
  const removed = entity("removed-group", "removed"), kept = entity("kept-group", "kept");
  const store = model.createAssetLibraryStore();
  const entries = media.map((asset) => ({ assetId: asset.id, space: "personal", folderId: null, displayName: asset.name, tagIds: [] }));
  store.syncPersistedCatalog({ media, folders: [], entries, tags: [] });
  store.syncPersistedEntities({ entities: [removed, kept] });
  const deletionResult = { media: [media[1]], folders: [], entries: [entries[1]], tags: [], removedEntityIds: [removed.id] };
  store.syncPersistedCatalog(deletionResult);
  assert.equal(store.hasPlacement(entityRef(removed.id), "personal"), false);
  assert.equal(store.hasPlacement(mediaRef("removed"), "personal"), false);
  assert.equal(store.getEntity(removed.id), null);
  assert.equal(store.getMedia(mediaRef("removed")).url, media[0].url);
  assert.equal(store.hasPlacement(entityRef(kept.id), "personal"), true);
  assert.equal(store.hasPlacement(mediaRef("kept"), "personal"), true);
  const after = plain(store.snapshot());
  store.syncPersistedEntities({ entities: [kept] });
  store.syncPersistedCatalog(deletionResult);
  assert.deepEqual(plain(store.snapshot()), after);
});

test("tag filters OR stable placement IDs, AND media type, and keep spaces independent", () => {
  const store = model.createAssetLibraryStore({
    media: [
      { id: "image", type: "image", name: "same", tags: ["source label"] },
      { id: "video", type: "video", name: "same" },
      { id: "audio", type: "audio", name: "same" },
    ],
    placements: [
      { item: mediaRef("image"), space: "personal", tagIds: ["personal-a"], tags: ["同名"] },
      { item: mediaRef("video"), space: "personal", tagIds: ["personal-b"], tags: ["同名"] },
      { item: mediaRef("audio"), space: "personal", tagIds: [] },
      { item: mediaRef("image"), space: "organization", tagIds: ["organization-a"], tags: ["同名"] },
    ],
  });
  const ids = (options) => plain(store.listItems({ space: "personal", ...options })).map((item) => item.id);
  assert.deepEqual(ids({ tagIds: ["personal-a", "personal-b"] }), ["image", "video"]);
  assert.deepEqual(ids({ tagIds: ["personal-a", "personal-b"], mediaKind: "image" }), ["image"]);
  assert.deepEqual(ids({ tagIds: ["同名"] }), []);
  assert.deepEqual(ids({ tagIds: ["personal-a"], space: "organization" }), []);
  assert.deepEqual(ids({ tagIds: ["organization-a"], space: "organization" }), ["image"]);
  assert.deepEqual(ids({ untagged: true }), ["audio"]);
  assert.deepEqual(ids({ untagged: true, tagIds: ["personal-a"] }), ["audio"]);
  assert.deepEqual(ids({ untagged: true, mediaKind: "video" }), []);
  assert.deepEqual(ids({ tagIds: [] }), ["image", "video", "audio"]);
});

test("group tags belong to the group while media type and group browsing use accessible members", () => {
  const store = model.createAssetLibraryStore({
    media: [
      { id: "image", type: "image", name: "图" },
      { id: "video", type: "video", name: "视频" },
      { id: "hidden", type: "audio", name: "隐藏音频", hidden: true },
    ],
    entities: [
      { id: "group", name: "素材组", mediaRefs: ["image", "video", "hidden"] },
      { id: "untagged-group", name: "未标记素材组", mediaRefs: ["image"] },
    ],
    placements: [
      { item: mediaRef("image"), space: "personal", tagIds: ["child-tag"] },
      { item: mediaRef("video"), space: "personal", tagIds: [] },
      { item: mediaRef("hidden"), space: "personal", tagIds: ["hidden-tag"] },
      { item: entityRef("group"), space: "personal", tagIds: ["group-tag"] },
      { item: entityRef("untagged-group"), space: "personal", tagIds: [] },
    ],
  });
  const groups = (options) => plain(store.listItems({ space: "personal", kind: "all", ...options }))
    .filter((item) => item.kind === "entity").map((item) => item.id);
  assert.deepEqual(groups({ tagIds: ["child-tag"] }), []);
  assert.deepEqual(groups({ tagIds: ["group-tag"], mediaKind: "video" }), ["group"]);
  assert.deepEqual(groups({ tagIds: ["group-tag"], mediaKind: "audio" }), []);
  assert.deepEqual(groups({ untagged: true }), ["untagged-group"]);
  assert.deepEqual(groups({ kind: "entity", query: "视频" }), ["group"]);
  assert.deepEqual(groups({ kind: "entity", query: "视频", mediaKind: "video" }), ["group"]);
  assert.deepEqual(groups({ kind: "entity", query: "视频", mediaKind: "image" }), []);
  assert.deepEqual(groups({ kind: "entity", query: "隐藏音频" }), []);
  assert.deepEqual(plain(store.listItems({ kind: "entity", mediaKind: "audio" })), []);
  const members = (options) => plain(store.listEntityMedia({ entityId: "group", ...options }).items).map((item) => item.id);
  assert.deepEqual(members({ tagIds: ["child-tag"] }), ["image"]);
  assert.deepEqual(members({ tagIds: ["group-tag"] }), []);
  assert.deepEqual(members({ tagIds: ["hidden-tag"] }), []);
  assert.deepEqual(members({ untagged: true }), ["video"]);
  assert.deepEqual(members({ tagIds: ["child-tag"], mediaKind: "video" }), []);
});

test("Entity catalog tags arrive independently and survive content refresh without entering Entity versions", () => {
  const store = model.createAssetLibraryStore();
  const media = [{ id: "image", workspaceAssetId: "image", type: "image", name: "源名称", tags: ["source"] }];
  const entries = [{ assetId: "image", space: "personal", folderId: null, displayName: "个人名称", tagIds: [] }];
  const entity = { id: "group", name: "组", version: 1, assetIds: ["image"], coverAssetId: "image" };
  const tags = [{ id: "custom", space: "personal", name: "初始标签" }];
  const entityEntries = [{ entityId: "group", space: "personal", tagIds: ["custom"] }];
  store.syncPersistedCatalog({ media, entries, tags, entityEntries });
  assert.equal(store.getEntity("group"), null);
  store.syncPersistedEntities({ entities: [entity] });
  assert.deepEqual(plain(store.getEntity("group").tagIds), ["custom"]);
  assert.deepEqual(plain(store.getEntity("group").tags), ["初始标签"]);
  assert.deepEqual(plain(store.getMedia("image").tagIds), []);
  assert.deepEqual(plain(store.getMedia("image").tags), []);
  store.registerPersistedEntity({ entity: { ...entity, name: "新组名", version: 2 } });
  store.syncPersistedEntities({ entities: [{ ...entity, name: "新组名", version: 2 }] });
  assert.deepEqual(plain(store.getEntity("group").tagIds), ["custom"]);
  assert.equal(store.getEntity("group").version, 2);
  assert.equal(Object.hasOwn(store.snapshot().entities[0], "tagIds"), false);
  store.syncPersistedCatalog({ media, entries, tags: [{ ...tags[0], name: "标签改名" }], entityEntries });
  assert.deepEqual(plain(store.getEntity("group").tags), ["标签改名"]);
  assert.equal(store.getEntity("group").version, 2);
  store.syncPersistedCatalog({ media, entries });
  assert.deepEqual(plain(store.getEntity("group").tagIds), ["custom"]);
  store.syncPersistedCatalog({ media, entries, entityEntries: [{ ...entityEntries[0], tagIds: [] }] });
  assert.deepEqual(plain(store.getEntity("group").tagIds), []);
  store.syncPersistedEntities({ entities: [{ ...entity, name: "新组名", version: 2 }] });
  assert.deepEqual(plain(store.getEntity("group").tagIds), []);
});

test("explicit legacy tags receive deterministic scoped IDs without inferring labels from content", () => {
  const store = model.createAssetLibraryStore({
    media: [
      { id: "platform", type: "image", name: "场景图", tags: ["角色", "电影感", "电影感"] },
      { id: "plain", type: "image", name: "角色", description: "场景、物品" },
    ],
    placements: [
      { item: mediaRef("platform"), space: "platform" },
      { item: mediaRef("plain"), space: "platform" },
    ],
  });
  const options = plain(store.getTagOptions("platform"));
  assert.deepEqual(options, [
    { id: "builtin:character", name: "角色", space: "platform" },
    { id: `legacy:platform:${encodeURIComponent("电影感")}`, name: "电影感", space: "platform" },
  ]);
  assert.deepEqual(plain(store.getTagOptions("personal")), []);
  assert.deepEqual(plain(store.listItems({ space: "platform", tagIds: [options[1].id] })).map((item) => item.id), ["platform"]);
  assert.deepEqual(plain(store.listItems({ space: "platform", untagged: true })).map((item) => item.id), ["plain"]);
  const restored = model.createAssetLibraryStore(plain(store.snapshot()));
  assert.deepEqual(plain(restored.getTagOptions("platform")), options);
});


test("editor tag projection preserves member metadata and rejects stale tag changes atomically", () => {
  const store = createFixtureStore();
  const memberBefore = plain(store.listItems({ kind: 'media', space: 'personal' }));
  const entity = { id: 'tagged-edit', name: '编辑前', version: 1, mediaRefs: [{ mediaId: 'portrait', order: 0 }], coverMediaId: 'portrait', libraryTagIds: ['builtin:character'] };
  store.registerPersistedEntity({ entity });
  const subject = () => plain(store.listItems({ kind: 'entity', space: 'personal' })).find((item) => item.id === entity.id);
  assert.deepEqual(subject().tagIds, ['builtin:character']);
  const beforeConflict = plain(store.snapshot());
  assert.throws(() => store.updateEntity({ entityId: entity.id, expectedVersion: 1, name: '不应保存', tagIds: [], expectedTagIds: [] }), (error) => error.code === 'conflict');
  assert.deepEqual(plain(store.snapshot()), beforeConflict);
  store.updateEntity({ entityId: entity.id, expectedVersion: 1, name: '编辑后', tagIds: ['custom:style'], expectedTagIds: ['builtin:character'], tagOptions: [{ id: 'custom:style', name: '风格' }] });
  assert.deepEqual(subject().tagIds, ['custom:style']);
  assert.deepEqual(subject().tags, ['风格']);
  assert.equal(subject().name, '编辑后');
  assert.equal(subject().addedAt, beforeConflict.placements.find((item) => item.item.id === entity.id).addedAt);
  store.syncPersistedEntities({ entities: [{ ...entity, version: 2, name: '编辑后' }] });
  assert.deepEqual(subject().tagIds, ['custom:style']);
  store.registerPersistedEntity({ entity: { ...entity, version: 3, libraryTagIds: [] } });
  assert.deepEqual(subject().tagIds, []);
  assert.deepEqual(plain(store.listItems({ kind: 'media', space: 'personal' })), memberBefore);
});


test("organization subjects and their media project atomically without personal placements and preserve scoped tags", () => {
  const store = model.createAssetLibraryStore();
  const media = [{ id: "org-image", workspaceAssetId: "org-image", type: "image", name: "封面.png" }];
  const entity = { id: "org-entity", space: "organization", name: "组织主体", description: "", version: 1, mediaRefs: [{ mediaId: "org-image", order: 0 }], coverMediaId: "org-image" };
  const catalog = { media, entries: [{ assetId: "org-image", space: "organization", folderId: null, tagIds: [] }],
    entities: [entity], entityEntries: [{ entityId: entity.id, space: "organization", tagIds: ["org-tag"], folderId: null }],
    tags: [{ id: "org-tag", name: "品牌", space: "organization" }], folders: [] };
  store.syncPersistedCatalog(catalog);
  assert.equal(store.hasPlacement(mediaRef("org-image"), "personal"), false);
  assert.equal(store.hasPlacement(entityRef(entity.id), "personal"), false);
  assert.equal(store.getEntity({ ...entityRef(entity.id), space: "organization" }).space, "organization");
  assert.deepEqual(plain(store.getEntity({ ...entityRef(entity.id), space: "organization" }).tags), ["品牌"]);
  const updated = store.updateEntity({ space: "organization", entityId: entity.id, expectedVersion: 1, name: "更新主体", tagIds: [], expectedTagIds: ["org-tag"] });
  assert.equal(updated.version, 2);
  const before = plain(store.snapshot());
  assert.throws(() => store.syncPersistedCatalog(catalog), /backwards/);
  assert.deepEqual(plain(store.snapshot()), before);
  store.syncPersistedCatalog({ ...catalog, entities: [], entityEntries: [] });
  assert.equal(store.getEntity(entityRef(entity.id)), null);
  assert.equal(store.hasPlacement(mediaRef("org-image"), "organization"), true);
});

test("organization subjects reject media that only exist in personal space before mutating", () => {
  const store = model.createAssetLibraryStore();
  store.registerMedia({ media: { id: "private", type: "image", name: "私人图片" }, space: "personal" });
  const before = plain(store.snapshot());
  assert.throws(() => store.registerPersistedEntity({ entity: { id: "org", space: "organization", name: "主体", description: "", version: 1, mediaRefs: [{ mediaId: "private", order: 0 }] } }), /organization/);
  assert.deepEqual(plain(store.snapshot()), before);
});


test("renaming a shared organization member only changes its organization display name", () => {
  const store = model.createAssetLibraryStore();
  const media = { id: "shared", workspaceAssetId: "shared", type: "image", displayName: "original.png", name: "original.png" };
  store.registerMedia({ media, space: "personal" });
  store.registerMedia({ media, space: "organization" });
  const renamed = store.syncPersistedMedia({ media: { ...media, displayName: "org.png" }, space: "organization" });
  assert.equal(renamed.name, "org.png");
  assert.equal(store.getMedia({ ...mediaRef(media.id), space: "organization" }).name, "org.png");
  assert.equal(store.getMedia({ ...mediaRef(media.id), space: "personal" }).name, "original.png");
});
