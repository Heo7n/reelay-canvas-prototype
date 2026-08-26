import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { loadPrototypeData } from "./load-prototype-data.mjs";

const { catalog, config, modelDirectory } = await loadPrototypeData();
const projectRoot = fileURLToPath(new URL("../", import.meta.url));

assert.ok(Array.isArray(catalog) && catalog.length > 0, "Model catalog must not be empty.");
assert.ok(Object.isFrozen(catalog), "Model catalog must remain frozen.");
assert.ok(Array.isArray(modelDirectory), "Shared model directory must be available.");
assert.ok(Object.isFrozen(modelDirectory), "Shared model directory must remain frozen.");

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
  assert.match(model.iconSrc || "", /^\.\/assets\/model-logos\/[a-z0-9.-]+\.svg$/, `${model.id} needs a local SVG logo.`);
  await access(resolve(projectRoot, model.iconSrc.slice(2)));
  assert.ok(Object.isFrozen(model.capabilities), `Capabilities must be frozen for ${model.id}.`);

  const capabilities = model.capabilities || {};
  assert.ok(Array.isArray(capabilities.aspects) && capabilities.aspects.length > 0, `${model.id} needs aspects.`);
  assert.ok(Array.isArray(capabilities.counts) && capabilities.counts.length > 0, `${model.id} needs counts.`);
  assert.ok(capabilities.counts.every((count) => Number.isInteger(count) && count > 0), `${model.id} has invalid counts.`);

  for (const [field, capability] of Object.entries({
    aspect: "aspects",
    resolution: "resolutions",
    quality: "qualities",
  })) {
    if (model.defaults?.[field] !== undefined) {
      assert.ok(
        capabilities[capability]?.includes(model.defaults[field]),
        `${model.id} default ${field} is outside its capabilities.`,
      );
    }
  }
  if (model.defaults?.duration !== undefined) {
    const range = capabilities.durationRange;
    const seconds = Number.parseInt(model.defaults.duration, 10);
    assert.ok(range && Number.isInteger(range.min) && Number.isInteger(range.max), `${model.id} needs a duration range.`);
    assert.ok(range.min > 0 && range.max >= range.min, `${model.id} has an invalid duration range.`);
    assert.equal(range.step, 1, `${model.id} duration must support one-second steps.`);
    assert.ok(seconds >= range.min && seconds <= range.max, `${model.id} default duration is outside its range.`);
    assert.equal(seconds, range.min, `${model.id} default duration must start at the model minimum.`);
    assert.ok(
      Array.isArray(range.marks) && range.marks.every((mark) => mark >= range.min && mark <= range.max),
      `${model.id} has invalid duration marks.`,
    );
  }
}

assert.deepEqual([...modelTypes].sort(), ["image", "video"], "Catalog must include image and video models.");
const directoryIds = new Set();
const demoOrders = new Set();
for (const model of modelDirectory) {
  assert.match(model.id || "", /^[a-z0-9][a-z0-9-]*$/, `Invalid directory model id: ${model.id}`);
  assert.ok(!directoryIds.has(model.id), `Duplicate directory model id: ${model.id}`);
  directoryIds.add(model.id);
  assert.ok(model.name && model.provider, `Directory model ${model.id} needs a name and provider.`);
  assert.ok(Object.isFrozen(model.capabilities), `Directory capabilities must be frozen for ${model.id}.`);
  assert.ok(Array.isArray(model.demoUsage) && model.demoUsage.length > 0, `${model.id} needs demo usage templates.`);
  for (const template of model.demoUsage) {
    assert.ok(Number.isInteger(template.order) && template.order >= 0, `${model.id} has an invalid demo order.`);
    assert.ok(!demoOrders.has(template.order), `Duplicate demo usage order: ${template.order}`);
    demoOrders.add(template.order);
    assert.ok(template.baseCredits > 0 && template.weight > 0, `${model.id} has invalid demo usage costs.`);
    assert.ok(template.activityLabel && template.specification, `${model.id} has incomplete demo usage metadata.`);
  }
}
assert.ok(catalog.every((model) => directoryIds.has(model.id)), "Every canvas model must belong to the shared directory.");
assert.deepEqual(
  [...demoOrders].sort((left, right) => left - right),
  Array.from({ length: demoOrders.size }, (_, index) => index),
  "Demo usage templates must keep a contiguous deterministic order.",
);
assert.ok(config && typeof config === "object", "Prototype config was not defined.");
assert.ok(config.canvasScaleLimits.min > 0, "Minimum canvas scale must be positive.");
assert.ok(config.canvasScaleLimits.max > config.canvasScaleLimits.min, "Canvas scale limits are invalid.");

for (const model of catalog) {
  const capabilities = model.capabilities || {};
  const workflowIds = new Set((config.generationWorkflows[model.type] || []).map((workflow) => workflow.id));
  if (model.type === "video") {
    assert.ok(Array.isArray(capabilities.workflows) && capabilities.workflows.length > 0, `${model.id} needs workflows.`);
    assert.ok(capabilities.workflows.every((workflowId) => workflowIds.has(workflowId)), `${model.id} has unknown workflows.`);
    if (model.defaults?.workflow) {
      assert.ok(capabilities.workflows.includes(model.defaults.workflow), `${model.id} default workflow is unavailable.`);
    }
  } else {
    assert.ok(!capabilities.workflows?.length, `${model.id} must not expose video workflows.`);
  }
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
