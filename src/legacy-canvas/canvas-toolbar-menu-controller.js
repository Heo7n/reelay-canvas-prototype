(function registerCanvasToolbarMenuController(root) {
  "use strict";

  function create({ root: surface, boundary = surface, placeAnchoredPopover, getScope, getOwner = () => null, onDismiss }) {
    const view = surface.ownerDocument.defaultView;
    let active = null;

    function candidateFor(menu) {
      if (!menu?.isConnected || !surface.contains(menu) || menu.closest(".hidden")) return null;
      const trigger = menu.parentElement?.querySelector('[aria-expanded="true"]');
      return trigger ? { menu, trigger } : null;
    }

    function isCurrent(session) {
      const candidate = candidateFor(session.menu);
      return active === session && candidate?.trigger === session.trigger
        && getScope() === session.scope && getOwner(session.menu) === session.owner;
    }

    function dispose() {
      if (!active) return;
      const session = active;
      active = null;
      session.events.abort();
      session.observer?.disconnect();
      view.cancelAnimationFrame(session.frame);
      if (session.menu.isConnected && session.menu.matches(":popover-open")) session.menu.hidePopover();
      session.menu.style.removeProperty("left");
      session.menu.style.removeProperty("top");
    }

    function dismiss(session, reason) {
      if (!isCurrent(session)) {
        dispose();
        return;
      }
      dispose();
      const replacement = onDismiss({ menu: session.menu, trigger: session.trigger, scope: session.scope, owner: session.owner, reason });
      const trigger = replacement || session.trigger;
      if (reason === "escape" && getScope() === session.scope && trigger?.isConnected && !trigger.disabled) {
        trigger.focus({ preventScroll: true });
      }
    }

    function sync() {
      const candidate = Array.from(surface.querySelectorAll("[data-toolbar-popover]"))
        .map(candidateFor).find(Boolean);
      if (active && candidate?.menu === active.menu && candidate.trigger === active.trigger && isCurrent(active)) {
        active.schedule();
        return;
      }
      dispose();
      if (!candidate || typeof candidate.menu.showPopover !== "function") return;
      const { menu, trigger } = candidate;
      const session = {
        menu, trigger, scope: getScope(), owner: getOwner(menu), frame: 0,
        events: new view.AbortController(), observer: null, schedule,
      };

      function position() {
        session.frame = 0;
        if (!isCurrent(session)) {
          if (active === session) dispose();
          return;
        }
        const anchor = trigger.getBoundingClientRect();
        const clip = boundary.getBoundingClientRect();
        const left = Math.max(0, clip.left);
        const top = Math.max(0, clip.top);
        const right = Math.min(view.innerWidth, clip.right);
        const bottom = Math.min(view.innerHeight, clip.bottom);
        if (!anchor.width || !anchor.height || anchor.bottom <= top || anchor.top >= bottom
          || anchor.right <= left || anchor.left >= right) {
          dismiss(session, "offscreen");
          return;
        }
        const placement = placeAnchoredPopover({
          anchor, floating: menu.getBoundingClientRect(),
          boundary: { left: 0, top: 0, right: view.innerWidth, bottom: view.innerHeight },
          placements: menu.dataset.toolbarPlacement === "top"
            ? ["top", "bottom"]
            : ["bottom-end", "top-end", "bottom-start", "top-start"],
          gap: 8, padding: 8,
        });
        menu.style.left = `${placement.left}px`;
        menu.style.top = `${placement.top}px`;
      }

      function schedule() {
        if (!session.frame) session.frame = view.requestAnimationFrame(position);
      }

      active = session;
      // Native top-layer placement preserves the toolbar's DOM/event ownership,
      // while escaping both the group's stacking context and canvas transforms.
      menu.showPopover();
      position();
      if (active !== session) return;
      if (typeof view.ResizeObserver === "function") {
        session.observer = new view.ResizeObserver(schedule);
        [boundary, trigger, menu].forEach((element) => session.observer.observe(element));
      }
      const options = { capture: true, signal: session.events.signal };
      view.addEventListener("scroll", schedule, options);
      view.addEventListener("resize", schedule, options);
      surface.addEventListener("animationend", schedule, options);
      surface.addEventListener("transitionend", schedule, options);
      surface.ownerDocument.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || event.defaultPrevented || !isCurrent(session)) return;
        event.preventDefault();
        event.stopPropagation();
        dismiss(session, "escape");
      }, options);
    }

    return Object.freeze({ sync, dispose });
  }

  root.REELAY_CANVAS_TOOLBAR_MENU_CONTROLLER = Object.freeze({ create });
}(typeof globalThis === "object" ? globalThis : window));
