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

test("normalizes library search and classifies reusable asset categories", () => {
  assert.equal(model.normalizeSearch("  Robot HERO  "), "robot hero");
  assert.equal(model.matchesSearch(["星海", "Robot Hero"], " robot "), true);
  assert.equal(model.getAssetCategory({ name: "城市夜景", type: "image" }), "scene");
  assert.equal(model.getAssetCategory({ name: "主角人像", type: "image" }), "character");
  assert.equal(model.getAssetCategory({ name: "产品道具", type: "image" }), "prop");
  assert.equal(model.getAssetCategory({ name: "环境音", type: "audio" }), "material");
});

test("builds and filters the grouped canvas element tree", () => {
  const nodes = [{ id: "node-a", type: "image" }, { id: "node-b", type: "video" }];
  const items = model.buildCanvasElementItems({
    nodes,
    groups: [{ id: "group-a", name: "镜头组" }],
    collapsedGroupIds: new Set(["group-a"]),
    getGroupNodes: () => [nodes[0]],
    getGroupBounds: () => ({ width: 640, height: 360 }),
    createNodeItem: (node, parentGroupId = null) => ({
      id: node.id,
      kind: "node",
      type: node.type,
      title: node.id === "node-a" ? "角色参考" : "成片",
      parentGroupId,
    }),
  });

  assert.deepEqual(plain(items).map((item) => item.id), ["group-a", "node-b"]);
  assert.equal(items[0].collapsed, true);
  assert.equal(model.countCanvasElementRows(items), 2);
  assert.deepEqual(
    plain(model.filterCanvasElementTree(items, { filter: "image", query: "角色" }))[0].children.map((item) => item.id),
    ["node-a"],
  );
});

test("derives project filters and global folders without canvas state", () => {
  const filters = [["character", "角色"], ["scene", "场景"], ["prop", "道具"], ["material", "素材"]];
  const categoryLabels = Object.fromEntries(filters);
  const assets = [
    { id: "generated", name: "角色人像", type: "image", source: "generated" },
    { id: "audio", name: "雨声", type: "audio", source: "upload" },
  ];
  assert.deepEqual(
    plain(model.countAssetsByCategory(assets, filters, { categoryLabels })),
    { character: 1, scene: 0, prop: 0, material: 1 },
  );
  assert.equal(model.getPreferredAssetFilter({ assets, currentFilter: "all", filters, categoryLabels }), "character");

  const personal = model.buildGlobalAssetFolders({ assets, scope: "personal" });
  assert.deepEqual(plain(personal).map((folder) => folder.id), [
    "personal-library",
    "personal-generated",
    "personal-inbox",
  ]);
  assert.deepEqual(plain(personal[1].assets).map((asset) => asset.id), ["generated"]);
  assert.equal(model.buildGlobalAssetFolders({ assets, scope: "unknown" })[0].id, "personal-library");
});
