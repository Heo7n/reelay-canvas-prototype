(function registerDraftVideoPolicy(root) {
  "use strict";

  const VALID_FOR_MS = 7 * 24 * 60 * 60 * 1000;
  const mediaTypes = new Set(["image", "video", "audio"]);
  const parameterStrings = ["mediaKind", "model", "aspect", "resolution", "quality", "outputFormat", "workflow", "omniReferenceTaskType"];

  function string(value, limit = 200) { return typeof value === "string" ? value.slice(0, limit) : ""; }
  function id(value) { return string(value).trim(); }
  function safeUrl(value) {
    const url = string(value, 2048).trim();
    if (/[\u0000-\u001f\u007f<>"'`]/.test(url)) return "";
    return /^(?:https?:\/\/|\/(?!\/)|\.\.?\/)/i.test(url)
      || /^blob:(?:https?:\/\/|null\/)[^\s]+$/i.test(url) ? url : "";
  }
  function modelFor(input) { return root.REELAY_MODEL_DIRECTORY?.find((model) => model.id === input?.modelId); }
  function freeze(value) {
    if (!value || typeof value !== "object") return value;
    Object.values(value).forEach(freeze);
    return Object.freeze(value);
  }

  // Persist only generation content. In particular, references never recursively
  // carry their own generation lineage, task state, callbacks or arbitrary URLs.
  function mediaSnapshot(value, sanitizeUrl = safeUrl) {
    if (!value || typeof value !== "object" || !mediaTypes.has(value.type) || !id(value.id)) return null;
    const result = { id: id(value.id), type: value.type };
    for (const key of ["name", "displayName", "source", "category", "librarySourceId"]) {
      if (typeof value[key] === "string") result[key] = string(value[key], 300);
    }
    for (const key of ["url", "thumbnailUrl", "posterUrl"]) {
      if (typeof value[key] === "string") result[key] = sanitizeUrl(value[key]);
    }
    for (const key of ["width", "height", "duration", "aspectRatio"]) {
      if (Number.isFinite(value[key]) && value[key] >= 0) result[key] = Math.min(value[key], 1_000_000);
    }
    return result;
  }

  function promptSnapshot(value) {
    if (!value || value.version !== 1 || !Array.isArray(value.content)) return undefined;
    return { version: 1, content: value.content.slice(0, 2048).flatMap((part) => {
      if (part?.type === "text" && typeof part.text === "string") return [{ type: "text", text: string(part.text, 20_000) }];
      if (part?.type !== "reference" || !mediaTypes.has(part.mediaType)
        || !/^(asset|connection):[^\u0000-\u001f\u007f]{1,200}$/.test(part.key)) return [];
      return [{ type: "reference", key: part.key, mediaType: part.mediaType, fallbackLabel: string(part.fallbackLabel, 80) }];
    }) };
  }

  function inputSnapshot(value, sanitizeUrl = safeUrl) {
    if (!value || typeof value !== "object" || value.mediaType !== "video" || !id(value.modelId)) return null;
    const result = { mediaType: "video", modelId: id(value.modelId), prompt: string(value.prompt, 20_000) };
    for (const key of ["modelName", "parameterSummary", "generationStage", "sourceDraftTaskId", "sourceResultId"]) {
      if (typeof value[key] === "string") result[key] = string(value[key], 500);
    }
    if (Number.isFinite(value.cost) && value.cost >= 0) result.cost = value.cost;
    const promptDocument = promptSnapshot(value.promptDocument);
    if (promptDocument) result.promptDocument = promptDocument;
    result.references = (Array.isArray(value.references) ? value.references : []).slice(0, 512)
      .map((asset) => mediaSnapshot(asset, sanitizeUrl)).filter(Boolean);
    result.referenceSnapshot = (Array.isArray(value.referenceSnapshot) ? value.referenceSnapshot : []).slice(0, 512).flatMap((entry) => {
      if (!entry || typeof entry !== "object" || !id(entry.key)) return [];
      const reference = { key: string(entry.key, 240) };
      for (const key of ["assetId", "sourceNodeId", "connectionId", "mediaType", "type", "label", "name"]) {
        if (typeof entry[key] === "string") reference[key] = string(entry[key], 300);
      }
      if (Number.isFinite(entry.ordinal)) reference.ordinal = entry.ordinal;
      for (const key of ["url", "thumbnailUrl", "posterUrl"]) {
        if (typeof entry[key] === "string") reference[key] = sanitizeUrl(entry[key]);
      }
      const asset = mediaSnapshot(entry.asset, sanitizeUrl);
      if (asset) reference.asset = asset;
      return [reference];
    });
    const source = value.parameters || {};
    const parameters = {};
    for (const key of parameterStrings) if (typeof source[key] === "string") parameters[key] = string(source[key], 200);
    for (const key of ["duration", "seed"]) {
      if (Number.isFinite(source[key]) || typeof source[key] === "string") parameters[key] = typeof source[key] === "string" ? string(source[key], 80) : source[key];
    }
    for (const key of ["outputDuration", "count"]) if (Number.isFinite(source[key])) parameters[key] = source[key];
    for (const key of ["audioEnabled", "assetValidationEnabled"]) if (typeof source[key] === "boolean") parameters[key] = source[key];
    for (const key of ["assetIds", "referenceOrder"]) {
      if (Array.isArray(source[key])) parameters[key] = source[key].slice(0, 512).filter((entry) => typeof entry === "string").map((entry) => string(entry, 240));
    }
    if (Array.isArray(source.referenceVideos)) {
      parameters.referenceVideos = source.referenceVideos.slice(0, 512).filter((entry) => entry && typeof entry === "object").map((entry) => ({
        assetId: id(entry.assetId), sourceNodeId: id(entry.sourceNodeId), url: sanitizeUrl(entry.url),
        ...(Number.isFinite(entry.duration) ? { duration: entry.duration } : {}),
      }));
    }
    if (source.providerParameters && typeof source.providerParameters === "object") {
      const provider = {};
      for (const key of ["omni_reference_task_type", "ratio", "duration", "resolution", "seed", "generate_audio", "draft", "draft_task_id"]) {
        const candidate = source.providerParameters[key];
        if (["string", "boolean"].includes(typeof candidate) || Number.isFinite(candidate)) provider[key] = typeof candidate === "string" ? string(candidate, 200) : candidate;
      }
      parameters.providerParameters = provider;
    }
    result.parameters = parameters;
    return result;
  }

  function isDraftInput(input) {
    const model = modelFor(input);
    return input?.mediaType === "video" && input.generationStage !== "final" && model?.executionMode === "draft"
      && Boolean(model.baseModelId && model.providerModelId && model.capabilities?.draftConversion);
  }

  function serializeProvenance(value, { sanitizeUrl = safeUrl } = {}) {
    if (!value || value.version !== 1 || value.simulated !== true || !["draft", "final"].includes(value.stage)
      || !id(value.taskId) || !id(value.resultId) || !id(value.projectId) || !id(value.canvasId)
      || !Number.isFinite(value.createdAt) || value.createdAt < 0) return null;
    const input = inputSnapshot(value.input, sanitizeUrl);
    if (!input) return null;
    const result = { version: 1, stage: value.stage, simulated: true, taskId: id(value.taskId), resultId: id(value.resultId),
      createdAt: value.createdAt, projectId: id(value.projectId), canvasId: id(value.canvasId), input };
    if (value.stage === "draft") {
      if (!isDraftInput(input) || input.parameters.quality !== "480p"
        || value.expiresAt !== value.createdAt + VALID_FOR_MS) return null;
      result.expiresAt = value.expiresAt;
    } else {
      if (input.generationStage !== "final" || input.parameters.quality !== "1080p"
        || !id(value.sourceDraftTaskId) || !id(value.sourceResultId)) return null;
      result.sourceDraftTaskId = id(value.sourceDraftTaskId);
      result.sourceResultId = id(value.sourceResultId);
    }
    return result;
  }

  function createDraftProvenance({ input, taskId, createdAt, scope, resultId } = {}) {
    const validForMs = modelFor(input)?.capabilities?.draftConversion?.validForMs;
    const result = serializeProvenance({ version: 1, stage: "draft", simulated: true, input, taskId, resultId, createdAt,
      expiresAt: createdAt + validForMs, projectId: scope?.projectId, canvasId: scope?.canvasId });
    if (!result) throw new TypeError("样片来源不完整，无法记录生成结果。");
    return freeze(result);
  }

  function getFinalEligibility(asset, { projectId, now = Date.now() } = {}) {
    const generation = serializeProvenance(asset?.generation);
    if (asset?.type !== "video" || !safeUrl(asset.url) || generation?.stage !== "draft") {
      return { eligible: false, reason: "仅成功生成的 Seedance 2.5 样片可生成成片。", expiresAt: null };
    }
    if (!id(projectId) || generation.projectId !== projectId) {
      return { eligible: false, reason: "请在样片所属项目内生成成片。", expiresAt: generation.expiresAt };
    }
    if (!Number.isFinite(now) || now >= generation.expiresAt) {
      return { eligible: false, reason: "样片已过期，请重新生成样片。", expiresAt: generation.expiresAt };
    }
    return { eligible: true, reason: "", expiresAt: generation.expiresAt };
  }

  function buildFinalInput(asset, { projectId, now = Date.now(), outputFormat = "mp4", cost } = {}) {
    const eligibility = getFinalEligibility(asset, { projectId, now });
    if (!eligibility.eligible) throw new TypeError(eligibility.reason);
    if (!["mp4", "mov"].includes(outputFormat)) throw new TypeError("成片输出格式仅支持 MP4 或 MOV。");
    if (!Number.isFinite(cost) || cost < 0) throw new TypeError("成片费用必须为有效积分。");
    const generation = serializeProvenance(asset.generation);
    const original = generation.input;
    const model = modelFor(original);
    const baseModel = root.REELAY_MODEL_DIRECTORY.find((entry) => entry.id === model.baseModelId);
    const quality = model.capabilities.draftConversion.quality;
    const parameters = { ...original.parameters, model: model.baseModelId, quality, outputFormat,
      // The provider reuses all original content through the draft task. Keep
      // the original parameters for display; never resend them as overrides.
      providerParameters: { draft: false, resolution: quality, draft_task_id: generation.taskId } };
    const parameterSummary = string(original.parameterSummary, 500).replace(/480p/ig, quality.toUpperCase())
      .replace(/样片(?:模式)?/g, "成片").replace(/\b(?:mp4|mov)\b/ig, outputFormat.toUpperCase());
    return freeze({ ...original, modelId: model.baseModelId, modelName: `${baseModel?.name || original.modelName}（成片）`, parameters, cost,
      parameterSummary,
      generationStage: "final", sourceDraftTaskId: generation.taskId, sourceResultId: generation.resultId,
      sourceDraftAsset: { ...mediaSnapshot(asset), generation } });
  }

  function createFinalProvenance({ input, taskId, createdAt, scope, resultId } = {}) {
    const result = serializeProvenance({ version: 1, stage: "final", simulated: true, input, taskId, resultId, createdAt,
      projectId: scope?.projectId, canvasId: scope?.canvasId,
      sourceDraftTaskId: input?.sourceDraftTaskId, sourceResultId: input?.sourceResultId });
    if (!result) throw new TypeError("成片来源不完整，无法记录生成结果。");
    return freeze(result);
  }

  root.REELAY_DRAFT_VIDEO = Object.freeze({ isDraftInput, createDraftProvenance, createFinalProvenance,
    getFinalEligibility, buildFinalInput, serializeProvenance });
})(typeof window === "undefined" ? globalThis : window);
