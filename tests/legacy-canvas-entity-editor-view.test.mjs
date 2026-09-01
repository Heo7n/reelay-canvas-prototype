import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../src/legacy-canvas/canvas-entity-editor-view.js", import.meta.url), "utf8");
const context = vm.createContext({});
new vm.Script(source, { filename: "canvas-entity-editor-view.js" }).runInContext(context);
const view = context.REELAY_CANVAS_ENTITY_EDITOR_VIEW;

const media = [
  { id: "portrait", name: "角色人像.png", mediaKind: "image", thumbnailUrl: "https://cdn.example/portrait.webp", width: 900, height: 1200, aspectRatio: 3 / 4 },
  { id: "action", name: "动作参考.mp4", mediaKind: "video", url: "https://cdn.example/action.mp4", thumbnailUrl: "https://cdn.example/action.webp", width: 1920, height: 1080 },
  { id: "voice", name: "角色台词.mp3", mediaKind: "audio", url: "https://cdn.example/voice.mp3" },
];

test("registers the frozen DOM-free Entity editor view API", () => {
  assert.ok(Object.isFrozen(view));
  assert.deepEqual(Object.keys(view).sort(), ["renderEditor", "renderMediaPicker", "renderSelection", "renderStage"]);
  for (const renderer of Object.values(view)) assert.equal(typeof renderer, "function");
});

test("renders the compact create form, selected cards, commands, and independent preview stage", () => {
  const markup = view.renderEditor({
    draft: {
      mode: "create",
      name: "主角",
      description: "稳定的主角设定",
      mediaRefs: [{ mediaId: "portrait" }, { mediaId: "voice" }, { mediaId: "portrait" }],
      activeMediaId: "voice",
      coverMediaId: "portrait",
      mediaKind: "all",
      space: "personal",
    },
    media,
  });

  assert.match(markup, /^\s*<form class="asset-entity-editor-form"/);
  assert.match(markup, /<\/form>\s*<section class="asset-entity-editor-stage"/);
  assert.doesNotMatch(markup, /class="asset-entity-editor"/);
  assert.doesNotMatch(markup, /id="assetEntityEditorContent"/);
  assert.match(markup, /<button[^>]*data-entity-editor-close="true"[^>]*>[\s\S]*?<h2 id="asset-entity-editor-title"[^>]*>新建主体<\/h2>/);
  assert.match(markup, /value="主角"[^>]*data-entity-editor-name="true"/);
  assert.match(markup, /data-entity-editor-description="true">稳定的主角设定<\/textarea>/);
  assert.match(markup, /id="asset-entity-media-title">添加素材<\/h3>/);
  assert.match(markup, /data-entity-editor-media-filter="all"[^>]*>[\s\S]*?<small>\(2\)<\/small>/);
  assert.equal(markup.match(/data-entity-editor-selected-media=/g)?.length, 2);
  assert.ok(markup.indexOf('data-entity-editor-selected-media="portrait"') < markup.indexOf('data-entity-editor-selected-media="voice"'));
  assert.match(markup, /data-entity-editor-open-library="true"[^>]*>[^]*?从素材库添加/);
  assert.match(markup, /data-entity-editor-upload="true"[^>]*>[^]*?上传/);
  assert.match(markup, /class="asset-entity-editor-stage"/);
  assert.match(markup, /data-entity-editor-stage-media="voice"/);
  assert.match(markup, /data-media-kind="audio"/);
  assert.match(markup, /<audio src="https:\/\/cdn\.example\/voice\.mp3" controls/);
  assert.doesNotMatch(markup, /data-entity-editor-cover-media/);
  assert.match(markup, /data-entity-editor-submit="true">\s*<span>完成<\/span>/);
  assert.doesNotMatch(markup, /data-entity-editor-submit="true" disabled/);
});

