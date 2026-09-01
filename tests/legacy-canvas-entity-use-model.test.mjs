import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("../src/legacy-canvas/canvas-entity-use-model.js", import.meta.url),
  "utf8",
);
const context = vm.createContext({});
new vm.Script(source, { filename: "canvas-entity-use-model.js" }).runInContext(context);
const model = context.REELAY_CANVAS_ENTITY_USE_MODEL;
const plain = (value) => JSON.parse(JSON.stringify(value));

test("registers a focused frozen Entity-use model API", () => {
  assert.ok(Object.isFrozen(model));
  assert.deepEqual(plain(Object.keys(model).sort()), [
    "createCenteredGridPlan",
    "createEntityMediaPlan",
    "getMediaIdentityKeys",
  ]);
});

test("resolves visible Entity Media in Entity and reference order", () => {
  const media = [
    { id: "portrait", type: "image", width: 900, height: 1200 },
    { id: "action", type: "video", width: 1920, height: 1080 },
    { id: "voice", type: "audio" },
  ];
  const plan = model.createEntityMediaPlan({
    entities: [
      { id: "hero", mediaRefs: [{ mediaId: "action" }, { mediaId: "portrait" }] },
      { id: "narrator", mediaRefs: [{ mediaId: "voice" }] },
    ],
    media,
  });

  assert.deepEqual(plain(plan.entityIds), ["hero", "narrator"]);
  assert.deepEqual(plain(plan.entries).map((entry) => [entry.entityId, entry.mediaId]), [
    ["hero", "action"],
    ["hero", "portrait"],
    ["narrator", "voice"],
  ]);
  assert.deepEqual(plain(plan.media).map((item) => item.id), ["action", "portrait", "voice"]);
  assert.deepEqual(plain(plan.skipped), []);
  assert.ok(Object.isFrozen(plan));
  assert.ok(Object.isFrozen(plan.entries[0].media));
});

test("skips missing and invisible references without disturbing the remaining order", () => {
  const plan = model.createEntityMediaPlan({
    entities: [
      {
        id: "hero",
        mediaRefs: ["missing", "hidden", "wrong-space", "visible"],
      },
    ],
    media: [
      { id: "hidden", type: "image", visible: false },
      { id: "wrong-space", type: "image", space: "organization" },
      { id: "visible", type: "image", space: "personal" },
    ],
    isMediaVisible: (item) => item.space !== "organization",
  });

  assert.deepEqual(plain(plan.entries).map((entry) => entry.mediaId), ["visible"]);
  assert.deepEqual(plain(plan.skipped).map((entry) => [entry.mediaId, entry.reason]), [
    ["missing", "missing"],
    ["hidden", "invisible"],
    ["wrong-space", "invisible"],
  ]);
});

test("deduplicates across existing targets and Entities by id or source identity", () => {
  const media = [
    { id: "portrait", type: "image", librarySourceId: "source-portrait" },
    { id: "portrait-copy", type: "image", workspaceAssetId: "source-portrait" },
    { id: "action", type: "video", platformSourceId: "platform-action" },
    { id: "action-alias", type: "video", sourceId: "platform-action" },
    { id: "voice", type: "audio" },
  ];
  const plan = model.createEntityMediaPlan({
    entities: [
      { id: "hero", mediaRefs: ["portrait", "action", "voice"] },
      { id: "hero-variant", mediaRefs: ["portrait-copy", "action-alias", "voice"] },
    ],
    media,
    existingMedia: [{ id: "node-copy", librarySourceId: "source-portrait" }],
  });

  assert.deepEqual(plain(plan.entries).map((entry) => [entry.mediaId, entry.sourceMediaId]), [
    ["action", "platform-action"],
    ["voice", "voice"],
  ]);
  assert.deepEqual(plain(plan.skipped).map((entry) => [entry.mediaId, entry.reason]), [
    ["portrait", "existing"],
    ["portrait-copy", "existing"],
    ["action-alias", "duplicate"],
    ["voice", "duplicate"],
  ]);
  assert.deepEqual(plain(model.getMediaIdentityKeys(media[0])), ["portrait", "source-portrait"]);
});

test("does not mutate Entity, Media, or target inputs", () => {
  const entity = { id: "hero", mediaRefs: [{ mediaId: "portrait" }] };
  const media = { id: "portrait", type: "image", tags: ["hero"] };
  const target = { id: "target", librarySourceId: "different" };
  const before = JSON.stringify({ entity, media, target });

  const plan = model.createEntityMediaPlan({ entities: [entity], media: [media], existingMedia: [target] });
  assert.equal(JSON.stringify({ entity, media, target }), before);
  assert.notEqual(plan.entries[0].media, media);
});

