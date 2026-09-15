(function registerAgentLauncherMotion(root) {
  "use strict";

  function createController({ document, launcher }) {
    const view = document.defaultView;
    const body = launcher?.querySelector(".agent-logo-body");
    const lids = Array.from(launcher?.querySelectorAll(".agent-logo-lid") || []);
    const reducedMotion = view.matchMedia("(prefers-reduced-motion: reduce)");
    const supported = Boolean(body?.animate && lids.length && lids.every((lid) => lid.animate));
    const animations = new Set();
    const listeners = [];
    let timer = null;
    let panelOpen = launcher?.getAttribute("aria-expanded") === "true";
    let pointerInside = false;
    let focused = document.activeElement === launcher && launcher.matches(":focus-visible");
    let pageActive = true;
    let disposed = false;
    let blinkCount = 0;

    function canAnimate() {
      return supported && !disposed && pageActive && !panelOpen
        && !document.hidden && !reducedMotion.matches;
    }

    function available() {
      return canAnimate() && !pointerInside && !focused;
    }

    function stop() {
      view.clearTimeout(timer);
      timer = null;
      for (const animation of animations) animation.cancel();
      animations.clear();
    }

    function animate(element, frames, duration) {
      const animation = element.animate(frames, { duration, easing: "ease-in-out" });
      animations.add(animation);
      animation.finished.then(() => animations.delete(animation), () => animations.delete(animation));
    }

    function blink(greeting) {
      const frames = greeting ? [
        { transform: "scaleY(0)", offset: 0 },
        { transform: "scaleY(1)", offset: 0.14 },
        { transform: "scaleY(1)", offset: 0.23 },
        { transform: "scaleY(0)", offset: 0.35 },
        { transform: "scaleY(0)", offset: 0.57 },
        { transform: "scaleY(1)", offset: 0.69 },
        { transform: "scaleY(1)", offset: 0.78 },
        { transform: "scaleY(0)", offset: 1 },
      ] : [
        { transform: "scaleY(0)", offset: 0 },
        { transform: "scaleY(1)", offset: 0.3 },
        { transform: "scaleY(1)", offset: 0.6 },
        { transform: "scaleY(0)", offset: 1 },
      ];
      for (const lid of lids) animate(lid, frames, greeting ? 620 : 240);
    }

    function schedule(first = false) {
      if (!available() || timer !== null) return;
      const delay = first ? 1500 + Math.random() * 1000 : 6000 + Math.random() * 4000;
      timer = view.setTimeout(() => {
        timer = null;
        if (!available()) return;
        blink(first);
        blinkCount += 1;
        if (first || blinkCount % 3 === 0) {
          animate(body, [
            { transform: "translateY(0) rotate(0deg)" },
            { transform: "translateY(-2px) rotate(-6deg)", offset: 0.3 },
            { transform: "translateY(-1px) rotate(4deg)", offset: 0.65 },
            { transform: "translateY(0) rotate(-1deg)", offset: 0.85 },
            { transform: "translateY(0) rotate(0deg)" },
          ], 1250);
        }
        schedule();
      }, delay);
    }

    function sync() {
      stop();
      schedule(true);
    }

    function listen(target, type, handler) {
      target?.addEventListener(type, handler);
      listeners.push(() => target?.removeEventListener(type, handler));
    }

    listen(launcher, "pointerenter", () => {
      pointerInside = true;
      stop();
      if (canAnimate() && !focused) blink(true);
    });
    listen(launcher, "pointerleave", () => { pointerInside = false; sync(); });
    // Mouse-driven focus restoration after collapse must not suspend idle forever.
    listen(launcher, "focusin", () => { focused = launcher.matches(":focus-visible"); sync(); });
    listen(launcher, "focusout", () => { focused = false; sync(); });
    listen(document, "visibilitychange", sync);
    listen(reducedMotion, "change", sync);
    listen(view, "pagehide", () => { pageActive = false; sync(); });
    listen(view, "pageshow", () => { pageActive = true; sync(); });
    schedule(true);

    return Object.freeze({
      setPanelOpen(open) {
        if (panelOpen === Boolean(open)) return;
        panelOpen = Boolean(open);
        // Hiding the button need not emit pointerleave in every browser.
        if (panelOpen) pointerInside = false;
        sync();
      },
      dispose() {
        disposed = true;
        stop();
        for (const remove of listeners) remove();
      },
    });
  }

  root.REELAY_AGENT_LAUNCHER_MOTION = Object.freeze({ createController });
}(typeof globalThis === "object" ? globalThis : window));
