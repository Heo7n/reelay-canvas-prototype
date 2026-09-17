(function registerInspirationMatching(root) {
  "use strict";

  const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

  function create({ host, model, clips, getScope, readSource, onChange, onExit = () => {}, refreshIcons = () => {} }) {
    let session = null;
    let disposed = false;
    host.innerHTML = `<div class="inspiration-match-heading"><span data-match-label></span><button type="button" data-match-action="update">更新匹配</button><button type="button" data-match-action="clear" aria-label="退出灵感匹配" title="退出匹配，保留搜索和筛选"><i data-lucide="x" aria-hidden="true"></i></button></div><p data-match-text></p><div class="inspiration-match-priority-heading"><span>匹配侧重 <small>点击标签优先参考</small></span><button type="button" data-match-action="reset" hidden>恢复默认</button></div><div class="inspiration-match-terms" role="group" aria-label="匹配侧重"></div>`;
    const label = host.querySelector("[data-match-label]");
    const text = host.querySelector("[data-match-text]");
    const update = host.querySelector('[data-match-action="update"]');
    const terms = host.querySelector('.inspiration-match-terms');
    const reset = host.querySelector('[data-match-action="reset"]');

    function renderTerms() {
      reset.hidden = !session || !Object.keys(session.preferences).length;
      if (!session) { terms.replaceChildren(); return; }
      terms.innerHTML = session.terms.filter((term) => session.preferences[term.id] !== "removed").map((term) => {
        const focused = session.preferences[term.id] === "focus";
        return `<span class="inspiration-match-term${focused ? " is-focused" : ""}"><button type="button" data-match-action="focus" data-match-term="${escape(term.id)}" aria-pressed="${focused}" aria-label="${escape(term.label)}，${focused ? "重点参考" : "普通参考"}" title="${focused ? "重点参考，点击恢复普通参考" : "点击设为重点参考"}"><span class="inspiration-match-priority-mark" aria-hidden="true">${focused ? "●" : ""}</span>${escape(term.label)}</button><button type="button" data-match-action="remove" data-match-term="${escape(term.id)}" aria-label="移除${escape(term.label)}条件" title="不再以${escape(term.label)}作为匹配依据"><i data-lucide="x" aria-hidden="true"></i></button></span>`;
      }).join("") || `<span class="inspiration-match-terms-empty" role="status">${session.terms.length ? "已移除全部条件，显示搜索与筛选结果" : "暂未识别出可调整的条件"}</span>`;
      refreshIcons();
    }

    function recompute() {
      session.matches = model.match({ text: session.text, clips, preferences: session.preferences });
    }

    function focusTerm(id) {
      const button = Array.from(terms.querySelectorAll('[data-match-action="focus"]')).find((element) => element.dataset.matchTerm === id);
      (button || (!reset.hidden ? reset : update)).focus({ preventScroll: true });
    }

    function clear() { session = null; host.hidden = true; }
    function sync() {
      if (!session) { host.hidden = true; return false; }
      const source = session.scope === getScope() ? readSource(session.target) : null;
      if (!source) { clear(); return true; }
      host.hidden = false;
      label.textContent = `基于${session.label}`;
      text.textContent = session.text;
      text.title = session.text;
      const changed = source.text.trim() !== session.text;
      update.disabled = !changed || !source.text.trim();
      update.title = changed ? "根据当前文字重新匹配" : "当前匹配已是最新";
      update.classList.toggle("has-changes", changed);
      return false;
    }
    function begin(target, previousPreferences = {}) {
      if (disposed) return false;
      const source = readSource(target);
      if (!source?.text.trim()) return false;
      const snapshot = source.text.trim();
      const extracted = model.extract(snapshot);
      const preferences = Object.fromEntries(extracted.filter((term) => previousPreferences[term.id]).map((term) => [term.id, previousPreferences[term.id]]));
      session = { target, scope: getScope(), text: snapshot, label: source.label, terms: extracted, preferences, matches: [] };
      recompute();
      renderTerms();
      sync();
      refreshIcons();
      return true;
    }
    function onClick(event) {
      const button = event.target.closest("[data-match-action]");
      const action = button?.dataset.matchAction;
      if (!action) return;
      if (sync()) { onChange(); return; }
      if (action === "clear") clear();
      else if (!session) return;
      else if (action === "update") begin(session.target, session.preferences);
      else if (action === "reset") { session.preferences = {}; recompute(); renderTerms(); }
      else if (action === "focus" || action === "remove") {
        const id = button.dataset.matchTerm;
        const index = session.terms.findIndex((term) => term.id === id);
        if (index < 0 || session.preferences[id] === "removed") return;
        if (action === "remove") session.preferences[id] = "removed";
        else if (session.preferences[id] === "focus") delete session.preferences[id];
        else session.preferences[id] = "focus";
        recompute();
        renderTerms();
        const next = action === "remove" ? session.terms.slice(index + 1).find((term) => session.preferences[term.id] !== "removed") : session.terms[index];
        focusTerm(next?.id);
      } else return;
      onChange();
      if (action === "clear") onExit();
      if (action === "update") host.querySelector('[data-match-action="clear"]')?.focus({ preventScroll: true });
      if (action === "reset") focusTerm(session.terms[0]?.id);
    }
    host.addEventListener("click", onClick);
    return Object.freeze({ begin, clear, sync,
      get active() { sync(); return Boolean(session); },
      matchFor(id) { sync(); return session?.matches.find((match) => match.clipId === id) || null; },
      results(candidates) {
        sync();
        if (!session) return candidates;
        if (session.terms.length && session.terms.every((term) => session.preferences[term.id] === "removed")) return candidates;
        const byId = new Map(candidates.map((clip) => [clip.id, clip]));
        return session.matches.map((match) => byId.get(match.clipId)).filter(Boolean);
      },
      emptyMarkup() { return '<div class="asset-library-empty" role="status"><strong>暂无匹配片段</strong><span>试试调整描述或筛选条件</span></div>'; },
      destroy() { disposed = true; clear(); host.removeEventListener("click", onClick); host.replaceChildren(); },
    });
  }
  root.REELAY_CANVAS_INSPIRATION_MATCHING = Object.freeze({ create });
})(window);
