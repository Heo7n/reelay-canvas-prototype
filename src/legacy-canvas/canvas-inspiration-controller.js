(function registerInspirationController(root) {
  "use strict";

  function create({ document, catalog, view, getScope, canUse, onUse, afterUse, refreshIcons = () => {},
    copyText = (text) => root.navigator.clipboard.writeText(text),
    schedule = (callback, delay) => root.setTimeout(callback, delay), cancelScheduled = (timer) => root.clearTimeout(timer) }) {
    let session = null;
    let disposed = false;
    const drafts = new Map();
    const scopeKey = () => JSON.stringify(getScope());
    let activeScope = scopeKey();
    const clipKey = (clip) => JSON.stringify([clip.id, clip.analysisVersion, clip.url, clip.duration]);

    function close({ restoreFocus = true, remember = true } = {}) {
      const previous = session;
      if (!previous) return;
      previous.cancelAnalysis();
      previous.reveal?.cancel();
      session = null;
      if (remember && previous.scope === scopeKey()) {
        const { dialog, analysis, prompts, activeShotId, tab, video } = previous;
        drafts.delete(previous.key);
        drafts.set(previous.key, { analysis, prompts: { ...prompts }, activeShotId, tab, playhead: video.currentTime,
          startValue: dialog.querySelector("[data-inspiration-start]").value,
          endValue: dialog.querySelector("[data-inspiration-end]").value });
        if (drafts.size > 12) drafts.delete(drafts.keys().next().value);
      }
      previous.cleanup.forEach((remove) => remove());
      previous.video.pause();
      previous.video.removeAttribute("src");
      previous.video.load();
      if (previous.dialog.open) previous.dialog.close();
      previous.dialog.remove();
      if (restoreFocus && previous.scope === scopeKey() && previous.trigger?.isConnected) previous.trigger.focus({ preventScroll: true });
    }

    function syncContext() {
      const nextScope = scopeKey();
      if (activeScope !== nextScope || session && !canUse() && session.canUse) {
        close({ restoreFocus: false, remember: false });
        drafts.clear();
      }
      if (session && canUse() && !session.canUse) {
        session.canUse = true;
        session.updateActions();
      }
      activeScope = nextScope;
    }

    function open(id, trigger = document.activeElement, { shotId } = {}) {
      if (disposed) return false;
      syncContext();
      const clip = catalog.get(id);
      if (!clip) return false;
      close({ restoreFocus: false });
      const key = clipKey(clip);
      const saved = drafts.get(key);
      const matchedShot = clip.shots?.find((shot) => shot.id === shotId);
      const matchedAnalysisShot = saved?.analysis?.shots.find((shot) => shot.id === matchedShot?.id);
      const dialog = document.createElement("dialog");
      dialog.className = "canvas-inspiration-dialog";
      dialog.setAttribute("aria-labelledby", "inspirationDetailTitle");
      dialog.dataset.wheelScope = "local";
      dialog.innerHTML = view.renderDetail({ clip, start: 0, end: clip.duration, canUse: canUse(), attributionUrl: catalog.attributionUrl,
        discoveryTags: catalog.getDiscoveryTags?.(clip), matchedShot });
      document.body.append(dialog);
      const video = dialog.querySelector("[data-inspiration-video]");
      const current = { dialog, video, clip, key, scope: scopeKey(), trigger, cleanup: [], canUse: canUse(),
        playback: null, playRequest: 0, mediaFailed: false, analysis: saved?.analysis || null, prompts: { ...saved?.prompts }, pending: null, reveal: null,
        activeShotId: matchedAnalysisShot?.id || saved?.activeShotId || "", tab: saved?.tab || "analysis", confirmReplace: false,
        copyRequest: null, copiedPrompt: null };
      session = current;
      const startInput = dialog.querySelector("[data-inspiration-start]");
      const endInput = dialog.querySelector("[data-inspiration-end]");
      const results = dialog.querySelector("[data-inspiration-results]");
      const analyzeButton = dialog.querySelector("[data-inspiration-analyze]");
      const copyButton = dialog.querySelector('[data-inspiration-action="copy"]');
      const draftFooter = dialog.querySelector("[data-inspiration-draft-footer]");
      if (saved) { startInput.value = saved.startValue; endInput.value = saved.endValue; }
      const listen = (element, type, callback) => {
        element.addEventListener(type, callback);
        current.cleanup.push(() => element.removeEventListener(type, callback));
      };
      const read = () => ({ clip, start: startInput.valueAsNumber, end: endInput.valueAsNumber });
      const stale = () => !current.analysis || current.analysis.start !== read().start || current.analysis.end !== read().end;
      const selectedShot = () => current.analysis?.shots.find((shot) => shot.id === current.activeShotId);
      const selectedPrompt = () => current.prompts[current.activeShotId]
        ?? (current.activeShotId ? selectedShot()?.prompt : current.analysis?.prompt) ?? "";
      const hasEditedPrompts = () => Object.entries(current.prompts).some(([id, prompt]) =>
        prompt !== (id ? current.analysis?.shots.find((shot) => shot.id === id)?.prompt : current.analysis?.prompt));
      function cancelAnalysis() {
        if (!current.pending) return;
        cancelScheduled(current.pending.timer);
        current.pending = null;
      }
      current.cancelAnalysis = cancelAnalysis;
      const showError = (message = "") => {
        const notice = dialog.querySelector("[data-inspiration-error]");
        notice.textContent = message;
        notice.hidden = !message;
      };
      const validate = () => {
        const values = read();
        try { catalog.validateRange(values); return values; }
        catch (error) { showError(error.message); return null; }
      };
      function updateActions() {
        copyButton.disabled = Boolean(current.copyRequest) || Boolean(current.pending) || stale() || !selectedPrompt().trim();
        copyButton.setAttribute("aria-busy", String(Boolean(current.copyRequest)));
        copyButton.querySelector("span").textContent = current.copyRequest ? "复制中" : current.copiedPrompt === selectedPrompt() ? "已复制" : "复制提示词";
        dialog.querySelector('[data-inspiration-action="canvas"]').disabled = !current.canUse || current.mediaFailed;
        analyzeButton.disabled = current.mediaFailed || Boolean(current.pending);
        analyzeButton.classList.toggle("is-analyzing", Boolean(current.pending));
        analyzeButton.setAttribute("aria-busy", String(Boolean(current.pending)));
        const promptInput = results.querySelector('[data-inspiration-prompt]');
        if (promptInput) promptInput.disabled = Boolean(current.pending);
        if (current.pending) {
          if (!analyzeButton.querySelector('.inspiration-spinner')) analyzeButton.innerHTML = '<span class="inspiration-spinner" aria-hidden="true"></span><span>分析中</span>';
        } else analyzeButton.textContent = current.analysis ? "重新分析" : "拉片分析";
        draftFooter.hidden = !current.analysis;
      }
      current.updateActions = updateActions;
      function renderResults(focusSelector) {
        current.reveal?.cancel();
        current.reveal = null;
        results.hidden = !current.analysis;
        if (current.analysis) {
          const body = dialog.querySelector(".inspiration-body");
          const scrollTop = body?.scrollTop;
          const gridScroll = results.querySelector('.inspiration-shot-grid')?.scrollTop || 0;
          results.innerHTML = view.renderAnalysis({ analysis: current.analysis, activeShotId: current.activeShotId,
            tab: current.tab, prompt: selectedPrompt(), stale: stale() });
          const confirmation = results.querySelector("[data-inspiration-replace-confirm]");
          if (confirmation) confirmation.hidden = !current.confirmReplace;
          if (body) body.scrollTop = scrollTop;
          const grid = results.querySelector('.inspiration-shot-grid');
          if (grid) grid.scrollTop = gridScroll;
          refreshIcons();
          if (focusSelector) results.querySelector(focusSelector)?.focus({ preventScroll: true });
        }
        updateActions();
      }
      function selectTab(tab, focus = true) {
        current.tab = tab;
        results.querySelectorAll('[data-inspiration-result-tab]').forEach((button) => {
          const selected = button.dataset.inspirationResultTab === tab;
          button.setAttribute('aria-selected', String(selected));
          button.tabIndex = selected ? 0 : -1;
          const panel = results.querySelector(`#${button.getAttribute('aria-controls')}`);
          if (panel) panel.hidden = !selected;
          if (selected && focus) button.focus({ preventScroll: true });
        });
      }
      function updateRange() {
        current.copiedPrompt = null;
        current.copyRequest = null;
        cancelAnalysis();
        current.playRequest += 1;
        if (current.playback) video.pause();
        current.playback = null;
        current.confirmReplace = false;
        const values = read();
        dialog.querySelector("[data-inspiration-range-label]").textContent = Number.isFinite(values.start) && Number.isFinite(values.end)
          ? `${catalog.timecode(values.start)} – ${catalog.timecode(values.end)}` : "";
        showError();
        renderResults();
      }
      async function playRange(range) {
        if (current.mediaFailed) return;
        const request = ++current.playRequest;
        try {
          catalog.validateRange({ clip, ...range });
          video.currentTime = range.start;
          current.playback = range;
          await video.play();
        } catch {
          if (session === current && current.playRequest === request) {
            current.playback = null;
            showError("暂时无法播放，请使用视频播放控件重试");
          }
        }
      }
      function analyze({ replace = false } = {}) {
        if (current.mediaFailed || current.pending) return;
        const values = validate();
        if (!values) return;
        if (!replace && current.analysis && hasEditedPrompts()) {
          current.confirmReplace = true;
          renderResults("[data-inspiration-replace-cancel]");
          results.querySelector("[data-inspiration-replace-confirm]")?.scrollIntoView?.({ block: "nearest" });
          return;
        }
        current.confirmReplace = false;
        current.copyRequest = null;
        current.copiedPrompt = null;
        const confirmation = results.querySelector('[data-inspiration-replace-confirm]');
        if (confirmation) confirmation.hidden = true;
        showError();
        const job = { timer: null };
        current.pending = job;
        updateActions();
        job.timer = schedule(() => {
          if (session !== current || current.pending !== job) return;
          syncContext();
          if (session !== current || current.pending !== job) return;
          current.pending = null;
          try {
            const firstResult = !current.analysis;
            current.analysis = catalog.getAnalysis(values);
            current.prompts = {};
            current.activeShotId = current.analysis.shots.find((shot) => shot.id === matchedShot?.id)?.id || "";
            current.tab = "analysis";
            renderResults();
            if (firstResult) revealResults();
          } catch (error) {
            showError(error.message || "该范围暂时没有可用分析");
            updateActions();
          }
        }, 2200);
      }
      function revealResults() {
        const reducedMotion = document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        const revealHeading = () => {
          if (session !== current) return;
          const body = dialog.querySelector('.inspiration-body');
          const heading = results.querySelector('[data-inspiration-analysis-title]');
          const targetBottom = heading.getBoundingClientRect().bottom + 220;
          const bottom = body.getBoundingClientRect().bottom;
          if (targetBottom > bottom) body.scrollTo?.({ top: body.scrollTop + targetBottom - bottom, behavior: reducedMotion ? 'instant' : 'smooth' });
        };
        if (!results.animate || reducedMotion) { revealHeading(); return; }
        current.reveal = results.animate([
          { height: '0px', opacity: 0, overflow: 'hidden', marginTop: '0px', paddingTop: '0px' },
          { height: `${results.getBoundingClientRect().height}px`, opacity: 1, overflow: 'hidden', marginTop: '24px', paddingTop: '20px' },
        ], { duration: 380, easing: 'cubic-bezier(.22, 1, .36, 1)' });
        current.reveal.onfinish = () => { current.reveal = null; revealHeading(); };
      }
      listen(dialog, "input", (event) => {
        if (event.target === startInput || event.target === endInput) updateRange();
        else if (event.target.matches("[data-inspiration-prompt]")) {
          current.copiedPrompt = null;
          current.copyRequest = null;
          current.prompts[current.activeShotId] = event.target.value;
          showError();
          updateActions();
        }
      });
      listen(dialog, "keydown", (event) => {
        const tab = event.target.closest("[data-inspiration-result-tab]");
        if (!tab || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        selectTab(event.key === "Home" ? "analysis" : event.key === "End" ? "prompt" : current.tab === "analysis" ? "prompt" : "analysis");
      });
      listen(dialog, "cancel", (event) => {
        event.preventDefault();
        if (current.confirmReplace) {
          current.confirmReplace = false;
          renderResults();
          analyzeButton.focus({ preventScroll: true });
        } else close();
      });
      listen(dialog, "click", async (event) => {
        if (session !== current) return;
        syncContext();
        if (session !== current) return;
        if (event.target === dialog || event.target.closest("[data-inspiration-close]")) { close(); return; }
        const mark = event.target.closest("[data-inspiration-mark]");
        if (mark && !current.mediaFailed) {
          const input = mark.dataset.inspirationMark === "start" ? startInput : endInput;
          input.value = String(Math.min(clip.duration, Math.max(0, Math.round(video.currentTime * 10) / 10)));
          updateRange();
          return;
        }
        if (event.target.closest("[data-inspiration-play-match]") && matchedShot) {
          await playRange({ start: matchedShot.start, end: matchedShot.end });
          return;
        }
        if (event.target.closest("[data-inspiration-play-range]")) {
          const values = validate();
          if (values) await playRange({ start: values.start, end: values.end });
          return;
        }
        if (event.target.closest("[data-inspiration-analyze]")) { analyze(); return; }
        if (event.target.closest("[data-inspiration-replace-confirm-button]")) { analyze({ replace: true }); return; }
        if (event.target.closest("[data-inspiration-replace-cancel]")) {
          current.confirmReplace = false;
          renderResults();
          analyzeButton.focus({ preventScroll: true });
          return;
        }
        const tab = event.target.closest("[data-inspiration-result-tab]");
        if (tab) { selectTab(tab.dataset.inspirationResultTab); return; }
        const shotButton = event.target.closest("[data-inspiration-shot]");
        if (shotButton && current.analysis) {
          const id = shotButton.dataset.inspirationShot;
          const shot = current.analysis.shots.find((item) => item.id === id);
          if (id && !shot) return;
          current.activeShotId = id;
          current.copiedPrompt = null;
          current.copyRequest = null;
          renderResults(`[data-inspiration-shot="${id}"]`);
          if (shot && !stale()) {
            const player = dialog.querySelector('.inspiration-player');
            const body = dialog.querySelector('.inspiration-body');
            const playerRect = player.getBoundingClientRect();
            const bodyRect = body.getBoundingClientRect();
            const visibleHeight = Math.min(playerRect.bottom, bodyRect.bottom) - Math.max(playerRect.top, bodyRect.top);
            if (visibleHeight < Math.min(140, playerRect.height / 2)) player.scrollIntoView?.({ block: 'start' });
            await playRange(shot);
          }
          return;
        }
        const action = event.target.closest("[data-inspiration-action]");
        if (!action || action.disabled) return;
        if (action.dataset.inspirationAction === "copy") {
          if (stale() || !selectedPrompt().trim()) return;
          const request = { prompt: selectedPrompt() };
          current.copyRequest = request;
          current.copiedPrompt = null;
          showError();
          updateActions();
          try {
            await copyText(request.prompt);
            if (session !== current || current.scope !== scopeKey() || current.copyRequest !== request) return;
            current.copiedPrompt = request.prompt;
          } catch {
            if (session !== current || current.scope !== scopeKey() || current.copyRequest !== request) return;
            showError("未能复制，请在生成提示词中手动选择并复制");
          } finally {
            if (session === current && current.scope === scopeKey() && current.copyRequest === request) {
              current.copyRequest = null;
              updateActions();
            }
          }
          return;
        }
        if (action.dataset.inspirationAction !== "canvas" || !canUse() || current.mediaFailed) return;
        try {
          const result = onUse("canvas", { clip });
          if (result === false) { showError("当前无法使用该片段，请稍后重试"); return; }
          close();
          afterUse?.("canvas");
        } catch (error) { if (session === current) showError(error.message || "操作未完成，请重试"); }
      });
      listen(video, "loadedmetadata", () => {
        const playhead = matchedShot?.start ?? saved?.playhead;
        if (Number.isFinite(playhead) && Number.isFinite(video.duration)) video.currentTime = Math.min(playhead, video.duration);
      });
      listen(video, "timeupdate", () => {
        if (current.playback && video.currentTime >= current.playback.end) {
          const end = current.playback.end;
          current.playback = null;
          video.pause();
          video.currentTime = end;
        }
      });
      listen(video, "seeking", () => {
        if (current.playback && (video.currentTime < current.playback.start || video.currentTime > current.playback.end)) {
          current.playback = null;
          current.playRequest += 1;
        }
      });
      listen(video, "error", () => {
        cancelAnalysis();
        current.playRequest += 1;
        current.mediaFailed = true;
        updateActions();
        current.playback = null;
        const notice = dialog.querySelector("[data-inspiration-media-error]");
        notice.textContent = "视频暂时无法加载，请关闭后重试";
        notice.hidden = false;
        dialog.querySelectorAll('[data-inspiration-action="canvas"], [data-inspiration-analyze], [data-inspiration-play-range], [data-inspiration-play-match], [data-inspiration-mark]')
          .forEach((button) => { button.disabled = true; });
      });
      updateRange();
      refreshIcons();
      dialog.showModal();
      dialog.querySelector("[data-inspiration-close]").focus({ preventScroll: true });
      return true;
    }

    return Object.freeze({ open, close, syncContext, destroy() { close({ restoreFocus: false, remember: false }); drafts.clear(); disposed = true; } });
  }
  root.REELAY_CANVAS_INSPIRATION_CONTROLLER = Object.freeze({ create });
})(typeof globalThis === "object" ? globalThis : window);
