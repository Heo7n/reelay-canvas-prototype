import {
  redirect,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router-dom";

import type { SessionActor } from "../domain/identity/session";
import type { ProjectSummary } from "../domain/project/project";
import type { OrganizationMember, Workspace } from "../domain/workspace/workspace";
import type { WorkspaceContext } from "../application/workspaces/WorkspaceContextGateway";
import { isApplicationError } from "../application/shared/ApplicationError";
import { routePaths } from "./routes";
import type { ApplicationServices } from "./services";

export interface WorkspaceRouteData {
  actor: SessionActor;
  currentWorkspace: Workspace;
  projects: ProjectSummary[];
  workspaces: Workspace[];
}

export interface OrganizationRouteData {
  actor: SessionActor;
  currentWorkspace: Workspace;
  members: OrganizationMember[];
  workspaces: Workspace[];
}

export interface OrganizationMembersRouteData {
  members: OrganizationMember[];
}

export interface LoginActionData {
  error: string;
}

export interface WorkspaceActionData {
  error?: string;
  notice?: string;
  ok?: boolean;
}

function selectDefaultWorkspace(workspaces: Workspace[]): Workspace | null {
  return workspaces.find((workspace) => workspace.kind === "organization") ?? workspaces[0] ?? null;
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
  const workspaceId = args.params.workspaceId;
  if (!workspaceId) throw new Response("Workspace not found", { status: 404 });

  let context: WorkspaceContext;
  try {
    context = await services.workspaceContextGateway.load(workspaceId);
  } catch (error) {
    if (isApplicationError(error, "authentication_required")) {
      throw loginRedirect(args.request);
    }
    if (isApplicationError(error) && (error.code === "forbidden" || error.code === "not_found")) {
      const sessionContext = await getSessionContext(services);
      if (!sessionContext.actor) throw loginRedirect(args.request);
      const defaultWorkspace = selectDefaultWorkspace(sessionContext.workspaces);
      throw redirect(defaultWorkspace
        ? routePaths.workspaceHome(defaultWorkspace.id)
        : routePaths.noWorkspace());
    }
    throw error;
  }

  const defaultWorkspace = selectDefaultWorkspace(context.workspaces);
  if (!defaultWorkspace) throw redirect(routePaths.noWorkspace());

  const currentWorkspace = context.workspaces.find((workspace) => workspace.id === workspaceId);
  if (!currentWorkspace) throw redirect(routePaths.workspaceHome(defaultWorkspace.id));

  return {
    actor: context.actor,
    currentWorkspace,
    projects: context.projects,
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
        if (isApplicationError(error, "authentication_required")) {
          return { error: error.message };
        }
        return { error: "暂时无法连接 Reelay 服务，请稍后重试。" };
      }
    },

    logoutAction: async () => {
      await services.sessionGateway.signOut();
      return redirect(routePaths.login());
    },

    accountAction: async ({ request }: ActionFunctionArgs): Promise<WorkspaceActionData | Response> => {
      const formData = await request.formData();
      const contactEmail = String(formData.get("contactEmail") ?? "").trim() || null;
      const contactPhone = String(formData.get("contactPhone") ?? "").trim() || null;
      try {
        await services.accountRepository.updateContacts({ contactEmail, contactPhone });
        return { ok: true, notice: "联系资料已保存。" };
      } catch (error) {
        if (isApplicationError(error, "authentication_required")) throw loginRedirect(request);
        if (isApplicationError(error)) return { error: error.message };
        return { error: "联系资料保存失败，请稍后重试。" };
      }
    },

    noWorkspaceLoader: async ({ request }: LoaderFunctionArgs) => {
      const context = await getSessionContext(services);
      if (!context.actor) throw loginRedirect(request);
      const workspace = selectDefaultWorkspace(context.workspaces);
      if (workspace) throw redirect(routePaths.workspaceHome(workspace.id));
      return { actor: context.actor };
    },

    workspaceLoader: (args: LoaderFunctionArgs) => loadWorkspaceData(services, args),

    organizationLoader: async (args: LoaderFunctionArgs): Promise<OrganizationMembersRouteData> => {
      const workspaceId = args.params.workspaceId;
      if (!workspaceId) throw new Response("Workspace not found", { status: 404 });
      try {
        return {
          members: await services.organizationRepository.listMembers(workspaceId),
        };
      } catch (error) {
        if (isApplicationError(error, "authentication_required")) {
          throw loginRedirect(args.request);
        }
        if (isApplicationError(error) && (error.code === "forbidden" || error.code === "not_found")) {
          const sessionContext = await getSessionContext(services);
          if (!sessionContext.actor) throw loginRedirect(args.request);
          const defaultWorkspace = selectDefaultWorkspace(sessionContext.workspaces);
          throw redirect(defaultWorkspace
            ? routePaths.workspaceHome(defaultWorkspace.id)
            : routePaths.noWorkspace());
        }
        throw error;
      }
    },

    workspaceAction: async ({ params, request }: ActionFunctionArgs): Promise<WorkspaceActionData | Response> => {
      const formData = await request.formData();
      const intent = String(formData.get("intent") ?? "");
      const workspaceId = params.workspaceId ?? "";
      if (!workspaceId) {
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

        if (intent === "delete") {
          const projectId = String(formData.get("projectId") ?? "");
          if (!projectId) return { error: "项目标识无效，请刷新后重试。" };
          await services.projectRepository.moveToTrash(workspaceId, projectId);
          return {
            ok: true,
            notice: "项目已从列表移除，项目与画布数据已保留以便后续恢复。",
          };
        }

        return { error: "无法识别此项目操作。" };
      } catch (error) {
        if (isApplicationError(error, "authentication_required")) throw loginRedirect(request);
        if (isApplicationError(error)) return { error: error.message };
        return { error: "项目操作失败，请稍后重试。" };
      }
    },
  };
}
