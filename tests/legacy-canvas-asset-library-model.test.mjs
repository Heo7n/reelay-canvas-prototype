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
    /cover must be an image or video/,
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

test("syncing the personal Entity catalog preserves projections in other spaces", () => {
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
  assert.equal(store.hasPlacement(entityRef(entity.id), "organization"), true);
  assert.equal(store.getEntity(entityRef(entity.id)).version, 1);
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
    /cover must be an image or video/,
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
    /cover media must be an image or video/,
  );
  const videoCoverStore = model.createAssetLibraryStore({
    media: [{ id: "motion", type: "video" }],
    entities: [{
      id: "video-cover",
      name: "视频封面",
      mediaRefs: [{ mediaId: "motion" }],
      coverMediaId: "motion",
    }],
  });
  assert.equal(videoCoverStore.getEntity(entityRef("video-cover")).coverMediaId, "motion");
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
