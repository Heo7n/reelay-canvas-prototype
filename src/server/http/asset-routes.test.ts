import { createHash } from "node:crypto";

import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildServer } from "../app";
import { createDemoSeed, DEMO_PASSWORD } from "../demo-fixtures";
import { InMemoryEntityStore } from "../infrastructure/InMemoryEntityStore";
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
      workspaceMemberships: seed.memberships.map(({ workspaceId, actorId, role }) => ({ workspaceId, actorId, role })),
      projects: seed.projects.map((project) => ({
        id: project.id,
        workspaceId: project.workspaceId,
        members: seed.projectMemberships
          .filter((membership) => membership.projectId === project.id)
          .map(({ actorId, role }) => ({ actorId, role })),
      })),
    });
    objectStore = new InMemoryObjectStore();
    const entityStore = new InMemoryEntityStore({ workspaceMemberships: seed.memberships, assets: [], personalAssetPlacements: [] });
    app = await buildServer({ store, assetStore, entityStore, objectStore });
  });

  afterEach(async () => app.close());

  it("saves a scoped library entry through real routes and exposes organization content only to members", async () => {
    const session = await login(app, "creator@reelay.test");
    const headers = { cookie: session };
    const base = "/api/workspaces/workspace-organization-reelay/media-library";
    const body = Buffer.from("library-content");
    const intent = await app.inject({ method: "POST", url: "/api/workspaces/workspace-organization-reelay/media-upload-intents", headers,
      payload: { idempotencyKey: "library-route-upload", mediaKind: "image", displayName: "Source.png", contentType: "image/png", byteSize: body.byteLength, checksumSha256: createHash("sha256").update(body).digest("hex") } });
    expect(intent.statusCode).toBe(201);
    await app.inject({ method: "PUT", url: intent.json().upload.url, headers: { ...headers, "content-type": "application/octet-stream" }, payload: body });
    const finalized = await app.inject({ method: "POST", url: `/api/workspaces/workspace-organization-reelay/media-upload-intents/${intent.json().uploadIntent.id}/finalize`, headers });
    const assetId = finalized.json().asset.id;
    const outsider = await login(app, "chenxi@reelay.test");
    const contentUrl = `/api/workspaces/workspace-organization-reelay/media-assets/${assetId}/content`;
    expect((await app.inject({ method: "GET", url: contentUrl, headers: { cookie: outsider } })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: base })).statusCode).toBe(401);
    const folderResponse = await app.inject({ method: "POST", url: `${base}/folders`, headers, payload: { space: "organization", parentId: null, name: "角色参考" } });
    expect(folderResponse.statusCode).toBe(200);
    const folderId = folderResponse.json().folder.id;
    const tagResponse = await app.inject({ method: "POST", url: `${base}/tags`, headers, payload: { space: "organization", name: "夏日" } });
    expect(tagResponse.statusCode).toBe(200);
    const tagId = tagResponse.json().tag.id;
    const payload = { projectId: "project-scifi-trailer", space: "organization", folderId, tagIds: ["builtin:character", tagId], items: [{ assetId, displayName: "Shared title", action: "save" }] };
    const saved = await app.inject({ method: "POST", url: `${base}/save`, headers, payload });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().catalog.entries).toEqual(expect.arrayContaining([expect.objectContaining({ assetId, space: "personal", displayName: "Source.png", folderId: null }), expect.objectContaining({ assetId, space: "organization", displayName: "Shared title", folderId, tagIds: ["builtin:character", tagId] })]));
    expect((await app.inject({ method: "POST", url: `${base}/save`, headers, payload })).json()).toEqual(saved.json());
    const renameUrl = `/api/workspaces/workspace-organization-reelay/media-assets/${assetId}`;
    expect((await app.inject({method: "PATCH", url: renameUrl, headers: {cookie: outsider}, payload: {space: "organization", displayName: "Denied.png"}})).statusCode).toBe(403);
    const renamedShared = await app.inject({method: "PATCH", url: renameUrl, headers, payload: {space: "organization", displayName: "Renamed shared.png"}});
    expect(renamedShared.statusCode).toBe(200);
    expect(renamedShared.json().asset.displayName).toBe("Renamed shared.png");
    expect((await app.inject({method: "PATCH", url: renameUrl, headers, payload: {space: "platform", displayName: "Denied.png"}})).statusCode).toBe(400);
    const afterRename = await app.inject({method: "GET", url: base, headers});
    expect(afterRename.json().catalog.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({assetId, space: "organization", displayName: "Renamed shared.png", folderId, tagIds: ["builtin:character", tagId]}),
      expect.objectContaining({assetId, space: "personal", displayName: "Source.png"}),
    ]));
    const shared = await app.inject({ method: "GET", url: base, headers: { cookie: outsider } });
    expect(shared.statusCode).toBe(200);
    expect(shared.json().catalog.entries).toHaveLength(1);
    expect(shared.json().catalog.entries[0].space).toBe("organization");
    const content = await app.inject({ method: "GET", url: contentUrl, headers: { cookie: outsider } });
    expect(content.statusCode).toBe(200);
    expect(content.rawPayload).toEqual(body);
    expect((await app.inject({ method: "POST", url: `${base}/save`, headers, payload: { ...payload, folderId: null } })).statusCode).toBe(409);
    expect((await app.inject({ method: "POST", url: `${base}/folders`, headers, payload: { space: "platform", parentId: null, name: "Bad" } })).statusCode).toBe(400);
  });

  it("renames a directory through the scoped route with optimistic conflict and manager checks", async () => {
    const session = await login(app, "creator@reelay.test"), member = await login(app, "chenxi@reelay.test");
    const headers = { cookie: session };
    const base = "/api/workspaces/workspace-organization-reelay/media-library";
    const personal = (await app.inject({ method: "POST", url: `${base}/folders`, headers, payload: { space: "personal", parentId: null, name: "Original" } })).json().folder;
    const shared = (await app.inject({ method: "POST", url: `${base}/folders`, headers, payload: { space: "organization", parentId: null, name: "Shared" } })).json().folder;
    const payload = { space: "personal", folderId: personal.id, name: "Renamed", expectedName: personal.name };
    expect((await app.inject({ method: "POST", url: `${base}/rename-folder`, payload })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: `${base}/rename-folder`, headers: { cookie: member }, payload })).statusCode).toBe(404);
    const renamed = await app.inject({ method: "POST", url: `${base}/rename-folder`, headers, payload });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().folder).toEqual({ ...personal, name: "Renamed" });
    expect((await app.inject({ method: "POST", url: `${base}/rename-folder`, headers, payload })).json()).toEqual(renamed.json());
    const stale = await app.inject({ method: "POST", url: `${base}/rename-folder`, headers, payload: { ...payload, name: "Lost update" } });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe("folder_changed");
    expect((await app.inject({ method: "POST", url: `${base}/rename-folder`, headers, payload: { ...payload, name: " " } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: `${base}/rename-folder`, headers, payload: { ...payload, folderId: null } })).statusCode).toBe(400);
    const organizationPayload = { ...payload, space: "organization", folderId: shared.id, expectedName: shared.name };
    expect((await app.inject({ method: "POST", url: `${base}/rename-folder`, headers: { cookie: member }, payload: organizationPayload })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: `${base}/rename-folder`, headers, payload: organizationPayload })).statusCode).toBe(200);
  });

  it("creates groups directly in folders and exposes strict, atomic, private group moves", async () => {
    const headers = { cookie: await login(app, "creator@reelay.test") };
    const workspace = "/api/workspaces/workspace-organization-reelay";
    const base = `${workspace}/media-library`;
    const body = Buffer.from("group-directory-content");
    const intent = await app.inject({ method: "POST", url: `${workspace}/media-upload-intents`, headers,
      payload: { idempotencyKey: "directory-upload", mediaKind: "image", displayName: "Source.png", contentType: "image/png", byteSize: body.byteLength, checksumSha256: createHash("sha256").update(body).digest("hex") } });
    await app.inject({ method: "PUT", url: intent.json().upload.url, headers: { ...headers, "content-type": "application/octet-stream" }, payload: body });
    const assetId = (await app.inject({ method: "POST", url: `${workspace}/media-upload-intents/${intent.json().uploadIntent.id}/finalize`, headers })).json().asset.id;
    const folder = (await app.inject({ method: "POST", url: `${base}/folders`, headers, payload: { space: "personal", parentId: null, name: "Groups" } })).json().folder;
    const creation = { idempotencyKey: "directory-group", folderId: folder.id, name: "Group", description: "", assetIds: [assetId], coverAssetId: assetId };
    const groupResponse = await app.inject({ method: "POST", url: `${workspace}/entities`, headers, payload: creation });
    expect(groupResponse.statusCode).toBe(201);
    const group = groupResponse.json().entity;
    expect((await app.inject({ method: "GET", url: base, headers })).json().catalog.entityEntries[0]).toMatchObject({ folderId: folder.id, addedAt: group.createdAt });
    const payload = { space: "personal", folderId: null, items: [{ entityId: group.id, expectedFolderId: folder.id }] };
    const url = `${base}/move-entities`;
    expect((await app.inject({ method: "POST", url, payload })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url, headers, payload: { ...payload, actorId: "forged" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url, headers, payload: { ...payload, space: "organization" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url, headers, payload: { ...payload, items: [{ entityId: group.id }] } })).statusCode).toBe(400);
    const moved = await app.inject({ method: "POST", url, headers, payload });
    expect(moved.statusCode).toBe(200);
    expect(moved.json().catalog.entityEntries[0]).toMatchObject({ entityId: group.id, folderId: null });
    expect((await app.inject({ method: "POST", url, headers, payload })).json()).toEqual(moved.json());
    expect((await app.inject({ method: "POST", url: `${workspace}/entities`, headers, payload: creation })).statusCode).toBe(201);
    expect((await app.inject({ method: "POST", url: `${workspace}/entities`, headers, payload: { ...creation, idempotencyKey: "bad-directory", folderId: "missing" } })).statusCode).toBe(404);
  });

  it("organizes mixed group/media tags through strict authorized routes with all-or-nothing results", async () => {
    const headers = { cookie: await login(app, "creator@reelay.test") };
    const memberHeaders = { cookie: await login(app, "chenxi@reelay.test") };
    const workspace = "/api/workspaces/workspace-organization-reelay";
    const base = `${workspace}/media-library`;
    const body = Buffer.from("organize-tags-content");
    const intent = await app.inject({ method: "POST", url: `${workspace}/media-upload-intents`, headers,
      payload: { idempotencyKey: "tag-route-upload", mediaKind: "image", displayName: "Source.png", contentType: "image/png", byteSize: body.byteLength, checksumSha256: createHash("sha256").update(body).digest("hex") } });
    await app.inject({ method: "PUT", url: intent.json().upload.url, headers: { ...headers, "content-type": "application/octet-stream" }, payload: body });
    const finalized = await app.inject({ method: "POST", url: `${workspace}/media-upload-intents/${intent.json().uploadIntent.id}/finalize`, headers });
    const assetId = finalized.json().asset.id;
    const groupResponse = await app.inject({ method: "POST", url: `${workspace}/entities`, headers,
      payload: { idempotencyKey: "tag-route-group", name: "Group", description: "Preserve", assetIds: [assetId], coverAssetId: assetId } });
    expect(groupResponse.statusCode).toBe(201);
    const group = groupResponse.json().entity;
    const tag = (await app.inject({ method: "POST", url: `${base}/tags`, headers, payload: { space: "personal", name: "Custom" } })).json().tag;
    const payload = { space: "personal", operation: "add", tagIds: [tag.id, "builtin:scene"], items: [{ kind: "media", id: assetId }, { kind: "entity", id: group.id }] };
    const url = `${base}/tags/update`;
    expect((await app.inject({ method: "POST", url, payload })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url, headers, payload: { ...payload, actorId: "another-actor" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url, headers, payload: { ...payload, tagIds: [] } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url, headers: memberHeaders, payload: { ...payload, tagIds: ["builtin:scene"] } })).statusCode).toBe(404);
    const before = (await app.inject({ method: "GET", url: base, headers })).json();
    const failed = await app.inject({ method: "POST", url, headers, payload: { ...payload, items: [...payload.items, { kind: "media", id: "missing" }] } });
    expect(failed.statusCode).toBe(404);
    expect(failed.json().error.code).toBe("library_item_not_found");
    expect((await app.inject({ method: "GET", url: base, headers })).json()).toEqual(before);
    const updated = await app.inject({ method: "POST", url, headers, payload });
    expect(updated.statusCode).toBe(200);
    expect(updated.headers["cache-control"]).toBe("private, no-store");
    expect(updated.json().catalog.entries[0]).toMatchObject({ assetId, displayName: "Source.png", folderId: null, tagIds: ["builtin:scene", tag.id].sort() });
    expect(updated.json().catalog.entityEntries).toEqual([{ entityId: group.id, space: "personal", folderId: null, addedAt: group.createdAt, tagIds: ["builtin:scene", tag.id].sort() }]);
    expect((await app.inject({ method: "POST", url, headers, payload })).json()).toEqual(updated.json());
    expect((await app.inject({ method: "GET", url: `${workspace}/entities`, headers })).json().entities).toEqual([{ ...group, libraryTagIds: ["builtin:scene", tag.id].sort() }]);
    expect((await app.inject({ method: "POST", url, headers: memberHeaders, payload: { ...payload, space: "organization", items: [{ kind: "media", id: assetId }] } })).statusCode).toBe(403);
    const removed = await app.inject({ method: "POST", url, headers, payload: { ...payload, operation: "remove", tagIds: [tag.id] } });
    expect(removed.json().catalog.entries[0].tagIds).toEqual(["builtin:scene"]);
    expect(removed.json().catalog.entityEntries[0].tagIds).toEqual(["builtin:scene"]);
  });

  it("deletes custom tags through a strict route with usage conflicts and permission checks", async () => {
    const headers = { cookie: await login(app, "creator@reelay.test") };
    const memberHeaders = { cookie: await login(app, "chenxi@reelay.test") };
    const base = "/api/workspaces/workspace-organization-reelay/media-library";
    const tag = (await app.inject({ method: "POST", url: `${base}/tags`, headers, payload: { space: "personal", name: "Remove custom" } })).json().tag;
    const url = `${base}/tags/delete`;
    const payload = { space: "personal", tagId: tag.id, expectedUsageCount: 0 };
    expect((await app.inject({ method: "POST", url, payload })).statusCode).toBe(401);
    for (const invalid of [{ ...payload, actorId: "other" }, { ...payload, expectedUsageCount: -1 }, { ...payload, expectedUsageCount: 0.5 }, { space: "personal", tagId: tag.id }]) {
      expect((await app.inject({ method: "POST", url, headers, payload: invalid })).statusCode).toBe(400);
    }
    const preset = await app.inject({ method: "POST", url, headers, payload: { ...payload, tagId: "builtin:object" } });
    expect(preset.statusCode).toBe(400);
    expect(preset.json().error.code).toBe("preset_tag");
    const before = (await app.inject({ method: "GET", url: base, headers })).json();
    const stale = await app.inject({ method: "POST", url, headers, payload: { ...payload, expectedUsageCount: 1 } });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe("tag_usage_changed");
    expect((await app.inject({ method: "GET", url: base, headers })).json()).toEqual(before);
    expect((await app.inject({ method: "POST", url, headers: memberHeaders, payload: { ...payload, space: "organization", tagId: "missing" } })).statusCode).toBe(403);
    const removed = await app.inject({ method: "POST", url, headers, payload });
    expect(removed.statusCode).toBe(200);
    expect(removed.headers["cache-control"]).toBe("private, no-store");
    expect(removed.json().catalog.tags).toEqual([]);
    expect((await app.inject({ method: "POST", url, headers, payload })).json()).toEqual(removed.json());
  });

  it("deletes through the library route atomically without removing project media or source objects", async () => {
    const session = await login(app, "creator@reelay.test");
    const headers = { cookie: session };
    const base = "/api/workspaces/workspace-organization-reelay/media-library";
    const body = Buffer.from("delete-library-content");
    const writeObject = vi.spyOn(objectStore, "putObject");
    const intent = await app.inject({ method: "POST", url: "/api/workspaces/workspace-organization-reelay/media-upload-intents", headers,
      payload: { idempotencyKey: "delete-route-upload", mediaKind: "image", displayName: "Source.png", contentType: "image/png", byteSize: body.byteLength, checksumSha256: createHash("sha256").update(body).digest("hex") } });
    await app.inject({ method: "PUT", url: intent.json().upload.url, headers: { ...headers, "content-type": "application/octet-stream" }, payload: body });
    const finalized = await app.inject({ method: "POST", url: `/api/workspaces/workspace-organization-reelay/media-upload-intents/${intent.json().uploadIntent.id}/finalize`, headers });
    const assetId = finalized.json().asset.id;
    const entitiesUrl = "/api/workspaces/workspace-organization-reelay/entities";
    const groupResponse = await app.inject({ method: "POST", url: entitiesUrl, headers, payload: { idempotencyKey: "delete-route-group", name: "Group", description: "", assetIds: [assetId], coverAssetId: assetId } });
    expect(groupResponse.statusCode).toBe(201);
    const group = groupResponse.json().entity;
    const payload = { space: "personal", items: [{ kind: "media", id: assetId }] };
    const blocked = await app.inject({ method: "POST", url: `${base}/delete`, headers, payload });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe("library_item_in_use");
    expect((await app.inject({ method: "POST", url: `${base}/delete`, payload })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: `${base}/delete`, headers, payload: { space: "personal", items: [{ kind: "folder", id: null }] } })).statusCode).toBe(400);
    const deletePayload = { ...payload, items: [...payload.items, { kind: "entity", id: group.id, expectedVersion: group.version }] };
    const deleted = await app.inject({ method: "POST", url: `${base}/delete`, headers, payload: deletePayload });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json().catalog.entries).toEqual([]);
    expect((await app.inject({ method: "GET", url: entitiesUrl, headers })).json().entities).toEqual([]);
    expect((await app.inject({ method: "POST", url: `${base}/delete`, headers, payload: deletePayload })).json()).toEqual(deleted.json());
    const replay = await app.inject({ method: "POST", url: `/api/workspaces/workspace-organization-reelay/media-upload-intents/${intent.json().uploadIntent.id}/finalize`, headers });
    expect(replay.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: base, headers })).json().catalog.entries).toEqual([]);
    const object = await objectStore.getObject(writeObject.mock.calls[0][0].objectKey);
    expect(object?.body).toEqual(new Uint8Array(body));
  });

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
      displayName: "角色参考.png",
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
        workspaceMemberships: seed.memberships.map(({ workspaceId, actorId, role }) => ({ workspaceId, actorId, role })),
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

  it("does not reveal a workspace through unauthorized library content reads", async () => {
    const session = await login(app, "creator@reelay.test");
    const response = await app.inject({
      method: "GET",
      url: "/api/workspaces/workspace-missing/media-assets/asset-missing/content",
      headers: { cookie: session },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("asset_not_found");
  });
});

