import { createHash } from "node:crypto";

import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { MediaUploadPolicySchema } from "../../domain/asset/media-upload-policy";
import { buildServer } from "../app";
import { createDemoSeed, DEMO_PASSWORD } from "../demo-fixtures";
import { ImagePreviewService } from "../infrastructure/ImagePreviewService";
import { InMemoryAssetStore } from "../infrastructure/InMemoryAssetStore";
import { InMemoryCollaborationStore } from "../infrastructure/InMemoryCollaborationStore";
import { InMemoryObjectStore } from "../infrastructure/InMemoryObjectStore";

const MIB = 1024 * 1024;
const workspaceUrl = "/api/workspaces/workspace-organization-reelay";
let app: FastifyInstance;
let assetStore: InMemoryAssetStore;
let objectStore: InMemoryObjectStore;

async function buildApp(maxAssetUploadBytes?: number, signedUpload = false, quotaLimit?: number) {
  const seed = createDemoSeed();
  assetStore = new InMemoryAssetStore({
    workspaceMemberships: seed.memberships.filter(({ actorId }) => actorId !== "actor-chenxi"),
    projects: seed.projects.map((project) => ({
      id: project.id, workspaceId: project.workspaceId,
      members: seed.projectMemberships.filter((member) => member.projectId === project.id)
        .map(({ actorId, role }) => ({ actorId, role })),
    })),
  }, undefined, undefined, undefined, quotaLimit === undefined ? undefined : { personal: quotaLimit, organization: quotaLimit });
  objectStore = new InMemoryObjectStore();
  if (signedUpload) Object.assign(objectStore, {
    getSignedUploadLimit: vi.fn(async () => 50 * MIB),
    createSignedUpload: vi.fn(async () => ({
      url: "https://storage.example/upload", method: "PUT", headers: {},
      maxFileBytes: 50 * MIB,
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    })),
  });
  return buildServer({ store: new InMemoryCollaborationStore(seed), assetStore, objectStore, maxAssetUploadBytes });
}

beforeEach(async () => { app = await buildApp(); });
afterEach(async () => { await app.close(); vi.restoreAllMocks(); });

async function login(account = "creator@reelay.test") {
  const response = await app.inject({ method: "POST", url: "/api/demo/session", payload: { account, password: DEMO_PASSWORD } });
  expect(response.statusCode).toBe(201);
  const cookies = response.headers["set-cookie"];
  return (Array.isArray(cookies) ? cookies[0] : String(cookies)).split(";")[0];
}

const baseIntent = {
  idempotencyKey: "library-policy-upload",
  uploadPurpose: "library",
  mediaKind: "image",
  displayName: "image.png",
  contentType: "image/png",
  byteSize: 1,
  checksumSha256: "a".repeat(64),
};

it("returns authenticated workspace policy with separate library and canvas limits", async () => {
  const url = `${workspaceUrl}/media-upload-policy`;
  expect((await app.inject({ method: "GET", url })).statusCode).toBe(401);
  const denied = await login("chenxi@reelay.test");
  expect((await app.inject({ method: "GET", url, headers: { cookie: denied } })).statusCode).toBe(404);
  const cookie = await login();
  const response = await app.inject({ method: "GET", url, headers: { cookie } });
  expect(response.statusCode).toBe(200);
  expect(response.headers["cache-control"]).toBe("private, no-store");
  const policy = MediaUploadPolicySchema.parse(response.json().policy);
  expect(policy.canvasMaxFileBytes).toBe(64 * MIB);
  expect(policy.library.maxFileBytes).toBe(50 * MIB);
  expect(policy.maxFileBytesByContentType).toEqual({ "image/svg+xml": 4 * MIB });
  expect(policy.library.formats.map((format) => Object.keys(format.extensions))).toEqual([
    ["jpg", "jpeg", "png", "webp", "svg"],
    ["mp4", "mov", "webm"],
    ["mp3", "wav", "m4a", "flac", "aac", "ogg"],
  ]);
});

