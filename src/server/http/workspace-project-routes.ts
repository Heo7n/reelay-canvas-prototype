import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { SessionActor } from "../../domain/identity/session";
import {
  ProjectWorkspaceUnavailableError,
  type ProjectStore,
} from "../application/ProjectStore";
import type { SessionActorReader } from "../application/SessionStore";
import type { WorkspaceStore } from "../application/WorkspaceStore";
import {
  CreateProjectBodySchema,
  ProjectParamsSchema,
  UpdateProjectBodySchema,
  WorkspaceParamsSchema,
} from "./contracts";
import { getRequestActor } from "./session-context";

type WorkspaceProjectRouteCapabilities = ProjectStore & SessionActorReader & WorkspaceStore;

async function requireActor(
  request: FastifyRequest,
  reply: FastifyReply,
  sessions: SessionActorReader,
): Promise<SessionActor | null> {
  const actor = await getRequestActor(request, sessions);
  if (!actor) {
    reply.code(401).send({ error: { code: "session_required", message: "请先登录演示账号。" } });
    return null;
  }
  return actor;
}

async function requireWorkspaceAccess(
  actor: SessionActor,
  workspaceId: string,
  reply: FastifyReply,
  workspaces: WorkspaceStore,
): Promise<boolean> {
  if (!(await workspaces.getWorkspace(workspaceId))) {
    reply.code(404).send({ error: { code: "workspace_not_found", message: "工作空间不存在。" } });
    return false;
  }
  const allowed = await workspaces.canReadWorkspace(actor.id, workspaceId);
  if (!allowed) {
    reply.code(403).send({ error: { code: "workspace_forbidden", message: "无权访问此工作空间。" } });
    return false;
  }
  return true;
}

