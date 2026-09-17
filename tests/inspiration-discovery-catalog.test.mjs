import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const context = {};
runInNewContext(await readFile(new URL("../src/config/inspiration-catalog.js", import.meta.url), "utf8"), context);
const catalog = context.REELAY_INSPIRATION_CATALOG;
const ids = (clips) => Array.from(clips, (clip) => clip.id);

test("discovery preserves every current clip and returns canonical media records", () => {
  assert.deepEqual(ids(catalog.search()), [
    "inspiration-coast", "inspiration-moon", "inspiration-road", "inspiration-swim",
    "inspiration-desert", "inspiration-morning", "inspiration-butterfly", "inspiration-tree",
    "inspiration-city", "inspiration-lab", "inspiration-rooftop", "inspiration-snow",
  ]);
  for (const clip of catalog.search()) assert.equal(clip, catalog.get(clip.id));
  assert.equal(catalog.search({ query: "  \n " }).length, 12);
});

test("all offered facets have actual examples and unique stable group-qualified IDs", () => {
  const seen = new Set();
  for (const group of catalog.discoveryFacets) {
    for (const option of group.options) {
      assert.ok(option.id.startsWith(`${group.id}:`));
      assert.equal(option.groupId, group.id);
      assert.ok(!seen.has(option.id));
      seen.add(option.id);
      assert.ok(catalog.search({ facets: [option.id] }).length > 0, option.id);
      assert.ok(Object.isFrozen(option));
    }
  }
  assert.ok(catalog.clips.every((clip) => catalog.getDiscoveryTags(clip).some((tag) => tag.groupId === "content")));
  assert.ok(!catalog.discoveryFacets.some((group) => group.options.some((option) => /滑动变焦|甩镜|环绕/.test(option.label))));
});

test("same facet group uses alternatives while different groups narrow each other", () => {
  const animals = catalog.search({ facets: ["content:animals"] });
  const scifi = catalog.search({ facets: ["content:scifi"] });
  const either = catalog.search({ facets: ["content:animals", "content:scifi"] });
  assert.deepEqual(new Set(ids(either)), new Set([...ids(animals), ...ids(scifi)]));
  assert.deepEqual(ids(catalog.search({ facets: ["content:scifi", "light:backlight"] })), ["inspiration-moon"]);
  assert.deepEqual(ids(catalog.search({ facets: ["content:animals", "content:scifi", "light:colored"] })), ["inspiration-lab"]);
  assert.deepEqual(ids(catalog.search({ facets: ["content:animals", "light:cool"] })), []);
});

test("query covers source, individual shots and familiar terminology with AND token matching", () => {
  assert.deepEqual(ids(catalog.search({ query: "控制台 紫色" })), ["inspiration-lab"]);
  assert.deepEqual(ids(catalog.search({ query: "宇航员 轮廓光" })), ["inspiration-moon"]);
  assert.deepEqual(ids(catalog.search({ query: "一镜到底" })), ["inspiration-swim"]);
  assert.deepEqual(ids(catalog.search({ query: "DISSOLVE" })), ["inspiration-coast"]);
  assert.deepEqual(ids(catalog.search({ query: "ＴＲＡＣＫＩＮＧ 水下", facets: ["editing:continuous"] })), ["inspiration-swim"]);
  assert.deepEqual(ids(catalog.search({ query: "Sintel 雪峰" })), ["inspiration-snow"]);
  assert.deepEqual(ids(catalog.search({ query: "白兔", facets: ["content:animals"] })), ["inspiration-morning", "inspiration-butterfly", "inspiration-tree"]);
  assert.deepEqual(ids(catalog.search({ query: "宇航员 白兔" })), []);
});

test("no matches and unknown facets do not silently return unrelated content", () => {
  assert.deepEqual(ids(catalog.search({ query: "不存在的香水产品广告" })), []);
  assert.deepEqual(ids(catalog.search({ facets: ["movement:orbit"] })), []);
  assert.deepEqual(ids(catalog.search({ facets: ["content:scifi", "not-a-facet"] })), []);
  assert.deepEqual(ids(catalog.search({ facets: ["content:scifi", "content:scifi"] })), ids(catalog.search({ facets: ["content:scifi"] })));
});