it.each([
  ["image", "photo.JPG", "image/jpeg"],
  ["image", "image.jpeg", "image/jpeg"],
  ["image", "image.png", "image/png"],
  ["image", "image.webp", "image/webp"],
  ["image", "vector.svg", "image/svg+xml"],
  ["video", "movie.mp4", "video/mp4"],
  ["video", "camera.mov", "video/quicktime"],
  ["video", "transparent.webm", "video/webm"],
  ["audio", "sound.mp3", "audio/mpeg"],
  ["audio", "sound.wav", "audio/wav"],
  ["audio", "sound.wav", "audio/x-wav"],
  ["audio", "recording.m4a", "audio/mp4"],
  ["audio", "recording.flac", "audio/flac"],
  ["audio", "recording.flac", "audio/x-flac"],
  ["audio", "recording.m4a", "audio/x-m4a"],
  ["audio", "recording.aac", "audio/aac"],
  ["audio", "recording.aac", "audio/x-aac"],
  ["audio", "recording.ogg", "audio/ogg"],
  ["audio", "recording.ogg", "application/ogg"],
])("accepts library %s %s with its matching MIME", async (mediaKind, displayName, contentType) => {
  const cookie = await login();
  const response = await app.inject({ method: "POST", url: `${workspaceUrl}/media-upload-intents`, headers: { cookie },
    payload: { ...baseIntent, mediaKind, displayName, contentType } });
  expect(response.statusCode).toBe(201);
});

it.each([
  ["image", "animation.gif", "image/gif"],
  ["image", "image.avif", "image/avif"],
  ["image", "image.svg", "image/png"],
  ["image", "image.png", "image/svg+xml"],
  ["video", "movie.ogv", "video/ogg"],
  ["audio", "sound.oga", "audio/ogg"],
  ["audio", "sound.webm", "audio/webm"],
  ["audio", "sound.mp4", "audio/mp4"],
  ["image", "no extension", "image/png"],
])("rejects unsupported or mismatched new library input %s %s", async (mediaKind, displayName, contentType) => {
  const cookie = await login();
  const create = vi.spyOn(assetStore, "createUploadIntent");
  const response = await app.inject({ method: "POST", url: `${workspaceUrl}/media-upload-intents`, headers: { cookie },
    payload: { ...baseIntent, mediaKind, displayName, contentType } });
  expect(response.statusCode).toBe(400);
  expect(response.json().error.code).toBe("unsupported_media_type");
  expect(create).not.toHaveBeenCalled();
});

it("caps new library uploads at 50 MiB while preserving canvas's current 64 MiB boundary", async () => {
  const cookie = await login();
  for (const [index, [uploadPurpose, byteSize, statusCode]] of [
    ["library", 50 * MIB, 201], ["library", 50 * MIB + 1, 413],
    ["canvas", 50 * MIB + 1, 201], ["canvas", 64 * MIB, 201],
    ["canvas", 64 * MIB + 1, 400],
  ].entries()) {
    const response = await app.inject({ method: "POST", url: `${workspaceUrl}/media-upload-intents`, headers: { cookie },
      payload: { ...baseIntent, idempotencyKey: `library-boundary-${index}`, uploadPurpose, byteSize } });
    expect(response.statusCode).toBe(statusCode);
  }
});

it.each([false, true])("reports and enforces the actual reduced deployment capability with signed upload = %s", async (signedUpload) => {
  await app.close();
  app = await buildApp(4 * MIB, signedUpload);
  const cookie = await login();
  const policy = (await app.inject({ method: "GET", url: `${workspaceUrl}/media-upload-policy`, headers: { cookie } })).json().policy;
  const maxBytes = (signedUpload ? 50 : 4) * MIB;
  expect(policy.library.maxFileBytes).toBe(maxBytes);
  expect(policy.canvasMaxFileBytes).toBe(maxBytes);
  for (const byteSize of [maxBytes, maxBytes + 1]) {
    const response = await app.inject({ method: "POST", url: `${workspaceUrl}/media-upload-intents`, headers: { cookie },
      payload: { ...baseIntent, byteSize } });
    expect(response.statusCode).toBe(byteSize === maxBytes ? 201 : 413);
  }
});

