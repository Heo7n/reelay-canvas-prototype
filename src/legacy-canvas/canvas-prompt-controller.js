(function registerCanvasPrompts(root) {
  "use strict";
  let loading;

  function loadEditor(document) {
    if (root.REELAY_PROMPT_EDITOR) return Promise.resolve(root.REELAY_PROMPT_EDITOR);
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = document.documentElement.dataset.promptEditorSrc || "./assets/prompt-editor.js";
      script.onload = () => {
        script.remove();
        if (root.REELAY_PROMPT_EDITOR) resolve(root.REELAY_PROMPT_EDITOR);
        else { loading = null; reject(new Error("Prompt editor did not initialize.")); }
      };
      script.onerror = () => { script.remove(); loading = null; reject(new Error("Prompt editor could not load.")); };
      document.head.appendChild(script);
    });
    return loading;
  }

  function createController({ document, showMessage = () => {} }) {
    const model = root.REELAY_CANVAS_PROMPT_DOCUMENT;
    const records = new WeakMap();
    const mounted = new Set();
    let disposed = false;
    const same = (a, b) => JSON.stringify(model.normalize(a)) === JSON.stringify(model.normalize(b));

    function detach(record) {
      if (record.options) record.snapshotDoc = model.normalize(record.options.readDocument());
      if (record.editor) {
        record.snapshot = record.editor.snapshotState();
        record.snapshotDoc = record.editor.getDocument();
        record.editor.destroy();
        record.editor = null;
      }
      record.epoch++;
      record.pending = false;
      record.focusWhenReady = false;
      record.element = null;
      // Mounted callbacks may close over the node's DOM. Retain only the
      // document, scope and editor history while the owner is collapsed.
      record.options = null;
      mounted.delete(record);
    }

    function mount(owner, element, options) {
      if (!owner || !element || disposed) return;
      let record = records.get(owner);
      if (!record) { record = { owner, epoch: 0, snapshot: null, historyLinks: [] }; records.set(owner, record); }
      if (record.scope !== undefined && record.scope !== options.scope) {
        detach(record);
        record.snapshot = null;
        record.historyLinks = [];
      }
      if (record.element && record.element !== element) detach(record);
      record.options = options;
      record.scope = options.scope;
      record.snapshotDoc = model.normalize(options.readDocument());
      record.element = element;
      mounted.add(record);
      if (record.editor) {
        if (!same(record.editor.getDocument(), options.readDocument())) {
          record.editor.setDocument(options.readDocument(), { addToHistory: false, notify: false });
        }
        record.editor.refresh();
        return;
      }
      if (record.pending) return;
      const epoch = record.epoch;
      record.pending = true;
      element.setAttribute("aria-busy", "true");
      element.textContent = model.toText(options.readDocument(), options.getReferences());
      function install(engine) {
        if (disposed || record.epoch !== epoch || record.element !== element || !record.options.isCurrent()) return;
        const read = () => record.options;
        const isInstalled = () => !disposed && record.epoch === epoch && record.element === element
          && Boolean(record.options?.isCurrent());
        const initial = read().readDocument();
        const snapshot = record.snapshot;
        record.editor = engine.createEditor({
          element, document: initial,
          historyState: snapshot,
          getReferences: () => isInstalled() ? read().getReferences() : [],
          getScope: () => isInstalled() ? read().scope : null,
          isEditable: () => isInstalled() && read().isEditable(),
          isMentionEnabled: () => isInstalled() && read().isMentionEnabled?.() !== false,
          getPlaceholder: () => isInstalled() ? read().getPlaceholder() : "",
          submitOnEnter: Boolean(options.submitOnEnter),
          onChange: (value, meta = {}) => {
            if (!isInstalled()) return;
            const previous = read().readDocument();
            const historyAction = record.historyLinks.findLast((action) => meta.origin === "undo"
              ? same(action.after, previous) && same(action.before, value)
              : meta.origin === "redo" && same(action.before, previous) && same(action.after, value));
            read().onChange(value, { ...meta, historyAction });
          },
          onSubmit: () => { if (isInstalled()) read().onSubmit?.(); },
          onEscape: () => { if (isInstalled()) record.editor?.blur(); },
          onMessage: showMessage,
        });
        if (!same(record.editor.getDocument(), initial)) record.editor.setDocument(initial, { addToHistory: false, notify: false });
        record.editor.refresh();
        if (record.focusWhenReady) { record.focusWhenReady = false; record.editor.focus(); }
        if (isInstalled()) read().onReady?.(record.editor);
      }
      if (root.REELAY_PROMPT_EDITOR) {
        install(root.REELAY_PROMPT_EDITOR);
        record.pending = false;
        element.removeAttribute("aria-busy");
        return;
      }
      loadEditor(document).then((engine) => {
        if (element.isConnected) install(engine);
      }).catch((error) => {
        if (disposed || record.epoch !== epoch || record.element !== element) return;
        console.error(error);
        element.textContent = "输入区暂时未加载，点击重试";
        element.addEventListener("click", () => mount(owner, element, record.options), { once: true });
        showMessage("输入区暂时未加载，请点击重试");
      }).finally(() => {
        if (record.epoch === epoch) { record.pending = false; element.removeAttribute("aria-busy"); }
      });
    }

    function replace(owner, value, { addToHistory = true } = {}) {
      const record = records.get(owner);
      if (!record) return null;
      const previous = record.editor?.getDocument() || record.snapshotDoc;
      const previousState = record.editor?.snapshotState() || record.snapshot;
      const before = previousState ? { ...previousState, document: model.normalize(previous) } : null;
      if (record.editor) {
        record.editor.setDocument(value, { addToHistory, notify: false });
        record.snapshot = record.editor.snapshotState();
      } else if (root.REELAY_PROMPT_EDITOR && before) {
        record.snapshot = root.REELAY_PROMPT_EDITOR.replaceSnapshot(before, value, { addToHistory });
      }
      record.snapshotDoc = model.normalize(value);
      return before;
    }

    function restore(owner, snapshot) {
      const record = records.get(owner);
      if (!record || !snapshot || snapshot.scope !== record.scope) return false;
      record.snapshot = snapshot;
      if (record.editor) record.editor.restoreState(snapshot);
      record.snapshotDoc = record.editor?.getDocument() || model.normalize(snapshot.document ?? record.snapshotDoc);
      return true;
    }

    function prune() {
      for (const record of mounted) {
        if (!record.element?.isConnected || !record.options.isCurrent()) detach(record);
      }
    }

    function release(owner) {
      const record = records.get(owner);
      if (record) detach(record);
      records.delete(owner);
    }

    return Object.freeze({ mount, replace, restore, prune, release,
      linkHistory(owner, action) {
        const record = records.get(owner);
        if (!record) return;
        record.historyLinks.push(action);
        if (record.historyLinks.length > 50) record.historyLinks.shift();
      },
      clearHistory(owner) {
        const record = records.get(owner);
        if (!record) return;
        record.historyLinks = [];
        const value = record.options ? record.options.readDocument() : record.snapshotDoc;
        if (record.editor) {
          record.editor.setDocument(value, { resetHistory: true, notify: false });
          record.snapshot = record.editor.snapshotState();
        } else if (root.REELAY_PROMPT_EDITOR) record.snapshot = root.REELAY_PROMPT_EDITOR.createSnapshot(value, record.scope);
        record.snapshotDoc = model.normalize(value);
      },
      focus(owner) { const record = records.get(owner); if (record?.editor) record.editor.focus(); else if (record) record.focusWhenReady = true; },
      unmount(owner) { const record = records.get(owner); if (record) detach(record); },
      get: (owner) => records.get(owner)?.editor || null,
      refresh() { prune(); for (const record of mounted) record.editor?.refresh(); },
      destroy() { disposed = true; for (const record of mounted) detach(record); },
    });
  }

  root.REELAY_CANVAS_PROMPTS = Object.freeze({ createController });
}(typeof globalThis === "object" ? globalThis : window));
