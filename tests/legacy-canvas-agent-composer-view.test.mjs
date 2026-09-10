import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const [source, placementSource, promptSource] = await Promise.all([
  "canvas-agent-composer-view.js", "canvas-popover-placement.js", "canvas-prompt-document.js",
].map((file) => readFile(new URL(`../src/legacy-canvas/${file}`, import.meta.url), "utf8")));

function fixture(t) {
  const dom = new JSDOM(`<!doctype html><body>
    <section id="composer"><textarea id="prompt">保留我的提示词</textarea>
      <button id="add">添加</button><div id="menu" class="hidden" role="menu">
        <button data-agent-reference-source="local">本地上传</button>
        <button data-agent-reference-source="library">资产库</button>
        <button data-agent-reference-source="canvas">画布选中素材</button></div>
      <div class="agent-composer-top-actions"><button id="agentPromptOptimizationBtn">优化</button>
      <button id="agentAdvancedBtn">高级设置</button></div>
    </section><div id="messages"></div><button id="outside">其他</button></body>`, { runScripts: "outside-only" });
  const view = dom.window;
  const document = view.document;
  const composer = document.querySelector("#composer");
  const prompt = document.querySelector("#prompt");
  const add = document.querySelector("#add");
  const menu = document.querySelector("#menu");
  const messages = document.querySelector("#messages");
  const outside = document.querySelector("#outside");
  const calls = [];
  const frames = new Map();
  let nextFrame = 0;
  let scope = { projectId: "project-a", conversation: { id: "conversation-a", messages: [] } };
  let busy = false;
  let selected = [];
  let previewOptions;
  let previewClose = 0;
  let previewDispose = 0;
  view.requestAnimationFrame = (callback) => { const id = ++nextFrame; frames.set(id, callback); return id; };
  view.cancelAnimationFrame = (id) => frames.delete(id);
  const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
  add.getBoundingClientRect = () => rect(850, 650, 36, 36);
  menu.getBoundingClientRect = () => rect(0, 0, 210, 138);
  view.eval(placementSource);
  view.eval(promptSource);
  view.eval(source);
  const escapeHtml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  const controller = view.REELAY_CANVAS_AGENT_COMPOSER_VIEW.createController({
    document, composer, addButton: add, menu, messages,
    getScope: () => scope, isBusy: () => busy, getSelectedAssets: () => selected,
    onChooseFiles: (captured) => calls.push({ action: "local", scope: captured }),
    onLibrary: (captured) => calls.push({ action: "library", scope: captured }),
    onAddSelected: (assets, captured) => calls.push({ action: "selected", assets, scope: captured }),
    onDropFiles: (files, captured) => calls.push({ action: "files", files, scope: captured }),
    onDropLibrary: (transfer, captured) => calls.push({ action: "drop-library", transfer, scope: captured }),
    hasLibraryDrag: (transfer) => transfer.types?.includes("application/reelay-assets"),
    closeOtherPopovers: () => calls.push({ action: "close-other" }),
    escapeHtml, getAssetLabel: (asset) => asset.name,
    assetPreview: (asset) => `<span data-media-type="${asset.type}" data-url="${escapeHtml(asset.url || "")}"></span>`,
    sanitizeUrl: (url) => /^(https:|blob:)/.test(String(url)) ? url : "",
    referenceStrip: { createController: (options) => {
      previewOptions = options;
      return { close: () => previewClose++, dispose: () => previewDispose++ };
    } },
    placeAnchoredPopover: view.REELAY_CANVAS_POPOVER_PLACEMENT.placeAnchoredPopover,
  });
  const pointer = (target) => target.dispatchEvent(new view.MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
  const key = (target, name, options = {}) => {
    const event = new view.KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true, ...options });
    target.dispatchEvent(event); return event;
  };
  const drag = (type, target, transfer, relatedTarget = null) => {
    const event = new view.MouseEvent(type, { bubbles: true, cancelable: true, relatedTarget });
    Object.defineProperty(event, "dataTransfer", { value: transfer });
    target.dispatchEvent(event); return event;
  };
  t.after(() => { controller.dispose(); view.close(); });
  return { view, document, composer, prompt, add, menu, messages, outside, calls, frames, controller, pointer, key, drag,
    get scope() { return scope; }, set scope(value) { scope = value; },
    set busy(value) { busy = value; }, set selected(value) { selected = value; },
    get previews() { return previewOptions; }, get previewClose() { return previewClose; }, get previewDispose() { return previewDispose; },
    frame() { for (const [id, callback] of [...frames]) if (frames.delete(id)) callback(); },
  };
}

