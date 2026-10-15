(function registerGenerationCreditEstimate(root) {
  "use strict";

  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const positive = (value) => typeof value === "number" && Number.isFinite(value) && value > 0;
  const pending = (reason) => empty("pending", reason);

  function empty(status, reason) {
    return { status, credits: null, minCredits: null, maxCredits: null, tokens: null, yuan: null, reasons: [reason] };
  }

  function seconds(value) {
    if (positive(value)) return value;
    if (typeof value !== "string" || !/^\d+(?:\.\d+)?s?$/i.test(value.trim())) return null;
    const parsed = Number(value.trim().replace(/s$/i, ""));
    return positive(parsed) ? parsed : null;
  }

  function validDimensions(value) {
    return value && Number.isSafeInteger(value.width) && value.width > 0
      && Number.isSafeInteger(value.height) && value.height > 0;
  }

  function getDuration(model, parameters, outputDuration) {
    const value = outputDuration ?? parameters.duration ?? model.defaults?.duration;
    if (value === "auto" || value === -1 || value === "-1") {
      const range = model.capabilities?.durationRange;
      if (!positive(range?.min) || !positive(range.max) || range.max < range.min) return null;
      return { min: range.min, max: range.max, automatic: true };
    }
    const duration = seconds(value);
    return duration === null ? null : { min: duration, max: duration, automatic: false };
  }

  function getDimensions(model, parameters, quality, outputDimensions) {
    if (outputDimensions !== undefined) return validDimensions(outputDimensions) ? [outputDimensions] : null;
    const aspect = parameters.aspect ?? model.defaults?.aspect;
    if (aspect !== "adaptive") {
      const dimension = quality.dimensions?.[aspect];
      return validDimensions(dimension) ? [dimension] : null;
    }
    const aspects = (model.capabilities?.aspects || Object.keys(quality.dimensions || {}))
      .filter((entry) => entry !== "adaptive");
    const dimensions = aspects.map((entry) => quality.dimensions?.[entry]);
    return dimensions.length && dimensions.every(validDimensions) ? dimensions : null;
  }

  function inheritedPixels(model, quality, reference) {
    const ratio = reference.width / reference.height;
    for (const [aspect, dimensions] of Object.entries(quality.dimensions || {})) {
      if (!validDimensions(dimensions)) continue;
      const [width, height] = aspect.split(":").map(Number);
      // Match a canonical aspect or a catalog-sized source, allowing only
      // one source pixel of rounding. Never snap an arbitrary frame to 16:9.
      const sourceRatios = Object.values(model.pricing.qualities)
        .map((entry) => entry.dimensions?.[aspect]).filter(validDimensions)
        .map((entry) => entry.width / entry.height);
      if (positive(width) && positive(height)) sourceRatios.push(width / height);
      if (sourceRatios.some((value) => Math.abs(reference.width - value * reference.height) <= 1
        && Math.abs(ratio / value - 1) <= 0.002)) {
        return { pixels: dimensions.width * dimensions.height, estimated: false };
      }
    }
    // Keep the inherited aspect; only the nominal pixel area is approximated.
    // We do not fabricate or persist a provider width/height for this case.
    return positive(quality.estimatedAdaptivePixelArea)
      ? { pixels: quality.estimatedAdaptivePixelArea, estimated: true } : null;
  }

  // Fractional output durations do not have a published minimum-token row.
  // Neighbouring rows bound the quote; they must never be interpolated as exact.
  function getMinimumSeconds(pricing, duration) {
    const table = pricing.minimumBillableSecondsByOutputSeconds;
    if (!table || typeof table !== "object") return null;
    const first = Math.floor(duration.min);
    const last = Math.ceil(duration.max);
    if (last - first > 10000) return null;
    const values = [];
    for (let second = first; second <= last; second += 1) {
      if (!own(table, second) || !positive(table[second])) return null;
      values.push(table[second]);
    }
    return { min: Math.min(...values), max: Math.max(...values), fractional: first !== duration.min || last !== duration.max };
  }

  /** Pure preflight quote. Pricing facts belong to the model catalog, not UI adapters. */
  function estimate({ model, parameters = {}, references = [], outputDuration, outputDimensions } = {}) {
    const pricing = model?.pricing;
    if (model?.type !== "video" || pricing?.kind !== "video-tokens") return empty("unsupported", "unsupported-model");
    if (!parameters || typeof parameters !== "object" || !Array.isArray(references)) return pending("invalid-input");
    if (!positive(pricing.framesPerSecond) || !positive(pricing.pixelsPerToken) || !positive(pricing.creditsPerYuan)) {
      return pending("missing-pricing");
    }
    const qualityKey = String(parameters.quality ?? model.defaults?.quality ?? "").toLowerCase();
    const quality = pricing.qualities?.[qualityKey];
    if (!quality) return pending("missing-quality-pricing");
    const count = parameters.count ?? 1;
    if (!Number.isSafeInteger(count) || count < 1) return pending("invalid-count");

    let referenceSeconds = 0;
    let hasVideo = false;
    const videos = [];
    for (const reference of references) {
      if (reference?.type !== "video") continue;
      hasVideo = true;
      const durationSeconds = seconds(reference.duration);
      if (durationSeconds === null) return pending("missing-reference-duration");
      referenceSeconds += durationSeconds;
      videos.push({ ...reference, duration: durationSeconds });
    }
    const rate = quality.yuanPerMillionTokens?.[hasVideo ? "withVideo" : "withoutVideo"];
    if (!positive(rate)) return pending("missing-unit-price");

    const taskType = parameters.omniReferenceTaskType ?? model.defaults?.omniReferenceTaskType;
    const constraint = model.capabilities?.omniReferenceTaskType?.constraints?.[taskType];
    const followsVideo = constraint?.referenceVideoRequired && constraint.aspect === "adaptive";
    const inheritedDuration = followsVideo && constraint.duration === -1 && outputDuration == null;
    const reasons = [];
    let specifications;
    if (followsVideo) {
      if (!videos.length) return pending("missing-target-video");
      if (videos.some((reference) => !validDimensions(reference))) return pending("missing-reference-dimensions");
      const duration = inheritedDuration ? null : getDuration(model, parameters, outputDuration);
      if (!inheritedDuration && !duration) return pending("missing-output-duration");
      if (duration?.automatic) reasons.push("automatic-output-duration");
      if (videos.length > 1) reasons.push("ambiguous-target-video");
      specifications = videos.map((reference) => {
        const dimensions = outputDimensions === undefined
          ? inheritedPixels(model, quality, reference)
          : validDimensions(outputDimensions) ? { pixels: outputDimensions.width * outputDimensions.height, estimated: false } : null;
        if (!dimensions) return null;
        if (dimensions.estimated && !reasons.includes("estimated-output-pixel-area")) reasons.push("estimated-output-pixel-area");
        return { pixels: dimensions.pixels, duration: duration || { min: reference.duration, max: reference.duration, automatic: false } };
      });
    } else {
      const dimensions = getDimensions(model, parameters, quality, outputDimensions);
      if (!dimensions) return pending("missing-output-dimensions");
      const duration = getDuration(model, parameters, outputDuration);
      if (!duration) return pending("missing-output-duration");
      if (duration.automatic) reasons.push("automatic-output-duration");
      if (outputDimensions === undefined && (parameters.aspect ?? model.defaults?.aspect) === "adaptive") reasons.push("adaptive-output-dimensions");
      specifications = dimensions.map(({ width, height }) => ({ pixels: width * height, duration }));
    }
    if (specifications.some((entry) => !entry)) return pending("missing-output-dimensions");

    const tokenBounds = specifications.map(({ pixels, duration }) => {
      const minimum = hasVideo ? getMinimumSeconds(pricing, duration) : null;
      if (hasVideo && !minimum) return null;
      const tokensPerSecond = pixels * pricing.framesPerSecond / pricing.pixelsPerToken;
      const rawMin = (referenceSeconds + duration.min) * tokensPerSecond;
      const rawMax = (referenceSeconds + duration.max) * tokensPerSecond;
      const bounds = {
        min: Math.max(rawMin, minimum ? Math.round(minimum.min * tokensPerSecond) : 0) * count,
        max: Math.max(rawMax, minimum ? Math.round(minimum.max * tokensPerSecond) : 0) * count,
      };
      if (minimum?.fractional && bounds.min !== bounds.max && !reasons.includes("fractional-output-minimum")) reasons.push("fractional-output-minimum");
      return bounds;
    });
    if (tokenBounds.some((entry) => !entry)) return pending("missing-minimum-token-rule");
    const tokens = { min: Math.min(...tokenBounds.map((value) => value.min)), max: Math.max(...tokenBounds.map((value) => value.max)) };
    const yuan = { min: tokens.min / 1000000 * rate, max: tokens.max / 1000000 * rate };
    // Provider display rounding is not a billing step. Only the final credit total rounds up.
    const minCredits = Math.ceil(yuan.min * pricing.creditsPerYuan);
    const maxCredits = Math.ceil(yuan.max * pricing.creditsPerYuan);
    if (![tokens.min, tokens.max, yuan.min, yuan.max].every(Number.isFinite)
      || !Number.isSafeInteger(minCredits) || !Number.isSafeInteger(maxCredits)) return pending("invalid-estimate");
    // 'exact' means a single preflight quote, never an actual usage settlement.
    const status = reasons.some((reason) => reason !== "estimated-output-pixel-area") ? "range" : "exact";
    return { status, credits: status === "exact" ? minCredits : null, minCredits, maxCredits, tokens, yuan, reasons };
  }

  root.REELAY_GENERATION_CREDIT_ESTIMATE = Object.freeze({ estimate });
})(typeof globalThis === "object" ? globalThis : window);
