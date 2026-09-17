import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildServer } from "../app";
import { createDemoSeed, DEMO_PASSWORD } from "../demo-fixtures";
import { InMemoryCollaborationStore } from "../infrastructure/InMemoryCollaborationStore";
import { InMemoryEntityStore } from "../infrastructure/InMemoryEntityStore";

const workspaceId = "workspace-organization-reelay";
const ownerId = "actor-tianmaochao";

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

describe("Entity persistence routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const seed = createDemoSeed();
    const store = new InMemoryCollaborationStore(seed);
    const entityStore = new InMemoryEntityStore({
      workspaceMemberships: seed.memberships.map(({ workspaceId: memberWorkspaceId, actorId, role }) => ({
        workspaceId: memberWorkspaceId,
        actorId,
        role,
      })),
      organizationAssetPlacements: [{ workspaceId, assetId: "asset-front" }],
      assets: [
        { id: "asset-front", workspaceId, mediaKind: "image", finalized: true },
        { id: "asset-voice", workspaceId, mediaKind: "audio", finalized: true },
        { id: "asset-motion", workspaceId, mediaKind: "video", finalized: true },
      ],
      personalAssetPlacements: [
        { workspaceId, assetId: "asset-front", ownerActorId: ownerId },
        { workspaceId, assetId: "asset-voice", ownerActorId: ownerId },
        { workspaceId, assetId: "asset-motion", ownerActorId: ownerId },
      ],
    });
    app = await buildServer({ store, entityStore });
  });

  afterEach(async () => app.close());

  it("creates, lists, reads, and version-updates a personal Entity through the stable DTO", async () => {
    const session = await login(app, "creator@reelay.test");
    const url = `/api/workspaces/${workspaceId}/entities`;
    const payload = {
      idempotencyKey: "create-lirael-http-1",
      name: "莉瑞尔",
      description: "精灵感角色",
      assetIds: ["asset-front", "asset-voice", "asset-front"],
      coverAssetId: "asset-front",
    };
    const created = await app.inject({ method: "POST", url, headers: { cookie: session }, payload });
    expect(created.statusCode).toBe(201);
    expect(created.json().entity).toEqual(expect.objectContaining({
      workspaceId,
      name: "莉瑞尔",
      version: 1,
      coverAssetId: "asset-front",
      mediaRefs: [
        { assetId: "asset-front", order: 0 },
        { assetId: "asset-voice", order: 1 },
      ],
    }));
    const entityId = created.json().entity.id as string;

    const repeated = await app.inject({ method: "POST", url, headers: { cookie: session }, payload });
    expect(repeated.statusCode).toBe(201);
    expect(repeated.json().entity.id).toBe(entityId);

    const listed = await app.inject({ method: "GET", url, headers: { cookie: session } });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().entities).toHaveLength(1);
    const read = await app.inject({ method: "GET", url: `${url}/${entityId}`, headers: { cookie: session } });
    expect(read.statusCode).toBe(200);

    const updated = await app.inject({
      method: "PATCH",
      url: `${url}/${entityId}`,
      headers: { cookie: session },
      payload: {
        expectedVersion: 1,
        name: "莉瑞尔新版",
        description: "只保留主视觉",
        assetIds: ["asset-front"],
        coverAssetId: null,
      },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().entity).toEqual(expect.objectContaining({
      id: entityId,
      version: 2,
      name: "莉瑞尔新版",
      coverAssetId: null,
      mediaRefs: [{ assetId: "asset-front", order: 0 }],
    }));

    const stale = await app.inject({
      method: "PATCH",
      url: `${url}/${entityId}`,
      headers: { cookie: session },
      payload: {
        expectedVersion: 1,
        name: "陈旧更新",
        description: "",
        assetIds: ["asset-front"],
        coverAssetId: null,
      },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error).toEqual(expect.objectContaining({
      code: "entity_version_conflict",
      currentVersion: 2,
    }));
  });


  it("round-trips optional placement tags and rejects stale tag snapshots before changing content", async () => {
    const session = await login(app, "creator@reelay.test");
    const url = `/api/workspaces/${workspaceId}/entities`;
    const headers = { cookie: session };
    const input = { idempotencyKey: "subject-tags-http", name: "Subject", assetIds: ["asset-front"], tagIds: ["builtin:character"] };
    const created = await app.inject({ method: "POST", url, headers, payload: input });
    expect(created.statusCode).toBe(201);
    expect(created.json().entity.libraryTagIds).toEqual(["builtin:character"]);
    const entityUrl = `${url}/${created.json().entity.id}`;
    const update = { expectedVersion: 1, name: "Updated", assetIds: ["asset-front"], tagIds: ["builtin:scene"], expectedTagIds: ["builtin:character"] };
    const stale = await app.inject({ method: "PATCH", url: entityUrl, headers, payload: { ...update, expectedTagIds: [] } });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe("placement_changed");
    const missing = await app.inject({ method: "PATCH", url: entityUrl, headers, payload: { ...update, expectedTagIds: undefined } });
    expect(missing.statusCode).toBe(400);
    const invalid = await app.inject({ method: "PATCH", url: entityUrl, headers, payload: { ...update, tagIds: ["builtin:sound"] } });
    expect(invalid.statusCode).toBe(404);
    const saved = await app.inject({ method: "PATCH", url: entityUrl, headers, payload: update });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().entity).toMatchObject({ name: "Updated", version: 2, libraryTagIds: ["builtin:scene"] });
    const cleared = await app.inject({ method: "PATCH", url: entityUrl, headers, payload: { ...update, expectedVersion: 2, expectedTagIds: ["builtin:scene"], tagIds: [] } });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json().entity.libraryTagIds).toEqual([]);
    const read = await app.inject({ method: "GET", url: entityUrl, headers });
    expect(read.json().entity.libraryTagIds).toEqual([]);
  });

  it("keeps personal Entity and media visibility actor-scoped", async () => {
    const ownerSession = await login(app, "creator@reelay.test");
    const otherSession = await login(app, "linjing@reelay.test");
    const url = `/api/workspaces/${workspaceId}/entities`;
    const created = await app.inject({
      method: "POST",
      url,
      headers: { cookie: ownerSession },
      payload: {
        idempotencyKey: "create-private-http-1",
        name: "个人主体",
        assetIds: ["asset-front"],
      },
    });
    const entityId = created.json().entity.id as string;

    const hidden = await app.inject({ method: "GET", url: `${url}/${entityId}`, headers: { cookie: otherSession } });
    expect(hidden.statusCode).toBe(404);
    expect(hidden.json().error.code).toBe("entity_not_found");
    const unavailableMedia = await app.inject({
      method: "POST",
      url,
      headers: { cookie: otherSession },
      payload: {
        idempotencyKey: "create-other-http-1",
        name: "越权主体",
        assetIds: ["asset-front"],
      },
    });
    expect(unavailableMedia.statusCode).toBe(404);
    expect(unavailableMedia.json().error.code).toBe("asset_not_found");
  });

  it("rejects invalid covers and requires a session", async () => {
    const url = `/api/workspaces/${workspaceId}/entities`;
    const unauthenticated = await app.inject({ method: "GET", url });
    expect(unauthenticated.statusCode).toBe(401);

    const session = await login(app, "creator@reelay.test");
    const invalidCover = await app.inject({
      method: "POST",
      url,
      headers: { cookie: session },
      payload: {
        idempotencyKey: "create-invalid-cover",
        name: "错误封面",
        assetIds: ["asset-front"],
        coverAssetId: "asset-voice",
      },
    });
    expect(invalidCover.statusCode).toBe(400);
    expect(invalidCover.json().error.code).toBe("invalid_entity");

    const audioCover = await app.inject({
      method: "POST",
      url,
      headers: { cookie: session },
      payload: {
        idempotencyKey: "create-audio-cover",
        name: "音频封面",
        assetIds: ["asset-front", "asset-voice"],
        coverAssetId: "asset-voice",
      },
    });
    expect(audioCover.statusCode).toBe(400);
    expect(audioCover.json().error.code).toBe("invalid_entity_cover");

    const videoCover = await app.inject({
      method: "POST",
      url,
      headers: { cookie: session },
      payload: {
        idempotencyKey: "create-video-cover",
        name: "视频封面",
        assetIds: ["asset-front", "asset-motion"],
        coverAssetId: "asset-motion",
      },
    });
    expect(videoCover.statusCode).toBe(400);
    expect(videoCover.json().error.code).toBe("invalid_entity_cover");
  });
});