test("reference menu portals above its trigger, preserves prompt draft and routes the chosen source to its scope", (t) => {
  const f = fixture(t);
  const original = f.scope;
  f.prompt.focus(); f.prompt.setSelectionRange(2, 5); f.prompt.scrollTop = 23;
  assert.equal(f.controller.setMenuOpen(true), true);
  assert.equal(f.menu.parentNode, f.document.body);
  assert.equal(f.menu.style.position, "fixed");
  assert.equal(f.menu.dataset.placement, "top-start");
  assert.ok(Number.parseFloat(f.menu.style.left) <= 802);
  assert.equal(f.menu.querySelector('[data-agent-reference-source="canvas"]').disabled, true);
  assert.equal(f.document.activeElement, f.prompt);
  f.menu.querySelector('[data-agent-reference-source="local"]').click();
  assert.equal(f.menu.hidden, true);
  assert.equal(f.calls.at(-1).action, "local");
  assert.equal(f.calls.at(-1).scope.conversation, original.conversation);
  assert.equal(f.prompt.value, "保留我的提示词");
  assert.equal(f.prompt.selectionStart, 2);
  assert.equal(f.prompt.selectionEnd, 5);
  assert.equal(f.prompt.scrollTop, 23);
  assert.equal(f.frames.size, 0);
  f.selected = [{ id: "image", type: "image" }];
  f.controller.setMenuOpen(true);
  f.menu.querySelector('[data-agent-reference-source="canvas"]').click();
  assert.equal(f.calls.at(-1).action, "selected");
  assert.equal(f.calls.at(-1).assets[0].id, "image");
});

test("menu supports keyboard navigation, Escape, outside click and focus dismissal without canvas side effects", (t) => {
  const f = fixture(t);
  f.add.focus();
  assert.equal(f.key(f.add, "ArrowDown").defaultPrevented, true);
  assert.equal(f.document.activeElement.dataset.agentReferenceSource, "local");
  f.key(f.document.activeElement, "ArrowUp");
  assert.equal(f.document.activeElement.dataset.agentReferenceSource, "library");
  assert.equal(f.key(f.document.activeElement, "Escape").defaultPrevented, true);
  assert.equal(f.menu.hidden, true);
  assert.equal(f.document.activeElement, f.add);
  f.controller.setMenuOpen(true); f.pointer(f.outside);
  assert.equal(f.menu.hidden, true);
  f.controller.setMenuOpen(true); f.outside.focus();
  assert.equal(f.menu.hidden, true);
  assert.equal(f.document.activeElement, f.outside);
});

test("stale conversation/project menu actions and newly busy menus are refused", (t) => {
  const f = fixture(t);
  f.controller.setMenuOpen(true);
  f.scope = { ...f.scope, conversation: { ...f.scope.conversation } };
  f.menu.querySelector('[data-agent-reference-source="library"]').click();
  assert.equal(f.calls.filter((call) => call.action === "library").length, 0);
  f.controller.setMenuOpen(true);
  f.scope = { ...f.scope, projectId: "project-b" };
  f.frame();
  assert.equal(f.menu.hidden, true);
  f.controller.setMenuOpen(true);
  f.busy = true; f.frame();
  assert.equal(f.menu.hidden, true);
  assert.equal(f.controller.setMenuOpen(true), false);
});

