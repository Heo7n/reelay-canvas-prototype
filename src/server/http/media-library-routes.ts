import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { MoveLibraryEntitiesInputSchema, DeleteLibraryTagInputSchema, RenameLibraryFolderInputSchema, DeleteLibraryInputSchema, LibrarySpaceSchema, MediaLibraryError, SaveLibraryInputSchema, UpdateLibraryTagsInputSchema, isValidLibraryTagUpdate } from "../../domain/asset/media-library";
import type { MediaLibraryStore } from "../application/MediaLibraryStore";
import type { SessionActorReader } from "../application/SessionStore";
import { AssetWorkspaceUnavailableError, PersonalAssetUnavailableError } from "../application/WorkspaceMediaAssetStore";
import { ProjectAssetUnavailableError } from "../application/ProjectAssetReferenceStore";
import { WorkspaceAssetParamsSchema } from "./asset-contracts";
import { getRequestActor } from "./session-context";

const FolderBodySchema = z.object({ space: LibrarySpaceSchema, parentId: z.string().trim().min(1).max(200).nullable(), name: z.string().trim().min(1).max(100) }).strict();
const TagBodySchema = z.object({ space: LibrarySpaceSchema, name: z.string().trim().min(1).max(40) }).strict();
const RenameFolderBodySchema = RenameLibraryFolderInputSchema.omit({ workspaceId: true });
const DeleteBodySchema = DeleteLibraryInputSchema.omit({ workspaceId: true });
const SaveBodySchema = SaveLibraryInputSchema.omit({ workspaceId: true });
const DeleteTagBodySchema = DeleteLibraryTagInputSchema.omit({ workspaceId: true });
const UpdateTagsBodySchema = UpdateLibraryTagsInputSchema.omit({ workspaceId: true }).refine(isValidLibraryTagUpdate);

export function registerMediaLibraryRoutes(app: FastifyInstance, dependencies: { assetStore: MediaLibraryStore; sessions: SessionActorReader }): void {
  async function handle(request: FastifyRequest, reply: FastifyReply, operation: (context: { actorId: string; workspaceId: string }) => Promise<unknown>) {
    reply.header("Cache-Control", "private, no-store").header("Vary", "Cookie");
    const actor = await getRequestActor(request, dependencies.sessions);
    if (!actor) return reply.code(401).send({ error: { code: "session_required", message: "请先登录。" } });
    const params = WorkspaceAssetParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: { code: "invalid_request", message: "资产库标识无效。" } });
    try { return await operation({ actorId: actor.id, workspaceId: params.data.workspaceId }); }
    catch (error) {
      if (error instanceof MediaLibraryError) return reply.code(error.code === "forbidden" ? 403 : ["folder_not_found", "tag_not_found", "library_item_not_found"].includes(error.code) ? 404 : ["placement_changed", "explicit_move_required", "folder_name_conflict", "library_item_in_use", "entity_changed", "folder_changed", "tag_usage_changed", "tag_selection_changed"].includes(error.code) ? 409 : 400).send({ error: { code: error.code, message: error.message } });
      if (error instanceof AssetWorkspaceUnavailableError) return reply.code(404).send({ error: { code: "workspace_not_found", message: "工作空间不存在或你已不在此组织中。" } });
      if (error instanceof ProjectAssetUnavailableError || error instanceof PersonalAssetUnavailableError) return reply.code(404).send({ error: { code: "asset_not_found", message: "素材不存在或无法从当前项目保存。" } });
      if (error instanceof z.ZodError) return reply.code(400).send({ error: { code: "invalid_request", message: "素材库操作的信息无效，请检查后重试。" } });
      throw error;
    }
  }

  app.get("/api/workspaces/:workspaceId/media-library", (request, reply) => handle(request, reply, async (context) => ({ catalog: await dependencies.assetStore.listLibrary(context) })));
  app.post("/api/workspaces/:workspaceId/media-library/folders", (request, reply) => handle(request, reply, async (context) => ({ folder: await dependencies.assetStore.createLibraryFolder({ ...context, ...FolderBodySchema.parse(request.body) }) })));
  app.post("/api/workspaces/:workspaceId/media-library/rename-folder", (request, reply) => handle(request, reply, async (context) => ({ folder: await dependencies.assetStore.renameLibraryFolder({ ...context, ...RenameFolderBodySchema.parse(request.body) }) })));
  app.post("/api/workspaces/:workspaceId/media-library/tags", (request, reply) => handle(request, reply, async (context) => ({ tag: await dependencies.assetStore.createLibraryTag({ ...context, ...TagBodySchema.parse(request.body) }) })));
  app.post("/api/workspaces/:workspaceId/media-library/tags/delete", (request, reply) => handle(request, reply, async (context) => ({ catalog: await dependencies.assetStore.deleteLibraryTag({ ...context, ...DeleteTagBodySchema.parse(request.body) }) })));
  app.post("/api/workspaces/:workspaceId/media-library/tags/update", (request, reply) => handle(request, reply, async (context) => ({ catalog: await dependencies.assetStore.updateLibraryTags({ ...context, ...UpdateTagsBodySchema.parse(request.body) }) })));
  app.post("/api/workspaces/:workspaceId/media-library/delete", (request, reply) => handle(request, reply, async (context) => ({ catalog: await dependencies.assetStore.deleteLibrary({ ...context, ...DeleteBodySchema.parse(request.body) }) })));
  app.post("/api/workspaces/:workspaceId/media-library/move-entities", (request, reply) => handle(request, reply, async (context) => ({ catalog: await dependencies.assetStore.moveLibraryEntities({ ...context, ...MoveLibraryEntitiesInputSchema.omit({ workspaceId: true }).parse(request.body) }) })));
  app.post("/api/workspaces/:workspaceId/media-library/save", (request, reply) => handle(request, reply, async (context) => ({ catalog: await dependencies.assetStore.saveLibrary({ ...context, ...SaveBodySchema.parse(request.body) }) })));
}
