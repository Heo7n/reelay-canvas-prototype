import type { ActorId } from "../identity/session";

export type WorkspaceId = string;
export type WorkspaceKind = "personal" | "organization";
export type MembershipRole = "owner" | "admin" | "member";

export interface Workspace {
  id: WorkspaceId;
  kind: WorkspaceKind;
  name: string;
  currentUserRole?: MembershipRole;
}

export interface Membership {
  workspaceId: WorkspaceId;
  actorId: ActorId;
  role: MembershipRole;
}
