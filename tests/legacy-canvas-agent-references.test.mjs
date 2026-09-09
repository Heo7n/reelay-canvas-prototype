import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const sources = await Promise.all([
  "canvas-prompt-document.js", "canvas-popover-placement.js", "canvas-reference-order.js", "canvas-reference-strip-controller.js", "canvas-agent-references.js",
].map((file) => readFile(new URL(`../src/legacy-canvas/${file}`, import.meta.url), "utf8")));

function fixture(t) {
  const dom = new JSDOM(`<!doctype html><body><main><textarea id="prompt">保留原来的提示词</textarea>
    <div id="shelf"></div><input id="files" type="file"><button id="outside">其他按钮</button></main></body>`, {
    runScripts: "outside-only", url: "https://reelay.test/", pretendToBeVisual: true,
  });
  const view = dom.window;
  const document = view.document;
  const shelf = document.querySelector("#shelf");
  const fileInput = document.querySelector("#files");
  const prompt = document.querySelector("#prompt");
  let conversation = { id: "conversation-a", messages: [] };
  let projectId = "project-a";
  let editable = true;
  let serial = 0;
  let clock = 0;
  let changes = 0;
  let chooserClicks = 0;
  const timers = new Map();
  const frames = new Map();
  const revoked = [];
  const blobs = [];
  const mediaCreated = [];
  const notices = [];
  const nativeCreate = document.createElement.bind(document);
  document.createElement = (tag, options) => {
    const element = nativeCreate(tag, options);
    if (["img", "video", "audio"].includes(tag)) mediaCreated.push(element);
    return element;
  };
  view.HTMLMediaElement.prototype.pause = () => {};
  view.HTMLMediaElement.prototype.load = () => {};
  view.URL.createObjectURL = (file) => {
    const url = `blob:https://reelay.test/${blobs.length + 1}`;
    blobs.push({ url, file }); return url;
  };
  view.URL.revokeObjectURL = (url) => revoked.push(url);
  view.setTimeout = (callback, delay) => { const id = ++serial; timers.set(id, { callback, due: clock + delay }); return id; };
  view.clearTimeout = (id) => timers.delete(id);
  view.requestAnimationFrame = (callback) => { const id = ++serial; frames.set(id, callback); return id; };
  view.cancelAnimationFrame = (id) => frames.delete(id);
  fileInput.click = () => { chooserClicks++; };
  const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
  view.HTMLElement.prototype.getBoundingClientRect = function bounds() {
    if (this === shelf) return rect(100, 350, 300, 36);
    if (this.matches("[data-reference-key]")) return rect(100 + [...shelf.children].indexOf(this) * 44, 350, 36, 36);
    if (this.matches(".reference-preview-popover")) return rect(0, 0, 240, 200);
    return rect(0, 0, 1024, 768);
  };
  Object.defineProperties(shelf, { clientWidth: { value: 300 }, scrollWidth: { value: 300 } });
  const escapeHtml = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  sources.forEach((source) => view.eval(source));
  const controller = view.REELAY_CANVAS_AGENT_REFERENCES.createController({
    document, shelf, fileInput,
    getScope: () => ({ projectId, conversation }), isEditable: () => editable,
    sanitizeUrl: (url) => /^(https:\/\/|blob:|\/)/.test(url || "") ? String(url) : "",
    getAssetType: (file) => file.type?.split("/")[0],
    getAssetLabel: (asset) => asset.name || "未命名素材", escapeHtml,
    assetPreview: (asset) => asset.type === "audio" ? '<span class="audio-wave">声音</span>'
      : `<${asset.type === "image" ? "img" : "video"} src="${escapeHtml(asset.url)}" draggable="false"></${asset.type === "image" ? "img" : "video"}>`,
    onChange: () => changes++, showMessage: (message) => notices.push(message),
    referenceOrder: view.REELAY_CANVAS_REFERENCE_ORDER, referenceStrip: view.REELAY_CANVAS_REFERENCE_STRIP,
    placeAnchoredPopover: view.REELAY_CANVAS_POPOVER_PLACEMENT.placeAnchoredPopover,
  });
  t.after(() => { controller.dispose(); view.close(); });
  function tick(duration) {
    clock += duration;
    for (const [id, timer] of [...timers]) if (timer.due <= clock && timers.delete(id)) timer.callback();
  }
  return {
    view, document, shelf, fileInput, prompt, controller, notices, revoked, blobs, mediaCreated, timers, frames,
    conversation: () => conversation, project: () => projectId, changes: () => changes,
    setScope: (nextConversation, nextProject = projectId) => { conversation = nextConversation; projectId = nextProject; controller.refresh(); },
    clearActiveConversation: () => { conversation = null; },
    setEditable: (next) => { editable = next; controller.refresh(); },
    chooserClicks: () => chooserClicks,
    selectFiles: (files) => { Object.defineProperty(fileInput, "files", { configurable: true, value: files }); fileInput.dispatchEvent(new view.Event("change")); },
    key: (target, key, options = {}) => target.dispatchEvent(new view.KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, ...options })),
    hover: (target) => target.dispatchEvent(new view.MouseEvent("pointerover", { bubbles: true, relatedTarget: document.body })),
    tick,
  };
}

