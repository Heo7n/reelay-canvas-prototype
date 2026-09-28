import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";

const context = vm.createContext({});
vm.runInContext(readFileSync(new URL("../data/model-catalog.js", import.meta.url), "utf8"), context);
vm.runInContext(readFileSync(new URL("../src/application/draft-video-policy.js", import.meta.url), "utf8"), context);
const policy = context.REELAY_DRAFT_VIDEO;
const plain = (value) => JSON.parse(JSON.stringify(value));
const scope = { projectId: "project-1", canvasId: "canvas-1" };
const week = 604800000;

function draftInput() {
  return { modelId: "seedance-2-5-draft", modelName: "Seedance 2.5（样片模式）", mediaType: "video", cost: 15,
    prompt: "图片1 中的人物继续前行", parameterSummary: "480P · 样片 · 16:9 · 10s · MP4",
    promptDocument: { version: 1, content: [{ type: "reference", key: "asset:image-1", mediaType: "image", fallbackLabel: "图片1" }, { type: "text", text: " 中的人物继续前行" }] },
    references: [{ id: "image-1", type: "image", url: "/image.jpg" }],
    referenceSnapshot: [{ key: "asset:image-1", label: "图片1", mediaType: "image", ordinal: 1, asset: { id: "image-1", type: "image", url: "/image.jpg" } }],
    parameters: { model: "seedance-2-5-draft", quality: "480p", aspect: "16:9", duration: "10s", outputDuration: 10,
      outputFormat: "mp4", seed: 42, audioEnabled: true, count: 1, workflow: "omni-reference", omniReferenceTaskType: "extend",
      providerParameters: { ratio: "16:9", duration: 10, omni_reference_task_type: "extend", seed: 42, generate_audio: true, draft: true } } };
}

function draftAsset(input = draftInput()) {
  return { id: "video-1", type: "video", url: "/sample.mp4", width: 640, height: 360, duration: 8,
    generation: policy.createDraftProvenance({ input, taskId: "draft-1", resultId: "video-1", createdAt: 1000, scope }) };
}

test("only actual successful draft provenance qualifies; ordinary 480P and final media never do", () => {
  assert.equal(policy.getFinalEligibility({ id: "v", type: "video", url: "/480.mp4", quality: "480p" }, { projectId: scope.projectId, now: 1000 }).eligible, false);
  const asset = draftAsset();
  assert.equal(policy.getFinalEligibility(asset, { projectId: scope.projectId, now: 1000 }).eligible, true);
  assert.equal(policy.getFinalEligibility({ ...asset, type: "image" }, { projectId: scope.projectId, now: 1000 }).eligible, false);
  assert.throws(() => policy.createDraftProvenance({ input: { ...draftInput(), modelId: "seedance-2-5" }, taskId: "normal", resultId: "video-1", createdAt: 1000, scope }), /来源不完整/);
  const finalInput = policy.buildFinalInput(asset, { projectId: scope.projectId, now: 2000, cost: 40 });
  const generation = policy.createFinalProvenance({ input: finalInput, taskId: "final-1", resultId: "final-video-1", createdAt: 2000, scope });
  assert.equal(policy.getFinalEligibility({ ...asset, generation }, { projectId: scope.projectId, now: 3000 }).eligible, false);
});

test("conversion expires exactly seven days after draft submission and remains restricted to its project", () => {
  const asset = draftAsset();
  assert.equal(policy.getFinalEligibility(asset, { projectId: scope.projectId, now: 1000 + week - 1 }).eligible, true);
  assert.match(policy.getFinalEligibility(asset, { projectId: scope.projectId, now: 1000 + week }).reason, /过期/);
  assert.match(policy.getFinalEligibility(asset, { projectId: "other-project", now: 2000 }).reason, /所属项目/);
  assert.equal(policy.getFinalEligibility(asset, { now: 2000 }).eligible, false);
  assert.equal(policy.serializeProvenance({ ...asset.generation, expiresAt: 1000 + week + 1 }), null);
});

