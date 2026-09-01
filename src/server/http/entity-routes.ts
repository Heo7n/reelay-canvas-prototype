import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { EntityValidationError, type WorkspaceEntity } from "../../domain/asset/entity";
import type { SessionActor } from "../../domain/identity/session";
import {
  EntityCreateConflictError,
  EntityCoverMediaInvalidError,
  EntityMediaUnavailableError,
  EntityUnavailableError,
  EntityVersionConflictError,
  EntityWorkspaceUnavailableError,
  type EntityStore,
} from "../application/EntityStore";
import type { SessionActorReader } from "../application/SessionStore";
import {
  CreatePersonalEntityBodySchema,
  PersonalEntityQuerySchema,
  UpdatePersonalEntityBodySchema,
  WorkspaceEntityItemParamsSchema,
  WorkspaceEntityParamsSchema,
} from "./entity-contracts";
import { getRequestActor } from "./session-context";

interface EntityRouteDependencies {
  entities: EntityStore;
  sessions: SessionActorReader;
}

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

function entityDto(entity: WorkspaceEntity) {
  return {
    id: entity.id,
    workspaceId: entity.workspaceId,
    name: entity.name,
    description: entity.description,
    mediaRefs: entity.mediaRefs.map(({ mediaAssetId, order }) => ({ assetId: mediaAssetId, order })),
    coverAssetId: entity.coverMediaId,
    version: entity.version,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

function entityError(reply: FastifyReply, error: unknown): FastifyReply | null {
  if (error instanceof EntityValidationError) {
    return reply.code(400).send({ error: { code: "invalid_entity", message: "主体信息无效。" } });
  }
  if (error instanceof EntityWorkspaceUnavailableError) {
    return reply.code(404).send({ error: { code: "workspace_not_found", message: "工作空间不存在。" } });
  }
  if (error instanceof EntityUnavailableError) {
    return reply.code(404).send({ error: { code: "entity_not_found", message: "主体不存在。" } });
  }
  if (error instanceof EntityMediaUnavailableError) {
    return reply.code(404).send({
      error: { code: "asset_not_found", message: "主体引用了不存在或当前不可用的素材。" },
    });
  }
  if (error instanceof EntityCoverMediaInvalidError) {
    return reply.code(400).send({
      error: { code: "invalid_entity_cover", message: "主体封面必须是图片或视频。" },
    });
  }
  if (error instanceof EntityCreateConflictError) {
    return reply.code(409).send({
      error: { code: "entity_idempotency_key_reused", message: "新建主体请求标识已用于其他内容。" },
    });
  }
  if (error instanceof EntityVersionConflictError) {
    return reply.code(409).send({
      error: {
        code: "entity_version_conflict",
        message: "主体已被其他操作更新，请刷新后重试。",
        currentVersion: error.currentVersion,
      },
    });
  }
  return null;
}

export async function registerEntityRoutes(
  app: FastifyInstance,
  dependencies: EntityRouteDependencies,
): Promise<void> {
  app.get("/api/workspaces/:workspaceId/entities", async (request, reply) => {
    const actor = await requireActor(request, reply, dependencies.sessions);
    if (!actor) return reply;
    const params = WorkspaceEntityParamsSchema.safeParse(request.params);
    const query = PersonalEntityQuerySchema.safeParse(request.query);
    if (!params.success || !query.success) {
      return reply.code(400).send({ error: { code: "invalid_request", message: "主体查询无效。" } });
    }
    try {
      const entities = await dependencies.entities.listPersonalEntities({
        actorId: actor.id,
        workspaceId: params.data.workspaceId,
      });
      return { entities: entities.map(entityDto) };
    } catch (error) {
      const response = entityError(reply, error);
      if (response) return response;
      throw error;
    }
  });

  app.post("/api/workspaces/:workspaceId/entities", async (request, reply) => {
    const actor = await requireActor(request, reply, dependencies.sessions);
    if (!actor) return reply;
    const params = WorkspaceEntityParamsSchema.safeParse(request.params);
    const body = CreatePersonalEntityBodySchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: { code: "invalid_request", message: "主体信息无效。" } });
    }
    try {
      const entity = await dependencies.entities.createPersonalEntity({
        actorId: actor.id,
        workspaceId: params.data.workspaceId,
        idempotencyKey: body.data.idempotencyKey,
        name: body.data.name,
        description: body.data.description,
        mediaAssetIds: body.data.assetIds,
        coverMediaId: body.data.coverAssetId,
      });
      return reply.code(201).send({ entity: entityDto(entity) });
    } catch (error) {
      const response = entityError(reply, error);
      if (response) return response;
      throw error;
    }
  });

  app.get("/api/workspaces/:workspaceId/entities/:entityId", async (request, reply) => {
    const actor = await requireActor(request, reply, dependencies.sessions);
    if (!actor) return reply;
    const params = WorkspaceEntityItemParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(404).send({ error: { code: "entity_not_found", message: "主体不存在。" } });
    }
    try {
      const entity = await dependencies.entities.getPersonalEntity({
        actorId: actor.id,
        workspaceId: params.data.workspaceId,
        entityId: params.data.entityId,
      });
      if (!entity) {
        return reply.code(404).send({ error: { code: "entity_not_found", message: "主体不存在。" } });
      }
      return { entity: entityDto(entity) };
    } catch (error) {
      const response = entityError(reply, error);
      if (response) return response;
      throw error;
    }
  });

  app.patch("/api/workspaces/:workspaceId/entities/:entityId", async (request, reply) => {
    const actor = await requireActor(request, reply, dependencies.sessions);
    if (!actor) return reply;
    const params = WorkspaceEntityItemParamsSchema.safeParse(request.params);
    const body = UpdatePersonalEntityBodySchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: { code: "invalid_request", message: "主体信息无效。" } });
    }
    try {
      const entity = await dependencies.entities.updatePersonalEntity({
        actorId: actor.id,
        workspaceId: params.data.workspaceId,
        entityId: params.data.entityId,
        expectedVersion: body.data.expectedVersion,
        name: body.data.name,
        description: body.data.description,
        mediaAssetIds: body.data.assetIds,
        coverMediaId: body.data.coverAssetId,
      });
      return { entity: entityDto(entity) };
    } catch (error) {
      const response = entityError(reply, error);
      if (response) return response;
      throw error;
    }
  });
}