test("uses the Entity name as the edit title and only exposes the cover action for images", () => {
  const markup = view.renderEditor({
    draft: {
      mode: "edit",
      entityId: "hero",
      name: "主角主体",
      mediaRefs: [{ mediaId: "portrait" }, { mediaId: "action" }],
      activeMediaId: "action",
      coverMediaId: "portrait",
    },
    media,
  });

  assert.match(markup, /data-entity-editor-mode="edit" data-entity-editor-id="hero"/);
  assert.match(markup, /<h2 id="asset-entity-editor-title"[^>]*>主角主体<\/h2>/);
  assert.doesNotMatch(markup, />编辑主体<\/h2>/);
  assert.match(markup, /data-entity-editor-active-media="action"/);
  assert.match(markup, /data-media-kind="video" style="--entity-preview-ratio:1\.7778;--entity-preview-inline-cap:1320\.0px;--entity-preview-block-bound:177\.8cqh"/);
  assert.doesNotMatch(markup, /data-entity-editor-cover-media/);
  assert.match(markup, /data-entity-editor-remove-media="portrait"/);
  assert.match(markup, /data-entity-editor-cancel="true"/);
  assert.match(markup, /data-entity-editor-submit="true">\s*<span>完成<\/span>/);

  const imageStage = view.renderStage({
    draft: {
      mediaRefs: [{ mediaId: "portrait" }, { mediaId: "voice" }],
      activeMediaId: "portrait",
      coverMediaId: "portrait",
    },
    media,
  });
  assert.match(imageStage, /data-entity-editor-cover-media="portrait"/);
  assert.match(imageStage, /data-media-kind="image" style="--entity-preview-ratio:0\.7500;--entity-preview-inline-cap:645\.0px;--entity-preview-block-bound:75\.0cqh"/);
  assert.match(imageStage, /data-entity-editor-stage-meta="true"><span>1 \/ 2<\/span><span>900 × 1200<\/span>/);
  assert.match(imageStage, />当前封面<\/span>/);

  const unknownStage = view.renderStage({
    draft: { mediaRefs: [{ mediaId: "unknown" }], activeMediaId: "unknown" },
    media: [{ id: "unknown", url: "https://cdn.example/unknown.bin" }],
  });
  assert.doesNotMatch(unknownStage, /data-entity-editor-cover-media/);

  const unnamed = view.renderEditor({
    draft: { mode: "edit", entityId: "empty", name: " ", mediaRefs: [] },
    media,
  });
  assert.match(unnamed, /<h2 id="asset-entity-editor-title"[^>]*>未命名主体<\/h2>/);
});

test("partial selection and stage renderers preserve order, filters, and invalid references", () => {
  const selection = view.renderSelection({
    draft: {
      mediaRefs: [{ mediaId: "portrait" }, { mediaId: "voice" }],
      activeMediaId: "portrait",
      coverMediaId: "portrait",
      mediaKind: "audio",
    },
    media,
  });
  const missingStage = view.renderStage({
    draft: { mediaRefs: [{ mediaId: "missing" }], activeMediaId: "missing", coverMediaId: "missing" },
    media,
  });

  assert.match(selection, /data-entity-editor-media-filter="audio"/);
  assert.equal(selection.match(/data-entity-editor-selected-media=/g)?.length, 1);
  assert.match(selection, /data-entity-editor-selected-media="voice"/);
  assert.match(selection, /data-cover="false"/);
  assert.match(missingStage, /data-entity-editor-stage-empty="true"/);
  assert.doesNotMatch(missingStage, /data-entity-editor-cover-media/);
});

