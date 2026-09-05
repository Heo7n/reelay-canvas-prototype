import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("../src/legacy-canvas/canvas-entity-editor-view.js", import.meta.url),
  "utf8",
);
const context = vm.createContext({});
new vm.Script(source, { filename: "canvas-entity-editor-view.js" }).runInContext(context);
const view = context.REELAY_CANVAS_ENTITY_EDITOR_VIEW;

const media = [
  {
    id: "portrait",
    name: "正面照",
    mediaKind: "image",
    url: "https://cdn.example/portrait.jpg?x=1&y=2",
  },
  {
    id: "turnaround",
    displayName: "角色转身",
    mediaKind: "video",
    url: "blob:https://reelay.example/video-1",
    thumbnailUrl: "/thumbs/turnaround.webp",
  },
  {
    id: "voice",
    name: "角色声音",
    mediaKind: "audio",
    url: "https://cdn.example/voice.mp3",
  },
];

test("registers a frozen pure Entity editor and Media picker API", () => {
  assert.ok(Object.isFrozen(view));
  assert.deepEqual(Object.keys(view).sort(), ["renderEntityEditor", "renderMediaPicker"]);
  assert.equal(typeof view.renderEntityEditor, "function");
  assert.equal(typeof view.renderMediaPicker, "function");
  assert.equal(view.renderEntityEditor({ visible: false }), "");
  assert.equal(view.renderMediaPicker({ visible: false }), "");
});

test("create mode keeps the title 新建主体 and renders the complete empty draft", () => {
  const markup = view.renderEntityEditor({ mode: "create", name: "正在输入的名称" });

  assert.match(markup, /role="region" aria-labelledby="canvasEntityEditorTitle"/);
  assert.match(markup, /data-entity-editor-mode="create"/);
  assert.match(markup, /<h2 id="canvasEntityEditorTitle" title="新建主体">新建主体<\/h2>/);
  assert.match(markup, /data-entity-editor-name="true"/);
  assert.match(markup, /value="正在输入的名称"/);
  assert.match(markup, /required aria-required="true"/);
  assert.match(markup, /data-entity-editor-description="true"/);
  assert.match(markup, /<h3 id="canvasEntityEditorMediaTitle">添加素材<\/h3>/);
  assert.match(markup, /class="entity-editor-media-heading">\s*<h3[^>]*>添加素材<\/h3>\s*<\/div>\s*<div class="entity-editor-media-toolbar">[\s\S]*?class="entity-editor-media-filters"[\s\S]*?class="entity-editor-media-actions"/);
  assert.match(markup, /data-entity-editor-add-from-library="true"/);
  assert.match(markup, />从素材库添加<\/span>/);
  assert.match(markup, /data-entity-editor-upload="true"/);
  for (const filter of ["all", "image", "video", "audio"]) {
    assert.match(markup, new RegExp(`data-entity-editor-filter="${filter}"`));
  }
  assert.match(markup, /还没有添加素材/);
  assert.match(markup, /data-entity-editor-cancel="true"/);
  assert.match(markup, /data-entity-editor-submit="true" disabled aria-disabled="true">创建<\/button>/);
});