test("conversion freezes the original prompt, reference order, seed, audio and task parameters", () => {
  const input = draftInput();
  const asset = draftAsset(input);
  input.prompt = "a new editor draft";
  input.references[0].url = "/changed.jpg";
  input.parameters.aspect = "9:16";
  const final = policy.buildFinalInput(asset, { projectId: scope.projectId, now: 2000, outputFormat: "mov", cost: 44 });
  assert.equal(final.prompt, "图片1 中的人物继续前行");
  assert.equal(final.references[0].url, "/image.jpg");
  assert.equal(final.referenceSnapshot[0].asset.url, "/image.jpg");
  assert.deepEqual(plain(final.promptDocument), plain(asset.generation.input.promptDocument));
  for (const key of ["aspect", "duration", "seed", "audioEnabled", "omniReferenceTaskType", "outputDuration"]) {
    assert.equal(final.parameters[key], asset.generation.input.parameters[key]);
  }
  assert.equal(final.cost, 44);
  assert.equal(final.modelName, "Seedance 2.5");
  assert.equal(final.parameters.quality, "1080p");
  assert.equal(final.parameters.outputFormat, "mov");
  assert.equal(final.parameters.providerParameters.draft_task_id, "draft-1");
  assert.equal(final.parameters.providerParameters.duration, undefined);
  assert.equal(final.parameters.providerParameters.ratio, undefined);
  assert.equal(final.parameters.providerParameters.omni_reference_task_type, undefined);
  assert.equal(final.parameterSummary, "1080P · 成片 · 16:9 · 10s · MOV");
  assert.equal(final.sourceDraftTaskId, "draft-1");
  assert.equal(final.sourceResultId, "video-1");
  assert.ok(Object.isFrozen(final.parameters) && Object.isFrozen(final.references[0]));
  assert.throws(() => { final.parameters.seed = 2; }, TypeError);
});

test("media copies preserve original result identity and final provenance cannot grow recursive source chains", () => {
  const copiedAsset = { ...draftAsset(), id: "copy-asset" };
  const final = policy.buildFinalInput(copiedAsset, { projectId: scope.projectId, now: 2000, cost: 44 });
  assert.equal(final.sourceResultId, "video-1");
  assert.equal(final.sourceDraftAsset.generation.input.sourceDraftAsset, undefined);
  const generation = policy.createFinalProvenance({ input: final, taskId: "final-1", resultId: "final-video-1", createdAt: 2000, scope });
  assert.equal(generation.input.sourceDraftAsset, undefined);
  assert.equal(generation.sourceDraftTaskId, "draft-1");
  assert.equal(generation.sourceResultId, "video-1");
});

test("provenance strips executable state and sanitizes every retained media URL", () => {
  const input = draftInput();
  input.references[0].url = "javascript:alert(1)";
  input.references[0].posterUrl = "data:text/html,payload";
  input.references[0].generation = { cyclic: input };
  input.referenceSnapshot[0].asset.url = "blob:unsafe";
  input.referenceSnapshot[0].url = "//outside.example/video.mp4";
  input.parameters.referenceVideos = [{ url: "javascript:alert(2)", assetId: "video-ref", duration: 8 }];
  input.parameters.callback = () => {};
  input.sourceDraftAsset = input;
  const generation = draftAsset(input).generation;
  assert.equal(generation.input.references[0].url, "");
  assert.equal(generation.input.references[0].posterUrl, "");
  assert.equal(generation.input.references[0].generation, undefined);
  assert.equal(generation.input.referenceSnapshot[0].asset.url, "");
  assert.equal(generation.input.referenceSnapshot[0].url, "");
  assert.equal(generation.input.parameters.referenceVideos[0].url, "");
  assert.equal(generation.input.parameters.callback, undefined);
  assert.equal(generation.input.sourceDraftAsset, undefined);
  assert.doesNotThrow(() => JSON.stringify(generation));
});

test("invalid conversion requests are rejected before producing an input", () => {
  const asset = draftAsset();
  assert.throws(() => policy.buildFinalInput(asset, { projectId: scope.projectId, now: 2000, cost: NaN }), /费用/);
  assert.throws(() => policy.buildFinalInput(asset, { projectId: scope.projectId, now: 2000, cost: 44, outputFormat: "webm" }), /格式/);
  assert.throws(() => policy.buildFinalInput({ ...asset, url: "javascript:alert(1)" }, { projectId: scope.projectId, now: 2000, cost: 44 }), /仅成功/);
});

test("runtime snapshots retain local blob references until the persistence boundary sanitizes them", () => {
  const input = draftInput();
  input.references[0].url = "blob:http://localhost:5182/temporary-reference";
  input.referenceSnapshot[0].asset.url = input.references[0].url;
  const asset = draftAsset(input);
  const final = policy.buildFinalInput(asset, { projectId: scope.projectId, now: 2000, cost: 44 });
  assert.equal(final.references[0].url, input.references[0].url);
  assert.equal(final.referenceSnapshot[0].asset.url, input.references[0].url);
});
