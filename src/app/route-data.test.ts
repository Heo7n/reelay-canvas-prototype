import { describe, expect, it, vi } from "vitest";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router-dom";

import type { ProjectSummary } from "../domain/project/project";
import type { Workspace } from "../domain/workspace/workspace";
import { createRouteHandlers } from "./route-data";
import type { ApplicationServices } from "./services";

const actor = {
  account: "creator@reelay.test",
  id: "actor-one",
  displayName: "Demo One",
  workspaceIds: ["workspace-organization"],
};

const workspaces: Workspace[] = [
  { id: "workspace-organization", kind: "organization", name: "Organization", currentUserRole: "owner" },
];

const projects: ProjectSummary[] = [
  {
    id: "project-one",
    workspaceId: "workspace-organization",
    accessKind: "private",
    currentUserRole: "admin",
    name: "Personal film",
    updatedAt: "2026-07-22T08:00:00.000Z",
    coverAssetId: null,
  },
];

function createServices(signedIn = true): ApplicationServices {
  return {
    canvasDocumentRepository: {
      getCanvasDocument: vi.fn(async () => null),
      save: vi.fn(async (input) => ({
        id: input.canvasId,
        projectId: input.projectId,
        schemaVersion: input.schemaVersion,
        revision: input.expectedRevision + 1,
        content: input.content,
      })),
    },
    sessionGateway: {
      getCurrent: vi.fn(async () => ({ actor: signedIn ? actor : null })),
      signInWithPassword: vi.fn(async () => ({ actor })),
      signOut: vi.fn(async () => undefined),
    },
    workspaceRepository: {
      listForActor: vi.fn(async () => workspaces),
      getById: vi.fn(async (workspaceId) => workspaces.find((workspace) => workspace.id === workspaceId) ?? null),
    },
    projectRepository: {
      listByWorkspace: vi.fn(async (workspaceId) => projects.filter((project) => project.workspaceId === workspaceId)),
      getById: vi.fn(async (workspaceId, projectId) => projects.find((project) => project.workspaceId === workspaceId && project.id === projectId) ?? null),
      create: vi.fn(async (workspaceId, input) => ({ ...projects[0], id: "project-created", workspaceId, name: input.name })),
      update: vi.fn(async (_workspaceId, _projectId, input) => ({ ...projects[0], name: input.name ?? projects[0].name })),
    },
  };
}

function loaderArgs(url: string, params: Record<string, string> = {}): LoaderFunctionArgs {
  return { request: new Request(url), params, context: undefined } as unknown as LoaderFunctionArgs;
}

function actionArgs(url: string, form: Record<string, string>, params: Record<string, string> = {}): ActionFunctionArgs {
  return {
    request: new Request(url, { method: "POST", body: new URLSearchParams(form) }),
    params,
    context: undefined,
  } as unknown as ActionFunctionArgs;
}

async function expectRedirect(promise: Promise<unknown>, location: string): Promise<void> {
  try {
    await promise;
    throw new Error("Expected a redirect response.");
  } catch (error) {
    expect(error).toBeInstanceOf(Response);
    const response = error as Response;
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(location);
  }
}

describe("application route data", () => {
  it("sends anonymous workspace deep links to login with an internal return target", async () => {
    const handlers = createRouteHandlers(createServices(false));
    await expectRedirect(
      handlers.workspaceLoader(loaderArgs("http://reelay.local/app/w/workspace-organization/projects", { workspaceId: "workspace-organization" })),
      "/login?returnTo=%2Fw%2Fworkspace-organization%2Fprojects",
    );
  });

  it("chooses the organization workspace after login and rejects external return targets", async () => {
    const handlers = createRouteHandlers(createServices());
    const response = await handlers.loginAction(
      actionArgs("http://reelay.local/app/login?returnTo=https%3A%2F%2Fevil.example", {
        account: "demo@reelay.test",
        password: "reelay-demo",
      }),
    );

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).headers.get("Location")).toBe("/w/workspace-organization");
  });

  it("restores an authorized workspace deep link after login", async () => {
    const handlers = createRouteHandlers(createServices());
    const returnTo = "/w/workspace-organization/projects?sort=recent#grid";
    const response = await handlers.loginAction(
      actionArgs(`http://reelay.local/app/login?returnTo=${encodeURIComponent(returnTo)}`, {
        account: "demo@reelay.test",
        password: "reelay-demo",
      }),
    );

    expect((response as Response).headers.get("Location")).toBe(returnTo);
  });

  it("loads projects once for the organization workspace in the route", async () => {
    const services = createServices();
    const handlers = createRouteHandlers(services);
    const data = await handlers.workspaceLoader(
      loaderArgs("http://reelay.local/app/w/workspace-organization", { workspaceId: "workspace-organization" }),
    );

    expect(data.currentWorkspace.id).toBe("workspace-organization");
    expect(data.projects).toEqual(projects);
    expect(services.projectRepository.listByWorkspace).toHaveBeenCalledOnce();
    expect(services.projectRepository.listByWorkspace).toHaveBeenCalledWith("workspace-organization");
  });

  it("uses the route workspace as the authority for project mutations", async () => {
    const services = createServices();
    const handlers = createRouteHandlers(services);
    const response = await handlers.workspaceAction(
      actionArgs(
        "http://reelay.local/app/w/workspace-organization",
        { intent: "create", workspaceId: "workspace-personal" },
        { workspaceId: "workspace-organization" },
      ),
    );

    expect(services.projectRepository.create).toHaveBeenCalledWith("workspace-organization", { name: "未命名项目" });
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).headers.get("Location")).toBe("/w/workspace-organization/projects/project-created/canvases/main");
  });
});
