import type { ProjectId, ProjectSummary } from "../../domain/project/project";
import type { WorkspaceId } from "../../domain/workspace/workspace";

export interface CreateProjectInput {
  name: string;
  coverAssetId?: string | null;
}

export interface UpdateProjectInput {
  name?: string;
  coverAssetId?: string | null;
}

export interface ProjectRepository {
  listByWorkspace(workspaceId: WorkspaceId): Promise<ProjectSummary[]>;
  getById(workspaceId: WorkspaceId, projectId: ProjectId): Promise<ProjectSummary | null>;
  create(workspaceId: WorkspaceId, input: CreateProjectInput): Promise<ProjectSummary>;
  update(workspaceId: WorkspaceId, projectId: ProjectId, input: UpdateProjectInput): Promise<ProjectSummary>;
  moveToTrash(workspaceId: WorkspaceId, projectId: ProjectId): Promise<void>;
}
