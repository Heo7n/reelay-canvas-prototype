(function registerCanvasGeneratorModelPolicy(root) {
  "use strict";

  const generatorModes = new Set(["image", "video"]);

  function normalizeMode(value) {
    return generatorModes.has(value) ? value : null;
  }

  function getNodeModeContract(node) {
    if (!node || node.kind !== "generator") return null;
    return normalizeMode(node.lockedMode)
      || normalizeMode(node.generatedAsset?.type)
      || normalizeMode(node.mode);
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

  function normalizeModelState(catalog, node) {
    const mode = getNodeModeContract(node);
    if (!mode) return null;
    const model = resolveModel(catalog, node);
    node.mode = mode;
    if (normalizeMode(node.lockedMode)) node.lockedMode = mode;
    node.model = model?.id || "";
    return model;
  }

  root.REELAY_CANVAS_GENERATOR_MODEL_POLICY = Object.freeze({
    canUseModel,
    getCompatibleModels,
    getNodeModeContract,
    normalizeMode,
    normalizeModelState,
    resolveModel,
  });
}(typeof globalThis === "object" ? globalThis : window));
