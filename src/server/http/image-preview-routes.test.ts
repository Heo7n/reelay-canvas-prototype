import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buildServer } from "../app";
import { createDemoSeed, DEMO_PASSWORD } from "../demo-fixtures";
import { InMemoryAssetStore } from "../infrastructure/InMemoryAssetStore";
import { InMemoryCollaborationStore } from "../infrastructure/InMemoryCollaborationStore";
import { InMemoryObjectStore } from "../infrastructure/InMemoryObjectStore";

let app: FastifyInstance;
let assets: InMemoryAssetStore;
let objects: InMemoryObjectStore;
const workspace = "/api/workspaces/workspace-organization-reelay";

beforeEach(async () => {
  const seed = createDemoSeed();
  assets = new InMemoryAssetStore({
    workspaceMemberships: seed.memberships.map(({ workspaceId, actorId }) => ({ workspaceId, actorId })),
    projects: seed.projects.map((project) => ({
      id: project.id, workspaceId: project.workspaceId,
      members: seed.projectMemberships.filter((member) => member.projectId === project.id)
        .map(({ actorId, role }) => ({ actorId, role })),
    })),
  });
  objects = new InMemoryObjectStore();
  app = await buildServer({ store: new InMemoryCollaborationStore(seed), assetStore: assets, objectStore: objects });
});
afterEach(async () => app.close());

async function login(account = "creator@reelay.test") {
  const result = await app.inject({ method: "POST", url: "/api/demo/session", payload: { account, password: DEMO_PASSWORD } });
  expect(result.statusCode).toBe(201);
  const header = result.headers["set-cookie"];
  return (Array.isArray(header) ? header[0] : String(header)).split(";")[0];
}

async function upload(cookie: string, body: Buffer, kind: "image" | "audio" = "image", contentType?: string) {
  const intent = await app.inject({
    method: "POST", url: `${workspace}/media-upload-intents`, headers: { cookie },
    payload: { idempotencyKey: `thumbnail-${kind}-${createHash("sha256").update(body).digest("hex")}`, mediaKind: kind, displayName: "preview-test",
      contentType: contentType ?? (kind === "image" ? "image/png" : "audio/mpeg"), byteSize: body.byteLength,
      checksumSha256: createHash("sha256").update(body).digest("hex") },
  });
  expect(intent.statusCode).toBe(201);
  const uploaded = await app.inject({ method: "PUT", url: intent.json().upload.url,
    headers: { cookie, "content-type": "application/octet-stream" }, payload: body });
  expect(uploaded.statusCode).toBe(200);
  const finalized = await app.inject({ method: "POST",
    url: `${workspace}/media-upload-intents/${intent.json().uploadIntent.id}/finalize`, headers: { cookie } });
  expect(finalized.statusCode).toBe(200);
  return finalized.json().asset.id as string;
}