const plain = (value) => JSON.parse(JSON.stringify(value));
const media = (type, id = type) => ({ id, type, name: `${type} 参考`, url: `https://assets.test/${id}`,
  ...(type === "image" ? { width: 600, height: 1200 } : { duration: 8 }) });
const file = (name, type, size = 4096) => ({ name, type, size, lastModified: 100 });

test("mixed image, video and audio references number within their own type, rejecting unsafe or unsupported input", (t) => {
  const f = fixture(t);
  const original = [media("image"), media("video"), media("audio")];
  const added = f.controller.addAssets([...original, media("text"), { ...media("image", "bad"), url: "javascript:alert(1)" }]);
  assert.equal(added.length, 3);
  assert.deepEqual(plain(f.controller.getAssets().map((asset) => asset.type)), ["image", "video", "audio"]);
  assert.deepEqual([...f.shelf.querySelectorAll(".reference-number")].map((element) => element.textContent), ["1", "1", "1"]);
  assert.equal(f.shelf.querySelectorAll(".agent-reference-card").length, 3);
  assert.equal(f.shelf.querySelectorAll("img").length, 1);
  assert.equal(f.shelf.querySelectorAll("video").length, 1);
  assert.equal(f.shelf.querySelectorAll(".audio-wave").length, 1);
  assert.equal(f.shelf.hidden, false);
  assert.equal(f.shelf.children[1].getAttribute("aria-label"), "视频1：video 参考，拖动可排序");
  assert.ok(f.shelf.children[0].querySelector(".asset-remove svg path"));
  assert.equal(f.controller.addAssets(original).length, 0);
  assert.equal(f.controller.getAssets().length, 3);
  assert.equal(original[0].id, "image");
  added[0].name = "不能污染控制器";
  assert.equal(f.controller.getAssets()[0].name, "image 参考");
  assert.equal(f.notices.length, 1);
});

test("refresh, append and keyboard reorder retain existing media nodes and never touch prompt state", (t) => {
  const f = fixture(t);
  f.controller.addAssets([media("image"), media("video")]);
  f.prompt.focus(); f.prompt.setSelectionRange(2, 5); f.prompt.scrollTop = 64;
  const first = f.shelf.children[0];
  const video = f.shelf.querySelector("video");
  f.controller.refresh();
  f.controller.addAssets([media("audio")]);
  assert.equal(f.shelf.children[0], first);
  assert.equal(f.shelf.querySelector("video"), video);
  assert.equal(f.document.activeElement, f.prompt);
  assert.equal(f.prompt.selectionStart, 2);
  assert.equal(f.prompt.selectionEnd, 5);
  assert.equal(f.prompt.scrollTop, 64);
  first.focus();
  f.key(first, "ArrowRight", { altKey: true });
  assert.deepEqual(plain(f.controller.getAssets().map((asset) => asset.type)), ["video", "image", "audio"]);
  assert.equal(f.shelf.children[1], first);
  assert.equal(f.document.activeElement, first);
  assert.equal(f.shelf.querySelector("video"), video);
  assert.equal(first.querySelector(".reference-number").textContent, "1");
  assert.equal(f.prompt.value, "保留原来的提示词");
});

