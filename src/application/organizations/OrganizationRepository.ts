import type { OrganizationMember, WorkspaceId } from "../../domain/workspace/workspace";

export interface OrganizationRepository {
  listMembers(workspaceId: WorkspaceId): Promise<OrganizationMember[]>;
}
