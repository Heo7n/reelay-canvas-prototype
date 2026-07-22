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

describe("shared organization project API", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildServer({ store: new InMemoryCollaborationStore() });
  });

  afterEach(async () => {
    await app.close();
  });

  it("shares project changes across two independent actor sessions", async () => {
    const ownerCookie = await login(app, "tianmaochao@reelay.test");
    const editorCookie = await login(app, "linjing@reelay.test");

    const ownerWorkspaces = await app.inject({ method: "GET", url: "/api/workspaces", headers: { cookie: ownerCookie } });
    const editorWorkspaces = await app.inject({ method: "GET", url: "/api/workspaces", headers: { cookie: editorCookie } });
    const ownerOrganization = ownerWorkspaces.json().workspaces.find((workspace: { kind: string }) => workspace.kind === "organization");
    const editorOrganization = editorWorkspaces.json().workspaces.find((workspace: { kind: string }) => workspace.kind === "organization");

    expect(ownerOrganization.id).toBe(editorOrganization.id);

    const created = await app.inject({
      method: "POST",
      url: `/api/workspaces/${ownerOrganization.id}/projects`,
      headers: { cookie: ownerCookie },
      payload: { name: "双浏览器协作演示" },
    });
    expect(created.statusCode).toBe(201);
    const projectId = created.json().project.id as string;

    const editorList = await app.inject({
      method: "GET",
      url: `/api/workspaces/${editorOrganization.id}/projects`,
      headers: { cookie: editorCookie },
    });
    expect(editorList.json().projects).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: projectId, name: "双浏览器协作演示" })]),
    );

    const renamed = await app.inject({
      method: "PATCH",
      url: `/api/workspaces/${editorOrganization.id}/projects/${projectId}`,
      headers: { cookie: editorCookie },
      payload: { name: "协作项目已重命名" },
    });
    expect(renamed.statusCode).toBe(200);

    const ownerList = await app.inject({
      method: "GET",
      url: `/api/workspaces/${ownerOrganization.id}/projects`,
      headers: { cookie: ownerCookie },
    });
    expect(ownerList.json().projects).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: projectId, name: "协作项目已重命名" })]),
    );
  });

  it("keeps personal workspaces private between demo actors", async () => {
    const ownerCookie = await login(app, "tianmaochao@reelay.test");
    const editorCookie = await login(app, "linjing@reelay.test");
    const ownerWorkspaces = await app.inject({ method: "GET", url: "/api/workspaces", headers: { cookie: ownerCookie } });
    const personalWorkspace = ownerWorkspaces.json().workspaces.find((workspace: { kind: string }) => workspace.kind === "personal");

    const forbidden = await app.inject({
      method: "GET",
      url: `/api/workspaces/${personalWorkspace.id}/projects`,
      headers: { cookie: editorCookie },
    });

    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json().error.code).toBe("workspace_forbidden");
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
      url: "/api/workspaces/workspace-personal-tianmaochao/projects/project-brand-story",
      headers: { cookie: ownerCookie },
    });
    expect(wrongWorkspace.statusCode).toBe(404);
  });
});
