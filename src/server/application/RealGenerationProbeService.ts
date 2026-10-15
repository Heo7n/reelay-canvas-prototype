import type {
  GenerationConnection,
  GenerationProbe,
  PlatformContainerPage,
  PlatformLogin,
  StartGenerationProbe,
} from "../../domain/generation/real-generation";
import type { ObjectStore, StoredObjectMetadata } from "./ObjectStore";
import type { GenerationAccountGuard } from "./CanvasVideoGenerationStore";
import {
  RealGenerationError,
  type PlatformIdentity,
  type PlatformPage,
  type PlatformVideo,
  type RealGenerationPlatform,
} from "./RealGenerationPlatform";

const active = new Set<GenerationProbe["status"]>(["submitting", "waiting", "saving"]);
type ProbeRecord = {
  actorId: string;
  userId: string;
  request: StartGenerationProbe;
  value: GenerationProbe;
  video?: PlatformVideo;
  bytes?: { contentType: string; body: Uint8Array };
  stored?: StoredObjectMetadata;
  controller?: AbortController;
  durableLock?: boolean;
};
type ActorState = {
  identity: PlatformIdentity | null;
  expired: boolean;
  connecting: boolean;
  connectionId: string;
  // A location hint for an explicit project id, never an authorization grant.
  projects: Map<string, number>;
  probes: Map<string, ProbeRecord>;
  requests: Map<string, ProbeRecord>;
  latest?: ProbeRecord;
};

function cloneProbe(record: ProbeRecord): GenerationProbe {
  return { ...record.value, diagnostics: { ...record.value.diagnostics, eventTypes: [...record.value.diagnostics.eventTypes], eventShapes: [...record.value.diagnostics.eventShapes] }, result: record.value.result ? { ...record.value.result } : null };
}

export class RealGenerationProbeService {
  private readonly actors = new Map<string, ActorState>();
  private readonly accountLocks = new Map<string, ProbeRecord>();
  private readonly canvasLocks = new Map<string, string>();
  private disposed = false;

  constructor(private readonly platform: RealGenerationPlatform, private readonly objects: ObjectStore,
    private readonly options: { channel: GenerationConnection["channel"]; specification: GenerationConnection["specification"]; makeId: () => string; accountGuard?: GenerationAccountGuard }) {}

  private state(actorId: string): ActorState {
    let state = this.actors.get(actorId);
    if (!state) {
      state = { identity: null, expired: false, connecting: false, connectionId: this.options.makeId(), projects: new Map(), probes: new Map(), requests: new Map() };
      this.actors.set(actorId, state);
    }
    return state;
  }

  connection(actorId: string): GenerationConnection {
    const state = this.state(actorId);
    return {
      channel: this.options.channel,
      available: !this.disposed,
      state: state.expired ? "expired" : state.identity ? "connected" : "disconnected",
      reason: this.disposed ? "本机联调已停止。" : null,
      platformUser: state.identity ? { id: state.identity.userId, displayName: state.identity.displayName } : null,
      specification: this.options.specification,
      probe: state.latest ? cloneProbe(state.latest) : null,
    };
  }

  private identity(actorId: string): PlatformIdentity {
    if (this.disposed) throw new RealGenerationError("unavailable");
    const state = this.state(actorId);
    if (state.expired) throw new RealGenerationError("expired");
    if (!state.identity) throw new RealGenerationError("disconnected");
    return state.identity;
  }

  // A server-private port. Never returned by a route or serialized in a DTO.
  borrowConnection(actorId: string): { identity: PlatformIdentity; connectionId: string } {
    return { identity: this.identity(actorId), connectionId: this.state(actorId).connectionId };
  }
  assertConnection(actorId: string, connectionId: string): void {
    this.identity(actorId);
    if (this.state(actorId).connectionId !== connectionId) throw new RealGenerationError("disconnected");
  }

  reserveCanvasConnection(actorId: string, taskId: string, platformUserId: string): { identity: PlatformIdentity; connectionId: string } {
    const connection = this.borrowConnection(actorId);
    if (connection.identity.userId !== platformUserId) throw new RealGenerationError("account_mismatch");
    if (this.accountLocks.has(platformUserId) || this.canvasLocks.has(platformUserId) || this.state(actorId).connecting) throw new RealGenerationError("probe_busy");
    this.canvasLocks.set(platformUserId, taskId);
    return connection;
  }

  releaseCanvasConnection(platformUserId: string, taskId: string): void {
    if (this.canvasLocks.get(platformUserId) === taskId) this.canvasLocks.delete(platformUserId);
  }

