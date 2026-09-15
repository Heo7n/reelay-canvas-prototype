import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const source = await readFile(new URL("../src/legacy-canvas/canvas-agent-launcher-motion.js", import.meta.url), "utf8");

function harness(t, { reducedMotion = false, hidden = false, supportsAnimation = true, visibleWhenOpen = false } = {}) {
  const dom = new JSDOM(`<!doctype html><button aria-expanded="${visibleWhenOpen}">
    <span class="agent-logo">
      <span class="agent-logo-body">
        <span class="agent-logo-eye"><span class="agent-logo-lid"></span><span class="agent-logo-lid"></span></span>
        <span class="agent-logo-eye"><span class="agent-logo-lid"></span><span class="agent-logo-lid"></span></span>
      </span>
    </span>
  </button>`, { runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  const { document } = window;
  const launcher = document.querySelector("button");
  const lids = [...launcher.querySelectorAll(".agent-logo-lid")];
  const timers = new Map();
  const animations = [];
  const listeners = new Set();
  let nextTimerId = 0;
  let now = 0;
  let isHidden = hidden;
  let hasVisibleFocus = false;
  const matches = launcher.matches.bind(launcher);
  // JSDOM does not track whether focus came from the keyboard or a pointer.
  launcher.matches = (selector) => selector === ":focus-visible"
    ? document.activeElement === launcher && hasVisibleFocus
    : matches(selector);
  const media = new window.EventTarget();
  media.matches = reducedMotion;
  media.media = "(prefers-reduced-motion: reduce)";
  window.matchMedia = () => media;
  Object.defineProperty(document, "hidden", { get: () => isHidden });
  window.setTimeout = (callback, delay) => {
    const id = ++nextTimerId;
    timers.set(id, { callback, delay, dueAt: now + Math.trunc(delay) });
    return id;
  };
  window.clearTimeout = (id) => timers.delete(id);

  const lifecycleEvents = new Set([
    "visibilitychange", "pointerenter", "pointerleave", "focusin", "focusout", "pagehide", "pageshow", "change",
  ]);
  for (const target of [window, document, launcher, media]) {
    const add = target.addEventListener.bind(target);
    const remove = target.removeEventListener.bind(target);
    target.addEventListener = (type, callback, options) => {
      if (lifecycleEvents.has(type)) listeners.add({ target, type, callback });
      add(type, callback, options);
    };
    target.removeEventListener = (type, callback, options) => {
      for (const listener of listeners) {
        if (listener.target === target && listener.type === type && listener.callback === callback) listeners.delete(listener);
      }
      remove(type, callback, options);
    };
  }

  if (supportsAnimation) {
    window.Element.prototype.animate = function (keyframes, options) {
      const animation = new window.EventTarget();
      let resolveFinished;
      let rejectFinished;
      animation.finished = new Promise((resolve, reject) => {
        resolveFinished = resolve;
        rejectFinished = reject;
      });
      animation.playState = "running";
      animation.cancelCalls = 0;
      animation.cancel = () => {
        animation.cancelCalls += 1;
        if (animation.playState === "running") rejectFinished(new window.DOMException("Animation canceled", "AbortError"));
        animation.playState = "idle";
        animation.dispatchEvent(new window.Event("cancel"));
        animation.oncancel?.();
      };
      animation.finish = () => {
        if (animation.playState !== "running") return;
        animation.playState = "finished";
        animation.dispatchEvent(new window.Event("finish"));
        animation.onfinish?.();
        resolveFinished(animation);
      };
      animations.push({ target: this, keyframes, options, animation, startedAt: now });
      return animation;
    };
  }

  window.eval(source);
  const controller = window.REELAY_AGENT_LAUNCHER_MOTION.createController({
    document, launcher, visibleWhenOpen, motionScale: visibleWhenOpen ? 0.7 : 1,
  });
  t.after(() => {
    controller.dispose();
    dom.window.close();
  });
  return {
    controller, document, window, launcher, lids, timers, animations, listeners, visibleWhenOpen,
    emit(target, type) { target.dispatchEvent(new window.Event(type)); },
    focusLauncher({ visible = true } = {}) {
      hasVisibleFocus = visible;
      launcher.focus();
    },
    blurLauncher() {
      hasVisibleFocus = false;
      launcher.blur();
    },
    setHidden(value) {
      isHidden = value;
      document.dispatchEvent(new window.Event("visibilitychange"));
    },
    setReducedMotion(value) {
      media.matches = value;
      media.dispatchEvent(new window.Event("change"));
    },
    runNextTimer() {
      assert.ok(timers.size > 0, "an idle callback must be pending");
      const [id, timer] = [...timers.entries()].sort((a, b) => a[1].dueAt - b[1].dueAt)[0];
      now = timer.dueAt;
      timers.delete(id);
      timer.callback();
      return timer;
    },
    async finishAnimations() {
      for (const { animation } of animations) animation.finish();
      await Promise.resolve();
    },
  };
}

test("idle motion waits, plays a finite greeting, then leaves a longer quiet interval", async (t) => {
  const h = harness(t);
  assert.equal(h.animations.length, 0, "mounting the launcher must not play an immediate greeting");
  const firstDelay = h.runNextTimer().delay;
  assert.ok(firstDelay > 0);
  assert.deepEqual(new Set(h.animations.map(({ target }) => target)), new Set([
    ...h.lids, h.launcher.querySelector(".agent-logo-body"),
  ]));
  for (const { options } of h.animations) {
    assert.ok(Number.isFinite(options.duration) && options.duration > 0);
    assert.ok(Number.isFinite(options.iterations ?? 1), "idle actions must not loop indefinitely");
  }
  await h.finishAnimations();
  assert.equal(h.timers.size, 2);
  assert.ok([...h.timers.values()].every(({ delay }) => delay > firstDelay), "subsequent actions should leave a longer idle gap");
  h.controller.setPanelOpen(false);
  h.controller.setPanelOpen(false);
  assert.equal(h.timers.size, 2, "repeated state synchronization must not multiply idle callbacks");
  h.controller.setPanelOpen(true);
  assert.ok(h.animations.every(({ animation }) => animation.cancelCalls === 0), "finished effects must be released before a later pause");
});

test("blinks recur every 6–8 seconds and sways every 12–16 seconds independently", async (t) => {
  for (const random of [0, 0.5, 0.999999]) {
    await t.test(`random fraction ${random}`, async (subtest) => {
      const h = harness(subtest);
      h.window.Math.random = () => random;
      for (let i = 0; i < 16; i += 1) {
        h.runNextTimer();
        await h.finishAnimations();
        assert.equal(h.timers.size, 2, "each action keeps its own next occurrence pending");
      }
      for (const [target, minimum, maximum] of [
        [h.lids[0], 6000, 8000],
        [h.launcher.querySelector(".agent-logo-body"), 12000, 16000],
      ]) {
        const starts = h.animations.filter((entry) => entry.target === target).map((entry) => entry.startedAt);
        assert.ok(starts.length >= 3, "verify multiple recurrences after the greeting");
        for (let i = 1; i < starts.length; i += 1) {
          const interval = starts[i] - starts[i - 1];
          assert.ok(interval >= minimum && interval <= maximum, `interval ${interval} must stay within ${minimum}–${maximum}ms`);
        }
      }
    });
  }
});

test("the greeting body movement is finite and pauses with the eyelids", (t) => {
  const h = harness(t);
  const body = h.launcher.querySelector(".agent-logo-body");
  h.runNextTimer();
  const bodyMotion = h.animations.find(({ target }) => target === body);
  assert.ok(bodyMotion, "the first greeting includes body movement");
  assert.ok(Number.isFinite(bodyMotion.options.duration) && bodyMotion.options.duration > 0);
  assert.ok(Number.isFinite(bodyMotion.options.iterations ?? 1));
  h.setReducedMotion(true);
  assert.equal(h.timers.size, 0);
  assert.equal(bodyMotion.animation.playState, "idle");
  assert.ok(h.animations.every(({ animation }) => animation.playState !== "running"));
});

const pauseSources = [
  ["hidden control", (h) => h.controller.setPanelOpen(!h.visibleWhenOpen), (h) => h.controller.setPanelOpen(h.visibleWhenOpen)],
  ["hidden document", (h) => h.setHidden(true), (h) => h.setHidden(false)],
  ["reduced motion", (h) => h.setReducedMotion(true), (h) => h.setReducedMotion(false)],
  ["keyboard interaction", (h) => h.focusLauncher(), (h) => h.blurLauncher()],
  ["page suspension", (h) => h.emit(h.window, "pagehide"), (h) => h.emit(h.window, "pageshow")],
];

test("each pause source clears pending work and cancels an active blink before recovery", async (t) => {
  for (const visibleWhenOpen of [false, true]) {
    for (const [name, pause, resume] of pauseSources) {
      await t.test(`${visibleWhenOpen ? "collapse" : "launcher"}: ${name}`, (subtest) => {
        const h = harness(subtest, { visibleWhenOpen });
        const staleCallback = [...h.timers.values()][0].callback;
        pause(h);
        assert.equal(h.timers.size, 0);
        h.emit(h.launcher, "pointerenter");
        assert.equal(h.animations.length, 0, "a hover response must not bypass this pause reason");
        h.emit(h.launcher, "pointerleave");
        staleCallback();
        assert.equal(h.animations.length, 0, "a callback queued before suspension must not animate");
        resume(h);
        assert.equal(h.timers.size, 1);
        h.runNextTimer();
        assert.ok(h.animations.length > 0);
        pause(h);
        assert.equal(h.timers.size, 0);
        assert.ok(h.animations.every(({ animation }) => animation.cancelCalls > 0));
        resume(h);
        assert.equal(h.timers.size, 1);
        const beforeResponse = h.animations.length;
        h.emit(h.launcher, "pointerenter");
        const response = h.animations.slice(beforeResponse);
        assert.ok(response.length > 0);
        pause(h);
        assert.equal(h.timers.size, 0);
        assert.ok(response.every(({ animation }) => animation.cancelCalls > 0), "the same lifecycle must cancel an active hover response");
        h.emit(h.launcher, "pointerleave");
        resume(h);
        assert.equal(h.timers.size, 1);
      });
    }
  }
});

test("panel toggles transfer idle motion between controls and cancel hidden hover responses", (t) => {
  const h = harness(t);
  const collapse = h.launcher.cloneNode(true);
  h.document.body.append(collapse);
  const collapseController = h.window.REELAY_AGENT_LAUNCHER_MOTION.createController({
    document: h.document, launcher: collapse, visibleWhenOpen: true, motionScale: 0.7,
  });
  t.after(() => collapseController.dispose());
  const setPanelOpen = (open) => {
    h.controller.setPanelOpen(open);
    collapseController.setPanelOpen(open);
  };
  const activeTargets = () => h.animations.filter(({ animation }) => animation.playState === "running")
    .map(({ target }) => target);
  const expectedTargets = (control) => new Set(control.querySelectorAll(".agent-logo-body, .agent-logo-lid"));

  assert.equal(h.timers.size, 1, "only the visible launcher schedules its greeting");
  h.runNextTimer();
  assert.deepEqual(new Set(activeTargets()), expectedTargets(h.launcher));
  const launcherCallbacks = [...h.timers.values()].map(({ callback }) => callback);
  setPanelOpen(true);
  assert.deepEqual(activeTargets(), [], "opening cancels all launcher motion immediately");
  for (const callback of launcherCallbacks) callback();
  assert.deepEqual(activeTargets(), [], "callbacks from the hidden launcher cannot revive it");
  assert.equal(h.timers.size, 1);
  h.runNextTimer();
  assert.deepEqual(new Set(activeTargets()), expectedTargets(collapse));
  setPanelOpen(true);
  assert.equal(h.timers.size, 2, "repeated open synchronization preserves the independent idle schedules");

  h.emit(collapse, "pointerenter");
  assert.ok(activeTargets().length > 0);
  assert.ok(activeTargets().every((target) => collapse.contains(target)));
  setPanelOpen(false);
  assert.deepEqual(activeTargets(), [], "collapse cancels its hover response before the launcher resumes");
  h.runNextTimer();
  assert.deepEqual(new Set(activeTargets()), expectedTargets(h.launcher));

  // Removing a hovered control may not dispatch pointerleave. The next reveal
  // must start a fresh idle cycle instead of retaining the old pointer state.
  setPanelOpen(true);
  assert.equal(h.timers.size, 1);
  h.runNextTimer();
  assert.deepEqual(new Set(activeTargets()), expectedTargets(collapse));
});

test("pointer entry replaces idle motion with one finite response and waits for pointer leave to schedule again", async (t) => {
  const h = harness(t);
  h.runNextTimer();
  const idleAnimations = [...h.animations];
  const staleCallback = [...h.timers.values()][0].callback;
  h.emit(h.launcher, "pointerenter");
  assert.ok(idleAnimations.every(({ animation }) => animation.cancelCalls > 0));
  const response = h.animations.slice(idleAnimations.length);
  assert.deepEqual(new Set(response.filter(({ target }) => h.lids.includes(target)).map(({ target }) => target)), new Set(h.lids));
  for (const { options } of response) {
    assert.ok(Number.isFinite(options.duration) && options.duration > 0);
    assert.ok(Number.isFinite(options.iterations ?? 1), "the hover response must finish rather than loop");
  }
  assert.equal(h.timers.size, 0);
  const animationCount = h.animations.length;
  staleCallback();
  assert.equal(h.animations.length, animationCount, "old idle work cannot add another response while hovered");
  await h.finishAnimations();
  assert.equal(h.timers.size, 0, "finishing the response must not schedule another while the pointer remains inside");
  h.emit(h.launcher, "pointerleave");
  assert.equal(h.timers.size, 1);
  h.runNextTimer();
  assert.ok(h.animations.length > animationCount, "leaving restores the normal idle cycle");
});

test("motion resumes only after all overlapping pause reasons are cleared", (t) => {
  const h = harness(t);
  h.controller.setPanelOpen(true);
  h.emit(h.launcher, "pointerenter");
  h.focusLauncher();
  h.setHidden(true);
  h.setReducedMotion(true);
  h.controller.setPanelOpen(false);
  assert.equal(h.timers.size, 0);
  h.setHidden(false);
  assert.equal(h.timers.size, 0);
  h.setReducedMotion(false);
  assert.equal(h.timers.size, 0);
  h.emit(h.launcher, "pointerleave");
  assert.equal(h.timers.size, 0, "keyboard focus still owns the launcher");
  h.blurLauncher();
  assert.equal(h.timers.size, 1);
});

test("pointer-driven programmatic focus does not keep a closed launcher paused after pointer leave", (t) => {
  const h = harness(t);
  h.controller.setPanelOpen(true);
  h.controller.setPanelOpen(false);
  h.emit(h.launcher, "pointerenter");
  h.focusLauncher({ visible: false });
  assert.equal(h.document.activeElement, h.launcher);
  assert.equal(h.launcher.matches(":focus-visible"), false);
  assert.equal(h.timers.size, 0, "the pointer still pauses idle scheduling while it is over the launcher");
  h.emit(h.launcher, "pointerleave");
  assert.equal(h.timers.size, 1, "returning focus after a mouse action must allow the idle cycle to resume");
  const animationCount = h.animations.length;
  h.runNextTimer();
  assert.ok(h.animations.length > animationCount);
  assert.equal(h.document.activeElement, h.launcher, "resuming decorative motion must preserve returned focus");
});

test("initial hidden or reduced-motion state remains static until it becomes eligible", async (t) => {
  for (const [name, options, resume] of [
    ["hidden", { hidden: true }, (h) => h.setHidden(false)],
    ["reduced motion", { reducedMotion: true }, (h) => h.setReducedMotion(false)],
  ]) {
    await t.test(name, (subtest) => {
      const h = harness(subtest, options);
      assert.equal(h.timers.size, 0);
      assert.equal(h.animations.length, 0);
      resume(h);
      assert.equal(h.timers.size, 1);
    });
  }
});

test("dispose cancels motion, removes subscriptions, and cannot be reversed by old events", (t) => {
  const h = harness(t);
  const staleCallback = [...h.timers.values()][0].callback;
  h.runNextTimer();
  assert.ok(h.listeners.size > 0);
  h.controller.dispose();
  h.controller.dispose();
  assert.equal(h.timers.size, 0);
  assert.equal(h.listeners.size, 0, "detached launchers must not retain document or window subscriptions");
  assert.ok(h.animations.every(({ animation }) => animation.cancelCalls > 0));
  const animationCount = h.animations.length;
  for (const [, pause, resume] of pauseSources) {
    pause(h);
    resume(h);
  }
  h.emit(h.launcher, "pointerenter");
  h.emit(h.launcher, "pointerleave");
  staleCallback();
  assert.equal(h.timers.size, 0);
  assert.equal(h.animations.length, animationCount);
});

test("without Web Animations the launcher stays static through lifecycle changes", (t) => {
  const h = harness(t, { supportsAnimation: false });
  const originalMarkup = h.launcher.innerHTML;
  for (const [, pause, resume] of pauseSources) {
    pause(h);
    resume(h);
  }
  h.emit(h.launcher, "pointerenter");
  h.emit(h.launcher, "pointerleave");
  assert.equal(h.timers.size, 0);
  assert.equal(h.animations.length, 0);
  assert.equal(h.launcher.innerHTML, originalMarkup);
});