it.each([null, 8 * MIB])("only advertises a verified remote ceiling (%s bytes) and otherwise keeps the bounded proxy path", async (remoteLimit) => {
  await app.close();
  app = await buildApp(4 * MIB, true);
  const signedUpload = vi.fn();
  Object.assign(objectStore, { getSignedUploadLimit: async () => remoteLimit, createSignedUpload: signedUpload });
  const cookie = await login();
  const effective = remoteLimit ?? 4 * MIB;
  const policy = (await app.inject({ method: "GET", url: `${workspaceUrl}/media-upload-policy`, headers: { cookie } })).json().policy;
  expect(policy.canvasMaxFileBytes).toBe(effective);
  expect(policy.library.maxFileBytes).toBe(effective);
  const rejected = await app.inject({ method: "POST", url: `${workspaceUrl}/media-upload-intents`, headers: { cookie },
    payload: { ...baseIntent, byteSize: effective + 1 } });
  expect(rejected.statusCode).toBe(413);
  expect(signedUpload).not.toHaveBeenCalled();
  const small = await app.inject({ method: "POST", url: `${workspaceUrl}/media-upload-intents`, headers: { cookie }, payload: baseIntent });
  expect(small.statusCode).toBe(201);
  expect(small.json().upload.url).toContain("/media-upload-intents/");
});

it("keeps proxy uploads usable when provider capabilities cannot be read and does not issue unbounded grants", async () => {
  await app.close();
  app = await buildApp(4 * MIB, true);
  const signedUpload = vi.fn();
  Object.assign(objectStore, { getSignedUploadLimit: async () => { throw new Error("Temporary provider failure"); }, createSignedUpload: signedUpload });
  const cookie = await login();
  const response = await app.inject({ method: "GET", url: `${workspaceUrl}/media-upload-policy`, headers: { cookie } });
  expect(response.statusCode).toBe(200);
  expect(response.json().policy.library.maxFileBytes).toBe(4 * MIB);
  const rejected = await app.inject({ method: "POST", url: `${workspaceUrl}/media-upload-intents`, headers: { cookie }, payload: { ...baseIntent, byteSize: 5 * MIB } });
  expect(rejected.statusCode).toBe(413);
  expect(signedUpload).not.toHaveBeenCalled();
});

it.each([undefined, 4 * MIB, 100 * MIB])("never exposes a signed grant with an unreserved provider ceiling (%s bytes)", async (maxFileBytes) => {
  await app.close();
  app = await buildApp(4 * MIB, true);
  const cookie = await login();
  const signed = { url: "https://storage.example/upload?token=private", method: "PUT", headers: {},
    expiresAt: new Date(Date.now() + 60_000).toISOString(), maxFileBytes };
  Object.assign(objectStore, { createSignedUpload: async () => signed });
  const register = vi.spyOn(assetStore, "registerUploadAuthorization");
  const created = await app.inject({ method: "POST", url: `${workspaceUrl}/media-upload-intents`, headers: { cookie }, payload: { ...baseIntent, byteSize: 5 * MIB } });
  if (maxFileBytes === undefined || maxFileBytes < 5 * MIB) {
    expect(created.statusCode).toBe(503);
    expect(created.body).not.toContain("token=private");
    expect(register).not.toHaveBeenCalled();
    return;
  }
  expect(created.statusCode).toBe(201);
  expect(register).toHaveBeenCalledWith(expect.objectContaining({ reservedBytes: maxFileBytes }));
  const usage = () => assetStore.getMediaStorage({ workspaceId: "workspace-organization-reelay", actorId: "actor-tianmaochao" });
  expect(await usage()).toMatchObject({ reservedBytes: maxFileBytes, usedBytes: 0 });
  const cancelled = await app.inject({ method: "DELETE", url: `${workspaceUrl}/media-upload-intents/${created.json().uploadIntent.id}`, headers: { cookie } });
  expect(cancelled.statusCode).toBe(202);
  expect(await usage()).toMatchObject({ reservedBytes: maxFileBytes, usedBytes: 0 });
});