test("composer consumes file/library drops locally and rejects stale or busy transfers", (t) => {
  const f = fixture(t);
  const files = { types: ["Files"], files: [new f.view.File(["a"], "photo.png", { type: "image/png" })] };
  let bubbledDrops = 0;
  f.document.addEventListener("drop", () => bubbledDrops++);
  assert.equal(f.drag("dragover", f.prompt, files).defaultPrevented, true);
  assert.equal(files.dropEffect, "copy");
  assert.equal(f.composer.classList.contains("agent-reference-drop-active"), true);
  f.drag("drop", f.prompt, files);
  assert.equal(f.calls.at(-1).action, "files");
  assert.equal(f.calls.at(-1).files[0].name, "photo.png");
  assert.equal(bubbledDrops, 0);
  const library = { types: ["application/reelay-assets"], files: [] };
  f.drag("dragover", f.composer, library); f.drag("drop", f.composer, library);
  assert.equal(f.calls.at(-1).action, "drop-library");
  const count = f.calls.length;
  f.drag("dragover", f.composer, files);
  f.scope = { ...f.scope, conversation: { id: "new", messages: [] } };
  f.drag("drop", f.composer, files);
  assert.equal(f.calls.length, count);
  f.busy = true;
  f.drag("dragover", f.composer, files); f.drag("drop", f.composer, files);
  assert.equal(files.dropEffect, "none");
  assert.equal(f.calls.length, count);
  assert.equal(f.composer.classList.contains("agent-reference-drop-active"), false);
  assert.equal(f.drag("drop", f.outside, files).defaultPrevented, false);
  assert.equal(bubbledDrops, 1);
});

test("media drops are claimed before the nested editor can insert their plain-text fallback", (t) => {
  const f = fixture(t);
  let editorDrops = 0;
  f.prompt.addEventListener("drop", (event) => {
    editorDrops++;
    f.prompt.value += event.dataTransfer.getData("text/plain");
  });
  const library = { types: ["application/reelay-assets", "text/plain"], files: [], getData: () => "asset-one\nasset-two" };
  f.drag("dragover", f.prompt, library);
  assert.equal(f.drag("drop", f.prompt, library).defaultPrevented, true);
  assert.equal(editorDrops, 0);
  assert.equal(f.prompt.value, "保留我的提示词");
  assert.equal(f.calls.at(-1).action, "drop-library");
  f.busy = true;
  f.drag("drop", f.prompt, library);
  assert.equal(editorDrops, 0, "a rejected media transfer must not leak IDs either");
  const text = { types: ["text/plain"], files: [], getData: () => "普通文字" };
  assert.equal(f.drag("drop", f.prompt, text).defaultPrevented, false);
  assert.equal(editorDrops, 1, "ordinary text drops still reach the editor");
});

test("Agent hides and disables only generation top actions while retaining the same prompt element", (t) => {
  const f = fixture(t);
  f.prompt.focus(); f.prompt.setSelectionRange(1, 3);
  f.controller.syncMode("agent");
  for (const id of ["agentPromptOptimizationBtn", "agentAdvancedBtn"]) {
    const button = f.document.getElementById(id);
    assert.equal(button.hidden, true); assert.equal(button.disabled, true);
  }
  assert.equal(f.add.hidden, false);
  assert.equal(f.document.activeElement, f.prompt);
  assert.equal(f.prompt.selectionStart, 1);
  f.controller.syncMode("generation");
  assert.equal(f.document.getElementById("agentAdvancedBtn").hidden, false);
  assert.equal(f.document.getElementById("agentAdvancedBtn").disabled, false);
  assert.equal(f.document.getElementById("agentPromptOptimizationBtn").disabled, true);
  assert.equal(f.document.getElementById("prompt"), f.prompt);
});

