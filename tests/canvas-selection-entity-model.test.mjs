import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../src/legacy-canvas/canvas-selection-entity-model.js", import.meta.url), "utf8");
const context = vm.createContext({});
new vm.Script(source, { filename: "canvas-selection-entity-model.js" }).runInContext(context);
const model = context.REELAY_CANVAS_SELECTION_ENTITY_MODEL;
const plan = model.createSelectionEntityPlan;
const plain = (value) => JSON.parse(JSON.stringify(value));
const media = (id, type = "image", extra = {}) => ({ id, type, url: `/media/${id}`, ...extra });
const node = (id, asset = media(id), extra = {}) => ({ id, kind: "asset", x: 0, y: 0, assets: [asset], ...extra });

test("exports a focused frozen planner and never mutates selection or catalog", () => {
  const nodes = [node("second", media("b"), { y: 20 }), node("first", media("a"), { y: 10 })];
  const personalMedia = [media("a", "image", { details: { width: 80 } }), media("b")];
  const before = JSON.stringify({ nodes, personalMedia });
  const result = plan({ nodes, personalMedia });
  assert.deepEqual(plain(Object.keys(model)), ["createSelectionEntityPlan"]);
  assert.ok(Object.isFrozen(model));
  assert.ok(Object.isFrozen(result.media[0].details));
  assert.equal(JSON.stringify({ nodes, personalMedia }), before);
  assert.notEqual(result.media[0], personalMedia[0]);
  personalMedia[0].details.width = 100;
  assert.equal(result.media[0].details.width, 80);
});

test("orders references spatially, independent of selection input and display stacking", () => {
  const nodes = [node("z", media("z"), { x: 10, y: 0 }), node("b"), node("a"), node("top", media("top"), { y: -20 })];
  assert.deepEqual(plain(plan({ nodes, hosted: false }).media).map(({ id }) => id), ["top", "a", "b", "z"]);
  assert.deepEqual(nodes.map(({ id }) => id), ["z", "b", "a", "top"]);
});

test("uses the active asset and generator output, never attached generator references", () => {
  const nodes = [
    node("asset", media("inactive"), { assets: [media("inactive"), media("active")], activeAssetId: "active" }),
    node("generated", media("reference"), { kind: "generator", generatedAsset: media("output"), y: 20 }),
  ];
  const result = plan({ nodes, hosted: false });
  assert.deepEqual(plain(result.media).map(({ id }) => id), ["active", "output"]);
  assert.equal(result.reason, "");
});

test("falls back to the first asset when its active ID no longer exists", () => {
  const result = plan({ nodes: [node("a", media("first"), { activeAssetId: "missing" }), node("b")], hosted: false });
  assert.equal(result.media[0].id, "first");
});

test("accepts image, video and audio and keeps authoritative catalog metadata", () => {
  const types = ["image", "video", "audio"];
  const personalMedia = types.map((type) => media(type, type, { name: `catalog-${type}` }));
  const result = plan({ nodes: types.map((type, index) => node(type, media(type, type, { name: "old" }), { y: index })), personalMedia });
  assert.equal(result.reason, "");
  assert.equal(result.notice, "");
  assert.deepEqual(plain(result.media).map(({ type, mediaKind, name }) => [type, mediaKind, name]), types.map((type) => [type, type, `catalog-${type}`]));
});

test("resolves canonical identity by workspace ID, source ID and ID, in that priority", () => {
  const personalMedia = [media("workspace"), media("source"), media("local")];
  const nodes = [
    node("one", media("local", "image", { workspaceAssetId: "workspace", librarySourceId: "source" })),
    node("two", media("projection", "image", { librarySourceId: "source" }), { y: 1 }),
    node("three", media("local"), { y: 2 }),
  ];
  assert.deepEqual(plain(plan({ nodes, personalMedia }).media).map(({ id }) => id), ["workspace", "source", "local"]);
});

test("deduplicates canvas projections by canonical media ID without URL matching", () => {
  const personalMedia = [media("a", "image", { url: "/same" }), media("b", "image", { url: "/same" })];
  const nodes = [
    node("one", media("clone-1", "image", { workspaceAssetId: "a" })),
    node("two", media("clone-2", "image", { librarySourceId: "a" }), { y: 1 }),
    node("three", media("b"), { y: 2 }),
    node("four", media("not-personal", "image", { url: "/same" }), { y: 3 }),
  ];
  const result = plan({ nodes, personalMedia });
  assert.deepEqual(plain(result.media).map(({ id }) => id), ["a", "b"]);
  assert.equal(result.duplicateCount, 1);
  assert.equal(result.unavailableCount, 1);
  assert.equal(result.skippedCount, 1);
  assert.match(result.notice, /已带入 2 个素材.*1 个重复素材.*1 个无法导入个人素材库/);
});

