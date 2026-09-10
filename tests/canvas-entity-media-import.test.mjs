import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../src/legacy-canvas/canvas-entity-media-import.js", import.meta.url), "utf8");
const context = vm.createContext({ URL, Blob, Uint8Array });
new vm.Script(source, { filename: "canvas-entity-media-import.js" }).runInContext(context);
const { createEntityMediaImport, inspectImportSource } = context.REELAY_CANVAS_ENTITY_MEDIA_IMPORT;
const baseUrl = "https://reelay.test/index.html";
const raw = (id = "local-1", extra = {}) => ({ id, type: "image", name: `${id}.png`, url: `blob:https://reelay.test/${id}`, ...extra });
const checksumFile = async (file) => createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex");
const checksum = createHash("sha256").update("image-bytes").digest("hex");
const saved = (id = "saved-1", extra = {}) => ({
  id, workspaceAssetId: id, librarySourceId: id, mediaKind: "image", displayName: "saved.png",
  checksumSha256: checksum, byteSize: 11, url: `/api/workspaces/workspace-1/media-assets/${id}/content`, ...extra,
});
const flush = () => new Promise((resolve) => setImmediate(resolve));

function harness(options = {}) {
  let scope = "workspace-1:actor-1";
  let valid = true;
  const personal = [];
  const fetches = [];
  const uploads = [];
  const importer = createEntityMediaImport({
    getPersonalMedia: () => personal,
    getBaseUrl: () => baseUrl,
    getScopeKey: () => scope,
    checksumFile,
    fetchMedia: async (url, init) => {
      fetches.push({ url, init });
      return new Response("image-bytes", { headers: { "content-type": "image/png" } });
    },
    persistFile: async (file, metadata) => {
      uploads.push({ file, metadata });
      return saved(`saved-${uploads.length}`, { displayName: metadata.displayName });
    },
    onImported: (media) => personal.push(media),
    ...options,
  });
  return { importer, personal, uploads, fetches, prepare: (media) => importer.prepareMedia(media, { isContextValid: () => valid }),
    setScope: (next) => { scope = next; }, invalidate: () => { valid = false; } };
}

test("only local readable media and controlled static assets are eligible for deferred import", () => {
  for (const url of ["blob:https://reelay.test/local", "data:image/png;base64,aGk=", "/assets/home/portrait.png", "./assets/audio/voice.mp3"]) {
    const media = raw("one", { url, type: url.endsWith("mp3") ? "audio" : "image" });
    assert.equal(inspectImportSource(media, { baseUrl }).allowed, true, url);
  }
  for (const url of ["blob:https://other.test/local", "https://other.test/pic.png", "/api/private/image.png", "/assets/file.txt",
    "/assets/../private/image.png", "data:text/html,aGk=", "data:image/svg+xml,aGk=", "javascript:alert(1)", "", "https://user:password@reelay.test/assets/a.png"]) {
    assert.equal(inspectImportSource(raw("one", { url }), { baseUrl }).allowed, false, url);
  }
  assert.equal(inspectImportSource(raw("one", { workspaceAssetId: "another-user-asset" }), { baseUrl }).allowed, false);
  assert.equal(inspectImportSource(raw("one", { projectAssetReferenceId: "project-ref" }), { baseUrl }).allowed, false);
  assert.equal(inspectImportSource(raw("one", { type: "text" }), { baseUrl }).allowed, false);
});

test("existing personal media are reused by stable aliases without reading or uploading", async () => {
  const h = harness();
  h.personal.push(saved());
  const result = await h.prepare([raw("clone-1", { librarySourceId: "saved-1" }), raw("clone-2", { workspaceAssetId: "saved-1" })]);
  assert.equal(result.media.length, 1);
  assert.equal(result.idMap.get("clone-1"), "saved-1");
  assert.equal(result.idMap.get("clone-2"), "saved-1");
  assert.equal(result.importedCount, 0);
  assert.equal(h.fetches.length, 0);
  assert.equal(h.uploads.length, 0);
});

