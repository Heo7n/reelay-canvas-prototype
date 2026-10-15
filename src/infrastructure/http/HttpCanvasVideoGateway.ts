import type { CanvasVideoGateway, CanvasVideoScope, PrepareCanvasVideoRequest } from "../../application/generation/CanvasVideoGateway";
import { ApplicationError } from "../../application/shared/ApplicationError";
import { CanvasVideoGenerationContextSchema, CanvasVideoProjectBindingSchema, CanvasVideoTaskSchema, CanvasVideoTaskListSchema, CanvasVideoTaskProjectionSchema, PrepareCanvasVideoTaskSchema, SetCanvasVideoBindingSchema, type CanvasVideoTask, type CanvasVideoTaskProjection } from "../../contracts/canvas-video-generation";
import { PlatformContainerPageSchema } from "../../contracts/real-generation";
import { HttpApiClient } from "./HttpApiClient";

const root = "/api/canvas-video-generation";

function requireActorId(expectedActorId?: string): string {
  if (!expectedActorId?.trim()) throw new ApplicationError("authentication_required", "请确认当前本机账号后重新打开画布。");
  return expectedActorId;
}

function scopeQuery(scope: CanvasVideoScope): string {
  return new URLSearchParams({ projectId: scope.projectId, canvasDocumentId: scope.canvasDocumentId, expectedActorId: requireActorId(scope.expectedActorId) }).toString();
}

function assertTaskScope<T extends CanvasVideoTask | CanvasVideoTaskProjection>(task: T, scope: CanvasVideoScope, expectedTaskId?: string): T {
  if (task.projectId !== scope.projectId || task.canvasDocumentId !== scope.canvasDocumentId
    || (expectedTaskId !== undefined && task.id !== expectedTaskId)
    || (task.result && (task.result.projectId !== scope.projectId || task.result.taskId !== task.id
      || task.result.url !== `/api/projects/${encodeURIComponent(scope.projectId)}/generation-results/${task.result.id}/video`))) {
    throw new ApplicationError("forbidden", "生成任务不属于当前画布。");
  }
  return task;
}

export class HttpCanvasVideoGateway implements CanvasVideoGateway {
  constructor(private readonly http: HttpApiClient) {}

  async getContext(projectId: string, expectedActorId?: string) {
    const query = new URLSearchParams({ projectId, expectedActorId: requireActorId(expectedActorId) });
    const context = await this.http.read(`${root}/context?${query}`, CanvasVideoGenerationContextSchema);
    if (context.kind === "real" && context.binding && context.binding.projectId !== projectId) {
      throw new ApplicationError("forbidden", "官网项目关联不属于当前项目。");
    }
    return context;
  }

  listProjects(expectedActorId: string, page = 1) {
    const query = new URLSearchParams({ expectedActorId: requireActorId(expectedActorId), page: String(page) });
    return this.http.read(`${root}/projects?${query}`, PlatformContainerPageSchema);
  }

  async bindProject(projectId: string, platformProjectId: string, expectedActorId?: string) {
    const binding = await this.http.read(`${root}/binding`, CanvasVideoProjectBindingSchema, {
      method: "PUT", body: JSON.stringify(SetCanvasVideoBindingSchema.parse({ projectId, platformProjectId, expectedActorId: requireActorId(expectedActorId) })),
    });
    if (binding.projectId !== projectId || binding.platformProjectId !== platformProjectId) {
      throw new ApplicationError("forbidden", "官网项目关联不属于当前项目。");
    }
    return binding;
  }

  async prepare(input: PrepareCanvasVideoRequest) {
    const task = await this.http.read(`${root}/tasks/prepare`, CanvasVideoTaskSchema, {
      method: "POST", body: JSON.stringify(PrepareCanvasVideoTaskSchema.parse(input)),
    });
    return assertTaskScope(task, input);
  }

  async activate(taskId: string, scope: CanvasVideoScope) {
    return assertTaskScope(await this.http.read(`${root}/tasks/${encodeURIComponent(taskId)}/activate?${scopeQuery(scope)}`, CanvasVideoTaskSchema, { method: "POST" }), scope, taskId);
  }

  async get(taskId: string, scope: CanvasVideoScope) {
    return assertTaskScope(await this.http.read(`${root}/tasks/${encodeURIComponent(taskId)}?${scopeQuery(scope)}`, CanvasVideoTaskSchema), scope, taskId);
  }

  async getProjection(taskId: string, scope: CanvasVideoScope) {
    return assertTaskScope(await this.http.read(`${root}/tasks/${encodeURIComponent(taskId)}/projection?${scopeQuery(scope)}`, CanvasVideoTaskProjectionSchema), scope, taskId);
  }

  async list(scope: CanvasVideoScope) {
    const result = await this.http.read(`${root}/tasks?${scopeQuery(scope)}`, CanvasVideoTaskListSchema);
    result.tasks.forEach((task) => assertTaskScope(task, scope));
    return result;
  }

  async retrySave(taskId: string, scope: CanvasVideoScope) {
    return assertTaskScope(await this.http.read(`${root}/tasks/${encodeURIComponent(taskId)}/retry-save?${scopeQuery(scope)}`, CanvasVideoTaskSchema, { method: "POST" }), scope, taskId);
  }
}
