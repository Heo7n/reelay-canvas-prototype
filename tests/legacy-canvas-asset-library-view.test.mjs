import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { JSDOM } from "jsdom";

const source = await readFile(
  new URL("../src/legacy-canvas/canvas-asset-library-view.js", import.meta.url),
  "utf8",
);
const context = vm.createContext({});
new vm.Script(await readFile(new URL("../src/legacy-canvas/canvas-file-name.js", import.meta.url), "utf8")).runInContext(context);
new vm.Script(source, { filename: "canvas-asset-library-view.js" }).runInContext(context);
const view = context.REELAY_CANVAS_ASSET_LIBRARY_VIEW;

test("multi-selection removes individual menus from media, groups and folders and restores them on exit", () => {
  const options = { space: "personal", mutable: true, menuOpen: true };
  for (const [render, item, selectable] of [
    [view.renderMediaCard, { media: { id: "m", name: "素材", mediaKind: "image" } }, true],
    [view.renderEntityCard, { entity: { id: "e", name: "素材组" } }, true],
    [view.renderFolderCard, { folder: { id: "f", name: "目录" } }, false],
  ]) {
    for (const selected of [false, true]) {
      const card = JSDOM.fragment(render({ ...options, ...item, selectionMode: true, selected }));
      assert.equal(card.querySelector('[data-library-menu-toggle]'), null);
      assert.equal(card.querySelector('[role="menu"]'), null);
      assert.equal(card.querySelector('.menu-open'), null);
      assert.equal(Boolean(card.querySelector('[data-library-select]')), selectable);
    }
    const restored = JSDOM.fragment(render({ ...options, ...item, selectionMode: false }));
    assert.ok(restored.querySelector('[data-library-menu-toggle]'));
  }
});

test("organization contribution does not expose deletion without a separate delete capability", () => {
  for (const render of [
    () => view.renderMediaCard({ media: { id: "m", name: "素材", type: "image" }, space: "organization", mutable: true, menuOpen: true, canDelete: false }),
    () => view.renderFolderCard({ folder: { id: "f", name: "目录", space: "organization" }, space: "organization", mutable: true, menuOpen: true, canDelete: false }),
  ]) {
    const markup = render();
    assert.doesNotMatch(markup, /data-library-menu-item="delete"/);
    assert.match(markup, /data-library-menu-item="rename"/);
  }
});

test("registers the complete frozen canvas asset-library view API", () => {
  assert.ok(Object.isFrozen(view));
  assert.deepEqual(
    Object.keys(view).sort(),
    [
      "renderCommandBar",
      "renderDirectoryTree",
      "renderEmptyState",
      "renderEntityCard",
      "renderEntityMediaFilter",
      "renderFolderCard",
      "renderMediaCard",
      "renderMovePopover",
      "renderSearchFolder",
      "renderSearchGroups",
      "syncGrid",
    ],
  );
  for (const renderer of Object.values(view)) assert.equal(typeof renderer, "function");
});

test("subject empty state has no persistent explanation", () => {
  const empty = JSDOM.fragment(view.renderEmptyState({ subjectZone: true, space: "personal", mutable: true }));
  assert.equal(empty.querySelector('strong').textContent, "还没有主体");
  assert.equal(empty.querySelector('button').textContent, "新建主体");
  assert.equal(empty.querySelector('span'), null);
  const readonly = JSDOM.fragment(view.renderEmptyState({ subjectZone: true, space: "personal", mutable: false }));
  assert.equal(readonly.querySelector('[data-library-create-entity]'), null);
});

test("media browse command bar exposes four accessible icons in add, search, filter, selection order", () => {
  const markup = view.renderCommandBar({
    mutable: true,
    space: "personal",
    section: "media",
    filter: "all",
  });

  assert.match(markup, /data-library-commandbar="media"/);
  assert.match(markup, /data-library-add-toggle="true"/);
  const fragment = JSDOM.fragment(markup);
  const upload = fragment.querySelector('[data-library-add-toggle]');
  assert.equal(upload.getAttribute("aria-label"), "添加资产");
  assert.equal(upload.title, "添加资产");
  assert.equal(upload.querySelector('[data-lucide]').dataset.lucide, "plus");
  assert.equal(upload.textContent.trim(), "");
  assert.deepEqual([...fragment.querySelectorAll('button')].map((button) => button.getAttribute('aria-label')), ["添加资产", "搜索资产", "筛选", "进入多选"]);
  assert.match(markup, /data-library-selection-toggle="true"/);
  assert.match(markup, /data-library-filter-toggle="true"/);
  assert.doesNotMatch(markup, /data-library-display|data-library-current-display|data-library-active-display/);
  assert.doesNotMatch(markup, /data-library-create-entity/);
  assert.doesNotMatch(markup, /data-library-batch-action/);
});

test("directory add menu respects depth and folder permission while keeping upload available", () => {
  const options = { space: "personal", section: "media", mutable: true, canCreateFolder: true, menu: "add" };
  const open = JSDOM.fragment(view.renderCommandBar({ ...options, folderDepth: 4 }));
  assert.equal(open.querySelector('[data-library-add-toggle]').getAttribute('aria-expanded'), 'true');
  assert.deepEqual([...open.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent.trim()), ['新建文件夹', '上传资产']);
  assert.equal(open.querySelector('[data-library-add-folder]').disabled, false);
  for (const patch of [{ folderDepth: 5 }, { canCreateFolder: false }]) {
    const limited = JSDOM.fragment(view.renderCommandBar({ ...options, ...patch }));
    assert.equal(limited.querySelector('[data-library-add-folder]').disabled, true);
    assert.equal(limited.querySelector('[data-library-upload]').disabled, false);
  }
  for (const patch of [{ subjectZone: true }, { entityFilter: true }, { space: 'platform' }, { mutable: false }, { selectionMode: true }]) {
    assert.equal(JSDOM.fragment(view.renderCommandBar({ ...options, ...patch })).querySelector('.asset-library-add-menu'), null);
  }
});

test("entity browse command bar creates subjects without media-kind filters", () => {
  const markup = view.renderCommandBar({
    mutable: true,
    space: "personal",
    section: "entities",
    filter: "video",
  });

  assert.match(markup, /data-library-commandbar="entity"/);
  assert.match(markup, /data-library-create-entity="true"/);
  const create = JSDOM.fragment(markup).querySelector('[data-library-create-entity]');
  assert.equal(create.getAttribute("aria-label"), "新建主体");
  assert.equal(create.title, "新建主体");
  assert.equal(create.querySelector('[data-lucide]').dataset.lucide, "plus");
  assert.equal(create.textContent.trim(), "");
  assert.match(markup, /data-library-active-filter="all"/);
  assert.match(markup, /data-library-selection-toggle="true"/);
  assert.doesNotMatch(markup, /data-library-upload/);
  assert.match(markup, /data-library-filter-toggle/);
  assert.doesNotMatch(markup, /data-library-filter="(?:image|video|audio)"/);
});

