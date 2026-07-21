import type { ActorId } from "../../domain/identity/session";
import type { Membership, Workspace, WorkspaceId } from "../../domain/workspace/workspace";

export interface WorkspaceRepository {
  listForActor(actorId: ActorId): Promise<Workspace[]>;
  getById(workspaceId: WorkspaceId): Promise<Workspace | null>;
}

export interface MembershipRepository {
  listForActor(actorId: ActorId): Promise<Membership[]>;
  listForWorkspace(workspaceId: WorkspaceId): Promise<Membership[]>;
}
