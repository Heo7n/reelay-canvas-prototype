import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("../src/legacy-canvas/canvas-asset-library-view.js", import.meta.url),
  "utf8",
);
const context = vm.createContext({});
new vm.Script(source, { filename: "canvas-asset-library-view.js" }).runInContext(context);
const view = context.REELAY_CANVAS_ASSET_LIBRARY_VIEW;

test("registers the complete frozen canvas asset-library view API", () => {
  assert.ok(Object.isFrozen(view));
  assert.deepEqual(
    Object.keys(view).sort(),
    [
      "renderCommandBar",
      "renderDirectoryTree",
      "renderEmptyState",
      "renderEntityCard",
      "renderFolderCard",
      "renderMediaCard",
      "renderMovePopover",
    ],
  );
  for (const renderer of Object.values(view)) assert.equal(typeof renderer, "function");
});

test("media browse command bar exposes upload, multi-select, filter, and view controls", () => {
  const markup = view.renderCommandBar({
    mutable: true,
    space: "personal",
    section: "media",
    filter: "all",
    display: "grid",
  });

  assert.match(markup, /data-library-commandbar="media"/);
  assert.match(markup, /data-library-upload="true"/);
  assert.match(markup, />上传</);
  assert.match(markup, /data-library-selection-toggle="true"/);
  assert.match(markup, /data-library-filter-toggle="true"/);
  assert.match(markup, /data-library-display="list"/);
  assert.match(markup, /data-library-current-display="grid"/);
  assert.match(markup, /aria-label="切换到列表视图"/);
  assert.match(markup, /data-library-display="list" data-library-current-display="grid">\s*<i data-lucide="grid-2x2"/);
  assert.equal(markup.match(/data-library-display=/g)?.length, 1);
  assert.doesNotMatch(markup, /data-library-create-entity/);
  assert.doesNotMatch(markup, /data-library-batch-action/);
});

test("entity browse command bar creates subjects without media-kind filters", () => {
  const markup = view.renderCommandBar({
    mutable: true,
    space: "personal",
    section: "entities",
    filter: "video",
    display: "grid",
  });

  assert.match(markup, /data-library-commandbar="entity"/);
  assert.match(markup, /data-library-create-entity="true"/);
  assert.match(markup, />创建主体</);
  assert.match(markup, /data-library-active-filter="all"/);
  assert.match(markup, /data-library-selection-toggle="true"/);
  assert.match(markup, /data-library-display="list"/);
  assert.match(markup, /data-library-current-display="grid"/);
  assert.equal(markup.match(/data-library-display=/g)?.length, 1);
  assert.doesNotMatch(markup, /data-library-upload/);
  assert.doesNotMatch(markup, /data-library-filter-toggle/);
  assert.doesNotMatch(markup, /data-library-filter="(?:image|video|audio)"/);
});

