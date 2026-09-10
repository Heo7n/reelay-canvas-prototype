import { createHash } from "node:crypto";

import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildServer } from "../app";
import { createDemoSeed, DEMO_PASSWORD } from "../demo-fixtures";
import { InMemoryAssetStore } from "../infrastructure/InMemoryAssetStore";
import { InMemoryCollaborationStore } from "../infrastructure/InMemoryCollaborationStore";
import { InMemoryObjectStore } from "../infrastructure/InMemoryObjectStore";

function cookie(response: LightMyRequestResponse): string {
  const value = response.headers["set-cookie"];
  if (!value) throw new Error("Expected a session cookie.");
  return (Array.isArray(value) ? value[0] : value).split(";", 1)[0];
}

async function login(app: FastifyInstance, account: string): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/demo/session",
    payload: { account, password: DEMO_PASSWORD },
  });
  expect(response.statusCode).toBe(201);
  return cookie(response);
}

describe("asset persistence routes", () => {
  let app: FastifyInstance;
  let objectStore: InMemoryObjectStore;

  beforeEach(async () => {
    const seed = createDemoSeed();
    const store = new InMemoryCollaborationStore(seed);
    const assetStore = new InMemoryAssetStore({
      workspaceMemberships: seed.memberships.map(({ workspaceId, actorId }) => ({ workspaceId, actorId })),
      projects: seed.projects.map((project) => ({
        id: project.id,
        workspaceId: project.workspaceId,
        members: seed.projectMemberships
          .filter((membership) => membership.projectId === project.id)
          .map(({ actorId, role }) => ({ actorId, role })),
      })),
    });
    objectStore = new InMemoryObjectStore();
    app = await buildServer({ store, assetStore, objectStore });
  });

  afterEach(async () => app.close());

  it.each([
    { mediaKind: "video", contentType: "video/mp4", byteSize: 16, signed: true },
    { mediaKind: "audio", contentType: "audio/mpeg", byteSize: 16, signed: true },
    { mediaKind: "image", contentType: "image/png", byteSize: 4 * 1024 * 1024 + 1, signed: true },
    { mediaKind: "image", contentType: "image/png", byteSize: 16, signed: false },
  ])("delivers $mediaKind ($byteSize bytes) through the authorized remote capability only when needed", async ({ mediaKind, contentType, byteSize, signed }) => {
    const session = await login(app, "creator@reelay.test");
    const body = Buffer.alloc(byteSize, 1);
    const checksumSha256 = createHash("sha256").update(body).digest("hex");
    const created = await app.inject({
      method: "POST", url: "/api/workspaces/workspace-organization-reelay/media-upload-intents",
      headers: { cookie: session },
      payload: { idempotencyKey: "signed-media-0001", mediaKind, displayName: "媒体", contentType, byteSize, checksumSha256 },
    });
    expect(created.statusCode).toBe(201);
    const uploaded = await app.inject({
      method: "PUT", url: created.json().upload.url,
      headers: { cookie: session, "content-type": "application/octet-stream" }, payload: body,
    });
    expect(uploaded.statusCode).toBe(200);
    const finalized = await app.inject({
      method: "POST", url: `/api/workspaces/workspace-organization-reelay/media-upload-intents/${created.json().uploadIntent.id}/finalize`,
      headers: { cookie: session },
    });
    expect(finalized.statusCode).toBe(200);
    const assetId = finalized.json().asset.id;
    const personalUrl = `/api/workspaces/workspace-organization-reelay/media-assets/${assetId}/content`;
    const attached = await app.inject({
      method: "PUT", url: `/api/projects/project-scifi-trailer/asset-references/${assetId}`, headers: { cookie: session },
    });
    expect(attached.statusCode).toBe(200);
    const projectUrl = attached.json().projectAsset.contentUrl;
    const directUrl = "https://storage.example/object/sign/private/media?token=short-lived";
    const createSignedDownload = vi.fn(async (key: string, _ttl: number) => {
      const metadata = await objectStore.headObject(key);
      return metadata ? { ...metadata, url: directUrl } : null;
    });
    Object.assign(objectStore, { createSignedDownload });
    const getObject = vi.spyOn(objectStore, "getObject");
    const outsider = await login(app, "chenxi@reelay.test");
    for (const url of [personalUrl, projectUrl]) {
      for (const headers of [{}, { cookie: outsider }]) {
        const denied = await app.inject({ method: "GET", url, headers });
        expect([401, 404]).toContain(denied.statusCode);
        expect(denied.headers.location).toBeUndefined();
      }
    }
    expect(createSignedDownload).not.toHaveBeenCalled();
    for (const url of [personalUrl, projectUrl]) {
      const response = await app.inject({ method: "GET", url, headers: { cookie: session, range: "bytes=2-5" } });
      if (signed) {
        expect(response.statusCode).toBe(307);
        expect(response.headers.location).toBe(directUrl);
        expect(response.headers["cache-control"]).toBe("private, no-store");
        expect(response.headers.vary).toBe("Cookie");
        expect(response.headers["referrer-policy"]).toBe("no-referrer");
        expect(createSignedDownload).toHaveBeenLastCalledWith(expect.any(String), 300);
        expect(getObject).not.toHaveBeenCalled();
      } else {
        expect(response.statusCode).toBe(206);
        expect(response.rawPayload).toEqual(body.subarray(2, 6));
        expect(createSignedDownload).not.toHaveBeenCalled();
      }
    }
    createSignedDownload.mockClear();
    const head = await app.inject({ method: "HEAD", url: personalUrl, headers: { cookie: session } });
    expect(head.statusCode).toBe(200);
    expect(head.headers["content-length"]).toBe(String(byteSize));
    const unchanged = await app.inject({ method: "GET", url: personalUrl, headers: { cookie: session, "if-none-match": `"${checksumSha256}"` } });
    expect(unchanged.statusCode).toBe(304);
    expect(createSignedDownload).not.toHaveBeenCalled();
    if (signed) {
      createSignedDownload.mockImplementationOnce(async (key) => {
        const metadata = await objectStore.headObject(key);
        return metadata ? { ...metadata, byteSize: byteSize + 1, url: directUrl } : null;
      });
      const invalid = await app.inject({ method: "GET", url: personalUrl, headers: { cookie: session } });
      expect(invalid.statusCode).toBe(503);
      expect(invalid.headers.location).toBeUndefined();
    }
  });

  it("uploads, finalizes, renames, attaches, lists, ranges, and repeats the complete story idempotently", async () => {
    const session = await login(app, "creator@reelay.test");
    const body = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    const checksumSha256 = createHash("sha256").update(body).digest("hex");
    const intentPayload = {
      idempotencyKey: "upload-contract-0001",
      mediaKind: "image",
      displayName: "角色参考.png",
      contentType: "image/png",
      byteSize: body.byteLength,
      checksumSha256,
    };

    const created = await app.inject({
      method: "POST",
      url: "/api/workspaces/workspace-organization-reelay/media-upload-intents",
      headers: { cookie: session },
      payload: intentPayload,
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().upload).toEqual(expect.objectContaining({ method: "PUT" }));
    const uploadId = created.json().uploadIntent.id as string;

    const repeatedIntent = await app.inject({
      method: "POST",
      url: "/api/workspaces/workspace-organization-reelay/media-upload-intents",
      headers: { cookie: session },
      payload: intentPayload,
    });
    expect(repeatedIntent.statusCode).toBe(201);
    expect(repeatedIntent.json().uploadIntent.id).toBe(uploadId);

    const uploadUrl = created.json().upload.url as string;
    const uploaded = await app.inject({
      method: "PUT",
      url: uploadUrl,
      headers: { cookie: session, "content-type": "application/octet-stream" },
      payload: body,
    });
    expect(uploaded.statusCode).toBe(200);
    expect(uploaded.json().uploadIntent.status).toBe("uploaded");

    const repeatedUpload = await app.inject({
      method: "PUT",
      url: uploadUrl,
      headers: { cookie: session, "content-type": "application/octet-stream" },
      payload: body,
    });
    expect(repeatedUpload.statusCode).toBe(200);

    const finalizeUrl = `/api/workspaces/workspace-organization-reelay/media-upload-intents/${uploadId}/finalize`;
    const finalized = await app.inject({ method: "POST", url: finalizeUrl, headers: { cookie: session } });
    expect(finalized.statusCode).toBe(200);
    expect(finalized.json().asset).toEqual(expect.objectContaining({
      mediaKind: "image",
      checksumSha256,
    }));
    expect(finalized.json().asset).not.toHaveProperty("objectKey");
    const assetId = finalized.json().asset.id as string;

    const repeatedFinalize = await app.inject({ method: "POST", url: finalizeUrl, headers: { cookie: session } });
    expect(repeatedFinalize.statusCode).toBe(200);
    expect(repeatedFinalize.json().asset.id).toBe(assetId);

    const attachUrl = `/api/projects/project-scifi-trailer/asset-references/${assetId}`;
    const attached = await app.inject({ method: "PUT", url: attachUrl, headers: { cookie: session } });
    expect(attached.statusCode).toBe(200);
    expect(attached.json().projectAsset).toEqual(expect.objectContaining({ assetId, checksumSha256 }));
    const referenceId = attached.json().projectAsset.referenceId as string;

    const renamed = await app.inject({
      method: "PATCH",
      url: `/api/workspaces/workspace-organization-reelay/media-assets/${assetId}`,
      headers: { cookie: session },
      payload: { displayName: "  角色最终参考.png  " },
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().asset).toEqual(expect.objectContaining({
      id: assetId,
      displayName: "角色最终参考.png",
      objectVersion: finalized.json().asset.objectVersion,
    }));
    expect(renamed.json().asset).not.toHaveProperty("contentUrl");

    const repeatedAttach = await app.inject({ method: "PUT", url: attachUrl, headers: { cookie: session } });
    expect(repeatedAttach.statusCode).toBe(200);
    expect(repeatedAttach.json().projectAsset.referenceId).toBe(referenceId);

    const listed = await app.inject({
      method: "GET",
      url: "/api/projects/project-scifi-trailer/asset-references",
      headers: { cookie: session },
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().projectAssets).toHaveLength(1);
    expect(listed.json().projectAssets[0]).toEqual(expect.objectContaining({
      referenceId,
      assetId,
      assetVersion: finalized.json().asset.objectVersion,
      displayName: "角色最终参考.png",
    }));

    const contentUrl = listed.json().projectAssets[0].contentUrl as string;
    const getObject = vi.spyOn(objectStore, "getObject");
    const content = await app.inject({
      method: "GET",
      url: contentUrl,
      headers: { cookie: session, range: "bytes=2-5" },
    });
    expect(content.statusCode).toBe(206);
    expect(content.headers["content-range"]).toBe(`bytes 2-5/${body.byteLength}`);
    expect(content.headers["cache-control"]).toBe("private, no-cache");
    expect(content.headers.vary).toBe("Cookie");
    expect(content.headers.etag).toBe(`"${checksumSha256}"`);
    expect(content.headers["x-content-type-options"]).toBe("nosniff");
    expect(content.rawPayload).toEqual(body.subarray(2, 6));
    expect(getObject).toHaveBeenLastCalledWith(expect.any(String), { range: { start: 2, end: 5 } });

    const invalidRange = await app.inject({
      method: "GET",
      url: contentUrl,
      headers: { cookie: session, range: "bytes=999-1000" },
    });
    expect(invalidRange.statusCode).toBe(416);
    expect(invalidRange.headers["content-range"]).toBe(`bytes */${body.byteLength}`);
    expect(getObject).toHaveBeenCalledTimes(1);

    const outsiderSession = await login(app, "chenxi@reelay.test");
    const hiddenFromOutsider = await app.inject({
      method: "GET",
      url: contentUrl,
      headers: { cookie: outsiderSession },
    });
    expect(hiddenFromOutsider.statusCode).toBe(404);
    expect(hiddenFromOutsider.json().error.code).toBe("asset_not_found");

    const wrongProject = await app.inject({
      method: "GET",
      url: `/api/projects/project-character-film/asset-references/${referenceId}/content`,
      headers: { cookie: session },
    });
    expect(wrongProject.statusCode).toBe(404);
  });

  it("keeps personal discovery owner-scoped and blocks view-only attachment", async () => {
    const ownerSession = await login(app, "creator@reelay.test");
    const viewerSession = await login(app, "zhouyu@reelay.test");
    const body = Buffer.from("owner-only");
    const checksumSha256 = createHash("sha256").update(body).digest("hex");
    const created = await app.inject({
      method: "POST",
      url: "/api/workspaces/workspace-organization-reelay/media-upload-intents",
      headers: { cookie: ownerSession },
      payload: {
        idempotencyKey: "owner-scope-upload",
        mediaKind: "image",
        displayName: "私有参考.png",
        contentType: "image/png",
        byteSize: body.byteLength,
        checksumSha256,
      },
    });
    const uploadId = created.json().uploadIntent.id as string;
    await app.inject({
      method: "PUT",
      url: created.json().upload.url,
      headers: { cookie: ownerSession, "content-type": "application/octet-stream" },
      payload: body,
    });
    const finalized = await app.inject({
      method: "POST",
      url: `/api/workspaces/workspace-organization-reelay/media-upload-intents/${uploadId}/finalize`,
      headers: { cookie: ownerSession },
    });
    const assetId = finalized.json().asset.id as string;

    const viewerRename = await app.inject({
      method: "PATCH",
      url: `/api/workspaces/workspace-organization-reelay/media-assets/${assetId}`,
      headers: { cookie: viewerSession },
      payload: { displayName: "越权名称.png" },
    });
    expect(viewerRename.statusCode).toBe(404);
    expect(viewerRename.json().error.code).toBe("asset_not_found");

    for (const displayName of ["   ", "x".repeat(301)]) {
      const invalidRename = await app.inject({
        method: "PATCH",
        url: `/api/workspaces/workspace-organization-reelay/media-assets/${assetId}`,
        headers: { cookie: ownerSession },
        payload: { displayName },
      });
      expect(invalidRename.statusCode).toBe(400);
      expect(invalidRename.json().error.code).toBe("invalid_request");
    }

    const ownerAssets = await app.inject({
      method: "GET",
      url: "/api/workspaces/workspace-organization-reelay/media-assets?scope=personal",
      headers: { cookie: ownerSession },
    });
    expect(ownerAssets.json().assets).toHaveLength(1);
    expect(ownerAssets.json().assets[0].displayName).toBe("私有参考.png");

    const viewerAssets = await app.inject({
      method: "GET",
      url: "/api/workspaces/workspace-organization-reelay/media-assets?scope=personal",
      headers: { cookie: viewerSession },
    });
    expect(viewerAssets.statusCode).toBe(200);
    expect(viewerAssets.json().assets).toEqual([]);

    const viewAttach = await app.inject({
      method: "PUT",
      url: `/api/projects/project-scifi-trailer/asset-references/${assetId}`,
      headers: { cookie: viewerSession },
    });
    expect(viewAttach.statusCode).toBe(403);
    expect(viewAttach.json().error.code).toBe("project_forbidden");
  });

  it("rejects mismatched bytes before they become discoverable", async () => {
    const session = await login(app, "creator@reelay.test");
    const expected = Buffer.from("expected");
    const created = await app.inject({
      method: "POST",
      url: "/api/workspaces/workspace-organization-reelay/media-upload-intents",
      headers: { cookie: session },
      payload: {
        idempotencyKey: "mismatch-upload-1",
        mediaKind: "audio",
        displayName: "参考音频.mp3",
        contentType: "audio/mpeg",
        byteSize: expected.byteLength,
        checksumSha256: createHash("sha256").update(expected).digest("hex"),
      },
    });
    const rejected = await app.inject({
      method: "PUT",
      url: created.json().upload.url,
      headers: { cookie: session, "content-type": "application/octet-stream" },
      payload: Buffer.from("tampered"),
    });
    expect(rejected.statusCode).toBe(409);
    expect(rejected.json().error.code).toBe("asset_upload_metadata_mismatch");

    const assets = await app.inject({
      method: "GET",
      url: "/api/workspaces/workspace-organization-reelay/media-assets",
      headers: { cookie: session },
    });
    expect(assets.json().assets).toEqual([]);
  });

  it("rejects an expired upload intent before writing any object bytes", async () => {
    await app.close();
    const seed = createDemoSeed();
    const store = new InMemoryCollaborationStore(seed);
    const expiredAssetStore = new InMemoryAssetStore(
      {
        workspaceMemberships: seed.memberships.map(({ workspaceId, actorId }) => ({ workspaceId, actorId })),
        projects: [],
      },
      () => new Date(Date.now() - 60_000),
      () => "expired",
      1_000,
    );
    objectStore = new InMemoryObjectStore();
    const putObject = vi.spyOn(objectStore, "putObject");
    app = await buildServer({ store, assetStore: expiredAssetStore, objectStore });
    const session = await login(app, "creator@reelay.test");
    const body = Buffer.from("expired");
    const created = await app.inject({
      method: "POST",
      url: "/api/workspaces/workspace-organization-reelay/media-upload-intents",
      headers: { cookie: session },
      payload: {
        idempotencyKey: "expired-upload",
        mediaKind: "image",
        displayName: "expired.png",
        contentType: "image/png",
        byteSize: body.byteLength,
        checksumSha256: createHash("sha256").update(body).digest("hex"),
      },
    });

    const response = await app.inject({
      method: "PUT",
      url: created.json().upload.url,
      headers: { cookie: session, "content-type": "application/octet-stream" },
      payload: body,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("asset_upload_expired");
    expect(putObject).not.toHaveBeenCalled();
  });

  it("maps an unavailable workspace on personal content reads to 404", async () => {
    const session = await login(app, "creator@reelay.test");
    const response = await app.inject({
      method: "GET",
      url: "/api/workspaces/workspace-missing/media-assets/asset-missing/content",
      headers: { cookie: session },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("workspace_not_found");
  });
});

it("rejects uploads beyond the deployment limit before creating an intent or accepting bytes", async () => {
  const seed = createDemoSeed();
  const store = new InMemoryCollaborationStore(seed);
  const assetStore = new InMemoryAssetStore({
    workspaceMemberships: seed.memberships.map(({ workspaceId, actorId }) => ({ workspaceId, actorId })),
    projects: [],
  });
  const createIntent = vi.spyOn(assetStore, "createUploadIntent");
  const app = await buildServer({ store, assetStore, objectStore: new InMemoryObjectStore(), maxAssetUploadBytes: 4 * 1024 * 1024 });
  try {
    const session = await login(app, "creator@reelay.test");
    const response = await app.inject({
      method: "POST",
      url: "/api/workspaces/workspace-organization-reelay/media-upload-intents",
      headers: { cookie: session },
      payload: { idempotencyKey: "cloud-limit-contract", mediaKind: "image", displayName: "large.png", contentType: "image/png", byteSize: 4 * 1024 * 1024 + 1, checksumSha256: "a".repeat(64) },
    });
    expect(response.statusCode).toBe(413);
    expect(response.json().error).toEqual({ code: "asset_too_large", message: "当前环境单个素材最大支持 4 MB。" });
    expect(createIntent).not.toHaveBeenCalled();
    const oversized = await app.inject({
      method: "PUT", url: "/api/workspaces/workspace-organization-reelay/media-upload-intents/test/content",
      headers: { cookie: session, "content-type": "application/octet-stream" }, payload: Buffer.alloc(4 * 1024 * 1024 + 1),
    });
    expect(oversized.statusCode).toBe(413);
  } finally { await app.close(); }
});

it("authorizes signed large uploads and publishes only after verifying actual bytes, with idempotent finalize", async () => {
  const seed = createDemoSeed();
  const store = new InMemoryCollaborationStore(seed);
  const assetStore = new InMemoryAssetStore({
    workspaceMemberships: seed.memberships.map(({ workspaceId, actorId }) => ({ workspaceId, actorId })), projects: [],
  });
  const objectStore = new InMemoryObjectStore();
  const signedUpload = vi.fn(async (_input: { objectKey: string; contentType: string; checksumSha256: string }) => ({
    url: "https://project.supabase.co/storage/v1/object/upload/sign/private/file?token=upload",
    method: "PUT" as const, headers: { "Content-Type": "video/mp4", "x-metadata": "verified-after-upload" },
  }));
  Object.assign(objectStore, { createSignedUpload: signedUpload });
  const app = await buildServer({ store, assetStore, objectStore, maxAssetUploadBytes: 4 * 1024 * 1024 });
  try {
    const session = await login(app, "creator@reelay.test");
    const body = Buffer.alloc(5 * 1024 * 1024, 7);
    const checksumSha256 = createHash("sha256").update(body).digest("hex");
    const payload = { idempotencyKey: "cloud-direct-upload", mediaKind: "video", displayName: "large.mp4", contentType: "video/mp4", byteSize: body.byteLength, checksumSha256 };
    const base = "/api/workspaces/workspace-organization-reelay/media-upload-intents";
    const unauthenticated = await app.inject({ method: "POST", url: base, payload });
    expect(unauthenticated.statusCode).toBe(401);
    const forbidden = await app.inject({ method: "POST", url: "/api/workspaces/workspace-other/media-upload-intents", payload, headers: { cookie: session } });
    expect(forbidden.statusCode).toBe(404);
    expect(signedUpload).not.toHaveBeenCalled();
    const oversize = await app.inject({ method: "POST", url: base, headers: { cookie: session }, payload: { ...payload, byteSize: 50 * 1024 * 1024 + 1 } });
    expect(oversize.statusCode).toBe(413);
    const created = await app.inject({ method: "POST", url: base, headers: { cookie: session }, payload });
    expect(created.statusCode).toBe(201);
    expect(created.json().upload.url).toContain("/object/upload/sign/");
    const intentId = created.json().uploadIntent.id;
    const finalizeUrl = `${base}/${intentId}/finalize`;
    const pending = await app.inject({ method: "POST", url: finalizeUrl, headers: { cookie: session } });
    expect(pending.statusCode).toBe(409);
    const oversizedProxy = await app.inject({ method: "PUT", url: `${base}/${intentId}/content`, headers: { cookie: session, "content-type": "application/octet-stream" }, payload: body });
    expect(oversizedProxy.statusCode).toBe(413);
    const uploadInput = signedUpload.mock.calls[0][0];
    await objectStore.putObject({ ...uploadInput, body });
    const getObject = vi.spyOn(objectStore, "getObject");
    const validObject = await objectStore.getObject(uploadInput.objectKey);
    // Even a forged HEAD/metadata digest cannot hide changed uploaded bytes.
    getObject.mockResolvedValueOnce({ ...validObject!, body: new Uint8Array(body.byteLength).fill(9) });
    const corrupt = await app.inject({ method: "POST", url: finalizeUrl, headers: { cookie: session } });
    expect(corrupt.statusCode).toBe(409);
    expect(corrupt.json().error.code).toBe("asset_upload_metadata_mismatch");
    const before = await app.inject({ method: "GET", url: "/api/workspaces/workspace-organization-reelay/media-assets", headers: { cookie: session } });
    expect(before.json().assets).toEqual([]);
    const finalized = await app.inject({ method: "POST", url: finalizeUrl, headers: { cookie: session } });
    expect(finalized.statusCode).toBe(200);
    expect(finalized.json().asset.checksumSha256).toBe(checksumSha256);
    getObject.mockClear();
    const repeated = await app.inject({ method: "POST", url: finalizeUrl, headers: { cookie: session } });
    expect(repeated.json().asset.id).toBe(finalized.json().asset.id);
    expect(getObject).not.toHaveBeenCalled();
    const outsider = await login(app, "chenxi@reelay.test");
    const denied = await app.inject({ method: "POST", url: finalizeUrl, headers: { cookie: outsider } });
    expect(denied.statusCode).toBe(404);
  } finally { await app.close(); }
});
