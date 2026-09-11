import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const context = vm.createContext({});
vm.runInContext(await readFile(new URL("../src/application/prompt-optimization-preferences.js", import.meta.url), "utf8"), context);
const createStore = context.REELAY_PROMPT_OPTIMIZATION_PREFERENCES.createStore;
const plain = (value) => JSON.parse(JSON.stringify(value));
const models = [{ id: "image", name: "图片模型", type: "image", optimizationInstructions: "整理图片描述。" },
  { id: "video", name: "视频模型", type: "video", optimizationInstructions: "整理视频动作。" }];
const key = "reelay:prompt-optimization:preferences:v2";
const oldKey = "reelay:prompt-optimization:preferences:v1";
function storage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (name) => data.get(name), setItem: (name, value) => data.set(name, value), data };
}
const payload = (name = "方案 A", customInstructions = "自定义指令", modelId = "image") => ({ name, customInstructions, modelId });
const stored = (state) => storage({ [key]: JSON.stringify({ version: 2, migrated: true, models: state }) });

test("configuration is model-scoped and default option never exposes internal text", () => {
  const store = createStore({ models });
  assert.deepEqual(plain(store.get("image").options), [{ id: "default", name: "平台默认" }]);
  const saved = store.save(models[0], payload());
  assert.equal(saved.isDraft, false);
  assert.notEqual(saved.selectedId, "default");
  assert.equal(store.get({ ...models[0], mode: "edit" }).selectedId, saved.selectedId);
  assert.equal(store.get({ ...models[0], mode: "extend" }).customInstructions, "自定义指令");
  assert.equal(store.get("video").customInstructions, "整理视频动作。");
  assert.equal(store.select("image", "default").customInstructions, "整理图片描述。");
  assert.deepEqual(Object.keys(store).sort(), ["get", "save", "select"]);
});

test("save edits the same ID, excludes its own name from duplicate checks and persists revisions", () => {
  const local = storage(), store = createStore({ models, storage: local });
  const saved = store.save("image", payload());
  const edited = store.save("image", { ...payload("方案 A", "修订内容"), id: saved.selectedId });
  assert.equal(edited.selectedId, saved.selectedId);
  assert.equal(edited.options.length, 2);
  assert.equal(edited.customInstructions, "修订内容");
  assert.deepEqual(plain(createStore({ models, storage: local }).get("image")), plain(edited));
  assert.throws(() => { edited.options[1].name = "changed"; }, TypeError);
});

test("v1 migration creates one named configuration and selecting default restores actual catalog instructions", () => {
  const local = storage({ [oldKey]: JSON.stringify({ customInstructions: "旧指令", focus: "visual", detail: "detailed" }) });
  const store = createStore({ models, storage: local });
  const migrated = store.get("video");
  assert.equal(migrated.customInstructions, "旧指令");
  assert.equal(migrated.options[1].name, "自定义草稿");
  assert.equal(migrated.selectedId, migrated.options[1].id);
  assert.equal(store.get("image").customInstructions, "整理图片描述。");
  assert.equal(store.select("video", "default").customInstructions, "整理视频动作。");
  const reloaded = createStore({ models, storage: local });
  assert.equal(reloaded.get("video").selectedId, "default");
  assert.equal(reloaded.get("video").options.length, 2);
});

test("old default drafts become named configurations and nonselected presets expose editable effective drafts", () => {
  const local = stored({ image: { selectedId: "a", presets: [
    { id: "a", name: "A", customInstructions: "保存 A" }, { id: "b", name: "B", customInstructions: "保存 B" }],
  drafts: { default: "默认草稿", a: "草稿 A", b: "草稿 B" } } });
  const store = createStore({ models, storage: local }), state = store.get("image");
  assert.equal(state.selectedId, "a");
  assert.equal(state.customInstructions, "草稿 A");
  assert.equal(state.options.find((item) => item.name === "自定义草稿").customInstructions, "默认草稿");
  assert.equal(state.options.find((item) => item.id === "b").customInstructions, "草稿 B");
  assert.equal(state.options.find((item) => item.id === "b").isDraft, true);
  store.save("image", { ...payload("B", "修订 B"), id: "b" });
  assert.equal(store.get("image").selectedId, "a");
  assert.equal(store.get("image").customInstructions, "草稿 A");
  assert.equal(store.select("image", "b").customInstructions, "修订 B");
  assert.equal(store.get("image").isDraft, false);
  assert.equal(store.select("image", "default").customInstructions, "整理图片描述。");
  assert.equal(createStore({ models, storage: local }).get("image").options.length, 4);
});