test("selection command bar shows count, select-all, filter, views, and personal batch actions", () => {
  const markup = view.renderCommandBar({
    mutable: true,
    space: "personal",
    section: "media",
    selectionMode: true,
    selectedCount: 3.8,
    filter: "image",
    display: "list",
    menu: "batch",
  });

  assert.match(markup, /<span>操作<\/span>/);
  assert.match(markup, /asset-library-primary-command asset-library-batch-command/);
  assert.match(
    markup,
    /data-library-batch-toggle="true"[^>]*>\s*<i data-lucide="list-checks"[^>]*><\/i>\s*<span>操作<\/span>\s*<\/button>/,
  );
  assert.match(markup, /aria-label="操作，已选 3 项"/);
  assert.doesNotMatch(markup, /操作 ·/);
  assert.match(markup, /data-library-batch-toggle="true"/);
  assert.match(markup, /aria-expanded="true"/);
  assert.match(markup, /data-library-select-all="true">\s*<i data-lucide="square"[^>]*><\/i>\s*<span>全选<\/span>/);
  assert.match(markup, /data-library-selection-cancel="true"/);
  assert.match(markup, /data-lucide="x"[^>]*><\/i>\s*<span>取消<\/span>/);
  assert.match(markup, /data-library-filter-toggle="true"/);
  assert.match(markup, /data-library-display="grid"/);
  assert.match(markup, /data-library-current-display="list"/);
  assert.match(markup, /aria-label="切换到网格视图"/);
  assert.match(markup, /data-library-display="grid" data-library-current-display="list">\s*<i data-lucide="list"/);
  assert.equal(markup.match(/data-library-display=/g)?.length, 1);
  assert.match(markup, /data-library-batch-action="review"/);
  assert.match(markup, /data-library-batch-action="move"/);
  assert.match(markup, /data-library-batch-action="share-organization"/);
  assert.match(markup, /data-library-batch-action="delete"/);
  assert.match(markup, /asset-library-toolbar-menu batch/);
  assert.match(markup, /data-library-batch-action="review">\s*<span>批量提交审核<\/span>/);
  assert.match(markup, /data-library-batch-action="move">\s*<span>批量移动<\/span>/);
  assert.match(markup, /data-library-batch-action="share-organization">\s*<span>复制到组织空间<\/span>/);
  assert.match(markup, /data-library-batch-action="delete">\s*<span>批量删除<\/span>/);
  assert.doesNotMatch(markup, /data-library-upload/);
  assert.doesNotMatch(markup, /data-library-selection-toggle/);

  const selectAllIndex = markup.indexOf('data-library-select-all="true"');
  const cancelIndex = markup.indexOf('data-library-selection-cancel="true"');
  const filterIndex = markup.indexOf('data-library-filter-toggle="true"');
  const displayIndex = markup.indexOf('data-library-display="grid"');
  assert.ok(selectAllIndex < cancelIndex && cancelIndex < filterIndex && filterIndex < displayIndex);
});

test("selection command bar disables batch actions until at least one item is selected", () => {
  const markup = view.renderCommandBar({
    mutable: true,
    space: "personal",
    section: "media",
    selectionMode: true,
    selectedCount: 0,
    menu: "batch",
  });

  assert.match(markup, /aria-label="操作，尚未选择资产"/);
  assert.match(markup, /data-library-batch-toggle="true" disabled aria-disabled="true"/);
  assert.match(markup, /aria-expanded="false"/);
  assert.doesNotMatch(markup, /asset-library-toolbar-menu batch/);
});

test("organization batch actions omit sharing to organization", () => {
  const markup = view.renderCommandBar({
    mutable: true,
    space: "organization",
    section: "entity",
    selectionMode: true,
    selectedCount: 2,
    menu: "batch",
  });

  assert.match(markup, /data-library-batch-action="review"/);
  assert.match(markup, /data-library-batch-action="move"/);
  assert.match(markup, /data-library-batch-action="delete"/);
  assert.match(markup, /data-library-selection-cancel="true"/);
  assert.doesNotMatch(markup, /share-organization/);
  assert.doesNotMatch(markup, /复制到组织空间/);
  assert.doesNotMatch(markup, /data-library-filter-toggle/);
});

test("platform command bar remains read-only even when mutable is requested", () => {
  const mediaMarkup = view.renderCommandBar({
    mutable: true,
    space: "platform",
    section: "media",
    selectionMode: true,
    menu: "batch",
  });
  const entityMarkup = view.renderCommandBar({
    mutable: true,
    space: "official",
    section: "entity",
  });

  for (const markup of [mediaMarkup, entityMarkup]) {
    assert.match(markup, /asset-library-readonly-command/);
    assert.match(markup, />仅可查看</);
    assert.doesNotMatch(markup, /data-library-upload/);
    assert.doesNotMatch(markup, /data-library-create-entity/);
    assert.doesNotMatch(markup, /data-library-selection-toggle/);
    assert.doesNotMatch(markup, /data-library-selection-cancel/);
    assert.doesNotMatch(markup, /data-library-select-all/);
    assert.doesNotMatch(markup, /data-library-batch/);
  }
  assert.match(mediaMarkup, /data-library-filter-toggle="true"/);
  assert.match(mediaMarkup, /data-library-display="list"/);
  assert.equal(mediaMarkup.match(/data-library-display=/g)?.length, 1);
  assert.doesNotMatch(entityMarkup, /data-library-filter-toggle/);
});

