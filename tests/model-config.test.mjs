import assert from "node:assert/strict";
import test from "node:test";
import { loadPrototypeData } from "../scripts/load-prototype-data.mjs";

const { catalog, config } = await loadPrototypeData();

test("catalog keeps stable image and video defaults", () => {
  assert.equal(catalog.find((model) => model.type === "image")?.id, "gpt-image-2");
  assert.equal(catalog.find((model) => model.type === "video")?.id, "seedance-2-5");
});

test("catalog exposes the seven product models in stable display order", () => {
  assert.deepEqual(
    [...catalog].map(({ id, name, type }) => ({ id, name, type })),
    [
      { id: "gpt-image-2", name: "GPT Image 2", type: "image" },
      { id: "seedream-5-lite", name: "Seedream 5.0 Lite", type: "image" },
      { id: "nano-banana-pro", name: "NanoBanana Pro", type: "image" },
      { id: "seedance-2-5", name: "Seedance 2.5", type: "video" },
      { id: "seedance-2", name: "Seedance 2.0", type: "video" },
      { id: "seedance-2-fast", name: "Seedance 2.0 Fast", type: "video" },
      { id: "kling-video-3", name: "Kling 3.0", type: "video" },
    ],
  );
});

test("every model exposes a shared local brand logo contract", () => {
  assert.ok(catalog.every((model) => /^\.\/assets\/model-logos\/[a-z0-9.-]+\.svg$/.test(model.iconSrc)));
  assert.ok(catalog.every((model) => model.iconMode === "mask"));
  assert.equal(catalog.find((model) => model.id === "kling-video-3")?.iconSrc, "./assets/model-logos/kling-mono.svg");
  assert.ok(catalog.filter((model) => model.provider === "ByteDance").every((model) => model.iconSrc.endsWith("/bytedance-mono.svg")));
  assert.equal(catalog.find((model) => model.id === "nano-banana-pro")?.iconSrc, "./assets/model-logos/nanobanana-mono.svg");
});

test("default GPT Image 2 generation keeps the five-credit prototype cost", () => {
  const resolutionCost = config.imageResolutionCost["2K"];
  const qualityMultiplier = config.imageQualityMultiplier["中"];
  assert.equal(Math.ceil(resolutionCost * qualityMultiplier), 5);
});

test("Seedance 2.5 drives the reference parameter layout", () => {
  const seedance = catalog.find((model) => model.id === "seedance-2-5");
  assert.ok(seedance);
  assert.deepEqual([...seedance.capabilities.workflows], ["omni-reference", "first-last-frame"]);
  assert.deepEqual([...seedance.capabilities.aspects], ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"]);
  assert.deepEqual([...seedance.capabilities.qualities], ["480p", "720p", "1080p"]);
  assert.deepEqual({
    ...seedance.capabilities.durationRange,
    marks: [...seedance.capabilities.durationRange.marks],
  }, {
    min: 5,
    max: 30,
    step: 1,
    marks: [5, 10, 15, 20, 25, 30],
  });
  assert.deepEqual({ ...seedance.defaults }, {
    workflow: "omni-reference",
    aspect: "16:9",
    quality: "720p",
    duration: "5s",
  });
});

test("default media toolbar preferences only pin available tools", () => {
  for (const [type, preference] of Object.entries(config.defaultMediaToolPreferences)) {
    assert.ok(preference.tools.length > 0, `${type} needs default tools.`);
    assert.ok(preference.tools.every((tool) => config.mediaToolsByType[type].includes(tool)));
  }
});

test("prompt panels preserve the 705 wide design geometry with bounded content growth", () => {
  assert.equal(config.layoutRules.normalPanelWidth, 705);
  assert.equal(config.layoutRules.normalPanelHeight, 291);
  assert.equal(config.layoutRules.compactPanelHeight, 260);
  assert.equal(config.layoutRules.advancedSettingsHeightByMode.image, 118);
  assert.equal(config.layoutRules.advancedSettingsHeightByMode.video, 154);
  assert.equal(config.layoutRules.promptInputTop, 73);
  assert.equal(config.layoutRules.promptInputBottom, 51);
  assert.equal(config.layoutRules.promptTargetScreenWidth, 705);
  assert.equal(config.layoutRules.promptScreenMargin, 20);
  assert.equal(config.layoutRules.promptScaleMin, 0.5);
  assert.equal(config.layoutRules.promptScaleMax, 5);
  assert.equal(config.layoutRules.panelGap, 14);
});

test("video models expose their own second-level duration ranges and workflows", () => {
  const seedance20 = catalog.find((model) => model.id === "seedance-2");
  const seedanceFast = catalog.find((model) => model.id === "seedance-2-fast");
  const kling = catalog.find((model) => model.id === "kling-video-3");
  assert.deepEqual({ ...seedance20.capabilities.durationRange, marks: [...seedance20.capabilities.durationRange.marks] }, { min: 4, max: 15, step: 1, marks: [4, 5, 10, 15] });
  assert.deepEqual({ ...seedanceFast.capabilities.durationRange, marks: [...seedanceFast.capabilities.durationRange.marks] }, { min: 4, max: 15, step: 1, marks: [4, 5, 10, 15] });
  assert.deepEqual({ ...kling.capabilities.durationRange, marks: [...kling.capabilities.durationRange.marks] }, { min: 3, max: 15, step: 1, marks: [3, 5, 10, 15] });
  assert.equal(seedance20.defaults.duration, "4s");
  assert.equal(seedanceFast.defaults.duration, "4s");
  assert.equal(kling.defaults.duration, "3s");
  assert.deepEqual([...kling.capabilities.workflows], ["text-to-video", "image-to-video"]);
});

test("only video nodes expose generation workflows", () => {
  assert.deepEqual([...config.generationWorkflows.image], []);
  assert.deepEqual(
    [...config.generationWorkflows.video].map((workflow) => workflow.label),
    ["文生视频", "全能参考", "首尾帧", "图生视频"],
  );
});