test("cross-model creation preserves both active selections and existing drafts with independent IDs", () => {
  const local = stored({ video: { selectedId: "target", presets: [{ id: "target", name: "目标已有", customInstructions: "已保存" }], drafts: { target: "目标草稿" } } });
  const store = createStore({ models, storage: local, makeId: () => "fixed-id" });
  const original = store.save("image", payload("源配置", "源内容"));
  const state = store.save("image", payload("目标新配置", "独立内容", "video"));
  assert.equal(state.selectedId, original.selectedId);
  assert.equal(state.customInstructions, "源内容");
  assert.equal(store.get("video").selectedId, "target");
  assert.equal(store.get("video").customInstructions, "目标草稿");
  const created = store.get("video").options.find((item) => item.name === "目标新配置");
  assert.notEqual(created.id, original.selectedId);
  store.save("video", { ...payload("目标新配置", "独立修改", "video"), id: created.id });
  assert.equal(store.get("image").customInstructions, "源内容");
});

test("invalid atomic saves do not mutate storage or move/default-edit an existing preset", () => {
  const local = storage(), store = createStore({ models, storage: local });
  const first = store.save("image", payload("A"));
  store.save("image", payload("B")); store.get("video");
  const before = local.getItem(key);
  for (const invalid of [payload(""), payload("x".repeat(41)), payload("平台默认"), payload("a"),
    payload("C", " "), payload("C", "x".repeat(2001)), payload("C", "内容", "absent"),
    { ...payload("C"), id: "default" }, { ...payload("C", "内容", "video"), id: first.selectedId },
    { ...payload("C"), id: "absent" }]) {
    assert.throws(() => store.save("image", invalid));
    assert.equal(local.getItem(key), before);
  }
  assert.throws(() => store.select("image", "absent"), /不存在/);
});

test("a full previous library preserves its default draft through migration and still permits edits", () => {
  const presets = Array.from({ length: 20 }, (_, index) => ({ id: "p" + index, name: "方案" + index, customInstructions: "内容" + index }));
  const local = stored({ image: { selectedId: "default", presets, drafts: { default: "仍需保留的草稿" } } });
  const store = createStore({ models, storage: local }), state = store.get("image");
  assert.equal(state.options.length, 22);
  assert.equal(state.customInstructions, "仍需保留的草稿");
  assert.equal(state.canSave, false);
  assert.throws(() => store.save("image", payload("超过上限")), /20/);
  assert.equal(createStore({ models, storage: local }).get("image").options.length, 22);
  store.save("image", { ...payload("修订草稿", "合法修改"), id: state.selectedId });
  assert.equal(store.get("image").customInstructions, "合法修改");
});

test("storage failures fall back to memory and malformed duplicate IDs are ignored", () => {
  const store = createStore({ models, storage: { getItem() { throw Error("denied"); }, setItem() { throw Error("full"); } } });
  assert.equal(store.save("image", payload()).customInstructions, "自定义指令");
  assert.equal(createStore({ models, storage: storage({ [key]: "{bad" }) }).get("image").selectedId, "default");
  const local = stored({ image: { presets: [{ id: "a", name: "正常", customInstructions: "指令" },
    { id: "a", name: "重复ID", customInstructions: "忽略" }], drafts: { absent: "忽略" } },
  video: { presets: [{ id: "a", name: "跨模型重复", customInstructions: "忽略" }] } });
  const loaded = createStore({ models, storage: local });
  assert.equal(loaded.get("image").options.length, 2);
  assert.equal(loaded.get("video").options.length, 1);
});

test("removed model objects cannot opt themselves into optimization", () => {
  const store = createStore({ models }), removed = { id: "old-video", name: "旧模型", type: "video" };
  assert.throws(() => store.get(removed), /模型/);
  assert.throws(() => store.save(removed, payload("旧配置", "内容", "old-video")), /模型/);
});

test("actual catalog defaults exist without triggering preservation-only simulation", async () => {
  const catalogContext = vm.createContext({});
  vm.runInContext(await readFile(new URL("../data/model-catalog.js", import.meta.url), "utf8"), catalogContext);
  const catalog = catalogContext.REELAY_MODEL_CATALOG;
  assert.equal(new Set(catalog.map((model) => model.id)).size, catalog.length);
  const supported = catalog.filter(context.REELAY_PROMPT_OPTIMIZATION_PREFERENCES.supportsModel);
  assert.deepEqual(Array.from(supported, model => model.id), ["seedance-2-5", "seedance-2", "seedance-2-fast"]);
  const store = createStore({ models: catalog });
  assert.equal(store.get("seedance-2").models.length, 3);
  for (const model of catalog.filter(model => !supported.includes(model))) assert.throws(() => store.get(model), /模型/);
  for (const model of supported) {
    assert.ok(model.optimizationInstructions.length > 20, model.id);
    assert.ok(model.optimizationInstructions.length <= 2000, model.id);
    assert.doesNotMatch(model.optimizationInstructions, /保留原文|不增加|不添加|keep (?:the )?original|do not add|简洁|精简|简短|concise|brief/i, model.id);
  }
});
