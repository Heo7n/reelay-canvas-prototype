(function registerCanvasAssetLibraryMenuController(root) {
  "use strict";

  function create({ grid, placeAnchoredPopover, onDismiss }) {
    const view = grid.ownerDocument.defaultView;
    let active = null;

    function dispose() {
      if (!active) return;
      const session = active;
      active = null;
      session.events.abort();
      session.observer.disconnect();
      view.cancelAnimationFrame(session.frame);
      if (session.menu.matches(":popover-open")) session.menu.hidePopover();
    }

    function sync() {
      dispose();
      const menu = grid.querySelector(".asset-library-item-menu");
      const trigger = menu?.parentElement.querySelector("[data-library-menu-toggle]");
      if (!menu || !trigger) return;
      const session = { menu, events: new view.AbortController(), observer: null, frame: 0 };

      function position() {
        session.frame = 0;
        if (active !== session) return;
        const anchor = trigger.getBoundingClientRect();
        const clip = grid.getBoundingClientRect();
        if (!trigger.isConnected || !anchor.width || !anchor.height
          || anchor.bottom <= clip.top || anchor.top >= clip.bottom
          || anchor.right <= clip.left || anchor.left >= clip.right) {
          dispose();
          onDismiss();
          return;
        }
        const placement = placeAnchoredPopover({
          anchor,
          floating: menu.getBoundingClientRect(),
          boundary: { left: 0, top: 0, right: view.innerWidth, bottom: view.innerHeight },
          placements: ["right-start", "left-start"],
          gap: 6,
          padding: 8,
        });
        menu.style.left = `${placement.left}px`;
        menu.style.top = `${placement.top}px`;
      }

      function schedule() {
        if (!session.frame) session.frame = view.requestAnimationFrame(position);
      }

      session.observer = new view.ResizeObserver(schedule);
      active = session;
      // The top layer escapes scroll clipping while keeping theme inheritance
      // and the existing card/panel event delegation intact.
      menu.showPopover();
      position();
      if (active !== session) return;
      session.observer.observe(grid);
      session.observer.observe(trigger);
      session.observer.observe(menu);
      view.addEventListener("scroll", schedule, { capture: true, signal: session.events.signal });
      view.addEventListener("resize", schedule, { signal: session.events.signal });
    }

    return Object.freeze({ sync, dispose });
  }

  root.REELAY_CANVAS_ASSET_LIBRARY_MENU_CONTROLLER = Object.freeze({ create });
}(typeof globalThis === "object" ? globalThis : window));
