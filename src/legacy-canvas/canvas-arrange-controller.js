(function registerCanvasArrangeController(root) {
  "use strict";

  function create({ button, menu, getContext, describeScope, prepareArrangement,
    beforeArrange, commit, onPreviewChange, onComplete, notify, onOpenChange }) {
    let session = null;
    const tip = button.querySelector(".canvas-tool-tip");
    const document = menu.ownerDocument;
    const events = new document.defaultView.AbortController();

    function geometry(context, collection, record) {
      const bounds = collection === "nodes" ? context.getNodeBounds(record) : context.getGroupBounds(record);
      return JSON.stringify([record.id, record.x, record.y, bounds,
        collection === "nodes" ? record.groupId : [record.width, record.height, record.nodeIds]]);
    }

    function connectionKey(context) {
      return JSON.stringify(context.connections.map(({ id, sourceNodeId, targetNodeId }) =>
        [id, sourceNodeId, targetNodeId]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
    }

    function isCurrent(context) {
      if (!session || session.canvas !== context.canvas || !context.canMutate || context.interactionBusy) return false;
      for (const collection of ["nodes", "groups"]) {
        if (context[collection].length !== session[collection].size) return false;
        for (const record of context[collection]) {
          const entry = session[collection].get(record);
          if (!entry || entry.geometry !== geometry(context, collection, record)) return false;
        }
      }
      return session.connections === connectionKey(context);
    }

    function show(open) {
      menu.classList.toggle("hidden", !open);
      button.setAttribute("aria-expanded", String(open));
      button.classList.toggle("active", open);
      onOpenChange();
    }

    function close({ focus = false } = {}) {
      if (!session) return false;
      session = null;
      show(false);
      onPreviewChange();
      if (focus && button.isConnected) button.focus({ preventScroll: true });
      return true;
    }

    function sync() {
      const context = getContext();
      if (session && !isCurrent(context)) close();
      const description = describeScope({ ...context, scope: "all" });
      const available = context.canMutate && !context.interactionBusy && description.ok;
      button.setAttribute("aria-disabled", String(!available));
      tip.textContent = !context.canMutate ? "当前画布不可编辑"
        : context.interactionBusy ? "请先完成当前画布操作"
          : description.ok ? "整理画布" : description.reason;
    }

    function toggle({ focus = false } = {}) {
      if (session) { close({ focus }); return; }
      beforeArrange();
      const context = getContext();
      const description = describeScope({ ...context, scope: "all" });
      if (!context.canMutate || context.interactionBusy || !description.ok) {
        sync();
        notify(tip.textContent);
        return;
      }
      const plan = prepareArrangement({ ...context, scope: "all", mode: "auto" });
      if (!plan.ok) { notify(plan.reason); return; }
      if (!plan.changed) { notify("当前布局已整齐"); return; }
      const capture = (collection, positions) => {
        const byId = new Map(positions.map((position) => [position.id, position]));
        return new Map(context[collection].map((record) => [record, {
          geometry: geometry(context, collection, record), position: byId.get(record.id),
        }]));
      };
      session = { canvas: context.canvas, plan, connections: connectionKey(context),
        nodes: capture("nodes", plan.positions), groups: capture("groups", plan.groupPositions) };
      show(true);
      onPreviewChange();
      if (focus) menu.querySelector('[data-arrange-decision="restore"]')?.focus({ preventScroll: true });
    }

    function keep() {
      if (!session) return;
      if (!isCurrent(getContext())) { close(); return; }
      const plan = session.plan;
      // Only presentation was changed; the regular command still validates and
      // commits against the original live geometry, producing exactly one undo.
      session = null;
      show(false);
      const result = commit(plan);
      if (result?.ok) onComplete(plan);
      else onPreviewChange();
      button.focus({ preventScroll: true });
    }

    function position(collection, record) {
      if (!session || session.canvas !== getContext().canvas) return null;
      return session[collection].get(record)?.position || null;
    }

    const inside = (target) => target instanceof document.defaultView.Element
      && (menu.contains(target) || button.contains(target));
    document.addEventListener("pointerdown", (event) => {
      if (session && !inside(event.target)) close();
    }, { capture: true, signal: events.signal });
    document.addEventListener("wheel", (event) => {
      if (session && !inside(event.target)) close();
    }, { capture: true, passive: true, signal: events.signal });
    document.addEventListener("keydown", (event) => {
      if (!session) return;
      if (event.key === "Escape" || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        close({ focus: true });
      } else if (!inside(event.target) && !["Tab", "Shift", "Control", "Meta", "Alt"].includes(event.key)) close();
    }, { capture: true, signal: events.signal });
    menu.addEventListener("pointerdown", (event) => event.stopPropagation(), { signal: events.signal });
    menu.addEventListener("click", (event) => {
      event.stopPropagation();
      const decision = event.target.closest("[data-arrange-decision]")?.dataset.arrangeDecision;
      if (decision === "restore") close({ focus: true });
      if (decision === "keep") keep();
    }, { signal: events.signal });
    function dispose() { close(); events.abort(); }
    return Object.freeze({ toggle, close, sync, keep, dispose,
      getNodePosition: (node) => position("nodes", node),
      getGroupPosition: (group) => position("groups", group),
    });
  }

  root.REELAY_CANVAS_ARRANGE_CONTROLLER = Object.freeze({ create });
}(typeof globalThis === "object" ? globalThis : window));