it("does not expose direct authorization if account capacity cannot reserve the provider's full ceiling", async () => {
  await app.close();
  app = await buildApp(4 * MIB, true, 10 * MIB);
  const cookie = await login();
  const response = await app.inject({ method: "POST", url: `${workspaceUrl}/media-upload-intents`, headers: { cookie }, payload: { ...baseIntent, byteSize: 5 * MIB } });
  expect(response.statusCode).toBe(409);
  expect(response.json().error.code).toBe("media_storage_quota_exceeded");
  expect(response.json().upload).toBeUndefined();
  expect(response.body).not.toContain("storage.example");
});

it.each(["uploaded", "finalized"])("recovers a matching %s large upload without rechecking a failed provider or issuing another grant", async (status) => {
  await app.close();
  app = await buildApp(4 * MIB, true);
  const cookie = await login();
  const body = Buffer.alloc(5 * MIB, 7);
  const payload = { ...baseIntent, byteSize: body.byteLength, checksumSha256: createHash("sha256").update(body).digest("hex") };
  const created = await app.inject({ method: "POST", url: `${workspaceUrl}/media-upload-intents`, headers: { cookie }, payload });
  expect(created.statusCode).toBe(201);
  const input = { workspaceId: "workspace-organization-reelay", actorId: "actor-tianmaochao", uploadIntentId: created.json().uploadIntent.id };
  const intent = await assetStore.getUploadIntent(input);
  expect(intent).not.toBeNull();
  const stored = await objectStore.putObject({ objectKey: intent!.objectKey, contentType: intent!.expectedContentType, body });
  await assetStore.recordUpload({ ...input, ...stored });
  if (status === "finalized") await assetStore.finalizeUpload(input);
  const capabilities = vi.fn(async () => { throw new Error("Provider unavailable"); });
  const sign = vi.fn();
  Object.assign(objectStore, { getSignedUploadLimit: capabilities, createSignedUpload: sign });
  const recovered = await app.inject({ method: "POST", url: `${workspaceUrl}/media-upload-intents`, headers: { cookie }, payload });
  expect(recovered.statusCode).toBe(201);
  expect(recovered.json().uploadIntent).toMatchObject({ id: intent!.id, status });
  const changedMetadata = await app.inject({ method: "POST", url: `${workspaceUrl}/media-upload-intents`, headers: { cookie }, payload: { ...payload, checksumSha256: "b".repeat(64) } });
  expect(changedMetadata.statusCode).toBe(409);
  expect(changedMetadata.json().error.code).toBe("asset_upload_idempotency_key_reused");
  const changedOwner = await app.inject({ method: "POST", url: `${workspaceUrl}/media-upload-intents`, headers: { cookie }, payload: { ...payload, storageSpace: "organization" } });
  expect(changedOwner.statusCode).toBe(409);
  expect(changedOwner.json().error.code).toBe("asset_upload_idempotency_key_reused");
  expect(capabilities).not.toHaveBeenCalled();
  expect(sign).not.toHaveBeenCalled();
  const finalized = await app.inject({ method: "POST", url: `${workspaceUrl}/media-upload-intents/${intent!.id}/finalize`, headers: { cookie } });
  expect(finalized.statusCode).toBe(200);
  expect(finalized.json().asset.checksumSha256).toBe(payload.checksumSha256);
  expect(await assetStore.getMediaStorage(input)).toMatchObject({ usedBytes: body.byteLength, reservedBytes: 0 });
});

it("preserves older canvas upload formats and their persisted content after library format narrowing", async () => {
  const cookie = await login();
  const body = Buffer.from("GIF89a legacy animation");
  const created = await app.inject({ method: "POST", url: `${workspaceUrl}/media-upload-intents`, headers: { cookie },
    payload: { ...baseIntent, uploadPurpose: undefined, displayName: "animation.gif", contentType: "image/gif",
      byteSize: body.byteLength, checksumSha256: createHash("sha256").update(body).digest("hex") } });
  expect(created.statusCode).toBe(201);
  expect((await app.inject({ method: "PUT", url: created.json().upload.url,
    headers: { cookie, "content-type": "application/octet-stream" }, payload: body })).statusCode).toBe(200);
  const finalized = await app.inject({ method: "POST", url: `${workspaceUrl}/media-upload-intents/${created.json().uploadIntent.id}/finalize`, headers: { cookie } });
  expect(finalized.statusCode).toBe(200);
  const attached = await app.inject({ method: "PUT", url: `/api/projects/project-scifi-trailer/asset-references/${finalized.json().asset.id}`, headers: { cookie } });
  expect(attached.statusCode).toBe(200);
  expect((await app.inject({ method: "GET", url: attached.json().projectAsset.contentUrl, headers: { cookie } })).rawPayload).toEqual(body);
});

