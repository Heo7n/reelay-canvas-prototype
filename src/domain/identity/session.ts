import type { WorkspaceId } from "../workspace/workspace";

export type ActorId = string;

export interface SessionActor {
  account: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  id: ActorId;
  displayName: string;
  workspaceIds: WorkspaceId[];
}

export interface SessionSnapshot {
  actor: SessionActor | null;
}
