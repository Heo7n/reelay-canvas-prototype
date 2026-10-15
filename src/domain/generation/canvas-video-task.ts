import type { SeedanceVideoParameters } from "./seedance-video";

export type CanvasVideoTaskStatus = "prepared" | "submitting" | "waiting" | "saving" | "succeeded" | "failed" | "unconfirmed" | "save_failed";

export interface PrepareCanvasVideoTask {
  requestKey: string;
  projectId: string;
  canvasDocumentId: string;
  canvasRecordId: string;
  nodeId: string;
  conversationId?: string | null;
  sourceSurface: "canvas" | "conversation";
  prompt: string;
  parameters: SeedanceVideoParameters;
  references: [];
}

/** Omitted conversation identity and JSON null have the same canvas meaning. */
export function canonicalizeCanvasVideoTaskInput(input: PrepareCanvasVideoTask): PrepareCanvasVideoTask & { conversationId: string | null } {
  return {
    requestKey: input.requestKey,
    projectId: input.projectId,
    canvasDocumentId: input.canvasDocumentId,
    canvasRecordId: input.canvasRecordId,
    nodeId: input.nodeId,
    conversationId: input.conversationId ?? null,
    sourceSurface: input.sourceSurface,
    prompt: input.prompt,
    parameters: input.parameters,
    references: input.references,
  };
}

export interface CanvasVideoResult {
  id: string;
  taskId: string;
  projectId: string;
  url: string;
  contentType: string;
  byteSize: number;
}

export interface CanvasVideoTask extends Omit<PrepareCanvasVideoTask, "references" | "conversationId"> {
  id: string;
  conversationId: string | null;
  status: CanvasVideoTaskStatus;
  createdAt: string;
  updatedAt: string;
  message: string;
  result: CanvasVideoResult | null;
}

export interface CanvasVideoTaskProjection extends Pick<CanvasVideoTask, "id" | "projectId" | "canvasDocumentId" | "canvasRecordId" | "nodeId" | "sourceSurface" | "parameters" | "status" | "message" | "result"> {
  isOwner: boolean;
}

export interface CanvasVideoProjectBinding {
  projectId: string;
  platformProjectId: string;
  platformProjectName: string;
}

export type CanvasVideoGenerationContext = (
  | { kind: "simulation"; reason: "unavailable" | "disconnected" }
  | { kind: "blocked"; reason: "expired" }
  | { kind: "real"; platformUser: { id: string; displayName: string }; binding: CanvasVideoProjectBinding | null }
) & { taskHistoryAvailable?: boolean };

export type CanvasVideoGenerationErrorCode = "unavailable" | "project_not_found" | "project_forbidden" | "task_not_found" | "binding_required" | "task_not_bound" | "request_conflict" | "account_busy" | "account_mismatch" | "retry_unavailable";

export class CanvasVideoGenerationError extends Error {
  constructor(readonly code: CanvasVideoGenerationErrorCode) { super(code); this.name = "CanvasVideoGenerationError"; }
}

// This checks the persisted internal canvas, not the route's document id.
export function canvasDocumentReferencesTask(content: unknown, task: Pick<CanvasVideoTask, "id" | "canvasRecordId" | "nodeId">): boolean {
  if (!content || typeof content !== "object" || !("canvases" in content) || !Array.isArray(content.canvases)) return false;
  return content.canvases.some((canvas: unknown) => {
    if (!canvas || typeof canvas !== "object" || !("id" in canvas) || canvas.id !== task.canvasRecordId || !("nodes" in canvas) || !Array.isArray(canvas.nodes)) return false;
    return canvas.nodes.some((node: unknown) => {
      if (!node || typeof node !== "object" || !("id" in node) || node.id !== task.nodeId || !("realGenerationTaskId" in node) || node.realGenerationTaskId !== task.id || !("kind" in node)) return false;
      return (node.kind === "generator" && "mediaKind" in node && node.mediaKind === "video")
        || (node.kind === "asset" && "mode" in node && node.mode === "video");
    });
  });
}
