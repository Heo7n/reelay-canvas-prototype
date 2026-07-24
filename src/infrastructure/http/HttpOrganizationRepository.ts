import type { OrganizationRepository } from "../../application/organizations/OrganizationRepository";
import type { OrganizationMember, WorkspaceId } from "../../domain/workspace/workspace";
import { OrganizationMemberListResponseDtoSchema } from "./contracts";
import { HttpApiClient, type HttpAdapterOptions } from "./HttpApiClient";

export class HttpOrganizationRepository implements OrganizationRepository {
  private readonly http: HttpApiClient;

  constructor(options: HttpAdapterOptions | HttpApiClient = {}) {
    this.http = options instanceof HttpApiClient ? options : new HttpApiClient(options);
  }

  async listMembers(workspaceId: WorkspaceId): Promise<OrganizationMember[]> {
    const response = await this.http.read(
      `/api/workspaces/${encodeURIComponent(workspaceId)}/members`,
      OrganizationMemberListResponseDtoSchema,
    );
    return response.members;
  }
}
