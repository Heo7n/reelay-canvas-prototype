import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../src/legacy-canvas/canvas-entity-use-view.js", import.meta.url), "utf8");
const entityUseCss = await readFile(new URL("../styles/canvas-entity-use.css", import.meta.url), "utf8");
const context = vm.createContext({});
new vm.Script(source, { filename: "canvas-entity-use-view.js" }).runInContext(context);
const view = context.REELAY_CANVAS_ENTITY_USE_VIEW;

const media = [
  { id: "wide", name: "远景.png", mediaKind: "image", thumbnailUrl: "https://cdn.example/wide.webp" },
  { id: "portrait", name: "角色近景.png", mediaKind: "image", url: "https://cdn.example/portrait.png" },
  { id: "motion", name: "动作.mp4", mediaKind: "video", url: "https://cdn.example/motion.mp4", thumbnailUrl: "https://cdn.example/motion.webp" },
  { id: "voice", name: "对白.mp3", mediaKind: "audio", url: "https://cdn.example/voice.mp3" },
  { id: "detail", name: "装备.png", mediaKind: "image", url: "https://cdn.example/detail.png" },
];

test("registers a frozen Entity consumption view and portal synchronization API", () => {
  assert.ok(Object.isFrozen(view));
  assert.deepEqual(Object.keys(view).sort(), [
    "computeDetailPlacement",
    "renderEntityDetail",
    "renderEntityPicker",
    "syncEntityDetailPortal",
    "syncEntityPickerPortal",
  ]);
  for (const helper of Object.values(view)) assert.equal(typeof helper, "function");
});

