import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("../src/legacy-canvas/canvas-entity-editor-model.js", import.meta.url),
  "utf8",
);
const context = vm.createContext({});
new vm.Script(source, { filename: "canvas-entity-editor-model.js" }).runInContext(context);
const model = context.REELAY_CANVAS_ENTITY_EDITOR_MODEL;
const plain = (value) => JSON.parse(JSON.stringify(value));

const media = [
  { id: "portrait", mediaKind: "image", displayName: "角色正面.png" },
  { id: "turnaround", type: "video", displayName: "角色转身.mp4" },
  { id: "voice", mediaKind: "audio", displayName: "角色声音.mp3" },
  { id: "detail", mediaKind: "image", displayName: "服装细节.png" },
];

function createDraft(overrides = {}) {
  return model.createCanvasEntityEditorDraft({ mode: "create", media, ...overrides });
}

function editDraft(overrides = {}) {
  return model.createCanvasEntityEditorDraft({
    mode: "edit",
    media,
    entity: {
      id: "entity-lirael",
      name: "Lirael",
      description: "精灵感角色",
      mediaRefs: [
        { mediaId: "portrait", order: 7 },
        { mediaId: "voice", order: 2 },
        { mediaId: "portrait", order: 9 },
      ],
      coverMediaId: "portrait",
      version: 4,
    },
    ...overrides,
  });
}

test("creates an empty draft with the fixed creation title and isolated initial state", () => {
  assert.ok(Object.isFrozen(model));
  assert.deepEqual(plain(Object.keys(model)), ["createCanvasEntityEditorDraft"]);

  const draft = createDraft();
  assert.ok(Object.isFrozen(draft));
  assert.deepEqual(plain(draft.getState()), {
    mode: "create",
    entityId: null,
    title: "新建主体",
    name: "",
    description: "",
    mediaRefs: [],
    coverMediaId: null,
    selectedPreviewId: null,
    filter: "all",
    counts: { all: 0, image: 0, video: 0, audio: 0 },
    filteredMedia: [],
    expectedVersion: null,
    dirty: false,
    valid: false,
    errors: { name: "主体名称不能为空。", media: "请至少添加一个素材。" },
  });
  draft.setName("新主体");
  assert.equal(draft.getTitle(), "新建主体");
});

test("opens an edit draft with the current Entity name, normalized reference order, and preview", () => {
  const draft = editDraft();
  const state = plain(draft.getState());

  assert.equal(state.entityId, "entity-lirael");
  assert.equal(state.title, "Lirael");
  assert.equal(state.expectedVersion, 4);
  assert.equal(state.selectedPreviewId, "portrait");
  assert.deepEqual(state.mediaRefs, [
    { mediaId: "portrait", order: 0 },
    { mediaId: "voice", order: 1 },
  ]);
  assert.deepEqual(state.counts, { all: 2, image: 1, video: 0, audio: 1 });
  assert.equal(state.dirty, false);

  draft.setName("  Lirael II  ");
  assert.equal(draft.getTitle(), "Lirael II");
  draft.setName("   ");
  assert.equal(draft.getTitle(), "Lirael");
});

test("validates the trimmed name and creates an isolated atomic commit payload", () => {
  const draft = createDraft();
  assert.throws(
    () => draft.createCommitPayload(),
    (error) => {
      assert.equal(error.code, "invalid");
      assert.deepEqual(plain(error.errors), { name: "主体名称不能为空。", media: "请至少添加一个素材。" });
      return true;
    },
  );

  draft.setName("  Lirael  ");
  draft.setDescription("  保留描述的输入格式\n");
  draft.addMediaBatch(["portrait", "voice"]);
  draft.setCover("portrait");
  const payload = draft.createCommitPayload();
  assert.deepEqual(plain(payload), {
    name: "Lirael",
    description: "  保留描述的输入格式\n",
    mediaRefs: [
      { mediaId: "portrait", order: 0 },
      { mediaId: "voice", order: 1 },
    ],
    coverMediaId: "portrait",
    expectedVersion: null,
  });

  payload.mediaRefs.length = 0;
  assert.equal(draft.createCommitPayload().mediaRefs.length, 2);
});

test("deduplicates existing and uploaded Media by id while preserving first-reference order", () => {
  const draft = createDraft();
  draft.setName("主体");
  assert.equal(draft.addMedia("voice").added, true);
  assert.equal(draft.addMedia({ mediaId: "portrait" }).added, true);
  assert.equal(draft.addMedia("voice").added, false);

  const uploaded = draft.addUploadedMedia({
    referenceId: "reference-new",
    assetId: "uploaded-video",
    assetVersion: 1,
    mediaKind: "video",
    displayName: "上传转身.mp4",
    contentUrl: "/api/assets/uploaded-video/content",
  });
  assert.equal(uploaded.added, true);
  assert.equal(draft.addUploadedMedia({
    assetId: "uploaded-video",
    mediaKind: "video",
    displayName: "上传转身（已登记）.mp4",
  }).added, false);

  assert.deepEqual(plain(draft.createCommitPayload().mediaRefs), [
    { mediaId: "voice", order: 0 },
    { mediaId: "portrait", order: 1 },
    { mediaId: "uploaded-video", order: 2 },
  ]);
  assert.deepEqual(plain(draft.getCounts()), { all: 3, image: 1, video: 1, audio: 1 });
  assert.equal(draft.getState().selectedPreviewId, "voice");
});

