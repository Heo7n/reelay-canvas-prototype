import type { CanvasDocument, CanvasId } from "../../domain/canvas/canvas-document";
import type { ProjectId } from "../../domain/project/project";

export interface SaveCanvasDocumentInput {
  projectId: ProjectId;
  canvasId: CanvasId;
  schemaVersion: number;
  expectedRevision: number;
  content: unknown;
}

export interface CanvasDocumentRepository {
  getCanvasDocument(projectId: ProjectId, canvasId: CanvasId): Promise<CanvasDocument | null>;
  save(input: SaveCanvasDocumentInput): Promise<CanvasDocument>;
}
