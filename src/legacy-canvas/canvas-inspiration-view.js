(function registerCanvasInspirationView(root) {
  "use strict";

  const ESCAPES = Object.freeze({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" });

  function escape(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ESCAPES[character]);
  }

  function safeUrl(value) {
    const url = String(value ?? "").trim();
    if (!url || /[\u0000-\u0020\u007f<>"'\\]/.test(url)) return "";
    const scheme = url.match(/^([a-z][a-z\d+.-]*):/i)?.[1]?.toLowerCase();
    if (scheme && !["http", "https", "blob"].includes(scheme)) return "";
    return escape(url);
  }

  function icon(name) {
    return `<i data-lucide="${name}" aria-hidden="true"></i>`;
  }

  function seconds(value, fallback = 0) {
    const result = Number(value);
    return Number.isFinite(result) ? Math.max(0, result) : fallback;
  }

  function time(value) {
    const rounded = Math.floor(seconds(value));
    return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
  }

  function timecode(value) {
    const tenths = Math.round(seconds(value) * 10);
    return `${Math.floor(tenths / 600)}:${String(Math.floor(tenths / 10) % 60).padStart(2, "0")}.${tenths % 10}`;
  }

  function tagLabels(tags, limit) {
    return [...new Set((Array.isArray(tags) ? tags : []).map((tag) => typeof tag === "string" ? tag : tag?.label).filter(Boolean))].slice(0, limit);
  }

  function renderDetail(options = {}) {
    const clip = options.clip || {};
    const duration = seconds(clip.duration);
    const start = Math.min(duration, seconds(options.start));
    const end = Math.min(duration, seconds(options.end, duration));
    const url = safeUrl(clip.url);
    const poster = safeUrl(clip.posterUrl);
    const attribution = safeUrl(options.attributionUrl);
    const sourceLabel = escape(clip.sourceLabel || "未提供");
    const error = String(options.error || "");
    const disabled = options.canUse === false ? " disabled" : "";
    const description = String(clip.description || "");
    const shortDescription = description.length > 180 ? `${description.slice(0, 180)}…` : description;
    const discoveryTags = tagLabels(options.discoveryTags, 4);
    const shotCount = Array.isArray(clip.shots) ? clip.shots.length : 0;
    return `<header class="inspiration-header">
      <h2 id="inspirationDetailTitle">${escape(clip.title || "未命名片段")}</h2>
      <button type="button" class="inspiration-close" data-inspiration-close aria-label="关闭创作参考">${icon("x")}</button>
    </header>
    <div class="inspiration-body">
    <div class="inspiration-overview">
      <section class="inspiration-watch" aria-label="片段预览">
        <div class="inspiration-player">
          <video data-inspiration-video controls preload="metadata" playsinline${url ? ` src="${url}"` : ""}${poster ? ` poster="${poster}"` : ""}></video>
          <p class="inspiration-media-error" data-inspiration-media-error role="status" hidden></p>
        </div>
        <div class="inspiration-range">
          <div class="inspiration-section-heading"><h3>参考范围</h3><span data-inspiration-range-label>${time(start)} – ${time(end)}</span></div>
          <div class="inspiration-range-controls">
            <label class="inspiration-time-field"><span>起点</span><input type="number" data-inspiration-start min="0" max="${duration}" step="0.1" value="${start}" aria-label="片段起点（秒）"><button type="button" data-inspiration-mark="start" title="将当前播放位置设为起点" aria-label="将当前播放位置设为起点">${icon("locate-fixed")}</button></label>
            <label class="inspiration-time-field"><span>终点</span><input type="number" data-inspiration-end min="0" max="${duration}" step="0.1" value="${end}" aria-label="片段终点（秒）"><button type="button" data-inspiration-mark="end" title="将当前播放位置设为终点" aria-label="将当前播放位置设为终点">${icon("locate-fixed")}</button></label>
            <button class="inspiration-range-play" type="button" data-inspiration-play-range>${icon("play")}<span>播放选段</span></button>
          </div>
        </div>
      </section>
      <section class="inspiration-info" aria-label="段落信息">
        <h3>段落信息</h3>
        <dl class="inspiration-facts"><div><dt>来源</dt><dd>${attribution ? `<a href="${attribution}" target="_blank" rel="noopener noreferrer" title="查看来源与署名">${sourceLabel}</a>` : sourceLabel}</dd></div><div><dt>时长</dt><dd>${duration.toFixed(1).replace(/\.0$/, "")} 秒</dd></div>${shotCount ? `<div><dt>镜头</dt><dd>${shotCount} 个</dd></div>` : ""}</dl>
        ${discoveryTags.length ? `<p class="inspiration-discovery-tags" aria-label="参考特征">${discoveryTags.map(escape).join(" · ")}</p>` : ""}
        <div class="inspiration-description"><h3>段落描述</h3>${description.length > 180 ? `<details class="inspiration-description-expand"><summary><span>${escape(shortDescription)}</span><em><span class="inspiration-description-more">展开全文</span><span class="inspiration-description-less">收起全文</span></em></summary><p>${escape(description)}</p></details>` : `<p>${escape(description || "暂无段落描述")}</p>`}</div>
        <div class="inspiration-detail-actions"><button type="button" class="inspiration-secondary" data-inspiration-action="canvas"${disabled}>${icon("plus")}<span>完整片段加入画布</span></button><button type="button" class="inspiration-primary" data-inspiration-analyze>拉片分析</button></div>
      </section>
    </div>
    <p class="inspiration-error" data-inspiration-error role="status"${error ? "" : " hidden"}>${escape(error)}</p>
    <section class="inspiration-results" data-inspiration-results hidden aria-label="拉片分析结果"></section>
    </div>
    <footer class="inspiration-draft-footer" data-inspiration-draft-footer hidden><button type="button" class="inspiration-primary" data-inspiration-action="copy" aria-live="polite" disabled>${icon("copy")}<span>复制提示词</span></button></footer>`;
  }

  function renderAnalysis(options = {}) {
    const analysis = options.analysis || {};
    const shots = Array.isArray(analysis.shots) ? analysis.shots : [];
    const activeShot = shots.find((shot) => shot.id === options.activeShotId);
    const promptLabel = activeShot ? `镜头 ${shots.indexOf(activeShot) + 1} 生成提示词` : "整段生成提示词";
    const isPrompt = options.tab === "prompt";
    const rows = activeShot
      ? [["画面", activeShot.summary], ["景别", activeShot.framing], ["运镜", activeShot.movement], ["构图", activeShot.composition], ["光影", activeShot.light], ["声音", activeShot.sound], ["衔接", activeShot.transition]].filter(([, text]) => text).map(([label, text]) => ({ label, text }))
      : (Array.isArray(analysis.overview) ? analysis.overview : []).filter((item) => item?.text);
    return `<div class="inspiration-analysis-heading"><h3 data-inspiration-analysis-title tabindex="-1">拉片分析</h3><span><span>模拟</span> · ${timecode(analysis.start)} – ${timecode(analysis.end)}</span></div>
      ${options.stale ? `<p class="inspiration-stale" role="status">参考范围已变化，请重新分析。</p>` : ""}
      <div class="inspiration-replace-confirm" data-inspiration-replace-confirm hidden role="alert"><p>重新分析会替换已编辑的生成提示词。</p><div><button type="button" class="inspiration-secondary" data-inspiration-replace-cancel>保留编辑</button><button type="button" class="inspiration-primary" data-inspiration-replace-confirm-button>替换并分析</button></div></div>
      <div class="inspiration-analysis-layout">
        <section class="inspiration-shots" aria-label="镜头列表"><div class="inspiration-shots-heading"><span>${shots.length} 个镜头</span><button type="button" data-inspiration-shot="" class="inspiration-whole${activeShot ? "" : " active"}" aria-pressed="${!activeShot}">查看整段</button></div>
          <div class="inspiration-shot-grid">${shots.map((shot, index) => {
            const poster = safeUrl(shot.posterUrl);
            return `<button type="button" class="inspiration-shot-card${activeShot?.id === shot.id ? " active" : ""}" data-inspiration-shot="${escape(shot.id)}" aria-pressed="${activeShot?.id === shot.id}" aria-label="查看镜头 ${index + 1}：${escape(shot.title || shot.framing || "镜头")}">
              <span class="inspiration-shot-image">${poster ? `<img src="${poster}" alt="" loading="lazy">` : icon("video")}<span class="inspiration-shot-number">${String(index + 1).padStart(2, "0")}</span>${icon("play")}</span>
              <span class="inspiration-shot-time">${timecode(shot.start)} – ${timecode(shot.end)}<span>${Math.max(0, seconds(shot.end) - seconds(shot.start)).toFixed(1).replace(/\.0$/, "")}s</span></span>
              ${shot.partial ? `<span class="inspiration-shot-partial" title="原镜头 ${timecode(shot.sourceStart)} – ${timecode(shot.sourceEnd)}">局部</span>` : ""}
              <span class="inspiration-shot-summary">${escape([shot.framing, shot.movement].filter(Boolean).join(" · ") || shot.title || "镜头")}</span>
            </button>`;
          }).join("")}</div>
        </section>
        <section class="inspiration-analysis-detail" aria-label="分析与创作"><div class="inspiration-result-tabs" role="tablist" aria-label="分析与创作"><button type="button" id="inspirationAnalysisTab" role="tab" aria-selected="${!isPrompt}" tabindex="${isPrompt ? -1 : 0}" aria-controls="inspirationAnalysisPanel" data-inspiration-result-tab="analysis">镜头分析</button><button type="button" id="inspirationPromptTab" role="tab" aria-selected="${isPrompt}" tabindex="${isPrompt ? 0 : -1}" aria-controls="inspirationPromptPanel" data-inspiration-result-tab="prompt">生成提示词</button></div>
          <div class="inspiration-result-panels">
          <div id="inspirationAnalysisPanel" role="tabpanel" aria-labelledby="inspirationAnalysisTab"${isPrompt ? " hidden" : ""}><h4>${escape(activeShot ? activeShot.title || "当前镜头" : "整段分析")}</h4><dl class="inspiration-analysis-copy">${rows.map((item) => `<div><dt>${escape(item.label)}</dt><dd>${escape(item.text)}</dd></div>`).join("")}</dl></div>
          <div id="inspirationPromptPanel" role="tabpanel" aria-labelledby="inspirationPromptTab"${isPrompt ? "" : " hidden"}><label class="inspiration-prompt-label" for="inspirationPrompt">${promptLabel}</label><textarea id="inspirationPrompt" data-inspiration-prompt maxlength="12000" spellcheck="false" aria-label="生成提示词">${escape(options.prompt ?? (activeShot ? activeShot.prompt : analysis.prompt) ?? "")}</textarea></div>
          </div>
        </section>
      </div>`;
  }

  function renderCard(options = {}) {
    const media = options.media || {};
    const clip = options.clip || {};
    const id = escape(media.id || "");
    const title = escape(clip.title || media.name || "未命名片段");
    const poster = safeUrl(clip.posterUrl || media.thumbnailUrl);
    const selected = Boolean(options.selected);
    const disabled = options.selectionDisabled ? ' disabled title="仅可同时选择同类结果"' : "";
    const classes = ["asset-library-card", "asset-library-media-card", "inspiration-card", "readonly", options.selectionMode && "selection-mode", selected && "selected"].filter(Boolean).join(" ");
    const tags = (options.discoveryTags || clip.tags || []).slice(0, 2).map((tag) => typeof tag === "string" ? { label: tag } : tag).filter((tag) => tag?.label);
    const shotCount = Array.isArray(clip.shots) ? clip.shots.length : 0;
    return `<article class="${classes}" draggable="true" data-library-media="${id}" data-library-space="platform" data-library-media-kind="video">
      <button type="button" class="asset-library-card-preview inspiration-card-preview" data-library-preview="${id}" data-library-item-kind="media" aria-label="查看片段 ${title}"${options.selectionMode ? disabled : ""}>
        ${poster ? `<img src="${poster}" alt="" loading="lazy" draggable="false">` : icon("video")}
        <span class="inspiration-card-play">${icon("play")}</span><span class="inspiration-card-duration">${time(clip.duration)}</span>
      </button>
      <div class="inspiration-card-copy"><div class="inspiration-card-title" title="${title}">${title}</div><div class="inspiration-card-source">${escape([clip.sourceLabel, shotCount ? `${shotCount} 个镜头` : ""].filter(Boolean).join(" · "))}</div>${tags.length ? `<div class="inspiration-card-tags">${tags.map((tag) => tag.id && !options.selectionMode ? `<button type="button" data-discovery-card-facet="${escape(tag.id)}" aria-label="查找${escape(tag.label)}片段" title="查找${escape(tag.label)}片段">${escape(tag.label)}</button>` : `<span>${escape(tag.label)}</span>`).join('<span aria-hidden="true"> · </span>')}</div>` : ""}</div>
      <button type="button" class="asset-library-selection-button${selected ? " active" : ""}" data-library-select="media:${id}" data-library-item-kind="media" aria-label="${selected ? "取消选择" : "选择"} ${title}" aria-pressed="${selected}"${disabled}>${icon("check")}</button>
    </article>`;
  }

  root.REELAY_CANVAS_INSPIRATION_VIEW = Object.freeze({ renderDetail, renderAnalysis, renderCard });
})(window);
