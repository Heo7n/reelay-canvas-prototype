import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const source = await readFile(new URL("../src/legacy-canvas/canvas-audio-player.js", import.meta.url), "utf8");
const settlePlayback = () => new Promise((resolve) => setImmediate(resolve));

function fixture(t, { ready = true, initialDuration, mediaDuration = 20, sourceUrl = "/audio.wav" } = {}) {
  const dom = new JSDOM('<!doctype html><body><div id="root"></div><button id="outside">outside</button></body>', {
    runScripts: "outside-only", url: "https://reelay.test/",
  });
  const view = dom.window;
  const document = view.document;
  const root = document.querySelector("#root");
  const states = new WeakMap();
  const frames = new Map();
  const captures = [];
  let sequence = 0;
  let timestamp = 0;
  let spaceDown = false;
  function mediaState(audio) {
    if (!states.has(audio)) states.set(audio, {
      duration: mediaDuration, currentTime: 0, readyState: ready ? 1 : 0, paused: true, ended: false,
      error: null, plays: 0, pauses: 0, loads: 0, playMode: "resolve", resolves: [],
    });
    return states.get(audio);
  }
  for (const field of ["duration", "currentTime", "readyState", "paused", "ended", "error"]) {
    Object.defineProperty(view.HTMLMediaElement.prototype, field, {
      configurable: true,
      get() { return mediaState(this)[field]; },
      set(value) {
        mediaState(this)[field] = value;
        if (field === "currentTime") mediaState(this).ended = false;
      },
    });
  }
  view.HTMLMediaElement.prototype.play = function play() {
    const state = mediaState(this);
    state.plays++;
    if (state.playMode === "reject") return Promise.reject(new Error("unavailable"));
    state.paused = false;
    state.ended = false;
    this.dispatchEvent(new view.Event("play"));
    this.dispatchEvent(new view.Event("playing"));
    if (state.playMode === "pending") return new Promise((resolve) => state.resolves.push(resolve));
    return Promise.resolve();
  };
  view.HTMLMediaElement.prototype.pause = function pause() {
    const state = mediaState(this);
    state.pauses++;
    if (state.paused) return;
    state.paused = true;
    this.dispatchEvent(new view.Event("pause"));
  };
  view.HTMLMediaElement.prototype.load = function load() { mediaState(this).loads++; };
  view.requestAnimationFrame = (callback) => { const id = ++sequence; frames.set(id, callback); return id; };
  view.cancelAnimationFrame = (id) => frames.delete(id);
  view.HTMLElement.prototype.setPointerCapture = function capture(pointerId) { captures.push([this, pointerId]); };
  view.HTMLElement.prototype.releasePointerCapture = function release(pointerId) { captures.push([this, -pointerId]); };
  view.eval(source);
  const api = view.REELAY_CANVAS_AUDIO_PLAYER;
  function add({ duration = initialDuration, url = sourceUrl } = {}) {
    const node = document.createElement("section");
    node.className = "canvas-node";
    node.dataset.id = `node-${root.children.length}`;
    node.innerHTML = api.render({ safeUrl: url, duration });
    root.append(node);
    const audio = node.querySelector("audio");
    const timeline = node.querySelector("[data-audio-progress]");
    const overview = node.querySelector("[data-audio-overview]");
    timeline.getBoundingClientRect = () => ({ left: 100, top: 100, width: 200, height: 80, right: 300, bottom: 180 });
    overview.getBoundingClientRect = () => ({ left: 100, top: 200, width: 200, height: 16, right: 300, bottom: 216 });
    return {
      node, audio, timeline, overview, content: node.querySelector(".media-content"),
      navigation: node.querySelector(".audio-navigation"),
      button: node.querySelector("[data-audio-toggle]"), head: node.querySelector("[data-audio-playhead]"),
      current: node.querySelector("[data-audio-current]"), duration: node.querySelector("[data-audio-duration]"),
      state: audio ? mediaState(audio) : null,
    };
  }
  const first = add();
  const controller = api.createController({ document, root, isSpaceDown: () => spaceDown });
  t.after(() => { controller.dispose(); view.close(); });
  function pointer(type, target, options = {}) {
    const event = new view.MouseEvent(type, { bubbles: true, cancelable: true, clientX: 200, clientY: 130, button: 0, ...options });
    Object.defineProperty(event, "pointerId", { value: options.pointerId ?? 1 });
    Object.defineProperty(event, "isPrimary", { value: options.isPrimary ?? true });
    target.dispatchEvent(event);
    return event;
  }
  function key(target, key, options = {}) {
    const event = new view.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options });
    target.dispatchEvent(event);
    return event;
  }
  function click(target, type = "click") {
    const event = new view.MouseEvent(type, { bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  }
  function media(type, target = first.audio) { target.dispatchEvent(new view.Event(type)); }
  function grabHead(options = {}) {
    const bounds = first.timeline.getBoundingClientRect();
    const duration = Number.isFinite(first.state.duration) && first.state.duration > 0 ? first.state.duration : 0;
    const span = duration > 60 ? 30 : duration;
    const start = (Number.parseFloat(first.content.style.getPropertyValue("--audio-window-start")) || 0) / 100 * duration;
    const current = Math.max(0, Math.min(duration, first.state.currentTime));
    return pointer("pointerdown", first.head, {
      clientX: bounds.left + (span ? (current - start) / span : 0) * bounds.width, ...options,
    });
  }
  function flushFrame(elapsed = 16) {
    timestamp += elapsed;
    for (const [id, callback] of [...frames]) if (frames.delete(id)) callback(timestamp);
  }
  return {
    ...first, view, document, root, api, controller, add, pointer, grabHead, key, click, media, flushFrame, frames, captures,
    setSpace(value) { spaceDown = value; },
  };
}

test("node markup moves elapsed and total time inside, with stable duplicated bars and metadata-only media", (t) => {
  const f = fixture(t);
  assert.equal(f.audio.preload, "metadata");
  assert.equal(f.audio.controls, false);
  assert.equal(f.head.getAttribute("role"), "slider");
  assert.equal(f.head.tabIndex, 0);
  assert.equal(f.head.hasAttribute("aria-hidden"), false);
  assert.equal(f.timeline.hasAttribute("role"), false);
  assert.equal(f.timeline.hasAttribute("tabindex"), false);
  const tracks = f.node.querySelectorAll(".audio-track");
  assert.equal(tracks.length, 2);
  assert.equal(tracks[0].innerHTML, tracks[1].innerHTML);
  assert.equal(tracks[0].querySelectorAll("i").length, 64);
  assert.equal(f.current.textContent, "00:00");
  assert.equal(f.duration.textContent, "00:20");
  assert.equal(f.node.querySelectorAll("video, img").length, 0);
  assert.equal(f.frames.size, 0);
});

test("fallback duration is presentation only until media metadata is ready", (t) => {
  const f = fixture(t, { ready: false, initialDuration: 45 });
  assert.equal(f.duration.textContent, "00:45");
  assert.equal(f.head.getAttribute("aria-disabled"), "true");
  assert.equal(f.button.disabled, true);
  f.grabHead();
  f.pointer("pointermove", f.document, { clientX: 250 });
  f.key(f.head, "End");
  f.click(f.button);
  assert.equal(f.state.currentTime, 0);
  assert.equal(f.state.plays, 0);
  assert.equal(f.captures.length, 0);
  f.state.readyState = 1;
  f.media("loadedmetadata");
  assert.equal(f.duration.textContent, "00:20");
  assert.equal(f.button.disabled, false);
  assert.equal(f.head.getAttribute("aria-valuemax"), "20");
});

test("unknown or failed metadata keeps controls disabled and cannot leave a misleading progress value", (t) => {
  const f = fixture(t, { ready: false });
  f.state.duration = Number.NaN;
  f.media("loadedmetadata");
  assert.equal(f.duration.textContent, "--:--");
  f.state.readyState = 1;
  f.state.duration = 20;
  f.state.currentTime = 7;
  f.media("loadedmetadata");
  assert.equal(f.current.textContent, "00:07");
  f.state.error = { code: 4 };
  f.media("error");
  assert.equal(f.current.textContent, "00:00");
  assert.equal(f.duration.textContent, "--:--");
  assert.equal(f.button.disabled, true);
  assert.match(f.node.querySelector("[data-audio-status]").textContent, /失败/);
  assert.equal(f.frames.size, 0);
});

test("dragging the line uses rendered waveform width at 20%, 100%, and 200% scale and clamps to its edges", (t) => {
  const f = fixture(t);
  for (const width of [40, 200, 400]) {
    f.timeline.getBoundingClientRect = () => ({ left: 100, width });
    const before = f.state.currentTime;
    f.grabHead();
    assert.equal(f.state.currentTime, before);
    f.pointer("pointermove", f.document, { clientX: 100 + width * 0.75 });
    assert.equal(f.state.currentTime, 15);
    assert.equal(f.head.getAttribute("aria-valuenow"), "15");
    assert.equal(f.content.style.getPropertyValue("--audio-progress"), "75.0000%");
    f.pointer("pointermove", f.document, { clientX: 100 + width + 40 });
    assert.equal(f.state.currentTime, 20);
    f.pointer("pointermove", f.document, { clientX: 0 });
    assert.equal(f.state.currentTime, 0);
    f.pointer("pointerup", f.document, { clientX: 100 + width * 0.5 });
    assert.equal(f.state.currentTime, 10);
  }
  assert.equal(f.state.plays, 0);
  assert.equal(f.frames.size, 0);
});

test("dragging the wider playhead preserves its grab offset instead of jumping on pointerdown", (t) => {
  const f = fixture(t);
  f.state.currentTime = 5;
  f.media("timeupdate");
  f.pointer("pointerdown", f.head, { clientX: 157 });
  assert.equal(f.state.currentTime, 5);
  f.pointer("pointermove", f.document, { clientX: 207 });
  assert.equal(f.state.currentTime, 10);
  f.pointer("pointerup", f.document, { clientX: 207 });
  assert.equal(f.state.currentTime, 10);
  assert.equal(f.state.paused, true);
  assert.equal(f.content.classList.contains("scrubbing"), false);
  assert.deepEqual(f.captures.map(([, id]) => id), [1, -1]);
});

test("playing scrubs pause while moving and resume once; paused scrubs stay paused", async (t) => {
  const f = fixture(t);
  f.click(f.button);
  await Promise.resolve();
  assert.equal(f.state.paused, false);
  assert.equal(f.frames.size, 1);
  f.grabHead();
  assert.equal(f.state.paused, true);
  assert.equal(f.frames.size, 0);
  assert.equal(f.content.classList.contains("scrubbing"), true);
  f.pointer("pointerup", f.document, { clientX: 180 });
  await Promise.resolve();
  assert.equal(f.state.currentTime, 8);
  assert.equal(f.state.plays, 2);
  assert.equal(f.state.paused, false);
  f.click(f.button);
  f.grabHead();
  f.pointer("pointerup", f.document, { clientX: 170 });
  assert.equal(f.state.plays, 2);
  assert.equal(f.state.paused, true);
  assert.equal(f.frames.size, 0);
});

test("scrubbing a playing clip to its exact end retains the endpoint rather than restarting", async (t) => {
  const f = fixture(t);
  f.click(f.button);
  await settlePlayback();
  f.grabHead();
  f.pointer("pointerup", f.document, { clientX: 300 });
  assert.equal(f.state.currentTime, 20);
  assert.equal(f.state.paused, true);
  assert.equal(f.state.plays, 1);
  assert.equal(f.frames.size, 0);
  f.click(f.button);
  assert.equal(f.state.currentTime, 0);
});

test("cancel, lost capture, and window blur end the scrub without accidental playback", async (t) => {
  const f = fixture(t);
  for (const ending of ["pointercancel", "lostpointercapture", "blur"]) {
    f.click(f.button);
    await Promise.resolve();
    f.grabHead();
    const plays = f.state.plays;
    if (ending === "blur") f.view.dispatchEvent(new f.view.Event("blur"));
    else f.pointer(ending, f.head);
    f.pointer("pointerup", f.document, { clientX: 200 });
    assert.equal(f.state.paused, true);
    assert.equal(f.state.plays, plays);
    assert.equal(f.content.classList.contains("scrubbing"), false);
    assert.equal(f.frames.size, 0);
  }
});

test("non-primary, Alt, and held-Space pointer gestures bypass audio controls for canvas navigation", (t) => {
  const f = fixture(t);
  let nodeDrags = 0;
  f.node.addEventListener("pointerdown", () => { nodeDrags++; });
  for (const options of [{ button: 1 }, { button: 2 }, { isPrimary: false }, { altKey: true }]) {
    assert.equal(f.grabHead(options).defaultPrevented, false);
  }
  f.setSpace(true);
  assert.equal(f.grabHead().defaultPrevented, false);
  f.setSpace(false);
  assert.equal(nodeDrags, 5);
  assert.equal(f.state.currentTime, 0);
  assert.equal(f.grabHead().defaultPrevented, true);
  assert.equal(nodeDrags, 5);
  f.pointer("pointercancel", f.head);
});

test("releasing Space before pointerup cannot turn a canvas pan into a play-button click", (t) => {
  const f = fixture(t);
  f.setSpace(true);
  f.pointer("pointerdown", f.button);
  f.setSpace(false);
  f.pointer("pointerup", f.button);
  f.click(f.button);
  assert.equal(f.state.plays, 0);
  f.pointer("pointerdown", f.button);
  f.pointer("pointerup", f.button);
  f.click(f.button);
  assert.equal(f.state.plays, 1);
});

test("keyboard seek is local, uses seconds, and supports fine/coarse steps and playback", async (t) => {
  const f = fixture(t);
  let canvasKeys = 0;
  f.document.addEventListener("keydown", () => { canvasKeys++; });
  f.key(f.head, "ArrowRight");
  assert.equal(f.state.currentTime, 1);
  f.key(f.head, "ArrowRight", { shiftKey: true });
  assert.equal(f.state.currentTime, 6);
  f.key(f.head, "ArrowLeft");
  assert.equal(f.state.currentTime, 5);
  f.key(f.head, "End");
  assert.equal(f.state.currentTime, 20);
  f.key(f.head, "Home");
  assert.equal(f.state.currentTime, 0);
  f.key(f.head, " ");
  await Promise.resolve();
  assert.equal(f.state.plays, 1);
  f.key(f.head, " ", { repeat: true });
  assert.equal(f.state.paused, false);
  f.key(f.head, "Enter");
  assert.equal(f.state.paused, true);
  assert.equal(canvasKeys, 0);
  f.key(f.head, "ArrowRight", { altKey: true });
  assert.equal(canvasKeys, 1);
  assert.equal(f.state.currentTime, 0);
});

test("natural end retains the final time and progress until explicit replay starts at zero", async (t) => {
  const f = fixture(t);
  f.click(f.button);
  await Promise.resolve();
  f.state.currentTime = 20;
  f.state.ended = true;
  f.state.paused = true;
  f.media("ended");
  assert.equal(f.current.textContent, "00:20");
  assert.equal(f.content.style.getPropertyValue("--audio-progress"), "100.0000%");
  assert.equal(f.frames.size, 0);
  assert.equal(f.button.getAttribute("aria-label"), "播放音频");
  f.click(f.button);
  await Promise.resolve();
  assert.equal(f.state.currentTime, 0);
  assert.equal(f.state.plays, 2);
});

test("rejected play reports a retryable state and does not leave a playing icon or animation loop", async (t) => {
  const f = fixture(t);
  f.state.playMode = "reject";
  f.click(f.button);
  await settlePlayback();
  assert.equal(f.state.paused, true);
  assert.equal(f.content.classList.contains("playing"), false);
  assert.match(f.button.getAttribute("aria-label"), /重新/);
  assert.match(f.node.querySelector("[data-audio-status]").textContent, /失败/);
  assert.equal(f.frames.size, 0);
  f.state.playMode = "resolve";
  f.click(f.button);
  await Promise.resolve();
  assert.equal(f.state.paused, false);
  assert.equal(f.node.querySelector("[data-audio-status]").textContent, "");
});

test("multiple playing nodes share one frame loop and idle nodes have no repeated work", async (t) => {
  const f = fixture(t);
  const second = f.add();
  f.controller.sync();
  assert.equal(f.frames.size, 0);
  f.click(f.button);
  f.click(second.button);
  await Promise.resolve();
  assert.equal(f.frames.size, 1);
  f.state.currentTime = 3;
  second.state.currentTime = 7;
  f.flushFrame();
  assert.equal(f.current.textContent, "00:03");
  assert.equal(second.current.textContent, "00:07");
  assert.equal(f.frames.size, 1);
  f.click(f.button);
  assert.equal(f.frames.size, 1);
  f.click(second.button);
  assert.equal(f.frames.size, 0);
});

test("repeated reconciliation preserves the actual player and does not duplicate handlers", async (t) => {
  const f = fixture(t);
  for (let index = 0; index < 8; index++) f.controller.sync();
  f.click(f.button);
  await Promise.resolve();
  assert.equal(f.state.plays, 1);
  f.state.currentTime = 4;
  for (let index = 0; index < 8; index++) f.controller.sync();
  assert.equal(f.state.currentTime, 4);
  assert.equal(f.frames.size, 1);
  assert.equal(f.root.querySelector("audio"), f.audio);
  f.click(f.button);
  assert.equal(f.state.paused, true);
});

test("removing a scrubbing node and replacing its ID does not resume or inherit the old player", async (t) => {
  const f = fixture(t);
  f.click(f.button);
  await Promise.resolve();
  f.grabHead();
  const plays = f.state.plays;
  f.node.remove();
  const replacement = f.add();
  replacement.node.dataset.id = f.node.dataset.id;
  f.controller.sync();
  f.pointer("pointerup", f.document, { clientX: 250 });
  assert.equal(f.state.plays, plays);
  assert.equal(f.state.paused, true);
  assert.equal(replacement.state.currentTime, 0);
  assert.equal(replacement.state.plays, 0);
  assert.equal(f.frames.size, 0);
  assert.equal(f.content.classList.contains("scrubbing"), false);
});

test("a pending play resolving after node replacement cannot revive a detached media", async (t) => {
  const f = fixture(t);
  f.state.playMode = "pending";
  f.click(f.button);
  f.node.remove();
  const replacement = f.add();
  f.controller.sync();
  f.state.paused = false;
  f.state.resolves[0]();
  await settlePlayback();
  assert.equal(f.state.paused, true);
  assert.equal(replacement.state.plays, 0);
  assert.equal(f.frames.size, 0);
  assert.equal(f.audio.hasAttribute("src"), false);
  assert.equal(f.state.loads, 1);
});

test("changing the source on the same media invalidates old playback and metadata state", async (t) => {
  const f = fixture(t);
  f.state.playMode = "pending";
  f.click(f.button);
  f.audio.setAttribute("src", "/replacement.wav");
  f.state.readyState = 0;
  f.controller.sync();
  f.state.resolves[0]();
  await Promise.resolve();
  assert.equal(f.state.paused, true);
  assert.equal(f.button.disabled, true);
  assert.equal(f.frames.size, 0);
  assert.equal(f.audio.getAttribute("src"), "/replacement.wav");
});

test("an older source's pending play completion does not pause the new source's active owner", async (t) => {
  const f = fixture(t);
  f.state.playMode = "pending";
  f.click(f.button);
  f.audio.setAttribute("src", "/replacement.wav");
  f.controller.sync();
  f.state.playMode = "resolve";
  f.click(f.button);
  await settlePlayback();
  f.state.resolves[0]();
  await settlePlayback();
  assert.equal(f.state.paused, false);
  assert.equal(f.frames.size, 1);
  assert.equal(f.audio.getAttribute("src"), "/replacement.wav");
});

test("blur and disposal stop playback, release capture, remove listeners, and leave business state untouched", async (t) => {
  const f = fixture(t);
  f.view.state = { nodes: [{ id: "existing", x: 120, assets: [] }], credits: 3000, history: [] };
  const before = JSON.stringify(f.view.state);
  f.click(f.button);
  await Promise.resolve();
  f.view.dispatchEvent(new f.view.Event("blur"));
  assert.equal(f.state.paused, true);
  assert.equal(f.frames.size, 0);
  f.click(f.button);
  await Promise.resolve();
  f.grabHead();
  f.controller.dispose();
  const plays = f.state.plays;
  f.pointer("pointerup", f.document);
  f.click(f.button);
  f.key(f.head, "Enter");
  f.controller.sync();
  assert.equal(f.state.plays, plays);
  assert.equal(f.frames.size, 0);
  assert.equal(f.content.classList.contains("scrubbing"), false);
  assert.equal(JSON.stringify(f.view.state), before);
});

function windowStart(f) {
  return Number.parseFloat(f.content.style.getPropertyValue("--audio-window-start")) / 100 * f.state.duration;
}

function assertNear(actual, expected, tolerance = 0.001) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} should be near ${expected}`);
}

test("clips through sixty seconds retain a full view; longer clips expose a thirty-second window", (t) => {
  const f = fixture(t, { mediaDuration: 60 });
  assert.equal(f.navigation.hidden, true);
  assert.equal(f.content.classList.contains("audio-windowed"), false);
  assert.equal(f.content.style.getPropertyValue("--audio-window-width"), "100.000000%");
  f.state.duration = 61;
  f.media("durationchange");
  assert.equal(f.navigation.hidden, false);
  assert.equal(f.content.classList.contains("audio-windowed"), true);
  assert.equal(f.node.querySelector("[data-audio-range-start]").textContent, "00:00");
  assert.equal(f.node.querySelector("[data-audio-range-middle]").textContent, "00:15");
  assert.equal(f.node.querySelector("[data-audio-range-end]").textContent, "00:30");
  assertNear(Number.parseFloat(f.content.style.getPropertyValue("--audio-window-width")), 30 / 61 * 100);
  assert.equal(f.node.querySelectorAll(".audio-track-bars i").length, 132);
  assert.equal(f.frames.size, 0);
  f.state.duration = 25;
  f.media("durationchange");
  assert.equal(f.navigation.hidden, true);
  assert.equal(f.node.querySelectorAll(".audio-track-bars i").length, 128);
});

test("hour-long media use constant-size waveform DOM and a precise global overview", (t) => {
  const f = fixture(t, { mediaDuration: 3600 });
  assert.equal(f.duration.textContent, "1:00:00");
  assertNear(Number.parseFloat(f.content.style.getPropertyValue("--audio-window-width")), 30 / 3600 * 100);
  f.pointer("pointerdown", f.overview, { clientX: 200 });
  f.pointer("pointerup", f.overview, { clientX: 200 });
  assert.equal(f.state.currentTime, 1800);
  assertNear(windowStart(f), 1785);
  assert.equal(f.node.querySelector("[data-audio-range-start]").textContent, "29:45");
  assert.equal(f.node.querySelector("[data-audio-range-middle]").textContent, "30:00");
  assert.equal(f.node.querySelector("[data-audio-range-end]").textContent, "30:15");
  assert.equal(f.content.style.getPropertyValue("--audio-progress"), "50.0000%");
  assert.equal(f.content.style.getPropertyValue("--audio-overview-progress"), "50.0000%");
  assert.equal(f.node.querySelectorAll(".audio-track-bars i").length, 132);
  assert.equal(f.state.paused, true);
  assert.equal(f.frames.size, 0);
});

test("dragging the line seeks within its existing local window at every canvas scale", (t) => {
  const f = fixture(t, { mediaDuration: 3600 });
  f.pointer("pointerdown", f.overview, { clientX: 200 });
  f.pointer("pointerup", f.overview, { clientX: 200 });
  for (const width of [40, 200, 400]) {
    f.timeline.getBoundingClientRect = () => ({ left: 100, width });
    f.grabHead();
    f.pointer("pointermove", f.document, { clientX: 100 + width * 0.25 });
    assertNear(f.state.currentTime, 1792.5);
    assertNear(windowStart(f), 1785);
    f.pointer("pointerup", f.document, { clientX: 100 + width * 0.75 });
    assertNear(f.state.currentTime, 1807.5);
    assertNear(windowStart(f), 1785);
  }
  assert.equal(f.frames.size, 0);
});

test("overview dragging clamps to the whole clip and honors playing versus paused state", async (t) => {
  const f = fixture(t, { mediaDuration: 3600 });
  f.click(f.button);
  await settlePlayback();
  f.pointer("pointerdown", f.overview, { clientX: 150 });
  assert.equal(f.state.currentTime, 900);
  assert.equal(f.state.paused, true);
  f.pointer("pointermove", f.document, { clientX: 250 });
  assert.equal(f.state.currentTime, 2700);
  f.pointer("pointerup", f.document, { clientX: 250 });
  await settlePlayback();
  assert.equal(f.state.paused, false);
  f.pointer("pointerdown", f.overview, { clientX: 1000 });
  assert.equal(f.state.currentTime, 3600);
  assertNear(windowStart(f), 3570);
  f.pointer("pointerup", f.document, { clientX: 1000 });
  assert.equal(f.state.paused, true);
  assert.equal(f.current.textContent, "1:00:00");
  f.pointer("pointerdown", f.overview, { clientX: -100 });
  f.pointer("pointerup", f.document, { clientX: -100 });
  assert.equal(f.state.currentTime, 0);
  assertNear(windowStart(f), 0);
});

test("playback follows beyond eighty percent smoothly while paused reads retain their window", async (t) => {
  const f = fixture(t, { mediaDuration: 120 });
  f.state.currentTime = 23;
  f.media("timeupdate");
  f.click(f.button);
  await settlePlayback();
  f.flushFrame();
  assertNear(windowStart(f), 0);
  f.state.currentTime = 26;
  f.flushFrame();
  const first = windowStart(f);
  assert.ok(first > 0 && first < 2, "a seek near the edge eases into following instead of jumping");
  for (let index = 0; index < 45; index++) f.flushFrame();
  assertNear(windowStart(f), 2);
  assertNear(Number.parseFloat(f.content.style.getPropertyValue("--audio-progress")), 80);
  f.click(f.button);
  f.state.currentTime = 29;
  f.media("timeupdate");
  assertNear(windowStart(f), 2);
  assert.equal(f.frames.size, 0);
});

test("overlapping windows preserve absolute waveform samples and continuously translate between sample boundaries", (t) => {
  const f = fixture(t, { mediaDuration: 120 });
  const samples = () => [...f.node.querySelectorAll(".audio-track:not(.audio-track-played) i")].map((bar) => bar.style.getPropertyValue("--h"));
  const before = samples();
  const originalBars = new Set(f.node.querySelectorAll(".audio-track-bars i"));
  const step = 30 / 64;
  f.state.currentTime = 29.7;
  f.media("timeupdate");
  f.pointer("pointerdown", f.head, { clientX: 298 });
  f.pointer("pointermove", f.document, { clientX: 300 });
  for (let index = 0; index < 2; index++) f.flushFrame();
  const afterStart = windowStart(f);
  assert.ok(afterStart > step && afterStart < step * 2);
  const after = samples();
  assert.deepEqual(after.slice(0, 65), before.slice(1));
  assert.ok([...f.node.querySelectorAll(".audio-track-bars i")].every((bar) => originalBars.has(bar)), "moving a window recycles the same fixed-size bar buffer");
  const first = f.node.querySelector(".audio-track-bars");
  const played = f.node.querySelector(".audio-track-played .audio-track-bars");
  assert.equal(first.innerHTML, played.innerHTML);
  const shift = Number.parseFloat(f.content.style.getPropertyValue("--audio-waveform-shift"));
  assert.ok(shift < -100 / 66 && shift > -200 / 66);
  f.pointer("pointercancel", f.head);
});

test("holding the grabbed line at either edge continuously pans and seeks without more pointermove events", (t) => {
  const f = fixture(t, { mediaDuration: 3600 });
  f.pointer("pointerdown", f.overview, { clientX: 200 });
  f.pointer("pointerup", f.overview, { clientX: 200 });
  f.pointer("pointerdown", f.head, { clientX: 200 });
  f.pointer("pointermove", f.document, { clientX: 299 });
  const initialRight = f.state.currentTime;
  assert.equal(f.frames.size, 1);
  for (let index = 0; index < 12; index++) f.flushFrame();
  assert.ok(f.state.currentTime > initialRight + 2);
  assert.ok(windowStart(f) > 1787);
  const afterRight = f.state.currentTime;
  f.pointer("pointermove", f.document, { clientX: 101 });
  const initialLeft = f.state.currentTime;
  for (let index = 0; index < 12; index++) f.flushFrame();
  assert.ok(f.state.currentTime < initialLeft - 2);
  assert.ok(f.state.currentTime < afterRight);
  f.pointer("pointermove", f.document, { clientX: 200 });
  assert.equal(f.frames.size, 0, "moving back into the middle stops the edge loop immediately");
  f.pointer("pointerup", f.document, { clientX: 200 });
  assert.equal(f.state.paused, true);
});

test("edge pan uses rendered coordinates after zoom and stops at the global beginning or end", (t) => {
  const f = fixture(t, { mediaDuration: 61 });
  f.timeline.getBoundingClientRect = () => ({ left: 100, width: 40 });
  f.grabHead();
  f.pointer("pointermove", f.document, { clientX: 140 });
  assert.equal(f.state.currentTime, 30);
  for (let index = 0; index < 150; index++) f.flushFrame();
  assertNear(windowStart(f), 31);
  assertNear(f.state.currentTime, 61);
  assert.equal(f.frames.size, 0, "there is no idle frame after reaching the clip boundary");
  f.pointer("pointermove", f.document, { clientX: 100 });
  assert.equal(f.frames.size, 1);
  for (let index = 0; index < 150; index++) f.flushFrame();
  assertNear(windowStart(f), 0);
  assertNear(f.state.currentTime, 0);
  assert.equal(f.frames.size, 0);
  f.pointer("pointercancel", f.head);
});

test("edge seeking and another playing node share one frame and cancellation releases only the scrub work", async (t) => {
  const f = fixture(t, { mediaDuration: 180 });
  const second = f.add();
  f.controller.sync();
  f.click(second.button);
  await settlePlayback();
  f.grabHead();
  f.pointer("pointermove", f.document, { clientX: 300 });
  assert.equal(f.frames.size, 1);
  f.flushFrame();
  const current = f.state.currentTime;
  f.pointer("pointercancel", f.head);
  f.flushFrame();
  assert.equal(f.state.currentTime, current);
  assert.equal(f.frames.size, 1);
  f.click(second.button);
  assert.equal(f.frames.size, 0);
});

test("edge loops stop on release, capture loss, blur, and node removal and never restart from stale pointers", (t) => {
  const f = fixture(t, { mediaDuration: 180 });
  for (const finish of ["pointerup", "pointercancel", "lostpointercapture", "blur"]) {
    f.grabHead();
    f.pointer("pointermove", f.document, { clientX: 300 });
    f.flushFrame();
    if (finish === "blur") f.view.dispatchEvent(new f.view.Event("blur"));
    else f.pointer(finish, f.head, { clientX: 300 });
    const current = f.state.currentTime;
    f.pointer("pointermove", f.document, { clientX: 300 });
    f.flushFrame();
    assert.equal(f.state.currentTime, current);
    assert.equal(f.frames.size, 0);
    assert.equal(f.state.paused, true);
  }
  f.grabHead();
  f.pointer("pointermove", f.document, { clientX: 300 });
  f.node.remove();
  f.controller.sync();
  assert.equal(f.frames.size, 0);
  assert.equal(f.audio.hasAttribute("src"), false);
  assert.equal(f.content.classList.contains("scrubbing"), false);
});

test("overview keyboard navigation remains local and wheel navigation continues to the canvas", (t) => {
  const f = fixture(t, { mediaDuration: 3600 });
  let keys = 0;
  let wheels = 0;
  f.document.addEventListener("keydown", () => { keys++; });
  f.document.addEventListener("wheel", () => { wheels++; });
  f.key(f.overview, "End");
  assert.equal(f.state.currentTime, 3600);
  assertNear(windowStart(f), 3570);
  f.key(f.overview, "ArrowLeft", { shiftKey: true });
  assert.equal(f.state.currentTime, 3595);
  f.key(f.overview, "Home");
  assert.equal(f.state.currentTime, 0);
  assertNear(windowStart(f), 0);
  assert.equal(keys, 0);
  for (const target of [f.timeline, f.overview]) {
    const event = new f.view.WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 50 });
    target.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
  }
  assert.equal(wheels, 2);
});

test("queued pause or ended events cannot override a newer scrub-resume or replay request", async (t) => {
  const f = fixture(t, { mediaDuration: 120 });
  f.click(f.button);
  await settlePlayback();
  const queue = [];
  f.audio.pause = () => {
    f.state.pauses++;
    if (!f.state.paused) { f.state.paused = true; queue.push("pause"); }
  };
  f.audio.play = () => {
    f.state.plays++;
    f.state.paused = false;
    f.state.ended = false;
    queue.push("play", "playing");
    return Promise.resolve();
  };
  f.grabHead();
  f.pointer("pointerup", f.document, { clientX: 200 });
  assert.deepEqual(queue, ["pause", "play", "playing"]);
  while (queue.length) f.media(queue.shift());
  await settlePlayback();
  assert.equal(f.state.paused, false);
  assert.equal(f.state.plays, 2);
  assert.equal(f.frames.size, 1);
  assert.equal(f.content.classList.contains("playing"), true);
  f.media("ended");
  assert.equal(f.state.paused, false, "an earlier ended event must not stop active playback");
  assert.equal(f.frames.size, 1);
  f.click(f.button);
  f.media("play");
  f.media("playing");
  assert.equal(f.state.paused, true, "older play events must not revive a paused clip");
  assert.equal(f.frames.size, 0);
});

test("waveform background, bars, and blank surface leave selection, dragging, and double-click to the node", async (t) => {
  const f = fixture(t);
  const nodeEvents = [];
  for (const type of ["pointerdown", "click", "dblclick", "keydown"]) {
    f.node.addEventListener(type, (event) => nodeEvents.push(event.type));
  }
  f.state.currentTime = 8;
  f.media("timeupdate");
  for (const playing of [false, true]) {
    if (playing) { f.click(f.button); await settlePlayback(); }
    const pauses = f.state.pauses;
    const plays = f.state.plays;
    const targets = [f.timeline, f.node.querySelector(".audio-waveform"),
      f.node.querySelector(".audio-track"), f.node.querySelector(".audio-track i")];
    nodeEvents.length = 0;
    for (const target of targets) {
      assert.equal(f.pointer("pointerdown", target, { clientX: 270 }).defaultPrevented, false);
      assert.equal(f.pointer("pointermove", f.document, { clientX: 290 }).defaultPrevented, false);
      assert.equal(f.pointer("pointerup", f.document, { clientX: 290 }).defaultPrevented, false);
      assert.equal(f.click(target).defaultPrevented, false);
      assert.equal(f.click(target, "dblclick").defaultPrevented, false);
    }
    assert.deepEqual(nodeEvents, Array.from({ length: targets.length }, () => ["pointerdown", "click", "dblclick"]).flat());
    assert.equal(f.key(f.timeline, "End").defaultPrevented, false);
    assert.equal(nodeEvents.at(-1), "keydown");
    assert.equal(f.state.currentTime, 8);
    assert.equal(f.state.pauses, pauses);
    assert.equal(f.state.plays, plays);
    assert.equal(f.state.paused, !playing);
    assert.equal(f.captures.length, 0);
    assert.equal(f.frames.size, playing ? 1 : 0);
    assert.equal(f.content.classList.contains("scrubbing"), false);
  }
});

test("clicking or slightly moving the head does not seek or pan until it is dragged horizontally", (t) => {
  const f = fixture(t, { mediaDuration: 180 });
  f.state.currentTime = 29.7;
  f.media("timeupdate");
  f.grabHead();
  assert.equal(f.frames.size, 0, "holding a line near an edge does not begin navigation");
  f.pointer("pointermove", f.document, { clientX: 299 });
  f.flushFrame();
  assert.equal(f.state.currentTime, 29.7);
  assertNear(windowStart(f), 0);
  assert.equal(f.frames.size, 0);
  f.pointer("pointerup", f.document, { clientX: 299 });
  assert.equal(f.state.currentTime, 29.7);
  f.grabHead();
  f.pointer("pointermove", f.document, { clientX: 300 });
  f.flushFrame();
  assert.ok(f.state.currentTime > 30);
  assert.ok(windowStart(f) > 0);
  f.pointer("pointercancel", f.head);
  assert.equal(f.frames.size, 0);
});

test("playhead and overview own their focus and capture while changing between them preserves scrubbing", (t) => {
  const f = fixture(t, { mediaDuration: 180 });
  const outside = f.document.querySelector("#outside");
  outside.focus();
  f.timeline.focus();
  assert.equal(f.document.activeElement, outside, "the waveform surface is not an independent keyboard control");
  f.grabHead();
  assert.equal(f.document.activeElement, f.head);
  assert.equal(f.captures.at(-1)[0], f.head);
  f.pointer("pointermove", f.document, { clientX: 200 });
  f.pointer("pointerup", f.document, { clientX: 200 });
  assert.equal(f.state.currentTime, 15);
  assert.equal(f.captures.at(-1)[0], f.head);
  f.pointer("pointerdown", f.overview, { clientX: 200 });
  assert.equal(f.document.activeElement, f.overview);
  assert.equal(f.captures.at(-1)[0], f.overview);
  assert.equal(f.state.currentTime, 90);
  f.pointer("pointerup", f.document, { clientX: 200 });
  f.grabHead();
  assert.equal(f.document.activeElement, f.head);
  assert.equal(f.content.classList.contains("scrubbing"), true);
  f.pointer("pointermove", f.document, { clientX: 250 });
  assertNear(f.state.currentTime, 97.5);
  f.pointer("pointercancel", f.head);
  assert.equal(f.content.classList.contains("scrubbing"), false);
  assert.equal(f.frames.size, 0);
});
