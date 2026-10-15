import { CanvasVideoGenerationError, canonicalizeCanvasVideoTaskInput, type CanvasVideoGenerationContext, type CanvasVideoProjectBinding, type CanvasVideoTask, type CanvasVideoTaskProjection, type PrepareCanvasVideoTask } from "../../domain/generation/canvas-video-task";
import type { CanvasVideoGenerationStore, CanvasVideoTaskRecord } from "./CanvasVideoGenerationStore";
import type { ObjectStore } from "./ObjectStore";
import type { ProjectAccessReader } from "./ProjectStore";
import { RealGenerationProbeService } from "./RealGenerationProbeService";
import type { PlatformIdentity, RealGenerationPlatform } from "./RealGenerationPlatform";

export class CanvasVideoGenerationService {
  private readonly running = new Map<string, { controller: AbortController; operation: Promise<void> }>();
  private disposed = false;
  constructor(private readonly dependencies: {
    tasks: CanvasVideoGenerationStore; projects: ProjectAccessReader; connections: RealGenerationProbeService | null;
    platform: RealGenerationPlatform | null; objects: ObjectStore; makeId: () => string; processId: string;
  }) {}
  private connections() { if (!this.dependencies.connections || this.disposed) throw new CanvasVideoGenerationError("unavailable"); return this.dependencies.connections; }

