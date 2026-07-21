import type { ProjectId, ProjectSummary } from "../../domain/project/project";
import type { WorkspaceId } from "../../domain/workspace/workspace";

export interface ProjectRepository {
  listByWorkspace(workspaceId: WorkspaceId): Promise<ProjectSummary[]>;
  getById(workspaceId: WorkspaceId, projectId: ProjectId): Promise<ProjectSummary | null>;
}
