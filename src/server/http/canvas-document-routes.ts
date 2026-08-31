import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { SessionActor } from "../../domain/identity/session";
import {
  canonicalizeLegacyCanvasDocumentEnvelopeV1,
  LEGACY_CANVAS_DOCUMENT_KIND,
  LEGACY_CANVAS_DOCUMENT_SCHEMA_VERSION,
} from "../../contracts/canvas-document-v1";
import {
  CanvasDocumentProjectUnavailableError,
  CanvasDocumentRevisionConflictError,
  type CanvasDocumentStore,
} from "../application/CanvasDocumentStore";
import type { ProjectAccessReader } from "../application/ProjectStore";
import type { SessionActorReader } from "../application/SessionStore";
import { CanvasDocumentParamsSchema, SaveCanvasDocumentBodySchema } from "./contracts";
import { getRequestActor } from "./session-context";

type CanvasDocumentRouteCapabilities = CanvasDocumentStore & ProjectAccessReader & SessionActorReader;

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

export async function registerCanvasDocumentRoutes(
  app: FastifyInstance,
  capabilities: CanvasDocumentRouteCapabilities,
): Promise<void> {
  app.get(
    "/api/projects/:projectId/canvases/:canvasId/document",
    async (request, reply) => {
      const actor = await requireActor(request, reply, capabilities);
      if (!actor) return reply;
      const params = CanvasDocumentParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send({
          error: { code: "invalid_request", message: "画布文档标识无效。" },
        });
      }

      const { projectId, canvasId } = params.data;
      try {
        const document = await capabilities.getCanvasDocument({ actorId: actor.id, projectId, canvasId });
        if (!document) return { document: null };
        if (document.schemaVersion !== LEGACY_CANVAS_DOCUMENT_SCHEMA_VERSION) {
          return reply.code(422).send({
            error: {
              code: "unsupported_canvas_document",
              message: "此画布文档版本暂不受支持。",
            },
          });
        }
        const content = canonicalizeLegacyCanvasDocumentEnvelopeV1(
          document.schemaVersion,
          document.content,
        )?.content;
        if (!content) {
          const candidate = document.content !== null && typeof document.content === "object"
            ? document.content as { kind?: unknown; version?: unknown }
            : null;
          const unsupportedVersion = candidate?.kind === LEGACY_CANVAS_DOCUMENT_KIND
            && candidate.version !== LEGACY_CANVAS_DOCUMENT_SCHEMA_VERSION;
          return reply.code(422).send({
            error: {
              code: unsupportedVersion ? "unsupported_canvas_document" : "corrupt_canvas_document",
              message: unsupportedVersion ? "此画布文档版本暂不受支持。" : "画布文档内容已损坏，无法安全加载。",
            },
          });
        }
        return { document: { ...document, schemaVersion: LEGACY_CANVAS_DOCUMENT_SCHEMA_VERSION, content } };
      } catch (error) {
        if (error instanceof CanvasDocumentProjectUnavailableError) {
          return reply.code(404).send({
            error: { code: "project_not_found", message: "项目不存在。" },
          });
        }
        throw error;
      }
    },
  );

  app.put(
    "/api/projects/:projectId/canvases/:canvasId/document",
    async (request, reply) => {
      const actor = await requireActor(request, reply, capabilities);
      if (!actor) return reply;
      const params = CanvasDocumentParamsSchema.safeParse(request.params);
      const body = SaveCanvasDocumentBodySchema.safeParse(request.body);
      if (!params.success || !body.success) {
        return reply.code(400).send({
          error: { code: "invalid_request", message: "画布文档数据无效。" },
        });
      }

      const { projectId, canvasId } = params.data;
      const project = await capabilities.getProjectById(actor.id, projectId);
      if (!project) {
        return reply.code(404).send({
          error: { code: "project_not_found", message: "项目不存在。" },
        });
      }
      if (project.currentUserRole === "view") {
        return reply.code(403).send({
          error: { code: "project_forbidden", message: "当前项目权限为只读。" },
        });
      }

      const envelope = canonicalizeLegacyCanvasDocumentEnvelopeV1(
        body.data.schemaVersion,
        body.data.content,
      );
      if (!envelope) {
        return reply.code(400).send({
          error: {
            code: "unsupported_canvas_document",
            message: "仅支持有效的 Reelay CanvasDocument v1。",
          },
        });
      }

      try {
        const document = await capabilities.saveCanvasDocument({
          actorId: actor.id,
          projectId,
          canvasId,
          schemaVersion: envelope.schemaVersion,
          expectedRevision: body.data.expectedRevision,
          content: envelope.content,
        });
        return reply.code(body.data.expectedRevision === 0 ? 201 : 200).send({ document });
      } catch (error) {
        if (error instanceof CanvasDocumentProjectUnavailableError) {
          return reply.code(404).send({
            error: { code: "project_not_found", message: "项目不存在、已删除或无法访问。" },
          });
        }
        if (error instanceof CanvasDocumentRevisionConflictError) {
          return reply.code(409).send({
            error: {
              code: "canvas_revision_conflict",
              message: "画布已被其他保存更新，请重新加载后再试。",
              currentRevision: error.currentRevision,
            },
          });
        }
        throw error;
      }
    },
  );
}
