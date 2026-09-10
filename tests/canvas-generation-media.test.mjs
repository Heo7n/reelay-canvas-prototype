import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const source = await readFile(new URL("../src/legacy-canvas/canvas-generation-media.js", import.meta.url), "utf8");
const settled = () => new Promise((resolve) => setImmediate(resolve));

function fixture(t, options = {}) {
  const dom = new JSDOM('<!doctype html><body><div id="result"><video src="/result.mp4"></video></div></body>',
    { url: "http://reelay.test/", runScripts: "outside-only" });
  const { window } = dom; const { document } = window;
  const container = document.querySelector("#result"); const video = container.querySelector("video");
  const media = { paused: true, ended: false, duration: NaN, videoWidth: 0, videoHeight: 0 };
  for (const key of Object.keys(media)) Object.defineProperty(video, key, { configurable: true, get: () => media[key] });
  const calls = { play: 0, pause: 0, load: 0, enter: 0, exit: 0 };
  const emit = (name) => video.dispatchEvent(new window.Event(name));
  video.pause = () => { calls.pause++; media.paused = true; emit("pause"); };
  video.load = () => { calls.load++; };
  video.play = () => {
    calls.play++;
    if (options.play) return options.play({ media, emit });
    media.paused = false; media.ended = false; emit("playing"); return Promise.resolve();
  };
  let fullscreenElement = null;
  Object.defineProperty(document, "fullscreenElement", { get: () => fullscreenElement });
  if (options.fullscreen) {
    Object.defineProperty(document, "fullscreenEnabled", { get: () => options.fullscreen !== "disabled" });
    container.requestFullscreen = async () => {
      calls.enter++;
      if (options.fullscreen === "reject") throw new Error("not allowed");
      if (options.waitForFullscreen) await options.waitForFullscreen;
      fullscreenElement = container; document.dispatchEvent(new window.Event("fullscreenchange"));
    };
    document.exitFullscreen = async () => { calls.exit++; fullscreenElement = null; document.dispatchEvent(new window.Event("fullscreenchange")); };
  }
  const messages = [];
  window.eval(source);
  const mountOptions = { document, container, video, showMessage: (message) => messages.push(message) };
  const controller = window.REELAY_GENERATION_MEDIA.mount(mountOptions);
  t.after(() => { controller.dispose(); window.close(); });
  const element = (selector) => container.querySelector(selector);
  const click = (selector) => element(selector).click();
  function metadata(values = {}) { Object.assign(media, { duration: 11, videoWidth: 1280, videoHeight: 720 }, values); emit("loadedmetadata"); }
  function key(key, shiftKey = false) {
    const event = new window.KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true });
    element(".generation-media-seek").dispatchEvent(event); return event;
  }
  return { window, document, container, video, media, calls, messages, controller, mountOptions, emit, metadata, element, click, key };
}

test("mount enhances the existing video with muted paused controls and real dimensions without replacing its source", (t) => {
  const f = fixture(t);
  assert.equal(f.container.querySelectorAll("video").length, 1);
  assert.equal(f.video.getAttribute("src"), "/result.mp4");
  assert.equal(f.video.controls, false); assert.equal(f.video.muted, true); assert.equal(f.video.autoplay, false);
  assert.equal(f.video.playsInline, true); assert.equal(f.video.preload, "metadata");
  assert.equal(f.calls.play, 0); assert.equal(f.calls.load, 0);
  assert.equal(f.element(".generation-media-center").getAttribute("aria-label"), "播放生成视频");
  assert.equal(f.element(".generation-media-seek").disabled, true);
  assert.equal(f.element(".generation-media-resolution").hidden, true);
  f.metadata();
  assert.equal(f.element(".generation-media-resolution").textContent, "720p");
  assert.equal(f.element(".generation-media-resolution").getAttribute("aria-label"), "视频分辨率 1280 × 720");
  assert.equal(f.element("[data-media-duration]").textContent, "0:11");
  assert.equal(f.element(".generation-media-seek").disabled, false);
  f.metadata({ videoWidth: 540, videoHeight: 960 });
  assert.equal(f.element(".generation-media-resolution").textContent, "540p");
  f.metadata({ videoWidth: 3840, videoHeight: 2160 });
  assert.equal(f.element(".generation-media-resolution").textContent, "4K");
  f.metadata({ videoWidth: 1000, videoHeight: 1000 });
  assert.equal(f.element(".generation-media-resolution").textContent, "1000 × 1000");
});