it("serves small personal previews, keeps originals and reauthorizes every conditional read", async () => {
  const owner = await login();
  const other = await login("chenxi@reelay.test");
  const original = await sharp({ create: { width: 1500, height: 1000, channels: 3, background: "#357" } }).png().toBuffer();
  const id = await upload(owner, original);
  const contentUrl = `${workspace}/media-assets/${id}/content`;
  const previewUrl = `${contentUrl}?preview=library`;
  const preview = await app.inject({ method: "GET", url: previewUrl, headers: { cookie: owner } });
  expect(preview.statusCode).toBe(200);
  expect(preview.headers["content-type"]).toBe("image/webp");
  expect(preview.headers["cache-control"]).toBe("private, no-cache");
  expect(preview.headers.vary).toBe("Cookie");
  expect(preview.rawPayload.length).toBeLessThan(original.length);
  const etag = String(preview.headers.etag);
  expect(etag).toMatch(/^W\/".+"$/);
  const read = vi.spyOn(objects, "getObject");
  const cached = await app.inject({ method: "GET", url: previewUrl, headers: { cookie: owner, "if-none-match": etag } });
  expect(cached.statusCode).toBe(304);
  expect(read).not.toHaveBeenCalled();
  expect((await app.inject({ method: "GET", url: previewUrl, headers: { "if-none-match": etag } })).statusCode).toBe(401);
  expect((await app.inject({ method: "GET", url: previewUrl, headers: { cookie: other, "if-none-match": etag } })).statusCode).toBe(404);
  expect(read).not.toHaveBeenCalled();
  const warm = await app.inject({ method: "GET", url: previewUrl, headers: { cookie: owner } });
  expect(warm.statusCode).toBe(200);
  expect(warm.rawPayload).toEqual(preview.rawPayload);
  expect(read).not.toHaveBeenCalled();
  expect((await app.inject({ method: "GET", url: previewUrl })).statusCode).toBe(401);
  expect((await app.inject({ method: "GET", url: previewUrl, headers: { cookie: other } })).statusCode).toBe(404);
  expect(read).not.toHaveBeenCalled();
  const full = await app.inject({ method: "GET", url: contentUrl, headers: { cookie: owner } });
  expect(full.rawPayload).toEqual(original);
  expect(full.headers["cache-control"]).toBe("private, no-cache");
  vi.spyOn(assets, "getPersonalAsset").mockResolvedValue(null);
  expect((await app.inject({ method: "GET", url: previewUrl, headers: { cookie: owner, "if-none-match": etag } })).statusCode).toBe(404);
  expect((await app.inject({ method: "GET", url: previewUrl, headers: { cookie: owner } })).statusCode).toBe(404);
});

it("canvas previews have a distinct static representation and reject animation even without a filename extension", async () => {
  const owner = await login();
  const original = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#357" } }).png().toBuffer();
  const id = await upload(owner, original);
  const url = `${workspace}/media-assets/${id}/content`;
  const library = await app.inject({ method: "GET", url: `${url}?preview=library`, headers: { cookie: owner } });
  const canvas = await app.inject({ method: "GET", url: `${url}?preview=canvas`, headers: { cookie: owner } });
  expect(canvas.statusCode).toBe(200);
  expect(canvas.headers.etag).not.toBe(library.headers.etag);
  expect((await sharp(canvas.rawPayload).metadata()).width).toBe(512);
  expect((await app.inject({ method: "GET", url: `${url}?preview=canvas`,
    headers: { cookie: owner, "if-none-match": String(canvas.headers.etag) } })).statusCode).toBe(304);
  expect((await app.inject({ method: "GET", url: `${url}?preview=canvas`,
    headers: { "if-none-match": String(canvas.headers.etag) } })).statusCode).toBe(401);
  const animated = await sharp(Buffer.concat([Buffer.alloc(2 * 3, 0), Buffer.alloc(2 * 3, 255)]), {
    raw: { width: 2, height: 2, channels: 3, pageHeight: 1 },
  }).gif({ delay: [100, 100], loop: 0 }).toBuffer();
  expect((await sharp(animated, { animated: true }).metadata()).pages).toBe(2);
  const animationId = await upload(owner, animated, "image", "image/gif");
  const animationUrl = `${workspace}/media-assets/${animationId}/content`;
  const refused = await app.inject({ method: "GET", url: `${animationUrl}?preview=canvas`, headers: { cookie: owner } });
  expect(refused.statusCode).toBe(422);
  expect(refused.headers["cache-control"]).toBe("private, no-store");
  expect((await app.inject({ method: "GET", url: animationUrl, headers: { cookie: owner } })).rawPayload).toEqual(animated);
});

