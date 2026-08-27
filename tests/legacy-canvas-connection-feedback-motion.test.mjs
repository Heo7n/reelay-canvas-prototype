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

test("connection confirmation is immediate and short without path travel", () => {
  const profile = motion.createFeedbackProfile();

  assert.equal(profile.confirmMs, 240);
  assert.equal(profile.totalMs, 240);
  assert.equal(profile.cleanupGraceMs, 80);
  assert.equal(profile.safetyMs, 320);
  assert.equal(profile.linePeakOffset, 0.18);
  assert.equal(profile.endpointPeakOffset, 0.3);
  assert.equal("travelMs" in profile, false);
  assert.equal("headLength" in profile, false);
  assert.equal("screenPathLength" in profile, false);
});

test("batch overlay opacity stays full through four connections and has a quiet floor", () => {
  assert.equal(motion.createFeedbackProfile({ cohortSize: 4 }).overlayOpacity, 1);
  assert.equal(motion.createFeedbackProfile({ cohortSize: 5 }).overlayOpacity, 0.96);
  assert.equal(motion.createFeedbackProfile({ cohortSize: 11 }).overlayOpacity, 0.72);
  assert.equal(motion.createFeedbackProfile({ cohortSize: 100 }).overlayOpacity, 0.72);
});

test("reduced motion keeps the stable connection without confirmation animation", () => {
  const profile = motion.createFeedbackProfile({
    cohortSize: 6,
    reducedMotion: true,
  });

  assert.equal(profile.reducedMotion, true);
  assert.equal(profile.totalMs, 0);
  assert.equal(profile.confirmMs, 0);
  assert.equal(profile.cleanupGraceMs, 0);
  assert.equal(profile.safetyMs, 0);
  assert.equal(profile.linePeakOffset, 0);
  assert.equal(profile.endpointPeakOffset, 0);
});

test("profiles and the public API are frozen", () => {
  const profile = motion.createFeedbackProfile();

  assert.equal(Object.isFrozen(motion), true);
  assert.equal(Object.isFrozen(profile), true);
});
