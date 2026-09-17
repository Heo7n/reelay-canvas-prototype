import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><body></body>", { runScripts: "outside-only" });
dom.window.eval(await readFile(new URL("../src/legacy-canvas/canvas-inspiration-view.js", import.meta.url), "utf8"));
const view = dom.window.REELAY_CANVAS_INSPIRATION_VIEW;
after(() => dom.window.close());

const clip = {
  id: "clip-1", title: "雨夜追逐", duration: 42.6, url: "/assets/clips/rain.mp4",
  posterUrl: "/assets/clips/rain.jpg", sourceLabel: "创作短片", description: "跟随人物穿行街道。",
  tags: ["跟拍", "冷色", "追逐"], observations: [{ label: "运镜", text: "镜头随人物前进。" }],
};

function parse(markup) {
  const template = dom.window.document.createElement("template");
  template.innerHTML = markup;
  return template.content;
}

test("detail exposes playable range and analysis without premature draft actions", () => {
  const page = parse(view.renderDetail({ clip, start: 3.2, end: 18.4, canUse: true }));
  const video = page.querySelector("video");
  assert.equal(video.getAttribute("src"), clip.url);
  assert.equal(video.getAttribute("poster"), clip.posterUrl);
  assert.equal(video.hasAttribute("autoplay"), false);
  assert.equal(video.hasAttribute("controls"), true);
  assert.equal(video.getAttribute("preload"), "metadata");
  assert.equal(page.querySelector("[data-inspiration-start]").value, "3.2");
  assert.equal(page.querySelector("[data-inspiration-end]").max, "42.6");
  assert.equal(page.querySelector("#inspirationDetailTitle").textContent, clip.title);
  assert.equal(page.querySelector("[data-inspiration-analyze]").textContent, "拉片分析");
  assert.equal(page.querySelector('[data-inspiration-action="canvas"]').disabled, false);
  assert.equal(page.querySelector('[data-inspiration-action="canvas"]').textContent, "完整片段加入画布");
  assert.equal(page.querySelector('[data-inspiration-action="copy"]').disabled, true);
  assert.equal(page.querySelector('[data-inspiration-draft-footer]').hidden, true);
  assert.equal(page.querySelector('[data-inspiration-results]').hidden, true);
  assert.equal(page.querySelector("[data-inspiration-facet], [data-inspiration-intent]"), null);
  assert.equal(page.querySelector("[data-inspiration-error]").hidden, true);
  assert.equal(page.querySelector("[data-inspiration-media-error]").hidden, true);
});

test("read-only access disables both creation actions while allowing inspection", () => {
  const page = parse(view.renderDetail({ clip, canUse: false, error: "当前画布不可编辑" }));
  assert.equal(page.querySelectorAll("[data-inspiration-action]:disabled").length, 2);
  assert.equal(page.querySelector("[data-inspiration-play-range]").disabled, false);
  assert.equal(page.querySelector("[data-inspiration-error]").hidden, false);
  assert.equal(page.querySelector("[data-inspiration-error]").textContent, "当前画布不可编辑");
});

test("overview and cards show true shot counts with compact escaped discovery labels", () => {
  const tagged = { ...clip, shots: [{ id: 'a' }, { id: 'b' }] };
  const tags = [{ label: '人物' }, { label: '推进' }, { label: '逆光' }, { label: '<色彩>' }, { label: '第五项' }];
  const detail = parse(view.renderDetail({ clip: tagged, discoveryTags: tags }));
  assert.match(detail.querySelector('.inspiration-facts').textContent, /镜头2 个/);
  assert.equal(detail.querySelector('.inspiration-discovery-tags').textContent, '人物 · 推进 · 逆光 · <色彩>');
  assert.equal(detail.querySelector('[data-inspiration-close]').getAttribute('aria-label'), '关闭创作参考');
  const card = parse(view.renderCard({ clip: tagged, discoveryTags: tags }));
  assert.equal(card.querySelector('.inspiration-card-source').textContent, '创作短片 · 2 个镜头');
  assert.equal(card.querySelector('.inspiration-card-tags').textContent, '人物 · 推进');
});

test("long descriptions can expand without truncating source text or fabricating source timecodes", () => {
  const description = "穿过街道。".repeat(60);
  const page = parse(view.renderDetail({ clip: { ...clip, description } }));
  assert.equal(page.querySelector("details").open, false);
  assert.equal(page.querySelector("details p").textContent, description);
  assert.equal(page.querySelectorAll(".inspiration-facts > div").length, 2);
  assert.equal(page.querySelector(".inspiration-facts").textContent, "来源创作短片时长42.6 秒");
});

