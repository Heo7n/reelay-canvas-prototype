(function registerCanvasAudioPlayer(global) {
  "use strict";

  const playIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10-6.5Z" fill="currentColor"/></svg>';
  const pauseIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zm6 0h4v14h-4z" fill="currentColor"/></svg>';
  // A stable schematic waveform, not decoded peaks. Rendering a node must not fetch
  // or decode an entire audio file merely to draw its thumbnail.
  const heights = [12, 30, 58, 76, 68, 49, 62, 80, 84, 72, 51, 32, 40, 22, 10, 10,
    12, 31, 59, 73, 48, 62, 53, 36, 14, 10, 10, 12, 28, 34, 85, 68,
    62, 51, 44, 36, 41, 75, 67, 73, 45, 33, 18, 15, 10, 10, 44, 58,
    51, 45, 11, 10, 10, 14, 42, 53, 60, 63, 72, 58, 40, 50, 30, 12];
  const fullViewLimit = 60;
  const localWindowDuration = 30;
  const visibleBarCount = 64;

  function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }

  function sampleHeight(index) {
    // The index is an absolute-time sample position, so overlapping windows keep
    // the same schematic waveform. It is deliberately not represented as decoded audio.
    const base = heights[((index % heights.length) + heights.length) % heights.length];
    return Math.round(clamp(base * (0.76 + Math.sin(index * 0.193 + 1.2) * 0.2) + 6, 10, 85));
  }

  function durationValue(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function formatTime(value) {
    const seconds = Math.max(0, Math.floor(Number(value) || 0));
    const minute = Math.floor(seconds / 60);
    return minute >= 60
      ? `${Math.floor(minute / 60)}:${String(minute % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
      : `${String(minute).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function render({ safeUrl = "", duration } = {}) {
    const initialDuration = durationValue(duration);
    const bars = heights.map((height) => `<i style="--h:${height}%"></i>`).join("");
    return `<div class="media-content audio audio-unavailable" data-audio-initial-duration="${initialDuration}">
      <div class="audio-waveform" data-audio-waveform>
        <div class="audio-timeline" data-audio-progress>
          <div class="audio-track" aria-hidden="true"><div class="audio-track-bars">${bars}</div></div>
          <div class="audio-track audio-track-played" aria-hidden="true"><div class="audio-track-bars">${bars}</div></div>
          <span class="audio-playhead" data-audio-playhead role="slider" aria-label="音频进度" aria-valuemin="0" aria-valuemax="${initialDuration}" aria-valuenow="0" aria-disabled="true" tabindex="0"></span>
        </div>
        <div class="audio-navigation" hidden>
          <div class="audio-range-labels" aria-hidden="true"><span data-audio-range-start>00:00</span><span data-audio-range-middle>00:15</span><span data-audio-range-end>00:30</span></div>
          <div class="audio-overview" data-audio-overview role="slider" aria-label="整段音频进度" aria-valuemin="0" aria-valuemax="${initialDuration}" aria-valuenow="0" aria-disabled="true" tabindex="0">
            <span class="audio-overview-window" aria-hidden="true"></span><span class="audio-overview-playhead" aria-hidden="true"></span>
          </div>
        </div>
      </div>
      <div class="audio-controls">
        <div class="audio-time"><span data-audio-current>00:00</span><span class="audio-time-divider" aria-hidden="true"> / </span><span data-audio-duration>${initialDuration ? formatTime(initialDuration) : "--:--"}</span></div>
        <button class="audio-play-button" data-audio-toggle type="button" aria-label="音频加载中" title="音频加载中" disabled>${playIcon}</button>
        <span class="audio-status" data-audio-status role="status" aria-live="polite"></span>
      </div>
      ${safeUrl ? `<audio class="frame-audio" src="${safeUrl}" preload="metadata"></audio>` : ""}
    </div>`;
  }

  function createController({ document, root, isSpaceDown = () => false }) {
    const view = document.defaultView;
    const recordsByAudio = new WeakMap();
    const records = new Set();
    const playing = new Set();
    const listeners = [];
    let frame = 0;
    let frameTime = null;
    let drag = null;
    let bypassClick = null;
    let disposed = false;

    function listen(target, type, callback, capture = true) {
      target.addEventListener(type, callback, capture);
      listeners.push(() => target.removeEventListener(type, callback, capture));
    }

    function live(record) {
      return !disposed && !record.released && root.isConnected && root.contains(record.audio)
        && record.content.contains(record.audio) && record.content.querySelector(".frame-audio") === record.audio
        && record.content.querySelector("[data-audio-progress]") === record.timeline
        && record.content.querySelector("[data-audio-playhead]") === record.head
        && record.content.querySelector("[data-audio-overview]") === record.overview
        && record.audio.getAttribute("src") === record.source;
    }

    function readyDuration(record) {
      return !record.failed && !record.audio.error && record.audio.readyState >= 1
        ? durationValue(record.audio.duration) : 0;
    }

    function setText(element, value) {
      if (element.textContent !== value) element.textContent = value;
    }

    function setAttribute(element, name, value) {
      if (element.getAttribute(name) !== value) element.setAttribute(name, value);
    }

    function setClass(element, name, active) {
      if (element.classList.contains(name) !== active) element.classList.toggle(name, active);
    }

    function setStyle(record, name, value) {
      if (record.styles[name] !== value) {
        record.styles[name] = value;
        record.content.style.setProperty(name, value);
      }
    }

    function windowSpan(duration) { return duration > fullViewLimit ? localWindowDuration : duration; }

    function reveal(record, current, duration, center = false) {
      const span = windowSpan(duration);
      if (duration <= fullViewLimit) { record.windowStart = 0; return; }
      if (center || current < record.windowStart || current > record.windowStart + span) {
        record.windowStart = clamp(current - span * 0.5, 0, duration - span);
      }
    }

    function updateWaveform(record, windowed) {
      const first = windowed ? Math.floor(record.windowStart / (localWindowDuration / visibleBarCount)) - 1 : 0;
      if (record.waveformFirst !== first || record.waveformWindowed !== windowed) {
        const count = windowed ? visibleBarCount + 2 : visibleBarCount;
        for (const track of record.tracks) {
          let bars = [...track.children];
          const previousCount = bars.length;
          while (bars.length < count) {
            const bar = document.createElement("i");
            track.append(bar); bars.push(bar);
          }
          while (bars.length > count) bars.pop().remove();
          const delta = first - record.waveformFirst;
          const canRecycle = windowed && record.waveformWindowed && previousCount === count
            && Math.abs(delta) < count;
          if (canRecycle && delta > 0) {
            for (let index = 0; index < delta; index++) {
              const bar = bars.shift(); track.append(bar); bars.push(bar);
            }
          } else if (canRecycle && delta < 0) {
            for (let index = 0; index < -delta; index++) {
              const bar = bars.pop(); track.prepend(bar); bars.unshift(bar);
            }
          }
          // Recycle the fixed-size visible buffer. Even fast edge seeking never
          // builds a full-duration waveform or reallocates all bars every frame.
          const updateStart = canRecycle && delta > 0 ? count - delta : 0;
          const updateEnd = canRecycle && delta < 0 ? -delta : count;
          for (let index = updateStart; index < updateEnd; index++) {
            bars[index].style.setProperty("--h", `${windowed ? sampleHeight(first + index) : heights[index]}%`);
          }
        }
        record.waveformFirst = first;
        record.waveformWindowed = windowed;
      }
      const fractionalIndex = record.windowStart / (localWindowDuration / visibleBarCount) - Math.floor(record.windowStart / (localWindowDuration / visibleBarCount));
      setStyle(record, "--audio-waveform-shift", windowed ? `${(-(fractionalIndex + 1) / (visibleBarCount + 2) * 100).toFixed(6)}%` : "0%");
      setStyle(record, "--audio-waveform-width", windowed ? "103.125%" : "100%");
      setStyle(record, "--audio-bar-count", String(windowed ? visibleBarCount + 2 : visibleBarCount));
    }

    function update(record) {
      if (!live(record)) return;
      const duration = readyDuration(record);
      const failed = record.failed || Boolean(record.audio.error);
      const displayDuration = duration || (failed ? 0 : record.initialDuration);
      const current = duration ? Math.min(duration, Math.max(0, Number(record.audio.currentTime) || 0)) : 0;
      const active = !record.audio.paused && !record.audio.ended && Boolean(duration);
      const span = windowSpan(displayDuration);
      const windowed = displayDuration > fullViewLimit;
      record.windowStart = clamp(record.windowStart, 0, Math.max(0, displayDuration - span));
      if (drag?.record !== record) {
        reveal(record, current, displayDuration);
      }
      const progress = duration && span ? clamp((current - record.windowStart) / span * 100, 0, 100) : 0;
      setStyle(record, "--audio-progress", `${progress.toFixed(4)}%`);
      setStyle(record, "--audio-overview-progress", `${(duration ? current / duration * 100 : 0).toFixed(4)}%`);
      setStyle(record, "--audio-window-start", `${(displayDuration ? record.windowStart / displayDuration * 100 : 0).toFixed(6)}%`);
      setStyle(record, "--audio-window-width", `${(displayDuration ? span / displayDuration * 100 : 100).toFixed(6)}%`);
      setClass(record.content, "audio-windowed", windowed);
      if (record.navigation.hidden === windowed) record.navigation.hidden = !windowed;
      setText(record.rangeStart, formatTime(record.windowStart));
      setText(record.rangeMiddle, formatTime(record.windowStart + span / 2));
      setText(record.rangeEnd, formatTime(record.windowStart + span));
      updateWaveform(record, windowed);
      setClass(record.content, "playing", active);
      setClass(record.content, "audio-unavailable", !duration);
      setClass(record.content, "audio-error", failed || Boolean(record.playError));
      setText(record.current, formatTime(current));
      setText(record.duration, displayDuration ? formatTime(displayDuration) : "--:--");
      setAttribute(record.head, "aria-valuemax", String(duration || displayDuration));
      setAttribute(record.head, "aria-valuenow", String(Number(current.toFixed(2))));
      setAttribute(record.head, "aria-valuetext", `${formatTime(current)} / ${displayDuration ? formatTime(displayDuration) : "时长未知"}`);
      setAttribute(record.head, "aria-disabled", String(!duration));
      setAttribute(record.overview, "aria-valuemax", String(duration || displayDuration));
      setAttribute(record.overview, "aria-valuenow", String(Number(current.toFixed(2))));
      setAttribute(record.overview, "aria-valuetext", `${formatTime(current)} / ${displayDuration ? formatTime(displayDuration) : "时长未知"}`);
      setAttribute(record.overview, "aria-disabled", String(!duration));
      if (record.button.disabled !== !duration) record.button.disabled = !duration;
      const pendingOrActive = active || record.wantsPlay;
      const label = failed ? "音频暂时无法播放" : !duration ? "音频加载中" : pendingOrActive ? "暂停音频" : record.playError ? "重新播放音频" : "播放音频";
      setAttribute(record.button, "aria-label", label);
      setAttribute(record.button, "title", label);
      if (record.iconPlaying !== pendingOrActive) {
        record.iconPlaying = pendingOrActive;
        record.button.innerHTML = pendingOrActive ? pauseIcon : playIcon;
      }
      setText(record.status, failed ? "音频加载失败" : record.playError);
    }

    function stopIdleFrame() {
      if (!playing.size && !canPan() && frame) { view.cancelAnimationFrame(frame); frame = 0; frameTime = null; }
    }

    function ensureFrame() {
      if (!frame && (playing.size || canPan())) frame = view.requestAnimationFrame(tick);
    }

    function panSpeed() {
      if (!drag || drag.kind !== "local" || !drag.moved || !live(drag.record)
        || readyDuration(drag.record) <= fullViewLimit) return 0;
      const bounds = drag.surface.getBoundingClientRect();
      if (!bounds.width) return 0;
      const ratio = (drag.clientX - bounds.left - drag.offset) / bounds.width;
      const edge = 0.12;
      return ratio < edge ? -18 * clamp((edge - ratio) / edge, 0, 1)
        : ratio > 1 - edge ? 18 * clamp((ratio - (1 - edge)) / edge, 0, 1) : 0;
    }

    function canPan() {
      const speed = panSpeed();
      return Boolean(speed && (speed < 0 ? drag.record.windowStart > 0
        : drag.record.windowStart < readyDuration(drag.record) - localWindowDuration));
    }

    function tick(timestamp) {
      frame = 0;
      const elapsed = frameTime === null ? 1 / 60 : clamp((timestamp - frameTime) / 1000, 0, 0.075);
      frameTime = timestamp;
      for (const record of [...playing]) {
        if (!live(record)) { release(record); continue; }
        if (record.audio.paused || record.audio.ended || !readyDuration(record)) playing.delete(record);
        else if (readyDuration(record) > fullViewLimit && drag?.record !== record) {
          const duration = readyDuration(record);
          const current = clamp(Number(record.audio.currentTime) || 0, 0, duration);
          reveal(record, current, duration);
          const target = clamp(current - localWindowDuration * 0.8, 0, duration - localWindowDuration);
          const distance = target - record.windowStart;
          // Follow at playback speed in steady state. After a manual seek near
          // the edge, ease into the reading position without snapping the wave.
          if (distance > 0) record.windowStart += Math.min(distance, Math.max(1, distance * 10) * elapsed);
        }
        update(record);
      }
      if (canPan()) {
        drag.record.windowStart = clamp(drag.record.windowStart + panSpeed() * elapsed, 0,
          readyDuration(drag.record) - localWindowDuration);
        seekPointer({ clientX: drag.clientX });
      }
      ensureFrame();
      if (!frame) frameTime = null;
    }

    function startFrame(record) {
      if (!live(record) || record.audio.paused || record.audio.ended || !readyDuration(record)) return;
      playing.add(record);
      ensureFrame();
    }

    function pause(record) {
      record.wantsPlay = false;
      record.request++;
      playing.delete(record);
      try { record.audio.pause(); } catch { /* A removed or failed media has no playback to retain. */ }
      stopIdleFrame();
      update(record);
    }

    function play(record) {
      if (!live(record) || !readyDuration(record)) return;
      if (record.audio.ended || record.audio.currentTime >= readyDuration(record)) record.audio.currentTime = 0;
      record.playError = "";
      record.wantsPlay = true;
      const request = ++record.request;
      update(record);
      let result;
      try { result = record.audio.play(); }
      catch (error) { result = Promise.reject(error); }
      Promise.resolve(result).then(() => {
        if (!live(record) || record.request !== request) {
          const owner = recordsByAudio.get(record.audio);
          if ((!owner || owner === record) && (!live(record) || !record.wantsPlay)) {
            try { record.audio.pause(); } catch { /* Already detached. */ }
          }
          return;
        }
        update(record);
        startFrame(record);
      }, () => {
        if (!live(record) || record.request !== request) return;
        record.playError = "播放失败，请重试";
        pause(record);
      });
    }

    function toggle(record) {
      if (record.wantsPlay || !record.audio.paused) pause(record);
      else play(record);
    }

    function seek(record, seconds, windowPosition = "reveal") {
      const duration = readyDuration(record);
      if (!live(record) || !duration) return;
      const current = clamp(seconds, 0, duration);
      if (windowPosition !== "keep") reveal(record, current, duration, windowPosition === "center");
      try { record.audio.currentTime = current; }
      catch { return; }
      update(record);
    }

    function seekPointer(event) {
      if (!drag || !live(drag.record)) return;
      const bounds = drag.surface.getBoundingClientRect();
      if (!bounds.width) return;
      drag.clientX = event.clientX;
      if (drag.kind === "local" && !drag.moved) {
        if (Math.abs(event.clientX - drag.originX) < 2) return;
        drag.moved = true;
      }
      const ratio = clamp((event.clientX - bounds.left - drag.offset) / bounds.width, 0, 1);
      const duration = readyDuration(drag.record);
      if (drag.kind === "overview") seek(drag.record, ratio * duration, "center");
      else seek(drag.record, drag.record.windowStart + ratio * windowSpan(duration), "keep");
      ensureFrame();
      stopIdleFrame();
    }

    function finishDrag(resume) {
      if (!drag) return;
      const previous = drag;
      drag = null;
      previous.record.content.classList.remove("scrubbing");
      try { previous.control.releasePointerCapture?.(previous.pointerId); } catch { /* Capture may already be lost. */ }
      stopIdleFrame();
      update(previous.record);
      if (resume && previous.resume && live(previous.record)
        && previous.record.audio.currentTime < readyDuration(previous.record)) play(previous.record);
    }

    function release(record, releaseSource = !root.contains(record.audio)) {
      if (record.released) return;
      record.released = true;
      if (drag?.record === record) finishDrag(false);
      pause(record);
      records.delete(record);
      recordsByAudio.delete(record.audio);
      if (releaseSource) {
        record.audio.removeAttribute("src");
        try { record.audio.load(); } catch { /* A removed media can already have released its decoder. */ }
      }
    }

    function recordFor(audio) {
      if (!audio || !root.contains(audio)) return null;
      const content = audio.closest(".media-content.audio");
      const timeline = content?.querySelector("[data-audio-progress]");
      const head = content?.querySelector("[data-audio-playhead]");
      const overview = content?.querySelector("[data-audio-overview]");
      const button = content?.querySelector("[data-audio-toggle]");
      if (!content || !timeline || !head || !button || !overview) return null;
      let record = recordsByAudio.get(audio);
      if (record?.released) return null;
      if (record && (record.content !== content || record.timeline !== timeline || record.head !== head
        || record.overview !== overview || record.source !== audio.getAttribute("src"))) {
        release(record); record = null;
      }
      if (!record) {
        record = {
          audio, content, timeline, head, overview, button, source: audio.getAttribute("src"), released: false,
          navigation: content.querySelector(".audio-navigation"), tracks: [...content.querySelectorAll(".audio-track-bars")],
          rangeStart: content.querySelector("[data-audio-range-start]"), rangeMiddle: content.querySelector("[data-audio-range-middle]"),
          rangeEnd: content.querySelector("[data-audio-range-end]"), windowStart: 0, styles: {},
          initialDuration: durationValue(content.dataset.audioInitialDuration),
          current: content.querySelector("[data-audio-current]"), duration: content.querySelector("[data-audio-duration]"),
          status: content.querySelector("[data-audio-status]"), failed: false, playError: "", request: 0,
          wantsPlay: !audio.paused, iconPlaying: false,
        };
        if (!record.current || !record.duration || !record.status || !record.navigation
          || !record.rangeStart || !record.rangeMiddle || !record.rangeEnd || record.tracks.length !== 2) return null;
        recordsByAudio.set(audio, record);
        records.add(record);
        update(record);
      }
      return record;
    }

    function controlFor(target) {
      const control = target?.closest?.("[data-audio-toggle], [data-audio-playhead], [data-audio-overview]");
      if (!control || !root.contains(control)) return null;
      const record = recordFor(control.closest(".media-content.audio")?.querySelector(".frame-audio"));
      return record ? { record, control } : null;
    }

    function consume(event) { event.preventDefault(); event.stopPropagation(); }

    function pointerDown(event) {
      const found = controlFor(event.target);
      if (!found) return;
      if (event.button !== 0 || event.isPrimary === false || isSpaceDown() || event.altKey) {
        bypassClick = found.control;
        return;
      }
      bypassClick = null;
      consume(event);
      if (found.control === found.record.button || !readyDuration(found.record)) return;
      if (found.control === found.record.overview && readyDuration(found.record) <= fullViewLimit) return;
      finishDrag(false);
      const fromHead = found.control === found.record.head;
      const surface = fromHead ? found.record.timeline : found.control;
      const bounds = surface.getBoundingClientRect();
      if (!bounds.width) return;
      const current = Math.max(0, Math.min(readyDuration(found.record), Number(found.record.audio.currentTime) || 0));
      drag = {
        record: found.record, control: found.control, surface, pointerId: event.pointerId,
        clientX: event.clientX, originX: event.clientX, moved: !fromHead,
        kind: found.control === found.record.overview ? "overview" : "local",
        resume: found.record.wantsPlay || (!found.record.audio.paused && !found.record.audio.ended),
        offset: fromHead ? event.clientX - (bounds.left
          + (current - found.record.windowStart) / windowSpan(readyDuration(found.record)) * bounds.width) : 0,
      };
      pause(found.record);
      found.record.content.classList.add("scrubbing");
      found.control.focus({ preventScroll: true });
      try { found.control.setPointerCapture?.(event.pointerId); } catch { /* Document listeners still finish the gesture. */ }
      if (!fromHead) seekPointer(event);
      else ensureFrame();
    }

    function pointerMove(event) {
      if (!drag || drag.pointerId !== event.pointerId) return;
      consume(event);
      if (!live(drag.record)) { finishDrag(false); return; }
      seekPointer(event);
    }

    function pointerEnd(event) {
      if (!drag || drag.pointerId !== event.pointerId) return;
      consume(event);
      if (event.type === "pointerup") seekPointer(event);
      finishDrag(event.type === "pointerup");
    }

    function click(event) {
      const found = controlFor(event.target);
      if (!found) return;
      consume(event);
      if (bypassClick === found.control) { bypassClick = null; return; }
      if (event.type === "dblclick" || isSpaceDown() || event.altKey) return;
      if (found.control === found.record.button) toggle(found.record);
    }

    function keyDown(event) {
      const found = controlFor(event.target);
      if (!found || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key;
      if ([" ", "Spacebar", "Enter"].includes(key)) {
        consume(event);
        if (!event.repeat) toggle(found.record);
      } else if (found.control !== found.record.button && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(key)) {
        consume(event);
        if (key === "Home") seek(found.record, 0);
        else if (key === "End") seek(found.record, readyDuration(found.record));
        else seek(found.record, (Number(found.record.audio.currentTime) || 0) + (key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 5 : 1));
      }
    }

    function mediaEvent(event) {
      if (!event.target?.matches?.("audio.frame-audio")) return;
      const record = recordFor(event.target);
      if (!record || !live(record)) return;
      if (event.type === "error") {
        record.failed = true;
        if (drag?.record === record) finishDrag(false);
        pause(record);
      } else if (event.type === "emptied") {
        record.failed = false;
        record.playError = "";
        if (drag?.record === record) finishDrag(false);
        pause(record);
      } else if (event.type === "loadedmetadata") {
        record.failed = false;
      } else if (event.type === "pause" || event.type === "ended") {
        // Native media events are queued. A pause queued before pointerup can
        // arrive after the resumed play request; current media state wins.
        if (event.type === "pause" ? !record.audio.paused : !record.audio.ended) return;
        record.wantsPlay = false;
        playing.delete(record);
        stopIdleFrame();
      } else if (event.type === "play" || event.type === "playing") {
        if (record.audio.paused || record.audio.ended) return;
        if (!record.wantsPlay) { pause(record); return; }
        startFrame(record);
      }
      update(record);
    }

    function suspend() {
      finishDrag(false);
      for (const record of records) pause(record);
    }

    function sync() {
      if (disposed) return;
      for (const record of [...records]) if (!live(record)) release(record);
      for (const audio of root.querySelectorAll(".media-content.audio audio.frame-audio")) {
        const record = recordFor(audio);
        if (record) { update(record); startFrame(record); }
      }
    }

    listen(root, "pointerdown", pointerDown);
    listen(root, "click", click);
    listen(root, "dblclick", click);
    listen(root, "keydown", keyDown);
    listen(document, "pointermove", pointerMove);
    listen(document, "pointerup", pointerEnd);
    listen(document, "pointercancel", pointerEnd);
    listen(root, "lostpointercapture", pointerEnd);
    for (const type of ["loadedmetadata", "durationchange", "timeupdate", "seeked", "play", "playing", "pause", "ended", "error", "emptied"]) listen(root, type, mediaEvent);
    listen(view, "blur", (event) => { if (event.target === view) suspend(); });
    listen(view, "pagehide", suspend);
    listen(document, "visibilitychange", () => { if (document.hidden) suspend(); });
    sync();
    return { sync, dispose() {
      if (disposed) return;
      suspend();
      for (const remove of listeners) remove();
      for (const record of [...records]) release(record, true);
      records.clear();
      playing.clear();
      stopIdleFrame();
      disposed = true;
    } };
  }

  global.REELAY_CANVAS_AUDIO_PLAYER = { render, createController };
})(window);