describe("organization Entity HTTP scope", () => {
  it("validates scope, shares member-created subjects, and denies member edits", async () => {
    const seed = createDemoSeed();
    const entities = new InMemoryEntityStore({workspaceMemberships: seed.memberships,
      assets: [{id: "shared", workspaceId, mediaKind: "image", finalized: true}],
      organizationAssetPlacements: [{workspaceId, assetId: "shared"}], personalAssetPlacements: [],
    });
    const app = await buildServer({store: new InMemoryCollaborationStore(seed), entityStore: entities});
    try {
      const member = {cookie: await login(app, "chenxi@reelay.test")};
      const admin = {cookie: await login(app, "linjing@reelay.test")};
      const url = `/api/workspaces/${workspaceId}/entities`;
      const body = {space: "organization", idempotencyKey: "shared-http-request", name: "Shared", assetIds: ["shared"]};
      const created = await app.inject({method: "POST", url, headers: member, payload: body});
      expect(created.statusCode).toBe(201);
      expect(created.json().entity.space).toBe("organization");
      const item = `${url}/${created.json().entity.id}`;
      const listed = await app.inject({method: "GET", url: `${url}?scope=organization`, headers: admin});
      expect(listed.json().entities).toHaveLength(1);
      expect((await app.inject({method: "GET", url: `${item}?scope=organization`, headers: admin})).statusCode).toBe(200);
      expect((await app.inject({method: "GET", url: item, headers: admin})).statusCode).toBe(404);
      const update = {space: "organization", expectedVersion: 1, name: "Edited", assetIds: ["shared"]};
      const denied = await app.inject({method: "PATCH", url: item, headers: member, payload: update});
      expect(denied.statusCode).toBe(403);
      expect(denied.json().error.code).toBe("entity_forbidden");
      expect((await app.inject({method: "PATCH", url: item, headers: admin, payload: update})).statusCode).toBe(200);
      expect((await app.inject({method: "GET", url: `${item}?scope=platform`, headers: admin})).statusCode).toBe(400);
      expect((await app.inject({method: "POST", url, headers: member, payload: {...body, space: "platform"}})).statusCode).toBe(400);
    } finally { await app.close(); }
  });
});