test("untrusted descriptive content stays text and active URL schemes are not rendered", () => {
  const malicious = '<img src=x onerror="alert(1)">';
  const page = parse(view.renderDetail({
    clip: { ...clip, title: malicious, url: "javascript:alert(1)", posterUrl: "data:image/svg+xml,<svg onload=alert(1)>",
      description: malicious, sourceLabel: malicious, observations: [{ label: malicious, text: malicious }] },
    error: malicious,
  }));
  assert.equal(page.querySelector("h2").textContent, malicious);
  assert.equal(page.querySelector("video").hasAttribute("src"), false);
  assert.equal(page.querySelector("video").hasAttribute("poster"), false);
  assert.equal(page.querySelectorAll("script,img,[onerror],[onload]").length, 0);
});

const analysis = {
  start: 2.1, end: 10.4, prompt: "参考跟拍与画面层次，替换为自己的角色。",
  overview: [{ label: "运镜", text: "先建立空间，再跟随人物。" }],
  shots: [
    { id: "shot-1", title: "建立空间", start: 2.1, end: 5.2, posterUrl: "/assets/shot-1.jpg", framing: "全景", movement: "缓慢推进", summary: "人物进入街道。", composition: "人物置于中央", light: "侧光", sound: "环境声", transition: "直切" },
    { id: "shot-2", title: "跟随人物", start: 5.2, end: 10.4, posterUrl: "/assets/shot-2.jpg", framing: "中景", movement: "跟拍", summary: "沿街前进。" },
  ],
};

test("analysis exposes actual shot count and the selected shot prompt in persistent sibling panels", () => {
  const page = parse(view.renderAnalysis({ analysis, activeShotId: "shot-2", tab: "analysis", prompt: "我的整段创作想法" }));
  assert.equal(page.querySelectorAll(".inspiration-shot-card").length, 2);
  assert.equal(page.querySelectorAll('input[type="checkbox"]').length, 0);
  assert.equal(page.querySelector('.inspiration-shot-card.active').dataset.inspirationShot, "shot-2");
  assert.equal(page.querySelector('button[data-inspiration-shot=""]').getAttribute("aria-pressed"), "false");
  assert.equal(page.querySelector("#inspirationAnalysisPanel h4").textContent, "跟随人物");
  assert.match(page.querySelector("#inspirationAnalysisPanel").textContent, /沿街前进/);
  assert.equal(page.querySelector("#inspirationPromptPanel").hidden, true);
  assert.equal(page.querySelector("textarea").value, "我的整段创作想法");
  assert.equal(page.querySelector("textarea").maxLength, 12000);
  assert.equal(page.querySelector("[data-inspiration-analysis-title]").tabIndex, -1);
  assert.equal(page.querySelector("[data-inspiration-replace-confirm]").hidden, true);
  assert.match(page.querySelector(".inspiration-analysis-heading").textContent, /模拟/);
  assert.equal(page.querySelector(".inspiration-prompt-label").textContent, "镜头 2 生成提示词");
  assert.equal(page.querySelectorAll('.inspiration-result-panels > [role="tabpanel"]').length, 2);
  assert.equal(page.querySelector('[data-inspiration-result-tab="prompt"]').textContent, "生成提示词");
});

test("prompt scope uses only the selected shot and keeps an explicitly empty edit", () => {
  const withPrompt = { ...analysis, shots: [{ ...analysis.shots[0], prompt: "全景，镜头缓慢推进。" }, analysis.shots[1]] };
  const selected = parse(view.renderAnalysis({ analysis: withPrompt, activeShotId: "shot-1", tab: "prompt" }));
  assert.equal(selected.querySelector("textarea").value, "全景，镜头缓慢推进。");
  const empty = parse(view.renderAnalysis({ analysis: withPrompt, activeShotId: "shot-1", prompt: "" }));
  assert.equal(empty.querySelector("textarea").value, "");
  const missing = parse(view.renderAnalysis({ analysis: withPrompt, activeShotId: "shot-2" }));
  assert.equal(missing.querySelector("textarea").value, "");
});

