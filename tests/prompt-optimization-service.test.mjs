import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const context = vm.createContext({});
for (const path of ["../src/legacy-canvas/canvas-prompt-document.js", "../src/application/prompt-optimization-service.js"]) {
  vm.runInContext(await readFile(new URL(path, import.meta.url), "utf8"), context);
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const text = (value) => ({ type: "text", text: value });
const ref = (key, mediaType = "image") => ({ type: "reference", key, mediaType, fallbackLabel: "素材1" });
const doc = (...content) => ({ version: 1, content });
const source = (prompt = "在森林中拍摄  香水瓶。") => ({ prompt, references: [], model: { id: "image-model", type: "image", parameters: { ratio: "1:1" } }, scope: "canvas-one" });

function fixture(options = {}) {
  const timers = new Map();
  const events = [];
  let next = 0;
  const service = context.REELAY_PROMPT_OPTIMIZATION_SERVICE.createService({
    setTimer(callback, delay) { timers.set(++next, { callback, delay }); return next; },
    clearTimer(id) { timers.delete(id); },
    onChange(owner, state) { events.push({ owner, status: state.status }); },
    ...options,
  });
  const run = () => { const active = [...timers.values()]; timers.clear(); for (const timer of active) timer.callback(); };
  return { service, timers, events, run };
}

test("optimization snapshots are immutable and owner identity isolates concurrent tasks", () => {
  const { service, timers, run } = fixture();
  const first = { id: "same" }, second = { id: "same" };
  const input = source();
  input.references.push({ key: "asset:one", asset: { type: "image", url: "old.png" } });
  const original = structuredClone(input);
  assert.equal(service.start(first, input), true);
  assert.equal(service.start(first, source("重复")), false);
  assert.equal(service.start(second, source("An amber bottle in a forest.")), true);
  assert.equal(timers.size, 2);
  assert.equal([...timers.values()][0].delay, 1800);
  input.model.parameters.ratio = "9:16";
  input.references[0].asset.url = "new.png";
  assert.equal(service.get(first).source.model.parameters.ratio, "1:1");
  assert.equal(service.get(first).source.references[0].asset.url, "old.png");
  assert.throws(() => { service.get(first).source.model.parameters.ratio = "16:9"; }, TypeError);
  run();
  assert.equal(service.get(first).status, "ready");
  assert.match(context.REELAY_CANVAS_PROMPT_DOCUMENT.toText(service.get(first).suggestion), /在森林中拍摄 香水瓶/);
  assert.match(context.REELAY_CANVAS_PROMPT_DOCUMENT.toText(service.get(second).suggestion), /An amber bottle/);
  assert.deepEqual(plain(service.get(first).source), { ...original, prompt: doc(text(original.prompt)) });
});

test("repeated mixed references retain identity, type and order through optimization", () => {
  const { service, run } = fixture();
  const owner = {};
  const input = source(doc(text("参考 "), ref("asset:one"), text("，配合 "), ref("connection:video", "video"),
    text(" 和 "), ref("asset:audio", "audio"), text("，再次展示 "), ref("asset:one")));
  service.start(owner, input);
  run();
  assert.deepEqual(plain(service.get(owner).suggestion.content.filter((part) => part.type === "reference")), input.prompt.content.filter((part) => part.type === "reference"));
  assert.deepEqual(input.prompt.content[1], ref("asset:one"));
});

test("20k boundary preserves source text and a final reference instead of making room for additions", () => {
  const { service, run } = fixture();
  const owner = {};
  const input = source(doc(text("字".repeat(19_999)), ref("asset:last")));
  service.start(owner, input);
  run();
  assert.deepEqual(plain(service.get(owner).suggestion), input.prompt);
  assert.throws(() => service.start({}, source("字".repeat(20_001))), /长度上限/);
  assert.throws(() => service.start({}, source(doc(text("字".repeat(20_000)), ref("asset:last")))), /格式无效/);
});

test("removal and disposal cancel pending work and reject late completion even after owner reuse", () => {
  const { service, timers, run } = fixture();
  const owner = {};
  service.start(owner, source("第一次"));
  const late = [...timers.values()][0].callback;
  assert.equal(service.remove(owner), true);
  assert.equal(timers.size, 0);
  service.start(owner, source("第二次"));
  late();
  assert.equal(service.get(owner).status, "processing");
  run();
  assert.equal(service.get(owner).source.prompt.content[0].text, "第二次");
  service.start({}, source());
  const afterDispose = [...timers.values()][0].callback;
  service.dispose();
  afterDispose();
  assert.equal(timers.size, 0);
  assert.equal(service.get(owner), null);
  assert.equal(service.start({}, source()), false);
});

test("retry uses the supplied original and keeps the previous draft when an executor fails", () => {
  let fail = false;
  const { service, run } = fixture({ executor({ source: input, version }) {
    if (fail) throw new Error("模拟服务忙");
    return { suggestion: doc(text(input.prompt.content[0].text + ` / ${version}`)), summary: "本地模拟" };
  } });
  const owner = {}, input = source("原文");
  service.start(owner, input); run();
  const first = plain(service.get(owner).suggestion);
  service.markRead(owner);
  assert.equal(service.get(owner).unread, false);
  service.edit(owner, "手动建议");
  assert.equal(service.get(owner).edited, true);
  fail = true;
  service.start(owner, service.get(owner).source);
  assert.equal(service.get(owner).suggestion.content[0].text, "手动建议");
  assert.equal(service.edit(owner, "处理中编辑"), false);
  run();
  assert.equal(service.get(owner).status, "failed");
  assert.equal(service.get(owner).error, "模拟服务忙");
  assert.equal(service.get(owner).suggestion.content[0].text, "手动建议");
  fail = false;
  service.start(owner, service.get(owner).source); run();
  assert.equal(service.get(owner).suggestion.content[0].text, "原文 / 3");
  assert.equal(service.get(owner).edited, false);
  assert.equal(service.get(owner).unread, true);
  assert.deepEqual(first, doc(text("原文 / 1")));
});

test("default retries vary mild guidance without recursively expanding the prior draft", () => {
  const { service, run } = fixture();
  const owner = {};
  service.start(owner, source()); run();
  const first = plain(service.get(owner).suggestion);
  service.start(owner, service.get(owner).source); run();
  const second = plain(service.get(owner).suggestion);
  assert.notDeepEqual(first, second);
  assert.equal((second.content[0].text.match(/表达要求/g) || []).length, 1);
  assert.equal(service.get(owner).source.prompt.content[0].text, "在森林中拍摄  香水瓶。");
});

test("changed-source optimization retains the last source/draft pair until success and executes the new snapshot", () => {
  let fail = false;
  const executed = [];
  const { service, run } = fixture({ executor({ source: input }) {
    executed.push(plain(input));
    if (fail) throw new Error("暂时不可用");
    return { suggestion: input.prompt, summary: "保留引用。" };
  } });
  const owner = {};
  const original = source(doc(text("原文 "), ref("asset:old")));
  original.references = [{ key: "asset:old", asset: { type: "image", url: "/old.png" } }];
  service.start(owner, original); run();
  service.edit(owner, doc(text("已编辑建议 "), ref("asset:old")));
  const before = plain(service.get(owner));
  const replacement = source(doc(text("新原文 "), ref("asset:new", "video")));
  replacement.model = { id: "video-model", type: "video" };
  replacement.references = [{ key: "asset:new", asset: { type: "video", url: "/new.mp4" } }];
  const captured = structuredClone(replacement);
  fail = true;
  service.start(owner, replacement);
  assert.deepEqual(plain(service.get(owner).source), before.source);
  assert.deepEqual(plain(service.get(owner).suggestion), before.suggestion);
  replacement.prompt.content[0].text = "定时期间再次编辑";
  replacement.references[0].asset.url = "/changed.mp4";
  run();
  assert.deepEqual(executed[1], captured);
  assert.equal(service.get(owner).status, "failed");
  assert.deepEqual(plain(service.get(owner).source), before.source);
  assert.deepEqual(plain(service.get(owner).suggestion), before.suggestion);
  assert.equal(service.get(owner).edited, true);
  fail = false;
  service.start(owner, captured);
  assert.deepEqual(plain(service.get(owner).source), before.source);
  run();
  assert.equal(service.get(owner).status, "ready");
  assert.deepEqual(plain(service.get(owner).source), captured);
  assert.deepEqual(plain(service.get(owner).suggestion), captured.prompt);
  assert.equal(service.get(owner).edited, false);
});

test("a new source replaces a failed first-run source when there is no previous suggestion", () => {
  const { service, run } = fixture({ executor() { throw new Error("模拟失败"); } });
  const owner = {};
  service.start(owner, source("第一次")); run();
  assert.equal(service.get(owner).suggestion, null);
  service.start(owner, source("第二次"));
  assert.equal(service.get(owner).source.prompt.content[0].text, "第二次");
  run();
  assert.equal(service.get(owner).source.prompt.content[0].text, "第二次");
  assert.equal(service.get(owner).suggestion, null);
});

test("custom instructions are data, with limited preferences and no verbatim prompt injection", () => {
  const { service, run } = fixture();
  const owner = {};
  const settings = { customInstructions: "保留原文，不增加。秘密指令：红色外星人" };
  const input = source(" A forest.  ");
  service.start(owner, input, settings); run();
  assert.deepEqual(plain(service.get(owner).suggestion), doc(text(input.prompt)));
  assert.equal(service.get(owner).settings.customInstructions, settings.customInstructions);
  assert.equal(service.get(owner).summary, "保留了原文与素材引用。已应用可识别的偏好。");
  service.start(owner, source("A  forest."), { customInstructions: "请精简；秘密指令：红色外星人" }); run();
  assert.equal(service.get(owner).suggestion.content[0].text, "A forest.");
  service.start(owner, source("静かな森を歩く。")); run();
  assert.equal(service.get(owner).suggestion.content[0].text, "静かな森を歩く。");
  assert.equal(service.get(owner).summary, "保留了原文与素材引用。");
  service.start(owner, source("A forest."), { customInstructions: "请加入一只红色外星人" }); run();
  assert.match(service.get(owner).summary, /自定义指令已保留，本次按默认规则整理/);
  assert.doesNotMatch(service.get(owner).summary, /已应用/);
  assert.doesNotMatch(service.get(owner).suggestion.content[0].text, /外星人/);
  service.start(owner, source("A forest."), { customInstructions: "请保留原文。" }); run();
  assert.equal(service.get(owner).summary, "保留了原文与素材引用。");
});

test("obsolete focus and detail preferences cannot alter the suggestion or remain in settings", () => {
  const { service, run } = fixture();
  const baselineOwner = {}, oldOwner = {};
  service.start(baselineOwner, source());
  service.start(oldOwner, source(), { focus: "visual", detail: "concise", customInstructions: "" });
  run();
  assert.deepEqual(plain(service.get(oldOwner).settings), { customInstructions: "" });
  assert.deepEqual(plain(service.get(oldOwner).suggestion), plain(service.get(baselineOwner).suggestion));
  assert.match(service.get(oldOwner).suggestion.content[0].text, /表达要求/);
});

test("invalid executor references fail without replacing a previously usable suggestion", () => {
  let invalid = false;
  const { service, run } = fixture({ executor({ source: input }) {
    return { suggestion: invalid ? doc(text("丢失引用")) : input.prompt };
  } });
  const owner = {}, input = source(doc(text("图 "), ref("asset:one")));
  service.start(owner, input); run();
  invalid = true;
  service.start(owner, input); run();
  assert.equal(service.get(owner).status, "failed");
  assert.deepEqual(plain(service.get(owner).suggestion), input.prompt);
});

test("observer failures cannot corrupt settlement and reentrant deletion prevents ready notification", () => {
  let ready = 0, service;
  const setup = fixture({ onChange(owner, state) {
    if (state.status === "ready") service.remove(owner);
    else throw new Error("UI error");
  }, onReady() { ready++; } });
  service = setup.service;
  const owner = {};
  assert.equal(service.start(owner, source()), true);
  setup.run();
  assert.equal(ready, 0);
  assert.equal(service.get(owner), null);
});

test("empty prompts do not begin a task and scheduling failures retain the original snapshot", () => {
  const { service } = fixture({ setTimer() { throw new Error("No scheduler"); } });
  assert.equal(service.start({}, source("")), false);
  const owner = {};
  assert.equal(service.start(owner, source()), true);
  assert.equal(service.get(owner).status, "failed");
  assert.equal(service.get(owner).source.prompt.content[0].text, "在森林中拍摄  香水瓶。");
});