test("generator Entity entry expands the chip rail only for supported prompt panels", () => {
  assert.match(entityUseCss, /\.generator-node \.entity-drop,\s*\.generator-node \.asset-drop \{/);
  assert.match(entityUseCss, /\.generator-node \.entity-drop \{\s*left: 13px;/);
  assert.match(entityUseCss, /\.generator-node \.asset-drop \{\s*left: 13px;/);
  assert.match(entityUseCss, /\.generator-node \.asset-shelf \{\s*left: 67px;/);
  assert.match(entityUseCss, /\.generator-node \.prompt-panel\.has-entity-entry \.entity-drop \{\s*left: 13px;/);
  assert.match(entityUseCss, /\.generator-node \.prompt-panel\.has-entity-entry \.asset-drop \{\s*left: 67px;/);
  assert.match(entityUseCss, /\.generator-node \.prompt-panel\.has-entity-entry \.asset-shelf \{\s*left: 121px;/);
  assert.match(entityUseCss, /\.generator-node \.entity-entry-glyph \{[^}]*width: 24px;[^}]*height: 24px;/);
  assert.match(entityUseCss, /\.generator-node \.entity-drop:focus-visible,\s*\.generator-node \.asset-drop:focus-visible/);
});

test("renders a cover-led Entity detail with inline metadata and the exact full-width canvas CTA", () => {
  const markup = view.renderEntityDetail({
    entity: {
      id: "courier",
      name: "雾森信使",
      description: "雨林中的稳定角色设定",
      coverMediaId: "portrait",
      media,
    },
    pinned: true,
    placement: { left: 572, top: 174, width: 328, maxHeight: 650, side: "right" },
  });

  assert.match(markup, /class="entity-use-detail is-pinned" role="dialog" aria-modal="false"/);
  assert.match(markup, /data-entity-use-detail="courier" data-entity-use-state="pinned" data-pinned="true" data-placement="right"/);
  assert.match(markup, /style="--entity-use-detail-left:572px;--entity-use-detail-top:174px;--entity-use-detail-width:328px;--entity-use-detail-max-height:650px"/);
  assert.match(markup, /class="entity-use-detail-cover" data-cover-kind="image" data-media-kind="image">\s*<img src="https:\/\/cdn\.example\/portrait\.png"/);
  assert.match(markup, /class="entity-use-detail-title-row">\s*<h2 id="entity-use-detail-title"[^>]*>雾森信使<\/h2>\s*<span class="entity-use-detail-count">5 个素材<\/span>/);
  assert.match(markup, /雨林中的稳定角色设定/);
  assert.match(markup, /data-entity-use-action="add-canvas" data-entity-use-add-canvas="courier"/);
  assert.match(markup, /<span>添加到画布<\/span>/);
  assert.doesNotMatch(markup, /主体详情|entity-use-detail-header|entity-use-detail-thumbnail|data-entity-use-detail-close/);
  assert.doesNotMatch(markup, /data-lucide="plus"/);
  assert.doesNotMatch(markup, /\bautoplay\b|<audio|<video| controls(?:\s|>)/);
});

test("detail preview remains non-interactive until pinned and fails closed without usable media", () => {
  const preview = view.renderEntityDetail({
    entity: { id: "audio-only", name: "声音主体", media: [media[3]] },
  });
  const empty = view.renderEntityDetail({
    entity: { id: "empty", name: "空主体", media: [] },
  });

  assert.match(preview, /data-entity-use-state="preview" data-pinned="false"/);
  assert.match(preview, /data-cover-kind="preview" data-media-kind="audio"/);
  assert.doesNotMatch(preview, /<audio|src="https:\/\/cdn\.example\/voice\.mp3"/);
  assert.match(empty, /data-entity-use-unavailable="add-canvas" disabled aria-disabled="true" title="主体没有可添加的素材"/);
  assert.doesNotMatch(empty, /data-entity-use-action="add-canvas"|data-entity-use-add-canvas=/);
  assert.match(empty, /data-cover-kind="empty" data-media-kind="empty"/);
  assert.match(empty, /class="entity-use-detail-count">0 个素材<\/span>/);
  assert.equal(view.renderEntityDetail({ visible: false }), "");
});

test("detail placement follows each source card edge, stays in the viewport, and avoids Agent space", () => {
  const placement = view.computeDetailPlacement({
    viewportRect: { left: 0, top: 0, width: 1440, height: 900 },
    anchorRect: { left: 382, top: 200, width: 164, height: 164 },
    sourceRect: { left: 382, top: 200, width: 164, height: 164 },
    avoidRects: [{ left: 1000, top: 12, width: 428, height: 876 }],
    panelWidth: 328,
    panelHeight: 446,
  });
  const lowPlacement = view.computeDetailPlacement({
    viewportRect: { left: 0, top: 0, right: 1200, bottom: 720 },
    anchorRect: { left: 380, top: 650, right: 544, bottom: 814 },
    sourceRect: { left: 380, top: 650, right: 544, bottom: 814 },
    panelWidth: 328,
    panelHeight: 360,
  });

  assert.deepEqual({ ...placement }, { left: 556, top: 200, width: 328, maxHeight: 688, side: "right" });
  assert.equal(lowPlacement.left, 554);
  assert.equal(lowPlacement.top, 348);
  assert.equal(lowPlacement.maxHeight, 360);
  assert.equal(lowPlacement.side, "right");
  assert.ok(lowPlacement.left >= 12 && lowPlacement.left + lowPlacement.width <= 1188);
});

test("picker renders personal and organization tabs, search, checkbox multi-selection, and exact labels", () => {
  const entities = [
    {
      id: "courier",
      name: "雾森信使",
      description: "雨林角色",
      space: "personal",
      coverMediaId: "portrait",
      media: media.slice(0, 3),
    },
    {
      id: "probe",
      name: "曜石勘探体",
      description: "深空机械",
      space: "personal",
      media: [media[4]],
    },
    {
      id: "shared",
      name: "共享主体",
      spaces: ["personal", "organization"],
      media: [media[0]],
    },
    {
      id: "team",
      name: "组织主角",
      space: "organization",
      media: [media[0], media[1]],
    },
    { id: "platform", name: "平台主体", space: "platform", media: [media[0]] },
  ];
  const markup = view.renderEntityPicker({
    entities,
    space: "personal",
    query: "信使",
    selectedIds: ["courier", "team", "courier"],
  });

  assert.match(markup, /class="entity-use-picker" role="dialog" aria-modal="true" aria-labelledby="entity-use-picker-title"/);
  assert.match(markup, /<h2 id="entity-use-picker-title">主体库<\/h2>/);
  assert.match(markup, /role="group" aria-label="主体空间"/);
  assert.match(markup, /id="entity-use-space-personal" type="button" aria-label="个人，3 个主体" aria-pressed="true"[^>]*data-entity-use-space="personal">\s*<span>个人<\/span>/);
  assert.match(markup, /id="entity-use-space-organization" type="button" aria-label="组织，2 个主体" aria-pressed="false"[^>]*data-entity-use-space="organization">\s*<span>组织<\/span>/);
  assert.doesNotMatch(markup, /<small>[0-9]+<\/small>/);
  assert.match(markup, /value="信使"[^>]*data-entity-use-search="true"/);
  assert.match(markup, /data-entity-use-search-clear="true"/);
  assert.equal(markup.match(/data-entity-use-picker-card=/g)?.length, 1);
  assert.match(markup, /data-entity-use-picker-card="courier" data-selected="true"/);
  assert.match(markup, /aria-label="取消选择 雾森信使" aria-pressed="true"[^>]*data-entity-use-toggle="courier"/);
  assert.doesNotMatch(markup, /平台主体|data-entity-use-picker-card="team"/);
  assert.match(markup, /data-entity-use-picker-count="true">已选 2 个<\/span>/);
  assert.match(markup, /data-entity-use-picker-cancel="true">取消<\/button>/);
  assert.match(markup, /data-entity-use-picker-add="true" data-entity-use-action="add-entities">\s*<span>添加<\/span>/);
  assert.doesNotMatch(markup, /选择主体|添加主体|确定|参考素材|data-entity-use-picker-close|已选 2 个[^]*<span>添加 ·/);
  assert.doesNotMatch(markup, /\bautoplay\b|<audio|<video| controls(?:\s|>)/);
});

test("picker selection affordance stays at the image top-left with translucent and solid-white states", () => {
  const markup = view.renderEntityPicker({
    entities: [
      { id: "selected", name: "已选择", media: [media[0]] },
      { id: "idle", name: "未选择", media: [media[1]] },
    ],
    selectedIds: ["selected"],
  });

  assert.match(markup, /data-entity-use-picker-card="selected" data-selected="true"[^]*?<span class="entity-use-picker-check" aria-hidden="true"><i data-lucide="check"/);
  assert.match(markup, /data-entity-use-picker-card="idle" data-selected="false"[^]*?<span class="entity-use-picker-check" aria-hidden="true"><\/span>/);
  assert.match(entityUseCss, /\.entity-use-picker-check \{[^}]*top: 7px;[^}]*left: 7px;[^}]*background: rgb\(255 255 255 \/ 34%\);/);
  assert.match(entityUseCss, /\.entity-use-picker-card\.is-selected \.entity-use-picker-check \{[^}]*background: #fff;[^}]*color: #202124;/);
});

test("picker uses a workspace-scale shell with an independently scrolling card region", () => {
  assert.match(entityUseCss, /\.entity-use-picker \{[^}]*width: min\(1460px, calc\(100vw - 48px\)\);[^}]*height: min\(900px, calc\(100vh - 48px\)\);/);
  assert.match(entityUseCss, /grid-template-rows: auto auto minmax\(0, 1fr\) auto;/);
  assert.match(entityUseCss, /\.entity-use-picker-results \{[^}]*overflow-y: auto;[^}]*grid-template-columns: repeat\(auto-fill, 168px\);/);
  assert.match(entityUseCss, /@media \(max-width: 720px\)[^]*\.entity-use-picker \{[^}]*width: calc\(100vw - 24px\);[^}]*height: calc\(100vh - 24px\);/);
});

test("picker resolves ordered Media references, escapes data, and renders useful empty states", () => {
  const payload = '<img src=x onerror="alert(1)">&\'boom';
  const linked = view.renderEntityPicker({
    entities: [{
      id: payload,
      name: payload,
      description: payload,
      mediaRefs: [{ mediaId: "unsafe" }, { mediaId: "wide" }],
    }],
    media: [
      { id: "unsafe", name: payload, mediaKind: "image", url: "javascript:alert(2)" },
      media[0],
    ],
    selectedIds: [payload],
  });
  const empty = view.renderEntityPicker({
    entities: [{ id: "team", name: "组织主角", space: "organization", media: [media[0]] }],
    space: "personal",
    query: "不存在",
  });
  const disabled = view.renderEntityPicker({ entities: [], selectedIds: [] });

  assert.doesNotMatch(linked, /<img src=x|javascript:/);
  assert.match(linked, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;&amp;&#39;boom/);
  assert.match(linked, /data-entity-use-picker-card="&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;&amp;&#39;boom"/);
  assert.match(linked, /data-media-count="2"/);
  assert.doesNotMatch(linked, />2 个素材<\/small>/);
  assert.match(empty, /data-entity-use-picker-empty="true"/);
  assert.match(empty, /没有匹配的主体/);
  assert.match(disabled, /data-entity-use-picker-add="true" data-entity-use-unavailable="add-entities" disabled aria-disabled="true"/);
  assert.doesNotMatch(disabled, /data-entity-use-action="add-entities"/);
  assert.equal(view.renderEntityPicker({ visible: false }), "");
});

test("unavailable and busy picker states expose no executable mutation hooks", () => {
  const unavailable = view.renderEntityPicker({
    entities: [{ id: "courier", name: "雾森信使", media: [media[0]] }],
    selectedIds: ["courier"],
    canAdd: false,
  });
  const busy = view.renderEntityPicker({
    entities: [{ id: "courier", name: "雾森信使", media: [media[0]] }],
    selectedIds: ["courier"],
    busy: true,
  });

  for (const markup of [unavailable, busy]) {
    assert.match(markup, /data-entity-use-unavailable="toggle-entity" disabled aria-disabled="true"/);
    assert.match(markup, /data-entity-use-unavailable="add-entities" disabled aria-disabled="true"/);
    assert.doesNotMatch(markup, /data-entity-use-action="toggle-entity"|data-entity-use-action="add-entities"/);
  }
  assert.match(busy, /id="entity-use-space-personal"[^>]*disabled aria-disabled="true"/);
  assert.match(busy, /data-entity-use-search="true" disabled/);
  assert.doesNotMatch(busy, /data-entity-use-action="change-space"|data-entity-use-action="clear-search"/);
});

test("explicit video covers are accepted as visual covers without embedding autoplay media", () => {
  const markup = view.renderEntityDetail({
    entity: { id: "motion-entity", name: "动态主体", coverMediaId: "motion", media },
  });

  assert.match(markup, /data-cover-kind="video" data-media-kind="video">\s*<img src="https:\/\/cdn\.example\/motion\.webp"/);
  assert.doesNotMatch(markup, /<video|autoplay|src="https:\/\/cdn\.example\/motion\.mp4"/);
});

test("portal helpers synchronize visibility, fixed placement, pinning, and busy state without owning timers", () => {
  function fakePortal() {
    const attributes = new Map();
    const classes = new Set();
    const styles = new Map();
    return {
      attributes,
      classes,
      styles,
      hidden: false,
      inert: false,
      setAttribute(name, value) { attributes.set(name, value); },
      classList: {
        toggle(name, enabled) {
          if (enabled) classes.add(name);
          else classes.delete(name);
        },
      },
      style: {
        setProperty(name, value) { styles.set(name, value); },
        removeProperty(name) { styles.delete(name); },
      },
    };
  }

  const detailPortal = fakePortal();
  const pickerPortal = fakePortal();
  assert.equal(view.syncEntityDetailPortal(detailPortal, {
    visible: true,
    pinned: true,
    placement: { left: 560.4, top: 90.6, width: 328, maxHeight: 600 },
  }), detailPortal);
  assert.equal(detailPortal.hidden, false);
  assert.equal(detailPortal.inert, false);
  assert.equal(detailPortal.attributes.get("aria-hidden"), "false");
  assert.equal(detailPortal.attributes.get("data-entity-use-state"), "pinned");
  assert.ok(detailPortal.classes.has("is-open"));
  assert.ok(detailPortal.classes.has("is-pinned"));
  assert.equal(detailPortal.styles.get("--entity-use-detail-left"), "560px");
  assert.equal(detailPortal.styles.get("--entity-use-detail-top"), "91px");

  view.syncEntityDetailPortal(detailPortal, { visible: false });
  assert.equal(detailPortal.hidden, true);
  assert.equal(detailPortal.inert, true);
  assert.equal(detailPortal.attributes.get("data-entity-use-state"), "hidden");
  assert.equal(detailPortal.styles.size, 0);

  view.syncEntityPickerPortal(pickerPortal, { visible: true, busy: true });
  assert.equal(pickerPortal.attributes.get("data-entity-use-state"), "busy");
  assert.ok(pickerPortal.classes.has("is-open"));
  assert.ok(pickerPortal.classes.has("is-busy"));
  assert.equal(view.syncEntityPickerPortal(null, { visible: true }), null);
});
