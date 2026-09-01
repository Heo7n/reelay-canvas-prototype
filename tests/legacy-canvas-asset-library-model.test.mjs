import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("../src/legacy-canvas/canvas-asset-library-model.js", import.meta.url),
  "utf8",
);
const editorSource = await readFile(
  new URL("../src/legacy-canvas/canvas-entity-editor-model.js", import.meta.url),
  "utf8",
);
const context = vm.createContext({});
new vm.Script(source).runInContext(context);
new vm.Script(editorSource).runInContext(context);
const model = context.REELAY_CANVAS_ASSET_LIBRARY_MODEL;
const editorModel = context.REELAY_CANVAS_ENTITY_EDITOR_MODEL;
const plain = (value) => JSON.parse(JSON.stringify(value));
const mediaRef = (id) => ({ kind: "media", id });
const entityRef = (id) => ({ kind: "entity", id });

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
});

test("exposes a frozen Entity editor draft API", () => {
  assert.ok(Object.isFrozen(editorModel));
  assert.deepEqual(plain(Object.keys(editorModel).sort()), [
    "addMediaRefs",
    "createDraft",
    "filterMedia",
    "removeMediaRef",
    "setActiveMedia",
    "setCoverMedia",
    "setFilter",
    "toEntityInput",
    "updateDetails",
    "validateDraft",
  ]);
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

test("imports platform Media as an independent idempotent personal record", () => {
  const store = model.createAssetLibraryStore({
    media: [
      {
        id: "platform-source",
        type: "image",
        name: "平台原名.png",
        displayName: "平台原名",
        url: "/platform/shared-image.png",
        librarySourceId: "shared-library-source",
        platformSourceId: "platform-origin-001",
        sourceCatalogId: "starter-catalog",
      },
      {
        id: "shared-library-source",
        type: "image",
        name: "个人同源素材.png",
        url: "/platform/shared-image.png",
      },
      {
        id: "platform-source-alias",
        type: "image",
        name: "平台同源别名.png",
        url: "/platform/shared-image-alias.png",
        platformSourceId: "platform-origin-001",
        sourceCatalogId: "starter-catalog",
      },
    ],
    placements: [
      { item: mediaRef("platform-source"), space: "platform", folderId: null },
      { item: mediaRef("shared-library-source"), space: "personal", folderId: null },
      { item: mediaRef("platform-source-alias"), space: "platform", folderId: null },
    ],
  });

  const first = store.importPlatformMediaToPersonal({ item: mediaRef("platform-source") });
  assert.equal(first.created, true);
  assert.equal(first.placementCreated, true);
  assert.notEqual(first.media.id, "platform-source");
  assert.notEqual(first.media.id, "shared-library-source");
  assert.equal(first.media.platformSourceId, "platform-origin-001");
  assert.equal(first.media.sourceCatalogId, "starter-catalog");
  assert.equal(first.media.url, "/platform/shared-image.png");
  assert.equal(store.hasPlacement(mediaRef("platform-source"), "personal"), false);
  assert.equal(store.hasPlacement(mediaRef(first.media.id), "personal"), true);

  const byPlatformSourceId = store.importPlatformMediaToPersonal({ item: mediaRef("platform-source-alias") });
  assert.equal(byPlatformSourceId.created, false);
  assert.equal(byPlatformSourceId.media.id, first.media.id);
  assert.equal(store.hasPlacement(mediaRef("platform-source-alias"), "personal"), false);

  store.renameItem({ item: mediaRef(first.media.id), name: "我的平台副本", space: "personal" });
  const second = store.importPlatformMediaToPersonal({ item: mediaRef("platform-source") });
  assert.equal(second.created, false);
  assert.equal(second.placementCreated, false);
  assert.equal(second.media.id, first.media.id);
  assert.equal(second.media.name, "我的平台副本");
  assert.equal(store.getMedia(mediaRef("platform-source")).name, "平台原名.png");
  assert.equal(store.getMedia(mediaRef("platform-source")).displayName, "平台原名");
  assert.equal(store.listAllMedia().length, 4);

  assert.throws(
    () => store.importPlatformMediaToPersonal({ item: mediaRef("shared-library-source") }),
    /not visible in platform/,
  );
});

test("keeps platform Media placements isolated from writable spaces", () => {
  const media = [{ id: "isolated-media", type: "image", url: "/catalog/isolated.png" }];
  for (const placements of [
    [
      { item: mediaRef("isolated-media"), space: "platform" },
      { item: mediaRef("isolated-media"), space: "personal" },
    ],
    [
      { item: mediaRef("isolated-media"), space: "organization" },
      { item: mediaRef("isolated-media"), space: "platform" },
    ],
  ]) {
    assert.throws(
      () => model.createAssetLibraryStore({ media, placements }),
      /cannot have both platform and writable-space placements/,
    );
  }

  const store = createFixtureStore();
  const beforeRuntimeFailure = plain(store.snapshot());
  assert.throws(
    () => store.registerMedia({
      media: { id: "platform-alias", type: "video", url: "/platform/demo.mp4" },
      space: "personal",
      folderId: "personal-media",
    }),
    /cannot have both platform and writable-space placements/,
  );
  assert.deepEqual(plain(store.snapshot()), beforeRuntimeFailure);

  assert.throws(
    () => store.createEntityFromMedia({
      entity: { id: "platform-copy-entity", name: "错误平台引用", mediaRefs: ["platform-alias"] },
      media: [{ id: "platform-alias", type: "video", url: "/platform/demo.mp4" }],
      space: "personal",
      folderId: "personal-entity",
      mediaFolderId: "personal-media",
    }),
    /cannot have both platform and writable-space placements/,
  );
  assert.deepEqual(plain(store.snapshot()), beforeRuntimeFailure);

  const personalToOrganization = store.registerMedia({
    media: { id: "portrait", type: "image" },
    space: "organization",
    folderId: "organization-media",
  });
  assert.equal(personalToOrganization.created, false);
  assert.equal(personalToOrganization.placementCreated, true);
  assert.equal(store.hasPlacement(mediaRef("portrait"), "personal"), true);
  assert.equal(store.hasPlacement(mediaRef("portrait"), "organization"), true);
});

test("creates new Media and an Entity atomically without copying media payload into the Entity", () => {
  const store = createFixtureStore();
  const result = store.createEntityFromMedia({
    entity: {
      id: "supporting-role",
      name: "配角",
      mediaRefs: [{ mediaId: "portrait" }, { mediaId: "new-image" }, { mediaId: "portrait" }],
      url: "blob:forbidden",
      blob: { forbidden: true },
      width: 2048,
      height: 2048,
    },
    media: [
      { id: "new-image", type: "image", name: "配角.png", url: "blob:supporting" },
      { id: "new-audio", type: "audio", name: "配角台词.mp3", url: "blob:supporting-audio" },
    ],
    space: "personal",
    folderId: "personal-entity",
    mediaFolderId: "personal-media",
  });

  assert.deepEqual(plain(result.entity.mediaRefs), [
    { mediaId: "portrait", order: 0 },
    { mediaId: "new-image", order: 1 },
    { mediaId: "new-audio", order: 2 },
  ]);
  assert.deepEqual(plain(result.createdMediaIds), ["new-image", "new-audio"]);
  assert.equal("url" in result.entity, false);
  assert.equal("blob" in result.entity, false);
  assert.equal("width" in result.entity, false);
  assert.equal("height" in result.entity, false);
  assert.deepEqual(
    plain(store.listItems({ space: "personal", kind: "media", folderId: "personal-media" })).map((item) => item.id),
    ["portrait", "voice", "new-image", "new-audio"],
  );
  assert.deepEqual(plain(store.getEntityMedia(entityRef("supporting-role"))).map((item) => item.id), [
    "portrait",
    "new-image",
    "new-audio",
  ]);

  const deduplicatedCover = store.createEntityFromMedia({
    entity: {
      id: "portrait-alias-entity",
      name: "复用主角",
      mediaRefs: [{ mediaId: "portrait-alias" }],
      coverMediaId: "portrait-alias",
    },
    media: [{ id: "portrait-alias", type: "image", url: "blob:portrait" }],
    space: "personal",
    folderId: "personal-entity",
    mediaFolderId: "personal-media",
  });
  assert.equal(deduplicatedCover.entity.coverMediaId, "portrait");
  assert.deepEqual(plain(deduplicatedCover.entity.mediaRefs), [{ mediaId: "portrait", order: 0 }]);

  const beforeInvalidCover = plain(store.snapshot());
  assert.throws(
    () => store.createEntityFromMedia({
      entity: {
        id: "voice-cover",
        name: "错误音频封面",
        mediaRefs: [{ mediaId: "voice" }],
        coverMediaId: "voice",
      },
      space: "personal",
      folderId: "personal-entity",
    }),
    /cover media must be an image/,
  );
  assert.deepEqual(plain(store.snapshot()), beforeInvalidCover);

  const beforeFailure = plain(store.snapshot());
  assert.throws(
    () => store.createEntityFromMedia({
      entity: { id: "broken", name: "坏主体", mediaRefs: [{ mediaId: "missing" }] },
      space: "personal",
      folderId: "personal-entity",
    }),
    /missing media/,
  );
  assert.deepEqual(plain(store.snapshot()), beforeFailure);
});

test("rejects an Entity placement whose referenced Media is not visible in the target space", () => {
  const store = createFixtureStore();
  const before = plain(store.snapshot());

  assert.throws(
    () => store.createEntityFromMedia({
      entity: { id: "organization-hero", name: "组织主体", mediaRefs: [{ mediaId: "portrait" }] },
      space: "organization",
      folderId: "organization-entity",
    }),
    /cannot be visible in organization/,
  );
  assert.deepEqual(plain(store.snapshot()), before);
});

test("updates an Entity atomically with ordered unique references and isolated output", () => {
  const store = createFixtureStore();
  const mediaBefore = plain(store.listAllMedia());
  const updated = store.updateEntity({
    item: entityRef("hero"),
    space: "personal",
    patch: {
      name: "  主角 Alpha  ",
      description: "  主要角色设定  ",
      mediaRefs: ["voice", { mediaId: "portrait", order: 91 }, "voice"],
      coverMediaId: "portrait",
    },
  });

  assert.deepEqual(plain(updated), {
    id: "hero",
    name: "主角 Alpha",
    mediaRefs: [
      { mediaId: "voice", order: 0 },
      { mediaId: "portrait", order: 1 },
    ],
    description: "主要角色设定",
    coverMediaId: "portrait",
  });
  assert.deepEqual(plain(store.listAllMedia()), mediaBefore);
  updated.mediaRefs.length = 0;
  updated.name = "outside";
  assert.equal(store.getEntity(entityRef("hero")).name, "主角 Alpha");
  assert.equal(store.getEntity(entityRef("hero")).mediaRefs.length, 2);
});

test("rejects invalid Entity updates without changing any store state", () => {
  const store = createFixtureStore();
  const cases = [
    [{ mediaRefs: [] }, /at least one Media/],
    [{ mediaRefs: ["missing"] }, /missing media/],
    [{ mediaRefs: ["portrait"], coverMediaId: "voice" }, /cover media must belong/],
    [{ coverMediaId: "voice" }, /cover media must be an image/],
    [{ name: "   " }, /name is required/],
    [{ mediaRefs: "portrait" }, /must be an array/],
    [{ id: "replacement" }, /Unsupported Entity patch field/],
  ];

  for (const [patch, pattern] of cases) {
    const before = plain(store.snapshot());
    assert.throws(() => store.updateEntity({ item: entityRef("hero"), space: "personal", patch }), pattern);
    assert.deepEqual(plain(store.snapshot()), before);
  }

  const beforeMissingPlacement = plain(store.snapshot());
  assert.throws(
    () => store.updateEntity({ item: entityRef("hero"), space: "organization", patch: { name: "组织主角" } }),
    /not visible in organization/,
  );
  assert.deepEqual(plain(store.snapshot()), beforeMissingPlacement);

  store.updateEntity({
    item: entityRef("hero"),
    space: "personal",
    patch: { coverMediaId: "portrait" },
  });
  const beforeStaleCover = plain(store.snapshot());
  assert.throws(
    () => store.updateEntity({
      item: entityRef("hero"),
      space: "personal",
      patch: { mediaRefs: ["voice"] },
    }),
    /cover media must belong/,
  );
  assert.deepEqual(plain(store.snapshot()), beforeStaleCover);
});

test("keeps every existing Entity placement valid when references are updated", () => {
  const store = createFixtureStore();
  store.shareToOrganization({
    items: [entityRef("hero")],
    fromSpace: "personal",
    mediaFolderId: "organization-media",
    entityFolderId: "organization-entity",
  });
  store.registerMedia({
    media: { id: "personal-only", type: "image", name: "个人补充.png", url: "blob:personal-only" },
    space: "personal",
    folderId: "personal-media",
  });
  const beforeFailure = plain(store.snapshot());

  assert.throws(
    () => store.updateEntity({
      item: entityRef("hero"),
      space: "personal",
      patch: { mediaRefs: ["portrait", "personal-only"] },
    }),
    /cannot be visible in organization/,
  );
  assert.deepEqual(plain(store.snapshot()), beforeFailure);

  store.registerMedia({
    media: { id: "personal-only", type: "image", url: "blob:personal-only" },
    space: "organization",
    folderId: "organization-media",
  });
  const updated = store.updateEntity({
    item: entityRef("hero"),
    space: "personal",
    patch: { mediaRefs: ["portrait", "personal-only"], coverMediaId: "personal-only" },
  });
  assert.deepEqual(plain(updated.mediaRefs), [
    { mediaId: "portrait", order: 0 },
    { mediaId: "personal-only", order: 1 },
  ]);
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
});

test("creates immutable Entity drafts and keeps active and cover Media coherent", () => {
  const editing = editorModel.createDraft({
    entity: {
      id: "hero",
      name: "主角",
      description: "角色设定",
      mediaRefs: [{ mediaId: "portrait", order: 9 }, "voice", "portrait"],
      coverMediaId: "portrait",
    },
    space: "organization",
  });
  assert.ok(Object.isFrozen(editing));
  assert.ok(Object.isFrozen(editing.mediaRefs));
  assert.equal(editing.mode, "edit");
  assert.equal(editing.entityId, "hero");
  assert.equal(editing.activeMediaId, "portrait");
  assert.equal(editing.coverMediaId, "portrait");
  assert.deepEqual(plain(editing.mediaRefs), [
    { mediaId: "portrait", order: 0 },
    { mediaId: "voice", order: 1 },
  ]);

  let creating = editorModel.createDraft({ name: "新主体" });
  creating = editorModel.addMediaRefs(creating, ["voice", { id: "portrait" }, "voice"]);
  assert.deepEqual(plain(creating.mediaRefs), [
    { mediaId: "voice", order: 0 },
    { mediaId: "portrait", order: 1 },
  ]);
  assert.equal(creating.activeMediaId, "voice");
  assert.equal(creating.coverMediaId, null);

  creating = editorModel.setActiveMedia(creating, "voice");
  assert.throws(
    () => editorModel.setCoverMedia(creating, { id: "voice", type: "audio" }),
    /must be an image/,
  );
  creating = editorModel.setCoverMedia(creating, { id: "portrait", type: "image" });
  creating = editorModel.removeMediaRef(creating, "voice");
  assert.equal(creating.activeMediaId, "portrait");
  assert.equal(creating.coverMediaId, "portrait");
  assert.throws(() => editorModel.setActiveMedia(creating, "missing"), /must belong/);
  assert.throws(() => editorModel.setCoverMedia(creating, { id: "missing", type: "image" }), /must belong/);

  creating = editorModel.removeMediaRef(creating, "portrait");
  assert.equal(creating.activeMediaId, null);
  assert.equal(creating.coverMediaId, null);
  assert.equal(editorModel.validateDraft(creating).valid, false);
});

test("filters available Media with stable facet counts and validates commit input", () => {
  let draft = editorModel.createDraft({
    name: "  主角  ",
    description: "  统一角色设定  ",
    mediaRefs: ["portrait"],
    query: "角色",
    mediaKind: "image",
  });
  const media = [
    { id: "portrait", type: "image", name: "角色人像" },
    { id: "motion", type: "video", tags: ["角色", "动作"] },
    { id: "voice", type: "audio", name: "对白" },
    { id: "portrait", type: "image", name: "重复项" },
  ];
  const filtered = editorModel.filterMedia(draft, media);
  assert.ok(Object.isFrozen(filtered));
  assert.deepEqual(plain(filtered.counts), { all: 2, image: 1, video: 1, audio: 0 });
  assert.deepEqual(plain(filtered.items).map((item) => item.id), ["portrait"]);
  assert.equal(filtered.visibleCount, 1);

  assert.equal(editorModel.validateDraft(draft, { media }).valid, true);
  const nonImageCover = editorModel.createDraft({
    name: "音频主体",
    mediaRefs: ["voice"],
    coverMediaId: "voice",
  });
  const nonImageCoverValidation = editorModel.validateDraft(nonImageCover, { media });
  assert.equal(nonImageCoverValidation.valid, false);
  assert.equal(nonImageCoverValidation.errors.find((error) => error.field === "coverMediaId")?.code, "cover_not_image");
  const missingValidation = editorModel.validateDraft(draft, {
    media: media.filter((item) => item.id !== "portrait"),
  });
  assert.equal(missingValidation.valid, false);
  assert.equal(missingValidation.errors[0].code, "media_missing");

  draft = editorModel.updateDetails(draft, { name: "  主角 Alpha  " });
  draft = editorModel.setFilter(draft, { query: "", mediaKind: "audio" });
  assert.deepEqual(plain(editorModel.filterMedia(draft, media).items).map((item) => item.id), ["voice"]);
  draft = editorModel.setCoverMedia(draft, media[0]);
  const input = editorModel.toEntityInput(draft, { media });
  assert.ok(Object.isFrozen(input));
  assert.deepEqual(plain(input), {
    name: "主角 Alpha",
    description: "统一角色设定",
    mediaRefs: [{ mediaId: "portrait", order: 0 }],
    coverMediaId: "portrait",
  });

  const invalid = editorModel.createDraft();
  assert.throws(() => editorModel.toEntityInput(invalid), /请输入主体名称/);
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

test("fails closed for unsupported rename, move and delete commands on persisted media", () => {
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
  assert.equal(store.hasPlacement(mediaRef("workspace-asset-1"), "personal"), true);
});

test("rejects every mutation whose source or target placement is the platform space", () => {
  const store = createFixtureStore();
  const before = plain(store.snapshot());

  assert.throws(
    () => store.registerMedia({ media: { id: "platform-upload", type: "image" }, space: "platform" }),
    /read-only/,
  );
  assert.throws(
    () => store.createEntityFromMedia({
      entity: { id: "platform-entity", mediaRefs: [{ mediaId: "platform-video" }] },
      space: "platform",
    }),
    /read-only/,
  );
  assert.throws(
    () => store.updateEntity({ item: entityRef("hero"), space: "platform", patch: { name: "改名" } }),
    /read-only/,
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
