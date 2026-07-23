import type { WorkspaceId } from "../workspace/workspace";

export type ProjectId = string;
export type ProjectAccessKind = "private" | "collaborative";
export type ProjectUserRole = "admin" | "edit" | "view";

export interface ProjectSummary {
  id: ProjectId;
  workspaceId: WorkspaceId;
  accessKind: ProjectAccessKind;
  currentUserRole: ProjectUserRole;
  name: string;
  updatedAt: string;
  coverAssetId: string | null;
}
