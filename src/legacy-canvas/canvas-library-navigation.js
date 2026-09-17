(function registerLibraryNavigation(root) {
  "use strict";

  function createLibraryNavigation(options) {
    const contexts = new Map();
    const lastZones = new Map();
    const returns = new Map();
    let scope = options.getScopeKey?.();
    const copy = (value) => JSON.parse(JSON.stringify(value));
    const key = (view) => `${view.space}:${view.zone}`;
    const empty = (space, zone = "media") => ({ space, zone, folderId: null, query: "", filter: "all",
      tagFilter: { tagIds: [], untagged: false }, scrollTop: 0 });
    function remember(view = options.read()) {
      contexts.set(key(view), copy(view));
      lastZones.set(view.space, view.zone);
    }
    function apply(view) {
      const next = copy(view);
      if (next.folderId && !options.folderExists(next.folderId, next.space)) next.folderId = null;
      options.apply(next);
      return next;
    }
    function restore(space, zone = lastZones.get(space) || "media") {
      if (!["personal", "organization"].includes(space)) zone = "media";
      return apply(contexts.get(`${space}:${zone}`) || empty(space, zone));
    }
    function enterSubjects({ reset = false } = {}) {
      const current = options.read();
      if (!["personal", "organization"].includes(current.space)) return false;
      remember(current);
      if (current.zone !== "subjects") returns.set(current.space, copy(current));
      return apply(reset ? empty(current.space, "subjects") : contexts.get(`${current.space}:subjects`) || empty(current.space, "subjects"));
    }
    function leaveSubjects() {
      const current = options.read();
      remember(current);
      return apply(returns.get(current.space) || contexts.get(`${current.space}:media`) || empty(current.space));
    }
    function selectDirectory(folderId) {
      const current = options.read();
      remember(current);
      const next = copy(current.zone === "media" ? current : contexts.get(`${current.space}:media`) || empty(current.space));
      return apply({ ...next, zone: "media", folderId, scrollTop: 0 });
    }
    function switchSpace(space) { remember(); return restore(space); }
    function openMediaRoot(space = "personal") {
      remember();
      return apply(empty(space));
    }
    function pruneTags(space, validIds) {
      for (const map of [contexts, returns]) for (const view of map.values()) {
        if (view.space === space) view.tagFilter.tagIds = view.tagFilter.tagIds.filter((id) => validIds.has(id));
      }
    }
    return Object.freeze({ remember, restore, enterSubjects, leaveSubjects, selectDirectory, switchSpace, openMediaRoot, pruneTags,
      returnFolderId: () => returns.get(options.read().space)?.folderId || null,
      syncContext() {
        const nextScope = options.getScopeKey?.();
        if (scope === nextScope) return;
        scope = nextScope;
        contexts.clear(); lastZones.clear(); returns.clear();
        apply(empty("personal"));
      },
      reset() { contexts.clear(); lastZones.clear(); returns.clear(); },
    });
  }
  root.REELAY_CANVAS_LIBRARY_NAVIGATION = Object.freeze({ createLibraryNavigation });
})(typeof globalThis === "object" ? globalThis : window);
