import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { ObjectStore } from "../application/ObjectStore";
import type { SessionActorReader } from "../application/SessionStore";
import { AssetUploadConflictError, AssetUploadIntentUnavailableError, AssetWorkspaceUnavailableError, type CancelAssetUploadInput, type WorkspaceMediaAssetStore } from "../application/WorkspaceMediaAssetStore";
import { ProjectAssetUnavailableError } from "../application/ProjectAssetReferenceStore";
import { getRequestActor } from "./session-context";

const ParamsSchema = z.object({ workspaceId: z.string().trim().min(1).max(200), uploadId: z.string().trim().min(1).max(200).optional() });
const QuerySchema = z.object({ space: z.enum(["personal", "organization"]).optional(), projectId: z.string().trim().min(1).max(200).optional() }).strict();

export function registerMediaStorageRoutes(app: FastifyInstance, dependencies: {
  assetStore: WorkspaceMediaAssetStore;
  objectStore: ObjectStore;
  sessions: SessionActorReader;
}): void {
  const { assetStore, objectStore, sessions } = dependencies;

  async function cancel(input: CancelAssetUploadInput) {
    const intent = await assetStore.beginUploadCancellation(input);
    if (intent.status === "cancelled") return { status: "cancelled" as const };
    // Supabase upload tokens cannot be revoked per intent. Even an expired
    // token may have an in-flight request; preserve bytes until we can fence it.
    if (intent.uploadAuthorizationExpiresAt) return { status: "cancelling" as const, reason: "remote_upload_pending" as const };
    await objectStore.deleteObject(intent.objectKey);
    if (await objectStore.headObject(intent.objectKey)) throw new Error("Upload object deletion was not confirmed.");
    await assetStore.completeUploadCancellation(input);
    return { status: "cancelled" as const };
  }

  async function handle(request: FastifyRequest, reply: FastifyReply, operation: (context: { actorId: string; workspaceId: string; uploadIntentId?: string }) => Promise<unknown>) {
    reply.header("Cache-Control", "private, no-store").header("Vary", "Cookie");
    const actor = await getRequestActor(request, sessions);
    if (!actor) return reply.code(401).send({ error: { code: "session_required", message: "请先登录。" } });
    try {
      const params = ParamsSchema.parse(request.params);
      return await operation({ actorId: actor.id, workspaceId: params.workspaceId, uploadIntentId: params.uploadId });
    } catch (error) {
      if (error instanceof z.ZodError) return reply.code(400).send({ error: { code: "invalid_request", message: "存储查询参数无效。" } });
      if (error instanceof AssetWorkspaceUnavailableError || error instanceof ProjectAssetUnavailableError || error instanceof AssetUploadIntentUnavailableError) return reply.code(404).send({ error: { code: "storage_not_found", message: "存储空间或上传不存在。" } });
      if (error instanceof AssetUploadConflictError) return reply.code(409).send({ error: { code: `asset_upload_${error.reason}`, message: "此上传的状态已变化，请刷新后重试。" } });
      return reply.code(503).send({ error: { code: "storage_cleanup_unavailable", message: "上传清理尚未完成，容量暂时保留，可稍后重试。" } });
    }
  }

  app.get("/api/workspaces/:workspaceId/media-storage", (request, reply) => handle(request, reply, async (context) => {
    const query = QuerySchema.parse(request.query);
    const input = { ...context, storageSpace: query.space, projectId: query.projectId };
    const expired = await assetStore.listExpiredUploadIntents(input);
    let pendingCount = 0;
    let heldForRemoteUploadCount = 0;
    for (const intent of expired) {
      try {
        const result = await cancel({ ...context, uploadIntentId: intent.id, expiredOnly: intent.status !== "cancelling" });
        if (result.status === "cancelling") { pendingCount++; heldForRemoteUploadCount++; }
      } catch (error) {
        if (error instanceof AssetUploadConflictError && error.reason === "finalized") continue;
        pendingCount++;
      }
    }
    return { storage: await assetStore.getMediaStorage(input), cleanup: { pendingCount, heldForRemoteUploadCount } };
  }));

  app.delete("/api/workspaces/:workspaceId/media-upload-intents/:uploadId", (request, reply) => handle(request, reply, async (context) => {
    const result = await cancel({ ...context, uploadIntentId: context.uploadIntentId! });
    if (result.status === "cancelling") reply.code(202);
    return { uploadIntent: { id: context.uploadIntentId, ...result } };
  }));
}
