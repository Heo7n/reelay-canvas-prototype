import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router-dom";

import { ApplicationError } from "../application/shared/ApplicationError";
import type { ProjectSummary } from "../domain/project/project";
import type { Workspace } from "../domain/workspace/workspace";
import { createRouteHandlers } from "./route-data";
import type { ApplicationServices } from "./services";
import { publishProjectLaunchIntent } from "../pages/home/launch-intent";
import { prepareCreationDraftReturn, saveGuestCreationDraft } from "../pages/home/guest-creation-draft";

vi.mock("../pages/home/launch-intent", () => ({ publishProjectLaunchIntent: vi.fn() }));
vi.mock("../pages/home/guest-creation-draft", () => ({ prepareCreationDraftReturn: vi.fn(), saveGuestCreationDraft: vi.fn() }));
afterEach(() => {
  vi.mocked(publishProjectLaunchIntent).mockClear();
  vi.mocked(prepareCreationDraftReturn).mockClear();
  vi.mocked(saveGuestCreationDraft).mockClear();
});

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
    entityRepository: {
      create: vi.fn(),
      get: vi.fn(),
      listPersonal: vi.fn(async () => []),
      update: vi.fn(),
    },
    mediaAssetRepository: {
      createUploadIntent: vi.fn(),
      finalizeUpload: vi.fn(),
      renamePersonalAsset: vi.fn(),
      attachToProject: vi.fn(),
      listPersonalAssets: vi.fn(async () => []),
      listProjectAssets: vi.fn(async () => []),
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
        if (!signedIn) {
          throw new ApplicationError("authentication_required", "Sign in required.", {
            serviceCode: "session_required",
          });
        }
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
  it("lets guests browse home without requesting any private data", async () => {
    const services = createServices(false);
    expect(await createRouteHandlers(services).rootLoader()).toBeNull();
    expect(services.workspaceRepository.listForActor).not.toHaveBeenCalled();
    expect(services.workspaceContextGateway.load).not.toHaveBeenCalled();
    expect(services.projectRepository.listByWorkspace).not.toHaveBeenCalled();
  });

  it("sends signed-in home visitors to their own workspace", async () => {
    await expectRedirect(createRouteHandlers(createServices()).rootLoader(), "/w/workspace-organization");
  });

  it("preserves an allowed login return target when a session already exists", async () => {
    const target = "/w/workspace-organization/projects";
    await expectRedirect(
      createRouteHandlers(createServices()).loginLoader(loaderArgs(`http://reelay.local/app/login?returnTo=${encodeURIComponent(target)}`)),
      target,
    );
  });

  it("rejects a different workspace return target for an existing session", async () => {
    await expectRedirect(
      createRouteHandlers(createServices()).loginLoader(loaderArgs("http://reelay.local/app/login?returnTo=%2Fw%2Fanother-workspace")),
      "/w/workspace-organization",
    );
  });

  it("returns to the public homepage after signing out", async () => {
    const services = createServices();
    const response = await createRouteHandlers(services).logoutAction();
    expect(services.sessionGateway.signOut).toHaveBeenCalledOnce();
    expect(response.headers.get("Location")).toBe("/");
  });

  it("sends anonymous workspace deep links to login with an internal return target", async () => {
    const handlers = createRouteHandlers(createServices(false));
    await expectRedirect(
      handlers.workspaceLoader(loaderArgs("http://reelay.local/app/w/workspace-organization/projects", { workspaceId: "workspace-organization" })),
      "/login?returnTo=%2Fw%2Fworkspace-organization%2Fprojects",
    );
  });

  it.each(["forbidden", "not_found"] as const)(
    "returns inaccessible workspaces to the actor's default workspace after an application %s error",
    async (code) => {
      const services = createServices();
      vi.mocked(services.workspaceContextGateway.load).mockRejectedValueOnce(
        new ApplicationError(code, "Workspace unavailable."),
      );
      const handlers = createRouteHandlers(services);

      await expectRedirect(
        handlers.workspaceLoader(loaderArgs(
          "http://reelay.local/app/w/workspace-missing/projects",
          { workspaceId: "workspace-missing" },
        )),
        "/w/workspace-organization",
      );

      expect(services.sessionGateway.getCurrent).toHaveBeenCalledOnce();
      expect(services.workspaceRepository.listForActor).toHaveBeenCalledWith(actor.id);
    },
  );

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
    expect(publishProjectLaunchIntent).toHaveBeenCalledWith({
      workspaceId: "workspace-organization", projectId: "project-created", canvasId: "main",
    }, "");
  });

  it("publishes the prompt for the created project only after creation succeeds", async () => {
    const services = createServices();
    let finishCreate!: (project: ProjectSummary) => void;
    vi.mocked(services.projectRepository.create).mockImplementationOnce(() => new Promise((resolve) => {
      finishCreate = resolve;
    }));
    const prompt = "  海边的建筑空间，清晨柔和的光线。  ";
    const result = createRouteHandlers(services).workspaceAction(actionArgs(
      "http://reelay.local/app/w/workspace-organization",
      { intent: "create", prompt, workspaceId: "untrusted-workspace" },
      { workspaceId: "workspace-organization" },
    ));
    await vi.waitFor(() => expect(services.projectRepository.create).toHaveBeenCalledOnce());
    expect(publishProjectLaunchIntent).not.toHaveBeenCalled();
    finishCreate({ ...projects[0]!, id: "new-project" });
    const response = await result;
    expect((response as Response).headers.get("Location")).toBe("/w/workspace-organization/projects/new-project/canvases/main");
    expect(publishProjectLaunchIntent).toHaveBeenCalledExactlyOnceWith({
      workspaceId: "workspace-organization", projectId: "new-project", canvasId: "main",
    }, prompt.trim());
  });

  it("does not publish a prompt when project creation fails", async () => {
    const services = createServices();
    vi.mocked(services.projectRepository.create).mockRejectedValueOnce(new Error("Network unavailable"));
    const response = await createRouteHandlers(services).workspaceAction(actionArgs(
      "http://reelay.local/app/w/workspace-organization", { intent: "create", prompt: "未创建成功的需求" },
      { workspaceId: "workspace-organization" },
    ));
    expect(response).toEqual({ error: "项目操作失败，请稍后重试。" });
    expect(publishProjectLaunchIntent).not.toHaveBeenCalled();
    expect(saveGuestCreationDraft).not.toHaveBeenCalled();
  });

  it("preserves a failed homepage creation draft for its original workspace when authentication expires", async () => {
    const services = createServices();
    vi.mocked(services.projectRepository.create).mockRejectedValueOnce(new ApplicationError("authentication_required", "Session expired"));
    await expectRedirect(createRouteHandlers(services).workspaceAction(actionArgs(
      "http://reelay.local/app/w/workspace-organization?index", { intent: "create", prompt: "  未提交的镜头描述  " },
      { workspaceId: "workspace-organization" },
    )), "/login?returnTo=%2Fw%2Fworkspace-organization");
    expect(saveGuestCreationDraft).toHaveBeenCalledExactlyOnceWith("  未提交的镜头描述  ", "workspace-organization");
    expect(publishProjectLaunchIntent).not.toHaveBeenCalled();
  });

  it("does not treat a project-list action as a homepage input draft on session expiry", async () => {
    const services = createServices();
    vi.mocked(services.projectRepository.create).mockRejectedValueOnce(new ApplicationError("authentication_required", "Session expired"));
    await expectRedirect(createRouteHandlers(services).workspaceAction(actionArgs(
      "http://reelay.local/app/w/workspace-organization/projects", { intent: "create", prompt: "不来自主页" },
      { workspaceId: "workspace-organization" },
    )), "/login?returnTo=%2Fw%2Fworkspace-organization%2Fprojects");
    expect(saveGuestCreationDraft).not.toHaveBeenCalled();
    expect(publishProjectLaunchIntent).not.toHaveBeenCalled();
  });

  it("rejects oversized prompts before creating a project or publishing a handoff", async () => {
    const services = createServices();
    const response = await createRouteHandlers(services).workspaceAction(actionArgs(
      "http://reelay.local/app/w/workspace-organization", { intent: "create", prompt: "图".repeat(601) },
      { workspaceId: "workspace-organization" },
    ));
    expect(response).toEqual({ error: "创作描述最多 600 字。" });
    expect(services.projectRepository.create).not.toHaveBeenCalled();
    expect(publishProjectLaunchIntent).not.toHaveBeenCalled();
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
