(function registerCanvasGeneratorModelPolicy(root) {
  "use strict";

  const generatorModes = new Set(["image", "video"]);
  const defaultPromptPlaceholder = "描述你想生成的内容，或输入 @ 引用";

  function normalizeMode(value) {
    return generatorModes.has(value) ? value : null;
  }

  function getNodeModeContract(node) {
    if (!node || node.kind !== "generator") return null;
    return normalizeMode(node.mode);
  }

  function getCompatibleModels(catalog, node) {
    const mode = getNodeModeContract(node);
    if (!mode || !Array.isArray(catalog)) return [];
    return catalog.filter((model) => model?.type === mode);
  }

  function resolveModel(catalog, node) {
    const candidates = getCompatibleModels(catalog, node);
    return candidates.find((model) => model.id === node?.model) || candidates[0] || null;
  }

  function canUseModel(catalog, node, model) {
    const mode = getNodeModeContract(node);
    return Boolean(mode && model && model.type === mode && catalog?.includes(model));
  }

  function canUseEntityReferences(catalog, node) {
    const model = resolveModel(catalog, node);
    return Boolean(model?.type === "video" && model.brand === "seedance");
  }

  function getPromptPlaceholder(catalog, node) {
    const model = resolveModel(catalog, node);
    const capability = model?.capabilities?.omniReferenceTaskType;
    const taskType = capability?.values?.includes(node?.omniReferenceTaskType)
      ? node.omniReferenceTaskType
      : model?.defaults?.omniReferenceTaskType;
    const placeholder = capability?.promptPlaceholders?.[taskType];
    return typeof placeholder === "string" && placeholder.trim()
      ? placeholder
      : defaultPromptPlaceholder;
  }

  function normalizeModelState(catalog, node) {
    const mode = getNodeModeContract(node);
    if (!mode) return null;
    const model = resolveModel(catalog, node);
    node.mode = mode;
    node.model = model?.id || "";
    return model;
  }

  root.REELAY_CANVAS_GENERATOR_MODEL_POLICY = Object.freeze({
    canUseEntityReferences,
    canUseModel,
    getCompatibleModels,
    getNodeModeContract,
    getPromptPlaceholder,
    normalizeMode,
    normalizeModelState,
    resolveModel,
  });
}(typeof globalThis === "object" ? globalThis : window));
