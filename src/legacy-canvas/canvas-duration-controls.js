(function (root) {
  "use strict";

  function limits(range) {
    const automatic = range.hasAttribute("data-duration-auto");
    return {
      automatic,
      min: Number(automatic ? range.dataset.durationAuto : range.min),
      max: Number(automatic ? range.dataset.durationMax : range.max),
      step: Number(range.step) || 1,
    };
  }

  // Slider positions are UI-only: zero selects Auto, one starts the valid seconds range.
  function read(range, input) {
    const { automatic, min, max, step } = limits(range);
    if (automatic && (input === range ? Number(input.value) === 0 : ["auto", "智能"].includes(input.value.trim().toLowerCase()))) return "auto";
    const value = Number(input.value);
    const requested = input === range && automatic ? min + (value - 1) * step : value;
    if (!Number.isFinite(requested) || input.value.trim() === "") {
      return read(range, { value: automatic && Number(range.value) === 0 ? "auto" : String(automatic ? min + (Number(range.value) - 1) * step : range.value) });
    }
    return `${Math.min(max, Math.max(min, min + Math.round((requested - min) / step) * step))}s`;
  }

  function sync(range, duration, { preserveNumber = false } = {}) {
    const { automatic, min, step } = limits(range);
    const auto = duration === "auto";
    const seconds = Number.parseFloat(duration);
    const position = automatic ? auto ? 0 : 1 + (seconds - min) / step : seconds;
    range.value = String(position);
    const span = Number(range.max) - Number(range.min);
    range.style.setProperty("--duration-progress", `${span > 0 ? (position - Number(range.min)) / span * 100 : 100}%`);
    range.setAttribute("aria-valuetext", auto ? "智能" : `${seconds} 秒`);
    const row = range.closest(".duration-control-row");
    const number = row.querySelector("[data-duration-number]");
    if (number && !preserveNumber) number.value = auto ? "智能" : String(seconds);
    row.querySelector(".duration-unit").textContent = auto ? "" : "s";
  }

  root.REELAY_DURATION_CONTROLS = Object.freeze({ read, sync });
})(globalThis);