export async function registerWorkspaceProjectRoutes(
  app: FastifyInstance,
  capabilities: WorkspaceProjectRouteCapabilities,
): Promise<void> {
  app.get("/api/workspaces", async (request, reply) => {
    const actor = await requireActor(request, reply, capabilities);
    if (!actor) return reply;
    return { workspaces: await capabilities.listWorkspacesForActor(actor.id) };
  });

  app.get("/api/workspaces/:workspaceId/context", async (request, reply) => {
    const actor = await requireActor(request, reply, capabilities);
    if (!actor) return reply;
    const parsed = WorkspaceParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: "invalid_request", message: "工作空间标识无效。" } });
    }

    const workspaceId = parsed.data.workspaceId;
    if (!actor.workspaceIds.includes(workspaceId)) {
      const workspace = await capabilities.getWorkspace(workspaceId);
      return reply.code(workspace ? 403 : 404).send({
        error: {
          code: workspace ? "workspace_forbidden" : "workspace_not_found",
          message: workspace ? "无权访问此工作空间。" : "工作空间不存在。",
        },
      });
    }

    const [workspaces, projects] = await Promise.all([
      capabilities.listWorkspacesForActor(actor.id),
      capabilities.listProjects(actor.id, workspaceId),
    ]);
    return { actor, projects, workspaces };
  });

  app.get("/api/workspaces/:workspaceId/members", async (request, reply) => {
    const actor = await requireActor(request, reply, capabilities);
    if (!actor) return reply;
    const parsed = WorkspaceParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: "invalid_request", message: "工作空间标识无效。" } });
    }
    if (!(await requireWorkspaceAccess(actor, parsed.data.workspaceId, reply, capabilities))) return reply;
    return { members: await capabilities.listOrganizationMembers(parsed.data.workspaceId) };
  });

  app.get("/api/workspaces/:workspaceId/projects", async (request, reply) => {
    const actor = await requireActor(request, reply, capabilities);
    if (!actor) return reply;
    const parsed = WorkspaceParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: "invalid_request", message: "工作空间标识无效。" } });
    }
    if (!(await requireWorkspaceAccess(actor, parsed.data.workspaceId, reply, capabilities))) return reply;
    return { projects: await capabilities.listProjects(actor.id, parsed.data.workspaceId) };
  });

  app.get("/api/workspaces/:workspaceId/projects/:projectId", async (request, reply) => {
    const actor = await requireActor(request, reply, capabilities);
    if (!actor) return reply;
    const parsed = ProjectParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: "invalid_request", message: "项目标识无效。" } });
    }
    if (!(await requireWorkspaceAccess(actor, parsed.data.workspaceId, reply, capabilities))) return reply;
    const project = await capabilities.getProject(actor.id, parsed.data.workspaceId, parsed.data.projectId);
    if (!project) {
      return reply.code(404).send({ error: { code: "project_not_found", message: "项目不存在。" } });
    }
    return { project };
  });

  app.post("/api/workspaces/:workspaceId/projects", async (request, reply) => {
    const actor = await requireActor(request, reply, capabilities);
    if (!actor) return reply;
    const params = WorkspaceParamsSchema.safeParse(request.params);
    const body = CreateProjectBodySchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: { code: "invalid_request", message: "项目数据无效。" } });
    }
    if (!(await requireWorkspaceAccess(actor, params.data.workspaceId, reply, capabilities))) return reply;
    try {
      const project = await capabilities.createProject({
        workspaceId: params.data.workspaceId,
        createdByActorId: actor.id,
        name: body.data.name,
        coverAssetId: body.data.coverAssetId,
      });
      return reply.code(201).send({ project });
    } catch (error) {
      if (error instanceof ProjectWorkspaceUnavailableError) {
        const workspaceMissing = error.reason === "not_found";
        return reply.code(workspaceMissing ? 404 : 403).send({
          error: {
            code: workspaceMissing ? "workspace_not_found" : "workspace_forbidden",
            message: workspaceMissing ? "工作空间不存在。" : "无权访问此工作空间。",
          },
        });
      }
      throw error;
    }
  });

  app.patch("/api/workspaces/:workspaceId/projects/:projectId", async (request, reply) => {
    const actor = await requireActor(request, reply, capabilities);
    if (!actor) return reply;
    const params = ProjectParamsSchema.safeParse(request.params);
    const body = UpdateProjectBodySchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: { code: "invalid_request", message: "项目数据无效。" } });
    }
    if (!(await requireWorkspaceAccess(actor, params.data.workspaceId, reply, capabilities))) return reply;
    const existing = await capabilities.getProject(actor.id, params.data.workspaceId, params.data.projectId);
    if (!existing) {
      return reply.code(404).send({ error: { code: "project_not_found", message: "项目不存在。" } });
    }
    if (existing.currentUserRole === "view") {
      return reply.code(403).send({ error: { code: "project_forbidden", message: "当前项目权限为只读。" } });
    }
    const project = await capabilities.updateProject(params.data.workspaceId, params.data.projectId, {
      updatedByActorId: actor.id,
      ...body.data,
    });
    if (!project) {
      return reply.code(404).send({ error: { code: "project_not_found", message: "项目不存在。" } });
    }
    return { project };
  });

  app.delete("/api/workspaces/:workspaceId/projects/:projectId", async (request, reply) => {
    const actor = await requireActor(request, reply, capabilities);
    if (!actor) return reply;
    const params = ProjectParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: { code: "invalid_request", message: "项目标识无效。" } });
    }
    if (!(await requireWorkspaceAccess(actor, params.data.workspaceId, reply, capabilities))) return reply;
    const existing = await capabilities.getProject(actor.id, params.data.workspaceId, params.data.projectId);
    if (!existing) {
      return reply.code(404).send({ error: { code: "project_not_found", message: "项目不存在或已删除。" } });
    }
    const canDelete = existing.accessKind === "private" || existing.currentUserRole === "admin";
    if (!canDelete) {
      return reply.code(403).send({
        error: {
          code: "project_forbidden",
          message: "个人项目仅创建者可删除；协作项目仅项目管理员可删除。",
        },
      });
    }
    const deleted = await capabilities.moveProjectToTrash(
      params.data.workspaceId,
      params.data.projectId,
      actor.id,
    );
    if (!deleted) {
      return reply.code(404).send({ error: { code: "project_not_found", message: "项目不存在或已删除。" } });
    }
    return reply.code(204).send();
  });
}
