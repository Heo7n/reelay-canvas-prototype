import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createContext, runInContext } from "node:vm";

const context = createContext({});
runInContext(await readFile(new URL("../src/infrastructure/generation/simulated-generation-media.js", import.meta.url), "utf8"), context);
const { createSelector } = context.REELAY_SIMULATED_GENERATION_MEDIA;
const videos = ["coast", "mountains", "forest"].map((name) => ({ type: "video", url: `/${name}.mp4`, duration: 8 }));
const image = { type: "image", url: "/image.jpg" };

test("new video results select from every scene without consecutive repeats", () => {
  const randomValues = [0, 0.9, 0.9, 0];
  const select = createSelector({ image, videos, random: () => randomValues.shift() });
  const results = Array.from({ length: 4 }, () => select("video"));
  assert.deepEqual(results.map((asset) => asset.url), ["/coast.mp4", "/forest.mp4", "/mountains.mp4", "/coast.mp4"]);
  results[0].url = "/changed.mp4";
  assert.equal(videos[0].url, "/coast.mp4");
  assert.equal(results[3].url, "/coast.mp4");
});

test("image and final results preserve their media and do not consume a new scene", () => {
  let choices = 0;
  const select = createSelector({ image, videos, random: () => { choices += 1; return 0; } });
  const draft = select("video");
  const final = select("video", { ...draft, posterUrl: "/original.webp", duration: 6 });
  assert.equal(final.url, draft.url);
  assert.equal(final.posterUrl, "/original.webp");
  assert.equal(final.duration, 6);
  assert.equal(select("image").url, image.url);
  assert.equal(choices, 1);
  assert.equal(select("video").url, "/mountains.mp4");
});
