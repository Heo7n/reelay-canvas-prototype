import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const context = vm.createContext({});
vm.runInContext(await readFile(new URL("../src/application/generation-credit-estimate.js", import.meta.url), "utf8"), context);
vm.runInContext(await readFile(new URL("../data/model-catalog.js", import.meta.url), "utf8"), context);
const { estimate } = context.REELAY_GENERATION_CREDIT_ESTIMATE;
const plain = (value) => JSON.parse(JSON.stringify(value));

function model() {
  // Independent fixture prices exercise arithmetic; actual catalog prices are maintained separately.
  const dimensions = {
    "16:9": { width: 864, height: 480 }, "9:16": { width: 480, height: 864 },
    "4:3": { width: 736, height: 552 }, "3:4": { width: 552, height: 736 },
    "1:1": { width: 640, height: 640 }, "21:9": { width: 960, height: 416 },
  };
  return {
    id: "priced-video", type: "video",
    defaults: { quality: "480p", aspect: "16:9", duration: "10s" },
    capabilities: { aspects: ["adaptive", ...Object.keys(dimensions)], durationRange: { min: 4, max: 30 } },
    pricing: {
      kind: "video-tokens", framesPerSecond: 24, pixelsPerToken: 1024, creditsPerYuan: 16.5,
      qualities: { "480p": { dimensions, yuanPerMillionTokens: { withoutVideo: 46, withVideo: 25 } } },
      minimumBillableSecondsByOutputSeconds: {
        4: 7, 5: 9, 6: 10, 7: 12, 8: 14, 9: 15, 10: 17, 11: 19, 12: 20,
        13: 22, 14: 24, 15: 25, 16: 27, 17: 29, 18: 30, 19: 32, 20: 34,
        21: 35, 22: 37, 23: 39, 24: 40, 25: 42, 26: 44, 27: 45, 28: 47, 29: 49, 30: 50,
      },
    },
  };
}

test("fixed duration and dimensions quote actual output tokens without display-price rounding", () => {
  const quote = estimate({ model: model() });
  assert.equal(quote.status, "exact");
  assert.equal(quote.credits, 74);
  assert.deepEqual(plain(quote.tokens), { min: 97200, max: 97200 });
  assert.equal(quote.yuan.min, 4.4712);
  assert.equal(quote.minCredits, quote.maxCredits);
  assert.deepEqual(plain(quote.reasons), []);
});

test("image and audio references do not add duration or select the video-input price", () => {
  const quote = estimate({ model: model(), references: [
    { type: "image", duration: 100 }, { type: "audio", duration: 30 }, { type: "audio" },
  ] });
  assert.equal(quote.status, "exact");
  assert.equal(quote.credits, 74);
  assert.equal(quote.tokens.min, 97200);
});

test("video input uses the duration-specific minimum, not a global token floor", () => {
  const quote = estimate({ model: model(), references: [{ type: "video", duration: 2.25 }] });
  assert.equal(quote.status, "exact");
  assert.equal(quote.tokens.min, 165240);
  assert.equal(quote.credits, 69);
  const shorter = estimate({ model: model(), parameters: { duration: "4s" }, references: [{ type: "video", duration: 2.25 }] });
  assert.equal(shorter.tokens.min, 68040);
});

test("long input videos sum fractional durations and exceed the minimum naturally", () => {
  const quote = estimate({ model: model(), references: [{ type: "video", duration: 10.1 }, { type: "video", duration: 10.15 }] });
  assert.equal(quote.tokens.min, 294030);
  assert.equal(quote.credits, 122);
});

test("minimum table integer rounding preserves a published 720p fractional-token case", () => {
  const item = model();
  item.pricing.qualities["720p"] = {
    dimensions: { "4:3": { width: 1112, height: 834 } },
    yuanPerMillionTokens: { withoutVideo: 46, withVideo: 25 },
  };
  // The published table uses 195625, while rounding 195625.125 up would add a token.
  const quote = estimate({ model: item, parameters: { quality: "720p", aspect: "4:3", duration: "5s" }, references: [{ type: "video", duration: 2 }] });
  assert.equal(quote.tokens.min, 195625);
});