test("selection replaces controls within the existing command row", () => {
  const markup = view.renderCommandBar({
    mutable: true,
    space: "personal",
    section: "media",
    selectionMode: true,
    selectedCount: 3.8,
    filter: "image",
    menu: "batch",
  });

  assert.match(markup, /asset-library-primary-command asset-library-batch-command/);
  const batch = JSDOM.fragment(markup).querySelector('[data-library-batch-toggle]');
  assert.equal(batch.textContent.trim(), "操作");
  assert.equal(batch.querySelector('[data-lucide]').dataset.lucide, "list-checks");
  assert.match(markup, /aria-label="操作，已选 3 项"/);
  assert.doesNotMatch(markup, /操作 ·/);
  assert.match(markup, /data-library-batch-toggle="true"/);
  assert.match(markup, /aria-expanded="true"/);
  assert.match(markup, /data-library-select-all="true">\s*<i data-lucide="square"[^>]*><\/i>\s*<span>全选<\/span>/);
  assert.match(markup, /data-library-selection-cancel="true"/);
  assert.match(markup, /data-lucide="x"[^>]*><\/i>\s*<span>取消<\/span>/);
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
  assert.doesNotMatch(markup, /data-library-search-toggle/);
  const document = new JSDOM(markup).window.document;
  assert.ok(document.querySelector(".asset-library-command-group.selecting [data-library-select-all]"));
  assert.ok(document.querySelector(".asset-library-command-group.selecting [data-library-selection-cancel]"));
  assert.equal(document.querySelector(".asset-library-selection-tray"), null);
  const selectAllIndex = markup.indexOf('data-library-select-all="true"');
  assert.doesNotMatch(markup, /data-library-filter-toggle|data-library-display=/);
  const cancelIndex = markup.indexOf('data-library-selection-cancel="true"');
  assert.ok(selectAllIndex < cancelIndex);
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

test("Entity batch actions omit directory, review and organization sharing", () => {
  const markup = view.renderCommandBar({
    mutable: true,
    space: "organization",
    section: "entity",
    selectionMode: true,
    selectedCount: 2,
    menu: "batch",
  });

  assert.doesNotMatch(markup, /data-library-batch-action="review"/);
  assert.doesNotMatch(markup, /批量提交审核/);
  assert.doesNotMatch(markup, /data-library-batch-action="move"/);
  assert.match(markup, /data-library-batch-action="delete"/);
  assert.match(markup, /data-library-selection-cancel="true"/);
  assert.doesNotMatch(markup, /share-organization/);
  assert.doesNotMatch(markup, /复制到组织空间/);
  assert.doesNotMatch(markup, /data-library-filter-toggle/);
  assert.doesNotMatch(markup, /data-library-display=/);
});

test("personal subject batch actions offer use, tags and delete without changing member placement", () => {
  const markup = view.renderCommandBar({
    mutable: true,
    space: "personal",
    section: "entity",
    selectionMode: true,
    selectedCount: 2,
    menu: "batch",
  });

  assert.doesNotMatch(markup, /data-library-batch-action="review"/);
  assert.doesNotMatch(markup, /批量提交审核/);
  assert.doesNotMatch(markup, /data-library-batch-action="move"/);
  assert.doesNotMatch(markup, /data-library-batch-action="share-organization"/);
  assert.doesNotMatch(markup, /data-library-batch-action="create-group"/);
  assert.match(markup, /data-library-batch-action="add-canvas"/);
  assert.match(markup, /使用所含素材/);
  assert.match(markup, /data-library-batch-action="delete"/);
  assert.match(markup, /data-library-batch-action="set-tags"/);
  assert.equal(markup.match(/data-library-batch-action=/g)?.length, 3);
});

test("an explicit empty batch capability disables Entity selection", () => {
  const markup = view.renderCommandBar({
    mutable: true,
    canCreateEntity: true,
    allowedBatchActions: [],
    space: "personal",
    section: "entity",
    selectionMode: true,
    selectedCount: 2,
    menu: "batch",
  });

  assert.match(markup, /data-library-create-entity="true"/);
  assert.match(markup, /data-library-selection-mode="false"/);
  assert.doesNotMatch(markup, /data-library-selection-toggle/);
  assert.doesNotMatch(markup, /data-library-select-all/);
  assert.doesNotMatch(markup, /data-library-batch-toggle/);
  assert.doesNotMatch(markup, /data-library-batch-action/);
});

test("command bar exposes disabled capability states without executable hooks", () => {
  const entity = view.renderCommandBar({
    mutable: true,
    canCreateEntity: false,
    allowedBatchActions: [],
    space: "personal",
    section: "entity",
  });
  const media = view.renderCommandBar({
    mutable: true,
    canUploadMedia: false,
    space: "personal",
    section: "media",
  });

  const entityCommand = JSDOM.fragment(entity).querySelector('.asset-library-readonly-command');
  assert.equal(entityCommand.disabled, true);
  assert.equal(entityCommand.getAttribute('aria-label'), '暂不可新建');
  assert.equal(entityCommand.title, '当前项目暂不支持新建主体');
  assert.equal(entityCommand.textContent.trim(), '');
  assert.ok(entityCommand.querySelector('[data-lucide="plus"]'));
  assert.doesNotMatch(entity, /data-library-create-entity/);
  const mediaCommand = JSDOM.fragment(media).querySelector('.asset-library-readonly-command');
  assert.equal(mediaCommand.disabled, true);
  assert.equal(mediaCommand.getAttribute('aria-label'), '暂不可上传');
  assert.equal(mediaCommand.title, '当前项目暂不支持上传素材');
  assert.equal(mediaCommand.textContent.trim(), '');
  assert.ok(mediaCommand.querySelector('[data-lucide="plus"]'));
  assert.doesNotMatch(media, /data-library-upload/);
});

test("platform browse is one selectable Media surface with filters and no mutation command", () => {
  const markup = view.renderCommandBar({
    mutable: true,
    space: "platform",
    section: "entity",
    filter: "video",
    allowedBatchActions: ["add-canvas", "save-personal"],
  });

  assert.match(markup, /class="asset-library-commandbar platform readonly"/);
  assert.match(markup, /data-library-commandbar="media"/);
  assert.match(markup, /data-library-active-filter="video"/);
  assert.match(markup, /data-library-selection-enabled="true"/);
  assert.match(markup, /data-library-selection-toggle="true"/);
  assert.match(markup, /data-library-filter-toggle="true"/);
  assert.doesNotMatch(markup, /data-library-display|data-library-current-display|data-library-active-display/);
  assert.doesNotMatch(markup, /asset-library-readonly-command/);
  assert.doesNotMatch(markup, />仅可查看</);
  assert.doesNotMatch(markup, /data-library-upload/);
  assert.doesNotMatch(markup, /data-library-create-entity/);
});

test("platform selection exposes only add-to-canvas and save-to-personal actions", () => {
  const markup = view.renderCommandBar({
    mutable: false,
    space: "official",
    section: "media",
    selectionMode: true,
    selectedCount: 2,
    filter: "image",
    menu: "batch",
    allowedBatchActions: ["add-canvas", "save-personal", "delete"],
  });

  assert.match(markup, /data-library-selection-mode="true"/);
  assert.match(markup, /data-library-batch-action="add-canvas">\s*<span>添加到画布<\/span>/);
  assert.match(markup, /disabled aria-disabled="true" aria-label="保存到素材，暂未接入" title="暂未接入" data-library-batch-unavailable="save-personal"/);
  assert.match(markup, /<span>保存到素材<\/span>\s*<small aria-hidden="true">暂未接入<\/small>/);
  assert.equal(markup.match(/data-library-batch-action=/g)?.length, 1);
  assert.doesNotMatch(markup, /data-library-batch-action="(?:review|move|share-organization|delete)"/);
  assert.match(markup, /data-library-select-all="true"/);
  assert.match(markup, /data-library-selection-cancel="true"/);

  const selectAllIndex = markup.indexOf('data-library-select-all="true"');
  const cancelIndex = markup.indexOf('data-library-selection-cancel="true"');
  assert.ok(selectAllIndex < cancelIndex);
  assert.doesNotMatch(markup, /data-library-filter-toggle|data-library-display=/);

  const importEnabled = view.renderCommandBar({
    space: "platform",
    section: "media",
    selectionMode: true,
    selectedCount: 1,
    menu: "batch",
    allowedBatchActions: ["add-canvas", "save-personal"],
    canImportPlatformAssets: true,
  });
  assert.match(importEnabled, /data-library-batch-action="save-personal">\s*<span>保存到素材<\/span>/);
  assert.doesNotMatch(importEnabled, /data-library-batch-unavailable="save-personal"/);
});

test("command bar renders the applied filter marker and a draft filter dialog", () => {
  const markup = view.renderCommandBar({
    mutable: true,
    section: "media",
    filter: "audio",
    menu: "filter",
  });

  assert.match(markup, /data-library-active-filter="audio"/);
  assert.match(markup, /data-library-open-menu="filter"/);
  assert.match(markup, /aria-label="筛选，已应用 1 项条件"/);
  assert.match(markup, /aria-expanded="true"/);
  const document = new JSDOM(markup).window.document;
  assert.equal(document.querySelector('[data-library-filter-toggle]').getAttribute("aria-haspopup"), "dialog");
  assert.equal(document.querySelector('[data-library-filter-popover]').getAttribute("role"), "dialog");
  assert.equal(document.querySelector('[data-library-filter="audio"]').getAttribute("aria-pressed"), "true");
  assert.deepEqual([...document.querySelectorAll(".asset-library-filter-types button")].map((button) => button.textContent), ["全部", "图片", "视频", "音频"]);
  assert.equal(document.querySelector('[data-library-filter-reset]').textContent, "重置");
  assert.deepEqual([...document.querySelectorAll(".asset-library-filter-popover footer button")].map((button) => button.textContent), ["取消", "应用"]);
});

test("media regions filter type and tags while the subject zone filters only tags", () => {
  const options = { space: "personal", section: "all", menu: "filter", filter: "image", filterDraft: { mediaKind: "video" } };
  const fragment = JSDOM.fragment(view.renderCommandBar(options));
  assert.equal(fragment.querySelector('[data-library-filter-item-kind]'), null);
  assert.equal(fragment.querySelector('[data-library-filter="video"]').getAttribute("aria-pressed"), "true");
  assert.equal(fragment.querySelector('.asset-library-filter-count').textContent, "1");
  for (const overrides of [{ subjectZone: true }, { section: "entity" }]) {
    const subjects = JSDOM.fragment(view.renderCommandBar({ ...options, ...overrides, tagFilter: { tagIds: ["builtin:character"] } }));
    assert.equal(subjects.querySelector('[data-library-filter-item-kind]'), null);
    assert.equal(subjects.querySelector('[data-library-filter]'), null);
    assert.ok(subjects.querySelector('[data-library-filter-tag="builtin:character"]'));
    assert.equal(subjects.querySelector('.asset-library-filter-count').textContent, "1");
  }
});

test("filter popup separates draft changes from applied count and scopes custom tags", () => {
  const document = new JSDOM(view.renderCommandBar({
    space: "personal", section: "all", filter: "image", menu: "filter",
    tagFilter: { tagIds: ["personal-tag"] },
    filterDraft: { mediaKind: "video", tagIds: ["builtin:scene", "personal-tag"] },
    tags: [
      { id: "personal-tag", name: '<自定义 "标签">', space: "personal" },
      { id: "org-tag", name: "组织专用", space: "organization" },
      { id: "builtin:character", name: "不能替换内置" },
      { id: "builtin:sound", name: "音效" },
    ],
  })).window.document;
  assert.equal(document.querySelector(".asset-library-filter-count").textContent, "2");
  assert.equal(document.querySelector('[data-library-filter="video"]').getAttribute("aria-pressed"), "true");
  assert.equal(document.querySelector('[data-library-filter="image"]').getAttribute("aria-pressed"), "false");
  assert.deepEqual([...document.querySelectorAll('[data-library-filter-tag]')].map((button) => button.dataset.libraryFilterTag), ["builtin:character", "builtin:scene", "builtin:object", "personal-tag"]);
  assert.equal(document.querySelector('[data-library-filter-tag="personal-tag"]').textContent, '<自定义 "标签">');
  assert.equal(document.querySelector('[data-library-filter-tag="builtin:scene"]').getAttribute("aria-pressed"), "true");
  assert.equal(document.querySelector('[data-library-filter-untagged]').getAttribute("aria-pressed"), "false");
  assert.equal(document.querySelector('[data-library-create-tag]'), null);
  assert.equal(document.querySelector(".asset-library-filter-tags input"), null);
});

test("untagged draft is exclusive and unavailable tag catalogs disable tag controls", () => {
  const document = new JSDOM(view.renderCommandBar({
    section: "all", menu: "filter", filter: "all", tagsAvailable: false,
    tagFilter: { untagged: true, tagIds: ["builtin:object"] },
    filterDraft: { mediaKind: "all", untagged: true, tagIds: ["builtin:character"] },
  })).window.document;
  assert.equal(document.querySelector(".asset-library-filter-count").textContent, "1");
  assert.equal(document.querySelector('[data-library-filter-untagged]').getAttribute("aria-pressed"), "true");
  assert.equal(document.querySelector('[data-library-filter-tag="builtin:character"]').getAttribute("aria-pressed"), "false");
  assert.equal(document.querySelector('[data-library-filter-untagged]').closest("fieldset").disabled, true);
  assert.equal(document.querySelector('[data-library-filter="all"]').closest("fieldset").disabled, false);
});

test("tag-setting actions are available only for permitted media, groups, and batches", () => {
  for (const render of [
    (allowedActions) => view.renderMediaCard({ media: { id: "m", type: "image" }, mutable: true, menuOpen: true, allowedActions }),
    (allowedActions) => view.renderEntityCard({ entity: { id: "e" }, mutable: true, menuOpen: true, allowedActions }),
  ]) {
    const allowed = new JSDOM(render(["set-tags"])).window.document;
    const action = allowed.querySelector('[data-library-menu-item="set-tags"]');
    assert.equal(action.textContent.trim(), "设置标签");
    assert.equal(action.querySelector("i").dataset.lucide, "tags");
    assert.equal(new JSDOM(render(["rename"])).window.document.querySelector('[data-library-menu-item="set-tags"]'), null);
  }
  const folder = view.renderFolderCard({ folder: { id: "f", name: "目录" }, mutable: true, menuOpen: true });
  assert.doesNotMatch(folder, /set-tags/);
  const batch = new JSDOM(view.renderCommandBar({ section: "all", mutable: true, selectionMode: true, selectedCount: 2, menu: "batch", allowedBatchActions: ["set-tags"] })).window.document;
  assert.equal(batch.querySelector('[data-library-batch-action="set-tags"] i').dataset.lucide, "tags");
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

test("directory actions respect explicit permissions, root ownership and the five-level create limit", () => {
  const folders = [
    { id: "one", name: "角色", parentId: null },
    { id: "two", name: "设计", parentId: "one" },
    { id: "three", name: "材质", parentId: "two" },
    { id: "four", name: "最终方案", parentId: "three" },
  ];
  const options = { folders, expandedFolderIds: ["one", "two", "three"], currentFolderId: "four" };
  const tree = JSDOM.fragment(view.renderDirectoryTree({ ...options, space: "personal", canCreate: true, canRename: true, canDelete: true }));
  const root = tree.querySelector('.asset-library-directory-row.root');
  assert.equal(root.querySelector('[data-library-directory-create]').dataset.libraryDirectoryCreate, "");
  assert.equal(root.querySelector('[data-library-directory-rename], [data-library-directory-delete]'), null);
  const leaf = tree.querySelector('[data-library-directory-select="four"]').parentElement;
  assert.equal(leaf.getAttribute("aria-selected"), "true");
  assert.ok(leaf.querySelector('.asset-library-directory-check [data-lucide="check"]'));
  assert.deepEqual([...leaf.querySelector('.asset-library-directory-actions-overlay').children].map((button) => button.firstElementChild.dataset.lucide), ["plus", "pencil", "trash-2"]);
  assert.equal(leaf.querySelector('[data-library-directory-create]').disabled, true);
  assert.equal(leaf.querySelector('[data-library-directory-create]').title, "最多支持 5 级目录");
  const member = JSDOM.fragment(view.renderDirectoryTree({ ...options, space: "organization", canCreate: true, canRename: false, canDelete: false }));
  assert.equal(member.querySelectorAll('[data-library-directory-create]').length, 5);
  assert.equal(member.querySelector('[data-library-directory-rename], [data-library-directory-delete]'), null);
  for (const capabilities of [{}, { space: "platform", canCreate: true, canRename: true, canDelete: true }]) {
    const readonly = JSDOM.fragment(view.renderDirectoryTree({ ...options, ...capabilities }));
    assert.equal(readonly.querySelector('.asset-library-directory-actions-overlay'), null);
    assert.equal(readonly.querySelectorAll('[data-library-directory-select]').length, 5);
  }
});

test("a create draft is the first child of its parent, escapes user input and does not invent a folder", () => {
  const tree = JSDOM.fragment(view.renderDirectoryTree({
    folders: [{ id: "parent", name: "角色", parentId: null }, { id: "child", name: "已有", parentId: "parent" }],
    canCreate: true,
    directoryDraft: { kind: "create", parentId: "parent", name: '<新名称 & "素材">', error: '名称 <冲突>', pending: false },
  }));
  const parent = tree.querySelector('[data-library-directory-select="parent"]').parentElement;
  const draft = parent.nextElementSibling;
  assert.equal(parent.getAttribute("aria-expanded"), "true");
  assert.equal(draft.dataset.libraryDirectoryDraft, "create");
  assert.equal(draft.getAttribute("aria-level"), "3");
  const input = draft.querySelector('[data-library-directory-draft-input]');
  assert.equal(input.value, '<新名称 & "素材">');
  assert.equal(input.getAttribute("aria-label"), "文件夹名称");
  assert.equal(input.dataset.libraryDirectoryDraftKind, "create");
  assert.equal(input.maxLength, 100);
  assert.equal(input.getAttribute("aria-invalid"), "true");
  assert.equal(draft.querySelector('[role="alert"]').textContent, '名称 <冲突>');
  assert.equal(draft.querySelector('[role="alert"]').id, input.getAttribute("aria-describedby"));
  assert.ok(draft.querySelector('[data-library-directory-draft-confirm]'));
  assert.ok(draft.querySelector('[data-library-directory-draft-cancel]'));
  assert.ok(draft.nextElementSibling.querySelector('[data-library-directory-select="child"]'));
  assert.equal(tree.querySelectorAll('[data-library-directory-select]').length, 3);
  assert.equal(tree.querySelector('新名称'), null);
});

test("root create drafts open an empty root while rename replaces only the edited row", () => {
  const create = JSDOM.fragment(view.renderDirectoryTree({ rootExpanded: false, canCreate: true,
    directoryDraft: { kind: "create", parentId: null, name: "新目录" } }));
  assert.equal(create.querySelector('.root').getAttribute('aria-expanded'), 'true');
  assert.equal(create.querySelector('[data-library-directory-draft]').getAttribute('aria-level'), '2');
  const options = { folders: [{ id: "parent", name: "角色", parentId: null }, { id: "child", name: "已有", parentId: "parent" }],
    expandedFolderIds: ["parent"], canCreate: true, canRename: true, canDelete: true,
    directoryDraft: { kind: "rename", folderId: "parent", name: "角色设定", pending: true } };
  const rename = JSDOM.fragment(view.renderDirectoryTree(options));
  assert.equal(rename.querySelector('[data-library-directory-select="parent"]'), null);
  assert.ok(rename.querySelector('[data-library-directory-select="child"]'));
  assert.equal(rename.querySelector('[data-library-directory-draft-input]').getAttribute('aria-label'), '重命名文件夹');
  assert.equal(rename.querySelector('[data-library-directory-draft]').getAttribute('aria-level'), '2');
  assert.equal(rename.querySelectorAll('[data-library-directory-draft]').length, 1);
  assert.ok([...rename.querySelectorAll('button, input')].every((node) => node.disabled));
  const platform = JSDOM.fragment(view.renderDirectoryTree({ ...options, space: "platform" }));
  assert.equal(platform.querySelector('[data-library-directory-draft]'), null);
  assert.equal(platform.querySelector('[data-library-directory-select="parent"]').disabled, false);
});

test("personal media cards expose selected, menu, rename, and all single-item actions", () => {
  const base = {
    media: { id: "media-1", name: "镜头 A", mediaKind: "video" },
    mutable: true,
    space: "personal",
    selected: true,
    selectionMode: false,
    menuOpen: true,
    meta: "视频 · 00:12",
  };
  const markup = view.renderMediaCard(base);
  const renaming = view.renderMediaCard({ ...base, menuOpen: false, renaming: true });
  const unselected = view.renderMediaCard({ ...base, selected: false, menuOpen: false });

  assert.match(markup, /asset-library-media-card selected menu-open/);
  assert.match(markup, /draggable="true"/);
  assert.match(markup, /data-library-media="media-1"/);
  assert.match(markup, /data-library-media-kind="video"/);
  assert.match(markup, /asset-library-card-namebar" data-library-rename="media-1" data-library-item-kind="media"/);
  assert.match(markup, /tabindex="0" aria-label="名称 镜头 A，按 Enter 或 F2 重命名"/);
  assert.match(markup, /data-library-select="media:media-1"/);
  assert.match(markup, /aria-pressed="true"/);
  assert.match(markup, /data-library-select="media:media-1"[^]*data-lucide="check"/);
  assert.match(unselected, /data-library-select="media:media-1"[^>]*>\s*<\/button>/);
  assert.doesNotMatch(unselected, /data-lucide="plus"/);
  assert.doesNotMatch(unselected, /data-lucide="square"/);
  assert.match(markup, /data-library-menu-toggle="media-1"/);
  assert.match(markup, /data-lucide="ellipsis-vertical"/);
  for (const action of ["rename", "review", "move", "share-organization", "delete"]) {
    assert.match(markup, new RegExp(`data-library-menu-item="${action}"`));
  }
  assert.match(markup, /提交合规审核/);
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
  assert.doesNotMatch(audioMenu, /提交合规审核/);
  assert.match(audioMenu, /data-library-menu-item="move"/);
});

test("media name display keeps the full extension separate without changing names, editing or non-file labels", () => {
  const name = 'ChatGPT Image <角色 & "正面">.PNG';
  const media = { id: "image", name, mediaKind: "image" };
  const rendered = JSDOM.fragment(view.renderMediaCard({ media, mutable: true }));
  const label = rendered.querySelector('.asset-library-card-name');
  assert.equal(label.querySelector('.asset-library-file-name-stem').textContent, 'ChatGPT Image <角色 & "正面">');
  assert.equal(label.querySelector('.asset-library-file-name-extension').textContent, '.PNG');
  assert.equal(label.textContent, name);
  assert.equal(label.title, name);
  assert.equal(rendered.querySelector('.asset-library-card-namebar').getAttribute('aria-label'), `名称 ${name}，按 Enter 或 F2 重命名`);
  assert.equal(rendered.querySelector('角色'), null);
  const editing = JSDOM.fragment(view.renderMediaCard({ media, mutable: true, renaming: true }));
  assert.equal(editing.querySelector('input').value, name);
  assert.equal(editing.querySelector('.asset-library-file-name-stem'), null);
  for (const markup of [
    view.renderFolderCard({ folder: { id: "folder", name: "目录.png" } }),
    view.renderEntityCard({ entity: { id: "group", name: "素材组.png" } }),
  ]) {
    const fragment = JSDOM.fragment(markup);
    assert.equal(fragment.querySelector('.asset-library-file-name-stem'), null);
    assert.match(fragment.querySelector('.asset-library-card-name').textContent, /\.png$/);
  }
  assert.equal(media.name, name);
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

test("browse cards expose direct selection without exposing edits in read-only spaces", () => {
  const media = { id: "video", mediaKind: "video", name: "镜头" };
  assert.match(view.renderMediaCard({ media, mutable: true }), /data-library-select="media:video"/);
  assert.doesNotMatch(view.renderMediaCard({ media, mutable: false }), /data-library-select/);
  assert.match(view.renderMediaCard({ media, space: "platform", mutable: false }), /data-library-select="media:video"/);
  assert.match(view.renderEntityCard({ entity: { id: "entity" }, mutable: true }), /data-library-select="entity:entity"/);
  assert.doesNotMatch(view.renderEntityCard({ entity: { id: "entity" }, mutable: false }), /data-library-select/);
  assert.doesNotMatch(view.renderFolderCard({ folder: { id: "folder" } }), /data-library-select=/);
});

test("grid updates retain loaded media, control focus and scroll across selection and menus", (t) => {
  const dom = new JSDOM("<div id='grid'></div>");
  t.after(() => dom.window.close());
  const grid = dom.window.document.querySelector("#grid");
  const media = { id: "video", name: "镜头", mediaKind: "video", url: "https://example.test/video.mp4" };
  const render = (options = {}) => view.renderMediaCard({ media, mutable: true, ...options });
  view.syncGrid(grid, render());
  const card = grid.firstElementChild;
  const preview = card.querySelector(".asset-library-card-preview");
  const video = card.querySelector("video");
  const selection = card.querySelector("[data-library-select]");
  let more = card.querySelector("[data-library-menu-toggle]");
  const observer = new dom.window.MutationObserver(() => {});
  observer.observe(grid, { subtree: true, childList: true, attributes: true, characterData: true });
  video.currentTime = 4.5;
  grid.scrollTop = 140;
  selection.focus();
  view.syncGrid(grid, render());
  assert.equal(observer.takeRecords().length, 0, "a canvas-only render must not touch library content");

  for (const options of [{ selected: true, selectionMode: true }, { menuOpen: true }, { name: "新名称" }]) {
    view.syncGrid(grid, render(options));
    assert.equal(grid.firstElementChild, card);
    assert.equal(card.querySelector(".asset-library-card-preview"), preview);
    assert.equal(card.querySelector("video"), video);
    assert.equal(video.isConnected, true);
    assert.equal(video.currentTime, 4.5);
    assert.equal(card.querySelector("[data-library-select]"), selection);
    if (options.selectionMode) {
      assert.equal(card.querySelector("[data-library-menu-toggle]"), null);
      assert.equal(more.isConnected, false);
      more = null;
    } else {
      more ??= card.querySelector("[data-library-menu-toggle]");
      assert.ok(more);
      assert.equal(card.querySelector("[data-library-menu-toggle]"), more);
    }
    assert.equal(dom.window.document.activeElement, selection);
    assert.equal(grid.scrollTop, 140);
  }
  assert.equal(preview.getAttribute("aria-label"), "预览 新名称");
  assert.equal(card.querySelector(".asset-library-card-name").textContent, "新名称");
  assert.equal(card.querySelector(".asset-library-item-menu"), null);
  observer.disconnect();
});

test("grid reconciles membership and media updates without recycling another space's card", (t) => {
  const dom = new JSDOM("<div id='grid'></div>");
  t.after(() => dom.window.close());
  const grid = dom.window.document.querySelector("#grid");
  const render = (id, options = {}) => view.renderMediaCard({
    media: { id, name: id, mediaKind: "image", url: `https://example.test/${id}.jpg` }, ...options,
  });
  view.syncGrid(grid, render("a") + render("b"));
  const a = grid.children[0];
  const b = grid.children[1];
  const bImage = b.querySelector("img");
  view.syncGrid(grid, render("b") + render("a") + render("c"));
  assert.deepEqual([...grid.children].slice(0, 2), [b, a]);
  assert.equal(b.querySelector("img"), bImage);
  view.syncGrid(grid, render("b"));
  assert.equal(a.isConnected, false);
  assert.equal(grid.children.length, 1);
  assert.equal(grid.firstElementChild, b);
  view.syncGrid(grid, render("b", { media: { id: "b", mediaKind: "video", url: "https://example.test/new.mp4" } }));
  assert.equal(grid.firstElementChild, b);
  assert.equal(b.querySelector("img"), null);
  assert.equal(b.querySelector("video").getAttribute("src"), "https://example.test/new.mp4");
  view.syncGrid(grid, render("b", { space: "organization" }));
  assert.notEqual(grid.firstElementChild, b);
  view.syncGrid(grid, view.renderEmptyState({ hasQuery: true }));
  assert.equal(grid.querySelectorAll(".asset-library-card").length, 0);
  assert.match(grid.textContent, /没有匹配结果/);
  view.syncGrid(grid, view.renderEmptyState({ section: "entity", mutable: true }));
  assert.match(grid.textContent, /还没有主体/);
  assert.equal(grid.querySelector("[data-library-clear-query]"), null);
});

test("a library refresh preserves an in-progress rename and its caret", (t) => {
  const dom = new JSDOM("<div id='grid'></div>");
  t.after(() => dom.window.close());
  const grid = dom.window.document.querySelector("#grid");
  const render = (selected) => view.renderMediaCard({ media: { id: "a", name: "原名称" }, mutable: true, renaming: true, selected });
  view.syncGrid(grid, render(false));
  const input = grid.querySelector("input");
  input.focus();
  input.value = "正在编辑的名称";
  input.setSelectionRange(2, 4);
  view.syncGrid(grid, render(true));
  assert.equal(grid.querySelector("input"), input);
  assert.equal(input.value, "正在编辑的名称");
  assert.equal(input.selectionStart, 2);
  assert.equal(input.selectionEnd, 4);
  assert.equal(dom.window.document.activeElement, input);
});

test("organization single-item menus omit sharing and platform cards keep selection without mutation controls", () => {
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

  assert.match(platform, /asset-library-media-card selected selection-mode readonly/);
  assert.doesNotMatch(platform, /data-library-menu-toggle/);
  assert.doesNotMatch(platform, /data-library-menu-item/);
  assert.match(platform, /data-library-select="media:platform-media"/);
  assert.match(platform, /aria-pressed="true"/);
  assert.doesNotMatch(platform, /data-library-rename/);
});

test("Material groups render one cover and a count while retaining media identity", () => {
  const markup = view.renderEntityCard({
    entity: { id: "entity-1", name: "主角" },
    name: "主角素材组",
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
    coverPreview: {
      mediaKind: "image",
      thumbnailUrl: "https://cdn.example/cover.webp",
    },
    mediaCount: 5,
    meta: "5 个素材 · 刚刚更新",
    selected: true,
    selectionMode: false,
    menuOpen: true,
    mutable: true,
    space: "personal",
  });

  assert.match(markup, /asset-library-entity-card selected menu-open/);
  assert.match(markup, /data-library-entity="entity-1"/);
  assert.match(markup, /data-library-preview="entity-1"/);
  assert.match(markup, /class="asset-library-entity-cover" data-library-entity-cover="media"/);
  assert.match(markup, /<img src="https:\/\/cdn\.example\/cover\.webp"/);
  assert.equal(markup.match(/<img /g)?.length, 1);
  assert.doesNotMatch(markup, /portrait\.jpg/);
  assert.doesNotMatch(markup, /action\.mp4/);
  assert.doesNotMatch(markup, /voice\.mp3/);
  assert.doesNotMatch(markup, /reference\.webp/);
  assert.doesNotMatch(markup, /not-rendered/);
  assert.doesNotMatch(markup, /5 个素材/);
  assert.doesNotMatch(markup, /asset-library-group-count/);
  assert.match(markup, /asset-library-subject-mark/);
  assert.match(markup, /aria-label="打开主体 主角素材组"/);
  assert.doesNotMatch(markup, /asset-library-entity-collage/);
  assert.match(markup, /asset-library-card-namebar" data-library-rename="entity-1" data-library-item-kind="entity"/);
  assert.match(markup, /data-library-select="entity:entity-1"/);
  for (const action of ["edit", "rename", "set-tags", "delete"]) {
    assert.match(markup, new RegExp(`data-library-menu-item="${action}"`));
  }
  assert.doesNotMatch(markup, /data-library-menu-item="review"/);
  assert.doesNotMatch(markup, /提交合规审核/);
  assert.doesNotMatch(markup, /data-library-menu-item="(?:move|share-organization)"/);
  assert.match(markup, /data-library-menu-item="delete"/);
  assert.doesNotMatch(markup, /data-library-menu-item="review"/);
});

test("card names remain separate from previews and group decoration does not intercept controls", () => {
  for (const [render, item] of [
    [view.renderMediaCard, { media: { id: "m", name: "很长的原始文件名称.png", url: "https://example.test/image.png" } }],
    [view.renderEntityCard, { entity: { id: "g", name: "素材组合" }, mediaCount: 4 }],
  ]) {
    const fragment = JSDOM.fragment(render({ ...item, mutable: true, selected: true }));
    const card = fragment.querySelector("article");
    const preview = card.querySelector(".asset-library-card-preview");
    const name = card.querySelector(".asset-library-card-namebar");
    assert.equal(preview.parentElement, card);
    assert.equal(name.parentElement, card);
    assert.equal(preview.nextElementSibling, name);
    assert.equal(name.querySelector("button"), null);
    assert.equal(card.querySelector('[data-library-menu-toggle]').parentElement, card);
    if (item.entity) {
      assert.equal(card.querySelector('.asset-library-group-stack').parentElement, card);
      assert.equal(card.querySelector('.asset-library-group-stack').getAttribute('aria-hidden'), "true");
      assert.equal(preview.querySelector('.asset-library-group-count'), null);
      assert.equal(name.querySelector('.asset-library-subject-mark').getAttribute('aria-hidden'), "true");
      assert.ok(name.querySelector('[data-lucide="layout-grid"]'));
    } else {
      assert.equal(card.querySelector('.asset-library-file-name-extension').textContent, ".png");
    }
  }
});

test("an explicit item-action capability can restrict Entity menus", () => {
  const editable = view.renderEntityCard({
    entity: { id: "entity-persisted", name: "持久素材组", version: 3 },
    mutable: true,
    menuOpen: true,
    allowedActions: ["edit", "rename"],
    space: "personal",
  });
  const unavailable = view.renderEntityCard({
    entity: { id: "entity-readonly", name: "只读素材组" },
    mutable: true,
    menuOpen: true,
    renaming: true,
    allowedActions: [],
    space: "personal",
  });

  assert.match(editable, /data-library-menu-item="edit"/);
  assert.match(editable, /data-library-menu-item="rename"/);
  assert.doesNotMatch(editable, /data-library-menu-item="move"/);
  assert.doesNotMatch(editable, /data-library-menu-item="share-organization"/);
  assert.doesNotMatch(editable, /data-library-menu-item="delete"/);
  assert.match(editable, /data-library-rename="entity-persisted"/);
  assert.doesNotMatch(unavailable, /data-library-menu-toggle/);
  assert.doesNotMatch(unavailable, /data-library-menu-item/);
  assert.doesNotMatch(unavailable, /data-library-rename/);
  assert.doesNotMatch(unavailable, /data-library-rename-input/);
  assert.doesNotMatch(unavailable, /menu-open/);
});

test("Entity cover fallback skips audio and keeps the placeholder semantic when no visual Media exists", () => {
  const visualFallback = view.renderEntityCard({
    entity: { id: "entity-visual", name: "有封面" },
    mediaPreviews: [
      { mediaKind: "audio", url: "https://cdn.example/voice.mp3" },
      { mediaKind: "video", thumbnailUrl: "https://cdn.example/video-cover.webp" },
      { mediaKind: "image", url: "https://cdn.example/not-used.jpg" },
    ],
    mutable: true,
  });
  const audioOnly = view.renderEntityCard({
    entity: { id: "entity-audio", name: "仅音频" },
    mediaPreviews: [{ mediaKind: "audio", url: "https://cdn.example/voice.mp3" }],
    mutable: true,
  });

  assert.match(visualFallback, /data-library-entity-cover="media"/);
  assert.match(visualFallback, /src="https:\/\/cdn\.example\/video-cover\.webp"/);
  assert.doesNotMatch(visualFallback, /voice\.mp3/);
  assert.doesNotMatch(visualFallback, /not-used\.jpg/);
  assert.match(audioOnly, /data-library-entity-cover="placeholder"/);
  assert.match(audioOnly, /data-lucide="images"/);
  assert.doesNotMatch(audioOnly, /voice\.mp3/);
});

test("Entity cover CSS fills the preview and removes the retired collage and count-badge paths", async () => {
  const css = await readFile(new URL("../styles/canvas-asset-library.css", import.meta.url), "utf8");

  assert.match(css, /\.asset-library-entity-cover\s*\{[^}]*width: 100%;[^}]*height: 100%;[^}]*overflow: hidden;/s);
  assert.match(css, /\.asset-library-entity-cover img,[^}]*\.asset-library-entity-cover video\s*\{[^}]*width: 100%;[^}]*height: 100%;[^}]*object-fit: cover;/s);
  assert.doesNotMatch(css, /\.asset-library-entity-collage/);
  assert.doesNotMatch(css, /\.asset-library-entity-badge/);
});

test("platform CSS omits directories while retaining the shared command lane", async () => {
  const css = await readFile(new URL("../styles/canvas-asset-library.css", import.meta.url), "utf8");
  assert.match(css, /data-library-space="platform"\][^}]+\.asset-library-directorybar\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\)/s);
  assert.match(css, /data-library-space="platform"\][^}]+\.asset-library-directory-shell\s*\{[^}]*display: none/s);
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
    mediaCount: payload,
    meta: payload,
    coverPreview: { mediaKind: "image", url: "https://cdn.example/safe.jpg?x=1&y=2" },
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
    menu: payload,
    selectedCount: payload,
  });

  assert.doesNotMatch(markup, /<svg/);
  assert.match(markup, /data-library-space="personal"/);
  assert.match(markup, /data-library-commandbar="media"/);
  assert.match(markup, /data-library-active-filter="all"/);
  assert.match(markup, /data-library-open-menu=""/);
});