test("command bar renders active filter, display, and filter-menu semantics", () => {
  const markup = view.renderCommandBar({
    mutable: true,
    section: "media",
    filter: "audio",
    display: "list",
    menu: "filter",
  });

  assert.match(markup, /data-library-active-filter="audio"/);
  assert.match(markup, /data-library-active-display="list"/);
  assert.match(markup, /data-library-open-menu="filter"/);
  assert.match(markup, /aria-label="筛选素材类型"/);
  assert.match(markup, /aria-expanded="true"/);
  assert.match(markup, /class="active" type="button" role="menuitemradio" aria-checked="true" data-library-filter="audio"/);
  assert.match(markup, /aria-label="切换到网格视图" data-library-display="grid" data-library-current-display="list"/);
  assert.equal(markup.match(/data-library-display=/g)?.length, 1);
});

test("folder cards expose open and rename hooks while escaping identifiers and names", () => {
  const folder = {
    id: 'folder"&<',
    name: '<设计 & "灵感">',
    kind: 'media"<',
    space: "personal",
  };
  const normal = view.renderFolderCard({ folder });
  const renaming = view.renderFolderCard({ folder, renaming: true });

  assert.match(normal, /data-library-folder="folder&quot;&amp;&lt;"/);
  assert.match(normal, /data-library-folder-open="folder&quot;&amp;&lt;"/);
  assert.match(normal, /data-library-menu-toggle="folder&quot;&amp;&lt;"/);
  assert.match(normal, /data-lucide="ellipsis-vertical"/);
  assert.match(normal, /data-library-item-kind="media&quot;&lt;"/);
  assert.match(normal, /&lt;设计 &amp; &quot;灵感&quot;&gt;/);
  assert.doesNotMatch(normal, /<设计/);
  assert.match(normal, /asset-library-card-namebar" data-library-rename="folder&quot;&amp;&lt;" data-library-item-kind="folder"/);
  assert.match(normal, /tabindex="0" aria-label="名称 &lt;设计 &amp; &quot;灵感&quot;&gt;，按 Enter 或 F2 重命名"/);
  assert.match(renaming, /class="asset-library-card asset-library-folder-card renaming"/);
  assert.match(renaming, /data-library-rename="folder&quot;&amp;&lt;"/);
  assert.match(renaming, /data-library-rename-input="folder&quot;&amp;&lt;"/);
  assert.match(renaming, /value="&lt;设计 &amp; &quot;灵感&quot;&gt;"/);
  assert.doesNotMatch(renaming, /tabindex="0"/);

  const platform = view.renderFolderCard({ folder: { ...folder, space: "platform" }, renaming: true });
  assert.match(platform, /readonly/);
  assert.doesNotMatch(platform, /data-library-rename/);
  assert.doesNotMatch(platform, /data-library-menu-toggle/);
});

test("directory tree keeps five nested levels readable and marks the current folder", () => {
  const folders = [
    { id: "one", name: "一级", parentId: null },
    { id: "two", name: "二级", parentId: "one" },
    { id: "three", name: "三级", parentId: "two" },
    { id: "four", name: '<四级 & "终点">', parentId: "three" },
  ];
  const markup = view.renderDirectoryTree({
    folders,
    currentFolderId: "four",
    rootExpanded: true,
    expandedFolderIds: ["one", "two", "three"],
  });

  assert.match(markup, /role="tree" aria-label="目录"/);
  assert.match(markup, /data-library-directory-select="" title="默认目录"/);
  assert.match(markup, /data-library-directory-root-toggle="true"/);
  assert.match(markup, /data-library-directory-toggle="one"/);
  assert.match(markup, /aria-level="5" aria-selected="true" style="--asset-directory-level:5"/);
  assert.match(markup, /data-library-directory-select="four" title="默认目录 \/ 一级 \/ 二级 \/ 三级 \/ &lt;四级 &amp; &quot;终点&quot;&gt;"/);
  assert.match(markup, /asset-library-directory-check[^]*data-lucide="check"/);
  assert.doesNotMatch(markup, /<四级/);
});

test("personal media cards expose selected, menu, rename, and all single-item actions", () => {
  const base = {
    media: { id: "media-1", name: "镜头 A", mediaKind: "video" },
    mutable: true,
    space: "personal",
    selected: true,
    selectionMode: true,
    menuOpen: true,
    meta: "视频 · 00:12",
  };
  const markup = view.renderMediaCard(base);
  const renaming = view.renderMediaCard({ ...base, menuOpen: false, renaming: true });
  const unselected = view.renderMediaCard({ ...base, selected: false, menuOpen: false });

  assert.match(markup, /asset-library-media-card selected selection-mode menu-open/);
  assert.match(markup, /draggable="true"/);
  assert.match(markup, /data-library-media="media-1"/);
  assert.match(markup, /data-library-media-kind="video"/);
  assert.match(markup, /asset-library-card-namebar" data-library-rename="media-1" data-library-item-kind="media"/);
  assert.match(markup, /tabindex="0" aria-label="名称 镜头 A，按 Enter 或 F2 重命名"/);
  assert.match(markup, /data-library-select="media-1"/);
  assert.match(markup, /aria-pressed="true"/);
  assert.match(markup, /data-library-select="media-1"[^]*data-lucide="check"/);
  assert.match(unselected, /data-library-select="media-1"[^>]*>\s*<\/button>/);
  assert.doesNotMatch(unselected, /data-lucide="plus"/);
  assert.doesNotMatch(unselected, /data-lucide="square"/);
  assert.match(markup, /data-library-menu-toggle="media-1"/);
  assert.match(markup, /data-lucide="ellipsis-vertical"/);
  for (const action of ["rename", "review", "move", "share-organization", "delete"]) {
    assert.match(markup, new RegExp(`data-library-menu-item="${action}"`));
  }
  assert.match(markup, /提交 Seedance 合规审核/);
  assert.match(markup, /共享到组织空间/);
  assert.match(markup, /视频 · 00:12/);
  assert.match(renaming, /data-library-rename-input="media-1"/);
  assert.match(renaming, /value="镜头 A"/);
  assert.doesNotMatch(renaming, /tabindex="0"/);

  const audioMenu = view.renderMediaCard({
    ...base,
    media: { id: "audio-1", name: "旁白", mediaKind: "audio" },
  });
  assert.doesNotMatch(audioMenu, /data-library-menu-item="review"/);
  assert.doesNotMatch(audioMenu, /提交 Seedance 合规审核/);
  assert.match(audioMenu, /data-library-menu-item="move"/);
});

test("media cards build previews only from structured safe media fields", () => {
  const image = view.renderMediaCard({
    media: {
      id: "image-1",
      mediaKind: "image",
      url: "https://cdn.example/full.jpg?x=1&y=2",
      thumbnailUrl: "https://cdn.example/thumb.webp",
    },
    previewHtml: '<img src="javascript:alert(1)" data-raw-preview="true">',
    mutable: true,
  });
  const video = view.renderMediaCard({
    media: {
      id: "video-1",
      mediaKind: "video",
      url: "blob:https://reelay.example/video-1",
      thumbnailUrl: "/thumbs/video-1.jpg?x=1&y=2",
    },
    mutable: true,
  });
  const audio = view.renderMediaCard({
    media: { id: "audio-1", mediaKind: "audio", url: "https://cdn.example/voice.mp3" },
    mutable: true,
  });
  const rejected = view.renderMediaCard({
    media: { id: "unsafe", mediaKind: "image", url: "javascript:alert(1)" },
    mutable: true,
  });
  const obfuscated = view.renderMediaCard({
    media: { id: "unsafe-control", mediaKind: "video", url: "java\nscript:alert(1)" },
    mutable: true,
  });

  assert.match(image, /draggable="true"/);
  assert.match(image, /<img src="https:\/\/cdn\.example\/thumb\.webp"/);
  assert.doesNotMatch(image, /data-raw-preview/);
  assert.match(video, /<video src="blob:https:\/\/reelay\.example\/video-1" poster="\/thumbs\/video-1\.jpg\?x=1&amp;y=2"/);
  assert.match(video, /class="video-play"/);
  assert.match(audio, /class="audio-wave"/);
  assert.doesNotMatch(audio, /<audio/);
  assert.doesNotMatch(rejected, /javascript:/);
  assert.match(rejected, /data-lucide="image"/);
  assert.doesNotMatch(obfuscated, /java\nscript/);
  assert.doesNotMatch(obfuscated, /<video/);
});

test("organization single-item menus omit sharing and platform cards hide mutation controls", () => {
  const organization = view.renderMediaCard({
    media: { id: "org-media", name: "组织素材" },
    mutable: true,
    space: "organization",
    menuOpen: true,
  });
  const platform = view.renderMediaCard({
    media: { id: "platform-media", name: "平台素材", space: "platform" },
    mutable: true,
    selectionMode: true,
    selected: true,
    menuOpen: true,
    renaming: true,
  });

  assert.match(organization, /data-library-menu-item="rename"/);
  assert.match(organization, /data-library-menu-item="review"/);
  assert.match(organization, /data-library-menu-item="move"/);
  assert.match(organization, /data-library-menu-item="delete"/);
  assert.doesNotMatch(organization, /share-organization/);
  assert.doesNotMatch(organization, /共享到组织空间/);

  assert.match(platform, /asset-library-media-card readonly/);
  assert.doesNotMatch(platform, /data-library-menu-toggle/);
  assert.doesNotMatch(platform, /data-library-menu-item/);
  assert.doesNotMatch(platform, /data-library-select/);
  assert.doesNotMatch(platform, /data-library-rename/);
});

test("entity cards render escaped collage previews, counts, metadata, and item actions", () => {
  const markup = view.renderEntityCard({
    entity: { id: "entity-1", name: "主角" },
    name: "主角主体",
    mediaPreviews: [
      { mediaKind: "image", url: "https://cdn.example/portrait.jpg" },
      {
        mediaKind: "video",
        url: "https://cdn.example/action.mp4",
        thumbnailUrl: "https://cdn.example/action.jpg",
      },
      { mediaKind: "audio", url: "https://cdn.example/voice.mp3" },
      { mediaKind: "image", thumbnailUrl: "https://cdn.example/reference.webp" },
      { mediaKind: "image", url: "https://cdn.example/not-rendered.jpg" },
    ],
    mediaCount: 5,
    meta: "5 个素材 · 刚刚更新",
    selected: true,
    selectionMode: true,
    menuOpen: true,
    mutable: true,
    space: "personal",
  });

  assert.match(markup, /asset-library-entity-card selected selection-mode menu-open/);
  assert.match(markup, /data-library-entity="entity-1"/);
  assert.match(markup, /data-library-preview="entity-1"/);
  assert.match(markup, /asset-library-entity-collage/);
  assert.match(markup, /<img src="https:\/\/cdn\.example\/portrait\.jpg"/);
  assert.match(markup, /<video src="https:\/\/cdn\.example\/action\.mp4" poster="https:\/\/cdn\.example\/action\.jpg"/);
  assert.match(markup, /class="audio-wave"/);
  assert.match(markup, /<img src="https:\/\/cdn\.example\/reference\.webp"/);
  assert.doesNotMatch(markup, /not-rendered/);
  assert.match(markup, />5 个素材</);
  assert.match(markup, /5 个素材 · 刚刚更新/);
  assert.match(markup, /asset-library-card-namebar" data-library-rename="entity-1" data-library-item-kind="entity"/);
  assert.match(markup, /data-library-select="entity-1"/);
  assert.match(markup, /data-library-menu-item="share-organization"/);
});

test("card renderers escape every user-controlled HTML and attribute value", () => {
  const payload = '<img src=x onerror="alert(1)">&\'boom';
  const rawPreview = '<strong data-raw-preview="true">raw</strong>';
  const mediaMarkup = view.renderMediaCard({
    media: {
      id: payload,
      name: payload,
      mediaKind: "image",
      url: "javascript:alert(1)",
      thumbnailUrl: '\"><img src=x onerror="alert(2)">',
    },
    name: payload,
    previewHtml: rawPreview,
    meta: payload,
    mutable: true,
    space: "personal",
    menuOpen: true,
    renaming: true,
  });
  const entityMarkup = view.renderEntityCard({
    entity: { id: payload, name: payload },
    mediaPreviews: [
      rawPreview,
      { previewHtml: rawPreview },
      { mediaKind: "image", url: "javascript:alert(3)" },
      { mediaKind: "image", url: "https://cdn.example/safe.jpg?x=1&y=2" },
    ],
    mediaCount: payload,
    meta: payload,
    mutable: true,
    space: "personal",
  });

  for (const markup of [mediaMarkup, entityMarkup]) {
    assert.doesNotMatch(markup, /<img src=x/);
    assert.doesNotMatch(markup, /id="<img/);
    assert.doesNotMatch(markup, /data-raw-preview/);
    assert.doesNotMatch(markup, /javascript:/);
    assert.match(markup, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;&amp;&#39;boom/);
  }
  assert.match(entityMarkup, /src="https:\/\/cdn\.example\/safe\.jpg\?x=1&amp;y=2"/);
  assert.match(mediaMarkup, /data-library-media="&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;&amp;&#39;boom"/);
  assert.match(mediaMarkup, /data-library-rename-input="&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;&amp;&#39;boom"/);
  assert.match(entityMarkup, /data-library-entity="&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;&amp;&#39;boom"/);
});

test("invalid command values are normalized rather than injected", () => {
  const payload = '<svg onload="alert(1)">';
  const markup = view.renderCommandBar({
    mutable: true,
    space: payload,
    section: payload,
    filter: payload,
    display: payload,
    menu: payload,
    selectedCount: payload,
  });

  assert.doesNotMatch(markup, /<svg/);
  assert.match(markup, /data-library-space="personal"/);
  assert.match(markup, /data-library-commandbar="media"/);
  assert.match(markup, /data-library-active-filter="all"/);
  assert.match(markup, /data-library-active-display="grid"/);
  assert.match(markup, /data-library-open-menu=""/);
});

test("empty states distinguish search, mutable media, mutable entities, and read-only spaces", () => {
  const search = view.renderEmptyState({
    section: "media",
    hasQuery: true,
    mutable: false,
    space: "platform",
  });
  const media = view.renderEmptyState({ section: "media", mutable: true, space: "personal" });
  const entity = view.renderEmptyState({ section: "entity", mutable: true, space: "organization" });
  const readOnly = view.renderEmptyState({ section: "entity", mutable: true, space: "platform" });

  assert.match(search, /没有匹配结果/);
  assert.match(search, /data-library-clear-query="true"/);
  assert.match(search, /data-library-clear-filter="true"/);
  assert.doesNotMatch(search, /data-library-upload/);
  assert.match(media, /还没有素材/);
  assert.match(media, /data-library-upload="true"/);
  assert.match(entity, /还没有主体/);
  assert.match(entity, /data-library-create-entity="true"/);
  assert.match(readOnly, /暂无可用主体/);
  assert.doesNotMatch(readOnly, /data-library-create-entity/);
});

test("move popover renders default/current destinations, escapes folders, and keeps close control", () => {
  const markup = view.renderMovePopover({
    space: "organization",
    currentFolderId: "folder-2",
    folders: [
      { id: 'folder"<', name: '<脚本 & "镜头">' },
      { id: "folder-2", name: "参考" },
    ],
  });
  const empty = view.renderMovePopover({ folders: [], space: "personal", currentFolderId: "" });
  const platform = view.renderMovePopover({ folders: [{ id: "nope", name: "不可移动" }], space: "platform" });
  const immutable = view.renderMovePopover({ folders: [{ id: "nope", name: "不可移动" }], mutable: false });

  assert.match(markup, /data-library-move-popover="true"/);
  assert.match(markup, /data-library-space="organization"/);
  assert.match(markup, /data-library-move-close="true"/);
  assert.match(markup, /data-library-move-target=""[^>]*>[^]*?<span>默认目录<\/span>/);
  assert.match(markup, /data-library-move-target="folder&quot;&lt;"/);
  assert.match(markup, /&lt;脚本 &amp; &quot;镜头&quot;&gt;/);
  assert.doesNotMatch(markup, /<脚本/);
  assert.match(markup, /class="current"[^>]+data-library-move-target="folder-2"[^>]*disabled aria-disabled="true" aria-current="true"/);
  assert.match(empty, /data-library-move-target=""[^>]*disabled aria-disabled="true" aria-current="true"/);
  assert.match(empty, /暂无其他文件夹/);
  assert.equal(empty.match(/data-library-move-target=/g)?.length, 1);
  assert.equal(platform, "");
  assert.equal(immutable, "");
});
