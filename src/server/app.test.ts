import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildServer } from "./app";
import { DEMO_PASSWORD } from "./demo-fixtures";
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

describe("organization project access API", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildServer({ store: new InMemoryCollaborationStore() });
  });

  afterEach(async () => {
    await app.close();
  });

  it("signs in five demo accounts that all belong to one organization", async () => {
    const accounts = [
      "tianmaochao@reelay.test",
      "linjing@reelay.test",
      "chenxi@reelay.test",
      "zhouyu@reelay.test",
      "suhe@reelay.test",
    ];

    for (const account of accounts) {
      const cookie = await login(app, account);
      const response = await app.inject({ method: "GET", url: "/api/workspaces", headers: { cookie } });
      expect(response.statusCode).toBe(200);
      expect(response.json().workspaces).toEqual([
        { id: "workspace-organization-reelay", kind: "organization", name: "Reelay 创作组" },
      ]);
    }
  });

  it("creates a private project that only its creator can read", async () => {
    const ownerCookie = await login(app, "tianmaochao@reelay.test");
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
  });

  it("enforces collaborative admin, edit, view and non-member roles", async () => {
    const adminCookie = await login(app, "tianmaochao@reelay.test");
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

  it("requires a valid session and keeps project lookup inside its workspace", async () => {
    const anonymous = await app.inject({
      method: "GET",
      url: "/api/workspaces/workspace-organization-reelay/projects/project-brand-story",
    });
    expect(anonymous.statusCode).toBe(401);

    const ownerCookie = await login(app, "tianmaochao@reelay.test");
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
