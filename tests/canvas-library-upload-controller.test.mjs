import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { require as requireTs } from "tsx/cjs/api";
const { buildMediaUploadPolicy } = requireTs("../src/domain/asset/media-upload-policy.ts", import.meta.url);

const context = vm.createContext({ URL, Blob });
new vm.Script(await readFile(new URL("../src/legacy-canvas/canvas-library-upload-controller.js", import.meta.url), "utf8")).runInContext(context);
function fixture(overrides = {}) {
  const blobs = [], revoked = [], drafts = [], additions = [], errors = [];
  let sequence = 0, picked = 0;
  const saveController = { open(entries, options) { drafts.push({ entries, options }); return true; },
    appendEntries(entries) { additions.push(entries); return entries.map(({ asset }) => asset.id); },
    showError: message => errors.push(message), ...overrides.saveController };
  const controller = context.REELAY_CANVAS_LIBRARY_UPLOAD_CONTROLLER.createLibraryUploadController({
    isMutable: () => true, getUploadPolicy: () => buildMediaUploadPolicy(64 * 1024 * 1024), getScopeKey: () => "project-a:canvas-a:account-a",
    pickFiles: () => { picked++; },
    createObjectURL: (blob) => { blobs.push(blob); return `blob:https://reelay.test/${blobs.length}`; },
    revokeObjectURL: (url) => revoked.push(url), makeId: () => String(++sequence),
    ...overrides, saveController,
  });
  return { controller, blobs, revoked, drafts, additions, errors, get picked() { return picked; },
    choose(files) { drafts.at(-1).options.onChooseFiles(); return controller.complete(files); } };
}
const file = (name, type = "", size = 8) => Object.assign(new Blob([new Uint8Array(size)], { type }), { name });

test("library upload opens an empty shared draft before any local chooser or file read", () => {
  const f = fixture();
  assert.equal(f.controller.open({ space: "organization", folderId: "leaf" }), true);
  assert.equal(f.drafts.length, 1);
  assert.equal(f.drafts[0].entries.length, 0);
  assert.equal(f.drafts[0].options.space, "organization");
  assert.equal(f.drafts[0].options.folderId, "leaf");
  assert.equal(f.drafts[0].options.intent, "upload");
  assert.equal(f.picked, 0); assert.equal(f.blobs.length, 0);
  f.drafts[0].options.onChooseFiles();
  assert.equal(f.picked, 1);
  f.controller.cancel();
  assert.equal(f.controller.complete([file("取消.png")]), false);
  assert.equal(f.blobs.length, 0);
  assert.equal(f.drafts.length, 1);
});

test("successive local choices append typed previews without reopening or resetting the draft", () => {
  const f = fixture();
  f.controller.open({ folderId: "original-leaf" });
  const image = file("角色.png", "image/png");
  assert.equal(f.choose([image, file("镜头.MOV")]), true);
  assert.equal(f.choose([file("旁白.m4a")]), true);
  assert.equal(f.drafts.length, 1);
  assert.deepEqual(f.additions.map(values => Array.from(values, ({ asset }) => asset.mediaKind)), [["image", "video"], ["audio"]]);
  assert.deepEqual(f.blobs.map(blob => blob.type), ["image/png", "video/quicktime", "audio/mp4"]);
  assert.equal(f.blobs[0], image);
  const first = f.additions[0][0].asset.id;
  f.drafts[0].options.onRemoveItem(first);
  assert.deepEqual(f.revoked, ["blob:https://reelay.test/1"]);
  f.drafts[0].options.onRelease(); f.drafts[0].options.onRelease();
  assert.deepEqual(f.revoked, ["blob:https://reelay.test/1", "blob:https://reelay.test/2", "blob:https://reelay.test/3"]);
});

test("each format advertised by the upload dialog is accepted with its matching media kind", () => {
  const f = fixture();
  f.controller.open();
  const formats = f.drafts[0].options.uploadPolicy.library.formats;
  assert.deepEqual(Array.from(formats, (group) => group.mediaKind), ["image", "video", "audio"]);
  for (const group of formats) {
    assert.equal(f.choose(Object.keys(group.extensions).map((extension) => file(`upload.${extension}`))), true);
    assert.equal(f.additions.at(-1).length, Object.keys(group.extensions).length);
    assert.ok(f.additions.at(-1).every(({ asset }) => asset.mediaKind === group.mediaKind));
  }
  assert.equal(f.errors.length, 0);
});

test("invalid additions are rejected as a batch while existing previews remain editable", () => {
  for (const invalid of [file("animation.gif", "image/gif"), file("a.png", "image/jpeg"), file("empty.png", "image/png", 0), file("a.constructor")]) {
    const f = fixture();
    f.controller.open(); f.choose([file("existing.png")]);
    assert.equal(f.choose([file("ok.png"), invalid]), false);
    assert.match(f.errors.at(-1), /文件类型|文件为空/);
    assert.equal(f.blobs.length, 1); assert.equal(f.additions.length, 1);
    assert.equal(f.revoked.length, 0);
    assert.equal(f.choose([file("replacement.png")]), true);
  }
});

test("upload count applies across chooser rounds and removing an item frees capacity", () => {
  const f = fixture(); f.controller.open();
  assert.equal(f.choose(Array.from({ length: 100 }, () => file("ok.png"))), true);
  assert.equal(f.choose([file("extra.png")]), false);
  assert.match(f.errors.at(-1), /100/);
  assert.equal(f.blobs.length, 100);
  f.drafts[0].options.onRemoveItem(f.additions[0][0].asset.id);
  assert.equal(f.choose([file("extra.png")]), true);
  assert.equal(f.blobs.length, 101);
});