test("reordering or removing a same-type reference updates ordinals without changing stable keys", (t) => {
  const f = fixture(t);
  f.controller.addAssets([media("image", "first"), media("video"), media("image", "second"), media("audio")]);
  const [first, video, second, audio] = [...f.shelf.children];
  const sourceKeys = f.controller.getEntries().map((entry) => entry.key);
  first.focus();
  f.key(first, "ArrowRight", { altKey: true });
  f.key(first, "ArrowRight", { altKey: true });
  assert.deepEqual([...f.shelf.children], [video, second, first, audio]);
  assert.equal(first.querySelector(".reference-number").textContent, "2");
  assert.equal(second.querySelector(".reference-number").textContent, "1");
  assert.equal(first.dataset.referenceKey, sourceKeys[0]);
  const detached = f.controller.getEntries();
  detached[0].asset.name = "不应修改草稿";
  assert.equal(f.controller.getEntries()[0].asset.name, "video 参考");
  second.querySelector(".asset-remove").click();
  assert.equal(first.querySelector(".reference-number").textContent, "1");
  assert.equal(first.dataset.referenceKey, sourceKeys[0]);
});

test("all three media kinds use the shared hover preview outside canvas nodes without autoplay", (t) => {
  const f = fixture(t);
  f.controller.addAssets([media("image"), media("video"), media("audio")]);
  for (const [index, type] of ["image", "video", "audio"].entries()) {
    f.controller.close();
    f.hover(f.shelf.children[index]); f.tick(220);
    const preview = f.document.querySelector(".reference-preview-popover");
    assert.ok(preview);
    const element = preview.querySelector(type === "image" ? "img" : type);
    assert.equal(element.src, `https://assets.test/${type}`);
    if (type !== "image") {
      assert.equal(element.controls, true);
      assert.equal(element.autoplay, false);
      assert.equal(element.preload, "metadata");
    }
    assert.equal(preview.querySelector(".reference-preview-label").textContent, `${{ image: "图片", video: "视频", audio: "音频" }[type]}1 · ${type} 参考`);
  }
});

test("local files are deduplicated and only video/audio duration is read, with no extra image metadata request", (t) => {
  const f = fixture(t);
  const inputs = [file("portrait.png", "image/png"), file("clip.mp4", "video/mp4"), file("voice.mp3", "audio/mpeg")];
  const added = f.controller.addFiles(inputs);
  assert.equal(added.length, 3);
  assert.equal(f.controller.addFiles(inputs).length, 0);
  assert.equal(f.blobs.length, 3);
  assert.deepEqual(f.mediaCreated.map((element) => element.tagName), ["VIDEO", "AUDIO"]);
  const [video, audio] = f.mediaCreated;
  Object.defineProperty(video, "duration", { value: 12.4 });
  Object.defineProperty(audio, "duration", { value: 3.5 });
  video.dispatchEvent(new f.view.Event("loadedmetadata"));
  audio.dispatchEvent(new f.view.Event("loadedmetadata"));
  const assets = f.controller.getAssets();
  assert.equal(assets[0].width, undefined); assert.equal(assets[0].height, undefined);
  assert.equal(assets[1].duration, 12.4);
  assert.equal(assets[2].duration, 3.5);
  assert.equal(f.changes(), 3);
  assert.equal(f.timers.size, 0);
});

test("conversation object identity isolates drafts and stale file dialog results cannot land after switching away and back", (t) => {
  const f = fixture(t);
  const first = f.conversation();
  f.controller.addAssets([media("image")]);
  assert.equal(f.controller.hasDraft(first), true);
  assert.equal(f.controller.chooseFiles(), true);
  assert.equal(f.chooserClicks(), 1);
  const second = { id: first.id, messages: [] };
  f.setScope(second);
  assert.equal(f.controller.getAssets().length, 0);
  assert.equal(f.controller.hasDraft(second), false);
  f.setScope(first);
  f.selectFiles([file("old.mp4", "video/mp4")]);
  assert.equal(f.blobs.length, 0);
  assert.equal(f.controller.getAssets().length, 1);
  const oldScope = f.controller.captureScope();
  f.setScope(second);
  assert.equal(f.controller.addAssets([media("video")], oldScope).length, 0);
  f.controller.chooseFiles(); f.selectFiles([file("new.mp4", "video/mp4")]);
  assert.equal(f.controller.getAssets()[0].name, "new.mp4");
  f.setScope(first);
  assert.equal(f.controller.getAssets()[0].name, "image 参考");
});

