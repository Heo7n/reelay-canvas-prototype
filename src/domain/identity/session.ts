import type { WorkspaceId } from "../workspace/workspace";

export type ActorId = string;

export interface SessionActor {
  id: ActorId;
  displayName: string;
  workspaceIds: WorkspaceId[];
}

export interface SessionSnapshot {
  actor: SessionActor | null;
}