  private async authorize(actorId: string, projectId: string, write = false) {
    const project = await this.dependencies.projects.getProjectById(actorId, projectId);
    if (!project) throw new CanvasVideoGenerationError("project_not_found");
    if (write && project.currentUserRole === "view") throw new CanvasVideoGenerationError("project_forbidden");
  }
  async context(actorId: string, projectId: string): Promise<CanvasVideoGenerationContext> {
    await this.authorize(actorId, projectId);
    if (!this.dependencies.connections) return { kind: "simulation", reason: "unavailable", taskHistoryAvailable: true };
    const connection = this.dependencies.connections.connection(actorId);
    if (!connection.available || this.disposed) return { kind: "simulation", reason: "unavailable", taskHistoryAvailable: true };
    if (connection.state === "expired") return { kind: "blocked", reason: "expired", taskHistoryAvailable: true };
    if (!connection.platformUser || connection.state === "disconnected") return { kind: "simulation", reason: "disconnected", taskHistoryAvailable: true };
    return { kind: "real", platformUser: connection.platformUser, binding: await this.dependencies.tasks.getBinding(actorId, connection.platformUser.id, projectId), taskHistoryAvailable: true };
  }
  async bind(actorId: string, projectId: string, platformProjectId: string): Promise<CanvasVideoProjectBinding> {
    await this.authorize(actorId, projectId, true);
    const connection = this.connections().borrowConnection(actorId);
    const project = await this.connections().verifySelectedProject(actorId, platformProjectId);
    this.connections().assertConnection(actorId, connection.connectionId);
    return this.dependencies.tasks.setBinding(actorId, connection.identity.userId, connection.connectionId, { projectId, platformProjectId, platformProjectName: project.name });
  }
  async listProjects(actorId: string, page: number) { return this.connections().listProjects(actorId, page); }
  async prepare(actorId: string, request: PrepareCanvasVideoTask): Promise<CanvasVideoTask> {
    if (this.disposed) throw new CanvasVideoGenerationError("unavailable");
    const input = structuredClone(canonicalizeCanvasVideoTaskInput(request));
    await this.authorize(actorId, input.projectId, true);
    const connection = this.connections().borrowConnection(actorId);
    const binding = await this.dependencies.tasks.getBinding(actorId, connection.identity.userId, input.projectId);
    if (!binding) throw new CanvasVideoGenerationError("binding_required");
    await this.connections().verifySelectedProject(actorId, binding.platformProjectId);
    this.connections().assertConnection(actorId, connection.connectionId);
    const now = new Date().toISOString();
    const record: CanvasVideoTaskRecord = {
      task: { ...input, id: input.requestKey, conversationId: input.conversationId, status: "prepared", createdAt: now, updatedAt: now, message: "请求已保存；画布绑定保存成功后才会提交真实平台。", result: null },
      input: structuredClone(input), actorId, platformUserId: connection.identity.userId, connectionId: connection.connectionId, platformProjectId: binding.platformProjectId,
      attemptId: null, ownerProcessId: null, video: null, object: null, artifact: null,
    };
    // References are validation-only; task DTOs have no token or remote URL.
    const value = await this.dependencies.tasks.prepare(record);
    return this.taskDto(value);
  }
  private taskDto(record: CanvasVideoTaskRecord): CanvasVideoTask {
    const { id, requestKey, projectId, canvasDocumentId, canvasRecordId, nodeId, conversationId, sourceSurface, prompt, parameters, status, createdAt, updatedAt, message, result } = record.task;
    return structuredClone({ id, requestKey, projectId, canvasDocumentId, canvasRecordId, nodeId, conversationId, sourceSurface, prompt, parameters, status, createdAt, updatedAt, message, result });
  }
  private async owned(actorId: string, id: string) {
    const record = await this.dependencies.tasks.get(actorId, id);
    if (!record) throw new CanvasVideoGenerationError("task_not_found");
    await this.authorize(actorId, record.task.projectId);
    return record;
  }
  async get(actorId: string, id: string) { return this.taskDto(await this.owned(actorId, id)); }
  async list(actorId: string, projectId: string) {
    await this.authorize(actorId, projectId);
    return { tasks: (await this.dependencies.tasks.list(actorId, projectId)).map((record) => this.taskDto(record)) };
  }
  async projection(actorId: string, projectId: string, id: string): Promise<CanvasVideoTaskProjection> {
    await this.authorize(actorId, projectId);
    const record = await this.dependencies.tasks.getProjectTask(projectId, id);
    if (!record) throw new CanvasVideoGenerationError("task_not_found");
    const { canvasDocumentId, canvasRecordId, nodeId, sourceSurface, parameters, status, message, result } = record.task;
    return structuredClone({ id, projectId, canvasDocumentId, canvasRecordId, nodeId, sourceSurface, parameters, status, message, result, isOwner: record.actorId === actorId });
  }
  async activate(actorId: string, id: string): Promise<CanvasVideoTask> {
    if (this.disposed) throw new CanvasVideoGenerationError("unavailable");
    const previous = await this.owned(actorId, id);
    await this.authorize(actorId, previous.task.projectId, true);
    if (previous.task.status !== "prepared") return this.taskDto(previous);
    const connection = this.connections().reserveCanvasConnection(actorId, id, previous.platformUserId);
    const attemptId = this.dependencies.makeId();
    try {
      await this.connections().verifySelectedProject(actorId, previous.platformProjectId);
      const record = await this.dependencies.tasks.activate(actorId, id, attemptId, this.dependencies.processId);
      // Another process may already own this exact task. Never re-enter it.
      if (record.attemptId !== attemptId) { this.dependencies.connections!.releaseCanvasConnection(previous.platformUserId, id); return this.taskDto(record); }
      this.launch(record, connection.identity, false);
      return this.taskDto(record);
    } catch (error) { this.dependencies.connections!.releaseCanvasConnection(previous.platformUserId, id); throw error; }
  }
  async retrySave(actorId: string, id: string) {
    const previous = await this.owned(actorId, id); await this.authorize(actorId, previous.task.projectId, true);
    const connection = this.connections().reserveCanvasConnection(actorId, id, previous.platformUserId);
    try {
      const record = await this.dependencies.tasks.beginSaveRetry(actorId, id, this.dependencies.processId);
      this.launch(record, connection.identity, true); return this.taskDto(record);
    } catch (error) { this.dependencies.connections!.releaseCanvasConnection(previous.platformUserId, id); throw error; }
  }
  private launch(record: CanvasVideoTaskRecord, identity: PlatformIdentity, saveOnly: boolean) {
    const controller = new AbortController();
    const operation = this.execute(record, identity, controller, saveOnly).finally(() => this.running.delete(record.task.id));
    this.running.set(record.task.id, { controller, operation });
  }
  private async execute(record: CanvasVideoTaskRecord, identity: PlatformIdentity, controller: AbortController, saveOnly: boolean) {
    const { tasks } = this.dependencies; const platform = this.dependencies.platform!; const connections = this.dependencies.connections!;
    const heartbeat = setInterval(() => {
      void tasks.heartbeat(record.platformUserId, record.task.id).catch(() => controller.abort());
    }, 15_000); heartbeat.unref();
    try {
      if (!saveOnly) {
        record.task.status = "waiting"; record.task.message = "等待真实平台返回；不会自动重发。";
        await this.persist(record);
        const outcome = await platform.generate({ token: identity.token, projectId: record.platformProjectId, prompt: record.task.prompt, parameters: record.task.parameters,
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20 * 60_000)]), onEvent: () => undefined,
          onArtifact: async (artifact) => { record.artifact = artifact; await this.persist(record); },
        });
        if (outcome.status === "failed") { record.task.status = "failed"; record.task.message = "平台明确返回失败；费用请在平台核对。"; await this.persist(record); return; }
        if (outcome.status === "unconfirmed") { record.task.status = "unconfirmed"; record.task.message = "结果无法确认，请到真实平台核对；禁止自动再次生成。"; await this.persist(record); return; }
        record.video = outcome.video;
        // Persist supplier identity before downloading or touching ObjectStore.
        record.task.status = "saving"; await this.persist(record);
      }
      try {
        if (!record.video) throw new CanvasVideoGenerationError("retry_unavailable");
        record.task.status = "saving"; record.task.message = "视频已确认，正在保存。"; await this.persist(record);
        const objectKey = `canvas-video-results/${record.task.id}/video.mp4`;
        let stored = await this.dependencies.objects.headObject(objectKey);
        if (!stored) {
          const bytes = await platform.download(identity.token, record.video, AbortSignal.any([controller.signal, AbortSignal.timeout(60_000)]));
          stored = await this.dependencies.objects.putObject({ objectKey, contentType: bytes.contentType, body: bytes.body });
        }
        record.object = stored;
        const resultId = record.task.id;
        record.task.result = { id: resultId, taskId: record.task.id, projectId: record.task.projectId, url: `/api/projects/${encodeURIComponent(record.task.projectId)}/generation-results/${resultId}/video`, contentType: stored.contentType, byteSize: stored.byteSize };
        record.task.status = "succeeded"; record.task.message = "视频已生成并保存。"; await this.persist(record);
      } catch (error) {
        connections.noteConnectionError(record.actorId, identity, error);
        record.task.status = "save_failed"; record.task.message = "视频已确认但保存失败；重试仅保存，不会再次生成。"; await this.persist(record);
      }
    } catch (error) {
      connections.noteConnectionError(record.actorId, identity, error);
      record.task.status = record.video ? "save_failed" : "unconfirmed";
      record.task.message = record.video ? "结果已确认，保存中断；可以只重试保存。" : "执行已中断，结果无法确认；禁止自动再次生成。";
      await this.persist(record).catch(() => undefined);
    } finally {
      clearInterval(heartbeat);
      connections.releaseCanvasConnection(record.platformUserId, record.task.id);
    }
  }
  private async persist(record: CanvasVideoTaskRecord) { record.task.updatedAt = new Date().toISOString(); await this.dependencies.tasks.update(record); }
  async resultMetadata(actorId: string, projectId: string, resultId: string) {
    await this.authorize(actorId, projectId);
    const record = await this.dependencies.tasks.getResult(projectId, resultId);
    if (!record?.object) throw new CanvasVideoGenerationError("task_not_found");
    return record.object;
  }
  async readResult(actorId: string, projectId: string, resultId: string, range?: { start: number; end: number }) {
    const object = await this.resultMetadata(actorId, projectId, resultId);
    return this.dependencies.objects.getObject(object.objectKey, range ? { range } : {});
  }
  async dispose() {
    this.disposed = true;
    for (const running of this.running.values()) running.controller.abort();
    await Promise.allSettled([...this.running.values()].map((running) => running.operation));
  }
}
