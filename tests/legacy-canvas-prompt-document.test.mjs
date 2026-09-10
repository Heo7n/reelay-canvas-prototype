import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const context = vm.createContext({});
vm.runInContext(await readFile(new URL("../src/legacy-canvas/canvas-prompt-document.js", import.meta.url), "utf8"), context);
const model = context.REELAY_CANVAS_PROMPT_DOCUMENT;
const plain = (value) => JSON.parse(JSON.stringify(value));
const text = (value) => ({ type: "text", text: value });
const reference = (key, mediaType = "image", fallbackLabel = "图片2") => ({ type: "reference", key, mediaType, fallbackLabel });
const doc = (...content) => ({ version: 1, content });
const entry = (key, type = "image", extra = {}) => ({ key, asset: { id: key.split(":").slice(1).join(":"), type, url: `/media/${key}`, ...extra } });

test("old plain prompts become one text fragment without interpreting @, HTML or printed reference names", () => {
  const original = "让图片1说：@幽影 <b>hello</b>\n第二行";
  assert.deepEqual(plain(model.normalize(original)), doc(text(original)));
  assert.equal(model.toText(original), original);
  assert.equal(model.hasReferences(original), false);
  assert.deepEqual(plain(model.normalize("")), doc());
  for (const invalid of [null, undefined, false, 42, [], {}, { version: 2, content: [text("future")] }]) {
    assert.deepEqual(plain(model.normalize(invalid)), doc());
  }
});

test("normalization merges text, normalizes line endings and ignores unknown fields without mutating input", () => {
  const original = doc(text("第一\r\n"), text("第二\r第三"), { ...reference("asset:one"), html: "unsafe" }, text(""));
  const before = structuredClone(original);
  const normalized = model.normalize(original);
  assert.deepEqual(plain(normalized), doc(text("第一\n第二\n第三"), reference("asset:one")));
  assert.deepEqual(original, before);
  assert.notEqual(normalized.content[1], original.content[2]);
});

test("reference keys and types are validated without guessing a replacement identity", () => {
  const normalized = model.normalize(doc(
    reference("asset:"), reference("asset: space "), reference("asset:" + "a".repeat(201)),
    reference("node:wrong"), reference("asset:bad\nkey"), reference("asset:good", "document"),
    reference("connection:valid:colon", "video", "  视频2\n  "),
    reference("asset:good", "audio", ""), null, { type: "html", text: "unsafe" },
  ));
  assert.deepEqual(plain(normalized), doc(reference("connection:valid:colon", "video", "视频2"), reference("asset:good", "audio", "音频")));
  assert.equal(model.hasReferences(normalized), true);
});

test("canonical validation rejects transactions that normalization would silently alter", () => {
  assert.equal(model.isDocument(doc()), true);
  assert.equal(model.isDocument(doc(text("正文"), reference("asset:one"))), true);
  for (const invalid of ["plain", { ...doc(), unknown: true }, doc(text("")), doc(text("a"), text("b")),
    doc(text("\r\n")), doc({ ...text("a"), marks: [] }), doc({ type: "reference", key: "asset:a", mediaType: "image" }),
    doc(reference("asset:missing", "image", " leading ")), doc(reference("asset: ")),
    doc(text("a".repeat(model.limits.length + 1))), doc({ type: "text", text: 5 })]) {
    assert.equal(model.isDocument(invalid), false, JSON.stringify(invalid).slice(0, 140));
  }
});

test("document limits bound text and structure and do not split surrogate pairs", () => {
  assert.equal(model.toText("a".repeat(20_001)).length, model.limits.length);
  assert.equal(model.toText("a".repeat(19_999) + "😀"), "a".repeat(19_999));
  assert.equal(model.normalize(doc(...Array.from({ length: 700 }, () => reference("asset:one")))).content.length, model.limits.references);
  const parts = Array.from({ length: model.limits.parts + 20 }, (_, index) => text(String(index % 10)));
  assert.equal(model.toText(doc(...parts)).length, model.limits.parts);
  const almostFull = model.normalize(doc(text("x".repeat(19_999)), reference("asset:one"), text("extra")));
  assert.deepEqual(plain(almostFull), doc(text("x".repeat(19_999)), reference("asset:one")));
  assert.equal(model.normalize(doc(reference("asset:one", "image", "x".repeat(120)))).content[0].fallbackLabel.length, model.limits.label);
});