test("confirmation imports into personal root, returns canonical IDs, and leaves source records unchanged", async () => {
  const h = harness();
  const selected = raw();
  const before = JSON.stringify(selected);
  assert.equal(h.uploads.length, 0);
  const result = await h.prepare([selected]);
  assert.equal(h.uploads.length, 1);
  assert.equal(h.uploads[0].metadata.target, "personal");
  assert.equal(h.uploads[0].metadata.displayName, "local-1.png");
  assert.match(h.uploads[0].metadata.idempotencyKey, /^entity-media-v1-[a-f\d]{64}$/);
  assert.equal(h.uploads[0].metadata.folderId, undefined);
  assert.equal(h.fetches[0].init.redirect, "error");
  assert.equal(result.importedCount, 1);
  assert.equal(result.idMap.get("local-1"), "saved-1");
  assert.equal(result.media[0].checksumSha256, checksum);
  assert.equal(JSON.stringify(selected), before);
});

test("actual binary checksum reuses same personal media even when source URLs and names differ", async () => {
  const h = harness();
  h.personal.push(saved("existing"));
  const result = await h.prepare([raw("one"), raw("two")]);
  assert.equal(h.fetches.length, 2);
  assert.equal(h.uploads.length, 0);
  assert.equal(result.media.length, 1);
  assert.equal(result.idMap.get("one"), "existing");
  assert.equal(result.idMap.get("two"), "existing");
});

test("untrusted asserted checksum never grants reuse without reading actual bytes", async () => {
  const h = harness();
  h.personal.push(saved("existing", { checksumSha256: "a".repeat(64) }));
  const result = await h.prepare([raw("one", { checksumSha256: "a".repeat(64), byteSize: 11 })]);
  assert.equal(h.fetches.length, 1);
  assert.equal(h.uploads.length, 1);
  assert.equal(result.media[0].checksumSha256, checksum);
});

test("reopening a draft resolves imported aliases only while the current personal catalog contains the record", async () => {
  const h = harness();
  await h.prepare([raw()]);
  assert.equal(h.importer.resolvePersonalMedia(raw()).id, "saved-1");
  await h.prepare([raw()]);
  assert.equal(h.fetches.length, 1);
  assert.equal(h.uploads.length, 1);
  h.personal.length = 0;
  assert.equal(h.importer.resolvePersonalMedia(raw()), null);
  h.personal.push(saved());
  h.setScope("workspace-2:actor-2");
  assert.equal(h.importer.resolvePersonalMedia(raw()), null);
});

test("all sources are preflighted before creating any personal media", async () => {
  const h = harness();
  await assert.rejects(h.prepare([raw(), raw("other", { workspaceAssetId: "not-personal" })]), /尚不属于个人素材库/);
  assert.equal(h.fetches.length, 0);
  assert.equal(h.uploads.length, 0);
});

test("partial failures retain completed personal media and reuse them on retry", async () => {
  let fail = true;
  const requests = [];
  const h = harness({
    fetchMedia: async (url) => new Response(url, { headers: { "content-type": "image/png" } }),
    persistFile: async (file, metadata) => {
      requests.push(metadata);
      if (metadata.displayName === "two.png" && fail) throw new Error("暂时离线");
      return saved(metadata.displayName, { checksumSha256: await checksumFile(file), byteSize: file.size });
    },
  });
  await assert.rejects(h.prepare([raw("one"), raw("two")]), /已入库的 1 个素材会保留/);
  assert.equal(h.personal.length, 1);
  fail = false;
  const result = await h.prepare([raw("one"), raw("two")]);
  assert.equal(h.personal.length, 2);
  assert.equal(requests.length, 3);
  assert.equal(requests[1].idempotencyKey, requests[2].idempotencyKey);
  assert.equal(result.media.length, 2);
});

test("recreated importer retries the same bytes and metadata using the same upload idempotency key", async () => {
  const keys = [];
  const persistFile = async (_file, metadata) => { keys.push(metadata.idempotencyKey); throw new Error("network"); };
  await assert.rejects(harness({ persistFile }).prepare([raw()]), /network/);
  await assert.rejects(harness({ persistFile }).prepare([raw()]), /network/);
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);
});

