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

async function upload(cookie: string, body: Buffer, kind: "image" | "audio" = "image") {
  const intent = await app.inject({
    method: "POST", url: `${workspace}/media-upload-intents`, headers: { cookie },
    payload: { idempotencyKey: `thumbnail-${kind}`, mediaKind: kind, displayName: "preview-test",
      contentType: kind === "image" ? "image/png" : "audio/mpeg", byteSize: body.byteLength,
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
  const full = await app.inject({ method: "GET", url: contentUrl, headers: { cookie: owner } });
  expect(full.rawPayload).toEqual(original);
  expect(full.headers["cache-control"]).toBe("private, no-store");
  vi.spyOn(assets, "getPersonalAsset").mockResolvedValue(null);
  expect((await app.inject({ method: "GET", url: previewUrl, headers: { cookie: owner, "if-none-match": etag } })).statusCode).toBe(404);
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