test("reference numbering follows current strip order independently for images, videos and audio", () => {
  const entries = [entry("asset:i1"), entry("connection:v1", "video"), entry("asset:i2"), entry("asset:a1", "audio"), entry("asset:v2", "video")];
  entries[0].label = "角色全身图";
  entries[1].sourceNodeId = "upstream";
  entries[1].connectionId = "v1";
  const index = model.referenceIndex(entries);
  assert.deepEqual(Array.from(index, (item) => item.label), ["图片1", "视频1", "图片2", "音频1", "视频2"]);
  assert.equal(index[0].name, "角色全身图");
  assert.equal(index[0].asset, entries[0].asset);
  assert.equal(index[1].sourceNodeId, "upstream");
  assert.equal(index[1].connectionId, "v1");
  assert.equal(model.referenceIndex(model.resolve("", entries).media)[0].name, "角色全身图");
  assert.deepEqual(Array.from(model.referenceIndex([entries[2], entries[0]]), (item) => [item.key, item.label]), [["asset:i2", "图片1"], ["asset:i1", "图片2"]]);
});

test("duplicate keys and unsupported media cannot inflate numbering or media counts", () => {
  const first = entry("asset:one");
  const entries = [null, {}, entry("bad"), entry("asset:text", "text"), first, entry("asset:one", "video"), entry("asset:two")];
  const index = model.referenceIndex(entries);
  assert.deepEqual(Array.from(index, (item) => item.label), ["图片1", "图片2"]);
  assert.equal(index[0].asset, first.asset);
  assert.deepEqual(plain(model.referenceIndex(null)), []);
});

test("plain projection uses identity after reorder and preserves fallback on removal or media type change", () => {
  const prompt = doc(text("让"), reference("asset:character"), text("进入"), reference("asset:scene", "image", "图片1"));
  const original = [entry("asset:scene"), entry("asset:character")];
  assert.equal(model.toText(prompt, original), "让图片2进入图片1");
  assert.equal(model.toText(prompt, original.toReversed()), "让图片1进入图片2");
  assert.equal(model.toText(prompt, [entry("asset:other"), entry("asset:scene")] ), "让图片2进入图片2");
  assert.equal(model.toText(doc(reference("asset:character")), [entry("asset:character", "video")]), "图片2");
  assert.deepEqual(prompt.content[1], reference("asset:character"));
});

test("resolution freezes complete ordered input and counts each repeated prompt reference once", () => {
  const entries = [entry("asset:character", "image", { metadata: { version: 1, tags: ["portrait"] } }), entry("asset:music", "audio", { duration: 8 })];
  const prompt = doc(reference("asset:character"), text("走向"), reference("asset:character"));
  const snapshot = model.resolve(prompt, entries);
  assert.equal(snapshot.valid, true);
  assert.equal(snapshot.text, "图片1走向图片1");
  assert.equal(snapshot.media.length, 2, "unmentioned attached audio remains a generation input");
  assert.equal(snapshot.references.length, 1);
  assert.deepEqual(plain(snapshot.references[0]), { key: "asset:character", mediaType: "image", label: "图片1", ordinal: 1, mediaIndex: 0, occurrences: [0, 2] });
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.document.content[0]), true);
  assert.equal(Object.isFrozen(snapshot.media[0].asset.metadata.tags), true);
  entries[0].asset.metadata.tags.push("changed");
  entries[1].asset.duration = 999;
  prompt.content[1].text = "later edit";
  assert.deepEqual(plain(snapshot.media[0].asset.metadata.tags), ["portrait"]);
  assert.equal(snapshot.media[1].asset.duration, 8);
  assert.equal(snapshot.document.content[1].text, "走向");
  assert.equal(Object.isFrozen(entries[0].asset), false);
});

test("removed references stay explicit until their exact key returns, never rebinding to a same-number input", () => {
  const prompt = doc(reference("connection:old", "video", "视频1"), text("后"), reference("connection:old", "video", "视频1"));
  const missing = model.resolve(prompt, [entry("connection:new", "video")]);
  assert.equal(missing.valid, false);
  assert.equal(missing.missing.length, 1);
  assert.equal(missing.missing[0].reason, "removed");
  assert.equal(missing.references[0].mediaIndex, null);
  assert.equal(missing.document.content[0].key, "connection:old");
  const restored = model.resolve(prompt, [entry("connection:old", "video")]);
  assert.equal(restored.valid, true);
  assert.equal(restored.references[0].mediaIndex, 0);
});

