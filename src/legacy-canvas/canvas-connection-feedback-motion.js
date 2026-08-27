(function registerCanvasConnectionFeedbackMotion(root) {
  "use strict";

  const ORIGIN_MS = 55;
  const ARRIVAL_HOLD_MS = 60;
  const FADE_MS = 120;

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function normalizePathLength(value) {
    return Number.isFinite(value) && value > 0 ? value : 1;
  }

  function normalizeCohortSize(value) {
    return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
  }

  function createMotionProfile({
    screenPathLength,
    cohortSize = 1,
    reducedMotion = false,
  } = {}) {
    const safePathLength = normalizePathLength(screenPathLength);
    const safeCohortSize = normalizeCohortSize(cohortSize);
    const headPx = clamp(safePathLength * 0.045, 18, 28);
    const tailPx = clamp(safePathLength * 0.18, 90, 150);
    const headLength = clamp(headPx / safePathLength, 0.005, 0.32);
    const tailLength = clamp(tailPx / safePathLength, 0.02, 0.82);
    const overlayOpacity = clamp(1 - Math.max(0, safeCohortSize - 4) * 0.045, 0.64, 1);

    if (reducedMotion) {
      return Object.freeze({
        reducedMotion: true,
        screenPathLength: safePathLength,
        cohortSize: safeCohortSize,
        originMs: 0,
        travelMs: 0,
        arrivalHoldMs: 0,
        fadeMs: 0,
        totalMs: 0,
        cleanupGraceMs: 0,
        safetyMs: 0,
        headPx,
        tailPx,
        headLength,
        tailLength,
        originProgress: 0,
        overlayOpacity,
        phaseOffsets: Object.freeze({
          originEnd: 0,
          travelEnd: 0,
          arrivalEnd: 0,
        }),
      });
    }

    const originMs = ORIGIN_MS;
    const travelMs = Math.round(clamp(360 + 9 * Math.sqrt(safePathLength), 460, 700));
    const arrivalHoldMs = ARRIVAL_HOLD_MS;
    const fadeMs = FADE_MS;
    const totalMs = originMs + travelMs + arrivalHoldMs + fadeMs;
    const cleanupGraceMs = clamp(fadeMs, 80, 120);
    const safetyMs = totalMs + cleanupGraceMs;
    const phaseOffsets = Object.freeze({
      originEnd: originMs / totalMs,
      travelEnd: (originMs + travelMs) / totalMs,
      arrivalEnd: (originMs + travelMs + arrivalHoldMs) / totalMs,
    });

    return Object.freeze({
      reducedMotion: false,
      screenPathLength: safePathLength,
      cohortSize: safeCohortSize,
      originMs,
      travelMs,
      arrivalHoldMs,
      fadeMs,
      totalMs,
      cleanupGraceMs,
      safetyMs,
      headPx,
      tailPx,
      headLength,
      tailLength,
      originProgress: clamp(8 / safePathLength, 0.008, 0.03),
      overlayOpacity,
      phaseOffsets,
    });
  }

  root.REELAY_CANVAS_CONNECTION_FEEDBACK_MOTION = Object.freeze({
    createMotionProfile,
  });
})(typeof window !== "undefined" ? window : globalThis);
