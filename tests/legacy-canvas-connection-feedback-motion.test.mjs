import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("../src/legacy-canvas/canvas-connection-feedback-motion.js", import.meta.url),
  "utf8",
);
const context = vm.createContext({});
new vm.Script(source).runInContext(context);
const motion = context.REELAY_CANVAS_CONNECTION_FEEDBACK_MOTION;

test("short paths use the minimum travel time and bounded normalized highlight lengths", () => {
  const profile = motion.createMotionProfile({ screenPathLength: 100 });

  assert.equal(profile.originMs, 55);
  assert.equal(profile.travelMs, 460);
  assert.equal(profile.arrivalHoldMs, 60);
  assert.equal(profile.fadeMs, 120);
  assert.equal(profile.totalMs, 695);
  assert.equal(profile.cleanupGraceMs, 120);
  assert.equal(profile.safetyMs, 815);
  assert.equal(profile.headPx, 18);
  assert.equal(profile.tailPx, 90);
  assert.equal(profile.headLength, 0.18);
  assert.equal(profile.tailLength, 0.82);
  assert.equal(profile.originProgress, 0.03);
});

test("medium paths follow the adaptive timing and pixel-size formulas", () => {
  const profile = motion.createMotionProfile({ screenPathLength: 800 });

  assert.equal(profile.travelMs, 615);
  assert.equal(profile.totalMs, 850);
  assert.equal(profile.safetyMs, 970);
  assert.equal(profile.headPx, 28);
  assert.equal(profile.tailPx, 144);
  assert.equal(profile.headLength, 0.035);
  assert.equal(profile.tailLength, 0.18);
  assert.equal(profile.originProgress, 0.01);
  assert.deepEqual(
    { ...profile.phaseOffsets },
    {
      originEnd: 55 / 850,
      travelEnd: 670 / 850,
      arrivalEnd: 730 / 850,
    },
  );
});

test("long paths clamp travel time, pixel sizes, and origin progress", () => {
  const profile = motion.createMotionProfile({ screenPathLength: 2000 });

  assert.equal(profile.travelMs, 700);
  assert.equal(profile.totalMs, 935);
  assert.equal(profile.safetyMs, 1055);
  assert.equal(profile.headPx, 28);
  assert.equal(profile.tailPx, 150);
  assert.equal(profile.headLength, 0.014);
  assert.equal(profile.tailLength, 0.075);
  assert.equal(profile.originProgress, 0.008);
});

test("invalid and extreme path lengths retain safe normalized geometry", () => {
  const invalid = motion.createMotionProfile({ screenPathLength: 0 });
  const extreme = motion.createMotionProfile({ screenPathLength: 100000 });

  assert.equal(invalid.screenPathLength, 1);
  assert.equal(invalid.headLength, 0.32);
  assert.equal(invalid.tailLength, 0.82);
  assert.equal(extreme.headLength, 0.005);
  assert.equal(extreme.tailLength, 0.02);
});

test("batch overlay opacity stays full through four connections and has a quiet floor", () => {
  assert.equal(motion.createMotionProfile({ screenPathLength: 400, cohortSize: 4 }).overlayOpacity, 1);
  assert.equal(motion.createMotionProfile({ screenPathLength: 400, cohortSize: 5 }).overlayOpacity, 0.955);
  assert.equal(motion.createMotionProfile({ screenPathLength: 400, cohortSize: 12 }).overlayOpacity, 0.64);
  assert.equal(motion.createMotionProfile({ screenPathLength: 400, cohortSize: 100 }).overlayOpacity, 0.64);
});

test("reduced motion preserves profile structure without time or positional movement", () => {
  const profile = motion.createMotionProfile({
    screenPathLength: 800,
    cohortSize: 6,
    reducedMotion: true,
  });

  assert.equal(profile.reducedMotion, true);
  assert.equal(profile.totalMs, 0);
  assert.equal(profile.originMs, 0);
  assert.equal(profile.travelMs, 0);
  assert.equal(profile.arrivalHoldMs, 0);
  assert.equal(profile.fadeMs, 0);
  assert.equal(profile.cleanupGraceMs, 0);
  assert.equal(profile.safetyMs, 0);
  assert.equal(profile.originProgress, 0);
  assert.equal(profile.headPx, 28);
  assert.equal(profile.tailPx, 144);
  assert.deepEqual({ ...profile.phaseOffsets }, { originEnd: 0, travelEnd: 0, arrivalEnd: 0 });
});

test("profiles, nested offsets, and the public API are frozen", () => {
  const profile = motion.createMotionProfile({ screenPathLength: 400 });

  assert.equal(Object.isFrozen(motion), true);
  assert.equal(Object.isFrozen(profile), true);
  assert.equal(Object.isFrozen(profile.phaseOffsets), true);
});
