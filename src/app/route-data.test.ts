import { describe, expect, it, vi } from "vitest";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router-dom";

import type { ProjectSummary } from "../domain/project/project";
import type { Workspace } from "../domain/workspace/workspace";
import { HttpRequestError } from "../infrastructure/http/HttpApiClient";
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

const members = [
  {
    userId: "actor-one",
    displayName: "Demo One",
    loginIdentifier: "creator@reelay.test",
    role: "owner" as const,
  },
];

function createServices(signedIn = true): ApplicationServices {
  return {
    accountRepository: {
      updateContacts: vi.fn(async (input) => ({ ...actor, ...input })),
    },
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
    organizationRepository: {
      listMembers: vi.fn(async () => members),
    },
    sessionGateway: {
      getCurrent: vi.fn(async () => ({ actor: signedIn ? actor : null })),
      signInWithPassword: vi.fn(async () => ({ actor })),
      signOut: vi.fn(async () => undefined),
    },
    workspaceContextGateway: {
      load: vi.fn(async (workspaceId) => {
        if (!signedIn) throw new HttpRequestError(401, "session_required", "Sign in required.");
        return {
          actor,
          projects: projects.filter((project) => project.workspaceId === workspaceId),
          workspaces,
        };
      }),
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
      moveToTrash: vi.fn(async () => undefined),
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

  it("loads the workspace route through one aggregated request", async () => {
    const services = createServices();
    const handlers = createRouteHandlers(services);
    const data = await handlers.workspaceLoader(
      loaderArgs("http://reelay.local/app/w/workspace-organization", { workspaceId: "workspace-organization" }),
    );

    expect(data.currentWorkspace.id).toBe("workspace-organization");
    expect(data.projects).toEqual(projects);
    expect(services.workspaceContextGateway.load).toHaveBeenCalledOnce();
    expect(services.workspaceContextGateway.load).toHaveBeenCalledWith("workspace-organization");
    expect(services.sessionGateway.getCurrent).not.toHaveBeenCalled();
    expect(services.workspaceRepository.listForActor).not.toHaveBeenCalled();
    expect(services.projectRepository.listByWorkspace).not.toHaveBeenCalled();
  });

  it("loads organization members without coupling the organization route to projects", async () => {
    const services = createServices();
    const handlers = createRouteHandlers(services);
    const data = await handlers.organizationLoader(
      loaderArgs(
        "http://reelay.local/app/w/workspace-organization/organization",
        { workspaceId: "workspace-organization" },
      ),
    );

    expect(data.members).toEqual(members);
    expect(services.organizationRepository.listMembers).toHaveBeenCalledWith("workspace-organization");
    expect(services.workspaceContextGateway.load).not.toHaveBeenCalled();
    expect(services.projectRepository.listByWorkspace).not.toHaveBeenCalled();
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

  it("moves an admin project to trash through the current workspace route", async () => {
    const services = createServices();
    const handlers = createRouteHandlers(services);
    const response = await handlers.workspaceAction(
      actionArgs(
        "http://reelay.local/app/w/workspace-organization/projects",
        { intent: "delete", projectId: "project-one" },
        { workspaceId: "workspace-organization" },
      ),
    );

    expect(services.projectRepository.moveToTrash).toHaveBeenCalledWith(
      "workspace-organization",
      "project-one",
    );
    expect(response).toEqual(expect.objectContaining({
      ok: true,
      notice: expect.stringContaining("数据已保留"),
    }));
  });

  it("persists optional contact channels through the dedicated account action", async () => {
    const services = createServices();
    const handlers = createRouteHandlers(services);
    const response = await handlers.accountAction(
      actionArgs("http://reelay.local/app/account", {
        contactEmail: "reports@example.com",
        contactPhone: "+86 138 0000 0000",
      }),
    );

    expect(services.accountRepository.updateContacts).toHaveBeenCalledWith({
      contactEmail: "reports@example.com",
      contactPhone: "+86 138 0000 0000",
    });
    expect(services.sessionGateway.getCurrent).not.toHaveBeenCalled();
    expect(response).toEqual({ ok: true, notice: "联系资料已保存。" });
  });

  it("lets the project endpoint perform the authoritative session check", async () => {
    const services = createServices();
    const handlers = createRouteHandlers(services);
    await handlers.workspaceAction(
      actionArgs(
        "http://reelay.local/app/w/workspace-organization/projects",
        { intent: "rename", projectId: "project-one", name: "Renamed film" },
        { workspaceId: "workspace-organization" },
      ),
    );

    expect(services.sessionGateway.getCurrent).not.toHaveBeenCalled();
    expect(services.projectRepository.update).toHaveBeenCalledWith(
      "workspace-organization",
      "project-one",
      { name: "Renamed film" },
    );
  });
});