test("detail tags share filter vocabulary and ignore untrusted caller metadata", () => {
  const expected = catalog.getDiscoveryTags("inspiration-swim");
  assert.deepEqual(Array.from(catalog.getDiscoveryTags(catalog.get("inspiration-swim")), (tag) => tag.id), Array.from(expected, (tag) => tag.id));
  assert.equal(expected.find((tag) => tag.id === "editing:continuous").label, "连续长镜头");
  assert.deepEqual(Array.from(catalog.getDiscoveryTags({ id: "inspiration-swim", tags: ["不存在"] }), (tag) => tag.id), Array.from(expected, (tag) => tag.id));
  assert.equal(catalog.getDiscoveryTags("missing").length, 0);
  assert.equal(catalog.getDiscoveryTags(null).length, 0);
  expected.length = 0;
  assert.ok(catalog.getDiscoveryTags("inspiration-swim").length > 0);
});


test("framing facets preserve explicit scales without substring or content inference", () => {
  const scales = (id) => Array.from(catalog.getDiscoveryTags(id).filter((tag) => tag.groupId === "scale"), (tag) => tag.id);
  assert.deepEqual(scales("inspiration-snow"), ["scale:extreme-wide", "scale:medium-close"]);
  assert.deepEqual(scales("inspiration-swim"), ["scale:wide", "scale:medium"]);
  assert.deepEqual(scales("inspiration-moon"), ["scale:wide", "scale:medium", "scale:close-up"]);
  assert.deepEqual(ids(catalog.search({ facets: ["scale:extreme-wide"] })), ["inspiration-city", "inspiration-snow"]);
  assert.deepEqual(ids(catalog.search({ facets: ["scale:close-up", "editing:continuous"] })), []);
  // The label is justified by a source shot, never by a title, tag or prompt.
  for (const clip of catalog.clips) {
    for (const tag of catalog.getDiscoveryTags(clip).filter((item) => item.groupId === "scale")) {
      assert.ok(clip.shots.some((shot) => shot.framing.includes(tag.label)), `${clip.id}: ${tag.label}`);
    }
  }
});

test("duration facets partition source seconds with exclusive boundaries and no rounding", () => {
  assert.deepEqual(ids(catalog.search({ facets: ["duration:short"] })), [
    "inspiration-moon", "inspiration-road", "inspiration-swim", "inspiration-desert", "inspiration-snow",
  ]);
  assert.deepEqual(ids(catalog.search({ facets: ["duration:medium"] })), [
    "inspiration-coast", "inspiration-morning", "inspiration-lab", "inspiration-rooftop",
  ]);
  assert.deepEqual(ids(catalog.search({ facets: ["duration:long"] })), [
    "inspiration-butterfly", "inspiration-tree", "inspiration-city",
  ]);
  assert.equal(catalog.get("inspiration-coast").duration, 10.008);
  assert.equal(catalog.get("inspiration-morning").duration, 20);
  for (const clip of catalog.clips) {
    assert.equal(catalog.getDiscoveryTags(clip).filter((tag) => tag.groupId === "duration").length, 1);
  }
});

test("framing and duration combine with existing facets and open content search", () => {
  assert.deepEqual(ids(catalog.search({ facets: ["scale:extreme-wide", "duration:short"] })), ["inspiration-snow"]);
  assert.deepEqual(ids(catalog.search({ query: "科幻", facets: ["scale:close-up", "duration:medium"] })), ["inspiration-lab"]);
  assert.deepEqual(ids(catalog.search({ facets: ["duration:short", "duration:medium", "light:backlight"] })), ["inspiration-moon", "inspiration-rooftop"]);
  assert.deepEqual(ids(catalog.search({ facets: ["scale:extreme-wide", "scale:close-up", "duration:medium"] })), ["inspiration-lab", "inspiration-rooftop"]);
  // Whole clips are returned: matching scale and lighting may belong to different
  // source shots. The catalog does not promise one exact matching shot/range.
  assert.deepEqual(ids(catalog.search({ facets: ["scale:close-up", "light:backlight", "duration:short"] })), ["inspiration-moon"]);
});