test("account and experience size limits reject before allocating previews", () => {
  for (const limit of [4, 50]) {
    const f = fixture({ getUploadPolicy: () => buildMediaUploadPolicy(limit * 1024 * 1024) }); f.controller.open();
    assert.equal(f.choose([{ name: "large.png", type: "image/png", size: limit * 1024 * 1024 + 1 }]), false);
    assert.match(f.errors.at(-1), new RegExp(`${limit} MB`));
    assert.equal(f.blobs.length, 0);
  }
});

test("library intake uses host policy for SVG, WebM, precise chooser formats and MIME-specific limits", () => {
  let accept;
  const policy = buildMediaUploadPolicy(64 * 1024 * 1024);
  const f = fixture({ getUploadPolicy: () => policy, pickFiles: (input) => { accept = input.accept; } });
  f.controller.open();
  assert.equal(f.choose([file("logo.SVG", "image/svg+xml"), file("shot.webm", "video/webm"), file("sound.wav", "audio/x-wav")]), true);
  assert.deepEqual(f.blobs.map((blob) => blob.type), ["image/svg+xml", "video/webm", "audio/wav"]);
  assert.ok(accept.includes(".svg")); assert.ok(accept.includes(".webm")); assert.ok(!accept.includes("*"));
  assert.equal(f.choose([{ name: "long.mp4", type: "video/mp4", size: 50 * 1024 * 1024 + 1 }]), false);
  assert.equal(f.choose([{ name: "large.svg", type: "image/svg+xml", size: 4 * 1024 * 1024 + 1 }]), false);
  assert.match(f.errors.at(-1), /4 MB/);
  const waiting = fixture({ getUploadPolicy: () => null });
  assert.throws(() => waiting.controller.open(), /尚未就绪/);
  assert.equal(waiting.drafts.length, 0);
});

test("OS audio MIME aliases normalize against the same allowed filename extension", () => {
  const f = fixture(); f.controller.open();
  assert.equal(f.choose([file("lossless.flac", "audio/x-flac"), file("recording.m4a", "audio/x-m4a"),
    file("sample.aac", "audio/x-aac"), file("voice.ogg", "application/ogg")]), true);
  assert.deepEqual(f.blobs.map((blob) => blob.type), ["audio/flac", "audio/mp4", "audio/aac", "audio/ogg"]);
  for (const invalid of [file("video.webm", "application/ogg"), file("wrong.mp3", "audio/x-aac"), file("alias.oga", "application/ogg")]) {
    assert.equal(f.choose([invalid]), false);
  }
});

test("failed allocation or append releases only the attempted addition", () => {
  let allocation = 0;
  const f = fixture({ createObjectURL() { if (++allocation === 3) throw new Error("allocation failed"); return `blob:${allocation}`; } });
  f.controller.open(); f.choose([file("existing.png")]);
  assert.equal(f.choose([file("one.png"), file("two.png")]), false);
  assert.deepEqual(f.revoked, ["blob:2"]);
  assert.equal(f.additions.length, 1);
  assert.match(f.errors.at(-1), /allocation failed/);
  const blocked = fixture({ saveController: { appendEntries() { throw new Error("正在保存"); } } });
  blocked.controller.open(); assert.equal(blocked.choose([file("one.png")]), false);
  assert.equal(blocked.revoked.length, 1);
});

test("a replaced draft releases its previews and an old file chooser cannot fill the new draft", () => {
  const f = fixture(); f.controller.open(); f.choose([file("existing.png")]);
  f.drafts[0].options.onChooseFiles();
  f.controller.open({ space: "organization" });
  assert.equal(f.revoked.length, 1);
  assert.equal(f.controller.complete([file("stale.png")]), false);
  f.drafts[0].options.onRelease();
  assert.equal(f.choose([file("new.png")]), true);
  assert.equal(f.additions.length, 2);
});

test("stale, revoked and cancelled chooser completions cannot allocate previews", () => {
  let scope = "original", mutable = true;
  const f = fixture({ getScopeKey: () => scope, isMutable: () => mutable });
  f.controller.open(); f.drafts[0].options.onChooseFiles(); scope = "other-project";
  assert.equal(f.controller.complete([file("a.png")]), false);
  f.controller.open(); f.drafts[1].options.onChooseFiles(); mutable = false;
  assert.equal(f.controller.complete([file("a.png")]), false);
  assert.equal(f.controller.open(), false);
  mutable = true; f.controller.open();
  f.drafts[2].options.onChooseFiles(); f.controller.cancel();
  assert.equal(f.controller.complete([file("a.png")]), false);
  assert.equal(f.choose([]), false);
  assert.equal(f.controller.complete([file("a.png")]), false);
  assert.equal(f.blobs.length, 0);
  assert.equal(f.errors.length, 0);
});

test("unsupported spaces and failed empty dialog opening leave no active chooser", () => {
  const f = fixture();
  assert.throws(() => f.controller.open({ space: "platform" }), /个人或组织/);
  assert.equal(f.blobs.length, 0);
  const blocked = fixture({ saveController: { open: () => false } });
  assert.equal(blocked.controller.open(), false);
  assert.equal(blocked.controller.complete([file("a.png")]), false);
  assert.equal(blocked.blobs.length, 0);
});
