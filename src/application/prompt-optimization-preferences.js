(function registerOptimizationPreferences(root) {
  "use strict";

  const storageKey = "reelay:prompt-optimization:preferences:v2";
  const legacyKey = "reelay:prompt-optimization:preferences:v1";
  const defaultId = "default";
  const maxPresets = 20;
  const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  const validId = (value) => typeof value === "string" && value.length > 0 && value.length <= 150 && !/[\u0000-\u001f]/.test(value);
  const normalizedName = (value) => typeof value === "string" ? value.trim() : "";
  const validText = (value) => typeof value === "string" && value.length <= 2000;
  const supportsModel = (model) => ["image", "video"].includes(model?.type)
    && typeof model.optimizationInstructions === "string" && Boolean(model.optimizationInstructions.trim());

  function createStore({ storage, models = [], makeId } = {}) {
    const catalog = new Map();
    for (const model of models) {
      if (!validId(model?.id) || !supportsModel(model) || catalog.has(model.id)) continue;
      catalog.set(model.id, { id: model.id, name: model.name || model.id,
        instructions: typeof model.optimizationInstructions === "string" ? model.optimizationInstructions.slice(0, 2000) : "" });
    }
    const records = new Map();
    const allocated = new Set([defaultId]);
    let sequence = 0, migrated = false, legacyInstructions = "";

    function modelFor(value) {
      const id = typeof value === "string" ? value : value?.id;
      const model = catalog.get(id);
      if (!model) throw new Error("当前模型暂不支持优化配置。");
      return model;
    }
    function empty() { return { selectedId: defaultId, presets: [], drafts: new Map() }; }
    function persist() {
      const saved = { version: 2, migrated, models: Object.fromEntries([...records].map(([id, record]) => [id, {
        selectedId: record.selectedId, presets: record.presets, drafts: Object.fromEntries(record.drafts),
      }])) };
      try { storage?.setItem(storageKey, JSON.stringify(saved)); } catch { /* Memory remains authoritative when storage is unavailable. */ }
    }
    try {
      const saved = JSON.parse(storage?.getItem(storageKey) || "null");
      if (saved?.version === 2 && object(saved.models)) {
        migrated = saved.migrated === true;
        for (const [id, input] of Object.entries(saved.models)) {
          if (!catalog.has(id) || !object(input)) continue;
          const record = empty();
          const names = new Set(["平台默认"]);
          // A previous full library may also contain a migrated default/v1 draft.
          for (const preset of Array.isArray(input.presets) ? input.presets.slice(0, maxPresets + 2) : []) {
            const name = normalizedName(preset?.name);
            if (!validId(preset?.id) || allocated.has(preset.id) || !name || name.length > 40
              || names.has(name.toLocaleLowerCase()) || !validText(preset.customInstructions) || !preset.customInstructions.trim()) continue;
            record.presets.push(Object.freeze({ id: preset.id, name, customInstructions: preset.customInstructions }));
            allocated.add(preset.id); names.add(name.toLocaleLowerCase());
          }
          const ids = new Set([defaultId, ...record.presets.map((preset) => preset.id)]);
          if (ids.has(input.selectedId)) record.selectedId = input.selectedId;
          for (const [draftId, draft] of Object.entries(object(input.drafts) ? input.drafts : {})) {
            if (ids.has(draftId) && validText(draft)) record.drafts.set(draftId, draft);
          }
          records.set(id, record);
        }
      }
    } catch { /* Malformed saved preferences do not prevent opening settings. */ }
    if (!migrated) {
      try {
        const legacy = JSON.parse(storage?.getItem(legacyKey) || "null");
        if (typeof legacy?.customInstructions === "string") legacyInstructions = legacy.customInstructions.slice(0, 2000);
      } catch { /* Ignore malformed legacy preferences. */ }
    }
    function recordFor(model) {
      if (!records.has(model.id)) records.set(model.id, empty());
      const record = records.get(model.id);
      let changed = false;
      if (record.drafts.has(defaultId)) {
        migrateDraft(model, record, record.drafts.get(defaultId));
        record.drafts.delete(defaultId);
        changed = true;
      }
      if (!migrated) {
        migrated = true;
        migrateDraft(model, record, legacyInstructions);
        changed = true;
      }
      if (changed) persist();
      return record;
    }
    function nextId() {
      let candidate;
      try { candidate = makeId?.(); } catch { /* A monotonic fallback still guarantees local uniqueness. */ }
      if (!validId(candidate) || allocated.has(candidate)) {
        do { candidate = `optimization-${++sequence}`; } while (allocated.has(candidate));
      }
      allocated.add(candidate);
      return candidate;
    }
    function migrateDraft(model, record, text) {
      if (!text?.trim() || text === model.instructions) return;
      let preset = record.presets.find((item) => item.customInstructions === text);
      if (!preset) {
        let name = "自定义草稿", index = 2;
        while (record.presets.some((item) => item.name === name)) name = `自定义草稿 ${index++}`;
        preset = Object.freeze({ id: nextId(), name, customInstructions: text });
        record.presets.push(preset);
      }
      if (record.selectedId === defaultId) record.selectedId = preset.id;
    }
    function baseText(model, record) {
      return record.selectedId === defaultId ? model.instructions
        : record.presets.find((preset) => preset.id === record.selectedId).customInstructions;
    }
    function textFor(model, record) {
      if (record.selectedId === defaultId) return model.instructions;
      return record.drafts.has(record.selectedId) ? record.drafts.get(record.selectedId) : baseText(model, record);
    }
    function stateFor(model, record) {
      const customInstructions = textFor(model, record);
      return Object.freeze({ modelId: model.id, modelName: model.name, selectedId: record.selectedId,
        options: Object.freeze([{ id: defaultId, name: "平台默认" }, ...record.presets.map(({ id, name, customInstructions: savedText }) => {
          const effectiveText = record.drafts.has(id) ? record.drafts.get(id) : savedText;
          return { id, name, customInstructions: effectiveText, isDraft: effectiveText !== savedText };
        })].map(Object.freeze)),
        customInstructions, isDraft: customInstructions !== baseText(model, record),
        canSave: Boolean(customInstructions.trim()) && record.presets.length < maxPresets,
        models: Object.freeze([...catalog.values()].map(({ id, name }) => Object.freeze({ id, name }))),
      });
    }
    function get(value) { const model = modelFor(value); return stateFor(model, recordFor(model)); }
    function select(value, id) {
      const model = modelFor(value), record = recordFor(model);
      if (id !== defaultId && !record.presets.some((preset) => preset.id === id)) throw new Error("该优化方案已不存在。");
      record.selectedId = id; persist(); return stateFor(model, record);
    }
    function validateName(record, nameValue, excludedId) {
      const name = normalizedName(nameValue);
      if (!name) throw new Error("请输入方案名称。");
      if (name.length > 40) throw new Error("方案名称最多 40 字。");
      if (name === "平台默认" || record.presets.some((preset) => preset.id !== excludedId && preset.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
        throw new Error("该模型已有同名方案，请换一个名称。");
      }
      return name;
    }
    function save(value, payload = {}) {
      const model = modelFor(value), target = modelFor(payload.modelId);
      const text = payload.customInstructions;
      if (!validText(text)) throw new Error("优化指令最多 2000 字。");
      if (!text.trim()) throw new Error("请先填写优化指令。");
      if (payload.id === defaultId) throw new Error("平台默认配置不可编辑，请新建自定义配置。");
      if (payload.id && target.id !== model.id) throw new Error("编辑配置时不能更改所属模型。");
      const record = recordFor(model);
      const destination = target.id === model.id ? record : recordFor(target);
      const index = payload.id ? record.presets.findIndex((preset) => preset.id === payload.id) : -1;
      if (payload.id && index < 0) throw new Error("该优化方案已不存在。");
      const name = validateName(destination, payload.name, payload.id);
      if (!payload.id && destination.presets.length >= maxPresets) throw new Error("每个模型最多保存 20 个优化方案。");
      const preset = Object.freeze({ id: payload.id || nextId(), name, customInstructions: text });
      if (payload.id) {
        record.presets[index] = preset;
        record.drafts.delete(preset.id);
      } else {
        destination.presets.push(preset);
        if (target.id === model.id) record.selectedId = preset.id;
      }
      persist(); return stateFor(model, record);
    }
    return Object.freeze({ get, select, save });
  }

  root.REELAY_PROMPT_OPTIMIZATION_PREFERENCES = Object.freeze({ createStore, supportsModel });
}(typeof globalThis === "object" ? globalThis : window));