test("a metadata result in a background conversation cannot refresh or mutate the active draft, and deleted entries stay removed", (t) => {
  const f = fixture(t);
  const first = f.conversation();
  f.controller.addFiles([file("clip.mp4", "video/mp4")]);
  const probe = f.mediaCreated[0];
  f.setScope({ id: "conversation-b" });
  f.controller.addAssets([media("image")]);
  const changes = f.changes();
  Object.defineProperty(probe, "duration", { value: 18 });
  probe.dispatchEvent(new f.view.Event("loadedmetadata"));
  assert.equal(f.changes(), changes);
  assert.deepEqual(plain(f.controller.getAssets().map((asset) => asset.type)), ["image"]);
  f.setScope(first);
  assert.equal(f.controller.getAssets()[0].duration, 18);
  f.controller.addFiles([file("voice.mp3", "audio/mpeg")]);
  const removedProbe = f.mediaCreated.at(-1);
  f.shelf.children[1].querySelector("[data-reference-remove]").click();
  const afterRemove = f.changes();
  removedProbe.dispatchEvent(new f.view.Event("loadedmetadata"));
  assert.equal(f.controller.getAssets().length, 1);
  assert.equal(f.changes(), afterRemove);
});

test("readonly blocks picker, additions, removal, reorder, sending and pending file results while still allowing preview", (t) => {
  const f = fixture(t);
  f.controller.addAssets([media("image"), media("video")]);
  f.controller.chooseFiles();
  f.setEditable(false);
  f.selectFiles([file("late.mp3", "audio/mpeg")]);
  assert.equal(f.controller.chooseFiles(), false);
  assert.equal(f.controller.addFiles([file("late.mp3", "audio/mpeg")]).length, 0);
  assert.equal(f.controller.addAssets([media("audio")]).length, 0);
  assert.equal(f.controller.takeForMessage().length, 0);
  f.key(f.shelf.children[0], "ArrowRight", { altKey: true });
  assert.equal(f.shelf.querySelector("[data-reference-remove]").disabled, true);
  assert.deepEqual(plain(f.controller.getAssets().map((asset) => asset.type)), ["image", "video"]);
  f.hover(f.shelf.children[0]); f.tick(220);
  assert.ok(f.document.querySelector(".reference-preview-popover img"));
  assert.equal(f.blobs.length, 0);
});

test("sending clears the draft but keeps local Blob URLs alive until their last owning conversation is released", (t) => {
  const f = fixture(t);
  const first = f.conversation();
  f.controller.addFiles([file("clip.mp4", "video/mp4"), file("voice.mp3", "audio/mpeg")]);
  const refs = f.controller.takeForMessage();
  assert.equal(refs.length, 2);
  assert.equal(f.controller.getAssets().length, 0);
  assert.equal(f.controller.hasDraft(first), false);
  assert.equal(f.shelf.hidden, true);
  assert.deepEqual(f.revoked, []);
  const second = { id: "conversation-b" };
  f.setScope(second);
  f.controller.addAssets([refs[0], media("image")]);
  f.controller.releaseConversation(first);
  assert.deepEqual(f.revoked, [refs[1].url]);
  f.shelf.children[0].querySelector("[data-reference-remove]").click();
  assert.deepEqual(f.revoked, [refs[1].url, refs[0].url]);
  f.controller.releaseConversation(second);
  assert.equal(f.revoked.length, 2);
  assert.equal(f.timers.size, 0);
  f.controller.dispose();
  assert.equal(f.revoked.length, 2);
});

