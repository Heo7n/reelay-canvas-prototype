(function registerLibraryReferencePicker(root) {
  "use strict";

  function create(options) {
    const { document } = options;
    const bar = document.createElement("div");
    bar.className = "library-reference-mode-bar";
    bar.hidden = true;
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "从素材库选择参考");
    bar.innerHTML = `${root.REELAY_ICONS.markup("mouse-pointer-click")}<span class="library-reference-mode-label">从素材库选择参考</span><span class="library-reference-mode-count" aria-live="polite"></span><button type="button" aria-label="退出参考选择">退出</button>`;
    (options.container || document.body).append(bar);
    const count = bar.querySelector(".library-reference-mode-count");
    bar.querySelector("button").addEventListener("click", () => options.exit({ restoreFocus: true }));

    function sync() {
      const target = options.getTarget();
      if (target && !options.isValid(target)) {
        options.exit({ restoreFocus: false });
        bar.hidden = true;
        return false;
      }
      bar.hidden = !target;
      if (!target) return false;
      count.textContent = `${target.kind === "agent" ? "对话" : "节点"} · ${options.getEntries(target).length} 项`;
      bar.title = options.getTargetLabel(target);
      return true;
    }

    function matches(source, asset) {
      const keys = new Set(options.identityKeys(source));
      return options.identityKeys(asset).some((key) => keys.has(key))
        || Boolean(source.url && asset.url && source.url === asset.url);
    }

    function selection(source) {
      const target = options.getTarget();
      if (!target || !options.isValid(target)) return { selected: false, disabled: true };
      const entries = options.getEntries(target).filter((entry) => matches(source, entry.asset));
      const linked = entries.some((entry) => entry.connectionId);
      return { selected: entries.length > 0, disabled: linked,
        hint: linked ? "已通过画布连线引用，请在画布中管理连线" : entries.length ? "点击取消参考" : "点击加入参考", entries };
    }

    function toggle(id, space) {
      if (!sync()) return false;
      const target = options.getTarget();
      const media = options.resolveMedia(id, space);
      if (!media) { options.notify("素材已不可用，请重新选择"); return false; }
      const current = selection(media);
      if (current.disabled) { options.notify(current.hint); return false; }
      const changed = current.selected
        ? options.remove(target, current.entries.map((entry) => entry.asset.id))
        : options.add(target, media);
      if (!changed) options.notify("未能更新参考，请检查素材或目标状态");
      sync();
      options.onChange();
      return Boolean(changed);
    }

    return Object.freeze({ sync, selection, toggle, destroy: () => bar.remove() });
  }

  root.REELAY_CANVAS_LIBRARY_REFERENCE_PICKER = Object.freeze({ create });
})(typeof window !== "undefined" ? window : globalThis);