test("unavailable media and a changed upstream type produce distinct blocking reasons", () => {
  const prompt = doc(reference("asset:waiting"), text("与"), reference("connection:changed", "video", "视频1"));
  const result = model.resolve(prompt, [entry("asset:waiting", "image", { url: "" }), entry("connection:changed", "audio")]);
  assert.equal(result.valid, false);
  assert.equal(result.missing[0].reason, "unavailable");
  assert.equal(result.mismatched[0].actualType, "audio");
  assert.equal(result.mismatched[0].reason, "type-mismatch");
  assert.equal(result.text, "图片1与视频1");
  assert.equal(result.media.length, 2);
});

test("different expected types for the same source cannot hide a mismatch through deduplication", () => {
  const result = model.resolve(doc(reference("connection:same", "video", "视频1"), reference("connection:same")), [entry("connection:same", "video")]);
  assert.equal(result.references.length, 1);
  assert.equal(result.media.length, 1);
  assert.equal(result.mismatched.length, 1);
  assert.equal(result.valid, false);
});

test("snapshot captures current upstream output and remains stable after later output replacement", () => {
  const linked = entry("connection:inbound", "image", { id: "result1", url: "/first" });
  const prompt = doc(reference(linked.key));
  const first = model.resolve(prompt, [linked]);
  linked.asset = { type: "image", id: "result2", url: "/second" };
  const second = model.resolve(prompt, [linked]);
  assert.equal(first.media[0].asset.id, "result1");
  assert.equal(second.media[0].asset.id, "result2");
  assert.equal(first.references[0].key, second.references[0].key);
});

test("copy remapping rewrites only known stable IDs and retains absent mappings as broken bindings", () => {
  const prompt = doc(reference("asset:old"), text("→"), reference("connection:copied", "video", "视频1"), reference("connection:external", "audio", "音频1"));
  const mapped = model.remap(prompt, { assetIds: new Map([["old", "new"]]), connectionIds: new Map([["copied", "new-link"]]) });
  assert.deepEqual(Array.from(mapped.content.filter((part) => part.type === "reference"), (part) => part.key), ["asset:new", "connection:new-link", "connection:external"]);
  const result = model.resolve(mapped, [entry("asset:new"), entry("connection:new-link", "video")]);
  assert.equal(result.missing[0].key, "connection:external");
  assert.equal(prompt.content[0].key, "asset:old");
  assert.deepEqual(plain(model.remap(prompt)), prompt);
  assert.equal(model.remap(prompt, { assetIds: new Map([["old", " "]]) }).content[0].key, "asset:old");
});

test("optimization transforms only text and preserves reference atoms including deleted sources", () => {
  const prompt = doc(text(" 角色 "), reference("asset:a"), text(" 行动 "), reference("connection:removed", "video", "视频2"));
  const calls = [];
  const result = model.optimize(prompt, (value, index) => { calls.push([value, index]); return value.trim(); });
  assert.deepEqual(calls, [[" 角色 ", 0], [" 行动 ", 2]]);
  assert.deepEqual(plain(result), doc(text("角色"), reference("asset:a"), text("行动"), reference("connection:removed", "video", "视频2")));
  assert.deepEqual(plain(model.optimize(prompt, () => undefined)), prompt);
  assert.deepEqual(plain(model.optimize(prompt)), prompt);
  assert.throws(() => model.optimize(prompt, () => { throw new Error("provider failed"); }), /provider failed/);
  assert.equal(prompt.content[0].text, " 角色 ");
});

test("long optimization reserves space for later references instead of truncating atoms", () => {
  const prompt = doc(text("a"), reference("asset:a"), text("b"), reference("asset:b"));
  const optimized = model.optimize(prompt, () => "x".repeat(30_000));
  assert.equal(optimized.content[0].text.length, model.limits.length - 2);
  assert.deepEqual(Array.from(optimized.content.filter((part) => part.type === "reference"), (part) => part.key), ["asset:a", "asset:b"]);
  assert.equal(model.isDocument(optimized), true);
});

test("snapshot safely omits circular and callable metadata without freezing source objects", () => {
  const assetEntry = entry("asset:a");
  assetEntry.asset.self = assetEntry.asset;
  assetEntry.asset.callback = () => {};
  assetEntry.asset.metadata = JSON.parse('{"__proto__":{"polluted":true},"constructor":"bad","safe":true}');
  const result = model.resolve(doc(reference("asset:a")), [assetEntry]);
  assert.equal(result.valid, true);
  assert.equal(result.media[0].asset.self, undefined);
  assert.equal(result.media[0].asset.callback, undefined);
  assert.deepEqual(plain(result.media[0].asset.metadata), { safe: true });
  assert.equal(Object.isFrozen(assetEntry.asset), false);
});
