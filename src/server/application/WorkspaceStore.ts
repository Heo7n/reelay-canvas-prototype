import type { ActorId } from "../../domain/identity/session";
import type { OrganizationMember, Workspace, WorkspaceId } from "../../domain/workspace/workspace";

export interface WorkspaceStore {
  listWorkspacesForActor(actorId: ActorId): Promise<Workspace[]>;
  canReadWorkspace(actorId: ActorId, workspaceId: WorkspaceId): Promise<boolean>;
  getWorkspace(workspaceId: WorkspaceId): Promise<Workspace | null>;
  listOrganizationMembers(workspaceId: WorkspaceId): Promise<OrganizationMember[]>;
}
