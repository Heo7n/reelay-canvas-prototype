import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const scripts = await Promise.all(["canvas-media-preview", "canvas-entity-editor-view", "canvas-entity-use-view"]
  .map((name) => readFile(new URL(`../src/legacy-canvas/${name}.js`, import.meta.url), "utf8")));
const media = { id: "one", mediaKind: "image", name: "角色动效", url: "/original.gif", thumbnailUrl: "/preview.webp" };
function setup(t) {
  const dom = new JSDOM("<main></main>", { url: "https://reelay.test", runScripts: "outside-only" });
  t.after(() => dom.window.close());
  const { window } = dom;
  scripts.forEach((script) => window.eval(script));
  const host = window.document.querySelector("main");
  const helper = window.REELAY_CANVAS_MEDIA_PREVIEW;
  function render(item = media, options = {}) {
    helper.renderPreservingMedia(host, window.REELAY_CANVAS_ENTITY_EDITOR_VIEW.renderEntityEditor({
      mode: "edit", entity: { id: "entity-1", name: "角色" }, media: [item], selectedPreviewId: item.id, ...options,
    }), "[data-entity-editor-preview]");
    return host.querySelector("[data-progressive-preview]");
  }
  return { window, host, helper, render };
}

test("the existing thumbnail remains visible until the original is fully decoded", async (t) => {
  const { window, render } = setup(t);
  const preview = render();
  const original = preview.querySelector("[data-preview-full]");
  assert.equal(preview.querySelector("[data-preview-thumbnail]").src, "https://reelay.test/preview.webp");
  assert.equal(original.src, "https://reelay.test/original.gif", "animated images still use original bytes");
  let finishDecode;
  original.decode = () => new Promise((resolve) => { finishDecode = resolve; });
  original.dispatchEvent(new window.Event("load"));
  assert.equal(preview.dataset.previewQuality, "preview");
  finishDecode();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(preview.dataset.previewQuality, "full");
});

test("failed original loads and failed decodes retain the thumbnail without retry loops", async (t) => {
  const { window, render } = setup(t);
  const preview = render();
  preview.querySelector("[data-preview-full]").dispatchEvent(new window.Event("error"));
  assert.equal(preview.dataset.previewQuality, "preview");
  assert.equal(preview.getAttribute("aria-busy"), "false");
  assert.equal(render(), preview, "unrelated changes do not restart a failed request");
  const next = render({ ...media, id: "two", url: "/two.gif" });
  const original = next.querySelector("[data-preview-full]");
  original.decode = () => Promise.reject(new Error("decode failed"));
  original.dispatchEvent(new window.Event("load"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(next.dataset.previewQuality, "preview");
});

test("switching the selected media immediately shows its own thumbnail and rejects stale decode completion", async (t) => {
  const { window, render, host } = setup(t);
  const first = render();
  const original = first.querySelector("[data-preview-full]");
  let finishDecode;
  original.decode = () => new Promise((resolve) => { finishDecode = resolve; });
  original.dispatchEvent(new window.Event("load"));
  const second = render({ ...media, id: "two", url: "/two.png", thumbnailUrl: "/two-small.webp" });
  assert.equal(first.isConnected, false);
  assert.equal(second.querySelector("[data-preview-thumbnail]").src, "https://reelay.test/two-small.webp");
  finishDecode();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(second.dataset.previewQuality, "preview");
  assert.equal(host.querySelector("[data-progressive-preview]"), second);
});

test("same-media control changes keep a playing video and every ancestor connected", (t) => {
  const { window, render, host } = setup(t);
  const videoMedia = { ...media, mediaKind: "video", url: "/motion.mp4" };
  render(videoMedia);
  const video = host.querySelector(".entity-editor-preview-stage video");
  video.currentTime = 12;
  const observer = new window.MutationObserver(() => {});
  observer.observe(host, { childList: true, subtree: true });
  render({ ...videoMedia, name: "更新名称" }, { renamingMediaId: videoMedia.id, mediaRenameValue: "更新名称" });
  assert.equal(host.querySelector(".entity-editor-preview-stage video"), video);
  assert.equal(video.currentTime, 12);
  assert.equal(video.getAttribute("aria-label"), "播放 更新名称");
  assert.equal(observer.takeRecords().some((record) => [...record.removedNodes].some((node) => node === video || node.contains(video))), false);
  observer.disconnect();
});

test("a hover detail refresh preserves its thumbnail and never starts an original download", (t) => {
  const { window, helper, host } = setup(t);
  const render = (pinned) => helper.renderPreservingMedia(host, window.REELAY_CANVAS_ENTITY_USE_VIEW.renderEntityDetail({
    entity: { id: "entity-1", name: "角色", mediaRefs: [{ mediaId: media.id }], coverMediaId: media.id }, media: [media], pinned,
  }), ".entity-use-detail-cover");
  render(false);
  const thumbnail = host.querySelector(".entity-use-detail-cover img");
  assert.equal(thumbnail.src, "https://reelay.test/preview.webp");
  assert.equal(render(true), true);
  assert.equal(host.querySelector(".entity-use-detail-cover img"), thumbnail);
  assert.equal(host.querySelector("[data-preview-full]"), null);
});