it.each(["library", "canvas"])("caps SVG at the safe proxy boundary for %s", async (uploadPurpose) => {
  const cookie = await login();
  for (const byteSize of [4 * MIB, 4 * MIB + 1]) {
    const response = await app.inject({ method: "POST", url: `${workspaceUrl}/media-upload-intents`, headers: { cookie },
      payload: { ...baseIntent, uploadPurpose, displayName: "vector.svg", contentType: "image/svg+xml", byteSize } });
    expect(response.statusCode).toBe(byteSize === 4 * MIB ? 201 : 413);
  }
});

it("serves SVG through the same sandboxed original for library and project previews without invoking a server renderer", async () => {
  const cookie = await login();
  const body = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>fetch("/api/private")</script><image href="https://outside.invalid/pixel"/><foreignObject><iframe src="https://outside.invalid/frame"/></foreignObject><rect width="100" height="100" style="fill:red"/></svg>');
  const created = await app.inject({ method: "POST", url: `${workspaceUrl}/media-upload-intents`, headers: { cookie },
    payload: { ...baseIntent, displayName: "vector.svg", contentType: "image/svg+xml", byteSize: body.byteLength,
      checksumSha256: createHash("sha256").update(body).digest("hex") } });
  expect(created.statusCode).toBe(201);
  expect((await app.inject({ method: "PUT", url: created.json().upload.url, headers: { cookie, "content-type": "application/octet-stream" }, payload: body })).statusCode).toBe(200);
  const finalized = await app.inject({ method: "POST", url: `${workspaceUrl}/media-upload-intents/${created.json().uploadIntent.id}/finalize`, headers: { cookie } });
  expect(finalized.statusCode).toBe(200);
  const assetId = finalized.json().asset.id;
  const attached = await app.inject({ method: "PUT", url: `/api/projects/project-scifi-trailer/asset-references/${assetId}`, headers: { cookie } });
  expect(attached.statusCode).toBe(200);
  const render = vi.spyOn(ImagePreviewService.prototype, "getPreview");
  const storageRedirect = vi.fn();
  Object.assign(objectStore, { createSignedDownload: storageRedirect });
  const etag = `"${createHash("sha256").update(body).digest("hex")}"`;
  for (const url of [`${workspaceUrl}/media-assets/${assetId}/content`, attached.json().projectAsset.contentUrl]) {
    for (const variant of ["", "?preview=library", "?preview=canvas"]) {
      const response = await app.inject({ method: "GET", url: `${url}${variant}`, headers: { cookie } });
      expect(response.statusCode).toBe(200);
      expect(response.rawPayload).toEqual(body);
      expect(response.headers["content-type"]).toBe("image/svg+xml");
      const csp = String(response.headers["content-security-policy"]);
      expect(csp.split("; ")).toEqual(expect.arrayContaining(["sandbox", "default-src 'none'", "script-src 'none'", "img-src data:", "form-action 'none'"]));
      expect(csp).not.toContain("allow-scripts");
      expect(csp).not.toContain("allow-same-origin");
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      for (const [method, headers, status] of [
        ["HEAD", { cookie }, 200], ["GET", { cookie, "if-none-match": etag }, 304],
        ["GET", { cookie, range: "bytes=0-3" }, 206],
      ] as const) {
        const partial = await app.inject({ method, url: `${url}${variant}`, headers });
        expect(partial.statusCode).toBe(status);
        expect(partial.headers["content-security-policy"]).toBe(csp);
      }
    }
  }
  expect(render).not.toHaveBeenCalled();
  expect(storageRedirect).not.toHaveBeenCalled();
});