test("empty states distinguish search, mutable sections, and the platform Media-only surface", () => {
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
  assert.match(entity, />新建主体<\/button>/);
  assert.match(readOnly, /data-library-empty="media"/);
  assert.match(readOnly, /暂无灵感素材/);
  assert.doesNotMatch(readOnly, /data-library-create-entity/);
});

test("empty states do not advertise unavailable create or upload capabilities", () => {
  const entity = view.renderEmptyState({
    section: "entity",
    mutable: true,
    canCreateEntity: false,
    space: "personal",
  });
  const media = view.renderEmptyState({
    section: "media",
    mutable: true,
    canUploadMedia: false,
    space: "personal",
  });

  assert.match(entity, /暂无可用主体/);
  assert.doesNotMatch(entity, /data-library-create-entity/);
  assert.match(media, /暂无可用素材/);
  assert.doesNotMatch(media, /data-library-upload/);
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

test("move destinations distinguish mixed locations, pending writes and recoverable errors", () => {
  const options = { space: "personal", folders: [{ id: "f", name: "目录" }], title: "移动素材组" };
  const mixed = JSDOM.fragment(view.renderMovePopover(options));
  assert.equal(mixed.querySelector('[data-library-move-target=""]').disabled, false);
  const root = JSDOM.fragment(view.renderMovePopover({ ...options, currentFolderId: null }));
  assert.equal(root.querySelector('[data-library-move-target=""]').getAttribute('aria-current'), "true");
  const pending = JSDOM.fragment(view.renderMovePopover({ ...options, pending: true }));
  assert.equal(pending.querySelector('[role="dialog"]').getAttribute('aria-busy'), "true");
  assert.equal(pending.querySelector('[role="dialog"]').getAttribute('aria-label'), "移动素材组");
  assert.ok([...pending.querySelectorAll('button')].every((button) => button.disabled));
  const failed = JSDOM.fragment(view.renderMovePopover({ ...options, error: "<稍后重试>" }));
  assert.equal(failed.querySelector('[role="status"]').textContent, "<稍后重试>");
  assert.ok([...failed.querySelectorAll('button')].every((button) => !button.disabled));
});

test("mixed browsing exposes upload and filters with explicit compact group actions", () => {
  const options = { space: "personal", section: "all", mutable: true,
    allowedBatchActions: ["add-canvas", "create-group", "review"] };
  const browse = view.renderCommandBar(options);
  assert.match(browse, /data-library-commandbar="all"/);
  assert.match(browse, /data-library-add-toggle="true"/);
  assert.match(browse, /data-library-filter-toggle="true"/);
  assert.doesNotMatch(browse, /data-library-create-entity/);
  const selection = view.renderCommandBar({ ...options, selectionMode: true, selectedCount: 2, menu: "batch" });
  assert.match(selection, /data-library-batch-action="add-canvas"/);
  assert.match(selection, /data-library-batch-action="create-group"/);
  assert.doesNotMatch(selection, /data-library-filter-toggle|data-library-display=/);
});

test("group content keeps an accessible return entry and does not imply a physical folder", () => {
  const markup = view.renderEntityMediaFilter({ entity: { name: "角色参考" }, unavailableCount: 2 });
  assert.match(markup, /aria-label="返回主体列表"/);
  assert.match(markup, /角色参考/);
  assert.match(markup, /2 项素材不可用/);
  assert.doesNotMatch(markup, /跨目录|筛选|关联主体/);
});

test("subject content displays the saved description as escaped readable text only when present", () => {
  const description = '服装：黑色外套\n参考 <img src=x onerror="alert(1)"> & 人物侧面';
  const fragment = JSDOM.fragment(view.renderEntityMediaFilter({ entity: { name: "玄翎", description } }));
  const region = fragment.querySelector('.asset-library-entity-description');
  assert.equal(region.textContent, description);
  assert.equal(region.getAttribute('role'), "region");
  assert.equal(region.getAttribute('aria-label'), "主体描述");
  assert.equal(region.tabIndex, 0);
  assert.equal(region.querySelector('img'), null);
  assert.equal(region.previousElementSibling.className, "asset-library-entity-filter-label");
  for (const entity of [{ name: "玄翎" }, { name: "玄翎", description: "  \n " }]) {
    assert.equal(JSDOM.fragment(view.renderEntityMediaFilter({ entity })).querySelector('.asset-library-entity-description'), null);
  }
  assert.equal(JSDOM.fragment(view.renderEntityMediaFilter({ entity: { description }, status: "unavailable" })).querySelector('.asset-library-entity-description'), null);
});

test("search exposes browse state across spaces and yields its toolbar slot during selection", () => {
  for (const space of ["personal", "organization", "platform"]) {
    for (const selectionMode of [false, true]) {
      const fragment = JSDOM.fragment(view.renderCommandBar({ space, selectionMode, mutable: true, searchOpen: true }));
      const search = fragment.querySelector('[data-library-search-toggle]');
      if (selectionMode) {
        assert.equal(search, null);
        assert.deepEqual([...fragment.querySelectorAll('button')].map((button) => button.textContent.trim()), ['操作', '全选', '取消']);
        continue;
      }
      if (space === "platform") {
        assert.equal(search, null);
      } else {
        assert.equal(search.disabled, false);
        assert.equal(search.getAttribute('aria-expanded'), "true");
        assert.equal(search.getAttribute('aria-controls'), "assetLibrarySearchRegion");
        assert.equal(search.getAttribute('aria-label'), "搜索资产");
        assert.equal(search.closest('[data-library-search-covered]'), null);
      }
      const remainingTools = fragment.querySelector('.asset-library-command-group');
      assert.equal(remainingTools.closest('[data-library-search-covered]'), null);
    }
  }
  const returned = JSDOM.fragment(view.renderCommandBar({ searchReturn: true, searchOpen: false }));
  assert.equal(returned.querySelector('[data-library-search-toggle]').getAttribute('aria-label'), "返回搜索结果");
  assert.equal(returned.querySelector('[data-library-search-toggle]').getAttribute('aria-expanded'), "false");
});

test("search folders escape names and paths and expose navigation without selection or item mutations", () => {
  const folder = { id: 'folder"<', name: '<参考 & "目录">' };
  const path = '默认目录 / <人物> / "参考"';
  const fragment = JSDOM.fragment(view.renderSearchFolder({ folder, path, space: "personal" }));
  const article = fragment.querySelector('article');
  const button = fragment.querySelector('button');
  assert.equal(article.dataset.libraryFolder, folder.id);
  assert.equal(article.dataset.librarySpace, "personal");
  assert.equal(button.dataset.libraryFolderOpen, folder.id);
  assert.equal(button.title, path);
  assert.equal(button.querySelector('strong').textContent, folder.name);
  assert.equal(button.querySelector('small').textContent, path);
  assert.equal(fragment.querySelector('参考, 人物'), null);
  assert.equal(fragment.querySelector('[data-library-select], [data-library-menu-toggle]'), null);
});

test("global search renders separate nonempty result groups with the supplied counts", () => {
  const options = {
    folders: view.renderSearchFolder({ folder: { id: "folder", name: "人物" }, path: "默认目录 / 人物", space: "personal" }),
    folderCount: 1,
    media: view.renderMediaCard({ media: { id: "media", name: "人物.png" } }),
    mediaCount: 1,
    entities: view.renderEntityCard({ entity: { id: "entity", name: "人物设定" } }),
    entityCount: 1,
  };
  const fragment = JSDOM.fragment(view.renderSearchGroups(options));
  assert.deepEqual([...fragment.children].map((element) => element.dataset.libraryResultHeading || element.dataset.libraryFolder || element.dataset.libraryMedia || element.dataset.libraryEntity), ["folders", "folder", "media", "media", "entities", "entity"]);
  assert.deepEqual([...fragment.querySelectorAll('[data-library-result-heading] span')].map((element) => element.textContent), ["1", "1", "1"]);
  const filtered = JSDOM.fragment(view.renderSearchGroups({ ...options, folderCount: 0, entityCount: 0 }));
  assert.equal(filtered.querySelectorAll('[data-library-result-heading]').length, 1);
  assert.equal(filtered.querySelector('[data-library-result-heading]').dataset.libraryResultHeading, "media");
  assert.equal(filtered.querySelector('[data-library-folder], [data-library-entity]'), null);
  assert.equal(view.renderSearchGroups({ ...options, folderCount: 0, mediaCount: 0, entityCount: 0 }), "");
});

test("mixed search selection disables incompatible cards and offers separate select-all kinds", () => {
  for (const render of [
    (options) => view.renderMediaCard({ media: { id: "media", name: "人物.png" }, mutable: true, ...options }),
    (options) => view.renderEntityCard({ entity: { id: "entity", name: "人物设定" }, mutable: true, ...options }),
  ]) {
    const blocked = JSDOM.fragment(render({ selectionMode: true, selectionDisabled: true }));
    assert.equal(blocked.querySelector('[data-library-preview]').disabled, true);
    assert.equal(blocked.querySelector('[data-library-select]').disabled, true);
    assert.equal(blocked.querySelector('[data-library-select]').title, "仅可同时选择同类结果");
    assert.equal(blocked.querySelector('[data-library-menu-toggle]'), null);
    const permitted = JSDOM.fragment(render({ selectionMode: true, selectionDisabled: false }));
    assert.equal(permitted.querySelector('[data-library-preview]').disabled, false);
    assert.equal(permitted.querySelector('[data-library-select]').disabled, false);
  }
  const chooser = JSDOM.fragment(view.renderCommandBar({
    mutable: true, selectionMode: true, menu: "select-kind",
    selectionKinds: [{ kind: "media", label: "素材", count: 3 }, { kind: "entity", label: "主体", count: 2 }],
  }));
  const menu = chooser.querySelector('[role="menu"]');
  assert.equal(menu.getAttribute('aria-label'), "选择结果类型");
  assert.deepEqual([...menu.querySelectorAll('[data-library-select-kind]')].map((button) => [button.dataset.librarySelectKind, button.textContent]), [["media", "全选素材3"], ["entity", "全选主体2"]]);
  assert.equal(menu.querySelector('[data-library-select-kind="folder"]'), null);
});

test("grouped search reconciliation preserves loaded previews when headings and result groups change", (t) => {
  const dom = new JSDOM("<div id='grid'></div>");
  t.after(() => dom.window.close());
  const grid = dom.window.document.querySelector('#grid');
  const media = { id: "media", name: "镜头.mp4", mediaKind: "video", url: "https://example.test/video.mp4" };
  const entity = { id: "entity", name: "人物设定" };
  const options = {
    folders: "", folderCount: 0,
    media: view.renderMediaCard({ media }), mediaCount: 1,
    entities: view.renderEntityCard({ entity, coverPreview: { mediaKind: "image", url: "https://example.test/cover.png" } }), entityCount: 1,
  };
  view.syncGrid(grid, view.renderSearchGroups(options));
  const mediaHeading = grid.querySelector('[data-library-result-heading="media"]');
  const entityHeading = grid.querySelector('[data-library-result-heading="entities"]');
  const video = grid.querySelector('video');
  const image = grid.querySelector('img');
  video.currentTime = 4.5;
  grid.scrollTop = 100;
  view.syncGrid(grid, view.renderSearchGroups({ ...options, folderCount: 1,
    folders: view.renderSearchFolder({ folder: { id: "folder", name: "镜头参考" }, path: "默认目录 / 镜头参考", space: "personal" }),
    media: options.media + view.renderMediaCard({ media: { id: "second", name: "镜头.png" } }), mediaCount: 2,
  }));
  assert.equal(grid.querySelector('[data-library-result-heading="media"]'), mediaHeading);
  assert.equal(mediaHeading.querySelector('span').textContent, "2");
  assert.equal(grid.querySelector('[data-library-result-heading="entities"]'), entityHeading);
  assert.equal(grid.querySelector('video'), video);
  assert.equal(video.currentTime, 4.5);
  assert.equal(grid.querySelector('img'), image);
  assert.equal(grid.scrollTop, 100);
  view.syncGrid(grid, view.renderSearchGroups({ ...options, entityCount: 0 }));
  assert.equal(grid.querySelector('[data-library-result-heading="folders"], [data-library-result-heading="entities"]'), null);
  assert.equal(grid.querySelector('video'), video);
  assert.equal(grid.querySelector('[data-library-result-heading="media"]'), mediaHeading);
  assert.equal(mediaHeading.querySelector('span').textContent, "1");
});

test("subject details opened from search return to search results without losing their identity", () => {
  const fragment = JSDOM.fragment(view.renderEntityMediaFilter({ entity: { id: "subject", name: "人物设定" }, searchReturn: true }));
  const back = fragment.querySelector('[data-library-clear-entity-filter]');
  assert.equal(back.getAttribute('aria-label'), "返回搜索结果");
  assert.equal(back.title, "返回搜索结果");
  assert.equal(back.textContent, "搜索结果");
  assert.equal(fragment.querySelector('.asset-library-entity-filter-label strong').textContent, "人物设定");
});