test("closing the composer during a drag never reroutes its eventual drop into another conversation", (t) => {
  const f = fixture(t);
  const files = { types: ["Files"], files: [new f.view.File(["a"], "photo.png", { type: "image/png" })] };
  f.drag("dragover", f.composer, files);
  f.controller.close();
  f.scope = { ...f.scope, conversation: { id: "new-conversation", messages: [] } };
  f.drag("dragleave", f.composer, files, f.outside);
  f.drag("dragover", f.composer, files);
  assert.equal(files.dropEffect, "none");
  f.drag("drop", f.composer, files);
  assert.equal(f.calls.filter((call) => call.action === "files").length, 0);
  f.drag("dragover", f.composer, files);
  f.drag("drop", f.composer, files);
  assert.equal(f.calls.at(-1).action, "files");
  assert.equal(f.calls.at(-1).scope.conversation, f.scope.conversation);

  f.drag("dragover", f.composer, files);
  f.controller.close();
  f.drag("drop", f.outside, files);
  f.drag("dragover", f.composer, files);
  assert.equal(files.dropEffect, "copy");
  f.view.dispatchEvent(new f.view.Event("dragend"));
  assert.equal(f.composer.classList.contains("agent-reference-drop-active"), false);
});

test("sent image/video/audio references use immutable previews, escaped content, stable scope, and no prompt rewrite", (t) => {
  const f = fixture(t);
  const conversation = f.scope.conversation;
  conversation.messages = [{ role: "user", content: '<script>alert("x")</script>\n第二行', references: [
    { id: "image", type: "image", name: "竖图", url: "https://example.test/image.png" },
    { id: "video", type: "video", name: "视频", url: "blob:video" },
    { id: "audio", type: "audio", name: "声音", url: "blob:audio" },
    { id: "unsafe", type: "image", name: '<img onerror="x">', url: "javascript:alert(1)" },
  ] }, { role: "agent", content: "可以继续创作。" }];
  f.controller.renderMessages(conversation);
  const cards = [...f.messages.querySelectorAll(".asset-card")];
  assert.equal(cards.length, 4);
  assert.deepEqual(cards.map((card) => card.querySelector(".reference-number").textContent), ["1", "1", "1", "2"]);
  assert.equal(f.messages.querySelector("script"), null);
  assert.equal(f.messages.querySelector(".agent-message-body").textContent, '<script>alert("x")</script>第二行');
  assert.equal(f.messages.querySelector(".agent-message-body br") !== null, true);
  assert.equal(f.messages.querySelector(".agent-message.agent .agent-message-role").textContent, "Reelay Agent");
  assert.equal(f.messages.querySelector(".agent-message.assistant"), null);
  assert.equal(f.previews.isCardEligible(cards[0]), true);
  const context = f.previews.getContext(cards[0]);
  assert.equal(context.node, conversation.messages[0]);
  assert.equal(context.canReorder, false);
  assert.deepEqual(Array.from(context.entries, (entry) => entry.asset.type), ["image", "video", "audio", "image"]);
  assert.equal(context.entries[3].asset.url, "");
  assert.equal(f.previews.onMove(), false);
  assert.equal(f.prompt.value, "保留我的提示词");
  f.scope = { ...f.scope, conversation: { id: conversation.id, messages: conversation.messages } };
  assert.equal(f.previews.getContext(cards[0]), null);
  f.controller.renderMessages(conversation);
  assert.equal(f.messages.children.length, 0);
});

