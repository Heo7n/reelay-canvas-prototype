(function registerAgentLauncherMotion(root) {
  "use strict";

  function createController({ document, launcher, visibleWhenOpen = false, motionScale = 1 }) {
    const view = document.defaultView;
    const body = launcher?.querySelector(".agent-logo-body");
    const lids = Array.from(launcher?.querySelectorAll(".agent-logo-lid") || []);
    const reducedMotion = view.matchMedia("(prefers-reduced-motion: reduce)");
    const supported = Boolean(body?.animate && lids.length && lids.every((lid) => lid.animate));
    const animations = new Set();
    const listeners = [];
    let blinkTimer = null;
    let swayTimer = null;
    let panelOpen = launcher?.getAttribute("aria-expanded") === "true";
    let pointerInside = false;
    let focused = document.activeElement === launcher && launcher.matches(":focus-visible");
    let pageActive = true;
    let disposed = false;

    function canAnimate() {
      return supported && !disposed && pageActive && panelOpen === visibleWhenOpen
        && !document.hidden && !reducedMotion.matches;
    }

    function available() {
      return canAnimate() && !pointerInside && !focused;
    }

    function stop() {
      view.clearTimeout(blinkTimer);
      view.clearTimeout(swayTimer);
      blinkTimer = null;
      swayTimer = null;
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

    function sway() {
      animate(body, [
        { transform: "translateY(0) rotate(0deg)" },
        { transform: `translateY(${-2 * motionScale}px) rotate(${-6 * motionScale}deg)`, offset: 0.3 },
        { transform: `translateY(${-motionScale}px) rotate(${4 * motionScale}deg)`, offset: 0.65 },
        { transform: `translateY(0) rotate(${-motionScale}deg)`, offset: 0.85 },
        { transform: "translateY(0) rotate(0deg)" },
      ], 1250);
    }

    function scheduleSway() {
      if (!available() || swayTimer !== null) return;
      swayTimer = view.setTimeout(() => {
        swayTimer = null;
        if (!available()) return;
        sway();
        scheduleSway();
      }, 12000 + Math.random() * 4000);
    }

    function scheduleBlink(first = false) {
      if (!available() || blinkTimer !== null) return;
      const delay = first ? 1500 + Math.random() * 1000 : 6000 + Math.random() * 2000;
      blinkTimer = view.setTimeout(() => {
        blinkTimer = null;
        if (!available()) return;
        blink(first);
        if (first) {
          sway();
          scheduleSway();
        }
        scheduleBlink();
      }, delay);
    }

    function sync() {
      stop();
      scheduleBlink(true);
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
    scheduleBlink(true);

    return Object.freeze({
      setPanelOpen(open) {
        if (panelOpen === Boolean(open)) return;
        panelOpen = Boolean(open);
        // Hiding the button need not emit pointerleave in every browser.
        if (panelOpen !== visibleWhenOpen) pointerInside = false;
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
