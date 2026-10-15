import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { PlatformLoginSchema, REAL_GENERATION_CALL_SOURCE, REAL_GENERATION_PROBE_SPEC, StartGenerationProbeSchema } from "../../contracts/real-generation";
import { RealGenerationProbeService } from "../application/RealGenerationProbeService";
import { RealGenerationError, type RealGenerationErrorCode } from "../application/RealGenerationPlatform";
import type { SessionActorReader } from "../application/SessionStore";
import { getRequestActor } from "./session-context";

const PageSchema = z.coerce.number().int().min(1).max(10_000).default(1);
const ParamsSchema = z.object({ id: z.string().uuid() }).strict();
const QuerySchema = z.object({ page: PageSchema }).strict();
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const errors: Record<RealGenerationErrorCode, { status: number; message: string }> = {
  unavailable: { status: 503, message: "请设置 REELAY_REAL_GENERATION_ENABLED=1 并重启本机 API；静态分享体验不启用真实生成。" },
  disconnected: { status: 409, message: "请先连接真实平台账号。" },
  expired: { status: 401, message: "真实平台登录已失效，请重新连接；不会自动重发生成。" },
  credentials_rejected: { status: 401, message: "真实平台未接受此登录，请核对账号和密码。" },
  agent_channel_rejected: { status: 409, message: "当前官网凭据未被外部调用通道接受，官网连接保留。" },
  platform_unavailable: { status: 503, message: "暂时无法确认真实平台响应，请稍后核对。" },
  protocol_unconfirmed: { status: 503, message: "平台响应格式尚未确认，本次操作未继续。" },
  container_unavailable: { status: 400, message: "请选择从官网列表读取的已有项目。" },
  probe_busy: { status: 409, message: "该真实账号已有进行中的联调，请先等待结果。" },
  probe_not_found: { status: 404, message: "找不到当前账号的联调结果。" },
  request_conflict: { status: 409, message: "此提交标识已用于另一条内容，请核对原提交。" },
  save_unavailable: { status: 503, message: "视频暂时无法安全保存；不会重新生成。" },
  account_mismatch: { status: 409, message: "此联调已有另一真实账号的记录，请连接原账号；当前连接保持不变。" },
};

function localRequest(request: FastifyRequest): boolean {
  if (!localHosts.has(request.hostname) || !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.ip)
    || request.headers["sec-fetch-site"] === "cross-site") return false;
  if (!request.headers.origin) return true;
  try {
    const origin = new URL(request.headers.origin);
    return localHosts.has(origin.hostname) && ["http:", "https:"].includes(origin.protocol) && !origin.username && !origin.password;
  } catch { return false; }
}

function parseRange(value: string | undefined, size: number): { start: number; end: number } | null | "invalid" {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return "invalid";
  if (!match[1]) {
    const suffix = Number(match[2]);
    return Number.isSafeInteger(suffix) && suffix > 0 ? { start: Math.max(0, size - suffix), end: size - 1 } : "invalid";
  }
  const start = Number(match[1]); const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) return "invalid";
  return { start, end: Math.min(end, size - 1) };
}

export function registerRealGenerationRoutes(app: FastifyInstance, dependencies: { sessions: SessionActorReader; service: RealGenerationProbeService | null }): void {
  const { service, sessions } = dependencies;
  app.addHook("onClose", async () => service?.dispose());

  async function handle(request: FastifyRequest, reply: FastifyReply, operation: (actorId: string) => Promise<unknown> | unknown, readAvailability = false) {
    reply.header("Cache-Control", "private, no-store").header("Vary", "Cookie");
    const actor = await getRequestActor(request, sessions);
    if (!actor) return reply.code(401).send({ error: { code: "session_required", message: "请先登录本机账号。" } });
    if (!localRequest(request)) return reply.code(403).send({ error: { code: "local_only", message: "真实生成联调仅允许本机访问。" } });
    if (!service && !readAvailability) return reply.code(503).send({ error: { code: "unavailable", message: errors.unavailable.message } });
    try { return await operation(actor.id); }
    catch (error) {
      if (error instanceof z.ZodError) return reply.code(400).send({ error: { code: "invalid_request", message: "请核对登录、项目或付费确认参数。" } });
      const code = error instanceof RealGenerationError ? error.code : "platform_unavailable";
      return reply.code(errors[code].status).send({ error: { code, message: errors[code].message } });
    }
  }

  app.get("/api/real-generation/connection", (request, reply) => handle(request, reply, (actorId) => service ? service.connection(actorId) : {
    channel: REAL_GENERATION_CALL_SOURCE, available: false, state: "disconnected", reason: errors.unavailable.message, platformUser: null, specification: REAL_GENERATION_PROBE_SPEC, probe: null,
  }, true));
  app.post("/api/real-generation/connection", { logLevel: "silent" }, (request, reply) => handle(request, reply, (actorId) => service!.connect(actorId, PlatformLoginSchema.parse(request.body))));
  app.delete("/api/real-generation/connection", (request, reply) => handle(request, reply, (actorId) => { service!.disconnect(actorId); return reply.code(204).send(); }));
  app.get("/api/real-generation/projects", (request, reply) => handle(request, reply, (actorId) => service!.listProjects(actorId, QuerySchema.parse(request.query).page)));
  app.get("/api/real-generation/project-channel-comparison", (request, reply) => handle(request, reply, (actorId) => service!.compareProjectChannels(actorId, QuerySchema.parse(request.query).page)));
  app.post("/api/real-generation/probes", (request, reply) => handle(request, reply, async (actorId) => {
    const probe = await service!.start(actorId, StartGenerationProbeSchema.parse(request.body));
    return reply.code(202).send(probe);
  }));
  app.get("/api/real-generation/probes/:id", (request, reply) => handle(request, reply, (actorId) => service!.get(actorId, ParamsSchema.parse(request.params).id)));
  app.post("/api/real-generation/probes/:id/retry-save", (request, reply) => handle(request, reply, async (actorId) => {
    const probe = await service!.retrySave(actorId, ParamsSchema.parse(request.params).id);
    return reply.code(202).send(probe);
  }));
  app.get("/api/real-generation/probes/:id/video", (request, reply) => handle(request, reply, async (actorId) => {
    const id = ParamsSchema.parse(request.params).id;
    const metadata = service!.videoMetadata(actorId, id);
    const range = parseRange(request.headers.range, metadata.byteSize);
    reply.header("Accept-Ranges", "bytes").header("X-Content-Type-Options", "nosniff");
    if (range === "invalid") return reply.code(416).header("Content-Range", `bytes */${metadata.byteSize}`).send();
    const stored = await service!.readVideo(actorId, id, range ?? undefined);
    if (!stored) throw new RealGenerationError("probe_not_found");
    if (range) reply.code(206).header("Content-Range", `bytes ${range.start}-${range.end}/${metadata.byteSize}`);
    return reply.header("Content-Length", stored.body.byteLength).type(metadata.contentType).send(Buffer.from(stored.body));
  }));
}
