import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("../src/legacy-canvas/canvas-generator-model-policy.js", import.meta.url),
  "utf8",
);
const context = vm.createContext({});
new vm.Script(source).runInContext(context);
const policy = context.REELAY_CANVAS_GENERATOR_MODEL_POLICY;
const catalog = [
  { id: "image-a", type: "image" },
  { id: "image-b", type: "image" },
  { id: "seedance-video", type: "video", brand: "seedance" },
  { id: "kling-video", type: "video", brand: "kling" },
];

test("generator nodes only expose models matching their creation type", () => {
  const imageNode = { kind: "generator", mode: "image", model: "image-b" };
  const videoNode = { kind: "generator", mode: "video", model: "seedance-video" };
  assert.deepEqual(
    policy.getCompatibleModels(catalog, imageNode).map((model) => model.id),
    ["image-a", "image-b"],
  );
  assert.deepEqual(
    policy.getCompatibleModels(catalog, videoNode).map((model) => model.id),
    ["seedance-video", "kling-video"],
  );
  assert.equal(policy.canUseModel(catalog, imageNode, catalog[2]), false);
  assert.equal(policy.canUseModel(catalog, videoNode, catalog[0]), false);
});

test("invalid model ids fall back within the node type and never cross media types", () => {
  const videoNode = { kind: "generator", mode: "video", model: "image-a" };
  const resolved = policy.normalizeModelState(catalog, videoNode);
  assert.equal(resolved.id, "seedance-video");
  assert.equal(videoNode.mode, "video");
  assert.equal(videoNode.model, "seedance-video");

  const unavailableNode = { kind: "generator", mode: "video", model: "image-a" };
  assert.equal(policy.resolveModel(catalog.filter((model) => model.type === "image"), unavailableNode), null);
});

test("only Seedance generator models can use Entity references", () => {
  const seedanceNode = { kind: "generator", mode: "video", model: "seedance-video" };
  const klingNode = { kind: "generator", mode: "video", model: "kling-video" };
  const imageNode = { kind: "generator", mode: "image", model: "image-a" };
  const invalidVideoNode = { kind: "generator", mode: "video", model: "missing-video" };

  assert.equal(policy.canUseEntityReferences(catalog, seedanceNode), true);
  assert.equal(policy.canUseEntityReferences(catalog, klingNode), false);
  assert.equal(policy.canUseEntityReferences(catalog, imageNode), false);
  assert.equal(policy.canUseEntityReferences(catalog, invalidVideoNode), true);
  assert.equal(policy.canUseEntityReferences(catalog.filter((model) => model.type === "image"), invalidVideoNode), false);
  assert.equal(policy.canUseEntityReferences(
    [{ id: "seedance-image", type: "image", brand: "seedance" }],
    { kind: "generator", mode: "image", model: "seedance-image" },
  ), false);
  assert.equal(policy.canUseEntityReferences(catalog, { kind: "asset", mode: "video", model: "seedance-video" }), false);
});

test("runtime model policy never lets legacy fields or results redefine a node creation type", () => {
  const runtimeNode = {
    kind: "generator",
    mode: "image",
    model: "image-a",
    lockedMode: "video",
    generatedAsset: { type: "video" },
  };
  assert.equal(policy.getNodeModeContract(runtimeNode), "image");
  assert.equal(policy.normalizeModelState(catalog, runtimeNode).id, "image-a");
  assert.equal(runtimeNode.mode, "image");
});
