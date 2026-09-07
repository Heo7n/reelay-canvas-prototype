(function (global) {
  "use strict";

  function createController({ root, trigger, menu, onSelect, canOpen = () => true,
    schedule = global.setTimeout.bind(global), cancel = global.clearTimeout.bind(global) }) {
    const document = root.ownerDocument;
    const listeners = [];
    let mode = null;
    let openTimer = null;
    let closeTimer = null;
    let destroyed = false;
    let hoverSuspended = false;

    function listen(target, type, handler, options) {
      target.addEventListener(type, handler, options);
      listeners.push(() => target.removeEventListener(type, handler, options));
    }

    function clearTimers() {
      if (openTimer !== null) cancel(openTimer);
      if (closeTimer !== null) cancel(closeTimer);
      openTimer = closeTimer = null;
    }

    function close({ restoreFocus = false } = {}) {
      clearTimers();
      mode = null;
      menu.classList.add("hidden");
      trigger.setAttribute("aria-expanded", "false");
      if (restoreFocus && canOpen()) trigger.focus({ preventScroll: true });
    }

    function items() {
      return [...menu.querySelectorAll("button[data-library-space]")]
        .filter((item) => !item.disabled && !item.hidden);
    }

    function open(nextMode, focus = false, last = false) {
      clearTimers();
      if (destroyed || !canOpen()) return;
      mode = nextMode;
      menu.classList.remove("hidden");
      trigger.setAttribute("aria-expanded", "true");
      if (focus) {
        const options = items();
        (options.find((item) => item.getAttribute("aria-checked") === "true")
          || options[last ? options.length - 1 : 0])?.focus({ preventScroll: true });
      }
    }

    listen(root, "pointerenter", (event) => {
      if (event.pointerType !== "mouse" || hoverSuspended) return;
      clearTimers();
      if (!mode) openTimer = schedule(() => open("hover"), 140);
    });
    listen(document, "pointermove", (event) => {
      if (!hoverSuspended || event.pointerType !== "mouse") return;
      hoverSuspended = false;
      if (root.contains(event.target) && !mode) openTimer = schedule(() => open("hover"), 140);
    });
    listen(root, "pointerleave", (event) => {
      if (event.pointerType !== "mouse") return;
      clearTimers();
      if (mode === "hover") closeTimer = schedule(() => close(), 180);
    });
    listen(trigger, "click", (event) => {
      // A click following hover confirms intent; it must not undo the pre-open.
      if (mode === "click") close();
      else open("click", event.detail === 0);
    });
    listen(menu, "click", (event) => {
      const item = event.target.closest("button[data-library-space]");
      if (!item || !menu.contains(item) || item.disabled || !canOpen()) return;
      close({ restoreFocus: menu.contains(document.activeElement) || event.detail === 0 });
      onSelect(item.dataset.librarySpace);
    });
    listen(document, "keydown", (event) => {
      if (event.key === "Escape" && (mode || openTimer !== null)) {
        event.preventDefault();
        event.stopPropagation();
        close({ restoreFocus: root.contains(document.activeElement) });
      }
    }, true);
    listen(root, "keydown", (event) => {
      if (event.target === trigger && ["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        open("click", true, event.key === "ArrowUp");
        return;
      }
      if (!menu.contains(event.target) || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const options = items();
      const current = options.indexOf(document.activeElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1
        : (current + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
      mode = "click";
      clearTimers();
      options[next]?.focus({ preventScroll: true });
    });
    listen(root, "focusout", (event) => {
      if (!root.contains(event.relatedTarget)) close();
    });
    listen(document, "click", (event) => {
      if (!root.contains(event.target)) close();
    });

    close();
    return { close, suspendHover() {
      close();
      hoverSuspended = true;
    }, destroy() {
      destroyed = true;
      close();
      listeners.forEach((remove) => remove());
    } };
  }

  global.REELAY_ASSET_SPACE_SWITCHER = Object.freeze({ createController });
})(typeof window === "undefined" ? globalThis : window);
