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

export interface ReadCanvasDocumentInput {
  actorId: ActorId;
  projectId: ProjectId;
  canvasId: CanvasId;
}

export class CanvasDocumentRevisionConflictError extends Error {
  constructor(readonly currentRevision: number) {
    super(`Canvas document revision conflict; current revision is ${currentRevision}.`);
    this.name = "CanvasDocumentRevisionConflictError";
  }
}

export class CanvasDocumentProjectUnavailableError extends Error {
  constructor() {
    super("The project is unavailable or inaccessible to the actor.");
    this.name = "CanvasDocumentProjectUnavailableError";
  }
}

export interface CanvasDocumentStore {
  getCanvasDocument(input: ReadCanvasDocumentInput): Promise<CanvasDocument | null>;
  saveCanvasDocument(input: SaveCanvasDocumentInput): Promise<CanvasDocument>;
}
