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
  const expiredSnapshots = [];
  const controller = feedbackFactory.createConnectionFeedbackController({
    duration: 520,
    now: () => time,
    setTimer(callback, delay) {
      nextTimerId += 1;
      timers.set(nextTimerId, { callback, at: time + delay });
      return nextTimerId;
    },
    clearTimer: (timerId) => timers.delete(timerId),
    onExpire: (recentIds) => expiredSnapshots.push([...recentIds]),
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

  return { controller, timers, expiredSnapshots, advance, setTime: (value) => { time = value; } };
}

test("one batch shares one expiry timer and one render notification", () => {
  const harness = createHarness();
  const connections = Array.from({ length: 40 }, (_, index) => ({ id: `connection-${index}` }));
  harness.controller.add(connections);

  assert.equal(harness.controller.recentIds.size, 40);
  assert.equal(harness.timers.size, 1);

  harness.advance(520);
  assert.equal(harness.controller.recentIds.size, 0);
  assert.equal(harness.timers.size, 0);
  assert.deepEqual(harness.expiredSnapshots, [[]]);
});

test("rapid connections expire in cohorts without interrupting newer feedback", () => {
  const harness = createHarness();
  harness.controller.add([{ id: "first" }]);
  harness.setTime(200);
  harness.controller.add([{ id: "second" }]);

  assert.equal(harness.timers.size, 1);
  harness.advance(520);
  assert.deepEqual([...harness.controller.recentIds], ["second"]);
  assert.deepEqual(harness.expiredSnapshots, [["second"]]);
  assert.equal(harness.timers.size, 1);

  harness.advance(720);
  assert.equal(harness.controller.recentIds.size, 0);
  assert.deepEqual(harness.expiredSnapshots, [["second"], []]);
});

test("explicit cleanup cancels obsolete expiry work", () => {
  const harness = createHarness();
  harness.controller.add([{ id: "first" }, { id: "second" }]);
  assert.equal(harness.controller.clear(["first"]), true);
  assert.deepEqual([...harness.controller.recentIds], ["second"]);
  assert.equal(harness.timers.size, 1);

  assert.equal(harness.controller.clear(), true);
  assert.equal(harness.controller.recentIds.size, 0);
  assert.equal(harness.timers.size, 0);
  harness.advance(520);
  assert.deepEqual(harness.expiredSnapshots, []);
});
