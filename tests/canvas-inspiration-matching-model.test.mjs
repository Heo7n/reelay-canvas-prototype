import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const context = vm.createContext({});
vm.runInContext(await readFile(new URL("../src/legacy-canvas/canvas-inspiration-matching-model.js", import.meta.url), "utf8"), context);
vm.runInContext(await readFile(new URL("../src/config/inspiration-catalog.js", import.meta.url), "utf8"), context);
const match = (options) => JSON.parse(JSON.stringify(context.REELAY_CANVAS_INSPIRATION_MATCHING_MODEL.match(options)));
const extract = (text) => JSON.parse(JSON.stringify(context.REELAY_CANVAS_INSPIRATION_MATCHING_MODEL.extract(text)));
const shot = (id, fields = {}) => ({ id, start: 0, end: 3, ...fields });
const clip = (id, shots, fields = {}) => ({ id, duration: 10, shots, ...fields });

test("reasons never combine separate shots in the same clip", () => {
  const results = match({ text: "逆光跟拍", clips: [clip("split", [
    shot("tracking", { movement: "跟随人物", light: "漫射日光" }),
    shot("lit", { start: 3, end: 6, movement: "固定机位", light: "逆光" }),
  ]), clip("together", [shot("both", { movement: "跟随人物", light: "逆光" })])] });
  assert.deepEqual(results.map((item) => item.clipId), ["together", "split"]);
  assert.deepEqual(results[0].reasons, ["运镜：跟拍", "光线：逆光"]);
  assert.deepEqual(results[1].reasons, ["运镜：跟拍"]);
  assert.equal(results[1].shotId, "tracking");
});

test("camera technique can match a different topic without requiring every signal", () => {
  const results = match({ text: "香水广告，海边，镜头跟拍", clips: [clip("moon", [
    shot("vehicle", { summary: "探测车在月面行驶", movement: "横向跟随车辆" }),
  ])] });
  assert.equal(results.length, 1);
  assert.deepEqual(results[0].reasons, ["运镜：跟拍"]);
});

test("negative clauses do not become positive query signals", () => {
  const clips = [clip("a", [shot("follow", { movement: "跟随人物" }), shot("rim", { light: "逆光" })])];
  assert.deepEqual(match({ text: "不要跟拍", clips }), []);
  assert.deepEqual(match({ text: "without tracking", clips }), []);
  assert.deepEqual(match({ text: "不要跟拍，而是逆光", clips })[0].reasons, ["光线：逆光"]);
  assert.deepEqual(match({ text: "avoid tracking, use backlight", clips })[0].reasons, ["光线：逆光"]);
});

test("prompts, clip metadata and subject following cannot impersonate camera annotations", () => {
  const clips = [clip("a", [shot("a1", {
    summary: "人物跟随另一个人物", movement: "固定机位", prompt: "跟拍，逆光，雨夜", light: "不要逆光",
  })], { title: "跟拍", description: "雨夜逆光", tags: ["跟拍"] })];
  assert.deepEqual(match({ text: "逆光跟拍雨夜", clips }), []);
});

test("English aliases have word boundaries and unknown text stays empty", () => {
  const clips = [clip("a", [shot("a1", { movement: "侧向跟随", light: "侧后方强光勾出轮廓" })])];
  assert.deepEqual(match({ text: "tracking with rim light", clips })[0].reasons, ["运镜：跟拍", "光线：逆光"]);
  assert.deepEqual(match({ text: "a laboratory illustration of a runner", clips }), []);
  assert.deepEqual(match({ text: "适合我的产品，有质感", clips }), []);
  assert.deepEqual(match({ text: "", clips }), []);
});

test("catalog and shot order break score ties without mutating source", () => {
  const clips = [clip("z", [shot("z1", { movement: "跟随" }), shot("z2", { movement: "跟随" })]),
    clip("a", [shot("a1", { movement: "跟随" })])];
  const before = JSON.stringify(clips);
  const first = match({ text: "跟拍", clips });
  assert.deepEqual(first.map((item) => [item.clipId, item.shotId]), [["z", "z1"], ["a", "a1"]]);
  assert.deepEqual(match({ text: "跟拍", clips }), first);
  assert.equal(JSON.stringify(clips), before);
});

test("best shot carries its actual seek range and duplicate clips are omitted", () => {
  const source = clip("a", [shot("plain", { movement: "跟随" }),
    shot("better", { start: 3.5, end: 6.25, movement: "跟随", light: "逆光" })]);
  const result = match({ text: "跟拍，逆光", clips: [source, source] });
  assert.equal(result.length, 1);
  assert.deepEqual([result[0].shotId, result[0].start, result[0].end], ["better", 3.5, 6.25]);
});