test("concurrent requests for identical bytes share one upload and preserve both caller mappings", async () => {
  let finish;
  let count = 0;
  const h = harness({ persistFile: async () => { count += 1; return new Promise((resolve) => { finish = resolve; }); } });
  const first = h.prepare([raw("one")]);
  const second = h.prepare([raw("two")]);
  await flush();
  assert.equal(count, 1);
  finish(saved());
  const results = await Promise.all([first, second]);
  assert.equal(results[0].idMap.get("one"), "saved-1");
  assert.equal(results[1].idMap.get("two"), "saved-1");
});

test("scope changes after reading stop before upload", async () => {
  let finish;
  const h = harness({ fetchMedia: () => new Promise((resolve) => { finish = resolve; }) });
  const operation = h.prepare([raw()]);
  h.invalidate();
  finish(new Response("image-bytes", { headers: { "content-type": "image/png" } }));
  await assert.rejects(operation, /画布或访问权限已变化/);
  assert.equal(h.uploads.length, 0);
});

test("closing a draft during upload preserves completed media but prevents next media and Entity submission", async () => {
  let finish;
  let count = 0;
  const h = harness({ persistFile: async () => { count += 1; return new Promise((resolve) => { finish = resolve; }); } });
  const operation = h.prepare([raw("one"), raw("two")]);
  await flush();
  h.invalidate();
  finish(saved());
  await assert.rejects(operation, /画布或访问权限已变化/);
  assert.equal(count, 1);
  assert.equal(h.personal.length, 1);
  assert.equal(h.importer.resolvePersonalMedia(raw("one")).id, "saved-1");
});

test("switching workspace while upload completes never registers it into the next catalog", async () => {
  let finish;
  const h = harness({ persistFile: async () => new Promise((resolve) => { finish = resolve; }) });
  const operation = h.prepare([raw()]);
  await flush();
  h.setScope("workspace-2:actor-2");
  finish(saved());
  await assert.rejects(operation, /画布或访问权限已变化/);
  assert.equal(h.personal.length, 0);
});

test("media MIME, empty bodies, redirects and byte limits reject before upload", async (t) => {
  const variants = [
    ["wrong MIME", () => new Response("hi", { headers: { "content-type": "text/html" } }), /内容类型/],
    ["SVG", () => new Response("hi", { headers: { "content-type": "image/svg+xml" } }), /内容类型/],
    ["empty", () => new Response("", { headers: { "content-type": "image/png" } }), /素材为空/],
    ["declared size", () => new Response("hi", { headers: { "content-type": "image/png", "content-length": "99" } }), /大小限制/],
    ["streamed size", () => new Response("x".repeat(30), { headers: { "content-type": "image/png" } }), /大小限制/],
    ["failed fetch", () => new Response("no", { status: 404 }), /素材读取失败/],
    ["redirected", () => ({ ok: true, redirected: true }), /素材读取失败/],
  ];
  for (const [name, response, message] of variants) {
    await t.test(name, async () => {
      const h = harness({ fetchMedia: async () => response(), maxUploadBytes: 20 });
      await assert.rejects(h.prepare([raw()]), message);
      assert.equal(h.uploads.length, 0);
    });
  }
});

test("same checksum of different media kind never reuses an incompatible personal asset", async () => {
  const h = harness();
  h.personal.push(saved("audio", { mediaKind: "audio" }));
  const result = await h.prepare([raw()]);
  assert.equal(h.uploads.length, 1);
  assert.equal(result.media[0].mediaKind, "image");
});

test("invalid batch size or missing identity does not produce side effects", async () => {
  const h = harness();
  for (const media of [[], Array.from({ length: 101 }, (_, index) => raw(String(index))), [raw(null)]]) {
    await assert.rejects(h.prepare(media), /1 至 100|缺少稳定标识/);
  }
  assert.equal(h.fetches.length, 0);
});
