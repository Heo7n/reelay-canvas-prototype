import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("../src/legacy-canvas/canvas-connection-feedback-controller.js", import.meta.url),
  "utf8",
);
const context = vm.createContext({});
new vm.Script(source).runInContext(context);
const feedbackFactory = context.REELAY_CANVAS_CONNECTION_FEEDBACK_CONTROLLER;

function createHarness() {
  let time = 0;
  let nextTimerId = 0;
  const timers = new Map();
  const changeSnapshots = [];
  const controller = feedbackFactory.createConnectionFeedbackController({
    now: () => time,
    setTimer(callback, delay) {
      nextTimerId += 1;
      timers.set(nextTimerId, { callback, at: time + delay });
      return nextTimerId;
    },
    clearTimer: (timerId) => timers.delete(timerId),
    onChange: (records) => changeSnapshots.push([...records.keys()]),
  });

  function advance(timestamp) {
    time = timestamp;
    const due = [...timers.entries()]
      .filter(([, timer]) => timer.at <= time)
      .sort((left, right) => left[1].at - right[1].at);
    due.forEach(([timerId, timer]) => {
      if (!timers.delete(timerId)) return;
      timer.callback();
    });
  }

  return { controller, timers, changeSnapshots, advance, setTime: (value) => { time = value; } };
}

const profile = (totalMs) => ({ totalMs });

test("one batch shares one safety timer and one render notification", () => {
  const harness = createHarness();
  const entries = Array.from({ length: 40 }, (_, index) => ({
    id: `connection-${index}`,
    direction: "forward",
    profile: profile(1000),
  }));
  const added = harness.controller.add(entries);

  assert.equal(harness.controller.records.size, 40);
  assert.equal(new Set(added.map((record) => record.token)).size, 40);
  assert.equal(harness.timers.size, 1);
  assert.equal(harness.changeSnapshots.length, 1);

  harness.advance(1000);
  assert.equal(harness.controller.records.size, 0);
  assert.equal(harness.timers.size, 0);
  assert.deepEqual(harness.changeSnapshots.at(-1), []);
});

test("animation start owns expiry and rapid feedback does not interrupt newer records", () => {
  const harness = createHarness();
  const [first] = harness.controller.add([{ id: "first", profile: profile(1000) }]);
  assert.equal(harness.controller.start(first.id, first.token), true);
  harness.setTime(200);
  const [second] = harness.controller.add([{ id: "second", profile: profile(1200) }]);
  assert.equal(harness.controller.start(second.id, second.token), true);

  assert.equal(harness.timers.size, 1);
  harness.advance(1000);
  assert.deepEqual([...harness.controller.records.keys()], ["second"]);
  assert.equal(harness.timers.size, 1);

  harness.advance(1400);
  assert.equal(harness.controller.records.size, 0);
  assert.deepEqual(harness.changeSnapshots.at(-1), []);
});

test("profile safety duration cannot race the visual completion time", () => {
  const harness = createHarness();
  const [record] = harness.controller.add([{
    id: "guarded",
    profile: { totalMs: 700, safetyMs: 820 },
  }]);
  harness.controller.start(record.id, record.token);

  harness.advance(700);
  assert.equal(harness.controller.records.has("guarded"), true);
  harness.advance(820);
  assert.equal(harness.controller.records.has("guarded"), false);
});

test("completion is token-safe when a connection receives newer feedback", () => {
  const harness = createHarness();
  const [older] = harness.controller.add([{ id: "same", profile: profile(1000) }]);
  const [newer] = harness.controller.add([{
    id: "same",
    direction: "reverse",
    profile: profile(1400),
  }]);

  assert.equal(harness.controller.complete("same", older.token), false);
  assert.equal(harness.controller.records.get("same").token, newer.token);
  assert.equal(harness.controller.records.get("same").direction, "reverse");
  assert.equal(harness.controller.complete("same", newer.token), true);
  assert.equal(harness.controller.records.size, 0);
  assert.equal(harness.timers.size, 0);
});

test("explicit cleanup cancels obsolete expiry work", () => {
  const harness = createHarness();
  harness.controller.add([
    { id: "first", profile: profile(1000) },
    { id: "second", profile: profile(1000) },
  ]);
  assert.equal(harness.controller.clear(["first"]), true);
  assert.deepEqual([...harness.controller.records.keys()], ["second"]);
  assert.equal(harness.timers.size, 1);

  assert.equal(harness.controller.clear(), true);
  assert.equal(harness.controller.records.size, 0);
  assert.equal(harness.timers.size, 0);
  harness.advance(1000);
  assert.deepEqual(harness.changeSnapshots.at(-1), []);
});
