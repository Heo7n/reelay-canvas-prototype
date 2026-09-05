import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { canonicalizeLegacyCanvasDocumentV1 } from "../contracts/canvas-document-v1";
import { buildServer } from "./app";
import { createDemoSeed, DEMO_PASSWORD } from "./demo-fixtures";
import { InMemoryCollaborationStore } from "./infrastructure/InMemoryCollaborationStore";

function getCookie(response: LightMyRequestResponse): string {
  const header = response.headers["set-cookie"];
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) throw new Error("Expected demo session cookie.");
  return value.split(";", 1)[0];
}

async function login(app: FastifyInstance, account: string): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/demo/session",
    payload: { account, password: DEMO_PASSWORD },
  });
  expect(response.statusCode).toBe(201);
  return getCookie(response);
}

function canvasContent(nodeIds: string[] = []) {
  const content = canonicalizeLegacyCanvasDocumentV1({
    kind: "reelay-legacy-canvas",
    version: 1,
    activeCanvasId: "canvas-main",
    canvases: [{
      id: "canvas-main",
      name: "Main canvas",
      nodes: nodeIds.map((id) => ({ id, kind: "generator" })),
    }],
  });
  if (!content) throw new Error("Expected valid CanvasDocument v1 test fixture.");
  return content;
}

