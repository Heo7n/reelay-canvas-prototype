import type { ProjectId } from "../project/project";

export type CanvasId = string;

export interface CanvasDocument {
  id: CanvasId;
  projectId: ProjectId;
  schemaVersion: number;
  revision: number;
  content: unknown;
}