test("filters the referenced Media with live counts without making view state dirty", () => {
  const draft = editDraft();
  assert.equal(draft.setFilter("audio").dirty, false);
  assert.deepEqual(plain(draft.listMedia()).map((item) => item.id), ["voice"]);
  assert.deepEqual(plain(draft.listMedia("image")).map((item) => item.id), ["portrait"]);
  assert.equal(draft.selectPreview("voice").id, "voice");
  assert.equal(draft.isDirty(), false);

  draft.addMedia("turnaround");
  assert.deepEqual(plain(draft.getCounts()), { all: 3, image: 1, video: 1, audio: 1 });
  assert.deepEqual(plain(draft.listMedia("video")).map((item) => item.id), ["turnaround"]);
  assert.throws(() => draft.setFilter("document"), /Unknown Entity media filter/);
  assert.throws(() => draft.selectPreview("detail"), /not referenced/);
});

test("renames referenced Media without making Entity content dirty", () => {
  const draft = editDraft();
  const renamed = draft.renameMedia("portrait", "角色定妆.png");

  assert.equal(renamed.name, "角色定妆.png");
  assert.equal(renamed.displayName, "角色定妆.png");
  assert.equal(draft.listMedia("image")[0].name, "角色定妆.png");
  assert.equal(draft.isDirty(), false);
  assert.throws(() => draft.renameMedia("detail", "未引用.png"), /not referenced/);
  assert.throws(() => draft.renameMedia("portrait", "   "), /required/);
});

test("allows only referenced image Media as cover and falls back to the next image", () => {
  const draft = editDraft();
  draft.addMediaBatch(["turnaround", "detail"]);

  assert.throws(() => draft.setCover("voice"), /must be an image/);
  assert.throws(() => draft.setCover("turnaround"), /must be an image/);
  assert.throws(() => draft.setCover("missing"), /not referenced/);
  draft.setCover("detail");
  assert.equal(draft.removeMedia("detail").removed, true);
  assert.equal(draft.getState().coverMediaId, "portrait");
  assert.equal(draft.removeMedia("portrait").removed, true);
  assert.equal(draft.getState().coverMediaId, null);
  assert.equal(draft.removeMedia("detail").removed, false);
  assert.deepEqual(plain(draft.createCommitPayload().mediaRefs), [
    { mediaId: "voice", order: 0 },
    { mediaId: "turnaround", order: 1 },
  ]);
});

test("derives dirty state from persisted draft fields and cancel restores the baseline", () => {
  const draft = editDraft();
  draft.setFilter("audio");
  draft.selectPreview("voice");
  assert.equal(draft.isDirty(), false);

  draft.setName("  Lirael  ");
  assert.equal(draft.isDirty(), false);
  draft.setDescription("新的描述");
  draft.addMedia("detail");
  draft.setCover("detail");
  assert.equal(draft.isDirty(), true);

  const cancelled = plain(draft.cancel());
  assert.equal(cancelled.dirty, false);
  assert.equal(cancelled.name, "Lirael");
  assert.equal(cancelled.description, "精灵感角色");
  assert.deepEqual(cancelled.mediaRefs, [
    { mediaId: "portrait", order: 0 },
    { mediaId: "voice", order: 1 },
  ]);
  assert.equal(cancelled.coverMediaId, "portrait");
  assert.equal(cancelled.selectedPreviewId, "portrait");
  assert.equal(cancelled.filter, "audio");
});

test("fails closed for invalid initialization and malformed Media boundaries", () => {
  assert.throws(
    () => model.createCanvasEntityEditorDraft({ mode: "edit", media }),
    /requires the current Entity/,
  );
  assert.throws(() => createDraft({ mode: "other" }), /Unknown Entity editor mode/);
  assert.throws(
    () => createDraft({ media: [{ id: "document", mediaKind: "document" }] }),
    /Unknown media kind/,
  );
  assert.throws(
    () => editDraft({ entity: { id: "broken", name: "Broken", mediaRefs: [{ mediaId: "missing" }] } }),
    /missing Media/,
  );
  assert.throws(
    () => editDraft({ entity: { id: "broken", name: "Broken", mediaRefs: [{ mediaId: "voice" }], coverMediaId: "voice" } }),
    /must be an image/,
  );
  assert.throws(
    () => editDraft({ expectedVersion: -1 }),
    /non-negative integer/,
  );
  assert.throws(() => createDraft().addMedia("missing"), /Media not found/);
});
