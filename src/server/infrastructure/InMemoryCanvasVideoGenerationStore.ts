import { CanvasVideoGenerationError, canonicalizeCanvasVideoTaskInput, canvasDocumentReferencesTask, type CanvasVideoProjectBinding } from "../../domain/generation/canvas-video-task";
import type { CanvasVideoGenerationStore, CanvasVideoTaskRecord } from "../application/CanvasVideoGenerationStore";
import type { CanvasDocumentStore } from "../application/CanvasDocumentStore";
import type { ProjectAccessReader } from "../application/ProjectStore";

export class InMemoryCanvasVideoGenerationStore implements CanvasVideoGenerationStore {
  private readonly records = new Map<string, CanvasVideoTaskRecord>();
  private readonly bindings = new Map<string, CanvasVideoProjectBinding>();
  private readonly locks = new Map<string, { operationId: string; heartbeat: number }>();
  constructor(private readonly documents: CanvasDocumentStore & ProjectAccessReader, private readonly now: () => number = Date.now) {}
  private bindingKey(actor: string, user: string, project: string) { return JSON.stringify([actor, user, project]); }
  async getBinding(actor: string, user: string, project: string) { return structuredClone(this.bindings.get(this.bindingKey(actor, user, project)) ?? null); }
  async setBinding(actor: string, user: string, _connectionId: string, value: CanvasVideoProjectBinding) {
    this.bindings.set(this.bindingKey(actor, user, value.projectId), structuredClone(value)); return structuredClone(value);
  }
  async prepare(record: CanvasVideoTaskRecord) {
    record = { ...record, input: canonicalizeCanvasVideoTaskInput(record.input) };
    const existing = [...this.records.values()].find((entry) => entry.actorId === record.actorId && entry.task.requestKey === record.task.requestKey);
    if (existing) {
      if (JSON.stringify(canonicalizeCanvasVideoTaskInput(existing.input)) !== JSON.stringify(record.input)) throw new CanvasVideoGenerationError("request_conflict");
      return structuredClone(existing);
    }
    if (this.records.has(record.task.id)) throw new CanvasVideoGenerationError("request_conflict");
    this.records.set(record.task.id, structuredClone(record)); return structuredClone(record);
  }
  async get(actorId: string, id: string) {
    await this.recoverInterrupted();
    const record = this.records.get(id); return record?.actorId === actorId ? structuredClone(record) : null;
  }
  async list(actorId: string, projectId: string) {
    await this.recoverInterrupted();
    return [...this.records.values()].filter((record) => record.actorId === actorId && record.task.projectId === projectId).map((record) => structuredClone(record));
  }
  async getProjectTask(projectId: string, id: string) {
    await this.recoverInterrupted(); const record = this.records.get(id);
    return record?.task.projectId === projectId ? structuredClone(record) : null;
  }
  async getResult(projectId: string, resultId: string) {
    const record = [...this.records.values()].find((entry) => entry.task.projectId === projectId && entry.task.status === "succeeded" && entry.task.result?.id === resultId);
    return record ? structuredClone(record) : null;
  }
  async claim(user: string, operationId: string) {
    const existing = this.locks.get(user);
    if (existing) return existing.operationId === operationId;
    this.locks.set(user, { operationId, heartbeat: this.now() }); return true;
  }
  async release(user: string, operationId: string) { if (this.locks.get(user)?.operationId === operationId) this.locks.delete(user); }
  async heartbeat(user: string, operationId: string) { const lock = this.locks.get(user); if (lock?.operationId === operationId) lock.heartbeat = this.now(); }
  async activate(actorId: string, id: string, attemptId: string, ownerProcessId: string) {
    const record = this.records.get(id);
    if (!record || record.actorId !== actorId) throw new CanvasVideoGenerationError("task_not_found");
    if (record.task.status !== "prepared") return structuredClone(record);
    const project = await this.documents.getProjectById(actorId, record.task.projectId);
    if (!project) throw new CanvasVideoGenerationError("project_not_found");
    if (project.currentUserRole === "view") throw new CanvasVideoGenerationError("project_forbidden");
    const document = await this.documents.getCanvasDocument({ actorId, projectId: record.task.projectId, canvasId: record.task.canvasDocumentId });
    if (!document || !canvasDocumentReferencesTask(document.content, record.task)) throw new CanvasVideoGenerationError("task_not_bound");
    // Recheck after awaited authorization: a competing activation can win first.
    if (record.task.status !== "prepared") return structuredClone(record);
    if (!await this.claim(record.platformUserId, id)) throw new CanvasVideoGenerationError("account_busy");
    record.attemptId = attemptId; record.ownerProcessId = ownerProcessId;
    record.task.status = "submitting"; record.task.updatedAt = new Date(this.now()).toISOString();
    record.task.message = "生成请求已可靠记录，正在提交真实平台。";
    return structuredClone(record);
  }
  async beginSaveRetry(actorId: string, id: string, ownerProcessId: string) {
    const record = this.records.get(id);
    if (!record || record.actorId !== actorId) throw new CanvasVideoGenerationError("task_not_found");
    if (record.task.status !== "save_failed" || !record.video) throw new CanvasVideoGenerationError("retry_unavailable");
    const project = await this.documents.getProjectById(actorId, record.task.projectId);
    if (!project) throw new CanvasVideoGenerationError("project_not_found");
    if (project.currentUserRole === "view") throw new CanvasVideoGenerationError("project_forbidden");
    if (record.task.status !== "save_failed") throw new CanvasVideoGenerationError("retry_unavailable");
    if (!await this.claim(record.platformUserId, id)) throw new CanvasVideoGenerationError("account_busy");
    record.ownerProcessId = ownerProcessId; record.task.status = "saving"; return structuredClone(record);
  }
  async update(record: CanvasVideoTaskRecord) {
    const current = this.records.get(record.task.id);
    if (current?.attemptId !== record.attemptId || current?.ownerProcessId !== record.ownerProcessId || !["submitting", "waiting", "saving"].includes(current.task.status)) throw new CanvasVideoGenerationError("request_conflict");
    this.records.set(record.task.id, structuredClone(record));
    if (["succeeded", "failed", "save_failed"].includes(record.task.status)) await this.release(record.platformUserId, record.task.id);
  }
  async recoverInterrupted() {
    for (const record of this.records.values()) {
      const lock = this.locks.get(record.platformUserId);
      if (!["submitting", "waiting", "saving"].includes(record.task.status) || !lock || lock.operationId !== record.task.id || this.now() - lock.heartbeat < 60_000) continue;
      record.task.status = record.video ? "save_failed" : "unconfirmed";
      record.task.message = "执行连接已中断；不会自动再次生成。";
      record.task.updatedAt = new Date(this.now()).toISOString();
      record.ownerProcessId = null;
      if (record.video) await this.release(record.platformUserId, record.task.id);
    }
  }
}
