import type { CanvasDocument, CanvasId } from "../../domain/canvas/canvas-document";
import type { ProjectId } from "../../domain/project/project";

export interface SaveCanvasDocumentInput {
  document: CanvasDocument;
  expectedRevision: number;
}

export interface CanvasDocumentRepository {
  get(projectId: ProjectId, canvasId: CanvasId): Promise<CanvasDocument | null>;
  save(input: SaveCanvasDocumentInput): Promise<CanvasDocument>;
}
