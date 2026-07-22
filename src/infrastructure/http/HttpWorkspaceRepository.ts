import type { WorkspaceRepository } from "../../application/workspaces/WorkspaceRepository";
import type { ActorId } from "../../domain/identity/session";
import type { Workspace, WorkspaceId } from "../../domain/workspace/workspace";
import { WorkspaceListResponseDtoSchema } from "./contracts";
import { HttpApiClient, type HttpAdapterOptions } from "./HttpApiClient";

type WorkspaceDto = (typeof WorkspaceListResponseDtoSchema)["_output"]["workspaces"][number];

function toWorkspace(workspace: WorkspaceDto): Workspace {
  return {
    id: workspace.id,
    kind: workspace.kind,
    name: workspace.name,
  };
}

export class HttpWorkspaceRepository implements WorkspaceRepository {
  private readonly http: HttpApiClient;

  constructor(options: HttpAdapterOptions | HttpApiClient = {}) {
    this.http = options instanceof HttpApiClient ? options : new HttpApiClient(options);
  }

  async listForActor(_actorId: ActorId): Promise<Workspace[]> {
    const response = await this.http.read("/api/workspaces", WorkspaceListResponseDtoSchema);
    return response.workspaces.map(toWorkspace);
  }

  async getById(workspaceId: WorkspaceId): Promise<Workspace | null> {
    const workspaces = await this.listForActor("");
    return workspaces.find((workspace) => workspace.id === workspaceId) ?? null;
  }
}
