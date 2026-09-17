import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import { JSDOM } from "jsdom";
import { installCanvasIcons } from "./helpers/canvas-icons.mjs";

const source = await readFile(
  new URL("../src/legacy-canvas/canvas-entity-editor-view.js", import.meta.url),
  "utf8",
);
const dom = new JSDOM('<!doctype html><body></body>', { runScripts: "outside-only" });
const context = dom.window;
installCanvasIcons(context);
context.eval(await readFile(new URL("../src/legacy-canvas/canvas-file-name.js", import.meta.url), "utf8"));
context.eval(source);
const view = context.REELAY_CANVAS_ENTITY_EDITOR_VIEW;
after(() => dom.window.close());

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

test("editor initially displays the thumbnail while retaining the original as its full-detail source", () => {
  const dom = new JSDOM(view.renderEntityEditor({
    media: [{ ...media[0], thumbnailUrl: "https://cdn.example/portrait-preview.webp" }],
    selectedMediaId: "portrait",
  }));
  const doc = dom.window.document;
  assert.equal(doc.querySelector('[data-entity-editor-media="portrait"] img').src,
    "https://cdn.example/portrait-preview.webp");
  assert.equal(doc.querySelector('[data-entity-editor-preview="portrait"] [data-preview-thumbnail]').src,
    "https://cdn.example/portrait-preview.webp");
  assert.equal(doc.querySelector('[data-entity-editor-preview="portrait"] [data-preview-full]').dataset.previewFull, media[0].url);
  dom.window.close();
});

test("registers a frozen pure Entity editor and Media picker API", () => {
  assert.ok(Object.isFrozen(view));
  assert.deepEqual(Object.keys(view).sort(), ["renderEntityEditor", "renderEntityTagOptions", "renderMediaPicker"]);
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
  const headingIcon = JSDOM.fragment(markup).querySelector('.entity-editor-title > svg[data-entity-editor-icon="layout-grid"]');
  assert.equal(headingIcon.getAttribute('aria-hidden'), 'true');
  assert.equal(headingIcon.nextElementSibling.id, 'canvasEntityEditorTitle');
  assert.match(markup, /data-entity-editor-name="true"/);
  assert.match(markup, /value="正在输入的名称"/);
  assert.match(markup, /required aria-required="true"/);
  assert.match(markup, /data-entity-editor-description="true"/);
  assert.match(markup, /<h3 class="sr-only" id="canvasEntityEditorMediaTitle">参考素材<\/h3>/);
  assert.match(markup, /class="entity-editor-media-toolbar">[\s\S]*?class="entity-editor-media-filters"[\s\S]*?class="entity-editor-media-actions"/);
  assert.match(markup, /data-entity-editor-add-from-library="true"/);
  assert.match(markup, />选择素材<\/span>/);
  assert.match(markup, /data-entity-editor-upload="true"/);
  for (const filter of ["all", "image", "video", "audio"]) {
    assert.match(markup, new RegExp(`data-entity-editor-filter="${filter}"`));
  }
  assert.match(markup, /还没有添加素材/);
  assert.match(markup, /data-entity-editor-cancel="true"/);
  assert.match(markup, /data-entity-editor-submit="true" disabled aria-disabled="true">新建主体<\/button>/);
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
  assert.match(markup, /entity-editor-preview-kind-icon[^]*data-entity-editor-icon="image"/);
  assert.equal(new JSDOM(markup).window.document.querySelector('[data-entity-editor-preview-name="portrait"]').textContent, "正面照");
  assert.match(markup, /<div class="entity-editor-preview-surface">[\s\S]*?<span class="entity-editor-cover-control entity-editor-cover-status" role="status"[^>]*>当前封面<\/span>/);
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
  assert.match(markup, /data-entity-editor-submit="true">新建主体<\/button>/);
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
  for (const [markup, expectedIcon] of [[image, "image"], [video, "square-play"], [audio, "audio-lines"]]) {
    const previewIcon = JSDOM.fragment(markup).querySelector(`.entity-editor-preview-kind-icon > svg[data-entity-editor-icon="${expectedIcon}"]`);
    assert.equal(previewIcon.getAttribute('aria-hidden'), 'true');
    assert.ok(previewIcon.classList.contains('lucide'));
  }
  assert.match(image, /<div class="entity-editor-preview-surface">[\s\S]*?<button class="entity-editor-cover-control entity-editor-cover-action"[^>]*data-entity-editor-set-cover="portrait"[^>]*>设为封面<\/button>/);
  assert.match(video, /<video src="blob:https:\/\/reelay\.example\/video-1" poster="\/thumbs\/turnaround\.webp" controls playsinline/);
  assert.match(audio, /<audio src="https:\/\/cdn\.example\/voice\.mp3" controls preload="metadata"/);
  assert.doesNotMatch(video, /data-entity-editor-set-cover/);
  assert.doesNotMatch(audio, /data-entity-editor-set-cover/);
  assert.doesNotMatch(unsafe, /javascript:/i);
  assert.doesNotMatch(unsafe, /<img src=x/);
  assert.match(unsafe, /图片暂不可预览/);
});

