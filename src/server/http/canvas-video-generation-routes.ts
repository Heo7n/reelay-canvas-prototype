import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { ExpectedCanvasVideoActorSchema, PrepareCanvasVideoTaskSchema, SetCanvasVideoBindingSchema } from "../../contracts/canvas-video-generation";
import { CanvasVideoGenerationError, type CanvasVideoTask } from "../../domain/generation/canvas-video-task";
import type { CanvasVideoGenerationService } from "../application/CanvasVideoGenerationService";
import type { ProjectAccessReader } from "../application/ProjectStore";
import { RealGenerationError } from "../application/RealGenerationPlatform";
import type { SessionActorReader } from "../application/SessionStore";
import { getRequestActor } from "./session-context";

const Id = z.string().min(1).max(200);
const Params = z.object({ id: z.string().uuid() });
const ExpectedActorId = ExpectedCanvasVideoActorSchema.shape.expectedActorId;
const ProjectQuery = z.object({ projectId: Id, canvasDocumentId: Id.optional(), expectedActorId: ExpectedActorId }).strict();
const TaskQuery = z.object({ projectId: Id.optional(), canvasDocumentId: Id.optional(), expectedActorId: ExpectedActorId }).strict();
const ProjectListQuery = z.object({ page: z.coerce.number().int().min(1).max(10_000).default(1), expectedActorId: ExpectedActorId }).strict();
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
function localRequest(request: FastifyRequest) {
  if (!localHosts.has(request.hostname) || !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.ip) || request.headers["sec-fetch-site"] === "cross-site") return false;
  if (!request.headers.origin) return true;
  try { const origin = new URL(request.headers.origin); return localHosts.has(origin.hostname) && ["http:", "https:"].includes(origin.protocol) && !origin.username && !origin.password; } catch { return false; }
}
function rangeFrom(value: string | undefined, size: number): { start: number; end: number } | null | "invalid" {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return "invalid";
  if (!match[1]) { const suffix = Number(match[2]); return Number.isSafeInteger(suffix) && suffix > 0 ? { start: Math.max(0, size - suffix), end: size - 1 } : "invalid"; }
  const start = Number(match[1]); const end = match[2] ? Number(match[2]) : size - 1;
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start < size && end >= start ? { start, end: Math.min(end, size - 1) } : "invalid";
}
const messages: Record<string, string> = {
  unavailable: "本机真实生成未启用。", project_not_found: "项目不存在或无法访问。", project_forbidden: "当前项目为只读。", task_not_found: "找不到可访问的生成任务。",
  binding_required: "请先选择此本地项目对应的官网项目。", task_not_bound: "生成任务尚未可靠绑定到已保存的画布节点。", request_conflict: "提交标识与原请求不一致。", account_busy: "真实账号已有进行中或结果未确认的任务。",
  account_mismatch: "请连接发起此任务的原真实账号。", retry_unavailable: "当前任务不可重试保存。", disconnected: "请先连接真实平台账号。", expired: "真实平台连接已失效，请重新连接。", probe_busy: "真实账号已有进行中的任务。",
  container_unavailable: "请选择从官网列表读取的现有项目。", platform_unavailable: "真实平台响应无法确认；没有退回模拟或重发。",
};
export function registerCanvasVideoGenerationRoutes(app: FastifyInstance, dependencies: { sessions: SessionActorReader; projects: ProjectAccessReader; service: CanvasVideoGenerationService | null }) {
  const { service } = dependencies;
  app.addHook("onClose", async () => service?.dispose());
  async function handle(request: FastifyRequest, reply: FastifyReply, operation: (actorId: string) => Promise<unknown>, allowUnavailable = false, expectedActorSource: "query" | "body" | "none" = "query") {
    reply.header("Cache-Control", "private, no-store").header("Vary", "Cookie");
    const actor = await getRequestActor(request, dependencies.sessions);
    if (!actor) return reply.code(401).send({ error: { code: "session_required", message: "请先登录本机账号。" } });
    if (!localRequest(request)) return reply.code(403).send({ error: { code: "local_only", message: "真实生成仅限本机访问。" } });
    try {
      if (expectedActorSource !== "none") {
        const expected = ExpectedCanvasVideoActorSchema.passthrough().parse(expectedActorSource === "body" ? request.body : request.query).expectedActorId;
        if (expected !== actor.id) return reply.code(401).send({ error: { code: "session_actor_changed", message: "登录账号已变化，请使用原账号恢复当前画布。" } });
      }
      if (!service && !allowUnavailable) return reply.code(503).send({ error: { code: "unavailable", message: messages.unavailable } });
      return await operation(actor.id);
    }
    catch (error) {
      if (error instanceof z.ZodError) return reply.code(400).send({ error: { code: "invalid_request", message: error.issues[0]?.message ?? "生成参数无效。" } });
      const code = error instanceof CanvasVideoGenerationError || error instanceof RealGenerationError ? error.code : "platform_unavailable";
      const status = ["task_not_found", "project_not_found"].includes(code) ? 404 : code === "project_forbidden" ? 403 : code === "expired" ? 401 : ["unavailable", "platform_unavailable"].includes(code) ? 503 : code === "container_unavailable" ? 400 : 409;
      return reply.code(status).send({ error: { code, message: messages[code] ?? messages.platform_unavailable } });
    }
  }
  async function checkScope(actorId: string, request: FastifyRequest): Promise<CanvasVideoTask> {
    const id = Params.parse(request.params).id; const query = TaskQuery.parse(request.query); const task = await service!.get(actorId, id);
    if ((query.projectId && task.projectId !== query.projectId) || (query.canvasDocumentId && task.canvasDocumentId !== query.canvasDocumentId)) throw new CanvasVideoGenerationError("task_not_found");
    return task;
  }
  app.get("/api/canvas-video-generation/context", (request, reply) => handle(request, reply, async (actorId) => {
    const query = ProjectQuery.parse(request.query);
    if (service) return service.context(actorId, query.projectId);
    if (!await dependencies.projects.getProjectById(actorId, query.projectId)) throw new CanvasVideoGenerationError("project_not_found");
    return { kind: "simulation", reason: "unavailable", taskHistoryAvailable: false };
  }, true));
  app.get("/api/canvas-video-generation/projects", (request, reply) => handle(request, reply, async (actorId) => { const query = ProjectListQuery.parse(request.query); return service!.listProjects(actorId, query.page); }));
  app.put("/api/canvas-video-generation/binding", (request, reply) => handle(request, reply, async (actorId) => { const body = SetCanvasVideoBindingSchema.parse(request.body); return service!.bind(actorId, body.projectId, body.platformProjectId); }, false, "body"));
  app.post("/api/canvas-video-generation/tasks/prepare", (request, reply) => handle(request, reply, async (actorId) => {
    const body = PrepareCanvasVideoTaskSchema.parse(request.body);
    const input = { requestKey: body.requestKey, projectId: body.projectId, canvasDocumentId: body.canvasDocumentId, canvasRecordId: body.canvasRecordId, nodeId: body.nodeId, conversationId: body.conversationId, sourceSurface: body.sourceSurface, prompt: body.prompt, parameters: body.parameters, references: body.references };
    return reply.code(201).send(await service!.prepare(actorId, input));
  }, false, "body"));
  app.post("/api/canvas-video-generation/tasks/:id/activate", (request, reply) => handle(request, reply, async (actorId) => { const task = await checkScope(actorId, request); return reply.code(202).send(await service!.activate(actorId, task.id)); }));
  app.get("/api/canvas-video-generation/tasks/:id", (request, reply) => handle(request, reply, (actorId) => checkScope(actorId, request)));
  app.get("/api/canvas-video-generation/tasks", (request, reply) => handle(request, reply, async (actorId) => { const query = ProjectQuery.parse(request.query); const value = await service!.list(actorId, query.projectId); return { tasks: value.tasks.filter((task) => !query.canvasDocumentId || task.canvasDocumentId === query.canvasDocumentId) }; }));
  app.get("/api/canvas-video-generation/tasks/:id/projection", (request, reply) => handle(request, reply, async (actorId) => {
    const query = ProjectQuery.parse(request.query); const task = await service!.projection(actorId, query.projectId, Params.parse(request.params).id);
    if (query.canvasDocumentId && task.canvasDocumentId !== query.canvasDocumentId) throw new CanvasVideoGenerationError("task_not_found"); return task;
  }));
  app.post("/api/canvas-video-generation/tasks/:id/retry-save", (request, reply) => handle(request, reply, async (actorId) => { const task = await checkScope(actorId, request); return reply.code(202).send(await service!.retrySave(actorId, task.id)); }));
  app.get("/api/projects/:projectId/generation-results/:id/video", (request, reply) => handle(request, reply, async (actorId) => {
    const params = z.object({ projectId: Id, id: z.string().uuid() }).parse(request.params);
    const metadata = await service!.resultMetadata(actorId, params.projectId, params.id);
    const range = rangeFrom(request.headers.range, metadata.byteSize);
    reply.header("Accept-Ranges", "bytes").header("X-Content-Type-Options", "nosniff");
    if (range === "invalid") return reply.code(416).header("Content-Range", `bytes */${metadata.byteSize}`).send();
    const stored = await service!.readResult(actorId, params.projectId, params.id, range ?? undefined);
    if (!stored) throw new CanvasVideoGenerationError("task_not_found");
    if (range) reply.code(206).header("Content-Range", `bytes ${range.start}-${range.end}/${metadata.byteSize}`);
    return reply.header("Content-Length", stored.body.byteLength).type(metadata.contentType).send(Buffer.from(stored.body));
  }, false, "none"));
}