describe("organization project access API", () => {
  let app: FastifyInstance;
  let store: InMemoryCollaborationStore;

  beforeEach(async () => {
    store = new InMemoryCollaborationStore();
    app = await buildServer({ store });
  });

  afterEach(async () => {
    await app.close();
  });

  it("signs in ten demo accounts that all belong to one organization", async () => {
    const accounts = [
      { account: "creator@reelay.test", role: "owner" },
      { account: "linjing@reelay.test", role: "admin" },
      { account: "liran@reelay.test", role: "admin" },
      { account: "chenxi@reelay.test", role: "member" },
      { account: "zhouyu@reelay.test", role: "member" },
      { account: "suhe@reelay.test", role: "member" },
      { account: "wangyin@reelay.test", role: "member" },
      { account: "xuzhe@reelay.test", role: "member" },
      { account: "yelan@reelay.test", role: "member" },
      { account: "shenan@reelay.test", role: "member" },
    ];

    for (const { account, role } of accounts) {
      const cookie = await login(app, account);
      const response = await app.inject({ method: "GET", url: "/api/workspaces", headers: { cookie } });
      expect(response.statusCode).toBe(200);
      expect(response.json().workspaces).toEqual([
        { id: "workspace-organization-reelay", kind: "organization", name: "星海视觉工作室", currentUserRole: role },
      ]);
    }
  });

  it("returns workspace route context in one authenticated response", async () => {
    const cookie = await login(app, "creator@reelay.test");
    const response = await app.inject({
      method: "GET",
      url: "/api/workspaces/workspace-organization-reelay/context",
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      actor: expect.objectContaining({
        account: "creator@reelay.test",
        workspaceIds: ["workspace-organization-reelay"],
      }),
      projects: expect.arrayContaining([
        expect.objectContaining({ workspaceId: "workspace-organization-reelay" }),
      ]),
      workspaces: [
        expect.objectContaining({
          id: "workspace-organization-reelay",
          currentUserRole: "owner",
        }),
      ],
    });
  });

  it("lists organization members only for a workspace in the current session scope", async () => {
    const seed = createDemoSeed();
    seed.workspaces.push({
      id: "workspace-existing-but-forbidden",
      kind: "organization",
      name: "不可访问的组织",
    });
    const scopedApp = await buildServer({ store: new InMemoryCollaborationStore(seed) });

    try {
      const ownerCookie = await login(scopedApp, "creator@reelay.test");
      const response = await scopedApp.inject({
        method: "GET",
        url: "/api/workspaces/workspace-organization-reelay/members",
        headers: { cookie: ownerCookie },
      });

      expect(response.statusCode).toBe(200);
      const members = response.json().members;
      expect(members).toHaveLength(10);
      expect(members.map((member: { role: string }) => member.role)).toEqual([
        "owner",
        "admin",
        "admin",
        "member",
        "member",
        "member",
        "member",
        "member",
        "member",
        "member",
      ]);
      expect(members).toEqual(expect.arrayContaining([
        {
          userId: "actor-tianmaochao",
          displayName: "Hoo",
          loginIdentifier: "creator@reelay.test",
          role: "owner",
        },
        {
          userId: "actor-linjing",
          displayName: "林静",
          loginIdentifier: "linjing@reelay.test",
          role: "admin",
        },
        {
          userId: "actor-liran",
          displayName: "李然",
          loginIdentifier: "liran@reelay.test",
          role: "admin",
        },
        expect.objectContaining({ userId: "actor-chenxi", role: "member" }),
        expect.objectContaining({ userId: "actor-shenan", role: "member" }),
        expect.objectContaining({ userId: "actor-suhe", role: "member" }),
        expect.objectContaining({ userId: "actor-wangyin", role: "member" }),
        expect.objectContaining({ userId: "actor-xuzhe", role: "member" }),
        expect.objectContaining({ userId: "actor-yelan", role: "member" }),
        expect.objectContaining({ userId: "actor-zhouyu", role: "member" }),
      ]));

      const forbidden = await scopedApp.inject({
        method: "GET",
        url: "/api/workspaces/workspace-existing-but-forbidden/members",
        headers: { cookie: ownerCookie },
      });
      expect(forbidden.statusCode).toBe(403);
      expect(forbidden.json().error.code).toBe("workspace_forbidden");

      const anonymous = await scopedApp.inject({
        method: "GET",
        url: "/api/workspaces/workspace-organization-reelay/members",
      });
      expect(anonymous.statusCode).toBe(401);
      expect(anonymous.json().error.code).toBe("session_required");
    } finally {
      await scopedApp.close();
    }
  });

  it("stores optional contact details independently from the login identifier", async () => {
    const ownerCookie = await login(app, "creator@reelay.test");

    const invalid = await app.inject({
      method: "PATCH",
      url: "/api/account",
      headers: { cookie: ownerCookie },
      payload: { contactEmail: "not-an-email", contactPhone: "123" },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe("invalid_request");

    const updated = await app.inject({
      method: "PATCH",
      url: "/api/account",
      headers: { cookie: ownerCookie },
      payload: { contactEmail: "owner@example.com", contactPhone: "+86 138 0000 0000" },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().actor).toEqual(
      expect.objectContaining({
        account: "creator@reelay.test",
        contactEmail: "owner@example.com",
        contactPhone: "+86 138 0000 0000",
      }),
    );

    const restored = await app.inject({
      method: "GET",
      url: "/api/session",
      headers: { cookie: ownerCookie },
    });
    expect(restored.json().actor).toEqual(
      expect.objectContaining({
        account: "creator@reelay.test",
        contactEmail: "owner@example.com",
        contactPhone: "+86 138 0000 0000",
      }),
    );

    const anonymous = await app.inject({
      method: "PATCH",
      url: "/api/account",
      payload: { contactEmail: null, contactPhone: null },
    });
    expect(anonymous.statusCode).toBe(401);
  });

  it("creates a private project that only its creator can read and delete", async () => {
    const ownerCookie = await login(app, "creator@reelay.test");
    const memberCookie = await login(app, "linjing@reelay.test");

    const created = await app.inject({
      method: "POST",
      url: "/api/workspaces/workspace-organization-reelay/projects",
      headers: { cookie: ownerCookie },
      payload: { name: "个人项目演示", accessKind: "private" },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().project).toEqual(
      expect.objectContaining({ accessKind: "private", currentUserRole: "admin", name: "个人项目演示" }),
    );
    const projectId = created.json().project.id as string;

    const memberList = await app.inject({
      method: "GET",
      url: "/api/workspaces/workspace-organization-reelay/projects",
      headers: { cookie: memberCookie },
    });
    expect(memberList.json().projects).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: projectId })]),
    );

    const hiddenLookup = await app.inject({
      method: "GET",
      url: `/api/workspaces/workspace-organization-reelay/projects/${projectId}`,
      headers: { cookie: memberCookie },
    });
    expect(hiddenLookup.statusCode).toBe(404);
    expect(hiddenLookup.json().error.code).toBe("project_not_found");

    const removed = await app.inject({
      method: "DELETE",
      url: `/api/workspaces/workspace-organization-reelay/projects/${projectId}`,
      headers: { cookie: ownerCookie },
    });
    expect(removed.statusCode).toBe(204);
    const removedLookup = await app.inject({
      method: "GET",
      url: `/api/workspaces/workspace-organization-reelay/projects/${projectId}`,
      headers: { cookie: ownerCookie },
    });
    expect(removedLookup.statusCode).toBe(404);
  });

  it("enforces collaborative admin, edit, view and non-member roles", async () => {
    const adminCookie = await login(app, "creator@reelay.test");
    const editCookie = await login(app, "linjing@reelay.test");
    const viewCookie = await login(app, "zhouyu@reelay.test");
    const nonMemberCookie = await login(app, "chenxi@reelay.test");
    const url = "/api/workspaces/workspace-organization-reelay/projects/project-scifi-trailer";

    const edited = await app.inject({
      method: "PATCH",
      url,
      headers: { cookie: editCookie },
      payload: { name: "协作项目已重命名" },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().project.currentUserRole).toBe("edit");

    const viewed = await app.inject({ method: "GET", url, headers: { cookie: viewCookie } });
    expect(viewed.statusCode).toBe(200);
    expect(viewed.json().project).toEqual(
      expect.objectContaining({ name: "协作项目已重命名", currentUserRole: "view" }),
    );

    const viewUpdate = await app.inject({
      method: "PATCH",
      url,
      headers: { cookie: viewCookie },
      payload: { name: "不应生效" },
    });
    expect(viewUpdate.statusCode).toBe(403);
    expect(viewUpdate.json().error.code).toBe("project_forbidden");

    const hidden = await app.inject({ method: "GET", url, headers: { cookie: nonMemberCookie } });
    expect(hidden.statusCode).toBe(404);

    const adminLookup = await app.inject({ method: "GET", url, headers: { cookie: adminCookie } });
    expect(adminLookup.statusCode).toBe(200);
    expect(adminLookup.json().project.currentUserRole).toBe("admin");
  });

  it("moves projects to recoverable trash and immediately revokes project and canvas access", async () => {
    const adminCookie = await login(app, "creator@reelay.test");
    const editCookie = await login(app, "linjing@reelay.test");
    const viewCookie = await login(app, "zhouyu@reelay.test");
    const outsiderCookie = await login(app, "chenxi@reelay.test");
    const projectUrl = "/api/workspaces/workspace-organization-reelay/projects/project-scifi-trailer";
    const canvasUrl = "/api/projects/project-scifi-trailer/canvases/delete-test/document";

    const canvas = await app.inject({
      method: "PUT",
      url: canvasUrl,
      headers: { cookie: adminCookie },
      payload: { schemaVersion: 1, expectedRevision: 0, content: canvasContent(["preserved"]) },
    });
    expect(canvas.statusCode).toBe(201);

    for (const cookie of [editCookie, viewCookie]) {
      const forbidden = await app.inject({ method: "DELETE", url: projectUrl, headers: { cookie } });
      expect(forbidden.statusCode).toBe(403);
      expect(forbidden.json().error.code).toBe("project_forbidden");
    }
    const hidden = await app.inject({ method: "DELETE", url: projectUrl, headers: { cookie: outsiderCookie } });
    expect(hidden.statusCode).toBe(404);

    const removed = await app.inject({ method: "DELETE", url: projectUrl, headers: { cookie: adminCookie } });
    expect(removed.statusCode).toBe(204);

    const projectLookup = await app.inject({ method: "GET", url: projectUrl, headers: { cookie: adminCookie } });
    expect(projectLookup.statusCode).toBe(404);
    const projectList = await app.inject({
      method: "GET",
      url: "/api/workspaces/workspace-organization-reelay/projects",
      headers: { cookie: adminCookie },
    });
    expect(projectList.json().projects).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "project-scifi-trailer" })]),
    );

    const canvasLookup = await app.inject({ method: "GET", url: canvasUrl, headers: { cookie: adminCookie } });
    expect(canvasLookup.statusCode).toBe(404);
    const lateCanvasSave = await app.inject({
      method: "PUT",
      url: canvasUrl,
      headers: { cookie: editCookie },
      payload: { schemaVersion: 1, expectedRevision: 1, content: canvasContent(["late-write"]) },
    });
    expect(lateCanvasSave.statusCode).toBe(404);

    const repeated = await app.inject({ method: "DELETE", url: projectUrl, headers: { cookie: adminCookie } });
    expect(repeated.statusCode).toBe(404);
  });

  it("creates, loads and revision-checks a canvas document", async () => {
    const adminCookie = await login(app, "creator@reelay.test");
    const url = "/api/projects/project-perfume-tvc/canvases/main/document";

    const empty = await app.inject({ method: "GET", url, headers: { cookie: adminCookie } });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toEqual({ document: null });

    const missingRevision = await app.inject({
      method: "PUT",
      url,
      headers: { cookie: adminCookie },
      payload: { schemaVersion: 1, expectedRevision: 1, content: canvasContent() },
    });
    expect(missingRevision.statusCode).toBe(409);
    expect(missingRevision.json().error.currentRevision).toBe(0);

    const created = await app.inject({
      method: "PUT",
      url,
      headers: { cookie: adminCookie },
      payload: {
        schemaVersion: 1,
        expectedRevision: 0,
        content: canvasContent(["node-one"]),
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().document).toEqual({
      id: "main",
      projectId: "project-perfume-tvc",
      schemaVersion: 1,
      revision: 1,
      content: canvasContent(["node-one"]),
    });

    const updated = await app.inject({
      method: "PUT",
      url,
      headers: { cookie: adminCookie },
      payload: {
        schemaVersion: 2,
        expectedRevision: 1,
        content: canvasContent(),
      },
    });
    expect(updated.statusCode).toBe(400);
    expect(updated.json().error.code).toBe("unsupported_canvas_document");

    const validUpdate = await app.inject({
      method: "PUT",
      url,
      headers: { cookie: adminCookie },
      payload: { schemaVersion: 1, expectedRevision: 1, content: canvasContent() },
    });
    expect(validUpdate.statusCode).toBe(200);
    expect(validUpdate.json().document).toEqual(
      expect.objectContaining({ schemaVersion: 1, revision: 2 }),
    );

    const stale = await app.inject({
      method: "PUT",
      url,
      headers: { cookie: adminCookie },
      payload: { schemaVersion: 1, expectedRevision: 1, content: canvasContent(["stale"]) },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error).toEqual(
      expect.objectContaining({ code: "canvas_revision_conflict", currentRevision: 2 }),
    );

    const restored = await app.inject({ method: "GET", url, headers: { cookie: adminCookie } });
    expect(restored.json().document).toEqual(
      expect.objectContaining({ revision: 2, schemaVersion: 1, content: canvasContent() }),
    );
  });

  it("uses project roles for every canvas document read and write", async () => {
    const adminCookie = await login(app, "creator@reelay.test");
    const editCookie = await login(app, "linjing@reelay.test");
    const viewCookie = await login(app, "zhouyu@reelay.test");
    const outsiderCookie = await login(app, "chenxi@reelay.test");
    const url = "/api/projects/project-scifi-trailer/canvases/storyboard/document";

    const created = await app.inject({
      method: "PUT",
      url,
      headers: { cookie: adminCookie },
      payload: { schemaVersion: 1, expectedRevision: 0, content: canvasContent() },
    });
    expect(created.statusCode).toBe(201);

    const edited = await app.inject({
      method: "PUT",
      url,
      headers: { cookie: editCookie },
      payload: { schemaVersion: 1, expectedRevision: 1, content: canvasContent(["shared"]) },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().document.revision).toBe(2);

    const viewed = await app.inject({ method: "GET", url, headers: { cookie: viewCookie } });
    expect(viewed.statusCode).toBe(200);
    expect(viewed.json().document.content).toEqual(canvasContent(["shared"]));

    const viewWrite = await app.inject({
      method: "PUT",
      url,
      headers: { cookie: viewCookie },
      payload: { schemaVersion: 1, expectedRevision: 2, content: canvasContent() },
    });
    expect(viewWrite.statusCode).toBe(403);
    expect(viewWrite.json().error.code).toBe("project_forbidden");

    const hiddenRead = await app.inject({ method: "GET", url, headers: { cookie: outsiderCookie } });
    expect(hiddenRead.statusCode).toBe(404);
    expect(hiddenRead.json().error.code).toBe("project_not_found");

    const hiddenWrite = await app.inject({
      method: "PUT",
      url,
      headers: { cookie: outsiderCookie },
      payload: { schemaVersion: 1, expectedRevision: 2, content: canvasContent() },
    });
    expect(hiddenWrite.statusCode).toBe(404);
  });

  it("rejects invalid canvas document envelopes before saving", async () => {
    const adminCookie = await login(app, "creator@reelay.test");
    const response = await app.inject({
      method: "PUT",
      url: "/api/projects/project-perfume-tvc/canvases/main/document",
      headers: { cookie: adminCookie },
      payload: { schemaVersion: 0, expectedRevision: -1, content: {}, extra: true },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("invalid_request");

    const unsupportedInnerVersion = await app.inject({
      method: "PUT",
      url: "/api/projects/project-perfume-tvc/canvases/main/document",
      headers: { cookie: adminCookie },
      payload: {
        schemaVersion: 1,
        expectedRevision: 0,
        content: { ...canvasContent(), version: 2 },
      },
    });
    expect(unsupportedInnerVersion.statusCode).toBe(400);
    expect(unsupportedInnerVersion.json().error.code).toBe("unsupported_canvas_document");
  });

  it("canonicalizes stored v1 documents and fails closed for unsupported or corrupt stored content", async () => {
    const cookie = await login(app, "creator@reelay.test");
    const baseInput = {
      actorId: "actor-tianmaochao",
      projectId: "project-perfume-tvc",
      expectedRevision: 0,
    };

    const legacyContent = {
      kind: "reelay-legacy-canvas",
      version: 1,
      activeCanvasId: "legacy",
      canvases: [{ id: "legacy", unknown: "drop-me", nodes: [] }],
      hostile: true,
    };
    await store.saveCanvasDocument({
      ...baseInput,
      canvasId: "legacy-v1",
      schemaVersion: 1,
      content: legacyContent,
    });
    const canonical = await app.inject({
      method: "GET",
      url: "/api/projects/project-perfume-tvc/canvases/legacy-v1/document",
      headers: { cookie },
    });
    expect(canonical.statusCode).toBe(200);
    expect(canonical.json().document.content).toEqual(canonicalizeLegacyCanvasDocumentV1(legacyContent));

    await store.saveCanvasDocument({
      ...baseInput,
      canvasId: "future",
      schemaVersion: 2,
      content: { ...canvasContent(), version: 2 },
    });
    const unsupported = await app.inject({
      method: "GET",
      url: "/api/projects/project-perfume-tvc/canvases/future/document",
      headers: { cookie },
    });
    expect(unsupported.statusCode).toBe(422);
    expect(unsupported.json().error.code).toBe("unsupported_canvas_document");

    await store.saveCanvasDocument({
      ...baseInput,
      canvasId: "corrupt",
      schemaVersion: 1,
      content: { nodes: [] },
    });
    const corrupt = await app.inject({
      method: "GET",
      url: "/api/projects/project-perfume-tvc/canvases/corrupt/document",
      headers: { cookie },
    });
    expect(corrupt.statusCode).toBe(422);
    expect(corrupt.json().error.code).toBe("corrupt_canvas_document");
  });

  it("requires a valid session and keeps project lookup inside its workspace", async () => {
    const anonymous = await app.inject({
      method: "GET",
      url: "/api/workspaces/workspace-organization-reelay/projects/project-brand-story",
    });
    expect(anonymous.statusCode).toBe(401);

    const ownerCookie = await login(app, "creator@reelay.test");
    const found = await app.inject({
      method: "GET",
      url: "/api/workspaces/workspace-organization-reelay/projects/project-brand-story",
      headers: { cookie: ownerCookie },
    });
    expect(found.statusCode).toBe(200);
    expect(found.json().project.name).toBe("品牌故事片脚本");

    const wrongWorkspace = await app.inject({
      method: "GET",
      url: "/api/workspaces/workspace-does-not-exist/projects/project-brand-story",
      headers: { cookie: ownerCookie },
    });
    expect(wrongWorkspace.statusCode).toBe(404);
  });
});