it("project preview access follows project membership even with a previously valid ETag", async () => {
  const owner = await login();
  const outsider = await login("chenxi@reelay.test");
  const body = await sharp({ create: { width: 800, height: 600, channels: 4, background: "#6789" } }).png().toBuffer();
  const id = await upload(owner, body);
  const attached = await app.inject({ method: "PUT", url: `/api/projects/project-scifi-trailer/asset-references/${id}`, headers: { cookie: owner } });
  expect(attached.statusCode).toBe(200);
  const url = `${attached.json().projectAsset.contentUrl}?preview=library`;
  const preview = await app.inject({ method: "GET", url, headers: { cookie: owner } });
  expect(preview.statusCode).toBe(200);
  const etag = String(preview.headers.etag);
  expect((await app.inject({ method: "GET", url, headers: { cookie: outsider, "if-none-match": etag } })).statusCode).toBe(404);
  vi.spyOn(assets, "getProjectAsset").mockResolvedValue(null);
  expect((await app.inject({ method: "GET", url, headers: { cookie: owner, "if-none-match": etag } })).statusCode).toBe(404);
});

it("rejects unsupported image data and arbitrary preview options without altering original files", async () => {
  const owner = await login();
  const invalidImage = Buffer.from("not an image");
  const id = await upload(owner, invalidImage);
  const url = `${workspace}/media-assets/${id}/content`;
  expect((await app.inject({ method: "GET", url: `${url}?preview=library`, headers: { cookie: owner } })).statusCode).toBe(422);
  expect((await app.inject({ method: "GET", url: `${url}?preview=library&width=9000`, headers: { cookie: owner } })).statusCode).toBe(400);
  expect((await app.inject({ method: "GET", url, headers: { cookie: owner } })).rawPayload).toEqual(invalidImage);
  const audio = await upload(owner, Buffer.from("audio preview test"), "audio");
  expect((await app.inject({ method: "GET", url: `${workspace}/media-assets/${audio}/content?preview=library`, headers: { cookie: owner } })).statusCode).toBe(415);
});

it("revalidates original bytes without rereading storage, including HEAD, and still rejects revoked personal access", async () => {
  const owner = await login();
  const other = await login("chenxi@reelay.test");
  const body = Buffer.from("immutable original bytes");
  const id = await upload(owner, body);
  const url = `${workspace}/media-assets/${id}/content`;
  const read = vi.spyOn(objects, "getObject");
  const head = vi.spyOn(objects, "headObject");
  const full = await app.inject({ method: "GET", url, headers: { cookie: owner } });
  expect(full.statusCode).toBe(200);
  expect(full.rawPayload).toEqual(body);
  expect(read).toHaveBeenCalledTimes(1);
  expect(head).not.toHaveBeenCalled();
  const etag = String(full.headers.etag);
  expect(etag).toBe(`"${createHash("sha256").update(body).digest("hex")}"`);
  read.mockClear();
  for (const validator of [etag, `W/${etag}`, `"another", ${etag}`, "*"]) {
    const cached = await app.inject({ method: "GET", url, headers: { cookie: owner, "if-none-match": validator } });
    expect(cached.statusCode).toBe(304);
    expect(cached.rawPayload).toHaveLength(0);
    expect(cached.headers["cache-control"]).toBe("private, no-cache");
    expect(cached.headers.vary).toBe("Cookie");
  }
  const metadata = await app.inject({ method: "HEAD", url, headers: { cookie: owner } });
  expect(metadata.statusCode).toBe(200);
  expect(metadata.rawPayload).toHaveLength(0);
  expect(metadata.headers["content-length"]).toBe(String(body.length));
  expect(metadata.headers.etag).toBe(etag);
  expect(read).not.toHaveBeenCalled();
  expect(head).not.toHaveBeenCalled();
  for (const headers of [{ "if-none-match": etag }, { cookie: other, "if-none-match": etag }]) {
    const rejected = await app.inject({ method: "GET", url, headers });
    expect([401, 404]).toContain(rejected.statusCode);
    expect(rejected.headers["cache-control"]).toBe("private, no-store");
  }
  vi.spyOn(assets, "getPersonalAsset").mockResolvedValue(null);
  const revoked = await app.inject({ method: "GET", url, headers: { cookie: owner, "if-none-match": etag } });
  expect(revoked.statusCode).toBe(404);
  expect(revoked.headers["cache-control"]).toBe("private, no-store");
  expect(read).not.toHaveBeenCalled();
});