test("removing unsent files revokes only owned URLs; dispose releases remaining owned URLs exactly once", (t) => {
  const f = fixture(t);
  f.controller.addFiles([file("local.png", "image/png")]);
  f.controller.addAssets([{ ...media("image", "external"), url: "blob:external-owner" }]);
  f.shelf.children[0].querySelector("[data-reference-remove]").click();
  assert.deepEqual(f.revoked, [f.blobs[0].url]);
  assert.equal(f.document.activeElement, f.shelf.children[0]);
  f.controller.addFiles([file("local2.mp4", "video/mp4")]);
  f.controller.dispose(); f.controller.dispose();
  assert.deepEqual(f.revoked, f.blobs.map((item) => item.url));
  assert.equal(f.revoked.includes("blob:external-owner"), false);
  assert.equal(f.shelf.children.length, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(f.frames.size, 0);
});

test("file and session memory caps include sent messages while remote references have no arbitrary item cap", (t) => {
  const f = fixture(t);
  const limit = 64 * 1024 * 1024;
  assert.equal(f.controller.addFiles([file("empty.png", "image/png", 0), file("large.mp4", "video/mp4", limit + 1)]).length, 0);
  assert.equal(f.blobs.length, 0);
  assert.equal(f.controller.addFiles([file("a.mp4", "video/mp4", limit), file("b.mp4", "video/mp4", limit)]).length, 2);
  f.controller.takeForMessage();
  assert.equal(f.controller.addFiles([file("c.mp4", "video/mp4", 1)]).length, 0);
  assert.match(f.notices.at(-1), /128 MiB/);
  assert.equal(f.controller.addAssets(Array.from({ length: 30 }, (_, index) => media("image", `image-${index}`))).length, 30);
  f.controller.releaseConversation(f.conversation());
  f.setScope({ id: "conversation-b" });
  assert.equal(f.controller.addFiles([file("c.mp4", "video/mp4", 1)]).length, 1);
});

test("released conversations and project scope changes cannot revive references through stale callbacks", (t) => {
  const f = fixture(t);
  const original = f.conversation();
  f.controller.addFiles([file("clip.mp4", "video/mp4")]);
  const stale = f.controller.captureScope();
  f.controller.releaseConversation(original);
  assert.equal(f.controller.getAssets().length, 0);
  assert.equal(f.controller.addAssets([media("image")], stale).length, 0);
  assert.equal(f.controller.addAssets([media("image")]).length, 0);
  f.setScope({ id: "other" }, "project-b");
  assert.equal(f.controller.addFiles([file("new.mp4", "video/mp4")], stale).length, 0);
  assert.equal(f.controller.addAssets([media("image")]).length, 1);
  f.setScope(f.conversation(), "project-a");
  assert.equal(f.controller.getAssets().length, 0);
  assert.equal(f.controller.addAssets([media("video")]).length, 0);
});

test("releasing the active conversation remains safe when history has already removed its scope", (t) => {
  const f = fixture(t);
  const removed = f.conversation();
  f.controller.addFiles([file("clip.mp4", "video/mp4")]);
  f.clearActiveConversation();
  assert.doesNotThrow(() => f.controller.releaseConversation(removed));
  assert.equal(f.controller.hasDraft(removed), false);
  assert.equal(f.controller.hasDraft(null), false);
  assert.equal(f.controller.captureScope(), null);
  assert.equal(f.controller.getAssets().length, 0);
  assert.equal(f.controller.takeForMessage().length, 0);
  assert.equal(f.controller.chooseFiles(), false);
  assert.equal(f.shelf.hidden, true);
  assert.equal(f.revoked.length, 1);
});

test("metadata error and timeout release readers without deleting usable references", (t) => {
  const f = fixture(t);
  f.controller.addFiles([file("clip.mp4", "video/mp4"), file("voice.mp3", "audio/mpeg")]);
  f.mediaCreated[0].dispatchEvent(new f.view.Event("error"));
  assert.equal(f.mediaCreated[0].getAttribute("src"), null);
  f.tick(12000);
  assert.equal(f.mediaCreated[1].getAttribute("src"), null);
  assert.equal(f.controller.getAssets().length, 2);
  assert.equal(f.timers.size, 0);
});