test("structured messages render stable reference pills and previews from the sent snapshot", (t) => {
  const f = fixture(t);
  const model = f.view.REELAY_CANVAS_PROMPT_DOCUMENT;
  const entries = [
    { key: "connection:source", label: "角色", asset: { id: "hero", type: "image", name: "原始角色", url: "https://example.test/hero.png" } },
    { key: "asset:clip", label: "原始视频", asset: { id: "clip", type: "video", url: "blob:clip" } },
    { key: "asset:scene", label: "原始场景", asset: { id: "scene", type: "image", url: "https://example.test/scene.png" } },
  ];
  const draft = { version: 1, content: [
    { type: "text", text: "让 " },
    { type: "reference", key: "connection:source", mediaType: "image", fallbackLabel: "图片1" },
    { type: "text", text: " 进入 " },
    { type: "reference", key: "asset:scene", mediaType: "image", fallbackLabel: "图片2" },
    { type: "text", text: "\n动作参考 " },
    { type: "reference", key: "asset:clip", mediaType: "video", fallbackLabel: "视频1" },
  ] };
  const snapshot = model.resolve(draft, entries);
  f.scope.conversation.messages = [{ role: "user", content: snapshot.text,
    promptDocument: snapshot.document, referenceSnapshot: snapshot.media }];
  entries[0].asset.url = "https://example.test/replaced.png";
  entries.reverse();
  f.controller.renderMessages(f.scope.conversation);
  const pills = [...f.messages.querySelectorAll(".prompt-reference")];
  assert.deepEqual(pills.map((pill) => pill.querySelector(".prompt-reference-label").textContent), ["图片1", "图片2", "视频1"]);
  assert.deepEqual(pills.map((pill) => pill.dataset.referenceKey), ["connection:source", "asset:scene", "asset:clip"]);
  assert.equal(pills[0].getAttribute("contenteditable"), "false");
  assert.equal(pills[0].getAttribute("tabindex"), "0");
  assert.equal(pills[0].title, "图片1：角色");
  assert.equal(f.messages.querySelectorAll(".agent-message-body br").length, 1);
  assert.equal(f.previews.isCardEligible(pills[0]), true);
  assert.equal(f.previews.getContext(pills[0]).entries[0].asset.url, "https://example.test/hero.png");
  assert.equal(f.previews.getContext(pills[0]).canReorder, false);
  const cards = [...f.messages.querySelectorAll(".asset-card")];
  assert.deepEqual(cards.map((card) => card.querySelector(".reference-number").textContent), ["1", "1", "2"]);
  assert.equal(cards[0].dataset.referenceKey, pills[0].dataset.referenceKey);
});

test("missing, mismatched and unsafe message references remain explicit rather than binding a matching ordinal", (t) => {
  const f = fixture(t);
  f.scope.conversation.messages = [{ role: "user", content: "旧投影", promptDocument: { version: 1, content: [
    { type: "reference", key: "asset:removed", mediaType: "image", fallbackLabel: "图片1" },
    { type: "reference", key: "asset:mismatch", mediaType: "image", fallbackLabel: "图片2" },
    { type: "reference", key: "asset:unsafe", mediaType: "audio", fallbackLabel: "音频1" },
  ] }, referenceSnapshot: [
    { key: "asset:new", asset: { id: "new", type: "image", name: '<script>alert("x")</script>', url: "https://example.test/new.png" } },
    { key: "asset:mismatch", asset: { id: "mismatch", type: "video", name: "已变化", url: "blob:video" } },
    { key: "asset:unsafe", asset: { id: "unsafe", type: "audio", name: "不安全来源", url: "javascript:alert(1)" } },
  ] }];
  f.controller.renderMessages(f.scope.conversation);
  const pills = [...f.messages.querySelectorAll(".prompt-reference")];
  assert.equal(pills.length, 3);
  assert.equal(pills.every((pill) => pill.classList.contains("is-missing")), true);
  assert.equal(pills[0].querySelector(".prompt-reference-label").textContent, "图片1 · 已移除");
  assert.equal(f.previews.isCardEligible(pills[0]), false);
  assert.equal(f.messages.querySelector("script"), null);
  assert.equal(f.messages.querySelector('[data-url^="javascript:"]'), null);
});

test("dispose restores portal ownership and removes listeners, animation and preview lifecycle", (t) => {
  const f = fixture(t);
  f.controller.setMenuOpen(true);
  assert.equal(f.frames.size, 1);
  f.controller.dispose();
  assert.equal(f.frames.size, 0);
  assert.equal(f.menu.parentNode, f.composer);
  assert.equal(f.menu.hidden, true);
  assert.equal(f.previewDispose, 1);
  const count = f.calls.length;
  f.add.click();
  f.drag("drop", f.composer, { types: ["Files"], files: [] });
  assert.equal(f.calls.length, count);
});
