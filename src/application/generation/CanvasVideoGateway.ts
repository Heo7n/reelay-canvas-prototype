import type { CanvasVideoGenerationContext, CanvasVideoProjectBinding, CanvasVideoTask, CanvasVideoTaskProjection, PrepareCanvasVideoTask } from "../../domain/generation/canvas-video-task";
import type { PlatformContainerPage } from "../../domain/generation/real-generation";

export interface CanvasVideoScope {
  expectedActorId: string;
  projectId: string;
  canvasDocumentId: string;
}
export type PrepareCanvasVideoRequest = PrepareCanvasVideoTask & { expectedActorId: string };

/** This port never exposes platform credentials or executes a prepared task implicitly. */
export interface CanvasVideoGateway {
  getContext(projectId: string, expectedActorId?: string): Promise<CanvasVideoGenerationContext>;
  listProjects(expectedActorId: string, page?: number): Promise<PlatformContainerPage>;
  bindProject(projectId: string, platformProjectId: string, expectedActorId?: string): Promise<CanvasVideoProjectBinding>;
  prepare(input: PrepareCanvasVideoRequest): Promise<CanvasVideoTask>;
  activate(taskId: string, scope: CanvasVideoScope): Promise<CanvasVideoTask>;
  get(taskId: string, scope: CanvasVideoScope): Promise<CanvasVideoTask>;
  getProjection(taskId: string, scope: CanvasVideoScope): Promise<CanvasVideoTaskProjection>;
  list(scope: CanvasVideoScope): Promise<{ tasks: CanvasVideoTask[] }>;
  retrySave(taskId: string, scope: CanvasVideoScope): Promise<CanvasVideoTask>;
}