test("standalone projections share source identity without registering library records", () => {
  const nodes = [node("one", media("clone-a", "audio", { librarySourceId: "source" })), node("two", media("clone-b", "audio", { librarySourceId: "source" }))];
  const result = plan({ nodes, hosted: false });
  assert.equal(result.media.length, 1);
  assert.equal(result.media[0].id, "source");
  assert.equal(result.duplicateCount, 1);
  assert.equal(result.reason, "");
});

test("skips empty and currently generating nodes, including their stale previous results", () => {
  const nodes = [
    node("valid"),
    node("empty", null, { assets: [] }),
    node("busy", null, { kind: "generator", generating: true, generatedAsset: media("stale") }),
    node("reference-only", media("input"), { kind: "generator" }),
  ];
  const result = plan({ nodes, hosted: false });
  assert.deepEqual(plain(result.media).map(({ id }) => id), ["valid"]);
  assert.equal(result.emptyCount, 3);
  assert.equal(result.skippedCount, 3);
  assert.match(result.notice, /已带入 1 个素材.*3 个暂无可用素材的节点/);
  assert.equal(result.reason, "");
});

test("rejects malformed media instead of leaking unsupported records into editor drafts", () => {
  const nodes = [node("no-url", media("a", "image", { url: " " })), node("bad-kind", media("b", "text")), node("no-id", media("", "audio"))];
  const result = plan({ nodes, hosted: false });
  assert.equal(result.media.length, 0);
  assert.equal(result.emptyCount, 3);
  assert.equal(result.reason, "选中节点暂无可用素材");
});

test("cannot use non-personal or absent catalog assets in a hosted Entity", () => {
  const result = plan({ nodes: [node("one", media("project-only", "image", { workspaceAssetId: "project-only" })), node("two")], personalMedia: [] });
  assert.equal(result.media.length, 0);
  assert.equal(result.unavailableCount, 2);
  assert.equal(result.reason, "选中素材无法导入个人素材库");
});

test("reports precise inclusion, empty, unavailable and duplicate counts for mixed selection", () => {
  const nodes = [node("a"), node("b", media("a")), node("c", null), node("d")];
  const result = plan({ nodes, personalMedia: [media("a")] });
  assert.deepEqual([result.selectedCount, result.media.length, result.duplicateCount, result.emptyCount, result.unavailableCount, result.skippedCount], [4, 1, 1, 1, 1, 2]);
  assert.equal(result.reason, "");
  assert.match(result.notice, /已带入 1 个素材；已合并 1 个重复素材；已跳过 1 个暂无可用素材的节点；已跳过 1 个无法导入个人素材库/);
});

test("keeps personally owned canonical media without asking the import capability", () => {
  const canonical = media("owned", "image", { url: "/canonical", details: { width: 100 } });
  const result = plan({
    nodes: [node("one", media("projection", "image", { workspaceAssetId: "owned", url: "blob:old" })), node("two", canonical)],
    personalMedia: [canonical],
    canImportMedia() { assert.fail("canonical records must not need import capability"); },
  });
  assert.equal(result.reason, "");
  assert.equal(result.existingCount, 1);
  assert.equal(result.pendingImportCount, 0);
  assert.equal(result.duplicateCount, 1);
  assert.equal(result.media[0].url, "/canonical");
});

test("includes importable pending media with existing media and explains its save location", () => {
  const pending = media("upload", "video", { url: "blob:uploaded-video" });
  const nodes = [
    node("a", media("owned")),
    node("b", media("clone-owned", "image", { librarySourceId: "owned" })),
    node("c", pending),
    node("d", media("clone-upload", "video", { librarySourceId: "upload", url: pending.url })),
    node("e", null),
    node("f", media("project-only", "audio", { workspaceAssetId: "project-only" })),
  ];
  const result = plan({ nodes, personalMedia: [media("owned")], canImportMedia: (asset) => asset.url.startsWith("blob:") });
  assert.deepEqual(plain(result.media).map(({ id }) => id), ["owned", "upload"]);
  assert.deepEqual([result.selectedCount, result.existingCount, result.pendingImportCount, result.duplicateCount, result.emptyCount, result.unavailableCount, result.skippedCount], [6, 1, 1, 2, 1, 1, 2]);
  assert.equal(result.reason, "");
  assert.match(result.notice, /已带入 2 个素材；1 个已有素材保持原位置；1 个新素材将在创建时保存到个人素材库的默认目录/);
  assert.match(result.notice, /已合并 2 个重复素材；已跳过 1 个暂无可用素材的节点；已跳过 1 个无法导入个人素材库的素材/);
});

test("can create a reviewed draft entirely from importable new media", () => {
  const nodes = [node("a", media("upload-image", "image", { url: "blob:image" })), node("b", null, { kind: "generator", generatedAsset: media("generated-audio", "audio", { url: "data:audio/wav;base64,AAAA" }) })];
  const result = plan({ nodes, canImportMedia: () => true });
  assert.equal(result.reason, "");
  assert.equal(result.existingCount, 0);
  assert.equal(result.pendingImportCount, 2);
  assert.equal(result.skippedCount, 0);
  assert.deepEqual(plain(result.media).map(({ id }) => id), ["upload-image", "generated-audio"]);
  assert.equal(result.notice, "已带入 2 个素材；2 个新素材将在创建时保存到个人素材库的默认目录");
});

