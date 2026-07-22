import { describe, expect, it, vi } from "vitest";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router-dom";

import type { ProjectSummary } from "../domain/project/project";
import type { Workspace } from "../domain/workspace/workspace";
import { createRouteHandlers } from "./route-data";
import type { ApplicationServices } from "./services";

const actor = {
  id: "actor-one",
  displayName: "Demo One",
  workspaceIds: ["workspace-personal", "workspace-organization"],
};

const workspaces: Workspace[] = [
  { id: "workspace-organization", kind: "organization", name: "Organization" },
  { id: "workspace-personal", kind: "personal", name: "Personal" },
];

const projects: ProjectSummary[] = [
  {
    id: "project-one",
    workspaceId: "workspace-personal",
    name: "Personal film",
    updatedAt: "2026-07-22T08:00:00.000Z",
    coverAssetId: null,
  },
];

function createServices(signedIn = true): ApplicationServices {
  return {
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

function actionArgs(url: string, form: Record<string, string>): ActionFunctionArgs {
  return {
    request: new Request(url, { method: "POST", body: new URLSearchParams(form) }),
    params: {},
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

  it("chooses the personal workspace after login and rejects external return targets", async () => {
    const handlers = createRouteHandlers(createServices());
    const response = await handlers.loginAction(
      actionArgs("http://reelay.local/app/login?returnTo=https%3A%2F%2Fevil.example", {
        account: "demo@reelay.test",
        password: "reelay-demo",
      }),
    );

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).headers.get("Location")).toBe("/w/workspace-personal");
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

  it("loads projects for every accessible workspace while keeping the route workspace explicit", async () => {
    const services = createServices();
    const handlers = createRouteHandlers(services);
    const data = await handlers.workspaceLoader(
      loaderArgs("http://reelay.local/app/w/workspace-organization", { workspaceId: "workspace-organization" }),
    );

    expect(data.currentWorkspace.id).toBe("workspace-organization");
    expect(data.workspaceProjects).toHaveLength(2);
    expect(services.projectRepository.listByWorkspace).toHaveBeenCalledTimes(2);
  });
});