test("media card and preview names preserve suffixes while keeping original names and edit affordances", (t) => {
  const name = '角色定妆 & <正面>.Version2.PNG';
  const dom = new JSDOM(view.renderEntityEditor({
    mode: "edit",
    name: "主体.png",
    media: [{ id: "portrait", name, mediaKind: "image" }],
    selectedMediaId: "portrait",
  }));
  t.after(() => dom.window.close());
  const doc = dom.window.document;
  for (const selector of [".entity-editor-media-name", ".entity-editor-preview-filename"]) {
    const label = doc.querySelector(selector);
    assert.equal(label.textContent, name);
    assert.equal(label.querySelector(".entity-editor-file-name-stem").textContent, "角色定妆 & <正面>.Version2");
    assert.equal(label.querySelector(".entity-editor-file-name-extension").textContent, ".PNG");
  }
  assert.equal(doc.querySelector(".entity-editor-media-name").title, name);
  assert.equal(doc.querySelector(".entity-editor-media-select").getAttribute("aria-label"), `预览 ${name}`);
  const preview = doc.querySelector(".entity-editor-preview-filename");
  assert.equal(preview.title, "双击重命名文件（扩展名保持不变）");
  assert.equal(preview.getAttribute("aria-label"), `文件名称 ${name}，双击或按 F2 重命名`);
  assert.equal(preview.dataset.entityEditorPreviewName, "portrait");
  assert.equal(doc.querySelector("#canvasEntityEditorTitle").textContent, "主体.png");
  assert.equal(doc.querySelector("#canvasEntityEditorTitle .entity-editor-file-name-extension"), null);
  assert.equal(doc.querySelector("#canvasEntityEditorName").value, "主体.png");
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

  assert.match(markup, /data-entity-editor-icon="image"[^]*data-entity-editor-preview-rename="portrait"/);
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
  assert.match(css, /\.entity-editor-details-scroll\s*\{[^}]*overflow:\s*hidden;[^}]*flex-direction:\s*column;/s);
  assert.match(css, /\.entity-editor-media-grid\s*\{[^}]*height:[^}]*overflow-y:\s*auto;[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/s);
  assert.match(css, /\.entity-editor-preview-meta\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;/s);
  assert.match(css, /\.entity-editor-preview-surface \.entity-editor-cover-control\s*\{[^}]*width:\s*80px;[^}]*min-width:\s*80px;[^}]*max-width:\s*80px;[^}]*height:\s*30px;[^}]*appearance:\s*none;[^}]*font-size:\s*12px;/s);
  assert.match(css, /\.entity-editor-cover-status\s*\{[^}]*pointer-events:\s*none;/s);
  assert.doesNotMatch(css, /\.entity-editor-cover-badge svg/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /\.entity-media-picker\s*\{/);
  assert.match(css, /\.canvas-entity-editor\s*\{[^}]*background: var\(--entity-editor-panel\);/s);
  assert.match(css, /\.entity-picker-footer\s*\{[^}]*flex-wrap: wrap;/s);
  assert.match(css, /\.entity-editor-preview\s*\{[^}]*min-height:\s*0;[^}]*flex:\s*1 1 0;/s);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("subject editor keeps metadata, media and preview in one form with its footer outside the content area", () => {
  const fragment = JSDOM.fragment(view.renderEntityEditor({ name: "主体", media }));
  const editor = fragment.querySelector(".canvas-entity-editor");
  const form = editor.querySelector("form");
  assert.equal(editor.children.length, 1);
  assert.equal(editor.firstElementChild, form);
  const content = form.querySelector(".entity-editor-details-scroll");
  assert.deepEqual([...content.children].map((node) => node.className), [
    "entity-editor-workspace", "entity-editor-preview",
  ]);
  const workspace = content.querySelector(".entity-editor-workspace");
  assert.deepEqual([...workspace.children].map((node) => node.className), [
    "entity-editor-metadata", "entity-editor-media-section",
  ]);
  const actions = workspace.querySelector(".entity-editor-media-actions");
  assert.equal(actions.previousElementSibling.className, "entity-editor-media-grid");
  assert.deepEqual([...actions.querySelectorAll("button")].map((node) => node.textContent.trim()), ["选择素材", "本地上传"]);
  assert.equal(content.querySelector(".entity-editor-footer"), null);
  assert.equal(form.lastElementChild.className, "entity-editor-footer");
  const card = content.querySelector(".entity-editor-media-card");
  assert.equal(card.querySelector(".entity-editor-media-thumbnail").nextElementSibling.className, "entity-editor-media-name");
});

