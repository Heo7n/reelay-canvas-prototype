import type {
  CreateWorkspaceEntityInput,
  EntityRepository,
  UpdateWorkspaceEntityInput,
  WorkspaceEntity,
} from "../../application/assets/EntityRepository";
import type { WorkspaceId } from "../../domain/workspace/workspace";
import {
  WorkspaceEntitiesResponseDtoSchema,
  WorkspaceEntityResponseDtoSchema,
} from "./contracts";
import { HttpApiClient, type HttpAdapterOptions } from "./HttpApiClient";

export class HttpEntityRepository implements EntityRepository {
  private readonly http: HttpApiClient;

  constructor(options: HttpAdapterOptions | HttpApiClient = {}) {
    this.http = options instanceof HttpApiClient ? options : new HttpApiClient(options);
  }

  async create(input: CreateWorkspaceEntityInput): Promise<WorkspaceEntity> {
    const { workspaceId, ...body } = input;
    const response = await this.http.read(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/entities`,
      WorkspaceEntityResponseDtoSchema,
      { method: "POST", body: JSON.stringify(body) },
    );
    return response.entity;
  }

  async get(workspaceId: WorkspaceId, entityId: string): Promise<WorkspaceEntity> {
    const response = await this.http.read(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/entities/${encodeURIComponent(entityId)}`,
      WorkspaceEntityResponseDtoSchema,
    );
    return response.entity;
  }

  async listPersonal(workspaceId: WorkspaceId): Promise<WorkspaceEntity[]> {
    const response = await this.http.read(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/entities`,
      WorkspaceEntitiesResponseDtoSchema,
    );
    return response.entities;
  }

  async update(input: UpdateWorkspaceEntityInput): Promise<WorkspaceEntity> {
    const { workspaceId, entityId, ...body } = input;
    const response = await this.http.read(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/entities/${encodeURIComponent(entityId)}`,
      WorkspaceEntityResponseDtoSchema,
      { method: "PATCH", body: JSON.stringify(body) },
    );
    return response.entity;
  }
}