test("central and bottom controls follow actual playback, seek, time and mute state", async (t) => {
  const f = fixture(t); f.metadata();
  f.click(".generation-media-center"); await settled();
  assert.equal(f.calls.play, 1); assert.equal(f.element(".generation-media-center").hidden, true);
  assert.equal(f.element(".generation-media-toggle").getAttribute("aria-label"), "暂停生成视频");
  f.video.currentTime = 4.5; f.emit("timeupdate");
  assert.equal(f.element("[data-media-current]").textContent, "0:04");
  assert.equal(f.element(".generation-media-seek").value, "4.5");
  f.element(".generation-media-seek").value = "8";
  f.element(".generation-media-seek").dispatchEvent(new f.window.Event("input", { bubbles: true }));
  assert.equal(f.video.currentTime, 8);
  f.click(".generation-media-toggle");
  assert.equal(f.calls.pause, 1); assert.equal(f.element(".generation-media-center").hidden, false);
  f.click(".generation-media-volume");
  assert.equal(f.video.muted, false); assert.equal(f.element(".generation-media-volume").getAttribute("aria-pressed"), "true");
  f.click(".generation-media-volume"); assert.equal(f.video.muted, true);
});

test("seek is keyboard accessible and clamps Home, End, arrows, large steps and paging", (t) => {
  const f = fixture(t); f.metadata({ duration: 100 });
  assert.equal(f.key("ArrowRight").defaultPrevented, true); assert.equal(f.video.currentTime, 1);
  f.key("ArrowRight", true); assert.equal(f.video.currentTime, 6);
  f.key("PageUp"); assert.equal(f.video.currentTime, 16);
  f.key("End"); assert.equal(f.video.currentTime, 100);
  f.key("ArrowRight"); assert.equal(f.video.currentTime, 100);
  f.key("Home"); assert.equal(f.video.currentTime, 0);
  f.key("ArrowLeft"); assert.equal(f.video.currentTime, 0);
  assert.equal(f.element(".generation-media-seek").getAttribute("aria-valuetext"), "0:00 / 1:40");
  f.metadata({ duration: Infinity });
  f.key("End"); assert.equal(f.video.currentTime, 0);
  assert.equal(f.element(".generation-media-seek").disabled, true);
});

test("sync and repeated mount retain playback position and control elements, including hour-long media", (t) => {
  const f = fixture(t); f.metadata({ duration: 7325 });
  f.video.currentTime = 3704; f.emit("timeupdate");
  const toggle = f.element(".generation-media-toggle");
  assert.equal(f.window.REELAY_GENERATION_MEDIA.mount(f.mountOptions), f.controller);
  f.controller.sync(); f.controller.sync();
  assert.equal(f.video.currentTime, 3704);
  assert.equal(f.container.querySelectorAll(".generation-media-overlay").length, 1);
  assert.equal(f.element(".generation-media-toggle"), toggle);
  assert.equal(f.element("[data-media-current]").textContent, "1:01:44");
  assert.equal(f.element("[data-media-duration]").textContent, "2:02:05");
  assert.equal(f.calls.play, 0); assert.equal(f.calls.load, 0);
});

test("ended media restarts from zero while a pending play can be canceled without a late error notice", async (t) => {
  const f = fixture(t); f.metadata();
  f.media.ended = true; f.video.currentTime = 11; f.emit("ended");
  assert.equal(f.element(".generation-media-center").getAttribute("aria-label"), "重新播放生成视频");
  f.click(".generation-media-center"); await settled(); assert.equal(f.video.currentTime, 0);

  let rejectPlay;
  const pending = fixture(t, { play: () => new Promise((_resolve, reject) => { rejectPlay = reject; }) });
  pending.click(".generation-media-center");
  assert.equal(pending.container.classList.contains("is-buffering"), true);
  assert.equal(pending.element(".generation-media-center").hidden, false, "pending feedback stays cancelable");
  pending.click(".generation-media-toggle");
  rejectPlay(new Error("late interruption")); await settled();
  assert.equal(pending.calls.pause, 1);
  assert.equal(pending.container.classList.contains("is-buffering"), false);
  assert.deepEqual(pending.messages, []);
});

test("play rejection and media network errors preserve retry controls without unhandled promises", async (t) => {
  const f = fixture(t, { play: () => Promise.reject(new Error("playback blocked")) });
  f.metadata(); f.click(".generation-media-center"); await settled();
  assert.equal(f.element(".generation-media-center").hidden, false);
  assert.match(f.messages[0], /暂时无法播放/);
  assert.equal(f.element(".generation-media-notice").hidden, false);
  f.emit("error");
  assert.equal(f.element(".generation-media-seek").disabled, true);
  f.click(".generation-media-center"); await settled();
  assert.equal(f.calls.load, 1);
  assert.equal(f.video.getAttribute("src"), "/result.mp4");
});

