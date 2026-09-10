import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const source = await readFile(new URL("../src/legacy-canvas/canvas-reference-thumbnails.js", import.meta.url), "utf8");

function fixture(t) {
  const dom = new JSDOM("<!doctype html><body><div id='strip'></div></body>", { runScripts: "outside-only", url: "https://reelay.test/" });
  const view = dom.window;
  const document = view.document;
  let intersections;
  const observed = new Set();
  const released = [];
  view.HTMLMediaElement.prototype.pause = function () { released.push(this); };
  view.HTMLMediaElement.prototype.load = () => {};
  view.IntersectionObserver = class {
    constructor(callback) { intersections = callback; }
    observe(target) { observed.add(target); }
    unobserve(target) { observed.delete(target); }
    disconnect() { observed.clear(); }
  };
  view.eval(source);
  const options = {
    sanitizeUrl: (url) => /^(https?:|blob:|\/)/i.test(String(url || "")) ? String(url) : "",
    escapeHtml: (value) => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;"),
  };
  const controller = view.REELAY_CANVAS_REFERENCE_THUMBNAILS.createController({ document, ...options });
  t.after(() => { controller.dispose(); view.close(); });
  const strip = document.querySelector("#strip");
  return { view, document, strip, observed, released, controller,
    render: (asset) => view.REELAY_CANVAS_REFERENCE_THUMBNAILS.renderVideo(asset, options),
    async flush() { await Promise.resolve(); },
    show(media) { intersections([{ target: media, isIntersecting: true }]); },
    hide(media) { intersections([{ target: media, isIntersecting: false }]); },
  };
}

test("video references use an actual poster or an inert real frame, with no duration or autoplay", (t) => {
  const f = fixture(t);
  f.strip.innerHTML = f.render({ url: "/clip.mp4", duration: 25 });
  const media = f.strip.querySelector("video");
  assert.equal(media.hasAttribute("src"), false);
  assert.equal(media.getAttribute("data-reference-video-src"), "/clip.mp4");
  assert.equal(media.preload, "metadata");
  assert.equal(media.hasAttribute("controls"), false);
  assert.equal(media.hasAttribute("autoplay"), false);
  assert.equal(f.strip.textContent, "");
  assert.ok(f.strip.querySelector(".reference-video-play svg"));
  f.strip.innerHTML = f.render({ url: "/clip.mp4", posterUrl: "/real-poster.webp" });
  assert.equal(f.strip.querySelector("video"), null);
  assert.equal(f.strip.querySelector("img").getAttribute("src"), "/real-poster.webp");
});

test("offscreen and hidden references do not fetch clips; visible references load only once", async (t) => {
  const f = fixture(t);
  f.strip.innerHTML = Array.from({ length: 20 }, (_, index) => f.render({ url: `/clip-${index}.mp4` })).join("");
  await f.flush();
  const media = [...f.strip.querySelectorAll("video")];
  assert.equal(f.observed.size, 20);
  assert.ok(media.every((item) => !item.hasAttribute("src")));
  f.hide(media[1]);
  f.show(media[0]);
  assert.equal(media[0].getAttribute("src"), "/clip-0.mp4");
  assert.equal(media[0].muted, true);
  assert.ok(media.slice(1).every((item) => !item.hasAttribute("src")));
  f.show(media[0]);
  assert.equal(f.released.length, 0);
});

test("reordering keeps the decoder, deletion releases it and stale visibility cannot resurrect it", async (t) => {
  const f = fixture(t);
  f.strip.innerHTML = f.render({ url: "/clip.mp4" });
  await f.flush();
  const media = f.strip.querySelector("video");
  f.show(media);
  f.strip.append(media.parentElement);
  await f.flush();
  assert.equal(media.getAttribute("src"), "/clip.mp4");
  assert.equal(f.released.length, 0);
  media.parentElement.remove();
  await f.flush();
  assert.equal(media.hasAttribute("src"), false);
  assert.equal(f.observed.has(media), false);
  f.show(media);
  assert.equal(media.hasAttribute("src"), false);
  assert.equal(f.released.length, 1);
});

test("BFCache suspends decoders and restores lazy observation; dispose releases all media", async (t) => {
  const f = fixture(t);
  f.strip.innerHTML = f.render({ url: "/clip.mp4" });
  await f.flush();
  const media = f.strip.querySelector("video");
  f.show(media);
  f.view.dispatchEvent(new f.view.PageTransitionEvent("pagehide", { persisted: true }));
  assert.equal(media.hasAttribute("src"), false);
  assert.equal(f.observed.size, 0);
  f.show(media);
  assert.equal(media.hasAttribute("src"), false);
  f.view.dispatchEvent(new f.view.PageTransitionEvent("pageshow", { persisted: true }));
  assert.equal(f.observed.has(media), true);
  f.show(media);
  assert.equal(media.hasAttribute("src"), true);
  f.controller.dispose();
  assert.equal(media.hasAttribute("src"), false);
  f.show(media);
  assert.equal(media.hasAttribute("src"), false);
});

test("unsafe media URLs cannot enter source or poster sinks", async (t) => {
  const f = fixture(t);
  f.strip.innerHTML = f.render({ url: "javascript:alert(1)", posterUrl: "javascript:alert(2)" });
  assert.equal(f.strip.querySelector("video, img"), null);
  f.strip.innerHTML = '<video data-reference-video-src="javascript:alert(3)"></video>';
  await f.flush();
  const media = f.strip.querySelector("video");
  f.show(media);
  assert.equal(media.hasAttribute("src"), false);
});
