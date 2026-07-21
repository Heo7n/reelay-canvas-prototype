import type { WorkspaceId } from "../workspace/workspace";

export type ProjectId = string;

export interface ProjectSummary {
  id: ProjectId;
  workspaceId: WorkspaceId;
  name: string;
  updatedAt: string;
  coverAssetId: string | null;
}
