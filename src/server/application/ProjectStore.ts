import type { ActorId } from "../../domain/identity/session";
import type { ProjectId, ProjectSummary } from "../../domain/project/project";
import type { WorkspaceId } from "../../domain/workspace/workspace";

export interface CreateProjectInput {
  workspaceId: WorkspaceId;
  createdByActorId: ActorId;
  name: string;
  coverAssetId?: string | null;
}

export interface UpdateProjectInput {
  updatedByActorId: ActorId;
  name?: string;
  coverAssetId?: string | null;
}

export type ProjectWorkspaceUnavailableReason = "not_found" | "forbidden";

export class ProjectWorkspaceUnavailableError extends Error {
  constructor(readonly reason: ProjectWorkspaceUnavailableReason) {
    super(
      reason === "not_found"
        ? "The workspace does not exist."
        : "The actor is not a member of the workspace.",
    );
    this.name = "ProjectWorkspaceUnavailableError";
  }
}

export interface ProjectAccessReader {
  getProjectById(actorId: ActorId, projectId: ProjectId): Promise<ProjectSummary | null>;
}

export interface ProjectStore extends ProjectAccessReader {
  listProjects(actorId: ActorId, workspaceId: WorkspaceId): Promise<ProjectSummary[]>;
  getProject(
    actorId: ActorId,
    workspaceId: WorkspaceId,
    projectId: ProjectId,
  ): Promise<ProjectSummary | null>;
  createProject(input: CreateProjectInput): Promise<ProjectSummary>;
  updateProject(
    workspaceId: WorkspaceId,
    projectId: ProjectId,
    input: UpdateProjectInput,
  ): Promise<ProjectSummary | null>;
  moveProjectToTrash(
    workspaceId: WorkspaceId,
    projectId: ProjectId,
    actorId: ActorId,
  ): Promise<boolean>;
}
