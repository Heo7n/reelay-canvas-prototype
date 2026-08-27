(function registerCanvasConnectionFeedbackMotion(root) {
  "use strict";

  const CONFIRM_MS = 240;
  const CLEANUP_GRACE_MS = 80;

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function normalizeCohortSize(value) {
    return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
  }

  function createFeedbackProfile({
    cohortSize = 1,
    reducedMotion = false,
  } = {}) {
    const safeCohortSize = normalizeCohortSize(cohortSize);
    const overlayOpacity = clamp(1 - Math.max(0, safeCohortSize - 4) * 0.04, 0.72, 1);

    if (reducedMotion) {
      return Object.freeze({
        reducedMotion: true,
        cohortSize: safeCohortSize,
        confirmMs: 0,
        totalMs: 0,
        cleanupGraceMs: 0,
        safetyMs: 0,
        overlayOpacity,
        linePeakOffset: 0,
        endpointPeakOffset: 0,
      });
    }

    const confirmMs = CONFIRM_MS;
    const totalMs = confirmMs;
    const cleanupGraceMs = CLEANUP_GRACE_MS;
    const safetyMs = totalMs + cleanupGraceMs;

    return Object.freeze({
      reducedMotion: false,
      cohortSize: safeCohortSize,
      confirmMs,
      totalMs,
      cleanupGraceMs,
      safetyMs,
      overlayOpacity,
      linePeakOffset: 0.18,
      endpointPeakOffset: 0.3,
    });
  }

  root.REELAY_CANVAS_CONNECTION_FEEDBACK_MOTION = Object.freeze({
    createFeedbackProfile,
  });
})(typeof window !== "undefined" ? window : globalThis);
