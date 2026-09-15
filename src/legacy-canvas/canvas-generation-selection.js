(function registerGenerationSelection(global) {
  "use strict";

  const TERMINAL = new Set(["succeeded", "failed", "canceled"]);

  function createController({ document, container, trigger, getScope, getTasks, getTask, onRemove, onEnter = () => {},
    refreshIcons = () => {} }) {
    const selected = new Set();
    const rows = new Map();
    const previousInert = new WeakMap();
    let scopeKey = "";
    let selecting = false;
    let disposed = false;
    let removing = false;
    let toolbar = null;

    function keyOf(scope) {
      const conversationId = scope?.conversationId || scope?.conversation?.id;
      return scope?.projectId && conversationId ? `${scope.projectId}\u0000${conversationId}` : "";
    }
    function inScope(task) {
      return task && scopeKey && keyOf(task.scope) === scopeKey && keyOf(getScope()) === scopeKey;
    }
    function currentTasks() {
      return (getTasks() || []).filter(inScope);
    }
    function restoreChild(child) {
      if (!previousInert.has(child)) return;
      child.inert = previousInert.get(child);
      previousInert.delete(child);
    }
    function restoreRow(row, entry) {
      for (const child of entry.children) restoreChild(child);
      entry.label.removeEventListener("click", stopRowClick);
      entry.label.remove();
      row.classList.remove("is-selecting", "is-record-selected");
      rows.delete(row);
    }
    function syncTrigger(tasks) {
      trigger.disabled = !tasks.length;
      trigger.setAttribute("aria-pressed", String(selecting));
      const label = selecting ? "退出多选" : "多选生成记录";
      trigger.setAttribute("aria-label", label);
      trigger.title = label;
    }
    function close({ restoreFocus = false } = {}) {
      selecting = false;
      selected.clear();
      toolbar?.remove(); toolbar = null;
      for (const [row, entry] of rows) restoreRow(row, entry);
      container.classList.remove("is-selecting-records");
      syncTrigger(currentTasks());
      if (restoreFocus && !trigger.disabled && !trigger.hidden && trigger.isConnected) trigger.focus();
    }
    function stopRowClick(event) { event.stopPropagation(); }
    function decorateRow(row, task, index) {
      let entry = rows.get(row);
      if (!entry) {
        const label = document.createElement("label");
        label.className = "generation-record-select-overlay";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.dataset.generationSelection = "record";
        label.append(checkbox);
        label.addEventListener("click", stopRowClick);
        entry = { label, checkbox, children: new Set() };
        rows.set(row, entry);
        for (const media of row.querySelectorAll("video, audio")) {
          try { media.pause(); } catch { /* Detached or unavailable media must not prevent selection. */ }
        }
      }
      for (const child of entry.children) {
        if (child.parentElement !== row) { restoreChild(child); entry.children.delete(child); }
      }
      for (const child of row.children) {
        if (child === entry.label) continue;
        if (!previousInert.has(child)) previousInert.set(child, Boolean(child.inert));
        child.inert = true;
        entry.children.add(child);
      }
      if (entry.label.parentElement !== row) row.append(entry.label);
      const eligible = TERMINAL.has(task.status);
      const prompt = String(task.input?.prompt || "").trim().slice(0, 30);
      entry.checkbox.setAttribute("aria-label", `选择生成记录：${prompt || `第 ${index + 1} 条`}`);
      entry.checkbox.disabled = !eligible;
      entry.checkbox.checked = selected.has(task.id);
      entry.label.title = eligible ? "" : "生成中，暂不可删除";
      row.classList.add("is-selecting");
      row.classList.toggle("is-record-selected", selected.has(task.id));
    }
    function syncToolbar(tasks) {
      if (!toolbar) {
        toolbar = document.createElement("div");
        toolbar.className = "generation-record-selection-toolbar";
        toolbar.setAttribute("role", "group");
        toolbar.setAttribute("aria-label", "批量选择生成记录");
        toolbar.innerHTML = '<label class="generation-record-select-all"><input type="checkbox" data-generation-selection="all"><span>全选</span></label>'
          + '<span class="generation-record-selection-count" role="status" aria-live="polite"></span>'
          + '<button type="button" data-generation-selection="remove"><i data-lucide="trash-2" aria-hidden="true"></i><span>删除</span></button>'
          + '<button type="button" data-generation-selection="done">完成</button>';
        refreshIcons(toolbar);
      }
      const list = container.querySelector(".generation-record-list");
      if (list) {
        if (toolbar.nextElementSibling !== list) list.before(toolbar);
      } else if (toolbar.parentElement !== container) container.prepend(toolbar);
      const eligible = tasks.filter((task) => TERMINAL.has(task.status));
      const all = toolbar.querySelector('[data-generation-selection="all"]');
      all.checked = eligible.length > 0 && selected.size === eligible.length;
      all.indeterminate = selected.size > 0 && selected.size < eligible.length;
      all.disabled = !eligible.length;
      toolbar.querySelector(".generation-record-selection-count").textContent = `已选 ${selected.size} 条`;
      toolbar.querySelector('[data-generation-selection="remove"]').disabled = !selected.size || removing;
    }
    function render() {
      if (disposed) return;
      const nextScope = keyOf(getScope());
      if (nextScope !== scopeKey) { close(); scopeKey = nextScope; }
      const tasks = currentTasks();
      if (!tasks.length) close();
      syncTrigger(tasks);
      if (!selecting) return;
      const taskMap = new Map(tasks.map((task) => [task.id, task]));
      for (const id of selected) {
        if (!TERMINAL.has(taskMap.get(id)?.status)) selected.delete(id);
      }
      const liveRows = new Set(container.querySelectorAll(".generation-record"));
      for (const [row, entry] of rows) {
        if (!liveRows.has(row) || !taskMap.has(row.dataset.generationTaskId)) restoreRow(row, entry);
      }
      let index = 0;
      for (const row of liveRows) {
        const task = taskMap.get(row.dataset.generationTaskId);
        if (task) decorateRow(row, task, index++);
      }
      container.classList.add("is-selecting-records");
      syncToolbar(tasks);
    }
    function toggle() {
      if (disposed) return;
      render();
      if (selecting) { close({ restoreFocus: true }); return; }
      if (trigger.disabled) return;
      onEnter();
      selecting = true;
      render();
    }
    function changeSelection(event) {
      const action = event.target?.dataset?.generationSelection;
      if (action !== "all" && action !== "record") return;
      const checked = event.target.checked;
      const id = event.target.closest(".generation-record")?.dataset.generationTaskId;
      render();
      if (!selecting) return;
      if (action === "all") {
        for (const task of currentTasks()) {
          if (!TERMINAL.has(task.status)) continue;
          if (checked) selected.add(task.id); else selected.delete(task.id);
        }
      } else {
        const task = getTask(id);
        if (inScope(task) && TERMINAL.has(task.status)) {
          if (checked) selected.add(id); else selected.delete(id);
        }
      }
      render();
    }
    function toolbarClick(event) {
      const action = event.target.closest?.("[data-generation-selection]")?.dataset.generationSelection;
      if (action !== "remove" && action !== "done") return;
      if (action === "done") { close({ restoreFocus: true }); return; }
      render();
      if (!selecting || removing) return;
      const tasks = Array.from(selected, (id) => getTask(id)).filter((task) => inScope(task) && TERMINAL.has(task.status));
      if (!tasks.length) return;
      removing = true;
      render();
      let result;
      try { result = onRemove(Object.freeze(tasks)); }
      catch (error) { removing = false; render(); throw error; }
      const finish = () => { removing = false; render(); };
      if (result?.then) result.then(finish, finish);
      else finish();
    }
    function escapeSelection(event) {
      if (!selecting || event.key !== "Escape" || event.defaultPrevented) return;
      if (!container.contains(event.target) && !trigger.contains(event.target)) return;
      const openDialog = Array.from(document.querySelectorAll('dialog[open], [role="dialog"], [aria-modal="true"]'))
        .some((dialog) => !dialog.closest("[hidden], .hidden") && (dialog.tagName !== "DIALOG" || dialog.open));
      if (openDialog) return;
      event.preventDefault();
      close({ restoreFocus: true });
    }
    function dispose() {
      if (disposed) return;
      close();
      disposed = true;
      trigger.removeEventListener("click", toggle);
      container.removeEventListener("change", changeSelection);
      container.removeEventListener("click", toolbarClick);
      document.removeEventListener("keydown", escapeSelection);
    }

    trigger.addEventListener("click", toggle);
    container.addEventListener("change", changeSelection);
    container.addEventListener("click", toolbarClick);
    document.addEventListener("keydown", escapeSelection);
    render();
    return Object.freeze({ render, close, dispose });
  }

  global.REELAY_GENERATION_SELECTION = Object.freeze({ createController });
}(typeof globalThis === "object" ? globalThis : window));
