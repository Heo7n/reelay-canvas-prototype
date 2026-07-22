import {
  redirect,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router-dom";

import type { SessionActor } from "../domain/identity/session";
import type { ProjectSummary } from "../domain/project/project";
import type { Workspace } from "../domain/workspace/workspace";
import { HttpRequestError } from "../infrastructure/http/HttpApiClient";
import { routePaths } from "./routes";
import type { ApplicationServices } from "./services";

export interface WorkspaceProjects {
  projects: ProjectSummary[];
  workspace: Workspace;
}

export interface WorkspaceRouteData {
  actor: SessionActor;
  currentWorkspace: Workspace;
  workspaceProjects: WorkspaceProjects[];
  workspaces: Workspace[];
}

export interface LoginActionData {
  error: string;
}

export interface WorkspaceActionData {
  error?: string;
  ok?: boolean;
}

function selectDefaultWorkspace(workspaces: Workspace[]): Workspace | null {
  return workspaces.find((workspace) => workspace.kind === "personal") ?? workspaces[0] ?? null;
}

function internalReturnTo(request: Request): string {
  const url = new URL(request.url);
  const routePath = url.pathname === "/app" ? "/" : url.pathname.replace(/^\/app(?=\/)/, "");
  return `${routePath}${url.search}${url.hash}`;
}

function loginRedirect(request: Request): Response {
  const params = new URLSearchParams({ returnTo: internalReturnTo(request) });
  return redirect(`${routePaths.login()}?${params.toString()}`);
}

function safeReturnTo(rawValue: string | null, workspaces: Workspace[], fallback: string): string {
  if (!rawValue?.startsWith("/w/")) return fallback;

  let parsed: URL;
  try {
    parsed = new URL(rawValue, "http://reelay.local");
  } catch {
    return fallback;
  }
  if (parsed.origin !== "http://reelay.local" || !parsed.pathname.startsWith("/w/")) return fallback;

  const workspaceSegment = parsed.pathname.match(/^\/w\/([^/]+)/)?.[1];
  if (!workspaceSegment) return fallback;

  let workspaceId: string;
  try {
    workspaceId = decodeURIComponent(workspaceSegment);
  } catch {
    return fallback;
  }
  if (!workspaces.some((workspace) => workspace.id === workspaceId)) return fallback;
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

async function getSessionContext(services: ApplicationServices): Promise<{
  actor: SessionActor | null;
  workspaces: Workspace[];
}> {
  const session = await services.sessionGateway.getCurrent();
  if (!session.actor) return { actor: null, workspaces: [] };
  const workspaces = await services.workspaceRepository.listForActor(session.actor.id);
  return { actor: session.actor, workspaces };
}

async function loadWorkspaceData(
  services: ApplicationServices,
  args: LoaderFunctionArgs,
): Promise<WorkspaceRouteData> {
  const context = await getSessionContext(services);
  if (!context.actor) throw loginRedirect(args.request);

  const defaultWorkspace = selectDefaultWorkspace(context.workspaces);
  if (!defaultWorkspace) throw redirect(routePaths.noWorkspace());

  const currentWorkspace = context.workspaces.find((workspace) => workspace.id === args.params.workspaceId);
  if (!currentWorkspace) throw redirect(routePaths.workspaceHome(defaultWorkspace.id));

  const workspaceProjects = await Promise.all(
    context.workspaces.map(async (workspace) => ({
      workspace,
      projects: await services.projectRepository.listByWorkspace(workspace.id),
    })),
  );

  return {
    actor: context.actor,
    currentWorkspace,
    workspaceProjects,
    workspaces: context.workspaces,
  };
}

export function createRouteHandlers(services: ApplicationServices) {
  return {
    rootLoader: async () => {
      const context = await getSessionContext(services);
      if (!context.actor) throw redirect(routePaths.login());
      const workspace = selectDefaultWorkspace(context.workspaces);
      throw redirect(workspace ? routePaths.workspaceHome(workspace.id) : routePaths.noWorkspace());
    },

    loginLoader: async () => {
      const context = await getSessionContext(services);
      if (!context.actor) return null;
      const workspace = selectDefaultWorkspace(context.workspaces);
      throw redirect(workspace ? routePaths.workspaceHome(workspace.id) : routePaths.noWorkspace());
    },

    loginAction: async ({ request }: ActionFunctionArgs): Promise<LoginActionData | Response> => {
      const formData = await request.formData();
      const account = String(formData.get("account") ?? "").trim();
      const password = String(formData.get("password") ?? "");
      if (!account || !password) return { error: "请输入演示账号和密码。" };

      try {
        const session = await services.sessionGateway.signInWithPassword({ account, password });
        if (!session.actor) return { error: "登录响应缺少账号信息，请重试。" };
        const workspaces = await services.workspaceRepository.listForActor(session.actor.id);
        const fallbackWorkspace = selectDefaultWorkspace(workspaces);
        if (!fallbackWorkspace) return { error: "此演示账号尚未加入工作空间。" };
        const returnTo = new URL(request.url).searchParams.get("returnTo");
        return redirect(safeReturnTo(returnTo, workspaces, routePaths.workspaceHome(fallbackWorkspace.id)));
      } catch (error) {
        if (error instanceof HttpRequestError && error.status === 401) {
          return { error: error.message };
        }
        return { error: "暂时无法连接 Reelay 服务，请稍后重试。" };
      }
    },

    logoutAction: async () => {
      await services.sessionGateway.signOut();
      return redirect(routePaths.login());
    },

    noWorkspaceLoader: async ({ request }: LoaderFunctionArgs) => {
      const context = await getSessionContext(services);
      if (!context.actor) throw loginRedirect(request);
      const workspace = selectDefaultWorkspace(context.workspaces);
      if (workspace) throw redirect(routePaths.workspaceHome(workspace.id));
      return { actor: context.actor };
    },

    workspaceLoader: (args: LoaderFunctionArgs) => loadWorkspaceData(services, args),

    workspaceAction: async ({ request }: ActionFunctionArgs): Promise<WorkspaceActionData | Response> => {
      const session = await services.sessionGateway.getCurrent();
      if (!session.actor) throw loginRedirect(request);
      const formData = await request.formData();
      const intent = String(formData.get("intent") ?? "");
      const workspaceId = String(formData.get("workspaceId") ?? "");
      if (!workspaceId || !session.actor.workspaceIds.includes(workspaceId)) {
        return { error: "当前账号无权修改此工作空间。" };
      }

      try {
        if (intent === "create") {
          const prompt = String(formData.get("prompt") ?? "").trim();
          const name = prompt ? prompt.slice(0, 32) : "未命名项目";
          const project = await services.projectRepository.create(workspaceId, { name });
          return redirect(routePaths.canvas(workspaceId, project.id, "main"));
        }

        if (intent === "rename") {
          const projectId = String(formData.get("projectId") ?? "");
          const name = String(formData.get("name") ?? "").trim();
          if (!projectId || !name) return { error: "项目名称不能为空。" };
          await services.projectRepository.update(workspaceId, projectId, { name });
          return { ok: true };
        }

        return { error: "无法识别此项目操作。" };
      } catch (error) {
        if (error instanceof HttpRequestError && error.status === 401) throw loginRedirect(request);
        if (error instanceof HttpRequestError) return { error: error.message };
        return { error: "项目操作失败，请稍后重试。" };
      }
    },

    canvasLoader: async (args: LoaderFunctionArgs) => {
      const data = await loadWorkspaceData(services, args);
      const projectId = args.params.projectId;
      if (!projectId) throw new Response("Project not found", { status: 404 });
      const project = await services.projectRepository.getById(data.currentWorkspace.id, projectId);
      if (!project) throw new Response("Project not found", { status: 404 });
      return { ...data, project };
    },
  };
}