test("count applies the minimum to each output and rounds the combined credit total once", () => {
  const quote = estimate({ model: model(), parameters: { count: 2 } });
  assert.equal(quote.tokens.min, 194400);
  assert.equal(quote.credits, 148);
  const withVideo = estimate({ model: model(), parameters: { count: 2 }, references: [{ type: "video", duration: 2.25 }] });
  assert.equal(withVideo.tokens.min, 330480);
  assert.equal(withVideo.credits, 137);
  assert.notEqual(withVideo.credits, 69 * 2);
});

test("Auto duration exposes capability bounds instead of a fabricated default quote", () => {
  const quote = estimate({ model: model(), parameters: { duration: "auto" } });
  assert.equal(quote.status, "range");
  assert.equal(quote.credits, null);
  assert.deepEqual(plain(quote.tokens), { min: 38880, max: 291600 });
  assert.deepEqual([quote.minCredits, quote.maxCredits], [30, 222]);
  assert.ok(quote.reasons.includes("automatic-output-duration"));
  const withVideo = estimate({ model: model(), parameters: { duration: -1 }, references: [{ type: "video", duration: 2.25 }] });
  assert.deepEqual(plain(withVideo.tokens), { min: 68040, max: 486000 });
});

test("adaptive uses all supported dimensions and remains a range even when rounded credits coincide", () => {
  const item = model();
  const quote = estimate({ model: item, parameters: { aspect: "adaptive" } });
  assert.equal(quote.status, "range");
  assert.equal(quote.tokens.min, 93600);
  assert.equal(quote.tokens.max, 97200);
  assert.ok(quote.reasons.includes("adaptive-output-dimensions"));
  for (const value of Object.values(item.pricing.qualities["480p"].dimensions)) Object.assign(value, { width: 864, height: 480 });
  const equalBounds = estimate({ model: item, parameters: { aspect: "adaptive" } });
  assert.equal(equalBounds.minCredits, equalBounds.maxCredits);
  assert.equal(equalBounds.status, "range");
});

test("fractional output with video bounds the adjacent published minimum rows", () => {
  const quote = estimate({ model: model(), outputDuration: 4.5, references: [{ type: "video", duration: 2.25 }] });
  assert.equal(quote.status, "range");
  assert.deepEqual(plain(quote.tokens), { min: 68040, max: 87480 });
  assert.deepEqual([quote.minCredits, quote.maxCredits], [29, 37]);
  assert.ok(quote.reasons.includes("fractional-output-minimum"));
  const noVideo = estimate({ model: model(), outputDuration: 4.5 });
  assert.equal(noVideo.status, "exact");
  assert.equal(noVideo.credits, 34);
});

test("known output metadata resolves Auto and adaptive without rewriting chosen parameters", () => {
  const parameters = { duration: "auto", aspect: "adaptive" };
  const quote = estimate({ model: model(), parameters, outputDuration: 10, outputDimensions: { width: 864, height: 480 } });
  assert.equal(quote.status, "exact");
  assert.equal(quote.credits, 74);
  assert.deepEqual(parameters, { duration: "auto", aspect: "adaptive" });
});

test("every video duration must be loaded before quoting", () => {
  for (const duration of [undefined, null, NaN, Infinity, 0, -1, "unknown", "7.5bad"]) {
    const quote = estimate({ model: model(), references: [{ type: "video", duration: 3 }, { type: "video", duration }] });
    assert.equal(quote.status, "pending", String(duration));
    assert.equal(quote.credits, null);
    assert.equal(quote.minCredits, null);
    assert.deepEqual(plain(quote.reasons), ["missing-reference-duration"]);
  }
});

