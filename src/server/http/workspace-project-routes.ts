import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { SessionActor } from "../../domain/identity/session";
import type { InMemoryCollaborationStore } from "../infrastructure/InMemoryCollaborationStore";
import {
  CreateProjectBodySchema,
  ProjectParamsSchema,
  UpdateProjectBodySchema,
  WorkspaceParamsSchema,
} from "./contracts";
import { getRequestActor } from "./session-context";

function requireActor(
  request: FastifyRequest,
  reply: FastifyReply,
  store: InMemoryCollaborationStore,
): SessionActor | null {
  const actor = getRequestActor(request, store);
  if (!actor) {
    reply.code(401).send({ error: { code: "session_required", message: "请先登录演示账号。" } });
    return null;
  }
  return actor;
}

function requireWorkspaceAccess(
  actor: SessionActor,
  workspaceId: string,
  reply: FastifyReply,
  store: InMemoryCollaborationStore,
): boolean {
  if (!store.getWorkspace(workspaceId)) {
    reply.code(404).send({ error: { code: "workspace_not_found", message: "工作空间不存在。" } });
    return false;
  }
  if (!store.hasWorkspaceAccess(actor.id, workspaceId)) {
    reply.code(403).send({ error: { code: "workspace_forbidden", message: "无权访问此工作空间。" } });
    return false;
  }
  return true;
}

export async function registerWorkspaceProjectRoutes(
  app: FastifyInstance,
  store: InMemoryCollaborationStore,
): Promise<void> {
  app.get("/api/workspaces", async (request, reply) => {
    const actor = requireActor(request, reply, store);
    if (!actor) return reply;
    return { workspaces: store.listWorkspacesForActor(actor.id) };
  });

  app.get("/api/workspaces/:workspaceId/projects", async (request, reply) => {
    const actor = requireActor(request, reply, store);
    if (!actor) return reply;
    const parsed = WorkspaceParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: "invalid_request", message: "工作空间标识无效。" } });
    }
    if (!requireWorkspaceAccess(actor, parsed.data.workspaceId, reply, store)) return reply;
    return { projects: store.listProjects(parsed.data.workspaceId) };
  });

  app.post("/api/workspaces/:workspaceId/projects", async (request, reply) => {
    const actor = requireActor(request, reply, store);
    if (!actor) return reply;
    const params = WorkspaceParamsSchema.safeParse(request.params);
    const body = CreateProjectBodySchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: { code: "invalid_request", message: "项目数据无效。" } });
    }
    if (!requireWorkspaceAccess(actor, params.data.workspaceId, reply, store)) return reply;
    const project = store.createProject({ workspaceId: params.data.workspaceId, ...body.data });
    return reply.code(201).send({ project });
  });

  app.patch("/api/workspaces/:workspaceId/projects/:projectId", async (request, reply) => {
    const actor = requireActor(request, reply, store);
    if (!actor) return reply;
    const params = ProjectParamsSchema.safeParse(request.params);
    const body = UpdateProjectBodySchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: { code: "invalid_request", message: "项目数据无效。" } });
    }
    if (!requireWorkspaceAccess(actor, params.data.workspaceId, reply, store)) return reply;
    const project = store.updateProject(params.data.workspaceId, params.data.projectId, body.data);
    if (!project) {
      return reply.code(404).send({ error: { code: "project_not_found", message: "项目不存在。" } });
    }
    return { project };
  });
}
