import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const context = vm.createContext({});
context.window = context;
for (const file of ["data/model-catalog.js", "src/config/prototype-config.js", "src/legacy-canvas/canvas-prompt-document.js", "src/config/generation-demo-presets.js"]) {
  vm.runInContext(await readFile(new URL(`../${file}`, import.meta.url), "utf8"), context);
}
const models = context.REELAY_MODEL_CATALOG;
const media = context.REELAY_PROTOTYPE_CONFIG.assetLibrarySeed.media;
const create = (overrides = {}) => context.REELAY_GENERATION_DEMO_PRESETS.create({ models, media, ...overrides });

test("five representative presets cover text, mixed media, pagination and framing with every attachment cited", () => {
  const presets = create();
  assert.equal(presets.length, 5);
  assert.ok(presets.some((item) => item.input.references.length === 0));
  assert.deepEqual([...new Set(presets.map((item) => item.input.parameters.aspect))].sort(), ["16:9", "1:1", "3:2", "9:16"]);
  assert.ok(presets.some((item) => new Set(item.input.references.map((asset) => asset.type)).size === 3));
  assert.ok(presets.some((item) => item.input.references.length > 10));
  for (const { input } of presets) {
    const model = models.find((item) => item.id === input.modelId);
    assert.ok(model.capabilities.aspects.includes(input.parameters.aspect));
    if (model.type === "image" || !model.capabilities.workflows?.includes("omni-reference")) {
      assert.ok(input.references.every((item) => item.type === "image"));
    }
    const resolved = context.REELAY_CANVAS_PROMPT_DOCUMENT.resolve(input.promptDocument,
      input.references.map((asset) => ({ key: `asset:${asset.id}`, asset })));
    assert.equal(resolved.missing.length, 0);
    assert.equal(resolved.mismatched.length, 0);
    assert.ok(resolved.text.trim());
    const citedKeys = [...new Set(input.promptDocument.content.filter((part) => part.type === "reference").map((part) => part.key))].sort();
    assert.deepEqual(citedKeys, Array.from(input.references, (asset) => `asset:${asset.id}`).sort());
  }
});

test("multi-reference example starts with citations and covers all twelve distinct materials", () => {
  const { input } = create().find((preset) => preset.id === "image-many");
  assert.equal(input.promptDocument.content[1].type, "reference");
  const citations = input.promptDocument.content.filter((part) => part.type === "reference");
  assert.equal(citations.length, 12);
  assert.deepEqual(Array.from(citations, (part) => part.fallbackLabel), Array.from({ length: 12 }, (_, i) => `图片${i + 1}`));
});

test("omni example cites nine distinct existing media files in a complete shot and sound brief", async () => {
  const { input } = create().find((preset) => preset.id === "video-omni");
  const model = models.find((entry) => entry.id === input.modelId);
  const counts = input.references.reduce((result, asset) => ({ ...result, [asset.type]: (result[asset.type] || 0) + 1 }), {});
  assert.deepEqual(counts, { image: 7, video: 1, audio: 1 });
  assert.equal(new Set(input.references.map((asset) => asset.url)).size, 9);
  assert.ok(input.references.length <= 10, "the rich example stays within its ten-item design budget");
  assert.equal(input.parameters.workflow, "omni-reference");
  assert.equal(input.parameters.omniReferenceTaskType, "auto");
  assert.ok(model.capabilities.workflows.includes(input.parameters.workflow));
  const seconds = Number.parseInt(input.parameters.duration, 10);
  assert.equal(seconds, 10);
  assert.ok(seconds >= model.capabilities.durationRange.min && seconds <= model.capabilities.durationRange.max);
  const chineseCharacters = [...input.prompt.matchAll(/\p{Script=Han}/gu)].length;
  assert.ok(chineseCharacters >= 300 && chineseCharacters <= 450);
  assert.equal(input.prompt.split("\n").length, 5);
  for (const section of ["场景与角色：", "镜头：", "声音：", "画面要求：", "0–3秒", "3–7秒", "7–10秒"]) assert.ok(input.prompt.includes(section));
  const citations = input.promptDocument.content.filter((part) => part.type === "reference");
  assert.deepEqual(Array.from(citations, (part) => part.fallbackLabel), ["图片1", "图片2", "图片3", "图片4", "图片5", "图片6", "图片7", "视频1", "音频1"]);
  assert.equal(new Set(citations.map((part) => part.key)).size, input.references.length);
  for (const asset of input.references) {
    const original = media.find((entry) => entry.id === asset.sourceAssetId);
    assert.ok(original); assert.equal(asset.url, original.url); assert.equal(asset.type, original.type);
    if (asset.url.startsWith("./")) await access(new URL(`../${asset.url.slice(2)}`, import.meta.url));
  }
});

test("insufficient or unsupported media omits a complete example rather than leaving dangling citations", () => {
  for (const type of ["image", "video", "audio"]) {
    let kept = 0;
    const reduced = media.filter((asset) => asset.type !== type || (type === "image" && kept++ < 6));
    const presets = create({ media: reduced });
    assert.equal(presets.some((preset) => preset.id === "video-omni"), false);
    assert.ok(presets.some((preset) => preset.id === "image-square"));
  }
  const images = media.filter((asset) => asset.type === "image").slice(0, 6);
  const duplicated = [...images, images[0], ...media.filter((asset) => asset.type !== "image")];
  assert.equal(create({ media: duplicated }).some((preset) => preset.id === "video-omni"), false);
  const noMixedMedia = models.map((model) => model.id === "seedance-2-5"
    ? { ...model, capabilities: { ...model.capabilities, workflows: [] } } : model);
  assert.equal(create({ models: noMixedMedia }).some((preset) => preset.id === "video-omni"), false);
});

test("editing a filled example cannot modify later presets or source assets", () => {
  const presets = create();
  const originalName = presets[1].input.references[0].name;
  presets[1].input.references[0].name = "changed";
  presets[1].input.parameters.aspect = "9:16";
  presets[1].input.promptDocument.content.length = 0;
  const next = create();
  assert.equal(next[1].input.references[0].name, originalName);
  assert.equal(next[1].input.parameters.aspect, "16:9");
  assert.ok(next[1].input.promptDocument.content.length);
});
