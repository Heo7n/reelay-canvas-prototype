import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const context = {};
runInNewContext(await readFile(new URL("../src/config/inspiration-catalog.js", import.meta.url), "utf8"), context);
const catalog = context.REELAY_INSPIRATION_CATALOG;

test("curated boundaries cover actual clip durations and every poster ships locally", async () => {
  assert.equal(catalog.clips.length, 12);
  assert.ok(catalog.clips.some((clip) => clip.duration === 30 && clip.shots.length >= 8));
  for (const clip of catalog.clips) {
    assert.ok(clip.duration >= 5 && clip.duration <= 30);
    assert.equal(clip.analysisVersion, "curated-v2");
    assert.equal(clip.shots[0].start, 0);
    assert.equal(clip.shots.at(-1).end, clip.duration);
    for (const [index, shot] of clip.shots.entries()) {
      assert.ok(shot.end > shot.start);
      if (index) assert.equal(shot.start, clip.shots[index - 1].end);
      for (const name of ["title", "summary", "framing", "movement", "composition", "light", "prompt", "transition"]) assert.ok(shot[name]);
      assert.ok((await readFile(new URL(`../${shot.posterUrl}`, import.meta.url))).length > 100);
    }
  }
});

test("partial ranges intersect the original shots without extending outside the request", () => {
  const clip = catalog.get("inspiration-moon");
  const result = catalog.getAnalysis({ clip, start: 2, end: 6 });
  assert.equal(result.shots.length, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(result.shots.map(({ start, end }) => [start, end]))), [[2, 3], [3, 5.4], [5.4, 6]]);
  assert.equal(result.shots[0].id, clip.shots[1].id);
  assert.equal(result.shots[0].sourceStart, 1.467);
  assert.equal(result.shots[0].sourceEnd, 3);
  assert.equal(result.shots[0].partial, true);
  assert.equal(result.shots[1].partial, false);
  assert.equal(result.shots[2].partial, true);
  assert.equal(result.start, 2);
  assert.equal(result.end, 6);
  assert.match(result.key, /inspiration-moon:curated-v2:2:6/);
  assert.notEqual(result.key, catalog.getAnalysis({ clip, start: 2, end: 6.1 }).key);
  assert.ok(result.prompt.includes("镜头 3"));
  assert.equal(clip.shots[1].start, 1.467, "range clipping must not mutate canonical shot data");
});

test("a tenth-second excerpt never claims the complete shot's action sequence", () => {
  const clip = catalog.get("inspiration-swim");
  const result = catalog.getAnalysis({ clip, start: 1, end: 1.1 });
  assert.equal(result.shots[0].partial, true);
  assert.match(result.shots[0].summary, /局部/);
  assert.ok(!result.shots[0].summary.includes(clip.shots[0].summary));
  assert.ok(!result.prompt.includes(clip.shots[0].summary));
  assert.equal(result.shots[0].transition, "镜头内起点");
});

test("a range ending on a cut does not include the following shot", () => {
  const clip = catalog.get("inspiration-road");
  const first = catalog.getAnalysis({ clip, start: 0, end: 5.033 });
  assert.equal(first.shots.length, 1);
  assert.equal(first.shots[0].title, "车窗形象连续变化");
  const second = catalog.getAnalysis({ clip, start: 5.033, end: 6.8 });
  assert.equal(second.shots.length, 1);
  assert.equal(second.shots[0].title, "街头人物");
});

test("single continuous shot stays single; silent clips do not acquire imagined dialogue", () => {
  const clip = catalog.get("inspiration-swim");
  const result = catalog.getAnalysis({ clip, start: 0, end: 5 });
  assert.equal(result.shots.length, 1);
  assert.equal(result.shots[0].sound, undefined);
  assert.ok(!result.overview.some((entry) => entry.label === "声音"));
  assert.ok(!catalog.get("inspiration-moon").shots.some((shot) => shot.summary.includes("机甲")));
});

test("range validation uses catalog authority instead of caller supplied duration", () => {
  const clip = catalog.get("inspiration-swim");
  for (const [start, end] of [[-1, 2], [1, 1], [0, 5.1], [NaN, 1], [0, Infinity]]) {
    assert.throws(() => catalog.getAnalysis({ clip, start, end }), /有效时间段/);
  }
  assert.throws(() => catalog.getAnalysis({ clip: { ...clip, duration: 999 }, start: 0, end: 100 }), /有效时间段/);
  assert.throws(() => catalog.getAnalysis({ clip: { id: "missing" }, start: 0, end: 1 }), /不可用/);
});

test("creation brief preserves edits, includes provenance and does not imply a trimmed upload", () => {
  const clip = catalog.get("inspiration-moon");
  const prompt = "使用我的角色，保持横向跟拍。\n不沿用原片中的机甲。";
  const brief = catalog.makeAnalysisBrief({ clip, start: 3, end: 7.5, prompt });
  assert.ok(brief.includes(prompt));
  assert.ok(brief.includes(clip.title));
  assert.ok(brief.includes(clip.sourceLabel));
  assert.match(brief, /00:03.0–00:07.5/);
  assert.match(brief, /完整片段，未裁切/);
  for (const invalid of [undefined, "", "  ", "x".repeat(12001)]) {
    assert.throws(() => catalog.makeAnalysisBrief({ clip, start: 0, end: clip.duration, prompt: invalid }), /提示词/);
  }
  assert.ok(catalog.makeAnalysisBrief({ clip, start: 0, end: clip.duration, prompt: "x".repeat(12000) }));
  assert.throws(() => catalog.makeAnalysisBrief({ clip, start: 0, end: 9, prompt }), /有效时间段/);
});

test("shot-specific creation brief uses only the selected shot intersection", () => {
  const clip = catalog.get("inspiration-moon");
  const brief = catalog.makeAnalysisBrief({ clip, start: 2, end: 6, shotId: clip.shots[1].id, prompt: "头盔特写，面罩映出月面。" });
  assert.match(brief, /00:02.0–00:03.0/);
  assert.match(brief, /头盔面罩/);
  assert.ok(!brief.includes("00:06.0"));
  assert.throws(() => catalog.makeAnalysisBrief({ clip, start: 2, end: 6, shotId: clip.shots[0].id, prompt: "不在范围" }), /不在当前参考范围/);
  assert.throws(() => catalog.makeAnalysisBrief({ clip, start: 0, end: 6, shotId: "unknown", prompt: "无效镜头" }), /不在当前参考范围/);
});

test("generation prompts are direct visual descriptions and published sources carry attribution", async () => {
  for (const clip of catalog.clips) {
    const analysis = catalog.getAnalysis({ clip, start: 0, end: clip.duration });
    assert.ok(analysis.prompt.length > 20);
    assert.doesNotMatch(analysis.prompt, /请|先确认|我的|参考构图|参考光影|声音分轨|尚未单独标注/);
    for (const shot of analysis.shots) assert.ok(shot.prompt.length > 20);
  }
  const attribution = await readFile(new URL(`../${catalog.attributionUrl}`, import.meta.url), "utf8");
  for (const title of ["Big Buck Bunny", "Sintel", "Tears of Steel", "creativecommons.org/licenses/by/3.0/"]) assert.ok(attribution.includes(title));
});