function seedanceTask(taskType, overrides = {}) {
  const item = context.REELAY_MODEL_CATALOG.find((entry) => entry.id === "seedance-2-5");
  return { model: item, parameters: { quality: "720p", aspect: "adaptive", duration: "10s", omniReferenceTaskType: taskType, ...overrides } };
}

test("video editing inherits one target's portrait frame and fractional duration as a single quote", () => {
  const input = seedanceTask("edit", { duration: "auto" });
  const quote = estimate({ ...input, references: [{ type: "video", duration: 7.5, width: 720, height: 1280 }] });
  assert.equal(quote.status, "exact");
  assert.equal(quote.credits, 225);
  assert.deepEqual(plain(quote.tokens), { min: 324000, max: 324000 });
  assert.deepEqual(plain(quote.reasons), []);
  assert.equal(input.parameters.duration, "auto");
  assert.equal(input.parameters.aspect, "adaptive");
});

test("specified extension inherits the frame but smart extension keeps an unknown duration range", () => {
  const references = [{ type: "video", duration: 12, width: 1280, height: 720 }];
  const fixed = estimate({ ...seedanceTask("extend"), references });
  assert.equal(fixed.status, "exact");
  assert.equal(fixed.credits, 330);
  const automatic = estimate({ ...seedanceTask("extend", { duration: "auto" }), references });
  assert.equal(automatic.status, "range");
  assert.ok(automatic.minCredits < automatic.maxCredits);
  assert.deepEqual(plain(automatic.reasons), ["automatic-output-duration"]);
});

test("multiple edit targets preserve paired output specs and bill all input video seconds", () => {
  const references = [{ id: "short", type: "video", duration: 5, width: 1280, height: 720 },
    { id: "long", type: "video", duration: 20, width: 1280, height: 720 }];
  const quote = estimate({ ...seedanceTask("edit"), references });
  assert.equal(quote.status, "range");
  assert.deepEqual([quote.minCredits, quote.maxCredits], [450, 674]);
  assert.deepEqual(plain(quote.reasons), ["ambiguous-target-video"]);
  assert.deepEqual(plain(estimate({ ...seedanceTask("edit"), references: [...references].reverse() })), plain(quote));
});

test("inherited nonstandard frames use a disclosed nominal-area estimate, not fabricated dimensions", () => {
  for (const [width, height] of [[1200, 960], [1400, 1000]]) {
    const quote = estimate({ ...seedanceTask("edit"), references: [{ type: "video", duration: 7.5, width, height }] });
    assert.equal(quote.status, "exact");
    assert.equal(quote.credits, 225);
    assert.deepEqual(plain(quote.reasons), ["estimated-output-pixel-area"]);
  }
});

test("inherited output frames wait for video metadata and cannot quote a missing target", () => {
  const input = seedanceTask("edit");
  assert.deepEqual(plain(estimate(input).reasons), ["missing-target-video"]);
  assert.deepEqual(plain(estimate({ ...input, references: [{ type: "video", duration: 5 }] }).reasons), ["missing-reference-dimensions"]);
  assert.deepEqual(plain(estimate({ ...input, references: [{ type: "video", width: 1280, height: 720 }] }).reasons), ["missing-reference-duration"]);
});

test("missing minimum rules block video quotes but do not block text or image quotes", () => {
  const item = model();
  delete item.pricing.minimumBillableSecondsByOutputSeconds;
  assert.equal(estimate({ model: item }).status, "exact");
  const quote = estimate({ model: item, references: [{ type: "video", duration: 3 }] });
  assert.equal(quote.status, "pending");
  assert.ok(quote.reasons.includes("missing-minimum-token-rule"));
});

test("a missing row inside an automatic duration range cannot yield a complete range", () => {
  const item = model();
  delete item.pricing.minimumBillableSecondsByOutputSeconds[11];
  assert.equal(estimate({ model: item, parameters: { duration: "auto" }, references: [{ type: "video", duration: 3 }] }).status, "pending");
});

