(function registerLibrarySearchSession(root) {
  "use strict";

  function create(options = {}) {
    if (typeof options.read !== "function" || typeof options.apply !== "function") {
      throw new TypeError("Library search session dependencies are incomplete.");
    }
    const copy = (value) => JSON.parse(JSON.stringify(value));
    let scope = options.getScopeKey?.();
    let status = "idle";
    let source = null;
    let results = null;

    function reset() {
      scope = options.getScopeKey?.();
      status = "idle";
      source = null;
      results = null;
    }

    function syncContext() {
      if (scope !== options.getScopeKey?.()) reset();
    }

    function apply(snapshot) {
      const next = copy(snapshot);
      options.apply(next);
      return copy(next);
    }

    function resume() {
      syncContext();
      if (status !== "suspended") return null;
      const snapshot = results;
      status = "open";
      results = null;
      return apply(snapshot);
    }

    function open() {
      syncContext();
      if (status === "suspended") return resume();
      const current = copy(options.read());
      if (status === "idle") source = copy(current);
      status = "open";
      return current;
    }

    function close() {
      syncContext();
      if (status === "idle") return null;
      const snapshot = source;
      reset();
      return apply(snapshot);
    }

    function suspend() {
      syncContext();
      if (status !== "open") return null;
      results = copy(options.read());
      status = "suspended";
      return copy(results);
    }

    function pruneTags(space, validIds) {
      syncContext();
      function prune(view, inheritedSpace) {
        if (!view || typeof view !== "object") return;
        const viewSpace = view.space ?? inheritedSpace;
        if (viewSpace === space && Array.isArray(view.tagFilter?.tagIds)) {
          view.tagFilter.tagIds = view.tagFilter.tagIds.filter((id) => validIds.has(id));
        }
        prune(view.entityFilter, viewSpace);
        prune(view.returnContext, viewSpace);
      }
      prune(source);
      prune(results);
    }

    return Object.freeze({
      open, close, suspend, resume, reset, syncContext, pruneTags,
      isOpen() { syncContext(); return status === "open"; },
      hasReturn() { syncContext(); return status === "suspended"; },
      isActive() { syncContext(); return status !== "idle"; },
    });
  }

  root.REELAY_CANVAS_LIBRARY_SEARCH_SESSION = Object.freeze({ create });
})(typeof globalThis === "object" ? globalThis : window);