test("invalid or out-of-range annotations do not produce seek targets", () => {
  assert.deepEqual(match({ text: "跟拍", clips: [null, clip("a", [null,
    shot("negative", { start: -1, movement: "跟随" }),
    shot("empty", { start: 3, end: 3, movement: "跟随" }),
    shot("outside", { end: 11, movement: "跟随" }),
  ])] }), []);
  assert.deepEqual(match({ text: "跟拍", clips: null }), []);
});

test("real catalog returns grounded shot targets for combined action and camera requests", () => {
  const clips = context.REELAY_INSPIRATION_CATALOG.clips;
  const results = match({ text: "水下游泳，横向跟拍", clips });
  assert.ok(results.length > 0);
  const first = results[0];
  const found = clips.find((item) => item.id === first.clipId).shots.find((item) => item.id === first.shotId);
  assert.equal(first.start, found.start);
  assert.equal(first.end, found.end);
  assert.ok(first.reasons.includes("场景：水下"));
  assert.ok(first.reasons.includes("动作：游泳"));
  assert.ok(first.reasons.includes("运镜：跟拍"));
});

test("extract yields stable canonical signals from positive recognized text only", () => {
  const expected = [
    { id: "movement:跟拍", group: "movement", label: "跟拍" },
    { id: "scene:海岸", group: "scene", label: "海岸" },
  ];
  assert.deepEqual(extract("海边跟拍，镜头跟随，beach tracking"), expected);
  assert.deepEqual(extract("tracking on the coast"), expected);
  assert.deepEqual(extract("不要跟拍，而是海岸"), [expected[1]]);
  assert.deepEqual(extract("宿命感"), []);
  assert.deepEqual(extract(null), []);
  const changed = extract("跟拍");
  changed[0].label = "changed";
  assert.deepEqual(extract("跟拍"), [expected[0]]);
});

test("focus changes clip rank while keeping matches on ordinary signals", () => {
  const clips = [clip("camera", [shot("track", { movement: "跟随人物" })]),
    clip("lighting", [shot("lit", { light: "逆光" })])];
  assert.deepEqual(match({ text: "跟拍逆光", clips }).map((result) => result.clipId), ["camera", "lighting"]);
  const focused = match({ text: "跟拍逆光", clips, preferences: { "light:逆光": "focus" } });
  assert.deepEqual(focused.map((result) => result.clipId), ["lighting", "camera"]);
  assert.deepEqual(focused[1].reasons, ["运镜：跟拍"]);
});

test("focus selects the actual best shot without combining cross-shot evidence", () => {
  const clips = [clip("split", [shot("track", { movement: "跟随人物" }),
    shot("lit", { start: 3, end: 6, light: "逆光" })])];
  assert.equal(match({ text: "跟拍逆光", clips })[0].shotId, "track");
  const result = match({ text: "跟拍逆光", clips, preferences: { "light:逆光": "focus" } })[0];
  assert.deepEqual([result.shotId, result.start, result.end], ["lit", 3, 6]);
  assert.deepEqual(result.reasons, ["光线：逆光"]);
});

test("focused evidence appears before ordinary reasons and keeps stable ordering", () => {
  const clips = [clip("a", [shot("a1", { movement: "跟随", light: "逆光", summary: "海岸奔跑" })])];
  const preferences = { "scene:海岸": "focus", "action:奔跑": "focus" };
  assert.deepEqual(match({ text: "海边奔跑，逆光跟拍", clips, preferences })[0].reasons,
    ["场景：海岸", "动作：奔跑", "运镜：跟拍", "光线：逆光"]);
});

test("removing a signal drops its evidence without forbidding matching content", () => {
  const clips = [clip("both", [shot("both", { movement: "跟随", summary: "海岸" })]),
    clip("camera", [shot("camera", { movement: "跟随" })]),
    clip("coast", [shot("coast", { summary: "海岸" })])];
  const result = match({ text: "海岸跟拍", clips, preferences: { "scene:海岸": "removed" } });
  assert.deepEqual(result.map((item) => item.clipId), ["both", "camera"]);
  assert.deepEqual(result.map((item) => item.reasons), [["运镜：跟拍"], ["运镜：跟拍"]]);
  assert.equal(result[0].score, result[1].score);
  assert.deepEqual(match({ text: "海岸跟拍", clips,
    preferences: { "scene:海岸": "removed", "movement:跟拍": "removed" } }), []);
});

test("unknown, malformed and inherited preferences cannot create or alter signals", () => {
  const clips = [clip("a", [shot("a1", { movement: "跟随", light: "逆光" })])];
  const options = { text: "跟拍", clips };
  const baseline = match(options);
  for (const preferences of [null, [], "focus", { "movement:跟拍": "invalid" },
    { "light:逆光": "focus", unknown: "removed" }, Object.create({ "movement:跟拍": "removed" })]) {
    assert.deepEqual(match({ ...options, preferences }), baseline);
  }
  assert.deepEqual(match({ text: "", clips, preferences: { "movement:跟拍": "focus" } }), []);
});
