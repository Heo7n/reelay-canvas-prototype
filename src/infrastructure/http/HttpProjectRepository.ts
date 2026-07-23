import type {
  CreateProjectInput,
  ProjectRepository,
  UpdateProjectInput,
} from "../../application/projects/ProjectRepository";
import type { ProjectId, ProjectSummary } from "../../domain/project/project";
import type { WorkspaceId } from "../../domain/workspace/workspace";
import { ProjectListResponseDtoSchema, ProjectResponseDtoSchema } from "./contracts";
import { HttpApiClient, type HttpAdapterOptions, HttpRequestError } from "./HttpApiClient";

type ProjectDto = (typeof ProjectResponseDtoSchema)["_output"]["project"];

function toProject(project: ProjectDto): ProjectSummary {
  return {
    id: project.id,
    workspaceId: project.workspaceId,
    accessKind: project.accessKind,
    currentUserRole: project.currentUserRole,
    name: project.name,
    updatedAt: project.updatedAt,
    coverAssetId: project.coverAssetId,
  };
}

function projectsPath(workspaceId: WorkspaceId): string {
  return `/api/workspaces/${encodeURIComponent(workspaceId)}/projects`;
}

export class HttpProjectRepository implements ProjectRepository {
  private readonly http: HttpApiClient;

  constructor(options: HttpAdapterOptions | HttpApiClient = {}) {
    this.http = options instanceof HttpApiClient ? options : new HttpApiClient(options);
  }

  async listByWorkspace(workspaceId: WorkspaceId): Promise<ProjectSummary[]> {
    const response = await this.http.read(projectsPath(workspaceId), ProjectListResponseDtoSchema);
    return response.projects.map(toProject);
  }

  async getById(workspaceId: WorkspaceId, projectId: ProjectId): Promise<ProjectSummary | null> {
    try {
      const response = await this.http.read(
        `${projectsPath(workspaceId)}/${encodeURIComponent(projectId)}`,
        ProjectResponseDtoSchema,
      );
      return toProject(response.project);
    } catch (error) {
      if (error instanceof HttpRequestError && error.status === 404 && error.code === "project_not_found") {
        return null;
      }
      throw error;
    }
  }

  async create(workspaceId: WorkspaceId, input: CreateProjectInput): Promise<ProjectSummary> {
    const response = await this.http.read(projectsPath(workspaceId), ProjectResponseDtoSchema, {
      method: "POST",
      body: JSON.stringify({ ...input, accessKind: "private" }),
    });
    return toProject(response.project);
  }

  async update(
    workspaceId: WorkspaceId,
    projectId: ProjectId,
    input: UpdateProjectInput,
  ): Promise<ProjectSummary> {
    const response = await this.http.read(
      `${projectsPath(workspaceId)}/${encodeURIComponent(projectId)}`,
      ProjectResponseDtoSchema,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      },
    );
    return toProject(response.project);
  }

  async moveToTrash(workspaceId: WorkspaceId, projectId: ProjectId): Promise<void> {
    await this.http.sendWithoutResponse(
      `${projectsPath(workspaceId)}/${encodeURIComponent(projectId)}`,
      { method: "DELETE" },
    );
  }
}
