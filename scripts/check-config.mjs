import assert from "node:assert/strict";
import { loadPrototypeData } from "./load-prototype-data.mjs";

const { catalog, config } = await loadPrototypeData();

assert.ok(Array.isArray(catalog) && catalog.length > 0, "Model catalog must not be empty.");
assert.ok(Object.isFrozen(catalog), "Model catalog must remain frozen.");

const modelIds = new Set();
const modelTypes = new Set();
for (const model of catalog) {
  assert.ok(model && typeof model === "object", "Every model must be an object.");
  assert.match(model.id || "", /^[a-z0-9][a-z0-9-]*$/, `Invalid model id: ${model.id}`);
  assert.ok(!modelIds.has(model.id), `Duplicate model id: ${model.id}`);
  modelIds.add(model.id);
  assert.ok(["image", "video"].includes(model.type), `Unsupported model type: ${model.type}`);
  modelTypes.add(model.type);
  assert.ok(model.name && model.provider, `Model ${model.id} needs a name and provider.`);
  assert.ok(Object.isFrozen(model.capabilities), `Capabilities must be frozen for ${model.id}.`);

  const capabilities = model.capabilities || {};
  assert.ok(Array.isArray(capabilities.aspects) && capabilities.aspects.length > 0, `${model.id} needs aspects.`);
  assert.ok(Array.isArray(capabilities.counts) && capabilities.counts.length > 0, `${model.id} needs counts.`);
  assert.ok(capabilities.counts.every((count) => Number.isInteger(count) && count > 0), `${model.id} has invalid counts.`);

  for (const [field, capability] of Object.entries({
    aspect: "aspects",
    resolution: "resolutions",
    quality: "qualities",
    duration: "durations",
  })) {
    if (model.defaults?.[field] !== undefined) {
      assert.ok(
        capabilities[capability]?.includes(model.defaults[field]),
        `${model.id} default ${field} is outside its capabilities.`,
      );
    }
  }
}

assert.deepEqual([...modelTypes].sort(), ["image", "video"], "Catalog must include image and video models.");
assert.ok(config && typeof config === "object", "Prototype config was not defined.");
assert.ok(config.canvasScaleLimits.min > 0, "Minimum canvas scale must be positive.");
assert.ok(config.canvasScaleLimits.max > config.canvasScaleLimits.min, "Canvas scale limits are invalid.");

for (const model of catalog) {
  const capabilities = model.capabilities || {};
  if (model.type === "image") {
    for (const resolution of capabilities.resolutions || []) {
      assert.ok(config.imageResolutionCost[resolution] > 0, `Missing image cost for ${resolution}.`);
    }
    for (const quality of capabilities.qualities || []) {
      assert.ok(config.imageQualityMultiplier[quality] > 0, `Missing image quality multiplier for ${quality}.`);
    }
  } else {
    for (const quality of capabilities.qualities || []) {
      assert.ok(config.videoQualityCost[quality] > 0, `Missing video cost for ${quality}.`);
    }
  }
}

const toolIds = new Set(Object.keys(config.mediaToolDefinitions));
for (const [type, tools] of Object.entries(config.mediaToolsByType)) {
  assert.ok(["image", "video", "audio"].includes(type), `Unexpected media type: ${type}`);
  assert.ok(tools.every((tool) => toolIds.has(tool)), `${type} references an unknown media tool.`);
  const defaults = config.defaultMediaToolPreferences[type]?.tools || [];
  assert.ok(defaults.every((tool) => tools.includes(tool)), `${type} defaults include an unavailable tool.`);
}

const conversationIds = config.agentConversations.map((conversation) => conversation.id);
assert.equal(new Set(conversationIds).size, conversationIds.length, "Agent conversation ids must be unique.");

console.log(`Prototype config check passed (${catalog.length} models, ${toolIds.size} media tools).`);
