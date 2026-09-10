(function registerGenerationMedia(root) {
  "use strict";

  const mounted = new WeakMap();
  const icons = {
    play: '<path d="m9 5 11 7-11 7Z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    volume: '<path d="m11 5-6 4H2v6h3l6 4ZM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
    muted: '<path d="m11 5-6 4H2v6h3l6 4ZM17 9l5 6M22 9l-5 6"/>',
    expand: '<path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5"/>',
    collapse: '<path d="M3 8h5V3M21 8h-5V3M16 21v-5h5M8 21v-5H3"/>',
  };

  function icon(name) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
  }

  function timeLabel(value) {
    const total = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
    const seconds = String(total % 60).padStart(2, "0");
    const minutes = Math.floor(total / 60);
    return minutes >= 60 ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
  }

  function resolutionLabel(width, height) {
    const shortEdge = Math.min(width, height);
    const longEdge = Math.max(width, height);
    if (!(shortEdge > 0)) return "";
    if (shortEdge === 4320 && longEdge >= 7680) return "8K";
    if (shortEdge === 2160 && longEdge >= 3840) return "4K";
    if ([1440, 1080, 720, 540, 480, 360, 240].includes(shortEdge)) return `${shortEdge}p`;
    return `${width} × ${height}`;
  }

  function mount({ document, container, video, showMessage = () => {} }) {
    if (!container || !video || video.tagName !== "VIDEO" || !container.contains(video)) return null;
    if (mounted.has(video)) return mounted.get(video);
    const listeners = [];
    let disposed = false;
    let pendingPlay = false;
    let buffering = false;
    let playSequence = 0;
    let mediaError = false;
    const overlay = document.createElement("div");
    overlay.className = "generation-media-overlay";
    overlay.innerHTML = `<span class="generation-media-resolution" hidden></span>
      <button type="button" class="generation-media-center" aria-label="播放生成视频">${icon("play")}</button>
      <span class="generation-media-notice" role="status" hidden></span>
      <div class="generation-media-controls" role="group" aria-label="生成视频播放控制">
        <button type="button" class="generation-media-toggle" aria-label="播放生成视频">${icon("play")}</button>
        <span class="generation-media-time"><span data-media-current>0:00</span><span aria-hidden="true"> / </span><span data-media-duration>0:00</span></span>
        <input class="generation-media-seek" type="range" min="0" max="1" step="0.1" value="0" aria-label="生成视频进度" disabled>
        <button type="button" class="generation-media-volume" aria-label="开启生成视频声音" aria-pressed="false">${icon("muted")}</button>
        <button type="button" class="generation-media-fullscreen" aria-label="全屏播放生成视频">${icon("expand")}</button>
      </div>`;
    const center = overlay.querySelector(".generation-media-center");
    const toggle = overlay.querySelector(".generation-media-toggle");
    const current = overlay.querySelector("[data-media-current]");
    const total = overlay.querySelector("[data-media-duration]");
    const seek = overlay.querySelector(".generation-media-seek");
    const volume = overlay.querySelector(".generation-media-volume");
    const fullscreen = overlay.querySelector(".generation-media-fullscreen");
    const resolution = overlay.querySelector(".generation-media-resolution");
    const notice = overlay.querySelector(".generation-media-notice");
    const supportsFullscreen = typeof container.requestFullscreen === "function" && document.fullscreenEnabled !== false;
    const supportsNativeFullscreen = typeof video.webkitEnterFullscreen === "function";
    fullscreen.hidden = !supportsFullscreen && !supportsNativeFullscreen;
    container.classList.add("generation-media-player");
    video.controls = false;
    video.autoplay = false;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.tabIndex = -1;
    container.append(overlay);

    function listen(target, name, handler) {
      target.addEventListener(name, handler);
      listeners.push([target, name, handler]);
    }

    function duration() { return Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0; }

    function setNotice(message) {
      notice.textContent = message;
      notice.hidden = !message;
    }

    function sync() {
      if (disposed) return;
      const playing = !video.paused && !video.ended;
      const elapsed = Math.max(0, Math.min(Number(video.currentTime) || 0, duration() || Infinity));
      const length = duration();
      const playbackLabel = playing || pendingPlay ? "暂停生成视频" : video.ended ? "重新播放生成视频" : "播放生成视频";
      if (toggle.getAttribute("aria-label") !== playbackLabel) {
        toggle.innerHTML = icon(playing || pendingPlay ? "pause" : "play");
        toggle.setAttribute("aria-label", playbackLabel);
      }
      center.setAttribute("aria-label", playbackLabel);
      // Keep the center control mounted; hiding it never remounts the media or control bar.
      center.hidden = playing && !pendingPlay && !buffering;
      container.classList.toggle("is-playing", playing);
      container.classList.toggle("is-buffering", pendingPlay || buffering);
      current.textContent = timeLabel(elapsed);
      total.textContent = length ? timeLabel(length) : "--:--";
      seek.disabled = !length || mediaError;
      seek.max = String(length || 1);
      seek.value = String(Math.min(elapsed, length));
      seek.setAttribute("aria-valuetext", `${timeLabel(elapsed)} / ${length ? timeLabel(length) : "时长未知"}`);
      seek.style.setProperty("--generation-media-progress", `${length ? Math.min(100, elapsed / length * 100) : 0}%`);
      const audible = !video.muted && video.volume > 0;
      const volumeLabel = audible ? "静音生成视频" : "开启生成视频声音";
      if (volume.getAttribute("aria-label") !== volumeLabel) {
        volume.innerHTML = icon(audible ? "volume" : "muted");
        volume.setAttribute("aria-label", volumeLabel);
      }
      volume.setAttribute("aria-pressed", String(audible));
      const width = Math.round(video.videoWidth || 0); const height = Math.round(video.videoHeight || 0);
      resolution.textContent = resolutionLabel(width, height);
      resolution.hidden = !resolution.textContent;
      if (resolution.textContent) resolution.setAttribute("aria-label", `视频分辨率 ${width} × ${height}`);
      const expanded = document.fullscreenElement === container || Boolean(video.webkitDisplayingFullscreen);
      const fullscreenLabel = expanded ? "退出生成视频全屏" : "全屏播放生成视频";
      if (fullscreen.getAttribute("aria-label") !== fullscreenLabel) {
        fullscreen.innerHTML = icon(expanded ? "collapse" : "expand");
        fullscreen.setAttribute("aria-label", fullscreenLabel);
      }
    }

    async function togglePlayback() {
      if (disposed) return;
      if (!video.paused || pendingPlay) {
        playSequence++; pendingPlay = false; buffering = false;
        video.pause(); sync(); return;
      }
      const sequence = ++playSequence;
      pendingPlay = true; setNotice("");
      try {
        if (mediaError) { mediaError = false; video.load(); }
        if (video.ended || (duration() && video.currentTime >= duration())) video.currentTime = 0;
        sync();
        await video.play();
        if (disposed || sequence !== playSequence) return;
        pendingPlay = false; buffering = false; sync();
      } catch (error) {
        if (disposed || sequence !== playSequence) return;
        pendingPlay = false; buffering = false; sync();
        if (error?.name !== "AbortError") {
          setNotice("暂时无法播放，请重试");
          showMessage("视频暂时无法播放，请重试");
        }
      }
    }

    function seekTo(value) {
      if (disposed || !duration() || mediaError) return;
      try { video.currentTime = Math.max(0, Math.min(duration(), value)); sync(); }
      catch { showMessage("当前视频暂时无法跳转进度"); }
    }

    function onSeekKey(event) {
      const step = event.shiftKey ? 5 : 1;
      const changes = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step,
        PageDown: -duration() / 10, PageUp: duration() / 10 };
      if (!(event.key in changes) && event.key !== "Home" && event.key !== "End") return;
      event.preventDefault(); event.stopPropagation();
      const time = event.key === "Home" ? 0 : event.key === "End" ? duration()
        : (Number(video.currentTime) || 0) + changes[event.key];
      seekTo(time);
    }

    async function toggleFullscreen() {
      if (disposed) return;
      try {
        if (document.fullscreenElement === container) await document.exitFullscreen();
        else if (supportsFullscreen) await container.requestFullscreen();
        else if (video.webkitDisplayingFullscreen && typeof video.webkitExitFullscreen === "function") video.webkitExitFullscreen();
        else if (supportsNativeFullscreen) video.webkitEnterFullscreen();
        if (!disposed) sync();
        else if (document.fullscreenElement === container && typeof document.exitFullscreen === "function") {
          await document.exitFullscreen();
        }
      } catch { if (!disposed) showMessage("当前环境暂不支持全屏播放"); }
    }

    listen(center, "click", togglePlayback);
    listen(toggle, "click", togglePlayback);
    listen(volume, "click", () => {
      if (video.muted || video.volume === 0) { video.muted = false; if (video.volume === 0) video.volume = 1; }
      else video.muted = true;
      sync();
    });
    listen(seek, "input", () => seekTo(Number(seek.value)));
    listen(seek, "keydown", onSeekKey);
    listen(fullscreen, "click", toggleFullscreen);
    // These controls own their input without changing the page's keyboard shortcuts.
    listen(overlay, "pointerdown", (event) => event.stopPropagation());
    listen(overlay, "click", (event) => event.stopPropagation());
    listen(overlay, "keydown", (event) => { if ([" ", "Enter"].includes(event.key)) event.stopPropagation(); });
    for (const name of ["timeupdate", "durationchange", "loadedmetadata", "resize", "volumechange"]) listen(video, name, sync);
    for (const name of ["pause", "ended"]) listen(video, name, () => { buffering = false; sync(); });
    for (const name of ["waiting", "stalled"]) listen(video, name, () => { buffering = !video.paused; sync(); });
    listen(video, "playing", () => { pendingPlay = false; buffering = false; setNotice(""); sync(); });
    listen(video, "loadeddata", () => { mediaError = false; setNotice(""); sync(); });
    listen(video, "error", () => {
      playSequence++; pendingPlay = false; buffering = false; mediaError = true;
      video.pause();
      setNotice("视频暂时无法播放"); sync();
    });
    listen(document, "fullscreenchange", sync);
    listen(video, "webkitbeginfullscreen", sync);
    listen(video, "webkitendfullscreen", sync);
    sync();

    function dispose({ releaseMedia = true } = {}) {
      if (disposed) return;
      disposed = true; playSequence++; pendingPlay = false;
      for (const [target, name, handler] of listeners) target.removeEventListener(name, handler);
      if (document.fullscreenElement === container && typeof document.exitFullscreen === "function") {
        try { document.exitFullscreen()?.catch?.(() => {}); } catch { /* The containing record still releases its media. */ }
      }
      if (video.webkitDisplayingFullscreen && typeof video.webkitExitFullscreen === "function") {
        try { video.webkitExitFullscreen(); } catch { /* Native fullscreen teardown must not prevent disposal. */ }
      }
      if (releaseMedia) {
        video.pause(); video.removeAttribute("src"); video.load();
      }
      overlay.remove();
      container.classList.remove("generation-media-player", "is-playing", "is-buffering");
      mounted.delete(video);
    }

    const controller = Object.freeze({ video, sync, dispose });
    mounted.set(video, controller);
    return controller;
  }

  root.REELAY_GENERATION_MEDIA = Object.freeze({ mount });
})(globalThis);