test("lays four mixed-ratio Media items out as a centered two-by-two grid", () => {
  const plan = model.createEntityMediaPlan({
    entities: [{ id: "subject", mediaRefs: ["wide", "portrait", "square", "audio"] }],
    media: [
      { id: "wide", type: "image", width: 1600, height: 900 },
      { id: "portrait", type: "image", width: 900, height: 1200 },
      { id: "square", type: "image", width: 1000, height: 1000 },
      { id: "audio", type: "audio", aspectRatio: "4:1" },
    ],
  });
  const layout = model.createCenteredGridPlan(plan, {
    centerX: 500,
    centerY: 300,
    viewportWidth: 800,
    viewportHeight: 520,
    maxItemWidth: 220,
    maxItemHeight: 160,
    gapX: 30,
    gapY: 24,
  });

  assert.equal(layout.columns, 2);
  assert.equal(layout.rows, 2);
  assert.deepEqual(plain(layout.items).map((item) => [item.row, item.column]), [
    [0, 0], [0, 1], [1, 0], [1, 1],
  ]);
  assert.equal(layout.items[0].width / layout.items[0].height, 1600 / 900);
  assert.equal(layout.items[1].width / layout.items[1].height, 900 / 1200);
  assert.equal(layout.items[2].width / layout.items[2].height, 1);
  assert.equal(layout.items[3].width / layout.items[3].height, 4);
  assert.ok(Math.abs(layout.bounds.x + layout.bounds.width / 2 - 500) < 1e-9);
  assert.ok(Math.abs(layout.bounds.y + layout.bounds.height / 2 - 300) < 1e-9);
  assert.ok(layout.bounds.width <= 800 - 64);
  assert.ok(layout.bounds.height <= 520 - 64);
  assert.ok(Object.isFrozen(layout.items[0].media));
});

test("centers an incomplete final row and fits a constrained viewport", () => {
  const layout = model.createCenteredGridPlan([
    { id: "one", type: "image", aspectRatio: 1 },
    { id: "two", type: "image", aspectRatio: 1 },
    { id: "three", type: "image", aspectRatio: 1 },
  ], {
    centerX: 0,
    centerY: 0,
    viewportWidth: 180,
    viewportHeight: 140,
    padding: 20,
    maxItemWidth: 200,
    maxItemHeight: 200,
    gapX: 24,
    gapY: 18,
  });

  assert.equal(layout.columns, 2);
  assert.equal(layout.rows, 2);
  assert.equal(layout.items[2].centerX, 0);
  assert.ok(layout.bounds.x >= -90 + 20 - 1e-9);
  assert.ok(layout.bounds.x + layout.bounds.width <= 90 - 20 + 1e-9);
  assert.ok(layout.bounds.y >= -70 + 20 - 1e-9);
  assert.ok(layout.bounds.y + layout.bounds.height <= 70 - 20 + 1e-9);
});

test("uses actual rendered item sizes for spacing and centering when supplied", () => {
  const layout = model.createCenteredGridPlan([
    { id: "one", type: "image", layoutWidth: 320, layoutHeight: 180 },
    { id: "two", type: "image", layoutWidth: 80, layoutHeight: 240 },
    { id: "three", type: "image", layoutWidth: 30, layoutHeight: 30 },
    { id: "four", type: "video" },
  ], {
    centerX: 400,
    centerY: 240,
    viewportWidth: 400,
    viewportHeight: 300,
    maxItemWidth: 100,
    maxItemHeight: 80,
    gapX: 20,
    gapY: 16,
    getItemSize: (entry) => entry.media.id === "three" ? { width: 260, height: 130 } : null,
  });

  assert.deepEqual(plain(layout.items).map((item) => [item.width, item.height]), [
    [320, 180],
    [80, 240],
    [260, 130],
    [100, 56.25],
  ]);
  assert.equal(layout.items[0].x, 400 - (320 + 20 + 80) / 2);
  assert.equal(layout.items[1].y, layout.items[0].y - 30);
  assert.equal(layout.items[2].x, 400 - (260 + 20 + 100) / 2);
  assert.ok(Math.abs(layout.bounds.x + layout.bounds.width / 2 - 400) < 1e-9);
  assert.ok(Math.abs(layout.bounds.y + layout.bounds.height / 2 - 240) < 1e-9);
});

test("returns a stable empty layout around the requested viewport center", () => {
  assert.deepEqual(plain(model.createCenteredGridPlan([], { centerX: 12, centerY: -8 })), {
    center: { x: 12, y: -8 },
    viewport: { width: 960, height: 640, padding: 32 },
    columns: 0,
    rows: 0,
    gap: { x: 0, y: 0 },
    bounds: { x: 12, y: -8, width: 0, height: 0 },
    items: [],
  });
});
