import type {
  WorkspaceContext,
  WorkspaceContextGateway,
} from "../../application/workspaces/WorkspaceContextGateway";
import type { WorkspaceId } from "../../domain/workspace/workspace";
import { WorkspaceContextResponseDtoSchema } from "./contracts";
import { HttpApiClient, type HttpAdapterOptions } from "./HttpApiClient";
import { toProject } from "./HttpProjectRepository";
import { toSessionActor } from "./HttpSessionGateway";
import { toWorkspace } from "./HttpWorkspaceRepository";

export class HttpWorkspaceContextGateway implements WorkspaceContextGateway {
  private readonly http: HttpApiClient;

  constructor(options: HttpAdapterOptions | HttpApiClient = {}) {
    this.http = options instanceof HttpApiClient ? options : new HttpApiClient(options);
  }

  async load(workspaceId: WorkspaceId): Promise<WorkspaceContext> {
    const response = await this.http.read(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/context`,
      WorkspaceContextResponseDtoSchema,
    );
    return {
      actor: toSessionActor(response.actor),
      projects: response.projects.map(toProject),
      workspaces: response.workspaces.map(toWorkspace),
    };
  }
}