test("whole-segment analysis and stale results remain available beside a selected prompt tab", () => {
  const page = parse(view.renderAnalysis({ analysis, tab: "prompt", stale: true }));
  assert.equal(page.querySelector("#inspirationAnalysisPanel").hidden, true);
  assert.equal(page.querySelector("#inspirationAnalysisPanel h4").textContent, "整段分析");
  assert.equal(page.querySelector("#inspirationPromptPanel").hidden, false);
  assert.equal(page.querySelector("textarea").value, analysis.prompt);
  assert.equal(page.querySelector(".inspiration-prompt-label").textContent, "整段生成提示词");
  assert.equal(page.querySelector('[data-inspiration-result-tab="prompt"]').getAttribute("aria-selected"), "true");
  assert.equal(page.querySelector('button[data-inspiration-shot=""]').getAttribute("aria-pressed"), "true");
  assert.match(page.querySelector(".inspiration-stale").textContent, /参考范围已变化/);
});

test("subsecond ranges remain precise and partial shots identify their original interval", () => {
  const page = parse(view.renderAnalysis({ analysis: { ...analysis, start: 0.1, end: 0.4, shots: [{ ...analysis.shots[0], start: 0.1, end: 0.4, partial: true, sourceStart: 0, sourceEnd: 5.2 }] } }));
  assert.match(page.querySelector(".inspiration-analysis-heading").textContent, /0:00\.1 – 0:00\.4/);
  assert.equal(page.querySelector(".inspiration-shot-time").textContent, "0:00.1 – 0:00.40.3s");
  assert.equal(page.querySelector(".inspiration-shot-partial").title, "原镜头 0:00.0 – 0:05.2");
});

test("shot metadata, detail rows and editable prompt are escaped without active URLs", () => {
  const hostile = '<img src=x onerror="alert(1)">';
  const page = parse(view.renderAnalysis({
    analysis: { ...analysis, shots: [{ ...analysis.shots[0], id: 'x" onfocus="alert(1)', posterUrl: "javascript:alert(1)", title: hostile, framing: hostile }], overview: [{ label: hostile, text: hostile }] },
    prompt: '</textarea><script>alert(1)</script>',
  }));
  assert.equal(page.querySelectorAll("script,img,[onerror],[onfocus]").length, 0);
  assert.equal(page.querySelector("textarea").value, '</textarea><script>alert(1)</script>');
  assert.equal(page.querySelector(".inspiration-analysis-copy dd").textContent, hostile);
});

test("invalid times cannot inject input attributes or render non-finite bounds", () => {
  const page = parse(view.renderDetail({ clip: { ...clip, duration: Infinity }, start: -2, end: '" onfocus="alert(1)' }));
  assert.equal(page.querySelector("[data-inspiration-start]").value, "0");
  assert.equal(page.querySelector("[data-inspiration-end]").value, "0");
  assert.equal(page.querySelector("[onfocus]"), null);
});

test("platform cards preserve library selection and preview contracts without mutation menus", () => {
  const page = parse(view.renderCard({ media: { id: "media-1" }, clip, selectionMode: true, selected: true, selectionDisabled: false }));
  const card = page.querySelector("article");
  assert.equal(card.dataset.librarySpace, "platform");
  assert.equal(card.dataset.libraryMedia, "media-1");
  assert.equal(card.dataset.libraryMediaKind, "video");
  assert.equal(card.getAttribute("draggable"), "true");
  assert.equal(card.classList.contains("selected"), true);
  assert.equal(card.classList.contains("selection-mode"), true);
  assert.equal(page.querySelector("[data-library-preview]").getAttribute("aria-label"), "查看片段 雨夜追逐");
  assert.equal(page.querySelector("[data-library-select]").dataset.librarySelect, "media:media-1");
  assert.equal(page.querySelector("[data-library-select]").getAttribute("aria-pressed"), "true");
  assert.equal(page.querySelectorAll(".inspiration-card-tags span:not([aria-hidden])").length, 2);
  assert.equal(page.querySelector(".inspiration-card-duration").textContent, "0:42");
  assert.equal(page.querySelector("[data-library-menu], [data-library-more]"), null);
});

test("disabled selection prevents mixed selections and hostile card metadata is escaped", () => {
  const page = parse(view.renderCard({ media: { id: 'x" onpointerdown="alert(1)' }, clip: { ...clip, posterUrl: "java\nscript:alert(1)", title: "<script>unsafe</script>" }, selectionMode: true, selectionDisabled: true }));
  assert.equal(page.querySelector("[data-library-preview]").disabled, true);
  assert.equal(page.querySelector("[data-library-select]").disabled, true);
  assert.equal(page.querySelectorAll("script,img,[onpointerdown]").length, 0);
});