test("fullscreen is capability-gated, exits cleanly and reports denied requests", async (t) => {
  const unsupported = fixture(t);
  assert.equal(unsupported.element(".generation-media-fullscreen").hidden, true);
  const disabled = fixture(t, { fullscreen: "disabled" });
  assert.equal(disabled.element(".generation-media-fullscreen").hidden, true);
  const f = fixture(t, { fullscreen: true });
  f.click(".generation-media-fullscreen"); await settled();
  assert.equal(f.calls.enter, 1); assert.equal(f.document.fullscreenElement, f.container);
  assert.equal(f.element(".generation-media-fullscreen").getAttribute("aria-label"), "退出生成视频全屏");
  f.click(".generation-media-fullscreen"); await settled();
  assert.equal(f.calls.exit, 1); assert.equal(f.document.fullscreenElement, null);
  const denied = fixture(t, { fullscreen: "reject" });
  denied.click(".generation-media-fullscreen"); await settled();
  assert.match(denied.messages[0], /暂不支持全屏/);
});

test("dispose releases only its media and listeners, while deferred play errors stay silent", async (t) => {
  let rejectPlay;
  const f = fixture(t, { play: () => new Promise((_resolve, reject) => { rejectPlay = reject; }) });
  const current = f.element("[data-media-current]");
  const center = f.element(".generation-media-center");
  f.click(".generation-media-center");
  f.controller.dispose();
  f.controller.dispose();
  assert.equal(f.video.hasAttribute("src"), false); assert.equal(f.calls.pause, 1); assert.equal(f.calls.load, 1);
  assert.equal(f.container.querySelector(".generation-media-overlay"), null);
  assert.equal(f.container.classList.contains("generation-media-player"), false);
  f.video.currentTime = 20; f.emit("timeupdate");
  assert.equal(current.textContent, "0:00");
  center.click(); assert.equal(f.calls.play, 1);
  rejectPlay(new Error("after removal")); await settled(); assert.deepEqual(f.messages, []);
});

test("dispose can leave source ownership to the record view and cleans up its active fullscreen", async (t) => {
  const f = fixture(t, { fullscreen: true });
  f.metadata(); f.video.currentTime = 4;
  f.click(".generation-media-fullscreen"); await settled();
  f.controller.dispose({ releaseMedia: false }); await settled();
  assert.equal(f.calls.exit, 1); assert.equal(f.calls.pause, 0); assert.equal(f.calls.load, 0);
  assert.equal(f.video.getAttribute("src"), "/result.mp4"); assert.equal(f.video.currentTime, 4);
});

test("player handles only its own controls and leaves unrelated page keyboard events untouched", (t) => {
  const f = fixture(t); f.metadata();
  const received = [];
  f.document.addEventListener("keydown", (event) => received.push(event.key));
  f.element(".generation-media-toggle").dispatchEvent(new f.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  f.key("ArrowRight");
  f.document.body.dispatchEvent(new f.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  f.element(".generation-media-toggle").dispatchEvent(new f.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.deepEqual(received, ["Enter", "Escape"]);
});

test("buffering and network failure leave the central control actionable and recover with decoded media", async (t) => {
  const f = fixture(t); f.metadata();
  f.click(".generation-media-center"); await settled();
  f.emit("waiting");
  assert.equal(f.container.classList.contains("is-buffering"), true);
  assert.equal(f.element(".generation-media-center").hidden, false);
  f.emit("playing");
  assert.equal(f.container.classList.contains("is-buffering"), false);
  assert.equal(f.element(".generation-media-center").hidden, true);
  f.emit("error");
  assert.equal(f.media.paused, true);
  assert.equal(f.element(".generation-media-center").hidden, false);
  f.click(".generation-media-center"); await settled();
  f.emit("loadeddata");
  assert.equal(f.element(".generation-media-notice").hidden, true);
  assert.equal(f.element(".generation-media-seek").disabled, false);
});

test("a fullscreen request completing after record disposal immediately relinquishes its own fullscreen", async (t) => {
  let enter;
  const waitForFullscreen = new Promise((resolve) => { enter = resolve; });
  const f = fixture(t, { fullscreen: true, waitForFullscreen });
  f.click(".generation-media-fullscreen");
  f.controller.dispose({ releaseMedia: false });
  enter(); await settled();
  assert.equal(f.document.fullscreenElement, null);
  assert.equal(f.calls.exit, 1);
  assert.deepEqual(f.messages, []);
});