test("editor metadata exposes optional draft tags without mixing them into the name or description", () => {
  const fragment = JSDOM.fragment(view.renderEntityEditor({
    name: "莉瑞尔",
    description: "精灵角色",
    tagIds: ["character", "custom", "character"],
    tagOptions: [{ id: "character", name: "角色" }, { id: "custom", name: "精灵" }],
    tagPickerOpen: true,
  }));
  const metadata = fragment.querySelector(".entity-editor-metadata");
  assert.equal(metadata.querySelector(".entity-editor-name-field input").value, "莉瑞尔");
  assert.equal(metadata.querySelector(".entity-editor-description-field textarea").value, "精灵角色");
  assert.equal(metadata.querySelector("[data-entity-editor-tags-toggle]").getAttribute("aria-expanded"), "true");
  assert.equal(metadata.querySelector("label[for='canvasEntityEditorTagsToggle']").textContent, "标签");
  assert.equal(metadata.querySelector("[data-entity-editor-tags-toggle]").textContent, "角色、精灵");
  assert.equal(metadata.querySelector("[data-entity-editor-tags-toggle]").title, "角色、精灵");
  assert.equal(metadata.querySelector("[data-entity-editor-tag-remove]"), null);
  assert.equal(metadata.querySelector('[data-entity-editor-tag-toggle="custom"]').getAttribute("aria-pressed"), "true");
  assert.equal(metadata.querySelector("[data-entity-editor-tag-popover]").getAttribute("role"), "dialog");
  assert.equal(metadata.querySelector("[data-entity-editor-tag-query]").value, "");
});

test("tag option projection filters safely and preserves independent selection", () => {
  const options = {
    tagIds: ["custom"],
    tagOptions: [{ id: "role", name: "角色" }, { id: "custom", name: 'Forest <Elf> "2"' }],
    tagQuery: "FOREST",
  };
  const fragment = JSDOM.fragment(view.renderEntityTagOptions(options));
  const choices = fragment.querySelectorAll("button");
  assert.equal(choices.length, 1);
  assert.equal(choices[0].textContent, 'Forest <Elf> "2"');
  assert.equal(choices[0].getAttribute("aria-pressed"), "true");
  assert.equal(fragment.querySelector("elf"), null);
  assert.match(view.renderEntityTagOptions({ ...options, tagQuery: "没有" }), /没有匹配的标签/);
  assert.match(view.renderEntityTagOptions({ tagOptions: [] }), /暂无可用标签/);
});

test("missing tags stay visible and removable while read-only or busy editors prohibit all tag mutations", () => {
  const selected = { tagIds: ["deleted"], tagOptions: [], tagPickerOpen: true, tagError: "请选择有效标签" };
  const fragment = JSDOM.fragment(view.renderEntityEditor(selected));
  assert.equal(fragment.querySelector("[data-entity-editor-tags-toggle]").textContent, "标签已移除");
  assert.equal(fragment.querySelector('[data-entity-editor-tag-toggle="deleted"]').getAttribute("aria-pressed"), "true");
  assert.equal(fragment.querySelector("#canvasEntityEditorTagsError").textContent, "请选择有效标签");
  assert.equal(fragment.querySelector("[data-entity-editor-tags-toggle]").getAttribute("aria-describedby"), "canvasEntityEditorTagsError");
  for (const state of [{ mutable: false }, { submitting: true }, { uploading: true }]) {
    const blocked = JSDOM.fragment(view.renderEntityEditor({ ...selected, ...state }));
    assert.equal(blocked.querySelector("[data-entity-editor-tags-toggle]").disabled, true);
    assert.equal(blocked.querySelector("[data-entity-editor-tag-remove]"), null);
    assert.equal(blocked.querySelector("[data-entity-editor-tag-popover]"), null);
    assert.equal(blocked.querySelector("[data-entity-editor-tags-toggle]").textContent, "标签已移除");
  }
});
