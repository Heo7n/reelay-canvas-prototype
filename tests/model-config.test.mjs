import assert from "node:assert/strict";
import test from "node:test";
import { loadPrototypeData } from "../scripts/load-prototype-data.mjs";

const { catalog, config } = await loadPrototypeData();

test("catalog keeps stable image and video defaults", () => {
  assert.equal(catalog.find((model) => model.type === "image")?.id, "gpt-image-2");
  assert.equal(catalog.find((model) => model.type === "video")?.id, "seedance-2");
});

test("default GPT Image 2 generation keeps the five-credit prototype cost", () => {
  const resolutionCost = config.imageResolutionCost["2K"];
  const qualityMultiplier = config.imageQualityMultiplier["中"];
  assert.equal(Math.ceil(resolutionCost * qualityMultiplier), 5);
});

test("Veo high-quality modes remain constrained to one eight-second result", () => {
  const veo = catalog.find((model) => model.id === "veo-3-1");
  assert.ok(veo);
  assert.deepEqual([...veo.capabilities.durationsByQuality["1080p"]], ["8s"]);
  assert.deepEqual([...veo.capabilities.durationsByQuality["4K"]], ["8s"]);
  assert.deepEqual([...veo.capabilities.counts], [1]);
});

test("default media toolbar preferences only pin available tools", () => {
  for (const [type, preference] of Object.entries(config.defaultMediaToolPreferences)) {
    assert.ok(preference.tools.length > 0, `${type} needs default tools.`);
    assert.ok(preference.tools.every((tool) => config.mediaToolsByType[type].includes(tool)));
  }
});