  async verifySelectedProject(actorId: string, projectId: string): Promise<{ id: string; name: string }> {
    const state = this.state(actorId); const identity = this.identity(actorId);
    const maxPages = 100;
    const cachedPage = state.projects.get(projectId);
    const hintPage = cachedPage;
    let pagesRead = 0;
    const requireCurrentIdentity = () => {
      if (this.disposed) throw new RealGenerationError("unavailable");
      if (state.expired) throw new RealGenerationError("expired");
      if (state.identity !== identity) throw new RealGenerationError("disconnected");
    };
    const readPage = async (page: number): Promise<PlatformPage> => {
      requireCurrentIdentity();
      if (pagesRead >= maxPages) throw new RealGenerationError("container_unavailable");
      pagesRead++;
      const result = await this.platform.listProjects(identity.token, page);
      requireCurrentIdentity();
      return result;
    };
    const found = (result: PlatformPage, page: number) => {
      requireCurrentIdentity();
      const project = result.items.find((entry) => entry.id === projectId);
      if (!project) return null;
      state.projects.set(projectId, page);
      return { id: project.id, name: project.name };
    };
    try {
      // Reconnection clears the process cache while the user's persisted
      // binding remains. Verify that exact id again instead of requiring a UI
      // listing step, choosing a replacement, or trusting the former page.
      let hinted: PlatformPage | undefined;
      if (hintPage) {
        hinted = await readPage(hintPage);
        const project = found(hinted, hintPage);
        if (project) return project;
        state.projects.delete(projectId);
      }
      for (let page = 1; page <= maxPages; page++) {
        const result = page === hintPage ? hinted! : await readPage(page);
        const project = found(result, page);
        if (project) return project;
        if (!result.hasMore) break;
      }
      state.projects.delete(projectId);
      throw new RealGenerationError("container_unavailable");
    } catch (error) { this.markExpired(state, identity, error); throw error; }
  }

  noteConnectionError(actorId: string, identity: PlatformIdentity, error: unknown): void { this.markExpired(this.state(actorId), identity, error); }

  // Upgrade imports are already-saved probe evidence, never credentials or
  // paid replay instructions. The existing user result remains readable.
  seedSavedProbe(input: { actorId: string; platformUserId: string; probe: GenerationProbe; stored: StoredObjectMetadata }): void {
    if (input.probe.status !== "succeeded" || !input.probe.result || input.probe.result.byteSize !== input.stored.byteSize) throw new RealGenerationError("save_unavailable");
    const state = this.state(input.actorId);
    const record: ProbeRecord = { actorId: input.actorId, userId: input.platformUserId, request: { requestKey: input.probe.requestKey, projectId: input.probe.projectId, prompt: input.probe.prompt, paidConsent: true }, value: structuredClone(input.probe), stored: { ...input.stored } };
    state.probes.set(record.value.id, record); state.requests.set(record.value.requestKey, record); state.latest = record;
  }

  private markExpired(state: ActorState, identity: PlatformIdentity, error: unknown): void {
    if (state.identity === identity && error instanceof RealGenerationError && error.code === "expired") {
      state.expired = true;
      // Do not retain a rejected credential or replay paid requests after login.
      state.identity = null;
      state.projects.clear();
    }
  }

  async connect(actorId: string, input: PlatformLogin): Promise<GenerationConnection> {
    if (this.disposed) throw new RealGenerationError("unavailable");
    const state = this.state(actorId);
    if (state.connecting || (state.identity && this.canvasLocks.has(state.identity.userId)) || [...state.probes.values()].some((record) => active.has(record.value.status))) throw new RealGenerationError("probe_busy");
    state.connecting = true;
    try {
      const identity = await this.platform.login(input);
      if (this.disposed) throw new RealGenerationError("unavailable");
      if ([...state.probes.values()].some((record) => record.userId !== identity.userId)) throw new RealGenerationError("account_mismatch");
      state.identity = identity; state.expired = false; state.connectionId = this.options.makeId();
      state.projects.clear();
      return this.connection(actorId);
    } finally { state.connecting = false; }
  }

  disconnect(actorId: string): void {
    const state = this.state(actorId);
    if (state.connecting || (state.identity && this.canvasLocks.has(state.identity.userId)) || [...state.probes.values()].some((record) => active.has(record.value.status))) throw new RealGenerationError("probe_busy");
    state.identity = null; state.expired = false;
    state.projects.clear();
  }