test("edit mode uses the live Entity name as its title and exposes save state", () => {
  const markup = view.renderEntityEditor({
    mode: "edit",
    entity: {
      id: "entity-1",
      name: "莉瑞尔",
      description: "精灵感，荒野气质",
      coverMediaId: "portrait",
    },
    media,
    selectedMediaId: "turnaround",
  });

  assert.match(markup, /data-entity-editor-mode="edit"/);
  assert.match(markup, /title="莉瑞尔">莉瑞尔<\/h2>/);
  assert.match(markup, /value="莉瑞尔"/);
  assert.match(markup, />精灵感，荒野气质<\/textarea>/);
  assert.match(markup, /data-entity-editor-cover-media="portrait"/);
  assert.match(markup, /data-entity-editor-selected-media="turnaround"/);
  assert.match(markup, /data-entity-editor-media="portrait"[^]*class="entity-editor-cover-badge"/);
  assert.match(markup, /data-entity-editor-media="turnaround"/);
  assert.doesNotMatch(markup, /data-entity-editor-set-cover="turnaround"/);
  assert.match(markup, /data-entity-editor-submit="true">保存<\/button>/);
  assert.equal(markup.match(/data-entity-editor-media="/g)?.length, 3);
  assert.match(markup, /全部<\/span>\s*<span aria-label="3 个">\(3\)<\/span>/);
  assert.match(markup, /图片<\/span>\s*<span aria-label="1 个">\(1\)<\/span>/);
  assert.match(markup, /视频<\/span>\s*<span aria-label="1 个">\(1\)<\/span>/);
  assert.match(markup, /音频<\/span>\s*<span aria-label="1 个">\(1\)<\/span>/);
});

test("model-shaped state can drive title, values, counts, filter, and preview directly", () => {
  const markup = view.renderEntityEditor({
    mode: "edit",
    title: "重命名后的主体",
    name: "重命名后的主体",
    description: "草稿描述",
    filter: "image",
    filteredMedia: [media[0]],
    counts: { all: 3, image: 1, video: 1, audio: 1 },
    selectedPreviewId: "portrait",
    coverMediaId: "portrait",
  });

  assert.match(markup, /title="重命名后的主体">重命名后的主体<\/h2>/);
  assert.match(markup, /value="重命名后的主体"/);
  assert.match(markup, />草稿描述<\/textarea>/);
  assert.match(markup, /data-entity-editor-filter-active="image"/);
  assert.match(markup, /aria-selected="true"[^>]*data-entity-editor-filter="image"/);
  assert.match(markup, /aria-label="3 个">\(3\)<\/span>/);
  assert.doesNotMatch(markup, /entity-editor-media-kind/);
  assert.match(markup, /data-entity-editor-preview="portrait"/);
  assert.match(markup, /entity-editor-preview-kind-icon[^]*data-lucide="image"/);
  assert.match(markup, /data-entity-editor-preview-name="portrait"[^>]*>正面照<\/button>/);
  assert.match(markup, /<header>\s*<div class="entity-editor-preview-meta">[\s\S]*?<\/div>\s*<span class="entity-editor-cover-control entity-editor-cover-status" role="status"[^>]*>当前封面<\/span>/);
});

test("filtering limits the Media grid while preserving live category counts", () => {
  const markup = view.renderEntityEditor({
    mode: "create",
    name: "主体",
    media,
    filter: "image",
    selectedMediaId: "portrait",
  });

  assert.match(markup, /data-entity-editor-filter-active="image"/);
  assert.match(markup, /data-entity-editor-media="portrait"/);
  assert.doesNotMatch(markup, /data-entity-editor-media="turnaround"/);
  assert.doesNotMatch(markup, /data-entity-editor-media="voice"/);
  assert.match(markup, /aria-label="3 个">\(3\)<\/span>/);
  assert.match(markup, /data-entity-editor-submit="true">创建<\/button>/);
});

test("image, video, and audio previews use only structured safe Media fields", () => {
  const image = view.renderEntityEditor({ mode: "edit", name: "图像", media, selectedMediaId: "portrait" });
  const video = view.renderEntityEditor({ mode: "edit", name: "视频", media, selectedMediaId: "turnaround" });
  const audio = view.renderEntityEditor({ mode: "edit", name: "音频", media, selectedMediaId: "voice" });
  const unsafe = view.renderEntityEditor({
    mode: "edit",
    name: "不安全",
    media: [{
      id: "unsafe",
      name: "坏地址",
      mediaKind: "image",
      url: "java\nscript:alert(1)",
      thumbnailUrl: '\"><img src=x onerror="alert(2)">',
    }],
    selectedMediaId: "unsafe",
  });

  assert.match(image, /<img src="https:\/\/cdn\.example\/portrait\.jpg\?x=1&amp;y=2" alt="正面照">/);
  assert.match(image, /data-lucide="image"/);
  assert.match(video, /data-lucide="play-square"/);
  assert.match(audio, /data-lucide="audio-lines"/);
  assert.match(image, /<header>\s*<div class="entity-editor-preview-meta">[\s\S]*?<\/div>\s*<button class="entity-editor-cover-control entity-editor-cover-action"[^>]*data-entity-editor-set-cover="portrait"[^>]*>设为封面<\/button>/);
  assert.match(video, /<video src="blob:https:\/\/reelay\.example\/video-1" poster="\/thumbs\/turnaround\.webp" controls playsinline/);
  assert.match(audio, /<audio src="https:\/\/cdn\.example\/voice\.mp3" controls preload="metadata"/);
  assert.doesNotMatch(video, /data-entity-editor-set-cover/);
  assert.doesNotMatch(audio, /data-entity-editor-set-cover/);
  assert.doesNotMatch(unsafe, /javascript:/i);
  assert.doesNotMatch(unsafe, /<img src=x/);
  assert.match(unsafe, /图片暂不可预览/);
});

test("preview filename rename keeps the suffix fixed in a horizontal inline control", () => {
  const markup = view.renderEntityEditor({
    mode: "edit",
    name: "主体",
    media: [{ id: "portrait", name: "角色.正面.webp", mediaKind: "image" }],
    selectedMediaId: "portrait",
    renamingMediaId: "portrait",
    mediaRenameValue: "角色定妆",
  });

  assert.match(markup, /data-lucide="image"[^]*data-entity-editor-preview-rename="portrait"/);
  assert.match(markup, /value="角色定妆"/);
  assert.match(markup, /固定扩展名 \.webp[^>]*>\.webp<\/span>/);
  assert.doesNotMatch(markup, /value="角色定妆\.webp"/);
});

test("the editor escapes all user content and renders accessible validation errors", () => {
  const payload = '<script>alert("x")</script>&\'boom';
  const markup = view.renderEntityEditor({
    mode: "edit",
    name: payload,
    description: `</textarea>${payload}`,
    media: [{ id: payload, name: payload, mediaKind: "image" }],
    selectedMediaId: payload,
    coverMediaId: payload,
    errors: { name: payload, media: payload },
  });

  assert.doesNotMatch(markup, /<script>/);
  assert.doesNotMatch(markup, /<\/textarea><script>/);
  assert.match(markup, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;&amp;&#39;boom/);
  assert.match(markup, /aria-invalid="true" aria-describedby="canvasEntityEditorNameError"/);
  assert.match(markup, /id="canvasEntityEditorNameError" role="alert"/);
  assert.match(markup, /id="canvasEntityEditorMediaError" role="alert"/);
  assert.match(markup, /data-entity-editor-media="&lt;script&gt;/);
});

test("read-only and submitting states disable every mutation affordance", () => {
  const readOnly = view.renderEntityEditor({ mode: "edit", name: "主体", media, mutable: false });
  const submitting = view.renderEntityEditor({ mode: "edit", name: "主体", media, submitting: true });
  const uploading = view.renderEntityEditor({ mode: "edit", name: "主体", media, uploading: true });

  assert.match(readOnly, /data-entity-editor-name="true" disabled/);
  assert.match(readOnly, /data-entity-editor-description="true" disabled/);
  assert.match(readOnly, /data-entity-editor-add-from-library="true" disabled aria-disabled="true"/);
  assert.match(readOnly, /data-entity-editor-upload="true" disabled aria-disabled="true"/);
  assert.doesNotMatch(readOnly, /data-entity-editor-media-remove/);
  assert.match(readOnly, /data-entity-editor-submit="true" disabled aria-disabled="true"/);
  assert.match(submitting, /data-entity-editor-busy="true"/);
  assert.match(submitting, /data-entity-editor-name="true" disabled aria-disabled="true"/);
  assert.match(submitting, /data-entity-editor-description="true" disabled aria-disabled="true"/);
  assert.match(submitting, /data-entity-editor-filter="all" disabled aria-disabled="true"/);
  assert.match(submitting, /data-entity-editor-media-select="portrait" disabled aria-disabled="true"/);
  assert.doesNotMatch(submitting, /data-entity-editor-media-remove/);
  assert.match(submitting, /data-entity-editor-cancel="true" disabled aria-disabled="true"/);
  assert.match(submitting, /data-entity-editor-submit="true" disabled aria-disabled="true">正在保存…<\/button>/);
  assert.match(uploading, /data-entity-editor-submit="true" disabled aria-disabled="true">正在上传…<\/button>/);
});

test("editor capability flags disable unavailable add paths before interaction", () => {
  const markup = view.renderEntityEditor({
    mode: "edit",
    name: "主体",
    media,
    canAddFromLibrary: false,
    canUpload: false,
  });

  assert.match(markup, /data-entity-editor-add-from-library="true" disabled aria-disabled="true" title="当前项目暂不支持从素材库添加"/);
  assert.match(markup, /data-entity-editor-upload="true" disabled aria-disabled="true" title="当前项目暂不支持上传素材"/);
  assert.match(markup, /data-entity-editor-submit="true">保存<\/button>/);
});

test("four Media filters expose a roving tab relationship for keyboard control", () => {
  const editor = view.renderEntityEditor({ mode: "edit", name: "主体", media, filter: "video" });
  const picker = view.renderMediaPicker({ media, filter: "audio" });

  assert.match(editor, /role="tablist" aria-label="已添加素材类型"/);
  assert.match(editor, /id="canvasEntityEditorFilter-video"[^>]*aria-controls="canvasEntityEditorMediaGrid" aria-selected="true" tabindex="0"/);
  assert.match(editor, /id="canvasEntityEditorMediaGrid"[^>]*aria-labelledby="canvasEntityEditorFilter-video"/);
  assert.match(picker, /role="tablist" aria-label="个人素材类型"/);
  assert.match(picker, /id="canvasEntityPickerFilter-audio"[^>]*aria-controls="canvasEntityPickerGrid" aria-selected="true" tabindex="0"/);
  assert.match(picker, /id="canvasEntityPickerGrid"[^>]*aria-labelledby="canvasEntityPickerFilter-audio"/);
});

test("Media picker searches and filters personal Media with multiselect semantics", () => {
  const markup = view.renderMediaPicker({
    media,
    query: "角色",
    filter: "video",
    selectedIds: new Set(["turnaround", "missing"]),
  });

  assert.match(markup, /role="dialog" aria-modal="true"/);
  assert.match(markup, /<h2 id="canvasEntityPickerTitle">从素材库添加<\/h2>/);
  assert.match(markup, /data-entity-picker-search="true"/);
  assert.match(markup, /value="角色"/);
  assert.match(markup, /aria-selected="true"[^>]*data-entity-picker-filter="video"/);
  assert.match(markup, /role="listbox" aria-label="个人空间素材" aria-labelledby="canvasEntityPickerFilter-video" aria-multiselectable="true"/);
  assert.match(markup, /data-entity-picker-media="turnaround"/);
  assert.doesNotMatch(markup, /data-entity-picker-media="portrait"/);
  assert.doesNotMatch(markup, /data-entity-picker-media="voice"/);
  assert.match(markup, /data-entity-picker-toggle="turnaround"[^>]*data-entity-picker-media="turnaround"/);
  assert.match(markup, /aria-selected="true"/);
  assert.match(markup, /data-entity-picker-selected-count="1"/);
  assert.match(markup, /已选择 1 项/);
  assert.match(markup, /data-entity-picker-confirm="true">添加（1）<\/button>/);
  assert.equal(markup.match(/data-entity-picker-cancel="true"/g)?.length, 2);
});

test("Media picker normalizes invalid state, escapes search, and disables an empty confirmation", () => {
  const payload = '\"><script>alert(1)</script>';
  const markup = view.renderMediaPicker({
    media: [{ id: payload, name: payload, mediaKind: "image", url: "javascript:alert(1)" }],
    query: `${payload} missing`,
    filter: payload,
    selectedIds: ["unknown"],
  });

  assert.match(markup, /data-entity-picker-filter-active="all"/);
  assert.match(markup, /value="&quot;&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt; missing"/);
  assert.doesNotMatch(markup, /<script>/);
  assert.doesNotMatch(markup, /javascript:/);
  assert.match(markup, /没有匹配的个人素材/);
  assert.match(markup, /data-entity-picker-selected-count="0"/);
  assert.match(markup, /data-entity-picker-confirm="true" disabled aria-disabled="true">添加<\/button>/);
});

test("deduplicates repeated Media records before rendering editor and picker cards", () => {
  const repeated = [media[0], { ...media[0], name: "重复项" }];
  const editor = view.renderEntityEditor({ mode: "edit", name: "主体", media: repeated });
  const picker = view.renderMediaPicker({ media: repeated });

  assert.equal(editor.match(/data-entity-editor-media="portrait"/g)?.length, 1);
  assert.equal(picker.match(/data-entity-picker-media="portrait"/g)?.length, 1);
  assert.doesNotMatch(editor, /重复项/);
  assert.doesNotMatch(picker, /重复项/);
});

test("dedicated CSS covers theme parity, visible hover removal, focus, and defensive layout", async () => {
  const css = await readFile(new URL("../styles/canvas-entity-editor.css", import.meta.url), "utf8");

  assert.match(css, /\.canvas-entity-editor\s*\{/);
  assert.match(css, /html\[data-theme="light"\] \.canvas-entity-editor/);
  assert.match(css, /\.entity-editor-media-card:hover \.entity-editor-media-remove/);
  assert.match(css, /\.entity-editor-media-card:focus-within \.entity-editor-media-remove/);
  assert.match(css, /\.entity-editor-details-scroll\s*\{[^}]*padding:\s*18px 20px 0;[^}]*overflow:\s*hidden;[^}]*flex-direction:\s*column;/s);
  assert.match(css, /\.entity-editor-media-section\s*\{[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;[^}]*flex:\s*1 1 0;/s);
  assert.match(css, /\.entity-editor-media-grid\s*\{[^}]*padding:\s*0 3px 14px 0;[^}]*overflow-y:\s*auto;[^}]*grid-auto-rows:\s*max-content;[^}]*flex:\s*1 1 0;/s);
  assert.match(css, /\.entity-editor-preview-meta\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;/s);
  assert.match(css, /\.entity-editor-preview > header \.entity-editor-cover-control\s*\{[^}]*width:\s*80px;[^}]*min-width:\s*80px;[^}]*max-width:\s*80px;[^}]*height:\s*30px;[^}]*appearance:\s*none;[^}]*font-size:\s*12px;/s);
  assert.match(css, /\.entity-editor-cover-status\s*\{[^}]*pointer-events:\s*none;/s);
  assert.doesNotMatch(css, /\.entity-editor-cover-badge svg/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /\.entity-media-picker\s*\{/);
  assert.match(css, /\.canvas-entity-editor\s*\{[^}]*background: var\(--entity-editor-bg\);/s);
  assert.match(css, /\.entity-picker-footer\s*\{[^}]*flex-wrap: wrap;/s);
  assert.match(css, /\.entity-editor-details\s*\{[^}]*container-type: inline-size;[^}]*container-name: entity-editor-details;/s);
  assert.match(css, /@container entity-editor-details \(max-width: 520px\)[\s\S]*?\.entity-editor-media-toolbar\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\);/s);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
