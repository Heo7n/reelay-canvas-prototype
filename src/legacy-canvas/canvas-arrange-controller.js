(function registerCanvasArrangeController(root) {
  "use strict";

  const MODES = new Set(["auto", "grid", "horizontal", "vertical"]);
  const selectionKey = (context) => JSON.stringify([
    context.activeGroupId || null, [...context.selectedIds].sort(),
  ]);

  function create({ button, menu, getContext, describeScope, prepareArrangement,
    beforeArrange, commit, onComplete, notify, onOpenChange }) {
    let session = null;
    const status = menu.querySelector("[data-arrange-status]");
    const count = menu.querySelector("[data-arrange-count]");
    const tip = button.querySelector(".canvas-tool-tip");

    function isCurrent(context) {
      return session && session.canvas === context.canvas && session.key === selectionKey(context);
    }

    function unavailable(context, description) {
      if (!context.canMutate) return "当前画布不可编辑";
      if (context.interactionBusy) return "请先完成当前画布操作";
      return description.ok ? "" : description.reason;
    }

    function close() {
      if (!session) return;
      session = null;
      menu.classList.add("hidden");
      button.setAttribute("aria-expanded", "false");
      button.classList.remove("active");
      onOpenChange();
    }

    function sync() {
      const context = getContext();
      const defaultScope = context.activeGroupId || context.selectedIds.size ? "current" : "all";
      const defaultDescription = describeScope({ ...context, scope: defaultScope });
      const reason = unavailable(context, defaultDescription);
      // Keep the scope chooser available for a single selection; the user may choose all.
      const canOpen = context.canMutate && !context.interactionBusy && (context.nodes.length > 0 || context.groups.length > 0);
      button.setAttribute("aria-disabled", String(!canOpen));
      tip.textContent = canOpen ? "整理画布" : reason || "画布暂无可整理内容";
      if (!session) return;
      if (!isCurrent(context) || !canOpen) { close(); return; }

      const description = describeScope({ ...context, scope: session.scope });
      const error = unavailable(context, description);
      const currentButton = menu.querySelector('[data-arrange-scope="current"]');
      currentButton.textContent = context.activeGroupId ? "当前分组" : "当前选择";
      currentButton.disabled = !context.activeGroupId && context.selectedIds.size === 0;
      menu.querySelectorAll("[data-arrange-scope]").forEach((control) => {
        control.setAttribute("aria-pressed", String(control.dataset.arrangeScope === session.scope));
      });
      count.textContent = `${description.scopeLabel || "整理范围"} · ${description.affectedNodeIds.length} 个节点`;
      status.textContent = error || description.notice || "保留连线与当前缩放；支持一次撤销。";
      menu.querySelectorAll("[data-arrange-action]").forEach((control) => { control.disabled = Boolean(error); });
    }

    function toggle({ focus = false } = {}) {
      if (session) { close(); return; }
      const context = getContext();
      if (!context.canMutate || context.interactionBusy || (!context.nodes.length && !context.groups.length)) {
        notify(!context.canMutate ? "当前画布不可编辑" : context.interactionBusy ? "请先完成当前画布操作" : "画布暂无可整理内容");
        return;
      }
      session = { canvas: context.canvas, key: selectionKey(context),
        scope: context.activeGroupId || context.selectedIds.size ? "current" : "all" };
      menu.classList.remove("hidden");
      button.setAttribute("aria-expanded", "true");
      button.classList.add("active");
      sync();
      onOpenChange();
      if (focus) menu.querySelector('[data-arrange-scope][aria-pressed="true"]')?.focus({ preventScroll: true });
    }

    function arrange(mode) {
      if (!MODES.has(mode)) return;
      let context = getContext();
      if (!isCurrent(context)) { close(); return; }
      const scope = session.scope;
      const error = unavailable(context, describeScope({ ...context, scope }));
      if (error) { notify(error); sync(); return; }
      beforeArrange();
      context = getContext();
      if (!isCurrent(context) || !context.canMutate || context.interactionBusy) { close(); return; }
      const plan = prepareArrangement({ ...context, scope, mode });
      if (!plan.ok) { status.textContent = plan.reason; notify(plan.reason); return; }
      if (!plan.changed) { close(); notify("当前布局已经整齐，无需重复整理"); return; }
      const result = commit(plan);
      if (!result?.ok) { status.textContent = "本次整理未完成，请重试。"; return; }
      close();
      onComplete(plan, mode);
    }

    menu.addEventListener("pointerdown", (event) => event.stopPropagation());
    menu.addEventListener("click", (event) => {
      event.stopPropagation();
      const target = event.target.closest("button");
      if (!target || target.disabled || !session) return;
      if (target.dataset.arrangeScope) {
        session.scope = target.dataset.arrangeScope;
        sync();
        onOpenChange();
      } else if (target.dataset.arrangeAction) arrange(target.dataset.arrangeAction);
    });
    return Object.freeze({ toggle, close, sync, arrange });
  }

  root.REELAY_CANVAS_ARRANGE_CONTROLLER = Object.freeze({ create });
}(typeof globalThis === "object" ? globalThis : window));