  async listProjects(actorId: string, page: number): Promise<PlatformContainerPage> {
    const state = this.state(actorId);
    const identity = this.identity(actorId);
    try {
      const result = await this.platform.listProjects(identity.token, page);
      if (state.identity !== identity) throw new RealGenerationError("disconnected");
      for (const entry of result.items) state.projects.set(entry.id, page);
      return { items: result.items.map(({ id, name }) => ({ id, name })), page, hasMore: result.hasMore };
    } catch (error) { this.markExpired(state, identity, error); throw error; }
  }

  async compareProjectChannels(actorId: string, page: number): Promise<{ agent: PlatformContainerPage; web: PlatformContainerPage }> {
    const state = this.state(actorId);
    const identity = this.identity(actorId);
    const [agent, web] = await Promise.all([
      this.platform.listAgentProjects(identity.token, page),
      this.platform.listProjects(identity.token, page).catch((error: unknown) => {
        this.markExpired(state, identity, error); throw error;
      }),
    ]);
    if (state.identity !== identity) throw new RealGenerationError("disconnected");
    // A comparison is not a project selection. Neither list updates Web page
    // location hints, credentials, or the generation path.
    return {
      agent: { items: agent.items.map(({ id, name }) => ({ id, name })), page, hasMore: agent.hasMore },
      web: { items: web.items.map(({ id, name }) => ({ id, name })), page, hasMore: web.hasMore },
    };
  }

  async start(actorId: string, input: StartGenerationProbe): Promise<GenerationProbe> {
    const state = this.state(actorId);
    const previous = state.requests.get(input.requestKey);
    if (previous) {
      if (JSON.stringify(previous.request) !== JSON.stringify(input)) throw new RealGenerationError("request_conflict");
      return cloneProbe(previous);
    }
    const identity = this.identity(actorId);
    const projectPage = state.projects.get(input.projectId);
    if (!projectPage) throw new RealGenerationError("container_unavailable");
    if (this.accountLocks.has(identity.userId) || this.canvasLocks.has(identity.userId) || state.connecting) throw new RealGenerationError("probe_busy");
    if (state.probes.size >= 100) throw new RealGenerationError("unavailable");
    const record: ProbeRecord = {
      actorId, userId: identity.userId, request: { ...input },
      value: { id: this.options.makeId(), requestKey: input.requestKey, status: "submitting", createdAt: new Date().toISOString(), finishedAt: null, message: "正在核对官网项目。", prompt: input.prompt,
        projectId: input.projectId, diagnostics: { eventCount: 0, eventTypes: [], eventShapes: [] }, result: null },
    };
    // Lock before the first await; concurrent submits cannot create a second
    // chargeable upstream request, even through another local actor.
    this.accountLocks.set(identity.userId, record);
    state.probes.set(record.value.id, record); state.requests.set(input.requestKey, record); state.latest = record;
    try {
      if (this.options.accountGuard) {
        if (!await this.options.accountGuard.claim(identity.userId, record.value.id)) throw new RealGenerationError("probe_busy");
        record.durableLock = true;
      }
      const projects = await this.platform.listProjects(identity.token, projectPage);
      if (!projects.items.some((entry) => entry.id === input.projectId)) throw new RealGenerationError("container_unavailable");
      if (this.disposed || state.identity !== identity) throw new RealGenerationError("unavailable");
    } catch (error) {
      this.markExpired(state, identity, error);
      this.finish(record, "failed", "平台未接受生成：官网项目或连接未能确认。未自动重试。");
      throw error;
    }
    record.value.status = "waiting";
    record.value.message = "本机已接受，等待平台返回。此联调不提供取消或模拟百分比。";
    const snapshot = cloneProbe(record);
    void this.run(state, record, identity);
    return snapshot;
  }

  private finish(record: ProbeRecord, status: GenerationProbe["status"], message: string): void {
    record.value.status = status; record.value.message = message; record.value.finishedAt = new Date().toISOString();
    record.controller = undefined;
    // An interrupted read may leave a paid supplier task running. The first
    // slice has no recovery API, so an unconfirmed task fences that account
    // for this process instead of silently permitting another generation.
    if (status !== "unconfirmed" && this.accountLocks.get(record.userId) === record) this.accountLocks.delete(record.userId);
    if (status !== "unconfirmed" && record.durableLock) {
      record.durableLock = false;
      void this.options.accountGuard?.release(record.userId, record.value.id).catch(() => undefined);
    }
  }