it("rejects uploads beyond the deployment limit before creating an intent or accepting bytes", async () => {
  const seed = createDemoSeed();
  const store = new InMemoryCollaborationStore(seed);
  const assetStore = new InMemoryAssetStore({
    workspaceMemberships: seed.memberships.map(({ workspaceId, actorId, role }) => ({ workspaceId, actorId, role })),
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
    workspaceMemberships: seed.memberships.map(({ workspaceId, actorId, role }) => ({ workspaceId, actorId, role })), projects: [],
  });
  const objectStore = new InMemoryObjectStore();
  const signedUpload = vi.fn(async (_input: { objectKey: string; contentType: string; checksumSha256: string }) => ({
    url: "https://project.supabase.co/storage/v1/object/upload/sign/private/file?token=upload",
    expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    maxFileBytes: 50 * 1024 * 1024,
    method: "PUT" as const, headers: { "Content-Type": "video/mp4", "x-metadata": "verified-after-upload" },
  }));
  Object.assign(objectStore, { createSignedUpload: signedUpload, getSignedUploadLimit: async () => 50 * 1024 * 1024 });
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
    expect(await assetStore.getMediaStorage({ actorId: "actor-tianmaochao", workspaceId: "workspace-organization-reelay" })).toMatchObject({ usedBytes: 0, reservedBytes: 50 * 1024 * 1024 });
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
    expect(await assetStore.getMediaStorage({ actorId: "actor-tianmaochao", workspaceId: "workspace-organization-reelay" })).toMatchObject({ usedBytes: body.byteLength, reservedBytes: 0 });
    const beforeReplayGrants = signedUpload.mock.calls.length;
    const intentReplay = await app.inject({ method: "POST", url: base, headers: { cookie: session }, payload });
    expect(intentReplay.statusCode).toBe(201);
    expect(intentReplay.json().uploadIntent.status).toBe("finalized");
    expect(intentReplay.json().upload.url).toContain(`/media-upload-intents/${intentId}/content`);
    expect(signedUpload).toHaveBeenCalledTimes(beforeReplayGrants);
    getObject.mockClear();
    const repeated = await app.inject({ method: "POST", url: finalizeUrl, headers: { cookie: session } });
    expect(repeated.json().asset.id).toBe(finalized.json().asset.id);
    expect(getObject).not.toHaveBeenCalled();
    const outsider = await login(app, "chenxi@reelay.test");
    const denied = await app.inject({ method: "POST", url: finalizeUrl, headers: { cookie: outsider } });
    expect(denied.statusCode).toBe(404);
  } finally { await app.close(); }
});