test("deduplicates pending projections by stable source ID, never by their URL", () => {
  const nodes = [
    node("a", media("clone-a", "image", { librarySourceId: "upload", url: "blob:same" })),
    node("b", media("clone-b", "image", { librarySourceId: "upload", url: "blob:same" })),
    node("c", media("distinct", "image", { url: "blob:same" })),
  ];
  const result = plan({ nodes, canImportMedia: () => true });
  assert.deepEqual(plain(result.media).map(({ id }) => id), ["upload", "distinct"]);
  assert.equal(result.pendingImportCount, 2);
  assert.equal(result.existingCount, 0);
  assert.equal(result.duplicateCount, 1);
});

test("requires explicit synchronous import eligibility and never infers ownership from URL", () => {
  const nodes = [node("a", media("project-only", "image", { workspaceAssetId: "project-only", url: "/same-url" })), node("b", media("other-owner", "image", { url: "/same-url" }))];
  const options = { nodes, personalMedia: [media("owned", "image", { url: "/same-url" })] };
  for (const canImportMedia of [undefined, null, false, () => false, () => "yes", () => Promise.resolve(true)]) {
    const result = plan({ ...options, canImportMedia });
    assert.equal(result.media.length, 0);
    assert.equal(result.pendingImportCount, 0);
    assert.equal(result.unavailableCount, 2);
    assert.equal(result.reason, "选中素材无法导入个人素材库");
  }
});

test("pending media is a deeply immutable independent draft without network or registration", () => {
  let fetchCount = 0;
  const isolatedContext = vm.createContext({ fetch() { fetchCount += 1; assert.fail("planning cannot fetch assets"); } });
  new vm.Script(source).runInContext(isolatedContext);
  const pending = media("upload", "image", { url: "blob:upload", details: { width: 80 }, tags: ["portrait"] });
  const nodes = [node("a", pending), node("b", pending)];
  const personalMedia = [];
  const before = JSON.stringify({ nodes, personalMedia });
  const result = isolatedContext.REELAY_CANVAS_SELECTION_ENTITY_MODEL.createSelectionEntityPlan({ nodes, personalMedia, canImportMedia: () => true });
  assert.equal(JSON.stringify({ nodes, personalMedia }), before);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.media));
  assert.ok(Object.isFrozen(result.media[0].details));
  assert.ok(Object.isFrozen(result.media[0].tags));
  assert.notEqual(result.media[0], pending);
  pending.details.width = 120;
  pending.tags.push("changed");
  assert.equal(result.media[0].details.width, 80);
  assert.deepEqual(plain(result.media[0].tags), ["portrait"]);
  assert.equal(result.pendingImportCount, 1);
  assert.equal(fetchCount, 0);
});

test("disables unavailable capabilities, a single node, and progressive catalog failure", () => {
  const options = { nodes: [node("a"), node("b")], personalMedia: [media("a"), media("b")] };
  assert.equal(plan({ ...options, canCreate: false }).reason, "当前画布不可新建主体");
  assert.equal(plan({ ...options, nodes: [node("a")] }).reason, "请先选择至少 2 个节点");
  assert.equal(plan({ ...options, catalogStatus: "loading" }).reason, "个人素材库加载中，请稍后重试");
  assert.equal(plan({ ...options, catalogStatus: "unavailable" }).reason, "个人素材库暂不可用，请稍后重试");
  assert.equal(plan({ ...options, catalogStatus: "ready" }).reason, "");
  assert.equal(plan({ ...options, hosted: false, catalogStatus: "loading" }).reason, "");
});

test("accepts at most 100 unique media without silently truncating a larger selection", () => {
  const nodes = Array.from({ length: 101 }, (_, index) => node(`n-${index}`, media(`m-${index}`), { y: index }));
  assert.equal(plan({ nodes: nodes.slice(0, 100), hosted: false }).reason, "");
  const result = plan({ nodes, hosted: false });
  assert.match(result.reason, /最多添加 100 个素材/);
  assert.equal(result.media.length, 101);
  assert.equal(result.skippedCount, 0);
  const repeated = [...nodes.slice(0, 100), node("duplicate", media("m-0"))];
  assert.equal(plan({ nodes: repeated, hosted: false }).reason, "");
});

test("handles missing optional input without side effects or exceptions", () => {
  assert.equal(plan().reason, "请先选择至少 2 个节点");
  const result = plan({ nodes: null, personalMedia: null });
  assert.equal(result.selectedCount, 0);
  assert.deepEqual(plain(result.media), []);
});