  private async run(state: ActorState, record: ProbeRecord, identity: PlatformIdentity): Promise<void> {
    const controller = new AbortController(); record.controller = controller;
    try {
      const result = await this.platform.generate({ token: identity.token, projectId: record.request.projectId, prompt: record.request.prompt,
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20 * 60_000)]),
        onEvent: (type, shape) => {
          if (this.disposed) return;
          const diagnostics = record.value.diagnostics;
          diagnostics.eventCount++;
          if (!diagnostics.eventTypes.includes(type) && diagnostics.eventTypes.length < 8) diagnostics.eventTypes.push(type);
          if (shape && !diagnostics.eventShapes.includes(shape) && diagnostics.eventShapes.length < 8) diagnostics.eventShapes.push(shape.slice(0, 800));
        },
      });
      if (this.disposed) return;
      if (result.status === "failed") { this.finish(record, "failed", "平台明确返回生成失败；费用与退款需在真实平台核对。"); return; }
      if (result.status === "unconfirmed") { this.finish(record, "unconfirmed", "没有收到可确认的最终视频。请到真实平台核对，不要直接再次生成。"); return; }
      record.video = result.video;
      await this.save(state, record, identity);
    } catch (error) {
      this.markExpired(state, identity, error);
      if (!this.disposed) this.finish(record, "unconfirmed", "生成请求的结果无法确认。请到真实平台核对；系统没有重发、取消或退款。");
    }
  }

  private async save(state: ActorState, record: ProbeRecord, identity: PlatformIdentity): Promise<void> {
    record.value.status = "saving"; record.value.finishedAt = null; record.value.message = "生成已确认，正在保存视频到本机。";
    const controller = new AbortController(); record.controller = controller;
    try {
      if (!record.video) throw new RealGenerationError("save_unavailable");
      const bytes = record.bytes ?? await this.platform.download(identity.token, record.video, AbortSignal.any([controller.signal, AbortSignal.timeout(60_000)]));
      if (this.disposed) return;
      record.bytes = bytes;
      const stored = await this.objects.putObject({ objectKey: `real-generation-probes/${record.value.id}/video.mp4`, contentType: bytes.contentType, body: bytes.body });
      if (this.disposed) return;
      record.stored = stored;
      record.bytes = undefined;
      record.value.result = { url: `/api/real-generation/probes/${encodeURIComponent(record.value.id)}/video`, contentType: stored.contentType, byteSize: stored.byteSize };
      this.finish(record, "succeeded", "视频已生成并保存。未自动加入素材库、画布或对话。");
    } catch (error) {
      this.markExpired(state, identity, error);
      if (!this.disposed) this.finish(record, "save_failed", "平台结果已确认，但本机保存失败或下载域未获确认。重试仅保存视频，不会再次生成。");
    }
  }

  private probe(actorId: string, id: string): ProbeRecord {
    const record = this.state(actorId).probes.get(id);
    if (!record || record.actorId !== actorId) throw new RealGenerationError("probe_not_found");
    return record;
  }

  get(actorId: string, id: string): GenerationProbe { return cloneProbe(this.probe(actorId, id)); }

  async retrySave(actorId: string, id: string): Promise<GenerationProbe> {
    const record = this.probe(actorId, id);
    const state = this.state(actorId);
    const identity = this.identity(actorId);
    if (identity.userId !== record.userId) throw new RealGenerationError("probe_not_found");
    if (record.value.status !== "save_failed" || this.accountLocks.has(identity.userId) || this.canvasLocks.has(identity.userId)) throw new RealGenerationError("probe_busy");
    this.accountLocks.set(identity.userId, record);
    if (this.options.accountGuard) {
      if (!await this.options.accountGuard.claim(identity.userId, record.value.id)) {
        this.accountLocks.delete(identity.userId); throw new RealGenerationError("probe_busy");
      }
      record.durableLock = true;
    }
    record.value.status = "saving"; record.value.finishedAt = null;
    const snapshot = cloneProbe(record);
    void this.save(state, record, identity);
    return snapshot;
  }

  async readVideo(actorId: string, id: string, range?: { start: number; end: number }) {
    const record = this.probe(actorId, id);
    if (record.value.status !== "succeeded" || !record.stored) throw new RealGenerationError("probe_not_found");
    return this.objects.getObject(record.stored.objectKey, range ? { range } : {});
  }

  videoMetadata(actorId: string, id: string): StoredObjectMetadata {
    const record = this.probe(actorId, id);
    if (record.value.status !== "succeeded" || !record.stored) throw new RealGenerationError("probe_not_found");
    return { ...record.stored };
  }

  dispose(): void {
    this.disposed = true;
    this.platform.dispose();
    for (const state of this.actors.values()) {
      state.identity = null; state.projects.clear();
      for (const record of state.probes.values()) {
        if (!active.has(record.value.status)) continue;
        record.controller?.abort();
        this.finish(record, record.video ? "save_failed" : "unconfirmed", "本机联调已停止；停止读取不代表平台取消，请在真实平台核对结果与费用。");
      }
    }
  }
}