test("adaptive cannot silently omit an unsupported dimension from its bounds", () => {
  const item = model();
  delete item.pricing.qualities["480p"].dimensions["21:9"];
  assert.equal(estimate({ model: item, parameters: { aspect: "adaptive" } }).status, "pending");
  assert.equal(estimate({ model: item }).status, "exact");
});

test("invalid parameters and incomplete pricing are pending, never a free or legacy fallback quote", () => {
  for (const parameters of [{ quality: "4k" }, { aspect: "missing" }, { duration: "unknown" }, { count: 0 }, { count: 1.5 }, { count: Infinity }]) {
    const quote = estimate({ model: model(), parameters });
    assert.equal(quote.status, "pending");
    assert.equal(quote.credits, null);
  }
  const item = model();
  item.pricing.qualities["480p"].yuanPerMillionTokens.withoutVideo = 0;
  assert.equal(estimate({ model: item }).status, "pending");
  item.pricing.creditsPerYuan = NaN;
  assert.equal(estimate({ model: item }).status, "pending");
});

test("unpriced models explicitly delegate to their existing pricing paths", () => {
  for (const item of [undefined, { id: "image", type: "image" }, { id: "other-video", type: "video" }]) {
    assert.equal(estimate({ model: item }).status, "unsupported");
  }
});

test("estimation never mutates model configuration, parameters or reference metadata", () => {
  const input = { model: model(), parameters: { aspect: "adaptive", duration: "auto", count: 2 }, references: [{ type: "video", duration: 2.25 }] };
  const before = JSON.stringify(input);
  estimate(input);
  assert.equal(JSON.stringify(input), before);
});

test("real catalog distinguishes model rates, input rates and differing 480p output dimensions", () => {
  const cases = [
    ["seedance-2-5", "480p", false, 38430, 45], ["seedance-2-5", "480p", true, 67253, 47],
    ["seedance-2-5", "720p", false, 86400, 100], ["seedance-2-5", "720p", true, 151200, 105],
    ["seedance-2", "480p", false, 40176, 31], ["seedance-2", "480p", true, 70308, 33],
    ["seedance-2", "720p", false, 86400, 66], ["seedance-2", "720p", true, 151200, 70],
    ["seedance-2-fast", "480p", false, 40176, 25], ["seedance-2-fast", "480p", true, 70308, 26],
    ["seedance-2-fast", "720p", false, 86400, 53], ["seedance-2-fast", "720p", true, 151200, 55],
  ];
  for (const [id, quality, hasVideo, tokens, credits] of cases) {
    const item = context.REELAY_MODEL_CATALOG.find((entry) => entry.id === id);
    const quote = estimate({ model: item, parameters: { quality, aspect: "16:9", duration: "4s" },
      references: hasVideo ? [{ type: "video", duration: 2.25 }] : [] });
    const label = `${id}/${quality}/${hasVideo ? "with-video" : "without-video"}`;
    assert.equal(quote.status, "exact", label);
    assert.equal(quote.tokens.min, tokens, label);
    assert.equal(quote.credits, credits, label);
  }
});

test("draft uses the same token policy as its base model, while missing quality stays pending", () => {
  const base = context.REELAY_MODEL_CATALOG.find((entry) => entry.id === "seedance-2-5");
  const draft = context.REELAY_MODEL_CATALOG.find((entry) => entry.id === "seedance-2-5-draft");
  const input = { parameters: { quality: "480p", aspect: "4:3", duration: "10s" }, references: [{ type: "video", duration: 4.5 }] };
  assert.deepEqual(plain(estimate({ ...input, model: draft })), plain(estimate({ ...input, model: base })));
  assert.equal(estimate({ model: base, parameters: { quality: "4k" } }).status, "pending");
});
