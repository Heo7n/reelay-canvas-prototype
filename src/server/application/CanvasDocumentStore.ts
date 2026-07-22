import type { CanvasDocument, CanvasId } from "../../domain/canvas/canvas-document";
import type { ActorId } from "../../domain/identity/session";
import type { ProjectId } from "../../domain/project/project";

export interface SaveCanvasDocumentInput {
  actorId: ActorId;
  projectId: ProjectId;
  canvasId: CanvasId;
  schemaVersion: number;
  expectedRevision: number;
  content: unknown;
}

export class CanvasDocumentRevisionConflictError extends Error {
  constructor(readonly currentRevision: number) {
    super(`Canvas document revision conflict; current revision is ${currentRevision}.`);
    this.name = "CanvasDocumentRevisionConflictError";
  }
}

export interface CanvasDocumentStore {
  getCanvasDocument(projectId: ProjectId, canvasId: CanvasId): Promise<CanvasDocument | null>;
  saveCanvasDocument(input: SaveCanvasDocumentInput): Promise<CanvasDocument>;
}