test("renders a separate searchable picker from the model filter result", () => {
  const markup = view.renderMediaPicker({
    draft: {
      query: "角色",
      mediaKind: "image",
      mediaRefs: [{ mediaId: "portrait" }],
    },
    media,
    results: { items: [media[0], media[1]], counts: { all: 3, image: 1, video: 1, audio: 1 } },
    selectedIds: ["action"],
  });

  assert.match(markup, /class="asset-entity-picker-backdrop"/);
  assert.match(markup, /class="asset-entity-picker" role="dialog"/);
  assert.match(markup, /value="角色"[^>]*data-entity-editor-search="true"/);
  assert.match(markup, /data-entity-editor-clear-search="true"/);
  assert.match(markup, /data-entity-editor-picker-filter="image"/);
  assert.equal(markup.match(/data-entity-editor-picker-media=/g)?.length, 2);
  assert.match(markup, /data-entity-editor-toggle-picker-media="portrait" disabled aria-disabled="true"/);
  assert.match(markup, /data-entity-editor-toggle-picker-media="portrait"[^]*?asset-entity-picker-check[^]*?data-lucide="check"/);
  assert.match(markup, /aria-label="取消选择 动作参考\.mp4" aria-pressed="true" data-entity-editor-toggle-picker-media="action">/);
  assert.match(markup, /data-entity-editor-toggle-picker-media="action"[^]*?asset-entity-picker-check[^]*?data-lucide="check"/);
  assert.match(markup, /data-entity-editor-picker-count="true">本次已选 1 项/);
  assert.match(markup, /data-entity-editor-picker-close="true"/);
  assert.match(markup, /data-entity-editor-picker-cancel="true"/);
  assert.match(markup, /data-entity-editor-picker-done="true"/);
  assert.equal(view.renderMediaPicker({ visible: false }), "");
});

test("busy, read-only, validation, and empty states fail closed", () => {
  const busy = view.renderEditor({
    draft: { mode: "edit", name: "主角", mediaRefs: [{ mediaId: "portrait" }], coverMediaId: "portrait" },
    media,
    busy: true,
  });
  const invalid = view.renderEditor({
    draft: { mode: "create", space: "platform", name: "", mediaRefs: [{ mediaId: "missing" }], coverMediaId: "outside" },
    media,
    validation: { valid: false, errors: [{ message: "保存前请修正主体信息" }] },
  });
  const empty = view.renderSelection({ draft: { mediaRefs: [] }, media });
  const pristine = view.renderEditor({
    draft: { mode: "create", name: "", mediaRefs: [] },
    media,
    showValidation: false,
  });

  assert.match(busy, /aria-busy="true"/);
  assert.match(busy, /data-entity-editor-submit="true" disabled aria-disabled="true"/);
  assert.match(busy, /保存中/);
  assert.match(invalid, /asset-entity-editor-form readonly/);
  assert.doesNotMatch(invalid, /当前空间只读|封面必须来自主体素材|当前空间不可用的素材|保存前请修正主体信息/);
  assert.doesNotMatch(invalid, /data-entity-editor-submit/);
  assert.match(invalid, /data-entity-editor-cancel="true">关闭<\/button>/);
  assert.match(empty, /data-entity-editor-selection-empty="true"/);
  assert.doesNotMatch(pristine, /role="alert"/);
  assert.match(pristine, /data-entity-editor-submit="true" disabled aria-disabled="true"/);
});

test("escapes fields, identifiers, validation, and unsafe structured media URLs", () => {
  const payload = '<img src=x onerror="alert(1)">&\'boom';
  const markup = view.renderEditor({
    draft: {
      mode: "edit",
      entityId: payload,
      name: payload,
      description: `${payload}</textarea>`,
      mediaRefs: [{ mediaId: payload }],
      activeMediaId: payload,
      coverMediaId: payload,
    },
    media: [{ id: payload, name: payload, mediaKind: "image", url: "javascript:alert(2)" }],
    validation: { errors: [payload] },
  });

  assert.doesNotMatch(markup, /<img src=x/);
  assert.doesNotMatch(markup, /javascript:/);
  assert.doesNotMatch(markup, /<\/textarea><img/);
  assert.match(markup, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;&amp;&#39;boom/);
  assert.match(markup, /data-entity-editor-id="&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;&amp;&#39;boom"/);
  assert.match(markup, /data-lucide="image"/);
});
