(function (root) {
  "use strict";

  function createController({ trigger, menu, boundary, normalize, renderPanel, beforeOpen, onChange, refreshIcons }) {
    const configurations = new Map();
    let current = null;

    function sync(model) {
      if (current?.model !== model?.id) setOpen(false);
      if (!model) current = null;
      else {
        if (!configurations.has(model.id)) {
          configurations.set(model.id, normalize({
            ...model.defaults, kind: "generator", mode: model.type, model: model.id,
          }));
        }
        current = configurations.get(model.id);
      }
      trigger.disabled = !current;
      return current;
    }

    function position() {
      if (menu.hidden) return;
      const anchor = trigger.getBoundingClientRect();
      const parent = menu.offsetParent?.getBoundingClientRect();
      if (!parent) return;
      const width = Math.min(348, Math.max(0, parent.width - 24));
      menu.style.width = `${width}px`;
      menu.style.left = `${Math.max(12, Math.min(anchor.left - parent.left, parent.width - width - 12))}px`;
      menu.style.bottom = `${parent.bottom - anchor.top + 8}px`;
      const availableTop = Math.max(12, boundary.getBoundingClientRect().top + 12);
      menu.style.maxHeight = `${Math.max(0, anchor.top - 8 - availableTop)}px`;
    }

    function render(focus = null) {
      menu.innerHTML = renderPanel(current);
      refreshIcons();
      position();
      if (focus) {
        [...menu.querySelectorAll("button[data-action], input")].find((element) =>
          focus.action
            ? element.dataset.action === focus.action && element.dataset.value === focus.value
            : element.matches(focus.input)
        )?.focus({ preventScroll: true });
      }
    }

    function setOpen(open, { focus = false } = {}) {
      const visible = Boolean(open && current);
      if (visible) beforeOpen();
      menu.hidden = !visible;
      trigger.classList.toggle("active", visible);
      trigger.setAttribute("aria-expanded", String(visible));
      if (visible) {
        render();
        if (focus) (menu.querySelector("button.active") || menu.querySelector("button, input"))?.focus({ preventScroll: true });
      }
    }

    function update(action, value) {
      if (!current) return;
      const fields = {
        workflow: "workflow", "omni-reference-task-type": "omniReferenceTaskType",
        aspect: "aspect", resolution: "resolution", quality: "quality",
        "output-format": "outputFormat", duration: "duration", audio: "audioEnabled",
      };
      const field = fields[action];
      if (!field) return;
      current[field] = action === "audio" ? value === "on" : value;
      normalize(current);
      onChange();
    }

    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      setOpen(menu.hidden, { focus: true });
    });
    menu.addEventListener("pointerdown", (event) => event.stopPropagation());
    menu.addEventListener("click", (event) => {
      event.stopPropagation();
      const button = event.target.closest("button[data-action]");
      if (!button || button.disabled) return;
      const { action, value } = button.dataset;
      update(action, value);
      render({ action, value });
    });
    function onDuration(event) {
      const input = event.target.closest("[data-duration-range], [data-duration-number]");
      if (!input || !current) return;
      if (input.value === "" && event.type === "input") return;
      if (input.value !== "") update("duration", `${input.value}s`);
      const seconds = Number.parseFloat(current.duration);
      for (const control of menu.querySelectorAll("[data-duration-range], [data-duration-number]")) {
        if (control !== input || event.type === "change") control.value = String(seconds);
        if (control.matches("[data-duration-range]")) {
          const progress = (seconds - Number(control.min)) / (Number(control.max) - Number(control.min)) * 100;
          control.style.setProperty("--duration-progress", `${progress}%`);
          control.setAttribute("aria-valuetext", `${seconds} 秒`);
        }
      }
    }
    menu.addEventListener("input", onDuration);
    menu.addEventListener("change", onDuration);
    root.addEventListener("resize", position);
    const observer = root.ResizeObserver ? new root.ResizeObserver(position) : null;
    observer?.observe(trigger);
    observer?.observe(menu.parentElement);
    observer?.observe(boundary);

    return { sync, setOpen, isOpen: () => !menu.hidden, getCurrent: () => current };
  }

  root.REELAY_AGENT_PARAMETERS = Object.freeze({ createController });
})(globalThis);