it("resumes only a matching original representation and checks conditional requests before ranges", async () => {
  const owner = await login();
  const body = Buffer.from("0123456789");
  const id = await upload(owner, body);
  const url = `${workspace}/media-assets/${id}/content`;
  const etag = `"${createHash("sha256").update(body).digest("hex")}"`;
  const read = vi.spyOn(objects, "getObject");
  const ranged = await app.inject({ method: "GET", url,
    headers: { cookie: owner, range: "bytes=2-5", "if-range": etag } });
  expect(ranged.statusCode).toBe(206);
  expect(ranged.headers["content-range"]).toBe("bytes 2-5/10");
  expect(ranged.rawPayload).toEqual(body.subarray(2, 6));
  for (const validator of ["\"old\"", `W/${etag}`, "Wed, 01 Jan 2020 00:00:00 GMT"]) {
    const full = await app.inject({ method: "GET", url,
      headers: { cookie: owner, range: "bytes=2-5", "if-range": validator } });
    expect(full.statusCode).toBe(200);
    expect(full.headers["content-range"]).toBeUndefined();
    expect(full.rawPayload).toEqual(body);
  }
  const suffix = await app.inject({ method: "GET", url, headers: { cookie: owner, range: "bytes=-3" } });
  expect(suffix.statusCode).toBe(206);
  expect(suffix.rawPayload).toEqual(body.subarray(7));
  const openEnd = await app.inject({ method: "GET", url, headers: { cookie: owner, range: "bytes=8-" } });
  expect(openEnd.statusCode).toBe(206);
  expect(openEnd.rawPayload).toEqual(body.subarray(8));
  read.mockClear();
  const unchanged = await app.inject({ method: "GET", url,
    headers: { cookie: owner, range: "bytes=999-", "if-none-match": etag } });
  expect(unchanged.statusCode).toBe(304);
  const invalid = await app.inject({ method: "GET", url, headers: { cookie: owner, range: "bytes=999-" } });
  expect(invalid.statusCode).toBe(416);
  expect(invalid.headers["cache-control"]).toBe("private, no-store");
  expect(read).not.toHaveBeenCalled();
});

it("keeps project authorization ahead of original cache validation and rejects inconsistent stored metadata", async () => {
  const owner = await login();
  const outsider = await login("chenxi@reelay.test");
  const body = Buffer.from("original project bytes");
  const id = await upload(owner, body);
  const attached = await app.inject({ method: "PUT", url: `/api/projects/project-scifi-trailer/asset-references/${id}`, headers: { cookie: owner } });
  expect(attached.statusCode).toBe(200);
  const url = attached.json().projectAsset.contentUrl as string;
  const original = await app.inject({ method: "GET", url, headers: { cookie: owner } });
  const etag = String(original.headers.etag);
  const storedRead = objects.getObject.bind(objects);
  const read = vi.spyOn(objects, "getObject");
  expect((await app.inject({ method: "GET", url, headers: { cookie: owner, "if-none-match": etag } })).statusCode).toBe(304);
  expect((await app.inject({ method: "GET", url, headers: { cookie: outsider, "if-none-match": etag } })).statusCode).toBe(404);
  expect(read).not.toHaveBeenCalled();
  read.mockImplementation(async (...args) => {
    const stored = await storedRead(...args);
    return stored && { ...stored, checksumSha256: "0".repeat(64) };
  });
  const invalid = await app.inject({ method: "GET", url, headers: { cookie: owner } });
  expect(invalid.statusCode).toBe(503);
  expect(invalid.headers["cache-control"]).toBe("private, no-store");
  expect(invalid.headers.etag).toBeUndefined();
  expect(invalid.rawPayload).not.toEqual(body);
  vi.spyOn(assets, "getProjectAsset").mockResolvedValue(null);
  expect((await app.inject({ method: "GET", url, headers: { cookie: owner, "if-none-match": etag } })).statusCode).toBe(404);
});
