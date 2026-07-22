import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { SessionActor } from "../../domain/identity/session";
import type { CollaborationStore } from "../application/CollaborationStore";
import {
  CreateProjectBodySchema,
  ProjectParamsSchema,
  UpdateProjectBodySchema,
  WorkspaceParamsSchema,
} from "./contracts";
import { getRequestActor } from "./session-context";

async function requireActor(
  request: FastifyRequest,
  reply: FastifyReply,
  store: CollaborationStore,
): Promise<SessionActor | null> {
  const actor = await getRequestActor(request, store);
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
  store: CollaborationStore,
  permission: "read" | "write",
): Promise<boolean> {
  if (!(await store.getWorkspace(workspaceId))) {
    reply.code(404).send({ error: { code: "workspace_not_found", message: "工作空间不存在。" } });
    return false;
  }
  const allowed =
    permission === "write"
      ? await store.canWriteWorkspaceProjects(actor.id, workspaceId)
      : await store.canReadWorkspace(actor.id, workspaceId);
  if (!allowed) {
    reply.code(403).send({ error: { code: "workspace_forbidden", message: "无权访问此工作空间。" } });
    return false;
  }
  return true;
}

export async function registerWorkspaceProjectRoutes(
  app: FastifyInstance,
  store: CollaborationStore,
): Promise<void> {
  app.get("/api/workspaces", async (request, reply) => {
    const actor = await requireActor(request, reply, store);
    if (!actor) return reply;
    return { workspaces: await store.listWorkspacesForActor(actor.id) };
  });

  app.get("/api/workspaces/:workspaceId/projects", async (request, reply) => {
    const actor = await requireActor(request, reply, store);
    if (!actor) return reply;
    const parsed = WorkspaceParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: "invalid_request", message: "工作空间标识无效。" } });
    }
    if (!(await requireWorkspaceAccess(actor, parsed.data.workspaceId, reply, store, "read"))) return reply;
    return { projects: await store.listProjects(parsed.data.workspaceId) };
  });

  app.get("/api/workspaces/:workspaceId/projects/:projectId", async (request, reply) => {
    const actor = await requireActor(request, reply, store);
    if (!actor) return reply;
    const parsed = ProjectParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: "invalid_request", message: "项目标识无效。" } });
    }
    if (!(await requireWorkspaceAccess(actor, parsed.data.workspaceId, reply, store, "read"))) return reply;
    const project = await store.getProject(parsed.data.workspaceId, parsed.data.projectId);
    if (!project) {
      return reply.code(404).send({ error: { code: "project_not_found", message: "项目不存在。" } });
    }
    return { project };
  });

  app.post("/api/workspaces/:workspaceId/projects", async (request, reply) => {
    const actor = await requireActor(request, reply, store);
    if (!actor) return reply;
    const params = WorkspaceParamsSchema.safeParse(request.params);
    const body = CreateProjectBodySchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: { code: "invalid_request", message: "项目数据无效。" } });
    }
    if (!(await requireWorkspaceAccess(actor, params.data.workspaceId, reply, store, "write"))) return reply;
    const project = await store.createProject({
      workspaceId: params.data.workspaceId,
      createdByActorId: actor.id,
      ...body.data,
    });
    return reply.code(201).send({ project });
  });

  app.patch("/api/workspaces/:workspaceId/projects/:projectId", async (request, reply) => {
    const actor = await requireActor(request, reply, store);
    if (!actor) return reply;
    const params = ProjectParamsSchema.safeParse(request.params);
    const body = UpdateProjectBodySchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: { code: "invalid_request", message: "项目数据无效。" } });
    }
    if (!(await requireWorkspaceAccess(actor, params.data.workspaceId, reply, store, "write"))) return reply;
    const project = await store.updateProject(params.data.workspaceId, params.data.projectId, {
      updatedByActorId: actor.id,
      ...body.data,
    });
    if (!project) {
      return reply.code(404).send({ error: { code: "project_not_found", message: "项目不存在。" } });
    }
    return { project };
  });
}
